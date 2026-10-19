"""
Pydantic schemas for the Operational Dashboard API.

Endpoint:
    GET /dw/{dw_id}/reports/operational-dashboard
        ?workflow_id=<int>
        &area_identifier=<str>          (optional — parent/state-level filter)
        &timeperiod_identifier=<str>    (optional — defaults to curr_timeperiod_nid)
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OperationalDashboardDatasetItem(BaseModel):
    """A single dataset row inside an expanded area, with data point counts scoped to that area + selected timeperiod."""

    model_config = ConfigDict(from_attributes=True)

    dataset_id: int
    dataset_name: str
    dataset_gid: str
    dataset_status: str
    area_dp_total: int = Field(
        0, description="Data points for this area + selected timeperiod (0 if no timeperiod selected)"
    )
    area_dp_missing: int = Field(
        0, description="Missing data points (both value columns null) for this area + timeperiod"
    )
    completeness_pct: Optional[float] = Field(
        None,
        description="(area_dp_total - area_dp_missing) / area_dp_total * 100; null when area_dp_total == 0",
    )
    created: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    submitted_by_name: Optional[str] = None
    timeperiod_nid: Optional[int] = Field(
        None, description="Selected timeperiod NID — used by frontend to build the Info column display"
    )


class OperationalDashboardAreaRow(BaseModel):
    """One row in the main area table with status counts, completeness, and nested dataset list."""

    model_config = ConfigDict(from_attributes=True)

    area_nid: int
    area_name: str
    area_gid: str
    parent_area_nid: Optional[int] = None
    parent_area_name: Optional[str] = None

    # Dataset status counts for this area
    submitted_dataset_count: int = Field(
        0, description="Datasets in APPROVED or REVISION status (operator has submitted and review is done/in-progress)"
    )
    approved_count: int = Field(0, description="Datasets with status APPROVED")
    under_review_count: int = Field(0, description="Datasets with status PENDING_REVIEW")
    returned_count: int = Field(0, description="Datasets with status REVISION")
    draft_count: int = Field(0, description="Datasets with status DRAFT")

    completeness_pct: Optional[float] = Field(
        None,
        description="Simple average of each dataset's area-scoped completeness_pct; null when no data",
    )
    last_updated: Optional[datetime] = Field(
        None, description="MAX(last_updated_at) across all datasets in this area"
    )
    datasets: List[OperationalDashboardDatasetItem] = Field(
        default_factory=list, description="All datasets that include this area in their scope"
    )


class CompletenessBarItem(BaseModel):
    """Single bar in the completeness chart at the bottom of the dashboard."""

    area_nid: int
    area_name: str
    completeness_pct: Optional[float] = Field(
        None, description="Completeness percentage; null when no datasets have data points"
    )


class OperationalDashboardSummary(BaseModel):
    """Top-level summary metrics shown in the header cards."""

    expected_districts: int = Field(
        0, description="Total number of areas at the configured area_level (affected by area filter)"
    )
    total_datasets: int = Field(0, description="All non-deleted/rejected datasets for this workflow + timeperiod filter")
    submitted_datasets: int = Field(
        0, description="Datasets in PENDING_REVIEW + APPROVED + REVISION (operator has submitted)"
    )
    not_submitted: int = Field(0, description="total_datasets - submitted_datasets (i.e. DRAFT count)")
    under_review: int = Field(0, description="Datasets in PENDING_REVIEW status")
    returned_for_revision: int = Field(0, description="Datasets in REVISION status")
    approved: int = Field(0, description="Datasets in APPROVED status")


class OperationalDashboardResponse(BaseModel):
    """Full operational dashboard response returned by GET /dw/{dw_id}/reports/operational-dashboard."""

    model_config = ConfigDict(from_attributes=True)

    summary: OperationalDashboardSummary
    area_level: Optional[int] = Field(
        None, description="Configured area_level integer from WorkflowDataentryRule"
    )
    area_level_name: Optional[str] = Field(None, description="Display name for the district-level column")
    parent_level: Optional[int] = Field(None, description="area_level - 1 (parent column level integer)")
    parent_level_name: Optional[str] = Field(None, description="Display name for the state/parent column")
    selected_timeperiod_nid: Optional[int] = Field(
        None, description="Resolved timeperiod NID used for data-point scoping; null when workflow has no current period"
    )
    areas: List[OperationalDashboardAreaRow] = Field(
        default_factory=list, description="All areas at the configured level, sorted by area name"
    )
    completeness_by_district: List[CompletenessBarItem] = Field(
        default_factory=list,
        description="Per-district completeness bars sorted by completeness_pct descending",
    )
    completeness_by_state: List[CompletenessBarItem] = Field(
        default_factory=list,
        description="Per-state completeness bars (average of child districts) sorted descending",
    )
