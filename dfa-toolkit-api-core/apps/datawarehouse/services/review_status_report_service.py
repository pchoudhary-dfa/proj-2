"""
Review Status Report service.

Serves:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/review-status
        ?page=<int>
        &page_size=<int>

Returns a paginated table of reviewer assignments per area and dataset for a
selected workflow.  Each row is one Dataset record × one district area it covers
× one reviewer IAM-assigned to that area (role must carry dm_dw_data_review
permission).

Datasets included: PENDING_REVIEW, REVISION, APPROVED (DRAFT excluded).
"""
from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from apps.app_db.models.core import (
    Dataset,
    IamResource,
    IamRoleResourceApi,
    IamUser,
    IamUserRoleContent,
    WorkflowDataentryRule,
)
from apps.datawarehouse.schemas.operational_reports import OperationalReportColumnLabels
from apps.datawarehouse.schemas.review_status_report import (
    ReviewStatusReportData,
    ReviewStatusReportRow,
)
from apps.shared.exceptions import BadRequest, NotFound

logger = logging.getLogger(__name__)

_REVIEWER_STATUSES = {"PENDING_REVIEW", "REVISION", "APPROVED"}
_REVIEWER_RESOURCE_CODE = "dm_dw_data_review"

_SEARCH_BY_FIELDS = frozenset({"state_name", "district_name", "dataset_name", "reviewer_assigned"})
_SORT_FIELDS = frozenset({*_SEARCH_BY_FIELDS, "date_submitted", "date_returned", "date_approved"})
_DATETIME_SORT_FIELDS = frozenset({"date_submitted", "date_returned", "date_approved"})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _review_status(dataset_status: str) -> int:
    """
    Return the review status integer code.

    0 => Approved       (APPROVED)
    1 => Pending review (PENDING_REVIEW)
    2 => Revision       (REVISION)
    """
    mapping = {
        "APPROVED": 0,
        "PENDING_REVIEW": 1,
        "REVISION": 2,
    }
    return mapping.get(dataset_status, 1)


def _validate_list_params(
    review_status: Optional[int],
    search: Optional[str],
    search_by: Optional[str],
    sort_field: Optional[str],
    sort_order: str,
    date_submitted_from: Optional[datetime] = None,
    date_submitted_to: Optional[datetime] = None,
    date_returned_from: Optional[datetime] = None,
    date_returned_to: Optional[datetime] = None,
    date_approved_from: Optional[datetime] = None,
    date_approved_to: Optional[datetime] = None,
) -> None:
    """Validate filter, search, and sort query parameters."""
    if review_status is not None and review_status not in (0, 1, 2):
        raise BadRequest(
            "review_status must be 0 (Approved), 1 (Pending review), or 2 (Revision)",
            details={"review_status": review_status},
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
        date_returned_from is not None
        and date_returned_to is not None
        and date_returned_from > date_returned_to
    ):
        raise BadRequest(
            "date_returned_from must be less than or equal to date_returned_to",
            details={
                "date_returned_from": date_returned_from.isoformat(),
                "date_returned_to": date_returned_to.isoformat(),
            },
        )

    if (
        date_approved_from is not None
        and date_approved_to is not None
        and date_approved_from > date_approved_to
    ):
        raise BadRequest(
            "date_approved_from must be less than or equal to date_approved_to",
            details={
                "date_approved_from": date_approved_from.isoformat(),
                "date_approved_to": date_approved_to.isoformat(),
            },
        )


def _apply_review_status_filter(rows: List[Dict], review_status: Optional[int]) -> List[Dict]:
    """Filter rows by review_status integer code (exact match)."""
    if review_status is None:
        return rows
    return [r for r in rows if r["review_status"] == review_status]


