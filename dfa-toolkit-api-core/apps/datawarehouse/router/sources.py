"""
Source Management router – CRUD for Sources (ic_type=SR, ic_parent_nid != -1).
Endpoints: list, create, get one, update, delete, breakup, association-count, multiple-delete.
"""
import logging
from typing import List, Optional, Union

from fastapi import APIRouter, Body, Depends, Path, Query

from apps.shared.exceptions import BadRequest, UnprocessableEntity, not_found_for_identifier
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.schemas.source import (
    SourceCreateSchema,
    SourceUpdateSchema,
    SourceResponseSchema,
    SourceListResponseSchema,
    SourceBreakupSchema,
    SourceMultipleDeleteSchema,
    SOURCE_ENTITY,
)
from apps.datawarehouse.services.source import SourceService
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import get_alias
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import (
    success_response,
    created_response,
    created_response_data,
    no_content_response,
)
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.datawarehouse.db.datawarehouse import validate_dw_id, get_dw_language_code
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
    QUERY_SCOPE,
    QUERY_IDENTIFIER,
    BODY_BODY,
    ASSOC_DATA_ROWS,
    ASSOC_IUS_ROWS,
    SOURCE_SEARCH_BY_FIELDS,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Data Warehouse - Sources"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/sources",
)
source_service = SourceService()

ALLOWED_SORT_FIELDS = ("ic_nid", "ic_name", "publisher", "title", "diyear", "ic_short_name")
SOURCE_SCOPE_VALUES = ("ALL", "NO_DATA")


@router.get(
    "",
    summary="List Sources",
    description="List Source child rows only. Supports pagination, sort, search. Optional search_by to search specific field. Optional scope: ALL (default), NO_DATA (only Sources with no ut_data.source_nid).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Sources retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid scope", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def list_sources(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(
        None, ge=1, le=1000, description="Page size; omit for no pagination", alias=QUERY_PAGE_SIZE
    ),
    sort_order: Optional[str] = Query("asc", description="asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query(
        "ic_nid",
        description="Sort field: src_nid, src_name, src_publisher, src_title, src_year, src_short_name",
        alias=QUERY_SORT_FIELD,
    ),
    search: Optional[str] = Query(None, description="Search in src_name, src_short_name, src_publisher, src_title, src_year", alias=QUERY_SEARCH),
    search_by: Optional[str] = Query(None, description="Field to search in: src_name, src_short_name, src_publisher, src_title, src_year", alias=QUERY_SEARCH_BY),
    scope: Optional[str] = Query(None, description="Filter: ALL (default) or NO_DATA (only Sources with no linked data)", alias=QUERY_SCOPE),
):
    if scope is not None and scope not in SOURCE_SCOPE_VALUES:
        raise BadRequest(
            f"scope must be one of: {', '.join(SOURCE_SCOPE_VALUES)}",
        )
    if search_by is not None and search_by not in SOURCE_SEARCH_BY_FIELDS:
        raise BadRequest(
            f"search_by must be one of: {', '.join(SOURCE_SEARCH_BY_FIELDS)}",
        )
    sort = (sort_field or "ic_nid") if (sort_field or "ic_nid") in ALLOWED_SORT_FIELDS else "ic_nid"
    effective_page_size = (
        max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000)) if page_size is not None else None
    )
    items, total_count, total_count_unfiltered_raw = source_service.list_sources(
        dw_id,
        page=page,
        page_size=effective_page_size,
        language_code=language_code,
        sort_order=sort_order or "asc",
        sort_field=sort,
        search=search,
        search_by=search_by,
        scope=scope,
    )
    ser_mode = get_serialization_mode()
    response_data = [
        SourceListResponseSchema.model_validate(item).model_dump(**ser_mode)
        for item in items
    ]
    has_list_filters = bool((search and search.strip()) or scope == "NO_DATA")
    unfiltered = resolve_unfiltered_total(
        total_count, total_count_unfiltered_raw, has_list_filters=has_list_filters
    )
    if effective_page_size is not None:
        total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        meta = build_list_pagination_meta(
            total_count=total_count,
            count=len(response_data),
            page=page,
            page_size=effective_page_size,
            total_pages=total_pages,
            total_count_unfiltered=unfiltered,
        )
        return success_response(
            message="Sources retrieved successfully",
            data=response_data,
            meta=meta,
        )
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(response_data),
        page=1,
        page_size=total_count,
        total_pages=1 if total_count else 0,
        total_count_unfiltered=unfiltered,
    )
    return success_response(
        message="Sources retrieved successfully",
        data=response_data,
        meta=meta,
    )


@router.get(
    "/breakup",
    summary="Source Breakup",
    description="Get distinct publishers, titles, and years from Source rows for dropdowns.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Breakup retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_sources_breakup(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
):
    data = source_service.get_breakup(dw_id, language_code=language_code)
    return success_response(
        message="Source breakup retrieved successfully",
        data=SourceBreakupSchema(**data).model_dump(),
    )


