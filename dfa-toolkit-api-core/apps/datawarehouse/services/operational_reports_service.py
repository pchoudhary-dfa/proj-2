"""
Operational Reports service.

Serves:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}
        ?page=<int>
        &page_size=<int>

Returns a paginated table of data-entry operator dataset submissions per area
for the selected workflow.  Each row is one Dataset record expanded once per
district area it covers (via area_nids JSON).
"""
from __future__ import annotations

import logging
import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from apps.app_db.models.core import (
    Dataset,
    IamUser,
    WorkflowDataentryRule,
)
from apps.datawarehouse.schemas.operational_reports import (
    OperationalReportColumnLabels,
    OperationalReportData,
    OperationalReportRow,
)
from apps.shared.exceptions import BadRequest, NotFound

logger = logging.getLogger(__name__)

# Dataset statuses shown in the report (DELETED / REJECTED are excluded)
_ACTIVE_STATUSES = {"DRAFT", "PENDING_REVIEW", "REVISION", "APPROVED"}

_SEARCH_BY_FIELDS = frozenset({"state_name", "district_name", "dataset_name", "submitted_by"})
_SORT_FIELDS = frozenset({*_SEARCH_BY_FIELDS, "date_submitted", "last_updated"})
_DATETIME_SORT_FIELDS = frozenset({"date_submitted", "last_updated"})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _submission_status(dataset_status: str) -> int:
    """
    Return the submission status integer.

    0 => NOT SUBMITTED  (dataset_status == DRAFT)
    1 => SUBMITTED      (any other active status)
    """
    return 0 if dataset_status == "DRAFT" else 1


def _action_needed(dataset_status: str) -> int:
    """
    Return the action-needed integer code.

    0 => No action          (APPROVED or PENDING_REVIEW)
    1 => Pending Revision   (REVISION)
    2 => Pending Submission (DRAFT)
    """
    mapping = {
        "APPROVED": 0,
        "PENDING_REVIEW": 0,
        "REVISION": 1,
        "DRAFT": 2,
    }
    return mapping.get(dataset_status, 3)


def _validate_list_params(
    submission_status: Optional[int],
    action_needed: Optional[int],
    search: Optional[str],
    search_by: Optional[str],
    sort_field: Optional[str],
    sort_order: str,
    date_submitted_from: Optional[datetime] = None,
    date_submitted_to: Optional[datetime] = None,
    last_updated_from: Optional[datetime] = None,
    last_updated_to: Optional[datetime] = None,
) -> None:
    """Validate filter, search, and sort query parameters."""
    if submission_status is not None and submission_status not in (0, 1):
        raise BadRequest(
            "submission_status must be 0 (NOT SUBMITTED) or 1 (SUBMITTED)",
            details={"submission_status": submission_status},
        )

    if action_needed is not None and action_needed not in (0, 1, 2):
        raise BadRequest(
            "action_needed must be 0 (No action), 1 (Pending Revision), or 2 (Pending Submission)",
            details={"action_needed": action_needed},
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

    if (
        date_submitted_from is not None
        and date_submitted_to is not None
        and date_submitted_from > date_submitted_to
    ):
        raise BadRequest(
            "date_submitted_from must be less than or equal to date_submitted_to",
            details={
                "date_submitted_from": date_submitted_from.isoformat(),
                "date_submitted_to": date_submitted_to.isoformat(),
            },
        )

    if (
        last_updated_from is not None
        and last_updated_to is not None
        and last_updated_from > last_updated_to
    ):
        raise BadRequest(
            "last_updated_from must be less than or equal to last_updated_to",
            details={
                "last_updated_from": last_updated_from.isoformat(),
                "last_updated_to": last_updated_to.isoformat(),
            },
        )


def _apply_submission_filters(
    rows: List[Dict],
    submission_status: Optional[int],
    action_needed: Optional[int],
) -> List[Dict]:
    """Filter rows by submission_status and/or action_needed integer codes."""
    if submission_status is not None:
        rows = [r for r in rows if r["submission_status"] == submission_status]
    if action_needed is not None:
        rows = [r for r in rows if r["action_needed"] == action_needed]
    return rows


def _apply_date_range_filters(
    rows: List[Dict],
    date_submitted_from: Optional[datetime],
    date_submitted_to: Optional[datetime],
    last_updated_from: Optional[datetime],
    last_updated_to: Optional[datetime],
) -> List[Dict]:
    """Filter rows by inclusive date ranges; null column values are excluded when a bound is set."""
    if date_submitted_from is not None or date_submitted_to is not None:
        rows = [
            r for r in rows
            if r["date_submitted"] is not None
            and (date_submitted_from is None or r["date_submitted"] >= date_submitted_from)
            and (date_submitted_to is None or r["date_submitted"] <= date_submitted_to)
        ]
    if last_updated_from is not None or last_updated_to is not None:
        rows = [
            r for r in rows
            if r["last_updated"] is not None
            and (last_updated_from is None or r["last_updated"] >= last_updated_from)
            and (last_updated_to is None or r["last_updated"] <= last_updated_to)
        ]
    return rows


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


def _datetime_sort_key(value: Optional[datetime], descending: bool) -> Tuple[int, float]:
    """Nulls sort last on asc, first on desc."""
    if descending:
        if value is None:
            return (0, 0.0)
        return (1, -value.timestamp())
    if value is None:
        return (1, 0.0)
    return (0, value.timestamp())


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
                r["state_name"] or "",
                r["district_name"] or "",
                r["dataset_name"] or "",
            ),
        )
        return

    if sort_field in _DATETIME_SORT_FIELDS:
        rows.sort(
            key=lambda r: _datetime_sort_key(r.get(sort_field), descending),
        )
        return

    rows.sort(
        key=lambda r: r.get(sort_field) or "",
        reverse=descending,
    )


