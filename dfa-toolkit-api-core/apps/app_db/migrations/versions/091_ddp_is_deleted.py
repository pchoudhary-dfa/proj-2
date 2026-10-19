"""Add is_deleted to dataset_data_point (soft-delete flag, default false).

Revision ID: 091_ddp_is_deleted
Revises: 090_help_service_tables
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "091_ddp_is_deleted"
down_revision = "090_help_service_tables"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if _table_exists("dataset_data_point") and not _column_exists(
        "dataset_data_point", "is_deleted"
    ):
        op.add_column(
            "dataset_data_point",
            sa.Column(
                "is_deleted",
                sa.Boolean(),
                nullable=False,
                server_default=text("0"),
                comment="Soft-delete flag",
            ),
        )


def downgrade() -> None:
    if _table_exists("dataset_data_point") and _column_exists(
        "dataset_data_point", "is_deleted"
    ):
        op.drop_column("dataset_data_point", "is_deleted")
