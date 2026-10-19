"""

Execution Logs Router — Data Warehouse.



Provides access to compute execution logs, job-level details, and progress tracking.

All routes live under /dw/{dw_id}/compute/logs/.



Route ordering: static segments (summary, search, process, time) are defined BEFORE

parameterized segments (/{process_time_log_id}) to prevent FastAPI from routing a literal string

like "summary" into the {process_time_log_id} path parameter.

"""



import csv
import io
import json
import logging

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import StreamingResponse

from sqlalchemy.orm import Session



from apps.shared.config.dependencies import get_db

from apps.shared.exceptions import UnprocessableEntity

from apps.shared.utils.response import (

    success_response

)

from apps.shared.schemas.response import SuccessResponse

from apps.datawarehouse.services.log_service import (
    LOG_DETAIL_SEARCH_BY_FIELDS,
    LOG_DETAIL_SORT_FIELDS,
    LogService,
    TIMEPERIOD_LIST_SEARCH_BY_FIELDS,
    TIMEPERIOD_LIST_SORT_FIELDS,
    TIME_LOG_SEARCH_BY_FIELDS,
    TIME_LOG_SORT_FIELDS,
    TIME_LOG_STATUS_FILTER_VALUES,
)

from apps.datawarehouse.constants import PATH_DW_ID
from apps.datawarehouse.db.datawarehouse import get_dw_language_code
from apps.datawarehouse.utils.export_utils import build_simple_xlsx

from .common_responses import COMMON_RESPONSES

_COMPUTE_LOG_DETAIL_COLS = [
    "Log Id",
    "Job type",
    "Indicator",
    "Unit",
    "Subgroup",
    "Area",
    "Time",
    "Source",
    "Data value",
    "Remarks",
]


def _as_display_text(value: object) -> str:
    if value is None:
        return "—"
    text = str(value).strip()
    return text or "—"


def _as_display_number(value: object) -> str:
    if value is None or value == "":
        return "—"
    try:
        return str(float(value)).rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return "—"


def _build_export_display_rows(rows: list[dict]) -> list[dict]:
    display_rows: list[dict] = []
    for row in rows:
        job_status = str(row.get("job_status") or "").upper()
        remarks = (
            str(row.get("remarks") or "").strip()
            or (
                str(row.get("error_message") or "").strip()
                if job_status == "FAILED"
                else ""
            )
            or "—"
        )
        display_rows.append({
            "Log Id": row.get("id", ""),
            "Job type": _as_display_text(row.get("process_type")),
            "Indicator": _as_display_text(row.get("target_iname")),
            "Unit": _as_display_text(row.get("target_uname")),
            "Subgroup": _as_display_text(row.get("target_sname")),
            "Area": _as_display_text(row.get("area_name") or row.get("area_id")),
            "Time": _as_display_text(row.get("time_period")),
            "Source": _as_display_text(row.get("source_name")),
            "Data value": _as_display_number(row.get("data_value")),
            "Remarks": remarks,
        })

        for src in row.get("source_details") or []:
            display_rows.append({
                "Log Id": "",
                "Job type": "Source detail",
                "Indicator": _as_display_text(src.get("iname")),
                "Unit": _as_display_text(src.get("uname")),
                "Subgroup": _as_display_text(src.get("sname")),
                "Area": _as_display_text(src.get("area")),
                "Time": _as_display_text(src.get("timeperiod")),
                "Source": _as_display_text(src.get("source")),
                "Data value": _as_display_number(src.get("dv")),
                "Remarks": "—",
            })
    return display_rows



logger = logging.getLogger(__name__)

router = APIRouter(

    prefix="/dw",

    tags=["Data Warehouse - Compute Logs"],

)



_VALID_JOB_STATUSES = ["PENDING", "PASSED", "FAILED"]





# ---------------------------------------------------------------------------

# Static sub-resources  (must be before /{process_time_log_id})

# ---------------------------------------------------------------------------



@router.get(

    "/{dw_id}/compute/logs/summary",

    include_in_schema=False,

    response_model=SuccessResponse,

    responses=COMMON_RESPONSES,

    summary="Get execution summary statistics",

    description=(

        "Returns aggregate statistics across all execution logs for the warehouse:\n\n"

        "- Total execution count\n"

        "- Per-status breakdown (PENDING, IN-PROGRESS, DONE, CANCELLED, DELETED)\n"

        "- Most recent execution entries\n\n"

        "Use this for the compute engine dashboard overview panel."

    ),

)

