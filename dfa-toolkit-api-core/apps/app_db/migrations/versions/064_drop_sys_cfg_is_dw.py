"""Drop system_configuration.is_dw.

Warehouse-mirrored keys are defined in apps.app_db.constants.system_config.IS_DW_MIRROR_KEY_CODES
and seeded from apps.shared.config.config.Settings (see perform_sync_ut_dw_configs).

Downgrade re-adds is_dw with default 0 only; it does not restore which rows had is_dw=1
(that logic lived in migration 060_sys_cfg_is_dw).

Revision ID: 064_drop_sys_cfg_is_dw
Revises: 063_iam_user_addr_org
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "064_drop_sys_cfg_is_dw"
down_revision = "063_iam_user_addr_org"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("system_configuration"):
        return
    if _column_exists("system_configuration", "is_dw"):
        op.drop_column("system_configuration", "is_dw")


def downgrade() -> None:
    if not _table_exists("system_configuration"):
        return
    if not _column_exists("system_configuration", "is_dw"):
        op.add_column(
            "system_configuration",
            sa.Column(
                "is_dw",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="When true, key is seeded into warehouse db_configuration",
            ),
        )
