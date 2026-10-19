"""Add dataset.returned_by_user_id — reviewer who last returned for revision.

Revision ID: 080_dataset_returned_by_uid
Revises: 079_ddp_prev_edit_val
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "080_dataset_returned_by_uid"
down_revision = "079_ddp_prev_edit_val"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("dataset"):
        return
    if not _column_exists("dataset", "returned_by_user_id"):
        op.add_column(
            "dataset",
            sa.Column(
                "returned_by_user_id",
                sa.Integer(),
                nullable=True,
                comment="Reviewer who last returned the dataset for revision.",
            ),
        )


def downgrade() -> None:
    if not _table_exists("dataset"):
        return
    if _column_exists("dataset", "returned_by_user_id"):
        op.drop_column("dataset", "returned_by_user_id")
