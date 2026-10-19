"""Create system_language_translations and system_language_translations_i18n tables

Revision ID: 003_create_sys_lang_tl
Revises: 002_create_system_app_and_config
Create Date: 2026-02-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "003_create_sys_lang_tl"
down_revision = "002_create_system_app_and_config"
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database"""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # system_language_translations (master records)
    if not table_exists("system_language_translations"):
        op.create_table(
            "system_language_translations",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("code", sa.String(length=255), nullable=True),
            sa.Column(
                "app_id",
                sa.Integer(),
                nullable=True,
                comment="FK of system_applications",
            ),
            sa.Column("default_text", sa.Text(), nullable=False),
            sa.Column("modified_by", sa.Integer(), nullable=True),
            sa.Column("modified_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(
                ["app_id"],
                ["system_applications.id"],
                name="fk_system_language_translations_app_id",
            ),
        )

    # system_language_translations_i18n (per-locale translated text)
    if not table_exists("system_language_translations_i18n"):
        op.create_table(
            "system_language_translations_i18n",
            sa.Column(
                "master_id",
                sa.Integer(),
                nullable=False,
                comment="FK of system_language_translations table",
            ),
            sa.Column(
                "locale",
                sa.String(length=3),
                nullable=False,
                comment="Locale like en, fr",
            ),
            sa.Column("translated_text", sa.Text(), nullable=False),
            sa.PrimaryKeyConstraint("master_id", "locale"),
            sa.ForeignKeyConstraint(
                ["master_id"],
                ["system_language_translations.id"],
                name="fk_system_language_translations_i18n_master_id",
            ),
        )


def downgrade() -> None:
    # Drop tables only if they exist
    if table_exists("system_language_translations_i18n"):
        op.drop_table("system_language_translations_i18n")
    if table_exists("system_language_translations"):
        op.drop_table("system_language_translations")