async def get_execution_summary(

    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),

    db: Session = Depends(get_db),

):

    service = LogService()

    result = service.get_execution_summary(dw_id)

    return success_response(

        message="Execution summary retrieved successfully",

        data={

            "summary_stats": {

                "status_counts": result["status_counts"],

                "total_executions": result["total_executions"],

            },

            "recent_executions": result["recent_executions"],

        },

    )





@router.get(

    "/{dw_id}/compute/logs/search",

    include_in_schema=False,

    response_model=SuccessResponse,

    responses=COMMON_RESPONSES,

    summary="Search execution logs",

    description=(

        "Full-text search across execution log names and remarks.\n\n"

        "Returns results matching the query string in either the log name "

        "or the remarks field, using `limit`/`offset` pagination over the "

        "underlying log query."

    ),

)

async def search_execution_logs(

    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),

    query: str = Query(..., description="Search term to match against log names and remarks"),

    limit: int = Query(50, ge=1, le=500, description="Maximum number of results to return"),

    offset: int = Query(0, ge=0, description="Number of results to skip (for pagination)"),

    db: Session = Depends(get_db),

):

    service = LogService()

    result = service.get_all_execution_logs(dw_id, limit, offset)



    filtered_logs = [

        log for log in result["logs"]

        if query.lower() in log["name"].lower()

        or (log.get("remarks") and query.lower() in log["remarks"].lower())

    ]

    return success_response(

        message="Execution log search completed",

        data={"logs": filtered_logs, "search_query": query},

        meta={

            "total_count": len(filtered_logs),

            "limit": limit,

            "offset": offset,

            "has_more": False,

        },

    )





@router.get(

    "/{dw_id}/compute/logs/process/{process_id}",

    response_model=SuccessResponse,

    responses=COMMON_RESPONSES,

    summary="Get process time periods",

    description=(

        "Returns one object per ``ce_process_time`` row (legacy process-time grid). "

        "``timeperiod_display`` is comma-joined ``timeperiods_name`` / ``timeperiodsName`` labels; "

        "when only one period was selected, the Time column shows that single label.\n\n"

        "**Query:** optional ``process_time_id`` filter; ``sort_field`` / ``sort_order``; "

        "``search`` with optional ``search_by`` (``timeperiod`` | ``timeperiod_name``).\n\n"

        "Execution history for a specific process time is available via "

        "``GET /dw/{dw_id}/compute/logs/time/{process_time_id}``. Job-level detail for a "

        "run is available via ``GET /dw/{dw_id}/compute/logs/{process_time_log_id}``."

    ),

)

async def get_process_timeperiods(

    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),

    process_id: int = Path(..., description="Process master ID whose time periods to list"),

    process_time_id: Optional[int] = Query(
        None,
        description="Return only rows for this ``ce_process_time.id`` (process time row)",
    ),

    sort_field: str = Query(
        "timeperiod",
        description=f"Sort field: {', '.join(sorted(TIMEPERIOD_LIST_SORT_FIELDS))}",
    ),

    sort_order: str = Query("asc", description="Sort direction: asc | desc"),

    search: Optional[str] = Query(None, description="Case-insensitive substring on timeperiod / timeperiod_name"),

    search_by: Optional[str] = Query(
        None,
        description=f"When set with search, restrict to one field: {', '.join(sorted(TIMEPERIOD_LIST_SEARCH_BY_FIELDS))}",
    ),

    db: Session = Depends(get_db),

):

    sf = sort_field.strip().lower()

    if sf not in TIMEPERIOD_LIST_SORT_FIELDS:

        raise UnprocessableEntity(

            'Invalid sort_field for process time periods',

            details={"sort_field": f"Must be one of: {sorted(TIMEPERIOD_LIST_SORT_FIELDS)}"},

        )

    so = sort_order.strip().lower()

    if so not in ("asc", "desc"):

        raise UnprocessableEntity(

            "Invalid sort_order",

            details={"sort_order": "Must be asc or desc"},

        )

    if search and search.strip() and search_by and search_by.strip():

        sb = search_by.strip().lower()

        if sb not in TIMEPERIOD_LIST_SEARCH_BY_FIELDS:

            raise UnprocessableEntity(

            'Invalid search_by for process time periods',

            details={"search_by": f"Must be one of: {sorted(TIMEPERIOD_LIST_SEARCH_BY_FIELDS)}"},

        )

    service = LogService()

    result = service.get_timeperiods_by_process(

        dw_id,

        process_id,

        process_time_id=process_time_id,

        sort_field=sf,

        sort_order=so,

        search=search,

        search_by=search_by,

    )

    timeperiods = result["timeperiods"]

    return success_response(

        message="Process time periods retrieved successfully",

        data={

            "process_id": process_id,

            "timeperiods": timeperiods,

        },

        meta={

            "total_count": len(timeperiods),

            "process_time_id_filter": process_time_id,

            "sort_field": sf,

            "sort_order": so,

            "search": search,

            "search_by": search_by.strip() if search_by and search_by.strip() else None,

        },

    )





