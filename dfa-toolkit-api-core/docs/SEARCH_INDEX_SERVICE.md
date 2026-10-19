## Overview

**Setup commands (create tables, build index):** See [README.md](../README.md) — **Data warehouse search index**.

**Scope:** Operational setup (create/populate search tables) is **only needed when the DFA Visualizer** (or another consumer of the DW search API) **is in use.** Otherwise you can skip it.

This document describes the **Data Warehouse Search Index Builder** service implemented in this repository.  
It is a **service-only** (non-API) component intended to be executed by an offline process (cron/worker) to populate **DW-side search tables** from DW **UT tables**.

### What it does
- Reads available `language_code` values from `ut_language`.
- For each language code, reads data from:
  - `ut_indicator_{language_code}`
  - `ut_area_{language_code}`
  - `ut_subgroup_vals_{language_code}`
  - `ut_timeperiod` (global table)
- Writes/refreshes the following search tables (in the **same external DW MySQL database**):
  - `search_keywords`
  - `search_keyword_synonym`
  - `search_keyword_ngram`

### What it does NOT do (current scope)
- Does **not** expose any FastAPI endpoints for running the build (the build is script/worker-driven).
- Does **not** create ORM models for these DW tables (Core `Table` refs only; DDL is in SQL files).
- The caller passes an already-initialized DW SQLAlchemy `Session` (or uses a script that resolves `system_datawarehouse` via `--dw-id`).

---

## Making the Search API work (quick start)

**All setup commands and step-by-step instructions are in the root [README.md](../README.md) (section *Data warehouse search index*).** This document covers architecture, code layout, and behavior only.

---

## Where the code lives

### Core service
- `apps/datawarehouse/services/search_index/search_index_builder.py`
  - `SearchIndexBuilderService.build(dw_db: Session, batch_size=..., commit=...)`
  - **Responsibility**: Orchestrates the end-to-end indexing flow (languages → UT reads → transforms → writes).
  - **Why it exists**: Keeps the job logic in one place while delegating IO details (reads/writes) to dedicated components (SRP).

### Incremental updater (CRUD-triggered freshness)
- `apps/datawarehouse/services/search_index/search_index_incremental_updater.py`
  - `SearchIndexIncrementalUpdater.upsert(dw_db, keyword_type, language_code, entity_id, commit=True)`
  - `SearchIndexIncrementalUpdater.delete(dw_db, keyword_type, language_code, entity_id, commit=True)`
  - **Responsibility**: Update search tables for **one** entity row (per CRUD event) by fetching the latest UT row from DW and applying the same transforms/writes as the bulk builder.
  - **Why it exists**: Bulk rebuild is optimized for throughput and reconciliation; incremental updates are optimized for low-latency, fine-grained writes and delete handling.

### Readers (DW source tables)
- `apps/datawarehouse/services/search_index/readers.py`
  - `UtLanguageReader`
  - `UtIndicatorReader`
  - `UtAreaReader`
  - `UtSubgroupValsReader`
  - `UtTimePeriodReader`
  - **Responsibility**: Encapsulate how we read from `ut_*` tables (including language-suffixed table names).
  - **Why readers exist**:
    - Isolates DB query details from business logic (easier to maintain when schemas change).
    - Improves testability (readers can be stubbed/mocked for unit tests of the orchestrator).
    - Centralizes safety logic for language-code table name interpolation.
    - Supports both bulk reads (`read`) and incremental reads (`read_one`) without duplicating SQL across services.

### Writers (DW destination tables)
- `apps/datawarehouse/services/search_index/writers.py`
  - `SearchKeywordWriter` (dialect-aware upsert: MySQL/PostgreSQL)
  - `SearchSynonymWriter` (replace semantics)
  - `SearchNgramWriter` (replace semantics)
  - **Responsibility**: Encapsulate all writes to `search_*` tables with consistent idempotent behavior.
  - **Why writers exist**:
    - Separates persistence concerns (upsert vs replace strategy, batching) from transformation logic.
    - Makes it straightforward to add an incremental “single-row update” flow later using the same writers.
    - Encapsulates delete behavior used by incremental updates.

