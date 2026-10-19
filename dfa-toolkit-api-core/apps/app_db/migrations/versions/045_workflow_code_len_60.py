"""Extend review_workflow.workflow_code from VARCHAR(50) to VARCHAR(60).

Revision ID: 045_workflow_code_len_60
Revises: 044_rename_workflow_audit_cols
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "045_workflow_code_len_60"
down_revision = "044_rename_workflow_audit_cols"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if table_exists("review_workflow"):
        op.alter_column(
            "review_workflow",
            "workflow_code",
            type_=sa.String(60),
            existing_nullable=False,
        )


def downgrade() -> None:
    if table_exists("review_workflow"):
        op.alter_column(
            "review_workflow",
            "workflow_code",
            type_=sa.String(50),
            existing_nullable=False,
        )
