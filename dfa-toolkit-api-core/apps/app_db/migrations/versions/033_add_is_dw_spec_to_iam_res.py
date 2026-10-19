"""Add is_dw_spec column to iam_resource table.

Revision ID: 033_add_is_dw_spec_to_iam_resource
Revises: 032_update_system_config_column_lengths
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "033_add_is_dw_spec_to_iam_res"
down_revision = "032_update_sys_conf_col_len"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(op.get_bind())
    columns = inspector.get_columns(table_name)
    return any(col["name"] == column_name for col in columns)


def upgrade():
    """Add is_dw_spec column to iam_resource table."""
    if _table_exists("iam_resource"):
        if not _column_exists("iam_resource", "is_dw_spec"):
            try:
                # Add is_dw_spec column after description column
                op.execute(text("""
                    ALTER TABLE iam_resource 
                    ADD COLUMN is_dw_spec TINYINT NOT NULL DEFAULT '1' 
                    COMMENT 'Is Datawarehouse specific' 
                    AFTER description
                """))
                print("[OK] Added is_dw_spec column to iam_resource table")
            except Exception as e:
                print(f"[ERROR] Could not add is_dw_spec column: {e}")
        else:
            print("[OK] is_dw_spec column already exists in iam_resource table")
    else:
        print("[WARN] iam_resource table does not exist, skipping")


def downgrade():
    """Remove is_dw_spec column from iam_resource table."""
    if _table_exists("iam_resource"):
        if _column_exists("iam_resource", "is_dw_spec"):
            try:
                op.drop_column("iam_resource", "is_dw_spec")
                print("[OK] Removed is_dw_spec column from iam_resource table")
            except Exception as e:
                print(f"[ERROR] Could not remove is_dw_spec column: {e}")
        else:
            print("[OK] is_dw_spec column does not exist in iam_resource table")
    else:
        print("[WARN] iam_resource table does not exist, skipping")