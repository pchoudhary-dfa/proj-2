"""Dashboard embed tracking tables: dash_embed_vos, dash_embed_vo_owners, dash_embed_vo_owner_websites.

Revision ID: 105_dash_embed
Revises: 104_dash_artifacts
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "105_dash_embed"
down_revision = "104_dash_artifacts"
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

    if not _table_exists(conn, "dash_embed_vos"):
        conn.execute(text("""
            CREATE TABLE dash_embed_vos (
                id               INT      NOT NULL AUTO_INCREMENT   COMMENT 'Primary key',
                gallery_id       INT      NOT NULL                  COMMENT 'FK: system_gallery.id — the visualization being embedded',
                counter          INT      NOT NULL DEFAULT 0        COMMENT 'Total cumulative embed view count',
                is_deleted       SMALLINT NOT NULL DEFAULT 0        COMMENT 'Soft-delete flag: 1 = deleted',
                created          DATETIME NULL                      COMMENT 'Row creation timestamp',
                created_user_id  INT      NULL                      COMMENT 'FK: iam_user.id — user who created this embed',
                modified         DATETIME NULL                      COMMENT 'Last update timestamp',
                modified_user_id INT      NULL                      COMMENT 'FK: iam_user.id — user who last modified this embed',
                PRIMARY KEY (id),
                CONSTRAINT fk_dash_emb_gallery FOREIGN KEY (gallery_id)
                    REFERENCES system_gallery (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

    if not _table_exists(conn, "dash_embed_vo_owners"):
        conn.execute(text("""
            CREATE TABLE dash_embed_vo_owners (
                id           INT         NOT NULL AUTO_INCREMENT   COMMENT 'Primary key',
                embed_vo_id  INT         NOT NULL                  COMMENT 'FK: dash_embed_vos.id',
                ip_address   VARCHAR(50) NULL                      COMMENT 'IP address of the embedding host',
                counter      INT         NOT NULL DEFAULT 0        COMMENT 'View count from this IP',
                is_blocked   SMALLINT    NOT NULL DEFAULT 0        COMMENT '1 = this IP is blocked from viewing the embed',
                created      DATETIME    NULL                      COMMENT 'Row creation timestamp',
                modified     DATETIME    NULL                      COMMENT 'Last update timestamp',
                PRIMARY KEY (id),
                CONSTRAINT fk_dash_emb_owner_vo FOREIGN KEY (embed_vo_id)
                    REFERENCES dash_embed_vos (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

    if not _table_exists(conn, "dash_embed_vo_owner_websites"):
        conn.execute(text("""
            CREATE TABLE dash_embed_vo_owner_websites (
                id                INT      NOT NULL AUTO_INCREMENT   COMMENT 'Primary key',
                embed_vo_owner_id INT      NOT NULL                  COMMENT 'FK: dash_embed_vo_owners.id',
                website_url       TEXT     NULL                      COMMENT 'Referring domain/URL that embedded the visualization',
                counter           INT      NOT NULL DEFAULT 0        COMMENT 'View count from this website',
                created           DATETIME NULL                      COMMENT 'Row creation timestamp',
                modified          DATETIME NULL                      COMMENT 'Last update timestamp',
                PRIMARY KEY (id),
                CONSTRAINT fk_dash_emb_web_owner FOREIGN KEY (embed_vo_owner_id)
                    REFERENCES dash_embed_vo_owners (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "dash_embed_vo_owner_websites"):
        conn.execute(text("DROP TABLE dash_embed_vo_owner_websites"))
    if _table_exists(conn, "dash_embed_vo_owners"):
        conn.execute(text("DROP TABLE dash_embed_vo_owners"))
    if _table_exists(conn, "dash_embed_vos"):
        conn.execute(text("DROP TABLE dash_embed_vos"))
