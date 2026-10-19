"""Create dataset_review_comment table; drop single-value comment columns from dataset
and dataset_data_point; make dataset.workflow_id NOT NULL.

Revision ID: 066_comment_table_and_cleanup
Revises: 065_ds_filter_nids
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "066_comment_table_and_cleanup"
down_revision = "065_ds_filter_nids"
branch_labels = None
depends_on = None


def _table_exists(table: str) -> bool:
    return table in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # ── 1. Create dataset_review_comment ─────────────────────────────────────
    if not _table_exists("dataset_review_comment"):
        op.create_table(
            "dataset_review_comment",
            sa.Column("comment_id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "dataset_id",
                sa.Integer(),
                sa.ForeignKey("dataset.dataset_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "data_point_id",
                sa.Integer(),
                sa.ForeignKey("dataset_data_point.data_point_id", ondelete="CASCADE"),
                nullable=True,
            ),
            sa.Column(
                "commenter_role",
                sa.Enum("DATAENTRY", "DATAREVIEW", "SYSTEM", name="commenter_role_enum"),
                nullable=False,
            ),
            sa.Column("comment_text", sa.Text(), nullable=False),
            sa.Column("comment_by_user_id", sa.Integer(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Index("idx_drc_dataset", "dataset_id"),
            sa.Index("idx_drc_data_point", "data_point_id"),
        )

    # ── 2. Drop single-value comment columns (replaced by dataset_review_comment) ──
    if _column_exists("dataset", "submission_comments"):
        op.drop_column("dataset", "submission_comments")

    if _column_exists("dataset", "reviewer_overall_remarks"):
        op.drop_column("dataset", "reviewer_overall_remarks")

    if _column_exists("dataset_data_point", "data_entry_note"):
        op.drop_column("dataset_data_point", "data_entry_note")

    if _column_exists("dataset_data_point", "reviewer_comment"):
        op.drop_column("dataset_data_point", "reviewer_comment")

    # ── 3. Make dataset.workflow_id NOT NULL (reverts nullable from 061) ─────
    # First delete any legacy rows where workflow_id IS NULL (old Mode 1 / passthrough
    # datasets — no longer valid under the new strategy where workflow_id is always required).
    # Cascade FK on dataset_data_point ensures related data points are also removed.
    if _column_exists("dataset", "workflow_id"):
        # ── Cascade-safe cleanup of datasets where workflow_id IS NULL ───────
        # Several child tables reference dataset/stage/slice without DB-level
        # CASCADE, so we must delete in dependency order.

        # Step A: break circular FK dataset.current_stage_id → dataset_review_stage
        if _column_exists("dataset", "current_stage_id"):
            op.execute(
                "UPDATE dataset SET current_stage_id = NULL "
                "WHERE workflow_id IS NULL AND current_stage_id IS NOT NULL"
            )

        # Step B: break FK dataset_data_point.dataset_review_slice_id → dataset_review_slice
        if _table_exists("dataset_data_point") and _column_exists("dataset_data_point", "dataset_review_slice_id"):
            op.execute(
                "UPDATE dataset_data_point SET dataset_review_slice_id = NULL "
                "WHERE dataset_id IN (SELECT dataset_id FROM dataset WHERE workflow_id IS NULL)"
            )

        # Step C: delete rejection reasons for slices belonging to affected datasets
        if _table_exists("dataset_review_slice_rejection") and _table_exists("dataset_review_slice"):
            op.execute(
                "DELETE drsr FROM dataset_review_slice_rejection drsr "
                "INNER JOIN dataset_review_slice drsl ON drsl.slice_id = drsr.slice_id "
                "INNER JOIN dataset ds ON ds.dataset_id = drsl.dataset_id "
                "WHERE ds.workflow_id IS NULL"
            )

        # Step D: delete slices belonging to affected datasets
        if _table_exists("dataset_review_slice"):
            op.execute(
                "DELETE drsl FROM dataset_review_slice drsl "
                "INNER JOIN dataset ds ON ds.dataset_id = drsl.dataset_id "
                "WHERE ds.workflow_id IS NULL"
            )

        # Step E: delete stages belonging to affected datasets
        if _table_exists("dataset_review_stage"):
            op.execute(
                "DELETE drs FROM dataset_review_stage drs "
                "INNER JOIN dataset ds ON ds.dataset_id = drs.dataset_id "
                "WHERE ds.workflow_id IS NULL"
            )

        # Step F: delete data points (FK fk_ddp_dataset has no DB-level CASCADE)
        if _table_exists("dataset_data_point"):
            op.execute(
                "DELETE FROM dataset_data_point "
                "WHERE dataset_id IN (SELECT dataset_id FROM dataset WHERE workflow_id IS NULL)"
            )

        # Step G: safe to delete parent dataset rows now
        op.execute("DELETE FROM dataset WHERE workflow_id IS NULL")

        # MySQL refuses ALTER on a column referenced by a FK constraint.
        # Drop the constraint, change nullability, then restore it.
        op.drop_constraint("fk_dataset_workflow", "dataset", type_="foreignkey")
        op.alter_column(
            "dataset",
            "workflow_id",
            existing_type=sa.Integer(),
            nullable=False,
        )
        op.create_foreign_key(
            "fk_dataset_workflow",
            "dataset",
            "workflow",
            ["workflow_id"],
            ["workflow_id"],
        )


def downgrade() -> None:
    # Revert workflow_id to nullable
    if _column_exists("dataset", "workflow_id"):
        op.drop_constraint("fk_dataset_workflow", "dataset", type_="foreignkey")
        op.alter_column(
            "dataset",
            "workflow_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
        op.create_foreign_key(
            "fk_dataset_workflow",
            "dataset",
            "workflow",
            ["workflow_id"],
            ["workflow_id"],
        )

    # Re-add dropped columns
    if not _column_exists("dataset_data_point", "reviewer_comment"):
        op.add_column(
            "dataset_data_point",
            sa.Column("reviewer_comment", sa.Text(), nullable=True,
                      comment="Reviewer feedback on this value"),
        )

    if not _column_exists("dataset_data_point", "data_entry_note"):
        op.add_column(
            "dataset_data_point",
            sa.Column("data_entry_note", sa.Text(), nullable=True,
                      comment="Operator note on this value"),
        )

    if not _column_exists("dataset", "reviewer_overall_remarks"):
        op.add_column(
            "dataset",
            sa.Column("reviewer_overall_remarks", sa.Text(), nullable=True,
                      comment="Reviewer comment on full REJECTED"),
        )

    if not _column_exists("dataset", "submission_comments"):
        op.add_column(
            "dataset",
            sa.Column("submission_comments", sa.Text(), nullable=True,
                      comment="Operator overall note at submission"),
        )

    # Drop dataset_review_comment table
    if _table_exists("dataset_review_comment"):
        op.drop_table("dataset_review_comment")
