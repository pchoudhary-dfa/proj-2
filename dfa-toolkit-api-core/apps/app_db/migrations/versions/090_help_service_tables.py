"""Create DFA Help Service tables.

Three tables for hierarchical, multi-locale help content:
- dfahelp_adaptation (top-level namespace)
- dfahelp_adaptation_key (tree nodes)
- dfahelp_adaptation_key_i18n (per-locale content)

Revision ID: 090_help_service_tables
Revises: 089_iam_resource_api_action
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "090_help_service_tables"
down_revision = "089_iam_resource_api_action"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _table_exists("dfahelp_adaptation"):
        op.create_table(
            "dfahelp_adaptation",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("code", sa.String(10), nullable=False, comment="Short unique adaptation code"),
            sa.Column("name", sa.String(255), nullable=False, comment="Human-readable adaptation name"),
            sa.Column("desc", sa.Text, nullable=True, comment="Adaptation description"),
            sa.Column("created_at", sa.DateTime, nullable=True),
            sa.Column("updated_at", sa.DateTime, nullable=True),
            sa.Column("deleted_at", sa.DateTime, nullable=True, comment="Soft-delete timestamp"),
            sa.UniqueConstraint("code", name="uq_dfahelp_adaptation_code"),
        )

    if not _table_exists("dfahelp_adaptation_key"):
        op.create_table(
            "dfahelp_adaptation_key",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "adaptation_id", sa.Integer,
                sa.ForeignKey("dfahelp_adaptation.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("key", sa.String(255), nullable=True, comment="Unique string key used by frontend"),
            sa.Column("code", sa.String(255), nullable=True, comment="Short code for tree display"),
            sa.Column("related_keys", sa.Text, nullable=True, comment="JSON array of related key strings"),
            sa.Column(
                "parent_id", sa.Integer,
                sa.ForeignKey("dfahelp_adaptation_key.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime, nullable=True),
            sa.Column("updated_at", sa.DateTime, nullable=True),
            sa.Column("deleted_at", sa.DateTime, nullable=True, comment="Soft-delete timestamp"),
            sa.Index("ix_dfahelp_key_adaptation", "adaptation_id"),
            sa.Index("ix_dfahelp_key_parent", "parent_id"),
            sa.Index("ix_dfahelp_key_key", "key"),
        )

    if not _table_exists("dfahelp_adaptation_key_i18n"):
        op.create_table(
            "dfahelp_adaptation_key_i18n",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "adaptation_key_id", sa.Integer,
                sa.ForeignKey("dfahelp_adaptation_key.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("locale", sa.String(3), nullable=False, comment="Language code: en, fr, es, ar, pt, ru"),
            sa.Column("title", sa.String(255), nullable=True),
            sa.Column("desc", sa.Text, nullable=True, comment="Rich HTML description"),
            sa.Column("purpose", sa.Text, nullable=True, comment="Rich HTML purpose/usage guidance"),
            sa.UniqueConstraint("adaptation_key_id", "locale", name="uq_dfahelp_i18n_key_locale"),
            sa.Index("ix_dfahelp_i18n_key", "adaptation_key_id"),
        )


def downgrade() -> None:
    if _table_exists("dfahelp_adaptation_key_i18n"):
        op.drop_table("dfahelp_adaptation_key_i18n")
    if _table_exists("dfahelp_adaptation_key"):
        op.drop_table("dfahelp_adaptation_key")
    if _table_exists("dfahelp_adaptation"):
        op.drop_table("dfahelp_adaptation")
