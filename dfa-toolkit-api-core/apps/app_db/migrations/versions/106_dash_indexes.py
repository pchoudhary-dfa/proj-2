"""Dashboard secondary indexes.

MySQL auto-creates indexes for every FK column when the table is created.
This migration only adds indexes that MySQL does NOT create automatically:
  - Composite index on dash_analyses(visualization_id, area_id) for AI lookup queries.

All single-column FK indexes (dashboard_id, gallery_id, section_id, etc.) are
already present as FK-support indexes and do not need to be duplicated here.

Revision ID: 106_dash_indexes
Revises: 105_dash_embed
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "106_dash_indexes"
down_revision = "105_dash_embed"
branch_labels = None
depends_on = None


def _index_exists(conn, table: str, index: str) -> bool:
    return bool(conn.execute(
        text("SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
             "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND INDEX_NAME = :i"),
        {"t": table, "i": index},
    ).scalar())


def upgrade() -> None:
    conn = op.get_bind()
    if not _index_exists(conn, "dash_analyses", "idx_dash_analyses_vis_area"):
        conn.execute(text(
            "CREATE INDEX idx_dash_analyses_vis_area ON dash_analyses (visualization_id, area_id)"
        ))


def downgrade() -> None:
    # dash_analyses is dropped by 103_dash_analyses.downgrade — the index goes with it.
    pass
