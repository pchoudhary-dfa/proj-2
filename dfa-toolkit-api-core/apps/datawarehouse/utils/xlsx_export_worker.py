"""
Subprocess worker for parallel XLSX export.

This module MUST have no module-level side effects (no DB calls, no network,
no global state mutations). It is imported by each spawned worker process on
Windows (spawn start method) and by fork-based workers on Linux/macOS.

Each worker:
  - Opens its own SQLAlchemy session for the app DB and the data warehouse DB.
  - Uses SQLAlchemy Core selects (result.mappings()) to avoid ORM object
    overhead at scale.
  - Streams batches directly to openpyxl write_only sheets (no full-slice buffer).
  - Skips warehouse enrichment when dataset_data_point denormalized labels exist.
  - Writes an openpyxl write_only XLSX to a temp file.
  - Returns the temp file path to the main process.

Only primitives, plain dicts, and lists are exchanged between processes —
no SQLAlchemy sessions, engines, or ORM models cross process boundaries.
"""
from __future__ import annotations

import logging
import os
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Generator, Optional

logger = logging.getLogger(__name__)

# Inner chunk size when the worker paginates its own ID slice.
_WORKER_INNER_CHUNK = 10_000

# Explicit Core columns for dataset_data_point (avoids wide select(tbl)).
_DATASET_EXPORT_COLUMNS = (
    "data_point_id",
    "dataset_id",
    "iusnid",
    "indicator_nid",
    "unit_nid",
    "subgroup_val_nid",
    "area_nid",
    "timeperiod_nid",
    "source_nid",
    "indicator_name",
    "unit_name",
    "subgroup_name",
    "area_name",
    "timeperiod_name",
    "source_name",
    "data_value",
    "textual_data_value",
    "istextualdata",
    "footnote_text",
    "review_status",
)


# ---------------------------------------------------------------------------
# Worker argument dataclass — must be fully picklable
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class XlsxWorkerArgs:
    """
    All parameters needed by a single worker process.

    Fields are primitives / plain collections — fully picklable.
    No SQLAlchemy objects, no session handles, no engine references.
    """
    dw_id: int
    locale: str
    part_index: int

    # Which data path to use (see datapoint_export_service.resolve_export_path)
    export_path: str  # "dataset_fast" | "dataset_scoped" | "ut_baseline"

    # Filter context (resolved NIDs — no string identifiers)
    dataset_id: Optional[int]
    review_status_filter: Optional[str]
    iusnids: Optional[list[int]]
    area_nids: Optional[list[int]]
    timeperiod_nids: Optional[list[int]]

    # ID slice for this worker (keyset-based; both inclusive)
    start_id: int   # exclusive lower bound (id > start_id)
    end_id: int     # inclusive upper bound (id <= end_id)

    source_nid_to_name: dict[int, str] = field(default_factory=dict)
    headers: list[str] = field(default_factory=list)
    preamble_rows: Optional[list[list[Any]]] = None
    tmp_file_path: str = ""
    chunk_size: int = _WORKER_INNER_CHUNK


# ---------------------------------------------------------------------------
# Main worker function — called by ProcessPoolExecutor in a subprocess
# ---------------------------------------------------------------------------

