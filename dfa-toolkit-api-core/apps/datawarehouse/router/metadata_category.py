"""
Metadata Categories – CRUD for ut_metadata_category_<locale>.
API paths:
  List categories       = GET    /dw/{dw_id}/metadata-categories
  Bulk create           = POST   /dw/{dw_id}/metadata-categories
  Association count     = GET    /dw/{dw_id}/metadata-categories/associated-count
  Get one               = GET    /dw/{dw_id}/metadata-categories/{identifier}
  Update                = PATCH  /dw/{dw_id}/metadata-categories/{identifier}
  Delete                = DELETE /dw/{dw_id}/metadata-categories/{identifier}

Identifier rules:
  numeric   → categorynid (mt_catg_nid)
  string    → categorygid (mt_catg_gid)
"""
import logging
from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, status, Path, Query, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import RootModel

from apps.shared.exceptions import not_found_for_identifier


class MetadataCategoryType(str, Enum):
    """Allowed values for mt_catg_type filter."""
    INDICATOR = "I"
    AREA = "A"
    SOURCE = "S"

from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.services.metadata_category import MetadataCategoryService
from apps.datawarehouse.schemas.metadata_category import (
    MetadataCategoryCreateSchema,
    MetadataCategoryUpdateSchema,
    MetadataCategoryResponseSchema,
    MetadataCategoryAssocCountSchema,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.shared.utils.response import (
    success_response,
    created_response_data,
    no_content_response,
)
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.datawarehouse.db.datawarehouse import validate_dw_id, get_dw_language_code
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    QUERY_SORT_ORDER,
    QUERY_SORT_FIELD,
    QUERY_IDENTIFIER,
    QUERY_MT_CATG_TYPE,
    QUERY_SEARCH,
    ASSOC_INDICATOR_COUNT,
    ASSOC_AREA_COUNT,
)

from apps.datawarehouse.utils.export_utils import build_generic_export_xlsx, METADATA_CATEGORY_COLUMN_DEFS
from apps.datawarehouse.db.datawarehouse import get_warehouse_credentials

logger = logging.getLogger(__name__)
router = APIRouter(
    tags=["Data Warehouse - Metadata Categories"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}",
)
_service = MetadataCategoryService()

_CACHE_NS = "dw:mt-categories"


def _invalidate_cache() -> None:
    cache_delete_pattern(f"{_CACHE_NS}:*")


# ---------------------------------------------------------------------------
# GET /metadata-categories
# ---------------------------------------------------------------------------

