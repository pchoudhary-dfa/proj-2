"""Drop workflow_review_rule, workflow_reviewer_rule, workflow_dataentry_user_rule.

Tables replaced by iam_user_role_content extended with workflow_id scope.

Revision ID: 054_drop_wf_rule_tables
Revises: 053_iam_urc_workflow
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "054_drop_wf_rule_tables"
down_revision = "053_iam_urc_workflow"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    # Drop in FK dependency order: reviewer_rule references review_rule
    if _table_exists("workflow_reviewer_rule"):
        op.drop_table("workflow_reviewer_rule")
    if _table_exists("workflow_review_rule"):
        op.drop_table("workflow_review_rule")
    if _table_exists("workflow_dataentry_user_rule"):
        op.drop_table("workflow_dataentry_user_rule")


def downgrade() -> None:
    if not _table_exists("workflow_review_rule"):
        op.create_table(
            "workflow_review_rule",
            sa.Column("workflow_review_rule_id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("workflow_id", sa.Integer(), nullable=False),
            sa.Column("workflow_review_level_id", sa.Integer(), nullable=False),
            sa.Column("review_scope_type", sa.Enum("AREA", "CLASSIFICATION"), nullable=False),
            sa.Column("area_level_id", sa.Integer(), nullable=True),
            sa.Column("indicator_classification_id", sa.Integer(), nullable=True),
            sa.Column("priority", sa.Integer(), server_default=sa.text("0"), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
            sa.Column("created", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["workflow_id"], ["workflow.workflow_id"], name="fk_rwr_workflow_id"),
            sa.ForeignKeyConstraint(["workflow_review_level_id"], ["workflow_review_level.workflow_review_level_id"], name="fk_rwr_workflow_level_id"),
            sa.PrimaryKeyConstraint("workflow_review_rule_id"),
            sa.UniqueConstraint("workflow_review_level_id", "area_level_id", "indicator_classification_id", name="uq_rwr_level_scope"),
        )
        op.create_index("idx_rwr_level", "workflow_review_rule", ["workflow_review_level_id"])
    if not _table_exists("workflow_reviewer_rule"):
        op.create_table(
            "workflow_reviewer_rule",
            sa.Column("reviewer_rule_id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("workflow_id", sa.Integer(), nullable=False),
            sa.Column("workflow_review_level_id", sa.Integer(), nullable=False),
            sa.Column("workflow_review_rule_id", sa.Integer(), nullable=False),
            sa.Column("reviewer_role_id", sa.Integer(), nullable=False),
            sa.Column("area_nid", sa.Integer(), nullable=True),
            sa.Column("indicator_classification_id", sa.Integer(), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("created_user_id", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
            sa.Column("created", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["workflow_id"], ["workflow.workflow_id"], name="fk_rlrr_workflow_id"),
            sa.ForeignKeyConstraint(["workflow_review_level_id"], ["workflow_review_level.workflow_review_level_id"], name="fk_rlrr_workflow_level_id"),
            sa.ForeignKeyConstraint(["workflow_review_rule_id"], ["workflow_review_rule.workflow_review_rule_id"], name="fk_rlrr_workflow_rule_id"),
            sa.PrimaryKeyConstraint("reviewer_rule_id"),
            sa.UniqueConstraint("workflow_review_rule_id", "reviewer_role_id", "area_nid", "indicator_classification_id", "user_id", name="uq_rlrr_assignment"),
        )
        op.create_index("idx_rlrr_level", "workflow_reviewer_rule", ["workflow_review_level_id"])
        op.create_index("idx_rlrr_workflow", "workflow_reviewer_rule", ["workflow_id"])
        op.create_index("idx_rlrr_rule", "workflow_reviewer_rule", ["workflow_review_rule_id"])
    if not _table_exists("workflow_dataentry_user_rule"):
        op.create_table(
            "workflow_dataentry_user_rule",
            sa.Column("dataentry_user_rule_id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("workflow_id", sa.Integer(), nullable=False),
            sa.Column("role_id", sa.Integer(), nullable=False),
            sa.Column("area_nid", sa.Integer(), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
            sa.Column("created", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("created_user_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["workflow_id"], ["workflow.workflow_id"], name="fk_wfde_ur_workflow_id", ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["role_id"], ["iam_role.id"], name="fk_wfde_ur_role_id"),
            sa.PrimaryKeyConstraint("dataentry_user_rule_id"),
            sa.UniqueConstraint("workflow_id", "role_id", "area_nid", "user_id", name="uq_wfde_ur_assignment"),
        )
        op.create_index("idx_wfde_ur_workflow", "workflow_dataentry_user_rule", ["workflow_id"])
        op.create_index("idx_wfde_ur_role", "workflow_dataentry_user_rule", ["role_id"])
