"""
Indicator router for CRUD operations on indicator table

Accepts both internal (indicator_name, indicator_gid) and external (i_name, i_gid) 
keys in request bodies thanks to populate_by_name=True in schemas.

Response keys are determined by ADAPTATION environment variable via get_serialization_mode().
"""
import logging
from typing import List, Optional, Any, Dict, Set
from fastapi import APIRouter, Depends, status, Query, Path, Body, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from sqlalchemy.orm import Session
from apps.shared.exceptions import BadRequest, NotFound, not_found_for_identifier
from apps.shared.config.dependencies import get_db
from apps.app_db.models.core import Dataset
from apps.datawarehouse.schemas.indicator import (
    IndicatorCreateSchema,
    IndicatorMultipleDeleteSchema,
    IndicatorUpdateSchema,
    IndicatorResponseSchema,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.services.indicator import IndicatorService
from apps.datawarehouse.services.validation_rules import ValidationRuleService
from apps.datawarehouse.schemas.validation_rules import ValidationRuleUpsertSchema
from apps.app_db.dependencies import get_current_user_id
from apps.datawarehouse.utils.export_utils import build_generic_export_xlsx, INDICATOR_COLUMN_DEFS
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import (
    success_response,
    created_response_data,
    no_content_response,
)
from apps.shared.utils.validators import resolve_identifier_to_nid, validate_identifier_type_consistency
from apps.datawarehouse.db.datawarehouse import get_dw_language_code, get_warehouse_credentials, credentials_to_schema, get_warehouse_session
from apps.datawarehouse.services.ius import IusService
from apps.shared.config.config import settings
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.shared.utils.ius_utils import get_ius_gid_separator
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_SORT_ORDER,
    QUERY_SORT_FIELD,
    QUERY_SUBGROUP,
    QUERY_SUBGROUP_COMPUTE_FORMULA,
    QUERY_DEFAULT_SUBGROUP_ONLY,
    QUERY_INCLUDE_IUS,
    ASSOC_DATA_COUNT,
    ASSOC_IUS_COUNT,
    QUERY_UNIT,
    QUERY_IC,
    QUERY_METADATA,
    BODY_DATA,
    QUERY_SEARCH,
    QUERY_SEARCH_BY,
    QUERY_IDENTIFIER,
    BODY_BODY,
    QUERY_I_IDENTIFIER,
    QUERY_U_IDENTIFIER,
    QUERY_SG_IDENTIFIER,
    QUERY_IC_IDENTIFIER,
    QUERY_IC_TYPE,
    IC_TYPE_ALLOWED_FOR_IC_API,
    INDICATOR_SEARCH_BY_ENTITIES,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Indicators"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/indicators")
indicator_service = IndicatorService()
ius_service = IusService()
validation_rule_service = ValidationRuleService()


