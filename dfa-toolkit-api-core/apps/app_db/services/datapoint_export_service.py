"""
Service layer for parallel XLSX data-point export.

Responsibilities:
  - Count matching rows to check against the hard cap.
  - Split the ID range into N balanced slices (one per worker).
  - Decide the export path (dataset_fast / ut_baseline).
  - Pre-flight helpers that each open their own DB session so they can run
    safely in separate threads (ThreadPoolExecutor in workflow.py).

Export paths:
  * dataset_fast   — dataset_id is supplied; counts/slices DatasetDataPoint.data_point_id
  * ut_baseline    — no dataset; counts/slices ut_data.data_nid (all published data)

The actual XLSX generation lives in
``apps/datawarehouse/utils/xlsx_export_worker.py`` and runs in worker
processes.  This module is the main-process coordinator.
"""
from __future__ import annotations

import logging
import math
import os
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.app_db.models.core import DatasetDataPoint
from apps.shared.config.config import settings
from apps.shared.exceptions import BadRequest

logger = logging.getLogger(__name__)



# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def check_export_row_count(
    db: Session,
    *,
    dataset_id: Optional[int],
    review_status_filter: Optional[str],
    iusnids: Optional[list[int]],
    area_nids: Optional[list[int]],
    timeperiod_nids: Optional[list[int]],
    dw_id: int,
) -> int:
    """
    Count matching dataset_data_point rows and raise BadRequest if over the cap.
    Returns the count on success.

    This runs in the main FastAPI process before dispatching workers so we
    can return a clean error without spawning subprocesses.
    """
    if dataset_id is None:
        # ut_baseline path: we cannot easily count without a warehouse session here.
        # Allow through — workers will self-limit via their ID slices.
        return 0

    tbl = DatasetDataPoint.__table__
    stmt = select(func.count()).select_from(tbl).where(
        tbl.c.dataset_id == dataset_id,
        tbl.c.is_deleted.is_(False),
    )
    if review_status_filter:
        stmt = stmt.where(tbl.c.review_status == review_status_filter)
    if iusnids:
        stmt = stmt.where(tbl.c.iusnid.in_(iusnids))
    if area_nids:
        stmt = stmt.where(tbl.c.area_nid.in_(area_nids))
    if timeperiod_nids:
        stmt = stmt.where(tbl.c.timeperiod_nid.in_(timeperiod_nids))

    total: int = db.execute(stmt).scalar_one()

    max_rows = settings.DATA_POINTS_SYNC_EXPORT_MAX_ROWS
    if total > max_rows:
        raise BadRequest(
            f"Export too large: {total:,} rows exceeds the maximum of "
            f"{max_rows:,}. Narrow with filters (iusnid, area_nid, "
            "timeperiod_nid) and retry."
        )
    return total


