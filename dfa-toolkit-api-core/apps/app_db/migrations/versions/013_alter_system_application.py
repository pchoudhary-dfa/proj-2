"""Alter iam_user and system_application tables.

Operations (upgrade order):
  1.  iam_user: rename name → first_name
  2.  iam_user: add last_name column
  3.  iam_user: drop sel_objects column
  4.  system_application: drop description column
  5.  system_application: alter is_active from VARCHAR(255) → SMALLINT

Revision ID: 013_alter_system_application
Revises: 012_rename_tables.py
Create Date: 2026-03-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "013_alter_system_application"
down_revision = "012_rename_tables"
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


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:

    # ------------------------------------------------------------------
    # 1. iam_user: rename name → first_name
    # ------------------------------------------------------------------
    if column_exists("iam_user", "name") and not column_exists("iam_user", "first_name"):
        op.alter_column(
            "iam_user",
            "name",
            new_column_name="first_name",
            existing_type=sa.String(length=255),
            existing_nullable=False,
        )

    # ------------------------------------------------------------------
    # 2. iam_user: add last_name column (placed directly after first_name)
    # ------------------------------------------------------------------
    if table_exists("iam_user") and not column_exists("iam_user", "last_name"):
        op.execute(
            "ALTER TABLE iam_user ADD COLUMN last_name VARCHAR(255) NULL "
            "COMMENT 'Last name' AFTER first_name"
        )

    # ------------------------------------------------------------------
    # 3. iam_user: drop sel_objects column
    # ------------------------------------------------------------------
    if column_exists("iam_user", "sel_objects"):
        op.drop_column("iam_user", "sel_objects")

    # ------------------------------------------------------------------
    # 4. system_application: drop description column
    # ------------------------------------------------------------------
    if column_exists("system_application", "description"):
        op.drop_column("system_application", "description")

    # ------------------------------------------------------------------
    # 5. system_application: alter is_active VARCHAR(255) → SMALLINT
    # ------------------------------------------------------------------
    if column_exists("system_application", "is_active"):
        op.execute("UPDATE system_application SET is_active = 1")
        op.execute("UPDATE system_application SET is_active = 1")
        op.alter_column(
            "system_application",
            "is_active",
            existing_type=sa.String(length=255),
            type_=sa.SmallInteger(),
            nullable=True,
        )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:

    # ------------------------------------------------------------------
    # 5. system_application: restore is_active SMALLINT → VARCHAR(255)
    # ------------------------------------------------------------------
    if column_exists("system_application", "is_active"):
        op.alter_column(
            "system_application",
            "is_active",
            existing_type=sa.SmallInteger(),
            type_=sa.String(length=255),
            nullable=True,
        )

    # ------------------------------------------------------------------
    # 4. system_application: restore description column
    # ------------------------------------------------------------------
    if table_exists("system_application") and not column_exists("system_application", "description"):
        op.add_column(
            "system_application",
            sa.Column(
                "description",
                sa.Text(),
                nullable=True,
                comment="Application description",
            ),
        )

    # ------------------------------------------------------------------
    # 3. iam_user: restore sel_objects column
    # ------------------------------------------------------------------
    if table_exists("iam_user") and not column_exists("iam_user", "sel_objects"):
        op.add_column(
            "iam_user",
            sa.Column(
                "sel_objects",
                sa.Text(),
                nullable=True,
                comment="Selected objects JSON",
            ),
        )

    # ------------------------------------------------------------------
    # 2. iam_user: drop last_name column
    # ------------------------------------------------------------------
    if column_exists("iam_user", "last_name"):
        op.drop_column("iam_user", "last_name")

    # ------------------------------------------------------------------
    # 1. iam_user: rename first_name → name
    # ------------------------------------------------------------------
    if column_exists("iam_user", "first_name") and not column_exists("iam_user", "name"):
        op.alter_column(
            "iam_user",
            "first_name",
            new_column_name="name",
            existing_type=sa.String(length=255),
            existing_nullable=False,
        )
