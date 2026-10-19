"""Restructure IAM and permission tables for existing databases.

Operations performed:
  system_applications : rename appkey → app_key (if present), add description

Revision ID: 011_restructure_tables
Revises: 010_create_system_applications_and_configurations
Create Date: 2026-03-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "011_restructure_tables"
down_revision = "010_create_permission_tables"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Guard helpers
# ---------------------------------------------------------------------------

def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def column_exists(table: str, col: str) -> bool:
    return any(c["name"] == col for c in inspect(op.get_bind()).get_columns(table))


def index_exists(table: str, idx: str) -> bool:
    return any(i["name"] == idx for i in inspect(op.get_bind()).get_indexes(table))


def fk_exists(table: str, fk_name: str) -> bool:
    return any(fk["name"] == fk_name for fk in inspect(op.get_bind()).get_foreign_keys(table))


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # 1. system_applications — rename appkey → app_key (if old column exists), add description
    # ------------------------------------------------------------------
    if table_exists("system_applications"):
        if column_exists("system_applications", "appkey") and not column_exists("system_applications", "app_key"):
            op.alter_column(
                "system_applications", "appkey",
                new_column_name="app_key",
                existing_type=sa.String(length=10),
                existing_nullable=False,
            )

        if not column_exists("system_applications", "description"):
            op.add_column(
                "system_applications",
                sa.Column("description", sa.Text(), nullable=True,
                          comment="Application description"),
            )



# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:

    # ------------------------------------------------------------------
    # Reverse step 1
    # ------------------------------------------------------------------
    if table_exists("system_applications"):
        if column_exists("system_applications", "app_key") and not column_exists("system_applications", "appkey"):
            op.alter_column("system_applications", "app_key", new_column_name="appkey",
                            existing_type=sa.String(10), existing_nullable=False)
        if column_exists("system_applications", "description"):
            op.drop_column("system_applications", "description")
