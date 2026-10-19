"""
SQLAlchemy storage backend — ORM models for all ``iam_sso_*`` tables and the
concrete ``SsoStorage`` implementation.

Tables:
  iam_sso_identity_provider  — merged IdP catalog + OIDC config (was two tables)
  iam_sso_user_identity      — links user_id to external IdP identity
  iam_sso_login_code         — one-time bridge codes (callback → exchange)
  iam_sso_session            — active SSO session context for logout
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Session, declarative_base

from .base import SsoStorage

logger = logging.getLogger(__name__)

Base = declarative_base()


# ═══════════════════════════════════════════════════════════════════════════
# ORM Models — package-owned tables
# ═══════════════════════════════════════════════════════════════════════════


class SsoIdentityProviderModel(Base):
    """
    Merged IdP catalog + OIDC configuration.

    Each row represents a single identity provider with its OIDC endpoints
    and client credentials. No app_key scoping — one global config per IdP.
    """

    __tablename__ = "iam_sso_identity_provider"
    __table_args__ = (
        UniqueConstraint("provider_code", name="uq_sso_idp_provider_code"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_code = Column(String(20), nullable=False)
    name = Column(String(100), nullable=False)

    client_id = Column(String(255), nullable=True)
    client_secret_enc = Column(Text, nullable=True)

    well_known_uri = Column(String(500), nullable=True)
    authorization_endpoint = Column(String(500), nullable=True)
    token_endpoint = Column(String(500), nullable=True)
    userinfo_endpoint = Column(String(500), nullable=True)
    issuer = Column(String(500), nullable=True)
    jwks_uri = Column(String(500), nullable=True)
    redirect_uri = Column(String(500), nullable=True)
    end_session_endpoint = Column(String(500), nullable=True)
    logout_uri = Column(String(500), nullable=True)

    idp_entity_id = Column(String(500), nullable=True)
    idp_sso_url = Column(String(500), nullable=True)
    idp_certificate = Column(Text, nullable=True)

    scopes = Column(String(500), nullable=True, server_default="openid profile email")
    attribute_map = Column(Text, nullable=True)
    auto_provision_users = Column(SmallInteger, nullable=False, default=0)
    default_role_id = Column(Integer, nullable=True)
    is_active = Column(SmallInteger, nullable=False, default=1)

    created = Column(DateTime, nullable=True)
    created_user_id = Column(Integer, nullable=False, default=0)
    modified = Column(DateTime, nullable=True)
    modified_user_id = Column(Integer, nullable=False, default=0)


class SsoUserIdentityModel(Base):
    """Links an internal user_id to an external IdP identity."""

    __tablename__ = "iam_sso_user_identity"
    __table_args__ = (
        UniqueConstraint("provider_code", "idp_user_id", name="uq_sso_identity_provider_idp_uid"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    provider_code = Column(String(20), nullable=False)
    idp_user_id = Column(String(255), nullable=False, comment="User ID at the external identity provider (OIDC sub claim)")
    email = Column(String(255), nullable=True)
    raw_claims = Column(Text, nullable=True)

    created = Column(DateTime, nullable=True)
    created_user_id = Column(Integer, nullable=False, default=0)
    modified = Column(DateTime, nullable=True)
    modified_user_id = Column(Integer, nullable=False, default=0)


class SsoLoginCodeModel(Base):
    """Short-lived single-use codes bridging SSO callback to frontend exchange."""

    __tablename__ = "iam_sso_login_code"
    __table_args__ = ({"extend_existing": True},)

    id = Column(Integer, primary_key=True, autoincrement=True)
    code_hash = Column(String(64), nullable=False, unique=True)
    user_id = Column(Integer, nullable=False)
    sso_provider_id = Column(
        Integer,
        ForeignKey("iam_sso_identity_provider.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_used = Column(SmallInteger, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False)


class SsoSessionModel(Base):
    """
    SSO session — tracks active SSO login context for IdP logout.

    Replaces SSO context columns that previously lived on ``iam_user_refresh_token``.
    """

    __tablename__ = "iam_sso_session"
    __table_args__ = (
        Index("ix_sso_session_user_active", "user_id", "is_active"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False)
    sso_provider_id = Column(
        Integer,
        ForeignKey("iam_sso_identity_provider.id", ondelete="SET NULL"),
        nullable=True,
    )
    id_token_enc = Column(Text, nullable=True)
    is_active = Column(SmallInteger, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


# ═══════════════════════════════════════════════════════════════════════════
# Concrete Storage Implementation
# ═══════════════════════════════════════════════════════════════════════════


class SqlAlchemySsoStorage(SsoStorage):
    """SQLAlchemy-backed ``SsoStorage`` — one instance per request (shares the host's ``Session``)."""

    def __init__(self, db: Session):
        self._db = db

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc).replace(tzinfo=None)

    # -- sso provider (global OIDC config) --------------------------------

    def get_active_providers(self) -> list[SsoIdentityProviderModel]:
        return (
            self._db.query(SsoIdentityProviderModel)
            .filter(SsoIdentityProviderModel.is_active == 1)
            .all()
        )

    def get_provider_by_code(self, provider_code: str) -> SsoIdentityProviderModel | None:
        return (
            self._db.query(SsoIdentityProviderModel)
            .filter(
                SsoIdentityProviderModel.provider_code == provider_code,
                SsoIdentityProviderModel.is_active == 1,
            )
            .first()
        )

    def get_provider_by_id(self, nid: int) -> SsoIdentityProviderModel | None:
        return (
            self._db.query(SsoIdentityProviderModel)
            .filter(SsoIdentityProviderModel.id == nid)
            .first()
        )

    def create_provider(self, data: dict, user_id: int) -> SsoIdentityProviderModel:
        now = self._now()
        provider = SsoIdentityProviderModel(
            **data,
            created=now,
            created_user_id=user_id,
            modified=now,
            modified_user_id=user_id,
        )
        self._db.add(provider)
        self._db.flush()
        return self.get_provider_by_id(provider.id)

    def update_provider(self, provider: SsoIdentityProviderModel, data: dict, user_id: int) -> SsoIdentityProviderModel:
        now = self._now()
        for key, value in data.items():
            if value is not None:
                setattr(provider, key, value)
        provider.modified = now
        provider.modified_user_id = user_id
        self._db.flush()
        return self.get_provider_by_id(provider.id)

    def delete_provider(self, provider: SsoIdentityProviderModel) -> None:
        self._db.delete(provider)
        self._db.flush()

    def list_all_providers(self) -> list[SsoIdentityProviderModel]:
        return (
            self._db.query(SsoIdentityProviderModel)
            .order_by(SsoIdentityProviderModel.id)
            .all()
        )

    # -- sso user identity ------------------------------------------------

    def find_identity(self, provider_code: str, idp_user_id: str) -> SsoUserIdentityModel | None:
        return (
            self._db.query(SsoUserIdentityModel)
            .filter(
                SsoUserIdentityModel.provider_code == provider_code,
                SsoUserIdentityModel.idp_user_id == idp_user_id,
            )
            .first()
        )

    def create_identity(
        self,
        user_id: int,
        provider_code: str,
        idp_user_id: str,
        email: str | None,
        raw_claims: str | None,
    ) -> None:
        now = self._now()
        self._db.add(
            SsoUserIdentityModel(
                user_id=user_id,
                provider_code=provider_code,
                idp_user_id=idp_user_id,
                email=email,
                raw_claims=raw_claims,
                created=now,
                created_user_id=0,
                modified=now,
                modified_user_id=0,
            )
        )
        self._db.flush()

    def update_identity_claims(
        self,
        identity: SsoUserIdentityModel,
        email: str | None,
        raw_claims: str | None,
    ) -> None:
        now = self._now()
        if email is not None:
            identity.email = email
        if raw_claims is not None:
            identity.raw_claims = raw_claims
        identity.modified = now

    # -- login codes ------------------------------------------------------

    def create_login_code(
        self,
        code_hash: str,
        user_id: int,
        sso_provider_id: int | None,
    ) -> None:
        now = self._now()
        self._db.add(
            SsoLoginCodeModel(
                code_hash=code_hash,
                user_id=user_id,
                sso_provider_id=sso_provider_id,
                is_used=0,
                expires_at=now + timedelta(seconds=60),
                created_at=now,
            )
        )
        self._db.flush()

    def get_login_code(self, code_hash: str) -> SsoLoginCodeModel | None:
        return (
            self._db.query(SsoLoginCodeModel)
            .filter(SsoLoginCodeModel.code_hash == code_hash)
            .first()
        )

    def mark_login_code_used(self, code: SsoLoginCodeModel) -> None:
        code.is_used = 1
        self._db.flush()

    def cleanup_expired_codes(self) -> int:
        now = self._now()
        count = (
            self._db.query(SsoLoginCodeModel)
            .filter(
                (SsoLoginCodeModel.expires_at < now) | (SsoLoginCodeModel.is_used == 1),
            )
            .delete(synchronize_session=False)
        )
        return count

    # -- sso session (logout context) -------------------------------------

    def create_sso_session(
        self,
        user_id: int,
        sso_provider_id: int,
        id_token_enc: str | None,
    ) -> int:
        now = self._now()
        self.deactivate_sso_sessions(user_id)
        session = SsoSessionModel(
            user_id=user_id,
            sso_provider_id=sso_provider_id,
            id_token_enc=id_token_enc,
            is_active=1,
            created_at=now,
            updated_at=now,
        )
        self._db.add(session)
        self._db.flush()
        return session.id

    def get_active_sso_session(self, user_id: int) -> SsoSessionModel | None:
        return (
            self._db.query(SsoSessionModel)
            .filter(
                SsoSessionModel.user_id == user_id,
                SsoSessionModel.is_active == 1,
            )
            .order_by(SsoSessionModel.created_at.desc())
            .first()
        )

    def deactivate_sso_sessions(self, user_id: int) -> None:
        now = self._now()
        (
            self._db.query(SsoSessionModel)
            .filter(
                SsoSessionModel.user_id == user_id,
                SsoSessionModel.is_active == 1,
            )
            .update({"is_active": 0, "updated_at": now}, synchronize_session=False)
        )

    # -- flush ------------------------------------------------------------

    def flush(self) -> None:
        self._db.flush()
