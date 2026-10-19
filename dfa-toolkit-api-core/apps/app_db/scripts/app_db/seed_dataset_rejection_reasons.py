"""
Seed dataset_rejection_reason + dataset_rejection_reason_i18n.

Seeds are idempotent — existing rows (matched by reason_code) are skipped
unless --force is passed, which deletes all rows and re-inserts the full set.
I18n rows are upserted (insert new locales, leave existing ones unless --force).

Run from project root:
    python apps/app_db/scripts/seed_dataset_rejection_reasons.py
    python apps/app_db/scripts/seed_dataset_rejection_reasons.py --force
    python apps/app_db/scripts/seed_dataset_rejection_reasons.py --dry-run

Data file: apps/app_db/data/dataset_rejection_reasons.json
"""
import argparse
import json
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal                        # noqa: E402
from apps.app_db.models.core import (                               # noqa: E402
    DatasetRejectionReason,
    DatasetRejectionReasonI18n,
)

DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "dataset_rejection_reasons.json"


def _load() -> list[dict]:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def seed(*, force: bool, dry_run: bool) -> None:
    reasons = _load()
    db = SessionLocal()
    try:
        existing = {r.reason_code: r for r in db.query(DatasetRejectionReason).all()}

        if dry_run:
            to_insert = [r for r in reasons if r["reason_code"] not in existing]
            to_skip   = [r for r in reasons if r["reason_code"] in existing]
            total_i18n = sum(len(r.get("i18n", {})) for r in reasons)
            mode = "force (delete + re-insert)" if force else "insert-only (skip existing)"
            print(f"[Dry run] dataset_rejection_reason — mode: {mode}")
            print(f"          master rows : total={len(reasons)}  "
                  f"would_insert={len(to_insert)}  would_skip={len(to_skip)}")
            print(f"          i18n rows   : total={total_i18n} across "
                  f"{len({loc for r in reasons for loc in r.get('i18n', {})})} locales")
            for r in to_insert:
                print(f"          + [{r['reason_code']}] {r['reason_text']}")
            return

        if force:
            # Cascade delete removes i18n rows automatically (ON DELETE CASCADE)
            deleted = db.query(DatasetRejectionReason).delete(synchronize_session=False)
            for r in reasons:
                obj = DatasetRejectionReason(
                    reason_code=r["reason_code"],
                    reason_text=r["reason_text"],
                    is_active=True,
                    display_order=r["display_order"],
                )
                db.add(obj)
                db.flush()
                for locale, text in r.get("i18n", {}).items():
                    db.add(DatasetRejectionReasonI18n(
                        master_id=obj.reason_id,
                        locale=locale,
                        reason_text=text,
                    ))
            db.commit()
            i18n_total = sum(len(r.get("i18n", {})) for r in reasons)
            print(
                f"dataset_rejection_reason seeded (--force): "
                f"deleted {deleted} master rows, "
                f"inserted {len(reasons)} master + {i18n_total} i18n rows."
            )
            return

        # Insert-only: add missing master rows and their i18n translations
        master_inserted = master_skipped = i18n_inserted = i18n_skipped = 0

        for r in reasons:
            if r["reason_code"] in existing:
                master_skipped += 1
                row = existing[r["reason_code"]]
            else:
                row = DatasetRejectionReason(
                    reason_code=r["reason_code"],
                    reason_text=r["reason_text"],
                    is_active=True,
                    display_order=r["display_order"],
                )
                db.add(row)
                db.flush()
                master_inserted += 1

            # Upsert i18n rows — add missing locales, skip existing ones
            existing_locales = {
                i.locale
                for i in db.query(DatasetRejectionReasonI18n)
                .filter(DatasetRejectionReasonI18n.master_id == row.reason_id)
                .all()
            }
            for locale, text in r.get("i18n", {}).items():
                if locale in existing_locales:
                    i18n_skipped += 1
                else:
                    db.add(DatasetRejectionReasonI18n(
                        master_id=row.reason_id,
                        locale=locale,
                        reason_text=text,
                    ))
                    i18n_inserted += 1

        db.commit()
        print(
            f"dataset_rejection_reason seeded: "
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
        description="Seed dataset_rejection_reason + i18n with predefined reviewer rejection reasons."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete all existing rows and re-insert the full seed set.",
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