@router.get(
    "/metadata-categories",
    summary="Metadata Category (list)",
    description=(
        "List metadata categories with optional type filter, search, sorting, and pagination. "
        "mt_catg_type filter: 'I' (Indicator), 'A' (Area), 'S' (Source); omit for all types. "
        "search: substring match against mt_catg_name or mt_catg_gid (case-insensitive). "
        "sort_field: mt_catg_order | mt_catg_name | mt_catg_gid | mt_catg_nid. "
        "sort_order: asc | desc."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Metadata categories retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_metadata_categories(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    catg_type: Optional[MetadataCategoryType] = Query(None, description="Filter by category type: I (Indicator), A (Area), S (Source)", alias=QUERY_MT_CATG_TYPE),
    search: Optional[str] = Query(None, description="Substring search across mt_catg_name and mt_catg_gid (case-insensitive)", alias=QUERY_SEARCH),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page; omit for all records", alias=QUERY_PAGE_SIZE),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query("mt_catg_order", description="Sort field: mt_catg_order, mt_catg_name, mt_catg_gid, mt_catg_nid", alias=QUERY_SORT_FIELD),
    export: bool = Query(False, description="Export as XLSX; disables pagination", alias="export"),
):
    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        items, _total = _service.get_all(
            dw_id,
            language_code=language_code,
            catg_type=catg_type.value if catg_type is not None else None,
            search=search or None,
            sort_field=sort_field or "mt_catg_order",
            sort_order=sort_order or "asc",
            page=1,
            page_size=None,
        )
        rows = [
            [item.get(col) for col in METADATA_CATEGORY_COLUMN_DEFS]
            for item in items
        ]
        output, filename = build_generic_export_xlsx(
            "MetadataCategories", METADATA_CATEGORY_COLUMN_DEFS, rows, language_code, db_display_name, "METADATA_CATEGORIES"
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    effective_page_size = (max(1, min(page_size, 1000))) if page_size is not None else None
    cache_key = (
        f"{_CACHE_NS}:list:{dw_id}:{language_code}:{catg_type.value if catg_type else 'all'}"
        f":{search or ''}:{page}:{effective_page_size}:{sort_order or 'asc'}:{sort_field or 'mt_catg_order'}"
    )
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items, total_count = _service.get_all(
        dw_id,
        language_code=language_code,
        catg_type=catg_type.value if catg_type is not None else None,
        search=search or None,
        sort_field=sort_field or "mt_catg_order",
        sort_order=sort_order or "asc",
        page=page,
        page_size=effective_page_size,
    )
    ser_mode = get_serialization_mode()
    response_data = [MetadataCategoryResponseSchema.model_validate(item).model_dump(**ser_mode) for item in items]

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
        "message": "Metadata categories retrieved successfully",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Metadata categories retrieved successfully",
        data=response_data,
        meta=meta,
    )


# ---------------------------------------------------------------------------
# POST /metadata-categories  (bulk create)
# ---------------------------------------------------------------------------

class _MetadataCategoryCreateBody(RootModel[List[MetadataCategoryCreateSchema]]):
    pass


@router.post(
    "/metadata-categories",
    summary="Bulk Create Metadata Categories",
    description=(
        "Create one or more metadata categories. Accepts a single object or an array. "
        "Required: mt_catg_name (unique within mt_catg_type, max 255), mt_catg_type (I/A/S). "
        "Optional: mt_catg_gid (auto-generated if absent), mt_catg_order, mt_catg_parent_nid (default -1), "
        "mt_catg_description, mt_catg_is_presentational, mt_catg_is_mandatory. "
        "Partial-success: failures reported in errors without rolling back successful items."
    ),
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Metadata categories created", "model": SuccessResponse},
        400: {"description": "Validation failed", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_metadata_categories(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: _MetadataCategoryCreateBody = Body(..., description="Single category object or list of category objects"),
    language_code: str = Depends(get_dw_language_code),
):
    result = _service.bulk_create(dw_id, body.root, language_code=language_code)
    _invalidate_cache()

    ser_mode = get_serialization_mode()
    created_out = [
        MetadataCategoryResponseSchema.model_validate(item).model_dump(**ser_mode)
        for item in result["created"]
    ]
    nid_key = alias_field("ut_metadata_category", "categorynid") if ser_mode.get("by_alias") else "categorynid"
    gid_key = alias_field("ut_metadata_category", "categorygid") if ser_mode.get("by_alias") else "categorygid"
    data_out = created_response_data(created_out, nid_key, gid_key)

    meta = {"errors": result["errors"]} if result["errors"] else None
    return success_response(
        message=f"{len(created_out)} metadata category/categories created successfully",
        data=data_out,
        meta=meta,
        status_code=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------------------------
# GET /metadata-categories/associated-count  (must be before /{identifier})
# ---------------------------------------------------------------------------

@router.get(
    "/metadata-categories/association-count",
    summary="Metadata Category association count",
    description=(
        "Return the number of metadata report rows associated with categories. "
        "If identifier is provided (mt_catg_nid or mt_catg_gid), returns count for that category only. "
        "If omitted, returns counts for all categories with mt_catg_type='I'."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_association_count(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    identifier: Optional[str] = Query(
        None,
        description=(
            "Category identifier (mt_catg_nid or mt_catg_gid). "
            "If omitted, returns indicator_count and area_count across all categories. "
            "If provided, returns the count for that specific category under the key matching its type."
        ),
        alias=QUERY_IDENTIFIER,
    ),
):
    cache_key = f"{_CACHE_NS}:assoc-count:{dw_id}:{language_code}:{identifier or 'all'}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    counts = _service.get_association_counts(dw_id, identifier=identifier, language_code=language_code)

    if counts is None:
        raise not_found_for_identifier("Metadata category", identifier)

    body = {
        "success": True,
        "message": "Association counts retrieved successfully",
        "data": counts,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Association counts retrieved successfully",
        data=counts,
    )


# ---------------------------------------------------------------------------
# GET /metadata-categories/{identifier}
# ---------------------------------------------------------------------------

@router.get(
    f"/metadata-categories/{{{PATH_IDENTIFIER}}}",
    summary="Metadata Category (get one)",
    description="Get one metadata category by identifier. Numeric identifier → mt_catg_nid; alphanumeric → mt_catg_gid.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Metadata category retrieved successfully", "model": SuccessResponse},
        404: {"description": "Metadata category or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_metadata_category_by_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    identifier: str = Path(..., description="Numeric → mt_catg_nid; alphanumeric → mt_catg_gid", alias=PATH_IDENTIFIER),
):
    cache_key = f"{_CACHE_NS}:id:{dw_id}:{language_code}:{identifier}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    item = _service.get_by_identifier(dw_id, identifier, language_code=language_code)
    if not item:
        raise not_found_for_identifier("Metadata category", identifier)

    ser_mode = get_serialization_mode()
    response_data = MetadataCategoryResponseSchema.model_validate(item).model_dump(**ser_mode)
    body = {
        "success": True,
        "message": "Metadata category retrieved successfully",
        "data": response_data,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Metadata category retrieved successfully",
        data=response_data,
    )


# ---------------------------------------------------------------------------
# PATCH /metadata-categories/{identifier}
# ---------------------------------------------------------------------------

@router.patch(
    f"/metadata-categories/{{{PATH_IDENTIFIER}}}",
    summary="Update Metadata Category",
    description=(
        "Partial update for a metadata category. "
        "mt_catg_type is immutable and cannot be changed. "
        "Locale-specific fields (mt_catg_name, mt_catg_description): updated in the requested locale table. "
        "Structural fields (all others): updated in every locale table."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Metadata category updated successfully", "model": SuccessResponse},
        400: {"description": "Validation failed", "model": ErrorResponse},
        404: {"description": "Metadata category or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_metadata_category(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    identifier: str = Path(..., description="Numeric → mt_catg_nid; alphanumeric → mt_catg_gid", alias=PATH_IDENTIFIER),
    data: MetadataCategoryUpdateSchema = Body(...),
):
    result = _service.update(dw_id, identifier, data, language_code=language_code)
    if result is None:
        raise not_found_for_identifier("Metadata category", identifier)

    _invalidate_cache()
    provided_fields = data.model_fields_set
    ser_mode = get_serialization_mode()

    full_result = MetadataCategoryResponseSchema.model_validate(result)
    full_dict = full_result.model_dump(**ser_mode)

    resp_fields = MetadataCategoryResponseSchema.model_fields
    if ser_mode.get("by_alias"):
        field_key_map = {
            fname: (finfo.serialization_alias or finfo.alias or fname)
            for fname, finfo in resp_fields.items()
        }
    else:
        field_key_map = {fname: fname for fname in resp_fields}

    response_data = {
        field_key_map[f]: full_dict[field_key_map[f]]
        for f in provided_fields
        if f in field_key_map and field_key_map[f] in full_dict
    }
    nid_key = field_key_map.get("categorynid")
    if nid_key and nid_key in full_dict:
        response_data[nid_key] = full_dict[nid_key]

    return success_response(
        message="Metadata category updated successfully",
        data=response_data,
    )


# ---------------------------------------------------------------------------
# DELETE /metadata-categories/{identifier}
# ---------------------------------------------------------------------------

@router.delete(
    f"/metadata-categories/{{{PATH_IDENTIFIER}}}",
    summary="Delete Metadata Category",
    description=(
        "Delete a metadata category by identifier. "
        "Returns HTTP 409 if any metadata report rows reference the category. "
        "On success returns HTTP 204 No Content."
    ),
    response_model=SuccessResponse,
    responses={
        204: {"description": "Metadata category deleted successfully"},
        404: {"description": "Metadata category or warehouse not found", "model": ErrorResponse},
        409: {"description": "Deletion not permitted – category has metadata entries", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_metadata_category(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Numeric → mt_catg_nid; alphanumeric → mt_catg_gid", alias=PATH_IDENTIFIER),
):
    deleted = _service.delete(dw_id, identifier)
    if not deleted:
        raise not_found_for_identifier("Metadata category", identifier)
    _invalidate_cache()
    return no_content_response()
