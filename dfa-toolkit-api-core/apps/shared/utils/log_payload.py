"""
Build structured log payloads and resolve log level from HTTP status.
"""
from __future__ import annotations

import traceback
from typing import Any, Optional

from starlette.requests import Request

from apps.shared.config.config import settings
from apps.shared.utils.log_body import serialize_body_for_log, serialize_headers_for_log


def resolve_log_level(status_code: int) -> str:
    """Map HTTP status to log level name (uppercase) for stdout + DB_LOG_LEVELS gate."""
    if status_code >= 500:
        return "ERROR"
    if status_code in (401, 403, 429):
        return "WARNING"
    if 400 <= status_code < 500:
        return "INFO"
    return "INFO"


def format_db_error_message(message: str, error_code: Optional[str]) -> str:
    """Persist error_code in text: [CODE] message (no separate DB column)."""
    if error_code:
        return f"[{error_code}] {message}"
    return message


def build_log_payload(
    *,
    request: Optional[Request],
    status_code: int,
    level: str,
    message: str,
    error_code: str,
    stack_trace: Optional[str] = None,
    identifier: Optional[str] = None,
    source: Optional[str] = None,
    logger_name: Optional[str] = None,
    error_type: Optional[str] = None,
    error_message: Optional[str] = None,
) -> dict[str, Any]:
    """
    Single structured payload for stdout and optional DB persistence.

    When request is None (background), path/method/request_id come from contextvars if set,
    or remain absent.
    """
    from apps.shared.middleware.request_context import (
        request_db_id,
        request_id,
        request_method,
        request_path,
        request_user_id,
    )

    rid: Optional[str] = None
    path: Optional[str] = None
    method: Optional[str] = None
    user_id: Optional[int] = None
    dw_id: Optional[int] = None
    request_body: Optional[str] = None
    request_headers: Optional[str] = None

    if request is not None:
        path = request.url.path
        if request.url.query:
            path = f"{path}?{request.url.query}"
        method = request.method
        user_id = getattr(request.state, "user_id", None)
        dw_id = request_db_id.get()
        rid = request_id.get() or request.headers.get("x-request-id")

        cached_body = getattr(request.state, "cached_body", None)
        if cached_body:
            request_body = serialize_body_for_log(
                cached_body,
                max_bytes=int(getattr(settings, "LOG_REQ_BODY_MAX_BYTES", 8192) or 8192),
            )

        cached_headers = getattr(request.state, "cached_headers", None)
        if cached_headers:
            request_headers = serialize_headers_for_log(cached_headers)
    else:
        rid = request_id.get()
        path = request_path.get()
        method = request_method.get()
        user_id = request_user_id.get()
        dw_id = request_db_id.get()

    module: Optional[str] = None
    submodule: Optional[str] = None
    if logger_name:
        parts = logger_name.split(".")
        if len(parts) >= 2:
            module, submodule = parts[-1], parts[-2]
        else:
            module = logger_name

    payload: dict[str, Any] = {
        "request_id": rid,
        "path": path,
        "method": method,
        "user_id": user_id,
        "dw_id": dw_id,
        "status_code": status_code,
        "level": level.upper(),
        "message": message,
        "error_code": error_code,
        "stack_trace": stack_trace,
        "identifier": identifier,
        "source": source,
        "logger_name": logger_name or "apps.shared.log_event",
        "module": module,
        "submodule": submodule,
        "error_type": error_type,
        "error_message": error_message,
        "request_body": request_body,
        "request_headers": request_headers,
    }
    return payload


def stack_trace_from_exc(exc: BaseException) -> str:
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
