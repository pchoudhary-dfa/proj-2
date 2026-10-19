"""
Create the three search tables (search_keywords, search_keyword_synonym, search_keyword_ngram)
in a given database. Idempotent (CREATE TABLE IF NOT EXISTS).

Usage:
    python -m apps.datawarehouse.scripts.create_search_tables --url "mysql+mysqlconnector://user:pass@host:3306/db"
    python -m apps.datawarehouse.scripts.create_search_tables --dw-id 1
    python -m apps.datawarehouse.scripts.create_search_tables --dw-id my_warehouse_db

Options:
    --url     SQLAlchemy database URL (mysql+mysqlconnector://... or postgresql+psycopg2://...).
    --dw-id   Data warehouse identifier: system_datawarehouse id or database name (looks up credentials).

One of --url or --dw-id is required.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Project root on path so app packages resolve
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from fastapi import HTTPException
from apps.app_db.schemas.core import DatabaseConnectionSchema, DatabaseSource
from apps.datawarehouse.services.search_index.search_tables import (
    apply_search_schema_ddl,
    ensure_search_tables,
)


def _db_source_from_url(url: str) -> DatabaseSource:
    if "mysql" in url.split(":")[0].lower():
        return DatabaseSource.MYSQL
    if "postgresql" in url.split(":")[0].lower():
        return DatabaseSource.POSTGRESQL
    raise ValueError(f"Cannot infer database type from URL (use mysql+... or postgresql+...): {url[:50]}...")


def _schema_from_url(url: str) -> DatabaseConnectionSchema:
    """Build a minimal connection schema from a SQLAlchemy URL (for apply_search_schema_ddl)."""
    from sqlalchemy.engine import make_url

    u = make_url(url)
    driver = (u.drivername or "").lower()
    if "mysql" in driver:
        db_source = DatabaseSource.MYSQL
        default_port = 3306
    elif "postgresql" in driver:
        db_source = DatabaseSource.POSTGRESQL
        default_port = 5432
    else:
        raise ValueError(f"Unsupported driver in URL: {u.drivername}")
    return DatabaseConnectionSchema(
        db_source=db_source,
        db_host=u.host or "localhost",
        db_port=int(u.port or default_port),
        db_login=u.username or "",
        db_password=u.password or "",
        db_database=u.database or "",
    )


def run_with_url(url: str) -> int:
    """Execute search DDL using a SQLAlchemy engine (from URL). Returns number of statements executed."""
    schema = _schema_from_url(url)
    return apply_search_schema_ddl(schema)


def run_with_dw_id(dw_id: str) -> int:
    """Ensure search tables via shared service. Returns statements_executed (0 if already existed)."""
    result = ensure_search_tables(dw_id)
    if not result.get("success"):
        raise RuntimeError(result.get("message") or "ensure_search_tables failed")
    return int(result.get("statements_executed") or 0)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create search tables (search_keywords, search_keyword_synonym, search_keyword_ngram) in a database.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="SQLAlchemy URL (e.g. mysql+mysqlconnector://user:pass@host:3306/db)")
    group.add_argument("--dw-id", help="Data warehouse ID or database name (from system_datawarehouse)")
    args = parser.parse_args()

    try:
        if args.url:
            executed = run_with_url(args.url)
        else:
            executed = run_with_dw_id(args.dw_id)
        print(f"Search tables created/ensured: {executed} statements executed.")
        return 0
    except HTTPException as e:
        print(f"Error: {e.detail}", file=sys.stderr)
        return 1
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
