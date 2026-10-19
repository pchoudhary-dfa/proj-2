"""
SQL dump export router — generate (async) and download warehouse MySQL dumps.
"""
import logging
import os

from fastapi import APIRouter, Depends, Path, status
from fastapi.responses import FileResponse

from apps.app_db.db.core import SessionLocal
from apps.app_db.dependencies import get_current_user_id
from apps.datawarehouse.constants import PATH_DW_ID
from apps.datawarehouse.db.datawarehouse import get_warehouse_credentials, validate_dw_id
from apps.datawarehouse.services.sql_dump_service import get_sql_dump_paths
from apps.shared.config.config import settings
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.exceptions import BadRequest, Conflict
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.services.bg_job_dispatch import (
    JOB_TYPE_DW_SQL_DUMP,
    dispatch_bg_job,
)
from apps.shared.services.bg_job_status_service import find_active_job
from apps.shared.utils.response import success_response

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["System Datawarehouses"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/sql-dump",
)


def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post(
    "",
    summary="Generate SQL dump",
    description=(
        "Queue a background job to export the warehouse MySQL database as a gzip-compressed "
        "SQL dump (structure + data). Requires BG_JOB_MQ_TYPE=DB and an active DB poller. "
        "Only one dump job per warehouse may run at a time. The previous dump remains "
        "downloadable until the new export completes successfully."
    ),
    response_model=SuccessResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        202: {"description": "Dump job queued", "model": SuccessResponse},
        400: {"description": "Invalid configuration or request", "model": ErrorResponse},
        409: {"description": "Dump already in progress", "model": ErrorResponse},
    },
)
def generate_sql_dump(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    __: int = Depends(get_current_user_id),
    db=Depends(_get_db),
):
    if str(settings.BG_JOB_MQ_TYPE).strip().upper() != "DB":
        raise BadRequest("SQL dump export requires BG_JOB_MQ_TYPE=DB")

    active = find_active_job(db, dw_id=str(dw_id), job_type=JOB_TYPE_DW_SQL_DUMP)
    if active:
        raise Conflict(
            f"SQL dump export is already in progress (job_id={active['db_job_id']})"
        )

    result = dispatch_bg_job(
        db=db,
        job_type=JOB_TYPE_DW_SQL_DUMP,
        payload={"dw_id": str(dw_id)},
        dw_id=str(dw_id),
    )

    logger.info("SQL dump job dispatched for dw_id=%s db_job_id=%s", dw_id, result.db_job_id)
    return success_response(
        message="SQL dump export has been queued",
        data={
            "dw_id": str(dw_id),
            "job_type": JOB_TYPE_DW_SQL_DUMP,
            "db_job_id": result.db_job_id,
            "celery_task_id": result.celery_task_id,
        },
        status_code=status.HTTP_202_ACCEPTED,
    )


@router.get(
    "",
    summary="Download SQL dump",
    description=(
        "Download the latest gzip-compressed SQL dump for this warehouse. "
        "Returns 400 when no dump file exists yet."
    ),
    responses={
        200: {"description": "Gzip SQL dump file"},
        400: {"description": "No dump available", "model": ErrorResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
    },
)
def download_sql_dump(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
):
    cred = get_warehouse_credentials(str(dw_id))
    paths = get_sql_dump_paths(cred, dw_id=str(dw_id))
    dump_path = paths["final"]
    if not os.path.isfile(dump_path):
        raise BadRequest("No SQL dump available for this data warehouse")

    return FileResponse(
        path=dump_path,
        media_type="application/gzip",
        filename=paths["basename"],
    )
