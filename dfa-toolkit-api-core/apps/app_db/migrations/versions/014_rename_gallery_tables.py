"""Rename user_visualization tables to gallery tables, rename FK column.

Operations (upgrade order):
  1.  user_visualization_keyword: rename FK column user_visualization_id → gallery_id
  2.  user_visualization_keyword → gallery_keyword
  3.  user_visualization         → gallery

Downgrade reverses steps in opposite order.

Revision ID: 014_rename_gallery_tables
Revises: 013_alter_system_application
Create Date: 2026-03-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "014_rename_gallery_tables"
down_revision = "013_alter_system_application"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Guard helpers
# ---------------------------------------------------------------------------

def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def column_exists(table: str, col: str) -> bool:
    if not table_exists(table):
        return False
    return any(c["name"] == col for c in inspect(op.get_bind()).get_columns(table))


def index_exists(table: str, idx: str) -> bool:
    if not table_exists(table):
        return False
    return any(i["name"] == idx for i in inspect(op.get_bind()).get_indexes(table))


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:

    # ------------------------------------------------------------------
    # 1. user_visualization_keyword: rename FK column
    #    user_visualization_id → gallery_id
    # ------------------------------------------------------------------
    if table_exists("user_visualization_keyword") and column_exists("user_visualization_keyword", "user_visualization_id"):
        op.alter_column(
            "user_visualization_keyword",
            "user_visualization_id",
            new_column_name="gallery_id",
            existing_type=sa.Integer(),
            existing_nullable=False,
        )

    # ------------------------------------------------------------------
    # 2. user_visualization_keyword → gallery_keyword
    # ------------------------------------------------------------------
    if table_exists("user_visualization_keyword") and not table_exists("gallery_keyword"):
        op.rename_table("user_visualization_keyword", "gallery_keyword")

    # ------------------------------------------------------------------
    # 3. user_visualization → gallery
    # ------------------------------------------------------------------
    if table_exists("user_visualization") and not table_exists("gallery"):
        op.rename_table("user_visualization", "gallery")


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:

    # ------------------------------------------------------------------
    # 3. gallery → user_visualization
    # ------------------------------------------------------------------
    if table_exists("gallery") and not table_exists("user_visualization"):
        op.rename_table("gallery", "user_visualization")

    # ------------------------------------------------------------------
    # 2. gallery_keyword → user_visualization_keyword
    # ------------------------------------------------------------------
    if table_exists("gallery_keyword") and not table_exists("user_visualization_keyword"):
        op.rename_table("gallery_keyword", "user_visualization_keyword")

    # ------------------------------------------------------------------
    # 1. gallery_keyword / user_visualization_keyword: restore FK column name
    #    gallery_id → user_visualization_id
    # ------------------------------------------------------------------
    target = "user_visualization_keyword" if table_exists("user_visualization_keyword") else "gallery_keyword"
    if column_exists(target, "gallery_id"):
        op.alter_column(
            target,
            "gallery_id",
            new_column_name="user_visualization_id",
            existing_type=sa.Integer(),
            existing_nullable=False,
        )
