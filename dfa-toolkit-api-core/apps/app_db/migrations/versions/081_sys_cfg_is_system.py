"""Add is_system to system_configuration; mark APP_ID and IUS_GID_SEPARATOR.

Revision ID: 081_sys_cfg_is_system
Revises: 080_dataset_returned_by_uid
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "081_sys_cfg_is_system"
down_revision = "080_dataset_returned_by_uid"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("system_configuration"):
        return
    added = False
    if not _column_exists("system_configuration", "is_system"):
        op.add_column(
            "system_configuration",
            sa.Column(
                "is_system",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="When true, row is treated as system-managed (UI may still update value/description/flag)",
            ),
        )
        added = True
    # Seed defaults only when the column is new, so re-running this revision does not overwrite user edits.
    if added:
        op.execute(
            text(
                "UPDATE system_configuration SET is_system = 1 "
                "WHERE key_code IN ('APP_ID', 'IUS_GID_SEPARATOR')"
            )
        )


def downgrade() -> None:
    if not _table_exists("system_configuration"):
        return
    if _column_exists("system_configuration", "is_system"):
        op.drop_column("system_configuration", "is_system")
