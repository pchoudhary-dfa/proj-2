"""
FastAPI adapter — router factories and dependency placeholders.

The host mounts these routers and overrides ``get_sso_service`` via
``app.dependency_overrides``, exactly like the dfa-help-service pattern.
"""
from __future__ import annotations

import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import RedirectResponse

from ..core.claims import SsoClaimError
from ..core.discovery import SsoConfigError
from ..core.models import (
    SsoDiscoverResponse,
    SsoProviderCreate,
    SsoProviderDetail,
    SsoProviderUpdate,
)
from ..core.security import (
    decode_sso_flow_state,
    encode_sso_flow_state,
    validate_return_to,
)
from ..core.service import SsoService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dependency placeholders — host MUST override via app.dependency_overrides
# ---------------------------------------------------------------------------

def get_sso_service() -> SsoService:
    """
    FastAPI dependency placeholder.

    The host application MUST override this via ``app.dependency_overrides``
    to inject a properly wired ``SsoService`` instance.
    """
    raise RuntimeError(
        "SSO service not configured. "
        "Override get_sso_service via app.dependency_overrides."
    )


def get_sso_user_id() -> int:
    """
    FastAPI dependency placeholder for current authenticated user ID.

    The host application should override this for admin endpoints
    that need to track who created/modified provider records.
    """
    return 0


def is_sso_enabled() -> bool:
    """
    FastAPI dependency placeholder — the host MUST override this to read
    SSO_ENABLED from ``system_configuration`` at runtime.

    Returns ``True`` when SSO login is active, ``False`` otherwise.
    """
    return False


# ---------------------------------------------------------------------------
# Auth flow router — /auth/sso
# ---------------------------------------------------------------------------

def create_sso_auth_router() -> APIRouter:
    """
    Factory that returns the public SSO auth router.

    Endpoints:
      GET  /auth/sso/providers              — list active providers (login page)
      GET  /auth/sso/{provider_code}/redirect — start OIDC flow
      GET  /auth/sso/{provider_code}/callback — OIDC callback (creates login code)

    The ``/exchange`` and ``/logout`` endpoints remain in the host router because
    they depend on app-specific JWT minting, permissions, and token management.
    """
    router = APIRouter(prefix="/auth/sso", tags=["SSO"])

    @router.get("/providers")
    def list_providers(
        sso: SsoService = Depends(get_sso_service),
        sso_enabled: bool = Depends(is_sso_enabled),
    ):
        if not sso_enabled:
            raise SsoConfigError("SSO is not enabled")
        items = sso.get_active_providers()
        return {"success": True, "message": "SSO providers", "data": [i.model_dump() for i in items]}

    @router.get("/{provider_code}/redirect")
    async def sso_redirect(
        provider_code: str,
        request: Request,
        app_key: str | None = Query(None, description="Initiating application key (required)"),
        return_to: str | None = Query(
            None,
            description="Optional in-app path to return to after SSO login",
        ),
        sso: SsoService = Depends(get_sso_service),
    ):
        if not app_key:
            raise SsoConfigError(
                "app_key query parameter is required for SSO redirect"
            )

        app_check = sso.check_sso_enabled_for_app(app_key)
        if app_check is not None and not app_check:
            raise SsoConfigError("SSO is not enabled for this application")

        sso.resolve_callback_url(app_key)
        validated_return_to = validate_return_to(return_to) if return_to else None
        request.session["sso_app_key"] = app_key
        if validated_return_to:
            request.session["sso_return_to"] = validated_return_to

        provider = sso.get_provider_by_code(provider_code)
        registry = sso.create_authlib_client(provider)
        client = registry.create_client(provider.provider_code)

        redirect_uri = provider.redirect_uri
        if not redirect_uri:
            redirect_uri = str(request.url_for("sso_callback", provider_code=provider_code))

        flow_state = encode_sso_flow_state(
            sso._config.encryption_key,
            app_key,
            validated_return_to,
        )
        return await client.authorize_redirect(
            request, redirect_uri, state=flow_state
        )

    @router.get("/{provider_code}/callback", name="sso_callback")
    async def sso_callback(
        provider_code: str,
        request: Request,
        sso: SsoService = Depends(get_sso_service),
    ):
        # Read app_key from session (stored during redirect) before checking SSO enabled.
        # Callback is a browser redirect from IdP, so no X-Api-Key header is present.
        # We skip the is_sso_enabled dependency here and check manually after reading from session.
        ctx_app_key = request.session.get("sso_app_key")
        if ctx_app_key:
            # Use the config's sso_enabled_checker if available (set by host in main.py)
            if sso._config.sso_enabled_checker:
                app_sso_enabled = sso._config.sso_enabled_checker(ctx_app_key)
                if not app_sso_enabled:
                    raise SsoConfigError("SSO is not enabled for this application")
        
        provider = sso.get_provider_by_code(provider_code)
        registry = sso.create_authlib_client(provider)
        client = registry.create_client(provider.provider_code)

        try:
            token = await client.authorize_access_token(request)
        except Exception as exc:
            detail = str(exc) or type(exc).__name__
            logger.error(
                "SSO token exchange failed for %s: [%s] %s",
                provider_code, type(exc).__name__, detail, exc_info=True,
            )
            raise SsoConfigError(f"SSO token exchange failed: {detail}") from exc

        id_token_claims = token.get("userinfo") or {}
        SsoService.validate_issuer(id_token_claims, provider.issuer)

        # Always fetch from the UserInfo endpoint when one is configured.
        # token["userinfo"] only contains parsed id_token claims (iss, sub,
        # aud, exp, …) which lack profile/email fields on most IdPs.
        userinfo = None
        if provider.userinfo_endpoint:
            try:
                userinfo = await client.userinfo(token=token)
            except Exception as exc:
                logger.warning(
                    "SSO userinfo fetch failed for %s, falling back to id_token claims: %s",
                    provider_code, exc,
                )

        if not userinfo:
            userinfo = token.get("userinfo")

        if not userinfo:
            raise SsoConfigError("IdP returned empty userinfo")

        userinfo_dict = dict(userinfo)
        id_token_raw = (
            token.get("id_token")
            if isinstance(token, dict)
            else getattr(token, "get", lambda k: None)("id_token")
        )

        return_to = request.session.pop("sso_return_to", None)
        ctx_app_key = request.session.pop("sso_app_key", None)
        flow_ctx = decode_sso_flow_state(
            sso._config.encryption_key,
            request.query_params.get("state") or "",
        )
        if flow_ctx:
            ctx_app_key = ctx_app_key or flow_ctx.get("ak")
            return_to = return_to or flow_ctx.get("rt")
        provisioning_dw_id = None
        if sso._config.provisioning_dw_id_resolver:
            provisioning_dw_id = sso._config.provisioning_dw_id_resolver(
                return_to, ctx_app_key
            )

        _user_id, code = sso.handle_oidc_callback(
            provider,
            userinfo_dict,
            id_token_raw if isinstance(id_token_raw, str) else None,
            provisioning_dw_id=provisioning_dw_id,
            initiating_app_key=ctx_app_key,
        )

        sso.cleanup_expired_codes()
        frontend_url = sso.resolve_callback_url(ctx_app_key).rstrip("/")
        sep = "&" if "?" in frontend_url else "?"
        redirect_url = f"{frontend_url}{sep}code={code}"
        if return_to:
            redirect_url += f"&returnUrl={quote(return_to, safe='')}"

        return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

    return router


