"""
IUS (Indicator-Unit-Subgroup) router.
API path: /dw/{dw_id}/ius.
Query params: ius_scope, i_identifier, u_identifier, sg_identifier, ic_identifier, ic_type, sort_field, sort_order, with_validation, indicator, unit, subgroup.
Response keys determined by ADAPTATION environment variable via Pydantic serialization.
"""
import logging
from enum import Enum
from typing import List, Optional, Literal
from fastapi import APIRouter, Depends, status, Path, Query, Body, Header, HTTPException
from sqlalchemy.orm import Session

from apps.shared.config.dependencies import get_db
from fastapi.responses import JSONResponse

from apps.shared.exceptions import BadRequest
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.services.ius import IusService
from apps.datawarehouse.schemas.ius import IUSResponseSchema
from apps.datawarehouse.schemas.indicator import IndicatorResponseSchema
from apps.datawarehouse.schemas.unit import UnitResponseSchema
from apps.datawarehouse.schemas.sg_vals import SgValResponseSchema
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.meta_response import filter_meta_entity_fields
from apps.datawarehouse.utils.response_filter import is_external_adaptation
from apps.shared.utils.response import (
    success_response,
    no_content_response,
    deleted_success_message,
)
from apps.shared.utils.validators import resolve_identifier_to_nid, validate_identifier_type_consistency
from apps.datawarehouse.db.datawarehouse import get_dw_language_code
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.datawarehouse.utils.default_subgroup_utils import mark_default_subgroups_for_dw
from apps.datawarehouse.schemas.ius import IUSCreateSchema, IUSMultiDeleteSchema, IUSUpsertRequestSchema
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_SCOPE,
    QUERY_I_IDENTIFIER,
    QUERY_U_IDENTIFIER,
    QUERY_SG_IDENTIFIER,
    QUERY_IC_IDENTIFIER,
    QUERY_IC_TYPE,
    QUERY_SORT_FIELD,
    QUERY_SORT_ORDER,
    QUERY_WITH_VALIDATION,
    QUERY_INDICATOR,
    QUERY_UNIT,
    QUERY_SUBGROUP,
    QUERY_FORCE,
    QUERY_I_NID,
    QUERY_U_NID,
    BODY_DATA,
    BODY_BODY,
    IC_TYPE_ALLOWED_FOR_IC_API,
)
from apps.datawarehouse.examples import IUS_UPSERT_BODY_EXAMPLE

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - IUS"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}")
ius_service = IusService()


def _split_identifier_param(raw: Optional[str], label: str):
    """
    Split a comma-separated identifier string and validate that all values are the
    same type (all NIDs or all GIDs). Returns (nids, gids, errors).
    - nids: List[int] if all values are numeric, else None.
    - gids: List[str] if all values are alphanumeric GIDs, else None.
    - errors: List[str] of mismatch messages if mixed types detected, else [].
    """
    if not raw:
        return None, None, []
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        return None, None, []
    valid, errors = validate_identifier_type_consistency(parts, get_identifier=lambda x: x, item_label=label)
    if errors:
        return None, None, errors
    if valid[0].isdigit():
        return [int(v) for v in valid], None, []
    return None, valid, []


class IusScope(str, Enum):
    """Scope filter for IUS list: ALL, MAPPED, UNMAPPED, HAS_DATA, NO_DATA, DEFAULT."""

    ALL = "ALL"
    MAPPED = "MAPPED"
    UNMAPPED = "UNMAPPED"
    HAS_DATA = "HAS_DATA"
    NO_DATA = "NO_DATA"
    DEFAULT = "DEFAULT"


# Inline enum for OpenAPI so Swagger UI shows dropdown (optional Enum uses anyOf/$ref which renders as text)
_IUS_SCOPE_ENUM = [e.value for e in IusScope]


