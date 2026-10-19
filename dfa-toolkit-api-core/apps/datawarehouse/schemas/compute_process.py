"""
Process Schemas for Compute Engine.

Pydantic models for process management request/response validation.
These schemas handle validation for process creation, execution, and monitoring.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
    OPERATION_AREA,
    STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_DONE, STATUS_CANCELLED, STATUS_DELETED,
)


class ProcessFilterObject(BaseModel):
    """Process filter object schema."""
    areas: Optional[List[str]] = Field(None, description="List of area IDs")
    ius_selection: Optional[Dict[str, Any]] = Field(None, description="IUS selection criteria")
    src_publisher: str = Field(..., description="Source publisher name for computed data records")
    src_title: str = Field(..., description="Source title for computed data records")
    area_level_nid: Optional[int] = Field(
        None,
        description="Area level nid when areas lists explicit area ids (not ['all'])",
    )


class ProcessCreateRequest(BaseModel):
    """Request schema for process creation."""
    process_type: str = Field(..., description="Process type: TOTAL/PERCENT/TIME/MINUS/AREA")
    filter_object: ProcessFilterObject = Field(..., description="Process filter configuration")
    name: Optional[str] = Field(None, description="Process name")
    description: Optional[str] = Field(None, description="Process description")
    
    @validator('process_type')
    def validate_process_type(cls, v):
        """Validate process type."""
        valid_types = [OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS, OPERATION_AREA]
        if v not in valid_types:
            raise ValueError(f"Process type must be one of: {valid_types}")
        return v


class ProcessUpdateRequest(BaseModel):
    """Partial update: shallow-merge `filter_object` keys into the stored JSON filter."""
    filter_object: Dict[str, Any] = Field(
        ...,
        description="Merged into existing filter_object (e.g. src_publisher, src_title, areas, ius_selection)",
    )


class ProcessExecuteRequest(BaseModel):
    """Request schema for process execution (matching Laravel structure)."""
    timeperiods: List[str] = Field(..., min_items=1, description="List of time period IDs or 'all'")
    timeperiods_name: Optional[List[str]] = Field(None, description="Human-readable time period names")
    name: Optional[str] = Field(None, description="Execution name")
    priority: Optional[int] = Field(0, ge=0, le=10, description="Execution priority")
    # Laravel source information (used for computed data source creation)
    # Defaults to None so that the process master's filter_object values are preserved
    # during merge; hard-coded fallbacks apply only when neither source provides a value.
    src_publisher: Optional[str] = Field(None, description="Source publisher name")
    src_title: Optional[str] = Field(None, description="Source title")
    
    @validator('priority')
    def validate_priority(cls, v):
        """Validate priority range."""
        if v < 0 or v > 10:
            raise ValueError("Priority must be between 0 and 10")
        return v


class ProcessResponse(BaseModel):
    """Response schema for process operations."""
    success: bool = Field(..., description="Operation success status")
    process_id: Optional[int] = Field(None, description="Process ID")
    process_type: Optional[str] = Field(None, description="Process type")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    message: Optional[str] = Field(None, description="Success/error message")


class ProcessExecuteResponse(BaseModel):
    """Response schema for process execution."""
    success: bool = Field(..., description="Execution success status")
    process_time_id: int = Field(..., description="Process time ID")
    process_time_log_id: int = Field(..., description="Process time log ID")
    estimated_jobs: int = Field(..., description="Estimated number of jobs")
    status: str = Field(..., description="Initial execution status")
    dispatch_result: Dict[str, Any] = Field(..., description="Background job dispatch result")
    message: Optional[str] = Field(None, description="Success/error message")


class ProcessListItem(BaseModel):
    """Process list item schema."""
    id: int = Field(..., description="Process ID")
    process_type: str = Field(..., description="Process type")
    filter_object: Dict[str, Any] = Field(..., description="Process filter configuration")
    created_at: datetime = Field(..., description="Creation timestamp")
    times_count: int = Field(..., description="Number of associated process times")


class ProcessListResponse(BaseModel):
    """Response schema for process list."""
    processes: List[ProcessListItem] = Field(..., description="List of processes")
    total_count: int = Field(..., description="Total number of processes")
    process_type_filter: Optional[str] = Field(None, description="Applied process type filter")


class ProcessDeleteResponse(BaseModel):
    """Response schema for process deletion."""
    success: bool = Field(..., description="Deletion success status")
    process_id: int = Field(..., description="Deleted process ID")
    deleted_at: datetime = Field(..., description="Deletion timestamp")
    message: Optional[str] = Field(None, description="Success/error message")


class ProcessTimeCreateRequest(BaseModel):
    """Request schema for process time creation."""
    process_id: int = Field(..., gt=0, description="Process master ID")
    filter_object: Dict[str, Any] = Field(..., description="Time periods configuration")


class ProcessTimeResponse(BaseModel):
    """Response schema for process time operations."""
    success: bool = Field(..., description="Operation success status")
    process_time_id: int = Field(..., description="Process time ID")
    process_id: int = Field(..., description="Process master ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    message: Optional[str] = Field(None, description="Success/error message")


class ProcessStatusUpdate(BaseModel):
    """Process status update schema."""
    status: str = Field(..., description="New status")
    remarks: Optional[str] = Field(None, description="Status update remarks")
    
    @validator('status')
    def validate_status(cls, v):
        """Validate status value."""
        valid_statuses = [STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_DONE, STATUS_CANCELLED, STATUS_DELETED]
        if v not in valid_statuses:
            raise ValueError(f"Status must be one of: {valid_statuses}")
        return v


class ProcessProgressInfo(BaseModel):
    """Process progress information schema."""
    total_jobs: int = Field(..., description="Total number of jobs")
    total_executed: int = Field(..., description="Number of executed jobs")
    total_pending: int = Field(..., description="Number of pending jobs")
    total_failed: int = Field(..., description="Number of failed jobs")
    progress_percentage: float = Field(..., description="Progress percentage")
    status: str = Field(..., description="Current status")


class ProcessMonitoringResponse(BaseModel):
    """Response schema for process monitoring."""
    process_id: int = Field(..., description="Process ID")
    process_type: str = Field(..., description="Process type")
    progress: ProcessProgressInfo = Field(..., description="Progress information")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    estimated_completion: Optional[datetime] = Field(None, description="Estimated completion time")


class ProcessErrorResponse(BaseModel):
    """Error response schema for process operations."""
    success: bool = Field(False, description="Operation success status")
    error: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(None, description="Error code")
    process_id: Optional[int] = Field(None, description="Process ID that caused error")
    process_type: Optional[str] = Field(None, description="Process type that caused error")