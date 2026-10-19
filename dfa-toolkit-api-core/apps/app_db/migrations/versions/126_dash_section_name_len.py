"""Widen dash_sections.section_name to VARCHAR(512) for i18n JSON.

Revision ID: 126_dash_section_name_len
Revises: 125_dash_upload_binary
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "126_dash_section_name_len"
down_revision = "125_dash_upload_binary"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists("dash_sections"):
        return
    conn.execute(text(
        "ALTER TABLE dash_sections "
        "MODIFY section_name VARCHAR(512) NULL "
        "COMMENT 'Display name of the section (i18n JSON)'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists("dash_sections"):
        return
    conn.execute(text(
        "ALTER TABLE dash_sections "
        "MODIFY section_name VARCHAR(255) NULL "
        "COMMENT 'Display name of the section'"
    ))
