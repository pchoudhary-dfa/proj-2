"""
User list routes — master user list scoped to the calling client's app_key.
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.orm import Session

from apps.app_db.dependencies import get_app_key, get_core_locale, get_current_user_id, get_current_username
from apps.app_db.schemas.auth import LoginWorkflowMetaItem
from apps.app_db.schemas.users import (
    AdminCreateUserRequest,
    AdminUpdateUserRequest,
    ChangePasswordRequest,
    DatawarehouseRoleItem,
    RoleMasterItem,
    UserListItem,
    UserProfileItem,
    UserProfilePatchRequest,
)  # noqa: F401 — kept for response_model clarity
from apps.app_db.router.user_list_common import fetch_and_build_user_list_response
from apps.app_db.services import user_service
from apps.shared.config.config import settings
from apps.shared.config.dependencies import get_db
from apps.shared.config.security import create_password_reset_token
from apps.shared.exceptions import BadRequest, NotFound
from apps.shared.schemas.response import ErrorResponse, ListPaginationMetaSchema, SuccessResponse
from apps.shared.utils.email_utils import (
    EmailTemplate,
    build_password_reset_url,
    get_app_from_name,
    get_fed_email_urls,
    send_email,
)
from apps.shared.utils.response import success_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/iam", tags=["IAM"])


def _user_profile_success_meta(
    general_roles_meta: Dict[str, RoleMasterItem],
    dw_roles_meta: Dict[str, DatawarehouseRoleItem],
    workflows_meta: Dict[str, LoginWorkflowMetaItem],
) -> Dict[str, Any]:
    """Build meta for GET/PATCH /iam/users/me: nested workflows + roles (same merge order as legacy flat meta)."""
    roles = {
        **{rc: r.model_dump(mode="json") for rc, r in general_roles_meta.items()},
        **{rc: r.model_dump(mode="json") for rc, r in dw_roles_meta.items()},
    }
    return {
        "workflows": {code: m.model_dump(mode="json") for code, m in workflows_meta.items()},
        "roles": roles,
    }


@router.get(
    "/user",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "Users retrieved"},
        400: {"model": ErrorResponse, "description": "Bad request"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="List users",
    description=(
        "Return the master list of users scoped to the calling client's **app_key** "
        "(resolved from the X-Api-Key header) and an optional **dw_id** scope.\n\n"
        "Each user record includes a `roles` array listing the role codes assigned "
        "to that user within the resolved scope. A `role_code`-keyed role master list is "
        "returned in `meta.roles` so the caller can resolve role details without a second request.\n\n"
        "**Admin role-assignment view:** All non-superadmin users are returned. Use "
        "`GET /dw/{dw_id}/users` for warehouse member lists (users assigned to a warehouse).\n\n"
        "**`dw_id` (scope):** When set, the `roles` array on every user shows only assignments "
        "for that warehouse. Without `dw_id`, only app-wide (`dw_id IS NULL`) role assignments are shown.\n\n"
        "Use `view=group_by` to receive users nested under their role groups instead of a "
        "flat list. A user with multiple roles appears under each role group.\n\n"
        "Use the `search` parameter for a case-insensitive partial match. Omit `search_by` to search "
        "across username, email, first_name, and role (code or display name) together; set `search_by` "
        "to one of username, email, first_name, last_name, phone, organisation, location, status "
        "(0 or 1), or role_code to restrict the search to that column only.\n\n"
        "Omit `page_size` to return all records without pagination."
    ),
)
def list_users(
    # Auth / scope dependencies
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    _current_user_id: int = Depends(get_current_user_id),  # enforces AUTHENTICATED access
    db: Session = Depends(get_db),
    # Scope filter
    dw_id: Optional[int] = Query(None, description="Warehouse scope. Scopes each user's roles array to assignments for this dw_id."),
    # Pagination
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page; omit to return all"),
    # Sorting
    sort_field: Optional[str] = Query("id", description="Sort field: id, username, first_name, email, status, created, last_loggedin_on"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    # Search filter
    search: Optional[str] = Query(
        None,
        description="Case-insensitive partial match; without search_by, matches username, email, first_name, or role (code/name)",
    ),
    search_by: Optional[str] = Query(
        None,
        description=(
            "Column to search: username, email, first_name, last_name, phone, organisation, "
            "location, status (0 or 1), or role_code. Requires search. Omit to search default fields."
        ),
    ),
    role_code: Optional[List[str]] = Query(
        None,
        description="Filter by role_code. Supports single or multiple values (repeat query param or comma-separated values).",
    ),
    # View mode
    view: str = Query("flat", description="Response shape: 'flat' for a plain list, 'group_by' to nest users under their role. Pagination is disabled for 'group_by'."),
):
    return fetch_and_build_user_list_response(
        list_fn=user_service.list_users,
        list_kwargs={"db": db, "app_key": app_key, "locale": locale, "dw_id": dw_id},
        page=page,
        page_size=page_size,
        sort_field=sort_field,
        sort_order=sort_order,
        search=search,
        search_by=search_by,
        role_code=role_code,
        view=view,
    )


@router.get(
    "/users/me",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "User profile retrieved"},
        400: {"model": ErrorResponse, "description": "Bad request"},
        404: {"model": ErrorResponse, "description": "User not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Get current user profile",
    description=(
        "Returns the logged-in user's profile information including basic details "
        "and role assignments scoped to the current **app_key** and optional **dw_id**.\n\n"
        "The response **data** includes `roles` and `workflows` (distinct `workflow_code` values) "
        "from workflow-scoped `iam_user_role_content` rows.\n\n"
        "**meta** contains `meta.workflows` (code → id, code, name, allow_review) and `meta.roles` "
        "(code → role details, including `datawarehouses` for DW-scoped roles)."
    ),
)
def get_my_profile(
    # Auth / scope dependencies
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
    # Optional scope filter
    dw_id: Optional[int] = Query(None, description="Filter roles to those assigned for this datawarehouse ID. Omit to include all roles for the app_key."),
):
    """
    Get the current user's profile information.
    
    Returns user details and role assignments scoped to the current app_key.
    """
    profile, general_roles_meta, dw_roles_meta, workflows_meta = user_service.get_user_profile(
        db=db,
        user_id=current_user_id,
        app_key=app_key,
        locale=locale,
        dw_id=dw_id,
    )
    
    if not profile:
        raise NotFound("User profile not found")

    meta = _user_profile_success_meta(general_roles_meta, dw_roles_meta, workflows_meta)

    return success_response(
        message="User profile retrieved successfully",
        data=profile.model_dump(mode='json'),
        meta=meta,
    )


@router.patch(
    "/users/me",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "Profile updated successfully"},
        400: {"model": ErrorResponse, "description": "Validation error"},
        409: {"model": ErrorResponse, "description": "Username already exists"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Update current user profile",
    description=(
        "Update the logged-in user's profile information. Only provided fields are updated. "
        "Supports partial updates of first_name, last_name, username, and email fields. "
        "Username must be unique across all users."
    ),
)
def update_my_profile(
    payload: UserProfilePatchRequest,
    # Auth / scope dependencies
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
    # Optional scope filter
    dw_id: Optional[int] = Query(None, description="Filter roles to those assigned for this datawarehouse ID. Omit to include all roles for the app_key."),
):
    """
    Update the current user's profile information.
    
    Only the provided fields will be updated (partial update).
    Returns the updated user profile with role assignments.
    """
    profile, general_roles_meta, dw_roles_meta, workflows_meta = user_service.update_user_profile(
        db=db,
        user_id=current_user_id,
        update_data=payload,
        current_user_id=current_user_id,
        app_key=app_key,
        locale=locale,
        dw_id=dw_id,
    )
    
    if not profile:
        raise NotFound("User profile not found")

    meta = _user_profile_success_meta(general_roles_meta, dw_roles_meta, workflows_meta)

    return success_response(
        message="Profile updated successfully",
        data=profile.model_dump(mode='json'),
        meta=meta,
    )


@router.patch(
    "/users/me/password",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "Password updated successfully"},
        400: {"model": ErrorResponse, "description": "Validation error"},
        401: {"model": ErrorResponse, "description": "Old password is incorrect"},
        404: {"model": ErrorResponse, "description": "User not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Change current user password",
    description=(
        "Change password for the authenticated user. Username is resolved from "
        "the JWT token, old password must be valid, and the new password must "
        "satisfy configured length constraints. On success, sends a notification "
        "email to the user (without including the new password)."
    ),
)
def change_my_password(
    payload: ChangePasswordRequest,
    current_user_id: int = Depends(get_current_user_id),
    current_username: str = Depends(get_current_username),
    locale: str = Depends(get_core_locale),
    app_key: str = Depends(get_app_key),
    db: Session = Depends(get_db),
):
    user = user_service.change_password_by_username(
        db=db,
        username=current_username,
        old_password=payload.old_password,
        new_password=payload.new_password,
        modified_user_id=current_user_id,
    )
    full_name = f"{user.first_name} {user.last_name}".strip() if user.last_name else user.first_name
    login_url, _ = get_fed_email_urls(app_key, db)
    send_email(
        template=EmailTemplate.PASSWORD_CHANGED,
        recipient_email=user.email,
        recipient_name=full_name,
        context={
            "full_name": full_name,
            "username": user.username,
            "login_url": login_url,
            "from_name": get_app_from_name(),
        },
        locale=locale,
    )
    return success_response(message="Password updated successfully", data={})


@router.post(
    "/users",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"model": SuccessResponse, "description": "User created successfully"},
        400: {"model": ErrorResponse, "description": "Validation error"},
        409: {"model": ErrorResponse, "description": "Username or email already exists"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Bulk create users",
    description=(
        "Create one or more user accounts with no initial password. Each user "
        "receives an email with a time-limited link to set a password (same JWT "
        "and expiry as forgot-password, same `POST /auth/password/reset-confirm` "
        "flow). Each user is processed independently — partial success is supported. "
        "Failed items are reported in meta.errors keyed by their 0-based index."
    ),
)
def create_user_admin(
    payload: List[AdminCreateUserRequest],
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
):
    """
    Bulk create user accounts: password unset until the user follows the
    set-password link in the invite email.
    """
    created = []
    errors = []
    login_url, reset_base = get_fed_email_urls(app_key, db)

    for idx, item in enumerate(payload):
        try:
            user, password_auto_generated, _plain = user_service.create_user(
                db=db,
                first_name=item.first_name,
                last_name=item.last_name,
                location=item.location,
                phone=item.phone,
                organisation=item.organisation,
                username=item.username,
                email=item.email,
                password=None,
                status=item.status or 1,
                created_user_id=current_user_id,
                invite_only=True,
            )

            # Attempt invite email; failure is non-fatal
            email_sent = True
            try:
                full_name = f"{user.first_name} {user.last_name}".strip() if user.last_name else user.first_name
                token = create_password_reset_token(user.id)
                reset_url = build_password_reset_url(token, reset_base=reset_base)
                expires_in = f"{settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes"
                send_email(
                    template=EmailTemplate.ACCOUNT_INVITE_SET_PASSWORD,
                    recipient_email=user.email,
                    recipient_name=full_name,
                    context={
                        "full_name": full_name,
                        "username": user.username,
                        "reset_url": reset_url,
                        "expires_in": expires_in,
                        "login_url": login_url,
                        "from_name": get_app_from_name(),
                    },
                    locale=locale,
                )
            except Exception as email_error:
                logger.warning(
                    "Failed to send account invite email to user %s (%s): %s",
                    user.username,
                    user.email,
                    email_error,
                    exc_info=True,
                )
                email_sent = False

            full_name = f"{user.first_name} {user.last_name}".strip() if user.last_name else user.first_name
            created.append({
                "index": idx,
                "user_id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": full_name,
                "password_auto_generated": password_auto_generated,
                "email_sent": email_sent,
                "created_at": user.created.isoformat() + "Z" if user.created else None,
            })

        except Exception as e:
            logger.warning(
                "Failed to create user at index %d (%s): %s",
                idx,
                item.username,
                e,
            )
            errors.append({"index": idx, "error": str(e)})

    count = len(created)
    message = f"{count} user(s) created successfully" + (f", {len(errors)} failed" if errors else "")
    meta = {"count": count}
    if errors:
        meta["errors"] = errors

    return success_response(
        message=message,
        data=created,
        status_code=status.HTTP_201_CREATED,
        meta=meta,
    )


@router.patch(
    "/users/{user_id}",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "User updated successfully"},
        400: {"model": ErrorResponse, "description": "Validation error"},
        404: {"model": ErrorResponse, "description": "User not found"},
        409: {"model": ErrorResponse, "description": "Username already exists"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Admin update user",
    description=(
        "Partially update any user's profile by their **user_id**. "
        "Only the fields provided in the request body are updated. "
        "Supports updating first_name, last_name, username, email, and status. "
        "Username must be unique across all users."
    ),
)
def admin_update_user(
    payload: AdminUpdateUserRequest,
    user_id: int = Path(..., description="ID of the user to update"),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = user_service.admin_update_user(
        db=db,
        user_id=user_id,
        update_data=payload,
        current_user_id=current_user_id,
    )

    if not user:
        raise NotFound(f"User with id {user_id} not found", identifier=str(user_id))

    return success_response(
        message="User updated successfully",
        data={
            "id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "username": user.username,
            "email": user.email,
            "status": user.status,
            "modified": user.modified.isoformat() if user.modified else None,
        },
    )


@router.delete(
    "/users/{user_id}",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "User deleted successfully"},
        404: {"model": ErrorResponse, "description": "User not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
    summary="Admin delete user",
    description=(
        "Hard-delete a user by their **user_id** — permanently removes the user record "
        "and all related data from the database. This action cannot be undone."
    ),
)
def admin_delete_user(
    user_id: int = Path(..., description="ID of the user to delete"),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = user_service.admin_delete_user(
        db=db,
        user_id=user_id,
        current_user_id=current_user_id,
    )

    if not user:
        raise NotFound(f"User with id {user_id} not found", identifier=str(user_id))

    return success_response(
        message="User deleted successfully",
        data={"user_id": user_id},
    )
