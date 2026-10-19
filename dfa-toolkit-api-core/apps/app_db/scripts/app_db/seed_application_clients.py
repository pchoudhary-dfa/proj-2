"""
Seed system_application_client with the default DFA API client registry.

Seeds are idempotent — existing rows (matched by api_key) are skipped unless
--force is passed, which overwrites them.

Default SIGNATURE clients use hardcoded Ed25519 public PEMs below; configure the
FED with the matching private keys (see docs/APP_CLIENT_AUTH.md). Replace those
PEMs for production if you do not use the bundled dev key material.

Run from project root:
    python apps/app_db/scripts/seed_application_clients.py
    python apps/app_db/scripts/seed_application_clients.py --force
    python apps/app_db/scripts/seed_application_clients.py --dry-run
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.core import SystemApplicationClient  # noqa: E402
from apps.shared.config.config import settings  # noqa: E402

# ---------------------------------------------------------------------------
# Ed25519 public keys (PEM) for default FED SIGNATURE clients — stored in DB only.
# Replace in production with keys from your key-management process.
# ---------------------------------------------------------------------------

_DFA_DM_FED_CLIENT_PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----MCowBQYDK2VwAyEAZGbEEyR+cyrLjnEIowtpHBc7coJTSTETAWgXHmCfkFM=-----END PUBLIC KEY-----"""

