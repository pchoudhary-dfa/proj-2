"""
Common OpenAPI response definitions for data warehouse routers.
Use these in route decorators to keep responses consistent and avoid repetition.
"""
from apps.shared.schemas.response import SuccessResponse, ErrorResponse

# Common error response codes used across DW routers
COMMON_RESPONSES = {
    400: {"description": "Bad request - validation or invalid input", "model": ErrorResponse},
    401: {"description": "Unauthorized - authentication required", "model": ErrorResponse},
    403: {"description": "Forbidden - insufficient permissions", "model": ErrorResponse},
    404: {"description": "Resource or warehouse not found", "model": ErrorResponse},
    422: {"description": "Validation error - invalid data format", "model": ErrorResponse},
    500: {"description": "Internal server error", "model": ErrorResponse},
}

# For routes that also return 409 Conflict (e.g. create/update with duplicate)
COMMON_RESPONSES_WITH_409 = {
    **COMMON_RESPONSES,
    409: {"description": "Conflict - duplicate or dependency block", "model": ErrorResponse},
}
