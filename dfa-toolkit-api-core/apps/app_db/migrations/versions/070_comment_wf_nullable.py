"""Rename dataset_review_comment audit columns; make dataset.workflow_id nullable.

Changes:
  dataset_review_comment
    comment_by_user_id → created_user_id
    created_at         → created

  dataset
    workflow_id        NOT NULL → NULL  (passthrough mode: WORKFLOW_DATASET_ENABLED=no)

Revision ID: 070_comment_wf_nullable
Revises: 069_dataset_scope_audit_cols
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "070_comment_wf_nullable"
down_revision = "069_dataset_scope_audit_cols"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def _column_nullable(table: str, column: str) -> bool:
    cols = {c["name"]: c for c in inspect(op.get_bind()).get_columns(table)}
    col = cols.get(column)
    return col is not None and col.get("nullable", True)


def upgrade() -> None:
    # ── dataset_review_comment column renames ────────────────────────────────
    if _column_exists("dataset_review_comment", "comment_by_user_id"):
        op.execute(text(
            "ALTER TABLE dataset_review_comment "
            "CHANGE comment_by_user_id created_user_id INT NOT NULL "
            "COMMENT 'User who posted this comment'"
        ))

    if _column_exists("dataset_review_comment", "created_at"):
        op.execute(text(
            "ALTER TABLE dataset_review_comment "
            "CHANGE created_at created DATETIME NOT NULL "
            "DEFAULT CURRENT_TIMESTAMP"
        ))

    # ── dataset.workflow_id → nullable ───────────────────────────────────────
    # MySQL 1832: must drop FK before modifying a constrained column.
    if not _column_nullable("dataset", "workflow_id"):
        op.drop_constraint("fk_dataset_workflow", "dataset", type_="foreignkey")
        op.execute(text(
            "ALTER TABLE dataset "
            "MODIFY workflow_id INT NULL "
            "COMMENT 'Workflow this dataset follows; NULL when WORKFLOW_DATASET_ENABLED=no (passthrough mode)'"
        ))
        op.create_foreign_key(
            "fk_dataset_workflow",
            "dataset",
            "workflow",
            ["workflow_id"],
            ["workflow_id"],
        )


def downgrade() -> None:
    # ── dataset.workflow_id → NOT NULL ───────────────────────────────────────
    # Remove any passthrough rows that have no workflow before restoring NOT NULL
    op.execute(text("DELETE FROM dataset WHERE workflow_id IS NULL"))
    if _column_nullable("dataset", "workflow_id"):
        op.drop_constraint("fk_dataset_workflow", "dataset", type_="foreignkey")
        op.execute(text(
            "ALTER TABLE dataset "
            "MODIFY workflow_id INT NOT NULL "
            "COMMENT 'Workflow this dataset follows'"
        ))
        op.create_foreign_key(
            "fk_dataset_workflow",
            "dataset",
            "workflow",
            ["workflow_id"],
            ["workflow_id"],
        )

    # ── dataset_review_comment column renames (reverse) ──────────────────────
    if _column_exists("dataset_review_comment", "created"):
        op.execute(text(
            "ALTER TABLE dataset_review_comment "
            "CHANGE created created_at DATETIME NOT NULL "
            "DEFAULT CURRENT_TIMESTAMP"
        ))

    if _column_exists("dataset_review_comment", "created_user_id"):
        op.execute(text(
            "ALTER TABLE dataset_review_comment "
            "CHANGE created_user_id comment_by_user_id INT NOT NULL"
        ))
