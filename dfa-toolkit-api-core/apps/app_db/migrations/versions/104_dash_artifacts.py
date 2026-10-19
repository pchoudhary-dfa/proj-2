"""Dashboard file tables: dash_artifacts and dash_uploads.

Revision ID: 104_dash_artifacts
Revises: 103_dash_analyses
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "104_dash_artifacts"
down_revision = "103_dash_analyses"
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

    if not _table_exists(conn, "dash_artifacts"):
        conn.execute(text("""
            CREATE TABLE dash_artifacts (
                id               INT          NOT NULL AUTO_INCREMENT   COMMENT 'Primary key',
                binary_obj       LONGTEXT     NULL                      COMMENT 'Base64-encoded binary content',
                type             VARCHAR(50)  NULL                      COMMENT 'MIME type or content category (e.g. image/png)',
                filename         VARCHAR(255) NULL                      COMMENT 'Original filename',
                file_ext         VARCHAR(20)  NULL                      COMMENT 'File extension without dot (e.g. png)',
                file_size        INT          NULL                      COMMENT 'File size in bytes',
                file_width       INT          NULL                      COMMENT 'Image width in pixels',
                file_height      INT          NULL                      COMMENT 'Image height in pixels',
                created          DATETIME     NULL                      COMMENT 'Row creation timestamp',
                created_user_id  INT          NULL                      COMMENT 'FK: iam_user.id — user who uploaded this artifact',
                modified         DATETIME     NULL                      COMMENT 'Last update timestamp',
                modified_user_id INT          NULL                      COMMENT 'FK: iam_user.id — user who last modified this artifact',
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

    if not _table_exists(conn, "dash_uploads"):
        conn.execute(text("""
            CREATE TABLE dash_uploads (
                id               INT          NOT NULL AUTO_INCREMENT   COMMENT 'Primary key',
                filename         VARCHAR(255) NULL                      COMMENT 'Original filename',
                file_path        VARCHAR(500) NULL                      COMMENT 'Server-side storage path',
                file_type        VARCHAR(100) NULL                      COMMENT 'MIME type of the uploaded file',
                file_size        INT          NULL                      COMMENT 'File size in bytes',
                user_id          INT          NULL                      COMMENT 'FK: iam_user.id — user who initiated this upload',
                status           VARCHAR(50)  NULL DEFAULT 'PENDING'   COMMENT 'Upload job status: PENDING | PROCESSING | COMPLETE | FAILED',
                created          DATETIME     NULL                      COMMENT 'Row creation timestamp',
                created_user_id  INT          NULL                      COMMENT 'FK: iam_user.id — same as user_id for uploads',
                modified         DATETIME     NULL                      COMMENT 'Last update timestamp',
                modified_user_id INT          NULL                      COMMENT 'FK: iam_user.id — user who last updated this upload record',
                PRIMARY KEY (id),
                CONSTRAINT fk_dash_upload_user FOREIGN KEY (user_id)
                    REFERENCES iam_user (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "dash_uploads"):
        conn.execute(text("DROP TABLE dash_uploads"))
    if _table_exists(conn, "dash_artifacts"):
        conn.execute(text("DROP TABLE dash_artifacts"))
