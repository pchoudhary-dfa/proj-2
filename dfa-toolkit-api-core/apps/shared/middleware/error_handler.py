"""
Global exception handlers — all failure paths emit through log_event().
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError, OperationalError, DBAPIError, IntegrityError

from apps.shared.exceptions import (
    AppException,
    BadRequest,
    Conflict,
    Forbidden,
    InternalError,
    NotFound,
    ServiceUnavailable,
    TooManyRequests,
    Unauthorized,
    UnprocessableEntity,
)
from apps.shared.utils.connection_errors import is_connection_error
from apps.shared.utils.log_event import log_event
from apps.shared.utils.log_payload import build_log_payload, resolve_log_level, stack_trace_from_exc
from apps.shared.utils.response import (
    error_response,
    validation_error_response,
)

logger = logging.getLogger(__name__)


def _emit(
    request: Request,
    *,
    status_code: int,
    message: str,
    error_code: str,
    exc: BaseException | None = None,
    stack_trace: str | None = None,
    identifier: str | None = None,
) -> None:
    level = resolve_log_level(status_code)
    payload = build_log_payload(
        request=request,
        status_code=status_code,
        level=level,
        message=message,
        error_code=error_code,
        stack_trace=stack_trace,
        identifier=identifier,
        logger_name=logger.name,
    )
    log_event(payload, exc=exc)


def setup_exception_handlers(app: FastAPI):
    """Setup global exception handlers"""

    @app.exception_handler(KeyError)
    async def key_error_handler(request: Request, exc: KeyError):
        msg = f"KeyError: {exc!s}"
        _emit(
            request,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message=msg,
            error_code="KEY_ERROR",
            exc=exc,
            stack_trace=stack_trace_from_exc(exc),
        )
        return error_response(
            message="An unexpected error occurred",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            errors={"detail": "Internal server error", "code": "KEY_ERROR"},
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        msg = str(exc)
        _emit(
            request,
            status_code=status.HTTP_400_BAD_REQUEST,
            message=msg,
            error_code="BAD_REQUEST",
            exc=exc,
        )
        return error_response(
            message=msg,
            status_code=status.HTTP_400_BAD_REQUEST,
            errors={"code": "BAD_REQUEST"},
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        msg = str(exc)
        _emit(
            request,
            status_code=status.HTTP_409_CONFLICT,
            message=msg,
            error_code="INTEGRITY_ERROR",
            exc=exc,
        )
        return error_response(
            message="Database constraint violation",
            status_code=status.HTTP_409_CONFLICT,
            errors={"detail": msg, "code": "INTEGRITY_ERROR"},
        )

    async def app_exception_handler(request: Request, exc: AppException):
        """
        Single handler for AppException and every concrete subclass listed in
        apps/shared/exceptions.py (registered explicitly below).
        """
        _emit(
            request,
            status_code=exc.status_code,
            message=exc.message,
            error_code=exc.error_code,
            exc=exc,
            stack_trace=stack_trace_from_exc(exc),
            identifier=exc.identifier,
        )
        errors = {**exc.details, "code": exc.error_code}
        if exc.identifier is not None:
            errors["identifier"] = exc.identifier
        return error_response(
            message=exc.public_message,
            status_code=exc.status_code,
            errors=errors,
        )

    for _exc_cls in (
        BadRequest,
        Unauthorized,
        Forbidden,
        NotFound,
        Conflict,
        UnprocessableEntity,
        TooManyRequests,
        ServiceUnavailable,
        InternalError,
        AppException,
    ):
        app.add_exception_handler(_exc_cls, app_exception_handler)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        """Handle HTTP exceptions in standard error envelope format."""
        detail = exc.detail
        detail_str = str(detail) if detail is not None else ""
        _emit(
            request,
            status_code=exc.status_code,
            message=detail_str or "Request failed",
            error_code="HTTP_EXCEPTION",
            exc=exc,
        )
        return error_response(
            message=detail_str if detail_str else "Request failed",
            status_code=exc.status_code,
            errors={"code": "HTTP_EXCEPTION"},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle request validation errors. Sanitize errors so they are JSON-serializable."""
        raw_errors = exc.errors()
        _emit(
            request,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            message="Request validation failed",
            error_code="VALIDATION_ERROR",
            exc=exc,
        )
        errors_serializable = []
        for e in raw_errors:
            err_copy = {k: v for k, v in e.items() if k != "ctx"}
            if "ctx" in e and e["ctx"]:
                err_copy["ctx"] = {k: str(v) for k, v in e["ctx"].items()}
            errors_serializable.append(err_copy)
        return validation_error_response(
            message="Request validation failed",
            errors={"validation_errors": errors_serializable, "code": "VALIDATION_ERROR"},
        )

    async def connection_error_handler(request: Request, exc: Exception):
        """Convert data warehouse connection failures to 503."""
        if is_connection_error(exc):
            _emit(
                request,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                message=f"Data warehouse connection error: {exc}",
                error_code="SERVICE_UNAVAILABLE",
                exc=exc,
            )
            return error_response(
                message="Data warehouse connection failed. Check system_datawarehouse credentials.",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                errors={"code": "SERVICE_UNAVAILABLE"},
            )
        _emit(
            request,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message=f"Database error: {exc}",
            error_code="DATABASE_ERROR",
            exc=exc,
        )
        return error_response(
            message="Database operation failed",
            errors={"detail": "Internal server error", "code": "DATABASE_ERROR"},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    app.add_exception_handler(OperationalError, connection_error_handler)
    app.add_exception_handler(DBAPIError, connection_error_handler)

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
        """Handle database errors (non-connection)."""
        _emit(
            request,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message=f"Database error: {exc}",
            error_code="DATABASE_ERROR",
            exc=exc,
        )
        return error_response(
            message="Database operation failed",
            errors={"detail": "Internal server error", "code": "DATABASE_ERROR"},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    @app.exception_handler(RuntimeError)
    async def runtime_error_handler(request: Request, exc: RuntimeError):
        """Convert data warehouse connection RuntimeErrors to 503."""
        msg = str(exc).lower()
        if "data warehouse connection failed" in msg or "app db connection failed" in msg:
            wh_target = getattr(exc, "target", None)
            err_body: dict = {"code": "SERVICE_UNAVAILABLE"}
            if wh_target is not None:
                err_body["warehouse_target"] = wh_target
            _emit(
                request,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                message=f"Data warehouse connection error: {exc}",
                error_code="SERVICE_UNAVAILABLE",
                exc=exc,
            )
            return error_response(
                message=str(exc),
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                errors=err_body,
            )
        _emit(
            request,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message=f"RuntimeError: {exc}",
            error_code="RUNTIME_ERROR",
            exc=exc,
            stack_trace=stack_trace_from_exc(exc),
        )
        return error_response(
            message="An unexpected error occurred",
            errors={"detail": "Internal server error", "code": "RUNTIME_ERROR"},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """Handle all other exceptions"""
        _emit(
            request,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message=f"Unhandled exception: {exc}",
            error_code="INTERNAL_ERROR",
            exc=exc,
            stack_trace=stack_trace_from_exc(exc),
        )
        return error_response(
            message="An unexpected error occurred",
            errors={"detail": "Internal server error", "code": "INTERNAL_ERROR"},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
