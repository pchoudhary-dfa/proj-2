"""
Pydantic schemas for the Review Status Report API.

Endpoint:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/review-status
        ?page=1&page_size=20
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from apps.datawarehouse.schemas.operational_reports import OperationalReportColumnLabels


class ReviewStatusReportRow(BaseModel):
    """
    A single paginated row — one Dataset record expanded once per district area
    and once per reviewer IAM-assigned to that area with dm_dw_data_review permission.
    """

    model_config = ConfigDict(from_attributes=True)

    sno: int = Field(..., description="Sequential row number (1-based, scoped to current page)")
    current_timeperiod: Optional[str] = Field(
        None,
        description="Workflow's current time period string (e.g. '2026 Q1'). "
                    "Same value on every row; derived from WorkflowDataentryRule.curr_timeperiod_nid.",
    )
    state_name: Optional[str] = Field(None, description="Parent area name (area_level - 1)")
    district_name: Optional[str] = Field(
        None, description="Area name at the workflow's configured area_level"
    )
    dataset_name: str = Field(..., description="Operator-supplied dataset name")
    date_submitted: Optional[datetime] = Field(
        None,
        description="Timestamp when the dataset was submitted (Dataset.submitted_at). "
                    "Null while in DRAFT.",
    )
    reviewer_assigned: Optional[str] = Field(
        None,
        description="Full name of the IAM-assigned reviewer for this district and workflow "
                    "(first_name + last_name from IamUser). Null if no reviewer is assigned.",
    )
    review_status: int = Field(
        ...,
        description=(
            "Integer review status code.\n"
            "  0 => Approved       (dataset status: APPROVED)\n"
            "  1 => Pending review (dataset status: PENDING_REVIEW)\n"
            "  2 => Revision       (dataset status: REVISION)"
        ),
    )
    date_returned: Optional[datetime] = Field(
        None,
        description="Timestamp when the dataset was last returned for revision "
                    "(Dataset.last_returned_at). Null if never returned.",
    )
    date_approved: Optional[datetime] = Field(
        None,
        description="Timestamp when the dataset was approved (Dataset.approved_on). "
                    "Null until approved.",
    )


class ReviewStatusReportData(BaseModel):
    """Top-level data payload for the Review Status Report response."""

    model_config = ConfigDict(from_attributes=True)

    column_labels: OperationalReportColumnLabels = Field(
        ..., description="Dynamic column header labels derived from the workflow's area_level"
    )
    current_timeperiod_label: Optional[str] = Field(
        None,
        description="Resolved timeperiod string for the workflow's curr_timeperiod_nid "
                    "(e.g. '2026 Q1'). Null if the workflow has no current time period set.",
    )
    rows: List[ReviewStatusReportRow] = Field(
        default_factory=list, description="Paginated report rows"
    )
