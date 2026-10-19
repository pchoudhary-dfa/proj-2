"""Add raw binary storage for dashboard media uploads.

Revision ID: 125_dash_upload_binary
Revises: 124_viz_crud_refactor
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "125_dash_upload_binary"
down_revision = "124_viz_crud_refactor"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
        ),
        {"t": table, "c": column},
    ).scalar()
    return bool(row)


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists("dash_uploads"):
        return

    if not _column_exists("dash_uploads", "binary_obj"):
        conn.execute(text(
            "ALTER TABLE dash_uploads "
            "ADD COLUMN binary_obj LONGBLOB NULL "
            "COMMENT 'Raw binary content for user-uploaded media' "
            "AFTER file_size"
        ))

    if not _column_exists("dash_uploads", "is_system"):
        conn.execute(text(
            "ALTER TABLE dash_uploads "
            "ADD COLUMN is_system SMALLINT NOT NULL DEFAULT 0 "
            "COMMENT '1 = seeded system media; cannot be deleted/replaced' "
            "AFTER binary_obj"
        ))


def downgrade() -> None:
    conn = op.get_bind()

    if not _table_exists("dash_uploads"):
        return

    if _column_exists("dash_uploads", "is_system"):
        conn.execute(text("ALTER TABLE dash_uploads DROP COLUMN is_system"))

    if _column_exists("dash_uploads", "binary_obj"):
        conn.execute(text("ALTER TABLE dash_uploads DROP COLUMN binary_obj"))
