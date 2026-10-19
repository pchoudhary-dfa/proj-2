"""Finalize workflow schema: FK/PK column names + workflow_dataentry_rule renames.

Revision ID: 050_workflow_schema_finalize
Revises: 049_rename_workflow_tables

Combines former 050 + 051 + 052 (052 was only needed if an old 050 had renamed
i18n columns; this revision keeps workflow_i18n / workflow_review_level_i18n
PK column name master_id throughout).

Workflow table renames:
    workflow.start_level_id → start_workflow_review_level_id
    workflow_review_level.workflow_level_id → workflow_review_level_id (PK)
    workflow_review_rule.workflow_rule_id → workflow_review_rule_id (PK)
    workflow_review_rule.workflow_level_id → workflow_review_level_id (FK)
    workflow_reviewer_rule.workflow_level_id → workflow_review_level_id
    workflow_reviewer_rule.workflow_rule_id → workflow_review_rule_id

workflow_dataentry_rule renames (skipped if columns already use new names):
    indicator_scope → scope_indicator
    area_scope → scope_area
    time_period_scope → scope_timeperiod
    time_period_periodicity → timeperiod_frequency
    lower_area_level_nid → area_level
    data_entry_role_id → role_id

MySQL: PK on an AUTO_INCREMENT column cannot be dropped until AUTO_INCREMENT is
removed (MODIFY ... INT NOT NULL without AUTO_INCREMENT).

Drops/creates for indexes, uniques, and FKs use introspection so reruns and DBs
with slightly different metadata (e.g. unique missing) do not fail.
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "050_workflow_schema_finalize"
down_revision = "049_rename_workflow_tables"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    if not _table_exists(table):
        return False
    return column in [c["name"] for c in inspect(op.get_bind()).get_columns(table)]


def _safe_drop_fk(table: str, fk_name: str) -> None:
    if not _table_exists(table):
        return
    bind = op.get_bind()
    insp = inspect(bind)
    for fk in insp.get_foreign_keys(table):
        if fk.get("name") == fk_name:
            op.drop_constraint(fk_name, table, type_="foreignkey")
            return


def _safe_drop_index(table: str, idx: str) -> None:
    if not _table_exists(table):
        return
    bind = op.get_bind()
    insp = inspect(bind)
    if idx in {i["name"] for i in insp.get_indexes(table)}:
        op.drop_index(idx, table_name=table)


def _unique_names_on_table(table: str) -> set:
    """Names of unique constraints / unique indexes (MySQL overlaps both)."""
    if not _table_exists(table):
        return set()
    insp = inspect(op.get_bind())
    names = {c["name"] for c in insp.get_unique_constraints(table) if c.get("name")}
    for ix in insp.get_indexes(table):
        if ix.get("unique") and ix.get("name"):
            names.add(ix["name"])
    return names


def _safe_drop_unique(table: str, name: str) -> None:
    if not _table_exists(table) or name not in _unique_names_on_table(table):
        return
    insp = inspect(op.get_bind())
    if any(uc.get("name") == name for uc in insp.get_unique_constraints(table)):
        op.drop_constraint(name, table, type_="unique")
    else:
        op.drop_index(name, table_name=table)


def _index_names_on_table(table: str) -> set:
    if not _table_exists(table):
        return set()
    return {i["name"] for i in inspect(op.get_bind()).get_indexes(table)}


def _safe_create_index(name: str, table: str, columns: list) -> None:
    if not _table_exists(table) or name in _index_names_on_table(table):
        return
    op.create_index(name, table, columns)


def _safe_create_unique(name: str, table: str, columns: list) -> None:
    if not _table_exists(table) or name in _unique_names_on_table(table):
        return
    op.create_unique_constraint(name, table, columns)


def _fk_names_on_table(table: str) -> set:
    if not _table_exists(table):
        return set()
    return {fk["name"] for fk in inspect(op.get_bind()).get_foreign_keys(table) if fk.get("name")}


def _safe_create_foreign_key(
    constraint_name: str,
    source_table: str,
    referent_table: str,
    local_cols: list,
    remote_cols: list,
    **kw,
) -> None:
    if not _table_exists(source_table) or constraint_name in _fk_names_on_table(source_table):
        return
    op.create_foreign_key(
        constraint_name, source_table, referent_table, local_cols, remote_cols, **kw
    )


def _ensure_workflow_post_rename_indexes_uniques_fks() -> None:
    """Recreate indexes, uniques, FKs after PK/column renames (idempotent)."""
    _safe_create_index(
        "idx_rwr_level",
        "workflow_review_rule",
        ["workflow_review_level_id"],
    )
    _safe_create_unique(
        "uq_rwr_level_scope",
        "workflow_review_rule",
        ["workflow_review_level_id", "area_level_id", "indicator_classification_id"],
    )
    _safe_create_index(
        "idx_rlrr_level",
        "workflow_reviewer_rule",
        ["workflow_review_level_id"],
    )
    _safe_create_index(
        "idx_rlrr_rule",
        "workflow_reviewer_rule",
        ["workflow_review_rule_id"],
    )
    _safe_create_unique(
        "uq_rlrr_assignment",
        "workflow_reviewer_rule",
        [
            "workflow_review_rule_id",
            "reviewer_role_id",
            "area_nid",
            "indicator_classification_id",
            "user_id",
        ],
    )

    _safe_create_foreign_key(
        "fk_rw_start_level_id",
        "workflow",
        "workflow_review_level",
        ["start_workflow_review_level_id"],
        ["workflow_review_level_id"],
    )
    _safe_create_foreign_key(
        "fk_rwi18n_workflow_id",
        "workflow_i18n",
        "workflow",
        ["master_id"],
        ["workflow_id"],
        ondelete="CASCADE",
    )
    _safe_create_foreign_key(
        "fk_rwl_workflow_id",
        "workflow_review_level",
        "workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    _safe_create_foreign_key(
        "fk_rwli18n_level_id",
        "workflow_review_level_i18n",
        "workflow_review_level",
        ["master_id"],
        ["workflow_review_level_id"],
        ondelete="CASCADE",
    )
    _safe_create_foreign_key(
        "fk_rwr_workflow_id",
        "workflow_review_rule",
        "workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    _safe_create_foreign_key(
        "fk_rwr_workflow_level_id",
        "workflow_review_rule",
        "workflow_review_level",
        ["workflow_review_level_id"],
        ["workflow_review_level_id"],
    )
    _safe_create_foreign_key(
        "fk_rlrr_workflow_id",
        "workflow_reviewer_rule",
        "workflow",
        ["workflow_id"],
        ["workflow_id"],
    )
    _safe_create_foreign_key(
        "fk_rlrr_workflow_level_id",
        "workflow_reviewer_rule",
        "workflow_review_level",
        ["workflow_review_level_id"],
        ["workflow_review_level_id"],
    )
    _safe_create_foreign_key(
        "fk_rlrr_workflow_rule_id",
        "workflow_reviewer_rule",
        "workflow_review_rule",
        ["workflow_review_rule_id"],
        ["workflow_review_rule_id"],
    )


def upgrade() -> None:
    _upgrade_workflow_fk_and_pk_columns()
    _upgrade_workflow_dataentry_columns()


def _upgrade_workflow_fk_and_pk_columns() -> None:
    if not _table_exists("workflow"):
        return
    if _column_exists("workflow_review_level", "workflow_review_level_id"):
        _ensure_workflow_post_rename_indexes_uniques_fks()
        return

    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_rule_id")
    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_level_id")
    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_id")
    _safe_drop_fk("workflow_review_rule", "fk_rwr_workflow_level_id")
    _safe_drop_fk("workflow_review_rule", "fk_rwr_workflow_id")
    _safe_drop_fk("workflow_review_level_i18n", "fk_rwli18n_level_id")
    _safe_drop_fk("workflow_i18n", "fk_rwi18n_workflow_id")
    _safe_drop_fk("workflow_review_level", "fk_rwl_workflow_id")
    _safe_drop_fk("workflow", "fk_rw_start_level_id")

    _safe_drop_unique("workflow_review_rule", "uq_rwr_level_scope")
    _safe_drop_unique("workflow_reviewer_rule", "uq_rlrr_assignment")
    _safe_drop_index("workflow_review_rule", "idx_rwr_level")
    _safe_drop_index("workflow_reviewer_rule", "idx_rlrr_level")
    _safe_drop_index("workflow_reviewer_rule", "idx_rlrr_rule")

    # MySQL: cannot DROP PRIMARY KEY while an AUTO_INCREMENT column depends on it.
    op.execute(text("ALTER TABLE workflow_review_level MODIFY workflow_level_id INT NOT NULL"))
    op.drop_constraint("PRIMARY", "workflow_review_level", type_="primary")
    op.execute(
        text(
            "ALTER TABLE workflow_review_level CHANGE COLUMN workflow_level_id "
            "workflow_review_level_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY"
        )
    )

    op.execute(text("ALTER TABLE workflow_review_rule MODIFY workflow_rule_id INT NOT NULL"))
    op.drop_constraint("PRIMARY", "workflow_review_rule", type_="primary")
    op.execute(
        text(
            "ALTER TABLE workflow_review_rule CHANGE COLUMN workflow_rule_id "
            "workflow_review_rule_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_review_rule CHANGE COLUMN workflow_level_id "
            "workflow_review_level_id INT NOT NULL"
        )
    )

    op.execute(
        text(
            "ALTER TABLE workflow_reviewer_rule CHANGE COLUMN workflow_level_id "
            "workflow_review_level_id INT NOT NULL"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_reviewer_rule CHANGE COLUMN workflow_rule_id "
            "workflow_review_rule_id INT NOT NULL"
        )
    )

    op.execute(
        text(
            "ALTER TABLE workflow CHANGE COLUMN start_level_id "
            "start_workflow_review_level_id INT NULL"
        )
    )

    _ensure_workflow_post_rename_indexes_uniques_fks()


def _upgrade_workflow_dataentry_columns() -> None:
    if not _table_exists("workflow_dataentry_rule") or _column_exists("workflow_dataentry_rule", "scope_indicator"):
        return

    _safe_drop_fk("workflow_dataentry_rule", "fk_wfd_er_data_entry_role")

    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN indicator_scope "
            "scope_indicator VARCHAR(16) NOT NULL DEFAULT 'SINGLE'"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN area_scope "
            "scope_area VARCHAR(16) NOT NULL DEFAULT 'SINGLE'"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN time_period_scope "
            "scope_timeperiod VARCHAR(16) NOT NULL DEFAULT 'SINGLE'"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN time_period_periodicity "
            "timeperiod_frequency VARCHAR(20) NULL"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN lower_area_level_nid area_level INT NULL"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN data_entry_role_id role_id INT NULL"
        )
    )

    _safe_create_foreign_key(
        "fk_wfd_er_data_entry_role",
        "workflow_dataentry_rule",
        "iam_role",
        ["role_id"],
        ["id"],
    )


def downgrade() -> None:
    _downgrade_workflow_dataentry_columns()
    _downgrade_workflow_fk_and_pk_columns()


def _downgrade_workflow_dataentry_columns() -> None:
    if not _table_exists("workflow_dataentry_rule") or not _column_exists("workflow_dataentry_rule", "scope_indicator"):
        return

    _safe_drop_fk("workflow_dataentry_rule", "fk_wfd_er_data_entry_role")

    op.execute(
        text("ALTER TABLE workflow_dataentry_rule CHANGE COLUMN role_id data_entry_role_id INT NULL")
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN area_level lower_area_level_nid INT NULL"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN timeperiod_frequency "
            "time_period_periodicity VARCHAR(20) NULL"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN scope_timeperiod "
            "time_period_scope VARCHAR(16) NOT NULL DEFAULT 'SINGLE'"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN scope_area "
            "area_scope VARCHAR(16) NOT NULL DEFAULT 'SINGLE'"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_dataentry_rule CHANGE COLUMN scope_indicator "
            "indicator_scope VARCHAR(16) NOT NULL DEFAULT 'SINGLE'"
        )
    )

    _safe_create_foreign_key(
        "fk_wfd_er_data_entry_role",
        "workflow_dataentry_rule",
        "iam_role",
        ["data_entry_role_id"],
        ["id"],
    )


def _downgrade_workflow_fk_and_pk_columns() -> None:
    if not _table_exists("workflow") or not _column_exists("workflow_review_level", "workflow_review_level_id"):
        return

    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_rule_id")
    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_level_id")
    _safe_drop_fk("workflow_reviewer_rule", "fk_rlrr_workflow_id")
    _safe_drop_fk("workflow_review_rule", "fk_rwr_workflow_level_id")
    _safe_drop_fk("workflow_review_rule", "fk_rwr_workflow_id")
    _safe_drop_fk("workflow_review_level_i18n", "fk_rwli18n_level_id")
    _safe_drop_fk("workflow_i18n", "fk_rwi18n_workflow_id")
    _safe_drop_fk("workflow_review_level", "fk_rwl_workflow_id")
    _safe_drop_fk("workflow", "fk_rw_start_level_id")

    _safe_drop_unique("workflow_review_rule", "uq_rwr_level_scope")
    _safe_drop_unique("workflow_reviewer_rule", "uq_rlrr_assignment")
    _safe_drop_index("workflow_review_rule", "idx_rwr_level")
    _safe_drop_index("workflow_reviewer_rule", "idx_rlrr_level")
    _safe_drop_index("workflow_reviewer_rule", "idx_rlrr_rule")

    op.execute(
        text(
            "ALTER TABLE workflow CHANGE COLUMN start_workflow_review_level_id "
            "start_level_id INT NULL"
        )
    )

    op.execute(
        text(
            "ALTER TABLE workflow_reviewer_rule CHANGE COLUMN workflow_review_rule_id "
            "workflow_rule_id INT NOT NULL"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_reviewer_rule CHANGE COLUMN workflow_review_level_id "
            "workflow_level_id INT NOT NULL"
        )
    )

    op.execute(text("ALTER TABLE workflow_review_rule MODIFY workflow_review_rule_id INT NOT NULL"))
    op.drop_constraint("PRIMARY", "workflow_review_rule", type_="primary")
    op.execute(
        text(
            "ALTER TABLE workflow_review_rule CHANGE COLUMN workflow_review_rule_id "
            "workflow_rule_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY"
        )
    )
    op.execute(
        text(
            "ALTER TABLE workflow_review_rule CHANGE COLUMN workflow_review_level_id "
            "workflow_level_id INT NOT NULL"
        )
    )

    op.execute(text("ALTER TABLE workflow_review_level MODIFY workflow_review_level_id INT NOT NULL"))
    op.drop_constraint("PRIMARY", "workflow_review_level", type_="primary")
    op.execute(
        text(
            "ALTER TABLE workflow_review_level CHANGE COLUMN workflow_review_level_id "
            "workflow_level_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY"
        )
    )

    op.create_index("idx_rwr_level", "workflow_review_rule", ["workflow_level_id"])
    op.create_unique_constraint(
        "uq_rwr_level_scope",
        "workflow_review_rule",
        ["workflow_level_id", "area_level_id", "indicator_classification_id"],
    )
    op.create_index("idx_rlrr_level", "workflow_reviewer_rule", ["workflow_level_id"])
    op.create_index("idx_rlrr_rule", "workflow_reviewer_rule", ["workflow_rule_id"])
    op.create_unique_constraint(
        "uq_rlrr_assignment",
        "workflow_reviewer_rule",
        [
            "workflow_rule_id",
            "reviewer_role_id",
            "area_nid",
            "indicator_classification_id",
            "user_id",
        ],
    )

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
