"""
Write per-warehouse configuration to db_configuration (MySQL mirror of system_configuration subset).
"""
from typing import Any, Dict, Optional

from apps.shared.config.config import settings
from apps.shared.utils.database_connection import create_mysql_connection

_WAREHOUSE_DB_CONFIGURATION_TABLE = "db_configuration"


def warehouse_db_config_app_key(key_code: str) -> str:
    """Resolve app_key used in warehouse db_configuration for a mirrored key_code."""
    if key_code == "DW_MAPS":
        return settings.DFA_VIZ_APP_KEY
    return settings.DFA_DM_APP_KEY


def upsert_ut_dw_config(
    conn_params: Dict[str, Any],
    key_code: str,
    value: str,
    description: Optional[str] = None,
) -> bool:
    """
    Insert or update a row in warehouse db_configuration.

    Returns True when the row was inserted or updated; False when the table is missing
    or the operation could not be applied.
    """
    app_key = warehouse_db_config_app_key(key_code)
    tbl = _WAREHOUSE_DB_CONFIGURATION_TABLE
    update_sql = (
        f"UPDATE {tbl} SET key_value = %s, description = %s "
        "WHERE app_key = %s AND key_code = %s"
    )
    insert_sql = (
        f"INSERT INTO {tbl} (app_key, key_code, key_value, description) "
        "VALUES (%s, %s, %s, %s)"
    )

    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params.get("db_database"),
    ) as conn:
        cur = conn.cursor()
        try:
            cur.execute(update_sql, (value, description, app_key, key_code))
            if (cur.rowcount or 0) > 0:
                conn.commit()
                return True
            cur.execute(insert_sql, (app_key, key_code, value, description))
            conn.commit()
            return (cur.rowcount or 0) > 0
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
