"""
Seed Data Manager IAM roles and iam_role_resource_api mappings.

DFA_DM roles created:
  - DFA_DM_ADMIN            — full DW scope + role/user management
  - DFA_DM_TEMPLATE_ADMIN   — template module + reports
  - DFA_DM_DATA_ENTRY_ADMIN — data management module + reports
  - DFA_DM_AUTHENTICATED    — SSO default role for both DFA_DM and DFA_VIZ

DFA_DM_AUTHENTICATED is the single SSO role for both FED applications.
Its iam_role_resource_api rows cover:
  - DFA_DM grants : template READ, time period/sources READ, reports READ
  - DFA_VIZ grants: viz_gallery CRUD (AUTHENTICATED), dm_dw_reports PERMISSION
                    and AUTHENTICATED GETs (replaces DFA_PUBLIC for VIZ SSO users)

A user assigned this role needs two iam_user_role rows — one per app_key —
both pointing to the same role_id:
  (user_id, app_key=DFA_DM, role_id=<DFA_DM_AUTHENTICATED id>, dw_id=...)
  (user_id, app_key=DFA_VIZ, role_id=<DFA_DM_AUTHENTICATED id>, dw_id=NULL)

Requires seed_iam.py to have run first (iam_resource + iam_resource_api).

Run from project root:
    python apps/app_db/scripts/seed_dm_iam_roles.py
    python apps/app_db/scripts/seed_dm_iam_roles.py --force
    python apps/app_db/scripts/seed_dm_iam_roles.py --dry-run
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
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
)
from apps.app_db.scripts.seed_role_i18n_utils import seed_role_i18n_entries, validate_role_i18n_data  # noqa: E402
from apps.shared.config.config import settings  # noqa: E402

_DM_APP_KEY  = settings.DFA_DM_APP_KEY
_VIZ_APP_KEY = settings.DFA_VIZ_APP_KEY

# role_code -> root resource_code under which all PERMISSION APIs are granted
_DM_ROLE_ROOTS: list[tuple[str, str]] = [
    ("DFA_DM_TEMPLATE_ADMIN", "dm_dw_template_admin"),
    ("DFA_DM_DATA_ENTRY_ADMIN", "dm_dw_data_entry_admin"),
]

# DFA_DM_ADMIN: all PERMISSION APIs across these subtree roots + standalone resources.
# Covers the full DW scope (template + data management + administration) plus role/user management.
_DM_ADMIN_ROLE_CODE = "DFA_DM_ADMIN"
_DM_ADMIN_SUBTREE_ROOTS = ["dm_dw_administrator", "dm_dw_template_admin", "dm_dw_data_entry_admin"]
_DM_ADMIN_STANDALONE_RESOURCES = ["sys_role_resource", "sys_user_role"]

# Role with explicit PERMISSION grants per resource (SSO-provisioned users).
_SYS_DW_GET_ONLY_ROLE_CODE = "DFA_DM_AUTHENTICATED"

# DFA_DM_AUTHENTICATED: resource_code -> actions for PERMISSION-level API grants.
# Template + data management resources: READ only (GETs at PERMISSION level where they exist;
# most list/detail GETs are AUTHENTICATED-level and are already accessible to any logged-in user).
# Reports: READ (PERMISSION-level quality/analytics GETs).
_SSO_AUTH_PERM_GRANTS: dict[str, list[str]] = {
    "dm_dw_indicator": ["READ"],
    "dm_dw_unit": ["READ"],
    "dm_dw_subgroup": ["READ"],
    "dm_dw_indicator_classification": ["READ"],
    "dm_dw_area": ["READ"],
    "dm_dw_timeperiod": ["READ"],
    "dm_dw_data_source": ["READ"],
    "dm_dw_reports_data": ["READ"],
    "dm_dw_reports_quality": ["READ"],
    "dm_dw_reports_analytics": ["READ"],
}

# Also grant all GET + PERMISSION iam_resource_api rows on resource subtree `sys_datawarehouse`
# (see seed_iam.py — e.g. GET /dw, GET /dw/{dw_id}, GET .../dbmetadata) for these roles only.
_EXTRA_SYS_DW_GET_ROLE_CODES: frozenset[str] = frozenset(
    {"DFA_DM_TEMPLATE_ADMIN", "DFA_DM_DATA_ENTRY_ADMIN"}
)

# Grant AUTHENTICATED GET iam_resource_api rows on `dm_dw_reports` for template/data-entry roles
# (analytics reports require JWT; role–API links surface the resource in the permissions UI).
_EXTRA_REPORTS_AUTH_GET_ROLE_CODES: frozenset[str] = frozenset(
    {"DFA_DM_TEMPLATE_ADMIN", "DFA_DM_DATA_ENTRY_ADMIN"}
)

# Grant PERMISSION GET iam_resource_api rows on `dm_dw_reports` for template roles
# (quality reports require IAM role grant; dm_dw_reports is not under dm_dw_template_admin subtree).
_EXTRA_REPORTS_PERM_GET_ROLE_CODES: frozenset[str] = frozenset(
    {"DFA_DM_TEMPLATE_ADMIN"}
)

# Under `dm_dw_data_entry_admin`, do not grant PERMISSION APIs for this subtree to Data Entry Admin.
_DATA_ENTRY_ADMIN_ROLE_CODE = "DFA_DM_DATA_ENTRY_ADMIN"
_DATA_ENTRY_EXCLUDED_REVIEW_RESOURCE = "dm_dw_data_review"

_ALL_ROLE_CODES = [rc for rc, _ in _DM_ROLE_ROOTS] + [_DM_ADMIN_ROLE_CODE, _SYS_DW_GET_ONLY_ROLE_CODE]

_DEFAULT_DM_ROLES: list[dict] = [
    {
        "app_key": _DM_APP_KEY,
        "role_code": role_code,
        "is_super_admin": 0,
        "is_system_role": 1,
        "created": datetime.now(timezone.utc).replace(tzinfo=None),
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": datetime.now(timezone.utc).replace(tzinfo=None),
        "modified_user_id": settings.SYSTEM_USER_ID,
    }
    for role_code in _ALL_ROLE_CODES
]

_DEFAULT_DM_ROLE_I18N: dict[tuple[str, str], dict[str, dict[str, str]]] = {
    (_DM_APP_KEY, "DFA_DM_ADMIN"): {
        "en": {
            "name": "Administrator",
            "description": "Data Manager administrator — languages and transaction logs",
        },
        "ar": {
            "name": "مسؤول",
            "description": "مسؤول مدير البيانات — اللغات وسجلات المعاملات",
        },
        "fr": {
            "name": "Administrateur",
            "description": "Administrateur Data Manager — langues et journaux de transactions",
        },
        "es": {
            "name": "Administrador",
            "description": "Administrador de Data Manager — idiomas y registros de transacciones",
        },
        "tto": {
            "name": "Pule",
            "description": "Pule 'o e Data Manager — lea mo e tohi ngāue",
        },
    },
    (_DM_APP_KEY, "DFA_DM_TEMPLATE_ADMIN"): {
        "en": {
            "name": "Template Admin",
            "description": "Data Manager template administration — areas, indicators, units, and related metadata",
        },
        "ar": {
            "name": "مسؤول القوالب",
            "description": "إدارة قوالب مدير البيانات — المناطق والمؤشرات والوحدات والبيانات الوصفية ذات الصلة",
        },
        "fr": {
            "name": "Administrateur de modèles",
            "description": "Administration des modèles Data Manager — zones, indicateurs, unités et métadonnées associées",
        },
        "es": {
            "name": "Administrador de plantillas",
            "description": "Administración de plantillas de Data Manager — áreas, indicadores, unidades y metadatos relacionados",
        },
        "tto": {
            "name": "Pule Template",
            "description": "Pule template 'o e Data Manager — feitu'u, faka'ilonga, 'uiniti mo e metadata",
        },
    },
    (_DM_APP_KEY, "DFA_DM_DATA_ENTRY_ADMIN"): {
        "en": {
            "name": "Data Entry Admin",
            "description": "Data Manager data entry administration — sources, data, and time periods",
        },
        "ar": {
            "name": "مسؤول إدخال البيانات",
            "description": "إدارة إدخال البيانات في مدير البيانات — المصادر والبيانات والفترات الزمنية",
        },
        "fr": {
            "name": "Administrateur de saisie",
            "description": "Administration de la saisie de données Data Manager — sources, données et périodes",
        },
        "es": {
            "name": "Administrador de entrada de datos",
            "description": "Administración de entrada de datos de Data Manager — fuentes, datos y periodos temporales",
        },
        "tto": {
            "name": "Pule Fakahu mai Data",
            "description": "Pule fakahu mai data 'o e Data Manager — punake, data mo e taimi",
        },
    },
    (_DM_APP_KEY, _SYS_DW_GET_ONLY_ROLE_CODE): {
        "en": {
            "name": "SSO Authenticated User",
            "description": "Default role for SSO-provisioned users — read-only access to datawarehouse data",
        },
        "ar": {
            "name": "مستخدم مصادق عليه عبر تسجيل الدخول الموحد",
            "description": "الدور الافتراضي لمستخدمي SSO — وصول للقراءة فقط إلى بيانات المستودع",
        },
        "fr": {
            "name": "SSO Utilisateur authentifié",
            "description": "Rôle par défaut pour les utilisateurs SSO — accès en lecture seule aux données de l'entrepôt",
        },
        "es": {
            "name": "SSO Usuario autenticado",
            "description": "Rol predeterminado para usuarios SSO — acceso de solo lectura a datos del almacén",
        },
        "tto": {
            "name": "SSO Tokotaha Fakamo'oni",
            "description": "Ngaahi poloka ki'i SSO — malava pe 'o e fakamatala 'o e fale tukuhau",
        },
    },
}

validate_role_i18n_data(_DEFAULT_DM_ROLE_I18N, label="seed_dm_iam_roles._DEFAULT_DM_ROLE_I18N")


def _subtree_resource_ids(
    children: dict[int, list[int]],
    root_id: int,
) -> set[int]:
    out: set[int] = {root_id}
    stack = [root_id]
    while stack:
        pid = stack.pop()
        for cid in children.get(pid, ()):
            if cid not in out:
                out.add(cid)
                stack.append(cid)
    return out


def seed_dm_roles(db, force: bool, dry_run: bool) -> tuple[int, int]:
    inserted = skipped = 0
    for data in _DEFAULT_DM_ROLES:
        existing = (
            db.query(IamRole)
            .filter(IamRole.app_key == data["app_key"], IamRole.role_code == data["role_code"])
            .first()
        )
        if existing:
            if force:
                if dry_run:
                    print(
                        f"  [dry-run] Would overwrite role '{data['role_code']}' "
                        f"(app_key={data['app_key']}, id={existing.id})"
                    )
                else:
                    for k, v in data.items():
                        if k != "id":
                            setattr(existing, k, v)
                inserted += 1
            else:
                print(f"  Skipping role '{data['role_code']}' (app_key={data['app_key']}) — already exists")
                skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert role '{data['role_code']}' (app_key={data['app_key']})")
            else:
                db.add(IamRole(**data))
            inserted += 1
    return inserted, skipped


def seed_dm_role_i18n(db, force: bool, dry_run: bool) -> tuple[int, int]:
    return seed_role_i18n_entries(
        db,
        _DEFAULT_DM_ROLE_I18N,
        force=force,
        dry_run=dry_run,
    )


def _upsert_role_api_rows(
    db,
    role_id: int,
    role_code: str,
    api_rows: list,
    force: bool,
    dry_run: bool,
    now,
) -> tuple[int, int]:
    """Replace (force) or append role–API mappings. Returns (inserted, skipped)."""
    inserted = skipped = 0
    existing_api_ids: set[int] = {
        row.resource_api_id
        for row in db.query(IamRoleResourceApi).filter(IamRoleResourceApi.role_id == role_id).all()
    }

    if force:
        if dry_run:
            print(
                f"  [dry-run] Would delete {len(existing_api_ids)} iam_role_resource_api row(s) "
                f"for {role_code}, then insert {len(api_rows)}"
            )
            return len(api_rows), 0
        db.query(IamRoleResourceApi).filter(IamRoleResourceApi.role_id == role_id).delete(
            synchronize_session=False
        )
        existing_api_ids = set()

    if dry_run:
        would_add = sum(1 for api in api_rows if api.id not in existing_api_ids)
        print(
            f"  [dry-run] {role_code}: active APIs={len(api_rows)}, "
            f"would insert {would_add} new role–API row(s)"
        )
        return would_add, 0

    for api in api_rows:
        if api.id in existing_api_ids:
            skipped += 1
            continue
        db.add(
            IamRoleResourceApi(
                role_id=role_id,
                resource_id=api.resource_id,
                resource_api_id=api.id,
                created=now,
                created_user_id=settings.SYSTEM_USER_ID,
            )
        )
        inserted += 1

    print(f"  {role_code}: active APIs={len(api_rows)}, inserted={inserted}, skipped={skipped}")
    return inserted, skipped


def seed_dm_role_resource_apis(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Insert iam_role_resource_api rows for each DM role.

    - DFA_DM_TEMPLATE_ADMIN / DFA_DM_DATA_ENTRY_ADMIN: all PERMISSION APIs in their subtree.
      DFA_DM_DATA_ENTRY_ADMIN excludes the dm_dw_data_review subtree (reviewer APIs).
    - DFA_DM_ADMIN: all PERMISSION APIs across dm_dw_administrator + dm_dw_template_admin +
      dm_dw_data_entry_admin subtrees, plus sys_role_resource and sys_user_role resources
      (role & user management).
    - DFA_DM_AUTHENTICATED (SSO User): explicit PERMISSION grants per _SSO_AUTH_PERM_GRANTS
      (READ for template + time period + sources + reports).
    """
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Load all DM resources (app_key may span both DM and cross-app codes)
    all_resources = db.query(IamResource).filter(IamResource.app_key == _DM_APP_KEY).all()
    resource_by_code: dict[str, IamResource] = {r.resource_code: r for r in all_resources}
    children: dict[int, list[int]] = defaultdict(list)
    for r in all_resources:
        children[r.parent_id].append(r.id)

    role_map = {
        r.role_code: r.id
        for r in db.query(IamRole).filter(IamRole.app_key == _DM_APP_KEY).all()
    }

    # --- sys_datawarehouse extra GET grants for Template/Data Entry Admin ---
    sys_get_api_rows: list = []
    sys_root = resource_by_code.get("sys_datawarehouse")
    if sys_root is None:
        print("  WARNING: resource 'sys_datawarehouse' not found — skipping extra GET grants")
    else:
        sys_resource_ids = _subtree_resource_ids(children, sys_root.id)
        sys_get_api_rows = (
            db.query(IamResourceApi)
            .filter(
                IamResourceApi.app_key == _DM_APP_KEY,
                IamResourceApi.resource_id.in_(sys_resource_ids),
                IamResourceApi.is_active == 1,
                IamResourceApi.access_level == "PERMISSION",
                IamResourceApi.http_method == "GET",
            )
            .all()
        )

    # --- dm_dw_reports extra GET grants for Template Admin ---
    reports_auth_get_api_rows: list = []
    reports_perm_get_api_rows: list = []
    reports_root = resource_by_code.get("dm_dw_reports")
    if reports_root is None:
        print("  WARNING: resource 'dm_dw_reports' not found — skipping extra report GET grants")
    else:
        reports_resource_ids = _subtree_resource_ids(children, reports_root.id)
        reports_auth_get_api_rows = (
            db.query(IamResourceApi)
            .filter(
                IamResourceApi.app_key == _DM_APP_KEY,
                IamResourceApi.resource_id.in_(reports_resource_ids),
                IamResourceApi.is_active == 1,
                IamResourceApi.access_level == "AUTHENTICATED",
                IamResourceApi.http_method == "GET",
            )
            .all()
        )
        reports_perm_get_api_rows = (
            db.query(IamResourceApi)
            .filter(
                IamResourceApi.app_key == _DM_APP_KEY,
                IamResourceApi.resource_id.in_(reports_resource_ids),
                IamResourceApi.is_active == 1,
                IamResourceApi.access_level == "PERMISSION",
                IamResourceApi.http_method == "GET",
            )
            .all()
        )

    # --- DFA_DM_TEMPLATE_ADMIN and DFA_DM_DATA_ENTRY_ADMIN ---
    for role_code, root_code in _DM_ROLE_ROOTS:
        role_id = role_map.get(role_code)
        root = resource_by_code.get(root_code)
        if role_id is None:
            print(f"  WARNING: role '{role_code}' not found — skipping")
            skipped += 1
            continue
        if root is None:
            print(f"  WARNING: resource '{root_code}' not found — skipping {role_code}")
            skipped += 1
            continue

        resource_ids = _subtree_resource_ids(children, root.id)
        if role_code == _DATA_ENTRY_ADMIN_ROLE_CODE:
            review_res = resource_by_code.get(_DATA_ENTRY_EXCLUDED_REVIEW_RESOURCE)
            if review_res is not None:
                resource_ids = resource_ids - _subtree_resource_ids(children, review_res.id)

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
        by_api_id = {a.id: a for a in api_rows}
        if role_code in _EXTRA_SYS_DW_GET_ROLE_CODES:
            for a in sys_get_api_rows:
                by_api_id[a.id] = a
        if role_code in _EXTRA_REPORTS_AUTH_GET_ROLE_CODES:
            for a in reports_auth_get_api_rows:
                by_api_id[a.id] = a
        if role_code in _EXTRA_REPORTS_PERM_GET_ROLE_CODES:
            for a in reports_perm_get_api_rows:
                by_api_id[a.id] = a
        api_rows = list(by_api_id.values())

        ins, skp = _upsert_role_api_rows(db, role_id, role_code, api_rows, force, dry_run, now)
        inserted += ins
        skipped += skp

    # --- DFA_DM_ADMIN: all PERMISSION APIs across multiple subtrees + role/user management ---
    admin_role_id = role_map.get(_DM_ADMIN_ROLE_CODE)
    if admin_role_id is None:
        print(f"  WARNING: role '{_DM_ADMIN_ROLE_CODE}' not found — skipping")
        skipped += 1
    else:
        admin_api_by_id: dict[int, IamResourceApi] = {}

        # Collect all PERMISSION APIs from each subtree root
        for root_code in _DM_ADMIN_SUBTREE_ROOTS:
            root = resource_by_code.get(root_code)
            if root is None:
                print(f"  WARNING: resource '{root_code}' not found — skipping for {_DM_ADMIN_ROLE_CODE}")
                continue
            resource_ids = _subtree_resource_ids(children, root.id)
            rows = (
                db.query(IamResourceApi)
                .filter(
                    IamResourceApi.app_key == _DM_APP_KEY,
                    IamResourceApi.resource_id.in_(resource_ids),
                    IamResourceApi.is_active == 1,
                    IamResourceApi.access_level == "PERMISSION",
                )
                .all()
            )
            for a in rows:
                admin_api_by_id[a.id] = a

        # Collect all PERMISSION APIs for standalone role/user management resources
        for res_code in _DM_ADMIN_STANDALONE_RESOURCES:
            res = resource_by_code.get(res_code)
            if res is None:
                print(f"  WARNING: resource '{res_code}' not found — skipping for {_DM_ADMIN_ROLE_CODE}")
                continue
            rows = (
                db.query(IamResourceApi)
                .filter(
                    IamResourceApi.app_key == _DM_APP_KEY,
                    IamResourceApi.resource_id == res.id,
                    IamResourceApi.is_active == 1,
                    IamResourceApi.access_level == "PERMISSION",
                )
                .all()
            )
            for a in rows:
                admin_api_by_id[a.id] = a

        ins, skp = _upsert_role_api_rows(
            db, admin_role_id, _DM_ADMIN_ROLE_CODE, list(admin_api_by_id.values()), force, dry_run, now
        )
        inserted += ins
        skipped += skp

    # --- DFA_DM_AUTHENTICATED (SSO User): explicit PERMISSION grants per _SSO_AUTH_PERM_GRANTS ---
    auth_role_id = role_map.get(_SYS_DW_GET_ONLY_ROLE_CODE)
    if auth_role_id is None:
        print(f"  WARNING: role '{_SYS_DW_GET_ONLY_ROLE_CODE}' not found — skipping")
        skipped += 1
    else:
        sso_api_by_id: dict[int, IamResourceApi] = {}
        for res_code, actions in _SSO_AUTH_PERM_GRANTS.items():
            res = resource_by_code.get(res_code)
            if res is None:
                print(f"  WARNING: resource '{res_code}' not found — skipping for {_SYS_DW_GET_ONLY_ROLE_CODE}")
                continue
            # For each resource, collect PERMISSION APIs matching the specified actions.
            # All resources use READ only; reports uses PERMISSION GETs.
            rows = (
                db.query(IamResourceApi)
                .filter(
                    IamResourceApi.app_key == _DM_APP_KEY,
                    IamResourceApi.resource_id == res.id,
                    IamResourceApi.is_active == 1,
                    IamResourceApi.access_level == "PERMISSION",
                    IamResourceApi.action.in_(actions),
                )
                .all()
            )
            for a in rows:
                sso_api_by_id[a.id] = a

        ins, skp = _upsert_role_api_rows(
            db, auth_role_id, _SYS_DW_GET_ONLY_ROLE_CODE, list(sso_api_by_id.values()), force, dry_run, now
        )
        inserted += ins
        skipped += skp

    # --- DFA_DM_AUTHENTICATED VIZ grants ---
    # The same role is assigned to the user for both DFA_DM and DFA_VIZ in iam_user_role.
    # Adding VIZ resource_api rows here allows the role to satisfy VIZ PERMISSION checks,
    # replacing DFA_PUBLIC as the single SSO role for both FED applications.
    #
    # Grants (VIZ app_key):
    #   - viz_gallery    : all AUTHENTICATED APIs (C/R/U/D) — UI visibility
    #   - dm_dw_reports  : PERMISSION GETs (quality reports require IAM role check)
    #   - dm_dw_reports  : AUTHENTICATED GETs (analytics + catalogue — UI visibility)
    if auth_role_id is not None:
        viz_resources = db.query(IamResource).filter(IamResource.app_key == _VIZ_APP_KEY).all()
        viz_resource_by_code: dict[str, IamResource] = {r.resource_code: r for r in viz_resources}
        viz_api_by_id: dict[int, IamResourceApi] = {}

        # viz_gallery — all AUTHENTICATED APIs
        gallery_res = viz_resource_by_code.get("viz_gallery")
        if gallery_res is None:
            print("  WARNING: VIZ resource 'viz_gallery' not found — skipping gallery grants")
        else:
            for row in (
                db.query(IamResourceApi)
                .filter(
                    IamResourceApi.app_key == _VIZ_APP_KEY,
                    IamResourceApi.resource_id == gallery_res.id,
                    IamResourceApi.is_active == 1,
                    IamResourceApi.access_level == "AUTHENTICATED",
                )
                .all()
            ):
                viz_api_by_id[row.id] = row

        # dm_dw_reports subtree (VIZ) — PERMISSION + AUTHENTICATED GETs on child resources.
        # The iam_resource rows have app_key=DFA_DM; VIZ iam_resource_api rows reference those ids.
        viz_reports_res = viz_resource_by_code.get("dm_dw_reports") or resource_by_code.get("dm_dw_reports")
        if viz_reports_res is None:
            print("  WARNING: resource 'dm_dw_reports' not found — skipping VIZ reports grants")
        else:
            viz_reports_resource_ids = _subtree_resource_ids(children, viz_reports_res.id)
            for row in (
                db.query(IamResourceApi)
                .filter(
                    IamResourceApi.app_key == _VIZ_APP_KEY,
                    IamResourceApi.resource_id.in_(viz_reports_resource_ids),
                    IamResourceApi.is_active == 1,
                    IamResourceApi.access_level.in_(["PERMISSION", "AUTHENTICATED"]),
                    IamResourceApi.http_method == "GET",
                )
                .all()
            ):
                viz_api_by_id[row.id] = row

        ins, skp = _upsert_role_api_rows(
            db, auth_role_id,
            f"{_SYS_DW_GET_ONLY_ROLE_CODE} (VIZ grants)",
            list(viz_api_by_id.values()), force, dry_run, now,
        )
        inserted += ins
        skipped += skp

    return inserted, skipped


