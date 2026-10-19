"""Add status snapshot column to dataset_comment.

Revision ID: 077_comment_subject_status
Revises: 076_create_sys_share_link
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "077_comment_subject_status"
down_revision = "076_create_sys_share_link"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _column_exists("dataset_comment", "status"):
        op.add_column(
            "dataset_comment",
            sa.Column(
                "status",
                sa.String(32),
                nullable=True,
                comment=(
                    "Snapshot at insert: dataset.dataset_status when data_point_id IS NULL; "
                    "else dataset_data_point.review_status"
                ),
            ),
        )


def downgrade() -> None:
    if _column_exists("dataset_comment", "status"):
        op.drop_column("dataset_comment", "status")
