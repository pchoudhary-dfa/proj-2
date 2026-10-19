# DFA Dashboard Integration Plan (`app_dashboard`)

## Context

The dfa-toolkit-api previously absorbed `dfa_datamanager_v5` (CakePHP). The same exercise is now being done for `dfa_dashboard_v5` (also CakePHP 4.x), which manages dashboards, visualizations, embed sharing, and AI-powered chart insights. The goal is to port its tables and API domains into the existing FastAPI toolkit as a new `apps/app_dashboard/` module — reusing as many existing tables and infrastructure as possible.

---

## Established Convention for All New Modules

This pattern applies to every new module (`app_dashboard`, `app_viz`, `app_compute`, etc.):

| Concern | Location |
|---|---|
| Models, router, services, schemas | `apps/app_<module>/` (code only — no migrations or scripts) |
| DB migrations | `apps/app_db/migrations/versions/NNN_<module>_*.py` (continue linear chain) |
| Seed scripts | `apps/app_db/scripts/app_<module>/` (subfolder per module) |
| Seed registration | Add entries to `seed_all.py` `_SEEDERS` list in dependency order |

---

## Architecture: Shared Migrations & Seeds in `apps/app_db/`

`apps/app_db/migrations/` and `apps/app_db/scripts/` are the **shared infrastructure layer** for the central app_db MySQL database. Every table that lives in that database — regardless of which code module defines it — belongs there.

The `datawarehouse` module has its own separate Alembic setup **only because it connects to a different database** (one per warehouse). Dashboard tables connect to the same database as app_db, so there is no justification for a separate setup.

**`apps/app_dashboard/` is a code-only module: models, router, services, schemas. No migrations folder. No scripts folder.**

```
apps/
├── app_db/                             ← shared DB infrastructure layer
│   ├── migrations/
│   │   ├── alembic.ini                 ← unchanged
│   │   ├── env.py                      ← ADD: import app_dashboard models
│   │   └── versions/
│   │       ├── 001 → 099               ← existing migrations (untouched)
│   │       ├── 100_dash_core.py        ← dashboard migrations continue here
│   │       └── ... 105_dash_indexes.py
│   └── scripts/
│       ├── seed_all.py                 ← single orchestrator for ALL modules
│       ├── app_db/                     ← existing seeds MOVED here
│       │   ├── seed_system_language.py
│       │   ├── seed_applications.py
│       │   ├── seed_application_clients.py
│       │   ├── seed_configuration.py
│       │   ├── seed_translations.py
│       │   ├── seed_iam.py
│       │   ├── seed_dm_iam_roles.py
│       │   ├── seed_monitoring_api.py
│       │   ├── seed_data_dictionary.py
│       │   ├── seed_dataset_rejection_reasons.py
│       │   └── seed_help_adaptations.py
│       ├── app_dashboard/              ← dashboard seeds (DFA_DASH)
│       │   ├── seed_dash_iam.py
│       │   ├── seed_dash_iam_roles.py
│       │   └── seed_dash_app_client.py
│       └── app_viz/                    ← viz seeds (DFA_VIZ) — same pattern, future
│           ├── seed_viz_iam.py
│           ├── seed_viz_iam_roles.py
│           └── seed_viz_app_client.py
│
├── app_dashboard/                      ← code only (no migrations/ or scripts/)
│   ├── models/dashboard.py
│   ├── router/
│   │   ├── api.py
│   │   ├── dashboards.py
│   │   ├── sections.py
│   │   ├── visualizations.py
│   │   ├── header_footers.py
│   │   ├── embed_vos.py
│   │   ├── user_areas.py
│   │   └── analyses.py
│   ├── services/
│   │   ├── dashboard_service.py
│   │   ├── visualization_service.py
│   │   ├── section_service.py
│   │   ├── header_footer_service.py
│   │   ├── embed_vo_service.py
│   │   ├── user_area_service.py
│   │   └── analysis_service.py
│   └── schemas/
│       └── dashboard.py
│
├── datawarehouse/
│   ├── migrations/                     ← unchanged — different DB, stays separate
│   └── ...
└── shared/
```

### `alembic_version` — always 1 row

Dashboard migrations are a direct continuation of the app_db chain. The version pointer simply advances:

```
001 → 002 → ... → 099 → 100_dash_core → 101 → ... → 105_dash_indexes
```

```
alembic_version
┌──────────────────────────────┐
│ version_num                  │
├──────────────────────────────┤
│ 105_dash_indexes             │  ← single row, updated on each upgrade
└──────────────────────────────┘
```

