"""
Access control middleware.

Resolves the access level for each incoming request from `iam_resource_api`,
scoped by the caller's `app_key` (from `X-Api-Key` → `system_application_client`).

    PUBLIC        — no auth required, pass through
    APP_CLIENT    — valid SIGNATURE app client required
    AUTHENTICATED — valid SIGNATURE app client + user JWT required
    PERMISSION    — valid SIGNATURE app client + user JWT + IAM role check required

Route resolution (Approach #2):
    1. Ask the FastAPI/Starlette router which route matches the request.
    2. Use that route's path *template* (e.g. ``/dash/{dashboard_id}``,
       ``/dash/themes``) — not the raw URL.
    3. Exact-lookup ``iam_resource_api`` by ``(http_method, backend_endpoint)``.

This avoids ambiguous regex matches (e.g. ``/dash/themes`` vs ``/dash/{dashboard_id}``).

The same HTTP path template may be registered for multiple applications with different
`access_level` values. If the path exists in IAM but not for the caller's
`app_key`, the request is rejected with 403.

App client authentication (SIGNATURE method):
    - Client sends X-Api-Key, X-Api-Timestamp, X-Api-Signature on every request.
    - Timestamp must be within ±5 minutes of server time (replay prevention).
    - string_to_sign = "<METHOD>\\n<PATH_WITH_QUERY>\\n<X-Api-Timestamp>"
    - Signature is verified against the stored Ed25519 or RSA-SHA256 public key.
    - FED origin_url / Origin header check is disabled (see _validate_app_client).
    - Clients with allowed_ips set must call from a matching IP.

PERMISSION role check:
    - Users whose JWT lists the current app_key in super_admin_api_keys bypass the check.
    - Otherwise an EXISTS query against iam_user_role ⋈ iam_role_resource_api confirms
      that the user holds a role granting access to the matched resource_api_id,
      scoped by iam_user_role.app_key (matching the requesting client application).
    - For DW-scoped routes (/dw/{dw_id}/...) the user's role assignment must match
      that exact dw_id. For routes without /dw/{id}/, iam_resource.is_dw_spec=0 allows
      any assignment (warehouse-scoped or global); is_dw_spec=1 still requires dw_id IS NULL.

Unknown routes (not matched by FastAPI, or not found in iam_resource_api) → 403 Forbidden.
Unknown (path, app_key) pair → 403 Forbidden (distinct message).
Internal / framework paths (/docs, /health, etc.) are always skipped.

Deny responses are logged via ``log_event`` (stdout + optional ``logs_server_error``
when ``DB_LOG_LEVELS`` includes the resolved level from ``resolve_log_level``).
For 401/403 that level is WARNING; typical ``DB_LOG_LEVELS=ERROR,CRITICAL,INFO`` does
not include WARNING — add ``WARNING`` (or adjust levels in ``log_payload``) if you
need these rows in the database.
"""
import base64
import logging
import re
import threading
import time
from typing import Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Match

from apps.shared.config.config import settings
from apps.shared.config.security import decode_token
from apps.shared.middleware.request_context import dbmetadata_published_by
from apps.shared.utils.log_event import log_event
from apps.shared.utils.log_payload import build_log_payload, resolve_log_level

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths that bypass access control entirely
# ---------------------------------------------------------------------------

_SKIP_EXACT: frozenset[str] = frozenset({
    "/",
    "/health",
    "/openapi.json",
    "/auth/swagger-login",
})

_SKIP_PREFIXES: tuple[str, ...] = (
    "/docs",
    "/redoc"
)

# ---------------------------------------------------------------------------
# Route cache — keyed by (http_method, backend_endpoint template)
# value: list of (app_key, access_level, resource_api_id, is_dash_spec)
# ---------------------------------------------------------------------------

_RouteCache = dict[tuple[str, str], list[tuple[str, str, int, int]]]

_cache: Optional[_RouteCache] = None
_cache_lock = threading.Lock()


