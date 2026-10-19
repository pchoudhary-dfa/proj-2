"""
Pydantic schemas for the Data Reporter Report API.

Endpoint:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reporter
        ?page=1&page_size=20
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from apps.datawarehouse.schemas.operational_reports import OperationalReportColumnLabels


class DataReporterReportRow(BaseModel):
    """
    A single paginated row — one data-entry operator expanded once per district
    area they are IAM-assigned to for the selected workflow.
    """

    model_config = ConfigDict(from_attributes=True)

    sno: int = Field(..., description="Sequential row number (1-based, scoped to current page)")
    reporter_name: Optional[str] = Field(
        None, description="Full name of the data-entry operator (first_name + last_name)"
    )
    email: Optional[str] = Field(None, description="Operator email address (IamUser.email)")
    phone: Optional[str] = Field(None, description="Operator phone number (IamUser.phone)")
    institution: Optional[str] = Field(
        None,
        description="Organisation or institution the operator belongs to (IamUser.organisation)",
    )
    role: Optional[str] = Field(
        None,
        description="Locale-aware display name of the operator's role (IamRoleI18n.name); "
                    "falls back to IamRole.role_code if no translation exists for the locale.",
    )
    state_assigned: Optional[str] = Field(
        None, description="Parent area name (area_level - 1) for the operator's assigned district"
    )
    district_assigned: Optional[str] = Field(
        None,
        description="Area name at the workflow's configured area_level that this operator "
                    "is assigned to",
    )
    current_timeperiod: Optional[str] = Field(
        None,
        description="Workflow's current time period string (e.g. '2026 Q1'). "
                    "Same value on every row; derived from WorkflowDataentryRule.curr_timeperiod_nid.",
    )
    last_login: Optional[datetime] = Field(
        None, description="Timestamp of the operator's last successful login (IamUser.last_loggedin_on)"
    )
    last_submission: Optional[datetime] = Field(
        None,
        description="MAX(Dataset.submitted_at) for datasets submitted by this operator "
                    "under the selected workflow. Null if the operator has not submitted any dataset.",
    )


class DataReporterReportData(BaseModel):
    """Top-level data payload for the Data Reporter Report response."""

    model_config = ConfigDict(from_attributes=True)

    column_labels: OperationalReportColumnLabels = Field(
        ..., description="Dynamic column header labels derived from the workflow's area_level"
    )
    current_timeperiod_label: Optional[str] = Field(
        None,
        description="Resolved timeperiod string for the workflow's curr_timeperiod_nid "
                    "(e.g. '2026 Q1'). Null if the workflow has no current time period set.",
    )
    rows: List[DataReporterReportRow] = Field(
        default_factory=list, description="Paginated report rows"
    )
