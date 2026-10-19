"""
Seed data_dictionary with one row per app DB table.

Seeds are idempotent — existing rows (matched by database_name + table_name) are
skipped unless --force is passed, which overwrites them.

Run from project root:
    python apps/app_db/scripts/seed_data_dictionary.py
    python apps/app_db/scripts/seed_data_dictionary.py --force
    python apps/app_db/scripts/seed_data_dictionary.py --dry-run
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal          # noqa: E402
from apps.app_db.models.core import DataDictionary    # noqa: E402
from apps.shared.config.config import settings        # noqa: E402

# ---------------------------------------------------------------------------
# Seed data — one entry per table in the application database
# ---------------------------------------------------------------------------

def _build_entries(db_name: str) -> list[dict]:
    return [
        {
            "database_name": db_name,
            "table_name": "system_datawarehouses",
            "table_description": "Stores data warehouse connection info, metadata and cached counts",
            "primary_keys": "id",
            "foreign_keys": None,
            "linked_tables": None,
        },
        {
            "database_name": db_name,
            "table_name": "system_application",
            "table_description": "Application registry keyed by app_key (e.g. DFA_DM, DFA_VIZ, DFA_DASH)",
            "primary_keys": "id",
            "foreign_keys": None,
            "linked_tables": None,
        },
        {
            "database_name": db_name,
            "table_name": "system_application_i18n",
            "table_description": "Translated display names and descriptions for system_application entries",
            "primary_keys": "master_id,locale",
            "foreign_keys": "master_id",
            "linked_tables": "links to system_application.id",
        },
        {
            "database_name": db_name,
            "table_name": "system_application_client",
            "table_description": "Registered API clients — federated frontends, external integrations, mobile apps",
            "primary_keys": "id",
            "foreign_keys": "app_key",
            "linked_tables": "links to system_application.app_key",
        },
        {
            "database_name": db_name,
            "table_name": "system_configuration",
            "table_description": "Key-value configuration per application. Composite PK: (app_key, key_code)",
            "primary_keys": "app_key,key_code",
            "foreign_keys": "app_key",
            "linked_tables": "links to system_application.app_key",
        },
        {
            "database_name": db_name,
            "table_name": "system_language",
            "table_description": "UI and system languages available on the platform",
            "primary_keys": "id",
            "foreign_keys": None,
            "linked_tables": None,
        },
        {
            "database_name": db_name,
            "table_name": "system_language_translation",
            "table_description": "Master translation records per translation code and application",
            "primary_keys": "id",
            "foreign_keys": "app_key",
            "linked_tables": "links to system_application.app_key",
        },
        {
            "database_name": db_name,
            "table_name": "system_language_translation_i18n",
            "table_description": "Translated text per locale for system_language_translation entries",
            "primary_keys": "master_id,locale",
            "foreign_keys": "master_id",
            "linked_tables": "links to system_language_translation.id",
        },
        {
            "database_name": db_name,
            "table_name": "gallery",
            "table_description": "Gallery items (charts, datacubes) saved by users per datawarehouse",
            "primary_keys": "id",
            "foreign_keys": "dw_id",
            "linked_tables": "links to system_datawarehouses.id",
        },
        {
            "database_name": db_name,
            "table_name": "gallery_keyword",
            "table_description": "Search keyword index — tokens denormalized from gallery name, description and tags",
            "primary_keys": "id",
            "foreign_keys": "gallery_id",
            "linked_tables": "links to gallery.id",
        },
        {
            "database_name": db_name,
            "table_name": "iam_role",
            "table_description": "Available roles scoped to an application",
            "primary_keys": "id",
            "foreign_keys": "app_key",
            "linked_tables": "links to system_application.app_key",
        },
        {
            "database_name": db_name,
            "table_name": "iam_role_i18n",
            "table_description": "Translated display names and descriptions for iam_role entries",
            "primary_keys": "master_id,locale",
            "foreign_keys": "master_id",
            "linked_tables": "links to iam_role.id",
        },
        {
            "database_name": db_name,
            "table_name": "iam_user",
            "table_description": "Application user accounts",
            "primary_keys": "id",
            "foreign_keys": None,
            "linked_tables": None,
        },
        {
            "database_name": db_name,
            "table_name": "iam_user_role",
            "table_description": "User–application–datawarehouse–role assignments",
            "primary_keys": "id",
            "foreign_keys": "user_id,dw_id,role_id",
            "linked_tables": "links to iam_user.id,links to system_datawarehouses.id,links to iam_role.id",
        },
        {
            "database_name": db_name,
            "table_name": "iam_user_role_content",
            "table_description": "Data-level access control — restricts a role assignment to specific content items",
            "primary_keys": "id",
            "foreign_keys": "user_role_id",
            "linked_tables": "links to iam_user_role.id",
        },
        {
            "database_name": db_name,
            "table_name": "iam_resource",
            "table_description": "Application modules/screens that can be permission-gated",
            "primary_keys": "id",
            "foreign_keys": "app_key",
            "linked_tables": "links to system_application.app_key",
        },
        {
            "database_name": db_name,
            "table_name": "iam_resource_i18n",
            "table_description": "Translated display names for iam_resource entries",
            "primary_keys": "master_id,locale",
            "foreign_keys": "master_id",
            "linked_tables": "links to iam_resource.id",
        },
        {
            "database_name": db_name,
            "table_name": "iam_resource_api",
            "table_description": "HTTP endpoints mapped to a resource with required access level",
            "primary_keys": "id",
            "foreign_keys": "resource_id",
            "linked_tables": "links to iam_resource.id",
        },
        {
            "database_name": db_name,
            "table_name": "iam_resource_api_i18n",
            "table_description": "Translated descriptions for iam_resource_api entries",
            "primary_keys": "master_id,locale",
            "foreign_keys": "master_id",
            "linked_tables": "links to iam_resource_api.id",
        },
        {
            "database_name": db_name,
            "table_name": "iam_role_resource_api",
            "table_description": "Role–API permission grants. A matching row is required to pass PERMISSION-level access checks",
            "primary_keys": "id",
            "foreign_keys": "role_id,resource_id,resource_api_id",
            "linked_tables": "links to iam_role.id,links to iam_resource.id,links to iam_resource_api.id",
        },
        {
            "database_name": db_name,
            "table_name": "logs_transaction",
            "table_description": "User audit trail — written on create/update/delete inside a datawarehouse; optional HTTP path+query (same capturing as logs_server_error) when the change runs in a request",
            "primary_keys": "id",
            "foreign_keys": "dw_id",
            "linked_tables": "links to system_datawarehouses.id",
        },
        {
            "database_name": db_name,
            "table_name": "logs_server_error",
            "table_description": "Infrastructure error log — written when log_event level matches DB_LOG_LEVELS; HTTP context in method/path/status; correlation and logger context folded into error_message with stack_trace for detail",
            "primary_keys": "id",
            "foreign_keys": "dw_id",
            "linked_tables": "links to system_datawarehouses.id",
        },
        {
            "database_name": db_name,
            "table_name": "system_data_dictionary",
            "table_description": "Data dictionary — one row per table describing its purpose, keys and relationships",
            "primary_keys": "id",
            "foreign_keys": None,
            "linked_tables": None,
        },
    ]


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------

def seed(force: bool = False, dry_run: bool = False) -> None:
    db_name = settings.DB_NAME
    entries = _build_entries(db_name)

    db = SessionLocal()
    try:
        print(f"=== Seeding data_dictionary (database={db_name}) ===")
        inserted = skipped = updated = 0

        for entry in entries:
            existing = (
                db.query(DataDictionary)
                .filter(
                    DataDictionary.database_name == entry["database_name"],
                    DataDictionary.table_name == entry["table_name"],
                )
                .first()
            )

            if existing:
                if force:
                    if dry_run:
                        print(f"  [dry-run] Would overwrite: {entry['table_name']}")
                    else:
                        for k, v in entry.items():
                            setattr(existing, k, v)
                    updated += 1
                else:
                    print(f"  Skipping {entry['table_name']} — already exists")
                    skipped += 1
            else:
                if dry_run:
                    print(f"  [dry-run] Would insert: {entry['table_name']}")
                else:
                    db.add(DataDictionary(**entry, created=datetime.utcnow()))
                inserted += 1

        if not dry_run:
            db.commit()
            print(
                f"\nDone. Inserted: {inserted}, updated: {updated}, skipped: {skipped}."
            )
        else:
            print(f"\n[dry-run] Would insert: {inserted}, update: {updated}, skip: {skipped}.")
    except Exception as exc:
        db.rollback()
        print(f"Error during data_dictionary seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed data_dictionary with app DB table metadata.")
    parser.add_argument("--force",   action="store_true", help="Overwrite existing rows.")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB.")
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
