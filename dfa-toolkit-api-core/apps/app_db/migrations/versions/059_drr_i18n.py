"""Add dataset_rejection_reason_i18n table.

Per-locale translated text for rejection reasons shown in the reviewer UI.
Composite PK (master_id, locale); master_id cascades on parent delete.

Revision ID: 059_drr_i18n
Revises: 058_dral_drop_fk
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "059_drr_i18n"
down_revision = "058_dral_drop_fk"
branch_labels = None
depends_on = None

_TABLE = "dataset_rejection_reason_i18n"


def _table_exists() -> bool:
    return _TABLE in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _table_exists():
        return
    op.create_table(
        _TABLE,
        sa.Column("master_id", sa.Integer(), nullable=False, comment="FK: dataset_rejection_reason.reason_id"),
        sa.Column("locale",      sa.String(10),  nullable=False, comment="Locale code e.g. en, fr, ar"),
        sa.Column("reason_text", sa.String(255), nullable=False, comment="Translated display text for this locale"),
        sa.ForeignKeyConstraint(
            ["master_id"],
            ["dataset_rejection_reason.reason_id"],
            name="fk_drr_i18n_reason_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("master_id", "locale"),
    )


def downgrade() -> None:
    if _table_exists():
        op.drop_table(_TABLE)
