"""
Unified background job dispatch: BG_JOB_MQ_TYPE=CELERY -> apply_async;
BG_JOB_MQ_TYPE=DB -> insert system_bg_job_queue; the in-process poller (BG_JOB_POLLER_ENABLED) drains rows.
"""
from __future__ import annotations

import json
import logging
import os
import socket
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple

from sqlalchemy import text, update
from sqlalchemy.orm import Session

from apps.shared.config.config import settings
from apps.shared.utils.log_event import log_background_incident
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context
from apps.datawarehouse.constants import (
    JOB_TYPE_COMPUTE_CREATE_JOBS,
    JOB_TYPE_COMPUTE_TOTAL,
    JOB_TYPE_COMPUTE_PERCENT,
    JOB_TYPE_COMPUTE_TIME,
    JOB_TYPE_COMPUTE_MINUS,
    JOB_TYPE_COMPUTE_AREA,
)

logger = logging.getLogger(__name__)

JOB_TYPE_UPDATE_SUBGROUP_NAMES = "update_subgroup_names"
JOB_TYPE_ISMRD_COMBINATION = "ismrd_combination"
JOB_TYPE_MARK_DEFAULT_SUBGROUPS = "mark_default_subgroups"
JOB_TYPE_IUS_DATA_EXIST = "ius_data_exist"
JOB_TYPE_SEND_EMAIL = "dfa_send_email"
JOB_TYPE_DELETE_SG_CATEGORY_VALUE = "delete_sg_category_value"
JOB_TYPE_DELETE_SG_CATEGORY = "delete_sg_category"
JOB_TYPE_SEED_DATASET_DATA_POINTS = "seed_dataset_data_points"
JOB_TYPE_IMPORT_DATASET_DATA_POINTS_BATCH = "import_dataset_data_points_batch"
JOB_TYPE_DELETE_DATASET = "delete_dataset"
JOB_TYPE_SYNC_SEARCH_INDEX = "sync_search_index"
JOB_TYPE_BUILD_MOBILE_PACKAGE = "build_mobile_package"
JOB_TYPE_DW_SQL_DUMP = "dw_sql_dump"

BG_JOB_CELERY_REGISTRY: Dict[str, Tuple[Any, str]] = {}
"""job_type -> (celery_task, settings attribute name for queue, e.g. CELERY_QUEUE_NAME_SUBGROUP_UPDATE)."""

BG_JOB_HANDLER_REGISTRY: Dict[str, Callable[[dict], Any]] = {}
"""job_type -> sync handler(payload dict) for DB mode after row is claimed."""


@dataclass
class BgJobDispatchResult:
    db_job_id: Optional[int] = None
    celery_task_id: Optional[str] = None


def _handle_update_subgroup_names(payload: dict) -> Any:
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    category_nid = payload.get("category_nid")
    category_value_nid = payload.get("category_value_nid")
    language_code = payload.get("language_code", "en")
    from apps.datawarehouse.services.sg_vals import SgValsService

    service = SgValsService()
    if category_nid is not None:
        return service.update_subgroups_for_category_order_change(
            dw_id, int(category_nid), language_code
        )
    if category_value_nid is not None:
        return service.update_affected_subgroup_names(
            dw_id, int(category_value_nid), language_code
        )
    raise ValueError("Either category_nid or category_value_nid must be provided")


def _handle_ismrd_combination(payload: dict) -> Any:
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    from apps.datawarehouse.utils.data_utils import update_ismrd_for_combination

    return update_ismrd_for_combination(
        dw_id,
        indicator_nid=payload.get("indicator_nid"),
        unit_nid=payload.get("unit_nid"),
        subgroup_val_nid=payload.get("subgroup_val_nid"),
        area_nid=payload.get("area_nid"),
        _internal_skip_check=True,
    )


def _handle_mark_default_subgroups(payload: dict) -> Any:
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    from apps.datawarehouse.utils.default_subgroup_utils import mark_default_subgroups_for_dw

    return mark_default_subgroups_for_dw(
        dw_id,
        i_nid=payload.get("i_nid"),
        u_nid=payload.get("u_nid"),
        _internal_skip_check=True,
    )


