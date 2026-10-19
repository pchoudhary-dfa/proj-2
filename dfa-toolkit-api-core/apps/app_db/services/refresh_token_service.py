"""
Persisted refresh JWT rotation: store SHA-256 hashes so reused refresh tokens fail after rotation.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from apps.app_db.models.core import IamUserRefreshToken
from apps.shared.config.config import settings
from apps.shared.config.security import create_refresh_token


def refresh_token_hash(raw_token: str) -> str:
    """Deterministic SHA-256 hex digest of the bearer refresh JWT string."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def revoke_all_refresh_tokens_for_user(db: Session, user_id: int) -> None:
    """Delete all stored refresh token rows for a user (logout, new login)."""
    db.query(IamUserRefreshToken).filter(IamUserRefreshToken.user_id == user_id).delete()


def persist_refresh_token_for_user(
    db: Session,
    user_id: int,
    raw_refresh_token: str,
) -> None:
    """
    Replace any existing refresh sessions for this user with a single new hash.

    SSO session context (provider, id_token) is now tracked in the package-owned
    ``iam_sso_session`` table — no longer stored on the refresh token row.
    """
    revoke_all_refresh_tokens_for_user(db, user_id)
    now = datetime.utcnow()
    db.add(
        IamUserRefreshToken(
            user_id=user_id,
            token_hash=refresh_token_hash(raw_refresh_token),
            expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            created_at=now,
        )
    )


def has_active_refresh_token(db: Session, user_id: int) -> bool:
    """Return True if the user has at least one non-expired refresh token row."""
    now = datetime.utcnow()
    return (
        db.query(IamUserRefreshToken)
        .filter(
            IamUserRefreshToken.user_id == user_id,
            IamUserRefreshToken.expires_at > now,
        )
        .first()
    ) is not None


def rotate_stored_refresh_token(db: Session, user_id: int, raw_refresh_token: str) -> str | None:
    """
    If ``raw_refresh_token`` matches a stored row for ``user_id`` and is not expired,
    delete that row, persist the new raw token's hash, and return the new raw JWT string.

    Returns ``None`` if there is no matching active stored refresh (wrong/reused token).
    """
    th = refresh_token_hash(raw_refresh_token)
    now = datetime.utcnow()
    row = (
        db.query(IamUserRefreshToken)
        .filter(
            IamUserRefreshToken.user_id == user_id,
            IamUserRefreshToken.token_hash == th,
        )
        .first()
    )
    if row is None:
        return None
    if row.expires_at < now:
        db.delete(row)
        return None

    db.delete(row)
    db.flush()

    new_raw = create_refresh_token(user_id)
    db.add(
        IamUserRefreshToken(
            user_id=user_id,
            token_hash=refresh_token_hash(new_raw),
            expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            created_at=now,
        )
    )
    return new_raw
