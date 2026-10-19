"""Drop logs_server_error.dw_id FK to system_datawarehouse.

Allows persisting server error rows when the path dw_id does not exist yet
in system_datawarehouse (e.g. DATAWAREHOUSE_NOT_FOUND).

Revision ID: 085_lse_drop_dw_fk
Revises: 084_lse_drop_action
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "085_lse_drop_dw_fk"
down_revision = "084_lse_drop_action"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _drop_fk_for_column(table: str, column_name: str) -> None:
    for fk in inspect(op.get_bind()).get_foreign_keys(table):
        constrained = fk.get("constrained_columns") or []
        fk_name = fk.get("name")
        if column_name in constrained and fk_name:
            op.drop_constraint(fk_name, table_name=table, type_="foreignkey")
            return


def _fk_on_dw_id_exists(table: str) -> bool:
    for fk in inspect(op.get_bind()).get_foreign_keys(table):
        constrained = fk.get("constrained_columns") or []
        if "dw_id" in constrained and fk.get("referred_table") == "system_datawarehouse":
            return True
    return False


def upgrade() -> None:
    if not _table_exists("logs_server_error"):
        return
    _drop_fk_for_column("logs_server_error", "dw_id")


def downgrade() -> None:
    if not _table_exists("logs_server_error") or not _table_exists("system_datawarehouse"):
        return
    if _fk_on_dw_id_exists("logs_server_error"):
        return
    op.create_foreign_key(
        "fk_logs_server_error_dw_id",
        "logs_server_error",
        "system_datawarehouse",
        ["dw_id"],
        ["id"],
    )
