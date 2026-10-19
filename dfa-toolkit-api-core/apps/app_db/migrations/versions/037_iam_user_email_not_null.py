"""Backfill iam_user.email then set NOT NULL.

Revision ID: 037_iam_user_email_not_null
Revises: 036_rename_gallery_system
Create Date: 2026-03-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "037_iam_user_email_not_null"
down_revision = "036_rename_gallery_system"
branch_labels = None
depends_on = None

_PLACEHOLDER_DOMAIN = "@placeholder.dfa.invalid"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _table_exists("iam_user"):
        return

    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "mysql":
        bind.execute(
            text(
                "UPDATE iam_user SET email = CONCAT(username, :suffix) "
                "WHERE email IS NULL OR TRIM(email) = ''"
            ),
            {"suffix": _PLACEHOLDER_DOMAIN},
        )
    else:
        # PostgreSQL, SQLite, etc.
        bind.execute(
            text(
                "UPDATE iam_user SET email = username || :suffix "
                "WHERE email IS NULL OR TRIM(email) = ''"
            ),
            {"suffix": _PLACEHOLDER_DOMAIN},
        )

    op.alter_column(
        "iam_user",
        "email",
        existing_type=sa.String(length=255),
        nullable=False,
        existing_nullable=True,
    )


def downgrade() -> None:
    if not _table_exists("iam_user"):
        return

    op.alter_column(
        "iam_user",
        "email",
        existing_type=sa.String(length=255),
        nullable=True,
        existing_nullable=False,
    )
