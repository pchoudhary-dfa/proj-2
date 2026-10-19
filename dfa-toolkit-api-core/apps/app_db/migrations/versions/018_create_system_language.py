"""Create system_language and system_language_i18n tables.

Revision ID: 018_create_system_language
Revises: 017_application_client
Create Date: 2026-03-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "018_create_system_language"
down_revision = "017_application_client"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not table_exists("system_language"):
        op.create_table(
            "system_language",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("code", sa.String(length=10), nullable=False, comment="Language code e.g. en, fr, ar"),
            sa.Column("name", sa.String(length=100), nullable=False, comment="Language display name"),
            sa.Column("is_rtl", sa.Boolean(), nullable=False, server_default=sa.false(), comment="True for right-to-left languages"),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false(), comment="True when language is system default"),
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false(), comment="Soft-delete flag"),
            sa.Column("created_user_id", sa.Integer(), nullable=True, comment="User ID who created this record"),
            sa.Column("created", sa.DateTime(), nullable=True, comment="Record creation timestamp"),
            sa.Column("modified_user_id", sa.Integer(), nullable=True, comment="User ID who last modified this record"),
            sa.Column("modified", sa.DateTime(), nullable=True, comment="Last modification timestamp"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code", name="uq_system_language_code"),
        )
        op.create_index("idx_system_language_is_deleted", "system_language", ["is_deleted"], unique=False)
        op.create_index("idx_system_language_is_default", "system_language", ["is_default"], unique=False)

    if not table_exists("system_language_i18n"):
        op.create_table(
            "system_language_i18n",
            sa.Column(
                "master_id",
                sa.Integer(),
                nullable=False,
                comment="FK: system_language.id",
            ),
            sa.Column(
                "locale",
                sa.String(length=3),
                nullable=False,
                comment="Locale code e.g. en, fr",
            ),
            sa.Column(
                "name",
                sa.String(length=100),
                nullable=False,
                comment="Translated language display name",
            ),
            sa.Column(
                "description",
                sa.Text(),
                nullable=True,
                comment="Translated description",
            ),
            sa.PrimaryKeyConstraint("master_id", "locale"),
            sa.ForeignKeyConstraint(
                ["master_id"],
                ["system_language.id"],
                name="fk_system_language_i18n_master_id",
            ),
        )


def downgrade() -> None:
    if table_exists("system_language_i18n"):
        op.drop_table("system_language_i18n")

    if table_exists("system_language"):
        op.drop_index("idx_system_language_is_default", table_name="system_language")
        op.drop_index("idx_system_language_is_deleted", table_name="system_language")
        op.drop_table("system_language")
