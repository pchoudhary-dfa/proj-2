"""
Data Management API: GET /dw/{dw_id}/data
Fetch ut_data rows with filters, optional meta enrichment, and pagination.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from apps.shared.config.dependencies import get_db

from apps.datawarehouse.schemas.data import DataRowResponseSchema, DataUpsertRequestSchema
from apps.datawarehouse.utils.export_utils import build_generic_export_xlsx, DATA_COLUMN_DEFS
from apps.datawarehouse.services.data_service import DataService
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.datawarehouse.utils.data_utils import update_ismrd_for_combination
from apps.datawarehouse.utils.ius_data_exist_utils import recompute_ius_data_exist_from_ut_data
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    QUERY_PAGE,
    QUERY_PAGE_SIZE,
    QUERY_IC_NID,
    QUERY_IC_GID,
    QUERY_TP_NID,
    QUERY_TP_TIMEPERIOD,
    QUERY_ISDEFAULTENABLED,
    QUERY_I_IDENTIFIER,
    QUERY_U_IDENTIFIER,
    QUERY_SG_IDENTIFIER,
    QUERY_IC_IDENTIFIER,
    QUERY_IUS_IDENTIFIER,
    QUERY_AR_IDENTIFIER,
    QUERY_I_NID,
    QUERY_U_NID,
    QUERY_SG_NID,
    QUERY_AR_NID,
    QUERY_SRC_IDENTIFIER,
    QUERY_INDICATOR,
    QUERY_UNIT,
    QUERY_SUBGROUP,
    QUERY_TIME_PERIOD,
    QUERY_AREA,
    QUERY_AREA_LEVEL,
    QUERY_IUS,
    QUERY_IC,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.shared.schemas.response import SuccessResponse, ErrorResponse
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.datawarehouse.db.datawarehouse import get_dw_language_code
from apps.shared.utils.response import (
    error_response,
    identifier_not_found_response,
    no_content_response,
    success_response,
    deleted_success_message,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Data"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/data")
_data_service = DataService()


@router.get(
    "",
    summary="Fetch data rows",
    description="""
Fetch data rows from ut_data with flexible filters and optional metadata in meta.

**Mandatory**: At least one indicator (`i_identifier`). With **isdefaultenabled** (default true):
when neither subgroup nor explicit **IUS** is given, restrict to default-subgroup IUS rows for the
indicator(s); if **unit** is also given, restrict those default rows to the given unit(s).
Set **isdefaultenabled** to false to return all subgroups for the chosen indicator (and unit, if any).
When **subgroup** or **IUS** is provided, **isdefaultenabled** is ignored (the slice is fully specified).

**Filters**: i_identifier, u_identifier, sg_identifier, ar_identifier, ius_identifier, src_identifier, tp_nid, tp_timeperiod.
`ius_identifier` accepts comma-separated IUS NIDs or composite GIDs in format i_gid<sep>u_gid<sep>s_gid (separator configurable via IUS_GID_SEPARATOR, default "|").

**Meta**: Set *_info=true to include entity maps in meta (i_info, u_info, sv_info, ius_info, ic_info, tp_info, ar_info, arl_info).

