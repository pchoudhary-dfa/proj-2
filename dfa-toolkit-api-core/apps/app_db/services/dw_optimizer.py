"""
Data warehouse optimizer service (MySQL only).

Performs the same steps as Data Manager v5 performDbAction on register:
- Lowercasing: rename tables and columns to lowercase
- Indexing: drop non-primary indexes, then apply DI7 index plan (dw_index_specs) per language
- Housekeeping: ensure db_version (7.0.0.2), db_available_databases, ut_language, ut_dbmetadata_* defaults
- Foreign keys: convert ut_timeperiod, ut_indicator_unit_subgroup, ut_data, ut_ic_ius to InnoDB and add FK constraints
- Metadata sync: read DW metadata counts and update system_datawarehouse

Use perform_full_optimize() for the full flow, or call individual steps via the separate APIs.

HTTP API (POST /dw/{dw_id}/optimize — see router in apps.app_db.router.datawarehouse):
- Only the path parameter ``dw_id`` is required. The JSON body is optional.
- Every step flag in the body is optional; none are required. Omit the body entirely, or send a body where
  every flag is false, to run a full optimize (all default pipeline steps — what we label "Mandatory" in docs
  are steps that full optimize runs automatically, not fields you must send).
- Send at least one step as true to run only the selected subset; ``rebuild_indexes_after_reset`` only applies
  when ``rebuild_indexes`` is enabled in that selective request.
"""
import logging
import re
from datetime import date
from typing import Any, Dict, List, Optional

from apps.app_db.services.datawarehouse import SystemDatawarehouseService
from apps.app_db.constants.system_config import IS_DW_MIRROR_KEY_CODES
from apps.shared.config.config import settings
from apps.shared.utils.log_event import log_background_incident
from apps.shared.utils.database_connection import create_mysql_connection
from apps.app_db.config.config import app_db_settings



logger = logging.getLogger(__name__)

DB_VERSION_DEFAULT = "8.0.0.0"
# Suffix for two-step renames on case-insensitive filesystems (e.g. macOS).
# Direct rename to same name in different case is a no-op there.
_TABLE_RENAME_TMP_SUFFIX = "__dw_tmp_lower"
_COLUMN_RENAME_TMP_SUFFIX = "__dw_tmp_lower"

# Tables that must be InnoDB for foreign keys (order: parents before children).
_FK_TABLES_INNODB_ORDER = (
    "ut_timeperiod",
    "ut_indicator_unit_subgroup",
    "ut_data",
    "ut_ic_ius",
)
# (child_table, constraint_name, child_column, parent_table, parent_column, on_delete)
_FK_DEFINITIONS = (
    ("ut_ic_ius", "fk_ic_ius_iusnid", "iusnid", "ut_indicator_unit_subgroup", "iusnid", "RESTRICT"),
    ("ut_data", "fk_data_iusnid", "iusnid", "ut_indicator_unit_subgroup", "iusnid", "RESTRICT"),
    ("ut_data", "fk_data_timeperiod_nid", "timeperiod_nid", "ut_timeperiod", "timeperiod_nid", "RESTRICT"),
)


def _split_sql_statements(sql: str) -> List[str]:
    """
    Split SQL into statements by semicolon, only when semicolon is at top level.
    Respects parentheses and double/single-quoted strings so we don't break
    SET @sql = (SELECT IF(..., "alter...;", "select 0;")) style blocks.
    (Matches how Data Manager runs the whole INDEXES file as one multi-statement batch.)
    """
    statements = []
    current = []
    i = 0
    n = len(sql)
    paren_depth = 0
    in_double = False
    in_single = False
    escape_next = False
    while i < n:
        c = sql[i]
        if escape_next:
            current.append(c)
            escape_next = False
            i += 1
            continue
        if c == "\\" and (in_double or in_single):
            current.append(c)
            escape_next = True
            i += 1
            continue
        if in_double:
            if c == '"':
                in_double = False
            current.append(c)
            i += 1
            continue
        if in_single:
            if c == "'":
                in_single = False
            current.append(c)
            i += 1
            continue
        if c == '"':
            in_double = True
            current.append(c)
            i += 1
            continue
        if c == "'":
            in_single = True
            current.append(c)
            i += 1
            continue
        if c == "(":
            paren_depth += 1
            current.append(c)
            i += 1
            continue
        if c == ")":
            paren_depth -= 1
            current.append(c)
            i += 1
            continue
        if c == ";" and paren_depth == 0:
            stmt = "".join(current).strip()
            if stmt and not stmt.startswith("--") and not stmt.startswith("/"):
                statements.append(stmt)
            current = []
            i += 1
            # skip optional whitespace and newline after ;
            while i < n and sql[i] in " \t\r\n":
                i += 1
            continue
        current.append(c)
        i += 1
    stmt = "".join(current).strip()
    if stmt and not stmt.startswith("--") and not stmt.startswith("/"):
        statements.append(stmt)
    return statements


def _get_connection_params_from_dw_id(dw_id: int) -> Optional[Dict[str, Any]]:
    """
    Resolve connection params from system_datawarehouse by dw_id.
    Returns dict with keys: db_database, db_host_address, db_port (int), db_user, db_password,
    db_source_type, dw_default_language. Returns None if dw_id not found.
    """
    return SystemDatawarehouseService().get_warehouse_connection_params(dw_id)


def _require_mysql(conn_params: Dict[str, Any]) -> None:
    """Raise NotImplementedError if database is not MySQL."""
    if (conn_params.get("db_source_type") or "").strip().lower() != "mysql":
        raise NotImplementedError(
            "Data warehouse optimizer is only supported for MySQL. "
            "MSSQL and PostgreSQL support may be added later."
        )


