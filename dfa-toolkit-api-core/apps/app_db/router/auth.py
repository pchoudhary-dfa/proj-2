"""
Authentication routes — login, token issuance, and logout.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from apps.app_dashboard.services.user_area_service import parse_comma_separated_int_ids
from apps.app_db.dependencies import get_app_key, get_core_locale, get_current_user_id, get_raw_api_key
from apps.app_db.models.core import IamRole, IamUser, IamUserRole
from apps.app_db.schemas.auth import (
    BackChannelLogoutRequest,
    CaptchaChallengeResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    PasswordResetConfirmRequest,
    RefreshTokenRequest,
    RegisterRequest,
    RegisterResponse,
    ResendRegistrationRequest,
    TokenRefreshResponse,
)
from apps.app_db.schemas.iam import (
    AppScopedPermissions,
    UserPermissionsData,
    WorkflowAccessPayload,
)
from apps.app_db.services.auth_token_payload import build_access_token_payload
from apps.app_db.services.iam_role_service import IamRoleService
from apps.app_db.services.refresh_token_service import (
    has_active_refresh_token,
    persist_refresh_token_for_user,
    revoke_all_refresh_tokens_for_user,
    rotate_stored_refresh_token,
)
from apps.app_db.services.user_service import (
    create_user,
    get_active_user_for_password_reset,
    get_login_workflow_resource_summary,
    set_password_for_user_id,
)
from apps.shared.config.config import settings
from apps.shared.config.dependencies import get_db
from apps.shared.config.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_password_reset_token,
    decode_refresh_token,
)
from apps.shared.exceptions import BadRequest, Forbidden, NotFound
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.email_utils import (
    EmailTemplate,
    build_password_reset_url,
    get_app_from_name,
    get_fed_email_urls,
    send_email,
)
from apps.shared.utils.password_utils import verify_password
from apps.shared.packages.dfa_sso_service.adapters.fastapi import get_sso_service
from apps.shared.packages.dfa_sso_service.core.config import get_sso_enabled
from apps.shared.packages.dfa_sso_service.core.service import SsoService
from apps.shared.utils.response import success_response
from apps.app_db.services import captcha_service
from apps.app_db.services.captcha_service import CAPTCHA_CHALLENGE_TTL_SECONDS

_password_reset_bearer = HTTPBearer()

logger = logging.getLogger(__name__)
_role_service = IamRoleService()


def _login_permissions_without_assignments(
    perms: dict[str, AppScopedPermissions],
) -> dict[str, AppScopedPermissions]:
    """Login omits per-row workflow_access.assignments; workflows, resource content_ids, and by_workflow remain."""
    out: dict[str, AppScopedPermissions] = {}
    for key, scoped in perms.items():
        wf = scoped.workflow_access
        out[key] = scoped.model_copy(
            update={
                "workflow_access": WorkflowAccessPayload(
                    workflows=wf.workflows,
                    resources=wf.resources,
                    assignments=[],
                )
            }
        )
    return out


def _build_login_response(
    db: Session,
    user: IamUser,
    locale: str,
    app_key: str,
    api_key: str | None,
    auth_provider: str,
) -> LoginResponse:
    """Shared token-minting + response construction for both local and SSO login."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user.last_loggedin_on = now

    token_payload = build_access_token_payload(db, user, locale=locale)
    api_keys = list(token_payload["api_keys"])

    db.commit()

    access_token = create_access_token(token_payload)
    refresh_plain = create_refresh_token(user.id)
    persist_refresh_token_for_user(db, user.id, refresh_plain)

    permissions = _login_permissions_without_assignments(
        _role_service.get_user_permissions_grouped(
            user_id=user.id,
            db=db,
            dw_id=None,
            locale=locale,
            app_key=app_key,
            api_key=api_key,
        )
    )

    effective_app_key = app_key or settings.DEFAULT_APP_KEY
    login_meta = get_login_workflow_resource_summary(
        db=db,
        user_id=user.id,
        app_key=effective_app_key,
        locale=locale,
    )

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_plain,
        access_token_expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        username=user.username,
        auth_provider=auth_provider,
        api_keys=api_keys,
        permissions=permissions,
        meta=login_meta,
    )


router = APIRouter(prefix="/auth")