def _resolve_timeperiod_string(dw_id: int, timeperiod_nid: int) -> Optional[str]:
    """Resolve a timeperiod NID to its string value (e.g. '2026 Q1')."""
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import TimePeriod

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        row = dw_db.query(TimePeriod.timeperiod).filter(
            TimePeriod.timeperiod_nid == timeperiod_nid
        ).first()
        return row[0] if row else None


def _fetch_area_level_name(dw_id: int, locale: str, area_level: int) -> Optional[str]:
    """Return display name for a given area_level integer from DW AreaLevel table."""
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
    Return a dict keyed by area_nid for all areas at `area_level` in the DW.

    Each value dict has:
        area_name, parent_area_nid (int or None), parent_area_name (str or None)
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

        parent_nids = {
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
                "parent_area_nid": p_nid_clean,
                "parent_area_name": parent_name_map.get(p_nid_clean) if p_nid_clean else None,
            }
        return lookup


# ---------------------------------------------------------------------------
# Public service function
# ---------------------------------------------------------------------------

def get_operational_reports(
    db: Session,
    dw_id: int,
    workflow_id: int,
    locale: str,
    page: int = 1,
    page_size: int = 20,
    submission_status: Optional[int] = None,
    action_needed: Optional[int] = None,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort_field: Optional[str] = None,
    sort_order: str = "asc",
    date_submitted_from: Optional[datetime] = None,
    date_submitted_to: Optional[datetime] = None,
    last_updated_from: Optional[datetime] = None,
    last_updated_to: Optional[datetime] = None,
) -> Tuple[OperationalReportData, Dict]:
    """
    Build the Operational Reports paginated response.

    Returns:
        (OperationalReportData, meta_dict)
        where meta_dict contains total_count, count, page, page_size, total_pages.
    """
    _validate_list_params(
        submission_status,
        action_needed,
        search,
        search_by,
        sort_field,
        sort_order,
        date_submitted_from,
        date_submitted_to,
        last_updated_from,
        last_updated_to,
    )
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

    # 2. Resolve area-level display names from DW
    district_label: Optional[str] = _fetch_area_level_name(dw_id, locale, configured_area_level)
    state_label: Optional[str] = _fetch_area_level_name(dw_id, locale, configured_area_level - 1)

    # 3. Resolve curr_timeperiod_nid → timeperiod string
    current_timeperiod_label: Optional[str] = None
    if curr_timeperiod_nid is not None:
        current_timeperiod_label = _resolve_timeperiod_string(dw_id, curr_timeperiod_nid)

    # 4. Fetch all active datasets for this workflow
    all_datasets: List[Dataset] = (
        db.query(Dataset)
        .filter(
            Dataset.workflow_id == workflow_id,
            Dataset.dataset_status.in_(list(_ACTIVE_STATUSES)),
        )
        .all()
    )

    if not all_datasets:
        return (
            OperationalReportData(
                column_labels=OperationalReportColumnLabels(
                    state_label=state_label,
                    district_label=district_label,
                ),
                current_timeperiod_label=current_timeperiod_label,
                rows=[],
            ),
            {
                "total_count": 0,
                "count": 0,
                "page": page,
                "page_size": page_size,
                "total_pages": 0,
            },
        )

    # 5. Fetch district area lookup from DW: {area_nid: {area_name, parent_area_nid, parent_area_name}}
    district_lookup = _fetch_district_area_lookup(dw_id, locale, configured_area_level)

    # 6. Batch-load IamUser records for all submitted_by_user_id values
    submitter_ids = {
        d.submitted_by_user_id for d in all_datasets if d.submitted_by_user_id is not None
    }
    user_map: Dict[int, IamUser] = {}
    if submitter_ids:
        users = (
            db.query(IamUser)
            .filter(IamUser.id.in_(list(submitter_ids)))
            .all()
        )
        user_map = {u.id: u for u in users}

    # 7. Explode datasets by area_nids — one row per (district, dataset)
    raw_rows: List[Dict] = []
    for dataset in all_datasets:
        area_nids: List = dataset.area_nids or []
        for a_nid_raw in area_nids:
            a_nid = int(a_nid_raw)
            area_info = district_lookup.get(a_nid)
            if area_info is None:
                # This area_nid is not at the configured area_level — skip
                continue

            submitter: Optional[IamUser] = user_map.get(dataset.submitted_by_user_id) if dataset.submitted_by_user_id else None
            submitted_by_name: Optional[str] = None
            if submitter:
                parts = [submitter.first_name or "", submitter.last_name or ""]
                submitted_by_name = " ".join(p for p in parts if p).strip() or None

            raw_rows.append({
                "state_name": area_info["parent_area_name"],
                "district_name": area_info["area_name"],
                "dataset_name": dataset.dataset_name,
                "dataset_status": dataset.dataset_status,
                "submission_status": _submission_status(dataset.dataset_status),
                "action_needed": _action_needed(dataset.dataset_status),
                "date_submitted": dataset.submitted_at,
                "submitted_by": submitted_by_name,
                "last_updated": dataset.last_updated_at,
            })

    # 8. Filter, search, sort
    raw_rows = _apply_submission_filters(raw_rows, submission_status, action_needed)
    raw_rows = _apply_date_range_filters(
        raw_rows,
        date_submitted_from,
        date_submitted_to,
        last_updated_from,
        last_updated_to,
    )
    raw_rows = _apply_search(raw_rows, search, search_by)
    _apply_sort(raw_rows, sort_field, sort_order)

    # 9. Paginate
    total_count = len(raw_rows)
    total_pages = math.ceil(total_count / page_size) if page_size else 0
    offset = (page - 1) * page_size
    page_slice = raw_rows[offset: offset + page_size]

    # 10. Build OperationalReportRow objects with sno
    rows: List[OperationalReportRow] = []
    for i, r in enumerate(page_slice, start=offset + 1):
        rows.append(
            OperationalReportRow(
                sno=i,
                current_timeperiod=current_timeperiod_label,
                state_name=r["state_name"],
                district_name=r["district_name"],
                dataset_name=r["dataset_name"],
                submission_status=r["submission_status"],
                date_submitted=r["date_submitted"],
                submitted_by=r["submitted_by"],
                last_updated=r["last_updated"],
                action_needed=r["action_needed"],
            )
        )

    data = OperationalReportData(
        column_labels=OperationalReportColumnLabels(
            state_label=state_label,
            district_label=district_label,
        ),
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