**Pagination**: page, limit. Locale: Accept-Language header (defaults to 'en').
    """,
    responses={
        200: {"description": "Data retrieved successfully", "model": SuccessResponse},
        400: {"description": "Mandatory parameter missing", "model": ErrorResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def get_data(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    i_identifier: Optional[str] = Query(default=None, description="Comma-separated Indicator identifiers (NIDs or GIDs).", alias=QUERY_I_IDENTIFIER),
    u_identifier: Optional[str] = Query(default=None, description="Comma-separated Unit identifiers (NIDs or GIDs).", alias=QUERY_U_IDENTIFIER),
    sg_identifier: Optional[str] = Query(default=None, description="Comma-separated Subgroup Value identifiers (NIDs or GIDs).", alias=QUERY_SG_IDENTIFIER),
    ar_identifier: Optional[str] = Query(default=None, description="Comma-separated Area identifiers (NIDs or area IDs).", alias=QUERY_AR_IDENTIFIER),
    tp_nid: Optional[list[str]] = Query(default=None, description="Time period NID(s)", alias=QUERY_TP_NID),
    tp_timeperiod: Optional[list[str]] = Query(default=None, description="Time period(s) e.g. 2025", alias=QUERY_TP_TIMEPERIOD),
    ius_identifier: Optional[str] = Query(default=None, description="Comma-separated IUS identifiers (NIDs or i_gid|u_gid|sg_gid values).", alias=QUERY_IUS_IDENTIFIER),
    src_identifier: Optional[str] = Query(default=None, description="Comma-separated Source (IC) identifiers (NIDs or GIDs) filtering by source_nid.", alias=QUERY_SRC_IDENTIFIER),
    i_info: bool = Query(False, description="Include indicator metadata in meta.i_info", alias=QUERY_INDICATOR),
    u_info: bool = Query(False, description="Include unit metadata in meta.u_info", alias=QUERY_UNIT),
    sv_info: bool = Query(False, description="Include subgroup value metadata in meta.sv_info", alias=QUERY_SUBGROUP),
    ius_info: bool = Query(False, description="Include IUS metadata in meta.ius_info", alias=QUERY_IUS),
    ic_info: bool = Query(False, description="Include IC metadata in meta.ic_info", alias=QUERY_IC),
    tp_info: bool = Query(False, description="Include time period metadata in meta.tp_info", alias=QUERY_TIME_PERIOD),
    ar_info: bool = Query(False, description="Include area metadata in meta.ar_info", alias=QUERY_AREA),
    arl_info: bool = Query(False, description="Include area level metadata in meta.arl_info", alias=QUERY_AREA_LEVEL),
    page: int = Query(1, ge=1, description="Page number (1-based)", alias=QUERY_PAGE),
    page_size: int = Query(100, ge=1, le=1000, description="Number of records per page", alias=QUERY_PAGE_SIZE),
    isdefaultenabled: bool = Query(
        True,
        description=(
            "If True (default): without sg_identifier/ius_identifier, resolve default-subgroup IUS "
            "for the indicator(s), optionally filtered by u_identifier. If False: all subgroups for "
            "that indicator (+ unit if given). Ignored when sg_identifier or ius_identifier is set."
        ),
        alias=QUERY_ISDEFAULTENABLED,
    ),
    export: bool = Query(False, description="Export as XLSX; disables pagination and forces all *_info flags", alias="export"),
    language_code: str = Depends(get_dw_language_code),
):

    if export:
        from apps.datawarehouse.db.datawarehouse import get_warehouse_credentials
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        data_rows, _meta = _data_service.get_data(
            dw_id,
            i_identifier=i_identifier,
            u_identifier=u_identifier,
            sg_identifier=sg_identifier,
            ar_identifier=ar_identifier,
            tp_nid=tp_nid,
            tp_timeperiod=tp_timeperiod,
            ius_identifier=ius_identifier,
            src_identifier=src_identifier,
            i_info=True,
            u_info=True,
            sv_info=True,
            ius_info=False,
            ic_info=False,
            tp_info=True,
            ar_info=True,
            arl_info=False,
            page=1,
            page_size=None,
            isdefaultenabled=isdefaultenabled,
            locale=language_code,
        )
        rows = [
            [row.get(col) for col in DATA_COLUMN_DEFS]
            for row in data_rows
        ]
        output, filename = build_generic_export_xlsx(
            "Data", DATA_COLUMN_DEFS, rows, language_code, db_display_name, "DATA"
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    data_rows, meta = _data_service.get_data(
        dw_id,
        i_identifier=i_identifier,
        u_identifier=u_identifier,
        sg_identifier=sg_identifier,
        ar_identifier=ar_identifier,
        tp_nid=tp_nid,
        tp_timeperiod=tp_timeperiod,
        ius_identifier=ius_identifier,
        src_identifier=src_identifier,
        i_info=i_info,
        u_info=u_info,
        sv_info=sv_info,
        ius_info=ius_info,
        ic_info=ic_info,
        tp_info=tp_info,
        ar_info=ar_info,
        arl_info=arl_info,
        page=page,
        page_size=page_size,
        isdefaultenabled=isdefaultenabled,
        locale=language_code,
    )
    ser_mode = get_serialization_mode()
    response_data = [
        DataRowResponseSchema.model_validate(row).model_dump(**ser_mode)
        for row in data_rows
    ]
    return success_response(
        message="Data retrieved successfully",
        data=response_data,
        meta=meta,
    )


@router.post(
    "",
    summary="Upsert data rows",
    description="""