def _load_route_cache() -> _RouteCache:
    """Query iam_resource_api (+ iam_resource) and build an exact-match map by method + path template."""
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import IamResource, IamResourceApi

    db = SessionLocal()
    try:
        rows = (
            db.query(
                IamResourceApi.http_method,
                IamResourceApi.backend_endpoint,
                IamResourceApi.access_level,
                IamResourceApi.app_key,
                IamResourceApi.id,
                IamResource.is_dash_spec,
            )
            .join(IamResource, IamResource.id == IamResourceApi.resource_id)
            .filter(IamResourceApi.is_active == 1)
            .all()
        )
        cache: _RouteCache = {}
        for row in rows:
            key = (row.http_method.upper(), row.backend_endpoint)
            cache.setdefault(key, []).append(
                (
                    row.app_key,
                    row.access_level or "PERMISSION",
                    row.id,
                    int(row.is_dash_spec or 0),
                )
            )
        return cache
    finally:
        db.close()


def _get_cache() -> _RouteCache:
    """Return the cached route map, loading it on the first call.

    When ENABLE_ROUTE_CACHE=false (default) the cache is bypassed and routes are
    reloaded from the DB on every request (useful during active seeding/dev).
    """
    if not settings.ENABLE_ROUTE_CACHE:
        return _load_route_cache()
    global _cache
    if _cache is None:
        with _cache_lock:
            if _cache is None:
                _cache = _load_route_cache()
    return _cache


def invalidate_cache() -> None:
    """Force a cache reload on the next request (call after seeding / migrations)."""
    global _cache
    with _cache_lock:
        _cache = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_path_template(path: str) -> str:
    """
    Strip FastAPI/Starlette path convertors so IAM seeds can use plain ``{param}``.

    Example: ``/dfa-mailer/logs/{log_id:int}`` → ``/dfa-mailer/logs/{log_id}``.
    """
    return re.sub(r"\{([^}:]+)(?::[^}]+)?\}", r"{\1}", path)


def _resolve_route_template(request: Request) -> Optional[str]:
    """
    Return the FastAPI/Starlette path template for this request.

    Example: ``/dash/5`` → ``/dash/{dashboard_id}``; ``/dash/themes`` → ``/dash/themes``.
    Typed convertors are stripped (``{log_id:int}`` → ``{log_id}``) to match IAM seed form.
    Returns None when no application route matches.
    """

    def _walk(routes, scope) -> Optional[str]:
        for route in routes:
            match, child_scope = route.matches(scope)
            if match == Match.NONE:
                continue

            nested = getattr(route, "routes", None)
            if nested is not None and match in (Match.PARTIAL, Match.FULL):
                found = _walk(nested, child_scope)
                if found is not None:
                    return found

            if match == Match.FULL:
                path = getattr(route, "path", None)
                if isinstance(path, str) and path:
                    return _normalize_path_template(path)
        return None

    return _walk(request.app.routes, request.scope)


def _matches_for_path(method: str, path_template: str) -> list[tuple[str, str, int, int]]:
    """
    Return (app_key, access_level, resource_api_id, is_dash_spec) for IAM rows with this
    exact ``(method, backend_endpoint)`` template.

    ``path_template`` must be the router-resolved path (e.g. ``/dash/themes``),
    not the raw request URL.
    """
    return list(_get_cache().get((method, path_template), []))


def _resolve_access_level_for_app(
    matches: list[tuple[str, str, int, int]], app_key: str
) -> Optional[tuple[str, int, int]]:
    """Return (access_level, resource_api_id, is_dash_spec) for the given app_key among matches, or None."""
    for ak, lvl, rid, is_dash_spec in matches:
        if ak == app_key:
            return (lvl, rid, is_dash_spec)
    return None


def _extract_bearer(request: Request) -> Optional[str]:
    """Extract the raw JWT from the Authorization header or ``dfa_access`` cookie, or None."""
    auth: str = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    cookie_token = request.cookies.get("dfa_access")
    if cookie_token:
        return cookie_token.strip()
    return None


# ---------------------------------------------------------------------------
# DW ID / Dashboard ID extractors & permission checks
# ---------------------------------------------------------------------------

_DW_ID_RE = re.compile(r"/dw/(\d+)(?:/|$)")
_DASH_ID_RE = re.compile(r"/dash/(\d+)(?:/|$)")


