"""
Subgroup Categories (sg-categories) – CRUD for categories.
API paths:
  Subgroup Category list          = GET    /dw/{dw_id}/sg-categories
  Subgroup Category create        = POST   /dw/{dw_id}/sg-categories
  Subgroup Category get one       = GET    /dw/{dw_id}/sg-categories/{category_id}
  Subgroup Category update        = PATCH  /dw/{dw_id}/sg-categories/{category_id}
  Subgroup Category delete        = DELETE /dw/{dw_id}/sg-categories/{category_id} (async job; 200 + job reference)
  Multiple delete                 = POST   /dw/{dw_id}/sg-categories/multiple-delete
  Association count               = GET    /dw/{dw_id}/sg-categories/association-count

Identifier rules (gid/nid concept):
  sg_category_identifier / category_id: numeric → sg_cat_nid, alphanumeric → sg_cat_gid

Subgroup Category Value routes live in sg_category_values.py.
"""
import logging

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, status, Path, Query, HTTPException
from fastapi.responses import JSONResponse

from apps.shared.exceptions import not_found_for_identifier
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.utils.response_filter import is_external_adaptation
from apps.datawarehouse.services.sg_category import SgCategoryService
from apps.datawarehouse.schemas.sg_categories import (
    SgCategoryCreateSchema,
    SgCategoryUpdateSchema,
    SgCategoryMultipleDeleteSchema,
    SgCategoryResponseSchema,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.shared.utils.response import (
    success_response,
    created_response,
    forbidden_response,
    error_response,
)
from apps.app_db.db.core import SessionLocal
from apps.shared.services.bg_job_dispatch import (
    JOB_TYPE_DELETE_SG_CATEGORY,
    dispatch_bg_job,
)
from apps.shared.utils.log_event import log_background_incident
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.shared.utils.validators import validate_identifier_type_consistency
from apps.datawarehouse.db.datawarehouse import validate_dw_id, get_dw_language_code, get_warehouse_credentials
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    PATH_SG_CATEGORY_IDENTIFIER,
    PATH_CATEGORY_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    BODY_BODY,
    QUERY_SEARCH,
    QUERY_SORT_ORDER,
    QUERY_SORT_FIELD,
    ASSOC_SG_COUNT,
    ASSOC_IUS_COUNT,
    ASSOC_DATA_COUNT,
    QUERY_USED_IN,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Subgroup Categories"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}")
sg_category_service = SgCategoryService()


@router.get(
    "/sg-categories",
    summary="Subgroup Category (list)",
    description="List subgroup categories (Subgroup Category) with pagination. Sort: sort_order (asc/desc), sort_field (sg_cat_nid, sg_cat_name, sg_cat_gid, sg_cat_order). Response: sg_cat_nid, sg_cat_name, sg_cat_gid, sg_cat_order, sg_cat_global; optional used_in=true adds per-item used_in.subgroup_count (distinct ut_subgroup_vals linked via ut_subgroup_vals_subgroup for any ut_subgroup in that category — category rollup of the same junction semantics as GET sg-categories-values ?used_in). Pagination: page (1-based), page_size; response includes meta (page, page_size, total_count, total_pages).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroup categories retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_sg_categories(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
    search: Optional[str] = Query(None, description="Search in sg_cat_name / sg_cat_gid", alias=QUERY_SEARCH),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query("sg_cat_order", description="Sort field: sg_cat_nid, sg_cat_name, sg_cat_gid, sg_cat_order", alias=QUERY_SORT_FIELD),
    used_in: bool = Query(
        False,
        description=f"If true, each item includes used_in.{ASSOC_SG_COUNT} (distinct ut_subgroup_vals in ut_subgroup_vals_subgroup for subgroups in that category)",
        alias=QUERY_USED_IN,
    ),
):
    use_pagination = page_size is not None
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    cache_key = f"dw:sg-categories:list:{dw_id}:{language_code}:{page}:{effective_page_size}:{search}:{sort_order or 'asc'}:{sort_field or 'sg_cat_order'}:{used_in}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items, total_count = sg_category_service.get_all_sg_categories(
        dw_id,
        language_code=language_code,
        page=page,
        page_size=effective_page_size,
        search=search,
        sort_order=sort_order or "asc",
        sort_field=sort_field or "sg_cat_order",
        include_used_in=used_in,
    )
    
    # Transform list with Pydantic serialization
    ser_mode = get_serialization_mode()
    response_data = [
        SgCategoryResponseSchema.model_validate(item).model_dump(**ser_mode, exclude_none=True)
        for item in items
    ]

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
        "message": "Subgroup categories retrieved successfully",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Subgroup categories retrieved successfully",
        data=response_data,
        meta=meta,
    )




