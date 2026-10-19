"""Add path to logs_transaction (after dw_id), matching logs_server_error.

Revision ID: 094_logs_txn_path
Revises: 093_logs_txn_refactor
"""

from alembic import op
from sqlalchemy import inspect

revision = "094_logs_txn_path"
down_revision = "093_logs_txn_refactor"
branch_labels = None
depends_on = None

_TABLE = "logs_transaction"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _table_exists(_TABLE):
        return
    op.execute(
        "ALTER TABLE logs_transaction ADD COLUMN path VARCHAR(1024) NULL "
        "COMMENT 'Full request path including query string' AFTER dw_id"
    )


def downgrade() -> None:
    if not _table_exists(_TABLE):
        return
    op.drop_column(_TABLE, "path")
