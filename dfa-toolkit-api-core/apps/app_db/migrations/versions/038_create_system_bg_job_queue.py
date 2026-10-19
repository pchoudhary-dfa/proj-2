"""Create system_bg_job_queue table for background job polling.

Revision ID: 038_create_system_bg_job_queue
Revises: 036_rename_gallery_system
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql
from sqlalchemy import inspect

revision = "038_create_system_bg_job_queue"
down_revision = "037_iam_user_email_not_null"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not table_exists("system_bg_job_queue"):
        op.create_table(
            "system_bg_job_queue",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column(
                "job_type",
                sa.String(length=100),
                nullable=False,
                comment="Job identifier e.g. task name",
            ),
            sa.Column(
                "job_req_payload",
                sa.Text(),
                nullable=False,
                comment="JSON or serialized request payload",
            ),
            sa.Column(
                "job_status",
                sa.String(length=20),
                nullable=False,
                server_default=sa.text("'pending'"),
                comment="pending | processing | completed | failed",
            ),
            sa.Column(
                "priority",
                sa.Integer(),
                nullable=True,
                server_default="0",
                comment="Higher runs first when polling",
            ),
            sa.Column(
                "attempts",
                sa.Integer(),
                nullable=True,
                server_default="0",
            ),
            sa.Column(
                "max_attempts",
                sa.Integer(),
                nullable=True,
                server_default="3",
            ),
            sa.Column(
                "dw_id",
                sa.String(length=50),
                nullable=True,
                comment="Optional datawarehouse scope key (string)",
            ),
            sa.Column(
                "available_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
                comment="Not eligible for pickup before this time",
            ),
            sa.Column(
                "locked_at",
                sa.DateTime(),
                nullable=True,
            ),
            sa.Column(
                "locked_by",
                sa.String(length=100),
                nullable=True,
                comment="Worker / lease owner id",
            ),
            sa.Column(
                "completed_at",
                sa.DateTime(),
                nullable=True,
            ),
            sa.Column(
                "result",
                mysql.LONGTEXT(),
                nullable=True,
                comment="Output or summary on completion",
            ),
            sa.Column(
                "last_error",
                sa.Text(),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_jq_poll",
            "system_bg_job_queue",
            ["job_status", "available_at", "priority"],
        )
        op.create_index(
            "idx_jq_job_type",
            "system_bg_job_queue",
            ["job_type"],
        )
        op.create_index(
            "idx_jq_locked_by",
            "system_bg_job_queue",
            ["locked_by"],
        )
        op.create_index(
            "idx_jq_dw_id",
            "system_bg_job_queue",
            ["dw_id"],
        )


def downgrade() -> None:
    if table_exists("system_bg_job_queue"):
        op.drop_index("idx_jq_dw_id", table_name="system_bg_job_queue")
        op.drop_index("idx_jq_locked_by", table_name="system_bg_job_queue")
        op.drop_index("idx_jq_job_type", table_name="system_bg_job_queue")
        op.drop_index("idx_jq_poll", table_name="system_bg_job_queue")
        op.drop_table("system_bg_job_queue")