def _handle_ius_data_exist(payload: dict) -> Any:
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    from apps.datawarehouse.utils.ius_data_exist_utils import (
        recompute_ius_data_exist_from_ut_data,
    )

    return recompute_ius_data_exist_from_ut_data(
        dw_id,
        indicator_nid=payload.get("indicator_nid"),
        unit_nid=payload.get("unit_nid"),
        subgroup_val_nid=payload.get("subgroup_val_nid"),
        _internal_skip_check=True,
    )


def _handle_delete_sg_category_value(payload: dict) -> Any:
    dw_id = payload.get("dw_id")
    subgroup_nid = payload.get("subgroup_nid")
    if not dw_id or subgroup_nid is None:
        raise ValueError("dw_id and subgroup_nid are required")
    from apps.datawarehouse.services.sg_category_values import SgCategoryValuesService

    service = SgCategoryValuesService()
    return service.run_delete_sg_category_value_job(dw_id, int(subgroup_nid))


def _handle_delete_sg_category(payload: dict) -> Any:
    dw_id = payload.get("dw_id")
    sg_category_identifier = payload.get("sg_category_identifier")
    if not dw_id or not sg_category_identifier:
        raise ValueError("dw_id and sg_category_identifier are required")
    from apps.datawarehouse.services.sg_category import SgCategoryService

    service = SgCategoryService()
    return service.run_delete_sg_category_job(dw_id, str(sg_category_identifier))


def _handle_send_email(payload: dict) -> Any:
    """Drain-path handler: same semantics as Celery send_email_task (no Celery retries)."""
    from apps.shared.packages.dfa_mailer_service.tasks.email_tasks import (
        execute_send_email_job,
    )

    template_key = payload.get("template_key")
    if not template_key:
        raise ValueError("template_key is required")
    return execute_send_email_job(
        template_key=template_key,
        recipient_email=payload.get("recipient_email") or "",
        context=payload.get("context") or {},
        language=payload.get("language", "en"),
        recipient_name=payload.get("recipient_name"),
        priority=payload.get("priority", "normal"),
        log_id=payload.get("log_id"),
        recipient_emails=payload.get("recipient_emails"),
        attachments=payload.get("attachments"),
        celery_task_id=None,
    )


def _handle_seed_dataset_data_points(payload: dict) -> Any:
    dataset_id = payload.get("dataset_id")
    dw_id = payload.get("dw_id")
    locale = payload.get("locale", "en")
    if not dataset_id or not dw_id:
        raise ValueError("dataset_id and dw_id are required")
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import Dataset
    from apps.app_db.services.dataset_service import _seed_dataset_data_points

    db = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.dataset_id == int(dataset_id)).first()
        if not dataset:
            raise ValueError(f"Dataset {dataset_id} not found")
        _seed_dataset_data_points(db, dataset, int(dw_id), locale=locale)
        dataset.datapoint_readiness = "COMPLETED"
        db.commit()
        return {"success": True, "dataset_id": dataset_id}
    except Exception as exc:
        try:
            dataset.datapoint_readiness = "FAILED"
            db.commit()
        except Exception:
            db.rollback()
        raise exc
    finally:
        db.close()


def _safe_job_payload(row: "SystemBgJobQueue") -> dict:
    try:
        raw = json.loads(row.job_req_payload or "{}")
        return raw if isinstance(raw, dict) else {}
    except json.JSONDecodeError:
        return {}


def _resolve_import_batch_ids(
    row: "SystemBgJobQueue",
    payload: Optional[dict],
) -> Optional[tuple[str, int, int]]:
    payload = payload or {}
    request_id = row.request_id or payload.get("request_id")
    dataset_id = (
        row.dataset_id if row.dataset_id is not None else payload.get("dataset_id")
    )
    dw_id = row.dw_id if row.dw_id is not None else payload.get("dw_id")
    if not request_id or dataset_id is None or dw_id is None:
        return None
    return str(request_id), int(dataset_id), int(dw_id)


