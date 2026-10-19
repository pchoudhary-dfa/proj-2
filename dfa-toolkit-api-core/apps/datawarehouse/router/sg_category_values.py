"""
Subgroup Category Values – create, read, and delete routes for subgroup values.
API paths:
  Bulk create values                = POST   /dw/{dw_id}/sg-categories/values
  All Subgroup Category All Values  = GET    /dw/{dw_id}/sg-categories-values
  Subgroup Category Value by value  = GET    /dw/{dw_id}/sg-categories-values/{value_identifier}
  Subgroup Category Values (list)   = GET    /dw/{dw_id}/sg-categories/{sg_category_identifier}/values
  Subgroup Category Value (get one) = GET    /dw/{dw_id}/sg-categories/{sg_category_identifier}/values/{value_identifier}
  Subgroup Category Value (delete)  = DELETE /dw/{dw_id}/sg-categories-values/{value_identifier} (async job; 200 + job reference)

Identifier rules:
  sg_category_identifier: numeric → sg_cat_nid, alphanumeric → sg_cat_gid
  value_identifier: numeric → n_id (subgroup_nid), alphanumeric → g_id (subgroup_gid)
"""
import logging

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, status, Path, Query, HTTPException
from fastapi.responses import JSONResponse

from apps.shared.exceptions import BadRequest, not_found_for_identifier
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.services.sg_category_values import SgCategoryValuesService
from apps.datawarehouse.schemas.sg_categories import (
    SubgroupCategoryValueResponseSchema,
    SgCategoryWithValuesResponseSchema,
    SgCategoryValueCreateSchema,
    SgCategoryValueUpdateSchema,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.shared.utils.response import (
    success_response,
    created_response,
    created_response_data,
    forbidden_response,
    error_response,
)
from apps.app_db.db.core import SessionLocal
from apps.shared.services.bg_job_dispatch import (
    JOB_TYPE_DELETE_SG_CATEGORY_VALUE,
    dispatch_bg_job,
)
from apps.shared.utils.log_event import log_background_incident
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.datawarehouse.db.datawarehouse import validate_dw_id, get_dw_language_code
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_SG_CATEGORY_IDENTIFIER,
    PATH_VALUE_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_VIEW,
    QUERY_SG_CAT_INFO,
    QUERY_SG_CAT_IDENTIFIER,
    QUERY_USED_IN,
    ASSOC_SG_COUNT,
)

logger = logging.getLogger(__name__)
router = APIRouter(
    tags=["Data Warehouse - Subgroup Category Values"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}",
)
sg_category_values_service = SgCategoryValuesService()


def _strip_used_in_nested_categories(categories: List[dict]) -> None:
    """Remove used_in from nested value rows in group_by response."""
    for cat in categories:
        records = cat.get("children") or cat.get("sg_cat_val_records")
        if not records:
            continue
        for rec in records:
            if isinstance(rec, dict):
                rec.pop("used_in", None)


