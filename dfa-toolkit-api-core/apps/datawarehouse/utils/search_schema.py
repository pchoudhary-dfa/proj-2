"""
Helpers for loading and preparing the search tables DDL.
Used by the create_search_tables script (datawarehouse app only).
"""
from pathlib import Path

from apps.app_db.schemas.core import DatabaseSource
from apps.shared.utils.sql_adapter import adapt_mysql_to_postgresql, split_sql_statements


def _search_schema_file() -> Path:
    """Path to the MySQL search schema file (apps/app_db/SQL/schema_search_mysql.sql)."""
    apps_dir = Path(__file__).resolve().parent.parent.parent
    return apps_dir / "app_db" / "SQL" / "schema_search_mysql.sql"


def get_search_schema_sql() -> str:
    """
    Load and return the raw search DDL string (MySQL format).

    Returns:
        Content of schema_search_mysql.sql.

    Raises:
        FileNotFoundError: If the schema file is missing.
    """
    path = _search_schema_file()
    if not path.is_file():
        raise FileNotFoundError(f"Search schema file not found: {path}")
    return path.read_text(encoding="utf-8")


def get_search_schema_statements(db_source: DatabaseSource) -> list[str]:
    """
    Return prepared SQL statements for the search tables (MySQL or PG-adapted).

    Args:
        db_source: Target database type.

    Returns:
        List of CREATE TABLE (and related) statements ready for execution.
    """
    sql = get_search_schema_sql()
    if db_source == DatabaseSource.POSTGRESQL:
        sql = adapt_mysql_to_postgresql(sql)
    statements = split_sql_statements(sql)
    return [s for s in statements if s.strip() and not s.strip().startswith("--")]