def _finalize_import_batch_job(
    db: Session,
    row: "SystemBgJobQueue",
    payload: Optional[dict] = None,
) -> None:
    """Update dataset.datapoint_readiness after this batch job reaches a terminal status."""
    if row.job_type != JOB_TYPE_IMPORT_DATASET_DATA_POINTS_BATCH:
        return
    job_id = int(row.id) if row.id is not None else None
    resolved = _resolve_import_batch_ids(row, payload)
    if not resolved:
        logger.warning(
            "import batch finalize skipped job_id=%s: missing request_id, dataset_id, or dw_id",
            job_id,
        )
        return
    request_id, dataset_id, dw_id = resolved
    from apps.app_db.services.datapoint_import_service import maybe_finalize_import_request

    db.flush()
    maybe_finalize_import_request(
        db,
        request_id=request_id,
        dataset_id=dataset_id,
        dw_id=dw_id,
        exclude_job_id=job_id,
    )


def _handle_import_dataset_data_points_batch(payload: dict) -> Any:
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.services.datapoint_import_service import run_import_batch

    dataset_id = payload.get("dataset_id")
    dw_id = payload.get("dw_id")
    user_id = payload.get("user_id")
    request_id = payload.get("request_id")
    if not dataset_id or not dw_id or user_id is None or not request_id:
        raise ValueError("dataset_id, dw_id, user_id, and request_id are required")

    db = SessionLocal()
    try:
        with bg_job_dw_audit_context(dw_route_id=str(dw_id)):
            result = run_import_batch(db, payload=payload)
            db.commit()
            return result
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _handle_delete_dataset(payload: dict) -> Any:
    dataset_id = payload.get("dataset_id")
    dw_id = payload.get("dw_id")
    if not dataset_id or not dw_id:
        raise ValueError("dataset_id and dw_id are required")
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import Dataset, DatasetDataPoint

    db = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.dataset_id == int(dataset_id)).first()
        if not dataset:
            return {"success": True, "dataset_id": dataset_id}
        db.query(DatasetDataPoint).filter(
            DatasetDataPoint.dataset_id == int(dataset_id)
        ).delete(synchronize_session=False)
        db.delete(dataset)
        db.commit()
        return {"success": True, "dataset_id": dataset_id}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _handle_sync_search_index(payload: dict) -> Any:
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    from apps.datawarehouse.tasks.bg_search_index_tasks import _run_sync_search_index

    return _run_sync_search_index(dw_id)


def _handle_build_mobile_package(payload: dict) -> Any:
    from apps.datawarehouse.tasks.bg_publish_mobile_tasks import _run_build_mobile_package

    return _run_build_mobile_package(payload)


def _handle_dw_sql_dump(payload: dict) -> Any:
    from apps.datawarehouse.tasks.bg_sql_dump_tasks import _run_build_sql_dump

    return _run_build_sql_dump(payload)


# Compute Engine DB handlers
def _handle_compute_create_jobs(payload: dict) -> Any:
    """Handler for compute engine job creation."""
    from apps.datawarehouse.services.process_service import ProcessService
    
    dw_id = payload.get("dw_id")
    process_time_log_id = payload.get("process_time_log_id")
    if not dw_id or not process_time_log_id:
        raise ValueError("dw_id and process_time_log_id are required")
    
    service = ProcessService()
    return service.create_jobs_for_process_time_log(dw_id, process_time_log_id)


def _handle_compute_total(payload: dict) -> Any:
    """Handler for TOTAL computation operations."""
    from apps.datawarehouse.services.compute_operations import ComputeOperationsService
    
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    
    service = ComputeOperationsService()
    return service.execute_total_operation(payload)


def _handle_compute_percent(payload: dict) -> Any:
    """Handler for PERCENT computation operations."""
    from apps.datawarehouse.services.compute_operations import ComputeOperationsService
    
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    
    service = ComputeOperationsService()
    return service.execute_percent_operation(payload)


def _handle_compute_time(payload: dict) -> Any:
    """Handler for TIME computation operations."""
    from apps.datawarehouse.services.compute_operations import ComputeOperationsService
    
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    
    service = ComputeOperationsService()
    return service.execute_time_operation(payload)


