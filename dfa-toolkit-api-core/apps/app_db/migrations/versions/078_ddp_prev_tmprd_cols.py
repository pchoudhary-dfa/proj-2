"""Rename dataset_data_point previous-period value columns.

prev_data_value → prev_tmprd_data_value
prev_textual_data_value → prev_tmprd_textual_data_value

Revision ID: 078_ddp_prev_tmprd_cols
Revises: 077_comment_subject_status
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "078_ddp_prev_tmprd_cols"
down_revision = "077_comment_subject_status"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("dataset_data_point"):
        return
    if _column_exists("dataset_data_point", "prev_data_value") and not _column_exists(
        "dataset_data_point", "prev_tmprd_data_value"
    ):
        op.alter_column(
            "dataset_data_point",
            "prev_data_value",
            new_column_name="prev_tmprd_data_value",
            existing_type=sa.Float(),
            existing_nullable=True,
        )
    if _column_exists("dataset_data_point", "prev_textual_data_value") and not _column_exists(
        "dataset_data_point", "prev_tmprd_textual_data_value"
    ):
        op.alter_column(
            "dataset_data_point",
            "prev_textual_data_value",
            new_column_name="prev_tmprd_textual_data_value",
            existing_type=sa.Text(),
            existing_nullable=True,
        )


def downgrade() -> None:
    if not _table_exists("dataset_data_point"):
        return
    if _column_exists("dataset_data_point", "prev_tmprd_data_value") and not _column_exists(
        "dataset_data_point", "prev_data_value"
    ):
        op.alter_column(
            "dataset_data_point",
            "prev_tmprd_data_value",
            new_column_name="prev_data_value",
            existing_type=sa.Float(),
            existing_nullable=True,
        )
    if _column_exists("dataset_data_point", "prev_tmprd_textual_data_value") and not _column_exists(
        "dataset_data_point", "prev_textual_data_value"
    ):
        op.alter_column(
            "dataset_data_point",
            "prev_tmprd_textual_data_value",
            new_column_name="prev_textual_data_value",
            existing_type=sa.Text(),
            existing_nullable=True,
        )