def _invalidate_sg_categories_cache(dw_id: str) -> None:
    """Invalidate all sg-categories and sg-categories-values cache keys for this dw."""
    cache_delete_pattern(f"dw:sg-categories:*")
    cache_delete_pattern(f"dw:sg-categories-values:*")


@router.post(
    "/sg-categories",
    summary="Bulk Create Subgroup Categories",
    description="Create one or more subgroup categories. Accepts a list of category objects; each requires sg_cat_name (unique) and optionally sg_cat_gid, sg_cat_order, sg_cat_global. Partial-success: failed items are reported in errors without rolling back successful ones. To create subgroup category values, use POST /dw/{dw_id}/sg-categories/values.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Subgroup categories created successfully", "model": SuccessResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_sg_category(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    data: List[SgCategoryCreateSchema] = Body(..., description="List of subgroup categories to create"),
    language_code: str = Depends(get_dw_language_code),
):
    result = sg_category_service.bulk_create(dw_id, data, language_code=language_code)
    _invalidate_sg_categories_cache(dw_id)
    ser_mode = get_serialization_mode()
    use_alias = ser_mode.get("by_alias")
    created_out = [
        {
            (alias_field("SUBGROUP_CATEGORY", "subgroup_type_nid") if use_alias else "subgroup_type_nid"): item["subgroup_type_nid"],
            (alias_field("SUBGROUP_CATEGORY", "subgroup_type_gid") if use_alias else "subgroup_type_gid"): item["subgroup_type_gid"],
        }
        for item in result["created"]
    ]
    meta = {"errors": result["errors"]} if result["errors"] else None
    return success_response(
        message=f"{len(created_out)} subgroup category/categories created successfully",
        data=created_out,
        meta=meta,
        status_code=status.HTTP_201_CREATED,
    )


# @router.post(
#     "/sg-categories/multiple-delete",
#     summary="Delete multiple subgroup categories",
#     description="Delete multiple subgroup categories and all related data (full cascade). Deletes ut_data, ut_ic_ius, metadata reports, IUS, subgroup vals (ut_subgroup_vals), ut_subgroup_vals_subgroup, subgroup values (ut_subgroup), and categories (ut_subgroup_category). Does not fail when categories have IUS or data dependents.",
#     response_model=SuccessResponse,
#     responses={
#         200: {"description": "Subgroup categories and all related data deleted successfully", "model": SuccessResponse},
#         404: {"description": "Warehouse or category not found", "model": ErrorResponse},
#         500: {"description": "Internal server error", "model": ErrorResponse},
#     },
# )
# async def multiple_delete_sg_categories(
#     dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
#     _: str = Depends(validate_dw_id),
#     body: SgCategoryMultipleDeleteSchema = ...,
# ):
#     try:
#         if body.sg_cat_gid:
#             sg_category_service.multiple_delete(dw_id, body.sg_cat_gid)
#             _invalidate_sg_categories_cache(dw_id)
#         return no_content_response()
#     except ValueError as e:
#         logger.error(f"Error in multiple delete subgroup categories: {str(e)}", exc_info=True)
#         error_msg = str(e)
#         if "Warehouse" in error_msg and "not found" in error_msg:
#             raise not_found_for_identifier("Datawarehouse", dw_id)
#         if "Subgroup category not found" in error_msg:
#             raise not_found_for_identifier("Subgroup category", body.sg_cat_gid[0] if body.sg_cat_gid else "unknown")
#         if "Deletion not permitted" in error_msg and "dependent records" in error_msg:
#             return error_response(message=error_msg, status_code=status.HTTP_409_CONFLICT)
#         return error_response(
#             message=error_msg,
#             status_code=status.HTTP_400_BAD_REQUEST,
#         )
#     except HTTPException as he:
#         if he.status_code == status.HTTP_404_NOT_FOUND:
#             raise not_found_for_identifier("Datawarehouse", dw_id)
#         raise
#     except Exception as e:
#         logger.error(f"Error in multiple delete subgroup categories: {str(e)}", exc_info=True)
#         return error_response(
#             message=f"Failed to delete subgroup categories: {str(e)}",
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#         )


@router.get(
    "/sg-categories/association-count",
    summary="Association count for subgroup categories",
    description=f"Return dependency counts ({ASSOC_SG_COUNT}, {ASSOC_IUS_COUNT}, {ASSOC_DATA_COUNT}) for the given categories. {ASSOC_SG_COUNT} is the same junction rollup as GET /sg-categories?used_in=true (distinct ut_subgroup_vals per category, summed when multiple categories). Query param: category_id (comma-separated sg_cat_nid or sg_cat_gid). Used for delete confirmation.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse or category not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def association_count_sg_categories(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    category_id: Optional[str] = Query(None, description="Comma-separated category identifiers (sg_cat_nid or sg_cat_gid)", alias="category_id"),
):
    category_ids: List[str] = []
    if category_id:
        category_ids = [p.strip() for p in category_id.split(",") if p.strip()]
    data = sg_category_service.get_association_counts(dw_id, category_ids)
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.get(
    f"/sg-categories/{{{PATH_SG_CATEGORY_IDENTIFIER}}}",
    summary="Subgroup Category (get one)",
    description="Get one subgroup category by sg_category_identifier. **sg_category_identifier**: numeric → sg_cat_nid (primary key), alphanumeric → sg_cat_gid (GID). Same gid/nid concept as indicators.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroup category retrieved successfully", "model": SuccessResponse},
        404: {"description": "Subgroup category or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_sg_category_by_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    sg_category_identifier: str = Path(..., description="Subgroup category identifier: numeric for sg_cat_nid (primary key), alphanumeric for sg_cat_gid.", alias=PATH_SG_CATEGORY_IDENTIFIER),
):
    cache_key = f"dw:sg-categories:id:{dw_id}:{language_code}:{sg_category_identifier}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    item = sg_category_service.get_sg_category_by_identifier(dw_id, sg_category_identifier, language_code=language_code)

    if not item:
        raise not_found_for_identifier("Subgroup category", sg_category_identifier)
    
    # Transform to response format
    response_data = SgCategoryResponseSchema.model_validate(item).model_dump(
        **get_serialization_mode(), exclude_none=True
    )

    body = {
        "success": True,
        "message": "Subgroup category retrieved successfully",
        "data": response_data,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Subgroup category retrieved successfully",
        data=response_data,
    )


@router.patch(
    f"/sg-categories/{{{PATH_CATEGORY_IDENTIFIER}}}",
    summary="Update Subgroup Category",
    description="Update a subgroup category (partial). category_identifier: numeric → sg_cat_nid, alphanumeric → sg_cat_gid.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroup category updated successfully", "model": SuccessResponse},
        404: {"description": "Subgroup category or warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_sg_category(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    category_identifier: str = Path(..., description="Subgroup category identifier: numeric → sg_cat_nid, alphanumeric → sg_cat_gid.", alias=PATH_CATEGORY_IDENTIFIER),
    data: SgCategoryUpdateSchema = ...,
):
    result = sg_category_service.update(dw_id, category_identifier, data, language_code=language_code)
    _invalidate_sg_categories_cache(dw_id)
    ser_mode = get_serialization_mode()
    payload_keys = set(data.model_dump(exclude_unset=True, **ser_mode).keys())
    full_response = SgCategoryResponseSchema.model_validate(result).model_dump(
        **ser_mode, exclude_none=True
    )
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}
    return success_response(
        message="Subgroup category updated successfully",
        data=response_data,
    )


