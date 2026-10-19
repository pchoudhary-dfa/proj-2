"""Add DRAFT_PENDING to dataset_status_enum for async large-dataset seeding.

Revision ID: 098_dataset_status_seeding
Revises: 097_sac_api_key_unique
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "098_dataset_status_seeding"
down_revision = "097_sac_api_key_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(
        "ALTER TABLE dataset MODIFY dataset_status ENUM("
        "'DRAFT','DRAFT_PENDING','PENDING_REVIEW','REVISION','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    # Remove DRAFT_PENDING — safe as long as no rows currently hold that value.
    conn.execute(text(
        "UPDATE dataset SET dataset_status = 'DRAFT' WHERE dataset_status = 'DRAFT_PENDING'"
    ))
    conn.execute(text(
        "ALTER TABLE dataset MODIFY dataset_status ENUM("
        "'DRAFT','PENDING_REVIEW','REVISION','APPROVED','REJECTED'"
        ") NOT NULL DEFAULT 'DRAFT'"
    ))