def _extract_dw_id_from_path(path: str) -> Optional[int]:
    """Return the numeric dw_id segment from a DW-scoped path, or None for global routes."""
    m = _DW_ID_RE.search(path)
    return int(m.group(1)) if m else None


def _extract_dashboard_id_from_path(path: str, path_template: str) -> Optional[int]:
    """Return dashboard_id from path only when the route template contains {dashboard_id}.

    Uses the resolved template (e.g. ``/dash/{dashboard_id}/vis``) to avoid false
    positives on static segments like ``/dash/themes`` or ``/dash/media``.
    """
    if "{dashboard_id}" not in path_template:
        return None
    m = _DASH_ID_RE.search(path)
    return int(m.group(1)) if m else None


def _acl_dashboard_ids_for_path(db, path_dashboard_id: int) -> list[int]:
    """
    Dashboard ids whose ``iam_user_role`` rows authorize a path ``dashboard_id``.

    ACL is owned by the edit-mode dashboard. Publish clones share that ACL via
    ``source_dash_id`` (same idea as private viewer allowlisting). Accept either:

    - assignment on the edit id (``source_dash_id``), or
    - assignment on the publish id itself (if any).

    Missing / non-publish rows fall back to the path id alone.
    """
    from apps.app_dashboard.constants import DASHBOARD_MODE_PUBLISH
    from apps.app_dashboard.models.dashboard import Dashboard

    row = (
        db.query(Dashboard.mode, Dashboard.source_dash_id)
        .filter(Dashboard.id == path_dashboard_id)
        .first()
    )
    if not row:
        return [path_dashboard_id]

    mode, source_dash_id = row[0], row[1]
    if mode == DASHBOARD_MODE_PUBLISH and source_dash_id:
        edit_id = int(source_dash_id)
        if edit_id != path_dashboard_id:
            return [path_dashboard_id, edit_id]
    return [path_dashboard_id]


def _user_has_permission(
    user_id: int,
    resource_api_id: int,
    path_dw_id: Optional[int],
    path_dashboard_id: Optional[int],
    app_key: str,
    is_dash_spec: int,
) -> bool:
    """
    Return True if the user holds at least one role that grants access to resource_api_id.

    Scoping mirrors ``IamRoleService._compute_app_permissions``:

    - ``is_dash_spec=1``: dashboard-scoped resource.
      ``path_dashboard_id`` present → assignment must match an ACL dashboard id for
      that path (edit ``source_dash_id`` and/or the path id when mode=publish).
      ``path_dashboard_id`` absent  → deny (fail closed; dash-spec API must carry dashboard in path).
    - ``is_dash_spec=0``: app-level or DW-level resource — existing DW-based logic applies.
      ``path_dw_id`` set   → assignment ``dw_id`` must match **or** be NULL (global).
      ``path_dw_id`` None  → ``is_dw_spec == 0`` accepts any assignment; otherwise ``dw_id IS NULL``.
    - ``app_key`` always scopes ``iam_user_role`` rows to the requesting application.
    """
    from sqlalchemy import or_

    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import (
        IamResource,
        IamResourceApi,
        IamRoleResourceApi,
        IamUserRole,
    )

    # Dashboard-spec resource without a dashboard in the path — deny.
    if is_dash_spec and path_dashboard_id is None:
        return False

    db = SessionLocal()
    try:
        q = (
            db.query(IamUserRole.id)
            .join(IamRoleResourceApi, IamRoleResourceApi.role_id == IamUserRole.role_id)
            .join(IamResourceApi, IamResourceApi.id == IamRoleResourceApi.resource_api_id)
            .join(IamResource, IamResource.id == IamResourceApi.resource_id)
            .filter(
                IamUserRole.user_id == user_id,
                IamUserRole.app_key == app_key,
                IamRoleResourceApi.resource_api_id == resource_api_id,
            )
        )

        if is_dash_spec:
            # Publish path → also accept edit-dashboard assignment (source_dash_id).
            acl_ids = _acl_dashboard_ids_for_path(db, path_dashboard_id)
            q = q.filter(IamUserRole.dashboard_id.in_(acl_ids))
        elif path_dw_id is not None:
            q = q.filter(
                or_(
                    IamUserRole.dw_id == path_dw_id,
                    IamUserRole.dw_id.is_(None),
                )
            )
        else:
            q = q.filter(or_(IamResource.is_dw_spec == 0, IamUserRole.dw_id.is_(None)))

        return db.query(q.exists()).scalar()
    finally:
        db.close()


