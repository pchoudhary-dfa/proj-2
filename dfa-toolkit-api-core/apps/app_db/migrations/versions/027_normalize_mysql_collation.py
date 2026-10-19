"""Normalize MySQL charset/collation for all app DB tables.

Revision ID: 027_normalize_mysql_collation
Revises: 026_rename_trans_code_logs_dw_id
Create Date: 2026-03-20
"""

from alembic import op
from sqlalchemy import text

from apps.app_db.config import app_db_settings

revision = "027_normalize_mysql_collation"
down_revision = "026_rename_trans_code_logs_dw_id"
branch_labels = None
depends_on = None


def _is_mysql(bind) -> bool:
    return bind.dialect.name == "mysql"


def _get_tables(bind, db_name: str) -> list[str]:
    rows = bind.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = :db_name
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        ),
        {"db_name": db_name},
    ).fetchall()
    return [row[0] for row in rows]


def _table_has_mismatched_collation(bind, db_name: str, table_name: str, target_collation: str) -> bool:
    row = bind.execute(
        text(
            """
            SELECT COUNT(*) AS cnt
            FROM information_schema.columns
            WHERE table_schema = :db_name
              AND table_name = :table_name
              AND collation_name IS NOT NULL
              AND collation_name <> :target_collation
            """
        ),
        {
            "db_name": db_name,
            "table_name": table_name,
            "target_collation": target_collation,
        },
    ).fetchone()
    return bool(row and row[0] > 0)


def upgrade() -> None:
    bind = op.get_bind()
    if not _is_mysql(bind):
        return

    db_name = app_db_settings.DB_NAME
    target_charset = app_db_settings.DB_CHARSET
    target_collation = app_db_settings.DB_COLLATION

    # Ensure schema defaults are set first.
    op.execute(
        text(
            f"ALTER DATABASE `{db_name}` CHARACTER SET {target_charset} COLLATE {target_collation}"
        )
    )

    # Normalize each table only when it has mismatched text collations.
    for table_name in _get_tables(bind, db_name):
        if _table_has_mismatched_collation(bind, db_name, table_name, target_collation):
            op.execute(
                text(
                    f"ALTER TABLE `{table_name}` CONVERT TO CHARACTER SET {target_charset} COLLATE {target_collation}"
                )
            )


def downgrade() -> None:
    # Irreversible safely without knowing previous per-table/per-column collations.
    pass
