"""
Seed dashboard default icons into dash_uploads as protected global media rows.

The seeder registers files from files/dash_default_icons without copying them
or storing their bytes in binary_obj. API responses expose /dash/media/{id}/content,
not these filesystem paths.

Run from project root:
    python apps/app_db/scripts/app_dashboard/seed_dash_default_media.py
    python apps/app_db/scripts/app_dashboard/seed_dash_default_media.py --force
    python apps/app_db/scripts/app_dashboard/seed_dash_default_media.py --dry-run
"""
from __future__ import annotations

import argparse
import mimetypes
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_dashboard.constants import DASH_GLOBAL_MEDIA_SUBDIR, DASH_MEDIA_FILES_ROOT  # noqa: E402
from apps.app_dashboard.models.dashboard import DashboardUpload  # noqa: E402
from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import IamUser  # noqa: E402,F401 — register dash_uploads.user_id FK target
from apps.shared.config.config import settings  # noqa: E402


def _content_type(path: Path) -> str:
    if path.suffix.lower() == ".svg":
        return "image/svg+xml"
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def seed_default_media(db, force: bool, dry_run: bool) -> tuple[int, int, int]:
    inserted = updated = skipped = 0
    source_dir = project_root / DASH_MEDIA_FILES_ROOT / DASH_GLOBAL_MEDIA_SUBDIR
    if not source_dir.exists():
        raise RuntimeError(f"Default media directory not found: {source_dir}")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    files = sorted(p for p in source_dir.iterdir() if p.is_file())

    for file_path in files:
        filename = file_path.name
        relative_path = f"{DASH_GLOBAL_MEDIA_SUBDIR}/{filename}"
        existing = db.query(DashboardUpload).filter(DashboardUpload.filename == filename).first()

        if existing:
            if not existing.is_system:
                print(f"  Skipping '{filename}' — filename is already used by non-system media")
                skipped += 1
                continue
            if force:
                if dry_run:
                    print(f"  [dry-run] Would update system media '{filename}'")
                else:
                    existing.dashboard_id = None
                    existing.visualization_id = None
                    existing.file_path = relative_path
                    existing.file_type = _content_type(file_path)
                    existing.file_size = file_path.stat().st_size
                    existing.binary_obj = None
                    existing.is_system = 1
                    existing.status = "COMPLETE"
                    existing.modified = now
                    existing.modified_user_id = settings.SYSTEM_USER_ID
                updated += 1
            else:
                skipped += 1
            continue

        if dry_run:
            print(f"  [dry-run] Would insert system media '{filename}'")
        else:
            db.add(DashboardUpload(
                dashboard_id=None,
                visualization_id=None,
                filename=filename,
                file_path=relative_path,
                file_type=_content_type(file_path),
                file_size=file_path.stat().st_size,
                binary_obj=None,
                is_system=1,
                user_id=None,
                status="COMPLETE",
                created=now,
                created_user_id=settings.SYSTEM_USER_ID,
                modified=now,
                modified_user_id=settings.SYSTEM_USER_ID,
            ))
        inserted += 1

    return inserted, updated, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed dashboard default icon media rows.")
    parser.add_argument("--force", action="store_true", help="Re-sync existing system media metadata.")
    parser.add_argument("--dry-run", action="store_true", help="Preview inserts/updates without writing.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        inserted, updated, skipped = seed_default_media(db, force=args.force, dry_run=args.dry_run)
        if args.dry_run:
            db.rollback()
        else:
            db.commit()
        print(
            "Default media seeding complete: "
            f"{inserted} inserted, {updated} updated, {skipped} skipped"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
