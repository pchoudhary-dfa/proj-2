"""
Centralized SQLAlchemy event listeners for automatic DW audit logging.

How it works
------------
1. ``before_flush`` — captures UPDATE and DELETE objects (attribute history is
   only available before the flush resets it).  Saves references to new objects
   into ``session.info["pending_new_objects"]`` — PKs are not yet assigned here
   so CREATE snapshots cannot be taken yet.  Locale-model deduplication
   (AreaEn / AreaAr / AreaFr → one entry) is handled via
   ``session.info["audit_seen"]``.

2. ``after_flush`` — processes CREATE objects whose auto-increment PKs are now
   populated (MySQL returns ``lastrowid`` as part of the INSERT execution).
   Snapshots each new object and appends to ``session.info["pending_audit"]``.

3. ``after_commit`` — drains the buffer and writes all entries to the App DB
   via a fresh ``SessionLocal()`` so there is no recursive-flush risk and logs
   are only written after a successful commit.

4. ``after_rollback`` — discards the buffer so stale entries never leak into
   the next transaction.

Registration
------------
Import this module once at startup (done in
``apps/datawarehouse/db/datawarehouse.py``).  The ``@event.listens_for``
decorators register globally against ``Session`` the moment the module is
imported.

DW-session guard
----------------
The global listener fires for *every* SQLAlchemy session, including the App
DB ``SessionLocal``.  We skip non-DW sessions by checking
``session.info.get("is_dw_session")``, which is set explicitly in
``get_warehouse_session``.
"""
from __future__ import annotations

import sys
from datetime import datetime
from typing import Any

from sqlalchemy import event
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.orm import Session

from apps.shared.config.config import settings
from apps.shared.utils.audit_context import resolve_audit_app_key


# Maximum IDs logged in cascade-delete summaries (`previous_value`).
AUDIT_DELETED_ID_CAP = 500


def _txn_log_path() -> str | None:
    """
    Request path + query for logs_transaction, aligned with logs_server_error / build_log_payload:
    ASGI middleware sets ``request_path`` to ``{path}?{query}`` when a query string is present.
    Truncated to 1024 chars like ``write_log_to_db``.
    """
    from apps.shared.middleware.request_context import request_path

    raw = request_path.get()
    if raw is None:
        return None
    p = str(raw).strip()
    if not p:
        return None
    return p[:1024] if len(p) > 1024 else p


def deleted_ids_preview(ids: list[int], cap: int = AUDIT_DELETED_ID_CAP) -> dict[str, Any]:
    """
    Normalize deletions IDs for audit JSON: total count plus a capped prefix list.

    IDs are deduplicated then sorted so preview is deterministic.
    """
    uniq = sorted({int(x) for x in ids if x is not None})
    return {"count": len(uniq), "preview_ids": uniq[:cap]}