def worker_generate_xlsx_chunk(args: XlsxWorkerArgs) -> str:
    """
    Generate one XLSX file covering args.start_id < id <= args.end_id.

    Streams rows batch-by-batch into a write_only workbook and returns the
    temp file path. Raises on any failure.
    """
    t_start = time.perf_counter()

    from apps.app_db.db.core import SessionLocal
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id

    from openpyxl import Workbook
    from openpyxl.cell import WriteOnlyCell
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    ncol = len(args.headers)

    # Fixed column widths matching content type for each DATA_POINT_COLUMN_DEFS position
    _COL_WIDTHS = [55, 30, 30, 15, 15, 35, 40, 15, 18]

    def _pad(row: list[Any]) -> list[Any]:
        if len(row) >= ncol:
            return list(row[:ncol])
        return list(row) + [""] * (ncol - len(row))

    wb = Workbook(write_only=True)
    sheet_title = f"Part {args.part_index + 1}"
    ws = wb.create_sheet(title=sheet_title[:31])

    for i, width in enumerate(_COL_WIDTHS[:ncol]):
        ws.column_dimensions[get_column_letter(i + 1)].width = width

    bold = Font(bold=True)

    if args.preamble_rows:
        for prow in args.preamble_rows:
            padded = _pad(list(prow))
            row_cells = []
            for j, val in enumerate(padded):
                cell = WriteOnlyCell(ws, value=val)
                if j == 0:
                    cell.font = bold
                row_cells.append(cell)
            ws.append(row_cells)
        # Empty gap row between preamble and data table
        ws.append([""] * ncol)

    grey_fill = PatternFill(start_color="D3D3D3", end_color="D3D3D3", fill_type="solid")
    header_cells = []
    for h in args.headers:
        cell = WriteOnlyCell(ws, value=h)
        cell.font = bold
        cell.fill = grey_fill
        header_cells.append(cell)
    ws.append(header_cells)

    row_count = 0
    db = SessionLocal()
    try:
        with get_warehouse_session_from_id(str(args.dw_id)) as dw_db:
            if args.export_path in ("dataset_fast", "dataset_scoped"):
                row_count = _stream_dataset_rows(ws, db, dw_db, args)
            else:
                row_count = _stream_ut_baseline_rows(ws, dw_db, args)
    finally:
        db.close()

    wb.save(args.tmp_file_path)

    elapsed = (time.perf_counter() - t_start) * 1000
    logger.info(
        "xlsx_worker part=%d path=%s rows=%d start_id=%d end_id=%d elapsed_ms=%.1f",
        args.part_index,
        args.export_path,
        row_count,
        args.start_id,
        args.end_id,
        elapsed,
    )
    return args.tmp_file_path


# ---------------------------------------------------------------------------
# Streaming fetch + write
# ---------------------------------------------------------------------------

def _stream_dataset_rows(ws: Any, db: Any, dw_db: Any, args: XlsxWorkerArgs) -> int:
    """Stream dataset_data_point rows for this slice; return rows written."""
    written = 0
    for batch in _iter_dataset_batches(db, dw_db, args):
        for row in batch:
            ws.append(_to_xlsx_row(row, args.source_nid_to_name))
            written += 1
    return written


def _stream_ut_baseline_rows(ws: Any, dw_db: Any, args: XlsxWorkerArgs) -> int:
    """Stream ut_data rows for this slice; return rows written."""
    written = 0
    for batch in _iter_ut_baseline_batches(dw_db, args):
        for row in batch:
            ws.append(_to_xlsx_row(row, args.source_nid_to_name))
            written += 1
    return written


def _iter_dataset_batches(
    db: Any, dw_db: Any, args: XlsxWorkerArgs
) -> Generator[list[dict[str, Any]], None, None]:
    from sqlalchemy import select

    from apps.app_db.models.core import DatasetDataPoint

    tbl = DatasetDataPoint.__table__
    export_cols = [tbl.c[name] for name in _DATASET_EXPORT_COLUMNS]
    last_id = args.start_id

    while True:
        stmt = (
            select(*export_cols)
            .where(tbl.c.dataset_id == args.dataset_id)
            .where(tbl.c.data_point_id > last_id)
            .where(tbl.c.data_point_id <= args.end_id)
            .where(tbl.c.is_deleted.is_(False))
        )
        if args.review_status_filter:
            stmt = stmt.where(tbl.c.review_status == args.review_status_filter)
        if args.iusnids:
            stmt = stmt.where(tbl.c.iusnid.in_(args.iusnids))
        if args.area_nids:
            stmt = stmt.where(tbl.c.area_nid.in_(args.area_nids))
        if args.timeperiod_nids:
            stmt = stmt.where(tbl.c.timeperiod_nid.in_(args.timeperiod_nids))

        stmt = stmt.order_by(tbl.c.data_point_id.asc()).limit(args.chunk_size)
        batch = [dict(r) for r in db.execute(stmt).mappings()]
        if not batch:
            break

        for row in batch:
            _normalize_dataset_row(row)

        if args.export_path == "dataset_scoped":
            _merge_ut_data_into_batch(dw_db, batch, args)

        if _batch_needs_enrichment(batch, args.export_path):
            _enrich_batch(dw_db, args.locale, batch)

        yield batch
        last_id = batch[-1]["data_point_id"]


