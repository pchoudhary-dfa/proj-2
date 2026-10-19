"""
Run all seeders in dependency order.

Seeds are organised under subfolders:
  apps/app_db/scripts/app_db/          — core app_db seeds
  apps/app_db/scripts/app_dashboard/   — DFA_DASH seeds (depends on app_db seeds)

Execution order:
  app_db/seed_system_language.py
  app_db/seed_applications.py               — no dependencies
  app_db/seed_application_clients.py        — requires system_application rows
  app_db/seed_configuration.py              — requires system_application rows
  app_db/seed_translations.py               — requires system_application rows
  app_db/seed_iam.py                        — requires system_application rows
  app_db/seed_dm_iam_roles.py               — requires seed_iam (resources + resource APIs)
  app_db/seed_monitoring_api.py             — requires seed_iam + seed_dm_iam_roles
  app_db/seed_cms_api.py                 — requires seed_iam + seed_dm_iam_roles
  app_db/seed_data_dictionary.py            — no dependencies
  app_db/seed_dataset_rejection_reasons.py  — no dependencies
  app_db/seed_help_adaptations.py           — no dependencies
  app_db/seed_help_keys.py                  — requires seed_help_adaptations
  app_dashboard/seed_dash_iam.py            — requires app_db seeds
  app_dashboard/seed_dash_iam_roles.py      — requires seed_dash_iam
  app_dashboard/seed_dash_app_client.py     — requires system_application rows
  app_dashboard/seed_dash_default_media.py  — requires dashboard media table

Run from project root:
    python apps/app_db/scripts/seed_all.py
    python apps/app_db/scripts/seed_all.py --force
    python apps/app_db/scripts/seed_all.py --dry-run
"""

import argparse
import subprocess
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPTS_DIR.parent.parent.parent

if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))


def _ensure_sso_tables() -> None:
    """Create SSO tables + default IdP rows before seeders that query them.

    SSO tables are not Alembic-managed; normally ``initialize_tables`` runs at
    API startup. Seeders (and Docker entrypoint) run *before* the app starts,
    so we ensure them here.
    """
    from sqlalchemy import create_engine

    from apps.app_db.config import app_db_settings
    from apps.shared.packages.dfa_sso_service import initialize_tables

    print("\n=== Ensuring SSO tables (initialize_tables) ===")
    engine = create_engine(app_db_settings.get_database_url())
    try:
        initialize_tables(engine)
    finally:
        engine.dispose()


_SEEDERS: list[str] = [
    # app_db seeds — in dependency order
    "app_db/seed_system_language.py",
    "app_db/seed_applications.py",
    "app_db/seed_application_clients.py",
    "app_db/seed_configuration.py",
    "app_db/seed_translations.py",
    "app_db/seed_iam.py",
    "app_db/seed_dm_iam_roles.py",
    "app_db/seed_monitoring_api.py",
    "app_db/seed_cms_api.py",
    "app_db/seed_data_dictionary.py",
    "app_db/seed_dataset_rejection_reasons.py",
    "app_db/seed_notification_templates.py",
    "app_db/seed_help_adaptations.py",
    "app_db/seed_help_keys.py",
    # app_dashboard seeds — depends on app_db seeds above
    "app_dashboard/seed_dash_iam.py",
    "app_dashboard/seed_dash_iam_roles.py",
    "app_dashboard/seed_dash_app_client.py",
    "app_dashboard/seed_dash_default_media.py",
]

def _run(script: str, extra_args: list[str]) -> bool:
    print(f"\n=== {script} ===")
    result = subprocess.run(
        [sys.executable, str(_SCRIPTS_DIR / script)] + extra_args,
        cwd=str(_PROJECT_ROOT),
    )
    if result.returncode != 0:
        print(f"WARNING: {script} exited with code {result.returncode}")
        return False
    return True

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run all app_db seeders in dependency order."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Pass --force to every seeder (wipe + re-insert).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Pass --dry-run to every seeder (preview only, no DB writes).",
    )
    args = parser.parse_args()
    extra: list[str] = []

    if args.force:
        extra.append("--force")

    if args.dry_run:
        extra.append("--dry-run")

    failed: list[str] = []

    try:
        _ensure_sso_tables()
    except Exception as exc:
        print(f"WARNING: SSO table initialization failed: {exc}")
        failed.append("SSO initialize_tables")

    for script in _SEEDERS:
        if not _run(script, extra):
            failed.append(script)
    print()

    if failed:
        print(f"Seeding completed with errors in: {', '.join(failed)}")
        sys.exit(1)
    else:
        print("All seeders completed successfully.")


if __name__ == "__main__":
    main()