Insert, update, or conditionally delete fact data rows in ut_data.

**Action**: always `"upsert"`.

**Identifier resolution**: for each row, provide either `*_nid` directly or the corresponding `*_gid` / `*_id`; NIDs take precedence.
Resolved identifiers: `i_nid`/`i_gid` (indicator), `u_nid`/`u_gid` (unit), `sg_nid`/`sg_gid` (subgroup value),
`tp_nid` (time period), `ar_nid`/`ar_id` (area), `fn_nid`/`fn_gid` (footnote), `ic_nid`/`ic_gid` (IC / source).

**Composite match key**: `(area_nid, indicator_nid, unit_nid, subgroup_val_nid, timeperiod_nid, source_nid)`.

**Operation logic**:
- Record exists + values provided → **UPDATE**
- Record does not exist → **INSERT**
- `fn_nid` absent AND `dt_value` blank AND `dt_text_value` blank → **DELETE** (if record exists)

**Transactions**: all-or-nothing. Any resolution failure (422) rolls back the entire batch.
    """,
    responses={
        200: {"description": "Upsert completed", "model": SuccessResponse},
        400: {"description": "Validation error (e.g. invalid action)", "model": ErrorResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        422: {"description": "Identifier resolution failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def upsert_data(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    body: DataUpsertRequestSchema = ...,
    language_code: str = Depends(get_dw_language_code),
):
    result = _data_service.upsert_data(dw_id, body.data, locale=language_code)
    errors = result.get("errors", [])
    total = result["inserted"] + result["updated"] + result["deleted"]
    response_data = {
        "inserted": result["inserted"],
        "updated": result["updated"],
        "deleted": result["deleted"],
    }
    meta = {"errors": errors} if errors else None
    message = f"Data upsert completed: {total} row(s) processed" + (f", {len(errors)} row(s) failed" if errors else "")
    return success_response(
        message=message,
        data=response_data,
        meta=meta,
    )


@router.delete(
    "",
    summary="Delete data rows",
    description="""
Delete ut_data rows matching the provided filter parameters.

At least one filter must be supplied (prevents accidental full-table wipes).
Each identifier parameter accepts either a NID (numeric string) or the corresponding GID / string ID where applicable.
All provided identifiers are validated for existence before deletion.

**Filter fields**: i_identifier, u_identifier, sg_identifier, ar_identifier (NID or area_id string), tp_nid, tp_timeperiod, ic_identifier.