@router.get(
    "/captcha/challenge",
    response_model=SuccessResponse[CaptchaChallengeResponse],
    summary="Request a Proof-of-Work CAPTCHA challenge",
    description=(
        "Returns a fresh PoW challenge. The client must find an integer `solution` such that "
        "SHA256(`nonce`:`solution`) has at least `difficulty` leading zero bits, then submit "
        "the `challenge_id` and `solution` with the next auth request."
    ),
    responses={500: {"model": ErrorResponse}},
    tags=["Auth"],
)
def get_captcha_challenge(db: Session = Depends(get_db)):
    """Generate and store a new PoW CAPTCHA challenge."""
    challenge = captcha_service.create_challenge(db)
    return success_response(
        message="CAPTCHA challenge generated successfully",
        data=CaptchaChallengeResponse(
            challenge_id=challenge.challenge_id,
            nonce=challenge.nonce,
            difficulty=challenge.difficulty,
            expires_in=CAPTCHA_CHALLENGE_TTL_SECONDS,
        ).model_dump(),
    )


def _require_local_login(db: Session, app_key: str) -> None:
    """Reject local-auth endpoints when SSO_ENABLED is true (SSO-only mode)."""
    if get_sso_enabled(db, app_key or settings.DEFAULT_APP_KEY):
        raise Forbidden("Local login is disabled when SSO is enabled")


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    app_key: str = Depends(get_app_key),
    api_key: str | None = Depends(get_raw_api_key),
    sso: SsoService = Depends(get_sso_service),
):
    """
    Unified login endpoint — local credentials or SSO code exchange.

    **Local login** (``username`` + ``password``):
    - Blocked when ``SSO_ENABLED`` is true for the resolved app_key.
    - Verifies username and bcrypt-hashed password against iam_user.
    - Rejects inactive users (status != 1).

    **SSO code exchange** (``code``):
    - Blocked when ``SSO_ENABLED`` is false for the resolved app_key.
    - Consumes the one-time code produced by the OIDC callback and resolves
      the user (provisioned on first SSO login).

    Both paths return the same ``LoginResponse`` shape with JWT tokens,
    permissions, and workflow/resource meta.
    """
    if payload.code:
        if not get_sso_enabled(db, app_key or settings.DEFAULT_APP_KEY):
            raise Forbidden("SSO is not enabled")

        result = sso.consume_login_code(payload.code)
        user = db.query(IamUser).filter(IamUser.id == result.user_id).first()
        if user is None:
            raise Forbidden("User account not found")

        return_path = None
        if payload.return_url:
            from apps.shared.packages.dfa_sso_service.core.errors import SsoConfigError
            from apps.shared.packages.dfa_sso_service.core.security import validate_return_to

            try:
                return_path = validate_return_to(payload.return_url)
            except SsoConfigError:
                return_path = None

        if return_path:
            sso.maybe_assign_default_role_on_exchange(
                result.user_id,
                result.sso_provider_id,
                app_key,
                return_path,
            )

        return _build_login_response(db, user, locale, app_key, api_key, auth_provider="SSO")

    _require_local_login(db, app_key)
    captcha_service.verify_and_consume(db, payload.captcha.challenge_id, payload.captcha.solution)
    user: IamUser | None = (
        db.query(IamUser).filter(IamUser.username == payload.username).first()
    )
    if user is None or not verify_password(payload.password, user.password or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    return _build_login_response(db, user, locale, app_key, api_key, auth_provider="LOCAL")


@router.post("/refresh", response_model=TokenRefreshResponse)
def refresh_tokens(
    request: Request,
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
):
    """
    Exchange a valid refresh JWT for a new access JWT and a new refresh JWT.

    The refresh JWT must match the latest server-stored session for the user; after a
    successful exchange the previous refresh JWT is rejected (rotation).

    Send ``refresh_token`` in the JSON body and/or as the ``dfa_refresh`` cookie.
    IAM should register ``POST /auth/refresh`` as PUBLIC (see ``seed_iam``).
    """
    raw = (payload.refresh_token or "").strip() or (request.cookies.get("dfa_refresh") or "").strip()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        rt_payload = decode_refresh_token(raw)
        user_id = int(rt_payload["sub"])
    except HTTPException:
        raise
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(IamUser).filter(IamUser.id == user_id).first()
    if user is None or user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_payload = build_access_token_payload(db, user, locale=locale)
    access_token = create_access_token(token_payload)
    new_refresh_plain = rotate_stored_refresh_token(db, user.id, raw)
    if new_refresh_plain is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenRefreshResponse(
        access_token=access_token,
        refresh_token=new_refresh_plain,
        token_type="bearer",
        access_token_expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post(
    "/password/reset-request",
    response_model=SuccessResponse[dict],
    responses={
        status.HTTP_404_NOT_FOUND: {"model": ErrorResponse},
    },
)
def password_reset_request(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    app_key: str = Depends(get_app_key),
):
    """
    Start forgot-password: email a time-limited reset link (JWT).

    - Returns **404** if the username does not exist.
    - Allowed for inactive users too — completing reset-confirm reactivates the account.
    - On success, sends `password_reset_link` email; does **not** change the password yet.
    """
    _require_local_login(db, app_key)
    captcha_service.verify_and_consume(db, payload.captcha.challenge_id, payload.captcha.solution)
    user = get_active_user_for_password_reset(db, payload.username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User does not exist",
        )
    token = create_password_reset_token(user.id)
    login_url, reset_base = get_fed_email_urls(app_key, db)
    reset_url = build_password_reset_url(token, reset_base=reset_base)
    full_name = f"{user.first_name} {user.last_name}".strip() if user.last_name else user.first_name
    expires_in = f"{settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes"
    send_email(
        template=EmailTemplate.PASSWORD_RESET_LINK,
        recipient_email=user.email,
        recipient_name=full_name,
        context={
            "full_name": full_name,
            "username": user.username,
            "reset_url": reset_url,
            "expires_in": expires_in,
            "login_url": login_url,
            "from_name": get_app_from_name(),
        },
        locale=locale,
    )
    user.status=0
    return success_response(
        message="A password reset link has been sent to your email address.",
        data={},
    )


@router.post(
    "/password/reset-confirm",
    response_model=SuccessResponse[dict],
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorResponse},
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse},
        status.HTTP_403_FORBIDDEN: {"model": ErrorResponse},
        status.HTTP_404_NOT_FOUND: {"model": ErrorResponse},
    },
)
def password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    credentials: HTTPAuthorizationCredentials = Depends(_password_reset_bearer),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    app_key: str = Depends(get_app_key),
):
    """
    Complete forgot-password using the JWT from the reset link.

    - Send **Authorization: Bearer** with the `token` query value from the email link as the JWT.
    - Body: `new_password` (must satisfy configured min/max length).
    - On success, updates `iam_user.password` and sends the `password_reset` confirmation email
      (no plaintext password in the email).
    """
    claims = decode_password_reset_token(credentials.credentials)
    user_id = int(claims["sub"])
    try:
        user = set_password_for_user_id(
            db=db,
            user_id=user_id,
            new_password=payload.new_password,
            modified_user_id=settings.SYSTEM_USER_ID,
        )
    except LookupError as exc:
        raise NotFound(str(exc)) from exc
    except PermissionError as exc:
        raise Forbidden(str(exc) or "User account is inactive") from exc

    full_name = f"{user.first_name} {user.last_name}".strip() if user.last_name else user.first_name
    login_url, _ = get_fed_email_urls(app_key, db)
    send_email(
        template=EmailTemplate.PASSWORD_RESET,
        recipient_email=user.email,
        recipient_name=full_name,
        context={
            "full_name": full_name,
            "username": user.username,
            "login_url": login_url,
            "from_name": get_app_from_name(),
        },
        locale=locale,
    )
    return success_response(
        message="Your password has been reset successfully.",
        data={},
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    app_key: str = Depends(get_app_key),
):
    """
    Register a new user account.

    - `first_name`, `username`, and `email` are required.
    - `password` is optional — a secure random password is auto-generated when omitted.
    - `last_name` is optional.
    - Disabled when ``LOCAL_LOGIN_ENABLED`` is false.
    - Raises 409 if the username is already taken.
    - `password_auto_generated` in the response indicates which email template was used.
    - If the resolved `app_key` is present in `settings.DEFAULT_ROLE_MAP`, the mapped
      default role is auto-assigned to the new user (silently skipped if the role row
      doesn't exist in the database).
    """
    _require_local_login(db, app_key)
    captcha_service.verify_and_consume(db, payload.captcha.challenge_id, payload.captcha.solution)
    user, auto_generated, plain_password = create_user(
        db=db,
        first_name=payload.first_name,
        last_name=payload.last_name,
        username=payload.username,
        email=payload.email,
        password=payload.password,
        created_user_id=settings.SYSTEM_USER_ID,

    )

    # Auto-assign a default role when the caller's app_key is configured in DEFAULT_ROLE_MAP.
    # role_code is unique across all roles, so we search by code only — this allows a DM-scoped
    # role (e.g. DFA_DM_AUTHENTICATED) to be assigned as the VIZ default without a VIZ role row.
    # The IamUserRole assignment always uses the requesting app_key so the permission check works.
    default_role_code = settings.DEFAULT_ROLE_MAP.get(app_key)
    if default_role_code:
        try:
            default_role = (
                db.query(IamRole)
                .filter(IamRole.role_code == default_role_code)
                .first()
            )
            if default_role:
                now = datetime.now(timezone.utc).replace(tzinfo=None)
                db.add(
                    IamUserRole(
                        user_id=user.id,
                        app_key=app_key,
                        dw_id=None,
                        role_id=default_role.id,
                        created=now,
                        created_user_id=settings.SYSTEM_USER_ID
                    )
                )
                db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning(
                "Failed to assign default role '%s' to user %s: %s",
                default_role_code, user.id, exc,
            )

    reg_template = EmailTemplate.WELCOME_AUTO_PASSWORD if auto_generated else EmailTemplate.WELCOME
    full_name = f"{user.first_name} {user.last_name}".strip() if user.last_name else user.first_name
    login_url, _ = get_fed_email_urls(app_key, db)
    ctx = {
        "full_name": full_name,
        "username": user.username,
        "login_url": login_url,
        "from_name": get_app_from_name(),
    }
    if auto_generated:
        ctx["plain_password"] = plain_password or ""
    send_email(
        template=reg_template,
        recipient_email=user.email,
        recipient_name=full_name,
        context=ctx,
        locale=locale,
    )

    return RegisterResponse(
        user_id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        password_auto_generated=auto_generated,
        email_verified=bool(user.email_verified),
    )


