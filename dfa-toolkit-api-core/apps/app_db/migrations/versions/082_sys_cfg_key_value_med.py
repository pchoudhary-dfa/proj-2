"""Widen system_configuration.key_value on MySQL (base64 / long config values).

MySQL TEXT is ~64 KB; data:image/...;base64,... favicons/logos exceed that.
MEDIUMTEXT (~16 MB) matches typical embedded-asset use without LONGTEXT overhead.

Revision ID: 082_sys_cfg_key_value_med
Revises: 081_sys_cfg_is_system
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import mysql

revision = "082_sys_cfg_key_value_med"
down_revision = "081_sys_cfg_is_system"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mysql":
        return
    if "system_configuration" not in inspect(bind).get_table_names():
        return
    op.alter_column(
        "system_configuration",
        "key_value",
        existing_type=sa.Text(),
        type_=mysql.MEDIUMTEXT(),
        existing_nullable=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mysql":
        return
    if "system_configuration" not in inspect(bind).get_table_names():
        return
    op.alter_column(
        "system_configuration",
        "key_value",
        existing_type=mysql.MEDIUMTEXT(),
        type_=sa.Text(),
        existing_nullable=False,
    )