def _handle_compute_minus(payload: dict) -> Any:
    """Handler for MINUS computation operations."""
    from apps.datawarehouse.services.compute_operations import ComputeOperationsService
    
    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")
    
    service = ComputeOperationsService()
    return service.execute_minus_operation(payload)


def _handle_compute_area(payload: dict) -> Any:
    """Handler for AREA computation operations."""
    from apps.datawarehouse.services.compute_operations import ComputeOperationsService

    dw_id = payload.get("dw_id")
    if not dw_id:
        raise ValueError("dw_id is required")

    service = ComputeOperationsService()
    return service.execute_area_operation(payload)


def _ensure_celery_registry() -> None:
    """Populate Celery task entries on first use (avoids importing Celery at module import time)."""
    if JOB_TYPE_UPDATE_SUBGROUP_NAMES not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_subgroup_tasks import update_subgroup_names_task

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_UPDATE_SUBGROUP_NAMES] = (
            update_subgroup_names_task,
            "CELERY_QUEUE_NAME_SUBGROUP_UPDATE",
        )
    if JOB_TYPE_ISMRD_COMBINATION not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_setmrd_tasks import (
            bg_run_setmrd_for_combination_task,
        )

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_ISMRD_COMBINATION] = (
            bg_run_setmrd_for_combination_task,
            "CELERY_QUEUE_NAME_ISMRD",
        )
    if JOB_TYPE_MARK_DEFAULT_SUBGROUPS not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_default_subgroup_tasks import (
            bg_mark_default_subgroups_task,
        )

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_MARK_DEFAULT_SUBGROUPS] = (
            bg_mark_default_subgroups_task,
            "CELERY_QUEUE_NAME_DEFAULT_SUBGROUP",
        )
    if JOB_TYPE_IUS_DATA_EXIST not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_ius_data_exist_tasks import (
            bg_recompute_ius_data_exist_task,
        )

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_IUS_DATA_EXIST] = (
            bg_recompute_ius_data_exist_task,
            "CELERY_QUEUE_NAME_ISMRD",
        )
    
    # Compute Engine Celery task registrations
    if JOB_TYPE_COMPUTE_CREATE_JOBS not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.compute_create_jobs import create_jobs_task
        
        BG_JOB_CELERY_REGISTRY[JOB_TYPE_COMPUTE_CREATE_JOBS] = (
            create_jobs_task,
            "CELERY_QUEUE_NAME_COMPUTE_CREATE_JOBS",
        )
    
    if JOB_TYPE_COMPUTE_TOTAL not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.compute_process import process_compute_total_task
        
        BG_JOB_CELERY_REGISTRY[JOB_TYPE_COMPUTE_TOTAL] = (
            process_compute_total_task,
            "CELERY_QUEUE_NAME_COMPUTE_PROCESS",
        )
    
    if JOB_TYPE_COMPUTE_PERCENT not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.compute_process import process_compute_percent_task
        
        BG_JOB_CELERY_REGISTRY[JOB_TYPE_COMPUTE_PERCENT] = (
            process_compute_percent_task,
            "CELERY_QUEUE_NAME_COMPUTE_PROCESS",
        )
    
    if JOB_TYPE_COMPUTE_TIME not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.compute_process import process_compute_time_task
        
        BG_JOB_CELERY_REGISTRY[JOB_TYPE_COMPUTE_TIME] = (
            process_compute_time_task,
            "CELERY_QUEUE_NAME_COMPUTE_PROCESS",
        )
    
    if JOB_TYPE_COMPUTE_MINUS not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.compute_process import process_compute_minus_task
        
        BG_JOB_CELERY_REGISTRY[JOB_TYPE_COMPUTE_MINUS] = (
            process_compute_minus_task,
            "CELERY_QUEUE_NAME_COMPUTE_PROCESS",
        )

    if JOB_TYPE_COMPUTE_AREA not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.compute_process import process_compute_area_task

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_COMPUTE_AREA] = (
            process_compute_area_task,
            "CELERY_QUEUE_NAME_COMPUTE_PROCESS",
        )

    if JOB_TYPE_DELETE_SG_CATEGORY_VALUE not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_sg_category_value_tasks import (
            delete_sg_category_value_task,
        )

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_DELETE_SG_CATEGORY_VALUE] = (
            delete_sg_category_value_task,
            "CELERY_QUEUE_NAME_SUBGROUP_UPDATE",
        )

    if JOB_TYPE_DELETE_SG_CATEGORY not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_sg_category_tasks import delete_sg_category_task

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_DELETE_SG_CATEGORY] = (
            delete_sg_category_task,
            "CELERY_QUEUE_NAME_SUBGROUP_UPDATE",
        )

    if JOB_TYPE_SEED_DATASET_DATA_POINTS not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_dataset_tasks import seed_dataset_data_points_task

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_SEED_DATASET_DATA_POINTS] = (
            seed_dataset_data_points_task,
            "CELERY_QUEUE_NAME_DATASET_SEED",
        )

    if JOB_TYPE_DELETE_DATASET not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_dataset_tasks import delete_dataset_task

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_DELETE_DATASET] = (
            delete_dataset_task,
            "CELERY_QUEUE_NAME_DATASET_DELETE",
        )

    if JOB_TYPE_SYNC_SEARCH_INDEX not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_search_index_tasks import sync_search_index_task

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_SYNC_SEARCH_INDEX] = (
            sync_search_index_task,
            "CELERY_QUEUE_NAME_SEARCH_INDEX",
        )

    if JOB_TYPE_BUILD_MOBILE_PACKAGE not in BG_JOB_CELERY_REGISTRY:
        from apps.datawarehouse.tasks.bg_publish_mobile_tasks import build_mobile_package_task

        BG_JOB_CELERY_REGISTRY[JOB_TYPE_BUILD_MOBILE_PACKAGE] = (
            build_mobile_package_task,
            "CELERY_QUEUE_NAME_MOBILE_PACKAGE",
        )