### Only change needed in `env.py`

```python
# apps/app_db/migrations/env.py — add one line
from apps.app_db.models import *        # existing
from apps.app_dashboard.models import * # ← add: dashboard tables in same DB
```

No `version_locations`, no `include_name` filter, no separate `alembic.ini`. Migration numbering continues from `100_`.

Migration file naming: `NNN_slug.py`. Revision IDs ≤ 32 characters.

### Commands

```bash
# Apply all migrations (app_db + dashboard in one chain)
cd apps/app_db && alembic upgrade head

# Roll back one step (works across modules naturally)
cd apps/app_db && alembic downgrade -1

# Roll back all dashboard migrations
cd apps/app_db && alembic downgrade 099_sso_logout_cols
```

---

## Core Table Reuse Analysis

Many CakePHP tables map directly to existing toolkit tables. **These do NOT need to be recreated.**

### Tables Already Covered — Use As-Is

| CakePHP Table | Existing Toolkit Table | Notes |
|---|---|---|
| `users` | `iam_user` | Full user management already in place |
| `roles` (Admin/Editor/Viewer) | `iam_role` | Seeded with `app_key='DFA_DASH'` |
| `m_languages` | `system_language` | Already stores locale registry |
| `m_transaction_logs` | `logs_transaction` | Audit trail for all entities |
| `m_user_audits` (login tracking) | `logs_transaction` | Login events logged as `action='LOGIN'` |
| `m_system_configs` | `system_configuration` | Key-value store, scoped with `app_key='DFA_DASH'` |
| Embed/share URLs | `system_share_link` | Already has short-code URL sharing |

### Tables Partially Reused

| CakePHP Concept | Toolkit Equivalent | How |
|---|---|---|
| `r_dashboard_users` (per-dashboard ACL) | `iam_user_role` + `iam_user_role_content` | `iam_user_role.dashboard_id` scopes membership; `iam_user_role_content` with `resource_code=dash_user_areas` stores area nids |

| Dashboard DB references | `system_datawarehouse` | `m_dashboards.system_dw_id FK → system_datawarehouse.id`; frontend uses existing `/dw` endpoints to list/select — no separate database router needed |
| Visualization storage + CRUD | `system_gallery` + `GalleryService` | `GalleryService.add_gallery/update_gallery/delete_gallery/list_gallery` reused directly; pass `app_key="DFA_DASH"` to scope items — zero new CRUD code. `r_dashboard_gallery` only stores layout placement (section, position, size) |
| Dashboard templates | `system_gallery` with `item_cat='TEMPLATE'` | Templates are a type of saved layout; use `system_gallery` with a type discriminator |
| Header/footer themes | `system_configuration` | Stored as scoped config keys with `app_key='DFA_DASH'` |

### Net-New Tables (8 tables, down from 17 in original CakePHP)

| Python Model | Table Name | Reason Needed |
|---|---|---|
| `Dashboard` | `m_dashboards` | Dashboard metadata: colors, layout config, publish state, AI settings |
| `DashboardSection` | `m_dashboard_sections` | Dashboard layout sections |
| `DashboardGallery` | `r_dashboard_gallery` | Join: places `system_gallery` items on dashboard sections with position/size |
| `VisualizationAnalysis` | `m_analyses` | AI analysis cache per gallery_id + area combo |
| `Artifact` | `m_artifacts` | Binary file attachments (logos, images) |
| `DashboardUpload` | `m_uploads` | Upload tracking with status |
| `EmbedVo` | `m_embed_vos` | Embed-specific tracking (counter, blocking) |
| `EmbedVoOwner` | `m_embed_vo_owners` | Per-IP embed tracking |
| `EmbedVoOwnerWebsite` | `m_embed_vo_owner_websites` | Per-domain embed tracking |

**Eliminated from original plan:**
- `DashboardTemplate` → `system_gallery` with `item_cat='TEMPLATE'`
- `Visualization` / `VisualizationProvider` → `system_gallery` + `GalleryService`
- `DashDatabase` → `system_datawarehouse` via `system_dw_id FK`; existing `/dw` endpoints used
- `DashboardUserRole` → `iam_user_role` + `iam_user_role_content`
- `UserAudit` → `logs_transaction`
- `HeaderFooter` → `system_configuration`

### Model Specifications

