"""
Seed system_notification_template + system_notification_template_i18n.

Seeds are idempotent — existing (event_code, recipient_type) rows are skipped
unless --force is passed, which deletes all template rows and re-inserts.

Run from project root:
    python apps/app_db/scripts/app_db/seed_notification_templates.py
    python apps/app_db/scripts/app_db/seed_notification_templates.py --force
    python apps/app_db/scripts/app_db/seed_notification_templates.py --dry-run

Data file: apps/app_db/data/notification_templates.json
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import (  # noqa: E402
    SystemNotificationTemplate,
    SystemNotificationTemplateI18n,
)

DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "notification_templates.json"


def _load() -> list[dict]:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def _master_key(row: dict) -> tuple[str, str]:
    return (row["event_code"], row["recipient_type"])


def seed(*, force: bool, dry_run: bool) -> None:
    templates = _load()
    db = SessionLocal()
    try:
        existing = {
            (m.event_code, m.recipient_type): m
            for m in db.query(SystemNotificationTemplate).all()
        }

        if dry_run:
            to_insert = [t for t in templates if _master_key(t) not in existing]
            to_skip = [t for t in templates if _master_key(t) in existing]
            total_i18n = sum(len(t.get("i18n", {})) for t in templates)
            mode = "force (delete + re-insert)" if force else "insert-only (skip existing)"
            print(f"[Dry run] system_notification_template — mode: {mode}")
            print(
                f"          master rows : total={len(templates)}  "
                f"would_insert={len(to_insert)}  would_skip={len(to_skip)}"
            )
            print(f"          i18n rows   : total={total_i18n}")
            return

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        if force:
            db.query(SystemNotificationTemplateI18n).delete(synchronize_session=False)
            deleted = db.query(SystemNotificationTemplate).delete(synchronize_session=False)
            for row in templates:
                master = SystemNotificationTemplate(
                    event_code=row["event_code"],
                    recipient_type=row["recipient_type"],
                    channels=row["channels"],
                    email_template_key=row.get("email_template_key"),
                    is_active=True,
                    created=now,
                )
                db.add(master)
                db.flush()
                for locale, texts in row.get("i18n", {}).items():
                    db.add(
                        SystemNotificationTemplateI18n(
                            master_id=master.id,
                            locale=locale,
                            inapp_title=texts["inapp_title"],
                            inapp_body=texts["inapp_body"],
                        )
                    )
            db.commit()
            i18n_total = sum(len(t.get("i18n", {})) for t in templates)
            print(
                f"system_notification_template seeded (--force): "
                f"deleted {deleted} master rows, "
                f"inserted {len(templates)} master + {i18n_total} i18n rows."
            )
            return

        master_inserted = master_skipped = i18n_inserted = i18n_skipped = 0

        for row in templates:
            key = _master_key(row)
            if key in existing:
                master_skipped += 1
                master = existing[key]
            else:
                master = SystemNotificationTemplate(
                    event_code=row["event_code"],
                    recipient_type=row["recipient_type"],
                    channels=row["channels"],
                    email_template_key=row.get("email_template_key"),
                    is_active=True,
                    created=now,
                )
                db.add(master)
                db.flush()
                existing[key] = master
                master_inserted += 1

            existing_locales = {
                i.locale
                for i in db.query(SystemNotificationTemplateI18n)
                .filter(SystemNotificationTemplateI18n.master_id == master.id)
                .all()
            }
            for locale, texts in row.get("i18n", {}).items():
                if locale in existing_locales:
                    i18n_skipped += 1
                else:
                    db.add(
                        SystemNotificationTemplateI18n(
                            master_id=master.id,
                            locale=locale,
                            inapp_title=texts["inapp_title"],
                            inapp_body=texts["inapp_body"],
                        )
                    )
                    i18n_inserted += 1

        db.commit()
        print(
            f"system_notification_template seeded: "
            f"master inserted={master_inserted}, skipped={master_skipped}; "
            f"i18n inserted={i18n_inserted}, skipped={i18n_skipped}."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed system_notification_template + i18n for dataset workflow events."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete all existing template rows and re-insert the full seed set.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview only — no DB writes.",
    )
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
