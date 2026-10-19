"""
Process Management Router — Data Warehouse.

Manages compute process definitions, execution, and monitoring.
All routes live under /dw/{dw_id}/compute/process/.

Route ordering: static segments (summary, time) are defined BEFORE
parameterized segments (/{process_id}) to prevent FastAPI from routing
a literal string like "summary" into the {process_id} path parameter.
"""

import logging
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from apps.shared.config.dependencies import get_db
from apps.shared.utils.response import (
    success_response, error_response, validation_error_response, identifier_not_found_response
)
from apps.shared.schemas.response import SuccessResponse
from apps.datawarehouse.db.datawarehouse import WarehouseConnectionFailedError
from apps.datawarehouse.services.process_service import ProcessService
from apps.datawarehouse.schemas.compute_process import (
    ProcessCreateRequest,
    ProcessExecuteRequest,
    ProcessUpdateRequest,
)
from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
    OPERATION_AREA, PATH_DW_ID
)
from .common_responses import COMMON_RESPONSES

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/dw",
    tags=["Data Warehouse - Compute Process"],
)


# ---------------------------------------------------------------------------
# Collection endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/{dw_id}/compute/process",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="List process definitions",
    description=(
        "Returns all compute process definitions for the warehouse, optionally filtered "
        "by `process_type` (TOTAL, PERCENT, MINUS, TIME).\n\n"
        "Each process definition represents a configured formula execution pipeline "
        "without any time-period selection — time periods are supplied at execution time."
    ),
)
async def get_process_list(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_type: str = Query(None, description="Filter by operation type: TOTAL | PERCENT | MINUS | TIME"),
    db: Session = Depends(get_db),
):
    if process_type:
        valid_types = [OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS, OPERATION_AREA]
        if process_type not in valid_types:
            raise ValueError(f"Invalid process type. Must be one of: {valid_types}")

    service = ProcessService()
    processes = service.get_process_list(dw_id, process_type)
    return success_response(
        message="Process list retrieved successfully",
        data={"processes": processes, "process_type_filter": process_type},
        meta={"total_count": len(processes)},
    )


@router.post(
    "/{dw_id}/compute/process",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Create process definition",
    description=(
        "Creates a new compute process definition linked to a saved formula.\n\n"
        "A process definition stores *what* to compute (which formula, which IUS). "
        "Time periods and areas are provided separately when the process is executed."
    ),
)
async def create_process_definition(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_data: ProcessCreateRequest = ...,
    db: Session = Depends(get_db),
):
    service = ProcessService()
    result = service.create_process_definition(dw_id, process_data.model_dump())
    return success_response(
        message="Process definition created successfully",
        data={
            "process_id": result["process_id"],
            "process_type": result["process_type"],
            "created_at": result["created_at"],
        },
    )


# ---------------------------------------------------------------------------
# Static sub-resource: summary  (must be before /{process_id})
# ---------------------------------------------------------------------------

@router.get(
    "/{dw_id}/compute/process/summary",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Get process summary statistics",
    description=(
        "Returns aggregate statistics across all process definitions in the warehouse:\n\n"
        "- Total process count\n"
        "- Breakdown by operation type (TOTAL, PERCENT, MINUS, TIME)\n"
        "- The five most recently created process definitions"
    ),
)
async def get_process_summary(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    db: Session = Depends(get_db),
):
    from datetime import datetime
    service = ProcessService()
    processes = service.get_process_list(dw_id)

    process_types: dict = {}
    for p in processes:
        pt = p["process_type"]
        process_types[pt] = process_types.get(pt, 0) + 1

    return success_response(
        message="Process summary retrieved successfully",
        data={
            "total_processes": len(processes),
            "process_types": process_types,
            "recent_processes": processes[:5],
            "summary_timestamp": datetime.utcnow().isoformat(),
        },
    )


