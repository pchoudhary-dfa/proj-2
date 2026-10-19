"""Add constraint_data_entry to review_workflow.

Revision ID: 047_add_constraint_data_entry
Revises: 046_rw_audit_cols
Create Date: 2026-04-06

Boolean: when true, this workflow enforces constraints on data entry flows.

Note: revision id must be <= 32 chars (MySQL alembic_version.version_num).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "047_add_constraint_data_entry"
down_revision = "046_rw_audit_cols"
branch_labels = None
depends_on = None


def column_exists(table: str, column: str) -> bool:
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return column in cols


def upgrade() -> None:
    if not column_exists("review_workflow", "constraint_data_entry"):
        op.add_column(
            "review_workflow",
            sa.Column(
                "constraint_data_entry",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="When TRUE, workflow applies constraints on data entry",
            ),
        )


def downgrade() -> None:
    if column_exists("review_workflow", "constraint_data_entry"):
        op.drop_column("review_workflow", "constraint_data_entry")
