"""
Response Schemas for Compute Engine.

Pydantic models for API response validation and documentation.
These schemas handle common response patterns and log/monitoring data.
"""

from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field
from apps.datawarehouse.constants import (
    JOB_STATUS_PASSED, JOB_STATUS_FAILED
)


class ApiResponse(BaseModel):
    """Base API response schema."""
    success: bool = Field(..., description="Operation success status")
    message: Optional[str] = Field(None, description="Response message")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Response timestamp")


class PaginatedResponse(BaseModel):
    """Base paginated response schema."""
    total_count: int = Field(..., description="Total number of items")
    limit: int = Field(..., description="Items per page limit")
    offset: int = Field(..., description="Items offset/skip")
    has_more: bool = Field(..., description="Whether more items are available")


class ExecutionLogItem(BaseModel):
    """Execution log item schema."""
    id: int = Field(..., description="Log ID")
    name: str = Field(..., description="Execution name")
    status: str = Field(..., description="Execution status")
    process_type: Optional[str] = Field(None, description="Process type")
    total_jobs: Optional[int] = Field(None, description="Total number of jobs")
    total_executed: Optional[int] = Field(None, description="Number of executed jobs")
    total_pending: Optional[int] = Field(None, description="Number of pending jobs")
    total_failed: Optional[int] = Field(None, description="Number of failed jobs")
    progress_percentage: float = Field(..., description="Progress percentage")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    remarks: Optional[str] = Field(None, description="Execution remarks")


class ExecutionLogsResponse(PaginatedResponse):
    """Response schema for execution logs list."""
    logs: List[ExecutionLogItem] = Field(..., description="List of execution logs")
    status_filter: Optional[str] = Field(None, description="Applied status filter")


class ProcessTimeperiodItem(BaseModel):
    """One ``ce_process_time`` row for the process-time grid (legacy Laravel shape)."""
    process_time_id: int = Field(..., description="``ce_process_time`` row id (process time primary key)")
    created_at: Optional[str] = Field(None, description="``ce_process_time.created_at`` (ISO8601)")
    timeperiod_labels: List[str] = Field(
        default_factory=list,
        description="Human-readable period labels from filter_object (``timeperiods_name`` / ``timeperiodsName``)",
    )
    timeperiod_display: str = Field(
        ...,
        description="Comma-joined Time column text (one label when a single period was selected)",
    )
    timeperiod: Optional[str] = Field(
        None,
        description="Same as ``timeperiod_display`` (sort/search compatibility)",
    )
    timeperiod_name: Optional[str] = Field(
        None,
        description="Single label when only one period; otherwise joined display",
    )
    execution_name: Optional[str] = Field(
        None,
        description="User-provided run label from the latest ``ce_process_time_logs`` filter_object",
    )


class ProcessTimeperiodsResponse(BaseModel):
    """Payload shape for GET /dw/{dw_id}/compute/logs/process/{process_id} (time periods only)."""
    process_id: int = Field(..., description="Process master ID")
    timeperiods: List[ProcessTimeperiodItem] = Field(
        default_factory=list,
        description="Expanded timeperiod selections from process time rows",
    )
    total_count: int = Field(..., description="Number of timeperiod entries returned")


class TimeLogItem(BaseModel):
    """Time log item schema."""
    id: int = Field(..., description="Log ID")
    name: str = Field(..., description="Execution name")
    status: str = Field(..., description="Execution status")
    total_jobs: Optional[int] = Field(None, description="Total number of jobs")
    total_executed: Optional[int] = Field(None, description="Number of executed jobs")
    total_pending: Optional[int] = Field(None, description="Number of pending jobs")
    total_failed: Optional[int] = Field(None, description="Number of failed jobs")
    progress_percentage: float = Field(..., description="Progress percentage")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    remarks: Optional[str] = Field(None, description="Execution remarks")
    filter_object: Dict[str, Any] = Field(..., description="Execution filter configuration")


class TimeLogsResponse(BaseModel):
    """Response schema for process time logs."""
    process_time_id: int = Field(..., description="Process time ID")
    logs: List[TimeLogItem] = Field(..., description="List of time logs")
    total_count: int = Field(..., description="Total number of logs")


