"""
SQL dump file paths for per-warehouse MySQL exports (files/sql_dump/dw_{name}.sql.gz).
"""
import os
from typing import Any

from apps.datawarehouse.utils.export_utils import sanitize_db_connection_name
from apps.shared.config.config import settings

DUMP_TMP_SUFFIX = ".tmp"


def resolve_dw_display_name(creds: dict[str, Any], *, dw_id: str) -> str:
    """Human-readable warehouse name used in dump filenames."""
    return (
        creds.get("dw_connection_name")
        or creds.get("db_database")
        or str(dw_id)
    )


def get_sql_dump_basename(creds: dict[str, Any], *, dw_id: str) -> str:
    """Return on-disk basename, e.g. dw_OpenEMIS-Guinea.sql.gz."""
    safe_name = sanitize_db_connection_name(
        resolve_dw_display_name(creds, dw_id=dw_id),
        fallback=str(dw_id),
    )
    return f"dw_{safe_name}.sql.gz"


def get_sql_dump_base_dir() -> str:
    """Shared directory for all warehouse SQL dump artifacts."""
    return settings.DW_SQL_DUMP_FILES_DIR


def get_sql_dump_paths(creds: dict[str, Any], *, dw_id: str) -> dict[str, str]:
    """Return base dir, final path, tmp path, and download basename for a warehouse."""
    directory = get_sql_dump_base_dir()
    basename = get_sql_dump_basename(creds, dw_id=dw_id)
    final = os.path.join(directory, basename)
    return {
        "dir": directory,
        "basename": basename,
        "final": final,
        "tmp": f"{final}{DUMP_TMP_SUFFIX}",
    }


def get_sql_dump_path(creds: dict[str, Any], *, dw_id: str) -> str:
    """Return the final .sql.gz path for GET download."""
    return get_sql_dump_paths(creds, dw_id=dw_id)["final"]


def _is_mysql_warehouse(creds: dict[str, Any]) -> bool:
    db_type = (creds.get("db_source_type") or "").strip().lower()
    return db_type in ("mysql", "mariadb")


def sql_dump_file_exists(creds: dict[str, Any], *, dw_id: str) -> bool:
    """True when a completed gzip SQL dump file exists for this warehouse."""
    if not _is_mysql_warehouse(creds):
        return False
    return os.path.isfile(get_sql_dump_paths(creds, dw_id=dw_id)["final"])


def list_existing_sql_dump_basenames() -> set[str]:
    """Return basenames of completed dump files (one directory scan for list endpoints)."""
    directory = get_sql_dump_base_dir()
    if not os.path.isdir(directory):
        return set()
    tmp_suffix = f".sql.gz{DUMP_TMP_SUFFIX}"
    return {
        name
        for name in os.listdir(directory)
        if name.endswith(".sql.gz") and not name.endswith(tmp_suffix)
    }