def resolve_audit_module(obj: Any) -> str:
    """
    Resolve the logs_transaction ``module`` slug for an ORM object.

    SR indicator-classification rows (sources/publishers) log as ``source``.
    """
    module: str = getattr(obj, "_audit_module", None) or type(obj).__name__
    if module == "indicator_classification":
        ic_type = (getattr(obj, "ic_type", None) or "").strip().upper()
        if ic_type == "SR":
            return "source"
    return module


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def buffer_manual_audit(
    session: Session,
    action: str,
    module: str,
    identifier: str | None = None,
    previous_value: dict | None = None,
    new_value: dict | None = None,
    description: str | None = None,
) -> None:
    """
    Manually push one audit entry into the session's pending buffer.

    Use this inside an open DW session BEFORE commit for operations that cannot
    be captured automatically — e.g. bulk SQL deletes/upserts that bypass ORM
    object tracking (``query.delete(synchronize_session=False)``).

    The entry is written to the App DB by the ``after_commit`` listener alongside
    any automatically-generated entries.  If the session rolls back, the entry is
    discarded by ``after_rollback``, so no orphan audit rows are created.
    """
    if not session.info.get("is_dw_session"):
        return

    from apps.shared.middleware.request_context import request_user_id, request_db_id

    dw_id = request_db_id.get()
    if dw_id is None:
        return

    app_key = resolve_audit_app_key(session=session, default=settings.DFA_DM_APP_KEY)

    session.info.setdefault("pending_audit", []).append({
        "user_id": request_user_id.get() or 0,
        "dw_id": dw_id,
        "app_key": app_key,
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


def _get_model_diff(obj: Any) -> tuple[dict, dict]:
    """
    Return ``(previous, new)`` dicts containing only the attributes that
    changed since the object was last loaded from the DB.

    Uses SQLAlchemy's internal attribute history so no manual before/after
    snapshot is needed.  Works on both locale-built and plain Base models.
    """
    state = sa_inspect(obj)
    previous: dict = {}
    new: dict = {}
    for attr in state.attrs:
        hist = attr.history
        if not hist.has_changes():
            continue
        key = attr.key
        old_val = hist.deleted[0] if hist.deleted else None
        new_val = hist.added[0] if hist.added else None
        if old_val != new_val:
            previous[key] = old_val
            new[key] = new_val
    return previous, new


def _snapshot(obj: Any) -> dict:
    """Snapshot all mapped scalar attributes of *obj* (used for CREATE/DELETE)."""
    state = sa_inspect(obj)
    return {
        attr.key: getattr(obj, attr.key, None)
        for attr in state.attrs
    }


def snapshot_entity_for_audit(obj: Any) -> dict[str, Any]:
    """Bounded scalar snapshot of one ORM row for cascade ``previous_value``."""
    return _snapshot(obj)


def buffer_delete_step(
    session: Session,
    *,
    module: str,
    description: str,
    identifier: str | None = None,
    previous_value: dict[str, Any] | None = None,
) -> None:
    """DELETE audit row with ``previous_value`` only (bulk SQL cascade steps)."""
    buffer_manual_audit(
        session,
        action="DELETE",
        module=module,
        identifier=identifier,
        previous_value=previous_value if previous_value is not None else {},
        description=description,
    )


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _process_obj(
    obj: Any,
    action: str,
    seen: set,
    pending: list,
    user_id: int,
    dw_id: int,
    app_key: str | None,
    now: datetime,
) -> None:
    """Evaluate one ORM object and append an audit entry to *pending* if warranted."""
    if not getattr(obj, "_audit_enabled", False):
        return

    module: str = resolve_audit_module(obj)
    nid_field: str | None = getattr(obj, "_audit_nid_field", None)
    gid_field: str | None = getattr(obj, "_audit_gid_field", None)

    entity_nid = getattr(obj, nid_field, None) if nid_field else None
    identifier = str(getattr(obj, gid_field, None)) if gid_field else entity_nid

    # Dedup locale-multiplied tables: (module, entity_nid) per flush cycle.
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
def _capture_audit_changes(session: Session, flush_context: Any, instances: Any) -> None:
    """
    Capture UPDATE and DELETE audit entries (attribute history only available here).
    Save new objects aside for after_flush where their auto-increment PKs will be set.
    """
    if not session.info.get("is_dw_session"):
        return

    from apps.shared.middleware.request_context import request_user_id, request_db_id

    dw_id = request_db_id.get()
    if dw_id is None:
        return

    user_id = request_user_id.get() or 0
    app_key = resolve_audit_app_key(session=session, default=settings.DFA_DM_APP_KEY)
    now = datetime.utcnow()

    # Persist request context for after_flush (runs synchronously but avoids re-reading vars).
    session.info["audit_user_id"] = user_id
    session.info["audit_dw_id"] = dw_id
    session.info["audit_app_key"] = app_key
    session.info["audit_now"] = now

    # Save new-object references before session.new is cleared by the flush.
    session.info["pending_new_objects"] = list(session.new)

    seen: set = session.info.setdefault("audit_seen", set())
    pending: list = session.info.setdefault("pending_audit", [])

    for obj in session.dirty:
        _process_obj(obj, "UPDATE", seen, pending, user_id, dw_id, app_key, now)
    for obj in session.deleted:
        _process_obj(obj, "DELETE", seen, pending, user_id, dw_id, app_key, now)


@event.listens_for(Session, "after_flush")
def _capture_creates(session: Session, flush_context: Any) -> None:
    """
    Capture CREATE audit entries after the INSERT has been sent to the DB.
    Auto-increment PKs (e.g. iusnid, area_nid) are now populated on the objects.
    """
    if not session.info.get("is_dw_session"):
        return

    new_objects: list = session.info.pop("pending_new_objects", [])
    if not new_objects:
        return

    dw_id = session.info.get("audit_dw_id")
    if dw_id is None:
        return

    user_id: int = session.info.get("audit_user_id", 0)
    app_key: str | None = session.info.get("audit_app_key")
    now: datetime = session.info.get("audit_now", datetime.utcnow())
    seen: set = session.info.setdefault("audit_seen", set())
    pending: list = session.info.setdefault("pending_audit", [])

    for obj in new_objects:
        _process_obj(obj, "CREATE", seen, pending, user_id, dw_id, app_key, now)


@event.listens_for(Session, "after_commit")
def _write_audit_logs(session: Session) -> None:
    """Write buffered audit entries to the App DB after a successful commit."""
    if not session.info.get("is_dw_session"):
        return

    entries: list = session.info.pop("pending_audit", [])
    session.info.pop("audit_seen", None)
    session.info.pop("audit_user_id", None)
    session.info.pop("audit_dw_id", None)
    session.info.pop("audit_app_key", None)
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
            print(f"audit_events: write failed (non-fatal): {exc}", file=sys.stderr)
        finally:
            db.close()
    except Exception as exc:
        print(f"audit_events: session open failed (non-fatal): {exc}", file=sys.stderr)


@event.listens_for(Session, "after_rollback")
def _discard_audit_buffer(session: Session) -> None:
    """Discard buffered entries when the DW transaction rolls back."""
    if not session.info.get("is_dw_session"):
        return
    session.info.pop("pending_audit", None)
    session.info.pop("pending_new_objects", None)
    session.info.pop("audit_seen", None)
    session.info.pop("audit_user_id", None)
    session.info.pop("audit_dw_id", None)
    session.info.pop("audit_app_key", None)
    session.info.pop("audit_now", None)
