"""Remove deprecated DFA_DM config keys from system_configuration.

Keys removed: AI_API_KEY, AI_PROVIDER, CURRENT_TIMEPERIOD,
              ENABLE_INSIGHTS, WORKFLOW_DATASET_ENABLED.

Revision ID: 118_drop_dfa_dm_cfg_keys
Revises: 117_dash_tables
"""

from alembic import op
from sqlalchemy import text

revision = "118_drop_dfa_dm_cfg_keys"
down_revision = "117_dash_tables"
branch_labels = None
depends_on = None

_APP_KEY = "DFA_DM"

_REMOVED_KEYS = [
    "AI_API_KEY",
    "AI_PROVIDER",
    "CURRENT_TIMEPERIOD",
    "ENABLE_INSIGHTS",
    "WORKFLOW_DATASET_ENABLED",
]


def upgrade() -> None:
    placeholders = ", ".join(f":k{i}" for i in range(len(_REMOVED_KEYS)))
    params = {f"k{i}": key for i, key in enumerate(_REMOVED_KEYS)}
    params["app_key"] = _APP_KEY
    op.get_bind().execute(
        text(
            f"DELETE FROM system_configuration "
            f"WHERE app_key = :app_key AND key_code IN ({placeholders})"
        ),
        params,
    )


def downgrade() -> None:
    # Data deletion cannot be automatically reversed.
    pass