BG_JOB_HANDLER_REGISTRY[JOB_TYPE_UPDATE_SUBGROUP_NAMES] = _handle_update_subgroup_names
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_ISMRD_COMBINATION] = _handle_ismrd_combination
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_MARK_DEFAULT_SUBGROUPS] = _handle_mark_default_subgroups
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_IUS_DATA_EXIST] = _handle_ius_data_exist
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_SEND_EMAIL] = _handle_send_email
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_DELETE_SG_CATEGORY_VALUE] = _handle_delete_sg_category_value
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_DELETE_SG_CATEGORY] = _handle_delete_sg_category
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_SEED_DATASET_DATA_POINTS] = _handle_seed_dataset_data_points
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_IMPORT_DATASET_DATA_POINTS_BATCH] = (
    _handle_import_dataset_data_points_batch
)
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_DELETE_DATASET] = _handle_delete_dataset

# Compute Engine handlers
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_COMPUTE_CREATE_JOBS] = _handle_compute_create_jobs
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_COMPUTE_TOTAL] = _handle_compute_total
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_COMPUTE_PERCENT] = _handle_compute_percent
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_COMPUTE_TIME] = _handle_compute_time
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_COMPUTE_MINUS] = _handle_compute_minus
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_COMPUTE_AREA] = _handle_compute_area
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_SYNC_SEARCH_INDEX] = _handle_sync_search_index
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_BUILD_MOBILE_PACKAGE] = _handle_build_mobile_package
BG_JOB_HANDLER_REGISTRY[JOB_TYPE_DW_SQL_DUMP] = _handle_dw_sql_dump


def _get_worker_id() -> str:
    """Generate unique worker ID including hostname for distributed deployments."""
    hostname = socket.gethostname()
    pid = os.getpid()
    return f"fastapi-bg-{hostname}-{pid}"