def get_export_id_ranges(
    db: Session,
    *,
    dataset_id: Optional[int],
    review_status_filter: Optional[str],
    iusnids: Optional[list[int]],
    area_nids: Optional[list[int]],
    timeperiod_nids: Optional[list[int]],
    total_count: int = 0,
) -> list[tuple[int, int]]:
    """
    Split matching data_point_id values into (start_exclusive, end_inclusive)
    ranges — one range per worker process.

    The number of parts is driven by the pool size so that every available
    worker gets exactly one job:

        n_parts = min(EXPORT_POOL_SIZE, total_count // MIN_ROWS_PER_PART)

    This guarantees:
      • All pool workers are kept busy on large exports.
      • Small exports (< MIN_ROWS_PER_PART rows) produce a single file.
      • Tiny datasets never generate many near-empty XLSX files.

    Boundary IDs are selected from the DB with an offset-based strategy:
      SELECT data_point_id ... ORDER BY data_point_id LIMIT 1 OFFSET i*rows_per_part

    Returns a list of (start_exclusive, end_inclusive) tuples that cover
    every matching row without overlap or gaps.
    """
    # Minimum rows per XLSX file — prevents many near-empty files on small exports.
    _MIN_ROWS_PER_PART = 10_000

    if dataset_id is None or total_count == 0:
        return [(0, 2_147_483_647)]

    pool_size = int(os.getenv("EXPORT_POOL_SIZE", "1"))
    pool_size = max(1, pool_size)

    # Cap n_parts so each part has at least MIN_ROWS_PER_PART rows.
    max_parts_by_size = max(1, total_count // _MIN_ROWS_PER_PART)
    n_parts = max(1, min(pool_size, max_parts_by_size))

    rows_per_part = math.ceil(total_count / n_parts)

    tbl = DatasetDataPoint.__table__

    base_stmt = select(tbl.c.data_point_id).where(
        tbl.c.dataset_id == dataset_id,
        tbl.c.is_deleted.is_(False),
    )
    if review_status_filter:
        base_stmt = base_stmt.where(tbl.c.review_status == review_status_filter)
    if iusnids:
        base_stmt = base_stmt.where(tbl.c.iusnid.in_(iusnids))
    if area_nids:
        base_stmt = base_stmt.where(tbl.c.area_nid.in_(area_nids))
    if timeperiod_nids:
        base_stmt = base_stmt.where(tbl.c.timeperiod_nid.in_(timeperiod_nids))
    base_stmt = base_stmt.order_by(tbl.c.data_point_id.asc())

    # Collect boundary IDs at offsets 0, rows_per_part, 2*rows_per_part …
    boundaries: list[int] = []
    for i in range(n_parts):
        offset = i * rows_per_part
        row = db.execute(base_stmt.offset(offset).limit(1)).scalar_one_or_none()
        if row is None:
            break
        boundaries.append(row)

    if not boundaries:
        return [(0, 2_147_483_647)]

    # Build (start_exclusive, end_inclusive) ranges.
    # The last range extends to INT max so no row is ever missed.
    ranges: list[tuple[int, int]] = []
    for i, start_id in enumerate(boundaries):
        end_id = boundaries[i + 1] - 1 if (i + 1) < len(boundaries) else 2_147_483_647
        ranges.append((start_id - 1, end_id))

    return ranges


def resolve_export_path(dataset_id: Optional[int]) -> str:
    """
    Pick the appropriate fetch strategy for this export.

    * dataset_fast  — dataset supplied; rows come from dataset_data_point (fast path).
    * ut_baseline   — no dataset; rows come from ut_data (warehouse scan).
    """
    if dataset_id is not None:
        return "dataset_fast"
    return "ut_baseline"


# ---------------------------------------------------------------------------
# Thread-safe preflight helpers
# ---------------------------------------------------------------------------
# Each function below creates its own DB session (or delegates to a service
# that does so internally).  This makes them safe to call concurrently from
# ThreadPoolExecutor without sharing the FastAPI-injected session.
# ---------------------------------------------------------------------------

def preflight_app_db(
    *,
    dataset_id: Optional[int],
    dw_id: int,
    review_status_filter: Optional[str],
    iusnids: Optional[list[int]],
    area_nids: Optional[list[int]],
    timeperiod_nids: Optional[list[int]],
    language_code: str,
    n_export_cols: int,
) -> tuple[int, Optional[list[list[Any]]]]:
    """
    Thread-safe preflight: count rows + build XLSX preamble rows.

    Opens its own ``SessionLocal`` so it can run concurrently with other
    preflight tasks without touching the FastAPI-injected session.

    Returns ``(total_count, preamble_rows)``.
    Raises ``BadRequest`` if ``total_count > settings.DATA_POINTS_SYNC_EXPORT_MAX_ROWS``.
    """
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import Dataset
    from apps.app_db.services import dataset_service as _ds_svc
    from apps.datawarehouse.utils.export_utils import translate_header

    _db = SessionLocal()
    try:
        total_count = check_export_row_count(
            _db,
            dataset_id=dataset_id,
            review_status_filter=review_status_filter,
            iusnids=iusnids,
            area_nids=area_nids,
            timeperiod_nids=timeperiod_nids,
            dw_id=dw_id,
        )

        preamble_rows: Optional[list[list[Any]]] = None
        if dataset_id is not None:
            ds_row = (
                _db.query(Dataset)
                .filter(Dataset.dataset_id == dataset_id)
                .first()
            )
            if ds_row:
                ds_display = ds_row.dataset_name or ""
                wf_display = ""
                if ds_row.workflow_id is not None:
                    wf_display = (
                        _ds_svc.get_workflow_display_name(
                            _db, ds_row.workflow_id, language_code
                        )
                        or ""
                    )

                def _pad(label: str, value: str) -> list[Any]:
                    out: list[Any] = [label, value]
                    out.extend([""] * (n_export_cols - len(out)))
                    return out[:n_export_cols]

                ds_status_display = (ds_row.dataset_status or "").strip()
                preamble_rows = [
                    _pad(translate_header("dp_export_workflow", language_code), wf_display),
                    _pad(translate_header("dp_export_dataset", language_code), ds_display),
                    _pad(translate_header("dp_export_dataset_status", language_code), ds_status_display),
                ]

        return total_count, preamble_rows
    finally:
        _db.close()


def preflight_sources(dw_id: int, language_code: str) -> dict[int, str]:
    """
    Thread-safe preflight: build ``{ic_nid: source_name}`` lookup.

    ``SourceService.list_sources`` opens its own warehouse session internally,
    so this is safe to call from a thread.
    """
    from apps.datawarehouse.services.source import SourceService

    src_svc = SourceService()
    all_sources, _, _ = src_svc.list_sources(
        str(dw_id),
        page=1,
        page_size=None,
        language_code=language_code,
        sort_order="asc",
        sort_field="ic_nid",
    )
    return {
        int(s["ic_nid"]): (s.get("ic_name") or "").strip()
        for s in all_sources
        if s.get("ic_nid") is not None
    }


def preflight_credentials(dw_id: int) -> str:
    """
    Thread-safe preflight: return the warehouse display name.

    ``get_warehouse_credentials`` creates its own ``SessionLocal`` internally,
    so this is safe to call from a thread.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_credentials

    cred = get_warehouse_credentials(str(dw_id))
    return cred.get("dw_connection_name") or cred.get("db_database") or str(dw_id)
