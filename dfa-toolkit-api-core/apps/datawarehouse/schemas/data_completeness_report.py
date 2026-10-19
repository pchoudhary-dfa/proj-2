"""
Pydantic schemas for the Data Completeness Report API.

Endpoint:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/data-completeness
        ?page=1&page_size=20
"""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from apps.datawarehouse.schemas.operational_reports import OperationalReportColumnLabels


class DataCompletenessReportRow(BaseModel):
    """
    A single paginated row — one Dataset record expanded once per district area
    it covers, showing data point completeness metrics.
    """

    model_config = ConfigDict(from_attributes=True)

    sno: int = Field(..., description="Sequential row number (1-based, scoped to current page)")
    current_timeperiod: Optional[str] = Field(
        None,
        description="Workflow's current time period string (e.g. '2026 Q1'). "
                    "Same value on every row; derived from WorkflowDataentryRule.curr_timeperiod_nid.",
    )
    state_assigned: Optional[str] = Field(
        None, description="Parent area name (area_level - 1) for the dataset's area"
    )
    district_assigned: Optional[str] = Field(
        None,
        description="Area name at the workflow's configured area_level that this dataset covers",
    )
    dataset: Optional[str] = Field(None, description="Dataset name (Dataset.dataset_name)")
    submission_status: int = Field(
        ...,
        description=(
            "Integer submission status.\n"
            "  0 => NOT SUBMITTED (dataset is in DRAFT status)\n"
            "  1 => SUBMITTED (dataset status is PENDING_REVIEW, APPROVED, or REVISION)"
        ),
    )
    expected_data_points: int = Field(
        0,
        description="Active (non-soft-deleted) DatasetDataPoint rows for this (dataset, area) "
                    "combination (across all time periods).",
    )
    received_data_points: int = Field(
        0,
        description="Active DatasetDataPoint rows where data_value IS NOT NULL OR "
                    "textual_data_value IS NOT NULL for this (dataset, area) combination.",
    )
    completeness_rate: float = Field(
        0.0,
        description="Percentage of received data points out of expected. "
                    "Computed as received / expected * 100. Returns 0.0 if expected = 0. "
                    "Soft-deleted rows are excluded.",
    )
    missing_footnotes: int = Field(
        0,
        description="Count of active DatasetDataPoint rows for this (dataset, area) where "
                    "footnote_nid IS NULL (excludes soft-deleted).",
    )


class DataCompletenessReportData(BaseModel):
    """Top-level data payload for the Data Completeness Report response."""

    model_config = ConfigDict(from_attributes=True)

    column_labels: OperationalReportColumnLabels = Field(
        ..., description="Dynamic column header labels derived from the workflow's area_level"
    )
    current_timeperiod_label: Optional[str] = Field(
        None,
        description="Resolved timeperiod string for the workflow's curr_timeperiod_nid "
                    "(e.g. '2026 Q1'). Null if the workflow has no current time period set.",
    )
    rows: List[DataCompletenessReportRow] = Field(
        default_factory=list, description="Paginated report rows"
    )
