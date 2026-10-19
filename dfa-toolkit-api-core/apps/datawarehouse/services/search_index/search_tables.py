"""
Ensure DW search tables exist (search_keywords, search_keyword_synonym, search_keyword_ngram).

Shared by search/sync background jobs, optimize (create_search_tables step), and CLI scripts.
"""
from __future__ import annotations

import logging
from typing import Any, Union

from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.app_db.schemas.core import DatabaseConnectionSchema, DatabaseSource
from apps.datawarehouse.db.datawarehouse import (
    credentials_to_schema,
    get_warehouse_credentials,
    get_warehouse_session_from_id,
)
from apps.datawarehouse.utils.search_schema import get_search_schema_statements
from apps.shared.utils.database_connection import execute_sql_statements
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)

_SOURCE = "apps.datawarehouse.services.search_index.search_tables"

SEARCH_PROBE_TABLE = "search_keywords"
SEARCH_TABLE_NAMES = (
    "search_keywords",
    "search_keyword_synonym",
    "search_keyword_ngram",
)


def search_tables_exist(dw_db: Session) -> bool:
    """Return True when the canonical search_keywords table exists in the current database."""
    row = dw_db.execute(
        text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = :table_name"
        ),
        {"table_name": SEARCH_PROBE_TABLE},
    ).scalar()
    return bool(row and row > 0)


def apply_search_schema_ddl(schema: DatabaseConnectionSchema) -> int:
    """
    Execute CREATE TABLE IF NOT EXISTS statements for all search tables.
    Returns the number of statements executed.
    """
    statements = get_search_schema_statements(schema.db_source)
    return execute_sql_statements(
        schema.db_source,
        schema.db_host,
        schema.db_port,
        schema.db_login,
        schema.db_password,
        schema.db_database,
        statements,
    )


def ensure_search_tables(dw_id: Union[str, int]) -> dict[str, Any]:
    """
    Check whether search tables exist; create them if missing (same logic as search/sync phase 1).

    Returns:
        success, dw_id, tables_created, statements_executed (when DDL ran), tables, errors
    """
    dw_key = str(dw_id)
    result: dict[str, Any] = {
        "success": True,
        "dw_id": dw_key,
        "tables_created": False,
        "statements_executed": 0,
        "tables": list(SEARCH_TABLE_NAMES),
        "errors": [],
    }
    try:
        credentials = get_warehouse_credentials(dw_key)
        schema = credentials_to_schema(credentials)

        with get_warehouse_session_from_id(dw_key) as dw_db:
            exists = search_tables_exist(dw_db)

        if exists:
            logger.info("Search tables already exist for dw_id=%s — skipping DDL", dw_key)
            return result

        logger.info("Search tables missing for dw_id=%s — creating schema", dw_key)
        executed = apply_search_schema_ddl(schema)
        result["tables_created"] = True
        result["statements_executed"] = executed
        logger.info("Search tables created for dw_id=%s (%s statements)", dw_key, executed)
        return result
    except Exception as e:
        log_background_incident(
            "ensure_search_tables failed",
            error_code="ENSURE_SEARCH_TABLES_FAILED",
            exc=e,
            source=_SOURCE,
        )
        result["success"] = False
        result["message"] = str(e)
        result["errors"] = [str(e)]
        return result
