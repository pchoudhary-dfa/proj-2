"""Rename audit columns in review_workflow to match master-table convention.

Revision ID: 046_rw_audit_cols
Revises: 045_workflow_code_len_60
Create Date: 2026-04-06

Changes:
    review_workflow.created_at  → created
    review_workflow.created_by  → created_user_id
    review_workflow.updated_at  → modified
    review_workflow.updated_by  → modified_user_id

(review_workflow_level, review_workflow_rule, and
review_workflow_level_reviewer_rule were handled in migration 044.)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "046_rw_audit_cols"
down_revision = "045_workflow_code_len_60"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def column_exists(table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(op.get_bind()).get_columns(table)]


def upgrade() -> None:
    if not table_exists("review_workflow"):
        return

    if column_exists("review_workflow", "created_at"):
        op.alter_column(
            "review_workflow",
            "created_at",
            new_column_name="created",
            existing_type=sa.DateTime(),
            existing_nullable=False,
            existing_server_default=text("CURRENT_TIMESTAMP"),
        )
    if column_exists("review_workflow", "created_by"):
        op.alter_column(
            "review_workflow",
            "created_by",
            new_column_name="created_user_id",
            existing_type=sa.Integer(),
            existing_nullable=True,
        )
    if column_exists("review_workflow", "updated_at"):
        op.alter_column(
            "review_workflow",
            "updated_at",
            new_column_name="modified",
            existing_type=sa.DateTime(),
            existing_nullable=True,
        )
    if column_exists("review_workflow", "updated_by"):
        op.alter_column(
            "review_workflow",
            "updated_by",
            new_column_name="modified_user_id",
            existing_type=sa.Integer(),
            existing_nullable=True,
        )


def downgrade() -> None:
    if not table_exists("review_workflow"):
        return

    if column_exists("review_workflow", "modified_user_id"):
        op.alter_column(
            "review_workflow",
            "modified_user_id",
            new_column_name="updated_by",
            existing_type=sa.Integer(),
            existing_nullable=True,
        )
    if column_exists("review_workflow", "modified"):
        op.alter_column(
            "review_workflow",
            "modified",
            new_column_name="updated_at",
            existing_type=sa.DateTime(),
            existing_nullable=True,
        )
    if column_exists("review_workflow", "created_user_id"):
        op.alter_column(
            "review_workflow",
            "created_user_id",
            new_column_name="created_by",
            existing_type=sa.Integer(),
            existing_nullable=True,
        )
    if column_exists("review_workflow", "created"):
        op.alter_column(
            "review_workflow",
            "created",
            new_column_name="created_at",
            existing_type=sa.DateTime(),
            existing_nullable=False,
            existing_server_default=text("CURRENT_TIMESTAMP"),
        )
