"""Add unique constraint to system_configuration table for (app_key, dw_id, key_code).

Revision ID: 030_add_unique_constraint_system_configuration
Revises: 029_add_dw_id_system_configuration
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "030_add_uq_cons_sys_config"
down_revision = "029_add_dw_id_to_sys_config"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _constraint_exists(table_name: str, constraint_name: str) -> bool:
    """Check if a constraint exists on the given table."""
    inspector = inspect(op.get_bind())
    try:
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
    """Add unique constraint for (app_key, dw_id, key_code) to system_configuration table."""
    if _table_exists("system_configuration"):
        constraint_name = "uq_sys_config_app_dw_key"
        
        if not _constraint_exists("system_configuration", constraint_name):
            # Add unique constraint
            op.create_unique_constraint(
                constraint_name,
                "system_configuration",
                ["app_key", "dw_id", "key_code"]
            )
            print(f"✓ Added unique constraint '{constraint_name}' to system_configuration table")
        else:
            print(f"✓ Unique constraint '{constraint_name}' already exists on system_configuration table")
    else:
        print("! system_configuration table does not exist, skipping")


def downgrade():
    """Remove unique constraint from system_configuration table."""
    if _table_exists("system_configuration"):
        constraint_name = "uq_sys_config_app_dw_key"
        
        if _constraint_exists("system_configuration", constraint_name):
            op.drop_constraint(constraint_name, "system_configuration", type_="unique")
            print(f"✓ Removed unique constraint '{constraint_name}' from system_configuration table")
        else:
            print(f"✓ Unique constraint '{constraint_name}' does not exist on system_configuration table")
    else:
        print("! system_configuration table does not exist, skipping")