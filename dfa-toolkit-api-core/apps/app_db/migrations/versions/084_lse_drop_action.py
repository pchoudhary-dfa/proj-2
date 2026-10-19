"""Drop action column from logs_server_error.

Revision ID: 084_lse_drop_action
Revises: 083_lse_drop_ctx_cols
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "084_lse_drop_action"
down_revision = "083_lse_drop_ctx_cols"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("logs_server_error"):
        return

    cols = _columns("logs_server_error")
    if "action" in cols:
        op.drop_column("logs_server_error", "action")


def downgrade() -> None:
    if not _table_exists("logs_server_error"):
        return

    cols = _columns("logs_server_error")
    if "action" not in cols:
        op.add_column(
            "logs_server_error",
            sa.Column("action", sa.String(length=100), nullable=True),
        )
