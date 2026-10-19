"""
Dashboard Users ACL — list/delete memberships; area reads from iam_user_role_content.

Writes (assign role + areas) go through PUT /iam/users/{user_id}/roles with dashboard_id.
Owner bootstrap on clone uses assign_dashboard_owner_admin (legacy createRDashboardUser).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from apps.app_dashboard.constants import DASHBOARD_MODE_EDIT
from apps.app_dashboard.models.dashboard import Dashboard
from apps.app_dashboard.schemas.dashboard_user import (
    DashboardAvailableUserItem,
    DashboardRoleOption,
    DashboardUserAreaItem,
    DashboardUserListItem,
    DashboardUsersConfigResponse,
)
from apps.app_db.models.core import (
    IamRole,
    IamRoleI18n,
    IamUser,
    IamUserRole,
    IamUserRoleContent,
)
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import Area, get_default_locale
from apps.shared.exceptions import BadRequest, InternalError, NotFound

logger = logging.getLogger(__name__)

DASH_USER_AREAS_RESOURCE = "dash_user_areas"
DASH_OWNER_ROLE_CODE = "DFA_DASH_ADMIN"


def parse_comma_separated_int_ids(raw: str, *, param_name: str = "dashboard_ids") -> list[int]:
    """Parse comma-separated integer IDs; dedupe while preserving order."""
    text = (raw or "").strip()
    if not text:
        raise BadRequest(
            f"{param_name} must not be empty",
            error_code="INVALID_QUERY_PARAM",
            details={"param": param_name},
        )

    parts = [part.strip() for part in text.split(",")]
    if any(not part for part in parts):
        raise BadRequest(
            f"{param_name} must be a comma-separated list of integer IDs",
            error_code="INVALID_QUERY_PARAM",
            details={"param": param_name, "value": raw},
        )

    parsed: list[int] = []
    seen: set[int] = set()
    for part in parts:
        try:
            value = int(part)
        except ValueError as exc:
            raise BadRequest(
                f"{param_name} must contain only integer IDs",
                error_code="INVALID_QUERY_PARAM",
                details={"param": param_name, "invalid_segment": part},
            ) from exc
        if value not in seen:
            seen.add(value)
            parsed.append(value)
    return parsed


def require_edit_dashboard_id(db: Session, dashboard_id: int) -> None:
    """Raise if dashboard_id is missing or not an edit-mode dashboard (ACL scope)."""
    require_edit_dashboard_ids(db, [dashboard_id])


def require_edit_dashboard_ids(db: Session, dashboard_ids: list[int]) -> None:
    """Raise if any dashboard_id is missing or not edit-mode (fail entire request)."""
    if not dashboard_ids:
        raise BadRequest(
            "dashboard_ids must not be empty",
            error_code="INVALID_QUERY_PARAM",
            details={"param": "dashboard_ids"},
        )

    rows = (
        db.query(Dashboard.id, Dashboard.mode)
        .filter(Dashboard.id.in_(dashboard_ids))
        .all()
    )
    mode_by_id = {row.id: row.mode for row in rows}

    for dashboard_id in dashboard_ids:
        mode = mode_by_id.get(dashboard_id)
        if mode is None:
            raise NotFound(
                f"Dashboard with id {dashboard_id} not found",
                error_code="DASHBOARD_NOT_FOUND",
            )
        if mode != DASHBOARD_MODE_EDIT:
            raise BadRequest(
                "dashboard_ids must refer to edit-mode dashboards only",
                error_code="DASHBOARD_NOT_EDIT_MODE",
                details={"dashboard_id": dashboard_id, "mode": mode},
            )


def assign_dashboard_owner_admin(
    db: Session,
    *,
    dashboard_id: int,
    user_id: int,
    app_key: str,
    dw_id: int | None = None,
    created_user_id: int | None = None,
) -> IamUserRole:
    """
    Assign DFA_DASH_ADMIN to ``user_id`` for ``dashboard_id`` (legacy createRDashboardUser).

    Idempotent: if a membership already exists for this user/dashboard/app_key, return it
    (and upgrade role_id to DFA_DASH_ADMIN when the existing role_id is missing/zero).
    """
    admin_role = (
        db.query(IamRole)
        .filter(
            IamRole.app_key == app_key,
            IamRole.role_code == DASH_OWNER_ROLE_CODE,
        )
        .first()
    )
    if not admin_role:
        raise InternalError(
            f"System role {DASH_OWNER_ROLE_CODE} not found for app_key={app_key}",
            error_code="DASH_OWNER_ROLE_MISSING",
        )

    existing = (
        db.query(IamUserRole)
        .filter(
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamUserRole.dashboard_id == dashboard_id,
        )
        .first()
    )
    if existing:
        if not existing.role_id:
            existing.role_id = admin_role.id
            db.flush()
        return existing

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = IamUserRole(
        user_id=user_id,
        app_key=app_key,
        dw_id=dw_id,
        role_id=admin_role.id,
        dashboard_id=dashboard_id,
        created=now,
        created_user_id=created_user_id if created_user_id is not None else user_id,
    )
    db.add(row)
    db.flush()
    return row


def get_user_assigned_area_nids_raw(
    db: Session,
    *,
    user_id: int,
    dashboard_id: int,
    app_key: str,
    is_super_admin: bool,
) -> list[int]:
    """
    Return raw area_nid integers (content_id values) assigned to the user for this dashboard.

    Empty list means unrestricted. Super admins always return empty (unrestricted).
    Unlike get_user_assigned_area_ids, this does NOT resolve nids to area_id strings
    via the DW, so it is safe to call without a warehouse session.
    """
    if is_super_admin:
        return []

    user_role_id = (
        db.query(IamUserRole.id)
        .filter(
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamUserRole.dashboard_id == dashboard_id,
        )
        .scalar()
    )
    if not user_role_id:
        return []

    return [
        int(row[0])
        for row in db.query(IamUserRoleContent.content_id)
        .filter(
            IamUserRoleContent.user_role_id == user_role_id,
            IamUserRoleContent.resource_code == DASH_USER_AREAS_RESOURCE,
            IamUserRoleContent.workflow_id.is_(None),
        )
        .all()
    ]


def resolve_dashboard_restricted_nids(raw_nids: list[int]) -> set[int] | None:
    """Non-empty allowlist → restricted set; empty → unrestricted (None)."""
    return set(raw_nids) if raw_nids else None


def get_dashboard_restricted_nids_for_user(
    db: Session,
    *,
    user_id: int,
    dashboard_id: int,
    app_key: str,
    is_super_admin: bool,
) -> set[int] | None:
    """Dashboard area ACL allowlist for selectable marking (matches /dw/areas?dashboard_id=)."""
    raw_nids = get_user_assigned_area_nids_raw(
        db,
        user_id=user_id,
        dashboard_id=dashboard_id,
        app_key=app_key,
        is_super_admin=is_super_admin,
    )
    return resolve_dashboard_restricted_nids(raw_nids)


def mark_area_item_selectable(
    item: dict,
    *,
    dashboard_scoped: bool,
    restricted_nids: set[int] | None,
) -> dict:
    """Set `selectable` on an area dict using dashboard ACL semantics."""
    if not dashboard_scoped:
        return item
    if restricted_nids is not None:
        nid = item.get("area_nid")
        item["selectable"] = nid is not None and int(nid) in restricted_nids
    else:
        item["selectable"] = True
    return item


def get_user_assigned_area_ids(
    db: Session,
    *,
    user_id: int,
    dashboard_id: int,
    app_key: str,
    system_dw_id: int | None,
    is_super_admin: bool,
) -> list[str]:
    """
    Return area_id strings assigned to the user for this dashboard.

    Empty list means unrestricted (legacy semantics). Super admins are always
    unrestricted and content rows are not read.
    """
    if is_super_admin:
        return []

    user_role_id = (
        db.query(IamUserRole.id)
        .filter(
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamUserRole.dashboard_id == dashboard_id,
        )
        .scalar()
    )
    if not user_role_id:
        return []

    area_nids = [
        row[0]
        for row in db.query(IamUserRoleContent.content_id)
        .filter(
            IamUserRoleContent.user_role_id == user_role_id,
            IamUserRoleContent.resource_code == DASH_USER_AREAS_RESOURCE,
            IamUserRoleContent.workflow_id.is_(None),
        )
        .all()
    ]
    if not area_nids or not system_dw_id:
        return []

    try:
        with get_warehouse_session_from_id(str(system_dw_id)) as dw_db:
            lang = get_default_locale(dw_db)
            area_model = Area(lang)
            rows = (
                dw_db.query(area_model.area_id)
                .filter(area_model.area_nid.in_(area_nids))
                .all()
            )
        area_ids = sorted(
            {
                (row.area_id or "").strip()
                for row in rows
                if row.area_id and (row.area_id or "").strip()
            }
        )
        return area_ids
    except Exception as exc:
        logger.warning(
            "Failed to resolve user area nids for dashboard_id=%s user_id=%s: %s",
            dashboard_id,
            user_id,
            exc,
        )
        return []


def _get_dashboard_or_404(db: Session, dashboard_id: int) -> Dashboard:
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise NotFound(
            f"Dashboard with id {dashboard_id} not found",
            error_code="DASHBOARD_NOT_FOUND",
        )
    return dashboard


def _resolve_area_details(
    system_dw_id: int | None,
    area_nids: list[int],
) -> dict[int, DashboardUserAreaItem]:
    if not system_dw_id or not area_nids:
        return {
            nid: DashboardUserAreaItem(area_nid=nid)
            for nid in area_nids
        }
    try:
        with get_warehouse_session_from_id(str(system_dw_id)) as dw_db:
            lang = get_default_locale(dw_db)
            area_model = Area(lang)
            rows = (
                dw_db.query(
                    area_model.area_nid,
                    area_model.area_id,
                    area_model.area_name,
                )
                .filter(area_model.area_nid.in_(area_nids))
                .all()
            )
        by_nid: dict[int, DashboardUserAreaItem] = {}
        for nid, area_id, area_name in rows:
            by_nid[int(nid)] = DashboardUserAreaItem(
                area_nid=int(nid),
                area_id=(area_id or None),
                area_name=(area_name or None),
            )
        for nid in area_nids:
            by_nid.setdefault(nid, DashboardUserAreaItem(area_nid=nid))
        return by_nid
    except Exception as exc:
        logger.warning(
            "Failed to enrich area names for system_dw_id=%s: %s",
            system_dw_id,
            exc,
        )
        return {nid: DashboardUserAreaItem(area_nid=nid) for nid in area_nids}


def get_dashboard_users_config(
    db: Session,
    *,
    dashboard_id: int,
    app_key: str,
    locale: str = "en",
) -> DashboardUsersConfigResponse:
    """
    Users tab bootstrap (legacy service 409).

    Returns assigned users (with role + areas), available users, and role catalog.
    """
    dashboard = _get_dashboard_or_404(db, dashboard_id)

    role_rows = (
        db.query(IamRole, IamRoleI18n)
        .outerjoin(
            IamRoleI18n,
            (IamRoleI18n.master_id == IamRole.id) & (IamRoleI18n.locale == locale),
        )
        .filter(IamRole.app_key == app_key)
        .order_by(IamRole.display_order.asc(), IamRole.id.asc())
        .all()
    )
    roles: list[DashboardRoleOption] = []
    role_name_by_id: dict[int, str] = {}
    for role, i18n in role_rows:
        name = i18n.name if i18n and i18n.name else role.role_code
        roles.append(
            DashboardRoleOption(
                role_id=role.id,
                role_code=role.role_code,
                role_name=name,
            )
        )
        role_name_by_id[role.id] = name

    assignments = (
        db.query(IamUserRole, IamUser, IamRole)
        .join(IamUser, IamUser.id == IamUserRole.user_id)
        .join(IamRole, IamRole.id == IamUserRole.role_id)
        .filter(
            IamUserRole.dashboard_id == dashboard_id,
            IamUserRole.app_key == app_key,
        )
        .order_by(IamUser.first_name.asc(), IamUser.id.asc())
        .all()
    )

    user_role_ids = [ur.id for ur, _user, _role in assignments]
    content_by_ur: dict[int, list[int]] = {ur_id: [] for ur_id in user_role_ids}
    if user_role_ids:
        content_rows = (
            db.query(IamUserRoleContent.user_role_id, IamUserRoleContent.content_id)
            .filter(
                IamUserRoleContent.user_role_id.in_(user_role_ids),
                IamUserRoleContent.resource_code == DASH_USER_AREAS_RESOURCE,
                IamUserRoleContent.workflow_id.is_(None),
            )
            .all()
        )
        for ur_id, content_id in content_rows:
            content_by_ur.setdefault(int(ur_id), []).append(int(content_id))

    all_area_nids = sorted({nid for nids in content_by_ur.values() for nid in nids})
    area_by_nid = _resolve_area_details(dashboard.system_dw_id, all_area_nids)

    assigned_user_ids: set[int] = set()
    dashboard_users: list[DashboardUserListItem] = []
    for ur, user, role in assignments:
        assigned_user_ids.add(int(user.id))
        area_items = [
            area_by_nid.get(nid, DashboardUserAreaItem(area_nid=nid))
            for nid in content_by_ur.get(ur.id, [])
        ]
        dashboard_users.append(
            DashboardUserListItem(
                user_id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                username=user.username,
                email=user.email,
                role_id=role.id,
                role_code=role.role_code,
                role_name=role_name_by_id.get(role.id, role.role_code),
                areas=area_items,
            )
        )

    available_q = db.query(IamUser).filter(IamUser.is_system == 0)
    if assigned_user_ids:
        available_q = available_q.filter(~IamUser.id.in_(assigned_user_ids))
    available_users = [
        DashboardAvailableUserItem(
            user_id=u.id,
            first_name=u.first_name,
            last_name=u.last_name,
            username=u.username,
            email=u.email,
        )
        for u in available_q.order_by(IamUser.first_name.asc(), IamUser.id.asc()).all()
    ]

    return DashboardUsersConfigResponse(
        dashboard_users=dashboard_users,
        available_users=available_users,
        roles=roles,
    )


def delete_dashboard_user(
    db: Session,
    *,
    dashboard_id: int,
    target_user_id: int,
    caller_user_id: int,
    app_key: str,
) -> None:
    """
    Remove a user's dashboard membership (legacy service 411).

    Auth for the DELETE route is enforced by middleware. Business rule: a caller
    cannot remove their own assignment.
    """
    _get_dashboard_or_404(db, dashboard_id)

    if target_user_id == caller_user_id:
        raise BadRequest(
            "You cannot remove yourself from this dashboard",
            error_code="DASHBOARD_CANNOT_REMOVE_SELF",
        )

    assignment = (
        db.query(IamUserRole)
        .filter(
            IamUserRole.dashboard_id == dashboard_id,
            IamUserRole.user_id == target_user_id,
            IamUserRole.app_key == app_key,
        )
        .first()
    )
    if not assignment:
        return

    content_count = (
        db.query(IamUserRoleContent)
        .filter(
            IamUserRoleContent.user_role_id == assignment.id,
            IamUserRoleContent.workflow_id.is_(None),
        )
        .count()
    )
    db.query(IamUserRoleContent).filter(
        IamUserRoleContent.user_role_id == assignment.id,
        IamUserRoleContent.workflow_id.is_(None),
    ).delete(synchronize_session=False)
    db.delete(assignment)

    from apps.app_dashboard.utils.audit_events import app_buffer_manual_audit
    db.info["audit_app_key"] = app_key
    app_buffer_manual_audit(
        db,
        action="DELETE",
        module="dashboard_iam_roles",
        identifier=str(dashboard_id),
        previous_value={
            "user_id": target_user_id,
            "app_key": app_key,
            "dashboard_id": dashboard_id,
            "content_rows_deleted": content_count,
        },
        description=f"remove user_id={target_user_id} from dashboard_id={dashboard_id}",
    )
    db.commit()
