"""Rename workflow tables and add workflow_dataentry_rule.

Revision ID: 049_rename_workflow_tables
Revises: 048_rw_restricts_to_constraint

Renames:
    review_workflow                      → workflow
    review_workflow_i18n                 → workflow_i18n
    review_workflow_level                → workflow_review_level
    review_workflow_level_i18n           → workflow_review_level_i18n
    review_workflow_rule                 → workflow_review_rule
    review_workflow_level_reviewer_rule  → workflow_reviewer_rule

New table workflow_dataentry_rule: data-entry UI constraints (scope_* SINGLE/MULTIPLE,
timeperiod_frequency aligned with ut_timeperiod.periodicity or ALL).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "049_rename_workflow_tables"
down_revision = "048_rw_restricts_to_constraint"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _safe_drop_fk(table: str, fk_name: str) -> None:
    if not table_exists(table):
        return
    bind = op.get_bind()
    insp = inspect(bind)
    for fk in insp.get_foreign_keys(table):
        if fk.get("name") == fk_name:
            op.drop_constraint(fk_name, table, type_="foreignkey")
            return


def upgrade() -> None:
    if table_exists("workflow"):
        _ensure_dataentry_table()
        return

    # Drop FKs (dependencies: children → parents; start_level last on master)
    _safe_drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_id")
    _safe_drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_level_id")
    _safe_drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_rule_id")
    _safe_drop_fk("review_workflow_rule", "fk_rwr_workflow_id")
    _safe_drop_fk("review_workflow_rule", "fk_rwr_workflow_level_id")
    _safe_drop_fk("review_workflow_level_i18n", "fk_rwli18n_level_id")
    _safe_drop_fk("review_workflow_i18n", "fk_rwi18n_workflow_id")
    _safe_drop_fk("review_workflow_level", "fk_rwl_workflow_id")
    _safe_drop_fk("review_workflow", "fk_rw_start_level_id")

    op.rename_table("review_workflow_level_reviewer_rule", "workflow_reviewer_rule")
    op.rename_table("review_workflow_rule", "workflow_review_rule")
    op.rename_table("review_workflow_level_i18n", "workflow_review_level_i18n")
    op.rename_table("review_workflow_level", "workflow_review_level")
    op.rename_table("review_workflow_i18n", "workflow_i18n")
    op.rename_table("review_workflow", "workflow")

    # Recreate FKs (same constraint names)
    op.create_foreign_key(
        "fk_rw_start_level_id",
        "workflow",
        "workflow_review_level",
        ["start_level_id"],
        ["workflow_level_id"],
    )
    op.create_foreign_key(
        "fk_rwi18n_workflow_id",
        "workflow_i18n",
        "workflow",
        ["master_id"],
        ["workflow_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_rwl_workflow_id",
        "workflow_review_level",
        "workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    op.create_foreign_key(
        "fk_rwli18n_level_id",
        "workflow_review_level_i18n",
        "workflow_review_level",
        ["master_id"],
        ["workflow_level_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_rwr_workflow_id",
        "workflow_review_rule",
        "workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    op.create_foreign_key(
        "fk_rwr_workflow_level_id",
        "workflow_review_rule",
        "workflow_review_level",
        ["workflow_level_id"],
        ["workflow_level_id"],
    )
    op.create_foreign_key(
        "fk_rlrr_workflow_id",
        "workflow_reviewer_rule",
        "workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    op.create_foreign_key(
        "fk_rlrr_workflow_level_id",
        "workflow_reviewer_rule",
        "workflow_review_level",
        ["workflow_level_id"],
        ["workflow_level_id"],
    )
    op.create_foreign_key(
        "fk_rlrr_workflow_rule_id",
        "workflow_reviewer_rule",
        "workflow_review_rule",
        ["workflow_rule_id"],
        ["workflow_rule_id"],
    )

    _ensure_dataentry_table()


def _ensure_dataentry_table() -> None:
    if table_exists("workflow_dataentry_rule"):
        return
    op.create_table(
        "workflow_dataentry_rule",
        sa.Column("dataentry_rule_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workflow_id", sa.Integer(), nullable=False, comment="FK workflow.workflow_id"),
        sa.Column(
            "scope_timeperiod",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'SINGLE'"),
            comment="SINGLE or MULTIPLE time periods in data-entry form",
        ),
        sa.Column(
            "scope_indicator",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'SINGLE'"),
            comment="SINGLE or MULTIPLE indicators",
        ),
        sa.Column(
            "scope_area",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'SINGLE'"),
            comment="SINGLE or MULTIPLE areas",
        ),
        sa.Column(
            "timeperiod_frequency",
            sa.String(length=20),
            nullable=True,
            comment="ALL or ut_timeperiod.periodicity code (A,M,Q,H,D,F)",
        ),
        sa.Column(
            "area_level",
            sa.Integer(),
            nullable=True,
            comment="Optional DW ut_area_level.level lower bound",
        ),
        sa.Column(
            "allow_child_areas",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
            comment="Include child areas in scope",
        ),
        sa.Column(
            "show_previous_time",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Show previous time period (meaningful when scope_timeperiod=SINGLE)",
        ),
        sa.Column(
            "role_id",
            sa.Integer(),
            nullable=True,
            comment="Optional FK iam_role.id for data-entry role",
        ),
        sa.Column(
            "created",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("modified", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("dataentry_rule_id"),
        sa.UniqueConstraint("workflow_id", name="uq_wfd_er_workflow"),
        sa.ForeignKeyConstraint(
            ["workflow_id"],
            ["workflow.workflow_id"],
            name="fk_wfd_er_workflow",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["iam_role.id"],
            name="fk_wfd_er_data_entry_role",
        ),
    )


def downgrade() -> None:
    if table_exists("workflow_dataentry_rule"):
        op.drop_constraint("fk_wfd_er_data_entry_role", "workflow_dataentry_rule", type_="foreignkey")
        op.drop_constraint("fk_wfd_er_workflow", "workflow_dataentry_rule", type_="foreignkey")
        op.drop_table("workflow_dataentry_rule")

    if not table_exists("workflow") or table_exists("review_workflow"):
        return

    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_id")
    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_level_id")
    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_rule_id")
    _safe_drop_fk("workflow_review_rule", "fk_rwr_workflow_id")
    _safe_drop_fk("workflow_review_rule", "fk_rwr_workflow_level_id")
    _safe_drop_fk("workflow_review_level_i18n", "fk_rwli18n_level_id")
    _safe_drop_fk("workflow_i18n", "fk_rwi18n_workflow_id")
    _safe_drop_fk("workflow_review_level", "fk_rwl_workflow_id")
    _safe_drop_fk("workflow", "fk_rw_start_level_id")

    op.rename_table("workflow", "review_workflow")
    op.rename_table("workflow_i18n", "review_workflow_i18n")
    op.rename_table("workflow_review_level", "review_workflow_level")
    op.rename_table("workflow_review_level_i18n", "review_workflow_level_i18n")
    op.rename_table("workflow_review_rule", "review_workflow_rule")
    op.rename_table("workflow_reviewer_rule", "review_workflow_level_reviewer_rule")

    op.create_foreign_key(
        "fk_rw_start_level_id",
        "review_workflow",
        "review_workflow_level",
        ["start_level_id"],
        ["workflow_level_id"],
    )
    op.create_foreign_key(
        "fk_rwi18n_workflow_id",
        "review_workflow_i18n",
        "review_workflow",
        ["master_id"],
        ["workflow_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_rwl_workflow_id",
        "review_workflow_level",
        "review_workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    op.create_foreign_key(
        "fk_rwli18n_level_id",
        "review_workflow_level_i18n",
        "review_workflow_level",
        ["master_id"],
        ["workflow_level_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_rwr_workflow_id",
        "review_workflow_rule",
        "review_workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    op.create_foreign_key(
        "fk_rwr_workflow_level_id",
        "review_workflow_rule",
        "review_workflow_level",
        ["workflow_level_id"],
        ["workflow_level_id"],
    )
    op.create_foreign_key(
        "fk_rlrr_workflow_id",
        "review_workflow_level_reviewer_rule",
        "review_workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    op.create_foreign_key(
        "fk_rlrr_workflow_level_id",
        "review_workflow_level_reviewer_rule",
        "review_workflow_level",
        ["workflow_level_id"],
        ["workflow_level_id"],
    )
    op.create_foreign_key(
        "fk_rlrr_workflow_rule_id",
        "review_workflow_level_reviewer_rule",
        "review_workflow_rule",
        ["workflow_rule_id"],
        ["workflow_rule_id"],
    )
