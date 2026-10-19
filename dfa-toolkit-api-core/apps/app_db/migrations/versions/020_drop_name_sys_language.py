"""Drop name column and rename code→locale in system_language.

Idempotent: each operation is guarded by an existence check so the migration
can be re-run safely.

Revision ID: 020_drop_name_sys_language
Revises: 019_app_client_auth
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "020_drop_name_sys_language"
down_revision = "019_app_client_auth"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns(table)}


def _unique_constraints(table: str) -> set[str]:
    return {uc["name"] for uc in inspect(op.get_bind()).get_unique_constraints(table)}


def upgrade() -> None:
    cols = _columns("system_language")

    # 1. Drop the redundant name column (already in system_language_i18n)
    if "name" in cols:
        op.drop_column("system_language", "name")

    # 2. Rename code → locale
    if "code" in cols:
        ucs = _unique_constraints("system_language")
        if "uq_system_language_code" in ucs:
            op.drop_constraint("uq_system_language_code", "system_language", type_="unique")

        op.alter_column(
            "system_language",
            "code",
            new_column_name="locale",
            existing_type=sa.String(length=10),
            existing_nullable=False,
        )

        op.create_unique_constraint(
            "uq_system_language_locale", "system_language", ["locale"]
        )

    # Handle the case where a previous run renamed to lang_code instead of locale
    if "lang_code" in cols:
        ucs = _unique_constraints("system_language")
        if "uq_system_language_lang_code" in ucs:
            op.drop_constraint("uq_system_language_lang_code", "system_language", type_="unique")

        op.alter_column(
            "system_language",
            "lang_code",
            new_column_name="locale",
            existing_type=sa.String(length=10),
            existing_nullable=False,
        )

        op.create_unique_constraint(
            "uq_system_language_locale", "system_language", ["locale"]
        )


def downgrade() -> None:
    cols = _columns("system_language")

    # 1. Rename locale → code
    if "locale" in cols:
        ucs = _unique_constraints("system_language")
        if "uq_system_language_locale" in ucs:
            op.drop_constraint("uq_system_language_locale", "system_language", type_="unique")

        op.alter_column(
            "system_language",
            "locale",
            new_column_name="code",
            existing_type=sa.String(length=10),
            existing_nullable=False,
        )

        op.create_unique_constraint(
            "uq_system_language_code", "system_language", ["code"]
        )

    # 2. Re-add name column
    cols = _columns("system_language")
    if "name" not in cols:
        op.add_column(
            "system_language",
            sa.Column(
                "name",
                sa.String(length=100),
                nullable=False,
                comment="Language display name",
            ),
        )
