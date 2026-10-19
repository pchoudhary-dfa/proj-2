"""
Security utilities for authentication and authorization
"""
import secrets
from datetime import datetime, timedelta

from jose import JWTError, jwt
from fastapi import HTTPException, status

from apps.shared.config.config import settings

REFRESH_TOKEN_CLAIM = "refresh"


def create_access_token(data: dict) -> str:
    """Create a signed JWT access token with an expiry."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    """Create a signed JWT refresh token (not accepted as an access Bearer)."""
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {
        "sub": str(user_id),
        "token_use": REFRESH_TOKEN_CLAIM,
        "jti": secrets.token_urlsafe(32),
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_refresh_token(token: str) -> dict:
    """Decode a refresh JWT or raise 401."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("token_use") != REFRESH_TOKEN_CLAIM:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def decode_token(token: str) -> dict:
    """Decode and verify a JWT access token (rejects refresh tokens)."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("token_use") == REFRESH_TOKEN_CLAIM:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token cannot be used as an access token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except HTTPException:
        raise
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


PASSWORD_RESET_JWT_PURPOSE = "password_reset"


def create_password_reset_token(user_id: int) -> str:
    """Create a short-lived JWT used only for POST /auth/password/reset-confirm."""
    expire = datetime.utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(user_id),
        "purpose": PASSWORD_RESET_JWT_PURPOSE,
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_password_reset_token(token: str) -> dict:
    """
    Decode a password-reset JWT. Raises ValueError if missing purpose, wrong purpose,
    missing sub, or signature/expiry invalid (caller maps to 401).
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise ValueError("Invalid or expired password reset token") from exc
    if payload.get("purpose") != PASSWORD_RESET_JWT_PURPOSE:
        raise ValueError("Invalid or expired password reset token")
    sub = payload.get("sub")
    if sub is None:
        raise ValueError("Invalid or expired password reset token")
    try:
        int(sub)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid or expired password reset token") from exc
    return payload
