## Query-Time Search API

The search tables populated by the indexing service are consumed by a **query-time Search API** that provides smart/semantic search functionality for the frontend.

### API Endpoint

```
GET /api/v1/{dw_id}/search
```

**Path Parameters:**
- `dw_id` (string, required): Data warehouse identifier (e.g., `dw_default`)

**Query Parameters:**
- `q` (string, required): Search query (2-255 chars)
- `language_code` (string, required): Language filter (2-3 chars, e.g., `en`)
- `keyword_types` (array, optional): Filter by type (`INDICATOR`, `AREA`, `SUBGROUP`, `TIME_PERIOD`)
- `limit` (int, optional): Max results (1-100, default: 20)

**Response:**
```json
{
  "success": true,
  "code": "SEARCH_OK",
  "message": "Search completed",
  "data": {
    "results": [
      { "keywordId": 42, "keywordType": "INDICATOR", "displayText": "GDP Growth Rate" },
      { "keywordId": 43, "keywordType": "INDICATOR", "displayText": "GDP Per Capita" }
    ]
  }
}
```
`keywordId` is the **entity id** (e.g. indicator_nid, area_nid, timeperiod_nid, subgroup_val_nid). Use it with the entity APIs: e.g. `GET /dw/{dw_id}/indicators/{keywordId}`, `/areas/{keywordId}`, `/time-periods/{keywordId}`, `/subgroups/{keywordId}`. It is not the primary key of the `search_keywords` table.

### Search Strategy (Two-Phase with Synonym Fallback)

The search uses a multi-phase strategy optimized for both precision and recall:

**Phase 0: Exact Canonical Match (Cheap Win)**
- Direct lookup on `search_keywords.normalized_text = normalized_query`
- Fastest path for exact matches
- Score: 120 (highest)

**Phase 1: Trigram-Based Fuzzy Search**
- Query is normalized and converted to trigrams using the same `generate_trigrams()` used at indexing time
- Candidates are scored by trigram overlap count
- Handles typos and partial matches (e.g., "mortlity" matches "mortality")

**Phase 2: Exact Synonym Fallback (Conditional)**
- Only triggered when trigram confidence is low (few hits or low overlap ratio)
- Exact match on `search_keyword_synonym.normalized_synonym`
- No LIKE or fuzzy matching on synonyms (performance optimization)
- Handles abbreviations (e.g., "IMR" → "Infant Mortality Rate")

**Scoring Strategy:**

| Match Type | Score |
|------------|-------|
| Exact canonical match | 120 |
| Abbreviation synonym | 110 |
| Alias synonym | 105 |
| Regular synonym | 100 |
| Trigram match | trigram_count |

The scoring strategy is implemented using the **Strategy pattern** (`apps/datawarehouse/services/search/scoring.py`) and can be replaced or configured without modifying the search service.

### Where the query-time code lives

**Service Layer:**
- `apps/datawarehouse/services/search/service.py` - Orchestrates the search flow
- `apps/datawarehouse/services/search/scoring.py` - Scoring strategy (Strategy pattern)
- `apps/datawarehouse/services/search/readers.py` - Read-only access to search tables
- `apps/datawarehouse/services/search/types.py` - Search-specific DTOs

**API Layer:**
- `apps/datawarehouse/router/search.py` - FastAPI router with GET endpoint
- `schemas/search.py` - Request/response Pydantic schemas

**Infrastructure:**
- `apps/app_db/services/datawarehouse.py` - `SystemDatawarehouseService` for DW connection lookup from database
- `db/datawarehouse.py` - `get_dw_db(dw_id)` FastAPI dependency for DW session, `get_warehouse_session()` context manager for services

### Required Database Indexes

For optimal query-time performance, ensure these indexes exist on the DW search tables:

```sql
-- Trigram lookup (critical for fuzzy search performance)
CREATE INDEX idx_ngram_ngram ON search_keyword_ngram(ngram);

-- Composite index for trigram candidate scoring + filtering
CREATE INDEX idx_ngram_ngram_kwid ON search_keyword_ngram(ngram, keyword_id);

-- Exact canonical match
CREATE INDEX idx_kw_lang_norm ON search_keywords(language_code, normalized_text);

-- Keyword type filtering
CREATE INDEX idx_kw_lang_type ON search_keywords(language_code, keyword_type);

-- Synonym exact match
CREATE INDEX idx_syn_lang_norm ON search_keyword_synonym(language_code, normalized_synonym);
```

### Multi-Tenant DW Support

The API supports multiple data warehouses via the `dw_id` path parameter:

DW connections are fetched dynamically from the `system_datawarehouse` table in the application database using `SystemDatawarehouseService`.

**Adding a new data warehouse:**

Use the Core API to create a new data warehouse entry:

```bash
POST /api/v1/dw/
{
  "db_name": "my_warehouse",
  "db_source_type": "mysql",
  "db_host_address": "localhost",
  "db_port": 3306,
  "db_user": "user",
  "db_password": "password",
  "db_database": "my_dw_db"
}
```

Or directly insert into `system_datawarehouse` table. The `dw_id` in API requests can be either:
- The numeric ID from the table (e.g., `1`, `2`)
- The database name (e.g., `my_dw_db`)

### Testing the Search API

Unit tests for the search service:
- `tests/test_services/test_search/test_scoring.py` - Scoring strategy tests
- `tests/test_services/test_search/test_search_service.py` - Service orchestration tests

Run tests:
```bash
python -m pytest tests/test_services/test_search/ -v
```

### Prerequisites: search tables and data

The Search API reads from the DW search tables (`search_keywords`, `search_keyword_synonym`, `search_keyword_ngram`). For the API to return results:

1. **Search tables must exist** in the data warehouse database.
2. **Search tables must be populated** from the UT tables (indicators, areas, subgroups, time periods).

**New warehouse (created via `POST /dw/`):** Tables are created automatically; you only need to run the index builder once.

**Existing database:** Run these in order:

```bash
# 1. Create the three search tables (idempotent)
python -m apps.datawarehouse.scripts.create_search_tables --url "mysql+mysqlconnector://user:pass@localhost:3306/dw_db"
# or: --dw-id 1   (if the warehouse is in system_datawarehouse)

# 2. Populate search tables from UT data so the Search API works
python -m apps.datawarehouse.scripts.build_search_index --url "mysql+mysqlconnector://user:pass@localhost:3306/dw_db"
# or: --dw-id 1
```

Alternative (same step 2) via test script:

```bash
python test_scripts/run_dw_search_index.py --url "mysql+pymysql://user:pass@localhost:3306/dw_db"
```

**Options for build_search_index / run_dw_search_index:**
- `--url`: SQLAlchemy database URL (required when not using `--dw-id`)
- `--dw-id`: Data warehouse ID or database name from `system_datawarehouse`
- `--batch-size`: Batch size for processing (default: 1000)
- `--no-commit`: Don't commit inside the script (for testing)

Full details and flow are in [SEARCH_INDEX_SERVICE.md](SEARCH_INDEX_SERVICE.md#making-the-search-api-work-quick-start).
