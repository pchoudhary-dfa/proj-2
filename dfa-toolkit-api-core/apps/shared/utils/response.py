"""
Response utility functions for standardized API responses
"""
from typing import Any, Dict, List, Optional, Union
from fastapi.responses import JSONResponse, Response
from fastapi import status

from apps.shared.schemas.response import SuccessResponse, ErrorResponse


def created_response_data(
    full_data: Union[Dict[str, Any], List[Dict[str, Any]]],
    nid_key: str,
    gid_key: Optional[str] = None,
) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Return full created data or only nid and gid per item based on RETURN_FULL_RES_AFTER_CREATE.

    When RETURN_FULL_RES_AFTER_CREATE is False (default), returns only the specified nid_key
    and gid_key (if provided and present) for each created record. When True, returns the
    full payload unchanged.

    Args:
        full_data: Single dict or list of dicts (serialized created record(s)).
        nid_key: Key name for the numeric id (e.g. "indicator_nid", "i_nid").
        gid_key: Key name for the global id (e.g. "indicator_gid", "i_gid"). Optional.

    Returns:
        Either full_data or reduced data with only nid_key and gid_key.
    """
    from apps.shared.config.config import settings

    if getattr(settings, "RETURN_FULL_RES_AFTER_CREATE", False):
        return full_data

    def _reduce(item: Dict[str, Any]) -> Dict[str, Any]:
        out: Dict[str, Any] = {nid_key: item[nid_key]}
        if gid_key and gid_key in item:
            out[gid_key] = item[gid_key]
        return out

    if isinstance(full_data, list):
        return [_reduce(x) for x in full_data]
    return _reduce(full_data)


def deleted_success_message(
    entity: str,
    identifier: Optional[Any] = None,
    count: Optional[int] = None,
) -> str:
    """
    Build a consistent delete success message for API responses.

    - With count (bulk delete): "{count} {entity} deleted successfully"
      e.g. deleted_success_message("IUS record(s)", count=5) -> "5 IUS record(s) deleted successfully"
    - With identifier (single delete): "{entity} ({identifier}) deleted successfully"
      e.g. deleted_success_message("Unit", "123") -> "Unit (123) deleted successfully"
    - Otherwise: "{entity} deleted successfully"
      e.g. deleted_success_message("Time periods") -> "Time periods deleted successfully"

    Args:
        entity: Resource name (e.g. "Unit", "Indicator", "Time periods").
        identifier: Optional identifier that was deleted (for single-delete responses).
        count: Optional count for bulk deletes (takes precedence over identifier when set).

    Returns:
        Formatted message string.
    """
    if count is not None:
        return f"{count} {entity} deleted successfully"
    if identifier is not None:
        return f"{entity} ({identifier}) deleted successfully"
    return f"{entity} deleted successfully"


def success_response(
    message: str,
    data: Optional[Any] = None,
    status_code: int = status.HTTP_200_OK,
    meta: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """
    Create a standardized success response

    Args:
        message: Human-readable message
        data: Response data payload
        status_code: HTTP status code
        meta: Optional pagination/count metadata (total_count, count, page, page_size, total_pages)

    Returns:
        JSONResponse with standardized format
    """
    response = SuccessResponse(
        success=True,
        message=message,
        data=data,
        meta=meta
    )
    return JSONResponse(
        content=response.model_dump(mode="json", exclude_none=True),
        status_code=status_code
    )


def error_response(
    message: str,
    errors: Optional[Dict[str, Any]] = None,
    status_code: int = status.HTTP_400_BAD_REQUEST
) -> JSONResponse:
    """
    Create a standardized error response

    Args:
        message: Human-readable error message
        errors: Additional error details
        status_code: HTTP status code

    Returns:
        JSONResponse with standardized error format
    """
    response = ErrorResponse(
        success=False,
        err_message=message,
        data=None,
        errors=errors
    )
    return JSONResponse(
        content=response.model_dump(mode="json", exclude_none=True),
        status_code=status_code
    )


def created_response(
    message: str,
    data: Optional[Any] = None
) -> JSONResponse:
    """Create a 201 Created response"""
    return success_response(message, data, status_code=status.HTTP_201_CREATED)


def not_found_response(
    message: str,
    errors: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """Create a 404 Not Found response"""
    return error_response(message, errors, status_code=status.HTTP_404_NOT_FOUND)


def identifier_not_found_response(
    resource: str,
    identifier: Optional[Any] = None,
    errors: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """
    Create a 404 Not Found response with standardized message including the identifier when provided.

    Message format:
    - With identifier: "{resource} identifier {identifier} not found" (e.g. "Data warehouse identifier 11 not found")
    - Without identifier: "{resource} identifier not found"

    Args:
        resource: Resource name (e.g. "Datawarehouse", "Indicator", "Application").
        identifier: Optional identifier that was not found (included in message for clarity).
        errors: Optional additional error details.

    Returns:
        JSONResponse with err_message including resource and optional identifier.
    """
    # Display "Data warehouse" (two words) for API messages when resource is "Datawarehouse"
    resource_display = "Data warehouse" if resource == "Datawarehouse" else resource
    if identifier is not None:
        message = f"{resource_display} identifier {identifier} not found"
    else:
        message = f"{resource_display} identifier not found"
    return not_found_response(
        message=message,
        errors=errors,
    )


def unauthorized_response(
    message: str = "Unauthorized",
    errors: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """Create a 401 Unauthorized response"""
    return error_response(message, errors, status_code=status.HTTP_401_UNAUTHORIZED)


def forbidden_response(
    message: str = "Access denied",
    errors: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """Create a 403 Forbidden response"""
    return error_response(message, errors, status_code=status.HTTP_403_FORBIDDEN)


def validation_error_response(
    message: str = "Validation error",
    errors: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """Create a 422 Validation Error response"""
    return error_response(
        message=message,
        errors=errors,
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
    )


def conflict_response(
    message: str = "Conflict",
    errors: Optional[Dict[str, Any]] = None
) -> JSONResponse:
    """Create a 409 Conflict response (e.g. deletion blocked by dependencies)."""
    return error_response(message, errors, status_code=status.HTTP_409_CONFLICT)


def no_content_response() -> Response:
    """
    Create a 204 No Content response (strict standard for DELETE).
    No body; client infers success from status code; identifier is in the URL.
    """
    return Response(status_code=status.HTTP_204_NO_CONTENT)