@router.delete(
    f"/sg-categories/{{{PATH_SG_CATEGORY_IDENTIFIER}}}",
    summary="Delete Subgroup Category by identifier (background job)",
    description=(
        "Queues full cascade deletion of a subgroup category by **sg_category_identifier** (numeric sg_cat_nid or sg_cat_gid). "
        "Worker deletes ut_data, ut_ic_ius, metadata reports, IUS, ut_subgroup_vals, ut_subgroup_vals_subgroup, "
        "ut_subgroup (all locales), ut_subgroup_type (all locales). "
        "Returns **200** with `data.job_type`, `data.db_job_id` or `data.celery_task_id` (per `BG_JOB_MQ_TYPE`), "
        "`dw_id`, `sg_category_identifier`, and `sg_cat_nid`. System categories or protected values return **403** before enqueue."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Deletion job queued; job reference in data", "model": SuccessResponse},
        403: {"description": "System subgroup category or protected subgroup values cannot be deleted", "model": ErrorResponse},
        404: {"description": "Subgroup category or warehouse not found", "model": ErrorResponse},
        500: {"description": "Failed to queue job or internal server error", "model": ErrorResponse},
    },
)
async def delete_sg_category_by_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    sg_category_identifier: str = Path(..., description="Subgroup category identifier: numeric for sg_cat_nid, alphanumeric for sg_cat_gid.", alias=PATH_SG_CATEGORY_IDENTIFIER),
):
    """Queue full cascade delete of a subgroup category; work runs in background (DB queue or Celery)."""
    item = sg_category_service.get_sg_category_by_identifier(dw_id, sg_category_identifier)
    if not item:
        raise not_found_for_identifier("Subgroup category", sg_category_identifier)

    if item.get("is_system"):
        return forbidden_response(message="System subgroup category cannot be deleted via API")

    try:
        sg_cat_nid = sg_category_service.prepare_sg_category_delete_enqueue(dw_id, sg_category_identifier)
    except ValueError as e:
        msg = str(e)
        msg_lower = msg.lower()
        if "not found" in msg_lower:
            raise not_found_for_identifier("Subgroup category", sg_category_identifier) from e
        if (
            "system" in msg_lower
            or "cannot delete" in msg_lower
            or "protected" in msg_lower
        ):
            return forbidden_response(message=msg)
        return error_response(message=msg, status_code=status.HTTP_400_BAD_REQUEST)

    job_payload = {
        "dw_id": dw_id,
        "sg_category_identifier": sg_category_identifier,
        "sg_cat_nid": sg_cat_nid,
    }
    try:
        with SessionLocal() as core_db:
            res = dispatch_bg_job(
                db=core_db,
                job_type=JOB_TYPE_DELETE_SG_CATEGORY,
                payload=job_payload,
                dw_id=dw_id,
            )
    except Exception as e:
        log_background_incident(
            message=f"Failed to queue subgroup category delete: {e}",
            error_code="DELETE_SG_CATEGORY_QUEUE_FAILED",
            exc=e,
            source="apps.datawarehouse.router.sg_categories",
        )
        return error_response(
            message="Failed to queue subgroup category deletion",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    ref = res.celery_task_id or res.db_job_id
    logger.info(
        "Queued subgroup category delete job_type=%s ref=%s dw_id=%s sg_cat_nid=%s",
        JOB_TYPE_DELETE_SG_CATEGORY,
        ref,
        dw_id,
        sg_cat_nid,
    )
    return success_response(
        message="Subgroup category deletion queued successfully",
        data={
            "job_type": JOB_TYPE_DELETE_SG_CATEGORY,
            "db_job_id": res.db_job_id,
            "celery_task_id": res.celery_task_id,
            "dw_id": dw_id,
            "sg_category_identifier": sg_category_identifier,
            "sg_cat_nid": sg_cat_nid,
        },
    )


