"""Add is_system to iam_user; add default_user_id, default_role_id to system_application_client.

Revision ID: 096_ext_client_cols
Revises: 095_iam_seed_orphan_cleanup
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "096_ext_client_cols"
down_revision = "095_iam_seed_orphan_cleanup"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    if not _column_exists("iam_user", "is_system"):
        op.add_column(
            "iam_user",
            sa.Column(
                "is_system",
                sa.SmallInteger(),
                nullable=False,
                server_default="0",
                comment="1=system/service account; cannot be deleted or logged in directly",
            ),
        )

    if not _column_exists("system_application_client", "default_user_id"):
        op.add_column(
            "system_application_client",
            sa.Column(
                "default_user_id",
                sa.Integer(),
                nullable=True,
                comment="Service account user FK: iam_user.id; required when requires_user_auth=0",
            ),
        )

    if not _column_exists("system_application_client", "default_role_id"):
        op.add_column(
            "system_application_client",
            sa.Column(
                "default_role_id",
                sa.Integer(),
                nullable=True,
                comment="Role FK: iam_role.id for PERMISSION checks when auto-injecting; required when requires_user_auth=0",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if any(c["name"] == "default_role_id" for c in insp.get_columns("system_application_client")):
        op.drop_column("system_application_client", "default_role_id")

    if any(c["name"] == "default_user_id" for c in insp.get_columns("system_application_client")):
        op.drop_column("system_application_client", "default_user_id")

    if any(c["name"] == "is_system" for c in insp.get_columns("iam_user")):
        op.drop_column("iam_user", "is_system")
