"""
Process Service for Data Warehouse Compute Engine.

This service handles process orchestration operations including:
- Process definition creation and validation
- Execution request handling
- Job count calculation and chunking strategy
- Integration with background job dispatch system
- Progress tracking and status management
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import and_, text

from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
    OPERATION_AREA,
    STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_DONE, STATUS_CANCELLED,
    JOB_TYPE_COMPUTE_CREATE_JOBS, LOG_DETAILS_TABLE_TEMPLATE,
    DEFAULT_SRC_PUBLISHER, DEFAULT_SRC_TITLE,
)
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import NotFound
from apps.datawarehouse.models.datawarehouse import (
    CeProcessMaster, CeProcessTime, CeProcessTimeLog,
    CeIusComputeAddTarget, CeIusComputeDiv, CeIusComputeMinus, CeIusComputeTime,
    CeIusComputeArea, CeIusComputeAddSource, Area,
)
from apps.shared.services.bg_job_dispatch import dispatch_bg_job
from apps.shared.utils.ius_utils import get_ius_gid_separator
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_PROCESS_SERVICE_SOURCE = "apps.datawarehouse.services.process_service"


def _next_process_time_log_name(dw_db: Session, process_time_id: int) -> str:
    """Legacy Laravel: ``Log 1``, ``Log 2``, … per ``ce_process_time``."""
    count = (
        dw_db.query(CeProcessTimeLog)
        .filter(CeProcessTimeLog.process_time_id == process_time_id)
        .count()
    )
    return f"Log {count + 1}"


class ProcessService:
    """Service for managing compute engine processes."""
    
    def __init__(self):
        pass
    
    def _expand_areas_list(self, dw_db: Session, areas: List[str], locale: str) -> List[str]:
        """
        Expand 'all' in areas list to actual area IDs from the database.
        
        Args:
            dw_db: Data warehouse database session
            areas: List of area IDs, may contain 'all' or 'DEFAULT'
            locale: Language code for area name resolution
            
        Returns:
            List of specific area IDs (no 'all' or 'DEFAULT')
        """
        if not areas or areas == ["DEFAULT"]:
            areas = ["all"]
        
        if "all" in areas:
            # Query all area IDs from the data warehouse
            from apps.datawarehouse.models.datawarehouse import Area
            area_model = Area(locale)
            
            # Get all area IDs that have data
            area_ids = dw_db.query(area_model.area_id).filter(
                area_model.area_id.isnot(None)
            ).distinct().all()
            
            # Extract area_id strings from query results
            expanded_areas = [area[0] for area in area_ids if area[0]]
            
            # If no areas found, return a default area to prevent empty job generation
            if not expanded_areas:
                logger.warning("No areas found in database, using 'DEFAULT' as fallback")
                return ["DEFAULT"]
            
            logger.info(f"Expanded 'all' areas to {len(expanded_areas)} specific areas")
            return expanded_areas
        
        # Return areas as-is if no 'all' expansion needed
        return areas
    
    def _expand_timeperiods_list(self, dw_db: Session, timeperiods: List[str]) -> List[str]:
        """
        Expand 'all' in timeperiods list to actual timeperiod IDs from the database.
        
        Args:
            dw_db: Data warehouse database session
            timeperiods: List of timeperiod IDs, may contain 'all' or 'DEFAULT'
            
        Returns:
            List of specific timeperiod strings (no 'all' or 'DEFAULT')
        """
        if not timeperiods or timeperiods == ["DEFAULT"]:
            timeperiods = ["all"]
        
        if "all" in timeperiods:
            # Query all timeperiod strings from the data warehouse
            from apps.datawarehouse.models.datawarehouse import TimePeriod
            
            # Get all timeperiod strings that have data
            tp_strings = dw_db.query(TimePeriod.timeperiod).filter(
                TimePeriod.timeperiod.isnot(None)
            ).distinct().all()
            
            # Extract timeperiod strings from query results
            expanded_timeperiods = [tp[0] for tp in tp_strings if tp[0]]
            
            # If no timeperiods found, return a default to prevent empty job generation
            if not expanded_timeperiods:
                logger.warning("No timeperiods found in database, using 'DEFAULT' as fallback")
                return ["DEFAULT"]
            
            logger.info(f"Expanded 'all' timeperiods to {len(expanded_timeperiods)} specific timeperiods")
            return expanded_timeperiods
        
        # Return timeperiods as-is if no 'all' expansion needed
        return timeperiods
    
    def create_process_definition(self, dw_id: str, process_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new process definition (without time periods).
        
        Args:
            dw_id: Data warehouse ID
            process_data: Process configuration data
            
        Returns:
            Dictionary with created process information
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                process_master = CeProcessMaster(
                    dw_id=int(dw_id),
                    process_type=process_data["process_type"],
                    filter_object=json.dumps(process_data["filter_object"]),
                    created_at=datetime.utcnow()
                )
                dw_db.add(process_master)
                dw_db.commit()
                
                return {
                    "success": True,
                    "process_id": process_master.id,
                    "process_type": process_master.process_type,
                    "created_at": process_master.created_at.isoformat() if process_master.created_at else None
                }
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to create process definition: {e}",
                    error_code="PROCESS_CREATE_DEFINITION_FAILED",
                    exc=e,
                    source=_PROCESS_SERVICE_SOURCE,
                )
                raise

    def update_process_definition(
        self, dw_id: str, process_id: int, patch_filter: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Shallow-merge patch_filter into the process master JSON filter_object.
        """
        if not isinstance(patch_filter, dict):
            raise ValueError("filter_object patch must be an object")
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                process = dw_db.query(CeProcessMaster).filter(
                    and_(
                        CeProcessMaster.id == process_id,
                        CeProcessMaster.dw_id == int(dw_id),
                        CeProcessMaster.deleted_at.is_(None),
                    )
                ).first()
                if not process:
                    raise NotFound(f"Process {process_id} not found")
                try:
                    current = json.loads(process.filter_object or "{}")
                except (TypeError, json.JSONDecodeError):
                    current = {}
                if not isinstance(current, dict):
                    current = {}
                merged = {**current, **patch_filter}
                process.filter_object = json.dumps(merged)
                dw_db.commit()
                return {
                    "success": True,
                    "process_id": process.id,
                    "process_type": process.process_type,
                    "filter_object": merged,
                }
            except ValueError:
                dw_db.rollback()
                raise
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to update process definition: {e}",
                    error_code="PROCESS_UPDATE_DEFINITION_FAILED",
                    exc=e,
                    source=_PROCESS_SERVICE_SOURCE,
                )
                raise
    
    def create_process_time(self, dw_id: str, process_id: int, time_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a process time (execution with time periods).
        
        Args:
            dw_id: Data warehouse ID
            process_id: Process master ID
            time_data: Time period configuration
            
        Returns:
            Dictionary with created process time information
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                process_time = CeProcessTime(
                    dw_id=int(dw_id),
                    process_id=process_id,
                    filter_object=json.dumps(time_data["filter_object"]),
                    created_at=datetime.utcnow()
                )
                dw_db.add(process_time)
                dw_db.commit()
                
                return {
                    "success": True,
                    "process_time_id": process_time.id,
                    "process_id": process_id,
                    "created_at": process_time.created_at.isoformat() if process_time.created_at else None
                }
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to create process time: {e}",
                    error_code="PROCESS_CREATE_TIME_FAILED",
                    exc=e,
                    source=_PROCESS_SERVICE_SOURCE,
                )
                raise
    
    def execute_process(self, dw_id: str, process_id: int, execution_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a process by creating process time and initiating background jobs.
        
        Args:
            dw_id: Data warehouse ID
            process_id: Process master ID
            execution_data: Execution configuration including time periods
            
        Returns:
            Dictionary with execution result
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Get process master
                process_master = dw_db.query(CeProcessMaster).filter(
                    and_(
                        CeProcessMaster.id == process_id,
                        CeProcessMaster.dw_id == int(dw_id),
                        CeProcessMaster.deleted_at.is_(None)
                    )
                ).first()
                
                if not process_master:
                    raise NotFound(f"Process {process_id} not found")
                
                # Create process time
                process_time = CeProcessTime(
                    dw_id=int(dw_id),
                    process_id=process_id,
                    filter_object=json.dumps({
                        "timeperiods": execution_data["timeperiods"],
                        "timeperiods_name": execution_data.get("timeperiods_name", []),
                    }),
                    created_at=datetime.utcnow()
                )
                dw_db.add(process_time)
                dw_db.flush()  # Get the ID
                
                # Merge process master and time data
                merged_filter = self._merge_filter_objects(
                    json.loads(process_master.filter_object),
                    execution_data
                )
                
                # Calculate job count
                job_count = self._calculate_job_count(dw_db, dw_id, process_master.process_type, merged_filter)
                
                # Create process time log
                process_time_log = CeProcessTimeLog(
                    dw_id=int(dw_id),
                    process_time_id=process_time.id,
                    name=_next_process_time_log_name(dw_db, process_time.id),
                    filter_object=json.dumps(merged_filter),
                    status=STATUS_PENDING,
                    total_jobs=job_count,
                    total_executed=0,
                    total_pending=job_count,
                    total_failed=0,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                dw_db.add(process_time_log)
                dw_db.commit()

                process_time_id = process_time.id
                process_time_log_id = process_time_log.id
                process_type = process_master.process_type
                dispatch_priority = execution_data.get("priority", 0)
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to execute process: {e}",
                    error_code="PROCESS_EXECUTE_FAILED",
                    exc=e,
                    source=_PROCESS_SERVICE_SOURCE,
                )
                raise

        # After warehouse session closes: broker/Celery errors must not be misreported as DW MySQL failures.
        from apps.app_db.db.core import SessionLocal
        with SessionLocal() as app_db:
            dispatch_result = dispatch_bg_job(
                db=app_db,
                job_type=JOB_TYPE_COMPUTE_CREATE_JOBS,
                payload={
                    "dw_id": dw_id,
                    "process_time_log_id": process_time_log_id,
                    "process_type": process_type,
                    "filter_object": merged_filter
                },
                dw_id=str(dw_id),
                priority=dispatch_priority
            )

        return {
            "success": True,
            "process_time_id": process_time_id,
            "process_time_log_id": process_time_log_id,
            "estimated_jobs": job_count,
            "status": STATUS_PENDING,
            "dispatch_result": {
                "celery_task_id": dispatch_result.celery_task_id,
                "db_job_id": dispatch_result.db_job_id
            }
        }
    
    def re_execute_process_time(self, dw_id: str, process_time_id: int) -> Dict[str, Any]:
        """
        Re-execute an existing process time.
        
        Args:
            dw_id: Data warehouse ID
            process_time_id: Process time ID to re-execute
            
        Returns:
            Dictionary with re-execution result
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Get process time and master
                process_time = dw_db.query(CeProcessTime).filter(
                    and_(
                        CeProcessTime.id == process_time_id,
                        CeProcessTime.dw_id == int(dw_id),
                        CeProcessTime.deleted_at.is_(None)
                    )
                ).first()
                
                if not process_time:
                    raise NotFound(f"Process time {process_time_id} not found")
                
                process_master = dw_db.query(CeProcessMaster).filter(
                    CeProcessMaster.id == process_time.process_id
                ).first()
                
                if not process_master:
                    raise NotFound(f"Process master not found for process time {process_time_id}")
                
                # Merge filter objects (Laravel-style: master values are base, time filter layered on top,
                # defaults applied for src_publisher/src_title to mirror array_merge behaviour)
                master_filter = json.loads(process_master.filter_object)
                time_filter = json.loads(process_time.filter_object)
                merged_filter = self._merge_filter_objects(master_filter, time_filter)
                
                # Calculate job count
                job_count = self._calculate_job_count(dw_db, dw_id, process_master.process_type, merged_filter)
                
                # Create new process time log
                process_time_log = CeProcessTimeLog(
                    dw_id=int(dw_id),
                    process_time_id=process_time.id,
                    name=_next_process_time_log_name(dw_db, process_time.id),
                    filter_object=json.dumps(merged_filter),
                    status=STATUS_PENDING,
                    total_jobs=job_count,
                    total_executed=0,
                    total_pending=job_count,
                    total_failed=0,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                dw_db.add(process_time_log)
                dw_db.commit()

                process_time_log_id = process_time_log.id
                process_type = process_master.process_type
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to re-execute process time: {e}",
                    error_code="PROCESS_RE_EXECUTE_TIME_FAILED",
                    exc=e,
                    source=_PROCESS_SERVICE_SOURCE,
                )
                raise

        from apps.app_db.db.core import SessionLocal
        with SessionLocal() as app_db:
            dispatch_result = dispatch_bg_job(
                db=app_db,
                job_type=JOB_TYPE_COMPUTE_CREATE_JOBS,
                payload={
                    "dw_id": dw_id,
                    "process_time_log_id": process_time_log_id,
                    "process_type": process_type,
                    "filter_object": merged_filter
                },
                dw_id=str(dw_id)
            )

        return {
            "success": True,
            "process_time_log_id": process_time_log_id,
            "estimated_jobs": job_count,
            "status": STATUS_PENDING,
            "dispatch_result": {
                "celery_task_id": dispatch_result.celery_task_id,
                "db_job_id": dispatch_result.db_job_id
            }
        }

    def delete_process_time(self, dw_id: str, process_time_id: int) -> Dict[str, Any]:
        """
        Hard-delete a process-time row and all of its execution logs (legacy ``destroyProcessTime``).

        Drops each ``ce_process_time_log_{id}_details`` table, removes log rows, then the
        process-time row.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                process_time = dw_db.query(CeProcessTime).filter(
                    and_(
                        CeProcessTime.id == process_time_id,
                        CeProcessTime.dw_id == int(dw_id),
                        CeProcessTime.deleted_at.is_(None),
                    )
                ).first()

                if not process_time:
                    raise NotFound(f"Process time {process_time_id} not found")

                logs = dw_db.query(CeProcessTimeLog).filter(
                    CeProcessTimeLog.process_time_id == process_time_id
                ).all()

                tables_dropped: List[str] = []
                for log in logs:
                    table_name = LOG_DETAILS_TABLE_TEMPLATE.format(log_id=log.id)
                    dw_db.execute(text(f"DROP TABLE IF EXISTS `{table_name}`"))
                    tables_dropped.append(table_name)
                    dw_db.delete(log)

                dw_db.flush()
                dw_db.delete(process_time)
                dw_db.commit()

                return {
                    "success": True,
                    "process_time_id": process_time_id,
                    "logs_deleted": len(logs),
                    "detail_tables_dropped": tables_dropped,
                }
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to delete process time: {e}",
                    error_code="PROCESS_DELETE_TIME_FAILED",
                    exc=e,
                    source=_PROCESS_SERVICE_SOURCE,
                )
                raise
    
    def get_process_list(self, dw_id: str, process_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get list of process definitions.
        
        Args:
            dw_id: Data warehouse ID
            process_type: Optional filter by process type
            
        Returns:
            List of process definitions
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            query = dw_db.query(CeProcessMaster).filter(
                and_(
                    CeProcessMaster.dw_id == int(dw_id),
                    CeProcessMaster.deleted_at.is_(None)
                )
            )
            
            if process_type:
                query = query.filter(CeProcessMaster.process_type == process_type)
            
            processes = query.order_by(CeProcessMaster.created_at.desc()).all()
            
            result = []
            for process in processes:
                # Get associated process times count
                times_count = dw_db.query(CeProcessTime).filter(
                    and_(
                        CeProcessTime.process_id == process.id,
                        CeProcessTime.deleted_at.is_(None)
                    )
                ).count()
                
                result.append({
                    "id": process.id,
                    "process_type": process.process_type,
                    "filter_object": json.loads(process.filter_object),
                    "created_at": process.created_at.isoformat() if process.created_at else None,
                    "times_count": times_count
                })
            
            return result
    
    def delete_process(self, dw_id: str, process_id: int) -> Dict[str, Any]:
        """
        Hard-cascade delete a process definition.

        Matches Laravel's ProcessController@destroy exactly:
        1. Locate the CeProcessMaster row.
        2. For every CeProcessTime that belongs to it:
           a. For every CeProcessTimeLog that belongs to that time:
              - DROP TABLE IF EXISTS ce_process_time_log_{id}_details
              - Hard-delete the CeProcessTimeLog row.
           b. Hard-delete the CeProcessTime row.
        3. Hard-delete the CeProcessMaster row.

        Args:
            dw_id: Data warehouse ID
            process_id: Process ID to delete

        Returns:
            Dictionary with deletion result including counts
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                process = dw_db.query(CeProcessMaster).filter(
                    and_(
                        CeProcessMaster.id == process_id,
                        CeProcessMaster.dw_id == int(dw_id),
                    )
                ).first()

                if not process:
                    raise NotFound(f"Process {process_id} not found")

                process_times = dw_db.query(CeProcessTime).filter(
                    CeProcessTime.process_id == process_id
                ).all()

                tables_dropped: List[str] = []
                logs_deleted = 0
                times_deleted = 0

                for pt in process_times:
                    logs = dw_db.query(CeProcessTimeLog).filter(
                        CeProcessTimeLog.process_time_id == pt.id
                    ).all()

                    for log in logs:
                        table_name = LOG_DETAILS_TABLE_TEMPLATE.format(log_id=log.id)
                        dw_db.execute(text(f"DROP TABLE IF EXISTS `{table_name}`"))
                        tables_dropped.append(table_name)
                        dw_db.delete(log)
                        logs_deleted += 1

                    # Flush log deletes to MySQL before removing the parent
                    # process_time row — required because the FK is ON DELETE RESTRICT.
                    dw_db.flush()

                    dw_db.delete(pt)
                    times_deleted += 1

                # Flush process_time deletes before removing the master row.
                dw_db.flush()

                dw_db.delete(process)
                dw_db.commit()

                logger.info(
                    "Deleted process %s: %d process_time(s), %d log(s), %d detail table(s) dropped",
                    process_id, times_deleted, logs_deleted, len(tables_dropped),
                )

                return {
                    "success": True,
                    "process_id": process_id,
                    "process_times_deleted": times_deleted,
                    "logs_deleted": logs_deleted,
                    "detail_tables_dropped": tables_dropped,
                }

            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to delete process: {e}",
                    error_code="PROCESS_DELETE_FAILED",
                    exc=e,
                    source=_PROCESS_SERVICE_SOURCE,
                )
                raise
    
    def create_jobs_for_process_time_log(self, dw_id: str, process_time_log_id: int) -> Dict[str, Any]:
        """
        Create individual computation jobs for a process time log.
        This is called by the CreateJobs background task.
        
        Args:
            dw_id: Data warehouse ID
            process_time_log_id: Process time log ID
            
        Returns:
            Dictionary with job creation result
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Get process time log
                log = dw_db.query(CeProcessTimeLog).filter(
                    and_(
                        CeProcessTimeLog.id == process_time_log_id,
                        CeProcessTimeLog.dw_id == int(dw_id)
                    )
                ).first()
                
                if not log:
                    raise NotFound(f"Process time log {process_time_log_id} not found")
                
                # Update status to in progress
                log.status = STATUS_IN_PROGRESS
                log.updated_at = datetime.utcnow()
                
                # Create dynamic log table
                table_name = LOG_DETAILS_TABLE_TEMPLATE.format(log_id=process_time_log_id)
                self._create_log_details_table(dw_db, table_name)
                
                # Parse filter object
                filter_obj = json.loads(log.filter_object)
                
                # Get process master to determine type
                process_time = dw_db.query(CeProcessTime).filter(
                    CeProcessTime.id == log.process_time_id
                ).first()
                process_master = dw_db.query(CeProcessMaster).filter(
                    CeProcessMaster.id == process_time.process_id
                ).first()
                
                # Generate individual jobs based on process type
                jobs_created = self._generate_compute_jobs(
                    dw_db, dw_id, process_master.process_type, filter_obj, table_name
                )
                
                # Update log with actual job count
                log.total_jobs = jobs_created
                log.total_pending = jobs_created
                dw_db.commit()
                
                return {
                    "success": True,
                    "jobs_created": jobs_created,
                    "table_name": table_name,
                    "process_time_log_id": process_time_log_id
                }
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to create jobs for process time log: {e}",
                    error_code="PROCESS_CREATE_JOBS_FOR_LOG_FAILED",
                    exc=e,
                    source=_PROCESS_SERVICE_SOURCE,
                )
                raise
    
    def _merge_filter_objects(self, master_filter: Dict[str, Any], execution_data: Dict[str, Any]) -> Dict[str, Any]:
        """Merge process master filter with execution time data (Laravel-style)."""
        merged = master_filter.copy()
        
        # Add time periods from execution data (Laravel format)
        if "timeperiods" in execution_data:
            merged["timeperiods"] = execution_data["timeperiods"]
        
        if "timeperiods_name" in execution_data:
            merged["timeperiods_name"] = execution_data["timeperiods_name"]
            
        # Add execution metadata
        if "name" in execution_data:
            merged["execution_name"] = execution_data["name"]
            
        if "priority" in execution_data:
            merged["priority"] = execution_data["priority"]
            
        # Add source information for computed data (Laravel approach).
        # Prefer execution-time override → existing master value → hard-coded fallback.
        # Use 'or' so an explicit None in execution_data does not overwrite a valid master value.
        if "src_publisher" in execution_data:
            merged["src_publisher"] = execution_data["src_publisher"] or merged.get("src_publisher") or DEFAULT_SRC_PUBLISHER
        else:
            merged["src_publisher"] = merged.get("src_publisher") or DEFAULT_SRC_PUBLISHER

        if "src_title" in execution_data:
            merged["src_title"] = execution_data["src_title"] or merged.get("src_title") or DEFAULT_SRC_TITLE
        else:
            merged["src_title"] = merged.get("src_title") or DEFAULT_SRC_TITLE
        
        return merged
    
    def _create_job_payload_for_operation(
        self,
        dw_db: Session,
        dw_id: str,
        process_type: str,
        ius_gid: str,
        area_id: str,
        time_period: str,
        table_name: str,
        filter_obj: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create operation-specific job payload matching Laravel's exact structure.
        
        Each operation type has different payload structure in Laravel.
        """
        # Parse IUS GID
        from apps.shared.utils.ius_utils import parse_ius_gid
        i_gid, u_gid, s_gid = parse_ius_gid(ius_gid)
        
        # Extract process_time_log_id from table_name (ce_process_time_log_1_details -> 1)
        import re
        process_time_log_id = 0
        match = re.search(r'ce_process_time_log_(\d+)_details', table_name)
        if match:
            process_time_log_id = int(match.group(1))
        
        # Common payload fields (Laravel structure)
        base_payload = {
            "dw_id": dw_id,
            "ius_gid": ius_gid,
            "area_id": area_id,
            "time_period": time_period,
            "process_type": process_type,
            "table_name": table_name,
            "filter_object": {
                **filter_obj,
                "process_time_log_id": process_time_log_id  # Add for logging
            },
            # Laravel source information — use 'or' to guard against explicit null stored in DB
            "src_publisher": filter_obj.get("src_publisher") or DEFAULT_SRC_PUBLISHER,
            "src_title": filter_obj.get("src_title") or DEFAULT_SRC_TITLE
        }
        
        # Add operation-specific fields based on process type
        if process_type == "TOTAL":
            return self._create_total_job_payload(dw_db, dw_id, i_gid, u_gid, s_gid, base_payload)
        elif process_type == "PERCENT":
            return self._create_percent_job_payload(dw_db, dw_id, i_gid, u_gid, s_gid, base_payload)
        elif process_type == "MINUS":
            return self._create_minus_job_payload(dw_db, dw_id, i_gid, u_gid, s_gid, base_payload)
        elif process_type == "TIME":
            return self._create_time_job_payload(dw_db, dw_id, i_gid, u_gid, s_gid, base_payload)
        elif process_type == "AREA":
            return self._create_area_job_payload(dw_db, dw_id, i_gid, u_gid, s_gid, base_payload)
        else:
            return base_payload
    
    def _create_total_job_payload(
        self, 
        dw_db: Session, 
        dw_id: str, 
        i_gid: str, 
        u_gid: str, 
        s_gid: str, 
        base_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create TOTAL operation job payload matching Laravel's createJobsForTotal structure."""
        # Get TOTAL formula
        target_formula = dw_db.query(CeIusComputeAddTarget).filter(
            and_(
                CeIusComputeAddTarget.dw_id == int(dw_id),
                CeIusComputeAddTarget.i_gid == i_gid,
                CeIusComputeAddTarget.u_gid == u_gid,
                CeIusComputeAddTarget.s_gid == s_gid
            )
        ).first()
        
        if not target_formula:
            return base_payload
        
        # Get source formulas
        source_formulas = dw_db.query(CeIusComputeAddSource).filter(
            CeIusComputeAddSource.target_id == target_formula.id
        ).all()
        
        # Laravel TOTAL job structure
        base_payload.update({
            "target_ius": {
                'i': i_gid,
                'u': u_gid,
                's': s_gid
            },
            "target_ius_name": target_formula.ius_name,
            "source_ius": [
                {
                    'i': src.i_gid,
                    'u': src.u_gid,
                    's': src.s_gid
                } for src in source_formulas
            ],
            "source_ius_name": [
                {'name': src.ius_name} for src in source_formulas
            ],
            "decimals": target_formula.target_decimal
        })
        
        return base_payload
    
    def _create_percent_job_payload(
        self, 
        dw_db: Session, 
        dw_id: str, 
        i_gid: str, 
        u_gid: str, 
        s_gid: str, 
        base_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create PERCENT operation job payload matching Laravel's createJobsForPercent structure."""
        # Get PERCENT formula
        percent_formula = dw_db.query(CeIusComputeDiv).filter(
            and_(
                CeIusComputeDiv.dw_id == int(dw_id),
                CeIusComputeDiv.i_gid == i_gid,
                CeIusComputeDiv.u_gid == u_gid,
                CeIusComputeDiv.s_gid == s_gid
            )
        ).first()
        
        if not percent_formula:
            return base_payload
        
        # Laravel PERCENT job structure
        base_payload.update({
            "target_ius": {
                'i': i_gid,
                'u': u_gid,
                's': s_gid
            },
            "target_ius_name": percent_formula.ius_name,
            "numer_ius": {
                'i': percent_formula.num_i_gid,
                'u': percent_formula.num_u_gid,
                's': percent_formula.num_s_gid
            },
            "numer_ius_name": percent_formula.num_ius_name,
            "denom_ius": {
                'i': percent_formula.den_i_gid,
                'u': percent_formula.den_u_gid,
                's': percent_formula.den_s_gid
            },
            "denom_ius_name": percent_formula.den_ius_name,
            "den_area": percent_formula.den_area_id if percent_formula.den_area_specific else "",
            "den_multi": float(percent_formula.den_multiplier) if percent_formula.den_multiplier else None,
            "is_most_recent": percent_formula.is_most_recent,
            "decimals": percent_formula.target_decimal
        })
        
        return base_payload
    
    def _create_minus_job_payload(
        self, 
        dw_db: Session, 
        dw_id: str, 
        i_gid: str, 
        u_gid: str, 
        s_gid: str, 
        base_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create MINUS operation job payload matching Laravel's createJobsForMinus structure."""
        # Get MINUS formula
        minus_formula = dw_db.query(CeIusComputeMinus).filter(
            and_(
                CeIusComputeMinus.dw_id == int(dw_id),
                CeIusComputeMinus.i_gid == i_gid,
                CeIusComputeMinus.u_gid == u_gid,
                CeIusComputeMinus.s_gid == s_gid
            )
        ).first()
        
        if not minus_formula:
            return base_payload
        
        # Laravel MINUS job structure
        base_payload.update({
            "target_ius": {
                'i': i_gid,
                'u': u_gid,
                's': s_gid
            },
            "target_ius_name": minus_formula.ius_name,
            "minuend_ius": {
                'i': minus_formula.min_i_gid,
                'u': minus_formula.min_u_gid,
                's': minus_formula.min_s_gid
            },
            "minuend_ius_name": minus_formula.min_ius_name,
            "subtrahend_ius": {
                'i': minus_formula.sub_i_gid,
                'u': minus_formula.sub_u_gid,
                's': minus_formula.sub_s_gid
            },
            "subtrahend_ius_name": minus_formula.sub_ius_name,
            "decimals": minus_formula.target_decimal
        })
        
        return base_payload
    
    def _create_time_job_payload(
        self, 
        dw_db: Session, 
        dw_id: str, 
        i_gid: str, 
        u_gid: str, 
        s_gid: str, 
        base_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create TIME operation job payload matching Laravel's createJobsForTime structure."""
        # Get TIME formula
        time_formula = dw_db.query(CeIusComputeTime).filter(
            and_(
                CeIusComputeTime.dw_id == int(dw_id),
                CeIusComputeTime.i_gid == i_gid,
                CeIusComputeTime.u_gid == u_gid,
                CeIusComputeTime.s_gid == s_gid
            )
        ).first()
        
        if not time_formula:
            return base_payload
        
        # Laravel TIME job structure
        base_payload.update({
            "target_ius": {
                'i': i_gid,
                'u': u_gid,
                's': s_gid
            },
            "target_ius_name": time_formula.ius_name,
            "target_tp_freq": time_formula.target_tp_freq,
            "source_tp_freq": time_formula.source_tp_freq,
            "aggregation_type": time_formula.aggregation_type,
            "decimals": time_formula.target_decimal
        })
        
        return base_payload

    def _create_area_job_payload(
        self,
        dw_db: Session,
        dw_id: str,
        i_gid: str,
        u_gid: str,
        s_gid: str,
        base_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Create AREA operation job payload with formula-specific fields."""
        area_formula = dw_db.query(CeIusComputeArea).filter(
            and_(
                CeIusComputeArea.dw_id == int(dw_id),
                CeIusComputeArea.i_gid == i_gid,
                CeIusComputeArea.u_gid == u_gid,
                CeIusComputeArea.s_gid == s_gid,
            )
        ).first()

        if not area_formula:
            return base_payload

        base_payload.update({
            "target_ius": {"i": i_gid, "u": u_gid, "s": s_gid},
            "target_ius_name": area_formula.ius_name,
            "target_area_level": area_formula.target_area_level,
            "source_area_level": area_formula.source_area_level,
            "aggregation_type": area_formula.aggregation_type,
            "populate_mid_levels": bool(area_formula.populate_mid_levels),
            "decimals": area_formula.target_decimal,
        })

        return base_payload

    def _calculate_job_count(self, dw_db: Session, dw_id: str, process_type: str, filter_obj: Dict[str, Any]) -> int:
        """
        Calculate estimated number of jobs for a process execution.
        
        Expands 'all' to actual counts for accurate job estimation following Laravel approach.
        Formula: ius_count × area_count × time_period_count
        """
        # Get IUS count — use the same filter logic as job generation for accuracy
        target_ius_filter = filter_obj.get("ius_selection", {}).get("target_ius", "all")
        ius_combinations = self._get_ius_combinations_for_process_type(dw_db, dw_id, process_type, target_ius_filter)
        ius_count = len(ius_combinations) if ius_combinations else 1
        
        from apps.datawarehouse.models.datawarehouse import get_default_locale
        locale = get_default_locale(dw_db)

        # Get time period count by expanding 'all' to actual timeperiods
        raw_timeperiods = filter_obj.get("timeperiods", ["DEFAULT"])
        timeperiods = self._expand_timeperiods_list(dw_db, raw_timeperiods)
        time_period_count = len(timeperiods)

        if process_type == OPERATION_AREA:
            areas_by_ius = self._resolve_area_targets_for_ius(dw_db, dw_id, ius_combinations, locale)
            total = 0
            for ius_gid in ius_combinations:
                total += len(areas_by_ius.get(ius_gid, [])) * time_period_count
            return total if total > 0 else ius_count * time_period_count

        # Get area count by expanding 'all' to actual areas
        raw_areas = filter_obj.get("areas", ["DEFAULT"])
        areas = self._expand_areas_list(dw_db, raw_areas, locale)
        area_count = len(areas)

        return ius_count * area_count * time_period_count
    
    def _create_log_details_table(self, dw_db: Session, table_name: str) -> None:
        """
        Create dynamic log details table matching Laravel's exact structure.
        
        This matches the Laravel CreateJobs::createTableToInsertLog method exactly.
        """
        create_sql = f"""
        CREATE TABLE IF NOT EXISTS `{table_name}` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `process_time_log_id` INT UNSIGNED,
            `process_type` ENUM('TOTAL', 'PERCENT', 'TIME', 'MINUS', 'AREA'),
            `status` ENUM('PASSED', 'FAILED') NULL,
            `target_ius_gid` VARCHAR(255),
            `target_ius_name` VARCHAR(255) NULL,
            `area_id` VARCHAR(100),
            `area_name` VARCHAR(100),
            `time_period` VARCHAR(50),
            `data_value` DOUBLE NULL,
            `source_name` VARCHAR(255) NULL,
            `remarks` VARCHAR(255) NULL,
            `source_details` LONGTEXT,
            `created_at` DATETIME,
            INDEX(`process_time_log_id`),
            INDEX(`process_type`)
        )
        """
        dw_db.execute(text(create_sql))
    
    def _generate_compute_jobs(
        self, 
        dw_db: Session, 
        dw_id: str, 
        process_type: str, 
        filter_obj: Dict[str, Any], 
        table_name: str
    ) -> int:
        """
        Generate individual compute jobs and dispatch them to appropriate queues.
        
        Returns:
            Number of jobs created
        """
        jobs_created = 0
        
        # Get IUS combinations — filtered by target_ius from the process definition (matches Laravel's prepareGetTargetIUSs)
        target_ius_filter = filter_obj.get("ius_selection", {}).get("target_ius", "all")
        ius_combinations = self._get_ius_combinations_for_process_type(dw_db, dw_id, process_type, target_ius_filter)
        
        # Get areas and time periods from filter and expand 'all' to specific lists
        from apps.datawarehouse.models.datawarehouse import get_default_locale
        locale = get_default_locale(dw_db)

        raw_time_periods = filter_obj.get("timeperiods", ["DEFAULT"])
        time_periods = self._expand_timeperiods_list(dw_db, raw_time_periods)

        if process_type == OPERATION_AREA:
            # AREA ignores filter_obj.areas — compute for ALL areas at each
            # formula's target level.  We dispatch one job per (ius, target_area, tp).
            areas_by_ius = self._resolve_area_targets_for_ius(dw_db, dw_id, ius_combinations, locale)
        else:
            raw_areas = filter_obj.get("areas", ["DEFAULT"])
            areas_by_ius = None  # not used
            areas = self._expand_areas_list(dw_db, raw_areas, locale)

        # Generate jobs for each combination
        for ius_gid in ius_combinations:
            ius_areas = areas_by_ius[ius_gid] if areas_by_ius else areas
            for area_id in ius_areas:
                for time_period in time_periods:
                    job_payload = self._create_job_payload_for_operation(
                        dw_db, dw_id, process_type, ius_gid, area_id, time_period, 
                        table_name, filter_obj
                    )
                    
                    job_type = self._get_job_type_for_process_type(process_type)
                    
                    from apps.app_db.db.core import SessionLocal
                    with SessionLocal() as app_db:
                        dispatch_bg_job(
                            db=app_db,
                            job_type=job_type,
                            payload=job_payload,
                            dw_id=str(dw_id)
                        )
                    
                    jobs_created += 1
        
        return jobs_created

    def _resolve_area_targets_for_ius(
        self,
        dw_db: Session,
        dw_id: str,
        ius_combinations: List[str],
        locale: str,
    ) -> Dict[str, List[str]]:
        """
        For each IUS with an AREA formula, return the list of ``area_id`` values
        at the formula's target_area_level.

        This replaces the normal ``filter_obj.areas`` expansion for AREA ops.
        """
        AreaModel = Area(locale)
        result: Dict[str, List[str]] = {}
        separator = get_ius_gid_separator()

        for ius_gid in ius_combinations:
            parts = ius_gid.split(separator)
            if len(parts) != 3:
                result[ius_gid] = []
                continue
            i_gid, u_gid, s_gid = parts

            formula = dw_db.query(CeIusComputeArea).filter(
                and_(
                    CeIusComputeArea.dw_id == int(dw_id),
                    CeIusComputeArea.i_gid == i_gid,
                    CeIusComputeArea.u_gid == u_gid,
                    CeIusComputeArea.s_gid == s_gid,
                )
            ).first()

            if not formula:
                result[ius_gid] = []
                continue

            target_areas = dw_db.query(AreaModel.area_id).filter(
                AreaModel.area_level == formula.target_area_level,
            ).all()
            result[ius_gid] = [row.area_id for row in target_areas]

        return result
    
    def list_formula_target_ius_gids(self, dw_id: str, process_type: str) -> List[str]:
        """
        Distinct IUS GIDs that have a saved compute formula for ``process_type``.

        Matches legacy Laravel ``getTargetIUSs`` / execute-picker behaviour: only targets
        registered in ``ce_ius_compute_*`` tables (TOTAL / PERCENT / MINUS / TIME / AREA).
        """
        valid = (
            OPERATION_TOTAL,
            OPERATION_PERCENT,
            OPERATION_TIME,
            OPERATION_MINUS,
            OPERATION_AREA,
        )
        if process_type not in valid:
            raise ValueError(f"Invalid process type. Must be one of: {list(valid)}")
        with get_warehouse_session_from_id(dw_id) as dw_db:
            raw = self._get_ius_combinations_for_process_type(
                dw_db, dw_id, process_type, "all"
            )
        # Stable order; de-duplicate (e.g. duplicate TOTAL target rows should not appear twice)
        return sorted(set(raw))

    def _get_ius_combinations_for_process_type(
        self,
        dw_db: Session,
        dw_id: str,
        process_type: str,
        target_ius_filter: "str | list" = "all"
    ) -> List[str]:
        """
        Return IUS GID strings that have formulas for the given process type,
        optionally filtered to only those present in target_ius_filter.

        target_ius_filter mirrors Laravel's targetIUS field:
          - "all" (or any non-list)  → return every formula row
          - list of GID strings      → return only matching rows (Laravel whereIn equivalent)
        """
        ius_combinations = []
        separator = get_ius_gid_separator()

        if process_type == OPERATION_TOTAL:
            targets = dw_db.query(CeIusComputeAddTarget).filter(
                CeIusComputeAddTarget.dw_id == int(dw_id)
            ).order_by(CeIusComputeAddTarget.order.asc()).all()
            ius_combinations = [f"{t.i_gid}{separator}{t.u_gid}{separator}{t.s_gid}" for t in targets]

        elif process_type == OPERATION_PERCENT:
            formulas = dw_db.query(CeIusComputeDiv).filter(
                CeIusComputeDiv.dw_id == int(dw_id)
            ).all()
            ius_combinations = [f"{f.i_gid}{separator}{f.u_gid}{separator}{f.s_gid}" for f in formulas]

        elif process_type == OPERATION_TIME:
            formulas = dw_db.query(CeIusComputeTime).filter(
                CeIusComputeTime.dw_id == int(dw_id)
            ).all()
            ius_combinations = [f"{f.i_gid}{separator}{f.u_gid}{separator}{f.s_gid}" for f in formulas]

        elif process_type == OPERATION_MINUS:
            formulas = dw_db.query(CeIusComputeMinus).filter(
                CeIusComputeMinus.dw_id == int(dw_id)
            ).all()
            ius_combinations = [f"{f.i_gid}{separator}{f.u_gid}{separator}{f.s_gid}" for f in formulas]

        elif process_type == OPERATION_AREA:
            formulas = dw_db.query(CeIusComputeArea).filter(
                CeIusComputeArea.dw_id == int(dw_id)
            ).all()
            ius_combinations = [f"{f.i_gid}{separator}{f.u_gid}{separator}{f.s_gid}" for f in formulas]

        # Apply target_ius filter (Laravel: whereIn on CONCAT(i_gid, delim, u_gid, delim, s_gid))
        if isinstance(target_ius_filter, list) and target_ius_filter:
            allowed = set(target_ius_filter)
            ius_combinations = [gid for gid in ius_combinations if gid in allowed]

        return ius_combinations
    
    def _get_job_type_for_process_type(self, process_type: str) -> str:
        """Map process type to background job type."""
        from apps.datawarehouse.constants import (
            JOB_TYPE_COMPUTE_TOTAL, JOB_TYPE_COMPUTE_PERCENT,
            JOB_TYPE_COMPUTE_TIME, JOB_TYPE_COMPUTE_MINUS,
            JOB_TYPE_COMPUTE_AREA,
        )
        
        mapping = {
            OPERATION_TOTAL: JOB_TYPE_COMPUTE_TOTAL,
            OPERATION_PERCENT: JOB_TYPE_COMPUTE_PERCENT,
            OPERATION_TIME: JOB_TYPE_COMPUTE_TIME,
            OPERATION_MINUS: JOB_TYPE_COMPUTE_MINUS,
            OPERATION_AREA: JOB_TYPE_COMPUTE_AREA,
        }
        
        return mapping.get(process_type, JOB_TYPE_COMPUTE_TOTAL)