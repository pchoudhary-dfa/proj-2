"""
Helpers for consistent paginated list ``meta`` payloads.
"""
from typing import Any, Dict, Optional

from apps.shared.schemas.response import ListPaginationMetaSchema


def resolve_unfiltered_total(
    filtered_count: int,
    unfiltered_count: Optional[int],
    *,
    has_list_filters: bool,
) -> Optional[int]:
    """
    Return ``total_count_unfiltered`` for meta when list filters narrowed the result set.

    Omit when there were no list filters or when filtered and unfiltered counts match.
    """
    if not has_list_filters or unfiltered_count is None:
        return None
    if unfiltered_count == filtered_count:
        return None
    return unfiltered_count


def build_list_pagination_meta(
    *,
    total_count: int,
    count: int,
    page: int,
    page_size: int,
    total_pages: int,
    total_count_unfiltered: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Build standard list pagination meta (``total_count``, ``count``, ``page``, …).

    ``total_count`` is the filtered total (drives paging). When ``total_count_unfiltered``
    is set and differs from ``total_count``, both are included in the response meta.
    """
    meta = ListPaginationMetaSchema(
        total_count=total_count,
        count=count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        total_count_unfiltered=total_count_unfiltered,
    )
    return meta.model_dump(exclude_none=True)
