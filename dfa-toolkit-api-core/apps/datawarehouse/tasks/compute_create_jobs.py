"""
Create Jobs Celery Task for Compute Engine.

This task is equivalent to Laravel's CreateJobs job and handles:
- Dynamic log table creation using raw SQL
- Job payload preparation for each (IUS × Area × TimePeriod) combination
- Chunking strategy for large datasets
- Dispatch to appropriate compute queues
"""

import logging
from typing import Any, Dict

from celery import Task
from apps.shared.config.celery_config import celery_app
from apps.datawarehouse.services.process_service import ProcessService
from apps.shared.utils.log_event import log_background_incident
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context

logger = logging.getLogger(__name__)
_COMPUTE_CREATE_JOBS_SOURCE = "apps.datawarehouse.tasks.compute_create_jobs"


class CreateJobsTask(Task):
    """Custom task class for create jobs operation."""
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure."""
        log_background_incident(
            message=(
                f"CreateJobs task failed: task_id={task_id}, traceback={einfo.traceback}"
            ),
            error_code="COMPUTE_CREATE_JOBS_TASK_ON_FAILURE",
            exc=exc,
            source=_COMPUTE_CREATE_JOBS_SOURCE,
        )
    
    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success."""
        logger.info(
            "CreateJobs task completed successfully: task_id=%s, result=%s",
            task_id, retval
        )


@celery_app.task(
    bind=True,
    base=CreateJobsTask,
    name="apps.compute_engine.tasks.create_jobs.create_jobs_task",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 60},
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True
)
def create_jobs_task(self, **kwargs) -> Dict[str, Any]:
    """
    Create individual computation jobs for a process time log.
    
    This task:
    1. Creates a dynamic log table for tracking individual jobs
    2. Generates job payloads for each IUS × Area × TimePeriod combination
    3. Dispatches individual compute jobs to appropriate queues
    4. Updates process time log with progress information
    
    Args:
        **kwargs: Task payload containing:
            - dw_id: Data warehouse ID
            - process_time_log_id: Process time log ID
            - process_type: Type of computation (TOTAL/PERCENT/TIME/MINUS)
            - filter_object: Complete filter configuration
    
    Returns:
        Dictionary with task execution result
    """
    try:
        dw_id = kwargs.get("dw_id")
        process_time_log_id = kwargs.get("process_time_log_id")
        process_type = kwargs.get("process_type")
        
        if not all([dw_id, process_time_log_id, process_type]):
            raise ValueError("Missing required parameters: dw_id, process_time_log_id, process_type")
        
        with bg_job_dw_audit_context(dw_route_id=str(dw_id) if dw_id else None):
            logger.info(
                "Starting CreateJobs task: dw_id=%s, log_id=%s, type=%s",
                dw_id, process_time_log_id, process_type
            )
            
            # Use ProcessService to handle job creation
            service = ProcessService()
            result = service.create_jobs_for_process_time_log(dw_id, process_time_log_id)
            
            logger.info(
                "CreateJobs task completed: dw_id=%s, log_id=%s, jobs_created=%s",
                dw_id, process_time_log_id, result.get("jobs_created", 0)
            )
            
            return {
                "success": True,
                "task_id": self.request.id,
                "dw_id": dw_id,
                "process_time_log_id": process_time_log_id,
                "process_type": process_type,
                "jobs_created": result.get("jobs_created", 0),
                "table_name": result.get("table_name"),
                "execution_time": self.request.timelimit,
                "retries": self.request.retries
            }
        
    except Exception as e:
        log_background_incident(
            message=(
                f"CreateJobs task failed: dw_id={kwargs.get('dw_id')}, "
                f"log_id={kwargs.get('process_time_log_id')}, error={e}"
            ),
            error_code="COMPUTE_CREATE_JOBS_TASK_FAILED",
            exc=e,
            source=_COMPUTE_CREATE_JOBS_SOURCE,
        )
        
        # Update process time log status to failed if possible
        try:
            if kwargs.get("dw_id") and kwargs.get("process_time_log_id"):
                from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
                from apps.datawarehouse.models.datawarehouse import CeProcessTimeLog
                from datetime import datetime
                
                with get_warehouse_session_from_id(kwargs["dw_id"]) as dw_db:
                    log = dw_db.query(CeProcessTimeLog).filter(
                        CeProcessTimeLog.id == kwargs["process_time_log_id"]
                    ).first()
                    
                    if log:
                        log.status = "FAILED"
                        log.remarks = f"CreateJobs task failed: {str(e)}"
                        log.updated_at = datetime.utcnow()
                        dw_db.commit()
                        
        except Exception as update_error:
            log_background_incident(
                message=f"Failed to update log status after task failure: {update_error}",
                error_code="COMPUTE_CREATE_JOBS_LOG_STATUS_UPDATE_FAILED",
                exc=update_error,
                source=_COMPUTE_CREATE_JOBS_SOURCE,
            )
        
        # Re-raise the original exception for Celery retry mechanism
        raise


# Alternative task for DB-based job queue (non-Celery)
def execute_create_jobs_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronous version of create jobs for DB-based job queue.
    
    This function provides the same functionality as the Celery task
    but runs synchronously for the DB-based background job system.
    
    Args:
        payload: Job payload dictionary
        
    Returns:
        Dictionary with execution result
    """
    try:
        dw_id = payload.get("dw_id")
        process_time_log_id = payload.get("process_time_log_id")
        process_type = payload.get("process_type")
        
        if not all([dw_id, process_time_log_id, process_type]):
            raise ValueError("Missing required parameters: dw_id, process_time_log_id, process_type")
        
        with bg_job_dw_audit_context(payload=payload):
            logger.info(
                "Starting sync CreateJobs: dw_id=%s, log_id=%s, type=%s",
                dw_id, process_time_log_id, process_type
            )
            
            # Use ProcessService to handle job creation
            service = ProcessService()
            result = service.create_jobs_for_process_time_log(dw_id, process_time_log_id)
            
            logger.info(
                "Sync CreateJobs completed: dw_id=%s, log_id=%s, jobs_created=%s",
                dw_id, process_time_log_id, result.get("jobs_created", 0)
            )
            
            return {
                "success": True,
                "dw_id": dw_id,
                "process_time_log_id": process_time_log_id,
                "process_type": process_type,
                "jobs_created": result.get("jobs_created", 0),
                "table_name": result.get("table_name")
            }
        
    except Exception as e:
        log_background_incident(
            message=(
                f"Sync CreateJobs failed: dw_id={payload.get('dw_id')}, "
                f"log_id={payload.get('process_time_log_id')}, error={e}"
            ),
            error_code="COMPUTE_CREATE_JOBS_SYNC_FAILED",
            exc=e,
            source=_COMPUTE_CREATE_JOBS_SOURCE,
        )
        raise