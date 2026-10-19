"""Dashboard core tables: dash_dashboards and dash_sections.

Revision ID: 101_dash_core
Revises: 100_datapoint_readiness
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "101_dash_core"
down_revision = "100_datapoint_readiness"
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

    if not _table_exists(conn, "dash_dashboards"):
        conn.execute(text("""
            CREATE TABLE dash_dashboards (
                id               INT          NOT NULL AUTO_INCREMENT       COMMENT 'Primary key',
                dashboard_gid    VARCHAR(60)  NOT NULL                      COMMENT 'Human-readable global identifier',
                dashboard_name   VARCHAR(255) NOT NULL                      COMMENT 'Internal name slug',
                dashboard_title  VARCHAR(255) NULL                          COMMENT 'Display title shown to end users',
                dashboard_version VARCHAR(20) NULL                          COMMENT 'Version tag',
                system_dw_id     INT          NULL                          COMMENT 'FK: system_datawarehouse.id — linked data warehouse',
                type             VARCHAR(50)  NULL                          COMMENT 'Dashboard type discriminator',
                mode             VARCHAR(50)  NULL                          COMMENT 'Display mode',
                body_color       VARCHAR(20)  NULL                          COMMENT 'Body background colour hex',
                banner_color     VARCHAR(20)  NULL                          COMMENT 'Banner background colour hex',
                title_color      VARCHAR(20)  NULL                          COMMENT 'Title text colour hex',
                resolution       VARCHAR(50)  NULL                          COMMENT 'Target screen resolution',
                banner_logo      TEXT         NULL                          COMMENT 'Banner logo identifier or data-URL',
                favicon          TEXT         NULL                          COMMENT 'Favicon data-URL or path',
                logo_id          INT          NULL                          COMMENT 'Artifact id for the dashboard logo',
                section_settings LONGTEXT     NULL                          COMMENT 'JSON: per-section layout settings',
                global_css       LONGTEXT     NULL                          COMMENT 'Custom global CSS injected into the dashboard',
                settings         LONGTEXT     NULL                          COMMENT 'JSON: miscellaneous dashboard settings',
                header_html      LONGTEXT     NULL                          COMMENT 'Custom header HTML',
                footer_html      LONGTEXT     NULL                          COMMENT 'Custom footer HTML',
                area_lvl_from    INT          NULL                          COMMENT 'Area level filter range — from',
                area_lvl_to      INT          NULL                          COMMENT 'Area level filter range — to',
                def_area_id      TEXT         NULL                          COMMENT 'JSON array of default area IDs',
                lang_selected    TEXT         NULL                          COMMENT 'Selected locale(s)',
                is_private       SMALLINT     NOT NULL DEFAULT 0            COMMENT '1 = private to owner; 0 = shared',
                is_published     SMALLINT     NOT NULL DEFAULT 0            COMMENT '1 = publicly published',
                enable_insights  TINYINT(1)   NOT NULL DEFAULT 0            COMMENT 'AI chart insights enabled for this dashboard',
                ai_settings      LONGTEXT     NULL                          COMMENT 'Encrypted JSON: {ai_provider, ai_api_key}',
                source_dash_id   INT          NULL                          COMMENT 'FK: dash_dashboards.id — original dashboard this was cloned from',
                created          DATETIME     NULL                          COMMENT 'Row creation timestamp',
                created_user_id  INT          NULL                          COMMENT 'FK: iam_user.id — user who created this dashboard',
                modified         DATETIME     NULL                          COMMENT 'Last update timestamp',
                modified_user_id INT          NULL                          COMMENT 'FK: iam_user.id — user who last modified this dashboard',
                PRIMARY KEY (id),
                CONSTRAINT uq_dash_dashboards_gid UNIQUE (dashboard_gid),
                CONSTRAINT fk_dash_dash_dw FOREIGN KEY (system_dw_id)
                    REFERENCES system_datawarehouse (id) ON DELETE SET NULL,
                CONSTRAINT fk_dash_dash_source FOREIGN KEY (source_dash_id)
                    REFERENCES dash_dashboards (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

    if not _table_exists(conn, "dash_sections"):
        conn.execute(text("""
            CREATE TABLE dash_sections (
                id                 INT          NOT NULL AUTO_INCREMENT      COMMENT 'Primary key',
                section_name       VARCHAR(255) NULL                         COMMENT 'Display name of the section',
                dashboard_id       INT          NOT NULL                     COMMENT 'FK: dash_dashboards.id',
                hide_global_filter SMALLINT     NOT NULL DEFAULT 0           COMMENT '1 = hide global area filter in this section',
                `order`            INT          NULL                         COMMENT 'Display order within the dashboard',
                reload_section     SMALLINT     NOT NULL DEFAULT 0           COMMENT '1 = auto-reload this section on interval',
                resolution         VARCHAR(50)  NULL                         COMMENT 'Override screen resolution for this section',
                created            DATETIME     NULL                         COMMENT 'Row creation timestamp',
                created_user_id    INT          NULL                         COMMENT 'FK: iam_user.id — user who created this section',
                modified           DATETIME     NULL                         COMMENT 'Last update timestamp',
                modified_user_id   INT          NULL                         COMMENT 'FK: iam_user.id — user who last modified this section',
                PRIMARY KEY (id),
                CONSTRAINT fk_dash_sec_dashboard FOREIGN KEY (dashboard_id)
                    REFERENCES dash_dashboards (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "dash_sections"):
        conn.execute(text("DROP TABLE dash_sections"))
    if _table_exists(conn, "dash_dashboards"):
        conn.execute(text("DROP TABLE dash_dashboards"))
