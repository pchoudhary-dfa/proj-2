"""Add dataset data-entry scope columns: JSON arrays of area, indicator, unit, subgroup val,
time period, and source NIDs on `dataset`.

Revision ID: 065_ds_filter_nids
Revises: 064_drop_sys_cfg_is_dw
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "065_ds_filter_nids"
down_revision = "064_drop_sys_cfg_is_dw"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _column_exists("dataset", "area_nids"):
        op.add_column(
            "dataset",
            sa.Column(
                "area_nids",
                sa.JSON(),
                nullable=True,
                comment="JSON array of area_nid values for data-entry scope",
            ),
        )
    if not _column_exists("dataset", "indicator_nids"):
        op.add_column(
            "dataset",
            sa.Column(
                "indicator_nids",
                sa.JSON(),
                nullable=True,
                comment="JSON array of indicator_nid values",
            ),
        )
    if not _column_exists("dataset", "unit_nids"):
        op.add_column(
            "dataset",
            sa.Column(
                "unit_nids",
                sa.JSON(),
                nullable=True,
                comment="JSON array of unit_nid values",
            ),
        )
    if not _column_exists("dataset", "subgroup_val_nids"):
        op.add_column(
            "dataset",
            sa.Column(
                "subgroup_val_nids",
                sa.JSON(),
                nullable=True,
                comment="JSON array of subgroup_val_nid values",
            ),
        )
    if not _column_exists("dataset", "timeperiod_nids"):
        op.add_column(
            "dataset",
            sa.Column(
                "timeperiod_nids",
                sa.JSON(),
                nullable=True,
                comment="JSON array of timeperiod_nid values",
            ),
        )
    if not _column_exists("dataset", "source_nids"):
        op.add_column(
            "dataset",
            sa.Column(
                "source_nids",
                sa.JSON(),
                nullable=True,
                comment="JSON array of source_nid values",
            ),
        )


def downgrade() -> None:
    if _column_exists("dataset", "source_nids"):
        op.drop_column("dataset", "source_nids")
    if _column_exists("dataset", "timeperiod_nids"):
        op.drop_column("dataset", "timeperiod_nids")
    if _column_exists("dataset", "subgroup_val_nids"):
        op.drop_column("dataset", "subgroup_val_nids")
    if _column_exists("dataset", "unit_nids"):
        op.drop_column("dataset", "unit_nids")
    if _column_exists("dataset", "indicator_nids"):
        op.drop_column("dataset", "indicator_nids")
    if _column_exists("dataset", "area_nids"):
        op.drop_column("dataset", "area_nids")