def _split_identifier_param(raw: Optional[str], label: str):
    """
    Split a comma-separated identifier string and validate that all values are the
    same type (all NIDs or all GIDs). Returns (nids, gids, errors).
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


@router.post(
    "",
    summary="Create Indicators (batch)",
    description="Create one or more indicators in the specified data warehouse with i18n support. Request body is an array of indicator objects. Accepts both internal and external field names. Core fields (e.g. i_name) are enough for indicator-only create—no IUS rows. Optional: s_gid or u_gid+sg_gid for units/subgroups, ic_gid for classifications (resolved server-side).",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED
)
async def create_indicators(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    data: List[IndicatorCreateSchema] = Body(..., alias=BODY_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    """
    Create one or more indicators in a single request.

    Minimal body (indicator only, no IUS): [ { "i_name": "...", "i_description": "...", ... } ].

    Optional relationship fields (lists of GIDs; resolved server-side) when you need IUS/IC links:
    - Unit: u_gid
    - Subgroup: sg_gid (with u_gid), or s_gid map (unit GID -> subgroup GIDs)
    - Indicator classification: ic_gid

    All-or-nothing: if any item fails validation, no indicators are created.
    Response format determined by ADAPTATION environment variable.
    """
    if not data:
        raise BadRequest("Request body must be a non-empty array of indicator objects")
    result = indicator_service.create_indicators_batch(dw_id, data, language_code)

    ser_mode = get_serialization_mode()
    response_data = [
        IndicatorResponseSchema.model_validate(r).model_dump(**ser_mode)
        for r in result["created"]
    ]
    nid_key = alias_field("ut_indicator", "indicator_nid") if ser_mode.get("by_alias") else "indicator_nid"
    gid_key = alias_field("ut_indicator", "indicator_gid") if ser_mode.get("by_alias") else "indicator_gid"
    data_out = created_response_data(response_data, nid_key, gid_key)

    cache_delete_pattern("dw:indicators:*")
    count = len(response_data)
    errors = result.get("errors", [])
    message = f"{count} indicator(s) created successfully" + (f", {len(errors)} failed" if errors else "")
    meta: dict = {"count": count}
    if errors:
        meta["errors"] = errors
    return success_response(
        message=message,
        data=data_out,
        status_code=status.HTTP_201_CREATED,
        meta=meta
    )


@router.get(
    "",
    summary="Get All Indicators",
    description=(
        "Get all indicators from the specified data warehouse with pagination and i18n support. "
        "Filter by i_identifier (comma-separated indicator NIDs or GIDs, not mixed); "
        "u_identifier, sg_identifier, ic_identifier (Unit/Subgroup/IC NIDs or GIDs, not mixed); ic_type (SC, GL, CF, TH, IT, CN). "
        "Optional expand: subgroup, unit, ic, metadata; ius=true adds ius_nid per unit in s_gid (parallel to sg_gid). "
        "Multi-entity search: search_by=entity1|entity2 (e.g. indicator|highisgood), search=term1|term2 (e.g. gdp|true); separator from IUS_GID_SEPARATOR (default |). "
        "Entities: indicator, unit, subgroup, ic (text ILIKE); highisgood, data_exist, indicator_global (boolean: term true/false/1/0/yes/no). Terms ANDed in order. "
        "Single search: pass only search for indicator name/GID."
    ),
    response_model=SuccessResponse
)
async def get_all_indicators(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query("i_order", description="Sort field: i_order, i_name, i_gid", alias=QUERY_SORT_FIELD),
    subgroup: bool = Query(False, description="Include full Subgroup data (unit_nid, subgroup_val_nid, default_subgroup_nid, ius_nid) per indicator; unit and meta.unit are always included", alias=QUERY_SUBGROUP),
    ius: bool = Query(False, description="Include ius_nid list per unit inside s_gid (same order as sg_gid after sort); does not add meta.subgroup unless subgroup=true", alias=QUERY_INCLUDE_IUS),
    default_subgroup_only: bool = Query(False, description="When subgroup=true, return only default subgroup id/gid (omit full subgroup list and ius_nid)", alias=QUERY_DEFAULT_SUBGROUP_ONLY),
    ic: bool = Query(False, description="Include Indicator Classification (ic_nid) per indicator", alias=QUERY_IC),
    metadata: bool = Query(False, description="Include metadata reports in the indicator response", alias=QUERY_METADATA),
    search: Optional[str] = Query(None, description="Search term(s). Single term: search in indicator name/GID. Multi-entity: use with search_by; terms separated by IUS_GID_SEPARATOR (e.g. search=gdp|ratio).", alias=QUERY_SEARCH),
    search_by: Optional[str] = Query(None, description="Entities to search in, separated by IUS_GID_SEPARATOR (e.g. indicator|unit|highisgood). Order matches search.", alias=QUERY_SEARCH_BY),
    i_identifier: Optional[str] = Query(None, description="Comma-separated Indicator NIDs or GIDs to filter by (not mixed). When set, returns only these indicators.", alias=QUERY_I_IDENTIFIER),
    u_identifier: Optional[str] = Query(None, description="Comma-separated Unit NIDs or GIDs to filter by (not mixed).", alias=QUERY_U_IDENTIFIER),
    sg_identifier: Optional[str] = Query(None, description="Comma-separated Subgroup Value NIDs or GIDs to filter by (not mixed).", alias=QUERY_SG_IDENTIFIER),
    ic_identifier: Optional[str] = Query(None, description="Comma-separated IC NIDs or GIDs for contextual mapping filter (not mixed).", alias=QUERY_IC_IDENTIFIER),
    ic_type: Optional[str] = Query(
        None,
        description="IC classification type: one of SC, GL, CF, TH, IT, CN (SR not available).",
        alias=QUERY_IC_TYPE,
    ),
    export: bool = Query(False, description="Export as XLSX; disables pagination and forces all IUS/IC relations", alias="export"),
    language_code: str = Depends(get_dw_language_code),
):
    """
    Get all indicators from the data warehouse with pagination and i18n support.
    Filter by i_identifier (indicator), u_identifier (unit), sg_identifier (subgroup),
    ic_identifier (IC), ic_type (SC/GL/CF/TH/IT/CN). Optional expand: subgroup, unit, ic.
    """
    if ic_type is not None and isinstance(ic_type, str):
        ic_type = ic_type.strip().upper()
    if ic_type is not None and ic_type not in IC_TYPE_ALLOWED_FOR_IC_API:
        raise BadRequest(
            f"ic_type must be one of {list(IC_TYPE_ALLOWED_FOR_IC_API)}; got {ic_type!r}.",
        )
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
    # Build multi-entity search criteria: search_by=indicator|unit, search=term1|term2 (IUS_GID_SEPARATOR)
    search_criteria: List[tuple] = []
    _sep = get_ius_gid_separator()
    if search_by and search_by.strip() and search is not None:
        entities = [e.strip().lower() for e in search_by.split(_sep) if e.strip()]
        terms = [t.strip() for t in search.split(_sep)]
        if len(entities) != len(terms):
            raise BadRequest(
                f"search_by and search must have the same number of parts (separator: {_sep!r}).",
            )
        invalid = [e for e in entities if e not in INDICATOR_SEARCH_BY_ENTITIES]
        if invalid:
            raise BadRequest(
                f"search_by entities must be one of {list(INDICATOR_SEARCH_BY_ENTITIES)}; got invalid: {invalid}.",
            )
        search_criteria = [(e, t) for e, t in zip(entities, terms)]
    elif search and search.strip():
        # Single search: indicator name/GID only
        search_criteria = [("indicator", search.strip())]
    export_indicator_nids: Optional[List[int]] = None
    if export and search_criteria:
        export_indicator_nids = ius_service.get_indicator_nids_by_search_criteria(dw_id, language_code, search_criteria)
    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        warehouse = credentials_to_schema(cred)
        with get_warehouse_session(warehouse) as dw_db:
            flat_rows = indicator_service.get_indicators_flat_for_export(
                dw_db=dw_db,
                language_code=language_code,
                sort_order=sort_order or "asc",
                sort_field=sort_field or "i_order",
                search=None if export_indicator_nids is not None else search,
                indicator_nids=export_indicator_nids,
            )
        rows = [
            [r.get(col) for col in INDICATOR_COLUMN_DEFS]
            for r in flat_rows
        ]
        output, filename = build_generic_export_xlsx(
            "Indicators", INDICATOR_COLUMN_DEFS, rows, language_code, db_display_name, "INDICATORS"
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    indicator_nids_filter: Optional[List[int]] = None
    if i_identifier:
        parts = [p.strip() for p in i_identifier.split(",") if p.strip()]
        if parts:
            resolved_nids: List[int] = []
            for p in parts:
                nid = resolve_identifier_to_nid(
                    p, lambda gid: indicator_service.get_indicator_nid_by_gid(dw_id, gid)
                )
                if nid is None:
                    raise not_found_for_identifier("Indicator", p)
                resolved_nids.append(nid)
            indicator_nids_filter = resolved_nids

    ius_filter_nids = ius_service.get_indicator_nids_by_filters(
        dw_id,
        language_code=language_code,
        u_nids=u_nids,
        u_gids=u_gids,
        sg_nids=sg_nids,
        sg_gids=sg_gids,
        ic_nids=ic_nids,
        ic_gids=ic_gids,
        ic_type=ic_type,
    )
    iusnid_allowlist: Optional[Set[int]] = None
    ic_nid_allowlist: Optional[Set[int]] = None
    if ic_nids or ic_gids or ic_type:
        iusnid_allowlist = ius_service.get_iusnids_for_ic_mapping_filter(
            dw_id, language_code, ic_nids, ic_gids, ic_type
        )
        ic_nid_allowlist = ius_service.get_ic_nids_for_ic_mapping_filter(
            dw_id, language_code, ic_nids, ic_gids, ic_type
        )

    if ius_filter_nids is not None:
        if indicator_nids_filter is not None:
            indicator_nids_filter = [n for n in indicator_nids_filter if n in set(ius_filter_nids)]
        else:
            indicator_nids_filter = ius_filter_nids
        if not indicator_nids_filter:
            effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if page_size is not None else None
            meta = ListPaginationMetaSchema(
                total_count=0,
                count=0,
                page=1,
                page_size=effective_page_size or 0,
                total_pages=0,
            ).model_dump()
            return success_response(message="Retrieved 0 indicators", data=[], meta=meta)

    # Apply multi-entity search criteria (AND with existing indicator_nids_filter)
    if search_criteria:
        search_nids = ius_service.get_indicator_nids_by_search_criteria(dw_id, language_code, search_criteria)
        if search_nids is not None:
            # intersect with existing filter or use search result as filter
            if indicator_nids_filter is not None:
                filter_set = set(indicator_nids_filter)
                indicator_nids_filter = [n for n in search_nids if n in filter_set]
            else:
                indicator_nids_filter = search_nids
            if not indicator_nids_filter:
                effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if page_size is not None else None
                meta = ListPaginationMetaSchema(
                    total_count=0,
                    count=0,
                    page=1,
                    page_size=effective_page_size or 0,
                    total_pages=0,
                ).model_dump()
                return success_response(message="Retrieved 0 indicators", data=[], meta=meta)

    include_ic = ic
    use_pagination = page_size is not None and indicator_nids_filter is None
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    ser_mode = get_serialization_mode()
    search_for_request = None if search_criteria else search
    search_cache_part = "|".join(f"{e}:{t}" for e, t in sorted(search_criteria)) if search_criteria else (search or "")
    cache_key = (
        f"dw:indicators:list:v6:{dw_id}:{page}:{effective_page_size}:{sort_order or 'asc'}:{sort_field or 'i_order'}:{language_code}:{subgroup}:{ius}:{default_subgroup_only}:{include_ic}:{metadata}:{search_cache_part}:{i_identifier or ''}:"
        f"{u_identifier or ''}:{sg_identifier or ''}:{ic_identifier or ''}:{ic_type or ''}:{ser_mode['by_alias']}"
    )
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    indicators, total_count, meta_entities, total_count_unfiltered_raw = indicator_service.get_all_indicators(
        dw_id,
        page=page,
        page_size=effective_page_size,
        language_code=language_code,
        sort_order=sort_order or "asc",
        sort_field=sort_field or "i_order",
        give_ius=subgroup,
        default_subgroup_only=default_subgroup_only,
        give_iu_only=True,  # unit always included with indicator
        give_ic=include_ic,
        give_metadata=metadata,
        search=search_for_request,
        indicator_nids=indicator_nids_filter,
        iusnid_allowlist=iusnid_allowlist,
        ic_nid_allowlist=ic_nid_allowlist,
        include_ius_nids_in_s_gid=ius,
    )
    
    # Transform list with Pydantic serialization; exclude_none so u_nid, s_nid, ic_nid, ius_nid, metadata etc. are omitted when null
    dump_kwargs = {**ser_mode, "exclude_none": True}
    response_data = [
        _normalize_indicator_response_item(
            IndicatorResponseSchema.model_validate(ind).model_dump(**dump_kwargs),
            subgroup,
            True,
        )
        for ind in indicators
    ]
    if effective_page_size is not None:
        total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        meta_page, meta_page_size = page, effective_page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, total_count
    has_list_filters = bool(search_for_request and search_for_request.strip()) or bool(
        indicator_nids_filter
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
    if meta_entities:
        if subgroup and meta_entities.get("sg"):
            meta[QUERY_SUBGROUP] = meta_entities["sg"]
        if meta_entities.get("unit"):
            meta[QUERY_UNIT] = meta_entities["unit"]
        if include_ic and meta_entities.get("ic"):
            meta[QUERY_IC] = meta_entities["ic"]
        if metadata and meta_entities.get("metadata"):
            meta[QUERY_METADATA] = meta_entities["metadata"]
    message = f"Retrieved {len(response_data)} indicators"
    body = {"success": True, "message": message, "data": response_data, "meta": meta}
    cache_set(cache_key, body)
    return success_response(
        message=message,
        data=response_data,
        meta=meta
    )


@router.get(
    "/association-count",
    summary="Association count for indicators",
    description=f"Return association counts ({ASSOC_DATA_COUNT}, {ASSOC_IUS_COUNT}) for the given indicators. Query param: identifier (comma-separated indicator_nid or indicator_gid). Used for delete confirmation; data rows and IUS (indicator-unit-subgroup) links for those indicators.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse or indicator not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def association_count_indicators(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: Optional[str] = Query(None, description="Comma-separated indicator identifiers (indicator_nid or indicator_gid)", alias=QUERY_IDENTIFIER),
):
    indicator_nids: List[int] = []
    if identifier:
        parts = [p.strip() for p in identifier.split(",") if p.strip()]
        for p in parts:
            nid = resolve_identifier_to_nid(
                p, lambda gid: indicator_service.get_indicator_nid_by_gid(dw_id, gid)
            )
            if nid is not None:
                indicator_nids.append(nid)
        if parts and not indicator_nids:
            raise not_found_for_identifier("Indicator", parts[0] if parts else identifier)
    data = indicator_service.get_association_counts(dw_id, indicator_nids)
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.get(
    "/validation-rules",
    summary="Get indicator validation rules",
    description=(
        "Fetch validation rules for one or more indicators. Query param **identifier**: "
        "comma-separated indicator_nid or indicator_gid. ENUM options include a `labels` map "
        "for all DW languages (ut_language). Intended for the 'Validation Rules' tab in the UI. "
        "Response **data** is always an object keyed by indicator_gid. "
        "When both **identifier** and **dataset_id** are supplied the results are the "
        "intersection — only indicators that belong to the dataset AND match the identifier."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Validation rules retrieved successfully", "model": SuccessResponse},
        404: {"description": "Indicator or warehouse not found", "model": ErrorResponse},
        501: {"description": "Not implemented", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_indicator_validation_rules(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: Optional[str] = Query(
        None,
        description="Comma-separated indicator identifiers (indicator_nid or indicator_gid)",
        alias=QUERY_IDENTIFIER,
    ),
    dataset_id: Optional[int] = Query(
        None,
        description="Dataset ID — returns validation rules for all indicators in the dataset",
    ),
    db: Session = Depends(get_db),
):
    dataset_gids: Optional[set] = None
    identifier_gids: Optional[set] = None

    if dataset_id is not None:
        dataset = db.query(Dataset).filter(
            Dataset.dataset_id == dataset_id,
            Dataset.dw_id == int(dw_id),
        ).first()
        if dataset is None:
            raise NotFound(f"Dataset {dataset_id} not found in warehouse {dw_id}")

        dataset_gids = set()
        for nid in [int(x) for x in (dataset.indicator_nids or []) if x is not None]:
            indicator_gid = validation_rule_service.get_indicator_gid_by_nid(dw_id, nid)
            if indicator_gid:
                dataset_gids.add(indicator_gid)

    if identifier:
        parts = [p.strip() for p in identifier.split(",") if p.strip()]
        identifier_gids = set()
        for p in parts:
            indicator_nid = resolve_identifier_to_nid(
                p,
                lambda gid: indicator_service.get_indicator_nid_by_gid(dw_id, gid),
            )
            if indicator_nid is None:
                raise not_found_for_identifier("Indicator", p)

            indicator_gid = validation_rule_service.get_indicator_gid_by_nid(dw_id, indicator_nid)
            if indicator_gid is None:
                raise not_found_for_identifier("Indicator", p)

            identifier_gids.add(indicator_gid)

    # Determine target GIDs: intersection when both params supplied, otherwise whichever was given
    if dataset_gids is not None and identifier_gids is not None:
        target_gids = dataset_gids & identifier_gids
    elif dataset_gids is not None:
        target_gids = dataset_gids
    elif identifier_gids is not None:
        target_gids = identifier_gids
    else:
        target_gids = set()

    by_gid: Dict[str, List[Dict[str, Any]]] = {
        gid: validation_rule_service.get_rules(dw_id, gid)
        for gid in target_gids
    }

    total_rules = sum(len(v) for v in by_gid.values())
    return success_response(
        message=(
            f"Retrieved validation rules for {len(by_gid)} indicator(s) "
            f"({total_rules} rule(s) total)"
        ),
        data=by_gid,
    )


@router.post(
    "/multiple-delete",
    summary="Delete multiple indicators",
    description="Delete multiple indicators by indicator_nid. Each item uses the same full cascade as DELETE /indicators/{identifier}. Partial success: successfully deleted NIDs are returned in data.deleted; failures in meta.errors.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Bulk delete completed (check meta.errors for partial failures)", "model": SuccessResponse},
        400: {"description": "Bad request", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def multiple_delete_indicators(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: IndicatorMultipleDeleteSchema = Body(..., description="Indicator NIDs to delete", alias=BODY_BODY),
    language_code: str = Depends(get_dw_language_code),
):
    nids = list(body.indicator_nid or [])
    if not nids:
        return success_response(
            message="No indicators to delete",
            data={"deleted": []},
        )
    result = indicator_service.multiple_delete_indicators(dw_id, nids, language_code)
    cache_delete_pattern("dw:indicators:*")
    errors = result.get("errors") or []
    meta = {"errors": errors} if errors else None
    deleted = result.get("deleted") or []
    message = f"{len(deleted)} indicator(s) deleted successfully"
    if errors:
        message += f", {len(errors)} failed"
    return success_response(
        message=message,
        data={"deleted": deleted},
        meta=meta,
    )


def _normalize_indicator_response_item(response_data: dict, subgroup: bool, _unit: bool) -> dict:
    """Apply same field omissions as single-indicator response (mt_rpt_nid/metadata). Unit is always included."""
    response_data.pop("mt_rpt_nid", None)
    response_data.pop("metadata", None)
    return response_data


def _meta_merge_into(target: dict, meta_entities: Optional[dict], subgroup: bool, unit: bool, ic: bool, metadata: bool) -> None:
    """Merge meta_entities from one indicator into target meta dict (same keys as list API)."""
    if not meta_entities:
        return
    if subgroup and meta_entities.get("sg"):
        target.setdefault(QUERY_SUBGROUP, {}).update(meta_entities["sg"])
    if unit and meta_entities.get("unit"):
        target.setdefault(QUERY_UNIT, {}).update(meta_entities["unit"])
    if ic and meta_entities.get("ic"):
        target.setdefault(QUERY_IC, {}).update(meta_entities["ic"])
    if metadata and meta_entities.get("metadata"):
        target.setdefault(QUERY_METADATA, {}).update(meta_entities["metadata"])


@router.get(
    f"/{{{PATH_IDENTIFIER}}}/subgroups",
    summary="Get subgroups for indicator(s)",
    description="Get indicators with full subgroup data (same function and response shape as GET /indicators with subgroup=true). Accepts one or more comma-separated indicator identifiers (NID or GID). Returns data (indicator list with unit_gid, s_gid) and meta.subgroup (subgroup entity map by GID).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroups retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse or indicator not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_indicator_subgroups(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Indicator identifier(s): one or more comma-separated NIDs or GIDs.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    """
    Get subgroups for one or more indicators. Uses the same logic and response structure
    as GET /dw/{dw_id}/indicators with subgroup=true and i_identifier filter.
    """
    parts = [p.strip() for p in identifier.split(",") if p.strip()]
    if not parts:
        raise BadRequest("At least one indicator identifier is required")
    resolved_nids: List[int] = []
    for p in parts:
        nid = resolve_identifier_to_nid(
            p, lambda gid: indicator_service.get_indicator_nid_by_gid(dw_id, gid)
        )
        if nid is None:
            raise not_found_for_identifier("Indicator", p)
        resolved_nids.append(nid)

    indicators, total_count, meta_entities, _total_count_unfiltered = indicator_service.get_all_indicators(
        dw_id,
        page=1,
        page_size=None,
        language_code=language_code,
        sort_order="asc",
        sort_field="i_order",
        give_ius=True,
        default_subgroup_only=False,
        give_iu_only=True,
        give_ic=False,
        give_metadata=False,
        search=None,
        indicator_nids=resolved_nids,
    )

    ser_mode = get_serialization_mode()
    dump_kwargs = {**ser_mode, "exclude_none": True}
    response_data = [
        _normalize_indicator_response_item(
            IndicatorResponseSchema.model_validate(ind).model_dump(**dump_kwargs),
            True,
            True,
        )
        for ind in indicators
    ]
    meta = {}
    if meta_entities and meta_entities.get("sg"):
        meta[QUERY_SUBGROUP] = meta_entities["sg"]
    if meta_entities and meta_entities.get("unit"):
        meta[QUERY_UNIT] = meta_entities["unit"]

    message = f"Retrieved subgroups for {len(response_data)} indicator(s)"
    return success_response(
        message=message,
        data=response_data,
        meta=meta if meta else None,
    )


@router.get(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Get Indicator by identifier",
    description="Get one or more indicators by identifier(s). **Identifier** is either a single value or comma-separated values; each value is the numeric primary key (indicator NID) or the alphanumeric GID (indicator_gid). Use query params subgroup, unit, ic, metadata to include Subgroup/unit/IC data and metadata (with GIDs and meta, same shape as list API). When multiple identifiers are given, response **data** is a list; when single, **data** is one object.",
    response_model=SuccessResponse
)
async def get_indicator_by_id(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Indicator identifier(s): one or more comma-separated NIDs or GIDs (e.g. 1,2,TEST_IND_001).", alias=PATH_IDENTIFIER),
    subgroup: bool = Query(False, description="Include full Subgroup data (unit_gid, s_gid per unit with sg_gid and default_sg_gid) and meta (unit, sg; ic only when present); unit and meta.unit are always included", alias=QUERY_SUBGROUP),
    subgroup_compute_formula: bool = Query(
        False,
        description="When subgroup=true and default_subgroup_only=false, add sg_gid_with_compute_formula (list of subgroup GIDs that have a compute formula target) under each unit in s_gid. Ignored if subgroup=false.",
        alias=QUERY_SUBGROUP_COMPUTE_FORMULA,
    ),
    default_subgroup_only: bool = Query(False, description="When subgroup=true, return only default subgroup id/gid (omit full subgroup list and ius_nid)", alias=QUERY_DEFAULT_SUBGROUP_ONLY),
    ic: bool = Query(False, description="Include Indicator Classification (ic_gid) and meta.ic", alias=QUERY_IC),
    metadata: bool = Query(False, description="Include metadata reports in the indicator response", alias=QUERY_METADATA),
    language_code: str = Depends(get_dw_language_code),
):
    """
    Get one or more indicators by ID with i18n support.
    Pass a single identifier (NID or GID) or comma-separated identifiers to fetch multiple indicators.
    When subgroup, unit, or ic is True, response includes GIDs (not NIDs) for relations and a meta object
    (same structure as GET /dw/{dw_id}/indicators) for this indicator's unit, sg, and ic when present.
    When default_subgroup_only=true and subgroup=true, s_gid contains only the default subgroup per unit.
    When subgroup_compute_formula=true (with subgroup=true, full subgroup map), each unit entry may include sg_gid_with_compute_formula.
    """
    ser_mode = get_serialization_mode()
    cache_key = (
        f"dw:indicators:id:v2:{dw_id}:{identifier}:{language_code}:"
        f"{subgroup}:{subgroup_compute_formula}:{default_subgroup_only}:{ic}:{metadata}:{ser_mode['by_alias']}"
    )
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    # Support multiple comma-separated identifiers
    parts = [p.strip() for p in identifier.split(",") if p.strip()]
    get_nid = lambda gid: indicator_service.get_indicator_nid_by_gid(dw_id, gid)
    indicator_nids: List[Optional[int]] = []
    for p in parts:
        nid = resolve_identifier_to_nid(p, get_nid)
        indicator_nids.append(nid)

    # Resolve (id_str -> nid) only for present nids to preserve order
    id_str_to_nid = [(parts[i], indicator_nids[i]) for i in range(len(parts)) if indicator_nids[i] is not None]
    if not id_str_to_nid:
        raise not_found_for_identifier("Indicator", parts[0] if parts else identifier)

    response_list: List[dict] = []
    meta_merged: dict = {}

    for id_str, indicator_nid in id_str_to_nid:
        indicator_data, meta_entities = indicator_service.get_indicator_by_id(
            dw_id,
            indicator_nid,
            language_code,
            give_ius=subgroup,
            default_subgroup_only=default_subgroup_only,
            give_iu_only=True,  # unit always included with indicator
            give_ic=ic,
            give_metadata=metadata,
            include_subgroup_compute_formula=bool(
                subgroup and subgroup_compute_formula and not default_subgroup_only
            ),
        )
        if not indicator_data:
            continue
        dump_kwargs = {**ser_mode, "exclude_none": True}
        response_data = IndicatorResponseSchema.model_validate(indicator_data).model_dump(**dump_kwargs)
        response_data = _normalize_indicator_response_item(response_data, subgroup, True)
        response_list.append(response_data)
        _meta_merge_into(meta_merged, meta_entities, subgroup, True, ic, metadata)

    if not response_list:
        raise not_found_for_identifier("Indicator", identifier)

    # Single identifier: return one object in data for backward compatibility
    if len(response_list) == 1 and len(parts) == 1:
        response_data = response_list[0]
        meta = None
        if meta_merged:
            meta = {}
            if subgroup and meta_merged.get(QUERY_SUBGROUP):
                meta[QUERY_SUBGROUP] = meta_merged[QUERY_SUBGROUP]
            if meta_merged.get(QUERY_UNIT):
                meta[QUERY_UNIT] = meta_merged[QUERY_UNIT]
            if ic and meta_merged.get(QUERY_IC):
                meta[QUERY_IC] = meta_merged[QUERY_IC]
            if metadata and meta_merged.get(QUERY_METADATA):
                meta[QUERY_METADATA] = meta_merged[QUERY_METADATA]
        body = {"success": True, "message": "Indicator retrieved successfully", "data": response_data}
        if meta is not None:
            body["meta"] = meta
        cache_set(cache_key, body)
        return success_response(
            message="Indicator retrieved successfully",
            data=response_data,
            meta=meta
        )

    # Multiple identifiers: return list in data
    meta = meta_merged if meta_merged else None
    body = {"success": True, "message": "Indicators retrieved successfully", "data": response_list}
    if meta is not None:
        body["meta"] = meta
    cache_set(cache_key, body)
    return success_response(
        message="Indicators retrieved successfully",
        data=response_list,
        meta=meta
    )


@router.patch(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Update Indicator by identifier",
    description="Partially update an existing indicator by identifier. **Identifier** is either the numeric primary key (indicator NID) or the alphanumeric GID (indicator_gid). Automatically detects numeric vs alphanumeric.",
    response_model=SuccessResponse
)
async def update_indicator_by_id(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Indicator identifier: numeric for NID (primary key), alphanumeric for GID (indicator_gid).", alias=PATH_IDENTIFIER),
    data: IndicatorUpdateSchema = Body(..., alias=BODY_DATA),
    language_code: str = Depends(get_dw_language_code)
):
    """
    Update an existing indicator by its ID with i18n support.
    Automatically detects whether the identifier is:
    - Numeric NID (e.g., "123")
    - Alphanumeric GID (e.g., "IND_LITERACY_001")
    
    Accepts both formats for field names in request body.
    Only provided fields will be updated.
    """
    indicator_nid = resolve_identifier_to_nid(
        identifier, lambda gid: indicator_service.get_indicator_nid_by_gid(dw_id, gid)
    )
    if indicator_nid is None:
        raise not_found_for_identifier("Indicator", identifier)
    identifier_type = "ID" if identifier.isdigit() else "GID"
    identifier_value = indicator_nid if identifier.isdigit() else identifier

    result = indicator_service.update_indicator(
        dw_id,
        indicator_nid,
        data,
        language_code
    )
    if not result:
        raise not_found_for_identifier("Indicator", identifier)

    ser_mode = get_serialization_mode()
    # Keys that were sent in the request body (same serialization as response)
    payload_keys = set(data.model_dump(exclude_unset=True, **ser_mode).keys())
    full_response = IndicatorResponseSchema.model_validate(result).model_dump(**ser_mode)
    # Return only the fields that were posted
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}

    cache_delete_pattern("dw:indicators:*")
    return success_response(
        message=f"Indicator '{identifier_value}' updated successfully",
        data=response_data
    )


@router.patch(
    f"/{{{PATH_IDENTIFIER}}}/validation-rules",
    summary="Upsert indicator validation rules",
    description=(
        "Create or update validation rules for an indicator (upsert). Used by the 'Save changes' "
        "action on the UI's Validation Rules tab. **unit_gids** must be non-null strings only; "
        "pass an empty list to delete all validation rules for the indicator. **identifier**: "
        "numeric → indicator_nid, alphanumeric → indicator_gid."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Validation rules upserted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid input", "model": ErrorResponse},
        404: {"description": "Indicator or warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation error", "model": ErrorResponse},
        501: {"description": "Not implemented", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def upsert_indicator_validation_rules(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(
        ...,
        description="Indicator identifier: numeric for NID (primary key), alphanumeric for GID (indicator_gid).",
        alias=PATH_IDENTIFIER,
    ),
    payload: ValidationRuleUpsertSchema = Body(...),
    language_code: str = Depends(get_dw_language_code),
    current_user_id: int = Depends(get_current_user_id),
):
    indicator_nid = resolve_identifier_to_nid(
        identifier,
        lambda gid: indicator_service.get_indicator_nid_by_gid(dw_id, gid),
    )
    if indicator_nid is None:
        raise not_found_for_identifier("Indicator", identifier)

    indicator_gid = validation_rule_service.get_indicator_gid_by_nid(dw_id, indicator_nid)
    if indicator_gid is None:
        raise not_found_for_identifier("Indicator", identifier)

    count = validation_rule_service.upsert_rules(
        dw_id=dw_id,
        indicator_gid=indicator_gid,
        payload=payload,
        user_id=current_user_id,
        language_code=language_code,
    )
    if not payload.unit_gids:
        return success_response(
            message=(
                f"All validation rules removed for indicator '{identifier}' "
                f"({count} rule(s) deleted)"
            ),
        )
    return success_response(
        message=f"Validation rules updated successfully ({count} rule(s) upserted)",
    )


@router.delete(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Delete Indicator by identifier",
    description="Delete an indicator by identifier with full cascade. **Identifier** is either the numeric primary key (indicator NID) or the alphanumeric GID (indicator_gid). Automatically detects numeric vs alphanumeric. **Cascade order**: ut_data (fact rows) → ut_ic_ius mappings → metadata/validation reports → IUS records → locale indicator records. Returns 204 No Content on success (no body).",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        204: {"description": "No Content - indicator deleted successfully"},
        404: {"description": "Indicator or warehouse not found", "model": ErrorResponse},
        409: {"description": "Conflict - indicator has associations", "model": ErrorResponse},
    },
)
async def delete_indicator_by_id(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Indicator identifier: numeric for NID (primary key), alphanumeric for GID (indicator_gid).", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    """
    Delete an indicator by its ID.
    Automatically detects whether the identifier is:
    - Numeric NID (e.g., "123")
    - Alphanumeric GID (e.g., "IND_LITERACY_001")
    
    The dw_id in the URL is used to retrieve database credentials.
    Performs cascade delete: ut_data, ut_ic_ius, metadata reports, IUS, then indicator.
    """
    indicator_nid = resolve_identifier_to_nid(
        identifier, lambda gid: indicator_service.get_indicator_nid_by_gid(dw_id, gid)
    )
    if indicator_nid is None:
        raise not_found_for_identifier("Indicator", identifier)
    identifier_gid = None if identifier.isdigit() else identifier
    identifier_type = "ID" if identifier.isdigit() else "GID"
    identifier_value = indicator_nid if identifier.isdigit() else identifier

    deleted = indicator_service.delete_indicator(dw_id, indicator_nid, language_code)

    if not deleted:
        raise not_found_for_identifier("Indicator", identifier)
    cache_delete_pattern("dw:indicators:*")
    return no_content_response()

