"""Alter iam_user_role_content.resource_code from INT to VARCHAR(50).

Revision ID: 024_alter_urc_resource_code
Revises: 023_sys_lang_name_desc
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "024_alter_urc_resource_code"
down_revision = "023_sys_lang_name_desc"
branch_labels = None
depends_on = None

_TABLE = "iam_user_role_content"
_COLUMN = "resource_code"


def _col_type(table: str, column: str) -> str | None:
    """Return the SQLAlchemy type name for a column, or None if not found."""
    for col in inspect(op.get_bind()).get_columns(table):
        if col["name"] == column:
            return type(col["type"]).__name__
    return None


def upgrade() -> None:
    col_type = _col_type(_TABLE, _COLUMN)
    if col_type is not None and col_type.upper() != "VARCHAR":
        op.alter_column(
            _TABLE,
            _COLUMN,
            existing_type=sa.Integer(),
            type_=sa.String(length=50),
            existing_nullable=False,
            comment="Resource code identifying the content domain (e.g. dm_dw_area, dm_dw_indicator)",
        )


def downgrade() -> None:
    col_type = _col_type(_TABLE, _COLUMN)
    if col_type is not None and col_type.upper() == "VARCHAR":
        op.alter_column(
            _TABLE,
            _COLUMN,
            existing_type=sa.String(length=50),
            type_=sa.Integer(),
            existing_nullable=False,
            postgresql_using=f"{_COLUMN}::integer",
            comment="Code identifying the content domain e.g. 1=datawarehouse",
        )
