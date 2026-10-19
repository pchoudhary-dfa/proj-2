"""
Indicator Classification router – full CRUD (list, get one, create, update, delete).
"""
import json
import logging
from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, status, Query, Path, Header, Body, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse

from apps.shared.exceptions import BadRequest, not_found_for_identifier
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.schemas.indicator_classification import (
    IndicatorClassificationCreateSchema,
    IndicatorClassificationUpdateSchema,
    IndicatorClassificationResponseSchema,
    IcIusItemResponseSchema,
    IcIusMappingSchema,
)
from apps.datawarehouse.schemas.indicator import IndicatorResponseSchema
from apps.datawarehouse.schemas.unit import UnitResponseSchema
from apps.datawarehouse.schemas.sg_vals import SgValResponseSchema
from apps.datawarehouse.services.indicator_classification import IndicatorClassificationService
from apps.datawarehouse.utils.export_utils import build_generic_export_xlsx, INDICATOR_CLASSIFICATION_COLUMN_DEFS
from apps.datawarehouse.services.indicator import IndicatorService
from apps.datawarehouse.services.ius import IusService
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.datawarehouse.utils.meta_response import filter_meta_entity_fields
from apps.shared.utils.response import (
    success_response,
    created_response_data,
    no_content_response,
)
from apps.datawarehouse.db.datawarehouse import get_dw_language_code, get_warehouse_credentials
from apps.shared.config.config import settings
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.shared.utils.translations import t
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.app_db.dependencies import get_app_key
from apps.app_db.services.app_config import AppConfigService
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    PATH_IC_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_SORT_ORDER,
    QUERY_SORT_FIELD,
    QUERY_SEARCH,
    QUERY_HIERARCHICAL,
    QUERY_INCLUDE_IC_IUS_COUNTS,
    QUERY_IC_TYPE,
    QUERY_IC_PARENT_NID,
    QUERY_FILTER_GLOBAL,
    QUERY_RETURN_SUBGROUP,
    QUERY_IC_MAPPED_FILTER,
    BODY_DATA,
    QUERY_INDICATOR_META,
    QUERY_UNIT,
    QUERY_SUBGROUP,
    META_IC_DETAIL,
    META_IC_PARENT_DTL,
)

logger = logging.getLogger(__name__)


class MappedFilter(str, Enum):
    all = "all"
    mapped = "true"
    unmapped = "false"


# Query ic_type filter; keep member values in sync with IC_TYPE_ALLOWED_FOR_IC_API.
class IcTypeFilter(str, Enum):
    SC = "SC"
    GL = "GL"
    CF = "CF"
    TH = "TH"
    IT = "IT"
    CN = "CN"


def _ic_type_query_to_value(v: Optional[IcTypeFilter]) -> Optional[str]:
    return v.value if v is not None else None


# All indicator classification type codes returned by GET .../indicator-classifications/type (caption from translations).
IC_TYPE_CODES = ("SC", "GL", "CF", "TH", "IT", "CN")
IC_TYPE_TRANSLATION_KEYS = {code: f"IC_TYPE_{code}" for code in IC_TYPE_CODES}


def _active_ic_type_codes_from_config(config: dict) -> tuple[str, ...]:
    """Resolve enabled IC type codes from app config (ENABLED_IC_TYPES). Empty array means all types."""
    enabled_raw = (config.get("ENABLED_IC_TYPES") or {}).get("value", "[]")
    try:
        enabled_list = json.loads(enabled_raw) if enabled_raw else []
    except (ValueError, TypeError):
        enabled_list = []
    if enabled_list:
        enabled_types = tuple(c.upper() for c in enabled_list if isinstance(c, str) and c.strip())
    else:
        enabled_types = IC_TYPE_CODES
    return tuple(code for code in IC_TYPE_CODES if code in enabled_types)


def _active_ic_type_codes_for_app(app_key: str) -> tuple[str, ...]:
    config = app_config_service.get_config_by_keyword(app_key) or {}
    return _active_ic_type_codes_from_config(config)


