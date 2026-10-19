"""
Schemas for authentication request and response.
"""
from typing import Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

from apps.app_db.schemas.iam import AppScopedPermissions
from apps.shared.config.config import settings


class CaptchaInput(BaseModel):
    """PoW CAPTCHA solution supplied by the client."""

    challenge_id: str = Field(..., description="challenge_id returned by GET /auth/captcha/challenge")
    solution: int = Field(..., description="Integer solution such that SHA256(nonce:solution) satisfies difficulty")


class CaptchaChallengeResponse(BaseModel):
    """Response shape for GET /auth/captcha/challenge."""

    challenge_id: str
    nonce: str
    difficulty: int
    expires_in: int = Field(..., description="Seconds until the challenge expires")


class LoginRequest(BaseModel):
    """Unified login: local (username + password) OR SSO code exchange (code)."""

    username: Optional[str] = None
    password: Optional[str] = None
    code: Optional[str] = None
    return_url: Optional[str] = Field(
        None,
        description="Optional post-login in-app path (SSO code exchange only)",
    )
    captcha: Optional[CaptchaInput] = Field(
        None,
        description="PoW CAPTCHA solution — required for local (username + password) login; omit for SSO code exchange",
    )

    @model_validator(mode="after")
    def _exactly_one_auth_mode(self):
        has_creds = self.username is not None and self.password is not None
        has_code = self.code is not None
        if not has_creds and not has_code:
            raise ValueError("Provide (username + password) or (code)")
        if has_creds and has_code:
            raise ValueError("Provide (username + password) or (code), not both")
        if has_creds and self.captcha is None:
            raise ValueError("captcha is required for local login")
        return self


class LoginWorkflowMetaItem(BaseModel):
    workflow_id: int
    workflow_code: str
    workflow_name: Optional[str] = None
    allow_review: bool = False


class LoginResourceMetaItem(BaseModel):
    resource_code: str
    scope_type: Optional[str] = None


class LoginAuthMeta(BaseModel):
    """Login extras: workflow and assignment resource metadata (keyed by code)."""

    workflow: Dict[str, LoginWorkflowMetaItem] = Field(default_factory=dict)
    resources: Dict[str, LoginResourceMetaItem] = Field(default_factory=dict)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_token_expires_in: int = Field(
        description="Access token lifetime in seconds. FED apps use this to schedule proactive refresh.",
    )
    user_id: int
    username: str
    first_name: str
    last_name: Optional[str]
    email: str
    auth_provider: str = "LOCAL"
    api_keys: List[str]
    permissions: Dict[str, AppScopedPermissions]
    meta: LoginAuthMeta = Field(
        default_factory=LoginAuthMeta,
        description="Per-code workflow names and resource scope hints for the login client.",
    )


class RefreshTokenRequest(BaseModel):
    """Body may omit refresh_token when the client sends it as the ``dfa_refresh`` cookie."""

    refresh_token: Optional[str] = None


class TokenRefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_token_expires_in: int = Field(
        description="Access token lifetime in seconds. FED apps use this to schedule proactive refresh.",
    )


class RegisterRequest(BaseModel):
    first_name: str
    username: str
    password: Optional[str] = None
    last_name: Optional[str] = None
    email: EmailStr
    captcha: CaptchaInput = Field(..., description="PoW CAPTCHA solution")


class RegisterResponse(BaseModel):
    user_id: int
    username: str
    first_name: str
    last_name: Optional[str]
    email: str
    password_auto_generated: bool
    email_verified: bool


class ResendRegistrationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    username: str
    captcha: CaptchaInput = Field(..., description="PoW CAPTCHA solution")


class PasswordResetConfirmRequest(BaseModel):
    """Body for POST /auth/password/reset-confirm (Bearer must carry password-reset JWT)."""

    new_password: str = Field(..., min_length=settings.IAM_PASSWORD_MIN_LENGTH, max_length=settings.IAM_PASSWORD_MAX_LENGTH, description="New password (length also enforced server-side)")


class BackChannelLogoutRequest(BaseModel):
    """Request body for IdP-initiated back-channel logout (e.g. CMS calling on user logout)."""

    provider_code: str = Field(..., min_length=1, max_length=20, description="SSO provider identifier (e.g. 'drupal')")
    idp_user_id: str = Field(..., min_length=1, max_length=255, description="User ID at the IdP (OIDC sub claim)")