### Table definitions (SQLAlchemy Core)
- `apps/datawarehouse/services/search_index/tables.py`
  - SQLAlchemy Core `Table(...)` definitions for `search_*` tables used by writers.
  - **Authoritative DDL**: `apps/app_db/SQL/schema_search_mysql.sql` (MySQL); PostgreSQL uses the same file via `adapt_mysql_to_postgresql` in `apps/shared/utils/sql_adapter.py`.
  - **Responsibility**: Provide a lightweight schema contract for query construction without requiring ORM models/migrations.
  - **Why**: Avoids hardcoding column names across multiple modules and keeps bulk operations fast.

### Types (domain-shaped payloads)
- `apps/datawarehouse/services/search_index/types.py`
  - `KeywordType`, `SynonymType`
  - `SearchKeywordRow`
  - `BuildCounts`, `BuildResult`
  - **Responsibility**: Defines the in-memory shapes passed between orchestrator and writers.
  - **Why**: Makes the pipeline intention-revealing and reduces ad-hoc dict usage.

### Shared transforms (single source of truth)
- `apps/datawarehouse/services/search_index/transform.py`
  - **Responsibility**: Centralized transformation rules used by both bulk rebuild and incremental updater:
    - clamping rules (`MAX_TEXT_LEN`, `MAX_LANGUAGE_CODE_LEN`)
    - normalization rules (`normalize_text` + clamp)
    - indicator keyword parsing (split tokens)
    - building `(SearchKeywordRow, synonym_seeds)` per entity type
  - **Why**: Avoids duplication and guarantees bulk and incremental produce identical search rows for the same UT input.

### Reusable utilities (intended for indexing + query-time later)
- `utils/text.py`
  - `normalize_text()`
- `utils/ngrams.py`
  - `generate_trigrams()`
  - **Responsibility**: Shared normalization/tokenization to guarantee indexing-time and query-time logic stays consistent.

### Creating the search tables (DDL)
Search tables must exist **before** running the index builder. They can be created by:

1. **Warehouse creation API**: `POST /dw/` creates the main DW schema and then the three search tables (`search_keywords`, `search_keyword_synonym`, `search_keyword_ngram`). See `SystemDatawarehouseService.create_warehouse`.
2. **CLI script (for existing DBs):** module `apps.datawarehouse.scripts.create_search_tables` — **commands and examples:** [README.md](../README.md) (*Data warehouse search index*). Idempotent (safe to run if tables already exist). Accepts `--url` (SQLAlchemy URL) or `--dw-id` (warehouse id or name from `system_datawarehouse`).

DDL is in `apps/app_db/SQL/schema_search_mysql.sql`; for PostgreSQL the same file is adapted via `apps/shared/utils/sql_adapter.py`.

### Building the search index (populating data)
- **Script:** module `apps.datawarehouse.scripts.build_search_index` — **commands and examples:** [README.md](../README.md) (*Data warehouse search index*). Populates/refreshes `search_*` from UT tables so the Search API returns results; search tables must already exist.
- **Options**: `--batch-size` (default 1000), `--no-commit` (caller manages transactions).
- **Thin wrapper** (developer workflow): `test_scripts/run_dw_search_index.py` delegates to this script.

---

## Data mapping (source → search tables)

### `search_keywords`
- **`keyword_type`**:
  - `INDICATOR` for `ut_indicator_{lang}`
  - `AREA` for `ut_area_{lang}`
  - `SUBGROUP` for `ut_subgroup_vals_{lang}`
  - `TIME_PERIOD` for `ut_timeperiod`
- **`language_code`**: from `ut_language.language_code`
- **`canonical_text`**:
  - indicator: `indicator_name`
  - area: `area_name`
  - subgroup: `subgroup_val`
  - time period: `timeperiod`
- **`normalized_text`**: `normalize_text(canonical_text)`
- **`entity_id`**:
  - indicator: `indicator_nid`
  - area: `area_nid`
  - subgroup: `subgroup_val_nid`
  - time period: `timeperiod_nid`

### `search_keyword_synonym`
The service generates synonyms from the UT rows, normalizes them, and writes them for the related `search_keywords` row.

- **Indicator synonyms** (`ut_indicator_{lang}`):
  - `short_name` → `synonym_type=ABBREVIATION`
  - `keywords` (split by `,`, `;`, newline, `|`) → `synonym_type=SYNONYM`
- **Area synonyms** (`ut_area_{lang}`):
  - `areashortname` → `synonym_type=ABBREVIATION`
  - `area_name` (seed) → `synonym_type=SYNONYM`
- **Subgroup synonyms** (`ut_subgroup_vals_{lang}`):
  - `subgroup_val` (seed) → `synonym_type=SYNONYM`
