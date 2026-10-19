"""
Seed system_language.

Seeds are idempotent - existing rows are skipped unless --force is passed.
Languages are matched by `locale`.

Run from project root:
    python apps/app_db/scripts/seed_system_language.py
    python apps/app_db/scripts/seed_system_language.py --force
    python apps/app_db/scripts/seed_system_language.py --dry-run
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

# Project root on sys.path so local imports work
project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import SystemLanguage  # noqa: E402


_DEFAULT_LANGUAGES = [
    {
        "locale": "ar",
        "name": "العربية",
        "description": "اللغة العربية",
        "is_rtl": True,
        "is_default": False,
    },
    {
        "locale": "en",
        "name": "English",
        "description": "English language",
        "is_rtl": False,
        "is_default": True,
    },
    {
        "locale": "fr",
        "name": "Français",
        "description": "Langue française",
        "is_rtl": False,
        "is_default": False,
    },
    {
        "locale": "es",
        "name": "Español",
        "description": "Idioma español",
        "is_rtl": False,
        "is_default": False,
    },
    {
        "locale": "tto",
        "name": "Lea Faka-Tonga",
        "description": "Lea Faka-Tonga",
        "is_rtl": False,
        "is_default": False,
    },
]


def seed_languages(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed system_language. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if force:
        if dry_run:
            existing_count = db.query(SystemLanguage).count()
            print(f"  [dry-run] Would delete {existing_count} existing system_language row(s)")
        else:
            db.query(SystemLanguage).delete(synchronize_session=False)

        for data in _DEFAULT_LANGUAGES:
            row_data = {
                **data,
                "is_deleted": False,
                "created_user_id": 1,
                "created": now,
                "modified_user_id": 1,
                "modified": now,
            }
            if dry_run:
                print(f"  [dry-run] Would insert language '{data['locale']}'")
            else:
                db.add(SystemLanguage(**row_data))
            inserted += 1
        return inserted, skipped

    for data in _DEFAULT_LANGUAGES:
        existing = db.query(SystemLanguage).filter(SystemLanguage.locale == data["locale"]).first()
        row_data = {
            **data,
            "is_deleted": False,
            "created_user_id": 1,
            "created": now,
            "modified_user_id": 1,
            "modified": now,
        }

        if existing:
            print(f"  Skipping language '{data['locale']}' - already exists")
            skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert language '{data['locale']}'")
            else:
                db.add(SystemLanguage(**row_data))
            inserted += 1

    return inserted, skipped


def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Seeding system_language ===")
        inserted, skipped = seed_languages(db, force=force, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(
                f"\nDone. Languages -> inserted/updated: {inserted}, skipped: {skipped}."
            )
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during system language seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed system language data.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete all existing rows, then insert seed data from scratch.",
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