def _apply_date_range_filters(
    rows: List[Dict],
    date_submitted_from: Optional[datetime],
    date_submitted_to: Optional[datetime],
    date_returned_from: Optional[datetime],
    date_returned_to: Optional[datetime],
    date_approved_from: Optional[datetime],
    date_approved_to: Optional[datetime],
) -> List[Dict]:
    """Filter rows by inclusive date ranges; null column values are excluded when a bound is set."""
    if date_submitted_from is not None or date_submitted_to is not None:
        rows = [
            r for r in rows
            if r["date_submitted"] is not None
            and (date_submitted_from is None or r["date_submitted"] >= date_submitted_from)
            and (date_submitted_to is None or r["date_submitted"] <= date_submitted_to)
        ]
    if date_returned_from is not None or date_returned_to is not None:
        rows = [
            r for r in rows
            if r["date_returned"] is not None
            and (date_returned_from is None or r["date_returned"] >= date_returned_from)
            and (date_returned_to is None or r["date_returned"] <= date_returned_to)
        ]
    if date_approved_from is not None or date_approved_to is not None:
        rows = [
            r for r in rows
            if r["date_approved"] is not None
            and (date_approved_from is None or r["date_approved"] >= date_approved_from)
            and (date_approved_to is None or r["date_approved"] <= date_approved_to)
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


def _datetime_sort_key(value: Optional[datetime], descending: bool):
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
                r["reviewer_assigned"] or "",
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
    """Resolve a timeperiod NID to its display string (e.g. '2026 Q1')."""
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import TimePeriod

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        row = dw_db.query(TimePeriod.timeperiod).filter(
            TimePeriod.timeperiod_nid == timeperiod_nid
        ).first()
        return row[0] if row else None


def _fetch_area_level_name(dw_id: int, locale: str, area_level: int) -> Optional[str]:
    """Return display name for the given area_level from DW AreaLevel table."""
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
    Return dict keyed by area_nid for all areas at `area_level` in the DW.

    Each value: {area_name, parent_area_nid, parent_area_name}
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


def _build_reviewer_area_map(
    db: Session,
    workflow_id: int,
) -> Dict[int, List[int]]:
    """
    Build a mapping of area_nid → [user_id, ...] for reviewers assigned to that
    area under the given workflow.

    Only users whose role carries dm_dw_data_review permission are included.

    Steps:
      1. Resolve IamResource.id for resource_code='dm_dw_data_review'.
      2. Collect all role_ids from IamRoleResourceApi for that resource.
      3. Query IamUserRoleContent where workflow_id=X, resource_code='dm_dw_area',
         role_id IN reviewer_role_ids.
    """
    # 1. Resolve resource id for dm_dw_data_review
    resource_row = (
        db.query(IamResource.id)
        .filter(IamResource.resource_code == _REVIEWER_RESOURCE_CODE)
        .first()
    )
    if resource_row is None:
        logger.warning("IAM resource '%s' not found — no reviewer assignments possible", _REVIEWER_RESOURCE_CODE)
        return {}

    resource_id = resource_row[0]

    # 2. Get all role_ids that have permission on that resource
    role_id_rows = (
        db.query(IamRoleResourceApi.role_id)
        .filter(IamRoleResourceApi.resource_id == resource_id)
        .distinct()
        .all()
    )
    reviewer_role_ids: Set[int] = {r[0] for r in role_id_rows if r[0] is not None}

    if not reviewer_role_ids:
        logger.info("No roles carry '%s' permission — no reviewer assignments", _REVIEWER_RESOURCE_CODE)
        return {}

    # 3. Query assignments for this workflow
    assignment_rows = (
        db.query(IamUserRoleContent.content_id, IamUserRoleContent.user_id)
        .filter(
            IamUserRoleContent.workflow_id == workflow_id,
            IamUserRoleContent.resource_code == "dm_dw_area",
            IamUserRoleContent.role_id.in_(list(reviewer_role_ids)),
            IamUserRoleContent.content_id.isnot(None),
            IamUserRoleContent.user_id.isnot(None),
        )
        .all()
    )

    area_reviewer_map: Dict[int, List[int]] = defaultdict(list)
    for area_nid, user_id in assignment_rows:
        area_reviewer_map[int(area_nid)].append(int(user_id))

    return dict(area_reviewer_map)


# ---------------------------------------------------------------------------
# Public service function
# ---------------------------------------------------------------------------

def get_review_status_report(
    db: Session,
    dw_id: int,
    workflow_id: int,
    locale: str,
    page: int = 1,
    page_size: int = 20,
    review_status: Optional[int] = None,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort_field: Optional[str] = None,
    sort_order: str = "asc",
    date_submitted_from: Optional[datetime] = None,
    date_submitted_to: Optional[datetime] = None,
    date_returned_from: Optional[datetime] = None,
    date_returned_to: Optional[datetime] = None,
    date_approved_from: Optional[datetime] = None,
    date_approved_to: Optional[datetime] = None,
) -> Tuple[ReviewStatusReportData, Dict]:
    """
    Build the Review Status Report paginated response.

    Returns:
        (ReviewStatusReportData, meta_dict)
        where meta_dict contains total_count, count, page, page_size, total_pages.
    """
    _validate_list_params(
        review_status,
        search,
        search_by,
        sort_field,
        sort_order,
        date_submitted_from,
        date_submitted_to,
        date_returned_from,
        date_returned_to,
        date_approved_from,
        date_approved_to,
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

    # 2. Resolve area-level display names
    district_label = _fetch_area_level_name(dw_id, locale, configured_area_level)
    state_label = _fetch_area_level_name(dw_id, locale, configured_area_level - 1)

    # 3. Resolve timeperiod string
    current_timeperiod_label: Optional[str] = None
    if curr_timeperiod_nid is not None:
        current_timeperiod_label = _resolve_timeperiod_string(dw_id, curr_timeperiod_nid)

    # 4. Build reviewer area map: area_nid → [user_id, ...]
    reviewer_area_map = _build_reviewer_area_map(db, workflow_id)

    # 5. Fetch datasets (exclude DRAFT)
    all_datasets: List[Dataset] = (
        db.query(Dataset)
        .filter(
            Dataset.workflow_id == workflow_id,
            Dataset.dataset_status.in_(list(_REVIEWER_STATUSES)),
        )
        .all()
    )

    _empty_meta = {
        "total_count": 0,
        "count": 0,
        "page": page,
        "page_size": page_size,
        "total_pages": 0,
    }

    if not all_datasets:
        return (
            ReviewStatusReportData(
                column_labels=OperationalReportColumnLabels(
                    state_label=state_label,
                    district_label=district_label,
                ),
                current_timeperiod_label=current_timeperiod_label,
                rows=[],
            ),
            _empty_meta,
        )

    # 6. Fetch district area lookup from DW
    district_lookup = _fetch_district_area_lookup(dw_id, locale, configured_area_level)

    # 7. Batch-load IamUser records for all reviewer user IDs
    all_reviewer_user_ids: Set[int] = {
        uid for uids in reviewer_area_map.values() for uid in uids
    }
    user_map: Dict[int, IamUser] = {}
    if all_reviewer_user_ids:
        users = (
            db.query(IamUser)
            .filter(IamUser.id.in_(list(all_reviewer_user_ids)))
            .all()
        )
        user_map = {u.id: u for u in users}

    def _full_name(user: Optional[IamUser]) -> Optional[str]:
        if user is None:
            return None
        parts = [user.first_name or "", user.last_name or ""]
        name = " ".join(p for p in parts if p).strip()
        return name or None

    # 8. Explode: dataset × district_area_nid × reviewer_user_id
    raw_rows: List[Dict] = []
    for dataset in all_datasets:
        area_nids: List = dataset.area_nids or []
        for a_nid_raw in area_nids:
            a_nid = int(a_nid_raw)
            area_info = district_lookup.get(a_nid)
            if area_info is None:
                continue

            reviewer_user_ids = reviewer_area_map.get(a_nid, [])

            if reviewer_user_ids:
                for uid in reviewer_user_ids:
                    reviewer_name = _full_name(user_map.get(uid))
                    raw_rows.append({
                        "state_name": area_info["parent_area_name"],
                        "district_name": area_info["area_name"],
                        "dataset_name": dataset.dataset_name,
                        "dataset_status": dataset.dataset_status,
                        "review_status": _review_status(dataset.dataset_status),
                        "date_submitted": dataset.submitted_at,
                        "reviewer_assigned": reviewer_name,
                        "date_returned": dataset.last_returned_at,
                        "date_approved": dataset.approved_on,
                    })
            else:
                # No reviewer assigned for this area — still show a row with null reviewer
                raw_rows.append({
                    "state_name": area_info["parent_area_name"],
                    "district_name": area_info["area_name"],
                    "dataset_name": dataset.dataset_name,
                    "dataset_status": dataset.dataset_status,
                    "review_status": _review_status(dataset.dataset_status),
                    "date_submitted": dataset.submitted_at,
                    "reviewer_assigned": None,
                    "date_returned": dataset.last_returned_at,
                    "date_approved": dataset.approved_on,
                })

    # 9. Filter, search, sort
    raw_rows = _apply_review_status_filter(raw_rows, review_status)
    raw_rows = _apply_date_range_filters(
        raw_rows,
        date_submitted_from,
        date_submitted_to,
        date_returned_from,
        date_returned_to,
        date_approved_from,
        date_approved_to,
    )
    raw_rows = _apply_search(raw_rows, search, search_by)
    _apply_sort(raw_rows, sort_field, sort_order)

    # 10. Paginate
    total_count = len(raw_rows)
    total_pages = math.ceil(total_count / page_size) if page_size else 0
    offset = (page - 1) * page_size
    page_slice = raw_rows[offset: offset + page_size]

    # 11. Build ReviewStatusReportRow objects
    rows: List[ReviewStatusReportRow] = []
    for i, r in enumerate(page_slice, start=offset + 1):
        rows.append(
            ReviewStatusReportRow(
                sno=i,
                current_timeperiod=current_timeperiod_label,
                state_name=r["state_name"],
                district_name=r["district_name"],
                dataset_name=r["dataset_name"],
                date_submitted=r["date_submitted"],
                reviewer_assigned=r["reviewer_assigned"],
                review_status=_review_status(r["dataset_status"]),
                date_returned=r["date_returned"],
                date_approved=r["date_approved"],
            )
        )

    data = ReviewStatusReportData(
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
