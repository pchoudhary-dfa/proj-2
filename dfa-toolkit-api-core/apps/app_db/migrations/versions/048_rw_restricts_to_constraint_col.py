"""Rename restricts_data_entry to constraint_data_entry if old column exists.

Revision ID: 048_rw_restricts_to_constraint
Revises: 047_add_constraint_data_entry
Create Date: 2026-04-06

For databases that applied an earlier revision of 047 that created restricts_data_entry.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "048_rw_restricts_to_constraint"
down_revision = "047_add_constraint_data_entry"
branch_labels = None
depends_on = None


def column_exists(table: str, column: str) -> bool:
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return column in cols


def upgrade() -> None:
    if column_exists("review_workflow", "restricts_data_entry") and not column_exists(
        "review_workflow", "constraint_data_entry"
    ):
        op.alter_column(
            "review_workflow",
            "restricts_data_entry",
            new_column_name="constraint_data_entry",
            existing_type=sa.Boolean(),
            existing_nullable=False,
            existing_server_default=text("0"),
        )


def downgrade() -> None:
    if column_exists("review_workflow", "constraint_data_entry") and not column_exists(
        "review_workflow", "restricts_data_entry"
    ):
        op.alter_column(
            "review_workflow",
            "constraint_data_entry",
            new_column_name="restricts_data_entry",
            existing_type=sa.Boolean(),
            existing_nullable=False,
            existing_server_default=text("0"),
        )
