"""
App DB audit event listeners for dashboard entity mutations.

Parallel to ``apps/datawarehouse/utils/audit_events.py`` — same 4-listener pattern
but gated on ``session.info["is_app_session"]`` (set in ``get_db()``) instead of
``is_dw_session``.

Key differences from the DW version
-------------------------------------
- ``dw_id`` is **nullable** — populated from ``session.info.get("audit_dw_id")`` which
  services set from the dashboard's ``system_dw_id`` when available.
- Two extra fields per entry: ``app_key`` (from ``request_app_key`` context var) and
  ``dashboard_id`` (from ``request_dashboard_id`` context var).
- ``_snapshot`` respects ``_audit_exclude_fields`` on the model to skip LONGTEXT /
  LONGBLOB / sensitive columns (e.g. ``binary_obj``, ``ai_settings``, ``properties``).
- Values in ``previous_value`` / ``new_value`` are normalized via ``_json_safe_audit_value``
  (datetime → ISO string, bytes → placeholder, etc.) so MySQL JSON columns accept them.
- No locale-table deduplication (app_db tables are single physical tables).
- ``_audit_enabled = True`` must be set on the model class; models without it are
  silently skipped.

Registration
------------
Imported once as a side-effect in ``apps/app_db/db/core.py`` so the
``@event.listens_for`` decorators register globally at startup.

Public helpers for service layer
----------------------------------
``app_buffer_manual_audit()``  — push one entry for bulk-SQL / IAM-replace patterns.
``app_buffer_delete_step()``   — thin DELETE wrapper (same API as DW version).
``app_snapshot_entity()``      — bounded scalar snapshot (same as DW version).
"""
from __future__ import annotations

import sys
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy import event
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.orm import Session

from apps.shared.config.config import settings
from apps.shared.utils.audit_context import resolve_audit_app_key


# Cap very large string values in audit JSON (binary should be excluded via _audit_exclude_fields).
_AUDIT_JSON_STR_MAX = 2000


