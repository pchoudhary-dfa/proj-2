"""Add display_order column to iam_role and iam_resource tables.

Revision ID: 028_add_display_order_iam_tables
Revises: 027_normalize_mysql_collation
Create Date: 2026-03-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "028_add_display_order_iam_tables"
down_revision = "027_normalize_mysql_collation"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # Add display_order to iam_role
    if _table_exists("iam_role"):
        cols = _columns("iam_role")
        if "display_order" not in cols:
            op.add_column(
                "iam_role",
                sa.Column("display_order", sa.Integer(), nullable=False, default=0,
                         comment="Display order for UI sorting (non-negative integers)")
            )
            # Backfill existing data
            op.execute(text("""
                UPDATE iam_role 
                SET display_order = (
                    SELECT COUNT(*) 
                    FROM (SELECT id FROM iam_role r2 WHERE r2.id <= iam_role.id) AS subq
                )
                WHERE display_order = 0
            """))
    
    # Add display_order to iam_resource  
    if _table_exists("iam_resource"):
        cols = _columns("iam_resource")
        if "display_order" not in cols:
            op.add_column(
                "iam_resource", 
                sa.Column("display_order", sa.Integer(), nullable=False, default=0,
                         comment="Display order for UI sorting (non-negative integers)")
            )
            # Backfill existing data
            op.execute(text("""
                UPDATE iam_resource
                SET display_order = (
                    SELECT COUNT(*) 
                    FROM (SELECT id FROM iam_resource r2 WHERE r2.id <= iam_resource.id) AS subq
                )
                WHERE display_order = 0
            """))


def downgrade() -> None:
    if _table_exists("iam_role"):
        cols = _columns("iam_role")
        if "display_order" in cols:
            op.drop_column("iam_role", "display_order")
    
    if _table_exists("iam_resource"):
        cols = _columns("iam_resource")
        if "display_order" in cols:
            op.drop_column("iam_resource", "display_order")