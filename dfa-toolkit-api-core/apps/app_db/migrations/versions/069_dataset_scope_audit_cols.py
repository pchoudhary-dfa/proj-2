"""Dataset table additions: ius_nids scope, footnote_text, audit columns.

Changes per table:
  dataset                   — add ius_nids (JSON), rename modified_by → modified_user_id
  dataset_data_point        — add footnote_text (TEXT), created_user_id, modified_user_id
  dataset_review_stage      — add created_user_id, created
  dataset_review_slice      — add created_user_id
  dataset_review_slice_rejection — add created_user_id, created

Revision ID: 069_dataset_scope_audit_cols
Revises: 068_dataset_status_enum_cleanup
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "069_dataset_scope_audit_cols"
down_revision = "068_dataset_status_enum_cleanup"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # ── dataset ──────────────────────────────────────────────────────────────
    if not _column_exists("dataset", "ius_nids"):
        op.add_column("dataset", sa.Column(
            "ius_nids", sa.JSON(), nullable=True,
            comment="JSON array of iusnid values (indicator-unit-subgroup combinations)",
        ))

    # Rename modified_by → modified_user_id
    if _column_exists("dataset", "modified_by") and not _column_exists("dataset", "modified_user_id"):
        op.execute(text(
            "ALTER TABLE dataset CHANGE modified_by modified_user_id INT NULL "
            "COMMENT 'User who last modified the dataset'"
        ))
    elif not _column_exists("dataset", "modified_user_id"):
        op.add_column("dataset", sa.Column(
            "modified_user_id", sa.Integer(), nullable=True,
            comment="User who last modified the dataset",
        ))

    # ── dataset_data_point ───────────────────────────────────────────────────
    if not _column_exists("dataset_data_point", "footnote_text"):
        op.add_column("dataset_data_point", sa.Column(
            "footnote_text", sa.Text(), nullable=True,
            comment="Denormalized footnote text snapshot from ut_footnote",
        ))

    if not _column_exists("dataset_data_point", "created_user_id"):
        op.add_column("dataset_data_point", sa.Column(
            "created_user_id", sa.Integer(), nullable=True,
            comment="User who created/seeded this data point (NULL = seeded by system)",
        ))

    if not _column_exists("dataset_data_point", "modified_user_id"):
        op.add_column("dataset_data_point", sa.Column(
            "modified_user_id", sa.Integer(), nullable=True,
            comment="User who last edited the value",
        ))

    # ── dataset_review_stage ─────────────────────────────────────────────────
    if not _column_exists("dataset_review_stage", "created_user_id"):
        op.add_column("dataset_review_stage", sa.Column(
            "created_user_id", sa.Integer(), nullable=True,
            comment="User who triggered submission (0 = system on resubmit)",
        ))

    if not _column_exists("dataset_review_stage", "created"):
        op.add_column("dataset_review_stage", sa.Column(
            "created", sa.DateTime(), nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ))

    # ── dataset_review_slice ─────────────────────────────────────────────────
    if not _column_exists("dataset_review_slice", "created_user_id"):
        op.add_column("dataset_review_slice", sa.Column(
            "created_user_id", sa.Integer(), nullable=True,
            comment="System user who created this slice (0 = automated)",
        ))

    # ── dataset_review_slice_rejection ───────────────────────────────────────
    if not _column_exists("dataset_review_slice_rejection", "created_user_id"):
        op.add_column("dataset_review_slice_rejection", sa.Column(
            "created_user_id", sa.Integer(), nullable=True,
            comment="Reviewer who added this rejection reason",
        ))

    if not _column_exists("dataset_review_slice_rejection", "created"):
        op.add_column("dataset_review_slice_rejection", sa.Column(
            "created", sa.DateTime(), nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ))


def downgrade() -> None:
    if _column_exists("dataset_review_slice_rejection", "created"):
        op.drop_column("dataset_review_slice_rejection", "created")
    if _column_exists("dataset_review_slice_rejection", "created_user_id"):
        op.drop_column("dataset_review_slice_rejection", "created_user_id")

    if _column_exists("dataset_review_slice", "created_user_id"):
        op.drop_column("dataset_review_slice", "created_user_id")

    if _column_exists("dataset_review_stage", "created"):
        op.drop_column("dataset_review_stage", "created")
    if _column_exists("dataset_review_stage", "created_user_id"):
        op.drop_column("dataset_review_stage", "created_user_id")

    if _column_exists("dataset_data_point", "modified_user_id"):
        op.drop_column("dataset_data_point", "modified_user_id")
    if _column_exists("dataset_data_point", "created_user_id"):
        op.drop_column("dataset_data_point", "created_user_id")
    if _column_exists("dataset_data_point", "footnote_text"):
        op.drop_column("dataset_data_point", "footnote_text")

    # Rename modified_user_id back to modified_by
    if _column_exists("dataset", "modified_user_id"):
        op.execute(text(
            "ALTER TABLE dataset CHANGE modified_user_id modified_by INT NULL "
            "COMMENT 'User who last modified the dataset'"
        ))
    if _column_exists("dataset", "ius_nids"):
        op.drop_column("dataset", "ius_nids")
