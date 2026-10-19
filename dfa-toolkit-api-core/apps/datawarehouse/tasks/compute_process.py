"""
Process Compute Celery Tasks for Compute Engine.

These tasks are equivalent to Laravel's ProcessCompute job and handle:
- Job type routing (TOTAL/PERCENT/TIME/MINUS)
- Data warehouse connection management
- Computation execution with proper error handling
- Progress tracking and status updates
- Detailed logging to dynamic tables
"""

import logging
from typing import Any, Dict

from celery import Task
from apps.shared.config.celery_config import celery_app
from apps.datawarehouse.services.compute_operations import ComputeOperationsService
from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
    OPERATION_AREA,
)
from apps.shared.utils.log_event import log_background_incident
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed

logger = logging.getLogger(__name__)
_COMPUTE_PROCESS_SOURCE = "apps.datawarehouse.tasks.compute_process"


class ProcessComputeTask(Task):
    """Base task class for compute operations."""
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure."""
        operation_type = kwargs.get("process_type", "UNKNOWN")
        log_background_incident(
            message=(
                f"ProcessCompute task failed: task_id={task_id}, operation={operation_type}, "
                f"traceback={einfo.traceback}"
            ),
            error_code="COMPUTE_PROCESS_TASK_ON_FAILURE",
            exc=exc,
            source=_COMPUTE_PROCESS_SOURCE,
        )
    
    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success."""
        operation_type = kwargs.get("process_type", "UNKNOWN")
        logger.info(
            "ProcessCompute task completed successfully: task_id=%s, operation=%s, result=%s",
            task_id, operation_type, retval
        )