class JobDetailItem(BaseModel):
    """Job detail item schema."""
    id: int = Field(..., description="Job detail ID")
    ius_gid: str = Field(..., description="IUS GID")
    area_id: str = Field(..., description="Area ID")
    time_period: str = Field(..., description="Time period")
    job_payload: Dict[str, Any] = Field(..., description="Job payload")
    job_status: str = Field(..., description="Job status")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")


class LogDetailInfo(BaseModel):
    """Log detail information schema."""
    id: int = Field(..., description="Log ID")
    name: str = Field(..., description="Execution name")
    status: str = Field(..., description="Execution status")
    total_jobs: int = Field(..., description="Total number of jobs")
    total_executed: int = Field(..., description="Number of executed jobs")
    total_pending: int = Field(..., description="Number of pending jobs")
    total_failed: int = Field(..., description="Number of failed jobs")
    progress_percentage: float = Field(..., description="Progress percentage")


class LogDetailsResponse(PaginatedResponse):
    """Response schema for detailed job logs."""
    log_info: LogDetailInfo = Field(..., description="Log summary information")
    details: List[JobDetailItem] = Field(..., description="Detailed job records")
    status_filter: Optional[str] = Field(None, description="Applied status filter")


class ExecutionSummaryStats(BaseModel):
    """Execution summary statistics schema."""
    status_counts: Dict[str, int] = Field(..., description="Count by status")
    total_executions: int = Field(..., description="Total number of executions")


class RecentExecutionItem(BaseModel):
    """Recent execution item schema."""
    id: int = Field(..., description="Log ID")
    name: str = Field(..., description="Execution name")
    status: str = Field(..., description="Execution status")
    created_at: datetime = Field(..., description="Creation timestamp")
    progress_percentage: float = Field(..., description="Progress percentage")


class ExecutionSummaryResponse(BaseModel):
    """Response schema for execution summary."""
    summary_stats: ExecutionSummaryStats = Field(..., description="Summary statistics")
    recent_executions: List[RecentExecutionItem] = Field(..., description="Recent executions")


class ProgressUpdateResponse(BaseModel):
    """Response schema for progress updates."""
    success: bool = Field(..., description="Update success status")
    log_id: int = Field(..., description="Log ID")
    status: str = Field(..., description="Updated status")
    total_jobs: int = Field(..., description="Total number of jobs")
    total_executed: int = Field(..., description="Number of executed jobs")
    total_pending: int = Field(..., description="Number of pending jobs")
    total_failed: int = Field(..., description="Number of failed jobs")
    progress_percentage: float = Field(..., description="Progress percentage")
    message: Optional[str] = Field(None, description="Update message")


class ComputationResult(BaseModel):
    """Computation result schema."""
    success: bool = Field(..., description="Computation success status")
    operation: str = Field(..., description="Operation type")
    ius_gid: str = Field(..., description="IUS GID")
    area_id: str = Field(..., description="Area ID")
    time_period: str = Field(..., description="Time period")
    computed_value: float = Field(..., description="Computed value")
    source_count: Optional[int] = Field(None, description="Number of source values used")
    execution_time_ms: Optional[float] = Field(None, description="Execution time in milliseconds")


class BatchComputationResponse(BaseModel):
    """Response schema for batch computation results."""
    total_jobs: int = Field(..., description="Total number of jobs")
    successful_jobs: int = Field(..., description="Number of successful jobs")
    failed_jobs: int = Field(..., description="Number of failed jobs")
    results: List[ComputationResult] = Field(..., description="Individual computation results")
    execution_summary: Dict[str, Any] = Field(..., description="Execution summary")


class HealthCheckResponse(BaseModel):
    """Response schema for compute engine health check."""
    status: str = Field(..., description="Health status")
    version: str = Field(..., description="Compute engine version")
    uptime_seconds: float = Field(..., description="Uptime in seconds")
    active_jobs: int = Field(..., description="Number of active jobs")
    queue_status: Dict[str, Any] = Field(..., description="Queue status information")
    database_status: Dict[str, Any] = Field(..., description="Database connectivity status")


# Note: Error response schemas have been moved to apps.shared.schemas.response
# to maintain consistency across the application. Use the shared ErrorResponse
# instead of defining compute engine specific error schemas.

# ConflictResponse and other error response schemas are now handled
# by the shared response utilities in apps.shared.utils.response