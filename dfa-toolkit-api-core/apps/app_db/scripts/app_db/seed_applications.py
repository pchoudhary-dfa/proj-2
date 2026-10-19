"""
Seed system_application with the default DFA application registry.

Seeds are idempotent — existing rows (matched by app_key) are skipped
unless --force is passed, which overwrites them.

Run from project root:
    python apps/app_db/scripts/seed_applications.py
    python apps/app_db/scripts/seed_applications.py --force
    python apps/app_db/scripts/seed_applications.py --dry-run
"""
import argparse
import sys
from pathlib import Path

# Project root on sys.path so local imports work
project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import SystemApplication, SystemApplicationI18n  # noqa: E402
from apps.shared.config.config import settings  # noqa: E402

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

_DTK_DASH_ICON = (
    "data:image/png;base64,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"
)

def _build_default_applications() -> list[dict]:
    return [
        {"id": 1, "app_key": settings.DFA_DM_APP_KEY,   "link": None, "is_active": 1},
        {"id": 2, "app_key": settings.DFA_VIZ_APP_KEY,  "link": None, "is_active": 1},
        {"id": 3, "app_key": settings.DFA_DASH_APP_KEY, "link": None, "is_active": 1},
        {"app_key": settings.DFA_CORE_APP_KEY, "link": None, "is_active": 1},
    ]


def _build_default_application_i18n() -> dict[str, dict]:
    return {
        settings.DFA_DM_APP_KEY:   {"name": "DFA Data Manager",   "description": "DFA Data Manager application"},
        settings.DFA_VIZ_APP_KEY:  {"name": "DFA Visualizer",     "description": "DFA Visualizer application"},
        settings.DFA_DASH_APP_KEY: {"name": "DFA Dashboard",      "description": "DFA Dashboard application"},
        settings.DFA_CORE_APP_KEY: {"name": "DFA Platform Core",  "description": "Platform-wide configuration scope"},
    }

# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------

def seed_applications(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed system_application. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0
    for data in _build_default_applications():
        app_key = data["app_key"]
        existing = (
            db.query(SystemApplication)
            .filter(SystemApplication.app_key == app_key)
            .first()
        )
        if existing:
            if force:
                if dry_run:
                    print(
                        f"  [dry-run] Would overwrite application (app_key={app_key}, id={existing.id})"
                    )
                else:
                    for k, v in data.items():
                        if k != "id":
                            setattr(existing, k, v)
                inserted += 1
            else:
                print(f"  Skipping application (app_key={app_key}) — already exists")
                skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert application (app_key={app_key})")
            else:
                insert_data = {k: v for k, v in data.items() if k != "id"}
                db.add(SystemApplication(**insert_data))
            inserted += 1
    return inserted, skipped


def seed_application_i18n(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed system_application_i18n with English display names and descriptions. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0

    app_map: dict[str, int] = {
        app.app_key: app.id
        for app in db.query(SystemApplication.app_key, SystemApplication.id).all()
    }

    for app_key, i18n in _build_default_application_i18n().items():
        master_id = app_map.get(app_key)
        if master_id is None:
            print(f"  Skipping i18n for app_key={app_key} — application row not found")
            skipped += 1
            continue

        existing = (
            db.query(SystemApplicationI18n)
            .filter(
                SystemApplicationI18n.master_id == master_id,
                SystemApplicationI18n.locale == "en",
            )
            .first()
        )
        if existing:
            if force:
                if dry_run:
                    print(f"  [dry-run] Would overwrite i18n for app_key={app_key} (en)")
                else:
                    existing.name = i18n["name"]
                    existing.description = i18n["description"]
                inserted += 1
            else:
                print(f"  Skipping i18n for app_key={app_key} (en) — already exists")
                skipped += 1
        else:
            if dry_run:
                print(f"  [dry-run] Would insert i18n name='{i18n['name']}' for app_key={app_key} (en)")
            else:
                db.add(SystemApplicationI18n(master_id=master_id, locale="en", name=i18n["name"], description=i18n["description"]))
            inserted += 1

    return inserted, skipped


def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Seeding system applications ===")
        inserted, skipped = seed_applications(db, force=force, dry_run=dry_run)

        if not dry_run:
            db.flush()

        print("=== Seeding system_application_i18n ===")
        i18n_inserted, i18n_skipped = seed_application_i18n(db, force=force, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(
                f"\nDone. Applications → inserted/updated: {inserted}, skipped: {skipped}. "
                f"i18n → inserted/updated: {i18n_inserted}, skipped: {i18n_skipped}."
            )
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during applications seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed default DFA applications into system_applications.")
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