def perform_lowercase(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Rename all tables and columns in the warehouse to lowercase, then run housekeeping.
    MySQL only. Returns dict with tables_renamed, columns_renamed counts.

    Uses a two-step rename (table -> temp -> lowercase) so that renames take effect on
    case-insensitive filesystems (e.g. macOS, Windows), where RENAME X TO x would
    otherwise be a no-op.
    """
    _require_mysql(conn_params)
    tables_renamed = 0
    columns_renamed = 0
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        # Tables
        cur.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
        )
        rows = cur.fetchall()
        for row in rows:
            name = row.get("TABLE_NAME") or row[0] if isinstance(row, (list, tuple)) else row["TABLE_NAME"]
            if name and name != name.lower():
                target = name.lower()
                try:
                    # On case-insensitive filesystems (macOS/Windows), RENAME X TO x is a no-op.
                    # Use two-step rename via a temp name so the final name is truly lowercase.
                    tmp_name = target + _TABLE_RENAME_TMP_SUFFIX
                    cur.execute(f"RENAME TABLE `{name}` TO `{tmp_name}`")
                    conn.commit()
                    cur.execute(f"RENAME TABLE `{tmp_name}` TO `{target}`")
                    conn.commit()
                    tables_renamed += 1
                except Exception as e:
                    logger.warning("Rename table %s failed: %s", name, e)
                    conn.rollback()

        # Columns: for each table get columns that are not lowercase and rename
        cur.execute(
            "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA "
            "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
        )
        for col_row in cur.fetchall():
            if isinstance(col_row, dict):
                tname = col_row.get("TABLE_NAME")
                cname = col_row.get("COLUMN_NAME")
                ctype = col_row.get("COLUMN_TYPE", "")
                nullable = col_row.get("IS_NULLABLE", "YES")
                default = col_row.get("COLUMN_DEFAULT")
                key = col_row.get("COLUMN_KEY", "")
                extra = col_row.get("EXTRA", "")
            else:
                tname, cname, ctype, nullable, default, key, extra = (
                    col_row[0], col_row[1], col_row[2], col_row[3], col_row[4], col_row[5], col_row[6]
                )
            if not cname or cname == cname.lower():
                continue
            target_col = cname.lower()
            try:
                null_str = "NULL" if nullable == "YES" else "NOT NULL"
                default_str = f"DEFAULT {repr(default)}" if default is not None else ""
                extra_str = extra or ""
                spec = " ".join(filter(None, [ctype, null_str, default_str, extra_str]))
                # On case-insensitive filesystems, CHANGE COLUMN Col TO col can be a no-op.
                # Use two-step rename via a temp column name.
                tmp_col = target_col + _COLUMN_RENAME_TMP_SUFFIX
                cur.execute(
                    f"ALTER TABLE `{tname}` CHANGE COLUMN `{cname}` `{tmp_col}` {spec}"
                )
                conn.commit()
                cur.execute(
                    f"ALTER TABLE `{tname}` CHANGE COLUMN `{tmp_col}` `{target_col}` {spec}"
                )
                conn.commit()
                columns_renamed += 1
            except Exception as e:
                logger.warning("Rename column %s.%s failed: %s", tname, cname, e)
                conn.rollback()

        seed_warnings = _run_housekeeping_inserts(cur, conn, conn_params.get("dw_default_language") or "en")
        conn.commit()
        cur.close()
        if seed_warnings:
            logger.warning("perform_lowercase: seed_system_initial_defaults had warnings: %s", seed_warnings)

    hk_result = perform_housekeeping(conn_params)
    result = {"tables_renamed": tables_renamed, "columns_renamed": columns_renamed}
    all_warnings = seed_warnings + hk_result.get("warnings", [])
    if all_warnings:
        result["seed_warnings"] = all_warnings
    return result


def _run_housekeeping_inserts(cur, conn, def_lang: str) -> List[str]:
    """
    Insert default rows (IF NOT EXISTS) for system tables.
    Returns a list of warning strings for any table that could not be seeded.
    Caller is responsible for committing; this function does not commit.
    """
    warnings: List[str] = []

    # db_version seed handled by _record_optimize_db_version (ORM, end of perform_full_optimize)

    # db_available_databases: ensure at least one row
    try:
        cur.execute("SELECT 1 FROM db_available_databases LIMIT 1")
        if not cur.fetchone():
            db_name = ""
            try:
                cur.execute("SELECT DATABASE() AS db")
                r = cur.fetchone()
                db_name = (r.get("db") or (r[0] if r else "")) or ""
            except Exception:
                pass
            cur.execute(
                "INSERT INTO db_available_databases (avldb_name, avldb_prefix, avldb_default) VALUES (%s, %s, 1)",
                (db_name, def_lang[:3] if def_lang else "en"),
            )
    except Exception as e:
        msg = f"db_available_databases seed failed: {e}"
        warnings.append(msg)
        logger.warning("seed_system_initial_defaults: %s", msg)

    # ut_language: ensure default language row exists
    try:
        cur.execute("SELECT 1 FROM ut_language WHERE language_code = %s LIMIT 1", (def_lang,))
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO ut_language (language_name, language_code, language_default, language_globallock) "
                "VALUES (%s, %s, 1, 0)",
                (def_lang.upper(), def_lang),
            )
    except Exception as e:
        msg = f"ut_language seed failed: {e}"
        warnings.append(msg)
        logger.warning("seed_system_initial_defaults: %s", msg)

    # ut_dbmetadata_<def_lang>: ensure one row (dbmtd_nid=1)
    table_meta = f"ut_dbmetadata_{def_lang}"
    try:
        cur.execute(f"SELECT 1 FROM `{table_meta}` WHERE dbmtd_nid = 1 LIMIT 1")
        if not cur.fetchone():
            cur.execute(
                f"INSERT INTO `{table_meta}` (dbmtd_nid, dbmtd_areacnt, dbmtd_indcnt, dbmtd_iuscnt, "
                "dbmtd_timecnt, dbmtd_srccnt, dbmtd_datacnt) VALUES (1, 0, 0, 0, 0, 0, 0)"
            )
    except Exception as e:
        msg = f"{table_meta} seed failed: {e}"
        warnings.append(msg)
        logger.warning("seed_system_initial_defaults: %s", msg)

    return warnings


def perform_housekeeping(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run housekeeping only: ensure db_version, db_available_databases, ut_language,
    ut_dbmetadata_<def_lang> have default rows. MySQL only.
    """
    _require_mysql(conn_params)
    def_lang = (conn_params.get("dw_default_language") or "en").strip().lower()
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        seed_warnings = _run_housekeeping_inserts(cur, conn, def_lang)
        conn.commit()
        cur.close()
    result: Dict[str, Any] = {"success": True, "default_language": def_lang}
    if seed_warnings:
        result["warnings"] = seed_warnings
        logger.warning("perform_housekeeping: seed warnings: %s", seed_warnings)
    return result


def _read_dw_languages(cur: Any, conn_params: Dict[str, Any]) -> List[str]:
    """Language codes from ut_language, else warehouse default."""
    try:
        cur.execute("SELECT language_code FROM ut_language")
        langs = [str(r.get("language_code") or r[0]).strip().lower() for r in cur.fetchall() if r]
    except Exception as e:
        logger.warning("Could not read ut_language: %s; using default only", e)
        langs = [(conn_params.get("dw_default_language") or "en").strip().lower()]
    if not langs:
        langs = ["en"]
    return langs


def _table_exists_in_dw(cur: Any, table: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s LIMIT 1",
        (table,),
    )
    return cur.fetchone() is not None


def _is_fk_required_index_drop_error(exc: BaseException) -> bool:
    """MySQL 1553: index is needed in a foreign key constraint."""
    current: Optional[BaseException] = exc
    while current is not None:
        args = getattr(current, "args", ())
        if args and args[0] == 1553:
            return True
        current = current.__cause__ or getattr(current, "__context__", None)
    return False


def _clear_di7_indexes(
    cur: Any,
    conn: Any,
    languages: List[str],
    *,
    strict: bool = False,
) -> Dict[str, Any]:
    """
    Drop all non-primary indexes on DI7-managed tables (unique and non-unique).
    Skips indexes MySQL refuses to drop (FK-required). Does not touch non-DI7 tables.
    """
    from apps.app_db.services.dw_index_specs import get_di7_managed_table_names
    from apps.shared.exceptions import UnprocessableEntity

    dropped = 0
    skipped_fk = 0
    errors: List[str] = []
    di7_tables = get_di7_managed_table_names(languages)
    logger.info(
        "Clearing non-primary indexes on %s DI7 table(s) for languages %s",
        len(di7_tables),
        languages,
    )
    for tname in sorted(di7_tables):
        if not _table_exists_in_dw(cur, tname):
            logger.debug("Skipping clear indexes: table %s does not exist", tname)
            continue
        cur.execute(
            "SHOW COLUMNS FROM `{}` WHERE Extra = 'auto_increment'".format(
                tname.replace("\\", "\\\\").replace("`", "``")
            )
        )
        auto_inc = cur.fetchall()
        if auto_inc:
            col = auto_inc[0].get("Field") if isinstance(auto_inc[0], dict) else auto_inc[0][0]
            cur.execute(
                "SELECT COLUMN_NAME FROM information_schema.STATISTICS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND INDEX_NAME = 'PRIMARY'",
                (tname,),
            )
            pk_cols = [r.get("COLUMN_NAME") or r[0] for r in cur.fetchall()]
            if col and col not in pk_cols:
                try:
                    cur.execute(f"ALTER TABLE `{tname}` ADD PRIMARY KEY (`{col}`)")
                    conn.commit()
                except Exception as e:
                    logger.debug("Add primary key on %s.%s: %s", tname, col, e)
                    conn.rollback()
        cur.execute(
            "SELECT INDEX_NAME FROM information_schema.STATISTICS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
            "AND INDEX_NAME <> 'PRIMARY' "
            "GROUP BY INDEX_NAME",
            (tname,),
        )
        for row in cur.fetchall():
            iname = row.get("INDEX_NAME") if isinstance(row, dict) else row[0]
            if not iname:
                continue
            try:
                cur.execute(f"ALTER TABLE `{tname}` DROP INDEX `{iname}`")
                conn.commit()
                dropped += 1
            except Exception as e:
                if _is_fk_required_index_drop_error(e):
                    logger.info(
                        "Skipping index %s on %s (required by foreign key)",
                        iname,
                        tname,
                    )
                    skipped_fk += 1
                    conn.rollback()
                    continue
                msg = f"Drop index {iname} on {tname} failed: {e}"
                logger.warning(msg)
                conn.rollback()
                if strict:
                    errors.append(msg)
    if strict and errors:
        raise UnprocessableEntity(
            "Failed to drop existing indexes before rebuild.",
            error_code="DW_INDEX_DROP_FAILED",
            details={"failures": errors, "languages": languages},
        )
    return {
        "indexes_dropped": dropped,
        "indexes_skipped_fk": skipped_fk,
        "tables_scoped": sorted(di7_tables),
        "languages": languages,
    }


def _clear_di7_unique_indexes(
    cur: Any,
    conn: Any,
    languages: List[str],
    *,
    strict: bool = False,
) -> Dict[str, Any]:
    """Backward-compatible alias; clears all non-PK indexes on DI7 tables."""
    return _clear_di7_indexes(cur, conn, languages, strict=strict)


def perform_clear_indexes(
    conn_params: Dict[str, Any],
    *,
    strict: bool = False,
    languages: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Drop all non-primary indexes on DI7-managed tables only (see dw_index_specs).
    MySQL only. When strict=True, any drop failure raises UnprocessableEntity.
    """
    _require_mysql(conn_params)
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        langs = languages if languages is not None else _read_dw_languages(cur, conn_params)
        result = _clear_di7_indexes(cur, conn, langs, strict=strict)
        cur.close()
    return result


def perform_set_indexes(conn_params: Dict[str, Any], clear_first: bool = True) -> Dict[str, Any]:
    """
    Apply DI7 index plan from dw_index_specs.apply_di7_indexes().
    If clear_first, runs perform_clear_indexes(strict=True) first.
    Raises UnprocessableEntity on any failure.
    """
    from apps.app_db.services.dw_index_specs import apply_di7_indexes
    from apps.shared.exceptions import UnprocessableEntity

    _require_mysql(conn_params)

    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        langs = _read_dw_languages(cur, conn_params)
        clear_result: Dict[str, Any] = {}
        if clear_first:
            clear_result = _clear_di7_indexes(cur, conn, langs, strict=True)

        try:
            result = apply_di7_indexes(cur, conn, langs)
        except UnprocessableEntity:
            raise
        except Exception as e:
            logger.exception("DI7 index apply failed")
            raise UnprocessableEntity(
                f"Index rebuild failed: {e}",
                error_code="DW_INDEX_APPLY_FAILED",
            ) from e
        finally:
            cur.close()

    out: Dict[str, Any] = {
        "success": True,
        "languages": langs,
        **result,
    }
    if clear_result:
        out["indexes_cleared"] = clear_result
    return out


def get_dw_metadata_from_warehouse(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Read metadata counts from ut_dbmetadata_<lang> for the default language.
    Returns dict with dw_data_count, dw_area_count, dw_ind_count, dw_ius_count, dw_time_count, dw_source_count.
    """
    _require_mysql(conn_params)
    def_lang = (conn_params.get("dw_default_language") or "en").strip().lower()
    table = f"ut_dbmetadata_{def_lang}"
    out = {
        "dw_data_count": 0,
        "dw_area_count": 0,
        "dw_ind_count": 0,
        "dw_ius_count": 0,
        "dw_time_count": 0,
        "dw_source_count": 0,
    }
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                f"SELECT dbmtd_datacnt, dbmtd_areacnt, dbmtd_indcnt, dbmtd_iuscnt, dbmtd_timecnt, dbmtd_srccnt "
                f"FROM `{table}` WHERE dbmtd_nid = 1 LIMIT 1"
            )
            row = cur.fetchone()
            if row:
                if isinstance(row, dict):
                    out["dw_data_count"] = int(row.get("dbmtd_datacnt") or 0)
                    out["dw_area_count"] = int(row.get("dbmtd_areacnt") or 0)
                    out["dw_ind_count"] = int(row.get("dbmtd_indcnt") or 0)
                    out["dw_ius_count"] = int(row.get("dbmtd_iuscnt") or 0)
                    out["dw_time_count"] = int(row.get("dbmtd_timecnt") or 0)
                    out["dw_source_count"] = int(row.get("dbmtd_srccnt") or 0)
                else:
                    out["dw_data_count"] = int(row[0] or 0)
                    out["dw_area_count"] = int(row[1] or 0)
                    out["dw_ind_count"] = int(row[2] or 0)
                    out["dw_ius_count"] = int(row[3] or 0)
                    out["dw_time_count"] = int(row[4] or 0)
                    out["dw_source_count"] = int(row[5] or 0)
        except Exception as e:
            logger.warning("Read %s failed: %s", table, e)
        cur.close()
    return out


def sync_metadata_to_app(dw_id: int) -> Dict[str, Any]:
    """
    Read metadata counts from the warehouse and update system_datawarehouse row for dw_id.
    Returns dict with success, dw_id, and updated count fields.
    """
    conn_params = _get_connection_params_from_dw_id(dw_id)
    if not conn_params:
        return {"success": False, "message": "Datawarehouse not found", "dw_id": dw_id}
    _require_mysql(conn_params)
    meta = get_dw_metadata_from_warehouse(conn_params)
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import SystemDatawarehouse

    db = SessionLocal()
    try:
        row = db.query(SystemDatawarehouse).filter(SystemDatawarehouse.id == dw_id).first()
        if not row:
            return {"success": False, "message": "Datawarehouse not found", "dw_id": dw_id}
        row.dw_data_count = meta["dw_data_count"]
        row.dw_area_count = meta["dw_area_count"]
        row.dw_ind_count = meta["dw_ind_count"]
        row.dw_ius_count = meta["dw_ius_count"]
        row.dw_time_count = meta["dw_time_count"]
        row.dw_source_count = meta["dw_source_count"]
        db.commit()
        return {
            "success": True,
            "dw_id": dw_id,
            "dw_data_count": meta["dw_data_count"],
            "dw_area_count": meta["dw_area_count"],
            "dw_ind_count": meta["dw_ind_count"],
            "dw_ius_count": meta["dw_ius_count"],
            "dw_time_count": meta["dw_time_count"],
            "dw_source_count": meta["dw_source_count"],
        }
    except Exception as e:
        db.rollback()
        log_background_incident(
            f"sync_metadata_to_app failed for dw_id={dw_id}",
            error_code="SYNC_METADATA_TO_APP_FAILED",
            exc=e,
            source="apps.app_db.services.dw_optimizer",
        )
        return {"success": False, "message": str(e), "dw_id": dw_id}
    finally:
        db.close()


_INTEGER_PK_DATA_TYPES = frozenset(
    {"int", "bigint", "mediumint", "smallint", "tinyint"}
)


def _fetch_primary_key_columns(cur, tname: str) -> List[tuple]:
    """Return [(column_name, column_type, data_type), ...] for PRIMARY KEY columns in order."""
    cur.execute(
        """
        SELECT c.COLUMN_NAME, c.COLUMN_TYPE, c.DATA_TYPE
        FROM information_schema.KEY_COLUMN_USAGE k
        INNER JOIN information_schema.COLUMNS c
          ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
         AND c.TABLE_NAME = k.TABLE_NAME
         AND c.COLUMN_NAME = k.COLUMN_NAME
        WHERE k.TABLE_SCHEMA = DATABASE()
          AND k.TABLE_NAME = %s
          AND k.CONSTRAINT_NAME = 'PRIMARY'
        ORDER BY k.ORDINAL_POSITION
        """,
        (tname,),
    )
    out: List[tuple] = []
    for row in cur.fetchall():
        if isinstance(row, dict):
            out.append(
                (row.get("COLUMN_NAME"), row.get("COLUMN_TYPE"), row.get("DATA_TYPE"))
            )
        else:
            out.append((row[0], row[1], row[2]))
    return out


def _row_value(row: Any, key_or_index: Any) -> Any:
    if isinstance(row, dict):
        return row.get(key_or_index) if isinstance(key_or_index, str) else row[key_or_index]
    return row[key_or_index]


def perform_ensure_primary_keys(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure every table has a usable PRIMARY KEY for inserts. Three cases per table:

    Case 1 — AUTO_INCREMENT column exists but no PRIMARY KEY on it:
        Add PRIMARY KEY on that column only (column definition unchanged).

    Case 2 — No AUTO_INCREMENT column AND no PRIMARY KEY at all:
        Take the first integer-typed column (INT/BIGINT/MEDIUMINT/SMALLINT/TINYINT),
        modify it to NOT NULL AUTO_INCREMENT, and add it as PRIMARY KEY.

    Case 3 — PRIMARY KEY exists on a single integer column but table has no AUTO_INCREMENT:
        MODIFY that column to NOT NULL AUTO_INCREMENT (keeps existing PK) and set
        AUTO_INCREMENT to MAX(column) + 1. Skips composite PKs and non-integer PK columns.

    MySQL only. Returns dict with success, primary_keys_added (list of 'table.column'), and optional errors.
    """
    _require_mysql(conn_params)
    result: Dict[str, Any] = {"success": True, "primary_keys_added": [], "errors": []}
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
            )
            tables = [str(r.get("TABLE_NAME") or r[0]) for r in cur.fetchall()]
        except Exception as e:
            result["success"] = False
            result["errors"].append(f"list_tables: {e}")
            cur.close()
            return result

        for tname in tables:
            safe = tname.replace("\\", "\\\\").replace("`", "``")
            try:
                cur.execute(f"SHOW COLUMNS FROM `{safe}` WHERE Extra = 'auto_increment'")
                auto_inc = cur.fetchall()
            except Exception as e:
                logger.debug("SHOW COLUMNS failed for %s: %s", tname, e)
                continue

            if auto_inc:
                # Case 1: AUTO_INCREMENT column exists — just add PRIMARY KEY if missing
                col = auto_inc[0].get("Field") if isinstance(auto_inc[0], dict) else auto_inc[0][0]
                if not col:
                    continue
                try:
                    cur.execute(
                        "SELECT 1 FROM information_schema.STATISTICS "
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
                        "AND INDEX_NAME = 'PRIMARY' AND COLUMN_NAME = %s LIMIT 1",
                        (tname, col),
                    )
                    if cur.fetchone():
                        continue  # PRIMARY KEY already exists on this column
                except Exception as e:
                    logger.debug("Check PRIMARY KEY on %s.%s: %s", tname, col, e)
                try:
                    cur.execute(f"ALTER TABLE `{tname}` ADD PRIMARY KEY (`{col}`)")
                    conn.commit()
                    result["primary_keys_added"].append(f"{tname}.{col}")
                    logger.info("Added PRIMARY KEY on %s.%s", tname, col)
                except Exception as e:
                    conn.rollback()
                    result["errors"].append(f"{tname}.{col}: {e}")
                    logger.warning("Add PRIMARY KEY failed on %s.%s: %s", tname, col, e)
            else:
                # No AUTO_INCREMENT on table — Case 3 if PK exists, else Case 2
                try:
                    pk_cols = _fetch_primary_key_columns(cur, tname)
                except Exception as e:
                    logger.debug("Fetch PRIMARY KEY columns on %s: %s", tname, e)
                    pk_cols = []

                if pk_cols:
                    # Case 3: existing PRIMARY KEY without AUTO_INCREMENT
                    if len(pk_cols) == 1:
                        col, col_type, data_type = pk_cols[0]
                        if (
                            col
                            and col_type
                            and str(data_type or "").lower() in _INTEGER_PK_DATA_TYPES
                        ):
                            safe_col = str(col).replace("`", "``")
                            try:
                                cur.execute(
                                    f"ALTER TABLE `{tname}` "
                                    f"MODIFY COLUMN `{safe_col}` {col_type} NOT NULL AUTO_INCREMENT"
                                )
                                cur.execute(
                                    f"SELECT COALESCE(MAX(`{safe_col}`), 0) + 1 AS n "
                                    f"FROM `{tname}`"
                                )
                                next_row = cur.fetchone()
                                next_val = int(_row_value(next_row, "n") or _row_value(next_row, 0) or 1)
                                cur.execute(
                                    f"ALTER TABLE `{tname}` AUTO_INCREMENT = %s",
                                    (next_val,),
                                )
                                conn.commit()
                                action = "AUTO_INCREMENT added on existing PRIMARY KEY"
                                result["primary_keys_added"].append(f"{tname}.{col} ({action})")
                                logger.info("%s on %s.%s (next=%s)", action, tname, col, next_val)
                            except Exception as e:
                                conn.rollback()
                                result["errors"].append(f"{tname}.{col}: {e}")
                                logger.warning(
                                    "Add AUTO_INCREMENT on existing PK failed on %s.%s: %s",
                                    tname,
                                    col,
                                    e,
                                )
                    continue

                # Case 2: no PRIMARY KEY — promote first integer column to PK + AUTO_INCREMENT
                # Find the first integer-typed column to promote to PK + AUTO_INCREMENT
                try:
                    cur.execute(
                        "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE "
                        "FROM information_schema.COLUMNS "
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
                        "AND DATA_TYPE IN ('int','bigint','mediumint','smallint','tinyint') "
                        "ORDER BY ORDINAL_POSITION LIMIT 1",
                        (tname,),
                    )
                    row = cur.fetchone()
                except Exception as e:
                    logger.debug("Find integer column on %s: %s", tname, e)
                    continue
                if not row:
                    continue
                col = row.get("COLUMN_NAME") if isinstance(row, dict) else row[0]
                col_type = row.get("COLUMN_TYPE") if isinstance(row, dict) else row[1]
                if not col or not col_type:
                    continue
                # Check if this column already has AUTO_INCREMENT set (e.g. from a partial previous run)
                # to avoid "MODIFY COLUMN ... AUTO_INCREMENT" failing on an already-AUTO_INCREMENT column
                try:
                    cur.execute(
                        f"SHOW COLUMNS FROM `{safe}` WHERE Field = %s AND Extra = 'auto_increment'",
                        (col,),
                    )
                    already_auto_inc = bool(cur.fetchone())
                except Exception as e:
                    logger.debug("Check AUTO_INCREMENT on %s.%s: %s", tname, col, e)
                    already_auto_inc = False
                try:
                    if already_auto_inc:
                        # Column already has AUTO_INCREMENT — only the PRIMARY KEY is missing
                        cur.execute(f"ALTER TABLE `{tname}` ADD PRIMARY KEY (`{col}`)")
                        action = "PRIMARY KEY added (AUTO_INCREMENT already set)"
                    else:
                        # Preserve original column type; set NOT NULL AUTO_INCREMENT and add PRIMARY KEY
                        cur.execute(
                            f"ALTER TABLE `{tname}` "
                            f"MODIFY COLUMN `{col}` {col_type} NOT NULL AUTO_INCREMENT, "
                            f"ADD PRIMARY KEY (`{col}`)"
                        )
                        action = "AUTO_INCREMENT set + PRIMARY KEY added"
                    conn.commit()
                    result["primary_keys_added"].append(f"{tname}.{col} ({action})")
                    logger.info("%s on %s.%s", action, tname, col)
                except Exception as e:
                    conn.rollback()
                    result["errors"].append(f"{tname}.{col}: {e}")
                    logger.warning("Add PRIMARY KEY + AUTO_INCREMENT failed on %s.%s: %s", tname, col, e)

        cur.close()
    if result["errors"]:
        result["success"] = False
    return result


def perform_add_foreign_keys(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert FK-related tables to InnoDB (if not already) and add foreign key constraints.
    MySQL only. Runs after lowercase/indexes so table names are final.
    Skips tables that do not exist. If existing data violates a constraint, the FK add fails
    and is reported in the result.
    Returns dict with success, engines_converted, constraints_added, and optional errors.
    """
    _require_mysql(conn_params)
    result = {"success": True, "engines_converted": 0, "constraints_added": 0, "errors": []}
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
            )
            existing = {str(r.get("TABLE_NAME") or r[0]).strip(): str((r.get("ENGINE") or r[1]) or "").upper()
                        for r in cur.fetchall()}
        except Exception as e:
            result["success"] = False
            result["errors"].append(f"list_tables: {e}")
            cur.close()
            return result

        for tname in _FK_TABLES_INNODB_ORDER:
            if tname not in existing:
                continue
            if existing.get(tname) == "INNODB":
                continue
            try:
                cur.execute(f"ALTER TABLE `{tname}` ENGINE=InnoDB")
                conn.commit()
                result["engines_converted"] += 1
                logger.info("Converted table %s to InnoDB", tname)
            except Exception as e:
                conn.rollback()
                msg = f"engine {tname}: {e}"
                result["errors"].append(msg)
                logger.warning("Convert table to InnoDB failed: %s", msg)

        for child_table, constraint_name, child_column, parent_table, parent_column, on_delete in _FK_DEFINITIONS:
            if child_table not in existing or parent_table not in existing:
                continue
            try:
                cur.execute(
                    "SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS "
                    "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = %s AND CONSTRAINT_NAME = %s LIMIT 1",
                    (child_table, constraint_name),
                )
                if cur.fetchone():
                    continue
            except Exception as e:
                logger.debug("Check existing FK %s: %s", constraint_name, e)
            # Ensure parent column has a unique/primary index (MySQL requires this for FK targets).
            # The indexing step should have added it, but add defensively in case it was skipped.
            try:
                cur.execute(
                    "SELECT 1 FROM information_schema.STATISTICS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
                    "AND COLUMN_NAME = %s AND NON_UNIQUE = 0 LIMIT 1",
                    (parent_table, parent_column),
                )
                parent_has_unique = bool(cur.fetchone())
            except Exception as e:
                logger.debug("Check parent unique index %s.%s: %s", parent_table, parent_column, e)
                parent_has_unique = True  # assume ok; let FK attempt reveal actual state
            if not parent_has_unique:
                try:
                    cur.execute(
                        "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS "
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
                        "AND CONSTRAINT_TYPE = 'PRIMARY KEY' LIMIT 1",
                        (parent_table,),
                    )
                    has_pk = bool(cur.fetchone())
                    if not has_pk:
                        cur.execute(f"ALTER TABLE `{parent_table}` ADD PRIMARY KEY (`{parent_column}`)")
                    else:
                        cur.execute(
                            f"ALTER TABLE `{parent_table}` ADD UNIQUE KEY "
                            f"`uq_{parent_table}_{parent_column}` (`{parent_column}`)"
                        )
                    conn.commit()
                    logger.info("Added unique index on %s.%s for FK support", parent_table, parent_column)
                except Exception as e:
                    conn.rollback()
                    logger.warning("Add unique index on %s.%s failed: %s", parent_table, parent_column, e)
            try:
                cur.execute(
                    f"ALTER TABLE `{child_table}` ADD CONSTRAINT `{constraint_name}` "
                    f"FOREIGN KEY (`{child_column}`) REFERENCES `{parent_table}` (`{parent_column}`) ON DELETE {on_delete}"
                )
                conn.commit()
                result["constraints_added"] += 1
                logger.info("Added FK %s on %s.%s -> %s.%s", constraint_name, child_table, child_column, parent_table, parent_column)
            except Exception as e:
                conn.rollback()
                msg = f"fk {constraint_name}: {e}"
                result["errors"].append(msg)
                logger.warning("Add FK failed: %s", msg)

        cur.close()
    if result["errors"]:
        result["success"] = False
    return result


_IS_SYSTEM_TABLE_PREFIXES = (
    "ut_subgroup_vals",
    "ut_subgroup_type",
    "ut_subgroup",
)


def perform_add_subgroup_val_is_system(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add is_system column to locale tables if missing:
    ut_subgroup_vals_<locale>, ut_subgroup_type_<locale>, ut_subgroup_<locale>.
    is_system is TINYINT(1) NOT NULL DEFAULT 0 (false). Used to protect system rows from deletion via API.
    MySQL only. Runs after lowercase/indexes so table names are final.
    Returns dict with success, tables_altered (list of table names), and optional errors.
    """
    _require_mysql(conn_params)
    result = {"success": True, "tables_altered": [], "errors": []}
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT language_code FROM ut_language")
            langs = [str(r.get("language_code") or r[0]).strip().lower() for r in cur.fetchall() if r]
        except Exception as e:
            logger.warning("Could not read ut_language for is_system column sync: %s; using default only", e)
            langs = [(conn_params.get("dw_default_language") or "en").strip().lower()]
        if not langs:
            langs = ["en"]
        for table_prefix in _IS_SYSTEM_TABLE_PREFIXES:
            for lang in langs:
                tname = f"{table_prefix}_{lang}"
                try:
                    cur.execute(
                        "SELECT 1 FROM information_schema.COLUMNS "
                        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = 'is_system' LIMIT 1",
                        (tname,),
                    )
                    if cur.fetchone():
                        continue
                    cur.execute(
                        f"ALTER TABLE `{tname}` ADD COLUMN `is_system` TINYINT(1) NOT NULL DEFAULT 0"
                    )
                    conn.commit()
                    result["tables_altered"].append(tname)
                    logger.info("Added column is_system to %s", tname)
                except Exception as e:
                    conn.rollback()
                    msg = f"{tname}: {e}"
                    result["errors"].append(msg)
                    logger.warning("Add is_system to %s failed: %s", tname, e)
        cur.close()
    if result["errors"]:
        result["success"] = False
    return result


_UNIT_FORMAT_TABLE_PREFIX = "ut_unit"


def perform_add_unit_format_column(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add or widen unit_format on locale unit tables: ut_unit_<locale>.
    unit_format is VARCHAR(255) NULL — display/format code or JSON for data values using the unit.
    Adds the column when missing; MODIFY to VARCHAR(255) when an existing column is narrower.
    MySQL only. Runs after lowercase/indexes so table names are final.
    """
    _require_mysql(conn_params)
    result = {"success": True, "tables_altered": [], "errors": []}
    _unit_format_ddl = "VARCHAR(255) NULL DEFAULT NULL"
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT language_code FROM ut_language")
            langs = [str(r.get("language_code") or r[0]).strip().lower() for r in cur.fetchall() if r]
        except Exception as e:
            logger.warning("Could not read ut_language for unit_format column sync: %s; using default only", e)
            langs = [(conn_params.get("dw_default_language") or "en").strip().lower()]
        if not langs:
            langs = ["en"]
        for lang in langs:
            tname = f"{_UNIT_FORMAT_TABLE_PREFIX}_{lang}"
            try:
                cur.execute(
                    "SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = 'unit_format' LIMIT 1",
                    (tname,),
                )
                row = cur.fetchone()
                if not row:
                    cur.execute(
                        f"ALTER TABLE `{tname}` ADD COLUMN `unit_format` {_unit_format_ddl}"
                    )
                    conn.commit()
                    result["tables_altered"].append(tname)
                    logger.info("Added column unit_format to %s", tname)
                    continue
                max_len = row.get("CHARACTER_MAXIMUM_LENGTH") if isinstance(row, dict) else row[0]
                if max_len is not None and int(max_len) >= 255:
                    continue
                cur.execute(
                    f"ALTER TABLE `{tname}` MODIFY COLUMN `unit_format` {_unit_format_ddl}"
                )
                conn.commit()
                result["tables_altered"].append(tname)
                logger.info("Widened column unit_format on %s to VARCHAR(255)", tname)
            except Exception as e:
                conn.rollback()
                msg = f"{tname}: {e}"
                result["errors"].append(msg)
                logger.warning("Sync unit_format on %s failed: %s", tname, e)
        cur.close()
    if result["errors"]:
        result["success"] = False
    return result


def perform_validate_sync_new_columns(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run all additive column migrations (idempotent).
    Currently: is_system on subgroup locale tables; unit_format on ut_unit_<locale>.
    """
    r_is_system = perform_add_subgroup_val_is_system(conn_params)
    r_unit_format = perform_add_unit_format_column(conn_params)
    errors = (r_is_system.get("errors") or []) + (r_unit_format.get("errors") or [])
    return {
        "success": r_is_system.get("success") and r_unit_format.get("success"),
        "subgroup_is_system": r_is_system,
        "unit_format": r_unit_format,
        "tables_altered": (r_is_system.get("tables_altered") or []) + (r_unit_format.get("tables_altered") or []),
        "errors": errors,
    }


def _get_table_columns(cur: Any, table_name: str) -> set:
    """Return set of lowercase column names for table (from information_schema)."""
    cur.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s",
        (table_name,),
    )
    return {str(r.get("COLUMN_NAME") or r[0]).strip().lower() for r in cur.fetchall()}


def _resolve_col(columns: set, preferred: str, fallback: str) -> Optional[str]:
    """Return preferred if in columns, else fallback if in columns, else None."""
    low = columns
    if preferred.lower() in low:
        return preferred
    if fallback.lower() in low:
        return fallback
    return None


def _fetch_db_configuration_values(
    conn_params: Dict[str, Any], app_key: str, key_codes: List[str]
) -> Dict[str, str]:
    """Read key_code -> key_value from warehouse db_configuration when the table exists."""
    if not key_codes:
        return {}
    out: Dict[str, str] = {}
    try:
        with create_mysql_connection(
            host=conn_params["db_host_address"],
            port=conn_params["db_port"],
            user=conn_params["db_user"],
            password=conn_params["db_password"],
            database=conn_params.get("db_database"),
        ) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT 1 FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s LIMIT 1",
                ("db_configuration",),
            )
            if not cur.fetchone():
                cur.close()
                return out
            ph = ",".join(["%s"] * len(key_codes))
            cur.execute(
                f"SELECT key_code, key_value FROM db_configuration "
                f"WHERE app_key = %s AND key_code IN ({ph})",
                (app_key, *key_codes),
            )
            for row in cur.fetchall():
                if isinstance(row, dict):
                    kc = row.get("key_code")
                    val = row.get("key_value")
                else:
                    kc, val = row[0], row[1]
                if kc and (val or "").strip():
                    out[str(kc)] = str(val).strip()
            cur.close()
    except Exception as e:
        logger.warning("Could not read db_configuration for subgroup GIDs: %s", e)
    return out


def _row_col(row: Any, col: str) -> Any:
    """Read a column from a DictCursor or tuple row."""
    if not row:
        return None
    if isinstance(row, dict):
        return row.get(col)
    return row[0]


def _map_subgroup_type_columns(cur: Any, def_lang: str) -> Optional[Dict[str, Any]]:
    ttype_def = f"ut_subgroup_type_{def_lang}"
    cols = _get_table_columns(cur, ttype_def)
    type_nid = _resolve_col(cols, "sg_cat_nid", "subgroup_type_nid")
    type_gid = _resolve_col(cols, "sg_cat_gid", "subgroup_type_gid")
    type_name = _resolve_col(cols, "sg_cat_name", "subgroup_type_name")
    type_order = _resolve_col(cols, "sg_cat_order", "subgroup_type_order")
    type_global = _resolve_col(cols, "sg_cat_global", "subgroup_type_global")
    if not all([type_nid, type_gid, type_name, type_order is not None, type_global is not None]):
        return None
    return {
        "type_nid": type_nid,
        "type_gid": type_gid,
        "type_name": type_name,
        "type_order": type_order,
        "type_global": type_global,
        "has_is_system": "is_system" in cols,
    }


def _map_subgroup_columns(cur: Any, def_lang: str) -> Optional[Dict[str, Any]]:
    tsub_def = f"ut_subgroup_{def_lang}"
    cols = _get_table_columns(cur, tsub_def)
    sub_nid = _resolve_col(cols, "sg_nid", "subgroup_nid")
    sub_gid = _resolve_col(cols, "sg_gid", "subgroup_gid")
    sub_name = _resolve_col(cols, "sg_name", "subgroup_name")
    sub_type_fk = _resolve_col(cols, "sg_cat_nid", "subgroup_type")
    sub_order = _resolve_col(cols, "sg_catg_val_order", "subgroup_order")
    sub_global = _resolve_col(cols, "sg_catg_val_global", "subgroup_global")
    if not all([sub_nid, sub_gid, sub_name, sub_type_fk, sub_order is not None, sub_global is not None]):
        return None
    return {
        "sub_nid": sub_nid,
        "sub_gid": sub_gid,
        "sub_name": sub_name,
        "sub_type_fk": sub_type_fk,
        "sub_order": sub_order,
        "sub_global": sub_global,
        "has_is_system": "is_system" in cols,
    }


def _map_subgroup_val_columns(cur: Any, def_lang: str) -> Optional[Dict[str, Any]]:
    tval_def = f"ut_subgroup_vals_{def_lang}"
    cols = _get_table_columns(cur, tval_def)
    val_nid = _resolve_col(cols, "sg_nid", "subgroup_val_nid")
    val_gid = _resolve_col(cols, "sg_gid", "subgroup_val_gid")
    val_name = _resolve_col(cols, "sg_name", "subgroup_val")
    val_order = _resolve_col(cols, "sg_order", "subgroup_val_order")
    val_global = _resolve_col(cols, "sg_is_global", "subgroup_val_global")
    val_is_system = _resolve_col(cols, "is_system", "is_system")
    if not all([val_nid, val_gid, val_name, val_order is not None, val_global is not None]):
        return None
    return {
        "val_nid": val_nid,
        "val_gid": val_gid,
        "val_name": val_name,
        "val_order": val_order,
        "val_global": val_global,
        "val_is_system": val_is_system,
        "has_is_system": bool(val_is_system),
    }


def _promote_is_system_by_gid(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    table_prefix: str,
    gid_col: str,
    gid_values: List[str],
    has_is_system: bool,
) -> bool:
    if not has_is_system:
        return False
    updated_any = False
    unique_gids = list(dict.fromkeys(g for g in gid_values if g))
    for lang in langs:
        table = f"{table_prefix}_{lang}"
        for gid in unique_gids:
            try:
                cur.execute(
                    f"UPDATE `{table}` SET `is_system` = 1 WHERE `{gid_col}` = %s",
                    (gid,),
                )
                if cur.rowcount:
                    updated_any = True
                conn.commit()
            except Exception as e:
                conn.rollback()
                result["errors"].append(f"{table} promote is_system {gid}: {e}")
                logger.warning("Promote is_system failed for %s %s: %s", table, gid, e)
    return updated_any


def _ensure_subgroup_types(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    type_cols: Dict[str, Any],
    others_gid: str,
    total_gid: str,
) -> Dict[str, int]:
    subgroup_type_nids: Dict[str, int] = {}
    type_nid = type_cols["type_nid"]
    type_gid = type_cols["type_gid"]
    type_name = type_cols["type_name"]
    type_order = type_cols["type_order"]
    type_global = type_cols["type_global"]
    type_has_is_system = type_cols["has_is_system"]

    for sg_type_gid, sg_type_name in [(others_gid, "Others"), (total_gid, "Total")]:
        for lang in langs:
            ttype = f"ut_subgroup_type_{lang}"
            try:
                cur.execute(
                    f"SELECT `{type_nid}` FROM `{ttype}` WHERE `{type_gid}` = %s LIMIT 1",
                    (sg_type_gid,),
                )
                row = cur.fetchone()
                if row:
                    nid = _row_col(row, type_nid)
                    if nid is not None:
                        subgroup_type_nids[sg_type_gid] = int(nid)
                else:
                    if type_has_is_system:
                        cur.execute(
                            f"INSERT INTO `{ttype}` (`{type_name}`, `{type_gid}`, `{type_order}`, "
                            f"`{type_global}`, `is_system`) VALUES (%s, %s, 0, 0, 1)",
                            (sg_type_name, sg_type_gid),
                        )
                    else:
                        cur.execute(
                            f"INSERT INTO `{ttype}` (`{type_name}`, `{type_gid}`, `{type_order}`, "
                            f"`{type_global}`) VALUES (%s, %s, 0, 0)",
                            (sg_type_name, sg_type_gid),
                        )
                    conn.commit()
                    subgroup_type_nids[sg_type_gid] = int(cur.lastrowid)
                    result["created"][f"{sg_type_gid.lower()}_type"] = (
                        result["created"].get(f"{sg_type_gid.lower()}_type", 0) + 1
                    )
            except Exception as e:
                conn.rollback()
                result["errors"].append(f"ut_subgroup_type_{lang} {sg_type_gid}: {e}")
                logger.warning("Ensure %s type failed for %s: %s", sg_type_gid, ttype, e)
    return subgroup_type_nids


def _promote_subgroup_types_is_system(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    type_cols: Dict[str, Any],
    others_gid: str,
    total_gid: str,
) -> None:
    if _promote_is_system_by_gid(
        cur,
        conn,
        result,
        langs,
        "ut_subgroup_type",
        type_cols["type_gid"],
        [others_gid, total_gid],
        type_cols["has_is_system"],
    ):
        result["updated"] = True


def _ensure_subgroup_category_values(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    sub_cols: Dict[str, Any],
    default_subgroup_gid: str,
    total_type_nid: int,
) -> Optional[int]:
    sub_nid = sub_cols["sub_nid"]
    sub_gid = sub_cols["sub_gid"]
    sub_name = sub_cols["sub_name"]
    sub_type_fk = sub_cols["sub_type_fk"]
    sub_order = sub_cols["sub_order"]
    sub_global = sub_cols["sub_global"]
    sub_has_is_system = sub_cols["has_is_system"]

    default_subgroup_nid: Optional[int] = None
    for lang in langs:
        tsub = f"ut_subgroup_{lang}"
        try:
            cur.execute(
                f"SELECT `{sub_nid}` FROM `{tsub}` WHERE `{sub_gid}` = %s LIMIT 1",
                (default_subgroup_gid,),
            )
            row = cur.fetchone()
            if row:
                nid = _row_col(row, sub_nid)
                if nid is not None and default_subgroup_nid is None:
                    default_subgroup_nid = int(nid)
            else:
                if sub_has_is_system:
                    cur.execute(
                        f"INSERT INTO `{tsub}` (`{sub_name}`, `{sub_gid}`, `{sub_type_fk}`, "
                        f"`{sub_global}`, `{sub_order}`, `is_system`) VALUES (%s, %s, %s, 0, 0, 1)",
                        ("Total", default_subgroup_gid, total_type_nid),
                    )
                else:
                    cur.execute(
                        f"INSERT INTO `{tsub}` (`{sub_name}`, `{sub_gid}`, `{sub_type_fk}`, "
                        f"`{sub_global}`, `{sub_order}`) VALUES (%s, %s, %s, 0, 0)",
                        ("Total", default_subgroup_gid, total_type_nid),
                    )
                conn.commit()
                if default_subgroup_nid is None:
                    default_subgroup_nid = int(cur.lastrowid)
                result["created"]["subgroup"] = result["created"].get("subgroup", 0) + 1
        except Exception as e:
            conn.rollback()
            result["errors"].append(f"ut_subgroup_{lang} {default_subgroup_gid}: {e}")
            logger.warning("Ensure default subgroup failed for %s: %s", tsub, e)
    return default_subgroup_nid


def _promote_subgroup_category_values_is_system(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    sub_cols: Dict[str, Any],
    default_subgroup_gid: str,
) -> None:
    if _promote_is_system_by_gid(
        cur,
        conn,
        result,
        langs,
        "ut_subgroup",
        sub_cols["sub_gid"],
        [default_subgroup_gid],
        sub_cols["has_is_system"],
    ):
        result["updated"] = True


def _next_subgroup_val_nid(cur: Any, def_lang: str, val_nid_col: str) -> int:
    tval = f"ut_subgroup_vals_{def_lang}"
    cur.execute(f"SELECT COALESCE(MAX(`{val_nid_col}`), 0) + 1 AS next_nid FROM `{tval}`")
    row = cur.fetchone()
    next_nid = _row_col(row, "next_nid")
    return int(next_nid or 1)


def _ensure_subgroup_vals(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    def_lang: str,
    val_cols: Dict[str, Any],
    default_subgroup_gid: str,
) -> Optional[int]:
    val_nid = val_cols["val_nid"]
    val_gid = val_cols["val_gid"]
    val_name = val_cols["val_name"]
    val_order = val_cols["val_order"]
    val_global = val_cols["val_global"]
    val_is_system = val_cols["val_is_system"]

    new_sg_val_nid: Optional[int] = None
    for lang in langs:
        tval = f"ut_subgroup_vals_{lang}"
        try:
            cur.execute(
                f"SELECT `{val_nid}` FROM `{tval}` WHERE `{val_gid}` = %s LIMIT 1",
                (default_subgroup_gid,),
            )
            row = cur.fetchone()
            if row:
                nid = _row_col(row, val_nid)
                if nid is not None and new_sg_val_nid is None:
                    new_sg_val_nid = int(nid)
            else:
                if new_sg_val_nid is None:
                    new_sg_val_nid = _next_subgroup_val_nid(cur, def_lang, val_nid)
                cur.execute(
                    f"INSERT INTO `{tval}` (`{val_nid}`, `{val_name}`, `{val_gid}`, "
                    f"`{val_order}`, `{val_global}`, `{val_is_system}`) "
                    "VALUES (%s, %s, %s, 0, 0, 1)",
                    (new_sg_val_nid, "Total", default_subgroup_gid),
                )
                conn.commit()
                result["created"]["subgroup_val"] = result["created"].get("subgroup_val", 0) + 1
        except Exception as e:
            conn.rollback()
            result["errors"].append(f"ut_subgroup_vals_{lang} {default_subgroup_gid}: {e}")
            logger.warning("Ensure default subgroup_val failed for %s: %s", tval, e)
    return new_sg_val_nid


def _promote_subgroup_vals_is_system(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    val_cols: Dict[str, Any],
    default_subgroup_gid: str,
) -> None:
    if _promote_is_system_by_gid(
        cur,
        conn,
        result,
        langs,
        "ut_subgroup_vals",
        val_cols["val_gid"],
        [default_subgroup_gid],
        val_cols["has_is_system"],
    ):
        result["updated"] = True


def _ensure_subgroup_val_association(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    new_sg_val_nid: int,
    default_subgroup_nid: int,
) -> None:
    try:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM ut_subgroup_vals_subgroup "
            "WHERE subgroup_val_nid = %s AND subgroup_nid = %s",
            (new_sg_val_nid, default_subgroup_nid),
        )
        row = cur.fetchone()
        count = _row_col(row, "cnt")
        if int(count or 0) > 0:
            return
        cur.execute(
            "INSERT INTO ut_subgroup_vals_subgroup (subgroup_val_nid, subgroup_nid) VALUES (%s, %s)",
            (new_sg_val_nid, default_subgroup_nid),
        )
        conn.commit()
        result["created"]["subgroup_val_subgroup"] = 1
    except Exception as e:
        conn.rollback()
        result["errors"].append(f"ut_subgroup_vals_subgroup association: {e}")
        logger.warning("Ensure subgroup_val_subgroup association failed: %s", e)


def _promote_linked_entities_is_system(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    def_lang: str,
    linked_subgroup_nids: List[int],
    type_cols: Dict[str, Any],
    sub_cols: Dict[str, Any],
) -> None:
    if not linked_subgroup_nids:
        return
    sub_nid = sub_cols["sub_nid"]
    sub_gid = sub_cols["sub_gid"]
    sub_type_fk = sub_cols["sub_type_fk"]
    type_nid = type_cols["type_nid"]
    type_gid = type_cols["type_gid"]

    tsub_def = f"ut_subgroup_{def_lang}"
    ttype_def = f"ut_subgroup_type_{def_lang}"
    category_gids: List[str] = []
    type_gids: List[str] = []

    for subgroup_nid in linked_subgroup_nids:
        cur.execute(
            f"SELECT `{sub_gid}`, `{sub_type_fk}` FROM `{tsub_def}` WHERE `{sub_nid}` = %s LIMIT 1",
            (subgroup_nid,),
        )
        row = cur.fetchone()
        if not row:
            continue
        sg_gid = _row_col(row, sub_gid)
        type_fk = _row_col(row, sub_type_fk)
        if sg_gid:
            category_gids.append(str(sg_gid))
        if type_fk is not None:
            cur.execute(
                f"SELECT `{type_gid}` FROM `{ttype_def}` WHERE `{type_nid}` = %s LIMIT 1",
                (int(type_fk),),
            )
            type_row = cur.fetchone()
            tg = _row_col(type_row, type_gid) if type_row else None
            if tg:
                type_gids.append(str(tg))

    if _promote_is_system_by_gid(
        cur, conn, result, langs, "ut_subgroup", sub_gid, category_gids, sub_cols["has_is_system"]
    ):
        result["updated"] = True
    if _promote_is_system_by_gid(
        cur, conn, result, langs, "ut_subgroup_type", type_gid, type_gids, type_cols["has_is_system"]
    ):
        result["updated"] = True


def _ensure_default_subgroup_from_existing_val(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    def_lang: str,
    existing_val_nid: int,
    others_gid: str,
    total_gid: str,
    default_subgroup_gid: str,
    type_cols: Dict[str, Any],
    sub_cols: Dict[str, Any],
    val_cols: Dict[str, Any],
) -> Dict[str, Any]:
    new_sg_val_nid = int(existing_val_nid)
    _promote_subgroup_vals_is_system(cur, conn, result, langs, val_cols, default_subgroup_gid)

    cur.execute(
        "SELECT subgroup_nid FROM ut_subgroup_vals_subgroup WHERE subgroup_val_nid = %s",
        (new_sg_val_nid,),
    )
    linked_nids = [
        int(_row_col(r, "subgroup_nid"))
        for r in cur.fetchall()
        if _row_col(r, "subgroup_nid") is not None
    ]

    if linked_nids:
        _promote_linked_entities_is_system(
            cur, conn, result, langs, def_lang, linked_nids, type_cols, sub_cols
        )
        return result

    subgroup_type_nids = _ensure_subgroup_types(
        cur, conn, result, langs, type_cols, others_gid, total_gid
    )
    _promote_subgroup_types_is_system(cur, conn, result, langs, type_cols, others_gid, total_gid)

    total_type_nid = subgroup_type_nids.get(total_gid)
    if not total_type_nid:
        result["errors"].append("Could not find or create TOTAL subgroup type")
        result["success"] = False
        return result

    default_subgroup_nid = _ensure_subgroup_category_values(
        cur, conn, result, langs, sub_cols, default_subgroup_gid, total_type_nid
    )
    _promote_subgroup_category_values_is_system(
        cur, conn, result, langs, sub_cols, default_subgroup_gid
    )

    if default_subgroup_nid:
        _ensure_subgroup_val_association(cur, conn, result, new_sg_val_nid, default_subgroup_nid)
    return result


def _ensure_default_subgroup_create_full(
    cur: Any,
    conn: Any,
    result: Dict[str, Any],
    langs: List[str],
    def_lang: str,
    others_gid: str,
    total_gid: str,
    default_subgroup_gid: str,
    type_cols: Dict[str, Any],
    sub_cols: Dict[str, Any],
    val_cols: Dict[str, Any],
) -> Dict[str, Any]:
    subgroup_type_nids = _ensure_subgroup_types(
        cur, conn, result, langs, type_cols, others_gid, total_gid
    )
    _promote_subgroup_types_is_system(cur, conn, result, langs, type_cols, others_gid, total_gid)

    total_type_nid = subgroup_type_nids.get(total_gid)
    if not total_type_nid:
        result["errors"].append("Could not find or create TOTAL subgroup type")
        result["success"] = False
        return result

    default_subgroup_nid = _ensure_subgroup_category_values(
        cur, conn, result, langs, sub_cols, default_subgroup_gid, total_type_nid
    )
    _promote_subgroup_category_values_is_system(
        cur, conn, result, langs, sub_cols, default_subgroup_gid
    )

    new_sg_val_nid = _ensure_subgroup_vals(
        cur, conn, result, langs, def_lang, val_cols, default_subgroup_gid
    )
    _promote_subgroup_vals_is_system(cur, conn, result, langs, val_cols, default_subgroup_gid)

    if new_sg_val_nid and default_subgroup_nid:
        _ensure_subgroup_val_association(cur, conn, result, new_sg_val_nid, default_subgroup_nid)
    return result


def perform_ensure_default_subgroup_from_config(conn_params: Dict[str, Any], dw_id: int) -> Dict[str, Any]:
    """
    Ensure default subgroup structure using warehouse db_configuration, system_configuration, then env.

    Path A (existing_val): default-locale ut_subgroup_vals row exists for DEFAULT_SYSTEM_DW_SUBGROUP_GID.
    Promote that combination to is_system=1; if junction links exist, promote linked category values and
    types; otherwise ensure-or-insert types and category value, promote them, then create junction.

    Path B (create_full): no default-locale val row. Ensure-or-insert types, category value, and subgroup val
    by GID; promote each layer to is_system=1; create junction when missing.

    Both paths reuse existing rows by GID (no duplicates) and separate ensure-or-insert from promotion.
    """
    result = {
        "success": True,
        "created": {},
        "updated": False,
        "errors": [],
        "config_used": {},
        "path": None,
    }

    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import SystemConfiguration

    config_keys = [
        "DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID",
        "DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID",
        "DEFAULT_SYSTEM_DW_SUBGROUP_GID",
    ]
    app_key_dm = settings.DFA_DM_APP_KEY
    fallback_map = {
        "DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID": settings.DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID,
        "DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID": settings.DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID,
        "DEFAULT_SYSTEM_DW_SUBGROUP_GID": settings.DEFAULT_SYSTEM_DW_SUBGROUP_GID,
    }

    config_values: Dict[str, str] = {}
    try:
        wh_vals = _fetch_db_configuration_values(conn_params, app_key_dm, config_keys)
        with SessionLocal() as app_db:
            for key_code in config_keys:
                if key_code in wh_vals and wh_vals[key_code]:
                    config_values[key_code] = wh_vals[key_code]
                    result["config_used"][key_code] = {
                        "value": wh_vals[key_code],
                        "source": "db_configuration",
                    }
                    continue
                global_config = (
                    app_db.query(SystemConfiguration)
                    .filter(
                        SystemConfiguration.app_key == app_key_dm,
                        SystemConfiguration.key_code == key_code,
                    )
                    .first()
                )
                if global_config and (global_config.key_value or "").strip():
                    config_values[key_code] = (global_config.key_value or "").strip()
                    result["config_used"][key_code] = {
                        "value": config_values[key_code],
                        "source": "system_configuration",
                    }
                else:
                    config_values[key_code] = fallback_map[key_code]
                    result["config_used"][key_code] = {
                        "value": fallback_map[key_code],
                        "source": "env_fallback",
                    }
    except Exception as e:
        result["errors"].append(f"Failed to fetch configuration: {e}")
        result["success"] = False
        return result

    others_gid = config_values["DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID"]
    total_gid = config_values["DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID"]
    default_subgroup_gid = config_values["DEFAULT_SYSTEM_DW_SUBGROUP_GID"]
    
    # Validate MySQL connection before proceeding with data warehouse operations
    _require_mysql(conn_params)
    
    # Step 2: Create/ensure subgroup structure in data warehouse
    with create_mysql_connection(
        host=conn_params["db_host_address"],
        port=conn_params["db_port"],
        user=conn_params["db_user"],
        password=conn_params["db_password"],
        database=conn_params["db_database"],
    ) as conn:
        cur = conn.cursor()
        try:
            cur.execute("SELECT language_code FROM ut_language")
            langs = [str(r.get("language_code") or r[0]).strip().lower() for r in cur.fetchall() if r]
        except Exception as e:
            logger.warning("Could not read ut_language for default subgroup: %s", e)
            langs = [(conn_params.get("dw_default_language") or "en").strip().lower()]
        if not langs:
            langs = ["en"]

        def_lang = langs[0]

        val_cols = _map_subgroup_val_columns(cur, def_lang)
        if not val_cols:
            cols_val = _get_table_columns(cur, f"ut_subgroup_vals_{def_lang}")
            result["errors"].append(
                f"ut_subgroup_vals: required columns not found (have {cols_val})"
            )
            result["success"] = False
            cur.close()
            return result

        if not val_cols["has_is_system"]:
            result["success"] = True
            result["skipped"] = True
            result["reason"] = "is_system column not found in ut_subgroup_vals tables"
            cur.close()
            return result

        val_nid = val_cols["val_nid"]
        val_gid = val_cols["val_gid"]
        tval_def = f"ut_subgroup_vals_{def_lang}"
        cur.execute(
            f"SELECT `{val_nid}` FROM `{tval_def}` WHERE `{val_gid}` = %s LIMIT 1",
            (default_subgroup_gid,),
        )
        existing_val_row = cur.fetchone()
        existing_val_nid = _row_col(existing_val_row, val_nid) if existing_val_row else None

        type_cols = _map_subgroup_type_columns(cur, def_lang)
        if not type_cols:
            cols_type = _get_table_columns(cur, f"ut_subgroup_type_{def_lang}")
            result["errors"].append(
                f"ut_subgroup_type: required columns not found (have {cols_type})"
            )
            result["success"] = False
            cur.close()
            return result

        sub_cols = _map_subgroup_columns(cur, def_lang)
        if not sub_cols:
            cols_sub = _get_table_columns(cur, f"ut_subgroup_{def_lang}")
            result["errors"].append(f"ut_subgroup: required columns not found (have {cols_sub})")
            result["success"] = False
            cur.close()
            return result

        if existing_val_nid is not None:
            result["path"] = "existing_val"
            _ensure_default_subgroup_from_existing_val(
                cur,
                conn,
                result,
                langs,
                def_lang,
                int(existing_val_nid),
                others_gid,
                total_gid,
                default_subgroup_gid,
                type_cols,
                sub_cols,
                val_cols,
            )
        else:
            result["path"] = "create_full"
            _ensure_default_subgroup_create_full(
                cur,
                conn,
                result,
                langs,
                def_lang,
                others_gid,
                total_gid,
                default_subgroup_gid,
                type_cols,
                sub_cols,
                val_cols,
            )

        cur.close()

    return result




# ---------------------------------------------------------------------------
# db_configuration (per-warehouse config mirror; no FK to system_application)
# ---------------------------------------------------------------------------

_WAREHOUSE_DB_CONFIGURATION_TABLE = "db_configuration"

_DM_DB_CONFIGURATION_MIRROR_DESCRIPTIONS: dict[str, str] = {
    "AI_PROVIDER": "AI provider identifier",
    "AI_API_KEY": "AI API key; seeded into db_configuration on optimize / configuration_sync",
    "CURRENT_TIMEPERIOD": (
        "Current timeperiod state (JSON); seeded into db_configuration on optimize / configuration_sync"
    ),
    "IUS_DEF_VALIDATION": (
        "Default IUS validation mode; seeded into db_configuration on optimize / configuration_sync"
    ),
    "IND_CLASSIFICATIONS_SETTINGS": (
        "Indicator classification types visibility (JSON); seeded into db_configuration on optimize "
        "/ configuration_sync"
    ),
    "DEFAULT_SYSTEM_DW_SUBGROUP_GID": "Default system subgroup value GID",
    "DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID": "GID for 'Total' subgroup category type",
    "DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID": "GID for 'Others' subgroup category type",
    "DW_MAPS": "JSON choropleth basemap paths per area level; db_configuration uses app_key DFA_VIZ",
}

_SUBGROUP_KEY_ENV_FALLBACK = {
    "DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID": settings.DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID,
    "DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID": settings.DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID,
    "DEFAULT_SYSTEM_DW_SUBGROUP_GID": settings.DEFAULT_SYSTEM_DW_SUBGROUP_GID,
}


def _load_db_configuration_seed_for_dm() -> dict[str, dict[str, Optional[str]]]:
    """
    Build per-warehouse mirror defaults from Settings (.env); logical app key DFA_DM.
    Returns key_code -> {"value": str, "description": Optional[str]}.
    """
    out: dict[str, dict[str, Optional[str]]] = {}
    for key_code in IS_DW_MIRROR_KEY_CODES:
        raw_val = getattr(settings, key_code, None)
        if raw_val is None:
            logger.warning("Missing Settings attribute for db_configuration mirror key %s", key_code)
            continue
        out[key_code] = {
            "value": str(raw_val),
            "description": _DM_DB_CONFIGURATION_MIRROR_DESCRIPTIONS.get(key_code),
        }
    return out


def _resolve_db_mirror_row(
    key_code: str,
    row: Optional[Any],
    seed_by_key: dict[str, dict[str, Optional[str]]],
) -> tuple[str, Optional[str]]:
    """
    Resolve value/description for a warehouse-mirrored key: non-empty Settings seed, then
    system_configuration row, then subgroup env fallbacks from Settings.
    """
    seed = seed_by_key.get(key_code)
    if seed is not None and (seed.get("value") or "").strip():
        return (seed["value"] or "").strip(), seed.get("description")
    if row is not None and (row.key_value or "").strip():
        return (row.key_value or "").strip(), row.description
    if key_code in _SUBGROUP_KEY_ENV_FALLBACK:
        return (_SUBGROUP_KEY_ENV_FALLBACK.get(key_code) or "").strip(), None
    return "", None


def _resolve_dw_maps_for_warehouse(
    row_dw_maps_viz: Optional[Any],
    seed_by_key: dict[str, dict[str, Optional[str]]],
) -> tuple[str, Optional[str]]:
    """
    DW_MAPS is stored under app_key DFA_VIZ in both system_configuration and db_configuration.
    Prefer core DB (DFA_VIZ) over Settings so optimization mirrors the same JSON as the app DB;
    if both are empty, default to "{}".
    """
    if row_dw_maps_viz is not None and (row_dw_maps_viz.key_value or "").strip():
        return (row_dw_maps_viz.key_value or "").strip(), row_dw_maps_viz.description
    seed = seed_by_key.get("DW_MAPS")
    if seed is not None and (seed.get("value") or "").strip():
        return (seed["value"] or "").strip(), seed.get("description")
    return "{}", _DM_DB_CONFIGURATION_MIRROR_DESCRIPTIONS.get("DW_MAPS")


def _mysql_table_exists_in_current_db(cur, table_name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s LIMIT 1",
        (table_name,),
    )
    return cur.fetchone() is not None


_DW_CONFIGS_UNIQUE_INDEX = "uq_dw_configs_app_key_code"


def _mysql_unique_index_exists(cur, table_name: str, index_name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND INDEX_NAME = %s "
        "AND NON_UNIQUE = 0 LIMIT 1",
        (table_name, index_name),
    )
    return cur.fetchone() is not None


def _ensure_db_configuration_unique_app_key_code(cur, conn) -> Dict[str, Any]:
    """
    Existing warehouses may have db_configuration without UNIQUE(app_key, key_code); CREATE TABLE IF NOT EXISTS
    does not add it. Remove duplicate rows (keep lowest id) then add the unique index when missing.
    """
    info: Dict[str, Any] = {
        "duplicate_dw_config_rows_deleted": 0,
        "dw_configs_unique_index_added": False,
    }
    tbl = _WAREHOUSE_DB_CONFIGURATION_TABLE
    if not _mysql_table_exists_in_current_db(cur, tbl):
        return info
    if _mysql_unique_index_exists(cur, tbl, _DW_CONFIGS_UNIQUE_INDEX):
        return info
    try:
        cur.execute(
            "SELECT 1 FROM information_schema.COLUMNS "
            f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
            "AND COLUMN_NAME = 'id' LIMIT 1",
            (tbl,),
        )
        if cur.fetchone():
            cur.execute(
                f"DELETE d1 FROM {tbl} d1 "
                f"INNER JOIN {tbl} d2 ON d1.app_key = d2.app_key AND d1.key_code = d2.key_code "
                "AND d1.id > d2.id"
            )
            info["duplicate_dw_config_rows_deleted"] = int(cur.rowcount or 0)
            conn.commit()
        cur.execute(
            f"ALTER TABLE {tbl} ADD UNIQUE KEY {_DW_CONFIGS_UNIQUE_INDEX} (app_key, key_code)"
        )
        conn.commit()
        info["dw_configs_unique_index_added"] = True
    except Exception as e:
        conn.rollback()
        info["dw_configs_unique_index_error"] = str(e)
        logger.warning("Could not add unique index on %s (app_key, key_code): %s", tbl, e)
    return info


def perform_sync_ut_dw_configs(conn_params: Dict[str, Any], dw_id: int) -> Dict[str, Any]:
    """
    Rename legacy ut_dw_configs or dw_configs to db_configuration when needed, create
    db_configuration if missing, then insert missing rows for keys in IS_DW_MIRROR_KEY_CODES.

    Most mirrored keys use **DFA_DM** as ``app_key`` (aligned with system_configuration for DM).
    **DW_MAPS** uses **DFA_VIZ** as ``app_key`` and resolves from ``system_configuration`` for DFA_VIZ
    first, then Settings (.env); if still empty, inserts ``{}``.

    Other mirrored keys: Settings (.env), then system_configuration, then subgroup GID fallbacks
    from Settings when still empty (DM keys only for the latter).
    Existing (app_key, key_code) rows are never updated.
    """
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import SystemConfiguration

    result: Dict[str, Any] = {
        "success": True,
        "errors": [],
        "rows_inserted": 0,
        "rows_skipped_existing": 0,
        "rows_upserted": 0,
        "duplicate_dw_config_rows_deleted": 0,
        "dw_configs_unique_index_added": False,
    }
    app_key_dm = settings.DFA_DM_APP_KEY
    app_key_viz = settings.DFA_VIZ_APP_KEY
    # (app_key, key_code, key_value, description) for each insert
    config_rows: List[tuple[str, str, str, Optional[str]]] = []

    try:
        seed_by_key = _load_db_configuration_seed_for_dm()
        dm_mirror_codes = [k for k in IS_DW_MIRROR_KEY_CODES if k != "DW_MAPS"]
        with SessionLocal() as app_db:
            rows_dm = (
                app_db.query(SystemConfiguration)
                .filter(
                    SystemConfiguration.app_key == app_key_dm,
                    SystemConfiguration.key_code.in_(dm_mirror_codes),
                )
                .all()
            )
            by_dm = {r.key_code: r for r in rows_dm}
            row_dw_maps_viz = (
                app_db.query(SystemConfiguration)
                .filter(
                    SystemConfiguration.app_key == app_key_viz,
                    SystemConfiguration.key_code == "DW_MAPS",
                )
                .first()
            )

        for key_code in sorted(dm_mirror_codes):
            val, desc = _resolve_db_mirror_row(key_code, by_dm.get(key_code), seed_by_key)
            config_rows.append((app_key_dm, key_code, val, desc))

        if "DW_MAPS" in IS_DW_MIRROR_KEY_CODES:
            val, desc = _resolve_dw_maps_for_warehouse(row_dw_maps_viz, seed_by_key)
            config_rows.append((app_key_viz, "DW_MAPS", val, desc))

        logger.debug("db_configuration sync dw_id=%s row_count=%s", dw_id, len(config_rows))

        charset = app_db_settings.DB_CHARSET
        collation = app_db_settings.DB_COLLATION
        tbl = _WAREHOUSE_DB_CONFIGURATION_TABLE
        create_sql = f"""
CREATE TABLE IF NOT EXISTS {tbl} (
  id INT NOT NULL AUTO_INCREMENT,
  app_key VARCHAR(10) NOT NULL,
  key_code VARCHAR(60) NOT NULL,
  key_value TEXT NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dw_configs_app_key_code (app_key, key_code)
) ENGINE=InnoDB DEFAULT CHARSET={charset} COLLATE={collation};
"""
        # NOT EXISTS avoids new duplicates even if UNIQUE index is still missing (legacy tables).
        insert_if_missing_sql = (
            f"INSERT INTO {tbl} (app_key, key_code, key_value, description) "
            "SELECT %s, %s, %s, %s FROM DUAL "
            "WHERE NOT EXISTS ("
            f"  SELECT 1 FROM {tbl} c WHERE c.app_key = %s AND c.key_code = %s LIMIT 1)"
        )

        with create_mysql_connection(
            host=conn_params["db_host_address"],
            port=conn_params["db_port"],
            user=conn_params["db_user"],
            password=conn_params["db_password"],
            database=conn_params.get("db_database"),
        ) as conn:
            cur = conn.cursor()
            has_ut = _mysql_table_exists_in_current_db(cur, "ut_dw_configs")
            has_dw_configs = _mysql_table_exists_in_current_db(cur, "dw_configs")
            has_target = _mysql_table_exists_in_current_db(cur, tbl)
            if has_ut and has_dw_configs:
                raise RuntimeError(
                    "Both ut_dw_configs and dw_configs exist in this warehouse; remove or merge one manually."
                )
            if has_ut and has_target:
                raise RuntimeError(
                    f"Both ut_dw_configs and {tbl} exist in this warehouse; remove or merge one manually."
                )
            if has_dw_configs and has_target:
                raise RuntimeError(
                    f"Both dw_configs and {tbl} exist in this warehouse; remove or merge one manually."
                )
            if has_ut and not has_dw_configs and not has_target:
                cur.execute(f"RENAME TABLE ut_dw_configs TO {tbl}")
                conn.commit()
            elif has_dw_configs and not has_ut and not has_target:
                cur.execute(f"RENAME TABLE dw_configs TO {tbl}")
                conn.commit()
            for stmt in _split_sql_statements(create_sql):
                s = stmt.strip()
                if s:
                    cur.execute(s)
            schema_info = _ensure_db_configuration_unique_app_key_code(cur, conn)
            result["duplicate_dw_config_rows_deleted"] = schema_info["duplicate_dw_config_rows_deleted"]
            result["dw_configs_unique_index_added"] = schema_info["dw_configs_unique_index_added"]
            if schema_info.get("dw_configs_unique_index_error"):
                result["dw_configs_unique_index_error"] = schema_info["dw_configs_unique_index_error"]
            rows_inserted = 0
            for app_key_ins, key_code, key_value, description in config_rows:
                cur.execute(
                    insert_if_missing_sql,
                    (app_key_ins, key_code, key_value, description, app_key_ins, key_code),
                )
                rows_inserted += cur.rowcount or 0
            conn.commit()
            cur.close()
        total = len(config_rows)
        result["rows_inserted"] = rows_inserted
        result["rows_skipped_existing"] = total - rows_inserted
        result["rows_upserted"] = rows_inserted
    except Exception as e:
        result["success"] = False
        result["errors"].append(str(e))
        log_background_incident(
            "perform_sync_ut_dw_configs failed",
            error_code="SYNC_UT_DW_CONFIGS_FAILED",
            exc=e,
            source="apps.app_db.services.dw_optimizer",
        )
    return result


# ---------------------------------------------------------------------------
# Validation tables provisioning
# ---------------------------------------------------------------------------

_VALIDATION_TABLES_SQL = f"""
CREATE TABLE IF NOT EXISTS iu_validation (
  id INT NOT NULL AUTO_INCREMENT,
  indicator_gid CHAR(60) NOT NULL,
  unit_gid CHAR(60) DEFAULT NULL,
  validation_type ENUM('NUM','TEXT','ENUM') NOT NULL,
  min_value DECIMAL(20,6) DEFAULT NULL,
  max_value DECIMAL(20,6) DEFAULT NULL,
  min_length INT DEFAULT NULL,
  max_length INT DEFAULT NULL,
  created TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_user_id INT DEFAULT NULL,
  modified TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  modified_user_id INT DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_iuv_indicator_unit (indicator_gid, unit_gid)
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS iu_validation_enum (
  id INT NOT NULL AUTO_INCREMENT,
  validation_id INT NOT NULL,
  option_code VARCHAR(50) NOT NULL,
  score DECIMAL(10,4) DEFAULT NULL,
  display_order TINYINT UNSIGNED DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_user_id INT NOT NULL,
  modified TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  modified_user_id INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_iuve_validation_option (validation_id, option_code),
  CONSTRAINT fk_validation_enum
    FOREIGN KEY (validation_id)
    REFERENCES iu_validation(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET};

CREATE TABLE IF NOT EXISTS iu_validation_enum_i18n (
  id INT NOT NULL AUTO_INCREMENT,
  master_id INT NOT NULL,
  locale VARCHAR(3) NOT NULL,
  label VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_iuvei_master_locale (master_id, locale),
  CONSTRAINT fk_enum_i18n
    FOREIGN KEY (master_id)
    REFERENCES iu_validation_enum(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET};
"""

_VALIDATION_TABLE_NAMES = (
    "iu_validation",
    "iu_validation_enum",
    "iu_validation_enum_i18n",
)

_LEGACY_UT_IU_VALIDATION_TABLES = (
    "ut_iu_validation_enum_i18n",
    "ut_iu_validation_enum",
    "ut_iu_validation",
)

# Compute Engine Tables
_COMPUTE_ENGINE_TABLES_SQL = f"""
CREATE TABLE IF NOT EXISTS ce_ius_compute_add_targets (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  i_gid VARCHAR(60) NOT NULL,
  u_gid VARCHAR(60) NOT NULL,
  s_gid VARCHAR(60) NOT NULL,
  ius_name VARCHAR(500) NOT NULL,
  target_decimal INT DEFAULT NULL,
  `order` INT NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_ce_add_targets_dw_ius_order (dw_id, i_gid, u_gid, s_gid, `order`)
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS ce_ius_compute_add_sources (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  target_id INT NOT NULL,
  i_gid VARCHAR(60) NOT NULL,
  u_gid VARCHAR(60) NOT NULL,
  s_gid VARCHAR(60) NOT NULL,
  ius_name VARCHAR(500) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_ce_add_sources_dw_id (dw_id),
  INDEX idx_ce_add_sources_target_id (target_id),
  CONSTRAINT fk_ce_add_sources_target
    FOREIGN KEY (target_id)
    REFERENCES ce_ius_compute_add_targets(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS ce_ius_compute_divs (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  i_gid VARCHAR(60) NOT NULL,
  u_gid VARCHAR(60) NOT NULL,
  s_gid VARCHAR(60) NOT NULL,
  ius_name VARCHAR(500) NOT NULL,
  num_i_gid VARCHAR(60) NOT NULL,
  num_u_gid VARCHAR(60) NOT NULL,
  num_s_gid VARCHAR(60) NOT NULL,
  num_ius_name VARCHAR(500) NOT NULL,
  den_i_gid VARCHAR(60) NOT NULL,
  den_u_gid VARCHAR(60) NOT NULL,
  den_s_gid VARCHAR(60) NOT NULL,
  den_ius_name VARCHAR(500) NOT NULL,
  target_decimal INT DEFAULT NULL,
  den_area_specific TINYINT(1) NOT NULL DEFAULT 0,
  den_area_id VARCHAR(100) DEFAULT NULL,
  den_area_name VARCHAR(100) DEFAULT NULL,
  den_multiplier DECIMAL(5,2) DEFAULT NULL,
  is_most_recent TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_ce_divs_dw_ius (dw_id, i_gid, u_gid, s_gid)
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS ce_ius_compute_minus (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  i_gid VARCHAR(60) NOT NULL,
  u_gid VARCHAR(60) NOT NULL,
  s_gid VARCHAR(60) NOT NULL,
  ius_name VARCHAR(500) NOT NULL,
  min_i_gid VARCHAR(60) NOT NULL,
  min_u_gid VARCHAR(60) NOT NULL,
  min_s_gid VARCHAR(60) NOT NULL,
  min_ius_name VARCHAR(500) NOT NULL,
  sub_i_gid VARCHAR(60) NOT NULL,
  sub_u_gid VARCHAR(60) NOT NULL,
  sub_s_gid VARCHAR(60) NOT NULL,
  sub_ius_name VARCHAR(500) NOT NULL,
  target_decimal INT DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_ce_minus_dw_ius (dw_id, i_gid, u_gid, s_gid)
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS ce_ius_compute_times (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  i_gid VARCHAR(60) NOT NULL,
  u_gid VARCHAR(60) NOT NULL,
  s_gid VARCHAR(60) NOT NULL,
  ius_name VARCHAR(500) NOT NULL,
  target_decimal INT DEFAULT NULL,
  target_tp_freq VARCHAR(3) NOT NULL,
  source_tp_freq VARCHAR(3) NOT NULL,
  aggregation_type VARCHAR(5) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_ce_times_dw_ius (dw_id, i_gid, u_gid, s_gid)
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS ce_ius_compute_areas (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  i_gid VARCHAR(255) NOT NULL,
  u_gid VARCHAR(255) NOT NULL,
  s_gid VARCHAR(255) NOT NULL,
  ius_name VARCHAR(500) NOT NULL,
  target_decimal INT DEFAULT NULL,
  target_area_level INT NOT NULL,
  source_area_level INT NOT NULL,
  aggregation_type VARCHAR(10) NOT NULL,
  populate_mid_levels TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_ce_areas_dw_ius (dw_id, i_gid, u_gid, s_gid)
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS ce_process_master (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  process_type VARCHAR(10) NOT NULL,
  filter_object TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_ce_process_master_dw_type (dw_id, process_type)
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS ce_process_time (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  process_id INT NOT NULL,
  filter_object TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_ce_process_time_dw_process (dw_id, process_id),
  CONSTRAINT fk_ce_process_time_master
    FOREIGN KEY (process_id)
    REFERENCES ce_process_master(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};

CREATE TABLE IF NOT EXISTS ce_process_time_logs (
  id INT NOT NULL AUTO_INCREMENT,
  dw_id INT NOT NULL,
  process_time_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  filter_object TEXT NOT NULL,
  status VARCHAR(20) DEFAULT NULL,
  total_jobs INT DEFAULT NULL,
  total_executed INT DEFAULT NULL,
  total_pending INT DEFAULT NULL,
  total_failed INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_ce_process_time_logs_dw_process_time (dw_id, process_time_id),
  CONSTRAINT fk_ce_process_time_logs_time
    FOREIGN KEY (process_time_id)
    REFERENCES ce_process_time(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET={app_db_settings.DB_CHARSET} COLLATE={app_db_settings.DB_COLLATION};
"""

_COMPUTE_ENGINE_TABLE_NAMES = (
    "ce_ius_compute_add_targets",
    "ce_ius_compute_add_sources",
    "ce_ius_compute_divs",
    "ce_ius_compute_minus",
    "ce_ius_compute_times",
    "ce_ius_compute_areas",
    "ce_process_master",
    "ce_process_time",
    "ce_process_time_logs",
)


def _validation_table_exists(cur, table_name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s LIMIT 1",
        (table_name,),
    )
    return cur.fetchone() is not None


def _perform_legacy_ut_iu_validation_rename(cur, conn) -> None:
    """
    If the DW still uses ut_iu_validation* names but not iu_validation*, rename
    atomically so CREATE IF NOT EXISTS does not create empty duplicate tables.
    """
    if _validation_table_exists(cur, "iu_validation"):
        return
    old_i18n, old_enum, old_root = _LEGACY_UT_IU_VALIDATION_TABLES
    has_root = _validation_table_exists(cur, old_root)
    has_enum = _validation_table_exists(cur, old_enum)
    has_i18n = _validation_table_exists(cur, old_i18n)
    if not has_root:
        return
    if has_i18n and has_enum:
        cur.execute(
            f"RENAME TABLE `{old_i18n}` TO `iu_validation_enum_i18n`, "
            f"`{old_enum}` TO `iu_validation_enum`, "
            f"`{old_root}` TO `iu_validation`"
        )
        conn.commit()
        return
    if has_enum:
        cur.execute(
            f"RENAME TABLE `{old_enum}` TO `iu_validation_enum`, "
            f"`{old_root}` TO `iu_validation`"
        )
        conn.commit()
        return
    cur.execute(f"RENAME TABLE `{old_root}` TO `iu_validation`")
    conn.commit()


def perform_ensure_validation_tables(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Idempotently create iu_validation, iu_validation_enum, and
    iu_validation_enum_i18n using CREATE TABLE IF NOT EXISTS.
    Renames legacy ut_iu_validation* tables when present and new names are absent.
    Safe to call multiple times — existing tables are never modified.
    """
    result: Dict[str, Any] = {"success": True, "tables": list(_VALIDATION_TABLE_NAMES), "errors": []}
    try:
        with create_mysql_connection(
            host=conn_params["db_host_address"],
            port=conn_params["db_port"],
            user=conn_params["db_user"],
            password=conn_params["db_password"],
            database=conn_params.get("db_database"),
        ) as conn:
            cur = conn.cursor()
            _perform_legacy_ut_iu_validation_rename(cur, conn)
            for stmt in _split_sql_statements(_VALIDATION_TABLES_SQL):
                stmt = stmt.strip()
                if stmt:
                    cur.execute(stmt)
            conn.commit()
            cur.close()
    except Exception as e:
        result["success"] = False
        result["errors"].append(str(e))
        log_background_incident(
            "perform_ensure_validation_tables failed",
            error_code="ENSURE_VALIDATION_TABLES_FAILED",
            exc=e,
            source="apps.app_db.services.dw_optimizer",
        )
    return result


def perform_ensure_compute_engine_tables(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Idempotently create compute engine tables using CREATE TABLE IF NOT EXISTS.
    Creates all 9 compute engine tables: ce_ius_compute_add_targets, ce_ius_compute_add_sources,
    ce_ius_compute_divs, ce_ius_compute_minus, ce_ius_compute_times, ce_ius_compute_areas,
    ce_process_master, ce_process_time, and ce_process_time_logs.
    Safe to call multiple times — existing tables are never modified.
    """
    result: Dict[str, Any] = {"success": True, "tables": list(_COMPUTE_ENGINE_TABLE_NAMES), "errors": []}
    try:
        with create_mysql_connection(
            host=conn_params["db_host_address"],
            port=conn_params["db_port"],
            user=conn_params["db_user"],
            password=conn_params["db_password"],
            database=conn_params.get("db_database"),
        ) as conn:
            cur = conn.cursor()
            for stmt in _split_sql_statements(_COMPUTE_ENGINE_TABLES_SQL):
                stmt = stmt.strip()
                if stmt:
                    cur.execute(stmt)
            conn.commit()
            cur.close()
    except Exception as e:
        result["success"] = False
        result["errors"].append(str(e))
        log_background_incident(
            "perform_ensure_compute_engine_tables failed",
            error_code="ENSURE_COMPUTE_ENGINE_TABLES_FAILED",
            exc=e,
            source="apps.app_db.services.dw_optimizer",
        )
    return result


def perform_ensure_new_tables(conn_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run all idempotent new-table provisioning steps. Currently: validation rule tables and compute engine tables.
    Extend with additional perform_ensure_* calls as new table groups are added.
    """
    validation = perform_ensure_validation_tables(conn_params)
    compute_engine = perform_ensure_compute_engine_tables(conn_params)
    
    # Aggregate success status - both must succeed
    validation_ok = bool(validation.get("success"))
    compute_engine_ok = bool(compute_engine.get("success"))
    overall_ok = validation_ok and compute_engine_ok
    
    # Aggregate all errors
    all_errors = list(validation.get("errors") or []) + list(compute_engine.get("errors") or [])
    
    return {
        "success": overall_ok,
        "validation_tables": validation,
        "compute_engine_tables": compute_engine,
        "errors": all_errors,
    }


def perform_create_search_tables(
    conn_params: Dict[str, Any],
    dw_id: Optional[int],
) -> Dict[str, Any]:
    """
    Ensure DW search tables exist (delegates to datawarehouse search_tables service).
    MySQL only; requires dw_id.
    """
    _require_mysql(conn_params)
    if dw_id is None:
        return {"success": False, "skipped": True, "reason": "dw_id required", "errors": []}

    from apps.datawarehouse.services.search_index.search_tables import ensure_search_tables

    return ensure_search_tables(dw_id)


# ---------------------------------------------------------------------------
# Default workflow seed (app DB)
# ---------------------------------------------------------------------------

DEFAULT_WORKFLOW_CODE_TEMPLATE = "DEFAULT_{dw_id}"
DEFAULT_WORKFLOW_NAME = "Default Workflow"


def default_workflow_code(dw_id: int) -> str:
    """Business code for the per-warehouse default workflow (globally unique)."""
    return DEFAULT_WORKFLOW_CODE_TEMPLATE.format(dw_id=dw_id)


def perform_ensure_default_workflow(
    dw_id: int,
    created_user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Ensure a baseline workflow exists for the warehouse in the app DB.

    Idempotent: skips when workflow_code=DEFAULT_{dw_id} already exists for this dw_id.
    Creates allow_review=0, constraint_data_entry=0, review_level_count=0, no levels,
    no workflow_dataentry_rule.
    """
    from datetime import datetime

    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import ReviewWorkflow, ReviewWorkflowI18n

    result: Dict[str, Any] = {
        "success": True,
        "skipped": False,
        "created": {},
        "errors": [],
    }
    workflow_code = default_workflow_code(dw_id)
    db = SessionLocal()
    try:
        existing = (
            db.query(ReviewWorkflow)
            .filter(
                ReviewWorkflow.workflow_code == workflow_code,
                ReviewWorkflow.dw_id == dw_id,
            )
            .first()
        )
        if existing:
            result["skipped"] = True
            result["workflow_id"] = existing.workflow_id
            result["workflow_code"] = workflow_code
            return result

        now = datetime.utcnow()
        workflow = ReviewWorkflow(
            workflow_code=workflow_code,
            dw_id=dw_id,
            review_scope_type="AREA",
            priority=1,
            is_active=True,
            is_system=True,
            allow_review=False,
            constraint_data_entry=False,
            review_level_count=0,
            created=now,
            created_user_id=created_user_id,
        )
        db.add(workflow)
        db.flush()
        db.add(
            ReviewWorkflowI18n(
                master_id=workflow.workflow_id,
                locale="en",
                workflow_name=DEFAULT_WORKFLOW_NAME,
                description=None,
            )
        )
        db.commit()
        result["created"] = {
            "workflow_id": workflow.workflow_id,
            "workflow_code": workflow_code,
        }
        return result
    except Exception as e:
        db.rollback()
        log_background_incident(
            f"perform_ensure_default_workflow failed for dw_id={dw_id}",
            error_code="ENSURE_DEFAULT_WORKFLOW_FAILED",
            exc=e,
            source="apps.app_db.services.dw_optimizer",
        )
        result["success"] = False
        result["errors"].append(str(e))
        return result
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Full optimize orchestration
# ---------------------------------------------------------------------------

# Maps result-dict keys to short abbreviations for db_version comments.
# Full comment e.g. "DFA optimize: normalize,pk,indexes,..." stays well under 255 chars.
_STEP_ABBREV: Dict[str, str] = {
    "normalize_table_and_column_names": "normalize",
    "ensure_primary_keys": "pk",
    "rebuild_indexes": "indexes",
    "seed_system_initial_defaults": "seed_defs",
    "validate_sync_new_columns": "sync_cols",
    "normalize_subgroup_display_orders": "sg_order",
    "validate_sync_new_tables": "sync_tbls",
    "create_search_tables": "search_tbls",
    "configuration_sync": "cfg_sync",
    "enforce_fk_referential_integrity": "fk",
    "ensure_default_subgroup": "def_sg",
    "sync_dw_stats_counts": "stats",
    "ensure_default_workflow": "def_wf",
}

_DB_VERSION_COMMENT_MAX = 255
_DB_VERSION_PREFIX = "DFA optimize: "


def _increment_version(version_str: Optional[str]) -> str:
    """Increment the last component of a dot-separated version string (e.g. '8.0.0.0' → '8.0.0.1')."""
    if not version_str:
        return DB_VERSION_DEFAULT
    try:
        parts = [int(p) for p in version_str.strip().split(".")]
        parts[-1] += 1
        return ".".join(str(p) for p in parts)
    except (ValueError, IndexError):
        return DB_VERSION_DEFAULT


def _record_optimize_db_version(result: Dict[str, Any], dw_id: Optional[int]) -> None:
    """
    Insert a db_version row summarising which optimize steps ran successfully.

    Version logic:
    - If no row with DB_VERSION_DEFAULT exists → insert with DB_VERSION_DEFAULT (initial bootstrap).
    - If DB_VERSION_DEFAULT already exists → find the latest row by version_nid and insert
      with the last component incremented (e.g. 8.0.0.0 → 8.0.0.1 → 8.0.0.2 ...).

    Only fires when dw_id is known and at least one step completed (not skipped, success=True).
    Errors are caught as warnings and never affect the overall optimize result.
    Sets result["db_version_entry"] for transparency.
    """
    if dw_id is None:
        result["db_version_entry"] = {"skipped": True, "reason": "dw_id required"}
        return

    ran = [
        _STEP_ABBREV[key]
        for key in _STEP_ABBREV
        if key in result
        and not result[key].get("skipped")
        and result[key].get("success") is True
    ]

    if not ran:
        result["db_version_entry"] = {"skipped": True, "reason": "no steps ran successfully"}
        return

    comment = _DB_VERSION_PREFIX + ",".join(ran)
    if len(comment) > _DB_VERSION_COMMENT_MAX:
        comment = comment[: _DB_VERSION_COMMENT_MAX - 1] + "…"

    today = date.today()
    version_change_date = f"{today.day} {today.strftime('%b %Y')}"

    try:
        from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
        from apps.datawarehouse.models.datawarehouse import DbVersion

        with get_warehouse_session_from_id(str(dw_id)) as dw_db:
            baseline = (
                dw_db.query(DbVersion)
                .filter(DbVersion.version_number == DB_VERSION_DEFAULT)
                .first()
            )
            if baseline is None:
                # First-time: no 8.0.0.0 row yet — seed the baseline version
                next_version = DB_VERSION_DEFAULT
            else:
                # Already bootstrapped: increment from the highest existing row
                latest = (
                    dw_db.query(DbVersion)
                    .order_by(DbVersion.version_nid.desc())
                    .first()
                )
                next_version = _increment_version(
                    latest.version_number if latest else DB_VERSION_DEFAULT
                )

            dw_db.add(DbVersion(
                version_number=next_version,
                version_change_date=version_change_date,
                version_comments=comment,
            ))
        result["db_version_entry"] = {"inserted": True, "version": next_version}
    except Exception as e:
        msg = f"db_version audit entry failed: {e}"
        logger.warning("_record_optimize_db_version: %s", msg)
        result["db_version_entry"] = {"skipped": True, "reason": msg}


def perform_full_optimize(
    conn_params: Optional[Dict[str, Any]] = None,
    dw_id: Optional[int] = None,
    # ---- Mandatory steps (all default True) ----
    do_normalize_table_and_column_names: bool = True,
    do_ensure_primary_keys: bool = True,
    do_rebuild_indexes: bool = True,
    rebuild_indexes_after_reset: bool = True,
    do_seed_system_initial_defaults: bool = True,
    do_validate_sync_new_columns: bool = True,
    do_validate_sync_new_tables: bool = True,
    do_normalize_subgroup_display_orders: bool = False,
    # ---- Optional steps (default False) --------
    do_enforce_fk_referential_integrity: bool = True,
    do_ensure_default_subgroup: bool = False,
    do_sync_dw_stats_counts: bool = True,
    do_configuration_sync: bool = False,
    do_create_search_tables: bool = True,
    do_ensure_default_workflow: bool = False,
    default_workflow_created_user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run the full optimize flow in execution order.

    Caller input (no mandatory boolean flags): pass ``conn_params`` or ``dw_id``. All ``do_*`` arguments and
    ``rebuild_indexes_after_reset`` are optional keywords with defaults for a full pipeline run. When this
    is invoked from POST /dw/{dw_id}/optimize, the router may omit the body (full optimize) or pass explicit
    booleans for a selective run; the REST layer never requires any body field.

    Steps (labels match OpenAPI body fields):

    Step 1  normalize_table_and_column_names        [Mandatory] Rename all table/column names to lowercase.
                                              Also internally runs seed_system_initial_defaults.
    Step 2  ensure_primary_keys              [Mandatory] For every table: if AUTO_INCREMENT col has no
                                              PK, add it; if no PK at all, promote first integer col
                                              to NOT NULL AUTO_INCREMENT PRIMARY KEY; if single-integer
                                              PK exists without AUTO_INCREMENT, add AUTO_INCREMENT.
    Step 3  rebuild_indexes                  [Mandatory] Apply full DI7 index set (dw_index_specs).
                                              rebuild_indexes_after_reset=True (default): drop all
                                              non-primary unique indexes first, then re-apply (clean slate).
                                              rebuild_indexes_after_reset=False: add missing indexes only.
    Step 4  seed_system_initial_defaults                 [Mandatory] Seed default rows into: db_version (7.0.0.2),
                                              db_available_databases, ut_language, ut_dbmetadata_<lang>.
                                              Skipped automatically when normalize_table_and_column_names runs
                                              (it calls this step internally).
    Step 5  validate_sync_new_columns        [Mandatory] Additive column migrations — currently ensures
                                              is_system on ut_subgroup_vals_<locale>, ut_subgroup_type_<locale>,
                                              ut_subgroup_<locale>; unit_format on ut_unit_<locale>.
    Step 5b normalize_subgroup_display_orders [Optional] Dense-renumber subgroup_type_order, subgroup_order
                                              (per subgroup_type), subgroup_val_order across all locale tables.
    Step 6  validate_sync_new_tables         [Mandatory] CREATE TABLE IF NOT EXISTS for new table groups —
                                              validation tables: iu_validation, iu_validation_enum, iu_validation_enum_i18n
                                              compute engine tables: ce_ius_compute_add_targets, ce_ius_compute_add_sources,
                                              ce_ius_compute_divs, ce_ius_compute_minus, ce_ius_compute_times,
                                              ce_ius_compute_areas, ce_process_master, ce_process_time, ce_process_time_logs.
    Step 6b configuration_sync               [Optional]  Create db_configuration; insert missing rows from
                                              Settings (.env) with system_configuration / env fallbacks;
                                              skipped if step 6 ran and failed.
    Step 7  enforce_fk_referential_integrity [Optional]  Convert ut_timeperiod, ut_indicator_unit_subgroup,
                                              ut_data, ut_ic_ius to InnoDB and add FK constraints between them.
    Step 8  ensure_default_subgroup          [Optional]  Ensure default subgroup structure (OTHERS/TOTAL types,
                                              category value, combination, junction). Reuses existing GIDs,
                                              promotes is_system=1; Path A when default-locale val exists else
                                              Path B full create. Config from db_configuration / system_configuration / env.
    Step 9  sync_dw_stats_counts             [Optional]  Read indicator/area/time-period/source/data counts
                                              from the DW and write them to system_datawarehouse in the app DB.
    Step 10 ensure_default_workflow         [Optional]  Seed DEFAULT_{dw_id} workflow in app DB when missing
                                              (allow_review=0, constraint_data_entry=0, no levels/rules).

    Provide either conn_params or dw_id (resolves connection from system_datawarehouse).
    Returns dict with success and optional message; on failure success=False and message is set.
    """
    if conn_params is None and dw_id is not None:
        conn_params = _get_connection_params_from_dw_id(dw_id)
    if not conn_params:
        return {"success": False, "message": "Missing conn_params or invalid dw_id"}

    try:
        _require_mysql(conn_params)
    except NotImplementedError as e:
        return {"success": False, "message": str(e)}

    result: Dict[str, Any] = {
        "success": True,
        "normalize_table_and_column_names": {},
        "ensure_primary_keys": {},
        "rebuild_indexes": {},
        "seed_system_initial_defaults": {},
        "validate_sync_new_columns": {},
        "validate_sync_new_tables": {},
        "normalize_subgroup_display_orders": {},
        "enforce_fk_referential_integrity": {},
        "ensure_default_subgroup": {},
        "sync_dw_stats_counts": {},
        "configuration_sync": {},
        "create_search_tables": {},
        "ensure_default_workflow": {},
    }
    try:
        # Step 1: normalize_table_and_column_names (internally also runs seed_system_initial_defaults)
        if do_normalize_table_and_column_names:
            result["normalize_table_and_column_names"] = perform_lowercase(conn_params)
            if do_seed_system_initial_defaults:
                result["seed_system_initial_defaults"] = {"success": True, "covered_by": "normalize_table_and_column_names"}

        # Step 2: ensure_primary_keys — must run before indexes so PK-backed unique constraints are clean
        if do_ensure_primary_keys:
            result["ensure_primary_keys"] = perform_ensure_primary_keys(conn_params)
            if not result["ensure_primary_keys"].get("success"):
                result["success"] = False
                result["message"] = "; ".join(result["ensure_primary_keys"].get("errors", ["Primary keys step failed"]))

        # Step 3: rebuild_indexes
        if do_rebuild_indexes:
            result["rebuild_indexes"] = perform_set_indexes(conn_params, clear_first=rebuild_indexes_after_reset)
            if result["rebuild_indexes"].get("success") is False:
                result["success"] = False
                result["message"] = result["rebuild_indexes"].get("message", "Index rebuild failed")
                return result

        # Step 4: seed_system_initial_defaults (only if normalize_table_and_column_names did not already cover it)
        if do_seed_system_initial_defaults and not do_normalize_table_and_column_names:
            result["seed_system_initial_defaults"] = perform_housekeeping(conn_params)

        # Step 5: validate_sync_new_columns
        if do_validate_sync_new_columns:
            result["validate_sync_new_columns"] = perform_validate_sync_new_columns(conn_params)
            if not result["validate_sync_new_columns"].get("success"):
                result["success"] = False
                result["message"] = "; ".join(
                    result["validate_sync_new_columns"].get("errors", ["Column sync step failed"])
                )
        else:
            result["validate_sync_new_columns"] = {"success": True, "skipped": True}

        # Step 5b: normalize subgroup display orders (optional; ORM / data mutation)
        if do_normalize_subgroup_display_orders and dw_id is not None:
            from apps.datawarehouse.services.subgroup_order_normalize import (
                normalize_subgroup_display_orders,
            )

            try:
                norm = normalize_subgroup_display_orders(str(dw_id))
                result["normalize_subgroup_display_orders"] = norm
                if not norm.get("success"):
                    result["success"] = False
                    result["message"] = norm.get("message", "normalize_subgroup_display_orders failed")
            except Exception as e:
                log_background_incident(
                    "normalize_subgroup_display_orders step failed",
                    error_code="NORMALIZE_SUBGROUP_DISPLAY_ORDERS_FAILED",
                    exc=e,
                    source="apps.app_db.services.dw_optimizer",
                )
                result["normalize_subgroup_display_orders"] = {
                    "success": False,
                    "message": str(e),
                    "errors": [str(e)],
                }
                result["success"] = False
                result["message"] = str(e)
        else:
            skip_norm: Dict[str, Any] = {"skipped": True}
            if do_normalize_subgroup_display_orders and dw_id is None:
                skip_norm["reason"] = "dw_id required"
            result["normalize_subgroup_display_orders"] = skip_norm

        # Step 6: validate_sync_new_tables
        if do_validate_sync_new_tables:
            result["validate_sync_new_tables"] = perform_ensure_new_tables(conn_params)
            if not result["validate_sync_new_tables"].get("success"):
                result["success"] = False
                result["message"] = "; ".join(result["validate_sync_new_tables"].get("errors", ["Table sync step failed"]))
        else:
            result["validate_sync_new_tables"] = {"skipped": True}

        # Step 6a: create_search_tables (optional; shared with search/sync phase 1)
        if do_create_search_tables and dw_id is not None:
            result["create_search_tables"] = perform_create_search_tables(conn_params, dw_id)
            if not result["create_search_tables"].get("success"):
                result["success"] = False
                result["message"] = result["create_search_tables"].get(
                    "message", "create_search_tables failed"
                )
        else:
            search_skipped: Dict[str, Any] = {"skipped": True}
            if do_create_search_tables and dw_id is None:
                search_skipped["reason"] = "dw_id required"
            result["create_search_tables"] = search_skipped

        # Step 6b: configuration_sync (optional; skip if validate_sync_new_tables ran and failed)
        vt = result.get("validate_sync_new_tables") or {}
        table_step_failed = (
            do_validate_sync_new_tables
            and not vt.get("skipped")
            and vt.get("success") is False
        )
        if do_configuration_sync and dw_id is not None and not table_step_failed:
            result["configuration_sync"] = perform_sync_ut_dw_configs(conn_params, dw_id)
            if not result["configuration_sync"].get("success"):
                result["success"] = False
                result["message"] = "; ".join(
                    result["configuration_sync"].get("errors", ["configuration_sync failed"])
                )
        else:
            sync_skipped: Dict[str, Any] = {"skipped": True}
            if do_configuration_sync and dw_id is None:
                sync_skipped["reason"] = "dw_id required"
            elif do_configuration_sync and table_step_failed:
                sync_skipped["reason"] = "validate_sync_new_tables failed"
            result["configuration_sync"] = sync_skipped

        # Step 7: enforce_fk_referential_integrity
        if do_enforce_fk_referential_integrity:
            result["enforce_fk_referential_integrity"] = perform_add_foreign_keys(conn_params)
            if not result["enforce_fk_referential_integrity"].get("success"):
                result["success"] = False
                result["message"] = "; ".join(
                    result["enforce_fk_referential_integrity"].get("errors", ["FK integrity step failed"])
                )

        # Step 8: ensure_default_subgroup (optional, 2nd last)
        if do_ensure_default_subgroup and dw_id is not None:
            result["ensure_default_subgroup"] = perform_ensure_default_subgroup_from_config(conn_params, dw_id)
            if not result["ensure_default_subgroup"].get("success"):
                result["success"] = False
                result["message"] = "; ".join(
                    result["ensure_default_subgroup"].get("errors", ["Default subgroup step failed"])
                )
        else:
            result["ensure_default_subgroup"] = {"skipped": True}

        # Step 9: sync_dw_stats_counts
        if do_sync_dw_stats_counts and dw_id is not None:
            result["sync_dw_stats_counts"] = sync_metadata_to_app(dw_id)
            if not result["sync_dw_stats_counts"].get("success"):
                result["success"] = False
                result["message"] = result["sync_dw_stats_counts"].get("message", "Stats sync failed")
        else:
            result["sync_dw_stats_counts"] = {"skipped": True}

        # Step 10: ensure_default_workflow (optional; app DB)
        if do_ensure_default_workflow and dw_id is not None:
            result["ensure_default_workflow"] = perform_ensure_default_workflow(
                dw_id,
                created_user_id=default_workflow_created_user_id,
            )
            if not result["ensure_default_workflow"].get("success"):
                result["success"] = False
                result["message"] = "; ".join(
                    result["ensure_default_workflow"].get("errors", ["Default workflow step failed"])
                )
        else:
            skip_wf: Dict[str, Any] = {"skipped": True}
            if do_ensure_default_workflow and dw_id is None:
                skip_wf["reason"] = "dw_id required"
            result["ensure_default_workflow"] = skip_wf

        # Audit: insert a db_version row summarising which steps actually ran.
        # Only written when dw_id is known and at least one step completed (not skipped).
        _record_optimize_db_version(result, dw_id)

    except Exception as e:
        from apps.shared.exceptions import AppException

        if isinstance(e, AppException):
            raise
        log_background_incident(
            "perform_full_optimize failed",
            error_code="PERFORM_FULL_OPTIMIZE_FAILED",
            exc=e,
            source="apps.app_db.services.dw_optimizer",
        )
        result["success"] = False
        result["message"] = str(e)
    return result