**`Dashboard` (`m_dashboards`):**
- `id`, `dashboardgid UNIQUE`, `dashboardname`, `dashboardtitle`, `dashboardversion`
- `system_dw_id nullable FK → system_datawarehouse.id`
- `type`, `mode`, `bodycolor`, `bannercolor`, `titlecolor`, `resolution`
- `bannerlogo`, `favicon`, `logoid`
- `sectionSettings TEXT`, `globalcss TEXT`, `settings TEXT` (JSON)
- `headerHtml TEXT`, `footerHtml TEXT`
- `arealvlfrom`, `arealvlto`, `defareaid TEXT`, `langSelected TEXT`
- `is_private SMALLINT default=0`, `is_published SMALLINT default=0`
  - Public publish viewer (`is_private=0`): `GET /dash/viewer-bundle/{title}` with APP_CLIENT only
  - Private publish viewer (`is_private=1`): same endpoint, after title resolve; requires Bearer JWT whose user has `iam_user_role.dashboard_id = source_dash_id` (edit allowlist). Otherwise **403** `DASHBOARD_PRIVATE_ACCESS_DENIED`
- `enable_insights BOOLEAN default=False`, `ai_settings TEXT` (JSON, encrypted)
- `sourcedashid nullable FK → m_dashboards.id`
- `created`, `modified`, `modifiedby`

**`DashboardSection` (`m_dashboard_sections`):**
- `id`, `sectionname`, `dashboardid FK → m_dashboards.id`
- `hideGlobalFilter SMALLINT default=0`, `order INT`, `reloadSection SMALLINT default=0`
- `resolution`, `created`, `modified`, `modifiedby`

**`DashboardGallery` (`r_dashboard_gallery`):**
- `id`, `dashboardid FK → m_dashboards.id`
- `gallery_id FK → system_gallery.id`
- `section_id nullable FK → m_dashboard_sections.id`
- `position_x`, `position_y`, `width`, `height`, `order`
- `vis_settings TEXT` (JSON — position-specific overrides)
- `created`, `modified`, `modifiedby`

**`VisualizationAnalysis` (`m_analyses`):**
- `id`, `gallery_id FK → system_gallery.id`
- `areaid VARCHAR(60)`, `analysis LONGTEXT`
- `created`, `modified`, `modifiedby`

**`Artifact` (`m_artifacts`):**
- `id`, `binaryobj LONGTEXT`, `type`, `filename`, `fileext`
- `filesize`, `filewidth`, `fileheight`
- `created`, `modified`, `modifiedby`

**`DashboardUpload` (`m_uploads`):**
- `id`, `filename`, `filepath`, `filetype`, `filesize`
- `user_id FK → iam_user.id`, `status`
- `created`, `modified`

**`EmbedVo` (`m_embed_vos`):**
- `id`, `gallery_id FK → system_gallery.id`
- `counter INT default=0`, `isdeleted SMALLINT default=0`
- `created`, `modified`, `modifiedby`

**`EmbedVoOwner` (`m_embed_vo_owners`):**
- `id`, `embedvoid FK → m_embed_vos.id`
- `ipaddress`, `counter INT default=0`, `isblocked SMALLINT default=0`
- `created`, `modified`

**`EmbedVoOwnerWebsite` (`m_embed_vo_owner_websites`):**
- `id`, `embedvoownerid FK → m_embed_vo_owners.id`
- `websiteurl TEXT`, `counter INT default=0`
- `created`, `modified`

**Security:** `Dashboard.ai_settings` (contains API key) encrypted with `apps/shared/utils/password_encryption.py`. `ai_api_key` redacted to `"***"` in API responses.

---

## Migration Sequence (`apps/app_db/migrations/versions/`)

Continues from `099_sso_logout_cols`. Each migration's `down_revision` points to the previous.

| # | Revision ID | Tables | `down_revision` |
|---|---|---|---|
| 100 | `100_dash_core` | `m_dashboards`, `m_dashboard_sections` | `099_sso_logout_cols` |
| 101 | `101_dash_gallery_link` | `r_dashboard_gallery` | `100_dash_core` |
| 102 | `102_dash_analyses` | `m_analyses` | `101_dash_gallery_link` |
| 103 | `103_dash_artifacts` | `m_artifacts`, `m_uploads` | `102_dash_analyses` |
| 104 | `104_dash_embed` | `m_embed_vos`, `m_embed_vo_owners`, `m_embed_vo_owner_websites` | `103_dash_artifacts` |
| 105 | `105_dash_indexes` | Indexes on all FK columns + unique constraint on `m_dashboards.dashboardgid` | `104_dash_embed` |

