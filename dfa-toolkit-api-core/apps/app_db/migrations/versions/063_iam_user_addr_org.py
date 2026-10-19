"""Add address and organisation columns to iam_user.

Revision ID: 063_iam_user_addr_org
Revises: 062_dp_deleted_action
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "063_iam_user_addr_org"
down_revision = "062_dp_deleted_action"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> set[str]:
    return {col["name"] for col in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("iam_user"):
        return
    cols = _columns("iam_user")
    if "address" not in cols:
        op.add_column(
            "iam_user",
            sa.Column(
                "address",
                sa.String(length=255),
                nullable=True,
                comment="Postal or physical address",
            ),
        )
    if "organisation" not in cols:
        op.add_column(
            "iam_user",
            sa.Column(
                "organisation",
                sa.String(length=255),
                nullable=True,
                comment="Organisation or employer name",
            ),
        )


def downgrade() -> None:
    if not _table_exists("iam_user"):
        return
    cols = _columns("iam_user")
    if "organisation" in cols:
        op.drop_column("iam_user", "organisation")
    if "address" in cols:
        op.drop_column("iam_user", "address")