@router.get(
    "/sg-categories-values",
    summary="All Subgroup Category All Values",
    description="Return subgroup types (categories) with their values with pagination. view=flat: list of value records only (sg_catg_val_*, sg_cat_nid, sg_cat_gid). view=group_by: tree (categories with children array). used_in=true: each value row includes used_in.subgroup_count (distinct ut_subgroup_vals linked via ut_subgroup_vals_subgroup for that ut_subgroup row; GET sg-categories ?used_in aggregates the same junction counts per category). When view=flat and sg_cat_info=true, meta includes sg_cat_info (map of sg_cat_gid to category name). Pagination: page (1-based), page_size; response includes meta (page, page_size, total_count, total_pages).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "All categories with values retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid format", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_sg_categories_values(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    sg_cat_identifier: Optional[str] = Query(None, description="Subgroup category identifier: numeric for sg_cat_nid, alphanumeric for sg_cat_gid.", alias=QUERY_SG_CAT_IDENTIFIER),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: int = Query(10, ge=1, le=1000, description="Number of records per page", alias=QUERY_PAGE_SIZE),
    view: Optional[str] = Query(
        "flat",
        description="'flat' = list of value records only (sg_val_*); 'group_by' = tree (categories with children array). Default: flat.",
        alias=QUERY_VIEW,
    ),
    sg_cat_info: bool = Query(
        False,
        description="When true and view=flat, include category names in meta.sg_cat_info (map of sg_cat_gid to category name).",
        alias=QUERY_SG_CAT_INFO,
    ),
    used_in: bool = Query(
        False,
        description=f"If true, each category value row includes used_in.{ASSOC_SG_COUNT} (distinct ut_subgroup_vals combinations referencing that ut_subgroup row via junction table)",
        alias=QUERY_USED_IN,
    ),
):
    if view is not None and view not in ("flat", "group_by"):
        raise BadRequest("view must be one of: flat, group_by")
    view_format = view or "flat"

    cache_key = f"dw:sg-categories-values:list:{dw_id}:{language_code}:{view_format}:{page}:{page_size}:{sg_cat_info}:{sg_cat_identifier}:{used_in}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items = sg_category_values_service.get_all_categories_with_values(dw_id, language_code=language_code)

    if sg_cat_identifier:
        if sg_cat_identifier.isdigit():
            items = [c for c in items if c.get("subgroup_type_nid") == int(sg_cat_identifier)]
        else:
            items = [c for c in items if c.get("subgroup_type_gid") == sg_cat_identifier]

    ser_mode = get_serialization_mode()

    usage_by_nid: dict = {}
    if used_in:
        nids: List[int] = []
        for cat in items:
            for val in cat.get("values", []):
                nid = val.get("subgroup_nid")
                if nid is not None:
                    nids.append(int(nid))
        usage_by_nid = (
            sg_category_values_service.count_combination_usage_by_subgroup_nids(dw_id, nids)
            if nids
            else {}
        )

    if view_format == "flat":
        response_data = []
        for cat in items:
            for val in cat.get("values", []):
                payload = val
                if used_in:
                    nid = val.get("subgroup_nid")
                    cnt = usage_by_nid.get(int(nid), 0) if nid is not None else 0
                    payload = {**val, "used_in": {ASSOC_SG_COUNT: cnt}}
                row = SubgroupCategoryValueResponseSchema.model_validate(payload).model_dump(**ser_mode)
                if not used_in:
                    row.pop("used_in", None)
                response_data.append(row)
    else:
        response_data = []
        for cat in items:
            cat_data = {k: v for k, v in cat.items() if k != "values"}
            value_rows = cat.get("values", [])
            if used_in:
                value_rows = [
                    {
                        **val,
                        "used_in": {
                            ASSOC_SG_COUNT: (
                                usage_by_nid.get(int(val.get("subgroup_nid")), 0)
                                if val.get("subgroup_nid") is not None
                                else 0
                            )
                        },
                    }
                    for val in value_rows
                ]
            cat_with_records = {**cat_data, "sg_cat_val_records": value_rows}
            cat_dump = SgCategoryWithValuesResponseSchema.model_validate(cat_with_records).model_dump(**ser_mode)
            response_data.append(cat_dump)
        if not used_in:
            _strip_used_in_nested_categories(response_data)

    total_count = len(response_data)
    skip = (page - 1) * page_size
    page_size_clamped = max(1, min(page_size, 1000))
    response_data = response_data[skip: skip + page_size_clamped]
    total_pages = (total_count + page_size_clamped - 1) // page_size_clamped if total_count else 0
    meta = ListPaginationMetaSchema(
        total_count=total_count,
        count=len(response_data),
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    ).model_dump()
    if view_format == "flat" and sg_cat_info:
        meta[QUERY_SG_CAT_INFO] = {
            cat["subgroup_type_gid"]: cat["subgroup_type_name"]
            for cat in items
            if cat.get("subgroup_type_gid") is not None and cat.get("subgroup_type_name") is not None
        }
    body = {
        "success": True,
        "message": "All subgroup categories with values retrieved successfully",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message="All subgroup categories with values retrieved successfully",
        data=response_data,
        meta=meta,
    )