All migrations idempotent: check `inspect(op.get_bind()).get_table_names()` before `create_table`.
Pattern to follow: `apps/app_db/migrations/versions/099_sso_logout_cols.py`

---

## REST Endpoints

### `dashboards.py` (`/dash`)
| Method | Path | Access |
|---|---|---|
| GET | `/dash` | AUTHENTICATED |
| POST | `/dash` | PERMISSION |
| GET | `/dash/viewer-bundle/{dashboard_title}` | APP_CLIENT (+ JWT allowlist if `is_private`) |
| GET | `/dash/{dashboard_id}` | APP_CLIENT |
| PATCH | `/dash/{dashboard_id}` | PERMISSION |
| DELETE | `/dash/{dashboard_id}` | PERMISSION |
| POST | `/dash/{dashboard_id}/clone` | PERMISSION |
| POST | `/dash/{dashboard_id}/publish` | PERMISSION |

### `sections.py` (`/dash/{dashboard_id}/sections`)
| Method | Path | Access |
|---|---|---|
| GET | `/dash/{dashboard_id}/sections` | APP_CLIENT |
| POST | `/dash/{dashboard_id}/sections` | PERMISSION |
| PATCH | `/dash/{dashboard_id}/sections/{section_id}` | PERMISSION |
| DELETE | `/dash/{dashboard_id}/sections/{section_id}` | PERMISSION |
| PUT | `/dash/{dashboard_id}/sections/bulk` | PERMISSION |

### `visualizations.py` — backed by `system_gallery` + `r_dashboard_gallery`
| Method | Path | Access |
|---|---|---|
| GET | `/dash/{dashboard_id}/vis` | APP_CLIENT |
| GET | `/dash/vis/{gallery_id}` | APP_CLIENT |
| POST | `/dash/vis` | PERMISSION |
| PATCH | `/dash/vis/{gallery_id}` | PERMISSION |
| DELETE | `/dash/vis/{gallery_id}` | PERMISSION |
| PATCH | `/dash/{dashboard_id}/vis/{gallery_id}/layout` | PERMISSION |

### Databases — NOT a new router
Use existing `/dw` endpoints (`apps/app_db/router/datawarehouse.py`) directly. Dashboard links to a warehouse via `m_dashboards.system_dw_id FK → system_datawarehouse.id`.

### `header_footers.py` (`/dash/themes`)
| Method | Path | Access |
|---|---|---|
| GET | `/dash/themes` | AUTHENTICATED |
| POST | `/dash/themes` | PERMISSION |
| PATCH | `/dash/themes/{theme_id}` | PERMISSION |
| DELETE | `/dash/themes/{theme_id}` | PERMISSION |

### `embed_vos.py` (`/dash/embed`)
| Method | Path | Access |
|---|---|---|
| GET | `/dash/embed/{gallery_id}` | APP_CLIENT |
| POST | `/dash/embed/validate` | PUBLIC |
| PATCH | `/dash/embed/{embed_id}/track` | PUBLIC |

### `users.py` (`/dash/{dashboard_id}/users`)
| Method | Path | Access |
|---|---|---|
| GET | `/dash/{dashboard_id}/users` | PERMISSION |
| DELETE | `/dash/{dashboard_id}/users/{user_id}` | PERMISSION |

Assign / update membership + role + areas via existing IAM:

`PUT /iam/users/{user_id}/roles` with `data.dashboard_id` and optional
`content_restrictions` (`resource_code=dash_user_areas`, `content_ids` = area nids).
When `dashboard_id` is set, it must exist and be an edit-mode dashboard (`mode=edit`).
When `dashboard_id` is omitted, only non-dashboard (`dashboard_id IS NULL`) assignments are replaced.

### `analyses.py`
| Method | Path | Access |
|---|---|---|
| GET | `/dash/analyses` | APP_CLIENT |
| POST | `/dash/analyses` | AUTHENTICATED |
| POST | `/dash/{dashboard_id}/vis/{gallery_id}/ai-analyze` | AUTHENTICATED |

`ai-analyze` supports `?stream=true` for SSE streaming response.

---

## Services

| Service | Responsibility |
|---|---|
| `dashboard_service.py` | `m_dashboards` CRUD, clone, publish, get_ai_details |
| `visualization_service.py` | **Thin orchestrator** — delegates content CRUD to existing `GalleryService(app_key="DFA_DASH")`; only new code is `r_dashboard_gallery` placement methods (`add_to_dashboard`, `remove_from_dashboard`, `update_layout`) |
| `section_service.py` | `m_dashboard_sections` CRUD + bulk update |
| `header_footer_service.py` | `system_configuration` CRUD scoped to `app_key='DFA_DASH'` |
| `embed_vo_service.py` | `m_embed_vos` tracking (get embed ID, validate owner, track hit) |
| `user_area_service.py` | `iam_user_role` + `iam_user_role_content` for per-dashboard access |
| `analysis_service.py` | AI analysis — delegates to shared insights orchestrator |

