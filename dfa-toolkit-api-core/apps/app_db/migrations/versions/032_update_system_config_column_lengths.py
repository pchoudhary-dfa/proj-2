"""Update system_configuration column lengths: key_code to 60 chars, description to String(255).

Revision ID: 032_update_system_config_column_lengths
Revises: 031_fix_system_config_primary_key
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "032_update_sys_conf_col_len"
down_revision = "031_fix_sys_conf_pk"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(op.get_bind())
    columns = inspector.get_columns(table_name)
    return any(col["name"] == column_name for col in columns)


def _get_column_info(table_name: str, column_name: str) -> dict:
    """Get column information including type and length."""
    inspector = inspect(op.get_bind())
    columns = inspector.get_columns(table_name)
    for col in columns:
        if col["name"] == column_name:
            return col
    return {}


def upgrade():
    """Update column lengths in system_configuration table."""
    if _table_exists("system_configuration"):
        # Update key_code column to VARCHAR(60)
        if _column_exists("system_configuration", "key_code"):
            try:
                current_col = _get_column_info("system_configuration", "key_code")
                current_type = str(current_col.get("type", "")).upper()
                
                # Only modify if it's not already VARCHAR(60)
                if "VARCHAR(60)" not in current_type:
                    op.execute(text("""
                        ALTER TABLE system_configuration 
                        MODIFY COLUMN key_code VARCHAR(60) NOT NULL
                    """))
                    print("[OK] Updated key_code column to VARCHAR(60)")
                else:
                    print("[OK] key_code column is already VARCHAR(60)")
            except Exception as e:
                print(f"[ERROR] Could not update key_code column: {e}")
        else:
            print("[WARN] key_code column does not exist in system_configuration table")
        
        # Update description column to VARCHAR(255)
        if _column_exists("system_configuration", "description"):
            try:
                current_col = _get_column_info("system_configuration", "description")
                current_type = str(current_col.get("type", "")).upper()
                
                # Only modify if it's not already VARCHAR(255)
                if "VARCHAR(255)" not in current_type:
                    op.execute(text("""
                        ALTER TABLE system_configuration 
                        MODIFY COLUMN description VARCHAR(255) NULL
                    """))
                    print("[OK] Updated description column to VARCHAR(255)")
                else:
                    print("[OK] description column is already VARCHAR(255)")
            except Exception as e:
                print(f"[ERROR] Could not update description column: {e}")
        else:
            print("[WARN] description column does not exist in system_configuration table")
    else:
        print("[WARN] system_configuration table does not exist, skipping")


def downgrade():
    """Revert column lengths in system_configuration table."""
    if _table_exists("system_configuration"):
        # Revert key_code column to VARCHAR(255)
        if _column_exists("system_configuration", "key_code"):
            try:
                op.execute(text("""
                    ALTER TABLE system_configuration 
                    MODIFY COLUMN key_code VARCHAR(255) NOT NULL
                """))
                print("[OK] Reverted key_code column to VARCHAR(255)")
            except Exception as e:
                print(f"[ERROR] Could not revert key_code column: {e}")
        else:
            print("[WARN] key_code column does not exist in system_configuration table")
        
        # Revert description column to TEXT
        if _column_exists("system_configuration", "description"):
            try:
                op.execute(text("""
                    ALTER TABLE system_configuration 
                    MODIFY COLUMN description TEXT NULL
                """))
                print("[OK] Reverted description column to TEXT")
            except Exception as e:
                print(f"[ERROR] Could not revert description column: {e}")
        else:
            print("[WARN] description column does not exist in system_configuration table")
    else:
        print("[WARN] system_configuration table does not exist, skipping")