"""Add cmnt_cnt to dataset and dataset_data_point.

Tracks the running total of comments for each dataset and each data point.
Incremented in application code on every DatasetReviewComment insert.

Revision ID: 107_cmnt_cnt
Revises: 106_dash_indexes
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "107_cmnt_cnt"
down_revision = "106_dash_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(text(
        "ALTER TABLE dataset "
        "ADD COLUMN cmnt_cnt INT NOT NULL DEFAULT 0 "
        "COMMENT 'Total comments on this dataset'"
    ))
    conn.execute(text(
        "ALTER TABLE dataset_data_point "
        "ADD COLUMN cmnt_cnt INT NOT NULL DEFAULT 0 "
        "COMMENT 'Total comments on this data point'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("ALTER TABLE dataset_data_point DROP COLUMN cmnt_cnt"))
    conn.execute(text("ALTER TABLE dataset DROP COLUMN cmnt_cnt"))
