"""
Time Periods router – CRUD: list, get one, create, update, delete, multiple-delete, association-count.
Identifier: numeric timeperiod_nid (id) or timeperiod string value (e.g. '2019-20').
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, status, Path, Query, Body, File, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from apps.shared.exceptions import BadRequest, UnprocessableEntity, not_found_for_identifier
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.services.time_period import TimePeriodService, build_time_periods_export_xlsx
from apps.datawarehouse.schemas.time_period import (
    TimePeriodCreateSchema,
    TimePeriodUpdateSchema,
    TimePeriodMultipleDeleteSchema,
    TimePeriodResponseSchema,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.datawarehouse.utils.response_filter import is_external_adaptation
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import (
    success_response,
    created_response_data,
    no_content_response,
)
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.datawarehouse.db.datawarehouse import (
    validate_dw_id,
    get_warehouse_credentials,
    get_warehouse_session_from_id,
)
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_IDENTIFIER,
    BODY_DATA,
    BODY_BODY,
    QUERY_SEARCH,
    QUERY_SEARCH_BY,
    QUERY_SCOPE,
    QUERY_TIMEPERIOD_FREQUENCY,
    QUERY_MAX_TIMEPERIOD_NID,
    QUERY_SORT_ORDER,
    ASSOC_DATA_COUNT,
    QUERY_SORT_FIELD,
    TIME_PERIOD_SEARCH_BY_FIELDS,
    TIME_PERIOD_FREQUENCY_VALUES,
    TIME_PERIOD_SCOPE_VALUES,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Time Periods"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/time-periods")
time_period_service = TimePeriodService()


def _invalidate_time_periods_cache(dw_id: str) -> None:
    """Invalidate time-periods cache keys for this dw."""
    cache_delete_pattern("dw:time-periods:*")


@router.get(
    "",
    summary="List Time Periods",
    description="List time periods from the data warehouse with pagination. Sort: sort_order (asc/desc), sort_field (tp_nid, timeperiod, startdate, enddate, periodicity). Optional search_by to search specific field. Optional scope: ALL (default) or NO_DATA (only time periods with no linked data). Optional timeperiod_frequency: A, M, Q, ALL (default/no filter). Optional max_timeperiod_nid: only periods with enddate <= that period's enddate (reference included). Returns id (timeperiod_nid), timeperiod, startdate, enddate, periodicity. Pagination: page (1-based), page_size; response includes meta (page, page_size, total_count, total_pages). **export=true** returns an XLSX file (same columns as POST /time-periods/import); pagination and JSON envelope are skipped.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Time periods retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_time_periods(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
    search: Optional[str] = Query(None, description="Search on timeperiod string value (case-insensitive).", alias=QUERY_SEARCH),
    search_by: Optional[str] = Query(None, description="Field to search in: tp_timeperiod, tp_periodicity, tp_startdate, tp_enddate", alias=QUERY_SEARCH_BY),
    scope: Optional[str] = Query(None, description="Filter: ALL (default) or NO_DATA (only Time Periods with no linked data)", alias=QUERY_SCOPE),
    timeperiod_frequency: Optional[str] = Query(None, description="Filter by periodicity frequency: A, M, Q, or ALL (no filter)", alias=QUERY_TIMEPERIOD_FREQUENCY),
    max_timeperiod_nid: Optional[int] = Query(
        None,
        ge=1,
        description="Only return time periods whose enddate is <= this period's enddate (reference period included).",
        alias=QUERY_MAX_TIMEPERIOD_NID,
    ),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query("tp_nid", description="Sort field: tp_nid, timeperiod, startdate, enddate, periodicity", alias=QUERY_SORT_FIELD),
    export: bool = Query(False, description="Export as XLSX; disables pagination", alias="export"),
):
    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        with get_warehouse_session_from_id(dw_id) as dw_db:
            output, filename = build_time_periods_export_xlsx(
                dw_db,
                db_display_name,
                sort_order=sort_order or "asc",
                sort_field=sort_field or "tp_nid",
                search=search,
                max_timeperiod_nid=max_timeperiod_nid,
            )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    if search_by is not None and search_by not in TIME_PERIOD_SEARCH_BY_FIELDS:
        raise BadRequest(
            f"search_by must be one of: {', '.join(TIME_PERIOD_SEARCH_BY_FIELDS)}",
        )
    if scope is not None and scope not in TIME_PERIOD_SCOPE_VALUES:
        raise BadRequest(
            f"scope must be one of: {', '.join(TIME_PERIOD_SCOPE_VALUES)}",
        )
    if timeperiod_frequency is not None and timeperiod_frequency not in TIME_PERIOD_FREQUENCY_VALUES:
        raise BadRequest(
            f"timeperiod_frequency must be one of: {', '.join(TIME_PERIOD_FREQUENCY_VALUES)}",
        )
    use_pagination = page_size is not None
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    cache_key = f"dw:time-periods:list:{dw_id}:{page}:{effective_page_size}:{search}:{search_by or ''}:{scope or ''}:{timeperiod_frequency or ''}:{max_timeperiod_nid or ''}:{sort_order or 'asc'}:{sort_field or 'tp_nid'}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items, total_count, total_count_unfiltered_raw = time_period_service.get_all_time_periods(
        dw_id, page=page, page_size=effective_page_size, search=search,
        search_by=search_by, scope=scope, timeperiod_frequency=timeperiod_frequency,
        max_timeperiod_nid=max_timeperiod_nid,
        sort_order=sort_order or "asc", sort_field=sort_field or "tp_nid",
    )

    # Transform list with Pydantic serialization
    ser_mode = get_serialization_mode()
    response_data = [TimePeriodResponseSchema.model_validate(item).model_dump(**ser_mode) for item in items]

    if effective_page_size is not None:
        total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        meta_page, meta_page_size = page, effective_page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, total_count
    has_list_filters = bool(
        (search and search.strip())
        or scope == "NO_DATA"
        or timeperiod_frequency in {"A", "M", "Q"}
        or max_timeperiod_nid is not None
    )
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(response_data),
        page=meta_page,
        page_size=meta_page_size,
        total_pages=total_pages,
        total_count_unfiltered=resolve_unfiltered_total(
            total_count,
            total_count_unfiltered_raw,
            has_list_filters=has_list_filters,
        ),
    )
    body = {
        "success": True,
        "message": "Time periods retrieved successfully",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Time periods retrieved successfully",
        data=response_data,
        meta=meta,
    )


@router.post(
    "",
    summary="Create Time Periods (batch)",
    description="Create one or more time periods. Request body is an array of time period objects. timeperiod is required and must be unique (max 30 chars) per item. All-or-nothing transaction.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Time period(s) created successfully", "model": SuccessResponse},
        400: {"description": "Empty array not allowed", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_time_period(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    data: List[TimePeriodCreateSchema] = Body(..., alias=BODY_DATA),
):
    if not data:
        raise BadRequest("Request body must be a non-empty array of time period objects")
    result = time_period_service.create_batch(dw_id, data)
    _invalidate_time_periods_cache(dw_id)
    ser_mode = get_serialization_mode()
    response_data = [
        TimePeriodResponseSchema.model_validate(r).model_dump(**ser_mode)
        for r in result["created"]
    ]
    nid_key = alias_field("ut_timeperiod", "timeperiod_nid") if ser_mode.get("by_alias") else "timeperiod_nid"
    data_out = created_response_data(response_data, nid_key, gid_key=None)
    # Derived calendar bounds are always returned so clients can render dates without a refetch.
    by_alias = ser_mode.get("by_alias")
    start_key = alias_field("ut_timeperiod", "startdate") if by_alias else "startdate"
    end_key = alias_field("ut_timeperiod", "enddate") if by_alias else "enddate"
    for reduced, full in zip(data_out, response_data):
        reduced.setdefault(start_key, full.get(start_key))
        reduced.setdefault(end_key, full.get(end_key))
    count = len(response_data)
    errors = result.get("errors", [])
    message = f"{count} time period(s) created successfully" + (f", {len(errors)} failed" if errors else "")
    meta: dict = {"count": count}
    if errors:
        meta["errors"] = errors
    return success_response(
        message=message,
        data=data_out,
        status_code=status.HTTP_201_CREATED,
        meta=meta,
    )


@router.post(
    "/multiple-delete",
    summary="Delete multiple time periods",
    description="Delete multiple time periods by identifier list. Cascades: deletes dependent data records then time periods.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Time periods deleted successfully", "model": SuccessResponse},
        404: {"description": "Warehouse or time period not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def multiple_delete_time_periods(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: TimePeriodMultipleDeleteSchema = Body(..., alias=BODY_BODY),
):
    result = time_period_service.multiple_delete(dw_id, body.identifier or [])
    result = result if result is not None else {}
    _invalidate_time_periods_cache(dw_id)
    errors = result.get("errors", [])
    deleted = result.get("deleted", [])
    meta = {"errors": errors} if errors else None
    message = f"{len(deleted)} time period(s) deleted successfully" + (f", {len(errors)} failed" if errors else "")
    return success_response(
        message=message,
        data={"deleted": deleted},
        meta=meta,
    )


@router.post(
    "/import",
    summary="Import time periods from XLSX",
    description=(
        "Upload an Excel file with the same columns as GET /time-periods?export=true "
        "(timeperiod_nid, timeperiod, startdate, enddate, periodicity; aliases tp_nid, id, tp_timeperiod, tp_periodicity supported). "
        "Rows with a matching timeperiod_nid are updated; rows without (or blank) NID insert a new time period. "
        "Single transaction; empty rows are skipped."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Import completed", "model": SuccessResponse},
        400: {"description": "Invalid file or validation error", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation error from import", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
        503: {"description": "Warehouse unreachable", "model": ErrorResponse},
    },
)
async def import_time_periods_xlsx(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    file: UploadFile = File(..., description="Time periods XLSX (export layout)"),
):
    content = await file.read()
    try:
        result = time_period_service.import_time_periods_from_xlsx_bytes(dw_id, content or b"")
    except ValueError as e:
        raise UnprocessableEntity(str(e))
    _invalidate_time_periods_cache(dw_id)
    meta = {"skipped_empty_rows": result.get("skipped_empty_rows", 0)}
    msg = (
        f"Time periods import completed: {result.get('inserted', 0)} inserted, "
        f"{result.get('updated', 0)} updated"
    )
    if meta["skipped_empty_rows"]:
        msg += f", {meta['skipped_empty_rows']} empty row(s) skipped"
    return success_response(message=msg, data=result, meta=meta)


@router.get(
    "/association-count",
    summary="Association count for time periods",
    description=f"Return {ASSOC_DATA_COUNT} for the given time periods. Query param: identifier (comma-separated id or timeperiod value). Used for delete confirmation.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse or time period not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def association_count_time_periods(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: Optional[str] = Query(None, description="Comma-separated time period identifiers (id or timeperiod value)", alias=QUERY_IDENTIFIER),
):
    identifiers: List[str] = []
    if identifier:
        identifiers = [p.strip() for p in identifier.split(",") if p.strip()]
    data = time_period_service.get_association_counts(dw_id, identifiers)
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.get(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Get Time Period by identifier",
    description="Get one time period by identifier. **Identifier** is either the numeric primary key (timeperiod_nid) or the timeperiod string value (e.g. '2019-20'). Returns id, timeperiod, startdate, enddate, periodicity.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Time period retrieved successfully", "model": SuccessResponse},
        404: {"description": "Time period or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_time_period(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(
        ...,
        description="Time period identifier: numeric for timeperiod_nid (primary key), or the timeperiod string value (e.g. '2019-20').",
        alias=PATH_IDENTIFIER,
    ),
):
    cache_key = f"dw:time-periods:id:{dw_id}:{identifier}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    item = time_period_service.get_time_period_by_identifier(dw_id, identifier)

    if not item:
        raise not_found_for_identifier("Time period", identifier)

    # Transform to response format
    response_data = TimePeriodResponseSchema.model_validate(item).model_dump(**get_serialization_mode())

    body = {
        "success": True,
        "message": "Time period retrieved successfully",
        "data": response_data,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Time period retrieved successfully",
        data=response_data,
    )


@router.patch(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Update Time Period",
    description="Update a time period (partial). Body: timeperiod and/or periodicity only; startdate/enddate are not accepted (dates stay derived when periodicity is set, otherwise unchanged). identifier is numeric id or timeperiod value.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Time period updated successfully", "model": SuccessResponse},
        404: {"description": "Time period or warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_time_period(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Time period identifier: numeric id or timeperiod value.", alias=PATH_IDENTIFIER),
    data: TimePeriodUpdateSchema = Body(..., alias=BODY_DATA),
):
    result = time_period_service.update(dw_id, identifier, data)
    _invalidate_time_periods_cache(dw_id)
    ser_mode = get_serialization_mode()
    payload_keys = set(data.model_dump(exclude_unset=True, **ser_mode).keys())
    full_response = TimePeriodResponseSchema.model_validate(result).model_dump(**ser_mode)
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}
    return success_response(
        message="Time period updated successfully",
        data=response_data,
    )


@router.delete(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Delete Time Period",
    description="Delete a time period. Cascades: deletes dependent data records then the time period.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Time period deleted successfully", "model": SuccessResponse},
        404: {"description": "Time period or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_time_period(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Time period identifier: numeric id or timeperiod value.", alias=PATH_IDENTIFIER),
):
    time_period_service.delete(dw_id, identifier)
    _invalidate_time_periods_cache(dw_id)
    return no_content_response()
