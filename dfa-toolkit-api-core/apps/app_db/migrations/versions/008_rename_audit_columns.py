"""Rename audit columns to standard names across all app-db tables.

Renames:
  system_datawarehouses:        created_by -> created_user_id, created_at -> created,
                                updated_by -> modified_user_id, updated_at -> modified
  system_language_translations: created_by -> created_user_id, created_at -> created,
                                modified_by -> modified_user_id, modified_at -> modified
  user_visualizations:          created_at -> created, updated_at -> modified
  logs_server_errors:           created_at -> created

Revision ID: 008_rename_audit_columns
Revises: 007_alter_system_datawarehouses
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "008_rename_audit_columns"
down_revision = "007_alter_system_datawarehouses"
branch_labels = None
depends_on = None


def column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


# ---------------------------------------------------------------------------
# system_datawarehouses
# ---------------------------------------------------------------------------

_SD_RENAMES = [
    # (old_name, new_name, sa_type, nullable, server_default)
    ("created_by",  "created_user_id",  sa.Integer(),  True,  "0"),
    ("created_at",  "created",          sa.DateTime(), True,  None),
    ("updated_by",  "modified_user_id", sa.Integer(),  False, "0"),
    ("updated_at",  "modified",         sa.DateTime(), True,  None),
]

_SLT_RENAMES = [
    ("created_by",  "created_user_id",  sa.Integer(),  False, None),
    ("created_at",  "created",          sa.DateTime(), True,  None),
    ("modified_by", "modified_user_id", sa.Integer(),  True,  None),
    ("modified_at", "modified",         sa.DateTime(), True,  None),
]

_UV_RENAMES = [
    ("created_at", "created",  sa.DateTime(), True, None),
    ("updated_at", "modified", sa.DateTime(), True, None),
]

_LSE_RENAMES = [
    ("created_at", "created", sa.DateTime(), False, None),
]


def _rename(table: str, renames: list) -> None:
    for old, new, typ, nullable, server_default in renames:
        if column_exists(table, old) and not column_exists(table, new):
            kwargs = dict(existing_type=typ, existing_nullable=nullable, new_column_name=new)
            if server_default is not None:
                kwargs["existing_server_default"] = server_default
            op.alter_column(table, old, **kwargs)


def _unrename(table: str, renames: list) -> None:
    """Reverse: new_name -> old_name."""
    for old, new, typ, nullable, server_default in renames:
        if column_exists(table, new) and not column_exists(table, old):
            kwargs = dict(existing_type=typ, existing_nullable=nullable, new_column_name=old)
            if server_default is not None:
                kwargs["existing_server_default"] = server_default
            op.alter_column(table, new, **kwargs)


def upgrade() -> None:
    _rename("system_datawarehouses", _SD_RENAMES)
    _rename("system_language_translations", _SLT_RENAMES)
    _rename("user_visualizations", _UV_RENAMES)
    _rename("logs_server_errors", _LSE_RENAMES)


def downgrade() -> None:
    _unrename("system_datawarehouses", _SD_RENAMES)
    _unrename("system_language_translations", _SLT_RENAMES)
    _unrename("user_visualizations", _UV_RENAMES)
    _unrename("logs_server_errors", _LSE_RENAMES)
