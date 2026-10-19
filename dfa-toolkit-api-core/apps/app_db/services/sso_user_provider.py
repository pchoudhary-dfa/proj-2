"""
DFA-specific implementation of ``SsoUserProvider`` — bridges the SSO package
to the host's ``IamUser`` and ``IamUserRole`` ORM models.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from apps.app_db.models.core import IamRole, IamUser, IamUserRole
from apps.shared.config.config import settings
from apps.shared.packages.dfa_sso_service.core.models import SsoUserProfile
from apps.shared.packages.dfa_sso_service.providers.base import SsoUserProvider

logger = logging.getLogger(__name__)


class DfaUserProvider(SsoUserProvider):
    """Concrete ``SsoUserProvider`` for the DFA Toolkit API."""

    def __init__(self, db: Session):
        self._db = db

    def find_user_by_email(self, email: str) -> int | None:
        user = self._db.query(IamUser).filter(IamUser.email == email).first()
        return user.id if user else None

    def create_user(self, profile: SsoUserProfile) -> int:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        user = IamUser(
            first_name=profile.first_name or "SSO",
            last_name=profile.last_name,
            username=profile.username or profile.idp_user_id,
            email=profile.email,
            password=None,
            status=profile.status,
            email_verified=bool(profile.email_verified),
            created=now,
            created_user_id=0,
            modified=now,
            modified_user_id=0,
        )
        self._db.add(user)
        self._db.flush()
        return user.id

    def is_user_active(self, user_id: int) -> bool:
        user = self._db.query(IamUser).filter(IamUser.id == user_id).first()
        if user is None:
            return False
        return user.status == 1

    def user_has_role_for_app(self, user_id: int, app_key: str | None) -> bool:
        if not app_key:
            return True
        return (
            self._db.query(IamUserRole.id)
            .filter(
                IamUserRole.user_id == user_id,
                IamUserRole.app_key == app_key,
            )
            .first()
            is not None
        )

    def user_has_dw_scoped_role_for_app(
        self, user_id: int, app_key: str | None, dw_id: int
    ) -> bool:
        if not app_key:
            return True
        return (
            self._db.query(IamUserRole.id)
            .filter(
                IamUserRole.user_id == user_id,
                IamUserRole.app_key == app_key,
                IamUserRole.dw_id == dw_id,
            )
            .first()
            is not None
        )

    def assign_default_role(
        self,
        user_id: int,
        role_id: int,
        dw_id: int | None = None,
    ) -> None:
        """
        Assign a default role to a newly provisioned SSO user.

        For the DFA_DM_AUTHENTICATED role (SSO authenticated role):
        - When *dw_id* is set (DM warehouse deep-link login): assign only DFA_DM
          scoped to that warehouse; skip federated apps.
        - When *dw_id* is None: assign to ALL SSO_FEDERATED_APPS with dw_id NULL.

        For other roles, assigns only to the role's primary app_key.
        """
        role = self._db.query(IamRole).filter(IamRole.id == role_id).first()
        if role is None:
            logger.warning(f"assign_default_role: role_id {role_id} not found")
            return
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        if role.role_code == "DFA_DM_AUTHENTICATED":
            if dw_id is not None:
                app_keys_to_assign = [settings.DFA_DM_APP_KEY]
                logger.info(
                    "SSO user %s: assigning %s to %s with dw_id=%s",
                    user_id,
                    role.role_code,
                    settings.DFA_DM_APP_KEY,
                    dw_id,
                )
            else:
                app_keys_to_assign = settings.SSO_FEDERATED_APPS
                logger.info(
                    "SSO user %s: assigning %s to federated apps: %s",
                    user_id,
                    role.role_code,
                    app_keys_to_assign,
                )
        else:
            app_keys_to_assign = [role.app_key]
            logger.debug(
                "SSO user %s: assigning %s to primary app: %s",
                user_id,
                role.role_code,
                role.app_key,
            )

        assignment_dw_id = dw_id if dw_id is not None else None

        for target_app_key in app_keys_to_assign:
            row_dw_id = assignment_dw_id if target_app_key == settings.DFA_DM_APP_KEY else None

            assn_filter = [
                IamUserRole.user_id == user_id,
                IamUserRole.app_key == target_app_key,
                IamUserRole.role_id == role.id,
            ]
            if row_dw_id is not None:
                assn_filter.append(IamUserRole.dw_id == row_dw_id)
            else:
                assn_filter.append(IamUserRole.dw_id.is_(None))

            existing = self._db.query(IamUserRole).filter(*assn_filter).first()
            if existing:
                logger.debug(
                    "Role assignment already exists: user=%s, app=%s, role=%s, dw_id=%s",
                    user_id,
                    target_app_key,
                    role.role_code,
                    row_dw_id,
                )
                continue

            self._db.add(
                IamUserRole(
                    user_id=user_id,
                    app_key=target_app_key,
                    dw_id=row_dw_id,
                    role_id=role.id,
                    created=now,
                    created_user_id=0,
                )
            )
            logger.debug(
                "Created role assignment: user=%s, app=%s, role=%s, dw_id=%s",
                user_id,
                target_app_key,
                role.role_code,
                row_dw_id,
            )
