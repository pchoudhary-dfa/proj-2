"""
Seed all infrastructure required for dfa_mon_api_v2 (DFA Monitoring API v2) to call
dfa-toolkit-api (v6) as an authenticated external client.

Creates/updates (idempotent):
  1. svc.mon_api  — service/system user (is_system=1, cannot be deleted)
  2. EXTERNAL_CLIENT role (DFA_DM app, is_system_role=1)
  3. iam_role_i18n  — display names for the role (all system locales)
  4. iam_role_resource_api grants — PERMISSION-level APIs for the target resource codes
  5. iam_user_role  — assign svc.mon_api to EXTERNAL_CLIENT role
  6. system_application_client update — wire default_user_id + default_role_id on the
     existing dfa_mon_api_app row (inserted by seed_application_clients.py)

Requires seed_iam.py, seed_dm_iam_roles.py, and seed_application_clients.py to have
run first.

Run from project root:
    python apps/app_db/scripts/seed_monitoring_api.py
    python apps/app_db/scripts/seed_monitoring_api.py --force
    python apps/app_db/scripts/seed_monitoring_api.py --dry-run
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import (  # noqa: E402
    IamResource,
    IamResourceApi,
    IamRole,
    IamRoleResourceApi,
    IamUser,
    IamUserRole,
    SystemApplicationClient,
)
import apps.app_dashboard.models.dashboard  # noqa: E402,F401 — register dash_dashboards for IamUserRole.dashboard_id FK
from apps.app_db.scripts.seed_role_i18n_utils import seed_role_i18n_entries, validate_role_i18n_data  # noqa: E402
from apps.shared.config.config import settings  # noqa: E402
from apps.shared.utils.password_utils import hash_password  # noqa: E402

_DM_APP_KEY = settings.DFA_DM_APP_KEY

# Username for the monitoring API service account
_SVC_USERNAME = "svc.mon_api"
_SVC_EMAIL = "svc.mon_api@system.local"
_SVC_FIRST_NAME = "Monitoring"
_SVC_LAST_NAME = "Service"

# Role that the external monitoring client holds
_ROLE_CODE = "EXTERNAL_MON_CLIENT"

_EXTERNAL_CLIENT_ROLE_I18N: dict[tuple[str, str], dict[str, dict[str, str]]] = {
    (_DM_APP_KEY, _ROLE_CODE): {
        "en": {
            "name": "External Monitoring Client",
            "description": "Role for external server-to-server API clients (e.g. dfa_mon_api_v2)",
        },
        "ar": {
            "name": "عميل مراقبة خارجي",
            "description": "دور لواجهات برمجة التطبيقات الخارجية من خادم إلى خادم (مثل dfa_mon_api_v2)",
        },
        "fr": {
            "name": "Client de surveillance externe",
            "description": "Rôle pour les clients API externes serveur à serveur (p.ex. dfa_mon_api_v2)",
        },
        "es": {
            "name": "Cliente de monitorización externo",
            "description": "Rol para clientes API externos servidor a servidor (p. ej. dfa_mon_api_v2)",
        },
        "tto": {
            "name": "Kasitoma Tu'a e External",
            "description": "Kau ngāue ki he ngaahi kasitoma API tu'a (hange ko e dfa_mon_api_v2)",
        },
    },
}

validate_role_i18n_data(_EXTERNAL_CLIENT_ROLE_I18N, label="seed_monitoring_api._EXTERNAL_CLIENT_ROLE_I18N")

# api_key of the client row seeded by seed_application_clients.py
_API_KEY = "dfa_mon_api_app"

# Resource codes whose PERMISSION-level APIs are granted to the EXTERNAL_CLIENT role.
_GRANTED_RESOURCE_CODES: list[str] = [
    "sys_datawarehouse",
    "dm_dw_area",
    "dm_dw_indicator",
    "dm_dw_unit",
    "dm_dw_indicator_classification",
    "dm_dw_data_entry",
    "dm_dw_subgroup",
    "dm_dw_timeperiod",
    "dm_dw_languages",
    "sys_user_role",
]


# ---------------------------------------------------------------------------
# 1. Service user
# ---------------------------------------------------------------------------

def seed_service_user(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed svc.mon_api system user. Returns (inserted_or_updated, skipped)."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = {
        "first_name": _SVC_FIRST_NAME,
        "last_name": _SVC_LAST_NAME,
        "username": _SVC_USERNAME,
        "email": _SVC_EMAIL,
        "password": hash_password(settings.SYSTEM_USER_PASSWORD),
        "status": 1,
        "is_system": 1,
        "created": now,
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": now,
        "modified_user_id": settings.SYSTEM_USER_ID,
        "last_loggedin_on": None,
    }
    existing = db.query(IamUser).filter(IamUser.username == _SVC_USERNAME).first()
    if existing:
        if force:
            if dry_run:
                print(f"  [dry-run] Would overwrite user '{_SVC_USERNAME}' (id={existing.id})")
            else:
                for k, v in data.items():
                    setattr(existing, k, v)
            return 1, 0
        else:
            print(f"  Skipping user '{_SVC_USERNAME}' — already exists")
            return 0, 1
    else:
        if dry_run:
            print(f"  [dry-run] Would insert user '{_SVC_USERNAME}' (is_system=1)")
        else:
            db.add(IamUser(**data))
        return 1, 0


# ---------------------------------------------------------------------------
# 2. EXTERNAL_CLIENT role
# ---------------------------------------------------------------------------

def seed_external_client_role(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed EXTERNAL_CLIENT role. Returns (inserted_or_updated, skipped)."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = {
        "app_key": _DM_APP_KEY,
        "role_code": _ROLE_CODE,
        "is_super_admin": 0,
        "is_system_role": 1,
        "created": now,
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": now,
        "modified_user_id": settings.SYSTEM_USER_ID,
    }
    existing = (
        db.query(IamRole)
        .filter(IamRole.app_key == _DM_APP_KEY, IamRole.role_code == _ROLE_CODE)
        .first()
    )
    if existing:
        if force:
            if dry_run:
                print(f"  [dry-run] Would overwrite role '{_ROLE_CODE}' (id={existing.id})")
            else:
                for k, v in data.items():
                    if k != "id":
                        setattr(existing, k, v)
            return 1, 0
        else:
            print(f"  Skipping role '{_ROLE_CODE}' — already exists")
            return 0, 1
    else:
        if dry_run:
            print(f"  [dry-run] Would insert role '{_ROLE_CODE}' (app_key={_DM_APP_KEY})")
        else:
            db.add(IamRole(**data))
        return 1, 0


# ---------------------------------------------------------------------------
# 3. Role i18n
# ---------------------------------------------------------------------------

def seed_external_client_role_i18n(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed i18n labels for EXTERNAL_CLIENT role. Returns (inserted_or_updated, skipped)."""
    return seed_role_i18n_entries(
        db,
        _EXTERNAL_CLIENT_ROLE_I18N,
        force=force,
        dry_run=dry_run,
    )


