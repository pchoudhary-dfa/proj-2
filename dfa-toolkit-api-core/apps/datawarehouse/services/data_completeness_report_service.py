"""
Data Completeness Report service.

Serves:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/data-completeness
        ?page=<int>
        &page_size=<int>

Returns a paginated table of datasets under a workflow, showing data point
completeness metrics per (district, dataset) row.

Metrics per row:
  - expected_data_points : active (non-soft-deleted) DatasetDataPoint rows for (dataset_id, area_nid)
  - received_data_points : active rows where data_value IS NOT NULL OR textual_data_value IS NOT NULL
  - completeness_rate    : received / expected * 100  (0.0 when expected = 0)
  - missing_footnotes    : active DatasetDataPoint rows with footnote_nid IS NULL for the pair

Soft-deleted rows (``is_deleted=True``) are excluded from all four metrics.

All three metric fields are computed via 3 batch grouped SQL queries
(no per-row N+1 calls).
"""
from __future__ import annotations

import logging
import math
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy import func

from apps.app_db.models.core import (
    Dataset,
    DatasetDataPoint,
    WorkflowDataentryRule,
)
from apps.datawarehouse.schemas.data_completeness_report import (
    DataCompletenessReportData,
    DataCompletenessReportRow,
)
from apps.datawarehouse.schemas.operational_reports import OperationalReportColumnLabels
from apps.shared.exceptions import BadRequest, NotFound

logger = logging.getLogger(__name__)

_EXCLUDED_STATUSES = {"DELETED", "REJECTED"}

_SEARCH_BY_FIELDS = frozenset({"state_assigned", "district_assigned", "dataset"})
_SORT_FIELDS = frozenset({
    *_SEARCH_BY_FIELDS,
    "expected_data_points", "received_data_points", "completeness_rate", "missing_footnotes",
})
_NUMERIC_SORT_FIELDS = frozenset({
    "expected_data_points", "received_data_points", "completeness_rate", "missing_footnotes",
})


# ---------------------------------------------------------------------------
# List param helpers
# ---------------------------------------------------------------------------

def _validate_list_params(
    submission_status: Optional[int],
    search: Optional[str],
    search_by: Optional[str],
    sort_field: Optional[str],
    sort_order: str,
) -> None:
    """Validate filter, search, and sort query parameters."""
    if submission_status is not None and submission_status not in (0, 1):
        raise BadRequest(
            "submission_status must be 0 (NOT SUBMITTED) or 1 (SUBMITTED)",
            details={"submission_status": submission_status},
        )

    if search and not search_by:
        raise BadRequest(
            "search_by is required when search is provided",
            details={"search": search},
        )

    if search_by is not None and search_by not in _SEARCH_BY_FIELDS:
        raise BadRequest(
            f"search_by must be one of: {', '.join(sorted(_SEARCH_BY_FIELDS))}",
            details={"search_by": search_by},
        )

    if sort_field is not None and sort_field not in _SORT_FIELDS:
        raise BadRequest(
            f"sort_field must be one of: {', '.join(sorted(_SORT_FIELDS))}",
            details={"sort_field": sort_field},
        )

    if sort_order not in ("asc", "desc"):
        raise BadRequest(
            "sort_order must be asc or desc",
            details={"sort_order": sort_order},
        )


def _apply_submission_filter(rows: List[Dict], submission_status: Optional[int]) -> List[Dict]:
    """Filter rows by computed submission_status integer (0 = DRAFT, 1 = submitted)."""
    if submission_status is None:
        return rows
    return [
        r for r in rows
        if (0 if r["dataset_status"] == "DRAFT" else 1) == submission_status
    ]


def _apply_search(
    rows: List[Dict],
    search: Optional[str],
    search_by: Optional[str],
) -> List[Dict]:
    """Case-insensitive substring search on a single column (search_by required)."""
    if not search or not search_by:
        return rows
    needle = search.lower()
    return [
        r for r in rows
        if needle in (r.get(search_by) or "").lower()
    ]


