"""Add dw_id column to system_configuration table.

Revision ID: 029_add_dw_id_system_configuration
Revises: 028_add_display_order_iam_tables
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "029_add_dw_id_to_sys_config"
down_revision = "028_add_display_order_iam_tables"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(op.get_bind())
    columns = inspector.get_columns(table_name)
    return any(col["name"] == column_name for col in columns)


def upgrade():
    """Add dw_id column to system_configuration table."""
    if _table_exists("system_configuration"):
        if not _column_exists("system_configuration", "dw_id"):
            # Add dw_id column with default value 0
            op.add_column(
                "system_configuration",
                sa.Column(
                    "dw_id",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                    comment="Data warehouse identifier (0 for global configs)"
                )
            )
            print("✓ Added dw_id column to system_configuration table")
        else:
            print("✓ dw_id column already exists in system_configuration table")
    else:
        print("! system_configuration table does not exist, skipping")


def downgrade():
    """Remove dw_id column from system_configuration table."""
    if _table_exists("system_configuration"):
        if _column_exists("system_configuration", "dw_id"):
            op.drop_column("system_configuration", "dw_id")
            print("✓ Removed dw_id column from system_configuration table")
        else:
            print("✓ dw_id column does not exist in system_configuration table")
    else:
        print("! system_configuration table does not exist, skipping")