# Notification Module — Architecture & Developer Guide

## Scope

Covers **dataset workflow events only**. Generic entity events (Indicator, Area, etc.) are out of scope and can be added later by inserting rows into `system_notification_template` and `system_notification_template_i18n` — no code or schema change needed.

---

## Channels

| Value | Meaning |
|-------|---------|
| `INAPP` | Insert row into `system_notification` (inbox) only |
| `EMAIL` | Send email via existing `send_email()` only |
| `BOTH` | Both INAPP + EMAIL |
| `NONE` | Suppress — no notification fired |

---

## Locale Support

Notifications are stored in the **DW's configured language**. The application and DW already carry a default language — no per-user locale column is needed.

### Locale resolution (inside `emit()`)

```
1. SystemDatawarehouse.dw_default_language  (e.g. 'fr')
2. 'en'                                     (system fallback)
```

### How notification text is produced

1. Resolve locale from `SystemDatawarehouse.dw_default_language`
2. Fetch the `system_notification_template` master row for `(event_code, recipient_type)`
3. Fetch the `system_notification_template_i18n` row for `(master_id, locale)` — fall back to `locale='en'`
4. Render `inapp_title` and `inapp_body` as Jinja2 strings against the event context
5. Store the **rendered** title + body (and the resolved locale) in `system_notification`

The inbox always shows text in the DW's language without runtime re-rendering on read.

---

## Database Changes

### Modified table: `iam_user`

```sql
ALTER TABLE iam_user
  ADD COLUMN notification_unread_cnt INT NOT NULL DEFAULT 0 AFTER last_loggedin_on;
```

Denormalized badge counter — same pattern as `cmnt_cnt` on `dataset`. Incremented atomically on INAPP row creation, decremented on read/delete.

---

### New table: `system_notification_template`

Master table. Holds locale-agnostic config per event + recipient combination. One row per `(event_code, recipient_type)`.

