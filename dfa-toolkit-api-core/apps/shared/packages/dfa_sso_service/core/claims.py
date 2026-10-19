"""
Attribute mapping and issuer normalization utilities.
"""
from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


def normalize_issuer(issuer: str) -> str:
    """Strip trailing slashes so ``https://idp.example.com/`` equals ``https://idp.example.com``."""
    return issuer.rstrip("/")


DEFAULT_ATTRIBUTE_MAP: dict[str, str] = {
    "idp_user_id": "sub",
    "email": "email",
    "first_name": "given_name",
    "last_name": "family_name",
    "username": "preferred_username",
}


class SsoClaimError(Exception):
    """Raised when required claims are missing from IdP response."""

    def __init__(
        self,
        message: str,
        *,
        http_status: int = 400,
        error_code: str = "SSO_CLAIM_ERROR",
    ) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.error_code = error_code


def apply_attribute_map(attribute_map_json: str | None, claims: dict) -> dict:
    """
    Apply a provider's attribute_map (JSON string) to raw IdP claims.

    Returns a dict with keys: ``idp_user_id``, ``email``, ``first_name``,
    ``last_name``, ``username``.  Falls back to ``DEFAULT_ATTRIBUTE_MAP``
    for unmapped fields.

    Raises ``SsoClaimError`` if the required ``sub`` (idp_user_id) claim
    is missing.
    """
    mapping = dict(DEFAULT_ATTRIBUTE_MAP)
    if attribute_map_json:
        try:
            custom = json.loads(attribute_map_json)
            mapping.update(custom)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Invalid attribute_map JSON, using defaults")

    result: dict = {}
    for local_key, idp_claim in mapping.items():
        result[local_key] = claims.get(idp_claim)

    if not result.get("idp_user_id"):
        raise SsoClaimError("IdP did not return a 'sub' (subject) claim")

    # Drupal sends "name" (display name) instead of OIDC "given_name".
    # Use it as first_name fallback so auto-provisioned users get a real name.
    if not result.get("first_name") and claims.get("name"):
        result["first_name"] = claims["name"]

    if not result.get("username") and result.get("email"):
        result["username"] = result["email"]

    return result
