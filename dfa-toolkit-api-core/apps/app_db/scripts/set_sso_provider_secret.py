"""
Encrypt and store the OAuth client_secret for an iam_sso_identity_provider row.

Run from project root:
    python -m apps.app_db.scripts.set_sso_provider_secret drupal "your-drupal-client-secret"
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.shared.packages.dfa_sso_service.storage.sqlalchemy_storage import (  # noqa: E402
    SsoIdentityProviderModel,
)
from apps.shared.config.config import settings  # noqa: E402
from apps.shared.utils.encryption import encrypt_secret  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Set Fernet-encrypted SSO client_secret for a provider.")
    parser.add_argument(
        "provider_code",
        help="iam_sso_identity_provider.provider_code (e.g. drupal)",
    )
    parser.add_argument("client_secret", help="Plain OAuth client secret from the IdP")
    args = parser.parse_args()

    plain = args.client_secret.strip()
    if not plain or plain.startswith("<"):
        print("Error: provide the real client secret from Drupal OAuth client settings.", file=sys.stderr)
        sys.exit(1)

    code = args.provider_code.strip()
    db = SessionLocal()
    try:
        provider = (
            db.query(SsoIdentityProviderModel)
            .filter(SsoIdentityProviderModel.provider_code == code)
            .first()
        )
        if not provider:
            print(f"Error: no SSO identity provider found for provider_code='{code}'", file=sys.stderr)
            sys.exit(1)

        provider.client_secret_enc = encrypt_secret(plain)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        provider.modified = now
        provider.modified_user_id = settings.SYSTEM_USER_ID
        db.commit()
        print(f"Updated client_secret_enc for provider id={provider.id} ({code}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
