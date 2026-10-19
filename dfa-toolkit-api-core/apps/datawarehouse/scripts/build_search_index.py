"""
Populate DW search tables (search_keywords, search_keyword_synonym, search_keyword_ngram)
from UT tables (ut_indicator_*, ut_area_*, ut_subgroup_vals_*, ut_timeperiod, etc.).

Search tables must already exist (create via warehouse creation API or
apps.datawarehouse.scripts.create_search_tables).

Usage:
    python -m apps.datawarehouse.scripts.build_search_index --url "mysql+mysqlconnector://user:pass@host:3306/db"
    python -m apps.datawarehouse.scripts.build_search_index --dw-id 1

Options:
    --url        SQLAlchemy database URL (required if not using --dw-id).
    --dw-id      Data warehouse identifier: system_datawarehouse id or database name.
    --batch-size Batch size for upserts (default 1000).
    --no-commit  Do not commit; caller manages transactions.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from apps.datawarehouse.services.search_index.search_index_builder import SearchIndexBuilderService
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Populate DW search tables from UT tables.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="SQLAlchemy URL (e.g. mysql+mysqlconnector://user:pass@host:3306/db)")
    group.add_argument("--dw-id", help="Data warehouse ID or database name (from system_datawarehouse)")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--no-commit", action="store_true", help="Do not commit; caller manages transactions.")
    args = parser.parse_args()

    commit = not args.no_commit
    svc = SearchIndexBuilderService()

    try:
        if args.dw_id:
            with get_warehouse_session_from_id(args.dw_id) as dw_db:
                result = svc.build(dw_db, batch_size=args.batch_size, commit=commit)
        else:
            engine = create_engine(args.url, pool_pre_ping=True)
            SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
            with SessionLocal() as dw_db:
                try:
                    result = svc.build(dw_db, batch_size=args.batch_size, commit=commit)
                except Exception:
                    dw_db.rollback()
                    raise
        print(result)
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
