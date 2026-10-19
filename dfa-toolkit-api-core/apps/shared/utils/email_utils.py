"""
Email notification utilities.

Single entry point: send_email(template, recipient_email, context, ...)

Templates are managed in the dfa_email_templates DB table (seeded from
apps/shared/data/email_templates.json). The caller builds the context dict
for the chosen template and passes it here — no per-template wrapper needed.

Template keys are enumerated in EmailTemplate for discoverability and
import-time validation. Each enum member's docstring lists the context
variables that template expects.

Usage:
    from apps.shared.utils.email_utils import send_email, EmailTemplate

    send_email(
        template=EmailTemplate.DATASET_RETURNED,
        recipient_email=operator.email,
        recipient_name=operator.full_name,
        context={
            "full_name": operator.full_name,
            "dataset_name": dataset.dataset_name,
            "returned_on": "2025-01-16",
            "corrected_count": "2",
            "rejection_reasons": "Value Deviation, Source Missing",
            "reviewer_remarks": "Two indicators need verification",
            "dataset_url": get_fed_email_urls()[0],
            "from_name": get_app_from_name(),
        },
        locale="en",
    )
"""
import logging
from enum import Enum
from typing import Any, Dict, Optional, Tuple
from urllib.parse import quote

from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_EMAIL_UTILS_SOURCE = "apps.shared.utils.email_utils"


def get_app_from_name() -> str:
    """
    Returns the APP_NAME from system_configuration for the current request's app_key.
    Falls back to settings.SMTP_FROM_NAME if the key is not configured or on any error.
    """
    from apps.shared.config.config import settings
    from apps.shared.utils.ius_utils import _current_app_key

    app_key = _current_app_key.get(None) or settings.DEFAULT_APP_KEY
    if not app_key:
        return settings.SMTP_FROM_NAME
    try:
        from apps.app_db.db.core import SessionLocal
        from apps.app_db.models.core import SystemConfiguration

        db = SessionLocal()
        try:
            row = (
                db.query(SystemConfiguration.key_value)
                .filter(
                    SystemConfiguration.app_key == app_key,
                    SystemConfiguration.key_code == "APP_NAME",
                )
                .first()
            )
            if row and row[0] and row[0].strip():
                return row[0].strip()
        finally:
            db.close()
    except Exception:
        pass
    return settings.SMTP_FROM_NAME


def _resolve_app_key(app_key: Optional[str] = None) -> str:
    from apps.shared.config.config import settings
    from apps.shared.utils.ius_utils import _current_app_key

    return (app_key or _current_app_key.get(None) or settings.DEFAULT_APP_KEY or "").strip()


def _parse_origin_url(raw: Optional[str]) -> str:
    """Return first non-empty comma-separated origin segment, trimmed."""
    if raw is None:
        return ""
    for part in str(raw).split(","):
        segment = part.strip()
        if segment:
            return segment
    return ""


def _lookup_fed_origin_from_db(app_key: str, db: Any) -> str:
    from apps.app_db.models.core import SystemApplicationClient

    row = (
        db.query(SystemApplicationClient)
        .filter(
            SystemApplicationClient.app_key == app_key,
            SystemApplicationClient.app_type == "FED",
            SystemApplicationClient.status == "ACTIVE",
        )
        .order_by(SystemApplicationClient.id.asc())
        .first()
    )
    if row is None:
        return ""
    return _parse_origin_url(row.origin_url)


def _resolve_fed_origin(app_key: Optional[str], db: Any) -> str:
    """Resolve origin string using an open DB session (no session lifecycle here)."""
    from apps.shared.config.config import settings

    key = _resolve_app_key(app_key)
    if not key:
        return ""

    try:
        origin = _lookup_fed_origin_from_db(key, db)
    except Exception as exc:
        logger.debug("get_fed_email_urls: DB lookup failed for app_key=%s: %s", key, exc)
        origin = ""

    if origin:
        return origin

    if key == settings.DFA_DM_APP_KEY:
        return (settings.DFA_DM_FED_ORIGIN_URL or "").strip()

    logger.info("get_fed_email_urls: no origin for app_key=%s", key)
    return ""


def get_fed_email_urls(
    app_key: Optional[str] = None,
    db: Any = None,
) -> Tuple[str, str]:
    """
    Resolve email link URLs for the requesting FED app (single DB lookup).

    Returns:
        login_url: FED origin as-is (empty when unresolved).
        reset_base: ``{origin}/reset-password`` (empty when unresolved).

    Priority for origin:
      1. Non-empty system_application_client.origin_url (app_key + FED + ACTIVE).
      2. If still empty and app_key is DFA_DM, settings.DFA_DM_FED_ORIGIN_URL.
      3. Otherwise both strings are empty (email still sends).
    """
    owns_db = db is None
    if owns_db:
        from apps.app_db.db.core import SessionLocal

        db = SessionLocal()
    try:
        origin = _resolve_fed_origin(app_key, db)
    finally:
        if owns_db and db is not None:
            db.close()

    if not origin:
        return "", ""

    login_url = origin
    reset_base = f"{origin.rstrip('/')}/reset-password"
    return login_url, reset_base


