"""Add email_verified to iam_user.

Revision ID: 111_iam_user_email_verified
Revises: 110_jq_import_batch_cols
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "111_iam_user_email_verified"
down_revision = "110_jq_import_batch_cols"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
        ),
        {"t": table, "c": column},
    ).scalar()
    return bool(row)


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, "iam_user", "email_verified"):
        op.add_column(
            "iam_user",
            sa.Column(
                "email_verified",
                sa.Boolean(),
                nullable=True,
                server_default=sa.false(),
                comment="True once the user has verified their email",
            ),
        )

    # Backfill: users who already have a password set are considered verified.
    conn.execute(text("SET SQL_SAFE_UPDATES = 0"))
    conn.execute(
        text("UPDATE iam_user SET email_verified = 1 WHERE password IS NOT NULL")
    )
    conn.execute(text("SET SQL_SAFE_UPDATES = 1"))


def downgrade() -> None:
    op.drop_column("iam_user", "email_verified")
