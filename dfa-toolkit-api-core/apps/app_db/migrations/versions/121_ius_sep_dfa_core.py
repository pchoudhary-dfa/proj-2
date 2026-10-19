"""Consolidate per-product IUS_GID_SEPARATOR into a single DFA_CORE row.

Moves IUS_GID_SEPARATOR from each product app_key (DFA_DM, DFA_VIZ, DFA_DASH)
to the platform scope. Prefers DFA_DM value when present, else first non-empty
product value, else '|'.

Revision ID: 121_ius_sep_dfa_core
Revises: 120_sso_dfa_core
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "121_ius_sep_dfa_core"
down_revision = "120_sso_dfa_core"
branch_labels = None
depends_on = None

_APP_TABLE = "system_application"
_CFG_TABLE = "system_configuration"
_CORE_APP_KEY = "DFA_CORE"
_KEY_CODE = "IUS_GID_SEPARATOR"
_PRODUCT_APP_KEYS = ("DFA_DM", "DFA_VIZ", "DFA_DASH")
_DEFAULT = "|"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(_APP_TABLE) or not _table_exists(_CFG_TABLE):
        return

    # Ensure DFA_CORE application exists (may already exist from 120_sso_dfa_core).
    exists = conn.execute(
        text(f"SELECT 1 FROM {_APP_TABLE} WHERE app_key = :ak"),
        {"ak": _CORE_APP_KEY},
    ).fetchone()
    if not exists:
        conn.execute(
            text(f"INSERT INTO {_APP_TABLE} (app_key, is_active) VALUES (:ak, 1)"),
            {"ak": _CORE_APP_KEY},
        )

    placeholders = ", ".join(f":k{i}" for i in range(len(_PRODUCT_APP_KEYS)))
    params = {f"k{i}": k for i, k in enumerate(_PRODUCT_APP_KEYS)}
    rows = conn.execute(
        text(
            f"SELECT app_key, key_value FROM {_CFG_TABLE} "
            f"WHERE key_code = :kc AND app_key IN ({placeholders})"
        ),
        {"kc": _KEY_CODE, **params},
    ).fetchall()

    by_app = {row[0]: (row[1] or "").strip() for row in rows}
    consolidated = (
        by_app.get("DFA_DM")
        or next((v for v in by_app.values() if v), None)
        or _DEFAULT
    )

    core_row = conn.execute(
        text(
            f"SELECT 1 FROM {_CFG_TABLE} "
            f"WHERE app_key = :ak AND key_code = :kc"
        ),
        {"ak": _CORE_APP_KEY, "kc": _KEY_CODE},
    ).fetchone()

    if core_row:
        conn.execute(
            text(
                f"UPDATE {_CFG_TABLE} SET key_value = :v "
                f"WHERE app_key = :ak AND key_code = :kc"
            ),
            {"v": consolidated, "ak": _CORE_APP_KEY, "kc": _KEY_CODE},
        )
    else:
        conn.execute(
            text(
                f"INSERT INTO {_CFG_TABLE} (app_key, key_code, key_value, description, is_system) "
                f"VALUES (:ak, :kc, :v, :d, 1)"
            ),
            {
                "ak": _CORE_APP_KEY,
                "kc": _KEY_CODE,
                "v": consolidated,
                "d": "Separator for composite IUS GID (platform-wide); must not be empty.",
            },
        )

    conn.execute(
        text(
            f"DELETE FROM {_CFG_TABLE} "
            f"WHERE key_code = :kc AND app_key IN ({placeholders})"
        ),
        {"kc": _KEY_CODE, **params},
    )


def downgrade() -> None:
    pass