```sql
CREATE TABLE system_notification_template (
  id                 INT          PRIMARY KEY AUTO_INCREMENT,
  event_code         VARCHAR(80)  NOT NULL,
  recipient_type     ENUM(
                       'DATASET_REVIEWERS',  -- workflow reviewers scoped to this dataset
                       'DATASET_OWNER',       -- user who created/submitted the dataset
                       'EVENT_ACTOR',         -- user who triggered the event (confirmation)
                       'DW_ALL_USERS'         -- all active users in the warehouse
                     ) NOT NULL,
  channels           ENUM('INAPP','EMAIL','BOTH','NONE') NOT NULL DEFAULT 'BOTH',
  email_template_key VARCHAR(80)  NULL,       -- maps to EmailTemplate enum; NULL = no email
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME     NOT NULL,
  UNIQUE KEY uq_notif_tpl (event_code, recipient_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### New table: `system_notification_template_i18n`

i18n table. Follows the project's standard pattern (`DatasetRejectionReason` + `DatasetRejectionReasonI18n`, `ReviewWorkflow` + `ReviewWorkflowI18n`, etc.).

Adding a new language = inserting rows here only. No schema change.

```sql
CREATE TABLE system_notification_template_i18n (
  master_id   INT          NOT NULL,
  locale      VARCHAR(10)  NOT NULL,   -- 'en' | 'fr' | 'ar' | etc.
  inapp_title VARCHAR(255) NOT NULL,   -- Jinja2 template string
  inapp_body  TEXT         NOT NULL,   -- Jinja2 template string
  PRIMARY KEY (master_id, locale),
  CONSTRAINT fk_snt_i18n_master
    FOREIGN KEY (master_id) REFERENCES system_notification_template(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### New table: `system_notification`

Per-user inbox records. Title and body are stored **pre-rendered** in the DW's language at emit time.

**No i18n table needed here.** An inbox record is already targeted at one specific user in one language context. The rendered text is also an audit trail — retroactively re-rendering it in a different language would misrepresent what was originally communicated. The `locale` column records which language was used, for informational purposes only.

```sql
CREATE TABLE system_notification (
  id              INT          PRIMARY KEY AUTO_INCREMENT,
  user_id         INT          NOT NULL,
  event_code      VARCHAR(80)  NOT NULL,
  locale          VARCHAR(10)  NOT NULL DEFAULT 'en',  -- resolved locale at emit time
  title           VARCHAR(255) NOT NULL,               -- rendered, not a template string
  body            TEXT         NOT NULL,               -- rendered, not a template string
  context_data    JSON,                                -- raw event context for debugging
  ref_entity_type VARCHAR(50),                         -- e.g. 'DATASET'
  ref_entity_id   INT,                                 -- e.g. dataset_id
  action_url      VARCHAR(500),                        -- frontend path e.g. /datasets/17/review
  dw_id           INT,
  is_read         TINYINT(1)   NOT NULL DEFAULT 0,
  read_at         DATETIME,
  created_at      DATETIME     NOT NULL,
  INDEX idx_notif_user_read    (user_id, is_read),
  INDEX idx_notif_user_created (user_id, created_at),
  INDEX idx_notif_event        (event_code),
  INDEX idx_notif_dw           (dw_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## Event Codes

Aligned to actual `dataset.dataset_status` transitions in the codebase.

> **Note on `REJECTED` status:** The `dataset_status` enum includes `REJECTED` but no code path in `dataset_service.py` sets it. `REJECTED` only appears at the data-point level (`DatasetDataPoint.review_status`). `DATASET_REJECTED` is therefore **not included** as an event — it would never fire.

| Event Code | Trigger | Status transition | Function |
|-----------|---------|------------------|---------|
| `DATASET_SUBMITTED` | Agent's first submission | `DRAFT → PENDING_REVIEW` (`revision_count=0`) | `operator_transition()` |
| `DATASET_RESUBMITTED` | Agent resubmits after correction | `REVISION → PENDING_REVIEW` (`revision_count>0`) | `operator_transition()` |
| `DATASET_RETURNED` | Reviewer returns for correction | `PENDING_REVIEW → REVISION` | `reviewer_decision()` |
| `DATASET_APPROVED` | Final stage approved | `PENDING_REVIEW → APPROVED` | `_complete_stage_and_advance()` |
| `PERIOD_OPENED` | Admin opens data entry period | — | admin endpoint |

**Not included:** `PENDING_REVIEW → PENDING_REVIEW` (intermediate stage advance in multi-level workflow) — an internal system step, not a user-facing event.

---

## Recipient Types

| Type | Who | Resolution |
|------|-----|-----------|
| `DATASET_REVIEWERS` | Reviewers whose scope overlaps this dataset | Reuses `_collect_dataset_stakeholder_users()` from `dataset_service.py:255` |
| `DATASET_OWNER` | The user who created/submitted the dataset | `IamUser WHERE id = dataset.created_user_id` |
| `EVENT_ACTOR` | The user who triggered the event | `actor_user_id` passed to `emit()` |
| `DW_ALL_USERS` | All active users in the warehouse | `IamUser JOIN IamUserRole WHERE dw_id AND status=1` |

---

## Seeded Data

Seeded on migration. Master rows first, then i18n rows per locale.

### Master rows

```python
SEED_MASTER = [
    # (event_code,            recipient_type,        channels, email_template_key)
    ("DATASET_SUBMITTED",    "DATASET_REVIEWERS",   "BOTH",   "dataset_submitted"),
    ("DATASET_SUBMITTED",    "EVENT_ACTOR",          "EMAIL",  "dataset_submitted"),
    ("DATASET_RESUBMITTED",  "DATASET_REVIEWERS",   "BOTH",   "review_assigned"),
    ("DATASET_RETURNED",     "DATASET_OWNER",        "BOTH",   "dataset_returned"),
    ("DATASET_APPROVED",     "DATASET_OWNER",        "BOTH",   "dataset_approved"),
    ("PERIOD_OPENED",        "DW_ALL_USERS",         "BOTH",   "period_open"),
]
```

### i18n rows — English (`locale='en'`)

```python
SEED_I18N_EN = {
    ("DATASET_SUBMITTED",   "DATASET_REVIEWERS"): (
        "New dataset submitted for review",
        "Dataset '{{ dataset_name }}' was submitted by {{ actor_name }} on {{ submitted_at }}."
        " Please log in to begin your review.",
    ),
    ("DATASET_SUBMITTED",   "EVENT_ACTOR"): (
        "Your dataset has been submitted",
        "Your dataset '{{ dataset_name }}' has been submitted for review.",
    ),
    ("DATASET_RESUBMITTED", "DATASET_REVIEWERS"): (
        "Dataset resubmitted for review",
        "Dataset '{{ dataset_name }}' has been resubmitted by {{ actor_name }}"
        " (revision {{ revision_count }}).",
    ),
    ("DATASET_RETURNED",    "DATASET_OWNER"): (
        "Corrections requested on your dataset",
        "{{ corrected_count }} indicator(s) in '{{ dataset_name }}' require correction."
        " Reason: {{ rejection_reasons }}. Reviewer note: {{ reviewer_remarks }}",
    ),
    ("DATASET_APPROVED",    "DATASET_OWNER"): (
        "Your dataset has been approved",
        "Dataset '{{ dataset_name }}' has been fully approved on {{ approved_on }}.",
    ),
    ("PERIOD_OPENED",       "DW_ALL_USERS"): (
        "Data entry period is now open",
        "Data entry period '{{ period_label }}' is now open."
        " Please log in to submit your data.",
    ),
}
```

### i18n rows — French (`locale='fr'`)

```python
SEED_I18N_FR = {
    ("DATASET_SUBMITTED",   "DATASET_REVIEWERS"): (
        "Nouveau jeu de données soumis pour révision",
        "Le jeu de données '{{ dataset_name }}' a été soumis par {{ actor_name }}"
        " le {{ submitted_at }}. Veuillez vous connecter pour commencer votre révision.",
    ),
    ("DATASET_SUBMITTED",   "EVENT_ACTOR"): (
        "Votre jeu de données a été soumis",
        "Votre jeu de données '{{ dataset_name }}' a été soumis pour révision.",
    ),
    ("DATASET_RESUBMITTED", "DATASET_REVIEWERS"): (
        "Jeu de données soumis à nouveau",
        "Le jeu de données '{{ dataset_name }}' a été soumis à nouveau par {{ actor_name }}"
        " (révision {{ revision_count }}).",
    ),
    ("DATASET_RETURNED",    "DATASET_OWNER"): (
        "Corrections demandées sur votre jeu de données",
        "{{ corrected_count }} indicateur(s) dans '{{ dataset_name }}' nécessitent une correction."
        " Motif : {{ rejection_reasons }}. Note du réviseur : {{ reviewer_remarks }}",
    ),
    ("DATASET_APPROVED",    "DATASET_OWNER"): (
        "Votre jeu de données a été approuvé",
        "Le jeu de données '{{ dataset_name }}' a été approuvé le {{ approved_on }}.",
    ),
    ("PERIOD_OPENED",       "DW_ALL_USERS"): (
        "La période de saisie est maintenant ouverte",
        "La période de saisie '{{ period_label }}' est maintenant ouverte."
        " Veuillez vous connecter pour soumettre vos données.",
    ),
}
```

Add Arabic (`ar`) and other locales by adding a `SEED_I18N_AR` dict with the same keys and translated strings.

---

## NotificationService

**File:** `apps/app_db/services/notification_service.py`

```python
class NotificationService:

    def emit(
        self,
        db: Session,
        event_code: str,
        context: dict,                   # Jinja2 variables + entity references
        dw_id: int,
        app_key: str,
        actor_user_id: Optional[int] = None,
        action_url: Optional[str] = None,  # frontend navigation path
    ) -> None:
        """
        Main entry point. Always called after db.commit().

        For each active template row matching event_code:
          1. Resolve recipients by recipient_type
          2. Resolve locale: dw_default_language → 'en'
          3. Fetch i18n row for (master_id, locale), fallback to 'en'
          4. Render Jinja2 title + body
          5. INSERT system_notification row        (INAPP channel)
          6. UPDATE notification_unread_cnt + 1    (INAPP channel)
          7. Call send_email()                     (EMAIL channel)
        Commits all notification rows in one transaction.
        """

    def _resolve_locale(self, dw_id: int, db: Session) -> str:
        """SystemDatawarehouse.dw_default_language → 'en'."""

    def _get_i18n(
        self, db, master_id: int, locale: str
    ) -> Optional[SystemNotificationTemplateI18n]:
        """
        Fetch (master_id, locale). Fallback to locale='en'.
        Returns None if no row even for 'en' — notification skipped silently.
        """

    def _resolve_recipients(
        self, db, recipient_type, context, actor_user_id, dw_id, app_key
    ) -> List[IamUser]:
        # DATASET_REVIEWERS → _collect_dataset_stakeholder_users()  [dataset_service.py:255]
        # DATASET_OWNER      → IamUser WHERE id = dataset.created_user_id
        # EVENT_ACTOR        → IamUser WHERE id = actor_user_id
        # DW_ALL_USERS       → IamUser JOIN IamUserRole WHERE dw_id AND status=1

    # ── Inbox CRUD (used by router) ──────────────────────────────────────────

    def list_notifications(db, user_id, is_read, dw_id, page, page_size) -> tuple[list, int]
    def unread_count(db, user_id, dw_id) -> int
    def mark_read(db, notification_id, user_id) -> SystemNotification
    def mark_read_bulk(db, ids, user_id) -> int
    def mark_all_read(db, user_id, dw_id) -> int
    def delete_notification(db, notification_id, user_id) -> None
    def delete_bulk(db, ids, user_id) -> int
```

---

## Developer Integration

### Golden rule
Always call `emit()` **after** `db.commit()`. Never inside a transaction.

### Dataset workflow — `dataset_service.py`

Replace the existing `_notify_dataset_status_change()` calls:

```python
from apps.app_db.services.notification_service import notification_service

# In operator_transition(), after db.commit():
event_code = "DATASET_RESUBMITTED" if prev == "REVISION" else "DATASET_SUBMITTED"
notification_service.emit(
    db=db,
    event_code=event_code,
    context={
        "dataset_id":     dataset.dataset_id,
        "dataset_name":   dataset.dataset_name,
        "actor_name":     actor_name,
        "submitted_at":   submitted_at,
        "revision_count": str(dataset.revision_count),
        "login_url":      login_url,
        "from_name":      get_app_from_name(),
    },
    dw_id=dw_id,
    app_key=app_key,
    actor_user_id=user_id,
    action_url=f"/datasets/{dataset.dataset_id}/review",
)

# In reviewer_decision(), after db.commit():
if new_status == "REVISION":
    notification_service.emit(
        db=db,
        event_code="DATASET_RETURNED",
        context={
            "dataset_id":        dataset.dataset_id,
            "dataset_name":      dataset.dataset_name,
            "actor_name":        reviewer_name,
            "corrected_count":   str(n_rej),
            "rejection_reasons": rejection_reasons_str,
            "reviewer_remarks":  reviewer_remarks_str,
            "login_url":         login_url,
            "from_name":         get_app_from_name(),
        },
        dw_id=dw_id, app_key=app_key, actor_user_id=user_id,
        action_url=f"/datasets/{dataset.dataset_id}",
    )
elif new_status == "APPROVED":
    notification_service.emit(
        db=db,
        event_code="DATASET_APPROVED",
        context={
            "dataset_id":   dataset.dataset_id,
            "dataset_name": dataset.dataset_name,
            "actor_name":   reviewer_name,
            "approved_on":  now_str,
            "login_url":    login_url,
            "from_name":    get_app_from_name(),
        },
        dw_id=dw_id, app_key=app_key, actor_user_id=user_id,
        action_url=f"/datasets/{dataset.dataset_id}",
    )
```

### Period open — admin endpoint

```python
notification_service.emit(
    db=db,
    event_code="PERIOD_OPENED",
    context={
        "period_label": "Q1 2026",
        "open_at":      period.open_at.isoformat(sep=" ", timespec="seconds"),
        "close_at":     period.close_at.isoformat(sep=" ", timespec="seconds") if period.close_at else "—",
        "login_url":    login_url,
        "from_name":    get_app_from_name(),
    },
    dw_id=dw_id,
    app_key=app_key,
    actor_user_id=current_user_id,
    action_url="/datasets",
)
```

---

## Internal Call Flow

```
db.commit()   ← primary business transaction commits first
    │
    ▼
notification_service.emit(db, event_code, context, dw_id, app_key, actor_user_id, action_url)
    │
    ├─ Resolve locale: SystemDatawarehouse.dw_default_language → 'en'
    │
    ├─ Load active master rows: SELECT * FROM system_notification_template
    │                           WHERE event_code = X AND is_active = 1
    │
    └─ For each master row:
         │
         ├─ Fetch i18n: SELECT * FROM system_notification_template_i18n
         │              WHERE master_id = X AND locale = resolved_locale
         │              (fallback: retry with locale='en')
         │
         ├─ Resolve recipients by master.recipient_type:
         │    DATASET_REVIEWERS → _collect_dataset_stakeholder_users()
         │    DATASET_OWNER      → IamUser WHERE id = dataset.created_user_id
         │    EVENT_ACTOR        → IamUser WHERE id = actor_user_id
         │    DW_ALL_USERS       → IamUser JOIN IamUserRole WHERE dw_id AND status=1
         │
         └─ For each recipient (skip if no email / inactive):
               │
               ├─ Render: title = jinja2(i18n.inapp_title, context)
               │          body  = jinja2(i18n.inapp_body,  context)
               │
               ├─ INAPP (channels IN INAPP, BOTH):
               │    INSERT system_notification (user_id, event_code, locale,
               │                               title, body, context_data,
               │                               ref_entity_type, ref_entity_id,
               │                               action_url, dw_id, is_read=0)
               │    UPDATE iam_user
               │      SET notification_unread_cnt = notification_unread_cnt + 1
               │    WHERE id = user_id
               │
               └─ EMAIL (channels IN EMAIL, BOTH):
                    send_email(
                        template = EmailTemplate[master.email_template_key],
                        recipient_email = user.email,
                        recipient_name  = full_name,
                        context         = context,
                        locale          = resolved_locale,
                    )
                    └─ dfa_mailer → system_bg_job_queue (DB mode)
                                  → Celery task          (Celery mode)
    │
    ▼
db.commit()   ← flush all system_notification rows in one transaction
```

---

## REST API

### Inbox — `AUTHENTICATED` (own records only)

```
GET    /notifications
       ?is_read=0|1        filter by read state
       ?dw_id=3            filter by warehouse
       ?page=1&page_size=20

GET    /notifications/unread-count
       ?dw_id=3

PATCH  /notifications/{id}/read      single mark-read
PATCH  /notifications/read           bulk mark-read   body: {"ids": [42, 43]}
PATCH  /notifications/read-all       ?dw_id

DELETE /notifications/{id}           single delete
DELETE /notifications                bulk delete      body: {"ids": [42, 43]}
```

---

## New Files

```
apps/app_db/
├── models/core.py                                   MODIFY — add ORM models:
│                                                             SystemNotificationTemplate
│                                                             SystemNotificationTemplateI18n
│                                                             SystemNotification
│                                                           add column to IamUser:
│                                                             notification_unread_cnt
├── schemas/notification.py                          NEW    — inbox Pydantic schemas
├── services/notification_service.py                 NEW    — NotificationService
├── router/notification.py                           NEW    — inbox REST endpoints
└── migrations/versions/
    └── 108_notification_module.py                   NEW
        revision      = "108_notification_module"    -- 24 chars, within 32-char limit
        down_revision = "107_cmnt_cnt"
main.py                                              MODIFY — register notification router
```

---

## Migration (`108_notification_module.py`)

```python
revision      = "108_notification_module"
down_revision = "107_cmnt_cnt"

def upgrade():
    conn = op.get_bind()

    # 1. Add badge counter to iam_user
    conn.execute(text("""
        ALTER TABLE iam_user
          ADD COLUMN notification_unread_cnt INT NOT NULL DEFAULT 0
          AFTER last_loggedin_on
    """))

    # 2. Master template table
    conn.execute(text("""
        CREATE TABLE system_notification_template ( ... )
    """))

    # 3. Template i18n table
    conn.execute(text("""
        CREATE TABLE system_notification_template_i18n ( ... )
    """))

    # 4. Inbox table
    conn.execute(text("""
        CREATE TABLE system_notification ( ... )
    """))

    # 5. Seed master rows + EN and FR i18n rows
    _seed_notification_templates(conn)
```

---

## Unread Count Maintenance

| Operation | Counter update |
|-----------|---------------|
| INAPP notification created | `notification_unread_cnt += 1` |
| `mark_read(id)` | `notification_unread_cnt = GREATEST(0, cnt - 1)` |
| Bulk `mark_read(ids)` | `notification_unread_cnt -= count(unread rows in batch)` |
| `mark_all_read()` | `notification_unread_cnt = 0` |
| `delete(id)` when `is_read=0` | `notification_unread_cnt = GREATEST(0, cnt - 1)` |
| Bulk `delete(ids)` | `notification_unread_cnt -= count(unread rows in batch)` |

Always use atomic SQL to avoid race conditions:
```python
db.query(IamUser).filter(IamUser.id == user_id).update(
    {"notification_unread_cnt": IamUser.notification_unread_cnt + 1}
)
```

---

## Future Enhancements

| Enhancement | Notes |
|------------|-------|
| Per-user notification preferences | Channel override per user per event code |
| Delivery tracking log | Email sent/failed/bounced audit trail |
| Entity event notifications | Add master + i18n rows for `INDICATOR_CREATED`, `AREA_CREATED`, etc. |
| Reminder / scheduled events | `PERIOD_CLOSING_SOON`, `SUBMISSION_OVERDUE` — requires Celery beat |
| Soft delete | `is_deleted` + `deleted_at` on `system_notification` |
