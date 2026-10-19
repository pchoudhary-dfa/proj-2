"""Add i18n tables for review_workflow and review_workflow_level;
move translatable columns (workflow_name, description, level_name) to their respective i18n tables.

Revision ID: 041_workflow_i18n
Revises: 040_add_allow_review_to_workflow
Create Date: 2026-04-06

Tables created:
    review_workflow_i18n          — (master_id PK, locale PK) → workflow_name, description
    review_workflow_level_i18n    — (master_id PK, locale PK) → level_name

Columns dropped from master tables:
    review_workflow.workflow_name
    review_workflow.description
    review_workflow_level.level_name

Existing rows are migrated to locale 'en' before the master columns are dropped.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "041_workflow_i18n"
down_revision = "040_add_allow_review_to_workflow"
branch_labels = None
depends_on = None

_DEFAULT_LOCALE = "en"


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def column_exists(table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(op.get_bind()).get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()

    # -------------------------------------------------------------------------
    # Table: review_workflow_i18n
    # -------------------------------------------------------------------------
    if not table_exists("review_workflow_i18n"):
        op.create_table(
            "review_workflow_i18n",
            sa.Column(
                "master_id",
                sa.BigInteger(),
                nullable=False,
                comment="FK: review_workflow.workflow_id",
            ),
            sa.Column(
                "locale",
                sa.String(length=10),
                nullable=False,
                comment="Locale code e.g. en, fr, ar",
            ),
            sa.Column(
                "workflow_name",
                sa.String(length=255),
                nullable=False,
                comment="Translated workflow display name",
            ),
            sa.Column(
                "description",
                sa.Text(),
                nullable=True,
                comment="Translated workflow description",
            ),
            sa.PrimaryKeyConstraint("master_id", "locale"),
            sa.ForeignKeyConstraint(
                ["master_id"],
                ["review_workflow.workflow_id"],
                name="fk_rwi18n_workflow_id",
                ondelete="CASCADE",
            ),
        )

    # Migrate existing workflow_name / description rows → review_workflow_i18n
    if column_exists("review_workflow", "workflow_name"):
        bind.execute(text(f"""
            INSERT INTO review_workflow_i18n (master_id, locale, workflow_name, description)
            SELECT workflow_id, '{_DEFAULT_LOCALE}', workflow_name, description
            FROM review_workflow
            WHERE workflow_name IS NOT NULL
              AND workflow_id NOT IN (
                  SELECT master_id FROM review_workflow_i18n WHERE locale = '{_DEFAULT_LOCALE}'
              )
        """))

    # Drop translatable columns from review_workflow
    if column_exists("review_workflow", "workflow_name"):
        op.drop_column("review_workflow", "workflow_name")
    if column_exists("review_workflow", "description"):
        op.drop_column("review_workflow", "description")

    # -------------------------------------------------------------------------
    # Table: review_workflow_level_i18n
    # -------------------------------------------------------------------------
    if not table_exists("review_workflow_level_i18n"):
        op.create_table(
            "review_workflow_level_i18n",
            sa.Column(
                "master_id",
                sa.BigInteger(),
                nullable=False,
                comment="FK: review_workflow_level.workflow_level_id",
            ),
            sa.Column(
                "locale",
                sa.String(length=10),
                nullable=False,
                comment="Locale code e.g. en, fr, ar",
            ),
            sa.Column(
                "level_name",
                sa.String(length=100),
                nullable=True,
                comment="Translated level display name",
            ),
            sa.PrimaryKeyConstraint("master_id", "locale"),
            sa.ForeignKeyConstraint(
                ["master_id"],
                ["review_workflow_level.workflow_level_id"],
                name="fk_rwli18n_level_id",
                ondelete="CASCADE",
            ),
        )

    # Migrate existing level_name rows → review_workflow_level_i18n
    if column_exists("review_workflow_level", "level_name"):
        bind.execute(text(f"""
            INSERT INTO review_workflow_level_i18n (master_id, locale, level_name)
            SELECT workflow_level_id, '{_DEFAULT_LOCALE}', level_name
            FROM review_workflow_level
            WHERE level_name IS NOT NULL
              AND workflow_level_id NOT IN (
                  SELECT master_id FROM review_workflow_level_i18n WHERE locale = '{_DEFAULT_LOCALE}'
              )
        """))

    # Drop translatable column from review_workflow_level
    if column_exists("review_workflow_level", "level_name"):
        op.drop_column("review_workflow_level", "level_name")


def downgrade() -> None:
    # -------------------------------------------------------------------------
    # Restore review_workflow_level.level_name
    # -------------------------------------------------------------------------
    if not column_exists("review_workflow_level", "level_name"):
        op.add_column(
            "review_workflow_level",
            sa.Column(
                "level_name",
                sa.String(length=100),
                nullable=True,
                comment="Optional descriptive name for the workflow level",
            ),
        )
        if table_exists("review_workflow_level_i18n"):
            op.get_bind().execute(text(f"""
                UPDATE review_workflow_level rwl
                JOIN review_workflow_level_i18n i ON i.master_id = rwl.workflow_level_id
                    AND i.locale = '{_DEFAULT_LOCALE}'
                SET rwl.level_name = i.level_name
            """))

    if table_exists("review_workflow_level_i18n"):
        op.drop_table("review_workflow_level_i18n")

    # -------------------------------------------------------------------------
    # Restore review_workflow.workflow_name and review_workflow.description
    # -------------------------------------------------------------------------
    if not column_exists("review_workflow", "description"):
        op.add_column(
            "review_workflow",
            sa.Column("description", sa.Text(), nullable=True, comment="Optional description of workflow purpose"),
        )
    if not column_exists("review_workflow", "workflow_name"):
        op.add_column(
            "review_workflow",
            sa.Column(
                "workflow_name",
                sa.String(length=255),
                nullable=True,  # temporarily nullable for backfill
                comment="Human-readable workflow name",
            ),
        )
        if table_exists("review_workflow_i18n"):
            op.get_bind().execute(text(f"""
                UPDATE review_workflow rw
                JOIN review_workflow_i18n i ON i.master_id = rw.workflow_id
                    AND i.locale = '{_DEFAULT_LOCALE}'
                SET rw.workflow_name = i.workflow_name,
                    rw.description   = i.description
            """))
        # Restore NOT NULL constraint
        op.alter_column("review_workflow", "workflow_name", nullable=False)

    if table_exists("review_workflow_i18n"):
        op.drop_table("review_workflow_i18n")
