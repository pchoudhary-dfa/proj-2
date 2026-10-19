# DFA Toolkit API Core

FastAPI backend for the DFA Toolkit project with standardized API responses and best practices.

## 1. Clone the Repository

```bash
git clone <repository-url>
cd dfa-toolkit-api-core
```

## 2. System Requirements

- Python 3.8+
- MySQL 5.7+ (or MariaDB 10.2+)

### Verify Python Installation

```bash
python --version
# or
python3 --version
```

## 3. Create and Activate Virtual Environment

### Create Virtual Environment

```bash
python -m venv venv
```

### Activate Virtual Environment

**Windows:**
```bash
venv\Scripts\activate
```

**macOS / Linux:**
```bash
source venv/bin/activate
```

## 4. Install Dependencies

```bash
pip install -r requirements.txt
```

## 5. Setup Environment Variables

### Root .env File

Create a `.env` file in the root directory by copying `.env.example`:

**Windows:**
```bash
copy .env.example .env
```

**macOS / Linux:**
```bash
cp .env.example .env
```

Then update the `.env` file with your configuration:

**Important:** 
- Replace `your-secret-key-change-in-production` with a secure random string
- Update database credentials (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
- The database must be created in advance (empty database is fine)

### API version & CHANGELOG

The **canonical API version** is the top entry in root [`CHANGELOG.md`](CHANGELOG.md). Swagger (`/docs`), `/openapi.json`, and `GET /` read that version at startup. The `VERSION` variable in `.env` is only a fallback if the changelog is missing or unreadable.

Before a release, run `scripts/bump_changelog.py`. It reads the current top version, bumps semver, prepends a new dated section, and prints the new version to stdout. Only `CHANGELOG.md` is modified.

**Version bump** (default is patch):

```bash
python scripts/bump_changelog.py           # patch: x.y.(z+1)  e.g. 1.0.0 → 1.0.1
python scripts/bump_changelog.py --minor   # minor: x.(y+1).0  e.g. 1.0.0 → 1.1.0
python scripts/bump_changelog.py --major   # major: (x+1).0.0  e.g. 1.0.0 → 2.0.0
```

**Release notes** (optional; repeat a flag for multiple bullets in the same section):

```bash
python scripts/bump_changelog.py --added "New endpoint"
python scripts/bump_changelog.py --added "Feature A" --added "Feature B" --changed "Refactor X"
python scripts/bump_changelog.py --minor --added "Notifications API" --fixed "Auth edge case"
```

Without `--added` / `--changed` / `--fixed`, all three sections get `- TBD` placeholders. Any section you omit when using those flags also gets `- TBD`. You cannot bump again while the top section is still the all-`TBD` template — edit it or pass the flags above first.

### App-Specific .env Files (Optional)

Each app can have its own `.env` file for app-specific database credentials using separate variables:

**App DB (Core)** (`apps/app_db/.env.example`):
- `DB_HOST` - Database host (default: localhost)
- `DB_PORT` - Database port (default: 3306)
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- If not set, uses root `.env` database variables

**Example:**
```bash
# Root .env (common settings)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=shared_db
DB_USER=root
DB_PASSWORD=

# apps/app_db/.env (optional - app-specific)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=app_db
DB_USER=root
DB_PASSWORD=
```

### AI chart insights (`POST /dw/{dw_id}/insights`)

The endpoint **`POST /dw/{dw_id}/insights`** sends sanitized chart/visualization data and a use-case code (`UC0`–`UC10`) to OpenAI. **Credentials** (`AI_API_KEY`, `AI_PROVIDER`) are read from the warehouse **`db_configuration`** table for that `dw_id`. **Model, timeout, and response mode** (`markdown` vs `structured`) are **code defaults** in `apps/shared/config/config.py` (`InsightsOpenAIConfig` / `insights_openai`), not environment variables.

IAM must include `POST /dw/{dw_id}/insights` for your app key. Seed or update with `python apps/app_db/scripts/seed_iam.py` (use `--force` to refresh existing rows). The default access level is **AUTHENTICATED** (valid app client headers plus Bearer JWT).

## 6. Database Setup

### Create Database

Create an empty MySQL database:

```sql
CREATE DATABASE dbname CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Run Migrations

The Core App (App DB) uses Alembic for migrations. Use the app-specific `alembic.ini` when running migrations:

**Core App Migrations (App DB):**
```bash
# Create a new migration
alembic -c apps/app_db/alembic.ini revision --autogenerate -m "description"

# Apply migrations
alembic -c apps/app_db/alembic.ini upgrade head

# Rollback one migration
alembic -c apps/app_db/alembic.ini downgrade -1
```

## 7. Running the Server

### Development Mode (with hot reload)

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production Mode

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

The API will be available at:
- **API**: http://localhost:8000
- **Interactive Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

## 8. Background work: `.env` and Celery worker

| Variable | Purpose |
|----------|---------|
| **`IS_BACKGROUND_ENABLED`** | When `true`, some data-warehouse work (e.g. large ISMRD updates) can be queued to Celery after thresholds are exceeded; when `false`, that work runs inline in the API. |
| **`BG_JOB_MQ_TYPE`** | `CELERY` — tasks are sent to the broker with `send_task` (not stored in `system_bg_job_queue`). `DB` — jobs are rows in the App DB queue and are drained by the **`BG_JOB_POLLER_ENABLED`** asyncio poller in the API process. |

Example `.env` lines:

```bash
IS_BACKGROUND_ENABLED=true
BG_JOB_MQ_TYPE=CELERY
```

Start the Celery worker (uses `apps.shared.config.celery_config`; `--pool=solo` is handy on Windows):

```bash
celery -A apps.shared.config.celery_config worker -l info --pool=solo
```

Set `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, and queue names in `.env` to match your broker (see `.env.example`).

### Data warehouse SQL dump export (`POST/GET /dw/{dw_id}/sql-dump`)

Exports a warehouse MySQL database to `files/sql_dump/dw_{dw_name}.sql.gz` (flat directory, one file per warehouse name). The background job runs the **`mysqldump`** system binary and compresses output with Python's built-in **`gzip`** module (no external `gzip` executable required).

**File layout:**

```
files/sql_dump/
  dw_temp.sql.gz       # final artifact
  dw_temp.sql.gz.tmp   # in-progress write (ignored by GET)
```

GET resolves the file from the warehouse's `dw_connection_name` (falls back to database name, then `dw_id`). POST/background job flow is unchanged.

**Storage path (`DW_SQL_DUMP_FILES_DIR`):**

| Environment | Default | Config |
|-------------|---------|--------|
| Local / Docker | `./files/sql_dump` | Set in `.env` or use default (`apps/shared/config/config.py`) |
| OCI OKE (production) | Must be on **shared persistent storage** | Set `DW_SQL_DUMP_FILES_DIR` in `oci_k8s/overlays/*/env-config.yaml` to the **in-pod mount path** |

**OCI / OKE (shared storage):**

This project deploys to **Oracle Kubernetes Engine (OKE)** via **OCI DevOps** (`build_spec.yaml`, manifests under `oci_k8s/`). SQL dumps are written to disk by the API pod's in-process DB poller (`BG_JOB_MQ_TYPE=DB`, `BG_JOB_POLLER_ENABLED=true` — already set in overlay ConfigMaps).

`DW_SQL_DUMP_FILES_DIR` must point to a directory on **OCI shared file storage**, not ephemeral container disk, so that:

- Dump files survive pod restarts and rolling deploys
- Generate (background job) and GET (download) always read/write the same path in the same pod

On OKE, shared storage is typically **OCI File Storage Service (FSS)** — an NFS export mounted into the pod with the OCI CSI driver (`fss.csi.oraclecloud.com`) via a `PersistentVolume` / `PersistentVolumeClaim` and a `volumeMount` on the `dfa-v6-api` container. The base deployment (`oci_k8s/base/deployment.yaml`) does not define that mount today; it is configured at cluster/infra level and should be added per environment (same pattern as other on-disk app data such as `PUBLISH_MOBILE_FILES_DIR` for mobile publish ZIPs).

Example overlay settings once FSS is mounted at `/app/files/sql_dump` inside the pod:

```yaml
# oci_k8s/overlays/<adaptation>/env-config.yaml
DW_SQL_DUMP_FILES_DIR: "/app/files/sql_dump"
```

Ensure the mount path exists and is writable by the container user. Dumps are stored flat in that directory as `dw_{dw_name}.sql.gz`.

**Verify `mysqldump`** (run on the host or in the container that runs the API poller):

```bash
which mysqldump && mysqldump --version
```

If missing, the dump job fails with `mysqldump not found on PATH`.

**Install on Linux** (pick the client package that matches your distro):

| Distro | Install |
|--------|---------|
| Debian / Ubuntu | `sudo apt-get update && sudo apt-get install -y default-mysql-client` |
| RHEL / CentOS / Amazon Linux | `sudo yum install -y mysql` (or `mariadb`) |
| Alpine | `apk add --no-cache mariadb-client` |

`mysqldump` comes from the MySQL/MariaDB **client** package (not the server).

**Docker / Kubernetes:** The Dockerfile installs `default-mysql-client` in the runtime image. For local Docker Compose, dumps use `./files/sql_dump` on the mounted project directory unless you override `DW_SQL_DUMP_FILES_DIR`. On OKE, mount OCI FSS as described above — do not rely on the container filesystem alone.

After installing or changing `PATH`, restart the API process so `shutil.which()` picks up `mysqldump`.

**Windows (local dev):** Add MySQL/WAMP `bin` (for `mysqldump`) to your user `PATH`, then open a new terminal and re-run the verify command above.

## 9. Running with Docker

Copy `.env.example` to `.env` in the project root and set at least `DB_PASSWORD` (or leave empty for dev).

```bash
cp .env.example .env
docker compose up -d
```

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Build (if needed), start API + MySQL + Redis in background |
| `docker compose down` | Stop and remove containers |
| `docker compose logs -f api` | Follow API logs |
| `docker compose ps` | List running services |

**URLs:** API http://localhost:8000 · Docs http://localhost:8000/docs

Code is mounted into the container and uvicorn runs with `--reload`, so **code changes apply automatically** (no rebuild). To use a different env file: `ENV_FILE=/path/to/.env docker compose up -d`

## 10. Troubleshooting

### Port Already in Use

**Windows:**
```bash
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**macOS / Linux:**
```bash
lsof -i :8000
kill -9 <PID>
```

### Database Connection Issues

- Verify database is running
- Check `DATABASE_URL` in root `.env` file
- Check app-specific `.env` files if using separate databases
- Ensure database exists and credentials are correct

## 11. Running Tests

Tests are app-specific. Each app has its own `tests/` folder. Run them from each app's directory:

**App DB (Core) Tests:**
```bash
pytest apps/app_db/tests/
```

**Data Warehouse App Tests:**
```bash
pytest apps/datawarehouse/tests/
```

**Run All Tests:**
```bash
pytest apps/
```

## 12. Seeding Data

By default, seed scripts **only insert new records** and **skip existing ones** (they do not update or overwrite). This way, any changes you make to seeded data are preserved when you re-run seeds (e.g. after a site update). Use `--force` when you explicitly want to reset data to the seed state (wipe + insert).

### App DB (Core): Seed configuration (`seed_configuration.py`)

Seeds `system_configurations` from `apps/app_db/data/config.json`. Default: insert-only (existing keys are left unchanged).

```bash
# Seed ALL app_keys defined in apps/app_db/data/config.json
python apps/app_db/scripts/seed_configuration.py

# Seed a single app_key
python apps/app_db/scripts/seed_configuration.py --app_key DTK_VIZ

# Dry run (prints what would change, no DB writes)
python apps/app_db/scripts/seed_configuration.py --dry-run
python apps/app_db/scripts/seed_configuration.py --app_key DTK_VIZ --dry-run

# Force mode (wipe + insert) for the target app_key(s) — resets to seed state
python apps/app_db/scripts/seed_configuration.py --app_key DTK_VIZ --force

# Create app if missing (requires --app-name for a friendly name)
python apps/app_db/scripts/seed_configuration.py --app_key DTK_VIZ --create-app --app-name "DFA Visualizer"
```

### App DB (Core): Seed translations (`seed_translations.py`)

Seeds `system_language_translations` and `system_language_translations_i18n` from `apps/app_db/data/translations.json`. Default: insert-only (existing codes/locales are left unchanged).

```bash
# Seed ALL app_keys defined in apps/app_db/data/translations.json
python apps/app_db/scripts/seed_translations.py

# Seed a single app_key
python apps/app_db/scripts/seed_translations.py --app_key DTK_VIZ

# Dry run (prints what would be done, no DB writes)
python apps/app_db/scripts/seed_translations.py --dry-run
python apps/app_db/scripts/seed_translations.py --app_key DTK_VIZ --dry-run

# Force mode (wipe + insert) for the target app_key — resets to seed state
python apps/app_db/scripts/seed_translations.py --app_key DTK_VIZ --force

# Create app if missing
python apps/app_db/scripts/seed_translations.py --app_key DTK_VIZ --create-app --app-name "DFA Visualizer"

# Seed only certain locale(s) (repeatable or comma-separated)
python apps/app_db/scripts/seed_translations.py --app_key DTK_VIZ --locale hi
python apps/app_db/scripts/seed_translations.py --app_key DTK_VIZ --locale en,hi

# Seed "global" translations (top-level key "" in translations.json) with app_id = NULL
# Windows (PowerShell/CMD) reliably passes empty string via equals:
python apps/app_db/scripts/seed_translations.py --app_key=
```

### Data Warehouse: Seed test data

To seed test data in a data warehouse:

```bash
python apps/datawarehouse/scripts/seed_test_data.py <warehouse_id> [language_code]
```

**Examples:**
```bash
# Using warehouse ID
python apps/datawarehouse/scripts/seed_test_data.py 1 en

# Using database name
python apps/datawarehouse/scripts/seed_test_data.py new_data_warehouse fr
```

**Note:** The warehouse must exist in the `system_datawarehouse` table (created via core app API).

### Data Warehouse: Testing the Data API

To prepare all data required to test `GET /dw/{dw_id}/data` (filters, pagination, meta, locale, numeric and textual values), run:

```bash
python apps/datawarehouse/scripts/seed_data_api_test_data.py <warehouse_id> [language_code]
```

This seeds units, subgroup values, indicators, IUS (with default and non-default), areas (`ut_area_<locale>`), time periods (`ut_timeperiod`), and `ut_data` (including textual rows in `ut_data_<locale>`). The script prints suggested API calls for:

| Scenario | Example |
|----------|---------|
| Indicator only (default IUS) | `?i_nid=1` or `?i_gid=IND_GID_001` |
| Explicit IUS | `?ius_nid=1` or `?ius_gid=IND_GID_001\|UNIT_PERCENTAGE_001\|SG_VAL_TOTAL_001` |
| Area / time period | `?ar_id=AREA_01`, `?tp_timeperiod=2024` |
| Pagination | `?page=2&limit=5` |
| Meta flags | `?i_info=true&u_info=true&sv_info=true&ius_info=true&tp_info=true&ar_info=true` |
| Locale | `Accept-Language: en` or `?locale=en` |

## 13. Data warehouse search index

**When this applies:** Do this section **only if the DFA Visualizer** (or another client that uses the DW search API) **is part of your setup.** If you are not running the Visualizer and nothing in your stack calls the search endpoints, you can **skip** creating search tables and running the index builder.

The **Search Index Builder** populates DW-side search tables (`search_keywords`, `search_keyword_synonym`, `search_keyword_ngram`) from UT tables so the Search API (e.g. `GET /api/v1/{dw_id}/search`) returns results. It is run as a script or scheduled job, not as a standalone HTTP service.

**Prerequisites:** Search tables must exist **before** you populate them. Create tables first, then run the index builder; running the builder first will fail.

### New warehouse (created via API)

When you create a warehouse with `POST /dw/`, the main schema and the three search tables are created. You only need to **populate** the search index:

```bash
# By database URL
python -m apps.datawarehouse.scripts.build_search_index --url "mysql+mysqlconnector://user:pass@host:3306/your_db"

# Or by dw_id (if the warehouse is in system_datawarehouse)
python -m apps.datawarehouse.scripts.build_search_index --dw-id 1
# or: --dw-id your_db_name
```

After this, the Search API works for that `dw_id`.

### Existing database (search tables not created yet)

For an **existing** DW database that does not have the search tables:

**Step 1 – Create the three search tables (idempotent):**

```bash
# By database URL
python -m apps.datawarehouse.scripts.create_search_tables --url "mysql+mysqlconnector://user:pass@host:3306/your_db"

# Or by dw_id (if the warehouse is registered in system_datawarehouse)
python -m apps.datawarehouse.scripts.create_search_tables --dw-id 1
# or: --dw-id your_db_name
```

**Step 2 – Populate the search tables from UT data:**

```bash
# Same URL or dw_id as above
python -m apps.datawarehouse.scripts.build_search_index --url "mysql+mysqlconnector://user:pass@host:3306/your_db"
# or: --dw-id 1
```

The index builder reads from `ut_language`, `ut_indicator_*`, `ut_area_*`, `ut_subgroup_vals_*`, and `ut_timeperiod`. Ensure those UT tables exist and have data.

### Summary

| Scenario | Create search tables | Populate search data |
|----------|----------------------|----------------------|
| New warehouse (API) | Done by `POST /dw/` | `build_search_index --url ...` or `--dw-id` |
| Existing DB | `create_search_tables --url ...` or `--dw-id` | `build_search_index --url ...` or `--dw-id` |

**Optional flags for `build_search_index`:** `--batch-size` (default 1000), `--no-commit` (caller manages transactions).

For architecture, data mapping, and incremental updates, see [docs/SEARCH_INDEX_SERVICE.md](docs/SEARCH_INDEX_SERVICE.md).