@router.get(

    "/{dw_id}/compute/logs/time/{process_time_id}",

    response_model=SuccessResponse,

    responses=COMMON_RESPONSES,

    summary="Get logs by process time",

    description=(

        "Returns the execution log entries for a specific process-time entry.\n\n"

        "A process-time entry represents one combination of process + time-period selection. "

        "Use this to inspect the logs for a single scheduled or ad-hoc run.\n\n"

        "**Query:** optional ``status`` (log row: PENDING, IN-PROGRESS, DONE, CANCELLED, DELETED); "

        "``sort_field`` / ``sort_order``; ``search`` on execution ``name`` and ``remarks`` "

        "with optional ``search_by`` (``name`` | ``execution_name`` | ``remarks``)."

    ),

)

async def get_time_logs_by_process_time(

    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),

    process_time_id: int = Path(..., description="Process time ID whose logs to retrieve"),

    status: Optional[str] = Query(

        None,

        description="Filter by execution log status (PENDING, IN-PROGRESS, DONE, CANCELLED, DELETED)",

    ),

    sort_field: str = Query(

        "created_at",

        description=f"Sort field: {', '.join(sorted(TIME_LOG_SORT_FIELDS))}",

    ),

    sort_order: str = Query("desc", description="Sort direction: asc | desc"),

    search: Optional[str] = Query(None, description="Case-insensitive substring on name and remarks"),

    search_by: Optional[str] = Query(

        None,

        description=f"When set with search: {', '.join(sorted(TIME_LOG_SEARCH_BY_FIELDS))}",

    ),

    db: Session = Depends(get_db),

):

    if status and status.strip() and status.strip().upper() not in TIME_LOG_STATUS_FILTER_VALUES:

        raise UnprocessableEntity(

            'Invalid status filter for process time logs',

            details={"status": f"Must be one of: {sorted(TIME_LOG_STATUS_FILTER_VALUES)}"},

        )

    sf = sort_field.strip().lower()

    if sf not in TIME_LOG_SORT_FIELDS:

        raise UnprocessableEntity(

            'Invalid sort_field for process time logs',

            details={"sort_field": f"Must be one of: {sorted(TIME_LOG_SORT_FIELDS)}"},

        )

    so = sort_order.strip().lower()

    if so not in ("asc", "desc"):

        raise UnprocessableEntity(

            "Invalid sort_order",

            details={"sort_order": "Must be asc or desc"},

        )

    if search and search.strip() and search_by and search_by.strip():

        sb = search_by.strip().lower()

        if sb not in TIME_LOG_SEARCH_BY_FIELDS:

            raise UnprocessableEntity(

            'Invalid search_by for process time logs',

            details={"search_by": f"Must be one of: {sorted(TIME_LOG_SEARCH_BY_FIELDS)}"},

        )

    service = LogService()

    logs = service.get_time_logs_by_process_time(

        dw_id,

        process_time_id,

        status=status.strip().upper() if status and status.strip() else None,

        sort_field=sf,

        sort_order=so,

        search=search,

        search_by=search_by,

    )

    return success_response(

        message="Process time logs retrieved successfully",

        data={"process_time_id": process_time_id, "logs": logs},

        meta={

            "total_count": len(logs),

            "status_filter": status.strip().upper() if status and status.strip() else None,

            "sort_field": sf,

            "sort_order": so,

            "search": search,

            "search_by": search_by.strip() if search_by and search_by.strip() else None,

        },

    )