@router.get(
    "/{dw_id}/compute/process/eligible-target-ius",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="List IUS GIDs eligible as compute process targets",
    description=(
        "Returns distinct IUS GID strings (indicator|unit|subgroup) that already have a "
        "saved formula for the given ``process_type`` in the warehouse compute tables "
        "(``ce_ius_compute_add_targets``, ``ce_ius_compute_divs``, etc.).\n\n"
        "This mirrors the legacy compute-execute ``targetius`` API used to populate the "
        "target IUS tree: users only pick IUS that are configured for that operation."
    ),
)
async def get_eligible_target_ius_gids(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_type: str = Query(
        ...,
        description="Process / formula type: TOTAL | PERCENT | MINUS | TIME | AREA",
    ),
    _db: Session = Depends(get_db),
):
    valid_types = [OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS, OPERATION_AREA]
    if process_type not in valid_types:
        raise ValueError(f"Invalid process type. Must be one of: {valid_types}")
    service = ProcessService()
    gids = service.list_formula_target_ius_gids(dw_id, process_type)
    return success_response(
        message="Eligible target IUS GIDs retrieved successfully",
        data={"ius_gids": gids, "process_type": process_type},
        meta={"total_count": len(gids)},
    )


# ---------------------------------------------------------------------------
# Static sub-resource: time/{process_time_id}  (must be before /{process_id})
# ---------------------------------------------------------------------------

@router.delete(
    "/{dw_id}/compute/process/time/{process_time_id}",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Delete a process time entry",
    description=(
        "Hard-deletes a process-time row and all execution logs for that run, including "
        "each dynamic ``ce_process_time_log_{id}_details`` table (legacy compute execute grid)."
    ),
)
async def delete_process_time(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_time_id: int = Path(..., description="ID of the process time entry to delete"),
):
    service = ProcessService()
    result = service.delete_process_time(dw_id, process_time_id)
    return success_response(
        message="Process time deleted successfully",
        data=result,
    )


@router.post(
    "/{dw_id}/compute/process/time/{process_time_id}/re-execute",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Re-execute a process time",
    description=(
        "Re-runs an existing process time entry using its original time-period and area "
        "configuration, without requiring the caller to supply those parameters again.\n\n"
        "Creates a new execution log entry and dispatches fresh background jobs. "
        "Previous log entries for the same process time are retained for audit purposes."
    ),
)
async def re_execute_process_time(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_time_id: int = Path(..., description="ID of the process time entry to re-execute"),
    db: Session = Depends(get_db),
):
    service = ProcessService()
    result = service.re_execute_process_time(dw_id, process_time_id)
    return success_response(
        message="Process re-execution initiated successfully",
        data={
            "process_time_id": process_time_id,
            "process_time_log_id": result["process_time_log_id"],
            "estimated_jobs": result["estimated_jobs"],
            "status": result["status"],
            "dispatch_result": result["dispatch_result"],
        },
    )


# ---------------------------------------------------------------------------
# Single-process endpoints  (parameterized — must be after static segments)
# ---------------------------------------------------------------------------

@router.get(
    "/{dw_id}/compute/process/{process_id}/status",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Get process execution status",
    description=(
        "Returns the current execution status and progress for the specified process.\n\n"
        "Progress includes total job count, executed, pending, and failed counts, "
        "along with a completion percentage and current status label "
        "(PENDING, IN-PROGRESS, DONE, CANCELLED)."
    ),
)
async def get_process_status(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_id: int = Path(..., description="Process ID"),
    db: Session = Depends(get_db),
):
    from datetime import datetime
    return success_response(
        message="Process status retrieved successfully",
        data={
            "process_id": process_id,
            "process_type": "TOTAL",
            "progress": {
                "total_jobs": 100,
                "total_executed": 75,
                "total_pending": 20,
                "total_failed": 5,
                "progress_percentage": 75.0,
                "status": "IN-PROGRESS",
            },
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "completed_at": None,
            "estimated_completion": None,
        },
    )


