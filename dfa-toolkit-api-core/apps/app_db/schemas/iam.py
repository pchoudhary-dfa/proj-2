"""
Schemas for IAM (Identity and Access Management) responses.
"""
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


CrudPermission = Literal["C", "R", "U", "D"]


class ResourceResponse(BaseModel):
    id: int
    parent_id: int
    app_key: str
    resource_code: str
    description: Optional[str] = None
    is_active: Optional[int] = None
    display_order: int = 0
    name: Optional[str] = None
    #: CRUD letters that have at least one registered iam_resource_api row for this resource.
    applicable_crud: List[CrudPermission] = Field(default_factory=list)


class ResourceGroupedResponse(ResourceResponse):
    children: List["ResourceGroupedResponse"] = []


ResourceGroupedResponse.model_rebuild()


class RoleResponse(BaseModel):
    id: int
    app_key: str
    role_code: str
    is_super_admin: int
    is_system_role: int
    display_order: int = 0
    name: Optional[str] = None
    description: Optional[str] = None


# ---------------------------------------------------------------------------
# Authorization payloads (FED + admin)
# ---------------------------------------------------------------------------


class RoleRef(BaseModel):
    role_id: int


class ContentRestriction(BaseModel):
    """Content-level restriction for a user-role: allow access only to these content_ids for the given resource (area, indicator, etc.)."""
    resource_code: str  # Same as iam_resource.resource_code e.g. dm_dw_area, dm_dw_indicator
    content_ids: List[int]  # PKs in that resource (e.g. ar_nid for area, indicator nid for indicator)


class UserRoleAssignmentInput(BaseModel):
    """Single role assignment with optional content-level restrictions."""
    role_id: int
    content_restrictions: Optional[List[ContentRestriction]] = None


class RoleAssignmentInfo(BaseModel):
    role_id: int
    role_code: Optional[str] = None
    role_name: Optional[str] = None
    dw_id: Optional[int] = None


class ResourcePermissionsInfo(BaseModel):
    resource_code: str
    name: Optional[str] = None
    permissions: List[CrudPermission]


class WorkflowScopedAssignmentInfo(BaseModel):
    """One workflow-scoped iam_user_role_content row (TYPE 2) exposed in permissions."""

    workflow_id: int
    workflow_code: str
    workflow_name: Optional[str] = None
    allow_review: bool = False
    dw_id: Optional[int] = None
    resource_code: str
    content_id: int
    scope_type: Optional[str] = None
    resource_name: Optional[str] = None


class WorkflowResourceAccess(BaseModel):
    """Workflow-scoped content PKs for one iam_resource.resource_code (e.g. dm_dw_area)."""

    content_ids: List[int] = Field(
        default_factory=list,
        description="Sorted union of content_ids across all workflows for this resource.",
    )
    by_workflow: Dict[str, List[int]] = Field(
        default_factory=dict,
        description="workflow_code → sorted distinct content_ids for this resource.",
    )


class WorkflowAccessPayload(BaseModel):
    """Distinct workflow codes, per-resource content_ids (union + by_workflow), and per-row assignments."""

    workflows: List[str] = Field(default_factory=list)
    resources: Dict[str, WorkflowResourceAccess] = Field(default_factory=dict)
    assignments: List[WorkflowScopedAssignmentInfo] = Field(default_factory=list)


class AppScopedPermissions(BaseModel):
    """Per-app permissions slice used in the grouped login response."""
    is_super_admin: bool = False
    roles: List[RoleAssignmentInfo]
    resources: List[ResourcePermissionsInfo]
    workflow_access: WorkflowAccessPayload = Field(default_factory=WorkflowAccessPayload)


class UserPermissionsData(BaseModel):
    """Full permissions payload returned by GET /auth/me/permissions (app / DW scope)."""
    user_id: int
    api_key: Optional[str] = None  # raw X-Api-Key header value; None for Swagger sessions
    is_super_admin: bool = False
    roles: List[RoleAssignmentInfo]
    resources: List[ResourcePermissionsInfo]
    workflow_access: WorkflowAccessPayload = Field(default_factory=WorkflowAccessPayload)


class DashboardPermissionsSlice(BaseModel):
    """Dashboard-scoped roles and resource CRUD for one edit-mode dashboard."""

    roles: List[RoleAssignmentInfo] = Field(default_factory=list)
    resources: List[ResourcePermissionsInfo] = Field(default_factory=list)


class BulkDashboardPermissionsData(BaseModel):
    """Bulk dashboard permissions from GET /auth/me/permissions?dashboard_ids=."""

    is_super_admin: bool = False
    by_dashboard_id: Dict[str, DashboardPermissionsSlice] = Field(default_factory=dict)


class SaveRolePermissionsData(BaseModel):
    role: RoleRef
    resources: List[ResourcePermissionsInfo]


class SaveRolePermissionsRequest(BaseModel):
    data: SaveRolePermissionsData


class SaveUserRolesData(BaseModel):
    dw_id: Optional[int] = None
    dashboard_id: Optional[int] = Field(
        None,
        description=(
            "When set, replace only dashboard-scoped iam_user_role rows for this dashboard. "
            "When omitted, replace only non-dashboard rows (dashboard_id IS NULL). "
            "Use with content_restrictions resource_code=dash_user_areas for area ACL."
        ),
    )
    user_id: int
    roles: List[UserRoleAssignmentInput]


class SaveUserRolesRequest(BaseModel):
    data: SaveUserRolesData


# ---------------------------------------------------------------------------
# Role CUD schemas
# ---------------------------------------------------------------------------

class RoleCreateItem(BaseModel):
    role_code: str
    is_super_admin: int = 0
    is_system_role: int = 0
    display_order: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None


RoleCreateRequest = List[RoleCreateItem]


class RolePatchRequest(BaseModel):
    role_code: Optional[str] = None
    is_super_admin: Optional[int] = None
    display_order: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
