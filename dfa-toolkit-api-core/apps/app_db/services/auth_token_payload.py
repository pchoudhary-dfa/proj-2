"""Build JWT access-token claims from IAM role assignments (shared by login and refresh)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from apps.app_db.models.core import (
    IamRole,
    IamUser,
    IamUserRole,
    SystemApplicationClient,
    SystemLanguage,
)
from apps.app_db.services.user_service import get_workflow_access_payload


def _default_locale(db: Session) -> str:
    row = (
        db.query(SystemLanguage)
        .filter(
            SystemLanguage.is_default.is_(True),
            SystemLanguage.is_deleted.is_(False),
        )
        .first()
    )
    return row.locale if row else "en"


def _build_workflow_claim(
    db: Session,
    user_id: int,
    locale: str,
    app_keys: list[str],
) -> dict[str, dict[str, object]]:
    """Flat workflow_code → metadata map (union across app_keys)."""
    claim: dict[str, dict[str, object]] = {}
    for app_key in app_keys:
        wf = get_workflow_access_payload(
            db, user_id, app_key, locale, dw_id=None, resolve_resource_names=False
        )
        for assignment in wf.assignments:
            if assignment.workflow_code in claim:
                continue
            claim[assignment.workflow_code] = {
                "workflow_id": assignment.workflow_id,
                "workflow_code": assignment.workflow_code,
                "workflow_name": assignment.workflow_name,
                "allow_review": assignment.allow_review,
                "dw_id": assignment.dw_id,
            }
    return claim


def build_access_token_payload(
    db: Session,
    user: IamUser,
    *,
    locale: str | None = None,
) -> dict[str, object]:
    """
    Same claims shape as POST /auth/login: sub, profile fields, dw_ids, api_keys, app_keys,
    super_admin_api_keys, workflow.

    dw_ids lists warehouses where the user has at least one iam_user_role row with a non-null dw_id.
    workflow maps workflow_code → {workflow_id, workflow_code, workflow_name, allow_review, dw_id}
    for workflow-scoped iam_user_role_content rows (empty for super admins).
    """
    role_rows = (
        db.query(IamUserRole, IamRole, SystemApplicationClient)
        .join(IamRole, IamRole.id == IamUserRole.role_id)
        .outerjoin(
            SystemApplicationClient,
            SystemApplicationClient.app_key == IamUserRole.app_key,
        )
        .filter(IamUserRole.user_id == user.id)
        .all()
    )

    dw_ids = sorted({ur.dw_id for ur, _, _c in role_rows if ur.dw_id is not None})
    api_key_map: dict[str, str] = {
        _c.app_key: _c.api_key for _, _, _c in role_rows if _c is not None
    }
    api_keys = list(dict.fromkeys(api_key_map.values()))
    app_keys = list(dict.fromkeys(ur.app_key for ur, _, _ in role_rows))
    # A single is_super_admin role grants superadmin access across ALL apps the
    # user belongs to — no per-app superadmin roles needed.
    is_global_super_admin = any(role.is_super_admin for _, role, _ in role_rows)
    if is_global_super_admin:
        # Grant super-admin bypass for every active FED app client, regardless of whether
        # the user has an explicit iam_user_role row for that app. This means a super admin
        # user does not need to be manually assigned to each new FED app (e.g. DFA_DASH)
        # to bypass PERMISSION checks on it.
        fed_clients = (
            db.query(SystemApplicationClient)
            .filter(
                SystemApplicationClient.app_type == "FED",
                SystemApplicationClient.status == "ACTIVE",
            )
            .all()
        )
        super_admin_api_keys = list(dict.fromkeys(c.app_key for c in fed_clients))
    else:
        super_admin_api_keys = []

    effective_locale = locale or _default_locale(db)
    workflow_claim: dict[str, dict[str, object]] = (
        {} if is_global_super_admin else _build_workflow_claim(db, user.id, effective_locale, app_keys)
    )

    return {
        "sub": str(user.id),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "username": user.username,
        "dw_ids": dw_ids,
        "api_keys": api_keys,
        "app_keys": app_keys,
        "super_admin_api_keys": super_admin_api_keys,
        "workflow": workflow_claim,
    }