# ---------------------------------------------------------------------------
# Admin CRUD router — /sso-providers
# ---------------------------------------------------------------------------

def create_sso_admin_router() -> APIRouter:
    """
    Factory that returns the admin SSO provider CRUD router.

    The host mounts this and supplies ``user_id`` via its own
    dependency overrides on the individual endpoints.
    """
    router = APIRouter(prefix="/sso-providers", tags=["SSO Admin"])

    @router.get("")
    def admin_list_providers(
        sso: SsoService = Depends(get_sso_service),
    ):
        items = sso.admin_list_providers()
        return {"success": True, "message": "SSO providers", "data": [i.model_dump() for i in items]}

    @router.post("", status_code=status.HTTP_201_CREATED)
    def admin_create_provider(
        payload: SsoProviderCreate,
        sso: SsoService = Depends(get_sso_service),
        user_id: int = Depends(get_sso_user_id),
    ):
        detail = sso.admin_create_provider(payload.model_dump(), user_id)
        return {"success": True, "message": "SSO provider created", "data": detail.model_dump()}

    @router.get("/{nid}")
    def admin_get_provider(
        nid: int,
        sso: SsoService = Depends(get_sso_service),
    ):
        detail = sso.admin_get_provider(nid)
        return {"success": True, "message": "SSO provider detail", "data": detail.model_dump()}

    @router.patch("/{nid}")
    def admin_update_provider(
        nid: int,
        payload: SsoProviderUpdate,
        sso: SsoService = Depends(get_sso_service),
        user_id: int = Depends(get_sso_user_id),
    ):
        update_data = payload.model_dump(exclude_unset=True)
        detail = sso.admin_update_provider(nid, update_data, user_id)
        return {"success": True, "message": "SSO provider updated", "data": detail.model_dump()}

    @router.delete("/{nid}", status_code=status.HTTP_204_NO_CONTENT)
    def admin_delete_provider(
        nid: int,
        sso: SsoService = Depends(get_sso_service),
    ):
        sso.admin_delete_provider(nid)

    @router.post("/{nid}/discover")
    def admin_discover(
        nid: int,
        sso: SsoService = Depends(get_sso_service),
    ):
        provider = sso.get_provider_by_id(nid)
        if not provider.well_known_uri:
            raise SsoConfigError("Provider does not have a well_known_uri configured")
        result = sso.discover_endpoints(provider.well_known_uri)
        return {"success": True, "message": "OIDC endpoints discovered", "data": result.model_dump()}

    return router
