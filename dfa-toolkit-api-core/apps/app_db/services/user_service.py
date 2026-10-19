"""
User service — creation and listing of IamUser records.

Used by the registration endpoint, admin/invite flows, and the user list API.
"""
import logging
import secrets
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import asc, desc, or_
from sqlalchemy.orm import Session, aliased

from apps.app_db.models.core import (
    IamRole,
    IamRoleI18n,
    IamUser,
    IamUserRole,
    IamUserRoleContent,
    ReviewWorkflow,
    ReviewWorkflowI18n,
    SystemDatawarehouse,
)
from apps.app_db.schemas.auth import (
    LoginAuthMeta,
    LoginResourceMetaItem,
    LoginWorkflowMetaItem,
)
from apps.app_db.schemas.iam import (
    WorkflowAccessPayload,
    WorkflowResourceAccess,
    WorkflowScopedAssignmentInfo,
)
from apps.app_db.schemas.users import DatawarehouseRoleItem, AdminUpdateUserRequest, RoleMasterItem, UserGroupedByRole, UserListItem, UserProfileItem, UserProfilePatchRequest
from apps.app_db.services.workflow_role_utils import resource_code_to_scope_type
from apps.shared.config.config import settings
from apps.shared.exceptions import BadRequest, Conflict, Forbidden, NotFound, Unauthorized
from apps.shared.utils.password_utils import hash_password, verify_password

logger = logging.getLogger(__name__)


