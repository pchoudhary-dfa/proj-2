"""
Seed system_application_client with the DFA_DASH federated frontend client.

Idempotent — existing row (matched by api_key) is skipped unless --force is passed.

The development Ed25519 public key is embedded below (same pattern as DFA_DM / DFA_VIZ).
For production: generate a new key pair, replace the public key here, and distribute
the private key via a secure channel to the dashboard frontend team.

See docs/APP_CLIENT_AUTH.md — Section 9.2 for key material reference.

Run from project root:
    python apps/app_db/scripts/app_dashboard/seed_dash_app_client.py
    python apps/app_db/scripts/app_dashboard/seed_dash_app_client.py --force
    python apps/app_db/scripts/app_dashboard/seed_dash_app_client.py --dry-run
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import SystemApplicationClient  # noqa: E402
from apps.shared.config.config import settings  # noqa: E402

# Development Ed25519 public key for DFA_DASH FED client.
# The matching private key is not stored in this repo; the dashboard BFF reads it from
# DM_API_SIGNING_PRIVATE_KEY. See docs/APP_CLIENT_AUTH.md Section 9.2. Replace for production.
_DFA_DASH_FED_CLIENT_PUBLIC_KEY_PEM = (
    "-----BEGIN PUBLIC KEY-----"
    "MCowBQYDK2VwAyEA0QkqJ66O/2mMaMhjJKxbG1vVxNVI5sZI2OJQuX0/0TI="
    "-----END PUBLIC KEY-----"
)


def _build_client() -> dict:
    return {
        "app_name": "Dashboard App",
        "app_key": settings.DFA_DASH_APP_KEY,
        "app_type": "FED",
        "api_key": settings.DFA_DASH_FED_APP_API_KEY,
        "auth_method": "SIGNATURE",
        "api_secret_hash": None,
        "client_public_key": _DFA_DASH_FED_CLIENT_PUBLIC_KEY_PEM.strip(),
        "origin_url": "",
        "description": "Dashboard frontend application (DFA_DASH)",
        "owner_user_id": settings.SYSTEM_USER_ID,
        "status": "ACTIVE",
        "allowed_ips": None,
        "requires_user_auth": 1,
        "default_user_id": None,
        "default_role_id": None,
    }


def seed_client(db, force: bool, dry_run: bool) -> tuple[int, int]:
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = _build_client()
    api_key = data["api_key"]

    existing = db.query(SystemApplicationClient).filter(
        SystemApplicationClient.api_key == api_key
    ).first()

    row_data = {**data, "created": now, "modified": now}

    if existing:
        if force:
            if dry_run:
                print(f"  [dry-run] Would overwrite client (api_key={api_key}, id={existing.id})")
            else:
                for k, v in row_data.items():
                    setattr(existing, k, v)
            inserted += 1
        else:
            print(f"  Skipping client (api_key={api_key}) — already exists")
            skipped += 1
    else:
        if dry_run:
            print(f"  [dry-run] Would insert client (api_key={api_key}, app_key={data['app_key']})")
        else:
            db.add(SystemApplicationClient(**row_data))
        inserted += 1

    return inserted, skipped


def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        print("=== Seeding DFA_DASH application client ===")
        inserted, skipped = seed_client(db, force=force, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(f"\nDone. App client → inserted/updated: {inserted}, skipped: {skipped}.")
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during DFA_DASH app client seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed DFA_DASH system_application_client row.")
    parser.add_argument("--force",   action="store_true", help="Overwrite existing row.")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB.")
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