def _apply_sort(
    rows: List[Dict],
    sort_field: Optional[str],
    sort_order: str,
) -> None:
    """Sort rows in place."""
    descending = sort_order == "desc"

    if sort_field is None:
        rows.sort(
            key=lambda r: (
                r["state_assigned"] or "",
                r["district_assigned"] or "",
                r["dataset"] or "",
            ),
        )
        return

    if sort_field in _NUMERIC_SORT_FIELDS:
        rows.sort(
            key=lambda r: r.get(sort_field) or 0,
            reverse=descending,
        )
        return

    rows.sort(
        key=lambda r: r.get(sort_field) or "",
        reverse=descending,
    )


# ---------------------------------------------------------------------------
# DW lookup helpers (same pattern as other report services)
# ---------------------------------------------------------------------------

def _resolve_timeperiod_string(dw_id: int, timeperiod_nid: int) -> Optional[str]:
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import TimePeriod

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        row = dw_db.query(TimePeriod.timeperiod).filter(
            TimePeriod.timeperiod_nid == timeperiod_nid
        ).first()
        return row[0] if row else None


def _fetch_area_level_name(dw_id: int, locale: str, area_level: int) -> Optional[str]:
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import AreaLevel

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        AreaLevelModel = AreaLevel(locale)
        row = dw_db.query(AreaLevelModel).filter(
            AreaLevelModel.area_level == area_level
        ).first()
        return row.area_level_name if row else None


