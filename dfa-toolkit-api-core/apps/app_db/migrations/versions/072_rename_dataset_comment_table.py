"""Rename dataset_review_comment to dataset_comment.

Revision ID: 072_rename_dataset_comment_table
Revises: 071_iam_user_refresh_token
"""

from alembic import op
from sqlalchemy import inspect

revision = "072_rename_dataset_comment_table"
down_revision = "071_iam_user_refresh_token"
branch_labels = None
depends_on = None


def _table_exists(table: str) -> bool:
    return table in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _table_exists("dataset_review_comment") and not _table_exists("dataset_comment"):
        op.rename_table("dataset_review_comment", "dataset_comment")


def downgrade() -> None:
    if _table_exists("dataset_comment") and not _table_exists("dataset_review_comment"):
        op.rename_table("dataset_comment", "dataset_review_comment")
