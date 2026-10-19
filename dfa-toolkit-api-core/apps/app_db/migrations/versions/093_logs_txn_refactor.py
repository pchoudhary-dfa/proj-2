"""Refactor logs_transaction: drop submodule/previousvalue/newvalue, add
previous_value/new_value JSON cols, tighten action to ENUM, make module/status/created NOT NULL.

Revision ID: 093_logs_txn_refactor
Revises: 092_move_optimize_rapi_res
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "093_logs_txn_refactor"
down_revision = "092_move_optimize_rapi_res"
branch_labels = None
depends_on = None

_TABLE = "logs_transaction"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _table_exists(_TABLE):
        return

    conn = op.get_bind()

    # --- 1. Fix NULLs and bad values before adding NOT NULL constraints ----------
    conn.execute(text(
        "UPDATE logs_transaction SET action = 'CREATE' "
        "WHERE action IS NULL OR action NOT IN ('CREATE','UPDATE','DELETE')"
    ))
    conn.execute(text(
        "UPDATE logs_transaction SET module = 'unknown' WHERE module IS NULL"
    ))
    conn.execute(text(
        "UPDATE logs_transaction SET status = 'SUCCESS' WHERE status IS NULL"
    ))
    conn.execute(text(
        "UPDATE logs_transaction SET created = NOW() WHERE created IS NULL"
    ))

    # --- 2. Drop obsolete columns ------------------------------------------------
    op.drop_column(_TABLE, "submodule")
    op.drop_column(_TABLE, "previousvalue")
    op.drop_column(_TABLE, "newvalue")

    # --- 3. Add new JSON diff columns --------------------------------------------
    op.execute(
        "ALTER TABLE logs_transaction "
        "ADD COLUMN previous_value JSON NULL COMMENT 'Changed fields before the operation' AFTER identifier, "
        "ADD COLUMN new_value JSON NULL COMMENT 'Changed fields after the operation' AFTER previous_value"
    )

    # --- 4. Tighten existing columns ---------------------------------------------
    op.execute(
        "ALTER TABLE logs_transaction "
        "MODIFY action ENUM('CREATE','UPDATE','DELETE') NOT NULL COMMENT 'Operation type', "
        "MODIFY module VARCHAR(100) NOT NULL COMMENT 'Entity module e.g. area, indicator', "
        "MODIFY status VARCHAR(10) NOT NULL DEFAULT 'SUCCESS' COMMENT 'Outcome label e.g. SUCCESS, ERROR', "
        "MODIFY created DATETIME NOT NULL COMMENT 'UTC timestamp of the log event'"
    )


def downgrade() -> None:
    if not _table_exists(_TABLE):
        return

    # Restore old columns and types (data in previous_value/new_value is lost)
    op.execute(
        "ALTER TABLE logs_transaction "
        "MODIFY action VARCHAR(50) NULL COMMENT 'Operation e.g. CREATE, UPDATE, DELETE', "
        "MODIFY module VARCHAR(255) NULL COMMENT 'Entity module e.g. area, indicator', "
        "MODIFY status VARCHAR(10) NULL COMMENT 'Outcome label e.g. SUCCESS, ERROR', "
        "MODIFY created DATETIME NULL COMMENT 'UTC timestamp of the log event'"
    )

    op.drop_column(_TABLE, "previous_value")
    op.drop_column(_TABLE, "new_value")

    op.execute(
        "ALTER TABLE logs_transaction "
        "ADD COLUMN submodule VARCHAR(255) NULL COMMENT 'Layer e.g. services, router', "
        "ADD COLUMN previousvalue LONGTEXT NULL COMMENT 'State before the change', "
        "ADD COLUMN newvalue LONGTEXT NULL COMMENT 'State after the change'"
    )
