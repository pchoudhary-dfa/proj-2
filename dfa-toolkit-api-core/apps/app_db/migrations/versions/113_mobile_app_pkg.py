"""Create mobile_app_package and mobile_app_package_detail tables.

Revision ID: 113_mobile_app_pkg
Revises: 112_rename_ext_mon_role
"""

from alembic import op
from sqlalchemy import inspect, Column, Integer, String, DateTime, Enum, ForeignKeyConstraint
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.sql import text

revision = "113_mobile_app_pkg"
down_revision = "112_rename_ext_mon_role"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _table_exists("mobile_app_package"):
        op.create_table(
            "mobile_app_package",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("dw_id", Integer, nullable=False),
            Column("update_type", String(10), nullable=False, server_default="data"),
            Column("update_version", Integer, nullable=False),
            Column(
                "package_status",
                Enum("building", "created", "published", "failed"),
                nullable=False,
                server_default="building",
            ),
            Column("comments", String(500), nullable=True),
            Column("map_level_id", String(100), nullable=True),
            Column("bg_job_id", Integer, nullable=True),
            Column("created_user_id", Integer, nullable=True),
            Column("published_user_id", Integer, nullable=True),
            Column("deleted_user_id", Integer, nullable=True),
            Column("is_deleted", TINYINT(1), nullable=False, server_default="0"),
            Column("created", DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")),
            Column("published", DateTime, nullable=True),
            Column("deleted", DateTime, nullable=True),
        )

    if not _table_exists("mobile_app_package_detail"):
        op.create_table(
            "mobile_app_package_detail",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("package_id", Integer, nullable=False),
            Column("data_files", String(1000), nullable=False),
            Column("languages", String(500), nullable=False),
            Column("ic_types", String(1000), nullable=True),
            Column("exclude_no_data", TINYINT(1), nullable=False, server_default="0"),
            Column("exclude_time_periods", String(1000), nullable=True),
            ForeignKeyConstraint(["package_id"], ["mobile_app_package.id"], name="fk_mapd_package"),
        )


def downgrade() -> None:
    for table in ("mobile_app_package_detail", "mobile_app_package"):
        if _table_exists(table):
            op.drop_table(table)
