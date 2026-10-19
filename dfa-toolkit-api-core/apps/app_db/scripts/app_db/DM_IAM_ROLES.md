# DFA Data Manager — IAM Roles & Resource Permissions

Seeded by `seed_iam.py` (system roles) and `seed_dm_iam_roles.py` (DM-specific roles).  
App key: **DFA_DM** (`DFA_DM_APP_KEY`).

---

## Role Index

| Role Code | Display Name | Type | Description |
|---|---|---|---|
| `DFA_DM_SUPERADMIN` | DM Super Admin | System | Full unrestricted access — bypasses all IAM checks |
| `DFA_DM_ADMIN` | Administrator | System | Full DW + template + data management + role/user management |
| `DFA_DM_TEMPLATE_ADMIN` | Template Admin | System | Template module (indicators, units, subgroups, classifications, areas) + reports |
| `DFA_DM_DATA_ENTRY_ADMIN` | Data Entry Admin | System | Data management module (sources, data, time periods, calculate IUS) + reports |
| `DFA_DM_AUTHENTICATED` | SSO Authenticated User | System | **Single SSO role for DFA_DM + DFA_VIZ.** DM: template READ + time period/sources READ + reports R. VIZ: gallery CRUD + reports R. Replaces `DFA_PUBLIC`. |

---

## DFA_DM_SUPERADMIN

**Super-admin flag is set (`is_super_admin = 1`).** At runtime the middleware grants access to every route unconditionally — no `iam_role_resource_api` rows are evaluated.

---

## DFA_DM_ADMIN

Full scope across all DW modules plus role and user management.

### IAM & System

| Resource | Display Name | C | R | U | D |
|---|---|:---:|:---:|:---:|:---:|
| `sys_role_resource` | Roles | ✓ | ✓ | ✓ | ✓ |
| `sys_user_role` | Users | ✓ | ✓ | ✓ | ✓ |

### Template Module (`dm_dw_template_admin` subtree)

| Resource | Display Name | C | R | U | D |
|---|---|:---:|:---:|:---:|:---:|
| `dm_dw_indicator` | Indicators | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_unit` | Units | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_subgroup` | Subgroups | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_indicator_classification` | Classifications | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_area` | Areas | ✓ | ✓ | ✓ | ✓ |

### Data Management Module (`dm_dw_data_entry_admin` subtree)