@router.get(
    f"/sg-categories-values/{{{PATH_VALUE_IDENTIFIER}}}",
    summary="Subgroup Category Value (get one by value identifier)",
    description="Get one subgroup value (sg-category-val) by value identifier only, without providing sg-category. **value_identifier**: numeric → n_id (subgroup_nid), alphanumeric → g_id (subgroup_gid). Response: n_id, val, g_id, order, sg_cat_nid.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroup value retrieved successfully", "model": SuccessResponse},
        404: {"description": "Subgroup value or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_sg_category_value_by_value_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    value_identifier: str = Path(..., description="Subgroup value identifier: numeric for n_id (primary key), alphanumeric for g_id.", alias=PATH_VALUE_IDENTIFIER),
):
    """Get one sg-category-val by value identifier only (no sg-category in path)."""
    cache_key = f"dw:sg-categories-values:one:{dw_id}:{language_code}:{value_identifier}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    item = sg_category_values_service.get_value_by_value_identifier(dw_id, value_identifier, language_code=language_code)

    if not item:
        raise not_found_for_identifier("Subgroup value", value_identifier)

    ser_mode = get_serialization_mode()
    response_data = SubgroupCategoryValueResponseSchema.model_validate(item).model_dump(**ser_mode)
    body = {
        "success": True,
        "message": "Subgroup value retrieved successfully",
        "data": response_data,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Subgroup value retrieved successfully",
        data=response_data,
    )


@router.patch(
    f"/sg-categories-values/{{{PATH_VALUE_IDENTIFIER}}}",
    summary="Update Subgroup Category Value",
    description="Partial update for a subgroup category value. **value_identifier**: numeric → n_id (subgroup_nid), alphanumeric → g_id (subgroup_gid). Only provided fields are updated. subgroup_name is locale-aware (Accept-Language); subgroup_gid, subgroup_order, subgroup_global are structural (all locales). When subgroup_name is sent, subgroup combinations (subgroup vals) that include this value get their concatenated names refreshed for every locale.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroup value updated successfully", "model": SuccessResponse},
        404: {"description": "Subgroup value or warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_sg_category_value(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    value_identifier: str = Path(..., description="Subgroup value identifier: numeric for n_id (primary key), alphanumeric for g_id.", alias=PATH_VALUE_IDENTIFIER),
    data: SgCategoryValueUpdateSchema = Body(..., description="Fields to update (at least one required)"),
):
    """Partial update a subgroup category value by value identifier."""
    result = sg_category_values_service.update_value(
        dw_id, value_identifier, data, language_code=language_code
    )
    if result is None:
        raise not_found_for_identifier("Subgroup value", value_identifier)

    cache_delete_pattern("dw:sg-categories:*")
    cache_delete_pattern("dw:sg-categories-values:*")
    cache_delete_pattern("dw:subgroups:*")

    ser_mode = get_serialization_mode()
    payload_keys = set(data.model_dump(exclude_unset=True, **ser_mode).keys())
    full_response = SubgroupCategoryValueResponseSchema.model_validate(result).model_dump(**ser_mode)
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}
    return success_response(
        message="Subgroup value updated successfully",
        data=response_data,
    )


