"""
Data Reviewer Report service.

Serves:
    GET /dw/{dw_id}/reports/operational-reports/{workflow_id}/data-reviewer
        ?page=<int>
        &page_size=<int>

Returns a paginated table of data reviewers assigned to a workflow.
Each row is one reviewer × one district area they are assigned to (via
iam_user_role_content where the role carries dm_dw_data_review permission).

datasets_assigned_count is the number of datasets for the workflow that
include the district's area_nid in their area_nids JSON array (excluding
DELETED and REJECTED datasets). Computed Python-side to avoid per-row
SQL JSON_CONTAINS calls.
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
    IamRole,
    IamRoleI18n,
    IamRoleResourceApi,
    IamUser,
    IamUserRoleContent,
    WorkflowDataentryRule,
)
from apps.datawarehouse.schemas.data_reviewer_report import (
    DataReviewerReportData,
    DataReviewerReportRow,
)
from apps.datawarehouse.schemas.operational_reports import OperationalReportColumnLabels
from apps.shared.exceptions import BadRequest, NotFound

logger = logging.getLogger(__name__)

_REVIEWER_RESOURCE_CODE = "dm_dw_data_review"
_EXCLUDED_STATUSES = {"DELETED", "REJECTED"}

_SEARCH_BY_FIELDS = frozenset({"reviewer_name", "institution", "role", "email", "phone", "district_assigned"})
_SORT_FIELDS = frozenset({"reviewer_name", "institution", "role", "email", "district_assigned"})


# ---------------------------------------------------------------------------
# List param helpers
# ---------------------------------------------------------------------------

def _validate_list_params(
    search: Optional[str],
    search_by: Optional[str],
    sort_field: Optional[str],
    sort_order: str,
    last_login_from: Optional[datetime] = None,
    last_login_to: Optional[datetime] = None,
) -> None:
    """Validate search, sort, and date-range query parameters."""
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
        last_login_from is not None
        and last_login_to is not None
        and last_login_from > last_login_to
    ):
        raise BadRequest(
            "last_login_from must be less than or equal to last_login_to",
            details={
                "last_login_from": last_login_from.isoformat(),
                "last_login_to": last_login_to.isoformat(),
            },
        )


def _apply_date_range_filter(
    rows: List[Dict],
    last_login_from: Optional[datetime],
    last_login_to: Optional[datetime],
) -> List[Dict]:
    """Filter rows by inclusive last_login range; null last_login rows are excluded when a bound is set."""
    if last_login_from is None and last_login_to is None:
        return rows
    return [
        r for r in rows
        if r["last_login"] is not None
        and (last_login_from is None or r["last_login"] >= last_login_from)
        and (last_login_to is None or r["last_login"] <= last_login_to)
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
                r["reviewer_name"] or "",
            ),
        )
        return

    rows.sort(
        key=lambda r: r.get(sort_field) or "",
        reverse=descending,
    )


# ---------------------------------------------------------------------------
# Internal helpers (DW lookups — same pattern as other report services)
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
                "parent_area_name": parent_name_map.get(p_nid_clean) if p_nid_clean else None,
            }
        return lookup


# ---------------------------------------------------------------------------
# IAM helpers
# ---------------------------------------------------------------------------

def _build_reviewer_area_map(
    db: Session,
    workflow_id: int,
) -> Dict[int, List[Tuple[int, int]]]:
    """
    Build area_nid → [(user_id, role_id), ...] for reviewers assigned to
    the workflow whose role carries dm_dw_data_review permission.
    """
    resource_row = (
        db.query(IamResource.id)
        .filter(IamResource.resource_code == _REVIEWER_RESOURCE_CODE)
        .first()
    )
    if resource_row is None:
        logger.warning(
            "IAM resource '%s' not found — no reviewer assignments possible",
            _REVIEWER_RESOURCE_CODE,
        )
        return {}

    resource_id = resource_row[0]

    role_id_rows = (
        db.query(IamRoleResourceApi.role_id)
        .filter(IamRoleResourceApi.resource_id == resource_id)
        .distinct()
        .all()
    )
    reviewer_role_ids: Set[int] = {r[0] for r in role_id_rows if r[0] is not None}

    if not reviewer_role_ids:
        logger.info(
            "No roles carry '%s' permission — no reviewer assignments", _REVIEWER_RESOURCE_CODE
        )
        return {}

    assignment_rows = (
        db.query(
            IamUserRoleContent.content_id,
            IamUserRoleContent.user_id,
            IamUserRoleContent.role_id,
        )
        .filter(
            IamUserRoleContent.workflow_id == workflow_id,
            IamUserRoleContent.resource_code == "dm_dw_area",
            IamUserRoleContent.role_id.in_(list(reviewer_role_ids)),
            IamUserRoleContent.content_id.isnot(None),
            IamUserRoleContent.user_id.isnot(None),
        )
        .all()
    )

    area_reviewer_map: Dict[int, List[Tuple[int, int]]] = defaultdict(list)
    for area_nid, user_id, role_id in assignment_rows:
        area_reviewer_map[int(area_nid)].append((int(user_id), int(role_id)))

    return dict(area_reviewer_map)


def _build_role_name_map(
    db: Session,
    role_ids: Set[int],
    locale: str,
) -> Dict[int, str]:
    """
    Return role_id → display_name (locale-aware, fallback to role_code).
    """
    if not role_ids:
        return {}

    role_id_list = list(role_ids)

    i18n_rows = (
        db.query(IamRoleI18n.master_id, IamRoleI18n.name)
        .filter(
            IamRoleI18n.master_id.in_(role_id_list),
            IamRoleI18n.locale == locale,
        )
        .all()
    )
    name_map: Dict[int, str] = {int(r[0]): r[1] for r in i18n_rows}

    missing_ids = role_ids - set(name_map.keys())
    if missing_ids:
        fallback_rows = (
            db.query(IamRole.id, IamRole.role_code)
            .filter(IamRole.id.in_(list(missing_ids)))
            .all()
        )
        for role_id, role_code in fallback_rows:
            name_map[int(role_id)] = role_code

    return name_map


def _build_area_dataset_count_map(
    db: Session,
    workflow_id: int,
) -> Dict[int, int]:
    """
    Build area_nid → dataset_count for the workflow.

    Fetches all non-deleted/rejected datasets and aggregates in Python to
    avoid per-row SQL JSON_CONTAINS calls.
    """
    datasets = (
        db.query(Dataset.area_nids)
        .filter(
            Dataset.workflow_id == workflow_id,
            Dataset.dataset_status.notin_(list(_EXCLUDED_STATUSES)),
        )
        .all()
    )

    area_count: Dict[int, int] = defaultdict(int)
    for (area_nids,) in datasets:
        for a_nid_raw in (area_nids or []):
            area_count[int(a_nid_raw)] += 1

    return dict(area_count)


# ---------------------------------------------------------------------------
# Public service function
# ---------------------------------------------------------------------------

def get_data_reviewer_report(
    db: Session,
    dw_id: int,
    workflow_id: int,
    locale: str,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort_field: Optional[str] = None,
    sort_order: str = "asc",
    last_login_from: Optional[datetime] = None,
    last_login_to: Optional[datetime] = None,
) -> Tuple[DataReviewerReportData, Dict]:
    """
    Build the Data Reviewer Report paginated response.

    Returns:
        (DataReviewerReportData, meta_dict)
    """
    _validate_list_params(search, search_by, sort_field, sort_order, last_login_from, last_login_to)

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

    # 4. Build reviewer area map: area_nid → [(user_id, role_id), ...]
    reviewer_area_map = _build_reviewer_area_map(db, workflow_id)

    _empty_meta = {
        "total_count": 0,
        "count": 0,
        "page": page,
        "page_size": page_size,
        "total_pages": 0,
    }

    if not reviewer_area_map:
        return (
            DataReviewerReportData(
                column_labels=OperationalReportColumnLabels(
                    state_label=state_label,
                    district_label=district_label,
                ),
                current_timeperiod_label=current_timeperiod_label,
                rows=[],
            ),
            _empty_meta,
        )

    # 5. Fetch district area lookup from DW
    district_lookup = _fetch_district_area_lookup(dw_id, locale, configured_area_level)

    # 6. Collect all user_ids and role_ids
    all_user_ids: Set[int] = set()
    all_role_ids: Set[int] = set()
    for assignments in reviewer_area_map.values():
        for user_id, role_id in assignments:
            all_user_ids.add(user_id)
            all_role_ids.add(role_id)

    # 7. Batch-load IamUser records
    user_map: Dict[int, IamUser] = {}
    if all_user_ids:
        users = (
            db.query(IamUser)
            .filter(IamUser.id.in_(list(all_user_ids)))
            .all()
        )
        user_map = {u.id: u for u in users}

    # 8. Batch-load role display names
    role_name_map = _build_role_name_map(db, all_role_ids, locale)

    # 9. Build area_nid → dataset_count map
    area_dataset_count = _build_area_dataset_count_map(db, workflow_id)

    def _full_name(user: Optional[IamUser]) -> Optional[str]:
        if user is None:
            return None
        parts = [user.first_name or "", user.last_name or ""]
        name = " ".join(p for p in parts if p).strip()
        return name or None

    # 10. Explode: area_nid × (user_id, role_id) where area_nid in district_lookup
    raw_rows: List[Dict] = []
    for area_nid, assignments in reviewer_area_map.items():
        area_info = district_lookup.get(area_nid)
        if area_info is None:
            continue

        for user_id, role_id in assignments:
            user = user_map.get(user_id)
            raw_rows.append({
                "reviewer_name": _full_name(user),
                "email": user.email if user else None,
                "phone": user.phone if user else None,
                "institution": user.organisation if user else None,
                "role": role_name_map.get(role_id),
                "state_assigned": area_info["parent_area_name"],
                "district_assigned": area_info["area_name"],
                "datasets_assigned_count": area_dataset_count.get(area_nid, 0),
                "last_login": user.last_loggedin_on if user else None,
            })

    # 11. Filter, search, sort
    raw_rows = _apply_date_range_filter(raw_rows, last_login_from, last_login_to)
    raw_rows = _apply_search(raw_rows, search, search_by)
    _apply_sort(raw_rows, sort_field, sort_order)

    # 12. Paginate
    total_count = len(raw_rows)
    total_pages = math.ceil(total_count / page_size) if page_size else 0
    offset = (page - 1) * page_size
    page_slice = raw_rows[offset: offset + page_size]

    rows: List[DataReviewerReportRow] = []
    for i, r in enumerate(page_slice, start=offset + 1):
        rows.append(
            DataReviewerReportRow(
                sno=i,
                reviewer_name=r["reviewer_name"],
                email=r["email"],
                phone=r["phone"],
                institution=r["institution"],
                role=r["role"],
                state_assigned=r["state_assigned"],
                district_assigned=r["district_assigned"],
                current_timeperiod=current_timeperiod_label,
                datasets_assigned_count=r["datasets_assigned_count"],
                last_login=r["last_login"],
            )
        )

    data = DataReviewerReportData(
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
