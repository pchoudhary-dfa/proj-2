"""Rename default_reviewer_role_id to role_id on workflow_review_level.

Revision ID: 055_wf_level_role_id
Revises: 054_drop_wf_rule_tables
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "055_wf_level_role_id"
down_revision = "054_drop_wf_rule_tables"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(op.get_bind()).get_columns(table)]


def upgrade() -> None:
    if (
        _column_exists("workflow_review_level", "default_reviewer_role_id")
        and not _column_exists("workflow_review_level", "role_id")
    ):
        op.execute(text(
            "ALTER TABLE workflow_review_level "
            "CHANGE COLUMN default_reviewer_role_id role_id INT NOT NULL "
            "COMMENT 'Role responsible for reviewing submissions at this level'"
        ))


def downgrade() -> None:
    if (
        _column_exists("workflow_review_level", "role_id")
        and not _column_exists("workflow_review_level", "default_reviewer_role_id")
    ):
        op.execute(text(
            "ALTER TABLE workflow_review_level "
            "CHANGE COLUMN role_id default_reviewer_role_id INT NOT NULL "
            "COMMENT 'Default role responsible for reviewing submissions at this level'"
        ))