@router.delete(
    f"/sg-categories-values/{{{PATH_VALUE_IDENTIFIER}}}",
    summary="Delete Subgroup Value by identifier (background job)",
    description=(
        "Queues deletion of a subgroup category value by **value_identifier** (numeric subgroup_nid or subgroup_gid). "
        "The worker runs the full subgroup-val cascade for each linked ut_subgroup_vals combination: "
        "ut_data → ut_ic_ius → ut_metadatareport_* → IUS → ut_subgroup_vals_subgroup → ut_subgroup_vals (all locales), "
        "then removes ut_subgroup (all locales). "
        "Returns **200** with `data.job_type`, `data.db_job_id` or `data.celery_task_id` (per `BG_JOB_MQ_TYPE`), "
        "`dw_id`, `subgroup_nid`, and `value_identifier`. System subgroup values are rejected with **403** before enqueue. "
        "**value_identifier**: numeric n_id or g_id."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Deletion job queued; job reference in data", "model": SuccessResponse},
        403: {"description": "System subgroup cannot be deleted via API", "model": ErrorResponse},
        404: {"description": "Subgroup value or warehouse not found", "model": ErrorResponse},
        500: {"description": "Failed to queue job or internal server error", "model": ErrorResponse},
    },
)
async def delete_sg_category_value_by_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    value_identifier: str = Path(..., description="Subgroup value identifier: numeric for n_id (primary key), alphanumeric for g_id.", alias=PATH_VALUE_IDENTIFIER),
):
    """Queue cascade delete of a subgroup category value; work runs in background (DB queue or Celery)."""
    item = sg_category_values_service.get_value_by_value_identifier(dw_id, value_identifier)
    if not item:
        raise not_found_for_identifier("Subgroup value", value_identifier)

    if item.get("is_system"):
        return forbidden_response(message="System subgroup cannot be deleted via API")

    subgroup_nid = int(item["subgroup_nid"])
    job_payload = {
        "dw_id": dw_id,
        "subgroup_nid": subgroup_nid,
        "value_identifier": value_identifier,
    }
    try:
        with SessionLocal() as core_db:
            res = dispatch_bg_job(
                db=core_db,
                job_type=JOB_TYPE_DELETE_SG_CATEGORY_VALUE,
                payload=job_payload,
                dw_id=dw_id,
            )
    except Exception as e:
        log_background_incident(
            message=f"Failed to queue subgroup category value delete: {e}",
            error_code="DELETE_SG_CATEGORY_VALUE_QUEUE_FAILED",
            exc=e,
            source="apps.datawarehouse.router.sg_category_values",
        )
        return error_response(
            message="Failed to queue subgroup category value deletion",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    ref = res.celery_task_id or res.db_job_id
    logger.info(
        "Queued subgroup category value delete job_type=%s ref=%s dw_id=%s subgroup_nid=%s",
        JOB_TYPE_DELETE_SG_CATEGORY_VALUE,
        ref,
        dw_id,
        subgroup_nid,
    )
    return success_response(
        message="Subgroup category value deletion queued successfully",
        data={
            "job_type": JOB_TYPE_DELETE_SG_CATEGORY_VALUE,
            "db_job_id": res.db_job_id,
            "celery_task_id": res.celery_task_id,
            "dw_id": dw_id,
            "subgroup_nid": subgroup_nid,
            "value_identifier": value_identifier,
        },
    )


@router.post(
    "/sg-categories/values",
    summary="Bulk Create Subgroup Category Values",
    description=(
        "Create one or more subgroup category values, each linked to a category via sg_cat_gid. "
        "Accepts a list of value objects; sg_catg_val_name (subgroup_name) is required per item. "
        "Partial-success: items that fail validation or have an unresolvable category GID are skipped "
        "and reported in errors."
    ),
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Subgroup category values created successfully", "model": SuccessResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_sg_category_values(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    data: List[SgCategoryValueCreateSchema] = Body(..., description="List of subgroup category values to create"),
    language_code: str = Depends(get_dw_language_code),
):
    items_payload = [item.model_dump() for item in data]
    result = sg_category_values_service.bulk_create_values(dw_id, items_payload, language_code=language_code)

    all_errors = result.get("errors", [])
    cache_delete_pattern("dw:sg-categories:*")

    ser_mode = get_serialization_mode()
    response_data = [
        SubgroupCategoryValueResponseSchema.model_validate(item).model_dump(**ser_mode)
        for item in result["created"]
    ]
    nid_key = alias_field("ut_subgroup", "subgroup_nid") if ser_mode.get("by_alias") else "subgroup_nid"
    gid_key = alias_field("ut_subgroup", "subgroup_gid") if ser_mode.get("by_alias") else "subgroup_gid"
    data_out = created_response_data(response_data, nid_key, gid_key)

    meta = {"errors": all_errors} if all_errors else None
    return success_response(
        message=f"{len(result['created'])} subgroup category value(s) created successfully",
        data=data_out,
        meta=meta,
        status_code=status.HTTP_201_CREATED,
    )