def claim_next_job_atomically(worker_id: str, batch_size: int = 1) -> List[int]:
    """
    Atomically claim the next available job(s) using SELECT FOR UPDATE SKIP LOCKED.
    
    This eliminates race conditions by using database-level locking to ensure
    only one worker can claim each job.
    
    Args:
        worker_id: Unique identifier for this worker
        batch_size: Maximum number of jobs to claim at once
        
    Returns:
        List of job IDs that were successfully claimed by this worker
    """
    from apps.app_db.db.core import SessionLocal
    
    db = SessionLocal()
    try:
        # Use raw SQL for atomic claiming with SELECT FOR UPDATE SKIP LOCKED
        # This prevents race conditions by locking rows at the database level
        result = db.execute(text("""
            SELECT id FROM system_bg_job_queue
            WHERE job_status = 'pending' 
              AND available_at <= NOW()
              AND (locked_by IS NULL OR locked_by = '')
            ORDER BY COALESCE(priority, 0) DESC, id ASC
            LIMIT :batch_size
            FOR UPDATE SKIP LOCKED
        """), {"batch_size": batch_size})
        
        job_ids = [row[0] for row in result.fetchall()]
        
        if not job_ids:
            return []
        
        # Now atomically update the claimed jobs one by one
        # MySQL connector doesn't handle tuple parameters well, so we update individually
        now = datetime.utcnow()
        successfully_claimed = []
        
        for job_id in job_ids:
            update_result = db.execute(text("""
                UPDATE system_bg_job_queue 
                SET job_status = 'processing',
                    locked_at = :locked_at,
                    locked_by = :worker_id
                WHERE id = :job_id
                  AND job_status = 'pending'
            """), {
                "locked_at": now,
                "worker_id": worker_id,
                "job_id": job_id
            })
            
            if update_result.rowcount > 0:
                successfully_claimed.append(job_id)
        
        db.commit()
        
        return successfully_claimed
        
    except Exception as e:
        db.rollback()
        log_background_incident(
            f"Failed to claim jobs atomically: {e}",
            error_code="BG_JOB_CLAIM_FAILED",
            exc=e,
            source="apps.shared.services.bg_job_dispatch",
        )
        return []
    finally:
        db.close()


def _mq_mode() -> str:
    return str(settings.BG_JOB_MQ_TYPE).strip().upper()


def dispatch_bg_job(
    *,
    db: Session,
    job_type: str,
    payload: dict,
    dw_id: Optional[str] = None,
    priority: int = 0,
    request_id: Optional[str] = None,
    dataset_id: Optional[int] = None,
    max_attempts: Optional[int] = None,
    commit: bool = True,
) -> BgJobDispatchResult:
    """
    Queue background work per BG_JOB_MQ_TYPE.
    For DB mode: inserts a pending row and commits immediately. BG_JOB_POLLER_ENABLED
    must be true so the in-process poller can pick up the row.
    """
    mode = _mq_mode()
    if mode not in ("DB", "CELERY"):
        raise ValueError(
            f"Invalid BG_JOB_MQ_TYPE={settings.BG_JOB_MQ_TYPE!r}; expected DB or CELERY"
        )

    if mode == "CELERY":
        _ensure_celery_registry()
        entry = BG_JOB_CELERY_REGISTRY.get(job_type)
        if not entry:
            raise ValueError(f"Unknown job_type for Celery dispatch: {job_type}")
        task, queue_attr = entry
        queue_name = getattr(settings, queue_attr)
        async_result = task.apply_async(kwargs=payload, queue=queue_name)
        logger.info(
            "Celery job queued job_type=%s celery_id=%s queue=%s",
            job_type,
            async_result.id,
            queue_name,
        )
        return BgJobDispatchResult(celery_task_id=async_result.id)

    from apps.app_db.models.core import SystemBgJobQueue

    row = SystemBgJobQueue(
        job_type=job_type,
        job_req_payload=json.dumps(payload),
        job_status="pending",
        dw_id=dw_id,
        priority=priority,
        request_id=request_id,
        dataset_id=dataset_id,
    )
    if max_attempts is not None:
        row.max_attempts = max_attempts
    db.add(row)
    if commit:
        db.commit()
    else:
        db.flush()
    job_id = int(row.id)
    if settings.BG_JOB_POLLER_ENABLED:
        logger.info(
            "DB background job inserted job_type=%s db_job_id=%s (poller)",
            job_type,
            job_id,
        )
    else:
        raise ValueError(
            "When BG_JOB_MQ_TYPE=DB, set BG_JOB_POLLER_ENABLED=true so the in-process "
            "poller can run queued jobs."
        )
    return BgJobDispatchResult(db_job_id=job_id)




