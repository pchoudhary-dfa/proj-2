"""Replace DRAFT_PENDING in dataset_status with dedicated datapoint_readiness column.

Drops DRAFT_PENDING from the dataset_status enum (migrating any lingering rows to DRAFT)
and adds a new nullable datapoint_readiness column (CREATED | UPDATED | COMPLETED) placed
immediately after dataset_status.

  CREATED   — async seeding job is still running (dataset locked for frontend access)
  UPDATED   — data-point import via import API is in progress (dataset locked)
  COMPLETED — data points are fully ready (dataset can be opened)
  NULL      — pre-feature rows; treated as ready (no async operation was ever started)

The DELETED value in dataset_status is intentionally preserved for the async delete flow.

Revision ID: 100_datapoint_readiness
Revises: 099_dataset_status_deleted
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "100_datapoint_readiness"
down_revision = "099_dataset_status_deleted"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column}).scalar()
    return bool(row)


def _enum_contains(conn, table: str, column: str, value: str) -> bool:
    row = conn.execute(text(
        "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column}).fetchone()
    return row is not None and value in row[0]


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: Reset any lingering DRAFT_PENDING rows (only if enum still has that value).
    if _enum_contains(conn, "dataset", "dataset_status", "DRAFT_PENDING"):
        conn.execute(text(
            "UPDATE dataset SET dataset_status = 'DRAFT' WHERE dataset_status = 'DRAFT_PENDING'"
        ))

    # Step 2: Remove DRAFT_PENDING from dataset_status (only if it is still present).
    if _enum_contains(conn, "dataset", "dataset_status", "DRAFT_PENDING"):
        conn.execute(text(
            "ALTER TABLE dataset MODIFY dataset_status ENUM("
            "'DRAFT','DELETED','PENDING_REVIEW','REVISION','APPROVED','REJECTED'"
            ") NOT NULL DEFAULT 'DRAFT'"
        ))

    # Step 3: Add the datapoint_readiness column (only if it does not already exist).
    if not _column_exists(conn, "dataset", "datapoint_readiness"):
        conn.execute(text(
            "ALTER TABLE dataset ADD COLUMN datapoint_readiness "
            "ENUM('CREATED','UPDATED','COMPLETED') NULL DEFAULT NULL "
            "COMMENT 'Tracks async data-point population state. "
            "NULL = no async op; CREATED = seeding; UPDATED = import; COMPLETED = ready.' "
            "AFTER dataset_status"
        ))

    # Step 4: Back-fill existing rows that have no readiness value yet.
    conn.execute(text("SET SQL_SAFE_UPDATES = 0"))
    conn.execute(text(
        "UPDATE dataset SET datapoint_readiness = 'COMPLETED' WHERE datapoint_readiness IS NULL"
    ))
    conn.execute(text("SET SQL_SAFE_UPDATES = 1"))


def downgrade() -> None:
    conn = op.get_bind()

    # Drop the new column if it exists.
    if _column_exists(conn, "dataset", "datapoint_readiness"):
        conn.execute(text("ALTER TABLE dataset DROP COLUMN datapoint_readiness"))

    # Restore DRAFT_PENDING to dataset_status only if it is missing.
    if not _enum_contains(conn, "dataset", "dataset_status", "DRAFT_PENDING"):
        conn.execute(text(
            "ALTER TABLE dataset MODIFY dataset_status ENUM("
            "'DRAFT','DRAFT_PENDING','DELETED','PENDING_REVIEW','REVISION','APPROVED','REJECTED'"
            ") NOT NULL DEFAULT 'DRAFT'"
        ))
