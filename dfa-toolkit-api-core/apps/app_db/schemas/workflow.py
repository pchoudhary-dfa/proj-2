"""
Pydantic schemas for the Workflow engine
(workflow, workflow_review_level, workflow_review_rule, workflow_reviewer_rule).
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator, Field

# ---------------------------------------------------------------------------
# Enums (as string literals for schema clarity)
# ---------------------------------------------------------------------------

ReviewScopeTypeWorkflow = Literal["AREA", "CLASSIFICATION", "HYBRID"]
ReviewScopeTypeLevel = Literal["AREA", "CLASSIFICATION"]


# ---------------------------------------------------------------------------
# workflow
# ---------------------------------------------------------------------------

class WorkflowCreateRequest(BaseModel):
    workflow_code: str
    workflow_name: str
    review_scope_type: ReviewScopeTypeWorkflow
    priority: int
    description: Optional[str] = None
    is_active: bool = True
    is_system: bool = False
    # Persisted as sent. Runtime review uses allow_review and review_level_count > 0 (see ReviewWorkflow.review_operational).
    allow_review: bool = False
    constraint_data_entry: bool = False
    # Max active levels (persisted as sent). Operational review requires this > 0 with allow_review true.
    review_level_count: int = 0


class WorkflowPatchRequest(BaseModel):
    workflow_name: Optional[str] = None
    review_scope_type: Optional[ReviewScopeTypeWorkflow] = None
    priority: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    start_workflow_review_level_id: Optional[int] = None
    # Persisted as sent when provided. Operational review also requires review_level_count > 0.
    allow_review: Optional[bool] = None
    constraint_data_entry: Optional[bool] = None
    # Cannot be lowered (nor set to 0) via PATCH while any workflow level exists; delete levels first.
    review_level_count: Optional[int] = None


class WorkflowCreatedResponse(BaseModel):
    """Identifiers returned after creating a workflow."""

    workflow_id: int
    workflow_code: str


class WorkflowResponse(BaseModel):
    workflow_id: int
    dw_id: Optional[int] = None
    workflow_code: str
    workflow_name: Optional[str] = None   # resolved from workflow_i18n for requested locale
    review_scope_type: str
    description: Optional[str] = None     # resolved from workflow_i18n for requested locale
    start_workflow_review_level_id: Optional[int] = None
    review_level_count: int  # max active levels; API requires > 0 to add levels
    priority: int
    is_active: bool
    is_system: bool
    # Stored flag; operational review also requires review_level_count > 0.
    allow_review: bool
    constraint_data_entry: bool
    created: datetime
    created_user_id: Optional[int] = None
    modified: Optional[datetime] = None
    modified_user_id: Optional[int] = None
    dataset_count: int = 0
    in_progress_dataset_cnt: int = 0


# ---------------------------------------------------------------------------
# workflow_review_level
# ---------------------------------------------------------------------------

class WorkflowLevelUpsertRequest(BaseModel):
    """POST /{dw_id}/workflow/{workflow_id}/level — create or update one or many.
    level_no is the natural key within the workflow (used to match existing records).
    Accepts a single object or an array.
    """
    level_no: int
    level_name: Optional[str] = None
    review_scope_type: ReviewScopeTypeLevel
    area_level: Optional[int] = None
    classification_parent_nid: Optional[int] = None
    role_id: int
    include_childs: bool = False
    is_final_level: bool = False
    is_active: bool = True


class WorkflowLevelResponse(BaseModel):
    workflow_review_level_id: int
    workflow_id: int
    level_no: int
    level_name: Optional[str] = None      # resolved from workflow_review_level_i18n for requested locale
    review_scope_type: str
    area_level: Optional[int] = None
    classification_parent_nid: Optional[int] = None
    role_id: int
    include_childs: bool
    is_final_level: bool
    is_active: bool
    created: datetime


# ---------------------------------------------------------------------------
# workflow_dataentry_rule (one row per workflow when constraints enabled)
# ---------------------------------------------------------------------------

DataentryScope = Literal["SINGLE", "MULTIPLE"]


class WorkflowDataentryResponse(BaseModel):
    """Data-entry rule fields for a workflow (`workflow_dataentry_rule` only).

    Use workflow GET/PATCH for `constraint_data_entry`; optional `meta.workflow` on
    data-entry GET when `include_workflow=true`.
    """

    workflow_id: int
    dataentry_rule_id: Optional[int] = None
    scope_timeperiod: str
    scope_indicator: str
    scope_area: str
    timeperiod_frequency: Optional[str] = None
    curr_timeperiod_nid: Optional[int] = Field(
        None,
        description="Current reporting time period NID for this workflow data-entry scope.",
    )
    area_level: Optional[int] = None
    allow_child_areas: bool
    show_previous_time: bool
    role_id: Optional[int] = None
    created: Optional[datetime] = None
    created_user_id: Optional[int] = None
    modified: Optional[datetime] = None
    modified_user_id: Optional[int] = None


class WorkflowDataentryUpsertRequest(BaseModel):
    """
    Upsert body for `workflow_dataentry_rule` only.
    The workflow must have `constraint_data_entry=true` (set via workflow PATCH).
    `area_level` is required. `curr_timeperiod_nid` and `role_id` are optional; when set they must resolve to valid warehouse / IAM records.
    """

    scope_timeperiod: DataentryScope = "SINGLE"
    scope_indicator: DataentryScope = "SINGLE"
    scope_area: DataentryScope = "SINGLE"
    timeperiod_frequency: Optional[str] = None
    curr_timeperiod_nid: Optional[int] = Field(
        None,
        gt=0,
        description="Current reporting time period NID (ut_timeperiod.timeperiod_nid) for this workflow data-entry scope.",
    )
    area_level: int
    allow_child_areas: bool = False
    show_previous_time: bool = False
    role_id: Optional[int] = None

    @field_validator("timeperiod_frequency", mode="before")
    @classmethod
    def normalize_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        if not isinstance(v, str):
            return v
        u = v.strip().upper()
        allowed = {"ALL", "A", "M", "Q", "H", "D", "F"}
        if u not in allowed:
            raise ValueError(
                "timeperiod_frequency must be ALL or a periodicity code A,M,Q,H,D,F",
            )
        return u


# ---------------------------------------------------------------------------
# workflow user-area assignments (iam_user_role_content, workflow-scoped)
# scope_type drives the resource_code stored in iam_user_role_content so that
# the role type can be derived dynamically from that column in the future.
#
# Mapping (canonical, defined in services/workflow_role_utils.py):
#   AREA                   → dm_dw_area
#   INDICATOR              → dm_dw_indicator
#   INDICATOR_CLASSIFICATION / CLASSIFICATION → dm_dw_indicator_classification
#   TIMEPERIOD             → dm_dw_timeperiod
# ---------------------------------------------------------------------------

AssignmentScopeType = Literal[
    "AREA",
    "INDICATOR",
    "INDICATOR_CLASSIFICATION",
    "TIMEPERIOD",
]


class WorkflowUserAssignmentCreateRequest(BaseModel):
    """Assign a user to a content node within a workflow.
    scope_type determines the content dimension (area, indicator, etc.) and is
    mapped to the resource_code stored in iam_user_role_content.
    The user must already hold the role in iam_user_role for this dw_id.
    """
    user_id: int
    role_id: int
    content_nid: int          # nid of the area / indicator / classification / timeperiod
    scope_type: AssignmentScopeType
    allow_child_areas: bool = False  # if True and scope_type=AREA, assign this area and all descendants in DW


class WorkflowUserAssignmentResponse(BaseModel):
    id: int
    workflow_id: Optional[int] = None
    user_role_id: int
    user_id: Optional[int] = None
    role_id: Optional[int] = None
    resource_code: str        # stored in DB; use to derive role type dynamically
    scope_type: Optional[str] = None  # derived from resource_code at read time
    content_id: int
    created: datetime
    created_user_id: Optional[int] = None

    class Config:
        from_attributes = True
