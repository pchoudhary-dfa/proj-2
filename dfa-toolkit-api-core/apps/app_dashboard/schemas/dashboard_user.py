"""Schemas for dashboard Users ACL (GET/DELETE /dash/{dashboard_id}/users)."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DashboardUserAreaItem(BaseModel):
    area_nid: int
    area_id: Optional[str] = None
    area_name: Optional[str] = None


class DashboardUserListItem(BaseModel):
    user_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    role_id: int
    role_code: Optional[str] = None
    role_name: Optional[str] = None
    areas: list[DashboardUserAreaItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class DashboardAvailableUserItem(BaseModel):
    user_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None


class DashboardRoleOption(BaseModel):
    role_id: int
    role_code: str
    role_name: Optional[str] = None


class DashboardUsersConfigResponse(BaseModel):
    """Legacy service 409 parity for the dashboard Users tab."""

    dashboard_users: list[DashboardUserListItem] = Field(default_factory=list)
    available_users: list[DashboardAvailableUserItem] = Field(default_factory=list)
    roles: list[DashboardRoleOption] = Field(default_factory=list)
