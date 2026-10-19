"""Create workflow_dataentry_user_rule table for per-area user assignments.

Revision ID: 052_wf_de_user_rule
Revises: 051_wfde_rule_user_ids
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "052_wf_de_user_rule"
down_revision = "051_wfde_rule_user_ids"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _table_exists("workflow_dataentry_user_rule"):
        return
    op.create_table(
        "workflow_dataentry_user_rule",
        sa.Column("dataentry_user_rule_id", sa.Integer(), autoincrement=True, nullable=False, comment="Internal surrogate primary key"),
        sa.Column("workflow_id", sa.Integer(), nullable=False, comment="FK: workflow.workflow_id"),
        sa.Column("role_id", sa.Integer(), nullable=False, comment="Data-entry IAM role"),
        sa.Column("area_nid", sa.Integer(), nullable=True, comment="Area identifier; NULL = all areas for this role"),
        sa.Column("user_id", sa.Integer(), nullable=True, comment="Specific user override; NULL = role-based"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False, comment="Indicates whether assignment is active"),
        sa.Column("created", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False, comment="Record creation timestamp"),
        sa.Column("created_user_id", sa.Integer(), nullable=True, comment="User who created the assignment"),
        sa.ForeignKeyConstraint(["workflow_id"], ["workflow.workflow_id"], name="fk_wfde_ur_workflow_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["iam_role.id"], name="fk_wfde_ur_role_id"),
        sa.PrimaryKeyConstraint("dataentry_user_rule_id"),
        sa.UniqueConstraint("workflow_id", "role_id", "area_nid", "user_id", name="uq_wfde_ur_assignment"),
    )
    op.create_index("idx_wfde_ur_workflow", "workflow_dataentry_user_rule", ["workflow_id"])
    op.create_index("idx_wfde_ur_role", "workflow_dataentry_user_rule", ["role_id"])


def downgrade() -> None:
    if not _table_exists("workflow_dataentry_user_rule"):
        return
    # MySQL 1553: drop FK constraints before dropping the indexes they depend on.
    op.drop_constraint("fk_wfde_ur_role_id", "workflow_dataentry_user_rule", type_="foreignkey")
    op.drop_constraint("fk_wfde_ur_workflow_id", "workflow_dataentry_user_rule", type_="foreignkey")
    op.drop_index("idx_wfde_ur_role", table_name="workflow_dataentry_user_rule")
    op.drop_index("idx_wfde_ur_workflow", table_name="workflow_dataentry_user_rule")
    op.drop_table("workflow_dataentry_user_rule")
