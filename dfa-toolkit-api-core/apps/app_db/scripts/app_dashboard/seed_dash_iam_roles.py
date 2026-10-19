"""
Seed DFA_DASH IAM roles and iam_role_resource_api mappings.

Creates three DFA_DASH system roles:
  DFA_DASH_ADMIN  — full CRUD on all dashboard resources
  DFA_DASH_EDITOR — create/edit visualizations, sections, template, media;
                    read-only on themes and embed; no admin-only or user-management ops
  DFA_DASH_VIEWER — read-only

Note: There is NO DFA_DASH_SUPERADMIN. The global is_super_admin flag on
DFA_DM_SUPERADMIN (or any is_super_admin=1 role) grants superadmin access
across ALL apps including DFA_DASH — see auth_token_payload.py.

Role-to-resource mapping (2-level resource tree from seed_dash_iam.py):

  DFA_DASH_ADMIN
    sys_dashboard subtree → all PERMISSION APIs on all children:
      dash_core (except POST /dash), dash_settings, dash_admin_ops,
      dash_vis, dash_section, dash_template, dash_user_areas, dash_ai_analysis,
      dash_media_scoped
    sys_header_footer subtree → all PERMISSION APIs on dash_theme
    dash_embed subtree        → all PERMISSION APIs on dash_embed_ops

  DFA_DASH_EDITOR
    sys_dashboard subtree, EXCLUDING dash_admin_ops + dash_user_areas
      → all PERMISSION APIs on dash_core (except POST /dash), dash_settings,
        dash_vis, dash_section, dash_template, dash_ai_analysis, dash_media_scoped
    sys_header_footer subtree → action=READ only (dash_theme)
    dash_embed subtree        → action=READ only (dash_embed_ops)

  DFA_DASH_VIEWER
    Derived from DFA_DASH_EDITOR: every API EDITOR is granted where action == "READ"
    (typically dash_core list/get; no create/update/delete)

POST /dash (create dashboard) is on dash_core (is_dash_spec=0) with PERMISSION but
is seeded to NO role (including DFA_DASH_ADMIN) — only is_super_admin users bypass
the role check and can create dashboards.

Requires seed_dash_iam.py to have run first.

Run from project root:
    python apps/app_db/scripts/app_dashboard/seed_dash_iam_roles.py
    python apps/app_db/scripts/app_dashboard/seed_dash_iam_roles.py --force
    python apps/app_db/scripts/app_dashboard/seed_dash_iam_roles.py --dry-run
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
    IamRoleI18n,
    IamRoleResourceApi,
)
from apps.shared.config.config import settings  # noqa: E402

_DASH_APP_KEY = settings.DFA_DASH_APP_KEY

# ── Role root resources (subtree walk gives all leaf resource IDs) ─────────

# role_code → root resource_codes whose subtrees are considered for PERMISSION-level access.
# VIEWER is not listed: it inherits EDITOR grants filtered by action == "READ".
# Roots may be DFA_DASH-owned or shared (e.g. sys_datawarehouse owned by DFA_DM but
# exposed via DFA_DASH iam_resource_api rows) — resolved by resource_code.
_DASH_ROLE_ROOTS: list[tuple[str, list[str]]] = [
    ("DFA_DASH_ADMIN",  ["sys_dashboard", "sys_datawarehouse"]),
    ("DFA_DASH_EDITOR", ["sys_dashboard", "sys_datawarehouse"]),
]

# Editor: action=READ only on these subtrees (themes, embed)
_EDITOR_READONLY_ROOTS: frozenset[str] = frozenset({})

# Editor: no access at all to these resource subtrees
# dash_admin_ops  → delete/clone/publish (admin gets these)
# dash_user_areas → dashboard user management
_EDITOR_EXCLUDED_ROOTS: frozenset[str] = frozenset({"dash_admin_ops", "dash_user_areas"})

# (http_method, backend_endpoint) never granted to any DFA_DASH role — including ADMIN.
# Only is_super_admin bypasses the PERMISSION check for these endpoints.
# POST /dash lives on dash_core but remains excluded from all roles.
_ROLE_EXCLUDED_APIS: frozenset[tuple[str, str]] = frozenset({
    ("POST", "/dash"),
    # ("DELETE", "/dash/{dashboard_id}"),
    ("POST", "/dash/media"),
    ("DELETE", "/dash/media/{upload_id}"),
})

# APIs granted to DFA_DASH_ADMIN even when their resource is outside ADMIN's root tree.
# Empty after introducing the dashboard-scoped PUT /dash/{dashboard_id}/users/{user_id}/roles
# endpoint, which is now inside dash_user_areas and thus covered by the root tree.
_ADMIN_EXTRA_APIS: frozenset[tuple[str, str]] = frozenset()

_ADMIN_ROLE_CODE = "DFA_DASH_ADMIN"
_VIEWER_ROLE_CODE = "DFA_DASH_VIEWER"
_EDITOR_ROLE_CODE = "DFA_DASH_EDITOR"

# ── Role definitions ───────────────────────────────────────────────────────

_DEFAULT_DASH_ROLES: list[dict] = [
    {
        "app_key": _DASH_APP_KEY,
        "role_code": "DFA_DASH_ADMIN",
        "is_super_admin": 0,
        "is_system_role": 1,
        "created": datetime.now(timezone.utc).replace(tzinfo=None),
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": datetime.now(timezone.utc).replace(tzinfo=None),
        "modified_user_id": settings.SYSTEM_USER_ID,
    },
    {
        "app_key": _DASH_APP_KEY,
        "role_code": "DFA_DASH_EDITOR",
        "is_super_admin": 0,
        "is_system_role": 1,
        "created": datetime.now(timezone.utc).replace(tzinfo=None),
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": datetime.now(timezone.utc).replace(tzinfo=None),
        "modified_user_id": settings.SYSTEM_USER_ID,
    },
    {
        "app_key": _DASH_APP_KEY,
        "role_code": "DFA_DASH_VIEWER",
        "is_super_admin": 0,
        "is_system_role": 1,
        "created": datetime.now(timezone.utc).replace(tzinfo=None),
        "created_user_id": settings.SYSTEM_USER_ID,
        "modified": datetime.now(timezone.utc).replace(tzinfo=None),
        "modified_user_id": settings.SYSTEM_USER_ID,
    },
]

_DEFAULT_DASH_ROLE_I18N: dict[tuple[str, str], dict[str, str]] = {
    (_DASH_APP_KEY, "DFA_DASH_ADMIN"):  {
        "name": "Dashboard Admin",
        "description": (
            "Full CRUD on dashboard resources except creating dashboards "
            "(POST /dash is super-admin only); can assign Editor/Viewer roles"
        ),
    },
    (_DASH_APP_KEY, "DFA_DASH_EDITOR"): {
        "name": "Dashboard Editor",
        "description": (
            "Create/edit visualizations, sections, canvas layout, and media; "
            "read-only on themes and embeds; no dashboard admin operations"
        ),
    },
    (_DASH_APP_KEY, "DFA_DASH_VIEWER"): {
        "name": "Dashboard Viewer",
        "description": (
            "Read-only access: inherits all action=READ APIs granted to Dashboard Editor"
        ),
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _subtree_resource_ids(children: dict[int, list[int]], root_id: int) -> set[int]:
    """BFS / DFS walk to collect a resource and all its descendants."""
    out: set[int] = {root_id}
    stack = [root_id]
    while stack:
        pid = stack.pop()
        for cid in children.get(pid, ()):
            if cid not in out:
                out.add(cid)
                stack.append(cid)
    return out


def _resolve_resource_id_by_code(
    db,
    resource_code: str,
    dash_code_to_id: dict[str, int],
) -> int | None:
    """
    Resolve a resource_code for role-root / exclude / readonly lists.

    Prefer a DFA_DASH-owned iam_resource row. If missing, fall back to a shared
    resource (any app_key) that has ≥1 active DFA_DASH iam_resource_api row —
    same app-scoping idea as listable_resource_ids_for_app. Last resort: any
    active row with that resource_code.
    """
    if resource_code in dash_code_to_id:
        return dash_code_to_id[resource_code]

    shared_with_dash_api = (
        db.query(IamResource.id)
        .join(IamResourceApi, IamResourceApi.resource_id == IamResource.id)
        .filter(
            IamResource.resource_code == resource_code,
            IamResource.is_active == 1,
            IamResourceApi.app_key == _DASH_APP_KEY,
            IamResourceApi.is_active == 1,
        )
        .first()
    )
    if shared_with_dash_api:
        return shared_with_dash_api[0]

    any_active = (
        db.query(IamResource.id)
        .filter(
            IamResource.resource_code == resource_code,
            IamResource.is_active == 1,
        )
        .first()
    )
    return any_active[0] if any_active else None


def _subtree_ids_for_resolved_root(
    db,
    root_id: int,
    dash_children: dict[int, list[int]],
) -> set[int]:
    """
    Collect root + descendants.

    DFA_DASH roots use the pre-built DASH parent map. Shared (other app_key) roots
    walk only within that resource's own app_key so parent_id ints never cross apps.
    """
    root = db.query(IamResource).filter(IamResource.id == root_id).first()
    if root is None:
        return set()
    if root.app_key == _DASH_APP_KEY:
        return _subtree_resource_ids(dash_children, root_id)

    same_app = (
        db.query(IamResource)
        .filter(IamResource.app_key == root.app_key, IamResource.is_active == 1)
        .all()
    )
    children: dict[int, list[int]] = defaultdict(list)
    for r in same_app:
        children[r.parent_id].append(r.id)
    return _subtree_resource_ids(children, root_id)


# ---------------------------------------------------------------------------
# Seed: roles
# ---------------------------------------------------------------------------

def seed_dash_roles(db, force: bool, dry_run: bool) -> tuple[int, int]:
    inserted = skipped = 0
    for data in _DEFAULT_DASH_ROLES:
        existing = db.query(IamRole).filter(
            IamRole.app_key == data["app_key"],
            IamRole.role_code == data["role_code"],
        ).first()
        if existing:
            if force:
                if not dry_run:
                    for k, v in data.items():
                        if k != "id":
                            setattr(existing, k, v)
                else:
                    print(f"  [dry-run] Would overwrite role '{data['role_code']}'")
                inserted += 1
            else:
                print(f"  Skipping role '{data['role_code']}' — already exists")
                skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert role '{data['role_code']}'")
            else:
                db.add(IamRole(**data))
            inserted += 1
    return inserted, skipped


# ---------------------------------------------------------------------------
# Seed: role i18n
# ---------------------------------------------------------------------------

def seed_dash_role_i18n(db, force: bool, dry_run: bool) -> tuple[int, int]:
    inserted = skipped = 0
    role_map: dict[tuple[str, str], int] = {
        (r.app_key, r.role_code): r.id
        for r in db.query(IamRole.app_key, IamRole.role_code, IamRole.id).all()
    }
    for (app_key, role_code), i18n in _DEFAULT_DASH_ROLE_I18N.items():
        master_id = role_map.get((app_key, role_code))
        if master_id is None:
            print(f"  Skipping i18n for {role_code} — role row not found")
            skipped += 1
            continue
        existing = db.query(IamRoleI18n).filter(
            IamRoleI18n.master_id == master_id, IamRoleI18n.locale == "en"
        ).first()
        if existing:
            if force:
                if not dry_run:
                    existing.name = i18n["name"]
                    existing.description = i18n["description"]
                inserted += 1
            else:
                skipped += 1
        else:
            if not dry_run:
                db.add(IamRoleI18n(
                    master_id=master_id, locale="en",
                    name=i18n["name"], description=i18n["description"],
                ))
            inserted += 1
    return inserted, skipped


# ---------------------------------------------------------------------------
# Seed: role → resource API mappings
# ---------------------------------------------------------------------------

def _persist_role_apis(
    db,
    *,
    role_code: str,
    role_id: int,
    api_rows: list,
    resource_count: int,
    force: bool,
    dry_run: bool,
    now,
) -> tuple[int, int]:
    """Insert (or replace) iam_role_resource_api rows for one role. Returns (inserted, skipped)."""
    inserted = skipped = 0
    existing_api_ids: set[int] = {
        row.resource_api_id
        for row in db.query(IamRoleResourceApi).filter(
            IamRoleResourceApi.role_id == role_id
        ).all()
    }

    if force:
        if dry_run:
            print(
                f"  [dry-run] Would replace {len(existing_api_ids)} rows "
                f"for {role_code} with {len(api_rows)}"
            )
            return len(api_rows), 0
        db.query(IamRoleResourceApi).filter(
            IamRoleResourceApi.role_id == role_id
        ).delete(synchronize_session=False)
        existing_api_ids = set()
    else:
        would_add = sum(1 for a in api_rows if a.id not in existing_api_ids)
        if dry_run:
            print(f"  [dry-run] {role_code}: would insert {would_add} new role-API row(s)")
            return would_add, 0

    if not dry_run:
        for api in api_rows:
            if api.id in existing_api_ids:
                skipped += 1
                continue
            db.add(IamRoleResourceApi(
                role_id=role_id,
                resource_id=api.resource_id,
                resource_api_id=api.id,
                created=now,
                created_user_id=settings.SYSTEM_USER_ID,
            ))
            inserted += 1
        print(
            f"  {role_code}: resources={resource_count}, APIs granted={len(api_rows)}"
        )
    return inserted, skipped


def seed_dash_role_resource_apis(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """
    Grant PERMISSION-level APIs per role, respecting readonly and excluded subtrees.

    ADMIN   → all PERMISSION APIs in all root subtrees, minus ``_ROLE_EXCLUDED_APIS``,
              plus ``_ADMIN_EXTRA_APIS`` (if any)
    EDITOR  → PERMISSION APIs excluding excluded_roots;
              action=READ only for readonly_roots (``action`` column, not http_method)
    VIEWER  → subset of EDITOR grants where ``action == "READ"``

    Root codes may resolve to shared (non-DFA_DASH) ``iam_resource`` rows when those
    resources are exposed via active DFA_DASH ``iam_resource_api`` entries.

    ``_ROLE_EXCLUDED_APIS`` (e.g. POST /dash, DELETE /dash/{id}) is filtered from every role.
    """
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    editor_api_rows: list | None = None

    dash_resources = db.query(IamResource).filter(IamResource.app_key == _DASH_APP_KEY).all()
    children: dict[int, list[int]] = defaultdict(list)
    code_to_id: dict[str, int] = {}
    for r in dash_resources:
        children[r.parent_id].append(r.id)
        code_to_id[r.resource_code] = r.id

    role_map = {
        r.role_code: r.id
        for r in db.query(IamRole).filter(IamRole.app_key == _DASH_APP_KEY).all()
    }

    for role_code, root_codes in _DASH_ROLE_ROOTS:
        role_id = role_map.get(role_code)
        if role_id is None:
            print(f"  WARNING: role '{role_code}' not found — skipping")
            skipped += 1
            continue

        # Collect all resource IDs in this role's subtrees (DASH-owned or shared)
        resource_ids: set[int] = set()
        for root_code in root_codes:
            root_id = _resolve_resource_id_by_code(db, root_code, code_to_id)
            if root_id is None:
                print(
                    f"  WARNING: root resource '{root_code}' not found for "
                    f"{role_code} — skipping root"
                )
                continue
            resource_ids |= _subtree_ids_for_resolved_root(db, root_id, children)

        if role_code == _EDITOR_ROLE_CODE:
            # ── EDITOR: split into writable, readonly, and excluded ───────
            readonly_ids: set[int] = set()
            for ro_code in _EDITOR_READONLY_ROOTS:
                ro_id = _resolve_resource_id_by_code(db, ro_code, code_to_id)
                if ro_id:
                    readonly_ids |= _subtree_ids_for_resolved_root(db, ro_id, children)

            excluded_ids = set()
            for exc_code in _EDITOR_EXCLUDED_ROOTS:
                exc_id = _resolve_resource_id_by_code(db, exc_code, code_to_id)
                if exc_id:
                    excluded_ids |= _subtree_ids_for_resolved_root(db, exc_id, children)

            # Writable = all roots minus readonly subtrees minus excluded subtrees
            writable_ids = resource_ids - readonly_ids - excluded_ids

            permission_apis = db.query(IamResourceApi).filter(
                IamResourceApi.app_key == _DASH_APP_KEY,
                IamResourceApi.resource_id.in_(writable_ids),
                IamResourceApi.is_active == 1,
                IamResourceApi.access_level == "PERMISSION",
            ).all()
            # Readonly subtrees: action column is source of truth (not http_method)
            read_apis = db.query(IamResourceApi).filter(
                IamResourceApi.app_key == _DASH_APP_KEY,
                IamResourceApi.resource_id.in_(readonly_ids),
                IamResourceApi.is_active == 1,
                IamResourceApi.action == "READ",
            ).all()

            by_id = {a.id: a for a in permission_apis}
            for a in read_apis:
                by_id[a.id] = a
            api_rows = list(by_id.values())

        else:
            # ── ADMIN: all PERMISSION APIs in all subtrees ────────────────
            api_rows = db.query(IamResourceApi).filter(
                IamResourceApi.app_key == _DASH_APP_KEY,
                IamResourceApi.resource_id.in_(resource_ids),
                IamResourceApi.is_active == 1,
                IamResourceApi.access_level == "PERMISSION",
            ).all()

            # Explicit extras outside ADMIN's root tree (e.g. role assign)
            if role_code == _ADMIN_ROLE_CODE and _ADMIN_EXTRA_APIS:
                by_id = {a.id: a for a in api_rows}
                for method, endpoint in _ADMIN_EXTRA_APIS:
                    extra = db.query(IamResourceApi).filter(
                        IamResourceApi.app_key == _DASH_APP_KEY,
                        IamResourceApi.http_method == method,
                        IamResourceApi.backend_endpoint == endpoint,
                        IamResourceApi.is_active == 1,
                    ).first()
                    if extra is None:
                        print(
                            f"  WARNING: ADMIN extra API {method} {endpoint} "
                            f"not found — skipping"
                        )
                        continue
                    by_id[extra.id] = extra
                api_rows = list(by_id.values())

        # Strip endpoints that must not be granted to any DFA_DASH role
        # (POST /dash — create is is_super_admin only).
        api_rows = [
            a for a in api_rows
            if (a.http_method, a.backend_endpoint) not in _ROLE_EXCLUDED_APIS
        ]

        if role_code == _EDITOR_ROLE_CODE:
            editor_api_rows = api_rows

        ins, sk = _persist_role_apis(
            db,
            role_code=role_code,
            role_id=role_id,
            api_rows=api_rows,
            resource_count=len(resource_ids),
            force=force,
            dry_run=dry_run,
            now=now,
        )
        inserted += ins
        skipped += sk

    # ── VIEWER: EDITOR grants where action == "READ" ─────────────────────
    viewer_role_id = role_map.get(_VIEWER_ROLE_CODE)
    if viewer_role_id is None:
        print(f"  WARNING: role '{_VIEWER_ROLE_CODE}' not found — skipping")
        skipped += 1
    elif editor_api_rows is None:
        print(
            f"  WARNING: EDITOR grants not resolved — "
            f"cannot derive {_VIEWER_ROLE_CODE}"
        )
        skipped += 1
    else:
        viewer_api_rows = [a for a in editor_api_rows if a.action == "READ"]
        ins, sk = _persist_role_apis(
            db,
            role_code=_VIEWER_ROLE_CODE,
            role_id=viewer_role_id,
            api_rows=viewer_api_rows,
            resource_count=len({a.resource_id for a in viewer_api_rows}),
            force=force,
            dry_run=dry_run,
            now=now,
        )
        inserted += ins
        skipped += sk

    return inserted, skipped


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Seeding DFA_DASH roles ===")
        r_ins, r_skip = seed_dash_roles(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding DFA_DASH role i18n (en) ===")
        ri_ins, ri_skip = seed_dash_role_i18n(db, force=force, dry_run=dry_run)
        if not dry_run:
            db.flush()

        print("=== Seeding DFA_DASH role_resource_api ===")
        rra_ins, rra_skip = seed_dash_role_resource_apis(db, force=force, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(
                f"\nDone. Roles → {r_ins} inserted/updated, {r_skip} skipped. "
                f"Role i18n → {ri_ins} inserted/updated, {ri_skip} skipped. "
                f"Role-API rows → {rra_ins} inserted, {rra_skip} skipped."
            )
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during DFA_DASH role seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed DFA_DASH IAM roles and role-resource-API mappings."
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing rows.")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to DB.")
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
