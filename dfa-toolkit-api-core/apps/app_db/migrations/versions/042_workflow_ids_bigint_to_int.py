"""Change ALL workflow BIGINT columns to INT.

Revision ID: 042_workflow_ids_bigint_to_int
Revises: 041_workflow_i18n
Create Date: 2026-04-06

Internal PK/FK columns (require FK drop-alter-recreate cycle):
    review_workflow.workflow_id                               (PK)
    review_workflow.start_level_id                            (FK → review_workflow_level.workflow_level_id)
    review_workflow_i18n.master_id                            (FK → review_workflow.workflow_id)
    review_workflow_level.workflow_level_id                   (PK)
    review_workflow_level.workflow_id                         (FK → review_workflow.workflow_id)
    review_workflow_level_i18n.master_id                      (FK → review_workflow_level.workflow_level_id)
    review_workflow_rule.workflow_rule_id                     (PK)
    review_workflow_rule.workflow_id                          (FK → review_workflow.workflow_id)
    review_workflow_rule.workflow_level_id                    (FK → review_workflow_level.workflow_level_id)
    review_workflow_level_reviewer_rule.reviewer_rule_id      (PK)
    review_workflow_level_reviewer_rule.workflow_id           (FK → review_workflow.workflow_id)
    review_workflow_level_reviewer_rule.workflow_level_id     (FK → review_workflow_level.workflow_level_id)
    review_workflow_level_reviewer_rule.workflow_rule_id      (FK → review_workflow_rule.workflow_rule_id)

External reference columns (plain ALTER, no FK constraints involved):
    review_workflow.dw_id                                     (→ system_datawarehouse.id  : Integer)
    review_workflow.created_by                                (→ iam_user.id              : Integer)
    review_workflow.updated_by                                (→ iam_user.id              : Integer)
    review_workflow_level.classification_parent_nid           (→ ut_indicator_classifications.ic_nid : Integer)
    review_workflow_level.default_reviewer_role_id            (→ iam_role.id              : Integer)
    review_workflow_rule.area_level_id                        (→ ut_area_level.level_nid  : Integer)
    review_workflow_rule.indicator_classification_id          (→ ut_indicator_classifications.ic_nid : Integer)
    review_workflow_level_reviewer_rule.reviewer_role_id      (→ iam_role.id              : Integer)
    review_workflow_level_reviewer_rule.area_nid              (→ ut_area.area_nid         : Integer)
    review_workflow_level_reviewer_rule.indicator_classification_id (→ ut_indicator_classifications.ic_nid : Integer)
    review_workflow_level_reviewer_rule.user_id               (→ iam_user.id              : Integer)
    review_workflow_level_reviewer_rule.created_by            (→ iam_user.id              : Integer)

MySQL requires all FK constraints to be dropped before altering PK/FK column types,
then re-created afterwards.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "042_workflow_ids_bigint_to_int"
down_revision = "041_workflow_i18n"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def fk_exists(table: str, fk_name: str) -> bool:
    return fk_name in [fk["name"] for fk in inspect(op.get_bind()).get_foreign_keys(table)]


def _drop_fk(table: str, fk_name: str) -> None:
    if table_exists(table) and fk_exists(table, fk_name):
        op.drop_constraint(fk_name, table, type_="foreignkey")


def _add_fk(table: str, fk_name: str, local_cols, ref_table: str, ref_cols) -> None:
    if table_exists(table) and not fk_exists(table, fk_name):
        op.create_foreign_key(fk_name, table, ref_table, local_cols, ref_cols)


def _alter(table: str, column: str, col_type, **kw) -> None:
    if table_exists(table):
        op.alter_column(table, column, type_=col_type, **kw)


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # ── Step 1: drop all FK constraints (leaf tables first) ─────────────────

    # review_workflow_level_reviewer_rule  (deepest — references 3 workflow tables)
    _drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_id")
    _drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_level_id")
    _drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_rule_id")

    # review_workflow_rule  (references workflow + level)
    _drop_fk("review_workflow_rule", "fk_rwr_workflow_id")
    _drop_fk("review_workflow_rule", "fk_rwr_workflow_level_id")

    # review_workflow_level_i18n  (references review_workflow_level)
    _drop_fk("review_workflow_level_i18n", "fk_rwli18n_level_id")

    # review_workflow_i18n  (references review_workflow)
    _drop_fk("review_workflow_i18n", "fk_rwi18n_workflow_id")

    # review_workflow_level  (references review_workflow)
    _drop_fk("review_workflow_level", "fk_rwl_workflow_id")

    # review_workflow  (self-referential via start_level_id → review_workflow_level)
    _drop_fk("review_workflow", "fk_rw_start_level_id")

    # ── Step 2: alter PK / FK columns to INT ────────────────────────────────

    # review_workflow
    _alter("review_workflow", "workflow_id",
           sa.Integer(), existing_nullable=False, autoincrement=True)
    _alter("review_workflow", "start_level_id",
           sa.Integer(), existing_nullable=True)

    # review_workflow_i18n
    _alter("review_workflow_i18n", "master_id",
           sa.Integer(), existing_nullable=False)

    # review_workflow_level
    _alter("review_workflow_level", "workflow_level_id",
           sa.Integer(), existing_nullable=False, autoincrement=True)
    _alter("review_workflow_level", "workflow_id",
           sa.Integer(), existing_nullable=False)

    # review_workflow_level_i18n
    _alter("review_workflow_level_i18n", "master_id",
           sa.Integer(), existing_nullable=False)

    # review_workflow_rule
    _alter("review_workflow_rule", "workflow_rule_id",
           sa.Integer(), existing_nullable=False, autoincrement=True)
    _alter("review_workflow_rule", "workflow_id",
           sa.Integer(), existing_nullable=False)
    _alter("review_workflow_rule", "workflow_level_id",
           sa.Integer(), existing_nullable=False)

    # review_workflow_level_reviewer_rule
    _alter("review_workflow_level_reviewer_rule", "reviewer_rule_id",
           sa.Integer(), existing_nullable=False, autoincrement=True)
    _alter("review_workflow_level_reviewer_rule", "workflow_id",
           sa.Integer(), existing_nullable=False)
    _alter("review_workflow_level_reviewer_rule", "workflow_level_id",
           sa.Integer(), existing_nullable=False)
    _alter("review_workflow_level_reviewer_rule", "workflow_rule_id",
           sa.Integer(), existing_nullable=False)

    # ── Step 3: re-create FK constraints ────────────────────────────────────

    _add_fk("review_workflow", "fk_rw_start_level_id",
            ["start_level_id"], "review_workflow_level", ["workflow_level_id"])

    _add_fk("review_workflow_i18n", "fk_rwi18n_workflow_id",
            ["master_id"], "review_workflow", ["workflow_id"])

    _add_fk("review_workflow_level", "fk_rwl_workflow_id",
            ["workflow_id"], "review_workflow", ["workflow_id"])

    _add_fk("review_workflow_level_i18n", "fk_rwli18n_level_id",
            ["master_id"], "review_workflow_level", ["workflow_level_id"])

    _add_fk("review_workflow_rule", "fk_rwr_workflow_id",
            ["workflow_id"], "review_workflow", ["workflow_id"])
    _add_fk("review_workflow_rule", "fk_rwr_workflow_level_id",
            ["workflow_level_id"], "review_workflow_level", ["workflow_level_id"])

    _add_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_id",
            ["workflow_id"], "review_workflow", ["workflow_id"])
    _add_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_level_id",
            ["workflow_level_id"], "review_workflow_level", ["workflow_level_id"])
    _add_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_rule_id",
            ["workflow_rule_id"], "review_workflow_rule", ["workflow_rule_id"])

    # ── Step 4: alter external-reference columns (no FK constraints) ─────────

    # review_workflow
    _alter("review_workflow", "dw_id",        sa.Integer(), existing_nullable=True)
    _alter("review_workflow", "created_by",   sa.Integer(), existing_nullable=True)
    _alter("review_workflow", "updated_by",   sa.Integer(), existing_nullable=True)

    # review_workflow_level
    _alter("review_workflow_level", "classification_parent_nid", sa.Integer(), existing_nullable=True)
    _alter("review_workflow_level", "default_reviewer_role_id",  sa.Integer(), existing_nullable=False)

    # review_workflow_rule
    _alter("review_workflow_rule", "area_level_id",             sa.Integer(), existing_nullable=True)
    _alter("review_workflow_rule", "indicator_classification_id", sa.Integer(), existing_nullable=True)

    # review_workflow_level_reviewer_rule
    _alter("review_workflow_level_reviewer_rule", "reviewer_role_id",           sa.Integer(), existing_nullable=False)
    _alter("review_workflow_level_reviewer_rule", "area_nid",                   sa.Integer(), existing_nullable=True)
    _alter("review_workflow_level_reviewer_rule", "indicator_classification_id", sa.Integer(), existing_nullable=True)
    _alter("review_workflow_level_reviewer_rule", "user_id",                    sa.Integer(), existing_nullable=True)
    _alter("review_workflow_level_reviewer_rule", "created_by",                 sa.Integer(), existing_nullable=True)


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    # ── Step 1: drop FK constraints ─────────────────────────────────────────

    _drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_id")
    _drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_level_id")
    _drop_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_rule_id")
    _drop_fk("review_workflow_rule", "fk_rwr_workflow_id")
    _drop_fk("review_workflow_rule", "fk_rwr_workflow_level_id")
    _drop_fk("review_workflow_level_i18n", "fk_rwli18n_level_id")
    _drop_fk("review_workflow_i18n", "fk_rwi18n_workflow_id")
    _drop_fk("review_workflow_level", "fk_rwl_workflow_id")
    _drop_fk("review_workflow", "fk_rw_start_level_id")

    # ── Step 2: revert columns back to BIGINT ───────────────────────────────

    _alter("review_workflow", "workflow_id",
           sa.BigInteger(), existing_nullable=False, autoincrement=True)
    _alter("review_workflow", "start_level_id",
           sa.BigInteger(), existing_nullable=True)
    _alter("review_workflow_i18n", "master_id",
           sa.BigInteger(), existing_nullable=False)
    _alter("review_workflow_level", "workflow_level_id",
           sa.BigInteger(), existing_nullable=False, autoincrement=True)
    _alter("review_workflow_level", "workflow_id",
           sa.BigInteger(), existing_nullable=False)
    _alter("review_workflow_level_i18n", "master_id",
           sa.BigInteger(), existing_nullable=False)
    _alter("review_workflow_rule", "workflow_rule_id",
           sa.BigInteger(), existing_nullable=False, autoincrement=True)
    _alter("review_workflow_rule", "workflow_id",
           sa.BigInteger(), existing_nullable=False)
    _alter("review_workflow_rule", "workflow_level_id",
           sa.BigInteger(), existing_nullable=False)
    _alter("review_workflow_level_reviewer_rule", "reviewer_rule_id",
           sa.BigInteger(), existing_nullable=False, autoincrement=True)
    _alter("review_workflow_level_reviewer_rule", "workflow_id",
           sa.BigInteger(), existing_nullable=False)
    _alter("review_workflow_level_reviewer_rule", "workflow_level_id",
           sa.BigInteger(), existing_nullable=False)
    _alter("review_workflow_level_reviewer_rule", "workflow_rule_id",
           sa.BigInteger(), existing_nullable=False)

    # ── Step 3: re-create FK constraints ────────────────────────────────────

    _add_fk("review_workflow", "fk_rw_start_level_id",
            ["start_level_id"], "review_workflow_level", ["workflow_level_id"])
    _add_fk("review_workflow_i18n", "fk_rwi18n_workflow_id",
            ["master_id"], "review_workflow", ["workflow_id"])
    _add_fk("review_workflow_level", "fk_rwl_workflow_id",
            ["workflow_id"], "review_workflow", ["workflow_id"])
    _add_fk("review_workflow_level_i18n", "fk_rwli18n_level_id",
            ["master_id"], "review_workflow_level", ["workflow_level_id"])
    _add_fk("review_workflow_rule", "fk_rwr_workflow_id",
            ["workflow_id"], "review_workflow", ["workflow_id"])
    _add_fk("review_workflow_rule", "fk_rwr_workflow_level_id",
            ["workflow_level_id"], "review_workflow_level", ["workflow_level_id"])
    _add_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_id",
            ["workflow_id"], "review_workflow", ["workflow_id"])
    _add_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_level_id",
            ["workflow_level_id"], "review_workflow_level", ["workflow_level_id"])
    _add_fk("review_workflow_level_reviewer_rule", "fk_rlrr_workflow_rule_id",
            ["workflow_rule_id"], "review_workflow_rule", ["workflow_rule_id"])

    # ── Step 4: revert external-reference columns back to BIGINT ─────────────

    _alter("review_workflow", "dw_id",        sa.BigInteger(), existing_nullable=True)
    _alter("review_workflow", "created_by",   sa.BigInteger(), existing_nullable=True)
    _alter("review_workflow", "updated_by",   sa.BigInteger(), existing_nullable=True)

    _alter("review_workflow_level", "classification_parent_nid", sa.BigInteger(), existing_nullable=True)
    _alter("review_workflow_level", "default_reviewer_role_id",  sa.BigInteger(), existing_nullable=False)

    _alter("review_workflow_rule", "area_level_id",              sa.BigInteger(), existing_nullable=True)
    _alter("review_workflow_rule", "indicator_classification_id", sa.BigInteger(), existing_nullable=True)

    _alter("review_workflow_level_reviewer_rule", "reviewer_role_id",            sa.BigInteger(), existing_nullable=False)
    _alter("review_workflow_level_reviewer_rule", "area_nid",                    sa.BigInteger(), existing_nullable=True)
    _alter("review_workflow_level_reviewer_rule", "indicator_classification_id",  sa.BigInteger(), existing_nullable=True)
    _alter("review_workflow_level_reviewer_rule", "user_id",                     sa.BigInteger(), existing_nullable=True)
    _alter("review_workflow_level_reviewer_rule", "created_by",                  sa.BigInteger(), existing_nullable=True)
