# DFA Toolkit API — Claude Context

## Overview
FastAPI backend for the DFA (Data For All) datamanager, visulalizer platform. Multi-tenant analytics engine managing warehouses, users, IAM, indicators, areas, subgroups, search, and review workflows.

**Stack:** FastAPI 0.104.1 · SQLAlchemy 2.0 · MySQL 5.7+ · Alembic 1.12 · Pydantic 2.5 · JWT + Ed25519/RSA auth · Redis (optional cache) · Celery or DB-backed bg jobs · openpyxl XLSX export · pytest

---

## Structure

```
dfa-toolkit-api/
├── main.py                         # App entry point: lifespan, routers, middleware
├── apps/
│   ├── app_db/                     # Core DB — users, IAM, config, gallery, workflows
│   │   ├── models/core.py          # 30+ ORM models
│   │   ├── router/                 # 15 routers (auth, iam, users, dw, workflow…)
│   │   ├── schemas/                # Pydantic request/response models
│   │   ├── services/               # user, iam, gallery, translation, dw…
│   │   ├── migrations/             # 41 Alembic versions
│   │   └── scripts/                # seed_configuration, seed_translations
│   ├── datawarehouse/              # Multi-tenant analytics
│   │   ├── models/datawarehouse.py # Locale-aware ORM (metaclass pattern)
│   │   ├── router/                 # 25 routers (indicators, areas, ius, data, search…)
│   │   ├── services/               # 35+ services
│   │   ├── tasks/                  # Celery/bg tasks (subgroup, ISMRD, data_exist)
│   │   └── migrations/             # 1 Alembic version (search tables)
│   ├── compute_engine/             # Stub — future analytics compute
│   └── shared/
│       ├── config/                 # Settings, security, celery config, dependencies
│       ├── middleware/             # Auth, CORS, error handling, logging
│       ├── services/               # bg_job_dispatch, bg_job_poller, dfa_mailer
│       ├── schemas/response.py     # SuccessResponse, ErrorResponse, pagination
│       ├── translations/           # en.json, ar.json, fr.json (XLSX column labels)
│       └── utils/                  # response, cache, validators, email
├── docs/                           # APP_CLIENT_AUTH, SEARCH, USER_PERMISSIONS
├── Dockerfile / docker-compose.yml
└── .env.example                    # 80+ config options template
```

---

## Key Patterns

**Multi-tenant:** Each `dw_id` is a separate MySQL DB. Core DB stores warehouse metadata; analytics data lives per warehouse.

**Response envelope** — shapes are defined in [`apps/shared/schemas/response.py`](apps/shared/schemas/response.py) (`SuccessResponse`, `ErrorResponse`). Success paths return helpers from [`apps/shared/utils/response.py`](apps/shared/utils/response.py) (`success_response()`, `created_response()`, `no_content_response()`, etc.). Responses are serialized with `exclude_none=True`, so optional fields may be omitted.

**Business errors (routes and services):** raise subclasses of `AppException` from [`apps/shared/exceptions.py`](apps/shared/exceptions.py) (`BadRequest`, `NotFound`, `Conflict`, `Forbidden`, `UnprocessableEntity`, `InternalError`, …). Do **not** `return error_response(...)` from route handlers for expected failures — that bypasses the global handlers and skips structured logging. Global handlers in [`apps/shared/middleware/error_handler.py`](apps/shared/middleware/error_handler.py) map raised exceptions to the JSON envelope below and call `log_event()` via `_emit()`. Use `error_response()` only inside middleware / framework code (same file), not in normal CRUD routes.

Success:
```json
{ "success": true, "message": "...", "data": {}, "meta": { "total_count": 0, "count": 0, "page": 1, "page_size": 20, "total_pages": 0 } }
```

Error (after global handler):
```json
{ "success": false, "err_message": "...", "data": null, "errors": { "code": "..." } }
```

**Identifiers:** All routes accept `nid` (numeric PK) or `gid` (human-readable global ID). Resolved via `resolve_identifier_to_nid()`.

**Serialization:** `ADAPTATION=internal` → DB field names (`indicator_nid`, `indicator_name`). `ADAPTATION=external` → simplified names (`id`, `name`, `gid`).

**Access control** (middleware, route config stored in `iam_resource_api` table):
`PUBLIC` → `APP_CLIENT` (signature only) → `AUTHENTICATED` (+ JWT) → `PERMISSION` (+ IAM role check)

**API client auth:** `API key + timestamp + Ed25519 or RSA-SHA256 signature`. See [docs/APP_CLIENT_AUTH.md](docs/APP_CLIENT_AUTH.md).

**Background jobs** (`BG_JOB_MQ_TYPE` env var):
- `DB` — jobs written to `system_bg_job_queue`, drained by in-process async poller (`BG_JOB_POLL_INTERVAL_SEC=5`)
- `CELERY` — tasks dispatched to broker (Redis/RabbitMQ), consumed by workers

---

## Internationalization (i18n)

Two separate systems — one per DB tier.

### app_db — Table-based i18n (UI strings)
Managed by `TranslationService` ([apps/app_db/services/translation_service.py](apps/app_db/services/translation_service.py)).

