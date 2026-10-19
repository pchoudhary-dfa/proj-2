"""
SsoUserProvider protocol — the host application implements this to let the
SSO package resolve and provision users without importing the host's ORM models.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..core.models import SsoUserProfile


class SsoUserProvider(ABC):
    """
    Abstract interface the host must implement.

    Every method receives/returns plain ``int`` user IDs — the package never
    touches the host's ``User`` model directly.
    """

    @abstractmethod
    def find_user_by_email(self, email: str) -> int | None:
        """Return user_id if a user with this email exists, else ``None``."""
        ...

    @abstractmethod
    def create_user(self, profile: SsoUserProfile) -> int:
        """
        Create a new user from SSO profile data and return the new ``user_id``.

        The host is responsible for setting its own columns
        (``password=None``, ``status``, audit columns, etc.).
        """
        ...

    @abstractmethod
    def is_user_active(self, user_id: int) -> bool:
        """Return ``True`` if the user account is active."""
        ...

    @abstractmethod
    def user_has_role_for_app(self, user_id: int, app_key: str | None) -> bool:
        """Return True when the user has at least one role for *app_key*."""
        ...

    @abstractmethod
    def user_has_dw_scoped_role_for_app(
        self, user_id: int, app_key: str | None, dw_id: int
    ) -> bool:
        """Return True when the user has a role for *app_key* scoped to *dw_id*."""
        ...

    @abstractmethod
    def assign_default_role(
        self,
        user_id: int,
        role_id: int,
        dw_id: int | None = None,
    ) -> None:
        """Assign a role to a newly auto-provisioned SSO user."""
        ...
