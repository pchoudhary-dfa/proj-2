"""
Shared helpers for populating logs_transaction context fields.

Used by DW and dashboard audit event modules so every write path (ORM listeners,
manual buffers, background jobs) resolves ``app_key`` consistently.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session


def resolve_audit_app_key(
    *,
    session: Session | None = None,
    default: str | None = None,
) -> str | None:
    """
    Resolve the application key for a transaction audit row.

    Priority:
    1. ``request_app_key`` context var (HTTP middleware / bg_job_dw_audit_context)
    2. ``session.info["audit_app_key"]`` when explicitly set on the session
    3. ``_current_app_key`` context var (auth middleware IUS helpers)
    4. *default* argument when provided and non-empty
    """
    from apps.shared.middleware.request_context import request_app_key

    ak = request_app_key.get()
    if ak and str(ak).strip():
        return str(ak).strip()

    if session is not None:
        session_ak = session.info.get("audit_app_key")
        if session_ak and str(session_ak).strip():
            return str(session_ak).strip()

    try:
        from apps.shared.utils.ius_utils import _current_app_key

        ius_ak = _current_app_key.get()
        if ius_ak and str(ius_ak).strip():
            return str(ius_ak).strip()
    except Exception:
        pass

    if default and str(default).strip():
        return str(default).strip()

    return None


def audit_app_key_from_payload(payload: Optional[dict[str, Any]]) -> str | None:
    """Extract app_key from a background-job payload when present."""
    if not payload:
        return None
    raw = payload.get("app_key")
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None