@router.get(
    "/association-count",
    summary="Association count for sources",
    description=f"Return association counts ({ASSOC_DATA_ROWS}, {ASSOC_IUS_ROWS}) for the given sources. Query param: identifier (comma-separated src_nid or src_gid). Used for delete confirmation.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse or source not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def association_count_sources(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: Optional[str] = Query(None, description="Comma-separated source identifiers (src_nid or src_gid)", alias=QUERY_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    identifiers: List[Union[int, str]] = []
    if identifier:
        parts = [p.strip() for p in identifier.split(",") if p.strip()]
        for p in parts:
            identifiers.append(int(p) if p.isdigit() else p)
    try:
        data = source_service.get_association_counts(dw_id, identifiers, language_code)
        return success_response(
            message="Association counts retrieved successfully",
            data=data,
        )
    except ValueError as e:
        if "not found" in str(e).lower():
            raise not_found_for_identifier("Source", identifier or "")
        raise UnprocessableEntity(str(e))


# Commented out for now
# @router.post(
#     "/multiple-delete",
#     summary="Delete multiple sources",
#     description="Delete multiple sources by source GID list (src_gid). Cascade: ut_data, ut_ic_ius, then source locale rows. Orphan publishers deleted.",
#     response_model=SuccessResponse,
#     responses={
#         200: {"description": "Sources deleted successfully", "model": SuccessResponse},
#         404: {"description": "Warehouse not found", "model": ErrorResponse},
#         500: {"description": "Internal server error", "model": ErrorResponse},
#     },
# )
# async def multiple_delete_sources(
#     dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
#     _: str = Depends(validate_dw_id),
#     body: SourceMultipleDeleteSchema = Body(..., description="List of source GIDs to delete", alias=BODY_BODY),
# ):
#     if body.src_gid:
#         source_service.multiple_delete(dw_id, body.src_gid)
#     return no_content_response()


@router.get(
    "/{identifier}",
    summary="Get Source by identifier",
    description="Get one Source by src_nid (numeric) or src_gid. Use include_ius=true to include linked IUS nids.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Source retrieved successfully", "model": SuccessResponse},
        404: {"description": "Source or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_source(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    identifier: str = Path(..., description="Source src_nid (numeric) or src_gid", alias=PATH_IDENTIFIER),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    include_ius: bool = Query(False, description="Include IUS nids linked to this Source"),
):
    out = source_service.get_source_by_identifier(
        dw_id, identifier, language_code=language_code, include_ius=include_ius
    )
    if out is None:
        raise not_found_for_identifier("Source", identifier)
    ser_mode = get_serialization_mode()
    return success_response(
        message="Source retrieved successfully",
        data=SourceResponseSchema.model_validate(out).model_dump(**ser_mode),
    )


@router.post(
    "",
    summary="Create Source",
    description=(
        "Create a Source. **Mandatory:** src_title (title). Optional: src_publisher (default GLOBAL), year, short_name, src_gid, "
        "sourcelink1/2, isbn, nature. Duplicate source (same publisher+title+year) or duplicate src_gid/src_short_name returns 409 Conflict."
    ),
    response_model=SuccessResponse,
    responses={
        201: {"description": "Source created successfully", "model": SuccessResponse},
        400: {"description": "Validation error (e.g. invalid body format)", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        409: {"description": "Conflict: source already exists (same publisher+title+year) or src_gid/src_short_name duplicate", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_source(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    body: SourceCreateSchema = ...,
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
):
    result = source_service.create_source(dw_id, body, language_code=language_code)
    ser_mode = get_serialization_mode()
    full_data = SourceResponseSchema.model_validate(result).model_dump(**ser_mode)
    # Use alias keys when by_alias so created_response_data returns src_nid, src_gid
    nid_key = get_alias(SOURCE_ENTITY, "ic_nid") if ser_mode.get("by_alias") else "ic_nid"
    gid_key = get_alias(SOURCE_ENTITY, "ic_gid") if ser_mode.get("by_alias") else "ic_gid"
    data = created_response_data(full_data, nid_key=nid_key or "ic_nid", gid_key=gid_key or "ic_gid")
    return created_response("Source created successfully", data)


@router.patch(
    "/{identifier}",
    summary="Update Source",
    description="Update a Source by src_nid or src_gid. All fields optional: src_publisher, src_title, year, short_name, src_gid.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Source updated successfully", "model": SuccessResponse},
        400: {"description": "Validation error", "model": ErrorResponse},
        404: {"description": "Source or warehouse not found", "model": ErrorResponse},
        409: {"description": "Conflict (e.g. src_gid already exists)", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_source(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    identifier: str = Path(..., description="Source src_nid or src_gid", alias=PATH_IDENTIFIER),
    body: SourceUpdateSchema = ...,
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
):
    result = source_service.update_source(dw_id, identifier, body, language_code=language_code)
    if result is None:
        raise not_found_for_identifier("Source", identifier)
    ser_mode = get_serialization_mode()
    full_response = SourceResponseSchema.model_validate(result).model_dump(**ser_mode)
    # Return only the fields that were in the PATCH body (request key -> response key)
    payload_keys = set(body.model_dump(exclude_unset=True, **ser_mode).keys())
    request_to_response = {"year": "diyear", "short_name": "ic_short_name"}
    response_data = {}
    for k in payload_keys:
        response_key = request_to_response.get(k, k)
        if response_key in full_response:
            response_data[response_key] = full_response[response_key]
    return success_response(
        message="Source updated successfully",
        data=response_data,
    )


@router.delete(
    "/{identifier}",
    summary="Delete Source",
    description="Delete Source: remove linked data rows, ut_ic_ius links, and Source locale rows. If the parent publisher has no other child sources, the publisher is also deleted.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Source deleted successfully", "model": SuccessResponse},
        404: {"description": "Source or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_source(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    identifier: str = Path(..., description="Source src_nid or src_gid", alias=PATH_IDENTIFIER),
    _: str = Depends(validate_dw_id),
):
    ok = source_service.delete_source(dw_id, identifier)
    if not ok:
        raise not_found_for_identifier("Source", identifier)
    return success_response(message="Source deleted successfully", data=None)
