"""Rename plural tables to singular, drop name columns, create i18n tables, rename resource columns.

Operations (upgrade order):
  1.  system_applications               → system_application
  2.  system_configurations             → system_configuration
  3.  system_language_translations      → system_language_translation
  4.  system_language_translations_i18n → system_language_translation_i18n
  5.  user_visualizations               → user_visualization
  6.  user_visualization_keywords       → user_visualization_keyword
  7.  logs_server_errors                → logs_server_error
  8.  logs_transactions                 → logs_transaction
  9.  DROP COLUMN system_application.name
  10. DROP COLUMN iam_role.name
  11. CREATE TABLE system_application_i18n
  12. CREATE TABLE iam_role_i18n
  13. resource.code          → resource_code
  14. user_role_content.resource_type → resource_code

system_datawarehouses is intentionally excluded from renaming.

Revision ID: 012_rename_tables.py
Revises: 011_restructure_tables
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "012_rename_tables"
down_revision = "011_restructure_tables"
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


def index_exists(table: str, idx: str) -> bool:
    if not table_exists(table):
        return False
    return any(i["name"] == idx for i in inspect(op.get_bind()).get_indexes(table))


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:

    # ------------------------------------------------------------------
    # 1. system_applications → system_application
    #    (parent of system_configurations, system_language_translations)
    # ------------------------------------------------------------------
    if table_exists("system_applications") and not table_exists("system_application"):
        op.rename_table("system_applications", "system_application")

    # ------------------------------------------------------------------
    # 2. system_configurations → system_configuration
    # ------------------------------------------------------------------
    if table_exists("system_configurations") and not table_exists("system_configuration"):
        op.rename_table("system_configurations", "system_configuration")

    # ------------------------------------------------------------------
    # 3. system_language_translations → system_language_translation
    #    (parent of system_language_translations_i18n)
    # ------------------------------------------------------------------
    if table_exists("system_language_translations") and not table_exists("system_language_translation"):
        op.rename_table("system_language_translations", "system_language_translation")

    # ------------------------------------------------------------------
    # 4. system_language_translations_i18n → system_language_translation_i18n
    # ------------------------------------------------------------------
    if table_exists("system_language_translations_i18n") and not table_exists("system_language_translation_i18n"):
        op.rename_table("system_language_translations_i18n", "system_language_translation_i18n")

    # ------------------------------------------------------------------
    # 5. user_visualizations → user_visualization
    #    (parent of user_visualization_keywords)
    # ------------------------------------------------------------------
    if table_exists("user_visualizations") and not table_exists("user_visualization"):
        op.rename_table("user_visualizations", "user_visualization")

    # ------------------------------------------------------------------
    # 6. user_visualization_keywords → user_visualization_keyword
    # ------------------------------------------------------------------
    if table_exists("user_visualization_keywords") and not table_exists("user_visualization_keyword"):
        op.rename_table("user_visualization_keywords", "user_visualization_keyword")

    # ------------------------------------------------------------------
    # 7. logs_server_errors → logs_server_error
    # ------------------------------------------------------------------
    if table_exists("logs_server_errors") and not table_exists("logs_server_error"):
        op.rename_table("logs_server_errors", "logs_server_error")

    # ------------------------------------------------------------------
    # 8. logs_transactions → logs_transaction
    # ------------------------------------------------------------------
    if table_exists("logs_transactions") and not table_exists("logs_transaction"):
        op.rename_table("logs_transactions", "logs_transaction")

    # ------------------------------------------------------------------
    # 9. Drop name column from system_application
    # ------------------------------------------------------------------
    if column_exists("system_application", "name"):
        op.drop_column("system_application", "name")

    # ------------------------------------------------------------------
    # 10. Drop name column from iam_role
    # ------------------------------------------------------------------
    if column_exists("iam_role", "name"):
        op.drop_column("iam_role", "name")
    if column_exists("iam_role", "description"):
        op.drop_column("iam_role", "description")

    # ------------------------------------------------------------------
    # 11. Create system_application_i18n
    # ------------------------------------------------------------------
    if not table_exists("system_application_i18n"):
        op.create_table(
            "system_application_i18n",
            sa.Column(
                "master_id",
                sa.Integer(),
                sa.ForeignKey("system_application.id"),
                primary_key=True,
                nullable=False,
                comment="FK: system_application.id",
            ),
            sa.Column(
                "locale",
                sa.String(length=3),
                primary_key=True,
                nullable=False,
                comment="Locale code e.g. en, fr",
            ),
            sa.Column(
                "name",
                sa.String(length=50),
                nullable=False,
                comment="Translated application display name",
            ),
            sa.Column(
                "description",
                sa.Text(),
                nullable=True,
                comment="Translated application description",
            ),
        )

    # ------------------------------------------------------------------
    # 12. Create iam_role_i18n
    # ------------------------------------------------------------------
    if not table_exists("iam_role_i18n"):
        op.create_table(
            "iam_role_i18n",
            sa.Column(
                "master_id",
                sa.Integer(),
                sa.ForeignKey("iam_role.id"),
                primary_key=True,
                nullable=False,
                comment="FK: iam_role.id",
            ),
            sa.Column(
                "locale",
                sa.String(length=3),
                primary_key=True,
                nullable=False,
                comment="Locale code e.g. en, fr",
            ),
            sa.Column(
                "name",
                sa.String(length=100),
                nullable=False,
                comment="Translated role display name",
            ),
            sa.Column(
                "description",
                sa.Text(),
                nullable=True,
                comment="Translated role description",
            ),
        )

    # ------------------------------------------------------------------
    # 13. resource.code → resource_code
    # ------------------------------------------------------------------
    if table_exists("iam_resource") and column_exists("iam_resource", "code") and not column_exists("iam_resource", "resource_code"):
        op.alter_column(
            "iam_resource",
            "code",
            new_column_name="resource_code",
            existing_type=sa.String(length=50),
            existing_nullable=False,
        )

    # ------------------------------------------------------------------
    # 14. user_role_content.resource_type → resource_code
    # ------------------------------------------------------------------
    if table_exists("iam_user_role_content") and column_exists("iam_user_role_content", "resource_type"):
        if index_exists("iam_user_role_content", "idx_iam_urc_resource_type"):
            op.drop_index("idx_iam_urc_resource_type", table_name="iam_user_role_content")
        if not column_exists("iam_user_role_content", "resource_code"):
            op.alter_column(
                "iam_user_role_content",
                "resource_type",
                new_column_name="resource_code",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )
        if not index_exists("iam_user_role_content", "idx_urc_resource_code"):
            op.create_index("idx_urc_resource_code", "iam_user_role_content", ["resource_code"])


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:

    # ------------------------------------------------------------------
    # 14. user_role_content.resource_code → resource_type
    # ------------------------------------------------------------------
    if table_exists("user_role_content") and column_exists("user_role_content", "resource_code") and not column_exists("user_role_content", "resource_type"):
        op.alter_column(
            "user_role_content",
            "resource_code",
            new_column_name="resource_type",
            existing_type=sa.Integer(),
            existing_nullable=False,
        )

    # ------------------------------------------------------------------
    # 13. resource.resource_code → code
    # ------------------------------------------------------------------
    if table_exists("resource") and column_exists("resource", "resource_code") and not column_exists("resource", "code"):
        op.alter_column(
            "resource",
            "resource_code",
            new_column_name="code",
            existing_type=sa.String(length=50),
            existing_nullable=False,
        )

    # ------------------------------------------------------------------
    # 12. Drop iam_role_i18n
    # ------------------------------------------------------------------
    if table_exists("iam_role_i18n"):
        op.drop_table("iam_role_i18n")

    # ------------------------------------------------------------------
    # 11. Drop system_application_i18n
    # ------------------------------------------------------------------
    if table_exists("system_application_i18n"):
        op.drop_table("system_application_i18n")

    # ------------------------------------------------------------------
    # 10. Restore name and description columns on iam_role
    # ------------------------------------------------------------------
    if table_exists("iam_role") and not column_exists("iam_role", "name"):
        op.add_column(
            "iam_role",
            sa.Column(
                "name",
                sa.String(length=100),
                nullable=False,
                server_default="",
                comment="Human-readable role name e.g. Super Admin",
            ),
        )
    if table_exists("iam_role") and not column_exists("iam_role", "description"):
        op.add_column(
            "iam_role",
            sa.Column(
                "description",
                sa.Text(),
                nullable=True,
                comment="Role description",
            ),
        )

    # ------------------------------------------------------------------
    # 9. Restore name column on system_application
    # ------------------------------------------------------------------
    if table_exists("system_application") and not column_exists("system_application", "name"):
        op.add_column(
            "system_application",
            sa.Column(
                "name",
                sa.String(length=50),
                nullable=False,
                server_default="",
                comment="Application display name",
            ),
        )

    # ------------------------------------------------------------------
    # 8. logs_transaction → logs_transactions
    # ------------------------------------------------------------------
    if table_exists("logs_transaction") and not table_exists("logs_transactions"):
        op.rename_table("logs_transaction", "logs_transactions")

    # ------------------------------------------------------------------
    # 7. logs_server_error → logs_server_errors
    # ------------------------------------------------------------------
    if table_exists("logs_server_error") and not table_exists("logs_server_errors"):
        op.rename_table("logs_server_error", "logs_server_errors")

    # ------------------------------------------------------------------
    # 6. user_visualization_keyword → user_visualization_keywords
    # ------------------------------------------------------------------
    if table_exists("user_visualization_keyword") and not table_exists("user_visualization_keywords"):
        op.rename_table("user_visualization_keyword", "user_visualization_keywords")

    # ------------------------------------------------------------------
    # 5. user_visualization → user_visualizations
    # ------------------------------------------------------------------
    if table_exists("user_visualization") and not table_exists("user_visualizations"):
        op.rename_table("user_visualization", "user_visualizations")

    # ------------------------------------------------------------------
    # 4. system_language_translation_i18n → system_language_translations_i18n
    # ------------------------------------------------------------------
    if table_exists("system_language_translation_i18n") and not table_exists("system_language_translations_i18n"):
        op.rename_table("system_language_translation_i18n", "system_language_translations_i18n")

    # ------------------------------------------------------------------
    # 3. system_language_translation → system_language_translations
    # ------------------------------------------------------------------
    if table_exists("system_language_translation") and not table_exists("system_language_translations"):
        op.rename_table("system_language_translation", "system_language_translations")

    # ------------------------------------------------------------------
    # 2. system_configuration → system_configurations
    # ------------------------------------------------------------------
    if table_exists("system_configuration") and not table_exists("system_configurations"):
        op.rename_table("system_configuration", "system_configurations")

    # ------------------------------------------------------------------
    # 1. system_application → system_applications
    # ------------------------------------------------------------------
    if table_exists("system_application") and not table_exists("system_applications"):
        op.rename_table("system_application", "system_applications")
