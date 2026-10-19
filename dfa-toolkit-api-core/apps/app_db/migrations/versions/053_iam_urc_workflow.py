"""Extend iam_user_role_content with workflow_id, user_id, role_id for workflow-scoped assignments.

Revision ID: 053_iam_urc_workflow
Revises: 052_wf_de_user_rule
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "053_iam_urc_workflow"
down_revision = "052_wf_de_user_rule"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(op.get_bind()).get_columns(table)]


def _index_exists(table: str, index_name: str) -> bool:
    return any(i["name"] == index_name for i in inspect(op.get_bind()).get_indexes(table))


def upgrade() -> None:
    if not _column_exists("iam_user_role_content", "workflow_id"):
        op.add_column(
            "iam_user_role_content",
            sa.Column(
                "workflow_id",
                sa.Integer(),
                nullable=True,
                comment="FK: workflow.workflow_id; NULL = general IAM content, SET = workflow-scoped assignment",
            ),
        )
        op.create_foreign_key(
            "fk_iam_urc_workflow_id",
            "iam_user_role_content", "workflow",
            ["workflow_id"], ["workflow_id"],
            ondelete="CASCADE",
        )
    if not _column_exists("iam_user_role_content", "user_id"):
        op.add_column(
            "iam_user_role_content",
            sa.Column(
                "user_id",
                sa.Integer(),
                nullable=True,
                comment="Direct user reference for workflow-scoped rows; enables re-resolution after iam_user_role replace",
            ),
        )
    if not _column_exists("iam_user_role_content", "role_id"):
        op.add_column(
            "iam_user_role_content",
            sa.Column(
                "role_id",
                sa.Integer(),
                nullable=True,
                comment="Direct role reference for workflow-scoped rows; used to re-resolve user_role_id after role save",
            ),
        )
    if not _index_exists("iam_user_role_content", "idx_iam_urc_user_workflow"):
        op.create_index(
            "idx_iam_urc_user_workflow",
            "iam_user_role_content",
            ["user_id", "workflow_id"],
        )


def downgrade() -> None:
    if _index_exists("iam_user_role_content", "idx_iam_urc_user_workflow"):
        op.drop_index("idx_iam_urc_user_workflow", table_name="iam_user_role_content")
    if _column_exists("iam_user_role_content", "role_id"):
        op.drop_column("iam_user_role_content", "role_id")
    if _column_exists("iam_user_role_content", "user_id"):
        op.drop_column("iam_user_role_content", "user_id")
    if _column_exists("iam_user_role_content", "workflow_id"):
        op.drop_constraint("fk_iam_urc_workflow_id", "iam_user_role_content", type_="foreignkey")
        op.drop_column("iam_user_role_content", "workflow_id")