def _role_has_permission(
    role_id: int,
    resource_api_id: int,
    path_dw_id: Optional[int],
) -> bool:
    """
    Return True if role_id directly grants access to resource_api_id.

    Used for auto-inject clients (requires_user_auth=0) where there is no user→role
    join — the role is taken directly from system_application_client.default_role_id.
    DW-scoped path filtering is intentionally skipped: the external client role covers
    all warehouses it is configured for.
    """
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import IamRoleResourceApi

    db = SessionLocal()
    try:
        q = (
            db.query(IamRoleResourceApi.id)
            .filter(
                IamRoleResourceApi.role_id == role_id,
                IamRoleResourceApi.resource_api_id == resource_api_id,
            )
        )
        return db.query(q.exists()).scalar()
    finally:
        db.close()


def _access_denial_response(
    request: Request,
    *,
    status_code: int,
    err_message: str,
    error_code: str,
) -> JSONResponse:
    """Log through ``log_event`` then return the same envelope as legacy middleware errors."""
    payload = build_log_payload(
        request=request,
        status_code=status_code,
        level=resolve_log_level(status_code),
        message=err_message,
        error_code=error_code,
        logger_name=_logger.name,
    )
    log_event(payload, exc=None)
    return JSONResponse(
        {"success": False, "err_message": err_message},
        status_code=status_code,
    )


def _forbidden(
    request: Request,
    detail: str = "Forbidden — route not registered in IAM",
    *,
    error_code: str = "IAM_ROUTE_NOT_REGISTERED",
) -> JSONResponse:
    return _access_denial_response(
        request, status_code=403, err_message=detail, error_code=error_code
    )


def _forbidden_wrong_app(request: Request) -> JSONResponse:
    return _access_denial_response(
        request,
        status_code=403,
        err_message="Forbidden — route is not registered for this application",
        error_code="IAM_ROUTE_WRONG_APP",
    )


def _unauthorized(request: Request, detail: str = "Unauthorized — valid Bearer token required") -> JSONResponse:
    return _access_denial_response(
        request, status_code=401, err_message=detail, error_code="UNAUTHORIZED"
    )


def _verify_signature(public_key_pem: str, string_to_sign: str, signature_b64: str) -> bool:
    """
    Verify a base64-encoded signature against string_to_sign using the PEM public key.
    Supports Ed25519 and RSA-SHA256 key types.
    Returns True if valid, False otherwise.
    """
    try:
        pub_key = load_pem_public_key(public_key_pem.encode("utf-8"))
        sig_bytes = base64.b64decode(signature_b64)
        msg_bytes = string_to_sign.encode("utf-8")
        if isinstance(pub_key, Ed25519PublicKey):
            pub_key.verify(sig_bytes, msg_bytes)
        else:
            pub_key.verify(sig_bytes, msg_bytes, padding.PKCS1v15(), hashes.SHA256())
        return True
    except (InvalidSignature, Exception):
        return False


