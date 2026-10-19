"""Rename gallery tables to system_gallery / system_gallery_keyword and drop user_id.

Steps:
  1. gallery            -> system_gallery
  2. gallery_keyword    -> system_gallery_keyword
  3. Drop user_id column from system_gallery (per-user access is enforced via iam_user_role_content, not a column on this table)

Revision ID: 036_rename_gallery_system
Revises: 035_rename_sys_dw_tbl
Create Date: 2026-03-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "036_rename_gallery_system"
down_revision = "035_rename_sys_dw_tbl"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    cols = {c["name"] for c in inspect(op.get_bind()).get_columns(table)}
    return column in cols


def upgrade() -> None:
    if _table_exists("gallery") and not _table_exists("system_gallery"):
        op.rename_table("gallery", "system_gallery")
    if _table_exists("gallery_keyword") and not _table_exists("system_gallery_keyword"):
        op.rename_table("gallery_keyword", "system_gallery_keyword")

    if _table_exists("system_gallery") and _column_exists("system_gallery", "user_id"):
        op.drop_column("system_gallery", "user_id")


def downgrade() -> None:
    if _table_exists("system_gallery") and not _column_exists("system_gallery", "user_id"):
        op.add_column(
            "system_gallery",
            sa.Column("user_id", sa.Integer(), nullable=True, comment="Owner; IAM user id"),
        )

    if _table_exists("system_gallery_keyword") and not _table_exists("gallery_keyword"):
        op.rename_table("system_gallery_keyword", "gallery_keyword")
    if _table_exists("system_gallery") and not _table_exists("gallery"):
        op.rename_table("system_gallery", "gallery")
