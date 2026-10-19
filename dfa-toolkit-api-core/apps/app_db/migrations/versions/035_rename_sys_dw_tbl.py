"""Rename system_datawarehouses table to system_datawarehouse (singular).

Revision ID: 034_rename_system_datawarehouses_table
Revises: 033_add_is_dw_spec_to_iam_resource
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "035_rename_sys_dw_tbl"
down_revision = "034_create_data_dictionary"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _constraint_exists(table_name: str, constraint_name: str) -> bool:
    """Check if a foreign key constraint exists on the given table."""
    inspector = inspect(op.get_bind())
    try:
        foreign_keys = inspector.get_foreign_keys(table_name)
        for fk in foreign_keys:
            if fk.get('name') == constraint_name:
                return True
        return False
    except Exception:
        return False


def _get_foreign_key_name(table_name: str, column_name: str, referenced_table: str) -> str:
    """Get the actual foreign key constraint name for a table/column."""
    inspector = inspect(op.get_bind())
    try:
        foreign_keys = inspector.get_foreign_keys(table_name)
        for fk in foreign_keys:
            if (fk.get('constrained_columns') == [column_name] and 
                fk.get('referred_table') == referenced_table):
                return fk.get('name')
    except Exception:
        pass
    return None


def upgrade():
    """Rename system_datawarehouses table to system_datawarehouse and update foreign keys."""
    
    # Check if rename is needed
    if _table_exists("system_datawarehouse") and not _table_exists("system_datawarehouses"):
        print("[OK] Table already renamed to system_datawarehouse")
        return
    
    if not _table_exists("system_datawarehouses"):
        print("[WARN] system_datawarehouses table does not exist, skipping")
        return
    
    # Foreign key mappings: (table, column, expected_constraint_name)
    foreign_keys_to_update = [
        ("gallery", "dw_id", "fk_gallery_dw_id"),
        ("logs_server_error", "dw_id", "fk_logs_server_errors_db_id"),
        ("logs_transaction", "dw_id", "fk_logs_transactions_db_id"),
        ("iam_user_role", "dw_id", "fk_iam_user_role_dw_id")
    ]
    
    dropped_constraints = []
    
    try:
        # Step 1: Drop foreign key constraints
        print("[INFO] Dropping foreign key constraints...")
        for table_name, column_name, expected_name in foreign_keys_to_update:
            if _table_exists(table_name):
                # Get the actual constraint name
                actual_fk_name = _get_foreign_key_name(table_name, column_name, "system_datawarehouses")
                if actual_fk_name:
                    try:
                        op.drop_constraint(actual_fk_name, table_name, type_="foreignkey")
                        dropped_constraints.append((table_name, column_name, actual_fk_name))
                        print(f"[OK] Dropped FK constraint {actual_fk_name} from {table_name}")
                    except Exception as e:
                        print(f"[WARN] Could not drop FK constraint {actual_fk_name} from {table_name}: {e}")
                else:
                    print(f"[INFO] No FK constraint found for {table_name}.{column_name}")
        
        # Step 2: Rename the table
        print("[INFO] Renaming table system_datawarehouses to system_datawarehouse...")
        op.execute(text("RENAME TABLE system_datawarehouses TO system_datawarehouse"))
        print("[OK] Table renamed successfully")
        
        # Step 3: Recreate foreign key constraints with new table name
        print("[INFO] Recreating foreign key constraints...")
        for table_name, column_name, original_fk_name in dropped_constraints:
            try:
                # Create new constraint with same name but pointing to renamed table
                op.create_foreign_key(
                    original_fk_name,
                    table_name,
                    "system_datawarehouse",
                    [column_name],
                    ["id"]
                )
                print(f"[OK] Recreated FK constraint {original_fk_name} for {table_name}")
            except Exception as e:
                print(f"[ERROR] Could not recreate FK constraint {original_fk_name} for {table_name}: {e}")
                
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}")
        raise


def downgrade():
    """Revert system_datawarehouse table back to system_datawarehouses."""
    
    # Check if revert is needed
    if _table_exists("system_datawarehouses") and not _table_exists("system_datawarehouse"):
        print("[OK] Table already reverted to system_datawarehouses")
        return
    
    if not _table_exists("system_datawarehouse"):
        print("[WARN] system_datawarehouse table does not exist, skipping")
        return
    
    # Foreign key mappings
    foreign_keys_to_update = [
        ("gallery", "dw_id", "fk_gallery_dw_id"),
        ("logs_server_error", "dw_id", "fk_logs_server_errors_db_id"),
        ("logs_transaction", "dw_id", "fk_logs_transactions_db_id"),
        ("iam_user_role", "dw_id", "fk_iam_user_role_dw_id")
    ]
    
    dropped_constraints = []
    
    try:
        # Step 1: Drop foreign key constraints
        print("[INFO] Dropping foreign key constraints...")
        for table_name, column_name, expected_name in foreign_keys_to_update:
            if _table_exists(table_name):
                actual_fk_name = _get_foreign_key_name(table_name, column_name, "system_datawarehouse")
                if actual_fk_name:
                    try:
                        op.drop_constraint(actual_fk_name, table_name, type_="foreignkey")
                        dropped_constraints.append((table_name, column_name, actual_fk_name))
                        print(f"[OK] Dropped FK constraint {actual_fk_name} from {table_name}")
                    except Exception as e:
                        print(f"[WARN] Could not drop FK constraint {actual_fk_name} from {table_name}: {e}")
        
        # Step 2: Rename the table back
        print("[INFO] Renaming table system_datawarehouse back to system_datawarehouses...")
        op.execute(text("RENAME TABLE system_datawarehouse TO system_datawarehouses"))
        print("[OK] Table renamed back successfully")
        
        # Step 3: Recreate foreign key constraints with original table name
        print("[INFO] Recreating foreign key constraints...")
        for table_name, column_name, original_fk_name in dropped_constraints:
            try:
                op.create_foreign_key(
                    original_fk_name,
                    table_name,
                    "system_datawarehouses",
                    [column_name],
                    ["id"]
                )
                print(f"[OK] Recreated FK constraint {original_fk_name} for {table_name}")
            except Exception as e:
                print(f"[ERROR] Could not recreate FK constraint {original_fk_name} for {table_name}: {e}")
                
    except Exception as e:
        print(f"[ERROR] Downgrade failed: {e}")
        raise