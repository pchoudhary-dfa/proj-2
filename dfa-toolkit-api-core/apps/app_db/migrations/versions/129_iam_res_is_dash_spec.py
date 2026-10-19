"""Add is_dash_spec column to iam_resource table.

Revision ID: 129_iam_res_is_dash_spec
Revises: 128_cleanup_orphan_iam
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "129_iam_res_is_dash_spec"
down_revision = "128_cleanup_orphan_iam"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    columns = inspect(op.get_bind()).get_columns(table_name)
    return any(col["name"] == column_name for col in columns)


def upgrade() -> None:
    if not _table_exists("iam_resource"):
        return
    if _column_exists("iam_resource", "is_dash_spec"):
        return
    op.execute(
        text(
            """
            ALTER TABLE iam_resource
            ADD COLUMN is_dash_spec TINYINT NOT NULL DEFAULT 0
            COMMENT '1 = dashboard-scoped resource; 0 = app-level'
            AFTER is_dw_spec
            """
        )
    )


def downgrade() -> None:
    if not _table_exists("iam_resource"):
        return
    if not _column_exists("iam_resource", "is_dash_spec"):
        return
    op.drop_column("iam_resource", "is_dash_spec")
