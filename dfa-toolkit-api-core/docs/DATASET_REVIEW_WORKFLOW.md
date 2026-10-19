# Dataset & Review Workflow

## Table of Contents

1. [Overview](#overview)
2. [Operational Modes](#operational-modes)
3. [Personas](#personas)
4. [Database Schema](#database-schema) — incl. [`dataset_comment`](#dataset_comment)
5. [Status Lifecycles](#status-lifecycles)
6. [Workflow Configuration](#workflow-configuration)
7. [Data Entry Authorization — constraint_data_entry](#data-entry-authorization--constraint_data_entry)
8. [Data Exclusivity Rule](#data-exclusivity-rule)
9. [Dataset Scope & Seeding](#dataset-scope--seeding)
10. [Operator Flow — Full Walkthrough](#operator-flow--full-walkthrough)
11. [Reviewer Flow — Full Walkthrough](#reviewer-flow--full-walkthrough)
12. [Internal System Mechanics](#internal-system-mechanics)
13. [Use Cases](#use-cases)
14. [Edge Cases](#edge-cases)
15. [API Endpoint Reference](#api-endpoint-reference)
16. [Design Decisions & Validation Notes](#design-decisions--validation-notes)
17. [Implementation Checklist](#implementation-checklist)

---

## Overview

A **dataset** is a named container that groups data points (IUS + area + time period + value rows) submitted by a data entry operator under a specific workflow. The operational mode is determined entirely by two flags on the `review_workflow` record — `allow_review` and `constraint_data_entry`. There is no global system config toggle.

**FED always calls the same data-point endpoints** (`GET/PATCH/DELETE /dw/{dw_id}/data-points`) regardless of mode. The backend routes the request to `ut_data` directly or to `dataset_data_point` based on the workflow's `allow_review` flag.

**Core principle:** One active dataset per IUS+area+timeperiod combination at any given time. Exclusivity is enforced at dataset creation and scope-change time — not at submit time.

---

## Operational Modes

The mode is derived from two fields on `review_workflow`. No system config key is involved.

### Mode A — Direct (`allow_review = false`)

**Profile:** Operator writes directly to `ut_data`. No dataset record, no staging, no submit step. Data is live immediately on save.

`constraint_data_entry` still controls authorization:

| `constraint_data_entry` | Who can write |
|---|---|
| `false` (default) | Any user with the data entry IAM role — no area restriction |
| `true` | User must have a matching `iam_user_role_content` area assignment for this workflow |

**Write path:**

```
FED → PATCH /dw/{dw_id}/data-points  (workflow_id required, dataset_id absent)
         ↓ backend: allow_review=false → write directly to ut_data
         ↓ constraint_data_entry check applies
         ↓ data is live immediately

FED → DELETE /dw/{dw_id}/data-points  (same gate)
         ↓ backend: delete directly from ut_data

FED → GET /dw/{dw_id}/data-points  (workflow_id, no dataset_id)
         ↓ backend: read directly from ut_data
```

**Tables used:**

| Table | Used |
|---|---|
| `dataset` | ❌ Not created |
| `dataset_data_point` | ❌ Not used |
| `review_workflow` | ✅ Read for `allow_review`, `constraint_data_entry` |
| `iam_user_role_content` | ✅ Only when `constraint_data_entry=true` |
| `ut_data` (DW) | ✅ Direct read/write |

---

### Mode B — Dataset staging, auto-approve (`allow_review = true`, `review_level_count = 0`)

**Profile:** Data is staged in a dataset and submitted for approval. No reviewer involved — auto-approves on submit and writes to `ut_data`. Full dataset/data-point records persist for audit.

**Write path:**

```
FED → POST /dw/{dw_id}/dataset  (workflow_id, scope filters, dataset_name)
         ↓ backend: create dataset header, seed dataset_data_point from ut_data
         ↓ exclusivity check before creating

FED → GET /dw/{dw_id}/data-points  (workflow_id, dataset_id)
         ↓ read dataset_data_point directly (no ut_data merge)

FED → PATCH /dw/{dw_id}/data-points  (workflow_id, dataset_id)
         ↓ upsert into dataset_data_point

FED → DELETE /dw/{dw_id}/data-points  (workflow_id, dataset_id)
         ↓ delete from dataset_data_point (if unlocked)

FED → PATCH /dw/{dw_id}/dataset  { status: SUBMITTED }
         ↓ all data points: review_status=APPROVED, is_locked=True
         ↓ dataset → APPROVED, approved_on=NOW()
         ↓ write all data points to ut_data
         ↓ log: DATASET_SUBMITTED, DATASET_APPROVED
```

---

### Mode C — Full review (`allow_review = true`, `review_level_count > 0`)

**Profile:** Data is staged, submitted, then reviewed by one or more reviewer levels. `ut_data` is written only on final approval.

Write path is the same as Mode B up to submit. After submit:

```
FED → PATCH /dw/{dw_id}/dataset  { status: SUBMITTED }
         ↓ exclusivity check (at scope/seed time, not here)
         ↓ create dataset_review_stage rows for each level (all PENDING)
         ↓ activate Stage 1 → create slices → notify reviewers
         ↓ dataset → PENDING_REVIEW
```

Review and resubmit flow follows the reviewer walkthrough.

---

### Mode Summary

| | Mode A | Mode B | Mode C |
|---|---|---|---|
| `allow_review` | `false` | `true` | `true` |
| `review_level_count` | N/A | `0` | `> 0` |
| `dataset_id` in request | Not used | Required | Required |
| Dataset record | ❌ | ✅ | ✅ |
| `dataset_data_point` | ❌ | ✅ | ✅ |
| Stages / Slices | ❌ | ❌ | ✅ |
| Reviewer | ❌ | ❌ | ✅ |
| Submit step | ❌ (immediate) | ✅ (auto-approve) | ✅ (review flow) |
| `ut_data` written | On every PATCH | On submit | On final approval only |
| `constraint_data_entry` | ✅ Authorization | ✅ Authorization | ✅ Authorization |
| Area restriction | Only if `constraint_data_entry=true` | Only if `constraint_data_entry=true` | Only if `constraint_data_entry=true` |

> **FED note:** The frontend calls the same `GET/PATCH/DELETE /dw/{dw_id}/data-points` endpoints in all modes. The only behavioural difference FED must handle: in Mode A, `dataset_id` is omitted and there is no submit step; in Modes B/C, `dataset_id` is always present and a submit button exists.

---

## Personas

### Data Entry Operator

- Assigned to a workflow via `iam_user_role_content` with a data-entry role
- When `constraint_data_entry=true`: must have area assignments via `iam_user_role_content (workflow_id, role_id, content_id)` — can enter data only for assigned areas
- Creates datasets with explicit scope (area, indicator, unit, subgroup, time period, source filters)
- Sees a flat data grid — never sees stage, slice, or reviewer terminology
- Sees reviewer comments inline against rejected rows when dataset is returned

### Reviewer (Mode C only)

- Assigned to a workflow+level via `iam_user_role_content` with a **`role_id` that matches `workflow_review_level.role_id`** for that level (so data-entry area rows for the same workflow do not expand reviewer scope)
- `content_id` is the area_nid or classification_nid they are responsible for at that level
- Sees a unified grid of all data points across their assigned slices
- Can approve all, approve selected, or return selected rows with mandatory reason + comment
- Never sees slice terminology — slices are internal

### System / Background Process

- Seeds dataset_data_point on dataset create/scope-change
- Creates review stages at submission time
- Creates slices when a stage becomes active
- Advances stages, updates dataset status, sends notifications

---

## Pending-review visibility (API + IAM)

While `dataset_status = PENDING_REVIEW`, cross-operator visibility is limited to **current-stage reviewers**: the caller must have at least one **ACTIVE** `dataset_review_slice` on `dataset.current_stage_id` whose scope key (`area_nid` or `classification_nid`) intersects their IAM assignments for that workflow, using the active level’s `include_childs` rule for AREA scope.

- **`GET /dw/{dw_id}/dataset?status=PENDING_REVIEW&workflow_id=`** and **`GET /dw/{dw_id}/dataset/{id}?status=PENDING_REVIEW`** use the same rule as **`GET .../dataset/review`** (403 / empty list when not authorized). Operators still read their own datasets via the default list/get (no `status=PENDING_REVIEW`) using creator scope.
- **`GET/POST .../dataset/{id}/comments`** and **`GET .../dataset/{id}/association-count`** allow the **dataset owner** or a user who passes the current-stage reviewer check above.

---

## Database Schema

### `dataset`

Submission container. One dataset per operator per workflow per logical grouping.

```sql
CREATE TABLE dataset (
    dataset_id              INT             NOT NULL AUTO_INCREMENT,
    dataset_gid             VARCHAR(60)     NOT NULL,
    dataset_name            VARCHAR(255)    NOT NULL,
    dw_id                   INT             NOT NULL,
    workflow_id             INT             NOT NULL,           -- always required (no NULL workflow)
    dataset_status          ENUM(
                                'DRAFT',
                                'PENDING_REVIEW',
                                'REVISION',
                                'APPROVED',
                                'REJECTED'
                            )               NOT NULL DEFAULT 'DRAFT',
    current_stage_id        INT             NULL,

    revision_count          TINYINT         NOT NULL DEFAULT 0,
    last_returned_at        DATETIME        NULL,

    -- submission_comments and reviewer_overall_remarks removed.
    -- All dataset-level and data-point-level comments are stored in dataset_comment.

    -- Data-entry scope: saved filter selections (JSON arrays of DW NIDs)
    -- Used to seed dataset_data_point on create/scope-change.
    -- NULL = not set; [] = explicitly cleared.
    area_nids               JSON            NULL    COMMENT 'JSON array of area_nid values',
    indicator_nids          JSON            NULL    COMMENT 'JSON array of indicator_nid values',
    unit_nids               JSON            NULL    COMMENT 'JSON array of unit_nid values',
    subgroup_val_nids       JSON            NULL    COMMENT 'JSON array of subgroup_val_nid values',
    timeperiod_nids         JSON            NULL    COMMENT 'JSON array of timeperiod_nid values',
    source_nids             JSON            NULL    COMMENT 'JSON array of source_nid values',

    created_user_id         INT             NOT NULL,
    created                 DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_by_user_id    INT             NULL,
    submitted_at            DATETIME        NULL,
    approved_on             DATETIME        NULL,
    last_updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                            ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (dataset_id),
    UNIQUE  KEY uq_dataset_gid       (dataset_gid),
    INDEX       idx_dataset_dw        (dw_id),
    INDEX       idx_dataset_workflow  (workflow_id),
    INDEX       idx_dataset_status    (dataset_status),

    CONSTRAINT fk_dataset_workflow
        FOREIGN KEY (workflow_id) REFERENCES workflow (workflow_id)
);
```

**Scope JSON columns** (`area_nids`, `indicator_nids`, etc.) represent the operator's saved filter selections — they are the input used to seed `dataset_data_point`. They are **not** an enforcement whitelist at data-point write time. Authorization at write time is handled by `constraint_data_entry` + `iam_user_role_content`.

---

### `dataset_data_point`

Individual data records within a dataset. Seeded from `ut_data` at dataset create/scope-change. Each row is one IUS + area + time period + value.

```sql
CREATE TABLE dataset_data_point (
    data_point_id               INT             NOT NULL AUTO_INCREMENT,
    dataset_id                  INT             NOT NULL,

    -- DW references (cross-DB; enforced in service layer, no DB FKs)
    indicator_classification_id INT             NULL,
    iusnid                      INT             NOT NULL,
    indicator_nid               INT             NOT NULL,
    unit_nid                    INT             NOT NULL,
    subgroup_val_nid            INT             NULL,
    area_nid                    INT             NOT NULL,
    timeperiod_nid              INT             NOT NULL,
    source_nid                  INT             NULL,
    footnote_nid                INT             NULL,

    -- value fields (match ut_data column names for direct write-back)
    data_value                  FLOAT           NULL,           -- NULL = blank row (new entry)
    textual_data_value          TEXT            NULL,
    istextualdata               BOOLEAN         NOT NULL DEFAULT FALSE,

    -- operator/reviewer metadata
    -- data_entry_note and reviewer_comment removed.
    -- Comments are stored in dataset_comment (data_point_id = this row's data_point_id).

    -- comparison snapshot (previous period, for reviewer display)
    prev_timeperiod_nid         INT             NULL,
    prev_tmprd_data_value         FLOAT           NULL,
    prev_tmprd_textual_data_value TEXT            NULL,

    superseded_by_data_point_id INT             NULL,

    review_status               ENUM(
                                    'DRAFT',
                                    'PENDING_REVIEW',
                                    'APPROVED',
                                    'REJECTED'
                                )               NOT NULL DEFAULT 'DRAFT',
    approved_at_level_no        TINYINT         NULL,
    dataset_review_slice_id     INT             NULL,
    is_locked                   BOOLEAN         NOT NULL DEFAULT FALSE,
    reject_reason_id            INT             NULL,

    created                     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified                    DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (data_point_id),
    INDEX idx_ddp_dataset           (dataset_id),
    INDEX idx_ddp_ius_area_tp       (iusnid, area_nid, timeperiod_nid),
    INDEX idx_ddp_area              (area_nid),
    INDEX idx_ddp_classification    (indicator_classification_id),
    INDEX idx_ddp_review_status     (review_status),
    INDEX idx_ddp_slice             (dataset_review_slice_id),

    CONSTRAINT fk_ddp_dataset
        FOREIGN KEY (dataset_id) REFERENCES dataset (dataset_id)
);
```

**Blank rows:** When a scope combination has no existing `ut_data` row, a `dataset_data_point` row is inserted with `data_value=NULL`. The operator fills in the value on the data grid. This represents new data entry for a combination not yet in the live data.

**Edit access matrix:**

| Dataset Status | is_locked | Operator Can Edit? |
|---|---|---|
| `DRAFT` | FALSE | YES — all rows |
| `REVISION` | FALSE (`review_status=REJECTED`) | YES — only flagged rows |
| `REVISION` | TRUE (`review_status=PENDING_REVIEW/APPROVED`) | NO |
| `PENDING_REVIEW` | TRUE | NO |
| `APPROVED` | TRUE | NO — permanently locked |

---

### `dataset_review_stage`

One row per workflow level per dataset. All created at submission time (all `PENDING`). Activated sequentially. Mode B (0 levels) creates none.

```sql
CREATE TABLE dataset_review_stage (
    stage_id                    INT             NOT NULL AUTO_INCREMENT,
    dataset_id                  INT             NOT NULL,
    workflow_review_level_id    INT             NOT NULL,
    level_no                    TINYINT         NOT NULL,
    stage_status                ENUM('PENDING','ACTIVE','COMPLETED','SKIPPED') NOT NULL DEFAULT 'PENDING',
    activated_at                DATETIME        NULL,
    completed_at                DATETIME        NULL,

    PRIMARY KEY (stage_id),
    UNIQUE  KEY uq_drs_dataset_level (dataset_id, level_no),
    INDEX       idx_drs_dataset      (dataset_id),

    CONSTRAINT fk_drs_dataset FOREIGN KEY (dataset_id)               REFERENCES dataset (dataset_id),
    CONSTRAINT fk_drs_level   FOREIGN KEY (workflow_review_level_id) REFERENCES workflow_review_level (workflow_review_level_id)
);
```

---

### `dataset_review_slice`

**Internal only — never exposed to operator.** Atomic review unit per reviewer scope per stage. Created lazily when a stage becomes active.

```sql
CREATE TABLE dataset_review_slice (
    slice_id                    INT             NOT NULL AUTO_INCREMENT,
    dataset_id                  INT             NOT NULL,
    stage_id                    INT             NOT NULL,
    scope_type                  ENUM('AREA','CLASSIFICATION','HYBRID') NOT NULL,
    area_nid                    INT             NULL,
    classification_nid          INT             NULL,
    scope_label                 VARCHAR(255)    NULL,
    slice_status                ENUM('PENDING','ACTIVE','REVISION_REQUESTED','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    reviewed_by_user_id         INT             NULL,
    review_remarks              TEXT            NULL,  -- mandatory action field on RETURNED/REJECTED; kept here (not in comment table)
    started_at                  DATETIME        NULL,
    completed_at                DATETIME        NULL,
    created                     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (slice_id),
    INDEX idx_drsl_dataset        (dataset_id),
    INDEX idx_drsl_stage          (stage_id),
    INDEX idx_drsl_area           (area_nid),
    INDEX idx_drsl_classification (classification_nid),

    CONSTRAINT fk_drsl_dataset FOREIGN KEY (dataset_id) REFERENCES dataset (dataset_id),
    CONSTRAINT fk_drsl_stage   FOREIGN KEY (stage_id)   REFERENCES dataset_review_stage (stage_id)
);
```

---

### `dataset_review_slice_rejection`

Junction table: one row per rejection reason per slice. Required when a reviewer RETURNS or REJECTS a slice.

```sql
CREATE TABLE dataset_review_slice_rejection (
    id          INT NOT NULL AUTO_INCREMENT,
    slice_id    INT NOT NULL,
    reason_id   INT NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY  uq_drsr_slice_reason (slice_id, reason_id),
    INDEX       idx_drsr_slice  (slice_id),

    CONSTRAINT fk_drsr_slice  FOREIGN KEY (slice_id)  REFERENCES dataset_review_slice (slice_id),
    CONSTRAINT fk_drsr_reason FOREIGN KEY (reason_id) REFERENCES dataset_rejection_reason (reason_id)
);
```

---

### `dataset_comment`

Threaded, append-only comments attached to a dataset or an individual data point. Replaces the single-value comment fields that previously lived on `dataset` and `dataset_data_point`. *(Historically named `dataset_review_comment` before rename migration 072.)*

```sql
CREATE TABLE dataset_comment (
    comment_id       INT          NOT NULL AUTO_INCREMENT,
    dataset_id       INT          NOT NULL,       -- always set; FK → dataset
    data_point_id    INT          NULL,           -- NULL = dataset-level comment; SET = data-point comment
    commenter_role   ENUM('DATAENTRY','DATAREVIEW','SYSTEM') NOT NULL,
    comment_text     TEXT         NOT NULL,
    status   VARCHAR(32)  NULL,           -- snapshot at insert: dataset.dataset_status when
                                                     -- data_point_id IS NULL; else dataset_data_point.review_status
    created_user_id  INT          NOT NULL,       -- author; 0 = system if applicable
    created          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (comment_id),
    INDEX idx_drc_dataset    (dataset_id),
    INDEX idx_drc_data_point (data_point_id),

    CONSTRAINT fk_drc_dataset
        FOREIGN KEY (dataset_id)    REFERENCES dataset (dataset_id)               ON DELETE CASCADE,
    CONSTRAINT fk_drc_data_point
        FOREIGN KEY (data_point_id) REFERENCES dataset_data_point (data_point_id) ON DELETE CASCADE
);
```

**How `data_point_id` determines scope:**

| `data_point_id` | Scope | Example |
|---|---|---|
| `NULL` | Dataset-level comment | Operator submission note; reviewer overall remarks on rejection |
| `INT` | Data-point-level comment | Reviewer comment on a specific row; operator note against a value |

**`commenter_role` values align with IAM resource codes:**

| Value | Who | Mirrors |
|---|---|---|
| `DATAENTRY` | Data entry operator | `dm_dw_data_entry` IAM resource |
| `DATAREVIEW` | Reviewer | `dm_dw_data_review` IAM resource |
| `SYSTEM` | Backend process | Automated notes (e.g. write-back failure) |

**Common query patterns:**

```sql
-- All comments for a dataset page (chronological thread — both dataset & row level)
SELECT * FROM dataset_comment
WHERE dataset_id = :dataset_id
ORDER BY created ASC;

-- Dataset-level comments only (e.g. submission note thread, rejection remarks)
SELECT * FROM dataset_comment
WHERE dataset_id = :dataset_id AND data_point_id IS NULL
ORDER BY created ASC;

-- All comments on one data point (inline reviewer thread on a row)
SELECT * FROM dataset_comment
WHERE data_point_id = :data_point_id
ORDER BY created ASC;
```

**Columns removed from other tables (replaced by this table):**

| Table | Column removed | Replaced by |
|---|---|---|
| `dataset` | `submission_comments` | Row: `dataset_id=X`, `data_point_id=NULL`, `commenter_role=DATAENTRY` |
| `dataset` | `reviewer_overall_remarks` | Row: `dataset_id=X`, `data_point_id=NULL`, `commenter_role=DATAREVIEW` |
| `dataset_data_point` | `data_entry_note` | Row: `dataset_id=X`, `data_point_id=Y`, `commenter_role=DATAENTRY` |
| `dataset_data_point` | `reviewer_comment` | Row: `dataset_id=X`, `data_point_id=Y`, `commenter_role=DATAREVIEW` |

**Not replaced — kept on their tables:**

| Table | Column kept | Reason |
|---|---|---|
| `dataset_review_slice` | `review_remarks` | Mandatory action field captured atomically at RETURNED/REJECTED action time; not a freeform thread |

---

### `dataset_review_action_log`

Immutable append-only audit trail.

```sql
CREATE TABLE dataset_review_action_log (
    log_id              INT             NOT NULL AUTO_INCREMENT,
    dataset_id          INT             NOT NULL,
    stage_id            INT             NULL,
    slice_id            INT             NULL,
    data_point_id       INT             NULL,

    action              ENUM(
                            'DATASET_CREATED',
                            'DATASET_SUBMITTED',
                            'DATASET_RESUBMITTED',
                            'STAGE_ACTIVATED',
                            'SLICE_ACTIVATED',
                            'SLICE_APPROVED',
                            'SLICE_RETURNED',
                            'SLICE_REJECTED',
                            'DATA_POINT_APPROVED',
                            'DATA_POINT_REJECTED',
                            'DATA_POINT_CORRECTED',
                            'DATA_POINT_COMMENTED',
                            'DATA_POINT_DELETED',
                            'STAGE_COMPLETED',
                            'DATASET_APPROVED',
                            'DATASET_REJECTED',
                            'DATASET_CANCELLED'
                        )               NOT NULL,

    prev_status         VARCHAR(50)     NULL,
    new_status          VARCHAR(50)     NULL,
    action_by_user_id   INT             NOT NULL,
    action_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    remarks             TEXT            NULL,

    PRIMARY KEY (log_id),
    INDEX idx_dral_dataset    (dataset_id),
    INDEX idx_dral_data_point (data_point_id),
    INDEX idx_dral_action     (action),

    CONSTRAINT fk_dral_dataset FOREIGN KEY (dataset_id) REFERENCES dataset (dataset_id)
);
```

---

### `dataset_rejection_reason`

Admin-managed reference table of predefined rejection reasons.

```sql
CREATE TABLE dataset_rejection_reason (
    reason_id       INT             NOT NULL AUTO_INCREMENT,
    reason_code     VARCHAR(50)     NOT NULL,
    reason_text     VARCHAR(255)    NOT NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    display_order   TINYINT         NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (reason_id),
    UNIQUE KEY uq_drr_code (reason_code)
);
```

Seed examples: `VALUE_DEVIATION`, `SOURCE_MISSING`, `OBSERVATION_MISSING`, `INCONSISTENT_DATA`, `WRONG_PERIOD`, `OTHER`.

---

### `dataset_entry_period` *(planned — not yet implemented)*

Defines the open/close window for a data entry cycle. Sends notifications to operators and reviewers when opened. Planned for a future release.

---

## Status Lifecycles

### Dataset Status

```
DRAFT ──[Submit for Review]──► PENDING_REVIEW
                                     │
              ┌──────────────────────┼──────────────────────┐
         Mode B                 Mode C                  Mode C
      (0 levels,             (reviewer              (reviewer
      auto-approve)           approves)              rejects)
           │                      │                      │
           ▼                      ▼                      ▼
        APPROVED              APPROVED               REJECTED
                                                  (terminal)

          Mode C — reviewer requests revision:
          PENDING_REVIEW ──► REVISION
                               │
                    operator corrects + resubmits
                               │
                               ▼
                         PENDING_REVIEW (again)
```

**Status values:**

| Status | Actor | Meaning |
|---|---|---|
| `DRAFT` | Operator | Creating / editing dataset and data points |
| `PENDING_REVIEW` | Reviewer | Submitted; awaiting reviewer action |
| `REVISION` | Operator | Reviewer flagged issues; operator must correct and resubmit |
| `APPROVED` | System | Final approval; data written to `ut_data` |
| `REJECTED` | Reviewer | Terminal rejection; no resubmit allowed |

### Data Point `review_status`

```
DRAFT → PENDING_REVIEW → APPROVED   (approved by reviewer)
                       → REJECTED   (flagged by reviewer; operator corrects → DRAFT on correction)
```

| Status | Meaning |
|---|---|
| `DRAFT` | Operator is editing; not yet submitted |
| `PENDING_REVIEW` | Assigned to reviewer's slice; awaiting decision |
| `APPROVED` | Reviewer approved |
| `REJECTED` | Reviewer flagged; operator must correct (is_locked=False) |

### Slice `slice_status`

```
PENDING → ACTIVE → APPROVED           (all points approved)
                 → REVISION_REQUESTED (reviewer flagged issues → dataset → REVISION)
                 → REJECTED           (entire dataset rejected)
```

---

## Workflow Configuration

| `review_workflow` column | Effect |
|---|---|
| `allow_review = false` | **Mode A** — direct `ut_data` CRUD; no dataset records |
| `allow_review = true`, `review_level_count = 0` | **Mode B** — dataset staging, auto-approve on submit |
| `allow_review = true`, `review_level_count > 0` | **Mode C** — full review flow |
| `constraint_data_entry = false` (default) | Any user with the data entry IAM role can write for any area |
| `constraint_data_entry = true` | Operator must have `iam_user_role_content` area assignment for this workflow |

| `review_workflow_level` column | Effect |
|---|---|
| `level_no` | Execution order; lower number activates first |
| `review_scope_type = AREA` | Slices split by area_nid |
| `review_scope_type = CLASSIFICATION` | Slices split by classification_nid |
| `is_final_level` | **Invariant:** whenever there is at least one **active** level, **exactly one** must have `is_final_level=true`, and it must be the level with the **highest** active `level_no`. That stage is the terminal reviewer step: when it completes (all slices APPROVED), the dataset becomes `APPROVED`. `POST /workflow/{id}/level` and `DELETE .../level/{id}` return **400** if the invariant is violated after the change. |
| `include_childs` | When `true` and `review_scope_type=AREA`, reviewers’ IAM `dm_dw_area` content IDs for this workflow are expanded to **all descendant** `area_nid` values in the tenant warehouse (`ut_area_<locale>` via `area_parent_nid`) for the **current** active review stage. Parent-area assignments (e.g. state) then match slices keyed by child areas (e.g. districts). When `false`, matching uses only the assigned area NIDs. |
| `role_id` | IAM role whose holders are eligible to review at this level |

---

## Data Entry Authorization — constraint_data_entry

`constraint_data_entry` on `review_workflow` controls who may create datasets and write data points for a given workflow. The check runs in two sequential layers.

---

### Layer 1 — The constraint flag

| `constraint_data_entry` | Effect |
|---|---|
| `false` (default) | Any user with an authorized data-entry role may create datasets and write data points for any area. No area check performed. |
| `true` | Proceed to Layer 2. |

---

### Layer 2 — Area assignment check (only when `constraint_data_entry = true`)

The user's `iam_user_role_content` rows are queried for:

```
resource_code = 'dm_dw_area'
workflow_id   = <this workflow>
user_id       = <caller>
```

The `content_id` values on those rows are the area NIDs the user is allowed to operate on.

| User type | Has area assignments? | Result |
|---|---|---|
| Super admin (`is_super_admin = 1`) | — | ✅ Always allowed — bypasses both layers |
| Any non-super-admin | Has ≥ 1 assignment | ✅ Allowed **only** for their assigned area NIDs. Any other area → **DENY** |
| Any non-super-admin | No assignments | ❌ **DENY** — must have explicit assignments to use a constrained workflow |

> **No role-based bypass:** `DFA_DM_ADMIN` and other system roles are subject to the same Layer 2 check as operators when `constraint_data_entry = true`. The only unconditional bypass is `is_super_admin = 1`.

---

### Decision flow (applied at all 3 enforcement points)

```
Is caller super admin?
  YES → ALLOW

Is workflow.constraint_data_entry = false?
  YES → ALLOW

# constraint is TRUE from here
Fetch dm_dw_area assignments for (user_id, workflow_id)

No assignments found?
  YES → DENY  [NOT_ASSIGNED_TO_WORKFLOW]

Requested area_nid NOT in assigned set?
  YES → DENY  [NOT_ASSIGNED_TO_WORKFLOW / AREA_NOT_ASSIGNED]

→ ALLOW
```

---

### Enforcement points in code

The same decision flow is enforced at three locations in `apps/app_db/services/dataset_service.py`:

| Location | Function | What is checked |
|---|---|---|
| Dataset creation | `create_dataset()` | `payload.area_nids` — each requested area must be in the user's assignment set |
| Data-point upsert (operator) | `upsert_data_points()` | Each `data_point.area_nid` in the payload |
| Data-point upsert (unified FED) | `unified_upsert_data_points()` | Each resolved data point's `area_nid` |

---

### Multiple workflow example

A user can be assigned to different area sets per workflow. Assignments are **per-workflow** — having access in Workflow A gives no access in Workflow B.

```
User assignments in iam_user_role_content:
  Workflow A (constraint=TRUE)  → areas [1, 2]
  Workflow B (constraint=TRUE)  → areas [3]
  Workflow C (constraint=TRUE)  → (no assignment)
  Workflow D (constraint=FALSE) → (no assignment)
```

| Workflow | constraint | User assignments | Requested area | Outcome |
|---|---|---|---|---|
| A | TRUE | [1, 2] | area 1 | ✅ Allowed |
| A | TRUE | [1, 2] | area 3 | ❌ Denied |
| B | TRUE | [3] | area 3 | ✅ Allowed |
| B | TRUE | [3] | area 1 | ❌ Denied |
| C | TRUE | none | any | ❌ Denied |
| D | FALSE | none | any | ✅ Allowed (constraint off) |
| D | FALSE | [1] | area 5 | ✅ Allowed (constraint off, assignments ignored) |

---

### Assigning users to a workflow

Area assignments are managed via the workflow user-assignment API:

```
POST   /dw/{dw_id}/workflow/{workflow_id}/users          — assign user + areas
DELETE /dw/{dw_id}/workflow/{workflow_id}/users/{user_id} — remove user assignment
GET    /dw/{dw_id}/workflow/{workflow_id}/users           — list assigned users and their areas
```

Each row written to `iam_user_role_content`:

```
resource_code = 'dm_dw_area'
content_id    = <area_nid>
workflow_id   = <workflow_id>
user_id       = <user_id>
role_id       = <role for this assignment>
```

---

## Data Exclusivity Rule

**Rule:** The same combination of `(iusnid, area_nid, timeperiod_nid)` may exist in only one non-terminal dataset at a time.

**Terminal states (exclusivity released):** `APPROVED`, `REJECTED`

**Non-terminal states (exclusivity held):** `DRAFT`, `PENDING_REVIEW`, `REVISION`

**Enforcement point:** At dataset **create time** (POST /dataset) and at **scope change** (PATCH /dataset scope update) — not at data-point write time and not at submit time.

**Check:** Before seeding `dataset_data_point`, the service resolves all `(iusnid, area_nid, timeperiod_nid)` combinations from the requested scope and checks for any match in non-terminal datasets (excluding the current dataset on scope change).

**If conflict found:** Dataset is **not created / scope not changed**. Returns:
```json
{
  "error": "EXCLUSIVITY_CONFLICT",
  "locked_combinations": [
    { "iusnid": 23, "area_nid": 101, "timeperiod_nid": 5,
      "locked_by_dataset_id": 42, "locked_by_dataset_name": "Q1 bundle", "status": "PENDING_REVIEW" }
  ]
}
```
FED shows the list. Operator must resolve (complete or cancel) the conflicting dataset before proceeding.

---

## Dataset Scope & Seeding

### Scope fields on `dataset`

Six JSON columns store the operator's filter selections at create/update time:

| Column | Filters |
|---|---|
| `area_nids` | Areas operator selected |
| `indicator_nids` | Indicators selected |
| `unit_nids` | Units selected |
| `subgroup_val_nids` | Subgroup values selected |
| `timeperiod_nids` | Time periods selected |
| `source_nids` | Sources selected |

These are **saved filter state** — they restore the FED grid when operator reopens the dataset. They are not enforced at `PATCH /data-points` write time (that is controlled by `constraint_data_entry`).

### Seeding on POST /dataset

When a dataset is created:

```
1. Exclusivity pre-check (see Data Exclusivity Rule)
   → If conflict: stop, return EXCLUSIVITY_CONFLICT. Dataset NOT created.

2. Create dataset header, save scope JSON columns.

3. Resolve iusnids:
   Query ut_indicator_unit_subgroup in DW
   WHERE indicator_nid IN (indicator_nids)
     AND unit_nid IN (unit_nids)
     AND subgroup_val_nid IN (subgroup_val_nids)

4. Resolve indicator_classification_id per iusnid:
   Query ut_ic_ius WHERE iusnid = ?
   → use ic_nid if found, else NULL

5. For each (iusnid × area_nid × timeperiod_nid) in scope:
   a. Query ut_data for existing row
   b. If EXISTS → insert dataset_data_point with seeded values
      (data_value, textual_data_value, istextualdata, source_nid, etc.)
   c. If NOT EXISTS → insert dataset_data_point with data_value=NULL
      (blank row — operator fills in new entry on the grid)
   d. Skip if already in a non-terminal dataset (caught by step 1)
```

### Scope change on PATCH /dataset (scope fields updated)

```
Advisory check first (optional — FED calls GET /dataset/{id}/scope-check):
  Returns: { rows_to_remove, rows_to_add, exclusivity_conflicts }
  No side effects — purely informational. FED shows confirmation dialog.

Actual PATCH (always executes scope reconciliation):

1. Exclusivity pre-check on newly-in-scope combinations only.
   → If conflict: stop, return EXCLUSIVITY_CONFLICT. No changes made.

2. Resolve new scope → new_set of (iusnid, area_nid, timeperiod_nid)
   current_set = all rows in dataset_data_point for this dataset

3. to_remove = current_set − new_set
   → DELETE those dataset_data_point rows unconditionally
   (FED warned via scope-check; user confirmed)

4. to_add = new_set − current_set
   → Seed from ut_data same as POST step 5 above

5. Update dataset header scope JSON columns
```

**`GET /dw/{dw_id}/dataset/{id}/scope-check` — advisory endpoint:**

```
POST body: proposed new scope fields (same shape as DatasetOperatorPatchRequest)
Returns:
{
  "rows_to_remove": [ list of dataset_data_point rows falling out of scope ],
  "rows_to_add":    [ new combinations entering scope ],
  "exclusivity_conflicts": [ combinations locked by another dataset ]
}
```

No state changes. FED calls this to populate the confirmation dialog before applying the scope PATCH.

---

## Operator Flow — Full Walkthrough

### Mode A — Direct write (allow_review = false)

```
FED → PATCH /dw/{dw_id}/data-points (workflow_id, no dataset_id)
         ↓ backend: allow_review=false → write directly to ut_data
         ↓ constraint_data_entry check applies if true
         ↓ data is live immediately — no submit step
```

No dataset created. No staging. No submit.

---

### Mode B / C — Dataset flow (allow_review = true)

#### Step 1 — Select Workflow

FED populates workflow dropdown from:
```sql
SELECT DISTINCT w.workflow_id, w.workflow_code
FROM iam_user_role_content urc
JOIN workflow w ON urc.workflow_id = w.workflow_id
WHERE urc.user_id = :current_user_id
  AND urc.role_id = (role with data-entry permission)
  AND w.is_active = TRUE
  AND w.allow_review = TRUE
```

#### Step 2 — Select or Create Dataset

Dataset dropdown shows existing `DRAFT` and `REVISION` datasets for this workflow and user.

On `+ Create new`:
- FED shows: dataset name + scope filter selectors (area, indicator, unit, subgroup, time period, source)
- `POST /dw/{dw_id}/dataset` → backend: exclusivity check → create header → seed `dataset_data_point`
- Returns dataset_id; FED auto-selects it

On selecting existing `DRAFT`:
- Grid loads `dataset_data_point` rows (scope filters pre-filled from saved JSON columns)
- All rows editable; blank rows (`data_value=NULL`) shown as empty cells for new entry

On selecting `REVISION`:
- Grid loads with mixed row states
- Unlocked (`review_status=REJECTED`) rows: editable, reviewer comments shown inline
- Locked (`review_status=PENDING_REVIEW/APPROVED`) rows: read-only

#### Step 3 — Change Scope (optional)

If operator changes filter selections:
1. FED calls `GET /dataset/{id}/scope-check` with proposed new scope
2. Backend returns rows_to_remove, rows_to_add, conflicts
3. FED shows confirmation: "N rows will be removed, M new rows will be added"
4. On confirm: `PATCH /dw/{dw_id}/dataset/{id}` with new scope fields
   → backend reconciles dataset_data_point

#### Step 4 — Enter / Edit Values

- `PATCH /dw/{dw_id}/data-points` (dataset_id, data_points array)
- Writes to `dataset_data_point` — not live until submitted
- Blank rows: operator types value into empty cell, sends PATCH

#### Step 5 — Submit for Review

`PATCH /dw/{dw_id}/dataset/{dataset_id}` `{ "status": "PENDING_REVIEW" }`

**Mode B (review_level_count = 0):**
1. All data points: `review_status=APPROVED`, `is_locked=TRUE`
2. Dataset: `APPROVED`, `approved_on=NOW()`
3. Write all data points to `ut_data`
4. Log: `DATASET_SUBMITTED`, `DATASET_APPROVED`
5. Response: `dataset_status=APPROVED`

**Mode C (review_level_count > 0):**
1. Create `dataset_review_stage` rows for each active `workflow_review_level` (all `PENDING`)
2. Dataset: `DRAFT` → `PENDING_REVIEW`, `current_stage_id = level_no=1 stage`
3. Activate Stage 1 → create slices → assign data points: `review_status=PENDING_REVIEW`, `is_locked=TRUE`
4. Log: `DATASET_SUBMITTED`

#### Step 6 — Resubmit after REVISION (Mode C only)

1. Operator corrects unlocked (`review_status=REJECTED`) rows via `PATCH /data-points`
   - Corrected row's `review_status` resets to `DRAFT`
2. `PATCH /dw/{dw_id}/dataset/{dataset_id}` `{ "status": "PENDING_REVIEW" }`
3. Corrected rows: `review_status=PENDING_REVIEW`, `is_locked=TRUE`
4. Their slices: `REVISION_REQUESTED` → back to `ACTIVE`
5. Dataset: `REVISION` → `PENDING_REVIEW`, `revision_count` incremented
6. Log: `DATASET_RESUBMITTED`
7. Notify reviewers

---

## Reviewer Flow — Full Walkthrough

*(Mode C only)*

### Step 1 — Select Workflow

Dropdown shows only workflows where reviewer has an `iam_user_role_content` assignment with `allow_review=TRUE`.

### Step 2 — Select Dataset

Shows datasets where this reviewer has at least one `ACTIVE` or `REVISION_REQUESTED` slice.

### Step 3 — Review Grid

Grid loads all data points across all slices this reviewer is responsible for — one unified flat grid.

Grid columns: Indicator · Unit · Subgroup · Area · Time Period · Value · Prev Value · Δ% · Operator Note · Status

### Step 4 — Reviewer Actions

#### Approve All
- `POST /dw/{dw_id}/dataset/{dataset_id}/review` `{ "status": "APPROVED" }`
- All data points in reviewer's slices: `review_status=APPROVED`, `is_locked=TRUE`
- Slices: `APPROVED`
- If final stage → dataset `APPROVED`, `ut_data` written
- If non-final stage → next stage activates

#### Request Revision
- `POST /dw/{dw_id}/dataset/{dataset_id}/review` `{ "status": "REQUEST_REVISION", "slice_rejection_reason_ids": [...], "slice_remarks": "..." }`
- Reviewer adds comments on specific data points via `POST /comments` (before or after this call)
- No partial approval — reviewer does NOT approve individual rows
- Flagged data points: `review_status=REJECTED`, `is_locked=FALSE`
- Slice: `REVISION_REQUESTED`, `dataset_review_slice_rejection` rows inserted
- Dataset: `REVISION`, `last_returned_at=NOW()`
- Notify operator

#### Reject Entire Dataset
- `POST /dw/{dw_id}/dataset/{dataset_id}/review` `{ "status": "REJECTED", "rejection_reason_ids": [...], "overall_remarks": "..." }`
- Mandatory: ≥1 rejection reason + non-empty `overall_remarks`
- All data points: `review_status=REJECTED`, `is_locked=FALSE`
- All slices: `REJECTED`
- Dataset: `REJECTED` (terminal — operator cannot resubmit)
- Notify operator

---

## Internal System Mechanics

### Stage Activation

Triggered on submit (activates level_no=1) or stage completion (activates level_no=N+1).

```
1. Read workflow_review_level: scope_type, area_level, classification_parent_nid, role_id
2. Find distinct scope values from dataset_data_point for this dataset
3. For each scope value → create one dataset_review_slice (ACTIVE)
4. Assign each data_point to its slice:
   UPDATE dataset_data_point
   SET dataset_review_slice_id = :slice_id,
       review_status = 'PENDING_REVIEW',
       is_locked = TRUE
   WHERE area_nid = :area_nid (or classification_id for CLASSIFICATION scope)
5. Update dataset_review_stage: ACTIVE, activated_at = NOW()
6. Update dataset.current_stage_id
7. Notify eligible reviewers via iam_user_role_content
```

### Stage Completion

Triggered after every slice approval action.

```
1. If any slice NOT APPROVED → stage stays ACTIVE
2. If all slices APPROVED:
   - stage: COMPLETED, completed_at = NOW()
   - data points: approved_at_level_no = level_no
3. If is_final_level = TRUE:
   - data points: review_status = APPROVED
   - dataset: APPROVED, approved_on = NOW(), current_stage_id = NULL
   - Log: STAGE_COMPLETED, DATASET_APPROVED
   - Trigger ut_data write-back
4. If not final level:
   - Activate next stage
   - Log: STAGE_COMPLETED, STAGE_ACTIVATED
```

### Write-back to `ut_data` on Approval

Triggered on Mode B submit or Mode C final stage completion.

Upsert `dataset_data_point` → `ut_data` by `(iusnid, area_nid, timeperiod_nid)`. Sets `ismrd=0` (MRD recalculation triggered separately via `set-mrd` endpoint).

| `dataset_data_point` | `ut_data` |
|---|---|
| `iusnid` | `iusnid` |
| `area_nid` | `area_nid` |
| `timeperiod_nid` | `timeperiod_nid` |
| `indicator_nid` | `indicator_nid` |
| `unit_nid` | `unit_nid` |
| `subgroup_val_nid` | `subgroup_val_nid` |
| `source_nid` | `source_nid` |
| `footnote_nid` | `footnote_nid` |
| `data_value` | `data_value` |
| `textual_data_value` | `textual_data_value` |
| `istextualdata` | `istextualdata` |

---

## Use Cases

### UC-01: Direct data entry (Mode A)

1. Workflow has `allow_review=false`
2. Operator selects workflow, no dataset creation needed
3. `PATCH /data-points` → writes directly to `ut_data`
4. Data visible immediately. No submit step, no review.

---

### UC-02: Dataset with auto-approve (Mode B)

1. Workflow has `allow_review=true`, `review_level_count=0`
2. Operator creates dataset with scope filters → seeded from `ut_data`
3. Operator edits values, adds new blank-row values
4. Submits → auto-approved → `ut_data` written

---

### UC-03: Full review flow — single level (Mode C)

1. Operator creates dataset, submits
2. Stage 1 activates; slices created per area; reviewers notified
3. Reviewers approve all → Stage 1 completes → dataset APPROVED → `ut_data` written

---

### UC-04: Reviewer requests revision

1. Reviewer adds comments on specific data points via `POST /comments`
2. Reviewer calls `POST /review` with `status: REQUEST_REVISION`, reason, remarks
3. Flagged rows unlocked; dataset → `REVISION`
4. Operator corrects flagged values, resubmits → rows re-locked → reviewer reviews → approves

---

### UC-05: Scope change removes combinations

1. Operator created dataset with areas [5, 6, 7]
2. Calls `GET /dataset/{id}/scope-check` with proposed `area_nids=[5,6]`
3. FED shows: "1 row for area 7 will be removed"
4. Operator confirms → `PATCH /dataset/{id}` with `area_nids=[5,6]`
5. Backend deletes area-7 rows, no new seeding needed

---

### UC-06: Exclusivity conflict at create time

1. DS-001 (PENDING_REVIEW) holds `(iusnid=23, area=101, tp=5)`
2. Operator tries to create DS-002 with same scope
3. POST returns `EXCLUSIVITY_CONFLICT`: `[(23, 101, 5) locked by DS-001]`
4. DS-002 not created. Operator must wait for DS-001 to reach terminal state.

---

### UC-07: New data entry (blank row)

1. Scope includes `(iusnid=23, area=202, tp=10)` — no `ut_data` row exists
2. Seeding inserts `dataset_data_point` with `data_value=NULL`
3. Operator sees blank cell in grid, types value, saves via `PATCH /data-points`
4. On approval, new row written to `ut_data`

---

### UC-08: Two-level review (e.g. district then state)

**Configure levels**

1. Set `review_level_count` (e.g. `2`) on the workflow, then create two active `workflow_review_level` rows: `level_no=1` (district) and `level_no=2` (state).
2. Set **`is_final_level=true` only on the highest `level_no`** (state). Level 1 must have `is_final_level=false`. If district is marked final, or no level is final, the API rejects level saves and the dataset can complete after the wrong stage.
3. For state reviewers who are assigned the **state** `area_nid` in IAM but data points (and slices) use **district** `area_nid`, set **`include_childs=true`** on the **state** level (`review_scope_type=AREA`) so the inbox, review grid, and `POST .../review` authorize against descendant districts for that active stage.

**Runtime**

4. Submit → Stage 1 (ACTIVE), Stage 2 (PENDING); slices use each distinct leaf `area_nid` on the dataset.
5. District reviewers approve all slices → Stage 1 COMPLETED → Stage 2 activates; data points return to `PENDING_REVIEW` on new slices.
6. State reviewer (parent area + `include_childs`) approves all slices → Stage 2 COMPLETED → dataset `APPROVED` → `ut_data` written.

---

---

## Edge Cases

### EC-01: Reviewer submits while another reviewer already approved the same slice

First to act wins. Second reviewer gets 409: "This slice was already reviewed by [name]."

---

### EC-02: Workflow level deactivated while dataset is in review

In-flight `dataset_review_stage` holds `workflow_review_level_id` as a snapshot. Deactivating the level does not affect in-flight stages. Only new datasets are affected.

---

### EC-03: Reviewer's assignment removed while reviewing

Authority re-validated on every API call. Next action returns 403. Slice stays ACTIVE until admin reassigns.

---

### EC-04: Empty dataset submission

Blocked at submit time: "Cannot submit an empty dataset. Add at least one data point."

---

### EC-05: Scope-check shows conflicts

`GET /dataset/{id}/scope-check` returns `exclusivity_conflicts` — new in-scope combinations already held by another dataset. PATCH scope update will also be blocked by the exclusivity check.

---

### EC-06: All reviewers for a slice are unavailable

Slice created as ACTIVE but no notifications sent. Admin dashboard shows "Unassigned slices." Admin must add assignment via workflow user-assignment API.

---

## API Endpoint Reference

### Unified Data-Point Endpoints (all modes — same endpoints, behaviour gated by `allow_review`)

`workflow_id` always required. `dataset_id` required when `allow_review=true`; absent when `allow_review=false`.

| Method | Path | Access | Behaviour |
|---|---|---|---|
| `GET` | `/dw/{dw_id}/data-points` | AUTHENTICATED | `allow_review=false` → read `ut_data`; `allow_review=true` → read `dataset_data_point` for the given `dataset_id` |
| `PATCH` | `/dw/{dw_id}/data-points` | AUTHENTICATED | `allow_review=false` → upsert `ut_data` directly; `allow_review=true` → upsert `dataset_data_point` (DRAFT / unlocked rows) |
| `DELETE` | `/dw/{dw_id}/data-points` | AUTHENTICATED | `allow_review=false` → delete from `ut_data`; `allow_review=true` → delete from `dataset_data_point` (unlocked rows) / from `ut_data` when dataset APPROVED |

---

### Dataset Endpoints (`dm_dw_data_entry` resource)

| Method | Path | Access | Action |
|---|---|---|---|
| `GET` | `/dw/{dw_id}/dataset` | AUTHENTICATED | List operator's datasets (filter by `status`, `workflow_id`). With `status=PENDING_REVIEW` + `workflow_id`, only datasets the caller may review at the **current** stage (same as `/dataset/review`). |
| `POST` | `/dw/{dw_id}/dataset` | AUTHENTICATED | Create DRAFT dataset. Requires `workflow_id`, `dataset_name`, scope fields. Triggers exclusivity check + seeding. |
| `GET` | `/dw/{dw_id}/dataset/{dataset_id}` | AUTHENTICATED | Get dataset header. Optional `status=PENDING_REVIEW` only for **current-stage** reviewers; otherwise creator-only. |
| `PATCH` | `/dw/{dw_id}/dataset/{dataset_id}` | AUTHENTICATED | Field update (scope, name) or status transition (`PENDING_REVIEW`). Scope change triggers reconciliation. |
| `DELETE` | `/dw/{dw_id}/dataset/{dataset_id}` | AUTHENTICATED | Permanently delete a DRAFT dataset |
| `GET` | `/dw/{dw_id}/dataset/{dataset_id}/scope-check` | AUTHENTICATED | Advisory scope-diff — returns rows_to_remove, rows_to_add, exclusivity_conflicts. No side effects. |

**`PATCH /dw/{dw_id}/dataset/{dataset_id}` — allowed operator transitions:**

| `status` in body | From state | Side-effects |
|---|---|---|
| `PENDING_REVIEW` | `DRAFT` | **Mode B (0 levels):** approve all rows, write `ut_data`, dataset `APPROVED`. **Mode C (>0 levels):** create stages/slices, data points → `PENDING_REVIEW`, advance to `PENDING_REVIEW`. |
| `PENDING_REVIEW` | `REVISION` | Re-lock corrected rows (`PENDING_REVIEW`), reset `REVISION_REQUESTED` slices to `ACTIVE`, advance to `PENDING_REVIEW` (Mode C only). `revision_count` incremented. |

Field updates (no `status`): `dataset_name`, scope fields (`area_nids`, `indicator_nids`, `unit_nids`, `subgroup_val_nids`, `timeperiod_nids`, `source_nids`). Only allowed in `DRAFT`.

---

### Reviewer Endpoints (`dm_dw_data_review` resource)

| Method | Path | Access | Action |
|---|---|---|---|
| `GET` | `/dw/{dw_id}/dataset/review` | AUTHENTICATED | List datasets pending this reviewer's action (ACTIVE slice on current stage; IAM `role_id` must match that level’s reviewer role) |
| `GET` | `/dw/{dw_id}/dataset/{dataset_id}/review` | AUTHENTICATED | Unified review grid for reviewer's scope |
| `POST` | `/dw/{dw_id}/dataset/{dataset_id}/review` | AUTHENTICATED | Reviewer decision: `APPROVED`, `REQUEST_REVISION`, or `REJECTED` |

---

### Comment Endpoints (`dm_dw_data_entry` / `dm_dw_data_review` resource)

FED uses the same endpoints regardless of whether the comment is on a dataset or a data point — `data_point_id` in the body determines the scope.

| Method | Path | Access | Action |
|---|---|---|---|
| `GET` | `/dw/{dw_id}/dataset/{dataset_id}/comments` | AUTHENTICATED | List comments (owner or current-stage reviewer when `PENDING_REVIEW`; owner-only otherwise). Ordered by `created_at ASC`. Optional `data_point_id` filter. |
| `POST` | `/dw/{dw_id}/dataset/{dataset_id}/comments` | AUTHENTICATED | Add a comment (same access as GET comments). Body: `{ "comment_text": "...", "data_point_id": null \| int }`. `commenter_role` derived from caller's IAM role on this workflow. |

**Request body:**
```json
{ "comment_text": "Value looks too high — please verify source.", "data_point_id": 204 }
{ "comment_text": "Submitting Q1 health data for Patna district.", "data_point_id": null }
```

**Response item:**
```json
{
  "comment_id": 12,
  "dataset_id": 7,
  "data_point_id": 204,
  "commenter_role": "DATAREVIEW",
  "comment_text": "Value looks too high — please verify source.",
  "comment_by_user_id": 45,
  "created_at": "2026-04-14T10:23:00"
}
```

---

### Reference Endpoints

| Method | Path | Access | Action |
|---|---|---|---|
| `GET` | `/dw/{dw_id}/dataset/review-rejection-reasons` | AUTHENTICATED | List active predefined rejection reasons |
| `GET` | `/dw/{dw_id}/workflow/{workflow_id}/association-count` | AUTHENTICATED | Count datasets, active datasets, review levels, user assignments — call before delete |
| `GET` | `/dw/{dw_id}/dataset/{dataset_id}/association-count` | AUTHENTICATED | Count data points, review stages, slices, action log entries — owner or current-stage reviewer (same as comments) |

---

### Delete Rules

| Dataset Status | `DELETE /dataset/{id}` Allowed |
|---|---|
| `DRAFT` | ✅ Only status that allows delete |
| `PENDING_REVIEW` | ❌ Reviewer active |
| `REVISION` | ❌ In workflow — operator must correct and resubmit |
| `APPROVED` | ❌ Data written to `ut_data`; deleting dataset does not remove live data |
| `REJECTED` | ❌ Terminal audit record |

**Delete data points (`DELETE /data-points`):**

- `allow_review=false` → delete from `ut_data`
- `allow_review=true`, dataset NOT APPROVED → delete unlocked rows from `dataset_data_point`; locked rows silently skipped (bulk) or `DATA_POINT_LOCKED` error (single)
- `allow_review=true`, dataset APPROVED → delete from `ut_data`; `dataset_data_point` row kept; log `DATA_POINT_DELETED`

---

## Design Decisions & Validation Notes

| Decision | Rationale |
|---|---|
| `WORKFLOW_DATASET_ENABLED` config removed | Mode is determined entirely by `workflow.allow_review` — no global toggle needed |
| `allow_review=false` → direct `ut_data`, no dataset record | Simple data entry needs no staging overhead; no audit trail required for this mode |
| `allow_review=true`, `review_level_count=0` → Mode B | Flag name reflects intent (dataset management on); 0 levels means auto-approve |
| Exclusivity at seed time, not submit time | Dataset is a working copy; conflicts discovered upfront before operator enters data |
| Scope JSON columns = saved filter state, not write-time whitelist | Write authorization handled by `constraint_data_entry`; scope columns restore FED grid state |
| Blank rows for missing `ut_data` combinations | Supports new data entry in the same grid as updates — operator sees complete working set |
| `indicator_classification_id` from `ut_ic_ius` | Lookup at seed time; NULL if no IC assignment; avoids FED needing to supply it |
| Same `GET/PATCH/DELETE /data-points` endpoints in all modes | FED has one consistent API contract; backend routes based on `allow_review` |
| `scope-check` is advisory GET with body | Proposed scope is 6 JSON arrays — too large for query params; advisory-only despite POST-like body |
| `dataset.workflow_id` always required (non-nullable) | Mode A still requires `workflow_id` in request for authorization checks; only dataset record is skipped |
| No ut_data merge in GET /data-points (Mode B/C) | `dataset_data_point` is the working set after seeding; merge was needed only for old Mode 1 implicit overlay |

---

## Implementation Checklist

### Completed
- [x] Migration `061_dataset_wf_nullable` — `dataset.workflow_id` nullable (pre-new-strategy)
- [x] Migration `062_dp_deleted_action` — `DATA_POINT_DELETED` added to `dataset_action_enum`
- [x] Migration `065_ds_filter_nids` — 6 JSON scope columns on `dataset`
- [x] `apps/app_db/models/core.py` — scope JSON columns added; `DATA_POINT_DELETED` in ORM Enum
- [x] `apps/app_db/schemas/dataset.py` — `DatasetScopeNidsMixin`; scope fields in Create/Patch/Response schemas
- [x] `apps/app_db/services/dataset_service.py` — `get_workflow_association_counts()`, `get_dataset_association_counts()`
- [x] `GET /dw/{dw_id}/workflow/{workflow_id}/association-count` and `GET /dw/{dw_id}/dataset/{dataset_id}/association-count`

### Pending (new strategy)
- [ ] Migration: `dataset_comment` table (incl. status snapshot column `status`)
- [ ] Migration: drop `dataset.submission_comments`, `dataset.reviewer_overall_remarks`
- [ ] Migration: drop `dataset_data_point.data_entry_note`, `dataset_data_point.reviewer_comment`
- [ ] Model: add `DatasetReviewComment` ORM model
- [ ] Schema: `DatasetCommentCreateRequest` (`comment_text`, `data_point_id: Optional[int]`), `DatasetCommentResponse`
- [ ] Service: `add_comment()` — derive `commenter_role` from caller's IAM role on workflow; insert row
- [ ] Service: `list_comments()` — filter by `dataset_id`; optional `data_point_id` query param
- [ ] Router: `GET/POST /dw/{dw_id}/dataset/{dataset_id}/comments`
- [ ] IAM seed: register comment endpoints under `dm_dw_data_entry` + `dm_dw_data_review`
- [ ] Remove `WORKFLOW_DATASET_ENABLED` from `system_configuration` seed data and `config.json`
- [ ] Migration: make `dataset.workflow_id` NOT NULL (revert nullable from `061`)
- [ ] Service: replace all `_cfg_bool(cfg, "WORKFLOW_DATASET_ENABLED")` branches with `workflow.allow_review` check
- [ ] Service: remove `_resolve_unified_dataset()` (Mode 1 implicit resolution gone)
- [ ] Service: `POST /dataset` — add exclusivity pre-check + seeding from `ut_data` + blank rows
- [ ] Service: `PATCH /dataset/{id}` field update — add scope-diff reconciliation (delete out-of-scope, seed in-scope, exclusivity on additions)
- [ ] New endpoint: `GET /dw/{dw_id}/dataset/{id}/scope-check` — advisory scope diff
- [ ] Service: `get_unified_data_points()` — remove `ut_data` merge; `allow_review=false` → read `ut_data`; `allow_review=true` → read `dataset_data_point`
- [ ] Service: `unified_upsert_data_points()` — `allow_review=false` → call `DataService` direct `ut_data` write; `allow_review=true` → existing `upsert_data_points()`
- [ ] Service: `unified_delete_data_points()` — same gate as above
- [ ] Service: `unified_submit()` — remove Mode 1 branch; `allow_review=false` has no submit
- [ ] Seed step: query `ut_ic_ius` for `indicator_classification_id` per iusnid at seed time
- [ ] IAM seed: register `scope-check` endpoint in `iam_resource_api`

---

*Last updated: 2026-05-04 — Pending-review list/header/comments/association-count gated to current-stage reviewers; IAM `dm_dw_area` / `dm_dw_indicator_classification` scoped by `workflow_review_level.role_id`. Prior: 2026-04-16 — Status enums simplified: dataset `DRAFT/PENDING_REVIEW/REVISION/APPROVED/REJECTED`; data point `DRAFT/PENDING_REVIEW/APPROVED/REJECTED`; slice `PENDING/ACTIVE/REVISION_REQUESTED/APPROVED/REJECTED`. SUBMITTED, PARTIAL_APPROVED, CANCELLED removed. No partial approval — reviewer uses REQUEST_REVISION with comments.*