async def _validate_app_client(request: Request) -> Optional[JSONResponse]:
    """
    Validate the incoming request against the system_application_client registry.

    Enforces SIGNATURE authentication:
      - X-Api-Key       : identifies the client (maps to api_key column)
      - X-Api-Timestamp : Unix seconds; must be within ±5 minutes of server time
      - X-Api-Signature : base64 signature of "<METHOD>\\n<PATH_WITH_QUERY>\\n<X-Api-Timestamp>"

    Returns None on success, or a JSONResponse (401/403) on failure.
    Set ENABLE_APP_CLIENT_AUTH=false to bypass all checks (local dev / testing).
    """
    if not settings.ENABLE_APP_CLIENT_AUTH:
        return None

    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import SystemApplicationClient

    api_key = request.headers.get("X-Api-Key")
    if not api_key:
        return _unauthorized(request, "Unauthorized — X-Api-Key header is required")

    db = SessionLocal()
    try:
        client = (
            db.query(SystemApplicationClient)
            .filter(SystemApplicationClient.api_key == api_key)
            .first()
        )
    finally:
        db.close()

    if not client or client.status != "ACTIVE":
        return _unauthorized(request, "Unauthorized — app client not found or inactive")

    if client.auth_method != "SIGNATURE":
        return _unauthorized(
            request, "Unauthorized — app client is not configured for SIGNATURE auth"
        )

    # Store client and key identifiers on request state so downstream code and
    # the AUTHENTICATED/PERMISSION block can read them without a second DB query.
    app_key = client.app_key
    request.state.app_key = app_key
    request.state.api_key = api_key
    request.state.app_client = client

    # --- SIGNATURE VALIDATION (TODO: enable when FED is ready) ---
    # The checks below are intentionally disabled. Only X-Api-Key + DB lookup +
    # ACTIVE status + auth_method guard are enforced for now.

    # IP allowlist check (EXTERNAL / MOBILE clients)
    if client.allowed_ips:
        allowed = [ip.strip() for ip in client.allowed_ips.split(",") if ip.strip()]
        caller_ip = request.client.host if request.client else None
        if caller_ip not in allowed:
            return _access_denial_response(
                request,
                status_code=403,
                err_message="Forbidden — caller IP is not in the allowed list",
                error_code="APP_CLIENT_IP_NOT_ALLOWED",
            )

    # Require signature headers
    x_timestamp = request.headers.get("X-Api-Timestamp")
    x_signature = request.headers.get("X-Api-Signature")
    if settings.ENABLE_SIGNATURE_VERIFICATION and (not x_timestamp or not x_signature):
        return _unauthorized(
            request,
            "Unauthorized — X-Api-Timestamp and X-Api-Signature headers are required",
        )

    # Timestamp replay-prevention window: ±5 minutes
    if settings.ENABLE_SIGNATURE_VERIFICATION:
        try:
            ts = int(x_timestamp)
        except ValueError:
            return _unauthorized(
                request,
                "Unauthorized — X-Api-Timestamp must be a Unix timestamp integer",
            )

        if abs(time.time() - ts) > 300:
            return _unauthorized(
                request,
                "Unauthorized — X-Api-Timestamp is outside the allowed ±5-minute window",
            )

    # Rebuild string_to_sign and verify (skipped when ENABLE_SIGNATURE_VERIFICATION=false)
    if settings.ENABLE_SIGNATURE_VERIFICATION:
        path_with_query = request.url.path
        if request.url.query:
            path_with_query = f"{path_with_query}?{request.url.query}"

        string_to_sign = f"{request.method.upper()}\n{path_with_query}\n{x_timestamp}"

        if not client.client_public_key:
            return _unauthorized(
                request, "Unauthorized — app client has no public key configured"
            )

        if not _verify_signature(client.client_public_key, string_to_sign, x_signature):
            return _unauthorized(request, "Unauthorized — signature verification failed")

    # FED origin check (disabled — rely on CORS_ORIGINS / CORSMiddleware for browser origins)
    # if client.app_type == "FED" and client.origin_url:
    #     allowed_origins = [o.strip() for o in client.origin_url.split(",") if o.strip()]
    #     origin = request.headers.get("Origin") or request.headers.get("Referer", "").split("/")[0]
    #     if not any(origin.startswith(allowed) for allowed in allowed_origins):
    #         return _access_denial_response(
    #             request,
    #             status_code=403,
    #             err_message="Forbidden — Origin header does not match the registered origin",
    #             error_code="APP_CLIENT_ORIGIN_MISMATCH",
    #         )

    return None


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

