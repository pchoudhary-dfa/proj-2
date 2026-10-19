"""
Background job status service: unified status checking for DB and Celery jobs.

Provides read-only status queries for system_bg_job_queue (DB mode) and Celery tasks.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from apps.shared.config.celery_config import celery_app
from apps.shared.config.config import settings
from apps.shared.exceptions import NotFound

logger = logging.getLogger(__name__)

_ACTIVE_JOB_STATUSES = frozenset({"pending", "processing"})


def get_db_job_status(
    db: Session,
    *,
    job_id: int,
    dw_id: Optional[str] = None,
    job_type: Optional[str] = None,
) -> dict[str, Any]:
    """
    Load SystemBgJobQueue row and return status envelope.

    Args:
        db: SQLAlchemy session
        job_id: Primary key of system_bg_job_queue
        dw_id: Optional warehouse ID to verify scope
        job_type: Optional job type to verify (e.g. sync_search_index)

    Returns:
        Dict with job_status, result, last_error, completed_at, job_type, db_job_id

    Raises:
        NotFound: If job doesn't exist or dw_id/job_type mismatch
    """
    from apps.app_db.models.core import SystemBgJobQueue

    row = db.query(SystemBgJobQueue).filter(SystemBgJobQueue.id == job_id).first()
    if not row:
        raise NotFound(f"Background job {job_id} not found")

    if dw_id is not None and row.dw_id != dw_id:
        raise NotFound(
            f"Background job {job_id} does not belong to warehouse {dw_id}"
        )

    if job_type is not None and row.job_type != job_type:
        raise NotFound(
            f"Background job {job_id} is not of type {job_type} (found {row.job_type})"
        )

    return {
        "job_status": row.job_status,
        "job_type": row.job_type,
        "db_job_id": row.id,
        "celery_task_id": None,
        "result": row.result,
        "last_error": row.last_error,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


def get_celery_task_status(celery_task_id: str) -> dict[str, Any]:
    """
    Query Celery task status via AsyncResult.

    Args:
        celery_task_id: Celery task UUID

    Returns:
        Dict with normalized job_status, result, last_error, celery_task_id

    Celery state mapping:
        PENDING, RETRY → pending
        STARTED → processing
        SUCCESS → completed
        FAILURE, REVOKED → failed
    """
    from celery.result import AsyncResult

    async_result = AsyncResult(celery_task_id, app=celery_app)

    state = async_result.state
    result = None
    last_error = None

    if state in ("PENDING", "RETRY"):
        job_status = "pending"
    elif state == "STARTED":
        job_status = "processing"
    elif state == "SUCCESS":
        job_status = "completed"
        result = async_result.result
    elif state in ("FAILURE", "REVOKED"):
        job_status = "failed"
        # Extract exception info if available
        if async_result.info:
            if isinstance(async_result.info, Exception):
                last_error = str(async_result.info)
            elif isinstance(async_result.info, dict):
                last_error = async_result.info.get("exc_message") or str(
                    async_result.info
                )
            else:
                last_error = str(async_result.info)
    else:
        # Unknown state — treat as pending
        logger.warning("Unknown Celery state %s for task %s", state, celery_task_id)
        job_status = "pending"

    return {
        "job_status": job_status,
        "job_type": None,  # Celery doesn't track this in state
        "db_job_id": None,
        "celery_task_id": celery_task_id,
        "result": result,
        "last_error": last_error,
        "completed_at": None,  # Celery doesn't expose timestamp in AsyncResult
    }


def find_active_job(
    db: Session,
    *,
    dw_id: str,
    job_type: str,
) -> Optional[dict[str, Any]]:
    """
    Find the latest active background job for a warehouse and job type (DB mode).

    Returns status dict if job_status is pending or processing, else None.
    """
    from apps.app_db.models.core import SystemBgJobQueue

    row = (
        db.query(SystemBgJobQueue)
        .filter(
            SystemBgJobQueue.dw_id == dw_id,
            SystemBgJobQueue.job_type == job_type,
            SystemBgJobQueue.job_status.in_(_ACTIVE_JOB_STATUSES),
        )
        .order_by(desc(SystemBgJobQueue.id))
        .first()
    )

    if not row:
        return None

    return {
        "job_status": row.job_status,
        "job_type": row.job_type,
        "db_job_id": row.id,
        "celery_task_id": None,
        "result": row.result,
        "last_error": row.last_error,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


def find_active_sync_search_job(
    db: Session,
    dw_id: str,
    job_type: str = "sync_search_index",
) -> Optional[dict[str, Any]]:
    """
    Find the latest active search sync job for a warehouse (DB mode only).

    Used to resume UI polling after page refresh when sessionStorage is lost.

    Args:
        db: SQLAlchemy session
        dw_id: Data warehouse identifier
        job_type: Job type to search (default: sync_search_index)

    Returns:
        Status dict if an active job exists, else None
    """
    return find_active_job(db, dw_id=dw_id, job_type=job_type)
