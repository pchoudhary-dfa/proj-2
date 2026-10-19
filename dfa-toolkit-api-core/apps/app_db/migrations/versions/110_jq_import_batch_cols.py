"""Expand system_bg_job_queue for batched data-point import jobs.

Revision ID: 110_jq_import_batch_cols
Revises: 109_readiness_failed
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "110_jq_import_batch_cols"
down_revision = "109_readiness_failed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "system_bg_job_queue",
        "job_req_payload",
        existing_type=sa.Text(),
        type_=mysql.LONGTEXT(),
        existing_nullable=False,
    )
    op.execute(
        "ALTER TABLE system_bg_job_queue ADD COLUMN request_id VARCHAR(36) NULL "
        "COMMENT 'Correlation id for multi-job operations (e.g. import upload)' "
        "AFTER job_req_payload"
    )
    op.execute(
        "ALTER TABLE system_bg_job_queue ADD COLUMN dataset_id INT NULL "
        "COMMENT 'Dataset scope for import batch jobs' "
        "AFTER request_id"
    )
    op.create_index(
        "idx_jq_request_id",
        "system_bg_job_queue",
        ["request_id"],
    )
    op.create_index(
        "idx_jq_dataset_import",
        "system_bg_job_queue",
        ["dataset_id", "job_type", "request_id"],
    )
    op.create_index(
        "idx_jq_dataset_import_time",
        "system_bg_job_queue",
        ["dataset_id", "job_type", "completed_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_jq_dataset_import_time", table_name="system_bg_job_queue")
    op.drop_index("idx_jq_dataset_import", table_name="system_bg_job_queue")
    op.drop_index("idx_jq_request_id", table_name="system_bg_job_queue")
    op.drop_column("system_bg_job_queue", "dataset_id")
    op.drop_column("system_bg_job_queue", "request_id")
    op.alter_column(
        "system_bg_job_queue",
        "job_req_payload",
        existing_type=mysql.LONGTEXT(),
        type_=sa.Text(),
        existing_nullable=False,
    )
