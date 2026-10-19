"""Consolidate per-product SSO_ENABLED into a single DFA_CORE row.

Introduces the DFA_CORE platform application and moves SSO_ENABLED from
each product app_key (DFA_DM, DFA_VIZ, DFA_DASH) to the platform scope.
If any product had SSO_ENABLED=true the consolidated value is true.

Revision ID: 120_sso_dfa_core
Revises: 119_drop_cfg_keys
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "120_sso_dfa_core"
down_revision = "119_drop_cfg_keys"
branch_labels = None
depends_on = None

_APP_TABLE = "system_application"
_CFG_TABLE = "system_configuration"
_CORE_APP_KEY = "DFA_CORE"
_KEY_CODE = "SSO_ENABLED"
_PRODUCT_APP_KEYS = ("DFA_DM", "DFA_VIZ", "DFA_DASH")


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(_APP_TABLE) or not _table_exists(_CFG_TABLE):
        return

    # 1. Insert DFA_CORE into system_application if missing.
    exists = conn.execute(
        text(f"SELECT 1 FROM {_APP_TABLE} WHERE app_key = :ak"),
        {"ak": _CORE_APP_KEY},
    ).fetchone()
    if not exists:
        conn.execute(
            text(
                f"INSERT INTO {_APP_TABLE} (app_key, is_active) "
                f"VALUES (:ak, 1)"
            ),
            {"ak": _CORE_APP_KEY},
        )

    # 2. Read existing per-product SSO_ENABLED values.
    placeholders = ", ".join(f":k{i}" for i in range(len(_PRODUCT_APP_KEYS)))
    params = {f"k{i}": k for i, k in enumerate(_PRODUCT_APP_KEYS)}
    rows = conn.execute(
        text(
            f"SELECT app_key, key_value FROM {_CFG_TABLE} "
            f"WHERE key_code = :kc AND app_key IN ({placeholders})"
        ),
        {"kc": _KEY_CODE, **params},
    ).fetchall()

    # Consolidate: true if any product was true, else false.
    consolidated = "false"
    for row in rows:
        val = (row[1] or "").strip().lower()
        if val in ("true", "1", "yes", "on"):
            consolidated = "true"
            break

    # 3. Upsert DFA_CORE SSO_ENABLED row.
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
                f"VALUES (:ak, :kc, :v, :d, 0)"
            ),
            {
                "ak": _CORE_APP_KEY,
                "kc": _KEY_CODE,
                "v": consolidated,
                "d": "SSO login mode toggle (platform-wide): true = SSO-only, false = local-only",
            },
        )

    # 4. Delete per-product SSO_ENABLED rows.
    conn.execute(
        text(
            f"DELETE FROM {_CFG_TABLE} "
            f"WHERE key_code = :kc AND app_key IN ({placeholders})"
        ),
        {"kc": _KEY_CODE, **params},
    )


def downgrade() -> None:
    # Data-only migration; cannot be automatically reversed.
    pass