@celery_app.task(
    bind=True,
    base=ProcessComputeTask,
    name="apps.compute_engine.tasks.process_compute.process_compute_total_task",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 30},
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True
)
def process_compute_total_task(self, **kwargs) -> Dict[str, Any]:
    """
    Execute TOTAL computation operation.
    
    Args:
        **kwargs: Task payload containing:
            - dw_id: Data warehouse ID
            - ius_gid: IUS combination (Indicator-Unit-Subgroup GID)
            - area_id: Area identifier
            - time_period: Time period identifier
            - table_name: Dynamic log table name
            - filter_object: Complete filter configuration
    
    Returns:
        Dictionary with computation result
    """
    try:
        logger.info(
            "Starting TOTAL computation: task_id=%s, dw_id=%s, ius=%s, area=%s, period=%s",
            self.request.id, kwargs.get("dw_id"), kwargs.get("ius_gid"),
            kwargs.get("area_id"), kwargs.get("time_period")
        )
        
        # Validate required parameters
        required_params = ["dw_id", "ius_gid", "area_id", "time_period", "table_name"]
        for param in required_params:
            if not kwargs.get(param):
                raise ValueError(f"Missing required parameter: {param}")
        
        with bg_job_dw_audit_context(payload=kwargs):
            # Execute TOTAL operation
            service = ComputeOperationsService()
            result = service.execute_total_operation(kwargs)
            
            # Add task metadata
            result.update({
                "task_id": self.request.id,
                "retries": self.request.retries,
                "execution_time": getattr(self.request, 'timelimit', None)
            })
            
            logger.info(
                "TOTAL computation completed: task_id=%s, value=%s",
                self.request.id, result.get("computed_value")
            )
            notify_dbmetadata_counts_changed(str(kwargs.get("dw_id", "")))
            return result
        
    except Exception as e:
        log_background_incident(
            message=(
                f"TOTAL computation failed: task_id={self.request.id}, dw_id={kwargs.get('dw_id')}, "
                f"ius={kwargs.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_TASK_TOTAL_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


@celery_app.task(
    bind=True,
    base=ProcessComputeTask,
    name="apps.compute_engine.tasks.process_compute.process_compute_percent_task",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 30},
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True
)
def process_compute_percent_task(self, **kwargs) -> Dict[str, Any]:
    """
    Execute PERCENT computation operation.
    
    Args:
        **kwargs: Task payload (same structure as TOTAL task)
    
    Returns:
        Dictionary with computation result
    """
    try:
        logger.info(
            "Starting PERCENT computation: task_id=%s, dw_id=%s, ius=%s, area=%s, period=%s",
            self.request.id, kwargs.get("dw_id"), kwargs.get("ius_gid"),
            kwargs.get("area_id"), kwargs.get("time_period")
        )
        
        # Validate required parameters
        required_params = ["dw_id", "ius_gid", "area_id", "time_period", "table_name"]
        for param in required_params:
            if not kwargs.get(param):
                raise ValueError(f"Missing required parameter: {param}")
        
        with bg_job_dw_audit_context(payload=kwargs):
            # Execute PERCENT operation
            service = ComputeOperationsService()
            result = service.execute_percent_operation(kwargs)
            
            # Add task metadata
            result.update({
                "task_id": self.request.id,
                "retries": self.request.retries,
                "execution_time": getattr(self.request, 'timelimit', None)
            })
            
            logger.info(
                "PERCENT computation completed: task_id=%s, value=%s",
                self.request.id, result.get("computed_value")
            )
            notify_dbmetadata_counts_changed(str(kwargs.get("dw_id", "")))
            return result
        
    except Exception as e:
        log_background_incident(
            message=(
                f"PERCENT computation failed: task_id={self.request.id}, dw_id={kwargs.get('dw_id')}, "
                f"ius={kwargs.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_TASK_PERCENT_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


@celery_app.task(
    bind=True,
    base=ProcessComputeTask,
    name="apps.compute_engine.tasks.process_compute.process_compute_time_task",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 30},
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True
)
def process_compute_time_task(self, **kwargs) -> Dict[str, Any]:
    """
    Execute TIME computation operation.
    
    Args:
        **kwargs: Task payload (same structure as TOTAL task)
    
    Returns:
        Dictionary with computation result
    """
    try:
        logger.info(
            "Starting TIME computation: task_id=%s, dw_id=%s, ius=%s, area=%s, period=%s",
            self.request.id, kwargs.get("dw_id"), kwargs.get("ius_gid"),
            kwargs.get("area_id"), kwargs.get("time_period")
        )
        
        # Validate required parameters
        required_params = ["dw_id", "ius_gid", "area_id", "time_period", "table_name"]
        for param in required_params:
            if not kwargs.get(param):
                raise ValueError(f"Missing required parameter: {param}")
        
        with bg_job_dw_audit_context(payload=kwargs):
            # Execute TIME operation
            service = ComputeOperationsService()
            result = service.execute_time_operation(kwargs)
            
            # Add task metadata
            result.update({
                "task_id": self.request.id,
                "retries": self.request.retries,
                "execution_time": getattr(self.request, 'timelimit', None)
            })
            
            logger.info(
                "TIME computation completed: task_id=%s, value=%s",
                self.request.id, result.get("computed_value")
            )
            notify_dbmetadata_counts_changed(str(kwargs.get("dw_id", "")))
            return result
        
    except Exception as e:
        log_background_incident(
            message=(
                f"TIME computation failed: task_id={self.request.id}, dw_id={kwargs.get('dw_id')}, "
                f"ius={kwargs.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_TASK_TIME_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


@celery_app.task(
    bind=True,
    base=ProcessComputeTask,
    name="apps.compute_engine.tasks.process_compute.process_compute_minus_task",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 30},
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True
)
def process_compute_minus_task(self, **kwargs) -> Dict[str, Any]:
    """
    Execute MINUS computation operation.
    
    Args:
        **kwargs: Task payload (same structure as TOTAL task)
    
    Returns:
        Dictionary with computation result
    """
    try:
        logger.info(
            "Starting MINUS computation: task_id=%s, dw_id=%s, ius=%s, area=%s, period=%s",
            self.request.id, kwargs.get("dw_id"), kwargs.get("ius_gid"),
            kwargs.get("area_id"), kwargs.get("time_period")
        )
        
        # Validate required parameters
        required_params = ["dw_id", "ius_gid", "area_id", "time_period", "table_name"]
        for param in required_params:
            if not kwargs.get(param):
                raise ValueError(f"Missing required parameter: {param}")
        
        with bg_job_dw_audit_context(payload=kwargs):
            # Execute MINUS operation
            service = ComputeOperationsService()
            result = service.execute_minus_operation(kwargs)
            
            # Add task metadata
            result.update({
                "task_id": self.request.id,
                "retries": self.request.retries,
                "execution_time": getattr(self.request, 'timelimit', None)
            })
            
            logger.info(
                "MINUS computation completed: task_id=%s, value=%s",
                self.request.id, result.get("computed_value")
            )
            notify_dbmetadata_counts_changed(str(kwargs.get("dw_id", "")))
            return result
        
    except Exception as e:
        log_background_incident(
            message=(
                f"MINUS computation failed: task_id={self.request.id}, dw_id={kwargs.get('dw_id')}, "
                f"ius={kwargs.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_TASK_MINUS_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


@celery_app.task(
    bind=True,
    base=ProcessComputeTask,
    name="apps.compute_engine.tasks.process_compute.process_compute_area_task",
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 30},
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def process_compute_area_task(self, **kwargs) -> Dict[str, Any]:
    """Execute AREA computation operation (spatial aggregation)."""
    try:
        logger.info(
            "Starting AREA computation: task_id=%s, dw_id=%s, ius=%s, area=%s, period=%s",
            self.request.id, kwargs.get("dw_id"), kwargs.get("ius_gid"),
            kwargs.get("area_id"), kwargs.get("time_period"),
        )

        required_params = ["dw_id", "ius_gid", "area_id", "time_period", "table_name"]
        for param in required_params:
            if not kwargs.get(param):
                raise ValueError(f"Missing required parameter: {param}")

        with bg_job_dw_audit_context(payload=kwargs):
            service = ComputeOperationsService()
            result = service.execute_area_operation(kwargs)

            result.update({
                "task_id": self.request.id,
                "retries": self.request.retries,
                "execution_time": getattr(self.request, 'timelimit', None),
            })

            logger.info(
                "AREA computation completed: task_id=%s, value=%s",
                self.request.id, result.get("computed_value"),
            )
            notify_dbmetadata_counts_changed(str(kwargs.get("dw_id", "")))
            return result

    except Exception as e:
        log_background_incident(
            message=(
                f"AREA computation failed: task_id={self.request.id}, dw_id={kwargs.get('dw_id')}, "
                f"ius={kwargs.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_TASK_AREA_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


# Synchronous versions for DB-based job queue
def execute_total_operation_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous TOTAL operation for DB-based job queue."""
    try:
        logger.info(
            "Starting sync TOTAL computation: dw_id=%s, ius=%s, area=%s, period=%s",
            payload.get("dw_id"), payload.get("ius_gid"),
            payload.get("area_id"), payload.get("time_period")
        )
        
        service = ComputeOperationsService()
        result = service.execute_total_operation(payload)
        
        logger.info(
            "Sync TOTAL computation completed: value=%s",
            result.get("computed_value")
        )
        notify_dbmetadata_counts_changed(str(payload.get("dw_id", "")))
        return result
        
    except Exception as e:
        log_background_incident(
            message=(
                f"Sync TOTAL computation failed: dw_id={payload.get('dw_id')}, "
                f"ius={payload.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_SYNC_TOTAL_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


def execute_percent_operation_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous PERCENT operation for DB-based job queue."""
    try:
        logger.info(
            "Starting sync PERCENT computation: dw_id=%s, ius=%s, area=%s, period=%s",
            payload.get("dw_id"), payload.get("ius_gid"),
            payload.get("area_id"), payload.get("time_period")
        )
        
        service = ComputeOperationsService()
        result = service.execute_percent_operation(payload)
        
        logger.info(
            "Sync PERCENT computation completed: value=%s",
            result.get("computed_value")
        )
        notify_dbmetadata_counts_changed(str(payload.get("dw_id", "")))
        return result
        
    except Exception as e:
        log_background_incident(
            message=(
                f"Sync PERCENT computation failed: dw_id={payload.get('dw_id')}, "
                f"ius={payload.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_SYNC_PERCENT_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


def execute_time_operation_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous TIME operation for DB-based job queue."""
    try:
        logger.info(
            "Starting sync TIME computation: dw_id=%s, ius=%s, area=%s, period=%s",
            payload.get("dw_id"), payload.get("ius_gid"),
            payload.get("area_id"), payload.get("time_period")
        )
        
        service = ComputeOperationsService()
        result = service.execute_time_operation(payload)
        
        logger.info(
            "Sync TIME computation completed: value=%s",
            result.get("computed_value")
        )
        notify_dbmetadata_counts_changed(str(payload.get("dw_id", "")))
        return result
        
    except Exception as e:
        log_background_incident(
            message=(
                f"Sync TIME computation failed: dw_id={payload.get('dw_id')}, "
                f"ius={payload.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_SYNC_TIME_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


def execute_minus_operation_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous MINUS operation for DB-based job queue."""
    try:
        logger.info(
            "Starting sync MINUS computation: dw_id=%s, ius=%s, area=%s, period=%s",
            payload.get("dw_id"), payload.get("ius_gid"),
            payload.get("area_id"), payload.get("time_period")
        )
        
        service = ComputeOperationsService()
        result = service.execute_minus_operation(payload)
        
        logger.info(
            "Sync MINUS computation completed: value=%s",
            result.get("computed_value")
        )
        notify_dbmetadata_counts_changed(str(payload.get("dw_id", "")))
        return result
        
    except Exception as e:
        log_background_incident(
            message=(
                f"Sync MINUS computation failed: dw_id={payload.get('dw_id')}, "
                f"ius={payload.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_SYNC_MINUS_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise


def execute_area_operation_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous AREA operation for DB-based job queue."""
    try:
        logger.info(
            "Starting sync AREA computation: dw_id=%s, ius=%s, area=%s, period=%s",
            payload.get("dw_id"), payload.get("ius_gid"),
            payload.get("area_id"), payload.get("time_period"),
        )

        service = ComputeOperationsService()
        result = service.execute_area_operation(payload)

        logger.info("Sync AREA computation completed: value=%s", result.get("computed_value"))
        notify_dbmetadata_counts_changed(str(payload.get("dw_id", "")))
        return result

    except Exception as e:
        log_background_incident(
            message=(
                f"Sync AREA computation failed: dw_id={payload.get('dw_id')}, "
                f"ius={payload.get('ius_gid')}, error={e}"
            ),
            error_code="COMPUTE_SYNC_AREA_FAILED",
            exc=e,
            source=_COMPUTE_PROCESS_SOURCE,
        )
        raise