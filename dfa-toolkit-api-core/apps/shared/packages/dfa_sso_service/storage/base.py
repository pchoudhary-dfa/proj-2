"""
SsoStorage protocol — abstract persistence interface for all SSO tables.

The SQLAlchemy implementation lives in ``sqlalchemy_storage.py``.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class SsoStorage(ABC):
    """Abstract storage backend for SSO data."""

    # -- sso provider (global OIDC config) ---------------------------------

    @abstractmethod
    def get_active_providers(self) -> list[Any]:
        ...

    @abstractmethod
    def get_provider_by_code(self, provider_code: str) -> Any | None:
        ...

    @abstractmethod
    def get_provider_by_id(self, nid: int) -> Any | None:
        ...

    @abstractmethod
    def create_provider(self, data: dict, user_id: int) -> Any:
        ...

    @abstractmethod
    def update_provider(self, provider: Any, data: dict, user_id: int) -> Any:
        ...

    @abstractmethod
    def delete_provider(self, provider: Any) -> None:
        ...

    @abstractmethod
    def list_all_providers(self) -> list[Any]:
        ...

    # -- sso user identity ------------------------------------------------

    @abstractmethod
    def find_identity(self, provider_code: str, idp_user_id: str) -> Any | None:
        ...

    @abstractmethod
    def create_identity(self, user_id: int, provider_code: str, idp_user_id: str, email: str | None, raw_claims: str | None) -> None:
        ...

    @abstractmethod
    def update_identity_claims(self, identity: Any, email: str | None, raw_claims: str | None) -> None:
        ...

    # -- login codes ------------------------------------------------------

    @abstractmethod
    def create_login_code(self, code_hash: str, user_id: int, sso_provider_id: int | None) -> None:
        ...

    @abstractmethod
    def get_login_code(self, code_hash: str) -> Any | None:
        ...

    @abstractmethod
    def mark_login_code_used(self, code: Any) -> None:
        ...

    @abstractmethod
    def cleanup_expired_codes(self) -> int:
        ...

    # -- sso session (logout context) -------------------------------------

    @abstractmethod
    def create_sso_session(self, user_id: int, sso_provider_id: int, id_token_enc: str | None) -> int:
        ...

    @abstractmethod
    def get_active_sso_session(self, user_id: int) -> Any | None:
        ...

    @abstractmethod
    def deactivate_sso_sessions(self, user_id: int) -> None:
        ...

    # -- flush / commit ---------------------------------------------------

    @abstractmethod
    def flush(self) -> None:
        ...