class AccessControlMiddleware(BaseHTTPMiddleware):
    """Enforce IAM access levels on every incoming request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        method = request.method.upper()

        # 1. Skip framework / health paths
        if path in _SKIP_EXACT:
            return await call_next(request)
        for prefix in _SKIP_PREFIXES:
            if path.startswith(prefix):
                return await call_next(request)

        # 2. Resolve FastAPI path template, then exact-match IAM rows
        path_template = _resolve_route_template(request)
        if not path_template:
            return _forbidden(request)

        matches = _matches_for_path(method, path_template)
        if not matches:
            return _forbidden(request)

        # 3. If every registering app marks this path PUBLIC, skip app client
        if all(lvl == "PUBLIC" for _, lvl, _, _ in matches):
            return await call_next(request)

        # 4. APP_CLIENT / AUTHENTICATED / PERMISSION — validate app client first
        err = await _validate_app_client(request)
        if err is not None:
            return err

        app_key = getattr(request.state, "app_key", None) or settings.DEFAULT_APP_KEY
        from apps.shared.utils.ius_utils import _current_app_key as _ius_app_key_ctx
        _ius_app_key_ctx.set(app_key)
        resolved = _resolve_access_level_for_app(matches, app_key)
        if resolved is None:
            return _forbidden_wrong_app(request)

        access_level, resource_api_id, is_dash_spec = resolved

        if access_level == "PUBLIC":
            return await call_next(request)

        if access_level == "APP_CLIENT":
            return await call_next(request)

        # 5. AUTHENTICATED / PERMISSION — JWT required, OR auto-inject for clients
        #    with requires_user_auth=0.
        app_client = getattr(request.state, "app_client", None)
        token = _extract_bearer(request)
        jwt_user = False

        if token:
            try:
                payload = decode_token(token)
            except HTTPException:
                return _unauthorized(request, "Unauthorized — token is invalid or expired")

            user_id = int(payload["sub"])
            request.state.user_id = user_id

            raw_username = payload.get("username")
            dbmetadata_published_by.set(str(raw_username) if raw_username else None)

            # Super-admin flag: True when the JWT marks the current app_key as a
            # super-admin key. Application-layer code (dataset/workflow services)
            # reads this via the get_is_super_admin dependency to bypass owner /
            # reviewer-eligibility / area-assignment / slice-scope checks.
            super_admin_app_keys: list[str] = payload.get("super_admin_api_keys", [])
            request.state.is_super_admin = app_key in super_admin_app_keys
            jwt_user = True

        elif app_client and not app_client.requires_user_auth:
            # Auto-inject: use the client's pre-configured service account as the
            # effective user. No login call is ever needed for these clients.
            if not app_client.default_user_id:
                return _unauthorized(
                    request,
                    "Unauthorized — client has requires_user_auth=0 but no default_user_id configured",
                )
            request.state.user_id = app_client.default_user_id
            request.state.is_super_admin = False
            dbmetadata_published_by.set(None)

        else:
            return _unauthorized(request)

        if access_level == "PERMISSION":
            if jwt_user:
                # Super-admin short-circuit: skip the iam_role_resource_api role
                # check entirely for super admins of the current app.
                if not request.state.is_super_admin:
                    path_dw_id = _extract_dw_id_from_path(path)
                    path_dashboard_id = _extract_dashboard_id_from_path(path, path_template)
                    if not _user_has_permission(
                        user_id, resource_api_id, path_dw_id,
                        path_dashboard_id, app_key, is_dash_spec,
                    ):
                        return _forbidden(
                            request,
                            "Forbidden — insufficient permissions",
                            error_code="IAM_INSUFFICIENT_PERMISSIONS",
                        )
            else:
                # Auto-inject path: check role permission directly via default_role_id.
                if not app_client.default_role_id:
                    return _forbidden(
                        request,
                        "Forbidden — client has no default_role_id configured",
                        error_code="IAM_INSUFFICIENT_PERMISSIONS",
                    )
                path_dw_id = _extract_dw_id_from_path(path)
                if not _role_has_permission(app_client.default_role_id, resource_api_id, path_dw_id):
                    return _forbidden(
                        request,
                        "Forbidden — insufficient permissions",
                        error_code="IAM_INSUFFICIENT_PERMISSIONS",
                    )

        return await call_next(request)
