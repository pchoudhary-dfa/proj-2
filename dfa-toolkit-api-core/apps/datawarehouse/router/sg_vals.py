"""
Subgroups router (ut_subgroup_vals: subgroup by sv_nid/sv_gid).
- /dw/{dw_id}/subgroups: list subgroups; POST create subgroups (combinations).
- /dw/{dw_id}/subgroups/association-count: GET association counts for subgroups.
- /dw/{dw_id}/subgroups/multiple-delete: POST bulk delete by subgroup val GID list.
- /dw/{dw_id}/subgroups/{identifier}: GET/PATCH/DELETE subgroup by sv_nid or sv_gid.
Subgroup values (ut_subgroup) by n_id/g_id: GET/DELETE /dw/{dw_id}/sg-categories-values/{value_identifier}.
Create subgroup categories and values: POST /dw/{dw_id}/sg-categories.
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Path, Query, Body, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from apps.shared.exceptions import BadRequest, not_found_for_identifier
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.services.sg_vals import SgValsService, build_sg_vals_export_xlsx
from apps.datawarehouse.schemas.sg_vals import (
    SgValResponseSchema,
    SgValCreateSchema,
    SgValUpdateSchema,
    SgValMultipleDeleteSchema,
    SgCategoryMetaSchema,
    SgValDimensionItemSchema,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import (
    success_response,
    created_response,
    created_response_data,
    no_content_response,
)
from apps.datawarehouse.db.datawarehouse import get_dw_language_code, get_warehouse_credentials
from apps.shared.config.config import settings
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.shared.utils.validators import resolve_identifier_to_nid
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_INC_SUBGROUPS,
    QUERY_SCOPE,
    QUERY_IDENTIFIER,
    BODY_DATA,
    QUERY_SEARCH,
    QUERY_SORT_ORDER,
    QUERY_SORT_FIELD,
    ASSOC_DATA_COUNT,
    ASSOC_IUS_COUNT,
    BODY_BODY,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Subgroups"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/subgroups")
sg_vals_service = SgValsService()


def _build_sg_info_context_meta(items: list, ser_mode: dict) -> dict:
    """
    Extract unique subgroup categories and category values from raw service items
    and return two lookup dicts for inclusion in the response meta:
      - sg_categories: unique categories keyed by sg_cat_gid
      - sg_category_values: unique category values keyed by sg_val_gid (includes sg_cat_gid reference)
    """
    sg_categories: dict = {}
    sg_category_values: dict = {}

    for item in items:
        dimension = item.get(QUERY_INC_SUBGROUPS) or {}

        for _cat_name, val_data in dimension.items():
            sg_cat_gid = val_data.get("sg_cat_gid") or str(val_data.get("sg_cat_nid"))
            sg_val_gid = val_data.get("sg_val_gid") or str(val_data.get("sg_val_nid"))

            if sg_cat_gid not in sg_categories:
                sg_categories[sg_cat_gid] = SgCategoryMetaSchema.model_validate({
                    "sg_cat_nid": val_data["sg_cat_nid"],
                    "sg_cat_name": val_data.get("sg_cat_name"),
                    "sg_cat_gid": val_data.get("sg_cat_gid"),
                }).model_dump(**ser_mode)

            if sg_val_gid not in sg_category_values:
                sg_category_values[sg_val_gid] = SgValDimensionItemSchema.model_validate({
                    "sg_cat_nid": val_data["sg_cat_nid"],
                    "sg_cat_gid": val_data.get("sg_cat_gid"),
                    "sg_val_nid": val_data["sg_val_nid"],
                    "sg_val_name": val_data.get("sg_val_name"),
                    "sg_val_gid": val_data.get("sg_val_gid"),
                }).model_dump(**ser_mode)

    return {
        "sg_categories": sg_categories,
        "sg_category_values": sg_category_values,
    }


@router.get(
    "",
    summary="List Subgroups",
    description="List subgroups (ut_subgroup_vals) with pagination and enhanced search. Sort: sort_order (asc/desc), sort_field (sv_nid, sv_name, sv_gid, sv_order). Optional inc_subgroups=true to include composition. Optional scope: NO_DATA, NO_IUS. Search: requires search, search_by (subgroup/subgroup_category_val), search_field, optional category_val for category filtering. Pagination: page (1-based), page_size; response includes meta (page, page_size, total_count, total_pages).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroups retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code or scope", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_sg_vals(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records)", alias=QUERY_PAGE_SIZE),
    subgroup_info: bool = Query(False, description="Include composition (dimension keyed by category name) for each", alias=QUERY_INC_SUBGROUPS),
    search: Optional[str] = Query(None, description="Search term (requires search_by and search_field)", alias=QUERY_SEARCH),
    search_by: Optional[str] = Query(None, description="Search entity: 'subgroup' or 'subgroup_category_val'", alias="search_by"),
    search_field: Optional[str] = Query(None, description="Field to search in the chosen entity", alias="search_field"),
    category_val: Optional[str] = Query(None, description="Category filter for subgroup_category_val searches", alias="category_val"),
    scope: Optional[str] = Query(
        None,
        description="Scope filter: NO_DATA, NO_IUS. Omit for all.",
        alias=QUERY_SCOPE,
    ),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query("sv_order", description="Sort field: sv_nid, sv_name, sv_gid, sv_order", alias=QUERY_SORT_FIELD),
    export: bool = Query(False, description="Export as XLSX (pivoted grid: subgroup name + one column per category type); disables pagination", alias="export"),
    language_code: str = Depends(get_dw_language_code),
):
    if search is not None and search.strip():
        # If search is provided, require the new search parameters
        if search_by is None:
            raise BadRequest("search_by is required when using search parameter")
        
        if search_field is None:
            raise BadRequest("search_field is required when using search parameter")
        
        if search_by not in ("subgroup", "subgroup_category_val"):
            raise BadRequest("search_by must be one of: 'subgroup', 'subgroup_category_val'")
        
        # Validate search_field based on search_by
        if search_by == "subgroup":
            if search_field not in ("subgroup_val", "subgroup_val_gid"):
                raise BadRequest(
                    "For search_by='subgroup', search_field must be one of: 'subgroup_val', 'subgroup_val_gid'",
                )
        elif search_by == "subgroup_category_val":
            if search_field not in ("subgroup_name", "subgroup_gid"):
                raise BadRequest(
                    "For search_by='subgroup_category_val', search_field must be one of: 'subgroup_name', 'subgroup_gid'",
                )
    
    # Validate category_val usage
    if category_val is not None and search_by != "subgroup_category_val":
        raise BadRequest("category_val can only be used with search_by='subgroup_category_val'")

    if export:
        if scope is not None and scope not in ("NO_DATA", "NO_IUS"):
            raise BadRequest("scope must be one of: NO_DATA, NO_IUS")
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        output, filename = build_sg_vals_export_xlsx(
            dw_id,
            language_code=language_code,
            db_connection_display_name=db_display_name,
            sort_order=sort_order or "asc",
            sort_field=sort_field or "sv_order",
            search=search,
            search_by=search_by,
            search_field=search_field,
            category_val=category_val,
            scope=scope,
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    if scope is not None and scope not in ("NO_DATA", "NO_IUS"):
        raise BadRequest("scope must be one of: NO_DATA, NO_IUS")

    use_pagination = page_size is not None
    effective_page_size = (max(1, min(page_size or DEFAULT_PAGE_SIZE, 1000))) if use_pagination else None
    cache_key = f"dw:subgroups:list:{dw_id}:{language_code}:{subgroup_info}:{scope or ''}:{page}:{effective_page_size}:{search}:{search_by or ''}:{search_field or ''}:{category_val or ''}:{sort_order or 'asc'}:{sort_field or 'sv_order'}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items, total_count, total_count_unfiltered_raw = sg_vals_service.get_all_sg_vals(
        dw_id,
        language_code=language_code,
        inc_subgroups=subgroup_info,
        filter_type=scope,
        page=page,
        page_size=effective_page_size,
        search=search,
        search_by=search_by,
        search_field=search_field,
        category_val=category_val,
        sort_order=sort_order or "asc",
        sort_field=sort_field or "sv_order",
    )
    # Transform list with Pydantic serialization; inject sg_cat_val_gids per item when subgroup_info requested
    ser_mode = get_serialization_mode()
    response_data = []
    for item in items:
        serialized = SgValResponseSchema.model_validate(item).model_dump(**ser_mode, exclude={"subgroup_info"})
        if subgroup_info:
            dimension = item.get(QUERY_INC_SUBGROUPS) or {}
            serialized["sg_cat_val_gids"] = [
                val_data.get("sg_val_gid") or str(val_data.get("sg_val_nid"))
                for val_data in dimension.values()
                if val_data
            ]
        response_data.append(serialized)

    if effective_page_size is not None:
        total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        meta_page, meta_page_size = page, effective_page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, total_count
    has_list_filters = bool(
        (search and search.strip() and search_by and search_field)
        or scope in ("NO_IUS", "NO_DATA")
        or (category_val and category_val.strip())
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

    if subgroup_info:
        meta.update(_build_sg_info_context_meta(items, ser_mode))

    body = {
        "success": True,
        "message": "Subgroups retrieved successfully",
        "data": response_data,
        "meta": meta,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Subgroups retrieved successfully",
        data=response_data,
        meta=meta,
    )




def _invalidate_subgroups_cache(dw_id: str) -> None:
    """Invalidate all subgroup list/id cache keys for this dw."""
    cache_delete_pattern("dw:subgroups:*")


@router.post(
    "",
    summary="Create Subgroup(s)",
    description="Create one or more subgroups. Creates: (1) rows in ut_subgroup_vals_<locale> (all locales), (2) rows in ut_subgroup_vals_subgroup (subgroup_val_nid ↔ subgroup_nid). Body: sg_list with items { sg_cat_val_gids (required, list of subgroup GIDs in display order), optional sv_name, sv_gid, sv_order }. Subgroup name is built from category value names in sg_cat_val_gids order (space-separated); omit sv_name to use this. Subgroup categories and values must be created first via POST /dw/{dw_id}/sg-categories.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Subgroup(s) created successfully", "model": SuccessResponse},
        400: {"description": "Validation failed (e.g. unknown subgroup value n_id)", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation error", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_subgroup_combinations(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    data: SgValCreateSchema = Body(..., alias=BODY_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    """Create one or more subgroups (ut_subgroup_vals + ut_subgroup_vals_subgroup mapping)."""
    payload = [item.model_dump() for item in data.root]
    result = sg_vals_service.create_subgroup_combinations(
        dw_id,
        subgroup_list=payload,
        language_code=language_code,
    )
    _invalidate_subgroups_cache(dw_id)

    ser_mode = get_serialization_mode()
    response_data = [SgValResponseSchema.model_validate(c).model_dump(**ser_mode, exclude={"subgroup_info"}) for c in result["created"]]
    nid_key = alias_field("ut_subgroup_vals", "subgroup_val_nid") if ser_mode.get("by_alias") else "subgroup_val_nid"
    gid_key = alias_field("ut_subgroup_vals", "subgroup_val_gid") if ser_mode.get("by_alias") else "subgroup_val_gid"
    data_out = created_response_data(response_data, nid_key, gid_key)
    errors = result.get("errors", [])
    count = len(response_data)
    message = f"{count} subgroup(s) created successfully" + (f", {len(errors)} failed" if errors else "")
    meta = {"errors": errors} if errors else None
    return success_response(
        message=message,
        data=data_out,
        meta=meta,
        status_code=status.HTTP_201_CREATED,
    )


@router.get(
    "/association-count",
    summary="Association count for subgroups",
    description=f"Return association counts ({ASSOC_DATA_COUNT}, {ASSOC_IUS_COUNT}) for the given subgroups. Query param: identifier (comma-separated sv_nid or sv_gid). Used for delete confirmation; data rows and IUS (indicator-unit-subgroup) links for those subgroup vals.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        404: {"description": "Warehouse or subgroup not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def association_count_subgroups(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: Optional[str] = Query(None, description="Comma-separated subgroup identifiers (sv_nid or sv_gid)", alias=QUERY_IDENTIFIER),
):
    subgroup_val_nids: List[int] = []
    if identifier:
        parts = [p.strip() for p in identifier.split(",") if p.strip()]
        for p in parts:
            nid = resolve_identifier_to_nid(
                p, lambda gid: sg_vals_service.get_sg_val_nid_by_gid(dw_id, gid)
            )
            if nid is not None:
                subgroup_val_nids.append(nid)
        if parts and not subgroup_val_nids:
            raise not_found_for_identifier("Subgroup", identifier)
    data = sg_vals_service.get_association_counts(dw_id, subgroup_val_nids)
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.post(
    "/multiple-delete",
    summary="Delete multiple subgroups",
    description="Delete multiple subgroups by subgroup val GID list. Partial success: per-GID resolution errors use body indices; per-nid failures use indices into the resolved nid list. Cascade: ut_data → ut_ic_ius → metadata reports → IUS → ut_subgroup_vals_subgroup → locale ut_subgroup_vals. Returns deleted subgroup_val_nids and optional meta.errors.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroups deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def multiple_delete_subgroups(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: SgValMultipleDeleteSchema = Body(
        ..., description="List of subgroup val GIDs to delete", alias=BODY_BODY
    ),
    language_code: str = Depends(get_dw_language_code),
):
    subgroup_val_nids: List[int] = []
    resolve_errors = []
    for idx, gid in enumerate(body.subgroup_val_gid or []):
        nid = sg_vals_service.get_sg_val_nid_by_gid(dw_id, gid.strip())
        if nid is not None:
            subgroup_val_nids.append(nid)
        else:
            resolve_errors.append(
                {"index": idx, "error": f"Subgroup with gid '{gid.strip()}' not found"}
            )
    result = sg_vals_service.multiple_delete(dw_id, subgroup_val_nids, language_code)
    result = result if result is not None else {}
    _invalidate_subgroups_cache(dw_id)
    all_errors = resolve_errors + result.get("errors", [])
    meta = {"errors": all_errors} if all_errors else None
    deleted = result.get("deleted", [])
    message = f"{len(deleted)} subgroup(s) deleted successfully" + (
        f", {len(all_errors)} failed" if all_errors else ""
    )
    return success_response(
        message=message,
        data={"deleted": deleted},
        meta=meta,
    )

@router.get(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Get Subgroup by identifier",
    description="Get one subgroup by identifier. Uses **ut_subgroup_vals_<locale>**. **Identifier** is the numeric sv_nid (subgroup_val_nid) or alphanumeric sv_gid (subgroup_val_gid). Returns sv_nid, sv_gid, sv_name, sv_order; optional composition (dimension) when inc_subgroups=true.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroup retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Subgroup or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_subgroup_by_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Subgroup identifier: numeric for sv_nid (subgroup_val_nid), non-numeric for sv_gid (subgroup_val_gid).", alias=PATH_IDENTIFIER),
    subgroup_info: bool = Query(True, description="Include composition (dimension keyed by category name)", alias=QUERY_INC_SUBGROUPS),
    language_code: str = Depends(get_dw_language_code),
):
    """Get one subgroup (ut_subgroup_vals) by sv_nid or sv_gid."""
    cache_key = f"dw:subgroups:id:{dw_id}:{identifier}:{language_code}:{subgroup_info}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    item = sg_vals_service.get_sg_val_by_identifier(
        dw_id,
        identifier=identifier,
        language_code=language_code,
        inc_subgroups=subgroup_info,
    )

    if not item:
        raise not_found_for_identifier("Subgroup", identifier)

    ser_mode = get_serialization_mode()
    response_data = SgValResponseSchema.model_validate(item).model_dump(**ser_mode, exclude={"subgroup_info"})
    meta = _build_sg_info_context_meta([item], ser_mode) if subgroup_info else None
    body = {
        "success": True,
        "message": "Subgroup retrieved successfully",
        "data": response_data,
    }
    if meta is not None:
        body["meta"] = meta
    cache_set(cache_key, body)
    return success_response(
        message="Subgroup retrieved successfully",
        data=response_data,
        meta=meta,
    )


@router.patch(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Update Subgroup by identifier",
    description="Partial update for one subgroup combination (**ut_subgroup_vals**). **Identifier**: numeric sv_nid (subgroup_val_nid) or alphanumeric sv_gid (subgroup_val_gid). Accepts sv_name, sv_gid, sv_order, sv_global, and optional **sg_cat_val_gids** (or internal ut_subgroup_vals field names). When **sg_cat_val_gids** is sent, replaces rows in **ut_subgroup_vals_subgroup** and rebuilds the display name from category value names in list order (overrides sv_name if both are sent).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroup updated successfully", "model": SuccessResponse},
        403: {"description": "System subgroup cannot be updated", "model": ErrorResponse},
        400: {"description": "Validation failed (e.g. duplicate combination, empty sg_cat_val_gids)", "model": ErrorResponse},
        404: {"description": "Subgroup, category value GID, or warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_subgroup_by_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Subgroup identifier: numeric sv_nid or alphanumeric sv_gid.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
    data: SgValUpdateSchema = Body(..., description="Fields to update (at least one required)"),
):
    """PATCH one subgroup combination (display name, gid, order, global flag, optional composition via sg_cat_val_gids)."""
    result = sg_vals_service.update_sg_val(
        dw_id, identifier, data, language_code=language_code
    )
    if result is None:
        raise not_found_for_identifier("Subgroup", identifier)

    _invalidate_subgroups_cache(dw_id)
    cache_delete_pattern("dw:sg-categories-values:*")

    ser_mode = get_serialization_mode()
    payload_keys = set(data.model_dump(exclude_unset=True, **ser_mode).keys())
    full_response = SgValResponseSchema.model_validate(result).model_dump(
        **ser_mode, exclude={"subgroup_info"}
    )
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}
    if data.sg_cat_val_gids is not None:
        name_key = (
            alias_field("ut_subgroup_vals", "subgroup_val")
            if ser_mode.get("by_alias")
            else "subgroup_val"
        )
        if name_key in full_response:
            response_data[name_key] = full_response[name_key]
        if result.get("sg_cat_val_gids") is not None:
            response_data["sg_cat_val_gids"] = result["sg_cat_val_gids"]
    return success_response(
        message="Subgroup updated successfully",
        data=response_data,
    )


@router.delete(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Delete Subgroup by identifier",
    description="Delete a subgroup by identifier. Uses **ut_subgroup_vals_<locale>**. **Identifier** is sv_nid (subgroup_val_nid) or sv_gid (subgroup_val_gid). Cascade: ut_data → ut_ic_ius → metadata → IUS → ut_subgroup_vals_subgroup → locale subgroup vals.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Subgroup deleted successfully", "model": SuccessResponse},
        403: {"description": "System subgroup cannot be deleted via API", "model": ErrorResponse},
        404: {"description": "Subgroup or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_subgroup_by_identifier(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Subgroup identifier: numeric for sv_nid, alphanumeric for sv_gid.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    """Delete a subgroup by sv_nid or sv_gid with full cascade."""
    if identifier.isdigit():
        subgroup_val_nid = int(identifier)
    else:
        subgroup_val_nid = sg_vals_service.get_sg_val_nid_by_gid(dw_id, identifier)
        if subgroup_val_nid is None:
            raise not_found_for_identifier("Subgroup", identifier)

    deleted = sg_vals_service.delete_sg_val(dw_id, subgroup_val_nid, language_code)
    if not deleted:
        raise not_found_for_identifier("Subgroup", identifier)
    cache_delete_pattern("dw:subgroups:*")
    return no_content_response()
