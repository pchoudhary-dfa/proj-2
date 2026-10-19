"""Add FAILED to datapoint_readiness_enum

Revision ID: 109_readiness_failed
Revises: 108_de_dataentry_cfg_read
Create Date: 2026-06-03
"""

from alembic import op

revision = "109_readiness_failed"
down_revision = "108_de_dataentry_cfg_read"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE dataset MODIFY COLUMN datapoint_readiness "
        "ENUM('CREATED','UPDATED','COMPLETED','FAILED') NULL"
    )


def downgrade() -> None:
    # Remove FAILED rows before reverting enum (avoid data error)
    op.execute(
        "UPDATE dataset SET datapoint_readiness = NULL "
        "WHERE datapoint_readiness = 'FAILED'"
    )
    op.execute(
        "ALTER TABLE dataset MODIFY COLUMN datapoint_readiness "
        "ENUM('CREATED','UPDATED','COMPLETED') NULL"
    )