def create_user(
    db: Session,
    first_name: str,
    username: str,
    email: str,
    last_name: Optional[str] = None,
    location: Optional[str] = None,
    phone: Optional[str] = None,
    organisation: Optional[str] = None,
    password: Optional[str] = None,
    status: int = 1,
    created_user_id: int = 0,
    *,
    invite_only: bool = False,
) -> tuple[IamUser, bool, Optional[str]]:
    """
    Create and persist a new IamUser row.

    If `password` is None and `invite_only` is False, a secure random password is
    generated automatically (typical for self-service registration).

    If `password` is None and `invite_only` is True (admin invite flow), the user
    is created with `password` NULL; the caller must email a one-time
    set-password link. No plaintext password is returned.

    `email` is required (stored non-null on iam_user).

    Returns:
        (user, password_auto_generated, plain_password)

        - `password_auto_generated` is True when a random password was generated
          (not used when `invite_only` is True).
        - `plain_password` is the raw generated password (only non-None for
          auto-generated, non-invite) — for temporary credential email.

    Raises:
        ValueError: if the username is already taken, or if `invite_only` is
            True and `password` is not None.
    """
    if invite_only and password is not None:
        raise BadRequest(
            "invite_only cannot be combined with an explicit password",
            error_code="INVALID_INVITE_OPTIONS",
        )

    existing = db.query(IamUser).filter(IamUser.username == username).first()
    if existing:
        raise Conflict(
            f"Username '{username}' is already taken",
            error_code="USERNAME_TAKEN",
            identifier=username,
        )

    if invite_only:
        auto_generated = False
        plain_password: Optional[str] = None
        stored_password: Optional[str] = None
    else:
        auto_generated = password is None
        plain_password = None
        if auto_generated:
            plain_password = secrets.token_urlsafe(12)
            resolved_password = plain_password
        else:
            resolved_password = password  # type: ignore[assignment]
        stored_password = hash_password(resolved_password)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user = IamUser(
        first_name=first_name,
        last_name=last_name,
        location=location,
        phone=phone,
        organisation=organisation,
        username=username,
        email=email,
        password=stored_password,
        status=status,
        email_verified=not auto_generated and not invite_only,
        created=now,
        created_user_id=created_user_id,
        modified=now,
        modified_user_id=created_user_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user, auto_generated, plain_password


def reset_password_by_username(
    db: Session,
    username: str,
    modified_user_id: int = 0,
) -> Optional[Tuple[IamUser, str]]:
    """
    Assign a new random password to an active user.

    Returns:
        (user, plain_password) when the user exists and status == 1.
        None when no user matches `username`.

    Raises:
        Forbidden: when the user exists but is not active (status != 1).
    """
    user = db.query(IamUser).filter(IamUser.username == username).first()
    if user is None:
        return None
    if user.status != 1:
        raise Forbidden("User account is inactive", error_code="USER_INACTIVE")

    plain_password = secrets.token_urlsafe(12)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user.password = hash_password(plain_password)
    user.modified = now
    user.modified_user_id = modified_user_id
    db.commit()
    db.refresh(user)
    return user, plain_password


def get_active_user_for_password_reset(db: Session, username: str) -> Optional[IamUser]:
    """
    Resolve a user for initiating forgot-password (email link only).

    Inactive users are allowed through so they can reset their password
    and reactivate their account via the confirm step.

    Returns:
        IamUser when username exists.
        None when no user matches.
    """
    user = db.query(IamUser).filter(IamUser.username == username).first()
    if user is None:
        return None
    return user


def set_password_for_user_id(
    db: Session,
    user_id: int,
    new_password: str,
    modified_user_id: int,
) -> IamUser:
    """
    Set password by user id (forgot-password confirm flow). Active users only.

    Raises:
        NotFound: if user is not found.
        Forbidden: if user is inactive.
        BadRequest: if new password length is outside configured bounds.
    """
    user = db.query(IamUser).filter(IamUser.id == user_id).first()
    if user is None:
        raise NotFound("User does not exist", error_code="USER_NOT_FOUND")

    min_len = settings.IAM_PASSWORD_MIN_LENGTH
    max_len = settings.IAM_PASSWORD_MAX_LENGTH
    new_len = len(new_password or "")
    if new_len < min_len or new_len > max_len:
        raise BadRequest(
            f"New password length must be between {min_len} and {max_len} characters",
            error_code="PASSWORD_LENGTH_INVALID",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user.password = hash_password(new_password)
    user.status=1
    user.email_verified = True
    user.modified = now
    user.modified_user_id = modified_user_id
    db.commit()
    db.refresh(user)
    return user


def change_password_by_username(
    db: Session,
    username: str,
    old_password: str,
    new_password: str,
    modified_user_id: int,
) -> IamUser:
    """
    Change password for the given username after verifying old password.

    Raises:
        NotFound: if user is not found.
        Unauthorized: if old password is invalid.
        BadRequest: if new password length is outside configured bounds.
    """
    user = db.query(IamUser).filter(IamUser.username == username).first()
    if user is None:
        raise NotFound("User does not exist", error_code="USER_NOT_FOUND")

    if not verify_password(old_password, user.password or ""):
        raise Unauthorized("Old password is incorrect")

    min_len = settings.IAM_PASSWORD_MIN_LENGTH
    max_len = settings.IAM_PASSWORD_MAX_LENGTH
    new_len = len(new_password or "")
    if new_len < min_len or new_len > max_len:
        raise BadRequest(
            f"New password length must be between {min_len} and {max_len} characters",
            error_code="PASSWORD_LENGTH_INVALID",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user.password = hash_password(new_password)
    user.email_verified = True
    user.modified = now
    user.modified_user_id = modified_user_id
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Sortable columns for user list
# ---------------------------------------------------------------------------

_USER_SORT_FIELDS = {
    "id": IamUser.id,
    "username": IamUser.username,
    "first_name": IamUser.first_name,
    "email": IamUser.email,
    "status": IamUser.status,
    "created": IamUser.created,
    "last_loggedin_on": IamUser.last_loggedin_on,
}

# Allowed `search_by` values for GET /iam/user (single column; omit for multi-field search)
USER_LIST_SEARCH_BY_FIELDS = frozenset({
    "username",
    "email",
    "first_name",
    "last_name",
    "phone",
    "organisation",
    "location",
    "status",
    "role_code",
})


def _role_code_matching_user_ids_subquery(
    db: Session,
    search_pattern: str,
    locale: str,
    dw_id: Optional[int],
    role_codes: Optional[List[str]],
    app_key: Optional[str] = None,
):
    q = (
        db.query(IamUserRole.user_id)
        .join(IamRole, IamRole.id == IamUserRole.role_id)
        .outerjoin(
            IamRoleI18n,
            (IamRoleI18n.master_id == IamRole.id) & (IamRoleI18n.locale == locale),
        )
        .filter(
            or_(
                IamRole.role_code.ilike(search_pattern),
                IamRoleI18n.name.ilike(search_pattern),
            )
        )
    )
    if app_key:
        q = q.filter(IamUserRole.app_key == app_key)
    if dw_id is not None:
        q = q.filter(IamUserRole.dw_id == dw_id)
    else:
        q = q.filter(IamUserRole.dw_id.is_(None))
    if role_codes:
        q = q.filter(IamRole.role_code.in_(role_codes))
    return q.subquery()


def _list_users_impl(
    db: Session,
    app_key: str,
    locale: str,
    dw_id: Optional[int] = None,
    page: int = 1,
    page_size: Optional[int] = None,
    sort_field: str = "id",
    sort_order: str = "asc",
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    role_codes: Optional[List[str]] = None,
    restrict_to_dw_assignments: bool = False,
) -> Tuple[List[UserListItem], int, Dict[str, RoleMasterItem], Optional[int]]:
    # ------------------------------------------------------------------
    # Step 1 — base user query: all users regardless of app_key scope
    # or role assignments.
    # ------------------------------------------------------------------
    user_q = db.query(IamUser)

    # Exclude users who have superadmin role assignments
    superadmin_users_subq = (
        db.query(IamUserRole.user_id)
        .join(IamRole, IamRole.id == IamUserRole.role_id)
        .filter(IamRole.is_super_admin == 1)
    )
    user_q = user_q.filter(~IamUser.id.in_(superadmin_users_subq))

    # ------------------------------------------------------------------
    # Step 1.5a — restrict user list to those with at least one role
    # assignment for this app_key + dw_id (warehouse member lists).
    # ------------------------------------------------------------------
    if restrict_to_dw_assignments:
        dw_assigned_subq = (
            db.query(IamUserRole.user_id)
            .filter(
                IamUserRole.app_key == app_key,
                IamUserRole.dw_id == dw_id,
            )
        )
        user_q = user_q.filter(IamUser.id.in_(dw_assigned_subq))

    search_stripped = search.strip() if search else ""
    search_by_key = search_by.strip().lower() if search_by and search_by.strip() else None
    has_list_filters = bool(search_stripped) or bool(role_codes)
    total_count_unfiltered: Optional[int] = (
        user_q.count() if has_list_filters else None
    )

    # ------------------------------------------------------------------
    # Step 1.5c — role_codes filter (when no search is provided)
    # ------------------------------------------------------------------
    if role_codes and not search_stripped:
        # Filter users who have at least one of the specified roles
        role_filtered_users = (
            db.query(IamUserRole.user_id)
            .join(IamRole, IamRole.id == IamUserRole.role_id)
            .filter(IamRole.role_code.in_(role_codes))
            .filter(IamUserRole.app_key == app_key)
        )
        if dw_id is not None:
            role_filtered_users = role_filtered_users.filter(IamUserRole.dw_id == dw_id)
        else:
            # When dw_id is not provided, filter for general roles (dw_id IS NULL)
            role_filtered_users = role_filtered_users.filter(IamUserRole.dw_id.is_(None))

        user_q = user_q.filter(IamUser.id.in_(role_filtered_users.subquery()))

    # ------------------------------------------------------------------
    # Step 2 — optional search filter (Q1 + Q2)
    # ------------------------------------------------------------------
    if search_stripped:
        search_pattern = f"%{search_stripped}%"

        if search_by_key:
            if search_by_key == "username":
                user_q = user_q.filter(IamUser.username.ilike(search_pattern))
            elif search_by_key == "email":
                user_q = user_q.filter(IamUser.email.ilike(search_pattern))
            elif search_by_key == "first_name":
                user_q = user_q.filter(IamUser.first_name.ilike(search_pattern))
            elif search_by_key == "last_name":
                user_q = user_q.filter(IamUser.last_name.ilike(search_pattern))
            elif search_by_key == "phone":
                user_q = user_q.filter(IamUser.phone.ilike(search_pattern))
            elif search_by_key == "organisation":
                user_q = user_q.filter(IamUser.organisation.ilike(search_pattern))
            elif search_by_key == "location":
                user_q = user_q.filter(IamUser.location.ilike(search_pattern))
            elif search_by_key == "status":
                if search_stripped not in ("0", "1"):
                    raise BadRequest(
                        "status search must be 0 (inactive) or 1 (active)",
                        error_code="INVALID_STATUS_SEARCH",
                    )
                user_q = user_q.filter(IamUser.status == int(search_stripped))
            elif search_by_key == "role_code":
                subq = _role_code_matching_user_ids_subquery(
                    db, search_pattern, locale, dw_id, role_codes, app_key=app_key
                )
                user_q = user_q.filter(IamUser.id.in_(subq))
            else:
                raise BadRequest(
                    f"Invalid search_by field: {search_by_key!r}",
                    error_code="INVALID_SEARCH_BY",
                )
        else:
            # OR across username, email, first_name, and role_code
            user_search_conditions = or_(
                IamUser.username.ilike(search_pattern),
                IamUser.email.ilike(search_pattern),
                IamUser.first_name.ilike(search_pattern),
            )
            role_subq = _role_code_matching_user_ids_subquery(
                db, search_pattern, locale, dw_id, role_codes, app_key=app_key
            )
            user_q = user_q.filter(
                or_(
                    user_search_conditions,
                    IamUser.id.in_(role_subq),
                )
            )

    total_count: int = user_q.count()  # Q1

    sort_col = _USER_SORT_FIELDS.get(sort_field, IamUser.id)
    sort_dir = desc if sort_order == "desc" else asc
    user_q = user_q.order_by(sort_dir(sort_col))

    use_pagination = page_size is not None
    effective_page_size = max(1, min(page_size, 1000)) if use_pagination else None
    if use_pagination:
        user_q = user_q.offset((page - 1) * effective_page_size).limit(effective_page_size)

    users = user_q.all()  # Q2
    user_ids = [u.id for u in users]

    # ------------------------------------------------------------------
    # Step 3 — single query for role assignments + role master + i18n (Q3)
    # Merges the old Steps 4 and 5 into one round-trip.
    # ------------------------------------------------------------------
    user_role_map: Dict[int, List[str]] = defaultdict(list)
    roles_meta: Dict[str, RoleMasterItem] = {}

    if user_ids:
        assn_q = (
            db.query(IamUserRole.user_id, IamRole, IamRoleI18n)
            .join(IamRole, IamRole.id == IamUserRole.role_id)
            .outerjoin(
                IamRoleI18n,
                (IamRoleI18n.master_id == IamRole.id) & (IamRoleI18n.locale == locale),
            )
            .filter(
                IamUserRole.user_id.in_(user_ids),
                IamUserRole.app_key == app_key,
                IamRole.is_super_admin != 1,
            )
        )
        if dw_id is not None:
            assn_q = assn_q.filter(IamUserRole.dw_id == dw_id)
        else:
            # When dw_id is not provided, filter for general roles (dw_id IS NULL)
            assn_q = assn_q.filter(IamUserRole.dw_id.is_(None))
        if role_codes:
            assn_q = assn_q.filter(IamRole.role_code.in_(role_codes))

        for uid, role, i18n in assn_q.all():  # Q3
            user_role_map[uid].append(role.role_code)
            if role.role_code not in roles_meta:
                roles_meta[role.role_code] = RoleMasterItem(
                    id=role.id,
                    role_code=role.role_code,
                    is_super_admin=role.is_super_admin or 0,
                    is_system_role=role.is_system_role or 0,
                    name=i18n.name if i18n else None,
                    description=i18n.description if i18n else None,
                )

    # ------------------------------------------------------------------
    # Step 4 — assemble UserListItem objects (pure Python, no DB)
    # ------------------------------------------------------------------
    items = [
        UserListItem(
            id=u.id,
            first_name=u.first_name,
            last_name=u.last_name,
            location=u.location,
            phone=u.phone,
            organisation=u.organisation,
            username=u.username,
            email=u.email,
            status=u.status,
            email_verified=u.email_verified,
            created=u.created,
            last_loggedin_on=u.last_loggedin_on,
            roles=sorted(set(user_role_map.get(u.id, []))),
        )
        for u in users
    ]

    return items, total_count, roles_meta, total_count_unfiltered


def list_users(
    db: Session,
    app_key: str,
    locale: str,
    dw_id: Optional[int] = None,
    page: int = 1,
    page_size: Optional[int] = None,
    sort_field: str = "id",
    sort_order: str = "asc",
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    role_codes: Optional[List[str]] = None,
) -> Tuple[List[UserListItem], int, Dict[str, RoleMasterItem], Optional[int]]:
    """
    Return a paginated, filtered list of users scoped to the calling client's app_key.

    Each user's ``roles`` array only contains roles assigned under the caller's
    ``app_key``. Role-based search and role_code filtering are also scoped to
    the same app_key.

    ``dw_id`` scopes which role assignments are shown per user (and drives role_code /
    search filters). All non-superadmin users are returned regardless of role assignments
    (admin role-assignment view). Use ``list_dw_members`` for warehouse member lists.

    Search: non-empty `search` with no `search_by` matches username, email,
    first_name, or assigned role code/name (OR). With `search_by` set to one of
    USER_LIST_SEARCH_BY_FIELDS, only that column is matched.

    Returns:
        (items, total_count, roles_meta, total_count_unfiltered)
        - items: list of UserListItem (each includes role codes for this app_key)
        - total_count: total matching users (before pagination)
        - roles_meta: dict keyed by role_code → RoleMasterItem (roles that
          appear in items for this app_key, with translated name/description for `locale`)
        - total_count_unfiltered: all non-superadmin users when search/role filters apply; else None

    DB queries issued: 3
        Q1 — COUNT(filtered users)
        Q2 — SELECT paginated users
        Q3 — SELECT role assignments + role master + i18n for the page of users
    """
    return _list_users_impl(
        db=db,
        app_key=app_key,
        locale=locale,
        dw_id=dw_id,
        page=page,
        page_size=page_size,
        sort_field=sort_field,
        sort_order=sort_order,
        search=search,
        search_by=search_by,
        role_codes=role_codes,
        restrict_to_dw_assignments=False,
    )


def list_dw_members(
    db: Session,
    app_key: str,
    locale: str,
    dw_id: int,
    page: int = 1,
    page_size: Optional[int] = None,
    sort_field: str = "id",
    sort_order: str = "asc",
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    role_codes: Optional[List[str]] = None,
) -> Tuple[List[UserListItem], int, Dict[str, RoleMasterItem], Optional[int]]:
    """
    Return warehouse members: users with at least one role assignment for ``app_key`` + ``dw_id``.

    Same search, sort, pagination, and response shape as ``list_users``, but the user list
    is restricted to assigned members only. Role arrays on each user are scoped to ``dw_id``.
    """
    return _list_users_impl(
        db=db,
        app_key=app_key,
        locale=locale,
        dw_id=dw_id,
        page=page,
        page_size=page_size,
        sort_field=sort_field,
        sort_order=sort_order,
        search=search,
        search_by=search_by,
        role_codes=role_codes,
        restrict_to_dw_assignments=True,
    )


def group_users_by_role(
    items: List[UserListItem],
    roles_meta: Dict[str, RoleMasterItem],
) -> List[UserGroupedByRole]:
    """
    Re-group a flat list of UserListItem records under their assigned roles.

    Groups are keyed and sorted by role_code.
    A user with multiple roles will appear under each role group.
    """
    groups: Dict[str, UserGroupedByRole] = {}

    for user in items:
        for role_code in user.roles:
            if role_code not in groups:
                groups[role_code] = UserGroupedByRole(role_code=role_code, users=[])
            groups[role_code].users.append(user)

    # Return groups sorted alphabetically by role_code for stable ordering
    return [groups[rc] for rc in sorted(groups)]


def get_user_profile(
    db: Session,
    user_id: int,
    app_key: str,
    locale: str,
    dw_id: Optional[int] = None,
) -> Tuple[
    Optional[UserProfileItem],
    Dict[str, RoleMasterItem],
    Dict[str, DatawarehouseRoleItem],
    Dict[str, LoginWorkflowMetaItem],
]:
    """
    Return the profile information for a specific user ID, scoped to the calling
    client's app_key and optional dw_id.

    Returns:
        (user_profile, general_roles_meta, dw_roles_meta, workflows_meta)
        - user_profile: UserProfileItem with role codes for this scope, or None if user not found
        - general_roles_meta: dict keyed by role_code → RoleMasterItem (general roles)
        - dw_roles_meta: dict keyed by role_code → DatawarehouseRoleItem (datawarehouse-specific roles)
        - workflows_meta: dict keyed by workflow_code → LoginWorkflowMetaItem (for response meta.workflows)

    DB queries issued: 5+
        Q1 — SELECT user by ID with audit user joins
        Q2 — SELECT super-admin role assignment (if any) + all active DWs
        Q3 — SELECT non-super-admin role assignments + role master + i18n
        Q4 — (conditional) SELECT all active datwarehouses if user is super-admin
        Q5 — Workflow-scoped iam_user_role_content joined to workflow (same dw_id filter as roles when set)
    """
    # ------------------------------------------------------------------
    # Step 1 — Get the user by ID with audit user information
    # ------------------------------------------------------------------
    # Create aliases for created_by and modified_by user joins
    CreatedByUser = aliased(IamUser)
    ModifiedByUser = aliased(IamUser)
    
    user_query = (
        db.query(
            IamUser,
            CreatedByUser.first_name.label('created_by_first_name'),
            CreatedByUser.last_name.label('created_by_last_name'),
            ModifiedByUser.first_name.label('modified_by_first_name'),
            ModifiedByUser.last_name.label('modified_by_last_name')
        )
        .outerjoin(CreatedByUser, IamUser.created_user_id == CreatedByUser.id)
        .outerjoin(ModifiedByUser, IamUser.modified_user_id == ModifiedByUser.id)
        .filter(IamUser.id == user_id)
        .first()
    )
    
    if not user_query:
        return None, {}, {}, {}
    
    user, created_by_first, created_by_last, modified_by_first, modified_by_last = user_query
    
    # Build full names for audit fields
    created_by_name = None
    if created_by_first:
        created_by_name = f"{created_by_first}"
        if created_by_last:
            created_by_name += f" {created_by_last}"
    
    modified_by_name = None
    if modified_by_first:
        modified_by_name = f"{modified_by_first}"
        if modified_by_last:
            modified_by_name += f" {modified_by_last}"

    # ------------------------------------------------------------------
    # Step 2 — Check if the user is a super-admin for this app_key
    # ------------------------------------------------------------------
    user_role_codes: List[str] = []
    general_roles_meta: Dict[str, RoleMasterItem] = {}
    dw_roles_meta: Dict[str, DatawarehouseRoleItem] = {}

    sa_assignment = (
        db.query(IamRole, IamRoleI18n)
        .join(IamUserRole, IamUserRole.role_id == IamRole.id)
        .outerjoin(
            IamRoleI18n,
            (IamRoleI18n.master_id == IamRole.id) & (IamRoleI18n.locale == locale),
        )
        .filter(
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamRole.is_super_admin == 1,
        )
        .first()
    )

    if sa_assignment:
        sa_role, sa_i18n = sa_assignment
        user_role_codes.append(sa_role.role_code)
        # Fetch all active datwarehouses and attach them under the super-admin role entry
        all_dws = db.query(SystemDatawarehouse).filter(SystemDatawarehouse.is_active == True).all()
        dw_roles_meta[sa_role.role_code] = DatawarehouseRoleItem(
            id=sa_role.id,
            role_code=sa_role.role_code,
            is_super_admin=1,
            is_system_role=sa_role.is_system_role or 0,
            name=sa_i18n.name if sa_i18n else None,
            description=sa_i18n.description if sa_i18n else None,
            datawarehouses=[{"dw_id": dw.id, "dw_name": dw.dw_connection_name} for dw in all_dws],
        )

    # ------------------------------------------------------------------
    # Step 3 — Get non-super-admin role assignments + role master + i18n
    # ------------------------------------------------------------------

    # Query role assignments for this user scoped to app_key and optional dw_id
    assn_q = (
        db.query(IamUserRole, IamRole, IamRoleI18n, SystemDatawarehouse)
        .join(IamRole, IamRole.id == IamUserRole.role_id)
        .outerjoin(
            IamRoleI18n,
            (IamRoleI18n.master_id == IamRole.id) & (IamRoleI18n.locale == locale),
        )
        .outerjoin(SystemDatawarehouse, IamUserRole.dw_id == SystemDatawarehouse.id)
        .filter(
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamRole.is_super_admin != 1,  # super-admin handled separately above
        )
    )
    if dw_id is not None:
        assn_q = assn_q.filter(IamUserRole.dw_id == dw_id)

    for user_role, role, i18n, datawarehouse in assn_q.all():
        user_role_codes.append(role.role_code)

        # General role: dw_id is NULL on the assignment row
        if user_role.dw_id is None:
            if role.role_code not in general_roles_meta:
                general_roles_meta[role.role_code] = RoleMasterItem(
                    id=role.id,
                    role_code=role.role_code,
                    is_super_admin=role.is_super_admin or 0,
                    is_system_role=role.is_system_role or 0,
                    name=i18n.name if i18n else None,
                    description=i18n.description if i18n else None,
                )
        else:
            # Datawarehouse-specific role — keyed by role_code only
            dw_entry = {
                "dw_id": user_role.dw_id,
                "dw_name": datawarehouse.dw_connection_name if datawarehouse else f"Datawarehouse {user_role.dw_id}",
            }
            if role.role_code not in dw_roles_meta:
                dw_roles_meta[role.role_code] = DatawarehouseRoleItem(
                    id=role.id,
                    role_code=role.role_code,
                    is_super_admin=role.is_super_admin or 0,
                    is_system_role=role.is_system_role or 0,
                    name=i18n.name if i18n else None,
                    description=i18n.description if i18n else None,
                    datawarehouses=[dw_entry],
                )
            else:
                dw_roles_meta[role.role_code].datawarehouses.append(dw_entry)

    # ------------------------------------------------------------------
    # Step 4 — Workflow-scoped content (iam_user_role_content + workflow)
    # ------------------------------------------------------------------
    wf_payload = get_workflow_access_payload(
        db, user_id, app_key, locale, dw_id, resolve_resource_names=False
    )
    workflow_meta: Dict[str, LoginWorkflowMetaItem] = {}
    for a in wf_payload.assignments:
        workflow_meta[a.workflow_code] = LoginWorkflowMetaItem(
            workflow_id=a.workflow_id,
            workflow_code=a.workflow_code,
            workflow_name=a.workflow_name,
            allow_review=a.allow_review,
        )

    # ------------------------------------------------------------------
    # Step 5 — Assemble UserProfileItem object
    # ------------------------------------------------------------------
    profile = UserProfileItem(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        location=user.location,
        phone=user.phone,
        organisation=user.organisation,
        username=user.username,
        email=user.email,
        status=user.status,
        email_verified=user.email_verified,
        created=user.created,
        modified=user.modified,
        created_by=created_by_name,
        modified_by=modified_by_name,
        last_loggedin_on=user.last_loggedin_on,
        roles=sorted(set(user_role_codes)),
        workflows=wf_payload.workflows,
    )

    return profile, general_roles_meta, dw_roles_meta, workflow_meta


def _query_workflow_scoped_permission_rows(
    db: Session,
    user_id: int,
    app_key: str,
    locale: str,
    dw_id: Optional[int],
) -> List[Tuple[int, str, int, str, Optional[str], bool, int, Optional[int]]]:
    """
    Returns rows:
    (content_id, resource_code, workflow_id, workflow_code, workflow_name,
     allow_review, review_level_count, iam_user_role.dw_id)
    """
    q = (
        db.query(
            IamUserRoleContent.content_id,
            IamUserRoleContent.resource_code,
            ReviewWorkflow.workflow_id,
            ReviewWorkflow.workflow_code,
            ReviewWorkflowI18n.workflow_name,
            ReviewWorkflow.allow_review,
            ReviewWorkflow.review_level_count,
            IamUserRole.dw_id,
        )
        .join(IamUserRole, IamUserRole.id == IamUserRoleContent.user_role_id)
        .join(ReviewWorkflow, ReviewWorkflow.workflow_id == IamUserRoleContent.workflow_id)
        .outerjoin(
            ReviewWorkflowI18n,
            (ReviewWorkflowI18n.master_id == ReviewWorkflow.workflow_id)
            & (ReviewWorkflowI18n.locale == locale),
        )
        .filter(
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamUserRoleContent.workflow_id.isnot(None),
        )
    )
    if dw_id is not None:
        q = q.filter(IamUserRole.dw_id == dw_id)
    return q.all()


def _resolve_workflow_resource_names(
    assignments: List[WorkflowScopedAssignmentInfo],
) -> List[WorkflowScopedAssignmentInfo]:
    """Fill resource_name from warehouse tables when dw_id is set; swallow errors."""
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import (
        Area,
        Indicator,
        IndicatorClassification,
        TimePeriod,
        get_default_locale,
    )

    by_dw: Dict[int, List[WorkflowScopedAssignmentInfo]] = defaultdict(list)
    for a in assignments:
        if a.dw_id is not None:
            by_dw[a.dw_id].append(a)

    name_map: Dict[Tuple[int, str, int], str] = {}

    for d_id, group in by_dw.items():
        try:
            with get_warehouse_session_from_id(str(d_id)) as dw_db:
                loc = get_default_locale(dw_db)
                by_rc: Dict[str, List[int]] = defaultdict(list)
                for a in group:
                    by_rc[a.resource_code].append(a.content_id)
                for rc, nids in by_rc.items():
                    nids_unique = list(dict.fromkeys(nids))
                    if not nids_unique:
                        continue
                    if rc == "dm_dw_area":
                        Am = Area(loc)
                        for nid, nm in (
                            dw_db.query(Am.area_nid, Am.area_name)
                            .filter(Am.area_nid.in_(nids_unique))
                            .all()
                        ):
                            if nm is not None:
                                name_map[(d_id, rc, int(nid))] = str(nm)
                    elif rc == "dm_dw_indicator":
                        Im = Indicator(loc)
                        for nid, nm in (
                            dw_db.query(Im.indicator_nid, Im.indicator_name)
                            .filter(Im.indicator_nid.in_(nids_unique))
                            .all()
                        ):
                            if nm is not None:
                                name_map[(d_id, rc, int(nid))] = str(nm)
                    elif rc == "dm_dw_indicator_classification":
                        Ic = IndicatorClassification(loc)
                        for nid, nm in (
                            dw_db.query(Ic.ic_nid, Ic.ic_name)
                            .filter(Ic.ic_nid.in_(nids_unique))
                            .all()
                        ):
                            if nm is not None:
                                name_map[(d_id, rc, int(nid))] = str(nm)
                    elif rc == "dm_dw_timeperiod":
                        for nid, tp in (
                            dw_db.query(TimePeriod.timeperiod_nid, TimePeriod.timeperiod)
                            .filter(TimePeriod.timeperiod_nid.in_(nids_unique))
                            .all()
                        ):
                            if tp is not None:
                                name_map[(d_id, rc, int(nid))] = str(tp)
        except Exception:
            logger.debug(
                "Skipping workflow resource_name resolution for dw_id=%s",
                d_id,
                exc_info=True,
            )

    return [
        a.model_copy(
            update={
                "resource_name": name_map.get((a.dw_id, a.resource_code, a.content_id)),
            }
        )
        for a in assignments
    ]


def get_workflow_access_payload(
    db: Session,
    user_id: int,
    app_key: str,
    locale: str,
    dw_id: Optional[int] = None,
    *,
    resolve_resource_names: bool = True,
) -> WorkflowAccessPayload:
    """
    Workflow-scoped iam_user_role_content rows for the user and app_key.

    When ``dw_id`` is set, only rows linked to ``iam_user_role`` with that ``dw_id`` are included.
    """
    rows = _query_workflow_scoped_permission_rows(db, user_id, app_key, locale, dw_id)
    workflow_codes: set[str] = set()
    resource_content_ids: defaultdict[str, set[int]] = defaultdict(set)
    resource_wf_content_ids: defaultdict[str, defaultdict[str, set[int]]] = defaultdict(
        lambda: defaultdict(set)
    )
    assignments: List[WorkflowScopedAssignmentInfo] = []
    for content_id, resource_code, wf_id, wf_code, wf_name, allow_review, review_level_count, role_dw_id in rows:
        workflow_codes.add(wf_code)
        resource_content_ids[resource_code].add(content_id)
        resource_wf_content_ids[resource_code][wf_code].add(content_id)
        allow_operational = bool(allow_review) and (review_level_count or 0) > 0
        assignments.append(
            WorkflowScopedAssignmentInfo(
                workflow_id=wf_id,
                workflow_code=wf_code,
                workflow_name=wf_name,
                allow_review=allow_operational,
                dw_id=role_dw_id,
                resource_code=resource_code,
                content_id=content_id,
                scope_type=resource_code_to_scope_type(resource_code),
            )
        )
    if resolve_resource_names and assignments:
        assignments = _resolve_workflow_resource_names(assignments)
    resources_map: Dict[str, WorkflowResourceAccess] = {}
    for rc, ids in resource_content_ids.items():
        wf_buckets = resource_wf_content_ids.get(rc, {})
        by_workflow = {wf: sorted(wf_ids) for wf, wf_ids in sorted(wf_buckets.items())}
        resources_map[rc] = WorkflowResourceAccess(
            content_ids=sorted(ids),
            by_workflow=by_workflow,
        )
    return WorkflowAccessPayload(
        workflows=sorted(workflow_codes),
        resources=resources_map,
        assignments=assignments,
    )


def get_login_workflow_resource_summary(
    db: Session,
    user_id: int,
    app_key: str,
    locale: str,
) -> LoginAuthMeta:
    """
    Login meta: workflow names and resource scope_type hints from workflow-scoped
    iam_user_role_content rows for this user, scoped to the given app_key via iam_user_role.
    """
    payload = get_workflow_access_payload(
        db, user_id, app_key, locale, dw_id=None, resolve_resource_names=False
    )
    meta_workflow: Dict[str, LoginWorkflowMetaItem] = {}
    for a in payload.assignments:
        meta_workflow[a.workflow_code] = LoginWorkflowMetaItem(
            workflow_id=a.workflow_id,
            workflow_code=a.workflow_code,
            workflow_name=a.workflow_name,
            allow_review=a.allow_review,
        )
    meta_resources: Dict[str, LoginResourceMetaItem] = {
        rc: LoginResourceMetaItem(
            resource_code=rc,
            scope_type=resource_code_to_scope_type(rc),
        )
        for rc in payload.resources
    }

    return LoginAuthMeta(
        workflow=meta_workflow,
        resources=meta_resources,
    )


def update_user_profile(
    db: Session,
    user_id: int,
    update_data: UserProfilePatchRequest,
    current_user_id: int,
    app_key: str,
    locale: str,
    dw_id: Optional[int] = None,
) -> Tuple[
    Optional[UserProfileItem],
    Dict[str, RoleMasterItem],
    Dict[str, DatawarehouseRoleItem],
    Dict[str, LoginWorkflowMetaItem],
]:
    """
    Update user profile information for the authenticated user.
    
    Args:
        db: Database session
        user_id: ID of user to update
        update_data: Fields to update
        current_user_id: ID of user making the request (for audit)
        app_key: Application key for role scoping
        locale: Locale for role translations
        dw_id: Optional datawarehouse ID for role scoping
    
    Returns:
        Same 4-tuple as get_user_profile, or (None, {}, {}, {}) if user not found
        
    Raises:
        ValueError: If username already exists for another user
    """
    # ------------------------------------------------------------------
    # Step 1 — Get the user by ID
    # ------------------------------------------------------------------
    user = db.query(IamUser).filter(IamUser.id == user_id).first()
    if not user:
        return None, {}, {}, {}

    # ------------------------------------------------------------------
    # Step 2 — Validate username uniqueness if username is being updated
    # ------------------------------------------------------------------
    if update_data.username is not None and update_data.username != user.username:
        existing_user = db.query(IamUser).filter(
            IamUser.username == update_data.username,
            IamUser.id != user_id
        ).first()
        if existing_user:
            raise Conflict(
                f"Username '{update_data.username}' is already taken",
                error_code="USERNAME_TAKEN",
                identifier=update_data.username,
            )

    # ------------------------------------------------------------------
    # Step 3 — Update only the provided fields (partial update)
    # ------------------------------------------------------------------
    update_fields = {}
    if update_data.first_name is not None:
        update_fields['first_name'] = update_data.first_name
    if update_data.last_name is not None:
        update_fields['last_name'] = update_data.last_name
    if update_data.location is not None:
        update_fields["location"] = update_data.location
    if update_data.phone is not None:
        update_fields["phone"] = update_data.phone
    if update_data.organisation is not None:
        update_fields['organisation'] = update_data.organisation
    if update_data.username is not None:
        update_fields['username'] = update_data.username
    if update_data.email is not None:
        update_fields['email'] = update_data.email

    # Only update if there are fields to update
    if update_fields:
        # Add audit fields
        update_fields['modified'] = datetime.now(timezone.utc).replace(tzinfo=None)
        update_fields['modified_user_id'] = current_user_id
        
        # Update the user record
        db.query(IamUser).filter(IamUser.id == user_id).update(update_fields)
        db.commit()

    # ------------------------------------------------------------------
    # Step 4 — Return the updated profile using existing get_user_profile method
    # ------------------------------------------------------------------
    return get_user_profile(db, user_id, app_key, locale, dw_id)


def admin_update_user(
    db: Session,
    user_id: int,
    update_data: AdminUpdateUserRequest,
    current_user_id: int,
) -> Optional[IamUser]:
    """
    Admin partial update of any user's profile.

    Args:
        db: Database session
        user_id: ID of the user to update
        update_data: Fields to update (all optional)
        current_user_id: ID of the admin performing the action (for audit)

    Returns:
        Updated IamUser ORM instance, or None if the user was not found.

    Raises:
        ValueError: If the requested username is already taken by another user.
    """
    user = db.query(IamUser).filter(IamUser.id == user_id).first()
    if not user:
        return None

    if update_data.username is not None and update_data.username != user.username:
        conflict = db.query(IamUser).filter(
            IamUser.username == update_data.username,
            IamUser.id != user_id,
        ).first()
        if conflict:
            raise Conflict(
                f"Username '{update_data.username}' is already taken",
                error_code="USERNAME_TAKEN",
                identifier=update_data.username,
            )

    update_fields = {}
    if update_data.first_name is not None:
        update_fields["first_name"] = update_data.first_name
    if update_data.last_name is not None:
        update_fields["last_name"] = update_data.last_name
    if update_data.location is not None:
        update_fields["location"] = update_data.location
    if update_data.phone is not None:
        update_fields["phone"] = update_data.phone
    if update_data.organisation is not None:
        update_fields["organisation"] = update_data.organisation
    if update_data.username is not None:
        update_fields["username"] = update_data.username
    if update_data.email is not None:
        update_fields["email"] = str(update_data.email)
    if update_data.status is not None:
        update_fields["status"] = update_data.status

    if update_fields:
        update_fields["modified"] = datetime.now(timezone.utc).replace(tzinfo=None)
        update_fields["modified_user_id"] = current_user_id
        db.query(IamUser).filter(IamUser.id == user_id).update(update_fields)
        db.commit()
        db.refresh(user)

    return user


def admin_delete_user(
    db: Session,
    user_id: int,
    current_user_id: int,
) -> Optional[IamUser]:
    """
    Hard-delete a user by removing the user record and all related data.

    Args:
        db: Database session
        user_id: ID of the user to delete
        current_user_id: ID of the admin performing the action (for audit)

    Returns:
        The IamUser instance that was deleted, or None if the user was not found.
    """
    user = db.query(IamUser).filter(IamUser.id == user_id).first()
    if not user:
        return None

    if getattr(user, "is_system", 0):
        raise Forbidden("System users cannot be deleted", error_code="USER_IS_SYSTEM")

    # Delete related records first to avoid foreign key constraint violations.
    user_role_ids = [
        row.id for row in db.query(IamUserRole.id).filter(IamUserRole.user_id == user_id).all()
    ]
    if user_role_ids:
        db.query(IamUserRoleContent).filter(
            IamUserRoleContent.user_role_id.in_(user_role_ids)
        ).delete(synchronize_session=False)
    db.query(IamUserRoleContent).filter(
        IamUserRoleContent.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(IamUserRole).filter(IamUserRole.user_id == user_id).delete(synchronize_session=False)

    db.delete(user)
    db.commit()
    
    return user
