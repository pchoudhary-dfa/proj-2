"""
Pydantic schemas for the Operational Reports API.

Endpoint:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}
        ?page=1&page_size=20
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class OperationalReportColumnLabels(BaseModel):
    """Dynamic column header labels derived from the workflow's area_level configuration."""

    state_label: Optional[str] = Field(
        None, description="Display name for the parent area level column (area_level - 1)"
    )
    district_label: Optional[str] = Field(
        None, description="Display name for the district-level column (area_level from WorkflowDataentryRule)"
    )


class OperationalReportRow(BaseModel):
    """A single paginated row — one Dataset record expanded once per district area it covers."""

    model_config = ConfigDict(from_attributes=True)

    sno: int = Field(..., description="Sequential row number (1-based, scoped to current page)")
    current_timeperiod: Optional[str] = Field(
        None,
        description="Workflow's current time period string (e.g. '2026 Q1'). "
                    "Same value on every row; derived from WorkflowDataentryRule.curr_timeperiod_nid.",
    )
    state_name: Optional[str] = Field(None, description="Parent area name (area_level - 1)")
    district_name: Optional[str] = Field(None, description="Area name at the workflow's configured area_level")
    dataset_name: str = Field(..., description="Operator-supplied dataset name")
    submission_status: int = Field(
        ...,
        description=(
            "Integer submission status.\n"
            "  0 => NOT SUBMITTED (dataset is in DRAFT status)\n"
            "  1 => SUBMITTED (dataset status is PENDING_REVIEW, APPROVED, or REVISION)"
        ),
    )
    date_submitted: Optional[datetime] = Field(
        None,
        description="Timestamp when the dataset was last transitioned from DRAFT to any other status "
                    "(Dataset.submitted_at). Null while in DRAFT.",
    )
    submitted_by: Optional[str] = Field(
        None,
        description="Full name of the user who submitted the dataset (firstname + lastname). "
                    "Null while in DRAFT.",
    )
    last_updated: Optional[datetime] = Field(
        None, description="Dataset.last_updated_at — timestamp of the most recent update to the dataset."
    )
    action_needed: int = Field(
        ...,
        description=(
            "Integer action code indicating what action is required.\n"
            "  0 => No action          (dataset status: APPROVED or PENDING_REVIEW)\n"
            "  1 => Pending Revision   (dataset status: REVISION)\n"
            "  2 => Pending Submission (dataset status: DRAFT)"
        ),
    )


class OperationalReportData(BaseModel):
    """Top-level data payload for the Operational Reports response."""

    model_config = ConfigDict(from_attributes=True)

    column_labels: OperationalReportColumnLabels = Field(
        ..., description="Dynamic column header labels derived from the workflow's area_level"
    )
    current_timeperiod_label: Optional[str] = Field(
        None,
        description="Resolved timeperiod string for the workflow's curr_timeperiod_nid "
                    "(e.g. '2026 Q1'). Null if the workflow has no current time period set.",
    )
    rows: List[OperationalReportRow] = Field(
        default_factory=list, description="Paginated report rows"
    )
