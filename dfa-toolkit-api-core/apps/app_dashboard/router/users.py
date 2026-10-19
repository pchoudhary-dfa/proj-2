"""Dashboard Users ACL routes — GET/DELETE /dash/{dashboard_id}/users.

Role assign: PUT /dash/{dashboard_id}/users/{user_id}/roles (dashboard-scoped, enforced by middleware).
"""
from typing import List

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.app_dashboard.services.user_area_service import (
    delete_dashboard_user,
    get_dashboard_users_config,
)
from apps.app_db.dependencies import (
    get_app_key,
    get_core_locale,
    get_current_user_id,
)
from apps.app_db.schemas.iam import (
    SaveUserRolesData,
    SaveUserRolesRequest,
    UserRoleAssignmentInput,
)
from apps.app_db.services.iam_role_service import IamRoleService
from apps.shared.config.dependencies import get_db
from apps.shared.exceptions import BadRequest, Forbidden, NotFound
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import no_content_response, success_response

router = APIRouter(prefix="/dash", tags=["Dashboard - Users"])

_role_service = IamRoleService()


class DashboardRoleAssignBody(BaseModel):
    """Body for PUT /dash/{dashboard_id}/users/{user_id}/roles."""
    roles: List[UserRoleAssignmentInput]


@router.get(
    "/{dashboard_id}/users",
    response_model=SuccessResponse,
    summary="List dashboard users config",
    description=(
        "Users tab bootstrap (legacy service 409). Returns assigned users with role and "
        "area ACL, users available to assign, and the DFA_DASH role catalog. "
        "To assign/update a user role and areas, call PUT /iam/users/{user_id}/roles "
        "with data.dashboard_id and optional content_restrictions "
        "(resource_code=dash_user_areas, content_ids=area_nids)."
    ),
    responses={
        200: {"description": "Dashboard users config retrieved"},
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def list_dashboard_users(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    db: Session = Depends(get_db),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    _user_id: int = Depends(get_current_user_id),
):
    config = get_dashboard_users_config(
        db,
        dashboard_id=dashboard_id,
        app_key=app_key,
        locale=locale,
    )
    return success_response(
        message="Dashboard users retrieved successfully",
        data=config.model_dump(),
    )


@router.delete(
    "/{dashboard_id}/users/{user_id}",
    status_code=204,
    summary="Remove dashboard user",
    description=(
        "Remove a user's dashboard membership (legacy service 411). "
        "Deletes the dashboard-scoped iam_user_role row and dash_user_areas content. "
        "API access is enforced by middleware. Callers cannot remove themselves."
    ),
    responses={
        204: {"description": "Membership removed"},
        400: {"description": "Cannot remove yourself", "model": ErrorResponse},
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def remove_dashboard_user(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    user_id: int = Path(..., description="IAM user id to remove"),
    db: Session = Depends(get_db),
    caller_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    delete_dashboard_user(
        db,
        dashboard_id=dashboard_id,
        target_user_id=user_id,
        caller_user_id=caller_user_id,
        app_key=app_key,
    )
    return no_content_response()


@router.put(
    "/{dashboard_id}/users/{user_id}/roles",
    response_model=SuccessResponse,
    summary="Assign dashboard role to user",
    description=(
        "Assign a DFA_DASH role (+ optional area ACL) to a user for a specific dashboard. "
        "The dashboard must exist and be in edit mode. "
        "Use content_restrictions with resource_code=dash_user_areas and area_nid content_ids "
        "to restrict the user to specific areas. "
        "Access is enforced by middleware — only a DFA_DASH_ADMIN assigned to this dashboard can call this."
    ),
    responses={
        200: {"description": "User roles updated successfully"},
        400: {"description": "Bad request (e.g. dashboard not edit mode)", "model": ErrorResponse},
        403: {"description": "Super-admin role cannot be assigned", "model": ErrorResponse},
        404: {"description": "User, dashboard, or role not found", "model": ErrorResponse},
    },
)
def assign_dashboard_user_role(
    body: DashboardRoleAssignBody,
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    user_id: int = Path(..., description="IAM user id to assign"),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    """
    Dashboard-scoped role assignment. ``dashboard_id`` comes from path (enforced by middleware),
    so only ADMIN users of *this* dashboard can call this endpoint.

    Body:
    - roles[].role_id: DFA_DASH role to assign (must belong to the app_key)
    - roles[].content_restrictions: optional [{resource_code, content_ids}] for area ACL
    """
    payload = SaveUserRolesRequest(
        data=SaveUserRolesData(
            user_id=user_id,
            dashboard_id=dashboard_id,
            roles=body.roles,
        )
    )

    error_type, error_detail, roles_received, roles_with_content = _role_service.save_user_roles(
        user_id=user_id,
        payload=payload,
        db=db,
        app_key=app_key,
        current_user_id=current_user_id,
    )

    if error_type == "user_not_found":
        raise NotFound("User not found", details={"user_id": user_id})
    if error_type == "user_id_mismatch":
        raise BadRequest(
            "user_id in path does not match resolved user_id",
            details={"detail": error_detail},
        )
    if error_type == "dashboard_not_found":
        raise NotFound(
            f"Dashboard not found: {error_detail}",
            details={"dashboard_id": error_detail},
        )
    if error_type == "dashboard_not_edit_mode":
        raise BadRequest(
            "dashboard_id must refer to an edit-mode dashboard",
            details={"detail": error_detail},
        )
    if error_type == "role_not_found":
        raise NotFound(
            f"Role not found: {error_detail}",
            details={"role_id": error_detail},
        )
    if error_type == "role_app_key_mismatch":
        raise BadRequest(
            "Role does not belong to the current application (app_key)",
            details={"detail": error_detail, "app_key": app_key},
        )
    if error_type == "resource_not_found":
        raise NotFound(
            f"Resource not found: {error_detail}",
            details={"resource_code": error_detail},
        )
    if error_type == "superadmin_forbidden":
        raise Forbidden(
            "Super-admin roles cannot be assigned through this API",
            details={"role_id": error_detail},
        )

    return success_response(
        message="User roles updated successfully",
        data={
            "user_id": user_id,
            "dashboard_id": dashboard_id,
            "app_key": app_key,
            "roles_received": roles_received,
            "roles_with_content_restrictions": roles_with_content,
        },
    )
