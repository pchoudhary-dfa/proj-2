"""Add created_user_id and modified_user_id to workflow_dataentry_rule.

Revision ID: 051_wfde_rule_user_ids
Revises: 050_workflow_schema_finalize
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "051_wfde_rule_user_ids"
down_revision = "050_workflow_schema_finalize"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(op.get_bind()).get_columns(table)]


def upgrade() -> None:
    if not _table_exists("workflow_dataentry_rule"):
        return
    if not _column_exists("workflow_dataentry_rule", "created_user_id"):
        op.add_column(
            "workflow_dataentry_rule",
            sa.Column(
                "created_user_id",
                sa.Integer(),
                nullable=True,
                comment="User who created the data-entry rule",
            ),
        )
    if not _column_exists("workflow_dataentry_rule", "modified_user_id"):
        op.add_column(
            "workflow_dataentry_rule",
            sa.Column(
                "modified_user_id",
                sa.Integer(),
                nullable=True,
                comment="User who last updated the data-entry rule",
            ),
        )


def downgrade() -> None:
    if not _table_exists("workflow_dataentry_rule"):
        return
    if _column_exists("workflow_dataentry_rule", "modified_user_id"):
        op.drop_column("workflow_dataentry_rule", "modified_user_id")
    if _column_exists("workflow_dataentry_rule", "created_user_id"):
        op.drop_column("workflow_dataentry_rule", "created_user_id")
