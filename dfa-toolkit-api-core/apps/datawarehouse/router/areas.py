"""
Areas router – CRUD operations for areas, association-count, multiple-delete.
"""
import logging
from typing import List, Optional, Union

from fastapi import APIRouter, status, Path, Query, Body, HTTPException, Depends, File, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from apps.shared.exceptions import AppException, BadRequest, not_found_for_identifier
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.schemas.area import (
    AreaCreateSchema,
    AreaUpdateSchema,
    AreaResponseSchema,
    AreaMultipleDeleteSchema,
    AreaLevelResponseSchema,
)
from apps.datawarehouse.services.area import AreaService
from apps.datawarehouse.utils.export_utils import build_generic_export_xlsx, AREA_COLUMN_DEFS
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.datawarehouse.utils.response_filter import is_external_adaptation
from apps.datawarehouse.db.datawarehouse import (
    get_warehouse_credentials,
    validate_dw_id,
    WarehouseConnectionFailedError,
)
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import (
    success_response,
    created_response_data,
    no_content_response,
    deleted_success_message,
)
from apps.app_db.dependencies import get_app_key
from apps.datawarehouse.db.datawarehouse import get_dw_language_code
from apps.shared.config.dependencies import get_db, get_optional_user
from sqlalchemy.orm import Session as _AppSession
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.shared.utils.import_upload_limits import (
    ImportUploadTooLarge,
    get_allowed_import_file_size_bytes,
    import_upload_too_large_message,
    read_import_upload_bytes,
)
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
    QUERY_HIERARCHICAL,
    QUERY_LEVEL,
    QUERY_KEYWORD,
    ASSOC_CHILDREN_COUNT,
    ASSOC_DESCENDANTS_COUNT,
    ASSOC_DATA_COUNT,
    QUERY_IDENTIFIER,
    QUERY_IDENTIFIER_CHILDREN,
    QUERY_ARL_INFO,
    BODY_AREA_DATA,
    BODY_BODY,
    QUERY_SEARCH,
    QUERY_SORT_ORDER,
    QUERY_SORT_FIELD,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Areas"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/areas")
area_service = AreaService()