@router.post(
    "/resend-registration",
    response_model=SuccessResponse[dict],
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorResponse},
        status.HTTP_403_FORBIDDEN: {"model": ErrorResponse},
        status.HTTP_404_NOT_FOUND: {"model": ErrorResponse},
    },
)
def resend_registration(
    payload: ResendRegistrationRequest,
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    app_key: str = Depends(get_app_key),
):
    """
    Resend the set-password registration email to an unverified user.

    - Looks up an active user by email address.
    - Returns 404 if no active user with that email exists.
    - Returns 400 if the user's email is already verified.
    - Generates a fresh password-reset token and sends the ACCOUNT_INVITE_SET_PASSWORD email.
    """
    _require_local_login(db, app_key)

    user = db.query(IamUser).filter(
        IamUser.email == payload.email,
        IamUser.status == 1,
    ).first()
    if user is None:
        raise NotFound("No active user found with that email address", error_code="USER_NOT_FOUND")
    if user.email_verified:
        raise BadRequest("Email is already verified", error_code="EMAIL_ALREADY_VERIFIED")

    full_name = f"{user.first_name} {user.last_name}".strip() if user.last_name else user.first_name
    login_url, reset_base = get_fed_email_urls(app_key, db)
    token = create_password_reset_token(user.id)
    reset_url = build_password_reset_url(token, reset_base=reset_base)
    expires_in = f"{settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes"

    send_email(
        template=EmailTemplate.ACCOUNT_INVITE_SET_PASSWORD,
        recipient_email=user.email,
        recipient_name=full_name,
        context={
            "full_name": full_name,
            "username": user.username,
            "reset_url": reset_url,
            "expires_in": expires_in,
            "login_url": login_url,
            "from_name": get_app_from_name(),
        },
        locale=locale,
    )
    return success_response(
        message="Registration email resent successfully.",
        data={},
    )


