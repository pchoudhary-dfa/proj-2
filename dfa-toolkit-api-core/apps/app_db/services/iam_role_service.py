"""
Service for IAM role create / patch / delete operations.
"""
from datetime import datetime
from typing import Dict, List, Optional, Set

from sqlalchemy import asc, or_
from sqlalchemy.orm import Session

from apps.app_db.db.core import SessionLocal
from apps.app_db.models.core import IamResource, IamResourceApi, IamResourceI18n, IamRole, IamRoleI18n, IamRoleResourceApi, IamUser, IamUserRole, IamUserRoleContent, SystemLanguage
from apps.app_db.schemas.iam import (
    AppScopedPermissions,
    BulkDashboardPermissionsData,
    DashboardPermissionsSlice,
    RoleAssignmentInfo,
    RoleCreateItem,
    RoleCreateRequest,
    RolePatchRequest,
    RoleResponse,
    ResourcePermissionsInfo,
    SaveRolePermissionsRequest,
    SaveUserRolesRequest,
    UserPermissionsData,
    WorkflowAccessPayload,
)
from apps.app_db.services.user_service import get_workflow_access_payload
from apps.app_dashboard.services.user_area_service import require_edit_dashboard_ids
from apps.shared.config.config import settings

# Maps iam_resource_api.action → CRUD letter.
# Derived from CRUD_ACTION_MAP so the mapping stays configurable via .env.
_ACTION_TO_CRUD: Dict[str, str] = {
    action: letter
    for letter, actions in settings.CRUD_ACTION_MAP.items()
    for action in actions
}


def _row_crud_letter(action: str | None) -> str | None:
    """Return the CRUD letter for a resource API row from its ``action`` field."""
    return _ACTION_TO_CRUD.get(action or "")


def _inject_authenticated_read_grants(
    db: Session,
    app_key: str,
    target_is_dw_spec: int,
    resource_crud: Dict[int, Set[str]],
) -> None:
    """
    Surface R for resources whose READ access is not gated by PERMISSION-level APIs.

    For is_dw_spec=1 (DW-specific) resources: inject R whenever the resource has an
    active READ API at PUBLIC / APP_CLIENT / AUTHENTICATED and no READ API at PERMISSION.

    For is_dw_spec=0 (application-level) resources: apply the same access-level check
    but only inject R when the resource already has at least one explicit C, U, or D
    grant in resource_crud (i.e. the role has write access to the resource). A standalone
    R on a freely-readable non-DW endpoint is not injected without write context.
    """
    rows = (
        db.query(IamResourceApi.resource_id, IamResourceApi.access_level)
        .join(IamResource, IamResource.id == IamResourceApi.resource_id)
        .filter(
            IamResourceApi.app_key == app_key,
            IamResourceApi.is_active == 1,
            IamResourceApi.action == "READ",
            IamResource.is_active == 1,
            IamResource.is_dw_spec == target_is_dw_spec,
        )
        .all()
    )

    levels_by_resource: Dict[int, Set[str]] = {}
    for rid, access_level in rows:
        if access_level:
            levels_by_resource.setdefault(rid, set()).add(access_level)

    injectable_levels = {"PUBLIC", "APP_CLIENT", "AUTHENTICATED"}

    for rid, levels in levels_by_resource.items():
        if "PERMISSION" in levels:
            continue
        if levels & injectable_levels:
            if target_is_dw_spec == 0:
                # For non-DW resources: only auto-inject R when the role already has
                # an explicit C, U, or D grant for this resource. A bare R on a
                # freely-readable endpoint is not meaningful without write context.
                if {"C", "U", "D"} & resource_crud.get(rid, set()):
                    resource_crud.setdefault(rid, set()).add("R")
            else:
                # DW-specific resources keep the existing free-injection behaviour.
                resource_crud.setdefault(rid, set()).add("R")


_CRUD_ORDER = ["C", "R", "U", "D"]
_I18N_PREFIX = "#"


def _i18n_value_for_locale(
    value: str | None, target_locale: str, request_locale: str
) -> str | None:
    if value is None:
        return None
    if target_locale == request_locale:
        return value
    return f"{_I18N_PREFIX}{value}"