def _fetch_district_area_lookup(
    dw_id: int,
    locale: str,
    area_level: int,
) -> Dict[int, Dict]:
    """
    Return area_nid → {area_name, parent_area_name} for all areas at the
    given area_level within the warehouse.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Area

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        AreaModel = Area(locale)
        ParentAlias = Area(locale)

        district_rows = (
            dw_db.query(
                AreaModel.area_nid,
                AreaModel.area_name,
                AreaModel.area_parent_nid,
            )
            .filter(AreaModel.area_level == area_level)
            .order_by(AreaModel.area_name)
            .all()
        )

        if not district_rows:
            return {}

        parent_nids: Set[int] = {
            int(r[2]) for r in district_rows if r[2] is not None and int(r[2]) not in (0, -1)
        }
        parent_name_map: Dict[int, str] = {}
        if parent_nids:
            parent_rows = (
                dw_db.query(ParentAlias.area_nid, ParentAlias.area_name)
                .filter(ParentAlias.area_nid.in_(list(parent_nids)))
                .all()
            )
            parent_name_map = {int(r[0]): r[1] for r in parent_rows}

        lookup: Dict[int, Dict] = {}
        for r in district_rows:
            p_nid = int(r[2]) if r[2] is not None else None
            p_nid_clean = p_nid if p_nid not in (None, 0, -1) else None
            lookup[int(r[0])] = {
                "area_name": r[1],
                "parent_area_name": parent_name_map.get(p_nid_clean) if p_nid_clean else None,
            }
        return lookup


# ---------------------------------------------------------------------------
# Data-point batch metric helpers
# ---------------------------------------------------------------------------

def _build_expected_dp_map(
    db: Session,
    dataset_ids: List[int],
) -> Dict[Tuple[int, int], int]:
    """
    Return (dataset_id, area_nid) → total active DatasetDataPoint count.
    Covers all time periods; no value-filter applied. Soft-deleted rows excluded.
    """
    if not dataset_ids:
        return {}
    rows = (
        db.query(
            DatasetDataPoint.dataset_id,
            DatasetDataPoint.area_nid,
            func.count().label("cnt"),
        )
        .filter(
            DatasetDataPoint.dataset_id.in_(dataset_ids),
            DatasetDataPoint.is_deleted.is_(False),
        )
        .group_by(DatasetDataPoint.dataset_id, DatasetDataPoint.area_nid)
        .all()
    )
    return {(int(r[0]), int(r[1])): int(r[2]) for r in rows}


def _build_received_dp_map(
    db: Session,
    dataset_ids: List[int],
) -> Dict[Tuple[int, int], int]:
    """
    Return (dataset_id, area_nid) → count of active data points where
    data_value IS NOT NULL OR textual_data_value IS NOT NULL.
    Soft-deleted rows excluded.
    """
    if not dataset_ids:
        return {}
    rows = (
        db.query(
            DatasetDataPoint.dataset_id,
            DatasetDataPoint.area_nid,
            func.count().label("cnt"),
        )
        .filter(
            DatasetDataPoint.dataset_id.in_(dataset_ids),
            DatasetDataPoint.is_deleted.is_(False),
            or_(
                DatasetDataPoint.data_value.isnot(None),
                DatasetDataPoint.textual_data_value.isnot(None),
            ),
        )
        .group_by(DatasetDataPoint.dataset_id, DatasetDataPoint.area_nid)
        .all()
    )
    return {(int(r[0]), int(r[1])): int(r[2]) for r in rows}


def _build_missing_footnote_map(
    db: Session,
    dataset_ids: List[int],
) -> Dict[Tuple[int, int], int]:
    """
    Return (dataset_id, area_nid) → count of active DatasetDataPoint rows with
    footnote_nid IS NULL. Soft-deleted rows excluded.
    """
    if not dataset_ids:
        return {}
    rows = (
        db.query(
            DatasetDataPoint.dataset_id,
            DatasetDataPoint.area_nid,
            func.count().label("cnt"),
        )
        .filter(
            DatasetDataPoint.dataset_id.in_(dataset_ids),
            DatasetDataPoint.is_deleted.is_(False),
            DatasetDataPoint.footnote_nid.is_(None),
        )
        .group_by(DatasetDataPoint.dataset_id, DatasetDataPoint.area_nid)
        .all()
    )
    return {(int(r[0]), int(r[1])): int(r[2]) for r in rows}


# ---------------------------------------------------------------------------
# Public service function
# ---------------------------------------------------------------------------

def get_data_completeness_report(
    db: Session,
    dw_id: int,
    workflow_id: int,
    locale: str,
    page: int = 1,
    page_size: int = 20,
    submission_status: Optional[int] = None,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort_field: Optional[str] = None,
    sort_order: str = "asc",
) -> Tuple[DataCompletenessReportData, Dict]:
    """
    Build the Data Completeness Report paginated response.

    Returns:
        (DataCompletenessReportData, meta_dict)
    """
    _validate_list_params(submission_status, search, search_by, sort_field, sort_order)

    # 1. Load WorkflowDataentryRule
    rule: Optional[WorkflowDataentryRule] = (
        db.query(WorkflowDataentryRule)
        .filter(WorkflowDataentryRule.workflow_id == workflow_id)
        .first()
    )
    if rule is None:
        raise NotFound(f"No data-entry rule found for workflow {workflow_id}")

    configured_area_level = rule.area_level
    if not configured_area_level:
        raise BadRequest(
            f"Workflow {workflow_id} has no area_level configured in its data-entry rule"
        )

    curr_timeperiod_nid: Optional[int] = rule.curr_timeperiod_nid

    # 2. Resolve area-level display names for column headers
    district_label = _fetch_area_level_name(dw_id, locale, configured_area_level)
    state_label = _fetch_area_level_name(dw_id, locale, configured_area_level - 1)

    # 3. Resolve current time period label
    current_timeperiod_label: Optional[str] = None
    if curr_timeperiod_nid is not None:
        current_timeperiod_label = _resolve_timeperiod_string(dw_id, curr_timeperiod_nid)

    _empty_meta = {
        "total_count": 0,
        "count": 0,
        "page": page,
        "page_size": page_size,
        "total_pages": 0,
    }
    _column_labels = OperationalReportColumnLabels(
        state_label=state_label,
        district_label=district_label,
    )

    # 4. Fetch all active datasets for the workflow
    datasets = (
        db.query(Dataset)
        .filter(
            Dataset.workflow_id == workflow_id,
            Dataset.dataset_status.notin_(list(_EXCLUDED_STATUSES)),
        )
        .all()
    )

    if not datasets:
        return (
            DataCompletenessReportData(
                column_labels=_column_labels,
                current_timeperiod_label=current_timeperiod_label,
                rows=[],
            ),
            _empty_meta,
        )

    # 5. Build district area lookup from DW (area_nid → {area_name, parent_area_name})
    district_lookup = _fetch_district_area_lookup(dw_id, locale, configured_area_level)

    if not district_lookup:
        return (
            DataCompletenessReportData(
                column_labels=_column_labels,
                current_timeperiod_label=current_timeperiod_label,
                rows=[],
            ),
            _empty_meta,
        )

    # 6. Explode datasets × area_nids → raw (dataset, area_nid) pairs
    #    Only include area_nids that exist at the configured area_level.
    exploded: List[Tuple[Dataset, int]] = []
    dataset_ids: List[int] = []
    seen_dataset_ids: Set[int] = set()

    for ds in datasets:
        for a_nid_raw in (ds.area_nids or []):
            area_nid = int(a_nid_raw)
            if area_nid not in district_lookup:
                continue
            exploded.append((ds, area_nid))
            if ds.dataset_id not in seen_dataset_ids:
                dataset_ids.append(ds.dataset_id)
                seen_dataset_ids.add(ds.dataset_id)

    if not exploded:
        return (
            DataCompletenessReportData(
                column_labels=_column_labels,
                current_timeperiod_label=current_timeperiod_label,
                rows=[],
            ),
            _empty_meta,
        )

    # 7. Three batch queries for data point metrics
    expected_map = _build_expected_dp_map(db, dataset_ids)
    received_map = _build_received_dp_map(db, dataset_ids)
    missing_footnote_map = _build_missing_footnote_map(db, dataset_ids)

    # 8. Build raw row dicts
    raw_rows: List[Dict] = []
    for ds, area_nid in exploded:
        key = (ds.dataset_id, area_nid)
        area_info = district_lookup[area_nid]

        expected = expected_map.get(key, 0)
        received = received_map.get(key, 0)
        completeness = round(received / expected * 100, 2) if expected > 0 else 0.0

        raw_rows.append({
            "dataset_id": ds.dataset_id,
            "dataset": ds.dataset_name,
            "dataset_status": ds.dataset_status,
            "state_assigned": area_info["parent_area_name"],
            "district_assigned": area_info["area_name"],
            "expected_data_points": expected,
            "received_data_points": received,
            "completeness_rate": completeness,
            "missing_footnotes": missing_footnote_map.get(key, 0),
        })

    # 9. Filter, search, sort
    raw_rows = _apply_submission_filter(raw_rows, submission_status)
    raw_rows = _apply_search(raw_rows, search, search_by)
    _apply_sort(raw_rows, sort_field, sort_order)

    # 10. Paginate
    total_count = len(raw_rows)
    total_pages = math.ceil(total_count / page_size) if page_size else 0
    offset = (page - 1) * page_size
    page_slice = raw_rows[offset: offset + page_size]

    rows: List[DataCompletenessReportRow] = []
    for i, r in enumerate(page_slice, start=offset + 1):
        submission_status = 0 if r["dataset_status"] == "DRAFT" else 1
        rows.append(
            DataCompletenessReportRow(
                sno=i,
                current_timeperiod=current_timeperiod_label,
                state_assigned=r["state_assigned"],
                district_assigned=r["district_assigned"],
                dataset=r["dataset"],
                submission_status=submission_status,
                expected_data_points=r["expected_data_points"],
                received_data_points=r["received_data_points"],
                completeness_rate=r["completeness_rate"],
                missing_footnotes=r["missing_footnotes"],
            )
        )

    data = DataCompletenessReportData(
        column_labels=_column_labels,
        current_timeperiod_label=current_timeperiod_label,
        rows=rows,
    )

    meta = {
        "total_count": total_count,
        "count": len(rows),
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }

    return data, meta