def _build_context_meta(dw_id: str, items: list, language_code: str) -> dict:
    """
    Collect distinct indicator/unit/subgroup NIDs from the IUS page items, fetch their
    full records and return dicts keyed by GID for inclusion in the response meta.
    """
    indicator_nids = {item["indicator_nid"] for item in items if item.get("indicator_nid") is not None}
    unit_nids = {item["unit_nid"] for item in items if item.get("unit_nid") is not None}
    sg_nids = {item["subgroup_val_nid"] for item in items if item.get("subgroup_val_nid") is not None}

    raw = ius_service.get_ius_context_meta(
        dw_id=dw_id,
        indicator_nids=indicator_nids,
        unit_nids=unit_nids,
        sg_nids=sg_nids,
        language_code=language_code,
    )

    ser = get_serialization_mode()

    indicator_dict: dict = {}
    for rec in raw["indicators"]:
        rec_data = {
            "indicator_nid": rec.indicator_nid,
            "indicator_name": rec.indicator_name,
            "indicator_gid": rec.indicator_gid,
            "indicator_info": rec.indicator_info,
            "indicator_global": rec.indicator_global,
            "short_name": rec.short_name,
            "keywords": rec.keywords,
            "indicator_order": rec.indicator_order,
            "data_exist": rec.data_exist,
            "highisgood": rec.highisgood,
        }
        gid = rec.indicator_gid
        if gid is not None:
            dumped = IndicatorResponseSchema.model_validate(rec_data).model_dump(
                **ser,
                exclude={
                    "locale", "unit_nid", "subgroup_nid", "default_sg_nid",
                    "ic_nid", "metadata", "iusnid", "unit_gid", "subgroup_gid",
                    "default_sg_gid", "ius_gid", "ic_gid",
                },
            )
            indicator_dict[gid] = filter_meta_entity_fields(dumped, "indicator")

    unit_dict: dict = {}
    for rec in raw["units"]:
        rec_data = {
            "unit_nid": rec.unit_nid,
            "unit_name": rec.unit_name,
            "unit_gid": rec.unit_gid,
            "unit_global": rec.unit_global,
            "unit_format": getattr(rec, "unit_format", None),
        }
        gid = rec.unit_gid
        if gid is not None:
            dumped = UnitResponseSchema.model_validate(rec_data).model_dump(**ser)
            unit_dict[gid] = filter_meta_entity_fields(dumped, "unit")

    subgroup_dict: dict = {}
    for rec in raw["subgroups"]:
        serialized = SgValResponseSchema.model_validate(
            SgValResponseSchema.from_record(rec)
        ).model_dump(**ser)
        gid = rec.subgroup_val_gid
        if gid is not None:
            subgroup_dict[gid] = filter_meta_entity_fields(serialized, "sg")

    return {
        "indicator": indicator_dict,
        "unit": unit_dict,
        "subgroup": subgroup_dict,
    }


