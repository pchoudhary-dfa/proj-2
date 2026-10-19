"""
Router for system logs: server errors (logs_server_error) and transactions (logs_transaction).
Both endpoints support pagination, filtering, sorting, and XLSX export via ?export=true.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from apps.app_db.constants.logs_list import (
    LOG_SERVER_ERROR_SEARCH_BY_FIELDS,
    LOG_SERVER_ERROR_SORT_FIELDS,
    LOG_TRANSACTION_SEARCH_BY_FIELDS,
    LOG_TRANSACTION_SORT_FIELDS,
)
from apps.app_db.dependencies import get_app_key, get_core_locale, get_current_user_id
from apps.app_db.services.log_service import (
    LogService,
    _VALID_LSE_LEVELS,
    _VALID_TXN_ACTIONS,
    server_errors_has_list_filters,
    transactions_has_list_filters,
)
from apps.shared.config.dependencies import get_db
from apps.shared.exceptions import BadRequest
from apps.shared.schemas.response import ErrorResponse, ListPaginationMetaSchema, SuccessResponse
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import success_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/logs", tags=["Logs"])
log_service = LogService()


# ---------------------------------------------------------------------------
# GET /logs/server-errors
# ---------------------------------------------------------------------------

@router.get(
    "/server-errors",
    summary="List server error logs",
    description=(
        "List entries from logs_server_error with optional filters. "
        "Supports pagination, sort, search, and direct XLSX export via `?export=true` "
        "(export ignores pagination and returns all matching rows)."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Server error logs returned", "model": SuccessResponse},
        400: {"description": "Invalid filter or sort parameter", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def list_server_errors(
    _current_user_id: int = Depends(get_current_user_id),
    locale: str = Depends(get_core_locale),
    db=Depends(get_db),
    # Filters
    level: Optional[str] = Query(
        None,
        description=f"Filter by log level: {', '.join(sorted(_VALID_LSE_LEVELS))}",
    ),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    dw_id: Optional[int] = Query(None, description="Filter by datawarehouse ID"),
    method: Optional[str] = Query(None, description="Filter by HTTP method (GET, POST, PATCH, DELETE, PUT)"),
    status_code: Optional[int] = Query(None, description="Filter by HTTP response status code"),
    from_date: Optional[datetime] = Query(None, description="Filter records created at or after this datetime (ISO 8601)"),
    to_date: Optional[datetime] = Query(None, description="Filter records created at or before this datetime (ISO 8601)"),
    # Search
    search: Optional[str] = Query(None, description="Case-insensitive substring filter; requires search_by"),
    search_by: Optional[str] = Query(
        None,
        description=f"Field to search: {', '.join(LOG_SERVER_ERROR_SEARCH_BY_FIELDS)}",
    ),
    # Sort
    sort_field: Optional[str] = Query(
        "id",
        description=f"Sort field: {', '.join(LOG_SERVER_ERROR_SORT_FIELDS)}",
    ),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    # Pagination
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: Optional[int] = Query(
        None,
        ge=1,
        le=5000,
        description="Records per page; omit to return all (max 5000 for list; export has no cap)",
    ),
    # Export
    export: bool = Query(False, description="Export as XLSX; disables pagination"),
):
    # Validate level
    if level and level.upper() not in _VALID_LSE_LEVELS:
        raise BadRequest(f"level must be one of: {', '.join(sorted(_VALID_LSE_LEVELS))}")

    # Validate search params
    search_term = (search or "").strip()
    search_by_value = (search_by or "").strip() or None
    if search_term and not search_by_value:
        raise BadRequest(
            f"search_by is required when search is provided "
            f"({', '.join(LOG_SERVER_ERROR_SEARCH_BY_FIELDS)})"
        )
    if search_by_value and search_by_value not in LOG_SERVER_ERROR_SEARCH_BY_FIELDS:
        raise BadRequest(
            f"search_by must be one of: {', '.join(LOG_SERVER_ERROR_SEARCH_BY_FIELDS)}"
        )

    # Validate sort params
    sort_field_value = (sort_field or "id").strip()
    if sort_field_value not in LOG_SERVER_ERROR_SORT_FIELDS:
        raise BadRequest(f"sort_field must be one of: {', '.join(LOG_SERVER_ERROR_SORT_FIELDS)}")
    sort_order_value = (sort_order or "desc").strip().lower()
    if sort_order_value not in ("asc", "desc"):
        raise BadRequest("sort_order must be asc or desc")

    # Normalise level and method
    level_value = level.upper() if level else None
    method_value = method.upper() if method else None

    shared_filters = dict(
        level=level_value,
        user_id=user_id,
        dw_id=dw_id,
        method=method_value,
        status_code=status_code,
        from_date=from_date,
        to_date=to_date,
        search=search_term or None,
        search_by=search_by_value,
        sort_field=sort_field_value,
        sort_order=sort_order_value,
    )

    if export:
        output, filename = log_service.export_server_errors_xlsx(
            db=db,
            language_code=locale,
            db_name="system",
            **shared_filters,
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    items, total_count, total_count_unfiltered_raw = log_service.list_server_errors(
        db=db,
        page=page,
        page_size=page_size,
        **shared_filters,
    )

    if page_size is not None:
        total_pages = (total_count + page_size - 1) // page_size if total_count else 0
        meta_page, meta_page_size = page, page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, total_count

    has_list_filters = server_errors_has_list_filters(
        level=shared_filters["level"],
        user_id=shared_filters["user_id"],
        dw_id=shared_filters["dw_id"],
        method=shared_filters["method"],
        status_code=shared_filters["status_code"],
        from_date=shared_filters["from_date"],
        to_date=shared_filters["to_date"],
        search=shared_filters["search"],
        search_by=shared_filters["search_by"],
    )
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(items),
        page=meta_page,
        page_size=meta_page_size,
        total_pages=total_pages,
        total_count_unfiltered=resolve_unfiltered_total(
            total_count,
            total_count_unfiltered_raw,
            has_list_filters=has_list_filters,
        ),
    )

    return success_response(
        message=f"Retrieved {len(items)} server error log(s)",
        data=items,
        meta=meta,
    )


# ---------------------------------------------------------------------------
# GET /logs/transactions
# ---------------------------------------------------------------------------

@router.get(
    "/transactions",
    summary="List transaction logs",
    description=(
        "List entries from logs_transaction for the current application (resolved from "
        "X-Api-Key). Supports pagination, sort, search, and direct XLSX export via "
        "`?export=true` (export ignores pagination and returns all matching rows)."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Transaction logs returned", "model": SuccessResponse},
        400: {"description": "Invalid filter or sort parameter", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def list_transactions(
    _current_user_id: int = Depends(get_current_user_id),
    current_app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    db=Depends(get_db),
    # Filters
    action: Optional[str] = Query(
        None,
        description=f"Filter by action: {', '.join(sorted(_VALID_TXN_ACTIONS))}",
    ),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    dw_id: Optional[int] = Query(None, description="Filter by datawarehouse ID"),
    module: Optional[str] = Query(None, description="Filter by module name (e.g. area, indicator, dashboard)"),
    status: Optional[str] = Query(None, description="Filter by status (e.g. SUCCESS, ERROR)"),
    dashboard_id: Optional[int] = Query(None, description="Filter by dashboard ID"),
    from_date: Optional[datetime] = Query(None, description="Filter records created at or after this datetime (ISO 8601)"),
    to_date: Optional[datetime] = Query(None, description="Filter records created at or before this datetime (ISO 8601)"),
    # Search
    search: Optional[str] = Query(None, description="Case-insensitive substring filter; requires search_by"),
    search_by: Optional[str] = Query(
        None,
        description=f"Field to search: {', '.join(LOG_TRANSACTION_SEARCH_BY_FIELDS)}",
    ),
    # Sort
    sort_field: Optional[str] = Query(
        "id",
        description=f"Sort field: {', '.join(LOG_TRANSACTION_SORT_FIELDS)}",
    ),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    # Pagination
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: Optional[int] = Query(
        None,
        ge=1,
        le=5000,
        description="Records per page; omit to return all (max 5000 for list; export has no cap)",
    ),
    # Export
    export: bool = Query(False, description="Export as XLSX; disables pagination"),
):
    # Validate action
    if action and action.upper() not in _VALID_TXN_ACTIONS:
        raise BadRequest(f"action must be one of: {', '.join(sorted(_VALID_TXN_ACTIONS))}")

    # Validate search params
    search_term = (search or "").strip()
    search_by_value = (search_by or "").strip() or None
    if search_term and not search_by_value:
        raise BadRequest(
            f"search_by is required when search is provided "
            f"({', '.join(LOG_TRANSACTION_SEARCH_BY_FIELDS)})"
        )
    if search_by_value and search_by_value not in LOG_TRANSACTION_SEARCH_BY_FIELDS:
        raise BadRequest(
            f"search_by must be one of: {', '.join(LOG_TRANSACTION_SEARCH_BY_FIELDS)}"
        )

    # Validate sort params
    sort_field_value = (sort_field or "id").strip()
    if sort_field_value not in LOG_TRANSACTION_SORT_FIELDS:
        raise BadRequest(f"sort_field must be one of: {', '.join(LOG_TRANSACTION_SORT_FIELDS)}")
    sort_order_value = (sort_order or "desc").strip().lower()
    if sort_order_value not in ("asc", "desc"):
        raise BadRequest("sort_order must be asc or desc")

    # Normalise action and status
    action_value = action.upper() if action else None
    status_value = status.upper() if status else None

    shared_filters = dict(
        action=action_value,
        user_id=user_id,
        dw_id=dw_id,
        module=module,
        status=status_value,
        app_key=current_app_key,
        dashboard_id=dashboard_id,
        from_date=from_date,
        to_date=to_date,
        search=search_term or None,
        search_by=search_by_value,
        sort_field=sort_field_value,
        sort_order=sort_order_value,
    )

    if export:
        output, filename = log_service.export_transactions_xlsx(
            db=db,
            language_code=locale,
            db_name="system",
            **shared_filters,
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    items, total_count, total_count_unfiltered_raw = log_service.list_transactions(
        db=db,
        page=page,
        page_size=page_size,
        **shared_filters,
    )

    if page_size is not None:
        total_pages = (total_count + page_size - 1) // page_size if total_count else 0
        meta_page, meta_page_size = page, page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, total_count

    has_list_filters = transactions_has_list_filters(
        action=shared_filters["action"],
        user_id=shared_filters["user_id"],
        dw_id=shared_filters["dw_id"],
        module=shared_filters["module"],
        status=shared_filters["status"],
        dashboard_id=shared_filters["dashboard_id"],
        from_date=shared_filters["from_date"],
        to_date=shared_filters["to_date"],
        search=shared_filters["search"],
        search_by=shared_filters["search_by"],
    )
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(items),
        page=meta_page,
        page_size=meta_page_size,
        total_pages=total_pages,
        total_count_unfiltered=resolve_unfiltered_total(
            total_count,
            total_count_unfiltered_raw,
            has_list_filters=has_list_filters,
        ),
    )

    return success_response(
        message=f"Retrieved {len(items)} transaction log(s)",
        data=items,
        meta=meta,
    )
