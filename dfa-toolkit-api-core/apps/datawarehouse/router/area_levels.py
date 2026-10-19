"""
Area Levels router – CRUD: list, get one, create, update (PATCH), delete, association-count, multiple-delete.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, status, Path, Query, Body, HTTPException
from fastapi.responses import JSONResponse

from apps.shared.exceptions import BadRequest, not_found_for_identifier
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.services.area_level import AreaLevelService
from apps.datawarehouse.schemas.area import (
    AreaLevelResponseSchema,
    AreaLevelCreateSchema,
    AreaLevelUpdateSchema,
    AreaLevelMultipleDeleteSchema,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.shared.utils.response import (
    success_response,
    created_response_data,
    no_content_response,
)
from apps.datawarehouse.db.datawarehouse import get_dw_language_code, get_warehouse_credentials
from apps.shared.config.config import settings
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_IDENTIFIER,
    BODY_BODY,
    QUERY_SORT_ORDER,
    QUERY_SORT_FIELD,
    ASSOC_AREA_COUNT,
    ASSOC_DATA_COUNT,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Area Levels"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/area-levels")
area_level_service = AreaLevelService()


@router.get(
    "",
    summary="List Area Levels",
    description="List area levels with pagination. Sort: sort_order (asc/desc), sort_field (al_nid, al_level, al_name). Returns level_nid, area_level, area_level_name (serialized as al_nid, al_level, al_name in external mode). Pagination: page (1-based), page_size; response includes meta (page, page_size, total_count, total_pages).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Area levels retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_area_levels(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query("al_level", description="Sort field: al_nid, al_level, al_name", alias=QUERY_SORT_FIELD),
    language_code: str = Depends(get_dw_language_code),
):
    use_pagination = page_size is not None
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    cache_key = f"dw:area-levels:list:{dw_id}:{language_code}:{page}:{effective_page_size}:{sort_order or 'asc'}:{sort_field or 'al_level'}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items, total_count = area_level_service.get_all_area_levels(
        dw_id, language_code, page=page, page_size=effective_page_size,
        sort_order=sort_order or "asc", sort_field=sort_field or "al_level",
    )
    
    # Transform list with Pydantic serialization
    ser_mode = get_serialization_mode()
    response_data = [AreaLevelResponseSchema.model_validate(item).model_dump(**ser_mode) for item in items]

    if effective_page_size is not None:
        total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        meta_page, meta_page_size = page, effective_page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, total_count
    meta = ListPaginationMetaSchema(
        total_count=total_count,
        count=len(response_data),
        page=meta_page,
        page_size=meta_page_size,
        total_pages=total_pages,
    ).model_dump()
    body = {
        "success": True,
        "message": "Area levels retrieved successfully",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Area levels retrieved successfully",
        data=response_data,
        meta=meta,
    )




@router.get(
    "/association-count",
    summary="Association count for area levels",
    description=f"Return association counts ({ASSOC_AREA_COUNT}, {ASSOC_DATA_COUNT}) for the given area levels. Query param: identifier (comma-separated numeric identifiers). Used for delete confirmation; areas at those levels and data rows under those areas.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def association_count_area_levels(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: Optional[str] = Query(None, description="Comma-separated numeric identifiers", alias=QUERY_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    level_nids: List[int] = []
    if identifier:
        parts = [p.strip() for p in identifier.split(",") if p.strip()]
        try:
            level_nids = [int(p) for p in parts]
        except ValueError:
            raise BadRequest("identifier must be comma-separated numeric values only")
    data = area_level_service.get_association_counts(dw_id, level_nids, language_code)
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.get(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Get Area Level by identifier",
    description="Get one area level by identifier. **Identifier**: numeric only (level_nid). Returns level_nid, area_level, area_level_name (serialized as al_nid, al_level, al_name in external mode).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Area level retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code or non-numeric identifier", "model": ErrorResponse},
        404: {"description": "Area level or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_area_level(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Area level identifier: numeric only (level_nid)", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    if not identifier.isdigit():
        raise BadRequest("Area level identifier must be numeric only")
    level_nid = int(identifier)

    cache_key = f"dw:area-levels:id:{dw_id}:{identifier}:{language_code}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    item = area_level_service.get_area_level_by_nid(dw_id, level_nid, language_code)

    if not item:
        raise not_found_for_identifier("Area level", identifier)
    
    # Transform to response format
    response_data = AreaLevelResponseSchema.model_validate(item).model_dump(**get_serialization_mode())

    body = {
        "success": True,
        "message": "Area level retrieved successfully",
        "data": response_data,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Area level retrieved successfully",
        data=response_data,
    )


@router.post(
    "",
    summary="Create Area Level(s) (batch)",
    description="Create one or more area levels. Request body is an array of area level objects. **Required per item**: area_level (level number, unique), area_level_name (name, unique). Accepts internal (area_level, area_level_name) or external (al_level, al_name) keys. All-or-nothing transaction.",
    response_model=SuccessResponse,
    responses={
        201: {"description": "Area level(s) created successfully", "model": SuccessResponse},
        400: {"description": "Bad request - empty array or invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        409: {"description": "Conflict - duplicate level or name", "model": ErrorResponse},
        422: {"description": "Validation error - missing level or name, invalid input", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    status_code=status.HTTP_201_CREATED,
)
async def create_area_level(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: List[AreaLevelCreateSchema] = Body(..., description="Array of area level creation data (area_level, area_level_name)", alias=BODY_BODY),
    language_code: str = Depends(get_dw_language_code),
):
    if not body:
        raise BadRequest("Request body must be a non-empty array of area level objects")
    result = area_level_service.create_area_levels_batch(dw_id, body, language_code)
    cache_delete_pattern("dw:area-levels:*")
    ser_mode = get_serialization_mode()
    response_data = [
        AreaLevelResponseSchema.model_validate(r).model_dump(**ser_mode)
        for r in result["created"]
    ]
    nid_key = alias_field("ut_area_level", "level_nid") if ser_mode.get("by_alias") else "level_nid"
    data_out = created_response_data(response_data, nid_key, gid_key=None)
    count = len(response_data)
    errors = result.get("errors", [])
    message = f"{count} area level(s) created successfully" + (f", {len(errors)} failed" if errors else "")
    meta: dict = {"count": count}
    if errors:
        meta["errors"] = errors
    return success_response(
        message=message,
        data=data_out,
        status_code=status.HTTP_201_CREATED,
        meta=meta,
    )


@router.patch(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Update Area Level",
    description="Update an existing area level by identifier. **Identifier**: numeric only (level_nid). **Allowed updates**: area_level (must remain unique), area_level_name (must remain unique). Uniqueness checks exclude the current record. Locale-specific name updated per Accept-Language.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Area level updated successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code or non-numeric identifier", "model": ErrorResponse},
        404: {"description": "Area level or warehouse not found", "model": ErrorResponse},
        409: {"description": "Conflict - duplicate level or name", "model": ErrorResponse},
        422: {"description": "Validation error", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_area_level(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Area level identifier: numeric only (level_nid)", alias=PATH_IDENTIFIER),
    body: AreaLevelUpdateSchema = Body(..., description="Area level update data (area_level and/or area_level_name)", alias=BODY_BODY),
    language_code: str = Depends(get_dw_language_code),
):
    if not identifier.isdigit():
        raise BadRequest("Area level identifier must be numeric only")
    updated = area_level_service.update_area_level(dw_id, identifier, body, language_code)
    cache_delete_pattern("dw:area-levels:*")
    ser_mode = get_serialization_mode()
    payload_keys = set(body.model_dump(exclude_unset=True, **ser_mode).keys())
    full_response = AreaLevelResponseSchema.model_validate(updated).model_dump(**ser_mode)
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}
    return success_response(
        message="Area level updated successfully",
        data=response_data,
    )


@router.delete(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Delete Area Level",
    description="Delete area level by identifier. **Identifier**: numeric only (level_nid). Cascades: deletes all areas whose area_level matches the deleted level, then area deletion rules apply (maps/layers/metadata/child areas).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Area level deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code or non-numeric identifier", "model": ErrorResponse},
        404: {"description": "Area level or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_area_level(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Area level identifier: numeric only (level_nid)", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    if not identifier.isdigit():
        raise BadRequest("Area level identifier must be numeric only")
    area_level_service.delete_area_level(dw_id, identifier, language_code)
    cache_delete_pattern("dw:area-levels:*")
    return no_content_response()


@router.post(
    "/multiple-delete",
    summary="Delete multiple area levels",
    description="Delete multiple area levels by level_nid list. Cascade: deletes all areas at those levels (and area delete cascades to data/maps/descendants). Returns deleted level_nids and aggregated counts.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Area levels deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def multiple_delete_area_levels(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: AreaLevelMultipleDeleteSchema = Body(..., description="List of area level nids to delete", alias=BODY_BODY),
    language_code: str = Depends(get_dw_language_code),
):
    result = area_level_service.multiple_delete(dw_id, body.level_nid or [], language_code)
    result = result if result is not None else {}
    cache_delete_pattern("dw:area-levels:*")
    errors = result.get("errors", [])
    deleted = result.get("deleted", [])
    meta = {"errors": errors} if errors else None
    message = f"{len(deleted)} area level(s) deleted successfully" + (f", {len(errors)} failed" if errors else "")
    return success_response(
        message=message,
        data={"deleted": deleted},
        meta=meta,
    )
