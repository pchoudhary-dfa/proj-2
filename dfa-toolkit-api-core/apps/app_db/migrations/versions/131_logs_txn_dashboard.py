"""Extend logs_transaction for dashboard audit: make dw_id nullable, add app_key + dashboard_id.

- dw_id: remove NOT NULL constraint, keep FK (dashboard events may not have a warehouse)
- app_key: VARCHAR(100) NULL — application key from X-Api-Key header
- dashboard_id: INT NULL, no FK — audit rows must outlive deleted dashboards

Revision ID: 131_logs_txn_dashboard
Revises: 130_cleanup_orphan_iam
"""

from alembic import op
from sqlalchemy import inspect

revision = "131_logs_txn_dashboard"
down_revision = "130_cleanup_orphan_iam"
branch_labels = None
depends_on = None

_TABLE = "logs_transaction"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _col_exists(table: str, col: str) -> bool:
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return col in cols


def _index_exists(table: str, index_name: str) -> bool:
    indexes = inspect(op.get_bind()).get_indexes(table)
    return any(idx["name"] == index_name for idx in indexes)


def upgrade() -> None:
    if not _table_exists(_TABLE):
        return

    # Make dw_id nullable (keep the FK constraint, just drop NOT NULL).
    # Re-declare the full column definition including the FK.
    op.execute(
        "ALTER TABLE logs_transaction "
        "MODIFY COLUMN dw_id INT NULL "
        "COMMENT 'Datawarehouse ID; NULL for app-only (e.g. dashboard) events'"
    )

    if not _col_exists(_TABLE, "app_key"):
        op.execute(
            "ALTER TABLE logs_transaction "
            "ADD COLUMN app_key VARCHAR(100) NULL "
            "COMMENT 'Application key from X-Api-Key header' "
            "AFTER dw_id"
        )

    if not _col_exists(_TABLE, "dashboard_id"):
        op.execute(
            "ALTER TABLE logs_transaction "
            "ADD COLUMN dashboard_id INT NULL "
            "COMMENT 'Dashboard id; no FK — survives dashboard deletion' "
            "AFTER app_key"
        )

    if not _index_exists(_TABLE, "idx_lt_app_key"):
        op.execute(
            "ALTER TABLE logs_transaction ADD INDEX idx_lt_app_key (app_key)"
        )

    if not _index_exists(_TABLE, "idx_lt_dashboard_id"):
        op.execute(
            "ALTER TABLE logs_transaction ADD INDEX idx_lt_dashboard_id (dashboard_id)"
        )


def downgrade() -> None:
    if not _table_exists(_TABLE):
        return

    if _index_exists(_TABLE, "idx_lt_dashboard_id"):
        op.execute("ALTER TABLE logs_transaction DROP INDEX idx_lt_dashboard_id")
    if _index_exists(_TABLE, "idx_lt_app_key"):
        op.execute("ALTER TABLE logs_transaction DROP INDEX idx_lt_app_key")

    if _col_exists(_TABLE, "dashboard_id"):
        op.drop_column(_TABLE, "dashboard_id")
    if _col_exists(_TABLE, "app_key"):
        op.drop_column(_TABLE, "app_key")

    # Restore NOT NULL on dw_id (downgrade: if any NULL rows exist this will fail — acceptable).
    op.execute(
        "ALTER TABLE logs_transaction "
        "MODIFY COLUMN dw_id INT NOT NULL "
        "COMMENT 'Datawarehouse ID'"
    )
