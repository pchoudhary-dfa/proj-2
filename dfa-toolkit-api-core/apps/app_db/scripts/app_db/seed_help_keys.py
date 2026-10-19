"""
Seed dfahelp_adaptation_key with hierarchical help keys for every
navigable page in Data Manager, Visualizer, and Dashboard.

Each key node maps to a frontend route where the help icon appears
(via getHelpKey in DM, planned VIZ-* prefix in Visualizer).
Grouping nodes (sidebar sections) have key=NULL and exist solely so the
admin tree UI mirrors the application menu structure.

Every node includes a short English description seeded into
dfahelp_adaptation_key_i18n.desc so the Help panel shows content by default.

Prerequisites:
    seed_help_adaptations.py must run first (creates DFA_DM / DFA_VIZ / DFA_DASH
    adaptations and their root keys DFA_DM_ROOT / DFA_VIZ_ROOT / DFA_DASH_ROOT).

Run from project root:
    python apps/app_db/scripts/app_db/seed_help_keys.py
    python apps/app_db/scripts/app_db/seed_help_keys.py --force
    python apps/app_db/scripts/app_db/seed_help_keys.py --dry-run
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.help import (  # noqa: E402
    DfaHelpAdaptation,
    DfaHelpAdaptationKey,
    DfaHelpAdaptationKeyI18n,
)

# ---------------------------------------------------------------------------
# Data Manager help tree — mirrors Sidebar.tsx + header utility routes.
# key values match getHelpKey output from helpKeys.ts.
# Grouping-only nodes omit "key" (NULL in DB).
# Every node has "desc" seeded into dfahelp_adaptation_key_i18n.desc.
# ---------------------------------------------------------------------------
_DM_HELP_TREE: list[dict] = [
    {
        "code": "DW", "title": "Datawarehouse", "key": "DM-DATAWAREHOUSE",
        "desc": "Browse, create, and manage data warehouses; warehouse-scoped navigation.",
        "children": [
            {
                "code": "OVERVIEW", "title": "Overview", "key": "DM-OVERVIEW",
                "desc": "Dashboard overview of the selected warehouse with key statistics.",
            },
            {
                "code": "TEMPLATE", "title": "Template",
                "desc": "Define the structural template of the warehouse: indicators, units, subgroups, classifications, and areas.",
                "children": [
                    {"code": "INDICATOR", "title": "Indicators", "key": "DM-INDICATOR",
                     "desc": "Create, edit, and manage indicators for the selected warehouse."},
                    {"code": "UNITS", "title": "Units", "key": "DM-UNITS",
                     "desc": "Define and manage measurement units used by indicators."},
                    {"code": "SUBGROUPS", "title": "Subgroups", "key": "DM-SUBGROUPS",
                     "desc": "Manage population subgroups for disaggregated data."},
                    {"code": "IC", "title": "Classifications", "key": "DM-INDICATOR-CLASSIFICATIONS",
                     "desc": "Organize indicators into thematic classifications (sectors, goals, etc.)."},
                    {"code": "AREAS", "title": "Area", "key": "DM-AREAS",
                     "desc": "Manage the geographic area hierarchy for the warehouse."},
                ],
            },
            {
                "code": "DATA_MGMT", "title": "Data Management",
                "desc": "Enter, review, and compute data values for the warehouse.",
                "children": [
                    {"code": "DATA_ENTRY", "title": "Data Entry", "key": "DM-DATA-ENTRY-DATASET",
                     "desc": "Enter or import data values into datasets for the warehouse."},
                    {"code": "DATA_REVW", "title": "Data Review", "key": "DM-DATA-REVIEW-DATASET",
                     "desc": "Review, approve, or reject submitted datasets."},
                    {"code": "TIMEPERIOD", "title": "Time Period", "key": "DM-TIMEPERIOD",
                     "desc": "Manage time periods available for data entry."},
                    {"code": "SOURCES", "title": "Sources", "key": "DM-SOURCES",
                     "desc": "Manage data sources referenced by indicators and datasets."},
                    {"code": "CALC_IUS", "title": "Calculate IUS", "key": "DM-COMPUTE-ENGINE-EXECUTE",
                     "desc": "Run compute-engine calculations to generate derived IUS values."},
                ],
            },
            {
                "code": "DW_ADMIN", "title": "Administration",
                "desc": "Warehouse-level administration: workflow rules, languages, and tools.",
                "children": [
                    {"code": "WORKFLOW", "title": "Workflow", "key": "DM-WORKFLOW",
                     "desc": "Configure multi-level review workflows for data submissions."},
                    {"code": "LANGUAGES", "title": "Languages", "key": "DM-LANGUAGES",
                     "desc": "Manage languages enabled for the warehouse content."},
                    {"code": "TOOLS", "title": "Tools", "key": "DM-TOOLS",
                     "desc": "Warehouse utilities: optimize, sync, and maintenance tools."},
                ],
            },
            {
                "code": "REPORTS", "title": "Reports",
                "desc": "Warehouse reports and analytics (placeholder — route not yet available).",
            },
            {
                "code": "DW_LOGS", "title": "Logs",
                "desc": "Warehouse-level activity and transaction logs.",
                "children": [
                    {"code": "DW_TX_LOG", "title": "Transaction Logs", "key": "DM-LOGS-TRANSACTION-LOGS",
                     "desc": "View audit trail of data changes in the warehouse."},
                ],
            },
        ],
    },
    {
        "code": "ADMIN", "title": "Administration",
        "desc": "Application-level administration: roles, users, email templates, and settings.",
        "children": [
            {"code": "ROLES", "title": "Roles", "key": "DM-ADMINISTRATION-ROLES",
             "desc": "Define IAM roles and assign resource permissions."},
            {"code": "USERS", "title": "Users", "key": "DM-ADMINISTRATION-USERS",
             "desc": "Manage user accounts, passwords, and profile settings."},
            {"code": "EMAIL_TPL", "title": "Email Templates", "key": "DM-ADMINISTRATION-EMAIL-TEMPLATES",
             "desc": "Customize notification email templates sent by the system."},
            {"code": "HELP", "title": "Help Admin", "key": "DM-ADMINISTRATION-HELP",
             "desc": "Author and manage in-app help content for all pages."},
            {"code": "CONFIG", "title": "Settings", "key": "DM-ADMINISTRATION-CONFIGURATION",
             "desc": "Edit application-level configuration settings."},
        ],
    },
    {
        "code": "TRANSLATE", "title": "Translations", "key": "DM-TRANSLATIONS",
        "desc": "Manage UI string translations for all supported languages.",
    },
    {
        "code": "APP_LOGS", "title": "Logs",
        "desc": "Application-level logs: email delivery and server errors.",
        "children": [
            {"code": "EMAIL_LOGS", "title": "Email Logs", "key": "DM-LOGS-EMAIL-LOGS",
             "desc": "View email delivery history and status."},
            {"code": "SRV_ERR", "title": "Server Errors", "key": "DM-LOGS-SERVER-ERRORS",
             "desc": "Browse recent server-side error entries."},
        ],
    },
]

# ---------------------------------------------------------------------------
# Visualizer help tree — pre-seeded for future VIZ-* integration.
# ---------------------------------------------------------------------------
_VIZ_HELP_TREE: list[dict] = [
    {"code": "VISUALIZER", "title": "Visualize", "key": "VIZ-VISUALIZER",
     "desc": "Search, filter, and visualize indicator data with charts and maps."},
    {"code": "GALLERY", "title": "Gallery", "key": "VIZ-GALLERY",
     "desc": "Browse and manage saved visualizations."},
    {"code": "AUTH", "title": "Authentication", "key": "VIZ-AUTH",
     "desc": "Sign in, register, or reset your password."},
    {"code": "EMBED", "title": "Embed View", "key": "VIZ-VISUALIZE-EMBED",
     "desc": "Embeddable visualization view for external websites."},
]

# ---------------------------------------------------------------------------
# DFA Dashboard help tree
# ---------------------------------------------------------------------------

_DFA_DASH_HELP_TREE: list[dict] = [
    {"code": "DASHBOARD", "title": "Dashboard", "key": "DASH-DASHBOARD",
     "desc": "Dashboard list page."},
    {"code": "DATAWAREHOUSE", "title": "Datawarehouse", "key": "DASH-DATAWAREHOUSE",
     "desc": "Datawarehouse list."},
    {"code": "HEADER-FOOTER", "title": "Header and Footer", "key": "DASH-HEADER-FOOTER",
     "desc": "Header and Footer management."},
    {"code": "MEDIA-FILES", "title": "Media Files", "key": "DASH-MEDIA-FILES",
     "desc": "Media Files management."},
    {"code": "PREFERENCES", "title": "Preferences", "key": "DASH-PREFERENCES",
     "desc": "User preferences."},
    {"code": "ABOUT", "title": "About", "key": "DASH-ABOUT",
     "desc": "About page."},
    {
        "code": "ADMIN", "title": "Administration",
        "desc": "Application-level administration: roles, users, email templates, and settings.",
        "children": [
            {"code": "USERS", "title": "Users", "key": "DASH-ADMINISTRATION-USERS",
             "desc": "Manage user accounts, passwords, and profile settings."},
            {"code": "CONFIG", "title": "Settings", "key": "DASH-ADMINISTRATION-SETTINGS",
             "desc": "Edit application-level configuration settings."},
            {"code": "TRANSLATIONS", "title": "Translations", "key": "DASH-ADMINISTRATION-TRANSLATIONS",
             "desc": "Manage UI string translations for all supported languages."},
            {"code": "TRANSACTION-LOGS", "title": "Transaction Logs", "key": "DASH-ADMINISTRATION-TRANSACTION-LOGS",
             "desc": "View audit trail of data changes and transaction history."},
        ],
    }
]


_TREES: list[dict] = [
    {"adaptation_code": "DFA_DM", "root_key": "DFA_DM_ROOT", "children": _DM_HELP_TREE},
    {"adaptation_code": "DFA_VIZ", "root_key": "DFA_VIZ_ROOT", "children": _VIZ_HELP_TREE},
    {"adaptation_code": "DFA_DASH", "root_key": "DFA_DASH_ROOT", "children": _DFA_DASH_HELP_TREE},
]


# ---------------------------------------------------------------------------
# Seeder logic
# ---------------------------------------------------------------------------

def _find_existing(db, adaptation_id: int, parent_id: int, node: dict):
    """Find an existing key row matching this node."""
    key = node.get("key")
    if key:
        return (
            db.query(DfaHelpAdaptationKey)
            .filter(
                DfaHelpAdaptationKey.adaptation_id == adaptation_id,
                DfaHelpAdaptationKey.key == key,
                DfaHelpAdaptationKey.deleted_at.is_(None),
            )
            .first()
        )
    return (
        db.query(DfaHelpAdaptationKey)
        .filter(
            DfaHelpAdaptationKey.adaptation_id == adaptation_id,
            DfaHelpAdaptationKey.parent_id == parent_id,
            DfaHelpAdaptationKey.code == node["code"],
            DfaHelpAdaptationKey.deleted_at.is_(None),
        )
        .first()
    )


def _upsert_i18n(db, key_id: int, title: str, desc: str, *, force: bool) -> None:
    existing = (
        db.query(DfaHelpAdaptationKeyI18n)
        .filter(
            DfaHelpAdaptationKeyI18n.adaptation_key_id == key_id,
            DfaHelpAdaptationKeyI18n.locale == "en",
        )
        .first()
    )
    if existing:
        if force:
            existing.title = title
            existing.desc = desc
    else:
        db.add(DfaHelpAdaptationKeyI18n(
            adaptation_key_id=key_id,
            locale="en",
            title=title,
            desc=desc,
        ))


def _seed_node(
    db,
    adaptation_id: int,
    parent_id: int,
    node: dict,
    *,
    force: bool,
    dry_run: bool,
    seeded_ids: set[int],
    depth: int = 1,
) -> tuple[int, int]:
    """Recursively upsert a single node and its children. Returns (inserted, skipped)."""
    inserted = skipped = 0
    indent = "  " * depth
    code = node["code"]
    key = node.get("key")
    title = node["title"]
    desc = node.get("desc", "")

    existing = _find_existing(db, adaptation_id, parent_id, node)

    if existing:
        if force:
            if dry_run:
                print(f"{indent}[dry-run] Would update key (id={existing.id}, code={code})")
            else:
                existing.code = code
                existing.key = key
                existing.parent_id = parent_id
                _upsert_i18n(db, existing.id, title, desc, force=True)
            inserted += 1
        else:
            skipped += 1
        node_id = existing.id
    else:
        if dry_run:
            print(f"{indent}[dry-run] Would insert key (code={code}, key={key or 'NULL'})")
            inserted += 1
            for child in node.get("children", []):
                ci, cs = _seed_node(
                    db, adaptation_id, 0, child,
                    force=force, dry_run=dry_run, seeded_ids=seeded_ids, depth=depth + 1,
                )
                inserted += ci
                skipped += cs
            return inserted, skipped
        else:
            row = DfaHelpAdaptationKey(
                adaptation_id=adaptation_id,
                key=key,
                code=code,
                parent_id=parent_id,
            )
            db.add(row)
            db.flush()
            node_id = row.id
            _upsert_i18n(db, node_id, title, desc, force=False)
            inserted += 1

    seeded_ids.add(node_id)

    for child in node.get("children", []):
        ci, cs = _seed_node(
            db, adaptation_id, node_id, child,
            force=force, dry_run=dry_run, seeded_ids=seeded_ids, depth=depth + 1,
        )
        inserted += ci
        skipped += cs

    return inserted, skipped


def _soft_delete_orphans(
    db,
    adaptation_id: int,
    root_id: int,
    seeded_ids: set[int],
    *,
    dry_run: bool,
) -> int:
    """Soft-delete active keys for this adaptation that are no longer in the seed tree."""
    orphans = (
        db.query(DfaHelpAdaptationKey)
        .filter(
            DfaHelpAdaptationKey.adaptation_id == adaptation_id,
            DfaHelpAdaptationKey.deleted_at.is_(None),
            DfaHelpAdaptationKey.id.notin_(seeded_ids),
            DfaHelpAdaptationKey.id != root_id,
        )
        .all()
    )
    for row in orphans:
        label = row.key or row.code or row.id
        if dry_run:
            print(f"  [dry-run] Would soft-delete orphan key (id={row.id}, {label})")
        else:
            row.deleted_at = datetime.utcnow()
    return len(orphans)


def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        for tree_def in _TREES:
            adapt_code = tree_def["adaptation_code"]
            root_key_str = tree_def["root_key"]

            adaptation = (
                db.query(DfaHelpAdaptation)
                .filter(
                    DfaHelpAdaptation.code == adapt_code,
                    DfaHelpAdaptation.deleted_at.is_(None),
                )
                .first()
            )
            if not adaptation:
                print(
                    f"ERROR: Adaptation '{adapt_code}' not found. "
                    f"Run seed_help_adaptations.py first.",
                    file=sys.stderr,
                )
                sys.exit(1)

            root = (
                db.query(DfaHelpAdaptationKey)
                .filter(
                    DfaHelpAdaptationKey.adaptation_id == adaptation.id,
                    DfaHelpAdaptationKey.key == root_key_str,
                    DfaHelpAdaptationKey.deleted_at.is_(None),
                )
                .first()
            )
            if not root:
                print(
                    f"ERROR: Root key '{root_key_str}' not found for adaptation "
                    f"'{adapt_code}'. Run seed_help_adaptations.py first.",
                    file=sys.stderr,
                )
                sys.exit(1)

            seeded_ids: set[int] = {root.id}
            total_inserted = total_skipped = 0
            for node in tree_def["children"]:
                ni, ns = _seed_node(
                    db, adaptation.id, root.id, node,
                    force=force, dry_run=dry_run, seeded_ids=seeded_ids,
                )
                total_inserted += ni
                total_skipped += ns

            orphans_deleted = 0
            if force:
                orphans_deleted = _soft_delete_orphans(
                    db, adaptation.id, root.id, seeded_ids, dry_run=dry_run,
                )

            label = f"{adapt_code} ({root_key_str})"
            if dry_run:
                print(
                    f"[dry-run] {label}: would insert/update {total_inserted}, "
                    f"skip {total_skipped}, soft-delete {orphans_deleted} orphan(s)"
                )
            else:
                print(
                    f"{label}: inserted/updated {total_inserted}, "
                    f"skipped {total_skipped}, soft-deleted {orphans_deleted} orphan(s)"
                )

        if not dry_run:
            db.commit()
            print("Help keys seeded successfully.")
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during help keys seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed help key tree for DFA Data Manager, Visualizer, and Dashboard."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing rows instead of skipping them.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be seeded without writing to the DB.",
    )
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
