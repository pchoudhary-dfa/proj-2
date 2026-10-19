"""Fix system_configuration primary key to allow dw-specific entries.

Revision ID: 031_fix_system_config_primary_key
Revises: 030_add_uq_cons_sys_config
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "031_fix_sys_conf_pk"
down_revision = "030_add_uq_cons_sys_config"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _constraint_exists(table_name: str, constraint_name: str) -> bool:
    """Check if a constraint exists on the given table."""
    inspector = inspect(op.get_bind())
    try:
        # Get primary key constraint
        pk_constraint = inspector.get_pk_constraint(table_name)
        if pk_constraint.get('name') == constraint_name:
            return True
        
        # Get unique constraints
        unique_constraints = inspector.get_unique_constraints(table_name)
        for constraint in unique_constraints:
            if constraint.get('name') == constraint_name:
                return True
        
        # Also check indexes that might serve as unique constraints
        indexes = inspector.get_indexes(table_name)
        for index in indexes:
            if index.get('name') == constraint_name and index.get('unique'):
                return True
                
        return False
    except Exception:
        return False


def upgrade():
    """Fix primary key constraint to use id column instead of composite key."""
    if _table_exists("system_configuration"):
        # Step 1: Drop the existing primary key constraint
        try:
            # MySQL syntax to drop primary key
            op.execute(text("ALTER TABLE system_configuration DROP PRIMARY KEY"))
            print("[OK] Dropped existing primary key constraint on system_configuration")
        except Exception as e:
            print(f"[WARN] Could not drop primary key (may not exist): {e}")
        
        # Step 2: Make id column auto-increment and primary key
        try:
            # Modify id column to be auto-increment primary key
            op.execute(text("""
                ALTER TABLE system_configuration 
                MODIFY COLUMN id INT AUTO_INCREMENT PRIMARY KEY
            """))
            print("[OK] Set id column as auto-increment primary key")
        except Exception as e:
            print(f"[ERROR] Could not modify id column: {e}")
            
        # Step 3: Ensure the unique constraint exists (should already be there from migration 030)
        constraint_name = "uq_sys_config_app_dw_key"
        if not _constraint_exists("system_configuration", constraint_name):
            try:
                op.create_unique_constraint(
                    constraint_name,
                    "system_configuration",
                    ["app_key", "dw_id", "key_code"]
                )
                print(f"[OK] Added unique constraint '{constraint_name}' to system_configuration table")
            except Exception as e:
                print(f"[ERROR] Could not create unique constraint: {e}")
        else:
            print(f"[OK] Unique constraint '{constraint_name}' already exists")
    else:
        print("[WARN] system_configuration table does not exist, skipping")


def downgrade():
    """Revert to composite primary key (app_key, key_code)."""
    if _table_exists("system_configuration"):
        # Step 1: Drop the current primary key on id
        try:
            op.execute(text("ALTER TABLE system_configuration DROP PRIMARY KEY"))
            print("[OK] Dropped id primary key constraint")
        except Exception as e:
            print(f"[ERROR] Could not drop primary key: {e}")
        
        # Step 2: Remove auto-increment from id column
        try:
            op.execute(text("""
                ALTER TABLE system_configuration 
                MODIFY COLUMN id INT NOT NULL
            """))
            print("[OK] Removed auto-increment from id column")
        except Exception as e:
            print(f"[ERROR] Could not modify id column: {e}")
            
        # Step 3: Add composite primary key back
        try:
            op.execute(text("""
                ALTER TABLE system_configuration 
                ADD PRIMARY KEY (app_key, key_code)
            """))
            print("[OK] Added composite primary key (app_key, key_code)")
        except Exception as e:
            print(f"[ERROR] Could not add composite primary key: {e}")
    else:
        print("[WARN] system_configuration table does not exist, skipping")