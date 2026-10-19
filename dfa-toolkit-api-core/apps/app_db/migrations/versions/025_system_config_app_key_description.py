"""Replace system_configuration.application_id with app_key and add description.

Revision ID: 025_system_config_app_key_desc
Revises: 024_alter_urc_resource_code
Create Date: 2026-03-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text
from apps.app_db.config import app_db_settings

revision = "025_system_config_app_key_desc"
down_revision = "024_alter_urc_resource_code"
branch_labels = None
depends_on = None

_TABLE = "system_configuration"
_APP_TABLE = "system_application"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns(table)}


def _drop_fk_for_column(table: str, column_name: str) -> None:
    for fk in inspect(op.get_bind()).get_foreign_keys(table):
        constrained = fk.get("constrained_columns") or []
        fk_name = fk.get("name")
        if column_name in constrained and fk_name:
            op.drop_constraint(fk_name, table_name=table, type_="foreignkey")


def _fk_exists(table: str, local_column: str, referred_table: str, referred_column: str) -> bool:
    for fk in inspect(op.get_bind()).get_foreign_keys(table):
        constrained = fk.get("constrained_columns") or []
        referred_cols = fk.get("referred_columns") or []
        if (
            local_column in constrained
            and fk.get("referred_table") == referred_table
            and referred_column in referred_cols
        ):
            return True
    return False


def _pk_columns(table: str) -> list[str]:
    return list((inspect(op.get_bind()).get_pk_constraint(table) or {}).get("constrained_columns") or [])


def _pk_name(table: str) -> str | None:
    return (inspect(op.get_bind()).get_pk_constraint(table) or {}).get("name")


def _index_exists(table: str, index_name: str) -> bool:
    return any(idx.get("name") == index_name for idx in inspect(op.get_bind()).get_indexes(table))


def _is_mysql() -> bool:
    """Check if we're running on MySQL"""
    return op.get_bind().dialect.name == "mysql"


def upgrade() -> None:
    if not _table_exists(_TABLE):
        return

    cols = _columns(_TABLE)
    if "app_key" not in cols:
        op.add_column(
            _TABLE,
            sa.Column("app_key", sa.String(length=10), nullable=True, comment="FK: system_application.app_key"),
        )

    cols = _columns(_TABLE)
    if "application_id" in cols:
        op.execute(
            text(
                """
                UPDATE system_configuration sc
                SET app_key = (
                    SELECT sa.app_key
                    FROM system_application sa
                    WHERE sa.id = sc.application_id
                    LIMIT 1
                )
                WHERE sc.application_id IS NOT NULL
                  AND sc.app_key IS NULL
                """
            )
        )

        _drop_fk_for_column(_TABLE, "application_id")
        op.drop_column(_TABLE, "application_id")

    cols = _columns(_TABLE)
    if "description" not in cols:
        op.add_column(
            _TABLE,
            sa.Column("description", sa.Text(), nullable=True, comment="Configuration description"),
        )

    cols = _columns(_TABLE)
    if "key_name" in cols and "key_code" not in cols:
        op.alter_column(
            _TABLE,
            "key_name",
            new_column_name="key_code",
            existing_type=sa.String(length=255),
            existing_nullable=False,
        )

    cols = _columns(_TABLE)
    if "app_key" in cols:
        op.alter_column(
            _TABLE,
            "app_key",
            existing_type=sa.String(length=10),
            nullable=False,
        )
    if "key_code" in cols:
        op.alter_column(
            _TABLE,
            "key_code",
            existing_type=sa.String(length=255),
            nullable=False,
        )

    if "id" in cols and not _index_exists(_TABLE, "uq_system_configuration_id"):
        op.create_index("uq_system_configuration_id", _TABLE, ["id"], unique=True)

    pk_cols = _pk_columns(_TABLE)
    if pk_cols != ["app_key", "key_code"]:
        current_pk_name = _pk_name(_TABLE) or "PRIMARY"
        op.drop_constraint(current_pk_name, _TABLE, type_="primary")
        op.create_primary_key(
            "pk_system_configuration_app_key_key_code",
            _TABLE,
            ["app_key", "key_code"],
        )

    if _table_exists(_APP_TABLE) and not _fk_exists(_TABLE, "app_key", _APP_TABLE, "app_key"):
        # Clean up any orphaned records before creating foreign key
        op.execute(text(f"""
            DELETE FROM {_TABLE} 
            WHERE app_key IS NOT NULL 
            AND app_key NOT IN (SELECT app_key FROM {_APP_TABLE})
        """))
        
        # Ensure both columns have compatible charset/collation before creating foreign key (MySQL only)
        if _is_mysql():
            target_charset = app_db_settings.DB_CHARSET
            target_collation = app_db_settings.DB_COLLATION
            
            # Normalize app_key columns to ensure compatibility
            op.execute(text(f"""
                ALTER TABLE `{_TABLE}` 
                MODIFY COLUMN app_key VARCHAR(10) 
                CHARACTER SET {target_charset} COLLATE {target_collation} NOT NULL
            """))
            
            op.execute(text(f"""
                ALTER TABLE `{_APP_TABLE}` 
                MODIFY COLUMN app_key VARCHAR(10) 
                CHARACTER SET {target_charset} COLLATE {target_collation} NOT NULL
            """))
        
        # Now create the foreign key
        op.create_foreign_key(
            "fk_system_configuration_app_key",
            _TABLE,
            _APP_TABLE,
            ["app_key"],
            ["app_key"],
        )


def downgrade() -> None:
    if not _table_exists(_TABLE):
        return

    cols = _columns(_TABLE)
    if "application_id" not in cols:
        op.add_column(
            _TABLE,
            sa.Column("application_id", sa.Integer(), nullable=True, comment="FK: system_application.id"),
        )

    cols = _columns(_TABLE)
    if "app_key" in cols:
        op.execute(
            text(
                """
                UPDATE system_configuration sc
                SET application_id = (
                    SELECT sa.id
                    FROM system_application sa
                    WHERE sa.app_key = sc.app_key
                    LIMIT 1
                )
                WHERE sc.app_key IS NOT NULL
                  AND sc.application_id IS NULL
                """
            )
        )

    _drop_fk_for_column(_TABLE, "app_key")

    pk_cols = _pk_columns(_TABLE)
    if pk_cols == ["app_key", "key_code"]:
        current_pk_name = _pk_name(_TABLE) or "PRIMARY"
        op.drop_constraint(current_pk_name, _TABLE, type_="primary")
        op.create_primary_key(
            "pk_system_configuration_id",
            _TABLE,
            ["id"],
        )

    cols = _columns(_TABLE)
    if "key_code" in cols and "key_name" not in cols:
        op.alter_column(
            _TABLE,
            "key_code",
            new_column_name="key_name",
            existing_type=sa.String(length=255),
            existing_nullable=False,
        )

    cols = _columns(_TABLE)
    if "description" in cols:
        op.drop_column(_TABLE, "description")
    if "app_key" in cols:
        op.drop_column(_TABLE, "app_key")

    if _table_exists(_APP_TABLE) and not _fk_exists(_TABLE, "application_id", _APP_TABLE, "id"):
        op.create_foreign_key(
            "fk_system_configuration_application_id",
            _TABLE,
            _APP_TABLE,
            ["application_id"],
            ["id"],
        )
