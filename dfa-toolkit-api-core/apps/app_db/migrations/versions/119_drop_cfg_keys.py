"""Remove deprecated config keys from system_configuration.

DFA_DM keys removed: DWS_DEFAULT.
DFA_VIZ keys removed: ALLOWED_IMPORT_FILE_SIZE_MB.

Revision ID: 119_drop_cfg_keys
Revises: 118_drop_dfa_dm_cfg_keys
"""

from alembic import op
from sqlalchemy import text

revision = "119_drop_cfg_keys"
down_revision = "118_drop_dfa_dm_cfg_keys"
branch_labels = None
depends_on = None

_REMOVED_KEYS_BY_APP = {
    "DFA_DM": [
        "DWS_DEFAULT",
    ],
    "DFA_VIZ": [
        "ALLOWED_IMPORT_FILE_SIZE_MB",
    ],
}


def upgrade() -> None:
    bind = op.get_bind()
    for app_key, removed_keys in _REMOVED_KEYS_BY_APP.items():
        placeholders = ", ".join(f":k{i}" for i in range(len(removed_keys)))
        params = {f"k{i}": key for i, key in enumerate(removed_keys)}
        params["app_key"] = app_key
        bind.execute(
            text(
                f"DELETE FROM system_configuration "
                f"WHERE app_key = :app_key AND key_code IN ({placeholders})"
            ),
            params,
        )


def downgrade() -> None:
    # Data deletion cannot be automatically reversed.
    pass