All services: raise `NotFound`/`BadRequest`/`Conflict`/`Forbidden` from `apps.shared.exceptions`. Routes return `success_response()`, `created_response()`, `no_content_response()`.

### Gallery Reuse Pattern in `visualization_service.py`

```python
from apps.app_db.services.gallery_service import GalleryService

class VisualizationService:
    _gallery = GalleryService()

    def create_vo(self, dashboard_id, section_id, user_id, payload):
        # VO content — fully delegated to existing service, zero new code
        gallery_item = self._gallery.add_gallery(user_id, "DFA_DASH", payload)
        # VO placement — only new code
        self._add_to_dashboard(dashboard_id, section_id, gallery_item.id, payload.layout)
        return gallery_item

    def update_vo_content(self, gallery_id, user_id, payload):
        # fully delegated
        return self._gallery.update_gallery(gallery_id, user_id, "DFA_DASH", payload)

    def delete_vo(self, gallery_id, dashboard_id, user_id):
        self._remove_from_dashboard(dashboard_id, gallery_id)
        self._gallery.delete_gallery(gallery_id, user_id, "DFA_DASH")
```

---

## Seed Scripts

### Location: `apps/app_db/scripts/app_dashboard/`

Three new files, all following the pattern of `apps/app_db/scripts/app_db/seed_dm_iam_roles.py`.

**`seed_dash_iam.py`** — inserts `iam_resource` + `iam_resource_api` rows for all DFA_DASH endpoints.
Resources: `dash_dashboard`, `dash_vis`, `dash_section`, `dash_theme`, `dash_embed`, `dash_user_areas`, `dash_ai_analysis`

**`seed_dash_iam_roles.py`** — three roles for `app_key='DFA_DASH'`:
- `DFA_DASH_ADMIN` — full CRUD on all DFA_DASH resources
- `DFA_DASH_EDITOR` — C/R/U on dashboards + vis + sections; R only on themes
- `DFA_DASH_VIEWER` — R only

**`seed_dash_app_client.py`** — registers `DFA_DASH` federated client in `system_application_client` (auth_method=SIGNATURE, requires_user_auth=1). Reads `settings.DFA_DASH_FED_APP_API_KEY`.

### `seed_all.py` update — add 3 entries

```python
_SEEDERS: list[str] = [
    # app_db seeds
    "app_db/seed_system_language.py",
    "app_db/seed_applications.py",
    "app_db/seed_application_clients.py",
    "app_db/seed_configuration.py",
    "app_db/seed_translations.py",
    "app_db/seed_iam.py",
    "app_db/seed_dm_iam_roles.py",
    "app_db/seed_monitoring_api.py",
    "app_db/seed_data_dictionary.py",
    "app_db/seed_dataset_rejection_reasons.py",
    "app_db/seed_help_adaptations.py",
    # app_dashboard seeds — depends on app_db seeds above
    "app_dashboard/seed_dash_iam.py",
    "app_dashboard/seed_dash_iam_roles.py",
    "app_dashboard/seed_dash_app_client.py",
]
```

> **Note:** The 11 existing seed files must be moved from `apps/app_db/scripts/` → `apps/app_db/scripts/app_db/`. Any CI scripts referencing those paths directly need updating.

Full bootstrap — one command:
```bash
python apps/app_db/scripts/seed_all.py
python apps/app_db/scripts/seed_all.py --dry-run
python apps/app_db/scripts/seed_all.py --force
```

---

## AI Analysis Integration

`analysis_service.ai_analyze()`:
1. `dashboard_service.get_ai_details(dashboard_id)` → checks `enable_insights=True`, decrypts + extracts `{ai_provider, ai_api_key}` from `ai_settings`
2. Calls shared `PromptBuilder`, `PayloadSanitizer`, and OpenAI client from `apps.app_db.router.insights` — bypassing only the DW credential fetch step
3. Persists result to `m_analyses` (gallery_id + area_id → analysis text) as response cache
4. When `stream=true`: returns `StreamingResponse` with SSE using the same pattern as the existing insights endpoint

---

## `main.py` Changes

