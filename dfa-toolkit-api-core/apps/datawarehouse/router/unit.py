"""
Unit router for CRUD operations on unit table

TODO: When the application database is set up, the dw_id in the URL
      should be used to lookup credentials from a database table instead of
      using hardcoded credentials.
"""
import logging
from enum import Enum
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query, Path, Body, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from apps.shared.exceptions import BadRequest, not_found_for_identifier
from apps.datawarehouse.schemas.unit import (
    UnitCreateSchema,
    UnitUpdateSchema,
    UnitResponseSchema,
    UnitMultipleDeleteSchema,
)
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.services.unit import UnitService
from apps.datawarehouse.utils.export_utils import build_generic_export_xlsx, UNIT_COLUMN_DEFS
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import (
    success_response,
    created_response_data,
    no_content_response,
    deleted_success_message,
)
from apps.shared.utils.validators import resolve_identifier_to_nid
from apps.datawarehouse.db.datawarehouse import get_dw_language_code, get_warehouse_credentials
from apps.shared.config.config import settings
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_SORT_ORDER,
    QUERY_SORT_FIELD,
    QUERY_SEARCH,
    QUERY_SEARCH_BY,
    QUERY_FILTER_GLOBAL,
    QUERY_IDENTIFIER,
    BODY_DATA,
    BODY_BODY,
    ASSOC_DATA_ROWS,
    ASSOC_IUS_ROWS,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Units"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/units")
unit_service = UnitService()


class UnitListSearchBy(str, Enum):
    u_name = "u_name"
    u_gid = "u_gid"


