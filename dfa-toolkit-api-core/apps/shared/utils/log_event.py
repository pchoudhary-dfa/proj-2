"""
Central logging: one payload to stdout and optionally to logs_server_error.

DB persistence is gated only by DB_LOG_LEVELS matching payload["level"].
"""
from __future__ import annotations

import logging
import sys
import traceback
from datetime import datetime
from typing import Any, Optional, Set

from sqlalchemy.exc import SQLAlchemyError

from apps.shared.config.config import settings
from apps.shared.utils.log_payload import build_log_payload, format_db_error_message, resolve_log_level

_LOG = logging.getLogger("apps.shared.log_event")
_db_levels_cache: Optional[Set[str]] = None

# MySQL TEXT upper bound is 65,535 bytes; stay under for composed error_message.
_DB_ERROR_MESSAGE_MAX = 60_000


def _compose_db_error_message(payload: dict[str, Any]) -> str:
    """
    Build the string persisted to logs_server_error.error_message.
    Base text uses [error_code] prefix via format_db_error_message; removed DB columns
    (request_id, module, submodule, identifier, error_type) are appended as key=value segments.
    """
    human_msg = payload.get("message") or ""
    code = payload.get("error_code") or None
    if payload.get("error_message") and not human_msg:
        base = (
            format_db_error_message(str(payload["error_message"]), code)
            if code
            else str(payload["error_message"])
        )
    else:
        base = format_db_error_message(human_msg, code) if code else human_msg

    extras: list[str] = []
    src = payload.get("source")
    if src and src != payload.get("logger_name"):
        extras.append(f"source={src}")

    if not extras:
        out = base
    else:
        out = f"{base} | " + " | ".join(extras)
    if len(out) > _DB_ERROR_MESSAGE_MAX:
        out = out[: _DB_ERROR_MESSAGE_MAX - 3] + "..."
    return out


def _parsed_db_levels() -> Set[str]:
    global _db_levels_cache
    if _db_levels_cache is None:
        raw = settings.DB_LOG_LEVELS or ""
        _db_levels_cache = {x.strip().upper() for x in raw.split(",") if x.strip()}
    return _db_levels_cache


def write_log_to_db(payload: dict[str, Any]) -> None:
    """Persist one row to App DB logs_server_error (sync)."""
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import LogsServerErrors

    user_id = payload.get("user_id")
    dw_id = payload.get("dw_id")
    method = payload.get("method")
    path = payload.get("path")
    status_code = payload.get("status_code")
    level = (payload.get("level") or "ERROR")[:10]
    stack_trace = payload.get("stack_trace")
    request_body = payload.get("request_body")
    request_headers = payload.get("request_headers")
    db_err_msg = _compose_db_error_message(payload)

    try:
        with SessionLocal() as db:
            entry = LogsServerErrors(
                user_id=user_id,
                dw_id=dw_id,
                method=method[:10] if method else None,
                path=path[:1024] if path else None,
                status_code=status_code,
                level=level,
                error_message=db_err_msg,
                stack_trace=stack_trace,
                request_body=request_body[:65000] if request_body else None,
                request_headers=request_headers[:65000] if request_headers else None,
                created=datetime.utcnow(),
            )
            db.add(entry)
            db.commit()
    except SQLAlchemyError as e:
        print(f"log_event: DB write failed: {e}", file=sys.stderr)
    except Exception as e:
        print(f"log_event: unexpected DB error: {e}", file=sys.stderr)


def _extract_error_fields(
    payload: dict[str, Any],
    exc: BaseException | None,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    stack_trace: Optional[str] = payload.get("stack_trace")

    if exc is not None:
        error_type = type(exc).__name__
        error_message = str(exc)
        if not stack_trace and exc.__traceback__ is not None:
            stack_trace = "".join(
                traceback.format_exception(type(exc), exc, exc.__traceback__)
            )
    return error_type, error_message, stack_trace


def log_background_incident(
    message: str,
    *,
    error_code: str = "INTERNAL_ERROR",
    exc: BaseException | None = None,
    source: str | None = None,
    status_code: int = 500,
) -> None:
    """log_event for non-request code paths (workers, DB utils, scripts)."""
    payload = build_log_payload(
        request=None,
        status_code=status_code,
        level=resolve_log_level(status_code),
        message=message,
        error_code=error_code,
        source=source,
        logger_name=source or "apps.shared.log_event",
    )
    log_event(payload, exc=exc)


def log_event(payload: dict[str, Any], *, exc: BaseException | None = None) -> None:
    """
    Emit payload to stdout at payload['level'] and optionally persist to DB.

    Merges exception-derived error_type / stack_trace into payload for stdout; DB row
    stores folded context in error_message (see _compose_db_error_message).
    """
    level_name = (payload.get("level") or "ERROR").upper()
    msg = payload.get("message") or ""

    err_t, err_m, stack = _extract_error_fields(payload, exc)
    if err_t:
        payload = {**payload, "error_type": err_t}
    if err_m and not payload.get("error_message"):
        payload = {**payload, "error_message": err_m}
    if stack:
        payload = {**payload, "stack_trace": stack}

    log_fn = {
        "DEBUG": _LOG.debug,
        "INFO": _LOG.info,
        "WARNING": _LOG.warning,
        "ERROR": _LOG.error,
        "CRITICAL": _LOG.critical,
    }.get(level_name, _LOG.error)

    extra = {"log_payload": payload}
    log_fn("%s", msg, extra=extra)

    if level_name in _parsed_db_levels():
        write_log_to_db(payload)
