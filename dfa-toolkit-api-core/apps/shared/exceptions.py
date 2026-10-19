"""
Application exceptions for API and service layers.

Routers should not map these to HTTP responses manually; global exception handlers
convert them to the standard envelope and central logging.
"""
from __future__ import annotations

from typing import Any, Optional


class AppException(Exception):
    """Base exception with HTTP mapping and stable error_code for clients and logs."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 500,
        error_code: str = "INTERNAL_ERROR",
        public_message: Optional[str] = None,
        identifier: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.public_message = public_message if public_message is not None else message
        self.status_code = status_code
        self.error_code = error_code
        self.identifier = identifier
        self.details = details or {}


class BadRequest(AppException):
    def __init__(self, message: str, **kwargs: Any):
        super().__init__(
            message,
            status_code=400,
            error_code=kwargs.pop("error_code", "BAD_REQUEST"),
            **kwargs,
        )


class Unauthorized(AppException):
    def __init__(self, message: str = "Unauthorized", **kwargs: Any):
        super().__init__(
            message,
            status_code=401,
            error_code=kwargs.pop("error_code", "UNAUTHORIZED"),
            **kwargs,
        )


class Forbidden(AppException):
    def __init__(self, message: str = "Access denied", **kwargs: Any):
        super().__init__(
            message,
            status_code=403,
            error_code=kwargs.pop("error_code", "FORBIDDEN"),
            **kwargs,
        )


class NotFound(AppException):
    def __init__(self, message: str, **kwargs: Any):
        super().__init__(
            message,
            status_code=404,
            error_code=kwargs.pop("error_code", "NOT_FOUND"),
            **kwargs,
        )


class Conflict(AppException):
    def __init__(self, message: str, **kwargs: Any):
        super().__init__(
            message,
            status_code=409,
            error_code=kwargs.pop("error_code", "CONFLICT"),
            **kwargs,
        )


class UnprocessableEntity(AppException):
    def __init__(self, message: str, **kwargs: Any):
        super().__init__(
            message,
            status_code=422,
            error_code=kwargs.pop("error_code", "UNPROCESSABLE_ENTITY"),
            **kwargs,
        )


class TooManyRequests(AppException):
    def __init__(self, message: str = "Too many requests", **kwargs: Any):
        super().__init__(
            message,
            status_code=429,
            error_code=kwargs.pop("error_code", "TOO_MANY_REQUESTS"),
            **kwargs,
        )


class ServiceUnavailable(AppException):
    def __init__(self, message: str, **kwargs: Any):
        super().__init__(
            message,
            status_code=503,
            error_code=kwargs.pop("error_code", "SERVICE_UNAVAILABLE"),
            **kwargs,
        )


class InternalError(AppException):
    def __init__(self, message: str = "An unexpected error occurred", **kwargs: Any):
        super().__init__(
            message,
            status_code=500,
            error_code=kwargs.pop("error_code", "INTERNAL_ERROR"),
            **kwargs,
        )


def not_found_for_identifier(resource: str, identifier: Optional[Any] = None) -> NotFound:
    """
    Same ``err_message`` as ``identifier_not_found_response`` in ``apps.shared.utils.response``
    (including ``Datawarehouse`` → ``Data warehouse``).
    """
    resource_display = "Data warehouse" if resource == "Datawarehouse" else resource
    if identifier is not None:
        msg = f"{resource_display} identifier {identifier} not found"
        ident: Optional[str] = str(identifier)
    else:
        msg = f"{resource_display} identifier not found"
        ident = None
    return NotFound(msg, identifier=ident)
