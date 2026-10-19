"""Rename iam_user.address → location; add phone.

Revision ID: 073_iam_user_location_phone
Revises: 072_rename_dataset_comment_table
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "073_iam_user_location_phone"
down_revision = "072_rename_dataset_comment_table"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, col: str) -> bool:
    if not _table_exists(table):
        return False
    return any(c["name"] == col for c in inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    if not _table_exists("iam_user"):
        return
    if _column_exists("iam_user", "address") and not _column_exists("iam_user", "location"):
        op.alter_column(
            "iam_user",
            "address",
            new_column_name="location",
            existing_type=sa.String(length=255),
            existing_nullable=True,
        )
    if not _column_exists("iam_user", "phone"):
        op.add_column(
            "iam_user",
            sa.Column(
                "phone",
                sa.String(length=10),
                nullable=True,
                comment="Contact phone number",
            ),
        )


def downgrade() -> None:
    if not _table_exists("iam_user"):
        return
    if _column_exists("iam_user", "phone"):
        op.drop_column("iam_user", "phone")
    if _column_exists("iam_user", "location") and not _column_exists("iam_user", "address"):
        op.alter_column(
            "iam_user",
            "location",
            new_column_name="address",
            existing_type=sa.String(length=255),
            existing_nullable=True,
        )