@router.post(
    "",
    summary="Create Unit(s) (batch)",
    description="Create one or more units in the specified data warehouse with i18n support. Request body is an array of unit objects. **Required per item**: unit_name. **Optional**: unit_gid (auto-generated if not provided), unit_global, unit_format (display/format code for data values). Send a single object in an array for one unit, or multiple for bulk create. All-or-nothing transaction.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Unit(s) created successfully", "model": SuccessResponse},
        400: {"description": "Bad request - empty array or validation error", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_unit(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    data: List[UnitCreateSchema] = Body(..., description="Array of unit creation data", alias=BODY_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    if not data:
        raise BadRequest("Request body must be a non-empty array of unit objects")
    result = unit_service.create_units_batch(dw_id, data, language_code)
    ser_mode = get_serialization_mode()
    response_data = [
        UnitResponseSchema.model_validate(r).model_dump(**ser_mode)
        for r in result["created"]
    ]
    nid_key = alias_field("ut_unit", "unit_nid") if ser_mode.get("by_alias") else "unit_nid"
    gid_key = alias_field("ut_unit", "unit_gid") if ser_mode.get("by_alias") else "unit_gid"
    data_out = created_response_data(response_data, nid_key, gid_key)
    cache_delete_pattern("dw:units:*")
    count = len(response_data)
    errors = result.get("errors", [])
    message = f"{count} unit(s) created successfully" + (f", {len(errors)} failed" if errors else "")
    meta: dict = {"count": count}
    if errors:
        meta["errors"] = errors
    return success_response(
        message=message,
        data=data_out,
        status_code=status.HTTP_201_CREATED,
        meta=meta,
    )


@router.get(
    "",
    summary="Get All Units",
    description="Get all units with pagination, sort, search, filter and i18n support",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Units retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code or missing search_by when search is set", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_units(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query(
        "u_nid",
        description="Sort field: u_nid, u_name, u_gid",
        alias=QUERY_SORT_FIELD,
    ),
    search: Optional[str] = Query(
        None,
        description="Search term (case-insensitive substring). Requires search_by when non-empty.",
        alias=QUERY_SEARCH,
    ),
    search_by: Optional[UnitListSearchBy] = Query(
        None,
        description="Column to search when search is set: u_name or u_gid",
        alias=QUERY_SEARCH_BY,
    ),
    filter_global: Optional[bool] = Query(
        None,
        description="Filter by global flag (u_is_global)",
        alias=QUERY_FILTER_GLOBAL,
    ),
    export: bool = Query(False, description="Export as XLSX; disables pagination", alias="export"),
    language_code: str = Depends(get_dw_language_code),
):
    if search and search.strip() and search_by is None:
        raise BadRequest("search_by is required when search is provided (u_name or u_gid)")
    search_by_str = search_by.value if search_by is not None else None
    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        units = unit_service.get_all_units_for_export(
            dw_id,
            language_code=language_code,
            sort_order=sort_order or "asc",
            sort_field=sort_field or "u_nid",
            search=search,
            search_by=search_by_str,
            filter_global=filter_global,
        )
        rows = [
            [r.get("unit_nid"), r.get("unit_gid"), r.get("unit_name"), r.get("unit_global"), r.get("unit_format")]
            for r in units
        ]
        output, filename = build_generic_export_xlsx(
            "Units", UNIT_COLUMN_DEFS, rows, language_code, db_display_name, "UNITS"
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    use_pagination = page_size is not None
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    cache_key = (
        f"dw:units:list:{dw_id}:{page}:{effective_page_size}:{sort_order or 'asc'}:"
        f"{sort_field or 'u_nid'}:{language_code}:{search}:{search_by_str or '-'}:{filter_global}"
    )
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)
    units, total_count, filtered_count = unit_service.get_all_units(
        dw_id,
        page=page,
        page_size=effective_page_size,
        language_code=language_code,
        sort_order=sort_order or "asc",
        sort_field=sort_field or "u_nid",
        search=search,
        search_by=search_by_str,
        filter_global=filter_global,
    )
    
    # Transform list with Pydantic serialization
    ser_mode = get_serialization_mode()
    response_data = [UnitResponseSchema.model_validate(u).model_dump(**ser_mode) for u in units]
    
    if effective_page_size is not None:
        total_pages = (filtered_count + effective_page_size - 1) // effective_page_size if filtered_count else 0
        meta_page, meta_page_size = page, effective_page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, filtered_count
    has_list_filters = bool(search and search.strip()) or filter_global is not None
    meta = build_list_pagination_meta(
        total_count=filtered_count,
        count=len(response_data),
        page=meta_page,
        page_size=meta_page_size,
        total_pages=total_pages,
        total_count_unfiltered=resolve_unfiltered_total(
            filtered_count,
            total_count,
            has_list_filters=has_list_filters,
        ),
    )
    body = {
        "success": True,
        "message": f"Retrieved {len(response_data)} units",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message=f"Retrieved {len(response_data)} units",
        data=response_data,
        meta=meta,
    )


@router.get(
    "/association-count",
    summary="Association count for units",
    description=f"Return association counts ({ASSOC_DATA_ROWS}, {ASSOC_IUS_ROWS}) for the given units. Query param: identifier (comma-separated unit_nid or unit_gid). Used for delete confirmation; data rows and IUS (indicator-unit-subgroup) links for those units.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def association_count_units(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: Optional[str] = Query(None, description="Comma-separated unit identifiers (unit_nid or unit_gid)", alias=QUERY_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    unit_nids: List[int] = []
    if identifier:
        parts = [p.strip() for p in identifier.split(",") if p.strip()]
        for p in parts:
            nid = resolve_identifier_to_nid(p, lambda gid: unit_service.get_unit_nid_by_gid(dw_id, gid))
            if nid is not None:
                unit_nids.append(nid)
        if parts and not unit_nids:
            raise not_found_for_identifier("Unit", identifier)
    data = unit_service.get_association_counts(dw_id, unit_nids, language_code)
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.post(
    "/multiple-delete",
    summary="Delete multiple units",
    description="Delete multiple units by unit GID list. Cascade: ut_data -> IC_IUS -> metadata reports -> IUS -> locale unit. Returns deleted nids and aggregated data/ius deleted counts.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Units deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse or unit not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def multiple_delete_units(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: UnitMultipleDeleteSchema = Body(..., description="List of unit GIDs to delete", alias=BODY_BODY),
    language_code: str = Depends(get_dw_language_code),
):
    unit_nids: List[int] = []
    resolve_errors = []
    for idx, gid in enumerate(body.unit_gid or []):
        nid = unit_service.get_unit_nid_by_gid(dw_id, gid.strip())
        if nid is not None:
            unit_nids.append(nid)
        else:
            resolve_errors.append({"index": idx, "error": f"Unit with gid '{gid.strip()}' not found"})
    result = unit_service.multiple_delete(dw_id, unit_nids, language_code)
    result = result if result is not None else {}
    cache_delete_pattern("dw:units:*")
    all_errors = resolve_errors + result.get("errors", [])
    meta = {"errors": all_errors} if all_errors else None
    deleted = result.get("deleted", [])
    message = f"{len(deleted)} unit(s) deleted successfully" + (f", {len(all_errors)} failed" if all_errors else "")
    return success_response(
        message=message,
        data={"deleted": deleted},
        meta=meta,
    )




@router.get(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Get Unit by identifier",
    description="Get a unit by identifier. **Identifier** is either the numeric primary key (unit_nid) or the alphanumeric GID (unit_gid). Numeric -> u_nid, non-numeric -> u_gid.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Unit retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Unit or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_unit(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Unit identifier: numeric for u_nid (primary key), non-numeric for u_gid.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    cache_key = f"dw:units:id:{dw_id}:{identifier}:{language_code}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)
    unit_nid = resolve_identifier_to_nid(identifier, lambda gid: unit_service.get_unit_nid_by_gid(dw_id, gid))
    if unit_nid is None:
        raise not_found_for_identifier("Unit", identifier)
    unit = unit_service.get_unit_by_id(dw_id, unit_nid, language_code)
    if not unit:
        raise not_found_for_identifier("Unit", identifier)
    
    # Transform to response format
    response_data = UnitResponseSchema.model_validate(unit).model_dump(**get_serialization_mode())
    
    body = {"success": True, "message": "Unit retrieved successfully", "data": response_data}
    cache_set(cache_key, body)
    return success_response(
        message="Unit retrieved successfully",
        data=response_data,
    )


@router.patch(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Update Unit by identifier",
    description="Update a unit by identifier. **Identifier** is either the numeric primary key (unit_nid) or the alphanumeric GID (unit_gid). Numeric -> u_nid, non-numeric -> u_gid.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Unit updated successfully", "model": SuccessResponse},
        400: {"description": "Bad request - validation error", "model": ErrorResponse},
        404: {"description": "Unit or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_unit(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Unit identifier: numeric for u_nid (primary key), non-numeric for u_gid.", alias=PATH_IDENTIFIER),
    data: UnitUpdateSchema = Body(..., alias=BODY_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    unit_nid = resolve_identifier_to_nid(identifier, lambda gid: unit_service.get_unit_nid_by_gid(dw_id, gid))
    if unit_nid is None:
        raise not_found_for_identifier("Unit", identifier)
    result = unit_service.update_unit(dw_id, unit_nid, data, language_code)
    if not result:
        raise not_found_for_identifier("Unit", identifier)

    ser_mode = get_serialization_mode()
    payload_keys = set(data.model_dump(exclude_unset=True, **ser_mode).keys())
    full_response = UnitResponseSchema.model_validate(result).model_dump(**ser_mode)
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}

    cache_delete_pattern(f"dw:units:*")
    return success_response(
        message=f"Unit '{identifier}' updated successfully",
        data=response_data,
    )


@router.delete(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Delete Unit by identifier",
    description="Delete a unit by identifier with full cascade. **Identifier** is either the numeric primary key (unit_nid) or the alphanumeric GID (unit_gid). **Cascade order**: ut_data → ut_ic_ius → metadata reports → IUS → locale unit.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Unit deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request", "model": ErrorResponse},
        404: {"description": "Unit or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_unit(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Unit identifier: numeric for u_nid (primary key), non-numeric for u_gid.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    unit_nid = resolve_identifier_to_nid(identifier, lambda gid: unit_service.get_unit_nid_by_gid(dw_id, gid))
    if unit_nid is None:
        raise not_found_for_identifier("Unit", identifier)
    deleted = unit_service.delete_unit(dw_id, unit_nid, language_code)
    if not deleted:
        raise not_found_for_identifier("Unit", identifier)
    cache_delete_pattern(f"dw:units:*")
    return no_content_response()