Partial filters perform a bulk delete of all rows matching the given criteria.
    """,
    responses={
        200: {"description": "Data deleted successfully", "model": SuccessResponse},
        400: {"description": "No filter provided", "model": ErrorResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        422: {"description": "Identifier validation failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def delete_data(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    i_identifier: Optional[str] = Query(None, description="Indicator NID or GID", alias=QUERY_I_IDENTIFIER),
    u_identifier: Optional[str] = Query(None, description="Unit NID or GID", alias=QUERY_U_IDENTIFIER),
    sg_identifier: Optional[str] = Query(None, description="Subgroup value NID or GID", alias=QUERY_SG_IDENTIFIER),
    ar_identifier: Optional[str] = Query(None, description="Area NID or Area ID string", alias=QUERY_AR_IDENTIFIER),
    tp_nid: Optional[str] = Query(None, description="Time period NID", alias=QUERY_TP_NID),
    tp_timeperiod: Optional[str] = Query(None, description="Time period value e.g. 2025", alias=QUERY_TP_TIMEPERIOD),
    ic_identifier: Optional[str] = Query(None, description="IC/source NID or GID", alias=QUERY_IC_IDENTIFIER),
    language_code: str = Depends(get_dw_language_code),
):
    _data_service.delete_data(
        dw_id,
        i_identifier=i_identifier,
        u_identifier=u_identifier,
        sg_identifier=sg_identifier,
        ar_identifier=ar_identifier,
        tp_nid=tp_nid,
        tp_timeperiod=tp_timeperiod,
        ic_identifier=ic_identifier,
        locale=language_code,
    )
    return no_content_response()


@router.post(
    "/set-mrd",
    summary="Set ISMRD for data combinations",
    description="""
Set ismrd on ut_data per filter combination: 1 for the latest time period, 0 for others.

Optional dimension filters (indicator_nid, unit_nid, subgroup_val_nid, area_nid) can be
single values or lists; when lists are provided, the logic runs for each combination.
    """,
    responses={
        200: {"description": "ISMRD updated successfully", "model": SuccessResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def set_ismrd(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    indicator_nid: Optional[List[int]] = Query(None, description="Indicator NID(s); list runs logic per combination", alias=QUERY_I_NID),
    unit_nid: Optional[List[int]] = Query(None, description="Unit NID(s)", alias=QUERY_U_NID),
    subgroup_val_nid: Optional[List[int]] = Query(None, description="Subgroup value NID(s)", alias=QUERY_SG_NID),
    area_nid: Optional[List[int]] = Query(None, description="Area NID(s)", alias=QUERY_AR_NID),
):
    result = update_ismrd_for_combination(
        dw_id,
        indicator_nid=indicator_nid,
        unit_nid=unit_nid,
        subgroup_val_nid=subgroup_val_nid,
        area_nid=area_nid,
        core_db=db,
    )
    return success_response(
        message="ISMRD update completed",
        data=result,
    )


@router.post(
    "/set-ius-data-exist",
    summary="Set IUS and indicator data_exist from ut_data",
    description="""
Set ut_indicator_unit_subgroup.data_exist from actual ut_data rows (1 if at least one
data row exists for that iusnid, else 0). Then roll up ut_indicator.data_exist on every
locale table (1 when any IUS for that indicator has data_exist=true).

Optional filters limit which IUS rows are considered; missing dimensions mean all values
for that dimension. Indicator rollup respects the same perimeter (explicit indicator_nid
filter, or indicators touched by unit/subgroup filters; full warehouse when unfiltered).

May run synchronously or queue when the same thresholds as Set MRD apply
(IS_BACKGROUND_ENABLED, ISMRD_SYNC_MAX_COMBINATIONS, ISMRD_SYNC_MAX_IUS_ROWS).
Queued work follows BG_JOB_MQ_TYPE (Celery broker or App DB queue + in-process poller).
    """,
    responses={
        200: {"description": "Recompute completed or queued", "model": SuccessResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def recompute_ius_data_exist(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    indicator_nid: Optional[List[int]] = Query(
        None, description="Indicator NID(s); limits IUS perimeter", alias=QUERY_I_NID
    ),
    unit_nid: Optional[List[int]] = Query(
        None, description="Unit NID(s)", alias=QUERY_U_NID
    ),
    subgroup_val_nid: Optional[List[int]] = Query(
        None, description="Subgroup value NID(s)", alias=QUERY_SG_NID
    ),
):
    result = recompute_ius_data_exist_from_ut_data(
        dw_id,
        indicator_nid=indicator_nid,
        unit_nid=unit_nid,
        subgroup_val_nid=subgroup_val_nid,
        core_db=db,
    )
    return success_response(
        message="IUS, indicator, and area data_exist recompute completed",
        data=result,
    )