# ---------------------------------------------------------------------------
# 4. Role → resource API grants
# ---------------------------------------------------------------------------

def seed_external_client_role_resource_apis(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Grant all active PERMISSION-level APIs under _GRANTED_RESOURCE_CODES to EXTERNAL_CLIENT.

    Returns (inserted, skipped).
    """
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    role = (
        db.query(IamRole)
        .filter(IamRole.app_key == _DM_APP_KEY, IamRole.role_code == _ROLE_CODE)
        .first()
    )
    if role is None:
        print(f"  WARNING: role '{_ROLE_CODE}' not found — skipping role_resource_api grants")
        return 0, 0

    resource_rows = (
        db.query(IamResource)
        .filter(
            IamResource.app_key == _DM_APP_KEY,
            IamResource.resource_code.in_(_GRANTED_RESOURCE_CODES),
        )
        .all()
    )
    found_codes = {r.resource_code for r in resource_rows}
    for code in _GRANTED_RESOURCE_CODES:
        if code not in found_codes:
            print(f"  WARNING: resource_code '{code}' not found in DB — skipping its API grants")

    resource_ids = {r.id for r in resource_rows}
    if not resource_ids:
        print("  WARNING: no matching resources found — no API grants will be inserted")
        return 0, 0

    api_rows = (
        db.query(IamResourceApi)
        .filter(
            IamResourceApi.app_key == _DM_APP_KEY,
            IamResourceApi.resource_id.in_(resource_ids),
            IamResourceApi.is_active == 1,
            IamResourceApi.access_level == "PERMISSION",
        )
        .all()
    )

    existing_api_ids: set[int] = {
        row.resource_api_id
        for row in db.query(IamRoleResourceApi)
        .filter(IamRoleResourceApi.role_id == role.id)
        .all()
    }

    if force and not dry_run:
        db.query(IamRoleResourceApi).filter(IamRoleResourceApi.role_id == role.id).delete(
            synchronize_session=False
        )
        existing_api_ids = set()

    if dry_run:
        would_add = sum(1 for a in api_rows if a.id not in existing_api_ids)
        print(
            f"  [dry-run] EXTERNAL_CLIENT: active PERMISSION APIs={len(api_rows)}, "
            f"would insert {would_add} new role–API row(s)"
        )
        return would_add, len(api_rows) - would_add

    for api in api_rows:
        if api.id in existing_api_ids:
            skipped += 1
            continue
        db.add(
            IamRoleResourceApi(
                role_id=role.id,
                resource_id=api.resource_id,
                resource_api_id=api.id,
                created=now,
                created_user_id=settings.SYSTEM_USER_ID,
            )
        )
        inserted += 1

    print(
        f"  EXTERNAL_CLIENT: active PERMISSION APIs={len(api_rows)}, "
        f"inserted={inserted}, skipped (existing)={skipped}"
    )
    return inserted, skipped


# ---------------------------------------------------------------------------
# 5. User → role assignment
# ---------------------------------------------------------------------------

def seed_service_user_role(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Assign svc.mon_api to EXTERNAL_CLIENT role. Returns (inserted_or_updated, skipped)."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    svc_user = db.query(IamUser).filter(IamUser.username == _SVC_USERNAME).first()
    role = (
        db.query(IamRole)
        .filter(IamRole.app_key == _DM_APP_KEY, IamRole.role_code == _ROLE_CODE)
        .first()
    )
    if svc_user is None or role is None:
        print(
            "  WARNING: svc.mon_api user or EXTERNAL_CLIENT role not found — "
            "skipping user_role assignment"
        )
        return 0, 1

    data = {
        "user_id": svc_user.id,
        "role_id": role.id,
        "app_key": _DM_APP_KEY,
        "dw_id": None,
        "created": now,
        "created_user_id": settings.SYSTEM_USER_ID,
    }
    existing = (
        db.query(IamUserRole)
        .filter(
            IamUserRole.user_id == svc_user.id,
            IamUserRole.role_id == role.id,
            IamUserRole.app_key == _DM_APP_KEY,
            IamUserRole.dw_id.is_(None),
        )
        .first()
    )
    if existing:
        if force:
            if dry_run:
                print(
                    f"  [dry-run] Would overwrite user_role "
                    f"(user_id={svc_user.id}, role_id={role.id}, app_key={_DM_APP_KEY})"
                )
            else:
                for k, v in data.items():
                    setattr(existing, k, v)
            return 1, 0
        else:
            print(
                f"  Skipping user_role (user_id={svc_user.id}, role_id={role.id}, "
                f"app_key={_DM_APP_KEY}) — already exists"
            )
            return 0, 1
    else:
        if dry_run:
            print(
                f"  [dry-run] Would insert user_role "
                f"(user_id={svc_user.id}, role_id={role.id}, app_key={_DM_APP_KEY})"
            )
        else:
            db.add(IamUserRole(**data))
        return 1, 0


# ---------------------------------------------------------------------------
# 6. Wire default_user_id + default_role_id on existing client row
# ---------------------------------------------------------------------------

def update_application_client_links(db, dry_run: bool) -> None:
    """Set default_user_id and default_role_id on the dfa_mon_api_app client row.

    The row itself is inserted by seed_application_clients.py (which runs earlier).
    This step resolves the IDs of svc.mon_api and EXTERNAL_CLIENT (created above)
    and writes them back onto that row — always overwrites to stay in sync.
    """
    client = (
        db.query(SystemApplicationClient)
        .filter(SystemApplicationClient.api_key == _API_KEY)
        .first()
    )
    if client is None:
        print(
            f"  WARNING: client '{_API_KEY}' not found — "
            "run seed_application_clients.py first, then re-run this seeder"
        )
        return

    svc_user = db.query(IamUser).filter(IamUser.username == _SVC_USERNAME).first()
    role = (
        db.query(IamRole)
        .filter(IamRole.app_key == _DM_APP_KEY, IamRole.role_code == _ROLE_CODE)
        .first()
    )

    if svc_user is None:
        print(f"  WARNING: svc.mon_api user not found — default_user_id will remain unchanged")
    if role is None:
        print(f"  WARNING: EXTERNAL_CLIENT role not found — default_role_id will remain unchanged")

    new_uid = svc_user.id if svc_user else client.default_user_id
    new_rid = role.id if role else client.default_role_id

    if dry_run:
        print(
            f"  [dry-run] Would set client '{_API_KEY}' "
            f"default_user_id={new_uid}, default_role_id={new_rid}, status=ACTIVE"
        )
        return

    client.default_user_id = new_uid
    client.default_role_id = new_rid
    client.status = "ACTIVE"
    print(
        f"  Updated client '{_API_KEY}': "
        f"default_user_id={new_uid}, default_role_id={new_rid}, status=ACTIVE"
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Seeding monitoring API service user ===")
        u_ins, u_skip = seed_service_user(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding EXTERNAL_CLIENT role ===")
        r_ins, r_skip = seed_external_client_role(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding EXTERNAL_CLIENT role i18n ===")
        ri_ins, ri_skip = seed_external_client_role_i18n(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding EXTERNAL_CLIENT role_resource_api grants ===")
        rra_ins, rra_skip = seed_external_client_role_resource_apis(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding monitoring API user_role assignment ===")
        ur_ins, ur_skip = seed_service_user_role(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Linking dfa_mon_api_app client to service user and role ===")
        update_application_client_links(db, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(
                f"\nDone. "
                f"User → ins/upd: {u_ins}, skip: {u_skip}. "
                f"Role → ins/upd: {r_ins}, skip: {r_skip}. "
                f"Role i18n → ins/upd: {ri_ins}, skip: {ri_skip}. "
                f"Role–API rows → ins: {rra_ins}, skip: {rra_skip}. "
                f"User–role → ins/upd: {ur_ins}, skip: {ur_skip}."
            )
        else:
            print("\n[dry-run] No changes written.")

    except Exception as exc:
        db.rollback()
        print(f"Error during monitoring API seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed dfa_mon_api_v2 external client infrastructure in dfa-toolkit-api."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing rows (user, role, i18n); replace all role_resource_api grants.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing to the DB.",
    )
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
