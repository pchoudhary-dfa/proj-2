"""
Schemas for user list API responses.
"""
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field


class UserListItem(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    organisation: Optional[str] = None
    username: str
    email: str
    status: Optional[int] = None
    email_verified: Optional[bool] = None
    created: Optional[datetime] = None
    last_loggedin_on: Optional[datetime] = None
    # role codes assigned to this user for the resolved app_key (+ optional dw_id scope)
    roles: List[str] = []


class RoleMasterItem(BaseModel):
    id: int
    role_code: str
    is_super_admin: int = 0
    is_system_role: int = 0
    name: Optional[str] = None
    description: Optional[str] = None


class DatawarehouseRoleItem(BaseModel):
    """Role metadata for datawarehouse-specific roles.

    datawarehouses always holds the DW scope:
    - Regular DW role: one entry with the assigned DW.
    - Super-admin: one entry per every active datawarehouse.
    """
    id: int
    role_code: str
    is_super_admin: int = 0
    is_system_role: int = 0
    name: Optional[str] = None
    description: Optional[str] = None
    datawarehouses: List[dict] = []


class UserProfileItem(BaseModel):
    """User profile schema for the current logged-in user's profile endpoint."""
    id: int
    first_name: str
    last_name: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    organisation: Optional[str] = None
    username: str
    email: str
    status: Optional[int] = None
    email_verified: Optional[bool] = None
    created: Optional[datetime] = None
    modified: Optional[datetime] = None
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    last_loggedin_on: Optional[datetime] = None
    # role codes assigned to this user for the resolved app_key (+ optional dw_id scope)
    roles: List[str] = []
    workflows: List[str] = Field(
        default_factory=list,
        description="Distinct workflow_code values from workflow-scoped iam_user_role_content rows.",
    )


class UserProfilePatchRequest(BaseModel):
    """Schema for updating user profile via PATCH /iam/users/me"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=10)
    organisation: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None


class AdminUpdateUserRequest(BaseModel):
    """Request schema for admin partial update of any user's profile."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    location: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=10)
    organisation: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    status: Optional[int] = Field(None, ge=0, le=1, description="User status (1=active, 0=inactive)")


class AdminCreateUserRequest(BaseModel):
    """Request schema for admin bulk user creation (invite: set password via email link)."""
    first_name: str = Field(..., min_length=1, max_length=100, description="User's first name")
    last_name: Optional[str] = Field(None, max_length=100, description="User's last name")
    location: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=10)
    organisation: Optional[str] = Field(None, max_length=255)
    username: str = Field(..., min_length=3, max_length=50, description="Unique username")
    email: EmailStr = Field(..., description="User's email address")
    status: Optional[int] = Field(1, description="User status (1=active, 0=inactive)")


class ChangePasswordRequest(BaseModel):
    """Schema for changing current user password via PATCH /iam/users/me/password."""
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=1)


class UserGroupedByRole(BaseModel):
    """Users aggregated under a single role — used when view=group_by.
    Role metadata (name, is_super_admin, etc.) is available in meta.roles."""
    role_code: str
    users: List[UserListItem] = []
