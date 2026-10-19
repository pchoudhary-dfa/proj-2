"""Add DELETED to dataset_status_enum for async large-dataset deletion.

Revision ID: 099_dataset_status_deleted
Revises: 098_dataset_status_seeding
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "099_dataset_status_deleted"
down_revision = "098_dataset_status_seeding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(
        "ALTER TABLE dataset MODIFY dataset_status ENUM("
        "'DRAFT','DRAFT_PENDING','DELETED','PENDING_REVIEW','REVISION','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    # Remove DELETED — safe as long as no rows currently hold that value.
    conn.execute(text(
        "UPDATE dataset SET dataset_status = 'DRAFT' WHERE dataset_status = 'DELETED'"
    ))
    conn.execute(text(
        "ALTER TABLE dataset MODIFY dataset_status ENUM("
        "'DRAFT','DRAFT_PENDING','PENDING_REVIEW','REVISION','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))
