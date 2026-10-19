"""Add denormalized display name columns to dataset_data_point.

Revision ID: 067_ddp_display_names
Revises: 067_dataset_modified_by
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "067_ddp_display_names"
down_revision = "067_dataset_modified_by"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _column_exists("dataset_data_point", "indicator_name"):
        op.add_column(
            "dataset_data_point",
            sa.Column("indicator_name", sa.Text(), nullable=True, comment="From ut_indicator_{locale}.indicator_name"),
        )
    if not _column_exists("dataset_data_point", "unit_name"):
        op.add_column(
            "dataset_data_point",
            sa.Column("unit_name", sa.String(128), nullable=True, comment="From ut_unit_{locale}.unit_name"),
        )
    if not _column_exists("dataset_data_point", "subgroup_name"):
        op.add_column(
            "dataset_data_point",
            sa.Column("subgroup_name", sa.String(255), nullable=True, comment="From ut_subgroup_vals_{locale}.subgroup_val"),
        )
    if not _column_exists("dataset_data_point", "area_name"):
        op.add_column(
            "dataset_data_point",
            sa.Column("area_name", sa.String(60), nullable=True, comment="From ut_area_{locale}.area_name"),
        )
    if not _column_exists("dataset_data_point", "timeperiod_name"):
        op.add_column(
            "dataset_data_point",
            sa.Column("timeperiod_name", sa.String(30), nullable=True, comment="From ut_timeperiod.timeperiod"),
        )
    if not _column_exists("dataset_data_point", "source_name"):
        op.add_column(
            "dataset_data_point",
            sa.Column("source_name", sa.Text(), nullable=True, comment="From ut_indicator_classifications_{locale}.ic_name"),
        )


def downgrade() -> None:
    if _column_exists("dataset_data_point", "source_name"):
        op.drop_column("dataset_data_point", "source_name")
    if _column_exists("dataset_data_point", "timeperiod_name"):
        op.drop_column("dataset_data_point", "timeperiod_name")
    if _column_exists("dataset_data_point", "area_name"):
        op.drop_column("dataset_data_point", "area_name")
    if _column_exists("dataset_data_point", "subgroup_name"):
        op.drop_column("dataset_data_point", "subgroup_name")
    if _column_exists("dataset_data_point", "unit_name"):
        op.drop_column("dataset_data_point", "unit_name")
    if _column_exists("dataset_data_point", "indicator_name"):
        op.drop_column("dataset_data_point", "indicator_name")
