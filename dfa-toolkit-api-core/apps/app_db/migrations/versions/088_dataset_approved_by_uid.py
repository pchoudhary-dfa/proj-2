"""Add approved_by_user_id — reviewer who approved the latest stage.

Adds:
  dataset.approved_by_user_id              — reviewer who approved the latest completed stage
  dataset_review_stage.approved_by_user_id — reviewer whose action completed that stage

Revision ID: 088_dataset_approved_by_uid
Revises: 087_lse_add_req_headers
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "088_dataset_approved_by_uid"
down_revision = "087_lse_add_req_headers"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if _table_exists("dataset") and not _column_exists("dataset", "approved_by_user_id"):
        op.add_column(
            "dataset",
            sa.Column(
                "approved_by_user_id",
                sa.Integer(),
                nullable=True,
                comment="Reviewer who approved the latest completed stage (or final approval).",
            ),
        )

    if _table_exists("dataset_review_stage") and not _column_exists(
        "dataset_review_stage", "approved_by_user_id"
    ):
        op.add_column(
            "dataset_review_stage",
            sa.Column(
                "approved_by_user_id",
                sa.Integer(),
                nullable=True,
                comment="Reviewer whose action completed (approved) this stage.",
            ),
        )


def downgrade() -> None:
    if _table_exists("dataset_review_stage") and _column_exists(
        "dataset_review_stage", "approved_by_user_id"
    ):
        op.drop_column("dataset_review_stage", "approved_by_user_id")

    if _table_exists("dataset") and _column_exists("dataset", "approved_by_user_id"):
        op.drop_column("dataset", "approved_by_user_id")
