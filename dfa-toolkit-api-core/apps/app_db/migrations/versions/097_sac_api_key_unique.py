"""Add unique constraint on system_application_client.api_key.

Revision ID: 097_sac_api_key_unique
Revises: 096_ext_client_cols
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import inspect

revision = "097_sac_api_key_unique"
down_revision = "096_ext_client_cols"
branch_labels = None
depends_on = None

_TABLE = "system_application_client"
_CONSTRAINT = "uq_sac_api_key"
_COLUMN = "api_key"


def _constraint_exists() -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    return any(
        uc["name"] == _CONSTRAINT
        for uc in insp.get_unique_constraints(_TABLE)
    )


def upgrade() -> None:
    if not _constraint_exists():
        op.create_unique_constraint(_CONSTRAINT, _TABLE, [_COLUMN])


def downgrade() -> None:
    if _constraint_exists():
        op.drop_constraint(_CONSTRAINT, _TABLE, type_="unique")