| Resource | Display Name | C | R | U | D |
|---|---|:---:|:---:|:---:|:---:|
| `dm_dw_data_entry` | Data Entry | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_timeperiod` | Time Period | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_data_source` | Sources | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_calculate_ius` | Calculate IUS | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_data_review` | Data Review | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_reports` | Reports | — | ✓ | — | — |

### Administration Module (`dm_dw_administrator` subtree)

| Resource | Display Name | C | R | U | D |
|---|---|:---:|:---:|:---:|:---:|
| `dm_dw_workflow` | Workflow | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_languages` | Languages | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_data_admin_maintenance` | Tools | ✓ | ✓ | ✓ | ✓ |

> **R column** = PERMISSION-level GET APIs. AUTHENTICATED-level GETs are accessible to any logged-in user without a role grant.

---

## DFA_DM_TEMPLATE_ADMIN

Manages the template layer (dimensions) and can read all reports.

### Template Module (`dm_dw_template_admin` subtree)

| Resource | Display Name | C | R | U | D |
|---|---|:---:|:---:|:---:|:---:|
| `dm_dw_indicator` | Indicators | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_unit` | Units | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_subgroup` | Subgroups | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_indicator_classification` | Classifications | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_area` | Areas | ✓ | ✓ | ✓ | ✓ |

### Reports

| Resource | Display Name | Quality (PERM GET) | Analytics (AUTH GET) |
|---|---|:---:|:---:|
| `dm_dw_reports` | Reports | ✓ | ✓ |

### Additional

| Resource | Access |
|---|---|
| `sys_datawarehouse` | PERMISSION GET (list/get warehouses, dbmetadata) |

> Does **not** have access to: `dm_dw_data_entry`, `dm_dw_timeperiod`, `dm_dw_data_source`, `dm_dw_data_review`, `dm_dw_calculate_ius`.

---

## DFA_DM_DATA_ENTRY_ADMIN

Manages data ingestion, time periods, sources, and calculated IUS. Can read all reports. Cannot review datasets (reviewer role is separate).

### Data Management Module (`dm_dw_data_entry_admin` subtree, excluding `dm_dw_data_review`)

| Resource | Display Name | C | R | U | D |
|---|---|:---:|:---:|:---:|:---:|
| `dm_dw_data_entry` | Data Entry | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_timeperiod` | Time Period | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_data_source` | Sources | ✓ | ✓ | ✓ | ✓ |
| `dm_dw_calculate_ius` | Calculate IUS | ✓ | ✓ | ✓ | ✓ |

### Reports

| Resource | Display Name | Quality (PERM GET) | Analytics (AUTH GET) |
|---|---|:---:|:---:|
| `dm_dw_reports` | Reports | ✓ | ✓ |

### Additional

| Resource | Access |
|---|---|
| `sys_datawarehouse` | PERMISSION GET (list/get warehouses, dbmetadata) |

> Does **not** have access to: `dm_dw_data_review`, `dm_dw_indicator`, `dm_dw_unit`, `dm_dw_subgroup`, `dm_dw_indicator_classification`, `dm_dw_area`.

---

## DFA_DM_AUTHENTICATED (SSO Authenticated User)

**Single SSO role for both DFA_DM and DFA_VIZ FED applications.** Replaces `DFA_PUBLIC` for VIZ SSO users. A user assigned this role needs two `iam_user_role` rows — one per app:

```
(user_id, app_key=DFA_DM, role_id=<id>, dw_id=<warehouse>)
(user_id, app_key=DFA_VIZ, role_id=<id>, dw_id=NULL)
```

The `iam_role_resource_api` table carries grants for **both** app keys under the same role_id.

---

### DFA_DM Grants

#### Template Module — Read Only

| Resource | Display Name | C | R | U | D |
|---|---|:---:|:---:|:---:|:---:|
| `dm_dw_indicator` | Indicators | — | ✓ | — | — |
| `dm_dw_unit` | Units | — | ✓ | — | — |
| `dm_dw_subgroup` | Subgroups | — | ✓ | — | — |
| `dm_dw_indicator_classification` | Classifications | — | ✓ | — | — |
| `dm_dw_area` | Areas | — | ✓ | — | — |

#### Data Management — Read Only (Time Period & Sources)

| Resource | Display Name | C | R | U | D |
|---|---|:---:|:---:|:---:|:---:|
| `dm_dw_timeperiod` | Time Period | — | ✓ | — | — |
| `dm_dw_data_source` | Sources | — | ✓ | — | — |

#### Reports (DM) — Read Access

| Resource | Quality (PERM GET) |
|---|:---:|
| `dm_dw_reports` | ✓ |

> Most list/detail GETs for template and data management resources are `AUTHENTICATED` level — any logged-in user already reads them. PERMISSION-level GETs (where they exist) are granted here. No write access (CREATE/UPDATE/DELETE) is granted.

---

### DFA_VIZ Grants  *(replaces DFA_PUBLIC)*

| Resource | Display Name | C | R | U | D | Notes |
|---|---|:---:|:---:|:---:|:---:|---|
| `viz_gallery` | Gallery | ✓ | ✓ | ✓ | ✓ | AUTHENTICATED APIs — UI visibility |
| `dm_dw_reports` | Reports (quality) | — | ✓ | — | — | PERMISSION GETs — IAM check required |
| `dm_dw_reports` | Reports (analytics) | — | ✓ | — | — | AUTHENTICATED GETs — UI visibility |

> Does **not** have DM access to: `dm_dw_data_entry`, `dm_dw_data_review`, `dm_dw_calculate_ius`, `dm_dw_workflow`, `dm_dw_languages`, `sys_role_resource`, `sys_user_role`.

---

## Permission Key

| Symbol | Meaning |
|---|---|
| ✓ | Granted via `iam_role_resource_api` |
| — | Not granted (either not applicable or accessible at a lower access level without a role grant) |
| C | CREATE — POST endpoints |
| R | READ — GET endpoints at PERMISSION access level |
| U | UPDATE — PUT / PATCH endpoints |
| D | DELETE — DELETE + bulk-delete POST endpoints |

---

## Seed Commands

```bash
# Run from project root

# Step 1 — seed base resources, resource APIs, system roles
python apps/app_db/scripts/seed_iam.py

# Step 2 — seed DM-specific roles and their resource-API mappings
python apps/app_db/scripts/seed_dm_iam_roles.py

# Use --force to re-apply to already-seeded rows (e.g. after permission changes)
python apps/app_db/scripts/seed_dm_iam_roles.py --force

# Use --dry-run to preview without writing
python apps/app_db/scripts/seed_dm_iam_roles.py --dry-run
```
