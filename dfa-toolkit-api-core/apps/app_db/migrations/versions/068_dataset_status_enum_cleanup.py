"""Simplify dataset_status, dp_review_status, and slice_status enums.

dataset_status:
  Remove: SUBMITTED, PARTIAL_APPROVED, CANCELLED
  Rename: PENDING_REVIEW_REVISION → REVISION

dp_review_status:
  Rename: PENDING → DRAFT, IN_PROGRESS → PENDING_REVIEW

slice_status:
  Rename: RETURNED → REVISION_REQUESTED

Revision ID: 068_dataset_status_enum_cleanup
Revises: 067_ddp_display_names
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "068_dataset_status_enum_cleanup"
down_revision = "067_ddp_display_names"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    conn = op.get_bind()

    # MySQL ENUM change strategy:
    # Step A — expand ENUM to accept both old and new values
    # Step B — migrate existing rows to new values
    # Step C — shrink ENUM to final set (removes old values)

    # ── 1. dataset.dataset_status ─────────────────────────────────────────────
    # A: expand
    conn.execute(text(
        "ALTER TABLE dataset MODIFY dataset_status ENUM("
        "'DRAFT','SUBMITTED','PENDING_REVIEW','PENDING_REVIEW_REVISION',"
        "'PARTIAL_APPROVED','APPROVED','REJECTED','CANCELLED','REVISION'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))
    # B: migrate rows
    conn.execute(text(
        "UPDATE dataset SET dataset_status = 'REVISION' "
        "WHERE dataset_status = 'PENDING_REVIEW_REVISION'"
    ))
    conn.execute(text(
        "UPDATE dataset SET dataset_status = 'PENDING_REVIEW' "
        "WHERE dataset_status IN ('SUBMITTED', 'PARTIAL_APPROVED')"
    ))
    conn.execute(text(
        "UPDATE dataset SET dataset_status = 'REJECTED' "
        "WHERE dataset_status = 'CANCELLED'"
    ))
    # C: shrink to final enum
    conn.execute(text(
        "ALTER TABLE dataset MODIFY dataset_status ENUM("
        "'DRAFT','PENDING_REVIEW','REVISION','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))

    # ── 2. dataset_data_point.review_status ───────────────────────────────────
    # A: expand
    conn.execute(text(
        "ALTER TABLE dataset_data_point MODIFY review_status ENUM("
        "'PENDING','IN_PROGRESS','APPROVED','REJECTED','DRAFT','PENDING_REVIEW'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))
    # B: migrate rows
    conn.execute(text(
        "UPDATE dataset_data_point SET review_status = 'DRAFT' "
        "WHERE review_status = 'PENDING'"
    ))
    conn.execute(text(
        "UPDATE dataset_data_point SET review_status = 'PENDING_REVIEW' "
        "WHERE review_status = 'IN_PROGRESS'"
    ))
    # C: shrink
    conn.execute(text(
        "ALTER TABLE dataset_data_point MODIFY review_status ENUM("
        "'DRAFT','PENDING_REVIEW','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))

    # ── 3. dataset_review_slice.slice_status ──────────────────────────────────
    # A: expand
    conn.execute(text(
        "ALTER TABLE dataset_review_slice MODIFY slice_status ENUM("
        "'PENDING','ACTIVE','RETURNED','APPROVED','REJECTED','REVISION_REQUESTED'"
        ") NOT NULL DEFAULT 'PENDING'"
    ))
    # B: migrate rows
    conn.execute(text(
        "UPDATE dataset_review_slice SET slice_status = 'REVISION_REQUESTED' "
        "WHERE slice_status = 'RETURNED'"
    ))
    # C: shrink
    conn.execute(text(
        "ALTER TABLE dataset_review_slice MODIFY slice_status ENUM("
        "'PENDING','ACTIVE','REVISION_REQUESTED','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'PENDING'"
    ))


def downgrade() -> None:
    conn = op.get_bind()

    # ── 3. slice_status (reverse) ─────────────────────────────────────────────
    conn.execute(text(
        "ALTER TABLE dataset_review_slice MODIFY slice_status ENUM("
        "'PENDING','ACTIVE','RETURNED','APPROVED','REJECTED','REVISION_REQUESTED'"
        ") NOT NULL DEFAULT 'PENDING'"
    ))
    conn.execute(text(
        "UPDATE dataset_review_slice SET slice_status = 'RETURNED' "
        "WHERE slice_status = 'REVISION_REQUESTED'"
    ))
    conn.execute(text(
        "ALTER TABLE dataset_review_slice MODIFY slice_status ENUM("
        "'PENDING','ACTIVE','RETURNED','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'PENDING'"
    ))

    # ── 2. dp_review_status (reverse) ─────────────────────────────────────────
    conn.execute(text(
        "ALTER TABLE dataset_data_point MODIFY review_status ENUM("
        "'PENDING','IN_PROGRESS','APPROVED','REJECTED','DRAFT','PENDING_REVIEW'"
        ") NOT NULL DEFAULT 'PENDING'"
    ))
    conn.execute(text(
        "UPDATE dataset_data_point SET review_status = 'PENDING' "
        "WHERE review_status = 'DRAFT'"
    ))
    conn.execute(text(
        "UPDATE dataset_data_point SET review_status = 'IN_PROGRESS' "
        "WHERE review_status = 'PENDING_REVIEW'"
    ))
    conn.execute(text(
        "ALTER TABLE dataset_data_point MODIFY review_status ENUM("
        "'PENDING','IN_PROGRESS','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'PENDING'"
    ))

    # ── 1. dataset_status (reverse) ───────────────────────────────────────────
    conn.execute(text(
        "ALTER TABLE dataset MODIFY dataset_status ENUM("
        "'DRAFT','SUBMITTED','PENDING_REVIEW','PENDING_REVIEW_REVISION',"
        "'PARTIAL_APPROVED','APPROVED','REJECTED','CANCELLED','REVISION'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))
    conn.execute(text(
        "UPDATE dataset SET dataset_status = 'PENDING_REVIEW_REVISION' "
        "WHERE dataset_status = 'REVISION'"
    ))
    conn.execute(text(
        "ALTER TABLE dataset MODIFY dataset_status ENUM("
        "'DRAFT','SUBMITTED','PENDING_REVIEW','PENDING_REVIEW_REVISION',"
        "'PARTIAL_APPROVED','APPROVED','REJECTED','CANCELLED'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))
