"""Refactor dash_visualization for visualization CRUD APIs.

- Change visualization_name from LONGBLOB to VARCHAR(255) NOT NULL.
- Drop provider column (ECharts-only now).
- Rename type_category to category.
- Add chart_variant, is_used_in_layout, created_user_id columns.
- Backfill is_used_in_layout from dash_dashboard_visualization.
- Drop dash_dashboard_visualization table (redundant since dashboard_id FK exists).

Revision ID: 124_viz_crud_refactor
Revises: 123_dash_delete_fks
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "124_viz_crud_refactor"
down_revision = "123_dash_delete_fks"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
        ),
        {"t": table, "c": column},
    ).scalar()
    return bool(row)


def _fk_exists(table: str, fk_name: str) -> bool:
    fks = inspect(op.get_bind()).get_foreign_keys(table)
    return any(fk.get("name") == fk_name for fk in fks)


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists("dash_visualization"):
        return

    # 1. Change visualization_name: LONGBLOB → VARCHAR(255) NOT NULL
    if _column_exists("dash_visualization", "visualization_name"):
        # Add temporary column
        if not _column_exists("dash_visualization", "viz_name"):
            conn.execute(text(
                "ALTER TABLE dash_visualization "
                "ADD COLUMN viz_name VARCHAR(255) NOT NULL DEFAULT '' "
                "AFTER layout_id"
            ))

        # Backfill: try to decode BLOB as UTF-8, extract first value if JSON object
        # WHERE viz_name = '' is not a KEY predicate; disable safe updates for this session.
        conn.execute(text("SET SESSION sql_safe_updates = 0"))
        try:
            conn.execute(text("""
                UPDATE dash_visualization
                SET viz_name = CASE
                    WHEN visualization_name IS NULL THEN ''
                    WHEN CAST(visualization_name AS CHAR(255)) LIKE '{"%'
                        THEN SUBSTRING_INDEX(
                            SUBSTRING_INDEX(CAST(visualization_name AS CHAR(1000)), ':"', -1),
                            '"', 1
                        )
                    ELSE LEFT(CAST(visualization_name AS CHAR(255)), 255)
                END
                WHERE viz_name = ''
            """))
        finally:
            conn.execute(text("SET SESSION sql_safe_updates = 1"))

        # Drop old BLOB column
        conn.execute(text(
            "ALTER TABLE dash_visualization DROP COLUMN visualization_name"
        ))

        # Rename new column to visualization_name
        conn.execute(text(
            "ALTER TABLE dash_visualization "
            "CHANGE COLUMN viz_name visualization_name VARCHAR(255) NOT NULL DEFAULT ''"
        ))

    # 2. Drop provider column
    if _column_exists("dash_visualization", "provider"):
        conn.execute(text(
            "ALTER TABLE dash_visualization DROP COLUMN provider"
        ))

    # 3. Rename type_category → category
    if _column_exists("dash_visualization", "type_category") and not _column_exists("dash_visualization", "category"):
        conn.execute(text(
            "ALTER TABLE dash_visualization "
            "CHANGE COLUMN type_category category VARCHAR(255) NULL"
        ))

    # 4. Add chart_variant column
    if not _column_exists("dash_visualization", "chart_variant"):
        conn.execute(text(
            "ALTER TABLE dash_visualization "
            "ADD COLUMN chart_variant VARCHAR(100) NULL AFTER `type`"
        ))

    # 5. Add is_used_in_layout column
    if not _column_exists("dash_visualization", "is_used_in_layout"):
        conn.execute(text(
            "ALTER TABLE dash_visualization "
            "ADD COLUMN is_used_in_layout SMALLINT NOT NULL DEFAULT 0 "
            "COMMENT '1 = placed on the dashboard canvas' "
            "AFTER is_deleted"
        ))

    # 6. Add created_user_id column
    if not _column_exists("dash_visualization", "created_user_id"):
        conn.execute(text(
            "ALTER TABLE dash_visualization "
            "ADD COLUMN created_user_id INT NULL "
            "COMMENT 'FK: iam_user.id — user who created this visualization' "
            "AFTER created"
        ))

    # 7. Backfill is_used_in_layout from join table
    if _table_exists("dash_dashboard_visualization"):
        conn.execute(text("SET SESSION sql_safe_updates = 0"))
        try:
            conn.execute(text(
                "UPDATE dash_visualization dv "
                "INNER JOIN dash_dashboard_visualization ddv "
                "  ON ddv.visualization_id = dv.id "
                "SET dv.is_used_in_layout = COALESCE(ddv.isused_in_dashboard_layout, 0) "
                "WHERE dv.is_used_in_layout = 0"
            ))
        finally:
            conn.execute(text("SET SESSION sql_safe_updates = 1"))

    # 8. Drop dash_dashboard_visualization (drop FKs first)
    if _table_exists("dash_dashboard_visualization"):
        if _fk_exists("dash_dashboard_visualization", "fk_ddv_dashboard"):
            op.drop_constraint("fk_ddv_dashboard", "dash_dashboard_visualization", type_="foreignkey")
        if _fk_exists("dash_dashboard_visualization", "fk_ddv_visualization"):
            op.drop_constraint("fk_ddv_visualization", "dash_dashboard_visualization", type_="foreignkey")
        op.drop_table("dash_dashboard_visualization")


def downgrade() -> None:
    conn = op.get_bind()

    if not _table_exists("dash_visualization"):
        return

    # Recreate dash_dashboard_visualization
    if not _table_exists("dash_dashboard_visualization"):
        conn.execute(text("""
            CREATE TABLE dash_dashboard_visualization (
                id                          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                dashboard_id                INT NULL,
                visualization_id            INT NULL,
                isused_in_dashboard_layout  SMALLINT NULL DEFAULT 0,
                created                     DATETIME NULL,
                modified                    DATETIME NULL,
                modified_user_id            INT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
        # Backfill from dash_visualization
        conn.execute(text(
            "INSERT INTO dash_dashboard_visualization "
            "(dashboard_id, visualization_id, isused_in_dashboard_layout, created, modified) "
            "SELECT dashboard_id, id, is_used_in_layout, created, modified "
            "FROM dash_visualization WHERE dashboard_id IS NOT NULL"
        ))
        # Recreate FKs
        if _table_exists("dash_dashboards"):
            op.create_foreign_key(
                "fk_ddv_dashboard", "dash_dashboard_visualization",
                "dash_dashboards", ["dashboard_id"], ["id"], ondelete="CASCADE",
            )
        op.create_foreign_key(
            "fk_ddv_visualization", "dash_dashboard_visualization",
            "dash_visualization", ["visualization_id"], ["id"], ondelete="CASCADE",
        )

    # Drop created_user_id
    if _column_exists("dash_visualization", "created_user_id"):
        conn.execute(text("ALTER TABLE dash_visualization DROP COLUMN created_user_id"))

    # Drop is_used_in_layout
    if _column_exists("dash_visualization", "is_used_in_layout"):
        conn.execute(text("ALTER TABLE dash_visualization DROP COLUMN is_used_in_layout"))

    # Drop chart_variant
    if _column_exists("dash_visualization", "chart_variant"):
        conn.execute(text("ALTER TABLE dash_visualization DROP COLUMN chart_variant"))

    # Rename category → type_category
    if _column_exists("dash_visualization", "category") and not _column_exists("dash_visualization", "type_category"):
        conn.execute(text(
            "ALTER TABLE dash_visualization "
            "CHANGE COLUMN category type_category VARCHAR(255) NULL"
        ))

    # Re-add provider column
    if not _column_exists("dash_visualization", "provider"):
        conn.execute(text(
            "ALTER TABLE dash_visualization "
            "ADD COLUMN provider VARCHAR(255) NULL AFTER visualization_name"
        ))

    # Revert visualization_name back to LONGBLOB
    if _column_exists("dash_visualization", "visualization_name"):
        conn.execute(text(
            "ALTER TABLE dash_visualization "
            "MODIFY COLUMN visualization_name LONGBLOB NULL"
        ))