def _json_safe_audit_value(value: Any) -> Any:
    """Convert ORM attribute values to JSON-serializable forms for logs_transaction."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"<binary {len(value)} bytes>"
    if isinstance(value, str) and len(value) > _AUDIT_JSON_STR_MAX:
        return value[:_AUDIT_JSON_STR_MAX] + f"... <truncated {len(value)} chars>"
    if isinstance(value, dict):
        return {str(k): _json_safe_audit_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe_audit_value(v) for v in value]
    return value


# ---------------------------------------------------------------------------
# Snapshot helpers
# ---------------------------------------------------------------------------

def _snapshot(obj: Any) -> dict:
    """
    Snapshot all mapped scalar attributes of *obj*, skipping any field listed
    in the model's ``_audit_exclude_fields`` tuple.
    """
    exclude: tuple = getattr(obj, "_audit_exclude_fields", ()) or ()
    state = sa_inspect(obj)
    return {
        attr.key: _json_safe_audit_value(getattr(obj, attr.key, None))
        for attr in state.attrs
        if attr.key not in exclude
    }


def _get_model_diff(obj: Any) -> tuple[dict, dict]:
    """
    Return ``(previous, new)`` dicts for changed attributes only.
    Excludes fields listed in ``_audit_exclude_fields``.
    """
    exclude: tuple = getattr(obj, "_audit_exclude_fields", ()) or ()
    state = sa_inspect(obj)
    previous: dict = {}
    new: dict = {}
    for attr in state.attrs:
        if attr.key in exclude:
            continue
        hist = attr.history
        if not hist.has_changes():
            continue
        key = attr.key
        old_val = hist.deleted[0] if hist.deleted else None
        new_val = hist.added[0] if hist.added else None
        if old_val != new_val:
            previous[key] = _json_safe_audit_value(old_val)
            new[key] = _json_safe_audit_value(new_val)
    return previous, new


def app_snapshot_entity(obj: Any) -> dict[str, Any]:
    """Bounded scalar snapshot for cascade ``previous_value`` (safe for service use)."""
    return _snapshot(obj)


# ---------------------------------------------------------------------------
# Context helpers
# ---------------------------------------------------------------------------

def _txn_log_path() -> str | None:
    from apps.shared.middleware.request_context import request_path
    raw = request_path.get()
    if not raw:
        return None
    p = str(raw).strip()
    return p[:1024] if len(p) > 1024 else p


def _context_fields(session: Session | None = None) -> dict[str, Any]:
    """Read audit context fields from request context vars."""
    from apps.shared.middleware.request_context import (
        request_user_id,
        request_dashboard_id,
    )
    return {
        "user_id": request_user_id.get() or 0,
        "app_key": resolve_audit_app_key(
            session=session,
            default=settings.DFA_DASH_APP_KEY,
        ),
        "dashboard_id": request_dashboard_id.get(),
    }


# ---------------------------------------------------------------------------
# Internal: process one ORM object
# ---------------------------------------------------------------------------

def _process_obj(
    obj: Any,
    action: str,
    seen: set,
    pending: list,
    user_id: int,
    dw_id: int | None,
    app_key: str | None,
    dashboard_id: int | None,
    now: datetime,
) -> None:
    """Evaluate one ORM object and append an audit entry to *pending* if warranted."""
    if not getattr(obj, "_audit_enabled", False):
        return

    module: str = getattr(obj, "_audit_module", None) or type(obj).__name__
    nid_field: str | None = getattr(obj, "_audit_nid_field", None)
    gid_field: str | None = getattr(obj, "_audit_gid_field", None)

    entity_nid = getattr(obj, nid_field, None) if nid_field else None
    identifier = str(getattr(obj, gid_field, None)) if gid_field else (str(entity_nid) if entity_nid is not None else None)

    dedup_key = (module, entity_nid)
    if dedup_key in seen:
        return
    seen.add(dedup_key)

    if action == "CREATE":
        prev_val = None
        new_val = _snapshot(obj)
    elif action == "DELETE":
        prev_val = _snapshot(obj)
        new_val = None
    else:  # UPDATE
        prev_val, new_val = _get_model_diff(obj)
        if not prev_val and not new_val:
            return  # nothing actually changed

    pending.append({
        "user_id": user_id,
        "dw_id": dw_id,
        "app_key": app_key,
        "dashboard_id": dashboard_id,
        "path": _txn_log_path(),
        "action": action,
        "module": module,
        "identifier": identifier,
        "previous_value": prev_val or None,
        "new_value": new_val or None,
        "status": "SUCCESS",
        "created": now,
    })


# ---------------------------------------------------------------------------
# Event listeners
# ---------------------------------------------------------------------------

@event.listens_for(Session, "before_flush")
def _app_capture_audit_changes(session: Session, flush_context: Any, instances: Any) -> None:
    """
    Capture UPDATE and DELETE audit entries for app_db session objects.
    New objects are stashed for after_flush where PKs will be assigned.
    """
    if not session.info.get("is_app_session"):
        return

    ctx = _context_fields(session)
    user_id: int = ctx["user_id"]
    app_key: str | None = ctx["app_key"]
    dashboard_id: int | None = ctx["dashboard_id"]
    dw_id: int | None = session.info.get("audit_dw_id")
    now = datetime.utcnow()

    session.info["audit_user_id"] = user_id
    session.info["audit_app_key"] = app_key
    session.info["audit_dashboard_id"] = dashboard_id
    session.info["audit_dw_id_snap"] = dw_id
    session.info["audit_now"] = now

    session.info["pending_new_objects_app"] = list(session.new)

    seen: set = session.info.setdefault("audit_seen_app", set())
    pending: list = session.info.setdefault("pending_audit_app", [])

    for obj in session.dirty:
        _process_obj(obj, "UPDATE", seen, pending, user_id, dw_id, app_key, dashboard_id, now)
    for obj in session.deleted:
        _process_obj(obj, "DELETE", seen, pending, user_id, dw_id, app_key, dashboard_id, now)


@event.listens_for(Session, "after_flush")
def _app_capture_creates(session: Session, flush_context: Any) -> None:
    """Capture CREATE audit entries after INSERT (PKs now populated)."""
    if not session.info.get("is_app_session"):
        return

    new_objects: list = session.info.pop("pending_new_objects_app", [])
    if not new_objects:
        return

    dw_id: int | None = session.info.get("audit_dw_id_snap")
    user_id: int = session.info.get("audit_user_id", 0)
    app_key: str | None = session.info.get("audit_app_key")
    dashboard_id: int | None = session.info.get("audit_dashboard_id")
    now: datetime = session.info.get("audit_now", datetime.utcnow())
    seen: set = session.info.setdefault("audit_seen_app", set())
    pending: list = session.info.setdefault("pending_audit_app", [])

    for obj in new_objects:
        _process_obj(obj, "CREATE", seen, pending, user_id, dw_id, app_key, dashboard_id, now)


@event.listens_for(Session, "after_commit")
def _app_write_audit_logs(session: Session) -> None:
    """Write buffered app audit entries to logs_transaction after a successful commit."""
    if not session.info.get("is_app_session"):
        return

    entries: list = session.info.pop("pending_audit_app", [])
    session.info.pop("audit_seen_app", None)
    session.info.pop("audit_user_id", None)
    session.info.pop("audit_app_key", None)
    session.info.pop("audit_dashboard_id", None)
    session.info.pop("audit_dw_id_snap", None)
    session.info.pop("audit_now", None)

    if not entries:
        return

    try:
        from apps.app_db.db.core import SessionLocal
        from apps.app_db.models.core import LogsTransactions

        db = SessionLocal()
        try:
            for entry in entries:
                db.add(LogsTransactions(**entry))
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"app_audit_events: write failed (non-fatal): {exc}", file=sys.stderr)
        finally:
            db.close()
    except Exception as exc:
        print(f"app_audit_events: session open failed (non-fatal): {exc}", file=sys.stderr)


@event.listens_for(Session, "after_rollback")
def _app_discard_audit_buffer(session: Session) -> None:
    """Discard buffered entries on rollback so stale data never leaks."""
    if not session.info.get("is_app_session"):
        return
    session.info.pop("pending_audit_app", None)
    session.info.pop("pending_new_objects_app", None)
    session.info.pop("audit_seen_app", None)
    session.info.pop("audit_user_id", None)
    session.info.pop("audit_app_key", None)
    session.info.pop("audit_dashboard_id", None)
    session.info.pop("audit_dw_id_snap", None)
    session.info.pop("audit_now", None)


# ---------------------------------------------------------------------------
# Public helpers for service layer
# ---------------------------------------------------------------------------

def app_buffer_manual_audit(
    session: Session,
    action: str,
    module: str,
    identifier: str | None = None,
    previous_value: dict | None = None,
    new_value: dict | None = None,
    description: str | None = None,
) -> None:
    """
    Push one audit entry into the app session's pending buffer.

    Use inside an open app_db session BEFORE commit for operations that bypass ORM
    tracking — bulk SQL deletes/updates, IAM replace patterns, language imports.

    The ``dw_id`` is taken from ``session.info.get("audit_dw_id")`` (nullable).
    ``app_key`` and ``dashboard_id`` are read from request context vars.

    If the session rolls back the entry is discarded by ``_app_discard_audit_buffer``.
    """
    if not session.info.get("is_app_session"):
        return

    ctx = _context_fields(session)
    session.info.setdefault("pending_audit_app", []).append({
        "user_id": ctx["user_id"],
        "dw_id": session.info.get("audit_dw_id"),
        "app_key": ctx["app_key"],
        "dashboard_id": ctx["dashboard_id"],
        "path": _txn_log_path(),
        "action": action,
        "module": module[:100] if module else "unknown",
        "identifier": identifier[:255] if identifier else None,
        "previous_value": previous_value,
        "new_value": new_value,
        "status": "SUCCESS",
        "description": description,
        "created": datetime.utcnow(),
    })


def app_buffer_delete_step(
    session: Session,
    *,
    module: str,
    description: str,
    identifier: str | None = None,
    previous_value: dict[str, Any] | None = None,
) -> None:
    """DELETE cascade step (wraps app_buffer_manual_audit)."""
    app_buffer_manual_audit(
        session,
        action="DELETE",
        module=module,
        identifier=identifier,
        previous_value=previous_value if previous_value is not None else {},
        description=description,
    )
