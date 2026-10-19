"""Rename monitoring API role EXTERNAL_CLIENT to EXTERNAL_MON_CLIENT.

Preserves iam_role.id so iam_user_role, iam_role_resource_api, iam_role_i18n,
and system_application_client.default_role_id remain valid without rewiring.

Revision ID: 112_rename_ext_mon_role
Revises: 111_iam_user_email_verified
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import inspect

revision = "112_rename_ext_mon_role"
down_revision = "111_iam_user_email_verified"
branch_labels = None
depends_on = None

_APP_KEY = "DFA_DM"
_OLD_ROLE_CODE = "EXTERNAL_CLIENT"
_NEW_ROLE_CODE = "EXTERNAL_MON_CLIENT"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _rename_role_code(from_code: str, to_code: str) -> None:
    if not _table_exists("iam_role"):
        return
    op.execute(
        f"""
        UPDATE iam_role
        SET role_code = '{to_code}',
            modified = UTC_TIMESTAMP(),
            modified_user_id = 0
        WHERE app_key = '{_APP_KEY}'
          AND role_code = '{from_code}'
        """
    )


def upgrade() -> None:
    _rename_role_code(_OLD_ROLE_CODE, _NEW_ROLE_CODE)


def downgrade() -> None:
    _rename_role_code(_NEW_ROLE_CODE, _OLD_ROLE_CODE)