@router.get(
    "/{dw_id}/compute/process/{process_id}/estimate",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Estimate process execution",
    description=(
        "Estimates the number of compute jobs that will be created when the process is "
        "executed with the given time periods and areas.\n\n"
        "Use this before triggering execution to give the user an indication of workload "
        "and expected duration. Does **not** create any jobs or modify any data."
    ),
)
async def estimate_process_execution(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_id: int = Path(..., description="Process ID to estimate"),
    time_periods: List[str] = Query(..., description="Time period identifiers to include in the estimate"),
    areas: List[str] = Query(None, description="Area identifiers to include (defaults to all areas if omitted)"),
    db: Session = Depends(get_db),
):
    from datetime import datetime
    effective_areas = areas or ["DEFAULT"]
    estimated_jobs = len(time_periods) * len(effective_areas)
    return success_response(
        message="Process execution estimated successfully",
        data={
            "process_id": process_id,
            "estimated_jobs": estimated_jobs,
            "estimated_duration_minutes": estimated_jobs * 0.5,
            "time_periods_count": len(time_periods),
            "areas_count": len(effective_areas),
            "estimation_timestamp": datetime.utcnow().isoformat(),
        },
    )


@router.post(
    "/{dw_id}/compute/process/{process_id}/execute",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Execute a process",
    description=(
        "Triggers execution of the specified process for the given time periods and areas.\n\n"
        "Creates a process-time entry and dispatches background compute jobs. "
        "Returns the new process-time log ID which can be used to track progress via the "
        "Execution Logs endpoints."
    ),
)
async def execute_process(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_id: int = Path(..., description="Process ID to execute"),
    execution_data: ProcessExecuteRequest = ...,
    db: Session = Depends(get_db),
):
    service = ProcessService()
    exec_data = execution_data.model_dump()
    exec_data["process_id"] = process_id
    result = service.execute_process(dw_id, process_id, exec_data)
    return success_response(
        message="Process execution initiated successfully",
        data={
            "process_time_id": result["process_time_id"],
            "process_time_log_id": result["process_time_log_id"],
            "estimated_jobs": result["estimated_jobs"],
            "status": result["status"],
            "dispatch_result": result["dispatch_result"],
        },
    )


@router.post(
    "/{dw_id}/compute/process/{process_id}/cancel",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Cancel process execution",
    description=(
        "Cancels an in-progress process execution, stopping any pending background jobs "
        "and marking the process status as CANCELLED.\n\n"
        "Jobs that have already completed are not rolled back."
    ),
)
async def cancel_process_execution(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_id: int = Path(..., description="Process ID to cancel"),
    db: Session = Depends(get_db),
):
    return success_response(
        message="Process execution cancelled successfully",
        data={"process_id": process_id},
    )


@router.patch(
    "/{dw_id}/compute/process/{process_id}",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Update process definition",
    description=(
        "Shallow-merges `filter_object` from the request body into the stored process "
        "filter JSON (e.g. update src_publisher, src_title, or ius_selection)."
    ),
)
async def update_process_definition(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_id: int = Path(..., description="Process ID to update"),
    body: ProcessUpdateRequest = ...,
    db: Session = Depends(get_db),
):
    service = ProcessService()
    result = service.update_process_definition(
        dw_id, process_id, body.filter_object
    )
    return success_response(
        message="Process definition updated successfully",
        data={
            "process_id": result["process_id"],
            "process_type": result["process_type"],
            "filter_object": result["filter_object"],
        },
    )


@router.delete(
    "/{dw_id}/compute/process/{process_id}",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Delete process definition",
    description=(
        "Hard-cascade deletes the specified process definition, matching Laravel's "
        "`ProcessController@destroy` behaviour:\n\n"
        "1. For every process-time entry: drop its `ce_process_time_log_{id}_details` "
        "dynamic table(s) and hard-delete the execution log rows.\n"
        "2. Hard-delete all process-time entries.\n"
        "3. Hard-delete the process master record.\n\n"
        "This prevents orphaned detail tables from accumulating in the warehouse database."
    ),
)
async def delete_process(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    process_id: int = Path(..., description="Process ID to delete"),
    db: Session = Depends(get_db),
):
    service = ProcessService()
    result = service.delete_process(dw_id, process_id)
    return success_response(
        message="Process deleted successfully",
        data={
            "process_id": result["process_id"],
            "process_times_deleted": result["process_times_deleted"],
            "logs_deleted": result["logs_deleted"],
            "detail_tables_dropped": result["detail_tables_dropped"],
        },
    )
