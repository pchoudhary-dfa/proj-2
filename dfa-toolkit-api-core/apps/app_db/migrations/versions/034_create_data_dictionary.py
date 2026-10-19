"""Create system_data_dictionary table.

Revision ID: 034_create_data_dictionary
Revises: 033_add_is_dw_spec_to_iam_res
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "034_create_data_dictionary"
down_revision = "033_add_is_dw_spec_to_iam_res"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    # Rename old table if it was created with the previous name
    if _table_exists("data_dictionary") and not _table_exists("system_data_dictionary"):
        op.rename_table("data_dictionary", "system_data_dictionary")
        return

    if _table_exists("system_data_dictionary"):
        return

    op.create_table(
        "system_data_dictionary",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("database_name", sa.String(200), nullable=True, comment="Database/schema name"),
        sa.Column("table_name", sa.String(200), nullable=True, comment="Table name"),
        sa.Column("table_description", sa.String(500), nullable=True, comment="Human-readable description of the table"),
        sa.Column("primary_keys", sa.String(500), nullable=True, comment="Comma-separated primary key column names"),
        sa.Column("foreign_keys", sa.String(500), nullable=True, comment="Comma-separated foreign key column names"),
        sa.Column("linked_tables", sa.String(500), nullable=True, comment="Linked table references e.g. links to system_application.app_key"),
        sa.Column("created", sa.DateTime(), nullable=False, server_default=sa.func.now(), comment="Record creation timestamp"),
        sa.UniqueConstraint("database_name", "table_name", name="uq_sdd_database_table"),
    )


def downgrade() -> None:
    if _table_exists("system_data_dictionary"):
        op.drop_table("system_data_dictionary")