@router.get(
    "/ius",
    summary="List IUS",
    description=(
        "List IUS (Indicator-Unit-Subgroup) records with pagination. "
        "Use ius_scope to filter by mapping/data status: ALL (default), MAPPED, UNMAPPED, HAS_DATA, NO_DATA, DEFAULT. "
        "Identifier filters: i_identifier, u_identifier, sg_identifier, ic_identifier (comma-separated NIDs or GIDs, not mixed). "
        "IC type filter: ic_type. "
        "Sorting: sort_field, sort_order (asc|desc). "
        "Meta flags: indicator, unit, subgroup."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "IUS list retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code or ius_scope", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
    scope: Optional[str] = Query(
        None,
        description="Scope filter: ALL, MAPPED, UNMAPPED, HAS_DATA, NO_DATA, DEFAULT. Omit for all.",
        alias=QUERY_SCOPE,
        json_schema_extra={"enum": _IUS_SCOPE_ENUM},
    ),
    i_identifier: Optional[str] = Query(None, description="Comma-separated Indicator NIDs or GIDs to filter by (not mixed).", alias=QUERY_I_IDENTIFIER),
    u_identifier: Optional[str] = Query(None, description="Comma-separated Unit NIDs or GIDs to filter by (not mixed).", alias=QUERY_U_IDENTIFIER),
    sg_identifier: Optional[str] = Query(None, description="Comma-separated Subgroup Value NIDs or GIDs to filter by (not mixed).", alias=QUERY_SG_IDENTIFIER),
    ic_identifier: Optional[str] = Query(None, description="Comma-separated IC NIDs or GIDs for contextual mapping filter (not mixed).", alias=QUERY_IC_IDENTIFIER),
    ic_type: Optional[str] = Query(
        None,
        description="IC classification type: one of SC, GL, CF, TH, IT, CN (SR not available).",
        alias=QUERY_IC_TYPE,
    ),
    sort_field: Optional[str] = Query(None, description="Field name for sorting (alias or internal name).", alias=QUERY_SORT_FIELD),
    sort_order: Optional[str] = Query(None, description="Sort direction: asc or desc.", alias=QUERY_SORT_ORDER),
    with_validation: bool = Query(False, description="Include validation info placeholder for each IUS.", alias=QUERY_WITH_VALIDATION),
    indicator: bool = Query(False, description="Include indicator lookup dict in meta.", alias=QUERY_INDICATOR),
    unit: bool = Query(False, description="Include unit lookup dict in meta.", alias=QUERY_UNIT),
    subgroup: bool = Query(False, description="Include subgroup lookup dict in meta.", alias=QUERY_SUBGROUP),
    language_code: str = Depends(get_dw_language_code),
):
    if ic_type is not None and isinstance(ic_type, str):
        ic_type = ic_type.strip().upper()
    if ic_type is not None and ic_type not in IC_TYPE_ALLOWED_FOR_IC_API:
        raise BadRequest(
            f"ic_type must be one of {list(IC_TYPE_ALLOWED_FOR_IC_API)}; got {ic_type!r}. Use the dedicated module for other types.",
        )
    if scope is not None and scope not in _IUS_SCOPE_ENUM:
        raise BadRequest(
            f"scope must be one of: {', '.join(_IUS_SCOPE_ENUM)}",
        )
    if sort_order is not None and sort_order not in ("asc", "desc"):
        raise BadRequest("sort_order must be 'asc' or 'desc'")

    i_nids, i_gids, i_errs = _split_identifier_param(i_identifier, "i_identifier")
    u_nids, u_gids, u_errs = _split_identifier_param(u_identifier, "u_identifier")
    sg_nids, sg_gids, sg_errs = _split_identifier_param(sg_identifier, "sg_identifier")
    ic_nids, ic_gids, ic_errs = _split_identifier_param(ic_identifier, "ic_identifier")
    filter_errors = i_errs + u_errs + sg_errs + ic_errs
    if filter_errors:
        raise BadRequest(
            "Mixed identifier types detected in filter params.",
            details={"details": filter_errors},
        )

    use_pagination = page_size is not None
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    cache_key = (
        f"dw:ius:list:{dw_id}:{page}:{effective_page_size}:{language_code}"
        f":{scope or ''}:{i_identifier or ''}:{u_identifier or ''}:{sg_identifier or ''}"
        f":{ic_identifier or ''}:{ic_type or ''}:{sort_field or ''}:{sort_order or ''}"
        f":{with_validation}:{indicator}:{unit}:{subgroup}"
    )
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items, total_count = ius_service.get_all_ius(
        dw_id,
        language_code=language_code,
        ius_scope=scope,
        i_gids=i_gids,
        u_gids=u_gids,
        sg_gids=sg_gids,
        ic_gids=ic_gids,
        i_nids=i_nids,
        u_nids=u_nids,
        sg_nids=sg_nids,
        ic_nids=ic_nids,
        ic_type=ic_type,
        sort_field=sort_field,
        sort_order=sort_order,
        with_validation=with_validation,
        page=page,
        page_size=effective_page_size,
    )

    response_data = [
        IUSResponseSchema.model_validate(item).model_dump(**get_serialization_mode())
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
    if indicator or unit or subgroup:
        full_context = _build_context_meta(dw_id, items, language_code)
        if indicator:
            meta[QUERY_INDICATOR] = full_context["indicator"]
        if unit:
            meta[QUERY_UNIT] = full_context["unit"]
        if subgroup:
            meta[QUERY_SUBGROUP] = full_context["subgroup"]
    body = {
        "success": True,
        "message": "IUS list retrieved successfully",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message="IUS list retrieved successfully",
        data=response_data,
        meta=meta,
    )


@router.post(
    "/ius",
    summary="Upsert IUS",
    description=(
        "Upsert IUS (Indicator-Unit-Subgroup): create or update one row per subgroup value. "
        "Body: data (array of objects). Each object: i_gid, u_gid (list of unit GIDs), u_sg_gid (dict keyed by unit GID: "
        "each value has sg_gid [subgroup value NIDs or GIDs], default_sg_gid). Same structure as GET /dw/{dw_id}/indicators (subgroup=true). "
        "Returns list of created/updated IUS in data.items."
    ),
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "IUS upserted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid payload", "model": ErrorResponse},
        404: {"description": "Warehouse or indicator/unit/subgroup value not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def upsert_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: IUSUpsertRequestSchema = Body(
        ...,
        description="IUS upsert payload: data array. u_sg_gid keys are unit GIDs (u_gid).",
        alias=BODY_DATA,
        example=IUS_UPSERT_BODY_EXAMPLE,
    ),
    language_code: str = Depends(get_dw_language_code),
):
    payload = body.model_dump()
    data_list = payload.get("data") or []
    results = ius_service.upsert_ius_batch(
        dw_id,
        data=data_list,
        language_code=language_code,
    )
    cache_delete_pattern("dw:ius:*")
    items = [IUSResponseSchema.model_validate(r).model_dump(**get_serialization_mode()) for r in results]
    return success_response(
        message="IUS upserted successfully",
        data={"items": items},
    )


@router.delete(
    f"/ius/{{{PATH_IDENTIFIER}}}",
    summary="Delete IUS",
    description=(
        "Hard-delete a single IUS (Indicator-Unit-Subgroup) record with full cascade. "
        "**Identifier** is one of: numeric iusnid, or composite NID/GID (indicator, unit, subgroup_val; separator from IUS_GID_SEPARATOR, default '|'). "
        "If the IUS has existing data rows, returns 409 unless `force=true` is passed."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "IUS deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request", "model": ErrorResponse},
        404: {"description": "IUS or warehouse not found", "model": ErrorResponse},
        409: {"description": "IUS has data rows — pass force=true to confirm", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(
        ...,
        description=(
            "IUS identifier: numeric iusnid, or composite NID/GID (separator from IUS_GID_SEPARATOR, default '|')."
        ),
        alias=PATH_IDENTIFIER,
    ),
    force: bool = Query(False, description="If true, cascade-delete existing data rows.", alias=QUERY_FORCE),
    language_code: str = Depends(get_dw_language_code),
):
    ius_service.delete_ius(
        dw_id,
        identifier=identifier,
        language_code=language_code,
        force=force,
    )
    cache_delete_pattern("dw:ius:*")
    return no_content_response()


@router.post(
    "/ius/multiple-delete",
    summary="Bulk Delete IUS",
    description=(
        "Hard-delete multiple IUS records by composite GID (format from IUS_GID_SEPARATOR, default '|') with full cascade. "
        "Body: ius_gid (list of composite GIDs), force (optional). "
        "If any IUS has data rows and force is false, returns 409 listing affected IUS NIDs."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "IUS records deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request", "model": ErrorResponse},
        404: {"description": "One or more IUS identifiers not found", "model": ErrorResponse},
        409: {"description": "One or more IUS have data rows — pass force=true to confirm", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def bulk_delete_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: IUSMultiDeleteSchema = Body(..., alias=BODY_BODY),
    language_code: str = Depends(get_dw_language_code),
):
    if not body.ius_gid:
        return success_response(message="No IUS identifiers provided", data={"deleted_iusnids": []})

    result = ius_service.bulk_delete_ius(
        dw_id,
        identifiers=body.ius_gid,
        language_code=language_code,
        force=body.force,
    )
    cache_delete_pattern("dw:ius:*")
    errors = result.get("errors", [])
    deleted = result.get("deleted_iusnids", [])
    meta = {"errors": errors} if errors else None
    message = f"{len(deleted)} IUS record(s) deleted successfully" + (f", {len(errors)} failed" if errors else "")
    return success_response(
        message=message,
        data={"deleted_iusnids": deleted},
        meta=meta,
    )


@router.post(
    "/ius/mark-default-subgroups",
    summary="Mark default IUS subgroups",
    description=(
        "For each (indicator, unit) pair in scope: if no row is marked default, set exactly one "
        "as default (prefers subgroup_val_gid matching db_configuration DEFAULT_SYSTEM_DW_SUBGROUP_GID "
        "for this warehouse, then system_configuration, then env; else lowest iusnid). "
        "Optional `i_nid` / `u_nid` filter which pairs are considered (repeat query params for multiple NIDs). "
        "When background sync is enabled and row/pair counts exceed thresholds, work is queued per "
        "BG_JOB_MQ_TYPE (Celery broker or App DB queue + poller); the response includes "
        "`queued`, `task_id`, and counts."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Defaults applied or task queued", "model": SuccessResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def mark_default_subgroups(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    i_nid: Optional[List[int]] = Query(
        None,
        description="Optional indicator NID(s); omit for all indicators in scope",
        alias=QUERY_I_NID,
    ),
    u_nid: Optional[List[int]] = Query(
        None,
        description="Optional unit NID(s); omit for all units in scope",
        alias=QUERY_U_NID,
    ),
):
    i_kw = i_nid if i_nid else None
    u_kw = u_nid if u_nid else None
    result = mark_default_subgroups_for_dw(
        dw_id,
        i_nid=i_kw,
        u_nid=u_kw,
        core_db=db,
    )
    cache_delete_pattern("dw:ius:*")
    if result.get("queued"):
        return success_response(
            message="Default subgroup marking queued",
            data=result,
        )
    return success_response(
        message="Default subgroups updated where missing",
        data=result,
    )
