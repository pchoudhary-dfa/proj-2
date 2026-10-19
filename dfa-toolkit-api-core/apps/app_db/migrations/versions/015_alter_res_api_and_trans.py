"""Alter iam_resource_api and system_language_translation.

Operations (upgrade order):
  1. iam_resource_api: drop column `action`
  2. system_language_translation: drop FK on app_id, rename app_id → app_key, change type INTEGER → VARCHAR(10)

Downgrade reverses both operations.

Revision ID: 015_alter_iam_resource_api_and_translation
Revises: 014_rename_gallery_tables
Create Date: 2026-03-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "015_alter_res_api_and_trans"
down_revision = "014_rename_gallery_tables"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Guard helpers
# ---------------------------------------------------------------------------

def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def column_exists(table: str, col: str) -> bool:
    if not table_exists(table):
        return False
    return any(c["name"] == col for c in inspect(op.get_bind()).get_columns(table))


def fk_exists(table: str, fk_name: str) -> bool:
    if not table_exists(table):
        return False
    return any(fk["name"] == fk_name for fk in inspect(op.get_bind()).get_foreign_keys(table))


def index_exists(table: str, idx: str) -> bool:
    if not table_exists(table):
        return False
    return any(i["name"] == idx for i in inspect(op.get_bind()).get_indexes(table))


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:

    # ------------------------------------------------------------------
    # 1. iam_resource_api: drop column `action`
    # ------------------------------------------------------------------
    if table_exists("iam_resource_api") and column_exists("iam_resource_api", "action"):
        op.drop_column("iam_resource_api", "action")

    # ------------------------------------------------------------------
    # 2. system_language_translation: drop FK on app_id,
    #    rename app_id → app_key, change type INTEGER → VARCHAR(10)
    # ------------------------------------------------------------------
    if table_exists("system_language_translation") and column_exists("system_language_translation", "app_id"):

        # Drop FK constraint if it exists (name may vary — check both old and new table name variants)
        bind = op.get_bind()
        fks = inspect(bind).get_foreign_keys("system_language_translation")
        for fk in fks:
            if fk.get("constrained_columns") == ["app_id"] and fk.get("name"):
                op.drop_constraint(fk["name"], "system_language_translation", type_="foreignkey")
                break

        # Rename app_id → app_key and change type to VARCHAR(10)
        op.alter_column(
            "system_language_translation",
            "app_id",
            new_column_name="app_key",
            existing_type=sa.Integer(),
            type_=sa.String(length=10),
            existing_nullable=True,
            nullable=True,
        )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:

    # ------------------------------------------------------------------
    # 2. system_language_translation: rename app_key → app_id, restore type INTEGER
    #    (FK is not restored since the original integer values are gone)
    # ------------------------------------------------------------------
    if table_exists("system_language_translation") and column_exists("system_language_translation", "app_key"):
        op.alter_column(
            "system_language_translation",
            "app_key",
            new_column_name="app_id",
            existing_type=sa.String(length=10),
            type_=sa.Integer(),
            existing_nullable=True,
            nullable=True,
        )

    # ------------------------------------------------------------------
    # 1. iam_resource_api: restore column `action`
    # ------------------------------------------------------------------
    if table_exists("iam_resource_api") and not column_exists("iam_resource_api", "action"):
        op.add_column(
            "iam_resource_api",
            sa.Column(
                "action",
                sa.String(length=50),
                nullable=True,
                comment="Action label e.g. read, create, update, delete",
            ),
        )
