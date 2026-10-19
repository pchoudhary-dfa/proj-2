"""
Set request_db_id (app DB system_datawarehouse.id) and request_app_key for
background work so logs_transaction and other request-context consumers see
valid audit context.

HTTP middleware only sets request_db_id for paths like /dw/<digits>/...;
DB poller and Celery workers have no request, so we resolve from payload dw_id
(string route key: numeric id or db_database slug) using the same rules as
get_warehouse_credentials.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Mapping, Optional

from apps.shared.config.config import settings
from apps.shared.middleware.request_context import request_app_key, request_db_id
from apps.shared.utils.audit_context import audit_app_key_from_payload

logger = logging.getLogger(__name__)


@contextmanager
def bg_job_dw_audit_context(
    *,
    dw_route_id: Optional[str] = None,
    payload: Optional[Mapping[str, Any]] = None,
    row_dw_id: Optional[str] = None,
    app_key: Optional[str] = None,
):
    """
    Resolve warehouse route key to system_datawarehouse.id and set request_db_id
    for the duration of the block. Also sets request_app_key for DW audit rows.

    Priority: dw_route_id > payload["dw_id"] > row_dw_id (e.g. system_bg_job_queue.dw_id).
    app_key: explicit arg > payload["app_key"] > settings.DFA_DM_APP_KEY.
    If resolution fails, the block still runs; transaction_logger skips inserts when
    request_db_id is unset (no invalid FK).
    """
    route_key: Optional[str] = None
    if dw_route_id is not None and str(dw_route_id).strip():
        route_key = str(dw_route_id).strip()
    elif payload is not None:
        raw = payload.get("dw_id")
        if raw is not None and str(raw).strip():
            route_key = str(raw).strip()
    if route_key is None and row_dw_id is not None and str(row_dw_id).strip():
        route_key = str(row_dw_id).strip()

    db_id_token: Any = None
    if route_key:
        from apps.app_db.services.datawarehouse import SystemDatawarehouseService

        pk = SystemDatawarehouseService().resolve_datawarehouse_id(route_key)
        if pk is not None:
            db_id_token = request_db_id.set(pk)
        else:
            logger.debug(
                "bg_job_dw_audit_context: could not resolve dw_route_id=%r to system_datawarehouse.id",
                route_key,
            )

    resolved_app_key = (
        (str(app_key).strip() if app_key and str(app_key).strip() else None)
        or audit_app_key_from_payload(dict(payload) if payload is not None else None)
        or settings.DFA_DM_APP_KEY
    )
    app_key_token: Any = None
    if resolved_app_key:
        app_key_token = request_app_key.set(resolved_app_key)

    try:
        yield
    finally:
        if app_key_token is not None:
            request_app_key.reset(app_key_token)
        if db_id_token is not None:
            request_db_id.reset(db_id_token)
