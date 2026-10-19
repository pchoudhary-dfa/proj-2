"""Create review_workflow, review_workflow_level, review_workflow_rule, review_workflow_level_reviewer_rule tables.

Revision ID: 039_system_workflow
Revises: 038_create_system_bg_job_queue
Create Date: 2026-03-30

Architecture:
    review_workflow               → Master workflow policy definition
    review_workflow_level         → Ordered review stages within a workflow
    review_workflow_rule          → Scope configuration per level (config data)
    review_workflow_level_reviewer_rule    → Runtime reviewer execution mapping (runtime data)

Circular FK note:
    review_workflow.start_level_id → review_workflow_level.workflow_level_id
    review_workflow_level.workflow_id → review_workflow.workflow_id
    Resolved by creating review_workflow first without the start_level_id FK,
    then adding the FK constraint after review_workflow_level is created.

include_childs:
    FALSE → reviewer handles only their own scope level
    TRUE  → reviewer handles their level and all child levels;
            if is_final_level=TRUE the rule uses NULL/NULL sentinel (accepts any scope)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "039_system_workflow"
down_revision = "038_create_system_bg_job_queue"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # Table 1: review_workflow (without start_level_id FK — added after level table)
    # -------------------------------------------------------------------------
    if not table_exists("review_workflow"):
        op.create_table(
            "review_workflow",
            sa.Column(
                "workflow_id",
                sa.BigInteger(),
                autoincrement=True,
                nullable=False,
                comment="Internal surrogate primary key",
            ),
            sa.Column(
                "workflow_code",
                sa.String(length=50),
                nullable=False,
                comment="Business code used for configuration and API reference",
            ),
            sa.Column(
                "workflow_name",
                sa.String(length=255),
                nullable=False,
                comment="Human-readable workflow name",
            ),
            sa.Column(
                "review_scope_type",
                sa.Enum("AREA", "CLASSIFICATION", "HYBRID"),
                nullable=False,
                comment="Defines whether workflow operates on area hierarchy, classification hierarchy, or both",
            ),
            sa.Column(
                "description",
                sa.Text(),
                nullable=True,
                comment="Optional description of workflow purpose",
            ),
            sa.Column(
                "start_level_id",
                sa.BigInteger(),
                nullable=True,
                comment="First workflow level where execution begins; NULL means start from lowest level_no",
            ),
            sa.Column(
                "dw_id",
                sa.BigInteger(),
                nullable=True,
                comment="Datawarehouse scope; NULL = global workflow applicable to all datawarehouses",
            ),
            sa.Column(
                "review_level_count",
                sa.SmallInteger(),
                nullable=False,
                server_default=sa.text("0"),
                comment="Total number of active workflow levels",
            ),
            sa.Column(
                "priority",
                sa.Integer(),
                nullable=False,
                comment="Workflow selection precedence; lower value = higher priority",
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
                comment="Indicates whether workflow is currently usable",
            ),
            sa.Column(
                "is_system",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="TRUE = system-managed workflow; FALSE = user-defined workflow",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
                comment="Record creation timestamp",
            ),
            sa.Column(
                "created_by",
                sa.BigInteger(),
                nullable=True,
                comment="User who created the workflow",
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=True,
                comment="Last modification timestamp",
            ),
            sa.Column(
                "updated_by",
                sa.BigInteger(),
                nullable=True,
                comment="User who last updated the workflow",
            ),
            sa.PrimaryKeyConstraint("workflow_id"),
            sa.UniqueConstraint("workflow_code", name="uq_rw_workflow_code"),
        )
        op.create_index("idx_rw_priority", "review_workflow", ["priority"])

    # -------------------------------------------------------------------------
    # Table 2: review_workflow_level
    # -------------------------------------------------------------------------
    if not table_exists("review_workflow_level"):
        op.create_table(
            "review_workflow_level",
            sa.Column(
                "workflow_level_id",
                sa.BigInteger(),
                autoincrement=True,
                nullable=False,
                comment="Internal surrogate primary key",
            ),
            sa.Column(
                "workflow_id",
                sa.BigInteger(),
                nullable=False,
                comment="Parent workflow identifier",
            ),
            sa.Column(
                "level_no",
                sa.Integer(),
                nullable=False,
                comment="Execution order of this level within the workflow",
            ),
            sa.Column(
                "level_name",
                sa.String(length=100),
                nullable=True,
                comment="Optional descriptive name for the workflow level",
            ),
            sa.Column(
                "review_scope_type",
                sa.Enum("AREA", "CLASSIFICATION"),
                nullable=False,
                comment="Scope domain used by this level",
            ),
            sa.Column(
                "area_level",
                sa.Integer(),
                nullable=True,
                comment="Applicable area level identifier when review_scope_type = AREA",
            ),
            sa.Column(
                "classification_parent_nid",
                sa.BigInteger(),
                nullable=True,
                comment="Applicable classification node identifier when review_scope_type = CLASSIFICATION",
            ),
            sa.Column(
                "default_reviewer_role_id",
                sa.BigInteger(),
                nullable=False,
                comment="Default role responsible for reviewing submissions at this level",
            ),
            sa.Column(
                "include_childs",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="FALSE = reviewer handles only their own scope level; TRUE = includes child levels",
            ),
            sa.Column(
                "is_final_level",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="Indicates whether this is the terminal workflow level",
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
                comment="Indicates whether this level is currently active",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
                comment="Record creation timestamp",
            ),
            sa.PrimaryKeyConstraint("workflow_level_id"),
            sa.UniqueConstraint("workflow_id", "level_no", name="uq_rwl_workflow_level"),
            sa.ForeignKeyConstraint(
                ["workflow_id"],
                ["review_workflow.workflow_id"],
                name="fk_rwl_workflow_id",
            ),
        )
        op.create_index("idx_rwl_workflow", "review_workflow_level", ["workflow_id"])

    # -------------------------------------------------------------------------
    # Add deferred FK: review_workflow.start_level_id → review_workflow_level.workflow_level_id
    # -------------------------------------------------------------------------
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_fks = [fk["name"] for fk in inspector.get_foreign_keys("review_workflow")]
    if "fk_rw_start_level_id" not in existing_fks:
        op.create_foreign_key(
            "fk_rw_start_level_id",
            "review_workflow",
            "review_workflow_level",
            ["start_level_id"],
            ["workflow_level_id"],
        )

    # -------------------------------------------------------------------------
    # Table 3: review_workflow_rule
    # area_level_id and indicator_classification_id replace the old scope_entity_key
    # -------------------------------------------------------------------------
    if not table_exists("review_workflow_rule"):
        op.create_table(
            "review_workflow_rule",
            sa.Column(
                "workflow_rule_id",
                sa.BigInteger(),
                autoincrement=True,
                nullable=False,
                comment="Internal surrogate primary key",
            ),
            sa.Column(
                "workflow_id",
                sa.BigInteger(),
                nullable=False,
                comment="Parent workflow identifier",
            ),
            sa.Column(
                "workflow_level_id",
                sa.BigInteger(),
                nullable=False,
                comment="Associated workflow level",
            ),
            sa.Column(
                "review_scope_type",
                sa.Enum("AREA", "CLASSIFICATION"),
                nullable=False,
                comment="Domain type of the scope entity",
            ),
            sa.Column(
                "area_level_id",
                sa.BigInteger(),
                nullable=True,
                comment="Area level identifier when review_scope_type = AREA; NULL = accepts any (final level sentinel)",
            ),
            sa.Column(
                "indicator_classification_id",
                sa.BigInteger(),
                nullable=True,
                comment="Classification node identifier when review_scope_type = CLASSIFICATION; NULL = accepts any",
            ),
            sa.Column(
                "priority",
                sa.Integer(),
                nullable=True,
                server_default=sa.text("0"),
                comment="Rule evaluation priority; lower value = higher precedence",
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
                comment="Indicates whether rule is currently active",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
                comment="Record creation timestamp",
            ),
            sa.PrimaryKeyConstraint("workflow_rule_id"),
            sa.UniqueConstraint(
                "workflow_level_id",
                "area_level_id",
                "indicator_classification_id",
                name="uq_rwr_level_scope",
            ),
            sa.ForeignKeyConstraint(
                ["workflow_id"],
                ["review_workflow.workflow_id"],
                name="fk_rwr_workflow_id",
            ),
            sa.ForeignKeyConstraint(
                ["workflow_level_id"],
                ["review_workflow_level.workflow_level_id"],
                name="fk_rwr_workflow_level_id",
            ),
        )
        op.create_index("idx_rwr_level", "review_workflow_rule", ["workflow_level_id"])

    # -------------------------------------------------------------------------
    # Table 4: review_workflow_level_reviewer_rule
    # -------------------------------------------------------------------------
    if not table_exists("review_workflow_level_reviewer_rule"):
        op.create_table(
            "review_workflow_level_reviewer_rule",
            sa.Column(
                "reviewer_rule_id",
                sa.BigInteger(),
                autoincrement=True,
                nullable=False,
                comment="Internal surrogate primary key",
            ),
            sa.Column(
                "workflow_id",
                sa.BigInteger(),
                nullable=False,
                comment="Associated workflow",
            ),
            sa.Column(
                "workflow_level_id",
                sa.BigInteger(),
                nullable=False,
                comment="Associated workflow level",
            ),
            sa.Column(
                "workflow_rule_id",
                sa.BigInteger(),
                nullable=False,
                comment="Source rule used to generate this assignment",
            ),
            sa.Column(
                "reviewer_role_id",
                sa.BigInteger(),
                nullable=False,
                comment="Role responsible for reviewing this entity",
            ),
            sa.Column(
                "area_nid",
                sa.BigInteger(),
                nullable=True,
                comment="Area identifier when scope type is AREA",
            ),
            sa.Column(
                "indicator_classification_id",
                sa.BigInteger(),
                nullable=True,
                comment="Classification identifier when scope type is CLASSIFICATION",
            ),
            sa.Column(
                "user_id",
                sa.BigInteger(),
                nullable=True,
                comment="Optional user-specific override assignment",
            ),
            sa.Column(
                "created_by",
                sa.BigInteger(),
                nullable=True,
                comment="User who created the assignment",
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
                comment="Indicates whether assignment is currently valid",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
                comment="Record creation timestamp",
            ),
            sa.PrimaryKeyConstraint("reviewer_rule_id"),
            sa.UniqueConstraint(
                "workflow_rule_id",
                "reviewer_role_id",
                "area_nid",
                "indicator_classification_id",
                "user_id",
                name="uq_rlrr_assignment",
            ),
            sa.ForeignKeyConstraint(
                ["workflow_id"],
                ["review_workflow.workflow_id"],
                name="fk_rlrr_workflow_id",
            ),
            sa.ForeignKeyConstraint(
                ["workflow_level_id"],
                ["review_workflow_level.workflow_level_id"],
                name="fk_rlrr_workflow_level_id",
            ),
            sa.ForeignKeyConstraint(
                ["workflow_rule_id"],
                ["review_workflow_rule.workflow_rule_id"],
                name="fk_rlrr_workflow_rule_id",
            ),
        )
        op.create_index("idx_rlrr_level", "review_workflow_level_reviewer_rule", ["workflow_level_id"])
        op.create_index("idx_rlrr_workflow", "review_workflow_level_reviewer_rule", ["workflow_id"])
        op.create_index("idx_rlrr_rule", "review_workflow_level_reviewer_rule", ["workflow_rule_id"])


def downgrade() -> None:
    if table_exists("review_workflow_level_reviewer_rule"):
        op.drop_index("idx_rlrr_rule", table_name="review_workflow_level_reviewer_rule")
        op.drop_index("idx_rlrr_workflow", table_name="review_workflow_level_reviewer_rule")
        op.drop_index("idx_rlrr_level", table_name="review_workflow_level_reviewer_rule")
        op.drop_table("review_workflow_level_reviewer_rule")

    if table_exists("review_workflow_rule"):
        op.drop_index("idx_rwr_level", table_name="review_workflow_rule")
        op.drop_table("review_workflow_rule")

    # Drop the deferred FK before dropping review_workflow_level
    bind = op.get_bind()
    inspector = inspect(bind)
    if table_exists("review_workflow"):
        existing_fks = [fk["name"] for fk in inspector.get_foreign_keys("review_workflow")]
        if "fk_rw_start_level_id" in existing_fks:
            op.drop_constraint("fk_rw_start_level_id", "review_workflow", type_="foreignkey")

    if table_exists("review_workflow_level"):
        op.drop_index("idx_rwl_workflow", table_name="review_workflow_level")
        op.drop_table("review_workflow_level")

    if table_exists("review_workflow"):
        op.drop_index("idx_rw_priority", table_name="review_workflow")
        op.drop_table("review_workflow")
