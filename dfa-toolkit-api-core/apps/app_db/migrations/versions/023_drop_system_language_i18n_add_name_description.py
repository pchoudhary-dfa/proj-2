"""Drop system_language_i18n and add name/description to system_language.

Revision ID: 023_sys_lang_name_desc
Revises: 022_i18n_iam_resource
Create Date: 2026-03-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "023_sys_lang_name_desc"
down_revision = "022_i18n_iam_resource"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "system_language" in _tables():
        cols = _columns("system_language")
        if "name" not in cols:
            op.add_column(
                "system_language",
                sa.Column("name", sa.String(length=100), nullable=True, comment="Language display name"),
            )
        if "description" not in cols:
            op.add_column(
                "system_language",
                sa.Column("description", sa.Text(), nullable=True, comment="Language description"),
            )

    if "system_language_i18n" in _tables():
        op.drop_table("system_language_i18n")


def downgrade() -> None:
    if "system_language_i18n" not in _tables():
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

    if "system_language" in _tables():
        cols = _columns("system_language")
        if "description" in cols:
            op.drop_column("system_language", "description")
        if "name" in cols:
            op.drop_column("system_language", "name")