router = APIRouter(tags=["Data Warehouse - Indicator Classifications"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}")
ius_service = IusService()
ic_service = IndicatorClassificationService()
indicator_service = IndicatorService()
app_config_service = AppConfigService()


@router.get(
    "/indicator-classifications",
    summary="Get All Indicator Classifications",
        description="Get all indicator classifications with pagination, sort, search, filter and i18n support. Only IC types enabled in ENABLED_IC_TYPES app configuration are returned. Set hierarchical=true to return data as a parent-child tree using ic_parent_nid. Set include_ic_ius_counts=true to add ic_ius_subtree_union_count (distinct IUS from ut_ic_ius over this node and all descendants).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Indicator classifications retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_indicator_classifications(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    page: int = Query(1, ge=1, description="Page number (1-based); ignored when hierarchical=true", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records); ignored when hierarchical=true", alias=QUERY_PAGE_SIZE),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query(
        "ic_nid",
        description="Sort field: ic_nid, ic_name, ic_gid, ic_type, ic_order",
        alias=QUERY_SORT_FIELD,
    ),
    search: Optional[str] = Query(None, description="Search in ic_name / ic_short_name / ic_gid", alias=QUERY_SEARCH),
    ic_type: Optional[IcTypeFilter] = Query(
        None,
        description="Filter by classification type (SC, GL, CF, TH, IT, CN). SR is not available in this API.",
        alias=QUERY_IC_TYPE,
    ),
    ic_parent_nid: Optional[int] = Query(None, description="Filter by parent IC NID (flat mode only)", alias=QUERY_IC_PARENT_NID),
    filter_global: Optional[bool] = Query(None, description="Filter by global flag", alias=QUERY_FILTER_GLOBAL),
    hierarchical: bool = Query(False, description="If true, return data as a hierarchical (parent-child) tree using ic_parent_nid. If false, return flat paginated list.", alias=QUERY_HIERARCHICAL),
    include_ic_ius_counts: bool = Query(
        False,
        description="If true, each classification includes ic_ius_subtree_union_count from ut_ic_ius (distinct iusnid), unioning mappings on this IC and every descendant IC.",
        alias=QUERY_INCLUDE_IC_IUS_COUNTS,
    ),
    export: bool = Query(False, description="Export as XLSX; disables pagination, always flat", alias="export"),
    language_code: str = Depends(get_dw_language_code),
    app_key: str = Depends(get_app_key),
):
    active_ic_types = _active_ic_type_codes_for_app(app_key)
    ic_type_val = _ic_type_query_to_value(ic_type)
    if ic_type_val is not None and ic_type_val not in active_ic_types:
        raise BadRequest(
            f"ic_type {ic_type_val!r} is not enabled for this application. "
            f"Enabled types: {list(active_ic_types)}."
        )

    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        items, _total = ic_service.get_all_indicator_classifications(
            dw_id,
            page=1,
            page_size=None,
            language_code=language_code,
            sort_order=sort_order or "asc",
            sort_field=sort_field or "ic_nid",
            search=search,
            ic_type=ic_type_val,
            ic_parent_nid=ic_parent_nid,
            filter_global=filter_global,
            hierarchical=False,
            include_ic_ius_counts=False,
            active_ic_types=active_ic_types,
        )
        rows = [
            [
                item.get("ic_nid"),
                item.get("ic_gid"),
                item.get("ic_name"),
                item.get("ic_type"),
                item.get("ic_parent_nid"),
                item.get("ic_short_name"),
                item.get("ic_order"),
                item.get("ic_global"),
            ]
            for item in items
        ]
        output, filename = build_generic_export_xlsx(
            "Classifications", INDICATOR_CLASSIFICATION_COLUMN_DEFS, rows, language_code, db_display_name, "CLASSIFICATIONS"
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    use_pagination = page_size is not None and not hierarchical
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    ser_mode = get_serialization_mode()
    cache_key = (
        f"dw:indicator-classifications:list:{dw_id}:{page}:{effective_page_size}:"
        f"{sort_order or 'asc'}:{sort_field or 'ic_nid'}:{language_code}:"
        f"{search}:{ic_type_val}:{ic_parent_nid}:{filter_global}:{hierarchical}:"
        f"{include_ic_ius_counts}:{','.join(active_ic_types)}:{app_key}:"
        f"{ser_mode.get('by_alias', False)}"
    )
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items, total_count = ic_service.get_all_indicator_classifications(
        dw_id,
        page=page,
        page_size=effective_page_size,
        language_code=language_code,
        sort_order=sort_order or "asc",
        sort_field=sort_field or "ic_nid",
        search=search,
        ic_type=ic_type_val,
        ic_parent_nid=ic_parent_nid,
        filter_global=filter_global,
        hierarchical=hierarchical,
        include_ic_ius_counts=include_ic_ius_counts,
        active_ic_types=active_ic_types,
    )

    if hierarchical:
        def serialize_ic_node(node):
            data = {k: v for k, v in node.items() if k != "children"}
            dumped = IndicatorClassificationResponseSchema.model_validate(data).model_dump(**ser_mode)
            dumped["children"] = [serialize_ic_node(c) for c in node.get("children", [])]
            return dumped
        response_data = [serialize_ic_node(item) for item in items]
    else:
        response_data = [
            IndicatorClassificationResponseSchema.model_validate(item).model_dump(**ser_mode)
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
        "message": f"Retrieved {len(response_data)} indicator classifications",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message=f"Retrieved {len(response_data)} indicator classifications",
        data=response_data,
        meta=meta,
    )


@router.get(
    "/indicator-classifications/type",
    summary="Get All Indicator Classification Types",
    description="Return indicator classification type codes (SC, GL, CF, TH, IT, CN) with human-readable captions for the requested language. Use Accept-Language or the warehouse default. Captions come from translation tables.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Indicator classification types retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_indicator_classification_types(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    app_key: str = Depends(get_app_key),
):
    """Return type code -> caption map for IC types using translations for the given locale. Only enabled IC types (per ENABLED_IC_TYPES system config) are returned."""
    active_codes = _active_ic_type_codes_for_app(app_key)
    data = {
        code: t(IC_TYPE_TRANSLATION_KEYS[code], locale=language_code, default=code)
        for code in active_codes
    }
    return success_response(
        message="Indicator classification types retrieved successfully",
        data=data,
    )




@router.get(
    f"/indicator-classifications/{{{PATH_IDENTIFIER}}}",
    summary="Get Indicator Classification by identifier",
    description="Get a single indicator classification by identifier. **Identifier** is either the numeric primary key (ic_nid) or the alphanumeric GID (ic_gid).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Indicator classification retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Indicator classification or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_indicator_classification_by_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Indicator classification identifier: numeric for ic_nid (primary key), non-numeric for ic_gid.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    cache_key = f"dw:indicator-classifications:id:{dw_id}:{identifier}:{language_code}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    item = ic_service.get_indicator_classification_by_identifier(
        dw_id,
        identifier=identifier,
        language_code=language_code,
    )

    if not item:
        raise not_found_for_identifier("Indicator classification", identifier)
    response_data = IndicatorClassificationResponseSchema.model_validate(item).model_dump(
        **get_serialization_mode()
    )
    body = {
        "success": True,
        "message": "Indicator classification retrieved successfully",
        "data": response_data,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Indicator classification retrieved successfully",
        data=response_data,
    )


# @router.get(
#     f"/ic/{{{PATH_IC_IDENTIFIER}}}/ius",
#     summary="List IUS or IU for an IC",
#     description="Return full list for the data warehouse with mapped flag for the given indicator classification. **return_subgroup**: if true, returns IUS list with ius_nid, ius_gid, i_gid, u_gid, sg_gid, is_mapped_to_ic, ic_ius_nid, etc. (data has gids only; full indicator/unit/subgroup info in meta.indicator, meta.unit, meta.subgroup keyed by gid). If false, returns IU list with i_nid, u_nid, i_gid, u_gid, is_mapped_to_ic (no names in data); indicator and unit names and other details are in meta.indicator and meta.unit keyed by gid. **mapped**: true = only items mapped to this IC, false = only unmapped, omit = all. **ic_identifier** is either numeric (ic_nid) or alphanumeric (ic_gid). IUS-only params: sort_field.",
#     response_model=SuccessResponse,
#     responses={
#         200: {"description": "IUS or IU list with mapped flag retrieved successfully", "model": SuccessResponse},
#         400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
#         404: {"description": "Indicator classification or warehouse not found", "model": ErrorResponse},
#         500: {"description": "Internal server error", "model": ErrorResponse},
#     },
# )
# async def list_ius_or_iu_for_ic(
#     dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
#     _: str = Depends(validate_dw_id),
#     ic_identifier: str = Path(..., description="Indicator classification identifier: numeric for ic_nid, or ic_gid (alphanumeric)", alias=PATH_IC_IDENTIFIER),
#     return_subgroup: bool = Query(True, description="If true return IUS (indicator–unit–subgroup); if false return IU (indicator–unit) only", alias=QUERY_RETURN_SUBGROUP),
#     page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
#     page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
#     sort_order: Optional[str] = Query("asc", description="Sort order (asc/desc). Applied when return_subgroup is true.", alias=QUERY_SORT_ORDER),
#     sort_field: Optional[str] = Query(
#         None,
#         description="Sort field when return_subgroup is true: iusnid (default), indicator_nid, unit_nid, subgroup_val_nid",
#         alias=QUERY_SORT_FIELD,
#     ),
#     mapped: MappedFilter = Query(
#         MappedFilter.all,
#         description="Filter by IC mapping: 'true' = only items mapped to this IC, 'false' = only unmapped, 'all' = return all.",
#         alias=QUERY_IC_MAPPED_FILTER,
#     ),
#     language_code: str = Depends(get_dw_language_code),
# ):
#     try:
#         use_pagination = page_size is not None
#         effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
#         only_sel_ius = mapped == MappedFilter.mapped
#         only_unsel_ius = mapped == MappedFilter.unmapped
#         if return_subgroup:
#             result = ic_service.list_ius_for_ic(
#                 dw_id,
#                 ic_identifier=ic_identifier,
#                 language_code=language_code,
#                 page=page,
#                 page_size=effective_page_size,
#                 sort_order=sort_order or "asc",
#                 sort_field=sort_field,
#                 only_sel_ius=only_sel_ius,
#                 only_unsel_ius=only_unsel_ius,
#             )
#             meta_key = "sel_ius_count"
#         else:
#             result = ic_service.list_iu_for_ic(
#                 dw_id,
#                 ic_identifier=ic_identifier,
#                 language_code=language_code,
#                 page=page,
#                 page_size=effective_page_size,
#                 only_sel_ius=only_sel_ius,
#                 only_unsel_ius=only_unsel_ius,
#             )
#             meta_key = "sel_iu_count"

#         if result is None:
#             raise not_found_for_identifier("Indicator classification", ic_identifier)

#         ser_mode = get_serialization_mode()
#         if effective_page_size is not None:
#             total_pages = (result["total_count"] + effective_page_size - 1) // effective_page_size if result["total_count"] else 0
#             meta_page, meta_page_size = page, effective_page_size
#         else:
#             total_pages = 1
#             meta_page, meta_page_size = 1, result["total_count"]
#         meta = ListPaginationMetaSchema(
#             total_count=result["total_count"],
#             count=result["count"],
#             page=meta_page,
#             page_size=meta_page_size,
#             total_pages=total_pages,
#         ).model_dump()
#         meta["ic_detail"] = IndicatorClassificationResponseSchema.model_validate(result["ic_detail"]).model_dump(**ser_mode)
#         meta["ic_parent_dtl"] = IndicatorClassificationResponseSchema.model_validate(result["ic_parent_dtl"]).model_dump(**ser_mode)
#         meta[meta_key] = result[meta_key]
#         # Add indicator/unit (and when return_subgroup, subgroup) by gid in meta for full info lookup
#         if "context_nids" in result:
#             ctx = result["context_nids"]
#             ind_nids = ctx.get("indicator_nids") or set()
#             u_nids = ctx.get("unit_nids") or set()
#             sg_nids = (ctx.get("sg_nids") or set()) if return_subgroup else set()
#             if ind_nids or u_nids or sg_nids:
#                 raw = ius_service.get_ius_context_meta(
#                     dw_id=dw_id,
#                     indicator_nids=ind_nids,
#                     unit_nids=u_nids,
#                     sg_nids=sg_nids,
#                     language_code=language_code,
#                 )
#                 indicator_dict = {}
#                 for rec in raw["indicators"]:
#                     rec_data = {
#                         "indicator_nid": rec.indicator_nid,
#                         "indicator_name": rec.indicator_name,
#                         "indicator_gid": rec.indicator_gid,
#                         "indicator_info": rec.indicator_info,
#                         "indicator_global": rec.indicator_global,
#                         "short_name": rec.short_name,
#                         "keywords": rec.keywords,
#                         "indicator_order": rec.indicator_order,
#                         "data_exist": rec.data_exist,
#                         "highisgood": rec.highisgood,
#                     }
#                     gid = rec.indicator_gid
#                     if gid is not None:
#                         indicator_dict[gid] = IndicatorResponseSchema.model_validate(rec_data).model_dump(
#                             **ser_mode,
#                             exclude={
#                                 "locale", "unit_nid", "subgroup_nid", "default_sg_nid",
#                                 "ic_nid", "metadata", "iusnid", "unit_gid", "subgroup_gid",
#                                 "default_sg_gid", "ius_gid", "ic_gid",
#                             },
#                         )
#                 unit_dict = {}
#                 for rec in raw["units"]:
#                     rec_data = {
#                         "unit_nid": rec.unit_nid,
#                         "unit_name": rec.unit_name,
#                         "unit_gid": rec.unit_gid,
#                         "unit_global": rec.unit_global,
#                     }
#                     gid = rec.unit_gid
#                     if gid is not None:
#                         unit_dict[gid] = UnitResponseSchema.model_validate(rec_data).model_dump(**ser_mode)
#                 meta["indicator"] = indicator_dict
#                 meta["unit"] = unit_dict
#                 if return_subgroup:
#                     subgroup_dict = {}
#                     for rec in raw["subgroups"]:
#                         serialized = SgValResponseSchema.model_validate(
#                             SgValResponseSchema.from_record(rec)
#                         ).model_dump(**ser_mode)
#                         gid = rec.subgroup_val_gid
#                         if gid is not None:
#                             subgroup_dict[gid] = serialized
#                     meta["subgroup"] = subgroup_dict
#         serialized_data = (
#             [IcIusItemResponseSchema.model_validate(item).model_dump(**ser_mode) for item in result["data"]]
#             if return_subgroup
#             else result["data"]
#         )
#         return success_response(
#             message="",
#             data=serialized_data,
#             meta=meta,
#         )
#     except ValueError as e:
#         logger.error(f"Error listing IUS/IU for IC: {str(e)}", exc_info=True)
#         error_msg = str(e)
#         if "Language code" in error_msg:
#             return error_response(
#                 message=error_msg,
#                 status_code=status.HTTP_400_BAD_REQUEST,
#             )
#         if "Warehouse" in error_msg and "not found" in error_msg:
#             raise not_found_for_identifier("Datawarehouse", dw_id)
#         return error_response(
#             message=error_msg,
#             status_code=status.HTTP_404_NOT_FOUND,
#         )
#     except Exception as e:
#         logger.error(f"Error listing IUS/IU for IC: {str(e)}", exc_info=True)
#         return error_response(
#             message=f"Failed to list IUS/IU for IC: {str(e)}",
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#         )


@router.get(
    f"/ic/{{{PATH_IC_IDENTIFIER}}}/indicators",
    tags=["Data Warehouse - Indicator Classifications"],
    summary="List indicators for an IC",
    description="Return a paginated list of indicators linked to the given indicator classification. Same response shape as GET /dw/{dw_id}/indicators. **ic_identifier** is either numeric (ic_nid) or alphanumeric (ic_gid).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Indicators retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Indicator classification or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_indicators_for_ic(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    ic_identifier: str = Path(..., description="Indicator classification identifier: numeric for ic_nid, or ic_gid (alphanumeric)", alias=PATH_IC_IDENTIFIER),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query("i_order", description="Sort field: i_order, i_name, i_gid", alias=QUERY_SORT_FIELD),
    language_code: str = Depends(get_dw_language_code),
):
    """Get paginated list of indicators linked to the given indicator classification."""
    use_pagination = page_size is not None
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    ser_mode = get_serialization_mode()
    cache_key = (
        f"dw:ic:indicators:{dw_id}:{ic_identifier}:{page}:{effective_page_size}:"
        f"{sort_order or 'asc'}:{sort_field or 'i_order'}:{language_code}:"
        f"{ser_mode.get('by_alias', False)}"
    )
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    indicators, total_count = indicator_service.get_indicators_for_ic(
        dw_id,
        ic_identifier=ic_identifier,
        page=page,
        page_size=effective_page_size,
        language_code=language_code,
        sort_order=sort_order or "asc",
        sort_field=sort_field or "i_order",
    )

    if indicators is None:
        raise not_found_for_identifier("Indicator classification", ic_identifier)

    dump_kwargs = {**ser_mode, "exclude_none": True}
    response_data = [
        IndicatorResponseSchema.model_validate(ind).model_dump(**dump_kwargs)
        for ind in indicators
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
    message = f"Retrieved {len(response_data)} indicators"
    body = {"success": True, "message": message, "data": response_data, "meta": meta}
    cache_set(cache_key, body)
    return success_response(
        message=message,
        data=response_data,
        meta=meta,
    )


@router.post(
    "/indicator-classifications",
    summary="Create Indicator Classification(s) (batch)",
    description="Create one or more indicator classifications in the specified data warehouse with i18n support. Request body is an array of IC objects. Inserts into all locale tables. **Required per item**: ic_name. **Optional**: ic_gid (auto-generated if not provided), ic_parent_nid, ic_type, ic_short_name, ic_info, ic_is_global, ic_publisher, ic_title, ic_diyear, ic_sourcelink1, ic_sourcelink2, ic_order, ic_isbn, ic_nature. Send one object in an array for single create, or multiple for bulk. All-or-nothing transaction.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Indicator classification(s) created successfully", "model": SuccessResponse},
        400: {"description": "Bad request - empty array, invalid language or validation", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        409: {"description": "Conflict - GID already exists", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_indicator_classification(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    data: List[IndicatorClassificationCreateSchema] = Body(..., description="Array of indicator classification creation data", alias=BODY_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    """Create one or more indicator classifications. GID is auto-generated per item if not provided."""
    if not data:
        raise BadRequest("Request body must be a non-empty array of indicator classification objects")
    result = ic_service.create_indicator_classifications_batch(dw_id, data, language_code)
    cache_delete_pattern("dw:indicator-classifications:*")
    ser_mode = get_serialization_mode()
    response_data = [
        IndicatorClassificationResponseSchema.model_validate(r).model_dump(**ser_mode)
        for r in result["created"]
    ]
    nid_key = alias_field("ut_indicator_classifications", "ic_nid") if ser_mode.get("by_alias") else "ic_nid"
    gid_key = alias_field("ut_indicator_classifications", "ic_gid") if ser_mode.get("by_alias") else "ic_gid"
    data_out = created_response_data(response_data, nid_key, gid_key)
    count = len(response_data)
    errors = result.get("errors", [])
    message = f"{count} indicator classification(s) created successfully" + (f", {len(errors)} failed" if errors else "")
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
    f"/indicator-classifications/{{{PATH_IDENTIFIER}}}",
    summary="Update Indicator Classification by identifier",
    description="Partially update an existing indicator classification. **Identifier** is either ic_nid (numeric) or ic_gid (non-numeric). Only provided fields are updated.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Indicator classification updated successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language or validation", "model": ErrorResponse},
        404: {"description": "Indicator classification or warehouse not found", "model": ErrorResponse},
        409: {"description": "Conflict - GID already exists", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_indicator_classification(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Indicator classification identifier: numeric for ic_nid, non-numeric for ic_gid.", alias=PATH_IDENTIFIER),
    data: IndicatorClassificationUpdateSchema = Body(..., description="Fields to update (all optional)", alias=BODY_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    """Update an existing indicator classification by ic_nid or ic_gid."""
    result = ic_service.update_indicator_classification(dw_id, identifier, data, language_code)
    if not result:
        raise not_found_for_identifier("Indicator classification", identifier)
    cache_delete_pattern("dw:indicator-classifications:*")
    ser_mode = get_serialization_mode()
    payload_keys = set(data.model_dump(exclude_unset=True, **ser_mode).keys())
    full_response = IndicatorClassificationResponseSchema.model_validate(result).model_dump(**ser_mode)
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}
    return success_response(
        message="Indicator classification updated successfully",
        data=response_data,
    )


@router.delete(
    f"/indicator-classifications/{{{PATH_IDENTIFIER}}}",
    summary="Delete Indicator Classification by identifier",
    description="Delete an indicator classification by ic_nid or ic_gid. Any IUS mappings (ut_ic_ius) on this IC are removed automatically before the classification row is deleted.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Indicator classification deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language", "model": ErrorResponse},
        404: {"description": "Indicator classification or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_indicator_classification(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Indicator classification identifier: numeric for ic_nid, non-numeric for ic_gid.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    """Delete an indicator classification; clears ut_ic_ius rows for this ic_nid first."""
    deleted = ic_service.delete_indicator_classification(dw_id, identifier)
    if not deleted:
        raise not_found_for_identifier("Indicator classification", identifier)
    cache_delete_pattern("dw:indicator-classifications:*")
    return no_content_response()


@router.put(
    "/indicator-classifications/ius",
    summary="Map Indicator Classifications to IUS",
    description="Map ICs to IUS combinations using composite GIDs (I|U expands all subgroups; I|U|SG is specific). Matches Data Manager v5 associateIcWithIUS: per edited IC, delete removed IUS and insert new IUS across that IC, its ordered first-child chain, and ancestors (optional parent_ic_gid selects v5 parentIcNid ancestor path).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "IC-IUS mappings updated successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid payload or GIDs", "model": ErrorResponse},
        404: {"description": "IC or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def map_ic_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    payload: IcIusMappingSchema = Body(..., description="IC-IUS mapping data", alias=BODY_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    """Map Indicator Classifications to IUS combinations (v5-aligned IC scope for adds/removes)."""
    if not payload.data:
        raise BadRequest("Request body must contain a non-empty data array")
    
    result = ic_service.map_ic_ius_batch(dw_id, payload.data, language_code)
    
    # Clear related caches
    cache_delete_pattern("dw:indicator-classifications:*")
    cache_delete_pattern("dw:ic:*")
    
    if result["success"]:
        return success_response(
            message=f"Successfully processed {len(result['processed'])} IC-IUS mappings",
            data=result["processed"],
            meta={"errors": result["errors"]} if result["errors"] else None
        )
    else:
        errors = result["errors"]
        first_detail = errors[0]["error"] if errors else "Unknown error"
        summary =first_detail
        if len(errors) > 1:
            summary = f"{summary} ({len(errors)} errors total)"
        raise BadRequest(
            summary,
            details={"validation_errors": errors},
        )