```python
from apps.app_dashboard.router.api import router as dashboard_router

# Add to tags_metadata list:
{"name": "Dashboard", "description": "DFA Dashboard management"},
{"name": "Dashboard - Visualizations", "description": "Visualization CRUD (backed by system_gallery)"},
{"name": "Dashboard - AI Analysis", "description": "AI chart insights for dashboards"},

app.include_router(dashboard_router, prefix="")
```

---

## Settings Changes

Add to `apps/shared/config/config.py`:
```python
DFA_DASH_FED_APP_API_KEY: str = ""
DFA_DASH_FED_APP_API_SECRET: str = ""
```
Document both in `.env.example`.

---

## Implementation Order

### Phase 1: Foundation
1. Create `apps/app_dashboard/` directory tree (`models/`, `router/`, `services/`, `schemas/`, `__init__.py` — no `migrations/` or `scripts/`)
2. Write `apps/app_dashboard/models/dashboard.py` (8 models + 1 join table)
3. Add one import to `apps/app_db/migrations/env.py`: `from apps.app_dashboard.models import *`
4. Write migrations `100` → `105` in `apps/app_db/migrations/versions/`; `100_dash_core` sets `down_revision = "099_sso_logout_cols"`
5. Run `cd apps/app_db && alembic upgrade head` — verify all migrations applied; `alembic_version` has **1 row**: `105_dash_indexes`

### Phase 2: Seed Reorganisation + Dashboard Seeds
6. Move existing 11 seed files → `apps/app_db/scripts/app_db/`
7. Update `seed_all.py` `_SEEDERS` list with `app_db/` prefixed paths; verify `seed_all.py` still runs cleanly
8. Write `apps/app_db/scripts/app_dashboard/seed_dash_iam.py`
9. Write `apps/app_db/scripts/app_dashboard/seed_dash_iam_roles.py`
10. Write `apps/app_db/scripts/app_dashboard/seed_dash_app_client.py`
11. Add `DFA_DASH_FED_APP_API_KEY` + `DFA_DASH_FED_APP_API_SECRET` to Settings + `.env.example`
12. Run `python apps/app_db/scripts/seed_all.py --dry-run` then `seed_all.py`

### Phase 3: Schemas
13. Write `apps/app_dashboard/schemas/dashboard.py`

### Phase 4: Services (in dependency order)
14. `section_service.py` — `m_dashboard_sections` CRUD
15. `visualization_service.py` — delegates to `GalleryService`; new code only for `r_dashboard_gallery` placement
16. `dashboard_service.py` — `m_dashboards` CRUD + clone + publish + `get_ai_details`
17. `header_footer_service.py` — `system_configuration` scoped to DFA_DASH
18. `embed_vo_service.py` — `m_embed_vos` tracking
19. `user_area_service.py` — `iam_user_role` + `iam_user_role_content`
20. `analysis_service.py` — AI analysis with shared insights orchestrator

### Phase 5: Routers + Registration
21. Write 7 router files + `apps/app_dashboard/router/api.py` aggregator
22. Update `main.py` (import + `include_router` + `tags_metadata`)
23. Start server; verify all new routes visible in `/docs`

### Phase 6: Verification
24. PUBLIC embed paths — no auth headers required
25. APP_CLIENT dashboard read — signature only, no JWT
26. PERMISSION write — JWT + DFA_DASH role
27. AI analysis `stream=false` and `stream=true`
28. `pytest apps/` — no regressions in existing tests

---

## Critical Files to Read Before Implementation

| File | Why |
|---|---|
| `apps/app_db/models/core.py` | `SystemGallery`, `IamUserRole`, `IamUserRoleContent`, `SystemShareLink` column definitions |
| `apps/app_db/services/gallery_service.py` | `GalleryService` methods to delegate to from `visualization_service.py` |
| `apps/app_db/migrations/versions/099_sso_logout_cols.py` | Migration pattern: idempotent guards, revision ID format |
| `apps/app_db/migrations/env.py` | Where to add `from apps.app_dashboard.models import *` |
| `apps/app_db/scripts/app_db/seed_dm_iam_roles.py` | Exact template for `seed_dash_iam_roles.py` |
| `apps/app_db/scripts/seed_all.py` | `_SEEDERS` list and `_run()` helper to understand subfolder resolution |
| `apps/app_db/router/insights.py` | Streaming response + PromptBuilder pattern for AI analysis |
| `apps/shared/utils/password_encryption.py` | Fernet encrypt/decrypt for `ai_settings` |
