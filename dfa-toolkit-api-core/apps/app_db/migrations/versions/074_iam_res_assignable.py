"""Add is_role_assignable flag to iam_resource.

Revision ID: 074_iam_res_assignable
Revises: 073_iam_user_location_phone
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "074_iam_res_assignable"
down_revision = "073_iam_user_location_phone"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(op.get_bind())
    columns = inspector.get_columns(table_name)
    return any(col["name"] == column_name for col in columns)


def upgrade() -> None:
    if not _table_exists("iam_resource"):
        return
    if _column_exists("iam_resource", "is_role_assignable"):
        return

    # MySQL DDL requested by product: TINYINT(1) NOT NULL DEFAULT 1.
    op.execute(
        text(
            """
            ALTER TABLE iam_resource
            ADD COLUMN is_role_assignable TINYINT(1) NOT NULL DEFAULT 1
            COMMENT '1=include resource in permission display payloads, 0=hide'
            AFTER is_active
            """
        )
    )


def downgrade() -> None:
    if not _table_exists("iam_resource"):
        return
    if not _column_exists("iam_resource", "is_role_assignable"):
        return
    op.execute(text("ALTER TABLE iam_resource DROP COLUMN is_role_assignable"))