def wire_drupal_sso_default_dm_role(db, *, dry_run: bool) -> None:
    """
    Point the drupal SSO identity provider at DFA_DM_AUTHENTICATED for auto-provisioned users.

    Without this, default_role_id may be NULL or wrongly set (e.g. to a DFA_DASH role id),
    and assign_default_role() will use whatever role.app_key is on that row.
    """
    from apps.shared.packages.dfa_sso_service.storage.sqlalchemy_storage import (
        SsoIdentityProviderModel,
    )

    auth_role = (
        db.query(IamRole)
        .filter(
            IamRole.app_key == _DM_APP_KEY,
            IamRole.role_code == _SYS_DW_GET_ONLY_ROLE_CODE,
        )
        .first()
    )
    if auth_role is None:
        print(
            f"  WARNING: role '{_SYS_DW_GET_ONLY_ROLE_CODE}' (app_key={_DM_APP_KEY}) not found "
            "— cannot wire drupal SSO default_role_id"
        )
        return

    provider = (
        db.query(SsoIdentityProviderModel)
        .filter(SsoIdentityProviderModel.provider_code == "drupal")
        .first()
    )
    if provider is None:
        print(
            "  WARNING: iam_sso_identity_provider row 'drupal' not found "
            "(run seed_all.py so initialize_tables creates SSO rows, then re-run)"
        )
        return

    if provider.default_role_id == auth_role.id:
        print(
            f"  drupal default_role_id already {auth_role.id} "
            f"({_SYS_DW_GET_ONLY_ROLE_CODE}, app_key={auth_role.app_key})"
        )
        return

    if dry_run:
        print(
            f"  [dry-run] Would set drupal default_role_id={auth_role.id} "
            f"({_SYS_DW_GET_ONLY_ROLE_CODE}, app_key={auth_role.app_key})"
        )
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    provider.default_role_id = auth_role.id
    provider.modified = now
    print(
        f"  Set drupal default_role_id={auth_role.id} "
        f"({_SYS_DW_GET_ONLY_ROLE_CODE}, app_key={auth_role.app_key})"
    )


def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Seeding DM IAM roles ===")
        r_ins, r_skip = seed_dm_roles(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding DM IAM role i18n ===")
        ri_ins, ri_skip = seed_dm_role_i18n(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding DM IAM role_resource_api ===")
        rra_ins, rra_skip = seed_dm_role_resource_apis(db, force=force, dry_run=dry_run)

        print("=== Wiring drupal SSO default_role_id → DFA_DM_AUTHENTICATED ===")
        wire_drupal_sso_default_dm_role(db, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(
                f"\nDone. Roles → inserted/updated: {r_ins}, skipped: {r_skip}. "
                f"Role i18n → inserted/updated: {ri_ins}, skipped: {ri_skip}. "
                f"Role–API rows → inserted: {rra_ins}, skipped (existing): {rra_skip}."
            )
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during DM IAM role seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Seed Data Manager IAM roles and resource API permissions "
            "(PERMISSION-level APIs only)."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite roles/i18n; replace all iam_role_resource_api rows per seeded role.",
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
