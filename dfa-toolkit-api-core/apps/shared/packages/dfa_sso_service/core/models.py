"""
Pydantic DTOs used across the SSO package — request/response shapes, internal data transfer.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# User profile exchanged via SsoUserProvider callbacks
# ---------------------------------------------------------------------------

class SsoUserProfile(BaseModel):
    """Data the package passes to ``SsoUserProvider.create_user()``."""
    idp_user_id: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    provider_code: str
    status: int = 1
    email_verified: int = 1


# ---------------------------------------------------------------------------
# Login-code exchange result
# ---------------------------------------------------------------------------

class SsoExchangeResult(BaseModel):
    """Returned by ``SsoService.consume_login_code()`` to the host's /exchange endpoint."""
    user_id: int
    sso_session_id: int
    sso_provider_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Provider list item (no secrets — for login page)
# ---------------------------------------------------------------------------

class SsoProviderListItem(BaseModel):
    provider_code: str
    display_name: str


# ---------------------------------------------------------------------------
# Admin CRUD schemas
# ---------------------------------------------------------------------------

class SsoProviderCreate(BaseModel):
    provider_code: str = Field(..., max_length=20, description="Unique machine key (e.g. drupal, google)")
    name: str = Field(..., max_length=100, description="Display name (e.g. Drupal CMS, Google)")
    client_id: Optional[str] = Field(None, max_length=255)
    client_secret: Optional[str] = Field(None, description="Plaintext — encrypted before storage")

    well_known_uri: Optional[str] = None
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    issuer: Optional[str] = None
    jwks_uri: Optional[str] = None
    redirect_uri: Optional[str] = None
    end_session_endpoint: Optional[str] = None
    logout_uri: Optional[str] = None

    idp_entity_id: Optional[str] = None
    idp_sso_url: Optional[str] = None
    idp_certificate: Optional[str] = None

    scopes: str = "openid profile email"
    attribute_map: Optional[str] = Field(None, description="JSON mapping IdP claims to user fields")
    auto_provision_users: int = 0
    default_role_id: Optional[int] = None
    is_active: int = 1


class SsoProviderUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = Field(None, description="Omit to keep current; plaintext to update")

    well_known_uri: Optional[str] = None
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    issuer: Optional[str] = None
    jwks_uri: Optional[str] = None
    redirect_uri: Optional[str] = None
    end_session_endpoint: Optional[str] = None
    logout_uri: Optional[str] = None

    idp_entity_id: Optional[str] = None
    idp_sso_url: Optional[str] = None
    idp_certificate: Optional[str] = None

    scopes: Optional[str] = None
    attribute_map: Optional[str] = None
    auto_provision_users: Optional[int] = None
    default_role_id: Optional[int] = None
    is_active: Optional[int] = None


class SsoProviderDetail(BaseModel):
    """Admin read — every column except the encrypted secret."""
    id: int
    provider_code: str
    name: str
    client_id: Optional[str] = None

    well_known_uri: Optional[str] = None
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    issuer: Optional[str] = None
    jwks_uri: Optional[str] = None
    redirect_uri: Optional[str] = None
    end_session_endpoint: Optional[str] = None
    logout_uri: Optional[str] = None

    idp_entity_id: Optional[str] = None
    idp_sso_url: Optional[str] = None
    idp_certificate: Optional[str] = None

    scopes: Optional[str] = None
    attribute_map: Optional[str] = None
    auto_provision_users: int = 0
    default_role_id: Optional[int] = None
    is_active: int = 1


# ---------------------------------------------------------------------------
# SSO exchange request (from frontend)
# ---------------------------------------------------------------------------

class SsoExchangeRequest(BaseModel):
    code: str


# ---------------------------------------------------------------------------
# OIDC discovery response
# ---------------------------------------------------------------------------

class SsoDiscoverResponse(BaseModel):
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    issuer: Optional[str] = None
    jwks_uri: Optional[str] = None
    end_session_endpoint: Optional[str] = None
