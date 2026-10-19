"""Add allow_review column to review_workflow table.

Revision ID: 040_add_allow_review_to_workflow
Revises: 039_system_workflow
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "040_add_allow_review_to_workflow"
down_revision = "039_system_workflow"
branch_labels = None
depends_on = None


def column_exists(table: str, column: str) -> bool:
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return column in cols


def upgrade() -> None:
    if not column_exists("review_workflow", "allow_review"):
        op.add_column(
            "review_workflow",
            sa.Column(
                "allow_review",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="Indicates whether review is allowed for this workflow",
            ),
        )


def downgrade() -> None:
    if column_exists("review_workflow", "allow_review"):
        op.drop_column("review_workflow", "allow_review")
