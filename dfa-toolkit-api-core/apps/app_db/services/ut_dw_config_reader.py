"""
Read per-warehouse configuration from db_configuration (MySQL mirror of system_configuration subset).
"""
from typing import Any, Dict, Optional

from apps.shared.utils.database_connection import create_mysql_connection


def fetch_ut_dw_configs(app_key: str, conn_params: Dict[str, Any]) -> Dict[str, Dict[str, Optional[str]]]:
    """
    Load key_code -> {value, description} from db_configuration for the given app_key.

    Raises on connection or SQL errors (caller may fall back to system_configuration).
    """
    sql = "SELECT key_code, key_value, description FROM db_configuration WHERE app_key = %s"
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params.get("db_database"),
    ) as conn:
        cur = conn.cursor()
        try:
            cur.execute(sql, (app_key,))
            rows = cur.fetchall()
        finally:
            cur.close()

    out: Dict[str, Dict[str, Optional[str]]] = {}
    for row in rows:
        kc = row["key_code"]
        if kc:
            out[str(kc)] = {
                "value": row.get("key_value"),
                "description": row.get("description"),
            }
    return out
