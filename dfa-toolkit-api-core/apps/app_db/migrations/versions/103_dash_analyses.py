"""Dashboard AI analysis cache: dash_analyses.

Revision ID: 103_dash_analyses
Revises: 102_dash_gallery_link
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "103_dash_analyses"
down_revision = "102_dash_gallery_link"
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

    if not _table_exists(conn, "dash_analyses"):
        conn.execute(text("""
            CREATE TABLE dash_analyses (
                id               INT         NOT NULL AUTO_INCREMENT   COMMENT 'Primary key',
                visualization_id INT         NOT NULL                  COMMENT 'FK: system_gallery.id — visualization this analysis belongs to',
                area_id          VARCHAR(60) NULL                      COMMENT 'Area identifier the analysis was generated for',
                analysis         LONGTEXT    NULL                      COMMENT 'AI-generated analysis text',
                created          DATETIME    NULL                      COMMENT 'Row creation timestamp',
                created_user_id  INT         NULL                      COMMENT 'FK: iam_user.id — user who triggered the analysis',
                modified         DATETIME    NULL                      COMMENT 'Last update timestamp',
                modified_user_id INT         NULL                      COMMENT 'FK: iam_user.id — user who last updated the analysis',
                PRIMARY KEY (id),
                CONSTRAINT fk_dash_analyses_gallery FOREIGN KEY (visualization_id)
                    REFERENCES system_gallery (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "dash_analyses"):
        conn.execute(text("DROP TABLE dash_analyses"))