_DFA_VIZ_FED_CLIENT_PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----MCowBQYDK2VwAyEAPPiq4RLpCbafEDnDDe55Ql0XsMnyF8ZWjxaxodSyDYA=-----END PUBLIC KEY-----"""

_DFA_MON_API_EXTERNAL_CLIENT_PUBLIC_KEY_PEM = """\
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAqdpK7KoPYFtzRF4kOzq0mydvNi1U7tvC2DAblgSnI3M=
-----END PUBLIC KEY-----"""

_DFA_CMS_API_EXTERNAL_CLIENT_PUBLIC_KEY_PEM = """\
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAwO5WiO/IVC53J7aBU7fdA1JLvkgEa6oSg6y5/sWw3go=
-----END PUBLIC KEY-----"""


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

def _build_default_clients() -> list[dict]:
    return [
        {
            "app_name": "Data Manager App",
            "app_key": settings.DFA_DM_APP_KEY,
            "app_type": "FED",
            "api_key": settings.DFA_DM_FED_APP_API_KEY,
            "auth_method": "SIGNATURE",
            "api_secret_hash": None,
            "client_public_key": _DFA_DM_FED_CLIENT_PUBLIC_KEY_PEM.strip(),
            "origin_url": settings.DFA_DM_FED_ORIGIN_URL,
            "description": "DataManager frontend application",
            "owner_user_id": settings.SYSTEM_USER_ID,
            "status": "ACTIVE",
            "allowed_ips": None,
            "requires_user_auth": 1,
            "default_user_id": None,
            "default_role_id": None,
        },
        {
            "app_name": "Visualization App",
            "app_key": settings.DFA_VIZ_APP_KEY,
            "app_type": "FED",
            "api_key": settings.DFA_VIZ_FED_APP_API_KEY,
            "auth_method": "SIGNATURE",
            "api_secret_hash": None,
            "client_public_key": _DFA_VIZ_FED_CLIENT_PUBLIC_KEY_PEM.strip(),
            "origin_url": "",
            "description": "Visualization frontend application",
            "owner_user_id": settings.SYSTEM_USER_ID,
            "status": "ACTIVE",
            "allowed_ips": None,
            "requires_user_auth": 1,
            "default_user_id": None,
            "default_role_id": None,
        },
        {
            "app_name": "DFA Monitoring API",
            "app_key": settings.DFA_DM_APP_KEY,
            "app_type": "EXTERNAL",
            "api_key": "dfa_mon_api_app",
            "auth_method": "SIGNATURE",
            "api_secret_hash": None,
            "client_public_key": _DFA_MON_API_EXTERNAL_CLIENT_PUBLIC_KEY_PEM.strip(),
            "origin_url": None,
            "description": "DFA Monitoring API v2 backend service — server-to-server external client",
            "owner_user_id": settings.SYSTEM_USER_ID,
            "status": "INACTIVE",
            "allowed_ips": None,
            "requires_user_auth": 0,
            # default_user_id and default_role_id are resolved by seed_monitoring_api.py
            # which runs after this seeder. They are left NULL here and updated there.
            "default_user_id": None,
            "default_role_id": None,
        },
        {
            "app_name": "DFA CMS API",
            "app_key": settings.DFA_DM_APP_KEY,
            "app_type": "EXTERNAL",
            "api_key": "dfa_cms_api_app",
            "auth_method": "SIGNATURE",
            "api_secret_hash": None,
            "client_public_key": _DFA_CMS_API_EXTERNAL_CLIENT_PUBLIC_KEY_PEM.strip(),
            "origin_url": None,
            "description": "DFA CMS API backend service — server-to-server external client",
            "owner_user_id": settings.SYSTEM_USER_ID,
            "status": "INACTIVE",
            "allowed_ips": None,
            "requires_user_auth": 0,
            # default_user_id and default_role_id are resolved by seed_cms_api.py
            # which runs after this seeder. They are left NULL here and updated there.
            "default_user_id": None,
            "default_role_id": None,
        },
    ]

# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------

def seed_clients(db, force: bool, dry_run: bool) -> tuple[int, int]:
    """Seed system_application_client. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for data in _build_default_clients():
        api_key = data["api_key"]
        existing = (
            db.query(SystemApplicationClient)
            .filter(SystemApplicationClient.api_key == api_key)
            .first()
        )
        row_data = {**data, "created": now, "modified": now}
        # For SIGNATURE clients, generate a key pair if no public key is provided.
        # We only store the public key in the database and print the private key
        # once to stdout so that it can be shared with the FED/external team.
        # if row_data.get("auth_method") == "SIGNATURE" and not row_data.get("client_public_key"):
        #     try:
        #         from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        #         from cryptography.hazmat.primitives import serialization
        #     except ImportError as exc:  # pragma: no cover - optional dependency
        #         raise RuntimeError(
        #             "cryptography is required to generate SIGNATURE keys for "
        #             "system_application_client seed data. Install it with "
        #             "`pip install cryptography` and re-run the seed script."
        #         ) from exc

        #     private_key = Ed25519PrivateKey.generate()
        #     public_key = private_key.public_key()

        #     private_pem = private_key.private_bytes(
        #         encoding=serialization.Encoding.PEM,
        #         format=serialization.PrivateFormat.PKCS8,
        #         encryption_algorithm=serialization.NoEncryption(),
        #     ).decode("utf-8")
        #     public_pem = public_key.public_bytes(
        #         encoding=serialization.Encoding.PEM,
        #         format=serialization.PublicFormat.SubjectPublicKeyInfo,
        #     ).decode("utf-8")

        #     row_data["client_public_key"] = public_pem

        #     print(
        #         f"\n=== Generated Ed25519 key pair for client api_key={api_key} ===\n"
        #         f"Public key (stored in DB):\n{public_pem}\n"
        #         f"Private key (NOT stored in DB — share securely with FED/client team):\n"
        #         f"{private_pem}\n"
        #         f"===============================================================\n"
        #     )

        if existing:
            if force:
                if dry_run:
                    print(
                        f"  [dry-run] Would overwrite client (api_key={api_key}, id={existing.id})"
                    )
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
        print("=== Seeding system application clients ===")
        inserted, skipped = seed_clients(db, force=force, dry_run=dry_run)

        if not dry_run:
            db.commit()
            print(
                f"\nDone. Application clients → inserted/updated: {inserted}, skipped: {skipped}."
            )
        else:
            print("\n[dry-run] No changes written.")
    except Exception as exc:
        db.rollback()
        print(f"Error during application clients seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed default DFA application clients into system_application_client."
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
