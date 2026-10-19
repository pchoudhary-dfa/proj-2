"""Create iam_user_refresh_token for server-side refresh JWT rotation.

Revision ID: 071_iam_user_refresh_token
Revises: 070_comment_wf_nullable
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "071_iam_user_refresh_token"
down_revision = "070_comment_wf_nullable"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _table_exists("iam_user_refresh_token"):
        return
    op.create_table(
        "iam_user_refresh_token",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False, comment="iam_user.id"),
        sa.Column(
            "token_hash",
            sa.String(length=64),
            nullable=False,
            comment="SHA-256 hex of issued refresh JWT (raw bearer value)",
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False, comment="UTC expiry of this refresh session"),
        sa.Column("created_at", sa.DateTime(), nullable=False, comment="UTC when this row was created"),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["iam_user.id"],
            name="fk_iam_user_refresh_token_user",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("token_hash", name="uq_iam_user_refresh_token_hash"),
    )
    op.create_index(
        "ix_iam_user_refresh_token_user_id",
        "iam_user_refresh_token",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    if not _table_exists("iam_user_refresh_token"):
        return
    # MySQL 1553: must drop FK before dropping the index it depends on.
    op.drop_constraint("fk_iam_user_refresh_token_user", "iam_user_refresh_token", type_="foreignkey")
    op.drop_index("ix_iam_user_refresh_token_user_id", table_name="iam_user_refresh_token")
    op.drop_table("iam_user_refresh_token")