@router.get(
    "",
    summary="List All Areas",
    description=(
        "List areas for the data warehouse. Optional: level filter (ar_level), hierarchical=true for parent-child tree, "
        "keyword search (ar_id/ar_name/ar_gid). identifier=comma-separated area_id, area_nid, or area_gid: with "
        "identifier_children=true (default), return direct children only; false returns only those exact areas—prefer "
        "hierarchical=false when using exact match (see identifier_children). arl_info=true includes meta.arl_info. "
        "Sort: sort_order (asc/desc), sort_field (ar_nid, ar_name, ar_id, ar_gid, ar_level). Pagination: page (1-based), "
        "page_size; ignored when hierarchical=true. "
        "dashboard_id: when supplied with a Bearer JWT, each area gets a `selectable` boolean — false means the "
        "authenticated user has area ACL for this dashboard and this area is outside their allowlist."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Areas retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_all_areas(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    page: int = Query(1, ge=1, description="Page number (1-based); ignored when hierarchical=true", alias=QUERY_PAGE),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of records per page; omit for no pagination (all records); ignored when hierarchical=true", alias=QUERY_PAGE_SIZE),
    level: Optional[int] = Query(None, description="Filter by area level (ar_level). Omit for all levels.", alias=QUERY_LEVEL),
    hierarchical: bool = Query(False, description="If true, return hierarchical parent-child tree using ar_parent_nid. If false, flat paginated list.", alias=QUERY_HIERARCHICAL),
    search: Optional[str] = Query(None, description="Search on ar_id, ar_name, or ar_gid (case-insensitive).", alias=QUERY_SEARCH),
    identifier: Optional[str] = Query(None, description="Comma-separated area identifiers (area_id, area_nid, or area_gid). Scope controlled by identifier_children.", alias=QUERY_IDENTIFIER),
    identifier_children: bool = Query(True, description="When identifier is set: true=direct children of resolved areas only; false=only those exact areas (use with hierarchical=false for predictable results).", alias=QUERY_IDENTIFIER_CHILDREN),
    arl_info: bool = Query(False, description="If true, include area level metadata in meta.arl_info (schema keys: level_nid, area_level, area_level_name or external al_nid, al_level, al_name).", alias=QUERY_ARL_INFO),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc", alias=QUERY_SORT_ORDER),
    sort_field: Optional[str] = Query("ar_level", description="Sort field: ar_nid, ar_name, ar_id, ar_gid, ar_level", alias=QUERY_SORT_FIELD),
    export: bool = Query(False, description="Export as XLSX; disables pagination and forces area-level name lookup", alias="export"),
    dashboard_id: Optional[int] = Query(
        None,
        description=(
            "Edit-mode dashboard ID for viewer user area ACL. Must be mode=edit (not a publish copy). "
            "When set with a Bearer JWT, each returned area includes a `selectable` field: false when the user "
            "has area restrictions for this dashboard and this area is not in their allowlist. "
            "Omit (or send without JWT) to skip ACL annotation."
        ),
        alias="dashboard_id",
    ),
    language_code: str = Depends(get_dw_language_code),
    app_key: str = Depends(get_app_key),
    optional_user: Optional[dict] = Depends(get_optional_user),
    db: _AppSession = Depends(get_db),
):
    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        items, _total, meta_extra = area_service.get_all_areas(
            dw_id,
            language_code,
            level_nid=level,
            hierarchical=False,
            page=1,
            page_size=None,
            keyword=search,
            identifier=identifier,
            identifier_children=identifier_children,
            arl_info=True,
            sort_order=sort_order or "asc",
            sort_field=sort_field or "ar_level",
        )
        # Build area_level → area_level_name mapping from meta_extra
        level_name_map: dict = {}
        if meta_extra and QUERY_ARL_INFO in meta_extra:
            for arl in meta_extra[QUERY_ARL_INFO]:
                lvl = arl.get("area_level")
                if lvl is not None:
                    level_name_map[lvl] = arl.get("area_level_name") or f"Level {lvl}"
        rows = []
        for item in items:
            area_lvl = item.get("area_level")
            rows.append([
                item.get("area_nid"),
                item.get("area_id"),
                item.get("area_name"),
                item.get("area_gid"),
                area_lvl,
                item.get("area_parent_nid"),
                item.get("area_is_global"),
                item.get("area_has_data"),
                level_name_map.get(area_lvl) if area_lvl is not None else None,
            ])
        output, filename = build_generic_export_xlsx(
            "Areas", AREA_COLUMN_DEFS, rows, language_code, db_display_name, "AREAS"
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

    # Resolve user area ACL when dashboard_id is provided.
    # We skip the shared cache in this case because the response is user-specific.
    user_restricted_nids: Optional[set] = None

    if dashboard_id is not None:
        from apps.app_dashboard.services.user_area_service import (
            get_dashboard_restricted_nids_for_user,
            require_edit_dashboard_id,
        )
        require_edit_dashboard_id(db, dashboard_id)
        if optional_user and optional_user.get("sub") is not None:
            user_id_acl = int(optional_user["sub"])
            super_admin_keys = optional_user.get("super_admin_api_keys") or []
            is_super_admin_acl = app_key in super_admin_keys
            user_restricted_nids = get_dashboard_restricted_nids_for_user(
                db,
                user_id=user_id_acl,
                dashboard_id=dashboard_id,
                app_key=app_key,
                is_super_admin=is_super_admin_acl,
            )

    cache_key = f"dw:areas:list:{dw_id}:{language_code}:{level}:{hierarchical}:{page}:{effective_page_size}:{search}:{identifier}:{identifier_children}:{arl_info}:{sort_order or 'asc'}:{sort_field or 'ar_level'}"
    # Only use cache for non-user-scoped requests
    if user_restricted_nids is None and dashboard_id is None:
        cached = cache_get(cache_key)
        if cached is not None:
            return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    items, total_count, meta_extra, total_count_unfiltered_raw = area_service.get_all_areas(
        dw_id,
        language_code,
        level_nid=level,
        hierarchical=hierarchical,
        page=page,
        page_size=effective_page_size,
        keyword=search,
        identifier=identifier,
        identifier_children=identifier_children,
        arl_info=arl_info,
        sort_order=sort_order or "asc",
        sort_field=sort_field or "ar_level",
    )

    ser_mode = get_serialization_mode()
    list_exclude = {"ancestors"}  # ancestors only for single-area GET, not list

    from apps.app_dashboard.services.user_area_service import mark_area_item_selectable

    def _mark_selectable(item: dict) -> dict:
        """Set selectable on internal-keyed area dict before alias dump."""
        return mark_area_item_selectable(
            item,
            dashboard_scoped=dashboard_id is not None,
            restricted_nids=user_restricted_nids,
        )

    if hierarchical:
        def serialize_area_node(node):
            data = {k: v for k, v in node.items() if k != "children"}
            _mark_selectable(data)
            dumped = AreaResponseSchema.model_validate(data).model_dump(**ser_mode, exclude=list_exclude)
            dumped["children"] = [serialize_area_node(c) for c in node.get("children", [])]
            return dumped
        response_data = [serialize_area_node(item) for item in items]
    else:
        response_data = []
        for item in items:
            _mark_selectable(item)
            response_data.append(
                AreaResponseSchema.model_validate(item).model_dump(**ser_mode, exclude=list_exclude)
            )

    if effective_page_size is not None:
        total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        meta_page, meta_page_size = page, effective_page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, total_count
    has_list_filters = bool(
        (search and search.strip()) or (identifier and identifier.strip())
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
    if meta_extra:
        meta.update(meta_extra)
        if QUERY_ARL_INFO in meta:
            # Levels present in current page data (support both external ar_level and internal area_level)
            levels_in_data = {
                d.get("ar_level") or d.get("area_level")
                for d in response_data
                if (d.get("ar_level") is not None or d.get("area_level") is not None)
            }
            arl_dumped = [
                AreaLevelResponseSchema.model_validate(item).model_dump(**ser_mode)
                for item in meta[QUERY_ARL_INFO]
            ]
            # Only include arl_info for levels that appear in the current data
            meta[QUERY_ARL_INFO] = [
                item for item in arl_dumped
                if (item.get("al_level") or item.get("area_level")) in levels_in_data
            ]
    body = {
        "success": True,
        "message": "Areas retrieved successfully",
        "data": response_data,
        "meta": meta,
    }
    if dashboard_id is None:
        cache_set(cache_key, body)
    return success_response(
        message="Areas retrieved successfully",
        data=response_data,
        meta=meta,
    )




@router.get(
    "/association-count",
    summary="Association count for areas",
    description=f"Return association counts ({ASSOC_CHILDREN_COUNT}, {ASSOC_DESCENDANTS_COUNT}, {ASSOC_DATA_COUNT}) for the given areas. Query param: identifier (comma-separated ar_nid or ar_gid). Used for delete confirmation.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Association counts retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def association_count_areas(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: Optional[str] = Query(None, description="Comma-separated area identifiers (ar_nid or ar_gid)", alias=QUERY_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    identifiers: List[Union[int, str]] = []
    if identifier:
        parts = [p.strip() for p in identifier.split(",") if p.strip()]
        for p in parts:
            identifiers.append(int(p) if p.isdigit() else p)
    data = area_service.get_association_counts(dw_id, identifiers, language_code)
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.get(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Get Area Details",
    description="Get area by identifier (area_nid or area_gid) with ancestor chain. **Identifier**: numeric for area_nid (primary key), GUID for area_gid. Returns area_nid, area_id, area_name, area_level, ancestors (serialized as ar_* in external mode).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Area retrieved successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Area or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_area(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Area identifier: numeric for area_nid (primary key), GUID for area_gid.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    cache_key = f"dw:areas:id:{dw_id}:{identifier}:{language_code}"
    cached = cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached, status_code=status.HTTP_200_OK)

    item = area_service.get_area_by_identifier(dw_id, identifier, language_code)

    if not item:
        raise not_found_for_identifier("Area", identifier)
    
    # Transform to response format
    ser_mode = get_serialization_mode()
    response_data = AreaResponseSchema.model_validate(item).model_dump(**ser_mode)
    
    # Transform ancestors if present
    if "ancestors" in response_data and response_data["ancestors"]:
        response_data["ancestors"] = [
            AreaResponseSchema.model_validate(a).model_dump(**ser_mode) for a in item["ancestors"]
        ]

    body = {
        "success": True,
        "message": "Area retrieved successfully",
        "data": response_data,
    }
    cache_set(cache_key, body)
    return success_response(
        message="Area retrieved successfully",
        data=response_data,
    )


@router.post(
    "",
    summary="Create Areas (batch)",
    description="Create one or more areas. Request body is an array of area objects. **Required per item**: area_name, area_id. **Optional**: area_parent_nid (defaults to -1 root), block_nids, lat/long. Auto-generates area_gid if not provided. All-or-nothing transaction.",
    response_model=SuccessResponse,
    responses={
        201: {"description": "Area(s) created successfully", "model": SuccessResponse},
        400: {"description": "Bad request - empty array or invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation error - duplicate name or invalid data", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    status_code=status.HTTP_201_CREATED,
)
async def create_area(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    area_data: List[AreaCreateSchema] = Body(..., description="Array of area creation data", alias=BODY_AREA_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    if not area_data:
        raise BadRequest("Request body must be a non-empty array of area objects")
    result = area_service.create_areas_batch(dw_id, area_data, language_code)
    cache_delete_pattern("dw:areas:*")
    ser_mode = get_serialization_mode()
    response_data = []
    for created_area in result["created"]:
        item = AreaResponseSchema.model_validate(created_area).model_dump(**ser_mode)
        if "ancestors" in item and item["ancestors"]:
            item["ancestors"] = [
                AreaResponseSchema.model_validate(a).model_dump(**ser_mode) for a in created_area["ancestors"]
            ]
        response_data.append(item)

    nid_key = alias_field("ut_area", "area_nid") if ser_mode.get("by_alias") else "area_nid"
    gid_key = alias_field("ut_area", "area_gid") if ser_mode.get("by_alias") else "area_gid"
    data_out = created_response_data(response_data, nid_key, gid_key)

    count = len(response_data)
    errors = result.get("errors", [])
    message = f"{count} area(s) created successfully" + (f", {len(errors)} failed" if errors else "")
    meta: dict = {"count": count}
    if errors:
        meta["errors"] = errors
    return success_response(
        message=message,
        data=data_out,
        status_code=status.HTTP_201_CREATED,
        meta=meta,
    )


@router.post(
    "/import",
    summary="Import areas from XLSX",
    description=(
        "Upload an Excel file with the same columns as GET /areas?export=true (translated headers supported). "
        "**Accept-Language** selects which locale receives `area_name` on update (same semantics as PATCH); "
        "if omitted, uses the warehouse default language. New rows are written to all locale tables; "
        "the request locale gets the sheet name as-is, other locales get prefixed copies per `value_for_locale`. "
        "For matched **existing** areas, `area_gid` in the sheet is ignored (existing GID unchanged); inserts use sheet `area_gid` or generate when blank. "
        "Upserts in a single transaction; `area_level` in the sheet must match the level derived from `area_parent_nid`."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Import completed", "model": SuccessResponse},
        400: {
            "description": "Invalid Accept-Language or file/validation error",
            "model": ErrorResponse,
        },
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        413: {
            "description": "Uploaded file exceeds ALLOWED_IMPORT_FILE_SIZE_MB (MiB), or legacy ALLOWED_IMPORT_FILE_SIZE_BYTES if MB unset; tune via system_configuration / PATCH /app-config",
            "model": ErrorResponse,
        },
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def import_areas_xlsx(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    file: UploadFile = File(..., description="Areas XLSX (export layout)"),
    language_code: str = Depends(get_dw_language_code),
    app_key: str = Depends(get_app_key),
):
    try:
        content = await read_import_upload_bytes(
            file, get_allowed_import_file_size_bytes(app_key)
        )
    except ImportUploadTooLarge as e:
        raise AppException(
            import_upload_too_large_message(e.max_bytes),
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            error_code="IMPORT_FILE_TOO_LARGE",
        )
    result = area_service.import_areas_from_xlsx_bytes(
        dw_id, content or b"", language_code=language_code
    )
    cache_delete_pattern("dw:areas:*")
    meta = {"skipped_empty_rows": result.get("skipped_empty_rows", 0)}
    msg = (
        f"Areas import completed: {result.get('inserted', 0)} inserted, "
        f"{result.get('updated', 0)} updated"
    )
    if meta["skipped_empty_rows"]:
        msg += f", {meta['skipped_empty_rows']} empty row(s) skipped"
    return success_response(message=msg, data=result, meta=meta)


@router.patch(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Update Area",
    description="Update an existing area. **Identifier**: numeric for area_nid (primary key), GUID for area_gid. **Allowed updates**: area_name, area_id (must remain unique), area_parent_nid (affects derived level), block_nids, lat/long. Duplicate checks and unique area_id validation applied. Updates non-locale fields (area_id, area_parent_nid, area_level) in all locale tables. Updates locale-specific fields (area_name) only in specified language.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Area updated successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Area or warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation error - duplicate or invalid data", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_area(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Area identifier: numeric for area_nid (primary key), GUID for area_gid.", alias=PATH_IDENTIFIER),
    area_data: AreaUpdateSchema = Body(..., description="Area update data", alias=BODY_AREA_DATA),
    language_code: str = Depends(get_dw_language_code),
):
    updated_area = area_service.update_area(dw_id, identifier, area_data, language_code)

    ser_mode = get_serialization_mode()
    full_response = AreaResponseSchema.model_validate(updated_area).model_dump(**ser_mode)
    if "ancestors" in full_response and full_response["ancestors"]:
        full_response["ancestors"] = [
            AreaResponseSchema.model_validate(a).model_dump(**ser_mode) for a in updated_area["ancestors"]
        ]
    payload_keys = set(area_data.model_dump(exclude_unset=True, **ser_mode).keys())
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}

    return success_response(
        message="Area updated successfully",
        data=response_data,
    )


@router.delete(
    f"/{{{PATH_IDENTIFIER}}}",
    summary="Delete Area",
    description="Delete area with cascade. **Identifier**: numeric for area_nid (primary key), GUID for area_gid. **Deletion rules**: Deletes the area record, associated map records/layers/metadata (when layer is only used by that area), data rows for that area (ut_data by ar_nid), and recursively deletes all descendant areas (children). Returns counts of deleted items.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Area deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Area or warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_area(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Area identifier: numeric for area_nid (primary key), GUID for area_gid.", alias=PATH_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    area_service.delete_area(dw_id, identifier, language_code)
    cache_delete_pattern("dw:areas:*")
    return no_content_response()


@router.post(
    "/multiple-delete",
    summary="Delete multiple areas",
    description="Delete multiple areas by area GID list (ar_gid). Cascade: each area and its descendants, related metadata, and data rows. Returns deleted list and aggregated counts.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Areas deleted successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid language code", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def multiple_delete_areas(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: AreaMultipleDeleteSchema = Body(..., description="List of area GIDs to delete", alias=BODY_BODY),
    language_code: str = Depends(get_dw_language_code),
):
    ar_nids: List[int] = []
    resolve_errors = []
    for idx, gid in enumerate(body.ar_gid or []):
        nid = area_service.resolve_area_identifier_to_nid(dw_id, gid.strip())
        if nid is not None:
            ar_nids.append(nid)
        else:
            resolve_errors.append({"index": idx, "error": f"Area with identifier '{gid.strip()}' not found"})
    result = area_service.multiple_delete(dw_id, ar_nids, language_code)
    result = result if result is not None else {}
    cache_delete_pattern("dw:areas:*")
    all_errors = resolve_errors + result.get("errors", [])
    deleted = result.get("deleted", [])
    meta = {"errors": all_errors} if all_errors else None
    message = f"{len(deleted)} area(s) deleted successfully" + (f", {len(all_errors)} failed" if all_errors else "")
    return success_response(
        message=message,
        data={"deleted": deleted},
        meta=meta,
    )
