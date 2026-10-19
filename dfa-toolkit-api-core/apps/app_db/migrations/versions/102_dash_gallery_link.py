"""Dashboard gallery placement table: dash_gallery.

Revision ID: 102_dash_gallery_link
Revises: 101_dash_core
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "102_dash_gallery_link"
down_revision = "101_dash_core"
branch_labels = None
depends_on = None


def _table_exists(conn, name: str) -> bool:
    return bool(conn.execute(
        text("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
             "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :n"),
        {"n": name},
    ).scalar())


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, "dash_gallery"):
        conn.execute(text("""
            CREATE TABLE dash_gallery (
                id               INT      NOT NULL AUTO_INCREMENT    COMMENT 'Primary key',
                dashboard_id     INT      NOT NULL                   COMMENT 'FK: dash_dashboards.id',
                gallery_id       INT      NOT NULL                   COMMENT 'FK: system_gallery.id — the saved visualization being placed',
                section_id       INT      NULL                       COMMENT 'FK: dash_sections.id — section this item is placed in',
                position_x       INT      NULL DEFAULT 0             COMMENT 'Grid x-position',
                position_y       INT      NULL DEFAULT 0             COMMENT 'Grid y-position',
                width            INT      NULL DEFAULT 6             COMMENT 'Grid column span',
                height           INT      NULL DEFAULT 4             COMMENT 'Grid row span',
                `order`          INT      NULL DEFAULT 0             COMMENT 'Display order within the section',
                vis_settings     LONGTEXT NULL                       COMMENT 'JSON: position-specific visualization overrides',
                created          DATETIME NULL                       COMMENT 'Row creation timestamp',
                created_user_id  INT      NULL                       COMMENT 'FK: iam_user.id — user who placed this item',
                modified         DATETIME NULL                       COMMENT 'Last update timestamp',
                modified_user_id INT      NULL                       COMMENT 'FK: iam_user.id — user who last updated this placement',
                PRIMARY KEY (id),
                CONSTRAINT fk_dash_gal_dashboard FOREIGN KEY (dashboard_id)
                    REFERENCES dash_dashboards (id) ON DELETE CASCADE,
                CONSTRAINT fk_dash_gal_gallery FOREIGN KEY (gallery_id)
                    REFERENCES system_gallery (id) ON DELETE CASCADE,
                CONSTRAINT fk_dash_gal_section FOREIGN KEY (section_id)
                    REFERENCES dash_sections (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "dash_gallery"):
        conn.execute(text("DROP TABLE dash_gallery"))
