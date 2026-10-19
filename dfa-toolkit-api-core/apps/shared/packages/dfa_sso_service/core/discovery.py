"""
OIDC discovery and authlib client creation — decoupled from the host's settings.
"""
from __future__ import annotations

import logging

import httpx
from authlib.integrations.starlette_client import OAuth

from .crypto import decrypt_value

logger = logging.getLogger(__name__)


from .errors import SsoConfigError

__all__ = ["SsoConfigError", "discover_endpoints", "create_authlib_client"]


def discover_endpoints(well_known_uri: str) -> dict:
    """Fetch the OIDC ``.well-known`` configuration and return key endpoint URLs."""
    from .security import validate_well_known_uri

    safe_uri = validate_well_known_uri(well_known_uri)
    try:
        resp = httpx.get(
            safe_uri,
            timeout=10.0,
            follow_redirects=False,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise SsoConfigError(f"Failed to fetch OIDC discovery document: {exc}") from exc

    return {
        "authorization_endpoint": data.get("authorization_endpoint"),
        "token_endpoint": data.get("token_endpoint"),
        "userinfo_endpoint": data.get("userinfo_endpoint"),
        "issuer": data.get("issuer"),
        "jwks_uri": data.get("jwks_uri"),
        "end_session_endpoint": data.get("end_session_endpoint"),
    }


def create_authlib_client(provider, encryption_key: str) -> OAuth:
    """
    Build a throwaway authlib ``OAuth`` registry with a single provider registration.

    ``provider`` is a ``SsoIdentityProviderModel`` (or any object with the same attributes).
    ``encryption_key`` is the Fernet key from ``SsoConfig`` used to decrypt
    ``client_secret_enc``.
    """
    client_secret = decrypt_value(provider.client_secret_enc, encryption_key)
    code = provider.provider_code
    if not client_secret:
        stored = (provider.client_secret_enc or "").strip()
        if not stored or stored.startswith("<"):
            raise SsoConfigError(
                f"SSO client secret for provider '{code}' is not configured. "
                "Set it via PATCH /sso-providers/{{id}} with client_secret."
            )
        raise SsoConfigError(
            f"Cannot decrypt SSO client secret for provider '{code}' "
            "(wrong encryption key or secret was encrypted on another environment).",
            http_status=500,
        )

    reg = OAuth()

    kwargs: dict = {
        "client_id": provider.client_id,
        "client_secret": client_secret,
        "client_kwargs": {
            "scope": provider.scopes or "openid profile email",
            "code_challenge_method": "S256",
            "timeout": 30,
        },
    }

    if provider.well_known_uri:
        kwargs["server_metadata_url"] = provider.well_known_uri
    else:
        if provider.authorization_endpoint:
            kwargs["authorize_url"] = provider.authorization_endpoint
        if provider.token_endpoint:
            kwargs["access_token_url"] = provider.token_endpoint
        if provider.userinfo_endpoint:
            kwargs["userinfo_endpoint"] = provider.userinfo_endpoint
        if provider.jwks_uri:
            kwargs["jwks_uri"] = provider.jwks_uri

        metadata: dict[str, str] = {}
        if provider.issuer:
            metadata["issuer"] = provider.issuer
        else:
            logger.warning(
                "SSO provider '%s' has no issuer configured — "
                "id_token iss claim will NOT be validated",
                code,
            )
        if provider.jwks_uri:
            metadata["jwks_uri"] = provider.jwks_uri
        if provider.token_endpoint:
            metadata["token_endpoint"] = provider.token_endpoint
        if provider.authorization_endpoint:
            metadata["authorization_endpoint"] = provider.authorization_endpoint
        if provider.userinfo_endpoint:
            metadata["userinfo_endpoint"] = provider.userinfo_endpoint
        if metadata:
            kwargs["server_metadata"] = metadata

    reg.register(name=code, **kwargs)
    return reg
