"""
DFA SSO Service Package

Isolated OIDC/SSO authentication package for FastAPI applications.
Provides provider management, OIDC login flow, user identity resolution,
and IdP session logout — with zero hard coupling to the host's user model.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.engine import Engine

__version__ = "1.0.0"

from .core.config import SsoConfig, get_sso_enabled, invalidate_sso_config_cache
from .core.service import SsoService
from .core.models import SsoUserProfile, SsoExchangeResult
from .providers.base import SsoUserProvider

logger = logging.getLogger(__name__)

_SEED_PROVIDERS = [
    {
        "provider_code": "drupal",
        "name": "Drupal CMS",
        "is_active": 1,
        "authorization_endpoint": "http://localhost/oauth2/authorize",
        "token_endpoint": "http://localhost/oauth2/token",
        "userinfo_endpoint": "http://localhost/oauth2/UserInfo",
        "issuer": "http://localhost",
        "jwks_uri": "http://localhost/oauth2/jwk",
        "scopes": "openid profile email",
        "auto_provision_users": 1,
    },
    {
        "provider_code": "google",
        "name": "Google",
        "is_active": 0,
        "scopes": "openid profile email",
        "auto_provision_users": 0,
    },
    {
        "provider_code": "azure_ad",
        "name": "Microsoft Azure AD",
        "is_active": 0,
        "scopes": "openid profile email",
        "auto_provision_users": 0,
    },
    {
        "provider_code": "facebook",
        "name": "Facebook",
        "is_active": 0,
        "scopes": "openid profile email",
        "auto_provision_users": 0,
    },
]


def initialize_tables(engine: Engine) -> None:
    """
    Create all SSO tables (if they don't exist) and seed default providers.

    Call this at application startup, similar to ``dfa_mailer_service``'s
    ``Base.metadata.create_all()`` pattern.
    """
    from sqlalchemy.orm import Session
    from .storage.sqlalchemy_storage import Base, SsoIdentityProviderModel

    Base.metadata.create_all(bind=engine)
    logger.info("SSO tables ensured (create_all)")

    with Session(engine) as session:
        count = session.query(SsoIdentityProviderModel).count()
        if count > 0:
            logger.info("SSO identity providers already seeded (%d rows), skipping", count)
            return

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for seed in _SEED_PROVIDERS:
            session.add(SsoIdentityProviderModel(**seed, created=now, modified=now))

        session.commit()
        logger.info("Seeded %d default SSO identity providers", len(_SEED_PROVIDERS))


__all__ = [
    "SsoConfig",
    "SsoService",
    "SsoUserProfile",
    "SsoExchangeResult",
    "SsoUserProvider",
    "get_sso_enabled",
    "invalidate_sso_config_cache",
    "initialize_tables",
    "__version__",
]