@router.post("/swagger-login", include_in_schema=False)
def swagger_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None,
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
):
    """
    OAuth2 token endpoint consumed exclusively by Swagger UI's Authorize dialog.
    Accepts form-encoded username/password and returns a bearer token.
    Re-issues the token with src="swagger" so the auth middleware can bypass
    app-client signature enforcement for Swagger sessions.
    SSO mode does NOT block this endpoint — local credentials are always accepted
    here so developers can authenticate via Swagger even when SSO is enforced for
    end users.
    """
    from apps.shared.config.security import decode_token
    user: IamUser | None = (
        db.query(IamUser).filter(IamUser.username == form_data.username).first()
    )
    if user is None or not verify_password(form_data.password, user.password or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    result = _build_login_response(db, user, locale, app_key=None, api_key=None, auth_provider="LOCAL")
    payload = decode_token(result.access_token)
    payload.pop("exp", None)
    payload["src"] = "swagger"
    token = create_access_token(payload)
    return {"access_token": token, "token_type": "bearer"}


@router.get(
    "/me/permissions",
    responses={
        200: {"model": SuccessResponse, "description": "Permissions payload for FED authorization"},
        400: {"model": ErrorResponse, "description": "Bad request"},
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        404: {"model": ErrorResponse, "description": "Dashboard not found"},
    },
    summary="Get current user's permissions (union across roles)",
    description=(
        "Returns role assignments and the union of resource CRUD permissions for the current user. "
        "Four modes (``dw_id`` and ``dashboard_ids`` are mutually exclusive):\n"
        "- neither: app-level resources (``is_dw_spec=0`` and ``is_dash_spec=0``), "
        "from all role assignments for the app. Flat ``UserPermissionsData`` response.\n"
        "- ``dw_id``: DW-scoped resources (``is_dw_spec=1`` and ``is_dash_spec=0``). "
        "Flat ``UserPermissionsData`` response.\n"
        "- ``dashboard_ids``: comma-separated edit-mode dashboard IDs (e.g. ``1,2,3``). "
        "Returns ``BulkDashboardPermissionsData``: ``is_super_admin`` plus "
        "``by_dashboard_id`` map of ``roles`` / ``resources`` per dashboard.\n"
        "Also returns ``workflow_access`` on flat responses (DW / app mode only)."
    ),
)
def get_my_permissions(
    dw_id: int | None = Query(None, description="Optional DW scope; when provided returns is_dw_spec=1 resources"),
    dashboard_ids: str | None = Query(
        None,
        description="Comma-separated edit-mode dashboard IDs; returns is_dash_spec=1 resources per dashboard",
    ),
    user_id: int = Depends(get_current_user_id),
    locale: str = Depends(get_core_locale),
    app_key: str = Depends(get_app_key),
    api_key: str | None = Depends(get_raw_api_key),
    db: Session = Depends(get_db),
):
    """
    Compute union permissions for the current user.

    Output (app / DW scope):
    - is_super_admin: true if the user has any is_super_admin=1 role (any app_key;
      aligns with JWT super_admin_api_keys) — full CRUD on in-scope resources.
    - roles: list of role assignments for the current app_key (role_id, role_code, role_name, dw_id)
    - resources: unioned list of {resource_code, name, permissions:[C/R/U/D]} (all in-scope when is_super_admin).
    - workflow_access.resources: per resource_code, content_ids (union) and by_workflow (workflow_code → ids).

    Output (dashboard_ids scope):
    - is_super_admin at top level
    - by_dashboard_id: map of dashboard id string → {roles, resources}
    """
    if dw_id is not None and dashboard_ids is not None:
        raise BadRequest(
            "dw_id and dashboard_ids are mutually exclusive",
            error_code="PERMISSIONS_SCOPE_CONFLICT",
        )

    if dashboard_ids is not None:
        parsed_dashboard_ids = parse_comma_separated_int_ids(dashboard_ids)
        result = _role_service.get_user_dashboard_permissions_bulk(
            user_id=user_id,
            app_key=app_key,
            db=db,
            dashboard_ids=parsed_dashboard_ids,
            locale=locale,
            api_key=api_key,
        )
        return success_response(
            message="Permissions retrieved successfully",
            data=result.model_dump(),
        )

    result = _role_service.get_user_permissions(
        user_id=user_id,
        app_key=app_key,
        db=db,
        dw_id=dw_id,
        locale=locale,
        api_key=api_key,
    )
    return success_response(
        message="Permissions retrieved successfully",
        data=result.model_dump(),
    )


@router.post("/logout")
def logout(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    app_key: str = Depends(get_app_key),
    sso: SsoService = Depends(get_sso_service),
):
    """
    Unified logout endpoint — handles both local and SSO sessions.

    1. Revokes all server-stored refresh tokens for this user.
    2. If the user has an active SSO session, deactivates it and returns
       the IdP ``logout_url`` so the client can redirect the browser.
    3. Clients should still clear cookies and local storage.

    Response ``data.logout_url`` is a string (IdP end-session URL) or ``null``.
    """
    logger.info("User %s logged out", current_user_id)
    revoke_all_refresh_tokens_for_user(db, current_user_id)
    db.commit()

    logout_url = None
    try:
        logout_url = sso.get_logout_url(current_user_id)
        sso.deactivate_sso_sessions(current_user_id)
        db.commit()
    except Exception as exc:
        logger.warning(
            "SSO session cleanup failed for user %s: %s",
            current_user_id,
            exc,
        )
        db.rollback()

    return success_response(
        data={"logout_url": logout_url},
        message="Logout successful",
    )


@router.get(
    "/session-status",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "Session is active"},
        401: {"model": ErrorResponse, "description": "Session revoked (logged out elsewhere)"},
    },
    summary="Check session validity for cross-app SLO polling",
    description=(
        "Lightweight endpoint polled by FED apps to detect cross-app logout. "
        "Returns 200 if the user has an active (non-expired) refresh token, "
        "or 401 if all refresh tokens have been revoked (e.g. logout from another app)."
    ),
    tags=["Auth"],
)
def session_status(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Cross-app Single Logout detection.

    FED apps poll this every ~30s. When a user logs out from any app, their refresh
    tokens are revoked, causing this endpoint to return 401 for all other apps.
    """
    if not has_active_refresh_token(db, current_user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")
    return success_response(message="Session active", data={"active": True})


@router.post(
    "/sso/back-channel-logout",
    response_model=SuccessResponse,
    responses={
        200: {"model": SuccessResponse, "description": "Sessions revoked (or already absent)"},
        404: {"model": ErrorResponse, "description": "No DFA user found for the given IdP identity"},
    },
    summary="IdP-initiated back-channel logout",
    description=(
        "Called by an external Identity Provider (e.g. CMS/Drupal) when a user logs out. "
        "Resolves the IdP user identity to an internal user, revokes all refresh tokens, "
        "and deactivates SSO sessions. DFA apps detect the revocation via session-status polling."
    ),
    tags=["Auth"],
)
def sso_back_channel_logout(
    payload: BackChannelLogoutRequest,
    db: Session = Depends(get_db),
    sso: SsoService = Depends(get_sso_service),
):
    """
    Back-channel logout triggered by an external IdP.

    Security: APP_CLIENT access level — requires valid signature headers
    (X-Api-Key, X-Api-Timestamp, X-Api-Signature) but no user JWT.
    """
    from apps.shared.packages.dfa_sso_service.storage.sqlalchemy_storage import (
        SsoUserIdentityModel,
    )

    identity = (
        db.query(SsoUserIdentityModel)
        .filter(
            SsoUserIdentityModel.provider_code == payload.provider_code,
            SsoUserIdentityModel.idp_user_id == payload.idp_user_id,
        )
        .first()
    )

    if not identity:
        raise NotFound(
            "No user found for the given identity",
            error_code="IDENTITY_NOT_FOUND",
            details={
                "provider_code": payload.provider_code,
                "idp_user_id": payload.idp_user_id,
            },
        )

    user_id = identity.user_id

    had_sessions = has_active_refresh_token(db, user_id)
    revoke_all_refresh_tokens_for_user(db, user_id)

    try:
        sso.deactivate_sso_sessions(user_id)
    except Exception as exc:
        logger.warning(
            "SSO session deactivation failed during back-channel logout for user %s: %s",
            user_id,
            exc,
        )

    db.commit()

    logger.info(
        "Back-channel logout: provider=%s idp_user=%s user_id=%s revoked=%s",
        payload.provider_code,
        payload.idp_user_id,
        user_id,
        had_sessions,
    )

    return success_response(
        message="Sessions revoked for user" if had_sessions else "No active sessions found",
        data={"user_id": user_id, "sessions_revoked": had_sessions},
    )