- **Time period synonyms** (`ut_timeperiod`):
  - `timeperiod` (seed) → `synonym_type=SYNONYM`

Also:
- **`normalized_synonym`**: `normalize_text(synonym_text)`

### `search_keyword_ngram`
- For each `search_keywords` row in the current batch, generate **trigrams** from `normalized_text` using:
  - `generate_trigrams(normalized_text)`
- Insert rows into `search_keyword_ngram(keyword_id, ngram)`.

---

## How to call the service

The service expects a **DW SQLAlchemy `Session`** connected to the external DW MySQL database.

Example (pseudo-code):

```python
from sqlalchemy.orm import Session
from apps.datawarehouse.services.search_index.search_index_builder import SearchIndexBuilderService

def run_job(dw_db: Session) -> None:
    svc = SearchIndexBuilderService()
    svc.build(dw_db, batch_size=1000, commit=True)
```

Notes:
- `commit=True` (default) commits per language to reduce lock scope and allow progress visibility.
- If your caller manages transactions itself, use `commit=False` and handle commit/rollback externally.

### Incremental updater usage (single entity)

Use this when you need search tables to be updated on every create/update/delete of a UT row (often via background worker).\n
```python
from sqlalchemy.orm import Session
from apps.datawarehouse.services.search_index.search_index_incremental_updater import SearchIndexIncrementalUpdater
from apps.datawarehouse.services.search_index.types import KeywordType

def on_indicator_updated(dw_db: Session, language_code: str, indicator_nid: int) -> None:
    SearchIndexIncrementalUpdater().upsert(
        dw_db,
        keyword_type=KeywordType.INDICATOR,
        language_code=language_code,
        entity_id=indicator_nid,
        commit=True,
    )

def on_indicator_deleted(dw_db: Session, language_code: str, indicator_nid: int) -> None:
    SearchIndexIncrementalUpdater().delete(
        dw_db,
        keyword_type=KeywordType.INDICATOR,
        language_code=language_code,
        entity_id=indicator_nid,
        commit=True,
    )
```

---

## Implementation decisions (and why)

### 1) SQLAlchemy Core for DW tables (no ORM models)
**Decision**: Use SQLAlchemy Core `Table` definitions instead of ORM models.

**Why**:
- The scope explicitly excludes migrations/models.
- For ETL/batch pipelines, ORM adds overhead (identity map, object hydration) without benefit.
- Core queries are explicit, easier to bulk insert/upsert, and typically faster for high-volume writes.

**Performance note**:
- The bulk of runtime will be dominated by I/O and insert volume (especially ngrams). Core helps keep Python overhead low.

### 2) Caller-provided DW `Session`
**Decision**: `SearchIndexBuilderService` does not construct engines/sessions; it accepts an existing `Session`.

**Why**:
- Keeps responsibilities clean (Single Responsibility Principle).
- Makes it easy to plug into different orchestration styles later (cron, Celery, Kubernetes Job, etc.).
- Avoids hard dependencies on the `system_datawarehouse` app DB model until that team ships it.

### 2.1) Why bulk rebuild and incremental updater are separate
**Decision**: Provide two entry points:
- Bulk rebuild: `SearchIndexBuilderService.build(...)`
- Incremental updates: `SearchIndexIncrementalUpdater.upsert/delete(...)`

**Why**:
- **Different performance goals** (grounded in current implementation):
  - **Bulk rebuild is optimized for throughput** because it intentionally does work in **batches** and commits **less frequently**:
    - The bulk builder (`apps/datawarehouse/services/search_index/search_index_builder.py`) iterates **all languages** and processes each entity type in batches via the `batch_size` parameter.
    - Writes happen for many rows at once (keyword upsert + synonym replace + ngram replace for a batch), and the code commits **once per language** when `commit=True`.\n
    - This reduces per-row overhead (fewer round-trips, fewer commits) which is typically what dominates runtime in large DW datasets.\n
  - **Incremental updates are optimized for low latency and minimal locking** because they operate on **exactly one entity**:\n
    - The incremental updater (`apps/datawarehouse/services/search_index/search_index_incremental_updater.py`) fetches a **single UT row** using `read_one(...)`, then updates exactly **one** `search_keywords` row and replaces synonyms/ngrams for exactly **one** `keyword_id`.\n
    - It uses `chunk_size=1` and `delete_chunk_size=1` for the single-keyword operations, and commits immediately for that one entity (when `commit=True`).\n
    - This keeps lock scope small (one keyword_id worth of deletes/inserts) and makes it suitable for CRUD-triggered freshness without holding large locks across the search tables.
