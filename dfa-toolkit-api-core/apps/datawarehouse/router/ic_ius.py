"""
IC–IUS export and import router.

Implements:
POST /dw/{dw_id}/ic-ius/export  -> XLSX attachment download
POST /dw/{dw_id}/ic-ius/import  -> XLSX or CSV upload (export-compatible layout)
"""

from fastapi import APIRouter, Depends, File, Path, UploadFile
from fastapi.responses import Response

from apps.datawarehouse.db.datawarehouse import (
    WarehouseConnectionFailedError,
    credentials_to_schema,
    get_dw_language_code,
    get_warehouse_credentials,
    get_warehouse_session,
    validate_dw_id,
)
from apps.datawarehouse.services.ic_ius import build_ic_ius_export_xlsx, import_ic_ius_from_file_bytes
from apps.datawarehouse.constants import PATH_DW_ID
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.exceptions import BadRequest, ServiceUnavailable
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.cache import cache_delete_pattern
from apps.shared.utils.response import success_response


router = APIRouter(
    tags=["Data Warehouse - IC IUS"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/ic-ius",
)


@router.post(
    "/export",
    summary="Export IC–IUS mappings",
    description=(
        "Export IC leaf nodes mapped to IUS (Indicator–Unit–Subgroup) as XLSX. "
        "Excludes IC type 'SR'. Returns the XLSX file as a direct download (no server-side file storage)."
    ),
    responses={
        200: {"description": "XLSX file as attachment"},
        400: {"description": "Bad request", "model": ErrorResponse},
        403: {"description": "Forbidden", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def export_ic_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
):
    cred = get_warehouse_credentials(dw_id)
    db_display_name = (cred.get("dw_connection_name") or cred.get("db_database") or dw_id)
    warehouse = credentials_to_schema(cred)
    with get_warehouse_session(warehouse) as dw_db:
        output, filename = build_ic_ius_export_xlsx(
            dw_db=dw_db,
            language_code=language_code,
            db_connection_display_name=db_display_name,
        )
    return Response(
        content=output.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post(
    "/import",
    summary="Import IC–IUS mappings from XLSX or CSV",
    description=(
        "Upload a file with the same columns as POST /ic-ius/export (translated headers supported). "
        "**Accept-Language** selects the locale used to match **Level** path segment names and to resolve "
        "indicator/unit/subgroup **GIDs** to IUS. "
        "Creates missing IC nodes along the path (each new node uses the row **ClassType** as `ic_type`). "
        "If **IndicatorGid**, **UnitGid**, and **SubgroupGid** are all empty, only the IC path is processed (no `ut_ic_ius` row). "
        "When all three GIDs are set, mappings attach only to **leaf** IC nodes (non-SR); rows that target a non-leaf IC are rejected. "
        "Trailing subgroup-dimension columns from export are ignored. "
        "Optional columns: `ic_ius_order`, `ic_ius_label`, `recommendedsource` (and aliases "
        "`ic_ius_is_recommended_source`, `recommended_source`) update `ut_ic_ius` when the mapping already exists."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Import completed", "model": SuccessResponse},
        400: {"description": "Invalid Accept-Language or file/validation error", "model": ErrorResponse},
        404: {"description": "Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
        503: {"description": "Warehouse unreachable", "model": ErrorResponse},
    },
)
async def import_ic_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    file: UploadFile = File(..., description="IC–IUS file (.xlsx or .csv, export layout)"),
    language_code: str = Depends(get_dw_language_code),
):
    try:
        content = await file.read()
        result = import_ic_ius_from_file_bytes(
            dw_id,
            content or b"",
            language_code=language_code,
            filename=file.filename,
            content_type=file.content_type,
        )
    except ValueError as e:
        raise BadRequest(str(e))
    except WarehouseConnectionFailedError as e:
        raise ServiceUnavailable(str(e), details={"warehouse_target": e.target})

    cache_delete_pattern("dw:indicator-classifications:*")
    cache_delete_pattern("dw:ic:*")
    meta = {"skipped_empty_rows": result.get("skipped_empty_rows", 0)}
    msg = (
        f"IC–IUS import completed: {result.get('ic_mappings_inserted', 0)} mapping(s) inserted, "
        f"{result.get('ic_mappings_updated', 0)} updated, {result.get('ic_nodes_created', 0)} IC node(s) created"
    )
    if meta["skipped_empty_rows"]:
        msg += f", {meta['skipped_empty_rows']} empty row(s) skipped"
    return success_response(message=msg, data=result, meta=meta)