# ---------------------------------------------------------------------------

# Single-log endpoints  (parameterized — must be after static segments)

# ---------------------------------------------------------------------------



@router.get(

    "/{dw_id}/compute/logs/{process_time_log_id}",

    response_model=SuccessResponse,

    responses=COMMON_RESPONSES,

    summary="Get log details",

    description=(

        "Returns paginated job-level detail records for the specified execution log.\n\n"

        "Each detail record represents one atomic compute job: its IUS, area, time period, "

        "job status (PENDING, PASSED, FAILED), and any error message on failure.\n\n"

        "**Filters:** `status` — restrict detail records by job status (PENDING, PASSED, FAILED).\n\n"

        "**Sort:** `sort_field` (id | ius_gid | area_id | time_period | job_status) and `sort_order` (asc | desc). "

        "Default `sort_field=id`, `sort_order=asc`.\n\n"

        "**Search:** `search` matches ius_gid, area_id, time_period, or job_status (substring); "

        "optional `search_by` restricts to one of those fields.\n\n"

        "**Pagination:** use `limit` and `offset`."

    ),

)

async def get_log_details(

    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),

    process_time_log_id: int = Path(..., description="Process time log ID (ce_process_time_logs.id)"),

    limit: int = Query(100, ge=1, le=1000, description="Maximum number of detail records to return"),

    offset: int = Query(0, ge=0, description="Number of detail records to skip (for pagination)"),

    status: Optional[str] = Query(None, description="Filter detail records by job status: PENDING | PASSED | FAILED"),

    sort_field: str = Query(

        "id",

        description=f"Sort field: {', '.join(sorted(LOG_DETAIL_SORT_FIELDS))}",

    ),

    sort_order: str = Query("asc", description="Sort direction: asc | desc"),

    search: Optional[str] = Query(None, description="Substring match on IUS, area, time period, or job status"),

    search_by: Optional[str] = Query(

        None,

        description=f"When set with search: {', '.join(sorted(LOG_DETAIL_SEARCH_BY_FIELDS))}",

    ),

    db: Session = Depends(get_db),

    language_code: str = Depends(get_dw_language_code),

):

    if status and status not in _VALID_JOB_STATUSES:

        raise ValueError(f"Invalid job status. Must be one of: {_VALID_JOB_STATUSES}")

    sf = sort_field.strip().lower()

    if sf not in LOG_DETAIL_SORT_FIELDS:

        raise UnprocessableEntity(

            'Invalid sort_field for log details',

            details={"sort_field": f"Must be one of: {sorted(LOG_DETAIL_SORT_FIELDS)}"},

        )

    so = sort_order.strip().lower()

    if so not in ("asc", "desc"):

        raise UnprocessableEntity(

            "Invalid sort_order",

            details={"sort_order": "Must be asc or desc"},

        )

    if search and search.strip() and search_by and search_by.strip():

        sb = search_by.strip().lower()

        if sb not in LOG_DETAIL_SEARCH_BY_FIELDS:

            raise UnprocessableEntity(

            'Invalid search_by for log details',

            details={"search_by": f"Must be one of: {sorted(LOG_DETAIL_SEARCH_BY_FIELDS)}"},

        )

    service = LogService()

    result = service.get_log_details(

        dw_id,

        process_time_log_id,

        limit,

        offset,

        status,

        sort_field=sf,

        sort_order=so,

        search=search,

        search_by=search_by,

        language_code=language_code,

    )

    return success_response(

        message="Log details retrieved successfully",

        data={

            "log_info": result["log_info"],

            "details": result["details"],

            "status_filter": status,

            "sort_field": sf,

            "sort_order": so,

            "search": search,

            "search_by": search_by.strip() if search_by and search_by.strip() else None,

        },

        meta={

            "total_count": result["total_count"],

            "limit": result["limit"],

            "offset": result["offset"],

            "has_more": result["has_more"],

        },

    )





@router.post(

    "/{dw_id}/compute/logs/{process_time_log_id}/sync-progress",

    response_model=SuccessResponse,

    responses=COMMON_RESPONSES,

    summary="Sync log progress",

    description=(

        "Recounts job statuses from the detail table and updates the summary counters "

        "(total_jobs, total_executed, total_pending, total_failed, progress_percentage) "

        "on the log record.\n\n"

        "Call this after job workers report completion to keep the log summary consistent "

        "with the underlying job detail records."

    ),

)