def build_password_reset_url(
    token: str,
    app_key: Optional[str] = None,
    db: Any = None,
    *,
    reset_base: Optional[str] = None,
) -> str:
    """
    Build full reset link with JWT query param, or empty when no origin.

    Pass ``reset_base`` from a prior ``get_fed_email_urls()`` call to avoid a
    second DB lookup when building login_url and reset_url in the same email.
    """
    base = reset_base
    if base is None:
        _, base = get_fed_email_urls(app_key, db)
    if not base:
        return ""
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}token={quote(token, safe='')}"


class EmailTemplate(str, Enum):
    # ── Account ───────────────────────────────────────────────────────────────
    WELCOME = "welcome"
    """User self-registered.
    Context: full_name, username, login_url, from_name
    """

    WELCOME_AUTO_PASSWORD = "welcome_auto_password"
    """Account created by admin with auto-generated password.
    Context: full_name, username, plain_password, login_url, from_name
    """

    ACCOUNT_INVITE_SET_PASSWORD = "account_invite_set_password"
    """Admin created account: user must set password via SPA link (JWT, same
    as forgot-password). Context: full_name, username, reset_url, expires_in,
    login_url, from_name
    """

    PASSWORD_RESET = "password_reset"
    """Sent after forgot-password flow completes (new password set); no password in email.
    Context: full_name, username, login_url, from_name
    """

    PASSWORD_RESET_LINK = "password_reset_link"
    """Forgot-password: email contains SPA link with JWT query param.
    Context: full_name, username, reset_url, expires_in, login_url, from_name
    """

    PASSWORD_CHANGED = "password_changed"
    """Self-service password change (PATCH /iam/users/me/password); no password in email.
    Context: full_name, username, login_url, from_name
    """

    # ── Dataset / Review workflow ─────────────────────────────────────────────
    DATASET_SUBMITTED = "dataset_submitted"
    """Sent to reviewer(s) when an operator submits a dataset.
    Context: full_name, dataset_name, submitter_name, submitted_at,
             workflow_name, review_url, from_name
    """

    DATASET_APPROVED = "dataset_approved"
    """Sent to the operator when their dataset is fully approved.
    Context: full_name, dataset_name, approved_on, workflow_name,
             dataset_url, from_name
    """

    DATASET_REJECTED = "dataset_rejected"
    """Sent to the operator when their dataset is fully rejected.
    Context: full_name, dataset_name, rejected_on, rejection_reasons,
             reviewer_remarks, dataset_url, from_name
    """

    DATASET_RETURNED = "dataset_returned"
    """Sent to the operator when some data points are returned for correction.
    Context: full_name, dataset_name, returned_on, corrected_count,
             rejection_reasons, reviewer_remarks, dataset_url, from_name
    """

    REVIEW_ASSIGNED = "review_assigned"
    """Sent to a reviewer when a corrected dataset is resubmitted.
    Context: full_name, dataset_name, submitter_name, submitted_at,
             revision_count, review_url, from_name
    """

    DATASET_STATUS_CHANGED = "dataset_status_changed"
    """Broadcast to operator and workflow stakeholders when dataset_status changes.
    Context: full_name, dataset_name, dataset_id, previous_status,
             new_status, workflow_name, changed_at, actor_name, login_url, from_name
    """

    DATA_POINTS_REVIEWED = "data_points_reviewed"
    """Sent to the dataset operator after a reviewer approves/rejects rows in a batch.
    Context: full_name, dataset_name, previous_status, dataset_status,
             workflow_name, reviewer_name, reviewed_at, summary_line,
             points_detail_html, points_detail_text, login_url, from_name
    """

    PERIOD_OPEN = "period_open"
    """Sent to all operators and reviewers when an entry period is opened.
    Context: full_name, period_name, workflow_name, open_at, close_at,
             role_message, login_url, from_name
    """


def send_email(
    template: EmailTemplate,
    recipient_email: Optional[str],
    context: Dict[str, Any],
    recipient_name: str = "",
    locale: str = "en",
) -> None:
    """
    Send an email using the given template and context via dfa_mailer_service.

    Args:
        template:         EmailTemplate enum member identifying which template to render.
        recipient_email:  Recipient address. If None or empty the send is silently skipped.
        context:          Dict of Jinja2 template variables. Caller is responsible for
                          building this dict — see each EmailTemplate member's docstring
                          for the expected keys.
        recipient_name:   Optional display name used by the mailer for personalisation
                          (not a template variable — passed separately to the mailer).
        locale:           BCP-47 locale code selecting the template language (e.g. "en",
                          "fr", "ar"). Defaults to "en".

    Returns:
        None. Errors are logged but never raised — email failure must not break
        the calling business operation.
    """
    if not recipient_email:
        logger.info(
            "send_email: skipped [%s] — no recipient address (name=%s)",
            template.value,
            recipient_name or "(unknown)",
        )
        return

    # Ensure from_name is in context for template body and SMTP envelope (async jobs too).
    context = dict(context)
    context.setdefault("from_name", get_app_from_name())

    try:
        from apps.shared.services.dfa_mailer import get_email_service

        svc = get_email_service()
        result = svc.send_email(
            template_key=template.value,
            recipient_email=recipient_email,
            context=context,
            language=locale,
            recipient_name=recipient_name or "",
        )
        logger.info(
            "send_email: [%s] to=%s result=%s",
            template.value,
            recipient_email,
            result,
        )
    except Exception as exc:
        log_background_incident(
            f"send_email: failed [{template.value}] to={recipient_email} — {exc}",
            error_code="SEND_EMAIL_FAILED",
            exc=exc,
            source=_EMAIL_UTILS_SOURCE,
        )