def _iter_ut_baseline_batches(
    dw_db: Any, args: XlsxWorkerArgs
) -> Generator[list[dict[str, Any]], None, None]:
    from sqlalchemy import select

    from apps.datawarehouse.models.datawarehouse import Data

    tbl = Data.__table__
    last_nid = args.start_id

    while True:
        stmt = (
            select(tbl)
            .where(tbl.c.data_nid > last_nid)
            .where(tbl.c.data_nid <= args.end_id)
        )
        if args.iusnids:
            stmt = stmt.where(tbl.c.iusnid.in_(args.iusnids))
        if args.area_nids:
            stmt = stmt.where(tbl.c.area_nid.in_(args.area_nids))
        if args.timeperiod_nids:
            stmt = stmt.where(tbl.c.timeperiod_nid.in_(args.timeperiod_nids))

        stmt = stmt.order_by(tbl.c.data_nid.asc()).limit(args.chunk_size)
        batch_raw = [dict(r) for r in dw_db.execute(stmt).mappings()]
        if not batch_raw:
            break

        batch = [_ut_mapping_to_export_dict(r) for r in batch_raw]
        _enrich_batch(dw_db, args.locale, batch)
        yield batch
        last_nid = int(batch_raw[-1]["data_nid"])


# ---------------------------------------------------------------------------
# Row normalization and enrichment
# ---------------------------------------------------------------------------

def _normalize_dataset_row(row: dict[str, Any]) -> None:
    """Map denormalized dataset_data_point columns to export dict keys in place."""
    if not (row.get("i_name") or "").strip():
        row["i_name"] = (row.get("indicator_name") or "").strip()
    if not (row.get("sg_name") or "").strip():
        row["sg_name"] = (row.get("subgroup_name") or "").strip()
    if not (row.get("ar_name") or "").strip():
        row["ar_name"] = (row.get("area_name") or "").strip()
    if not (row.get("tp_timeperiod") or "").strip():
        row["tp_timeperiod"] = (row.get("timeperiod_name") or "").strip()
    if not (row.get("src_name") or "").strip():
        row["src_name"] = (row.get("source_name") or "").strip()
    if not (row.get("footnote") or "").strip():
        row["footnote"] = (row.get("footnote_text") or "").strip()


def _batch_needs_enrichment(batch: list[dict[str, Any]], export_path: str) -> bool:
    """dataset_fast rows with denormalized labels skip warehouse lookups."""
    if export_path != "dataset_fast":
        return True
    return any(
        not (r.get("i_name") or "").strip()
        or not (r.get("sg_name") or "").strip()
        or not (r.get("ar_name") or "").strip()
        or not (r.get("tp_timeperiod") or "").strip()
        for r in batch
    )


def _merge_ut_data_into_batch(dw_db: Any, batch: list[dict], args: XlsxWorkerArgs) -> None:
    """For dataset_scoped: fill data_nid from ut_data when missing."""
    from sqlalchemy import or_, and_

    from apps.datawarehouse.models.datawarehouse import Data

    _UT_OR_BATCH = 750
    keys = [
        (
            int(r["iusnid"]),
            int(r["area_nid"]),
            int(r["timeperiod_nid"]),
            int(r["source_nid"]) if r.get("source_nid") not in (None, 0) else None,
        )
        for r in batch
    ]
    ut_map: dict[tuple, Any] = {}
    for i in range(0, len(keys), _UT_OR_BATCH):
        chunk_keys = keys[i : i + _UT_OR_BATCH]
        conds = []
        for k in chunk_keys:
            ius, ar, tp, src = k
            parts = [
                Data.iusnid == ius,
                Data.area_nid == ar,
                Data.timeperiod_nid == tp,
            ]
            if src is None:
                parts.append(or_(Data.source_nid.is_(None), Data.source_nid == 0))
            else:
                parts.append(Data.source_nid == src)
            conds.append(and_(*parts))
        for ut_row in dw_db.query(Data).filter(or_(*conds)).all():
            nk = (
                int(ut_row.iusnid),
                int(ut_row.area_nid),
                int(ut_row.timeperiod_nid),
                int(ut_row.source_nid) if ut_row.source_nid not in (None, 0) else None,
            )
            ut_map[nk] = ut_row

    for r, k in zip(batch, keys):
        ut = ut_map.get(k)
        if ut is not None and r.get("data_nid") is None:
            r["data_nid"] = ut.data_nid