async def sync_log_progress(

    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),

    process_time_log_id: int = Path(..., description="Process time log ID to sync"),

    db: Session = Depends(get_db),

):

    service = LogService()

    result = service.update_log_progress(dw_id, process_time_log_id)



    if result["success"]:

        return success_response(

            message="Log progress synced successfully",

            data={

                "log_id": result["log_id"],

                "status": result["status"],

                "total_jobs": result["total_jobs"],

                "total_executed": result["total_executed"],

                "total_pending": result["total_pending"],

                "total_failed": result["total_failed"],

                "progress_percentage": result["progress_percentage"],

            },

        )

    raise ValueError(result.get("error", "Failed to sync progress"))





@router.delete(

    "/{dw_id}/compute/logs/{process_time_log_id}",

    response_model=SuccessResponse,

    responses=COMMON_RESPONSES,

    summary="Delete execution log",

    description=(

        "Deletes the specified process-time execution log and drops its dynamic job-detail table "
        "(`ce_process_time_log_{id}_details`).\n\n"

        "Matches Laravel's `destroyProcessTimeLog` behaviour: the detail table is dropped first, "
        "then the log row is soft-deleted (`deleted_at` set). "
        "The log will no longer appear in active log listings."

    ),

)

async def delete_execution_log(

    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),

    process_time_log_id: int = Path(..., description="Process time log ID to delete"),

    db: Session = Depends(get_db),

):

    service = LogService()

    result = service.delete_process_time_log(dw_id, process_time_log_id)

    return success_response(

        message="Execution log deleted successfully",

        data={

            "log_id": result["log_id"],
            "detail_table_dropped": result["detail_table_dropped"],
            "status": "DELETED",

        },

    )





@router.get(
    "/{dw_id}/compute/logs/{process_time_log_id}/export",
    summary="Export log details",
    description=(
        "Downloads all job-level detail records for the specified execution log.\n\n"
        "**Formats:**\n"
        "- `xlsx` *(default)* — Excel workbook with bold headers and auto-sized columns.\n"
        "- `csv` — UTF-8 CSV file suitable for spreadsheet import.\n"
        "- `json` — JSON file with log metadata and a `records` array.\n\n"
        "No pagination limit applies; every row is included in the export."
    ),
    responses={
        200: {"description": "File download (xlsx / csv / json)"},
        **COMMON_RESPONSES,
    },
)
async def export_log_details(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_time_log_id: int = Path(..., description="Process time log ID to export"),
    format: str = Query("xlsx", description="Export format: xlsx | csv | json"),
    db: Session = Depends(get_db),
    language_code: str = Depends(get_dw_language_code),
):
    if format not in ("xlsx", "csv", "json"):
        raise UnprocessableEntity(

            'Invalid export format',

            details={"detail": "format must be one of: xlsx, csv, json"},

        )

    service = LogService()
    result = service.get_all_log_detail_rows(
        dw_id,
        process_time_log_id,
        language_code=language_code,
    )
    rows = result["rows"]
    display_rows = _build_export_display_rows(rows)
    log_info = result["log_info"]

    ts = datetime.utcnow().strftime("%Y-%m-%d-%H-%M-%S")
    base_name = f"COMPUTE_LOG_{process_time_log_id}_{ts}"

    if format == "xlsx":
        xlsx_rows = [
            [r.get(col) for col in _COMPUTE_LOG_DETAIL_COLS]
            for r in display_rows
        ]
        output = build_simple_xlsx(
            sheet_title="Compute Log Details",
            headers=_COMPUTE_LOG_DETAIL_COLS,
            rows=xlsx_rows,
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{base_name}.xlsx"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    if format == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=_COMPUTE_LOG_DETAIL_COLS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(display_rows)
        csv_bytes = buf.getvalue().encode("utf-8")
        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{base_name}.csv"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    # format == "json"
    payload = json.dumps(
        {
            "log_info": log_info,
            "export_timestamp": datetime.utcnow().isoformat(),
            "total_records": len(display_rows),
            "records": display_rows,
        },
        default=str,
        ensure_ascii=False,
        indent=2,
    ).encode("utf-8")
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{base_name}.json"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


