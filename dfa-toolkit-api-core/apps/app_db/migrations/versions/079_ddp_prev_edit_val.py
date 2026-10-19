"""Add dataset_data_point.prev_data_value for last superseded cell snapshot.

Distinct from prev_tmprd_* (prior time period comparison).

Revision ID: 079_ddp_prev_edit_val
Revises: 078_ddp_prev_tmprd_cols
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "079_ddp_prev_edit_val"
down_revision = "078_ddp_prev_tmprd_cols"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("dataset_data_point"):
        return
    if not _column_exists("dataset_data_point", "prev_data_value"):
        op.add_column(
            "dataset_data_point",
            sa.Column(
                "prev_data_value",
                sa.Text(),
                nullable=True,
                comment=(
                    "String snapshot of last superseded observation "
                    "(numeric or textual cell before edit)"
                ),
            ),
        )


def downgrade() -> None:
    if not _table_exists("dataset_data_point"):
        return
    if _column_exists("dataset_data_point", "prev_data_value"):
        op.drop_column("dataset_data_point", "prev_data_value")
