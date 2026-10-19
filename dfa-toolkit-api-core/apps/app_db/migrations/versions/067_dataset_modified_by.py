"""Add modified_by column to dataset table.

Revision ID: 067_dataset_modified_by
Revises: 066_comment_table_and_cleanup
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "067_dataset_modified_by"
down_revision = "066_comment_table_and_cleanup"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _column_exists("dataset", "modified_by"):
        op.add_column(
            "dataset",
            sa.Column(
                "modified_by",
                sa.Integer(),
                nullable=True,
                comment="User who last modified the dataset",
            ),
        )


def downgrade() -> None:
    if _column_exists("dataset", "modified_by"):
        op.drop_column("dataset", "modified_by")