| Table | Key columns | Purpose |
|-------|-------------|---------|
| `system_language` | `locale`, `is_default` | Registry of active locales |
| `system_language_translations` | `trans_code`, `default_text`, `app_key` | Master translation keys |
| `system_language_translations_i18n` | `master_id`, `locale`, `translated_text` | Per-locale translated text |

**Resolution:** query `i18n` table for `(master_id, locale)` → fallback to `default_text` on `system_language_translations`.

**Scope:** `app_key IS NULL` = global; `app_key = 'xyz'` = app-specific (overrides global for same `trans_code`).

**Endpoints:** `GET/POST/PATCH /translations`, `GET /translations/export` (XLSX), `POST /translations/import` (XLSX bulk upsert).

**Static JSON labels** (`apps/shared/translations/{en,ar,fr}.json`) — field-level labels (column headers, indicator field names) used for XLSX export column naming. Not DB-driven.

**Seed data:** `apps/app_db/data/translations.json` — loaded via `seed_translations.py`.

### datawarehouse DB — Table-name suffix i18n (content data)
Each locale gets its own physical table. Locale code appended as suffix to the table name.

```
ut_indicator_en  /  ut_indicator_ar  /  ut_indicator_fr
ut_area_en       /  ut_area_ar       /  ut_area_fr
```

**Locale-aware models** (defined in [apps/datawarehouse/models/datawarehouse.py](apps/datawarehouse/models/datawarehouse.py) using `_LocaleModelMeta` metaclass):

| Model | Table prefix | Model | Table prefix |
|-------|-------------|-------|-------------|
| `Indicator` | `ut_indicator` | `TimePeriod` | `ut_time_period` |
| `Unit` | `ut_unit` | `SubgroupVal` | `ut_subgroup_val` |
| `Area` | `ut_area` | `Source` | `ut_source` |
| `AreaLevel` | `ut_area_level` | `IndicatorClassification` | `ut_indicator_classification` |

**Non-locale (single table per warehouse):** `ut_data`, `ut_indicator_unit_subgroup` (IUS), `ut_metadata_report`, `ut_language`, `ut_subgroup_category`, `ut_subgroup_category_value`

**Usage:** `Indicator("en")` → dynamically builds and caches SQLAlchemy model class for `ut_indicator_en`. Thread-safe via `_LOCALE_REGISTRY_LOCK`.

**Locale resolution flow:**
1. Extract from `Accept-Language` header or `locale` query param
2. Validate against warehouse's `ut_language` table via `get_dw_language_code` dependency
3. Pass to model callable: `Indicator(locale)`

---

## Core app_db Models

| Model | Table | Purpose |
|-------|-------|---------|
| `SystemDatawarehouse` | `system_datawarehouse` | Registered warehouses |
| `SystemApplication` | `system_application` | App registrations (`app_key`) |
| `SystemApplicationClient` | `system_application_client` | API clients with signing keys |
| `SystemConfiguration` | `system_configuration` | Per-app config key-value store |
| `SystemUser` | `system_user` | User accounts |
| `IamRole` / `IamRolePermission` / `IamRoleAssignment` | `iam_role*` | Roles and permissions |
| `SystemBgJobQueue` | `system_bg_job_queue` | DB-backed job queue |
| `ReviewWorkflow` / `ReviewWorkflowLevel` / `ReviewWorkflowRule` / `ReviewLevelReviewerRule` | `review_workflow*` | Multi-level review engine |

---

## Common Commands

```bash
# Dev & Docker
uvicorn main:app --reload --port 8000
docker-compose up api
docker-compose --profile stack up          # + MySQL + Redis

# Migrations
cd apps/app_db && alembic upgrade head
cd apps/datawarehouse && alembic upgrade head

# IMPORTANT: Alembic stores revision IDs in alembic_version.version_num VARCHAR(32).
# The `revision = "..."` value in every migration file MUST be ≤ 32 characters.
# Use short, descriptive IDs: NNN_short_slug (e.g. 045_workflow_code_len_60).
# Exceeding 32 chars causes a MySQL DataError 1406 on first migration run.

# Seeding
python -m apps.app_db.scripts.seed_configuration
python -m apps.app_db.scripts.seed_translations

# Tests
pytest apps/app_db/tests/
pytest apps/datawarehouse/tests/
pytest apps/
```

---

## New Endpoint Checklist
1. **Model** — add to `apps/app_db/models/core.py` or DW models
2. **Migration** — `alembic revision --autogenerate -m "..."` → `alembic upgrade head`
3. **Schema** — Pydantic models in `apps/*/schemas/`
4. **Service** — business logic in `apps/*/services/`
5. **Router** — return `success_response()` / `created_response()` / etc. on success; `raise` `AppException` subclasses for business errors; register in `main.py`
6. **IAM** — insert row into `iam_resource_api` with correct access level
7. **Tests** — add in `apps/*/tests/`

---

## Docs
- [docs/APP_CLIENT_AUTH.md](docs/APP_CLIENT_AUTH.md) — API client signature auth + IP restrictions
- [docs/SEARCH_INDEX_SERVICE.md](docs/SEARCH_INDEX_SERVICE.md) — full-text search architecture
- [docs/SEARCH_QUERY.md](docs/SEARCH_QUERY.md) — search query syntax
- [docs/USER_PERMISSIONS_API.md](docs/USER_PERMISSIONS_API.md) — IAM model and role permissions
