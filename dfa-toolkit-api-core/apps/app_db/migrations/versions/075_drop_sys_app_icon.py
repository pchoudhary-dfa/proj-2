"""Drop icon column from system_application.

Revision ID: 075_drop_sys_app_icon
Revises: 074_iam_res_assignable
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "075_drop_sys_app_icon"
down_revision = "074_iam_res_assignable"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    columns = inspect(op.get_bind()).get_columns(table_name)
    return any(col["name"] == column_name for col in columns)


def upgrade() -> None:
    if not _table_exists("system_application"):
        return
    if not _column_exists("system_application", "icon"):
        return
    op.drop_column("system_application", "icon")


def downgrade() -> None:
    if not _table_exists("system_application"):
        return
    if _column_exists("system_application", "icon"):
        return
    op.add_column(
        "system_application",
        sa.Column(
            "icon",
            sa.Text(),
            nullable=True,
            comment="Application Logo in base64",
        ),
    )