def _execute_claimed_job(job_id: int, worker_id: str) -> None:
    """
    Execute a job that has already been claimed atomically.
    
    Args:
        job_id: ID of the job to execute
        worker_id: ID of the worker executing the job (for verification)
    """
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import SystemBgJobQueue
    
    db = SessionLocal()
    try:
        row = db.query(SystemBgJobQueue).filter(
            SystemBgJobQueue.id == job_id,
            SystemBgJobQueue.job_status == "processing",
            SystemBgJobQueue.locked_by == worker_id
        ).first()
        
        if row is None:
            logger.warning("Job %s not found or not owned by worker %s", job_id, worker_id)
            return
            
        handler = BG_JOB_HANDLER_REGISTRY.get(row.job_type)
        if handler is None:
            row.job_status = "failed"
            row.last_error = f"No handler registered for job_type={row.job_type!r}"
            row.completed_at = datetime.utcnow()
            _finalize_import_batch_job(db, row, _safe_job_payload(row))
            db.commit()
            return

        payload: Optional[dict] = None
        try:
            try:
                payload = json.loads(row.job_req_payload)
                if not isinstance(payload, dict):
                    payload = {}
            except json.JSONDecodeError as e:
                row.job_status = "failed"
                row.last_error = f"Invalid job_req_payload JSON: {e}"
                row.completed_at = datetime.utcnow()
                _finalize_import_batch_job(db, row, _safe_job_payload(row))
                db.commit()
                return
            
            logger.info("Executing job %s (type: %s) by worker %s", job_id, row.job_type, worker_id)

            with bg_job_dw_audit_context(payload=payload, row_dw_id=row.dw_id):
                out = handler(payload)
            if isinstance(out, dict) and out.get("failed"):
                row.job_status = "failed"
                row.result = json.dumps(out, default=str)
                row.last_error = (out.get("message") or "Batch import failed")[:65535]
            else:
                row.job_status = "completed"
                row.result = json.dumps(out, default=str)
            row.completed_at = datetime.utcnow()
            _finalize_import_batch_job(db, row, payload)
            db.commit()
            logger.info("Job %s completed successfully", job_id)
            
        except Exception as e:  # noqa: BLE001
            log_background_incident(
                f"DB background job {job_id} failed",
                error_code="BG_JOB_EXEC_FAILED",
                exc=e,
                source="apps.shared.services.bg_job_dispatch",
            )
            attempts = (row.attempts or 0) + 1
            row.attempts = attempts
            row.last_error = str(e)[:65535]
            row.job_status = "failed"
            row.completed_at = datetime.utcnow()
            _finalize_import_batch_job(
                db, row, payload if payload is not None else _safe_job_payload(row)
            )
            db.commit()
    finally:
        db.close()


def claim_and_run_jobs(batch_size: int = 1) -> int:
    """
    Atomically claim and execute available background jobs.
    
    This is the race-condition-free approach for processing background jobs.
    
    Args:
        batch_size: Maximum number of jobs to process in this call
        
    Returns:
        Number of jobs that were successfully claimed and processed
    """
    worker_id = _get_worker_id()
    
    # Atomically claim available jobs
    job_ids = claim_next_job_atomically(worker_id, batch_size)
    
    if not job_ids:
        return 0
    
    logger.info("Worker %s claimed %d job(s): %s", worker_id, len(job_ids), job_ids)
    
    # Execute each claimed job
    for job_id in job_ids:
        try:
            _execute_claimed_job(job_id, worker_id)
        except Exception as e:
            log_background_incident(
                f"Failed to execute claimed job {job_id}: {e}",
                error_code="BG_JOB_RUN_FAILED",
                exc=e,
                source="apps.shared.services.bg_job_dispatch",
            )
    
    return len(job_ids)
