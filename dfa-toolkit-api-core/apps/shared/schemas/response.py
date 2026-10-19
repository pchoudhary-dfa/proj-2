"""
Generic API Response Schemas
All API responses must follow this structure
"""
from typing import Any, Dict, Generic, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar('T')


class ListPaginationMetaSchema(BaseModel):
    """
    Standard meta for paginated list responses. Use this so naming is consistent
    across all list endpoints (total_count, count, page, page_size, total_pages).
    """
    total_count: int = Field(
        ...,
        description="Total records matching current list filters (used for pagination)",
    )
    total_count_unfiltered: Optional[int] = Field(
        default=None,
        description=(
            "Total records in the same scope without text/search or column filters. "
            "Present only when list filters are active and the unfiltered total differs "
            "from total_count."
        ),
    )
    count: int = Field(..., description="Number of records in this page")
    page: int = Field(..., description="Current page number (1-based)")
    page_size: int = Field(..., description="Page size")
    total_pages: int = Field(..., description="Total number of pages")


class SuccessResponse(BaseModel, Generic[T]):
    """Generic success response structure"""
    success: bool = Field(default=True, description="Indicates if the request was successful")
    message: str = Field(..., description="Human-readable message")
    data: Optional[T] = Field(default=None, description="Response data payload")
    meta: Optional[Dict[str, Any]] = Field(default=None, description="Pagination/count metadata (total_count, count, page, page_size, total_pages)")


class ErrorResponse(BaseModel):
    """Generic error response structure"""
    success: bool = Field(default=False, description="Indicates if the request was successful")
    err_message: str = Field(..., description="Human-readable error message")
    data: Optional[Any] = Field(default=None, description="Response data (null for errors)")
    errors: Optional[Dict[str, Any]] = Field(default=None, description="Additional error details")


