"""
App DB dependencies for dependency injection.
"""
from typing import List, Optional

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from apps.shared.config.config import settings
from apps.shared.config.dependencies import get_db
from apps.shared.config.security import decode_token

# auto_error=False so we can fall back to request.state for auto-inject clients
_bearer = HTTPBearer(auto_error=False)

_DM_DW_WORKFLOW_RESOURCE = "dm_dw_workflow"


def get_current_user_id(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> int:
    """
    Resolve the current user ID.

    Two paths:
    - JWT present: decode Bearer token and return jwt.sub (standard FED/user flow).
    - No JWT: read request.state.user_id set by AccessControlMiddleware for
      auto-inject clients (requires_user_auth=0). Raises 401 if neither is set.
    """
    if credentials is not None:
        payload = decode_token(credentials.credentials)
        return int(payload["sub"])
    user_id = getattr(request.state, "user_id", None)
    if user_id is not None:
        return int(user_id)
    raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_username(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[str]:
    """
    Resolve the current username.

    Returns the username from the JWT payload, or None for auto-inject clients
    (no JWT present). Callers that need a guaranteed username should use
    get_current_user_id and look up the user row directly.
    """
    if credentials is not None:
        payload = decode_token(credentials.credentials)
        return str(payload["username"])
    return None


def _get_default_locale_from_db() -> str:
    """
    Query system_language for the row marked is_default=True.
    Falls back to 'en' if no default is configured or the table is empty.
    """
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import SystemLanguage

    db = SessionLocal()
    try:
        row = (
            db.query(SystemLanguage)
            .filter(
                SystemLanguage.is_default.is_(True),
                SystemLanguage.is_deleted.is_(False),
            )
            .first()
        )
        return row.locale if row else "en"
    finally:
        db.close()


def get_app_key(request: Request) -> str:
    """
    Resolve app_key from request.state, set by AccessControlMiddleware after a
    successful X-Api-Key lookup. Falls back to settings.DEFAULT_APP_KEY when the
    header is absent (e.g. Swagger sessions that bypass app-client validation).
    """
    return getattr(request.state, "app_key", settings.DEFAULT_APP_KEY)


def get_is_super_admin(request: Request) -> bool:
    """
    Return True when the current caller is a super admin for the active app.

    AccessControlMiddleware sets request.state.is_super_admin after decoding
    the JWT and matching the active app_key against the token's
    super_admin_api_keys claim. Application-layer code uses this to bypass
    ownership, reviewer-eligibility, area-assignment, and reviewer-slice
    scope checks while leaving status / lifecycle rules intact.
    """
    return bool(getattr(request.state, "is_super_admin", False))


def get_scoped_dw_ids(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[List[int]]:
    """
    Return the DW IDs the current user is allowed to access, or None for super admins.

    - Decodes `dw_ids` and `super_admin_api_keys` from the JWT.
    - If the current api_key (from X-Api-Key header) is listed in `super_admin_api_keys`,
      the user is a super admin for this app and None is returned — callers must skip
      the DW filter entirely (show all warehouses).
    - Otherwise the list of dw_ids from the token is returned. An empty list means
      the user has no DW-specific role assignments and should see nothing.
    - For auto-inject clients (no JWT, requires_user_auth=0): returns None so the
      service account can access all warehouses without a DW-scoped token.
    """
    if credentials is None:
        # Auto-inject path: no JWT present. Return None (no DW filter) so the
        # external service account can operate across all warehouses.
        return None
    payload = decode_token(credentials.credentials)
    # super_admin_api_keys in the JWT now stores app_key values (e.g. "DFA_DM"),
    # so compare against request.state.app_key (set by middleware from the DB lookup),
    # not the raw X-Api-Key token which changes on rotation.
    current_app_key = getattr(request.state, "app_key", None)
    super_admin_api_keys: list[str] = payload.get("super_admin_api_keys", [])
    if current_app_key and current_app_key in super_admin_api_keys:
        return None  # super admin — no filter
    return payload.get("dw_ids", [])


def get_raw_api_key(request: Request) -> Optional[str]:
    """
    Return the raw X-Api-Key header value stored by AccessControlMiddleware,
    or None for Swagger sessions that bypass app-client validation.
    """
    return getattr(request.state, "api_key", None)


def get_core_locale(
    accept_language: Optional[str] = Header(
        None,
        alias="Accept-Language",
        description="Locale code for translations (e.g. en, fr, ar). When absent the system default from system_language is used.",
    ),
) -> str:
    """
    FastAPI dependency that resolves locale for core APIs.

    - If Accept-Language header is present it is normalised and returned.
    - If absent the default locale is resolved from the system_language table
      (the row with is_default=True), falling back to 'en' if none is set.
    """
    if not accept_language:
        return _get_default_locale_from_db()
    from apps.shared.utils.validators import normalize_language_code
    return normalize_language_code(accept_language)


def get_scoped_workflow_ids(
    request: Request,
    dw_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[List[int]]:
    """
    Return workflow IDs the current user may list, or None for unrestricted access.

    - Auto-inject (no JWT) → None.
    - JWT super admin for current app_key → None.
    - User has READ on dm_dw_workflow for this dw_id (live IAM check) → None.
    - Otherwise sorted unique workflow_id values from the JWT `workflow` claim.
      An empty list means no workflow assignments — caller should return nothing.
    """
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    current_app_key = getattr(request.state, "app_key", None)
    super_admin_api_keys: list[str] = payload.get("super_admin_api_keys", [])
    if current_app_key and current_app_key in super_admin_api_keys:
        return None

    from apps.app_db.services.iam_role_service import IamRoleService

    if IamRoleService().user_has_dw_resource_permission(
        user_id,
        app_key,
        db,
        dw_id,
        _DM_DW_WORKFLOW_RESOURCE,
        permission="R",
        locale=locale,
    ):
        return None

    workflow_claim: dict = payload.get("workflow") or {}
    ids = sorted(
        {
            int(item["workflow_id"])
            for item in workflow_claim.values()
            if isinstance(item, dict) and item.get("workflow_id") is not None
        }
    )
    return ids