class IamRoleService:

    @staticmethod
    def _get_active_locales(db: Session) -> list[str]:
        languages = (
            db.query(SystemLanguage)
            .filter(SystemLanguage.is_deleted.is_(False))
            .order_by(SystemLanguage.is_default.desc(), SystemLanguage.locale.asc())
            .all()
        )
        locales: list[str] = []
        for language in languages:
            locale_key = (language.locale or "").strip().lower()
            if locale_key and locale_key not in locales:
                locales.append(locale_key)
        return locales

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    def create_roles(
        self,
        payload: list[RoleCreateItem],
        locale: str,
        user_id: int,
        app_key: str,
    ) -> list[RoleResponse]:
        """Create one or more roles in a single transaction. Rolls back all on any failure."""
        db: Session = SessionLocal()
        try:
            now = datetime.utcnow()
            results: list[RoleResponse] = []

            for item in payload:
                role = IamRole(
                    app_key=app_key,
                    role_code=item.role_code,
                    is_super_admin=item.is_super_admin,
                    is_system_role=item.is_system_role,
                    display_order=item.display_order or 0,
                    created=now,
                    created_user_id=user_id,
                    modified=now,
                    modified_user_id=user_id,
                )
                db.add(role)
                db.flush()  # get role.id before next iteration

                if item.name:
                    request_locale = locale.strip().lower()
                    active_locales = self._get_active_locales(db)
                    locales_to_seed = list(active_locales)
                    if request_locale and request_locale not in locales_to_seed:
                        locales_to_seed.append(request_locale)
                    if not locales_to_seed and request_locale:
                        locales_to_seed = [request_locale]

                    for loc in locales_to_seed:
                        db.add(
                            IamRoleI18n(
                                master_id=role.id,
                                locale=loc,
                                name=_i18n_value_for_locale(item.name, loc, request_locale),
                                description=_i18n_value_for_locale(
                                    item.description, loc, request_locale
                                ),
                            )
                        )

                results.append(self._to_response(role, item.name, item.description))

            db.commit()
            return results
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Patch
    # ------------------------------------------------------------------

    def patch_role(
        self,
        role_id: int,
        payload: RolePatchRequest,
        locale: str,
        user_id: int,
    ) -> Optional[RoleResponse]:
        db: Session = SessionLocal()
        try:
            role = db.query(IamRole).filter(IamRole.id == role_id).first()
            if not role:
                return None

            _i18n_fields = {"name", "description"}
            updates = payload.model_dump(exclude_unset=True, exclude=_i18n_fields)
            for key, value in updates.items():
                setattr(role, key, value)
            role.modified = datetime.utcnow()
            role.modified_user_id = user_id

            name = payload.name if "name" in payload.model_fields_set else None
            description = payload.description if "description" in payload.model_fields_set else None

            if name is not None:
                existing_i18n = (
                    db.query(IamRoleI18n)
                    .filter(IamRoleI18n.master_id == role_id, IamRoleI18n.locale == locale)
                    .first()
                )
                if existing_i18n:
                    existing_i18n.name = name
                    existing_i18n.description = description
                else:
                    db.add(IamRoleI18n(master_id=role_id, locale=locale, name=name, description=description))

            db.commit()
            db.refresh(role)

            # If name/description were not provided in this request, return any stored translation for the locale
            if name is None:
                stored = (
                    db.query(IamRoleI18n)
                    .filter(IamRoleI18n.master_id == role_id, IamRoleI18n.locale == locale)
                    .first()
                )
                if stored:
                    name, description = stored.name, stored.description

            return self._to_response(role, name, description)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete_role(self, role_id: int) -> tuple[bool, str]:
        """
        Returns (success, reason).
        reason is one of: "deleted", "not_found", "system_role"
        """
        db: Session = SessionLocal()
        try:
            role = db.query(IamRole).filter(IamRole.id == role_id).first()
            if not role:
                return False, "not_found"
            if role.is_system_role:
                return False, "system_role"

            db.query(IamRoleI18n).filter(IamRoleI18n.master_id == role_id).delete()
            db.delete(role)
            db.commit()
            return True, "deleted"
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Save Role Permissions
    # ------------------------------------------------------------------

    def save_role_permissions(
        self,
        role_id: int,
        payload: SaveRolePermissionsRequest,
        db: Session,
        user_id: int = 0,
    ) -> tuple[str | None, str | None, int]:
        """
        Persist role permissions for a role.

        Returns (error_type, error_detail, resources_received).
        error_type is one of: None, "role_not_found", "role_id_mismatch", "resource_not_found".
        error_detail carries the offending value when error_type is not None.
        """
        role = db.query(IamRole).filter(IamRole.id == role_id).first()
        if not role:
            return "role_not_found", str(role_id), 0

        payload_role_id = payload.data.role.role_id
        if payload_role_id != role_id:
            return "role_id_mismatch", f"path={role_id}, body={payload_role_id}", 0

        app_key = role.app_key
        resources_received = len(payload.data.resources)

        # Expand CRUD permissions to (resource_id, resource_api_id) pairs
        new_mappings: List[tuple[int, int]] = []
        for resource_item in payload.data.resources:
            resource = (
                db.query(IamResource)
                .filter(
                    IamResource.resource_code == resource_item.resource_code,
                    IamResource.app_key == app_key,
                )
                .first()
            )
            if not resource:
                return "resource_not_found", resource_item.resource_code, 0

            actions: List[str] = []
            for crud_letter in resource_item.permissions:
                actions.extend(settings.CRUD_ACTION_MAP.get(crud_letter, []))

            if not actions:
                continue

            api_rows = (
                db.query(IamResourceApi)
                .filter(
                    IamResourceApi.app_key == app_key,
                    IamResourceApi.resource_id == resource.id,
                    IamResourceApi.action.in_(actions),
                    IamResourceApi.is_active == 1,
                )
                .all()
            )
            for api_row in api_rows:
                new_mappings.append((resource.id, api_row.id))

        # Replace existing mappings atomically
        now = datetime.utcnow()
        db.query(IamRoleResourceApi).filter(IamRoleResourceApi.role_id == role_id).delete(synchronize_session=False)
        for resource_id, resource_api_id in new_mappings:
            db.add(
                IamRoleResourceApi(
                    role_id=role_id,
                    resource_id=resource_id,
                    resource_api_id=resource_api_id,
                    created=now,
                    created_user_id=user_id,
                )
            )
        db.commit()

        return None, None, resources_received

    def direct_resource_ids_for_app(self, db: Session, app_key: str) -> Set[int]:
        """Return resource IDs that have ≥1 active iam_resource_api row for app_key
        and whose iam_resource row is active + role-assignable."""
        api_resource_ids: Set[int] = {
            rid
            for (rid,) in db.query(IamResourceApi.resource_id)
            .filter(IamResourceApi.app_key == app_key, IamResourceApi.is_active == 1)
            .distinct()
            .all()
        }
        if not api_resource_ids:
            return set()
        assignable_ids: Set[int] = {
            rid
            for (rid,) in db.query(IamResource.id)
            .filter(
                IamResource.id.in_(api_resource_ids),
                IamResource.is_active == 1,
                IamResource.is_role_assignable == 1,
            )
            .all()
        }
        return assignable_ids

    def expand_resource_ancestor_ids(self, db: Session, resource_ids: Set[int]) -> Set[int]:
        """Return resource_ids unioned with all active ancestor iam_resource rows
        (walks the parent_id chain until parent_id=0)."""
        all_ids: Set[int] = set(resource_ids)
        ids_to_check: Set[int] = set(resource_ids)
        while ids_to_check:
            parent_rows = (
                db.query(IamResource.parent_id)
                .filter(IamResource.id.in_(ids_to_check))
                .all()
            )
            ids_to_check = set()
            for (pid,) in parent_rows:
                if pid and pid != 0 and pid not in all_ids:
                    # Only include active ancestor rows
                    active = db.query(IamResource.id).filter(
                        IamResource.id == pid, IamResource.is_active == 1
                    ).first()
                    if active:
                        all_ids.add(pid)
                        ids_to_check.add(pid)
        return all_ids

    def listable_resource_ids_for_app(self, db: Session, app_key: str) -> Set[int]:
        """Return the full set of resource IDs visible in GET /iam/resources for app_key:
        directly API-visible (assignable) resources plus auto-injected active ancestors."""
        direct = self.direct_resource_ids_for_app(db, app_key)
        return self.expand_resource_ancestor_ids(db, direct)

    def applicable_crud_by_resource_id(self, db: Session, app_key: str, permission_only: bool = False) -> Dict[int, List[str]]:
        """
        Map iam_resource.id -> sorted CRUD letters that have at least one active iam_resource_api row.
        Used for admin UI (only enable letters that save_role_permissions can persist).

        Args:
            permission_only: If True, only include endpoints with access_level = "PERMISSION"
        """
        query = (
            db.query(IamResourceApi.resource_id, IamResourceApi.action)
            .filter(IamResourceApi.app_key == app_key, IamResourceApi.is_active == 1)
        )

        if permission_only:
            query = query.filter(IamResourceApi.access_level == "PERMISSION")

        rows = query.all()
        resource_crud: Dict[int, Set[str]] = {}
        for rid, action in rows:
            letter = _row_crud_letter(action)
            if letter:
                resource_crud.setdefault(rid, set()).add(letter)
        return {
            rid: sorted(letters, key=lambda x: _CRUD_ORDER.index(x))
            for rid, letters in resource_crud.items()
        }

    def get_role_permissions(
        self,
        role_id: int,
        db: Session,
        app_key: str,
        locale: str,
    ) -> tuple[Optional[str], Optional[str], List[ResourcePermissionsInfo]]:
        """
        Return resource-level CRUD permissions for a role (inverse of save_role_permissions).

        Returns (error_type, error_detail, resources).
        error_type is None or "role_not_found".
        Super-admin roles: per-resource permissions match registered APIs only (letters that can be stored);
        at runtime super-admins still receive full access via is_super_admin.
        """
        role = db.query(IamRole).filter(IamRole.id == role_id).first()
        if not role or role.app_key != app_key:
            return "role_not_found", str(role_id), []

        if role.is_super_admin:
            applicable = self.applicable_crud_by_resource_id(db, app_key)
            rows = (
                db.query(IamResource, IamResourceI18n)
                .outerjoin(
                    IamResourceI18n,
                    (IamResourceI18n.master_id == IamResource.id) & (IamResourceI18n.locale == locale),
                )
                .filter(IamResource.app_key == app_key, IamResource.is_active == 1)
                .order_by(asc(IamResource.display_order), asc(IamResource.resource_code))
                .all()
            )
            resources = [
                ResourcePermissionsInfo(
                    resource_code=res.resource_code,
                    name=i18n.name if i18n else None,
                    permissions=list(applicable.get(res.id, [])),
                )
                for res, i18n in rows
            ]
            return None, None, resources

        rra_rows = (
            db.query(IamRoleResourceApi, IamResourceApi)
            .join(IamResourceApi, IamResourceApi.id == IamRoleResourceApi.resource_api_id)
            .filter(
                IamRoleResourceApi.role_id == role_id,
                IamResourceApi.is_active == 1,
            )
            .all()
        )

        resource_crud: Dict[int, Set[str]] = {}
        for rra, rapi in rra_rows:
            crud_letter = _row_crud_letter(rapi.action)
            if crud_letter:
                resource_crud.setdefault(rra.resource_id, set()).add(crud_letter)

        if not resource_crud:
            return None, None, []

        resource_rows = (
            db.query(IamResource, IamResourceI18n)
            .outerjoin(
                IamResourceI18n,
                (IamResourceI18n.master_id == IamResource.id) & (IamResourceI18n.locale == locale),
            )
            .filter(IamResource.id.in_(list(resource_crud.keys())))
            .order_by(asc(IamResource.display_order), asc(IamResource.resource_code))
            .all()
        )

        resources = [
            ResourcePermissionsInfo(
                resource_code=res.resource_code,
                name=i18n.name if i18n else None,
                permissions=sorted(resource_crud[res.id], key=lambda x: _CRUD_ORDER.index(x)),
            )
            for res, i18n in resource_rows
        ]
        return None, None, resources

    # ------------------------------------------------------------------
    # Save User Roles
    # ------------------------------------------------------------------

    def save_user_roles(
        self,
        user_id: int,
        payload: SaveUserRolesRequest,
        db: Session,
        app_key: str = "",
        current_user_id: int = 0,
    ) -> tuple[str | None, str | None, int, int]:
        """
        Assign roles to a user for an app_key, replacing assignments in scope.

        Scope:
        - dashboard_id set → replace only rows for that dashboard_id
        - dashboard_id omitted → replace only rows with dashboard_id IS NULL
          (warehouse/app assignments; never touches dashboard memberships)

        Returns (error_type, error_detail, roles_received, roles_with_content).
        error_type is one of: None, "user_not_found", "user_id_mismatch", "role_not_found",
        "role_app_key_mismatch", "resource_not_found", "superadmin_forbidden",
        "dashboard_not_found", "dashboard_not_edit_mode".
        error_detail carries the offending value when error_type is not None.
        """
        from apps.app_dashboard.constants import DASHBOARD_MODE_EDIT
        from apps.app_dashboard.models.dashboard import Dashboard

        user = db.query(IamUser).filter(IamUser.id == user_id).first()
        if not user:
            return "user_not_found", str(user_id), 0, 0

        payload_user_id = payload.data.user_id
        if payload_user_id != user_id:
            return "user_id_mismatch", f"path={user_id}, body={payload_user_id}", 0, 0

        dw_id = payload.data.dw_id
        dashboard_id = payload.data.dashboard_id

        if dashboard_id is not None:
            dashboard = (
                db.query(Dashboard)
                .filter(Dashboard.id == dashboard_id)
                .first()
            )
            if not dashboard:
                return "dashboard_not_found", str(dashboard_id), 0, 0
            if dashboard.mode != DASHBOARD_MODE_EDIT:
                return (
                    "dashboard_not_edit_mode",
                    f"dashboard_id={dashboard_id}, mode={dashboard.mode!r}",
                    0,
                    0,
                )
            # Default dw_id from the dashboard when caller omits it.
            if dw_id is None and dashboard.system_dw_id is not None:
                dw_id = dashboard.system_dw_id

        # Validate all role_ids up-front: must exist and belong to the caller's app_key.
        for role_entry in payload.data.roles:
            role = db.query(IamRole).filter(IamRole.id == role_entry.role_id).first()
            if not role:
                return "role_not_found", str(role_entry.role_id), 0, 0
            if role.app_key != app_key:
                return (
                    "role_app_key_mismatch",
                    f"role_id={role.id}, role_app_key={role.app_key}, request_app_key={app_key}",
                    0,
                    0,
                )
            if (role.is_super_admin or 0) == 1:
                return "superadmin_forbidden", str(role.id), 0, 0

        now = datetime.utcnow()
        roles_received = len(payload.data.roles)
        roles_with_content = sum(1 for r in payload.data.roles if r.content_restrictions)

        # Replace existing assignments in the requested scope only.
        scope_filter = [
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamUserRole.dw_id == None if dw_id is None else IamUserRole.dw_id == dw_id,  # noqa: E711
        ]
        if dashboard_id is not None:
            scope_filter.append(IamUserRole.dashboard_id == dashboard_id)
        else:
            # Preserve dashboard-scoped memberships when managing app/DW roles.
            scope_filter.append(IamUserRole.dashboard_id.is_(None))

        existing_ids = [
            row.id for row in db.query(IamUserRole.id).filter(*scope_filter).all()
        ]

        # Compute which roles are removed so we can prune their workflow-scoped content rows.
        old_role_ids = {
            row.role_id for row in db.query(IamUserRole.role_id).filter(*scope_filter).all()
        }
        new_role_ids = {r.role_id for r in payload.data.roles}
        deleted_role_ids = old_role_ids - new_role_ids

        # Workflow content is DW-scoped; only prune when not managing dashboard memberships.
        if deleted_role_ids and dashboard_id is None:
            db.query(IamUserRoleContent).filter(
                IamUserRoleContent.user_id == user_id,
                IamUserRoleContent.role_id.in_(deleted_role_ids),
                IamUserRoleContent.workflow_id != None,  # noqa: E711
            ).delete(synchronize_session=False)

        # Delete non-workflow general content rows first (FK constraint on iam_user_role_content).
        if existing_ids:
            db.query(IamUserRoleContent).filter(
                IamUserRoleContent.user_role_id.in_(existing_ids),
                IamUserRoleContent.workflow_id == None,  # noqa: E711 — preserve workflow-scoped rows
            ).delete(synchronize_session=False)

        db.query(IamUserRole).filter(*scope_filter).delete(synchronize_session=False)

        # Recreate iam_user_role rows; track new IDs for workflow content re-resolution.
        new_role_id_map: dict = {}  # role_id → new iam_user_role.id
        for role_entry in payload.data.roles:
            new_user_role = IamUserRole(
                user_id=user_id,
                app_key=app_key,
                dw_id=dw_id,
                role_id=role_entry.role_id,
                dashboard_id=dashboard_id,
                created=now,
                created_user_id=current_user_id,
            )
            db.add(new_user_role)
            db.flush()  # populate new_user_role.id before inserting content rows
            new_role_id_map[role_entry.role_id] = new_user_role.id

            if not role_entry.content_restrictions:
                continue

            for restriction in role_entry.content_restrictions:
                resource = (
                    db.query(IamResource)
                    .filter(
                        IamResource.resource_code == restriction.resource_code,
                        IamResource.app_key == app_key,
                    )
                    .first()
                )
                if not resource:
                    db.rollback()
                    return "resource_not_found", restriction.resource_code, 0, 0

                for content_id in restriction.content_ids:
                    db.add(
                        IamUserRoleContent(
                            user_role_id=new_user_role.id,
                            resource_code=resource.resource_code,
                            content_id=content_id,
                            created=now,
                            created_user_id=current_user_id,
                        )
                    )

        # Re-resolve user_role_id for workflow-scoped content rows of kept/new roles.
        if new_role_id_map and dashboard_id is None:
            wf_rows = db.query(IamUserRoleContent).filter(
                IamUserRoleContent.user_id == user_id,
                IamUserRoleContent.role_id.in_(new_role_id_map.keys()),
                IamUserRoleContent.workflow_id != None,  # noqa: E711
            ).all()
            for row in wf_rows:
                new_ur_id = new_role_id_map.get(row.role_id)
                if new_ur_id is not None:
                    row.user_role_id = new_ur_id

        from apps.app_dashboard.utils.audit_events import app_buffer_manual_audit
        db.info["audit_app_key"] = app_key
        app_buffer_manual_audit(
            db,
            action="UPDATE",
            module="dashboard_iam_roles",
            identifier=str(dashboard_id) if dashboard_id is not None else None,
            new_value={
                "user_id": user_id,
                "app_key": app_key,
                "dw_id": dw_id,
                "dashboard_id": dashboard_id,
                "roles_assigned": roles_received,
                "roles_with_content": roles_with_content,
            },
            description=f"save_user_roles user_id={user_id} dashboard_id={dashboard_id}",
        )

        db.commit()
        return None, None, roles_received, roles_with_content

    # ------------------------------------------------------------------
    # Get User Permissions
    # ------------------------------------------------------------------

    def _compute_app_permissions(
        self,
        user_id: int,
        app_key: str,
        db: Session,
        dw_id: Optional[int],
        locale: str,
        dashboard_id: Optional[int] = None,
    ) -> AppScopedPermissions:
        """
        Core permissions logic for a single, concrete app_key.

        Three mutually exclusive modes (caller must not pass both dw_id and dashboard_id):

        - neither set → ALL role assignments for app_key (global + DW + dashboard-scoped).
          Resources: ``is_dw_spec=0 AND is_dash_spec=0`` (app-level).
        - ``dw_id`` set → assignments for that warehouse or global (``dw_id IS NULL``).
          Resources: ``is_dw_spec=1 AND is_dash_spec=0``.
        - ``dashboard_id`` set → assignments with exact ``dashboard_id`` only.
          Resources: ``is_dash_spec=1`` (any ``is_dw_spec``).

        Super-admin short-circuit: returns full CRUD for matching resources under app_key.
        Detected from any is_super_admin role on the user (any app_key), matching JWT
        ``super_admin_api_keys`` behavior in auth_token_payload.
        """
        # For READ injection: dashboard mode uses is_dw_spec=0 rules (dash resources are non-DW).
        inject_is_dw_spec = 0 if dashboard_id is not None or dw_id is None else 1

        # ── Step 1: fetch user-role assignments ─────────────────────────
        query = (
            db.query(IamUserRole, IamRole, IamRoleI18n)
            .join(IamRole, IamRole.id == IamUserRole.role_id)
            .outerjoin(
                IamRoleI18n,
                (IamRoleI18n.master_id == IamRole.id) & (IamRoleI18n.locale == locale),
            )
            .filter(IamUserRole.user_id == user_id, IamUserRole.app_key == app_key)
        )
        if dashboard_id is not None:
            query = query.filter(IamUserRole.dashboard_id == dashboard_id)
        elif dw_id is None:
            # Include ALL assignments (global, per-warehouse, per-dashboard) so that
            # application-level resources granted by scoped roles appear at login.
            pass
        else:
            # Global assignments (dw_id NULL) apply to every warehouse context.
            query = query.filter(
                or_(
                    IamUserRole.dw_id == dw_id,
                    IamUserRole.dw_id.is_(None),
                )
            )

        assignments = query.all()

        # ── Step 2: build roles list + detect super-admin ───────────────
        roles: List[RoleAssignmentInfo] = []
        is_super_admin = False
        role_ids: List[int] = []

        for ur, role, i18n in assignments:
            roles.append(
                RoleAssignmentInfo(
                    role_id=role.id,
                    role_code=role.role_code,
                    role_name=i18n.name if i18n else role.role_code,
                    dw_id=ur.dw_id,
                )
            )
            role_ids.append(role.id)
            if role.is_super_admin:
                is_super_admin = True

        # Align with JWT (auth_token_payload): any is_super_admin role on the user
        # (any app_key) grants full permissions for the requested app_key / scope.
        # Without this, a DFA_DM superadmin logging into DFA_DASH gets empty resources.
        if not is_super_admin:
            is_super_admin = (
                db.query(IamRole.id)
                .join(IamUserRole, IamUserRole.role_id == IamRole.id)
                .filter(
                    IamUserRole.user_id == user_id,
                    IamRole.is_super_admin == 1,
                )
                .first()
                is not None
            )

        def _resource_in_scope(is_dw_spec: int, is_dash_spec: int) -> bool:
            if dashboard_id is not None:
                return int(is_dash_spec) == 1
            if dw_id is not None:
                return int(is_dw_spec) == 1 and int(is_dash_spec) == 0
            return int(is_dw_spec) == 0 and int(is_dash_spec) == 0

        # ── Step 3a: super-admin path — all resources with full CRUD ────
        if is_super_admin:
            visible_ids = self.listable_resource_ids_for_app(db, app_key)
            all_res_rows = (
                db.query(IamResource, IamResourceI18n)
                .outerjoin(
                    IamResourceI18n,
                    (IamResourceI18n.master_id == IamResource.id) & (IamResourceI18n.locale == locale),
                )
                .filter(
                    IamResource.id.in_(visible_ids),
                    IamResource.is_active == 1,
                )
                .all()
            )
            resources: List[ResourcePermissionsInfo] = [
                ResourcePermissionsInfo(
                    resource_code=res.resource_code,
                    name=i18n.name if i18n else None,
                    permissions=["C", "R", "U", "D"],
                )
                for res, i18n in all_res_rows
                if _resource_in_scope(res.is_dw_spec or 0, getattr(res, "is_dash_spec", 0) or 0)
            ]
            return AppScopedPermissions(is_super_admin=True, roles=roles, resources=resources)

        # ── Step 3b: normal path — union CRUD from role-resource-api ────
        resource_crud: Dict[int, Set[str]] = {}

        if role_ids:
            rra_rows = (
                db.query(IamRoleResourceApi, IamResourceApi)
                .join(IamResourceApi, IamResourceApi.id == IamRoleResourceApi.resource_api_id)
                .filter(
                    IamRoleResourceApi.role_id.in_(role_ids),
                    IamResourceApi.is_active == 1,
                )
                .all()
            )
            for rra, rapi in rra_rows:
                crud_letter = _row_crud_letter(rapi.action)
                if crud_letter:
                    resource_crud.setdefault(rra.resource_id, set()).add(crud_letter)

        _inject_authenticated_read_grants(db, app_key, inject_is_dw_spec, resource_crud)

        if not resource_crud:
            return AppScopedPermissions(is_super_admin=False, roles=roles, resources=[])

        resource_ids = list(resource_crud.keys())

        # Walk the parent_id chain and inject ancestor resources with {"R"} so the
        # FED can show/navigate to parent menu nodes even when only a child resource
        # is explicitly mapped in iam_role_resource_api.
        ancestor_ids: Set[int] = set()
        ids_to_check: Set[int] = set(resource_ids)
        while ids_to_check:
            parent_rows = (
                db.query(IamResource.id, IamResource.parent_id)
                .filter(IamResource.id.in_(ids_to_check))
                .all()
            )
            ids_to_check = set()
            for _rid, pid in parent_rows:
                if pid and pid != 0 and pid not in resource_crud and pid not in ancestor_ids:
                    ancestor_ids.add(pid)
                    ids_to_check.add(pid)

        for pid in ancestor_ids:
            resource_crud[pid] = {"R"}

        resource_ids = list(resource_crud.keys())
        spec_rows = (
            db.query(IamResource.id, IamResource.is_dw_spec, IamResource.is_dash_spec)
            .filter(IamResource.id.in_(resource_ids))
            .all()
        )
        spec_by_id = {
            rid: (int(dw_spec or 0), int(dash_spec or 0))
            for rid, dw_spec, dash_spec in spec_rows
        }
        resource_crud = {
            rid: crud
            for rid, crud in resource_crud.items()
            if _resource_in_scope(*spec_by_id.get(rid, (-1, -1)))
        }
        resource_ids = list(resource_crud.keys())
        if not resource_ids:
            return AppScopedPermissions(is_super_admin=False, roles=roles, resources=[])

        resource_rows = (
            db.query(IamResource, IamResourceI18n)
            .outerjoin(
                IamResourceI18n,
                (IamResourceI18n.master_id == IamResource.id) & (IamResourceI18n.locale == locale),
            )
            .filter(IamResource.id.in_(resource_ids))
            .all()
        )

        resources = [
            ResourcePermissionsInfo(
                resource_code=res.resource_code,
                name=i18n.name if i18n else None,
                permissions=sorted(resource_crud[res.id], key=lambda x: _CRUD_ORDER.index(x)),
            )
            for res, i18n in resource_rows
        ]

        return AppScopedPermissions(is_super_admin=False, roles=roles, resources=resources)

    def user_has_dw_resource_permission(
        self,
        user_id: int,
        app_key: str,
        db: Session,
        dw_id: int,
        resource_code: str,
        permission: str = "R",
        locale: str = "en",
    ) -> bool:
        """
        True when the user has the given CRUD letter on a DW-scoped resource for dw_id.

        Uses the same union logic as GET /auth/me/permissions (role → iam_role_resource_api).
        Super admins always return True.
        """
        scoped = self._compute_app_permissions(user_id, app_key, db, dw_id=dw_id, locale=locale)
        if scoped.is_super_admin:
            return True
        return any(
            res.resource_code == resource_code and permission in res.permissions
            for res in scoped.resources
        )

    def get_user_permissions(
        self,
        user_id: int,
        app_key: str,
        db: Session,
        dw_id: Optional[int] = None,
        locale: str = "en",
        api_key: Optional[str] = None,
    ) -> UserPermissionsData:
        """
        Return permissions for a single concrete app_key as UserPermissionsData.
        Used by GET /auth/me/permissions (app-level or DW-scoped).

        app_key  — used for all DB queries (scopes iam_user_role / iam_resource).
        api_key  — raw X-Api-Key header value; stored as the response label only.

        When api_key is None (no X-Api-Key header, e.g. ENABLE_APP_CLIENT_AUTH=false)
        an empty payload is returned — consistent with get_user_permissions_grouped.
        """
        if api_key is None:
            return UserPermissionsData(
                user_id=user_id,
                api_key=None,
                is_super_admin=False,
                roles=[],
                resources=[],
                workflow_access=WorkflowAccessPayload(),
            )
        scoped = self._compute_app_permissions(
            user_id, app_key, db, dw_id, locale, dashboard_id=None
        )
        wf = get_workflow_access_payload(db, user_id, app_key, locale, dw_id)
        return UserPermissionsData(
            user_id=user_id,
            api_key=api_key,
            is_super_admin=scoped.is_super_admin,
            roles=scoped.roles,
            resources=scoped.resources,
            workflow_access=wf,
        )

    def get_user_dashboard_permissions_bulk(
        self,
        user_id: int,
        app_key: str,
        db: Session,
        dashboard_ids: list[int],
        locale: str = "en",
        api_key: Optional[str] = None,
    ) -> BulkDashboardPermissionsData:
        """
        Return dashboard-scoped permissions for multiple edit-mode dashboards.

        Used by GET /auth/me/permissions?dashboard_ids=1,2,3.
        """
        if api_key is None:
            return BulkDashboardPermissionsData(
                is_super_admin=False,
                by_dashboard_id={
                    str(dashboard_id): DashboardPermissionsSlice()
                    for dashboard_id in dashboard_ids
                },
            )

        require_edit_dashboard_ids(db, dashboard_ids)

        is_super_admin = False
        by_dashboard_id: dict[str, DashboardPermissionsSlice] = {}
        for dashboard_id in dashboard_ids:
            scoped = self._compute_app_permissions(
                user_id,
                app_key,
                db,
                dw_id=None,
                locale=locale,
                dashboard_id=dashboard_id,
            )
            if scoped.is_super_admin:
                is_super_admin = True
            by_dashboard_id[str(dashboard_id)] = DashboardPermissionsSlice(
                roles=scoped.roles,
                resources=scoped.resources,
            )

        return BulkDashboardPermissionsData(
            is_super_admin=is_super_admin,
            by_dashboard_id=by_dashboard_id,
        )

    def get_user_permissions_grouped(
        self,
        user_id: int,
        db: Session,
        dw_id: Optional[int] = None,
        locale: str = "en",
        app_key: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> Dict[str, AppScopedPermissions]:
        """
        Return permissions grouped by api_key for the login response.

        api_key None (Swagger / no X-Api-Key header) → empty dict {}.
        api_key provided → single-key dict {api_key: AppScopedPermissions},
        where DB queries are scoped by app_key.
        """
        if api_key is None or app_key is None:
            return {}
        scoped = self._compute_app_permissions(user_id, app_key, db, dw_id, locale)
        wf = get_workflow_access_payload(db, user_id, app_key, locale, dw_id)
        return {api_key: scoped.model_copy(update={"workflow_access": wf})}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_response(role: IamRole, name: Optional[str], description: Optional[str]) -> RoleResponse:
        return RoleResponse(
            id=role.id,
            app_key=role.app_key,
            role_code=role.role_code,
            is_super_admin=role.is_super_admin or 0,
            is_system_role=role.is_system_role or 0,
            display_order=role.display_order or 0,
            name=name,
            description=description,
        )
