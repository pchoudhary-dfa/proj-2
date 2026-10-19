"""Drop request_id, module, submodule, identifier, error_type from logs_server_error.

Revision ID: 077_lse_drop_ctx_cols
Revises: 076_create_sys_share_link
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "083_lse_drop_ctx_cols"
down_revision = "082_sys_cfg_key_value_med"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns(table)}


def _index_exists(table: str, index_name: str) -> bool:
    return any(idx.get("name") == index_name for idx in inspect(op.get_bind()).get_indexes(table))


def upgrade() -> None:
    if not _table_exists("logs_server_error"):
        return

    if _index_exists("logs_server_error", "idx_lse_request_id"):
        op.drop_index("idx_lse_request_id", table_name="logs_server_error")
    if _index_exists("logs_server_error", "idx_lse_module"):
        op.drop_index("idx_lse_module", table_name="logs_server_error")

    cols = _columns("logs_server_error")
    for col in ("request_id", "module", "submodule", "identifier", "error_type"):
        if col in cols:
            op.drop_column("logs_server_error", col)


def downgrade() -> None:
    if not _table_exists("logs_server_error"):
        return

    cols = _columns("logs_server_error")
    if "error_type" not in cols:
        op.add_column(
            "logs_server_error",
            sa.Column("error_type", sa.String(length=255), nullable=True),
        )
    if "identifier" not in cols:
        op.add_column(
            "logs_server_error",
            sa.Column("identifier", sa.String(length=255), nullable=True),
        )
    if "submodule" not in cols:
        op.add_column(
            "logs_server_error",
            sa.Column("submodule", sa.String(length=255), nullable=True),
        )
    if "module" not in cols:
        op.add_column(
            "logs_server_error",
            sa.Column("module", sa.String(length=255), nullable=True),
        )
    if "request_id" not in cols:
        op.add_column(
            "logs_server_error",
            sa.Column("request_id", sa.String(length=36), nullable=True),
        )

    if not _index_exists("logs_server_error", "idx_lse_request_id"):
        op.create_index("idx_lse_request_id", "logs_server_error", ["request_id"])
    if not _index_exists("logs_server_error", "idx_lse_module"):
        op.create_index("idx_lse_module", "logs_server_error", ["module"])
