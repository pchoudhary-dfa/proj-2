"""
Operational Dashboard service.

Serves:
    GET /dw/{dw_id}/reports/operational-dashboard
        ?workflow_id=<int>
        &area_identifier=<str>
        &timeperiod_identifier=<str>

Returns a single response with summary metrics, per-area status/completeness rows
(each with a nested dataset list whose data-point counts are scoped to that area +
the selected timeperiod), and two completeness bar charts (by district and by state).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from typing import Collection, Dict, List, Optional, Tuple

from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from apps.app_db.models.core import (
    Dataset,
    DatasetDataPoint,
    IamUser,
    IamUserRoleContent,
    WorkflowDataentryRule,
)
from apps.datawarehouse.schemas.operational_dashboard import (
    CompletenessBarItem,
    OperationalDashboardAreaRow,
    OperationalDashboardDatasetItem,
    OperationalDashboardResponse,
    OperationalDashboardSummary,
)
from apps.shared.exceptions import NotFound, BadRequest

logger = logging.getLogger(__name__)

# dataset statuses included in the dashboard (DELETED / REJECTED are excluded)
_ACTIVE_STATUSES = {"DRAFT", "PENDING_REVIEW", "REVISION", "APPROVED"}
_SUBMITTED_STATUSES = {"PENDING_REVIEW", "APPROVED"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _dp_missing_expr():
    """SQL expression returning 1 when both value columns are null, else 0."""
    return case(
        (
            and_(
                DatasetDataPoint.data_value.is_(None),
                DatasetDataPoint.textual_data_value.is_(None),
            ),
            1,
        ),
        else_=0,
    )


def _batch_dp_counts_for_area_and_period(
    db: Session,
    dataset_ids: Collection[int],
    area_nids: Collection[int],
    timeperiod_nid: Optional[int],
) -> Dict[Tuple[int, int], Tuple[int, int]]:
    """
    Single grouped query returning (total, missing) counts per (dataset_id, area_nid).

    Filters:
        - dataset_id IN dataset_ids
        - area_nid IN area_nids
        - is_deleted = false  (soft-deleted rows excluded from completeness)
        - timeperiod_nid == timeperiod_nid   (only when timeperiod_nid is not None)

    Returns dict keyed by (dataset_id, area_nid) → (total, missing).
    """
    if not dataset_ids or not area_nids:
        return {}

    missing_expr = _dp_missing_expr()
    q = (
        db.query(
            DatasetDataPoint.dataset_id,
            DatasetDataPoint.area_nid,
            func.count(DatasetDataPoint.data_point_id),
            func.sum(missing_expr),
        )
        .filter(
            DatasetDataPoint.dataset_id.in_(list(dataset_ids)),
            DatasetDataPoint.area_nid.in_(list(area_nids)),
            DatasetDataPoint.is_deleted.is_(False),
        )
    )
    if timeperiod_nid is not None:
        q = q.filter(DatasetDataPoint.timeperiod_nid == timeperiod_nid)

    q = q.group_by(DatasetDataPoint.dataset_id, DatasetDataPoint.area_nid)
    rows = q.all()
    return {
        (int(r[0]), int(r[1])): (int(r[2]), int(r[3] or 0))
        for r in rows
    }


def _resolve_timeperiod_nid(
    dw_id: int,
    locale: str,
    identifier: Optional[str],
    fallback_nid: Optional[int],
) -> Optional[int]:
    """
    Resolve timeperiod identifier to a NID.

    - If identifier is provided: try numeric NID first, then timeperiod string value.
    - Else fall back to fallback_nid (curr_timeperiod_nid from WorkflowDataentryRule).
    - Returns None when neither can be resolved (no period filter applied).
    """
    if not identifier:
        return fallback_nid

    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import TimePeriod

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        if identifier.isdigit():
            row = dw_db.query(TimePeriod).filter(
                TimePeriod.timeperiod_nid == int(identifier)
            ).first()
        else:
            row = dw_db.query(TimePeriod).filter(
                TimePeriod.timeperiod == identifier
            ).first()
        if row is None:
            raise NotFound(f"Time period not found: {identifier!r}")
        return int(row.timeperiod_nid)


def _fetch_area_level_name(
    dw_id: int,
    locale: str,
    area_level: int,
) -> Optional[str]:
    """Return display name for a given area_level integer, or None if not found."""
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import AreaLevel

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        AreaLevelModel = AreaLevel(locale)
        row = dw_db.query(AreaLevelModel).filter(
            AreaLevelModel.area_level == area_level
        ).first()
        return row.area_level_name if row else None


def _fetch_district_areas(
    dw_id: int,
    locale: str,
    area_level: int,
    parent_area_nid: Optional[int],
) -> List[Dict]:
    """
    Fetch all areas at `area_level` from the DW, optionally filtered by parent.

    Each returned dict has:
        area_nid, area_name, area_gid, parent_area_nid (raw), parent_area_name (or None)

    When parent_area_nid is provided, only districts whose area_parent_nid equals that
    value are returned (the parent/state-level filter).
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Area

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        AreaModel = Area(locale)

        # self-alias for parent join
        ParentAlias = Area(locale)

        # query districts at the configured level
        q = (
            dw_db.query(
                AreaModel.area_nid,
                AreaModel.area_name,
                AreaModel.area_gid,
                AreaModel.area_parent_nid,
            )
            .filter(AreaModel.area_level == area_level)
            .order_by(AreaModel.area_name)
        )
        if parent_area_nid is not None:
            q = q.filter(AreaModel.area_parent_nid == parent_area_nid)

        district_rows = q.all()

        if not district_rows:
            return []

        # batch-fetch parent names to avoid N+1
        parent_nids = {
            int(r[3]) for r in district_rows if r[3] is not None and int(r[3]) not in (0, -1)
        }
        parent_name_map: Dict[int, str] = {}
        if parent_nids:
            parent_rows = (
                dw_db.query(ParentAlias.area_nid, ParentAlias.area_name)
                .filter(ParentAlias.area_nid.in_(list(parent_nids)))
                .all()
            )
            parent_name_map = {int(r[0]): r[1] for r in parent_rows}

        result = []
        for r in district_rows:
            p_nid = int(r[3]) if r[3] is not None else None
            result.append({
                "area_nid": int(r[0]),
                "area_name": r[1],
                "area_gid": r[2],
                "parent_area_nid": p_nid if p_nid not in (None, 0, -1) else None,
                "parent_area_name": parent_name_map.get(p_nid) if p_nid not in (None, 0, -1) else None,
            })
        return result