- **Different failure modes**: bulk is a reconciliation tool (safe to rerun); incremental is freshness-oriented and often runs under higher concurrency.\n
- **Correctness backstop**: periodic bulk rebuild fixes drift from missed events or partial failures in incremental processing.

### 3) MySQL-specific upsert for `search_keywords`
**Decision**: Use dialect-appropriate upsert for `search_keywords` (MySQL and PostgreSQL supported).

**Why**:
- Keywords must be unique by `(keyword_type, entity_id, language_code)` (the same `entity_id` value can exist across different entity tables, e.g. indicator vs area).
- This uniqueness constraint makes upsert a natural fit and keeps the job idempotent.
- Guarantees idempotency when rerunning the job (nightly cron safe).
- Avoids separate existence checks or per-row updates.

**How it works**:
- **MySQL/MariaDB**: `INSERT ... ON DUPLICATE KEY UPDATE`
- **PostgreSQL**: `INSERT ... ON CONFLICT (...) DO UPDATE`

**Extending to new dialects later**:
- Add a new branch in `SearchKeywordWriter.upsert()` keyed by `dw_db.get_bind().dialect.name` (keep it small and explicit).

### 4) Replace semantics for synonyms and ngrams (delete + insert)
**Decision**: For `search_keyword_synonym` and `search_keyword_ngram`, the service uses **replace semantics**:
- Delete existing rows for the affected `keyword_id`s (and `language_code` for synonyms)
- Insert the freshly computed rows

**Why**:
- The requirements did not specify uniqueness constraints for synonyms or ngrams.
- Delete+insert avoids duplication across repeated runs and keeps the implementation simple and reliable.
- Keeps behavior deterministic: the search tables always match current UT source values.

**Tradeoff**:
- Deletes can create more write load. We mitigate by batching (`delete_chunk_size`) and committing per-language.

### 5) Chunking (batch_size)
**Decision**: Process and write data in batches (`batch_size`, default 1000).

**Why**:
- Controls memory growth (especially ngram expansion).
- Reduces lock duration compared to one massive transaction.

### 6) Text normalization and trigram generation as shared utilities
**Decision**: Keep `normalize_text()` and `generate_trigrams()` in `utils/`.

**Why**:
- They are intended to be reused later by the query-time “smart search” layer (same tokenization rules).
- Keeping them dependency-free makes reuse easy in different execution contexts.

### 7) Safety: language_code table name interpolation
**Decision**: When reading language-specific tables like `ut_indicator_{language_code}`, language_code is validated with a strict identifier whitelist (`[A-Za-z0-9_]+`) before interpolating into SQL.

**Why**:
- SQL parameters cannot be used for identifiers (table names).
- This prevents SQL injection via unexpected `language_code` values.

---

## Idempotency guarantees

When the service is re-run:
- `search_keywords` are **upserted** by `(keyword_type, entity_id, language_code)` (requires the unique constraint to exist).
- `search_keyword_synonym` rows are **replaced** per affected keyword_id (+language_code).
- `search_keyword_ngram` rows are **replaced** per affected keyword_id.

Net result: the final state converges to the same output for a given DW snapshot.

---

## Operational notes (cron/worker)

This code is suitable for:
- nightly cron job
- background worker task
- Kubernetes Job

Recommended runtime behavior:
- Run with `commit=True` so progress is committed per language.
- Log progress per language (already done in the service).

Future extensions (not implemented yet):
- Metrics (rows processed per table/language, durations).
- Retry strategy around transient DB failures.

### Incremental operational notes
- Prefer running incremental updates in a **background worker** (or async task) instead of inside the request/CRUD transaction.\n
- If you must run it inline, keep `commit=False` and coordinate transaction boundaries carefully to avoid partially updated search tables.

---

## Testing notes

Unit tests were added for:
- normalization (`tests/test_utils/test_text.py`)
- trigram generation (`tests/test_utils/test_ngrams.py`)
- orchestration-level behavior (`tests/test_services/test_search_index_builder.py`)

If running tests fails due to missing auth deps (unrelated to this service), ensure `python-jose` and `passlib[bcrypt]` are installed as per `requirements.txt`.

