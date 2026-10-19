"""Rename translation/code and logs_transaction db_id columns.

Revision ID: 026_rename_trans_code_logs_dw_id
Revises: 025_system_config_app_key_desc
Create Date: 2026-03-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "026_rename_trans_code_logs_dw_id"
down_revision = "025_system_config_app_key_desc"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns(table)}


def _index_exists(table: str, index_name: str) -> bool:
    return any(idx.get("name") == index_name for idx in inspect(op.get_bind()).get_indexes(table))


def _drop_fk_for_column(table: str, column_name: str) -> None:
    for fk in inspect(op.get_bind()).get_foreign_keys(table):
        constrained = fk.get("constrained_columns") or []
        fk_name = fk.get("name")
        if column_name in constrained and fk_name:
            op.drop_constraint(fk_name, table_name=table, type_="foreignkey")


def _fk_exists(table: str, local_column: str, referred_table: str, referred_column: str) -> bool:
    for fk in inspect(op.get_bind()).get_foreign_keys(table):
        constrained = fk.get("constrained_columns") or []
        referred_cols = fk.get("referred_columns") or []
        if (
            local_column in constrained
            and fk.get("referred_table") == referred_table
            and referred_column in referred_cols
        ):
            return True
    return False


def upgrade() -> None:
    if _table_exists("system_language_translation"):
        cols = _columns("system_language_translation")
        if "code" in cols and "trans_code" not in cols:
            op.alter_column(
                "system_language_translation",
                "code",
                new_column_name="trans_code",
                existing_type=sa.String(length=255),
                existing_nullable=True,
            )

    if _table_exists("logs_transaction"):
        cols = _columns("logs_transaction")
        if "db_id" in cols and "dw_id" not in cols:
            _drop_fk_for_column("logs_transaction", "db_id")
            op.alter_column(
                "logs_transaction",
                "db_id",
                new_column_name="dw_id",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )
            # Rename dependent index while FK is dropped to satisfy MySQL constraints.
            if _index_exists("logs_transaction", "idx_lt_db_id") and not _index_exists("logs_transaction", "idx_lt_dw_id"):
                op.drop_index("idx_lt_db_id", table_name="logs_transaction")
                op.create_index("idx_lt_dw_id", "logs_transaction", ["dw_id"])
            if not _fk_exists("logs_transaction", "dw_id", "system_datawarehouses", "id"):
                op.create_foreign_key(
                    "fk_logs_transaction_dw_id",
                    "logs_transaction",
                    "system_datawarehouses",
                    ["dw_id"],
                    ["id"],
                )

    if _table_exists("logs_server_error"):
        cols = _columns("logs_server_error")
        if "db_id" in cols and "dw_id" not in cols:
            _drop_fk_for_column("logs_server_error", "db_id")
            op.alter_column(
                "logs_server_error",
                "db_id",
                new_column_name="dw_id",
                existing_type=sa.Integer(),
                existing_nullable=True,
            )
            # Rename dependent index while FK is dropped to satisfy MySQL constraints.
            if _index_exists("logs_server_error", "idx_lse_db_id") and not _index_exists("logs_server_error", "idx_lse_dw_id"):
                op.drop_index("idx_lse_db_id", table_name="logs_server_error")
                op.create_index("idx_lse_dw_id", "logs_server_error", ["dw_id"])
            if not _fk_exists("logs_server_error", "dw_id", "system_datawarehouses", "id"):
                op.create_foreign_key(
                    "fk_logs_server_error_dw_id",
                    "logs_server_error",
                    "system_datawarehouses",
                    ["dw_id"],
                    ["id"],
                )


def downgrade() -> None:
    if _table_exists("logs_server_error"):
        cols = _columns("logs_server_error")
        if "dw_id" in cols and "db_id" not in cols:
            _drop_fk_for_column("logs_server_error", "dw_id")
            op.alter_column(
                "logs_server_error",
                "dw_id",
                new_column_name="db_id",
                existing_type=sa.Integer(),
                existing_nullable=True,
            )
            # Rename dependent index while FK is dropped to satisfy MySQL constraints.
            if _index_exists("logs_server_error", "idx_lse_dw_id") and not _index_exists("logs_server_error", "idx_lse_db_id"):
                op.drop_index("idx_lse_dw_id", table_name="logs_server_error")
                op.create_index("idx_lse_db_id", "logs_server_error", ["db_id"])
            if not _fk_exists("logs_server_error", "db_id", "system_datawarehouses", "id"):
                op.create_foreign_key(
                    "fk_logs_server_error_db_id",
                    "logs_server_error",
                    "system_datawarehouses",
                    ["db_id"],
                    ["id"],
                )

    if _table_exists("logs_transaction"):
        cols = _columns("logs_transaction")
        if "dw_id" in cols and "db_id" not in cols:
            _drop_fk_for_column("logs_transaction", "dw_id")
            op.alter_column(
                "logs_transaction",
                "dw_id",
                new_column_name="db_id",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )
            # Rename dependent index while FK is dropped to satisfy MySQL constraints.
            if _index_exists("logs_transaction", "idx_lt_dw_id") and not _index_exists("logs_transaction", "idx_lt_db_id"):
                op.drop_index("idx_lt_dw_id", table_name="logs_transaction")
                op.create_index("idx_lt_db_id", "logs_transaction", ["db_id"])
            if not _fk_exists("logs_transaction", "db_id", "system_datawarehouses", "id"):
                op.create_foreign_key(
                    "fk_logs_transaction_db_id",
                    "logs_transaction",
                    "system_datawarehouses",
                    ["db_id"],
                    ["id"],
                )

    if _table_exists("system_language_translation"):
        cols = _columns("system_language_translation")
        if "trans_code" in cols and "code" not in cols:
            op.alter_column(
                "system_language_translation",
                "trans_code",
                new_column_name="code",
                existing_type=sa.String(length=255),
                existing_nullable=True,
            )