def _ut_mapping_to_export_dict(ut: dict[str, Any]) -> dict[str, Any]:
    """Normalise a ut_data Core mapping to the export dict shape."""
    src_nid = ut.get("source_nid")
    if src_nid is not None:
        try:
            src_nid = int(src_nid) if int(src_nid) != 0 else None
        except (TypeError, ValueError):
            src_nid = None

    return {
        "data_point_id": None,
        "iusnid": int(ut["iusnid"]) if ut.get("iusnid") is not None else 0,
        "indicator_nid": int(ut["indicator_nid"]) if ut.get("indicator_nid") is not None else 0,
        "unit_nid": int(ut["unit_nid"]) if ut.get("unit_nid") is not None else 0,
        "subgroup_val_nid": int(ut["subgroup_val_nid"]) if ut.get("subgroup_val_nid") is not None else None,
        "area_nid": int(ut["area_nid"]) if ut.get("area_nid") is not None else 0,
        "timeperiod_nid": int(ut["timeperiod_nid"]) if ut.get("timeperiod_nid") is not None else 0,
        "source_nid": src_nid,
        "i_name": "",
        "sg_name": "",
        "ar_name": "",
        "tp_timeperiod": "",
        "data_value": ut.get("data_value"),
        "textual_data_value": ut.get("textual_data_value"),
        "istextualdata": bool(ut.get("istextualdata")),
        "footnote": "",
        "review_status": "",
        "src_name": "",
        "data_nid": ut.get("data_nid"),
    }


def _enrich_batch(dw_db: Any, locale: str, rows: list[dict[str, Any]]) -> None:
    """Populate display names via DataService when denormalized snapshots are missing."""
    if not rows:
        return
    needs = any(
        not (r.get("i_name") or "").strip()
        or not (r.get("sg_name") or "").strip()
        or not (r.get("ar_name") or "").strip()
        or not (r.get("tp_timeperiod") or "").strip()
        for r in rows
    )
    if needs:
        from apps.datawarehouse.services.data_service import DataService

        DataService()._enrich_unified_datapoint_row_dicts(dw_db, locale, rows)


def _to_xlsx_row(row: dict[str, Any], source_nid_to_name: dict[int, str]) -> list[Any]:
    """Map export dict to DATA_POINT_COLUMN_DEFS column order for XLSX."""
    src_nid = row.get("source_nid")
    src_display = ""
    if src_nid not in (None, 0):
        src_display = (row.get("src_name") or "").strip() or source_nid_to_name.get(int(src_nid), "")
    value = (
        row.get("textual_data_value")
        if row.get("istextualdata")
        else row.get("data_value")
    )
    i_name = (row.get("i_name") or "").strip()
    u_name = (row.get("u_name") or row.get("unit_name") or "").strip()
    indicator_display = f"{i_name} ({u_name})" if u_name else i_name
    return [
        indicator_display,
        row.get("sg_name"),
        row.get("ar_name"),
        row.get("tp_timeperiod"),
        value,
        src_display,
        row.get("footnote"),
        row.get("review_status") or "",
        row.get("data_point_id"),
    ]


def make_worker_tmp_path(part_index: int) -> str:
    """Generate a unique temp file path for one XLSX chunk."""
    uid = uuid.uuid4().hex
    return os.path.join(
        tempfile.gettempdir(),
        f"dfa_export_{part_index}_{uid}.xlsx",
    )
