"""
IdP logout URL builder — standard OIDC RP-Initiated Logout or custom fallback.
"""
from __future__ import annotations

from urllib.parse import urlencode


def build_idp_logout_url(
    provider,
    id_token_raw: str | None = None,
) -> str | None:
    """
    Build the IdP logout URL.

    Tries standard ``end_session_endpoint`` first (with ``id_token_hint``
    and ``client_id``), then falls back to custom ``logout_uri``.
    Returns ``None`` if neither is configured.

    ``provider`` is a ``SsoIdentityProviderModel`` (or any object with the same attributes).
    """
    if provider.end_session_endpoint:
        params: dict[str, str] = {"client_id": provider.client_id}
        if id_token_raw:
            params["id_token_hint"] = id_token_raw
        return f"{provider.end_session_endpoint}?{urlencode(params)}"

    if provider.logout_uri:
        return provider.logout_uri.rstrip("/")

    return None
