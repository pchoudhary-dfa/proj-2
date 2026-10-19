"""Change system_bg_job_queue.id from BIGINT to INT.

Revision ID: 043_bg_job_queue_id_to_int
Revises: 042_workflow_ids_bigint_to_int
Create Date: 2026-04-06

Job queue rows are processed and removed/archived; the live count and
cumulative ID sequence will not realistically exceed INT range (~2.1 B).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "043_bg_job_queue_id_to_int"
down_revision = "042_workflow_ids_bigint_to_int"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if table_exists("system_bg_job_queue"):
        op.alter_column(
            "system_bg_job_queue",
            "id",
            type_=sa.Integer(),
            existing_nullable=False,
            autoincrement=True,
        )


def downgrade() -> None:
    if table_exists("system_bg_job_queue"):
        op.alter_column(
            "system_bg_job_queue",
            "id",
            type_=sa.BigInteger(),
            existing_nullable=False,
            autoincrement=True,
        )
