"""Rename appkey → app_key on system_application (catch-up for DBs that ran 011 before fix).

For databases where migration 011 was already applied when it had the bug (no-op rename),
system_application may still have column `appkey`. This revision renames it to `app_key`
when present. Safe to run if the column is already `app_key` (no-op).

Revision ID: 016_rename_appkey_to_app_key
Revises: 015_alter_res_api_and_trans
Create Date: 2026-03-13

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "016_rename_appkey_to_app_key"
down_revision = "015_alter_res_api_and_trans"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def column_exists(table: str, col: str) -> bool:
    if not table_exists(table):
        return False
    return any(c["name"] == col for c in inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    # system_application (table name after 012 rename): appkey → app_key if still old name
    if table_exists("system_application") and column_exists("system_application", "appkey") and not column_exists("system_application", "app_key"):
        op.alter_column(
            "system_application",
            "appkey",
            new_column_name="app_key",
            existing_type=sa.String(length=10),
            existing_nullable=False,
        )


def downgrade() -> None:
    if table_exists("system_application") and column_exists("system_application", "app_key") and not column_exists("system_application", "appkey"):
        op.alter_column(
            "system_application",
            "app_key",
            new_column_name="appkey",
            existing_type=sa.String(length=10),
            existing_nullable=False,
        )
