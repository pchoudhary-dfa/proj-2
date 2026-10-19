"""
SsoService — the main orchestrator for SSO authentication flows.

This is the single entry point for the host application.  It delegates
persistence to ``SsoStorage``, user operations to ``SsoUserProvider``,
and OIDC mechanics to the ``discovery`` / ``claims`` / ``logout`` helpers.
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets
from datetime import datetime, timezone

from .claims import SsoClaimError, apply_attribute_map, normalize_issuer
from .config import SsoConfig
from .crypto import decrypt_value, encrypt_value
from .discovery import SsoConfigError, create_authlib_client, discover_endpoints
from .logout import build_idp_logout_url
from .models import (
    SsoDiscoverResponse,
    SsoExchangeResult,
    SsoProviderDetail,
    SsoProviderListItem,
    SsoUserProfile,
)
from ..providers.base import SsoUserProvider
from ..storage.base import SsoStorage

logger = logging.getLogger(__name__)


def _provider_to_detail(provider) -> dict:
    """Build admin API payload from a merged provider row."""
    return {
        "id": provider.id,
        "provider_code": provider.provider_code,
        "name": provider.name,
        "client_id": provider.client_id,
        "well_known_uri": provider.well_known_uri,
        "authorization_endpoint": provider.authorization_endpoint,
        "token_endpoint": provider.token_endpoint,
        "userinfo_endpoint": provider.userinfo_endpoint,
        "issuer": provider.issuer,
        "jwks_uri": provider.jwks_uri,
        "redirect_uri": provider.redirect_uri,
        "end_session_endpoint": provider.end_session_endpoint,
        "logout_uri": provider.logout_uri,
        "idp_entity_id": provider.idp_entity_id,
        "idp_sso_url": provider.idp_sso_url,
        "idp_certificate": provider.idp_certificate,
        "scopes": provider.scopes,
        "attribute_map": provider.attribute_map,
        "auto_provision_users": provider.auto_provision_users,
        "default_role_id": provider.default_role_id,
        "is_active": provider.is_active,
    }


class SsoService:
    """
    Stateless service — instantiated per-request with injected storage,
    user provider, and config.
    """

    def __init__(
        self,
        storage: SsoStorage,
        user_provider: SsoUserProvider,
        config: SsoConfig,
    ):
        self._storage = storage
        self._users = user_provider
        self._config = config

    # ── Provider queries ──────────────────────────────────────────────────

    def get_active_providers(self) -> list[SsoProviderListItem]:
        rows = self._storage.get_active_providers()
        return [
            SsoProviderListItem(
                provider_code=r.provider_code,
                display_name=r.name,
            )
            for r in rows
        ]

    def get_provider_by_code(self, provider_code: str):
        provider = self._storage.get_provider_by_code(provider_code)
        if provider is None:
            raise SsoConfigError(f"SSO provider '{provider_code}' not found or inactive")
        return provider

    def get_provider_by_id(self, nid: int):
        provider = self._storage.get_provider_by_id(nid)
        if provider is None:
            raise SsoConfigError(f"SSO provider id={nid} not found")
        return provider

    # ── Authlib client ────────────────────────────────────────────────────

    def create_authlib_client(self, provider):
        return create_authlib_client(provider, self._config.encryption_key)

    # ── OIDC callback processing ─────────────────────────────────────────

    def handle_oidc_callback(
        self,
        provider,
        userinfo_dict: dict,
        id_token_raw: str | None,
        provisioning_dw_id: int | None = None,
        initiating_app_key: str | None = None,
    ) -> tuple[int, str]:
        """
        Process the OIDC callback: map claims, resolve/provision the user,
        create a login code + SSO session, and return ``(user_id, login_code)``.
        """
        mapped = apply_attribute_map(provider.attribute_map, userinfo_dict)
        idp_user_id = mapped["idp_user_id"]
        provider_code = provider.provider_code

        user_id = self._resolve_or_provision_user(
            provider,
            provider_code,
            idp_user_id,
            mapped,
            userinfo_dict,
            provisioning_dw_id=provisioning_dw_id,
            initiating_app_key=initiating_app_key,
        )

        encrypted_id_token = (
            encrypt_value(id_token_raw, self._config.encryption_key)
            if id_token_raw
            else None
        )

        self._storage.create_sso_session(
            user_id=user_id,
            sso_provider_id=provider.id,
            id_token_enc=encrypted_id_token,
        )

        code = self._create_login_code(
            user_id=user_id,
            sso_provider_id=provider.id,
        )

        return user_id, code

    def _maybe_assign_default_role(
        self,
        user_id: int,
        provider,
        initiating_app_key: str | None,
        provisioning_dw_id: int | None,
    ) -> None:
        if not provider.default_role_id:
            return
        if self._users.user_has_role_for_app(user_id, initiating_app_key):
            return
        self._users.assign_default_role(
            user_id,
            provider.default_role_id,
            provisioning_dw_id,
        )

    def maybe_assign_default_role_on_exchange(
        self,
        user_id: int,
        sso_provider_id: int | None,
        initiating_app_key: str | None,
        return_path: str | None,
    ) -> None:
        """
        Assign default role at SSO code exchange when the client supplies return_path.

        When *return_path* yields a warehouse id, assigns a dw-scoped row even if the
        user already has a global (dw_id=NULL) app role from an earlier callback pass.
        """
        if not sso_provider_id or not initiating_app_key:
            return
        provider = self._storage.get_provider_by_id(sso_provider_id)
        if not provider or not provider.default_role_id:
            return

        provisioning_dw_id = None
        if self._config.provisioning_dw_id_resolver and return_path:
            provisioning_dw_id = self._config.provisioning_dw_id_resolver(
                return_path, initiating_app_key
            )

        if provisioning_dw_id is not None:
            if self._users.user_has_dw_scoped_role_for_app(
                user_id, initiating_app_key, provisioning_dw_id
            ):
                return
            self._users.assign_default_role(
                user_id,
                provider.default_role_id,
                provisioning_dw_id,
            )
            return

        self._maybe_assign_default_role(
            user_id,
            provider,
            initiating_app_key,
            provisioning_dw_id,
        )

    def _resolve_or_provision_user(
        self,
        provider,
        provider_code: str,
        idp_user_id: str,
        mapped: dict,
        raw_claims: dict,
        provisioning_dw_id: int | None = None,
        initiating_app_key: str | None = None,
    ) -> int:
        """Lookup existing identity or auto-provision a new user via callbacks."""
        identity = self._storage.find_identity(provider_code, idp_user_id)

        if identity:
            if not self._users.is_user_active(identity.user_id):
                raise SsoClaimError("User account is inactive")
            self._storage.update_identity_claims(
                identity,
                email=mapped.get("email"),
                raw_claims=json.dumps(raw_claims) if raw_claims else None,
            )
            self._maybe_assign_default_role(
                identity.user_id,
                provider,
                initiating_app_key,
                provisioning_dw_id,
            )
            return identity.user_id

        if not provider.auto_provision_users:
            raise SsoClaimError(
                "No account linked to this SSO identity and auto-provisioning is disabled. "
                "Contact your administrator."
            )

        email = mapped.get("email")
        user_id = self._users.find_user_by_email(email) if email else None

        if user_id is None:
            profile = SsoUserProfile(
                idp_user_id=idp_user_id,
                email=email or f"{idp_user_id}@sso.local",
                first_name=mapped.get("first_name") or "SSO",
                last_name=mapped.get("last_name"),
                username=mapped.get("username") or idp_user_id,
                provider_code=provider_code,
                status=1,
                email_verified=1,
            )
            user_id = self._users.create_user(profile)
        else:
            if not self._users.is_user_active(user_id):
                raise SsoClaimError("User account is inactive")

        claims_json = json.dumps(raw_claims) if raw_claims else None
        self._storage.create_identity(
            user_id=user_id,
            provider_code=provider_code,
            idp_user_id=idp_user_id,
            email=email,
            raw_claims=claims_json,
        )
        self._maybe_assign_default_role(
            user_id,
            provider,
            initiating_app_key,
            provisioning_dw_id,
        )
        return user_id

    def _create_login_code(
        self,
        user_id: int,
        sso_provider_id: int | None,
    ) -> str:
        raw_code = secrets.token_urlsafe(48)
        code_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
        self._storage.create_login_code(
            code_hash=code_hash,
            user_id=user_id,
            sso_provider_id=sso_provider_id,
        )
        return raw_code

    # ── Login-code exchange ───────────────────────────────────────────────

    def consume_login_code(self, raw_code: str) -> SsoExchangeResult:
        """
        Validate + consume a one-time login code.

        Returns ``SsoExchangeResult`` with ``user_id`` and ``sso_session_id``
        so the host can build its own JWT + permissions.
        """
        code_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
        row = self._storage.get_login_code(code_hash)
        if row is None:
            raise SsoClaimError("Invalid or expired SSO login code")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if row.is_used:
            raise SsoClaimError("SSO login code has already been used")
        if row.expires_at < now:
            raise SsoClaimError("SSO login code has expired")

        self._storage.mark_login_code_used(row)

        if not self._users.is_user_active(row.user_id):
            raise SsoClaimError("User account is inactive or not found")

        session = self._storage.get_active_sso_session(row.user_id)
        sso_session_id = session.id if session else 0

        return SsoExchangeResult(
            user_id=row.user_id,
            sso_session_id=sso_session_id,
            sso_provider_id=row.sso_provider_id,
        )

    def cleanup_expired_codes(self) -> int:
        return self._storage.cleanup_expired_codes()

    # ── Issuer validation helper ──────────────────────────────────────────

    @staticmethod
    def validate_issuer(token_claims: dict, expected_issuer: str | None) -> None:
        if not expected_issuer:
            return

        token_iss = (
            token_claims.get("iss")
            if isinstance(token_claims, dict)
            else getattr(token_claims, "get", lambda k: None)("iss")
        )
        if not token_iss:
            raise SsoClaimError(
                "id_token is missing required 'iss' claim"
            )
        if normalize_issuer(token_iss) != normalize_issuer(expected_issuer):
            logger.error(
                "id_token issuer mismatch: expected '%s', got '%s'",
                expected_issuer, token_iss,
            )
            raise SsoClaimError(
                f"id_token issuer mismatch: expected '{expected_issuer}', got '{token_iss}'"
            )

    # ── Logout ────────────────────────────────────────────────────────────

    def get_logout_url(self, user_id: int) -> str | None:
        session = self._storage.get_active_sso_session(user_id)
        if session is None:
            return None

        provider = self._storage.get_provider_by_id(session.sso_provider_id)
        if provider is None:
            return None

        id_token_plain = (
            decrypt_value(session.id_token_enc, self._config.encryption_key)
            if session.id_token_enc
            else None
        )

        return build_idp_logout_url(provider, id_token_raw=id_token_plain or None)

    def deactivate_sso_sessions(self, user_id: int) -> None:
        """Mark all SSO sessions for this user as inactive (called on logout)."""
        self._storage.deactivate_sso_sessions(user_id)

    # ── OIDC discovery ────────────────────────────────────────────────────

    def discover_endpoints(self, well_known_uri: str) -> SsoDiscoverResponse:
        data = discover_endpoints(well_known_uri)
        return SsoDiscoverResponse(**data)

    # ── Admin CRUD ────────────────────────────────────────────────────────

    def admin_create_provider(self, data: dict, user_id: int) -> SsoProviderDetail:
        plain_secret = data.pop("client_secret", None)
        if plain_secret:
            data["client_secret_enc"] = encrypt_value(plain_secret, self._config.encryption_key)
        provider = self._storage.create_provider(data, user_id)
        return SsoProviderDetail(**_provider_to_detail(provider))

    def admin_update_provider(self, nid: int, data: dict, user_id: int) -> SsoProviderDetail:
        provider = self.get_provider_by_id(nid)
        plain_secret = data.pop("client_secret", None)
        if plain_secret is not None:
            data["client_secret_enc"] = encrypt_value(plain_secret, self._config.encryption_key)
        updated = self._storage.update_provider(provider, data, user_id)
        return SsoProviderDetail(**_provider_to_detail(updated))

    def admin_delete_provider(self, nid: int) -> None:
        provider = self.get_provider_by_id(nid)
        self._storage.delete_provider(provider)

    def admin_get_provider(self, nid: int) -> SsoProviderDetail:
        provider = self.get_provider_by_id(nid)
        return SsoProviderDetail(**_provider_to_detail(provider))

    def admin_list_providers(self) -> list[SsoProviderDetail]:
        rows = self._storage.list_all_providers()
        return [SsoProviderDetail(**_provider_to_detail(r)) for r in rows]

    # ── Config accessors ─────────────────────────────────────────────────

    def resolve_callback_url(self, app_key: str | None) -> str:
        """Resolve frontend callback URL for the given *app_key*.

        Raises ``SsoConfigError`` when *app_key* is missing, no resolver is
        configured, or the resolver returns an empty string.
        """
        from .discovery import SsoConfigError

        if not app_key:
            raise SsoConfigError(
                "SSO callback routing requires an initiating app_key "
                "(pass ?app_key= on the redirect URL)"
            )
        if not self._config.callback_url_resolver:
            raise SsoConfigError("SSO callback URL resolver is not configured")
        url = self._config.callback_url_resolver(app_key)
        if not url:
            raise SsoConfigError(
                f"Could not resolve SSO callback URL for app_key '{app_key}'"
            )
        from .security import validate_redirect_url

        return validate_redirect_url(url)

    def check_sso_enabled_for_app(self, app_key: str | None) -> bool | None:
        """Check ``SSO_ENABLED`` for a specific *app_key*.

        Returns ``None`` when no checker is configured — the caller should
        fall back to the existing ``is_sso_enabled`` dependency (which uses
        the request-scoped ``DEFAULT_APP_KEY``).
        """
        if app_key and self._config.sso_enabled_checker:
            return self._config.sso_enabled_checker(app_key)
        return None