def _resolve_parent_area_nid(
    dw_id: int,
    locale: str,
    area_identifier: str,
) -> int:
    """
    Resolve an area identifier (numeric NID, area_id, or area_gid) to a NID.
    Used for the area_identifier (state/parent-level) filter.
    Raises NotFound if the area cannot be resolved.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Area

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        AreaModel = Area(locale)
        if area_identifier.isdigit():
            row = dw_db.query(AreaModel).filter(
                AreaModel.area_nid == int(area_identifier)
            ).first()
        else:
            row = (
                dw_db.query(AreaModel)
                .filter(
                    (AreaModel.area_gid == area_identifier)
                    | (AreaModel.area_id == area_identifier)
                )
                .first()
            )
        if row is None:
            raise NotFound(f"Area not found: {area_identifier!r}")
        return int(row.area_nid)


def _get_assigned_area_nids(db: Session, workflow_id: int) -> set:
    """
    Return the distinct area NIDs that have at least one IAM user assignment
    (any role) for the given workflow.

    Checks iam_user_role_content where resource_code='dm_dw_area' and
    workflow_id matches. Both data-entry and reviewer assignments are included.
    """
    rows = (
        db.query(IamUserRoleContent.content_id)
        .filter(
            IamUserRoleContent.resource_code == "dm_dw_area",
            IamUserRoleContent.workflow_id == workflow_id,
            IamUserRoleContent.content_id.isnot(None),
        )
        .distinct()
        .all()
    )
    return {int(r[0]) for r in rows}


def _completeness_pct(total: int, missing: int) -> Optional[float]:
    """Compute completeness % or None when total is 0."""
    if total == 0:
        return None
    return round((total - missing) / total * 100, 2)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def get_operational_dashboard(
    db: Session,
    dw_id: int,
    workflow_id: int,
    locale: str,
    area_identifier: Optional[str] = None,
    timeperiod_identifier: Optional[str] = None,
    only_assigned_areas: bool = True,
) -> OperationalDashboardResponse:
    """
    Build and return the full operational dashboard for a workflow in a datawarehouse.

    Steps:
        1. Resolve workflow config (area_level, curr_timeperiod_nid).
        2. Resolve timeperiod NID.
        3. Fetch area level display names.
        4. Fetch district areas (optionally filtered by parent area).
        5. Fetch all active datasets for this workflow + timeperiod filter.
        6. Group datasets by district area_nid.
        7. Batch count data points per (dataset_id, area_nid) + timeperiod.
        8. Build area rows, summary, and completeness bars.
    """
    # ------------------------------------------------------------------
    # 1. Workflow config
    # ------------------------------------------------------------------
    rule: Optional[WorkflowDataentryRule] = (
        db.query(WorkflowDataentryRule)
        .filter(WorkflowDataentryRule.workflow_id == workflow_id)
        .first()
    )
    if rule is None:
        raise NotFound(f"Workflow data entry configuration not found for workflow_id={workflow_id}")

    configured_area_level: Optional[int] = rule.area_level
    if configured_area_level is None:
        raise BadRequest(
            "Workflow data entry rule has no area_level configured — operational dashboard unavailable"
        )

    # ------------------------------------------------------------------
    # 2. Resolve timeperiod
    # ------------------------------------------------------------------
    selected_tp_nid = _resolve_timeperiod_nid(
        dw_id,
        locale,
        timeperiod_identifier,
        rule.curr_timeperiod_nid,
    )

    # ------------------------------------------------------------------
    # 3. Area level display names
    # ------------------------------------------------------------------
    area_level_name = _fetch_area_level_name(dw_id, locale, configured_area_level)
    parent_level = configured_area_level - 1 if configured_area_level > 1 else None
    parent_level_name: Optional[str] = None
    if parent_level is not None:
        parent_level_name = _fetch_area_level_name(dw_id, locale, parent_level)

    # ------------------------------------------------------------------
    # 4. District areas (optionally filtered by parent)
    # ------------------------------------------------------------------
    parent_area_nid: Optional[int] = None
    if area_identifier:
        parent_area_nid = _resolve_parent_area_nid(dw_id, locale, area_identifier)

    district_areas = _fetch_district_areas(dw_id, locale, configured_area_level, parent_area_nid)

    if only_assigned_areas:
        assigned_nids = _get_assigned_area_nids(db, workflow_id)
        district_areas = [a for a in district_areas if a["area_nid"] in assigned_nids]

    district_nids: List[int] = [a["area_nid"] for a in district_areas]
    district_map: Dict[int, Dict] = {a["area_nid"]: a for a in district_areas}

    # ------------------------------------------------------------------
    # 5. Fetch datasets
    # ------------------------------------------------------------------
    ds_query = db.query(Dataset).filter(
        Dataset.dw_id == dw_id,
        Dataset.workflow_id == workflow_id,
        Dataset.dataset_status.in_(list(_ACTIVE_STATUSES)),
    )
    if selected_tp_nid is not None:
        ds_query = ds_query.filter(
            func.json_contains(Dataset.timeperiod_nids, str(selected_tp_nid)) == 1
        )
    all_datasets: List[Dataset] = ds_query.all()

    all_dataset_ids = [d.dataset_id for d in all_datasets]

    # Resolve submitter names in bulk
    submitter_ids = {d.submitted_by_user_id for d in all_datasets if d.submitted_by_user_id}
    submitter_name_map: Dict[int, str] = {}
    if submitter_ids:
        user_rows = (
            db.query(IamUser.id, IamUser.first_name, IamUser.last_name)
            .filter(IamUser.id.in_(list(submitter_ids)))
            .all()
        )
        for u in user_rows:
            parts = [p for p in (u[1], u[2]) if p]
            submitter_name_map[int(u[0])] = " ".join(parts) if parts else ""

    # ------------------------------------------------------------------
    # 6. Group datasets by district area_nid (based on dataset.area_nids)
    # ------------------------------------------------------------------
    # district_nids_set for O(1) lookup
    district_nids_set = set(district_nids)

    # datasets_by_area: area_nid → [dataset, ...]
    datasets_by_area: Dict[int, List[Dataset]] = defaultdict(list)
    for d in all_datasets:
        if not d.area_nids:
            continue
        for a_nid in d.area_nids:
            if int(a_nid) in district_nids_set:
                datasets_by_area[int(a_nid)].append(d)

    # ------------------------------------------------------------------
    # 7. Derive visible datasets (those with at least one area in the district set)
    #    and batch count data points per (dataset_id, area_nid) + timeperiod.
    #    Using visible_dataset_ids for the DP query avoids hitting datasets that
    #    cover areas at a different level or outside the applied area filter.
    # ------------------------------------------------------------------
    visible_dataset_ids: set[int] = {
        d.dataset_id
        for area_datasets_list in datasets_by_area.values()
        for d in area_datasets_list
    }
    visible_datasets = [d for d in all_datasets if d.dataset_id in visible_dataset_ids]

    dp_counts: Dict[Tuple[int, int], Tuple[int, int]] = {}
    if visible_dataset_ids and district_nids:
        dp_counts = _batch_dp_counts_for_area_and_period(
            db, list(visible_dataset_ids), district_nids, selected_tp_nid
        )

    # ------------------------------------------------------------------
    # 8. Build area rows
    # ------------------------------------------------------------------
    area_rows: List[OperationalDashboardAreaRow] = []

    for area_info in district_areas:
        a_nid = area_info["area_nid"]
        area_datasets = datasets_by_area.get(a_nid, [])

        dataset_items: List[OperationalDashboardDatasetItem] = []
        area_completeness_vals: List[float] = []
        last_updated: Optional[datetime] = None

        for d in area_datasets:
            total, missing = dp_counts.get((d.dataset_id, a_nid), (0, 0))
            pct = _completeness_pct(total, missing)
            if pct is not None:
                area_completeness_vals.append(pct)

            # track most recent update for this area
            if d.last_updated_at:
                if last_updated is None or d.last_updated_at > last_updated:
                    last_updated = d.last_updated_at

            submitter_name = (
                submitter_name_map.get(d.submitted_by_user_id)
                if d.submitted_by_user_id
                else None
            )

            dataset_items.append(
                OperationalDashboardDatasetItem(
                    dataset_id=d.dataset_id,
                    dataset_name=d.dataset_name,
                    dataset_gid=d.dataset_gid,
                    dataset_status=d.dataset_status,
                    area_dp_total=total,
                    area_dp_missing=missing,
                    completeness_pct=pct,
                    created=d.created,
                    submitted_at=d.submitted_at,
                    submitted_by_name=submitter_name,
                    timeperiod_nid=selected_tp_nid,
                )
            )

        area_completeness_pct: Optional[float] = None
        if area_completeness_vals:
            area_completeness_pct = round(
                sum(area_completeness_vals) / len(area_completeness_vals), 2
            )

        # status counts
        submitted_count = sum(
            1 for d in area_datasets if d.dataset_status in _SUBMITTED_STATUSES
        )
        approved_count = sum(1 for d in area_datasets if d.dataset_status == "APPROVED")
        under_review_count = sum(1 for d in area_datasets if d.dataset_status == "PENDING_REVIEW")
        returned_count = sum(1 for d in area_datasets if d.dataset_status == "REVISION")
        draft_count = sum(1 for d in area_datasets if d.dataset_status == "DRAFT")

        area_rows.append(
            OperationalDashboardAreaRow(
                area_nid=a_nid,
                area_name=area_info["area_name"],
                area_gid=area_info["area_gid"],
                parent_area_nid=area_info["parent_area_nid"],
                parent_area_name=area_info["parent_area_name"],
                submitted_dataset_count=submitted_count,
                approved_count=approved_count,
                under_review_count=under_review_count,
                returned_count=returned_count,
                draft_count=draft_count,
                completeness_pct=area_completeness_pct,
                last_updated=last_updated,
                datasets=dataset_items,
            )
        )

    # ------------------------------------------------------------------
    # 9. Summary metrics — scoped to visible_datasets so that the header
    #    cards reflect only the districts shown in the table (respects the
    #    area_identifier filter).
    # ------------------------------------------------------------------
    total_datasets = len(visible_datasets)
    submitted_datasets = sum(1 for d in visible_datasets if d.dataset_status in _SUBMITTED_STATUSES)
    not_submitted = total_datasets - submitted_datasets
    under_review_total = sum(1 for d in visible_datasets if d.dataset_status == "PENDING_REVIEW")
    returned_total = sum(1 for d in visible_datasets if d.dataset_status == "REVISION")
    approved_total = sum(1 for d in visible_datasets if d.dataset_status == "APPROVED")

    summary = OperationalDashboardSummary(
        expected_districts=len(district_areas),
        total_datasets=total_datasets,
        submitted_datasets=submitted_datasets,
        not_submitted=not_submitted,
        under_review=under_review_total,
        returned_for_revision=returned_total,
        approved=approved_total,
    )

    # ------------------------------------------------------------------
    # 10. Completeness bar charts
    # ------------------------------------------------------------------

    # completeness_by_district: uses filtered area_rows (respects area_identifier
    # and only_assigned_areas so the district bars match the main table).
    completeness_by_district: List[CompletenessBarItem] = sorted(
        [
            CompletenessBarItem(
                area_nid=row.area_nid,
                area_name=row.area_name,
                completeness_pct=row.completeness_pct,
            )
            for row in area_rows
        ],
        key=lambda x: (x.completeness_pct is None, -(x.completeness_pct or 0)),
    )

    # completeness_by_state: always uses ALL districts at the configured level
    # regardless of area_identifier / only_assigned_areas, so every state bar
    # reflects the full picture.
    #
    # Optimisation: when neither filter is active, district_areas already covers
    # every district, so we reuse area_rows without an extra DW round-trip.
    filters_active = bool(area_identifier) or only_assigned_areas
    if not filters_active:
        # No filters — area_rows already has all districts; derive state source directly.
        state_source: List[Dict] = [
            {
                "parent_area_nid": row.parent_area_nid,
                "parent_area_name": row.parent_area_name,
                "completeness_pct": row.completeness_pct,
            }
            for row in area_rows
        ]
    else:
        # One or more filters active — fetch all districts from DW without restriction.
        all_unfiltered_areas = _fetch_district_areas(dw_id, locale, configured_area_level, None)
        all_unfiltered_nids = [a["area_nid"] for a in all_unfiltered_areas]
        all_unfiltered_nids_set = set(all_unfiltered_nids)

        # Group all datasets by each unfiltered district.
        all_datasets_by_area: Dict[int, List[Dataset]] = defaultdict(list)
        for d in all_datasets:
            for a_nid in (d.area_nids or []):
                if int(a_nid) in all_unfiltered_nids_set:
                    all_datasets_by_area[int(a_nid)].append(d)

        # Batch DP counts for the unfiltered district set.
        unfiltered_visible_ids: set[int] = {
            d.dataset_id
            for ds_list in all_datasets_by_area.values()
            for d in ds_list
        }
        all_dp_counts: Dict[Tuple[int, int], Tuple[int, int]] = {}
        if unfiltered_visible_ids and all_unfiltered_nids:
            all_dp_counts = _batch_dp_counts_for_area_and_period(
                db, list(unfiltered_visible_ids), all_unfiltered_nids, selected_tp_nid
            )

        state_source = []
        for area_info in all_unfiltered_areas:
            a_nid = area_info["area_nid"]
            pct_vals: List[float] = []
            for d in all_datasets_by_area.get(a_nid, []):
                total, missing = all_dp_counts.get((d.dataset_id, a_nid), (0, 0))
                pct = _completeness_pct(total, missing)
                if pct is not None:
                    pct_vals.append(pct)
            area_pct = round(sum(pct_vals) / len(pct_vals), 2) if pct_vals else None
            state_source.append(
                {
                    "parent_area_nid": area_info["parent_area_nid"],
                    "parent_area_name": area_info["parent_area_name"],
                    "completeness_pct": area_pct,
                }
            )

    # Aggregate district completeness values up to state level.
    state_completeness: Dict[int, Dict] = {}
    for district in state_source:
        p_nid = district["parent_area_nid"]
        if p_nid is None:
            continue
        if p_nid not in state_completeness:
            state_completeness[p_nid] = {
                "area_name": district["parent_area_name"] or str(p_nid),
                "vals": [],
            }
        if district["completeness_pct"] is not None:
            state_completeness[p_nid]["vals"].append(district["completeness_pct"])

    completeness_by_state: List[CompletenessBarItem] = []
    for s_nid, info in state_completeness.items():
        vals = info["vals"]
        pct = round(sum(vals) / len(vals), 2) if vals else None
        completeness_by_state.append(
            CompletenessBarItem(
                area_nid=s_nid,
                area_name=info["area_name"],
                completeness_pct=pct,
            )
        )
    completeness_by_state.sort(
        key=lambda x: (x.completeness_pct is None, -(x.completeness_pct or 0))
    )

    return OperationalDashboardResponse(
        summary=summary,
        area_level=configured_area_level,
        area_level_name=area_level_name,
        parent_level=parent_level,
        parent_level_name=parent_level_name,
        selected_timeperiod_nid=selected_tp_nid,
        areas=area_rows,
        completeness_by_district=completeness_by_district,
        completeness_by_state=completeness_by_state,
    )
