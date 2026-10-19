"""
Pydantic schemas for the Data Reviewer Report API.

Endpoint:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reviewer
        ?page=1&page_size=20
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from apps.datawarehouse.schemas.operational_reports import OperationalReportColumnLabels


class DataReviewerReportRow(BaseModel):
    """
    A single paginated row — one reviewer expanded once per district area
    they are IAM-assigned to for the selected workflow.
    """

    model_config = ConfigDict(from_attributes=True)

    sno: int = Field(..., description="Sequential row number (1-based, scoped to current page)")
    reviewer_name: Optional[str] = Field(
        None, description="Full name of the reviewer (first_name + last_name)"
    )
    email: Optional[str] = Field(None, description="Reviewer email address (IamUser.email)")
    phone: Optional[str] = Field(None, description="Reviewer phone number (IamUser.phone)")
    institution: Optional[str] = Field(
        None,
        description="Organisation or institution the reviewer belongs to (IamUser.organisation)",
    )
    role: Optional[str] = Field(
        None,
        description="Locale-aware display name of the reviewer's role (IamRoleI18n.name); "
                    "falls back to IamRole.role_code if no translation exists for the locale.",
    )
    state_assigned: Optional[str] = Field(
        None, description="Parent area name (area_level - 1) for the reviewer's assigned district"
    )
    district_assigned: Optional[str] = Field(
        None,
        description="Area name at the workflow's configured area_level that this reviewer "
                    "is assigned to",
    )
    current_timeperiod: Optional[str] = Field(
        None,
        description="Workflow's current time period string (e.g. '2026 Q1'). "
                    "Same value on every row; derived from WorkflowDataentryRule.curr_timeperiod_nid.",
    )
    datasets_assigned_count: int = Field(
        0,
        description="Count of datasets for this workflow whose area_nids includes this district's "
                    "area_nid AND whose status is not DELETED or REJECTED.",
    )
    last_login: Optional[datetime] = Field(
        None,
        description="Timestamp of the reviewer's last successful login (IamUser.last_loggedin_on)",
    )


class DataReviewerReportData(BaseModel):
    """Top-level data payload for the Data Reviewer Report response."""

    model_config = ConfigDict(from_attributes=True)

    column_labels: OperationalReportColumnLabels = Field(
        ..., description="Dynamic column header labels derived from the workflow's area_level"
    )
    current_timeperiod_label: Optional[str] = Field(
        None,
        description="Resolved timeperiod string for the workflow's curr_timeperiod_nid "
                    "(e.g. '2026 Q1'). Null if the workflow has no current time period set.",
    )
    rows: List[DataReviewerReportRow] = Field(
        default_factory=list, description="Paginated report rows"
    )
