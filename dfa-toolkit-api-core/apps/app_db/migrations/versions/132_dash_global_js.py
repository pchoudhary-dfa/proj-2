"""Add global_js to dash_dashboards (custom script injected in viewer).

Revision ID: 132_dash_global_js
Revises: 131_logs_txn_dashboard
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "132_dash_global_js"
down_revision = "131_logs_txn_dashboard"
branch_labels = None
depends_on = None

_TABLE = "dash_dashboards"
_COLUMN = "global_js"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _col_exists(table: str, col: str) -> bool:
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return col in cols


def upgrade() -> None:
    if not _table_exists(_TABLE) or _col_exists(_TABLE, _COLUMN):
        return
    op.get_bind().execute(
        text(
            f"ALTER TABLE {_TABLE} "
            f"ADD COLUMN {_COLUMN} LONGTEXT NULL "
            "COMMENT 'Custom global JS injected into the dashboard' "
            "AFTER global_css"
        )
    )


def downgrade() -> None:
    if not _table_exists(_TABLE) or not _col_exists(_TABLE, _COLUMN):
        return
    op.get_bind().execute(text(f"ALTER TABLE {_TABLE} DROP COLUMN {_COLUMN}"))
