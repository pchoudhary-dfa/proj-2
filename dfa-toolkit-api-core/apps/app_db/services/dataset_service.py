"""
Dataset service — operator and reviewer operations.

Operator endpoints (explicit dataset ID):
    create_dataset          POST   /dw/{dw_id}/dataset
    list_datasets           GET    /dw/{dw_id}/dataset
    get_dataset             GET    /dw/{dw_id}/dataset/{dataset_id}
    get_dataset_data_points GET    /dw/{dw_id}/dataset/{dataset_id}/data-points
    upsert_data_points      PATCH  /dw/{dw_id}/dataset/{dataset_id}/data-points
    operator_transition     PATCH  /dw/{dw_id}/dataset/{dataset_id}
    delete_dataset          DELETE /dw/{dw_id}/dataset/{dataset_id}

Unified FED endpoints (dataset_id required):
    get_unified_data_points         GET    /dw/{dw_id}/data-points
    unified_upsert_data_points      PATCH  /dw/{dw_id}/data-points
    unified_delete_data_points      DELETE /dw/{dw_id}/data-points
    unified_delete_data_point       DELETE /dw/{dw_id}/data-point/{id}
    unified_submit                  PATCH  /dw/{dw_id}/dataset

Comment endpoints:
    add_comment             POST   /dw/{dw_id}/dataset/{dataset_id}/comments
    list_comments           GET    /dw/{dw_id}/dataset/{dataset_id}/comments

Reviewer endpoints:
    list_review_datasets    GET    /dw/{dw_id}/dataset/review  (workflow_id, area_nid, period_id, status, search, search_by, sort_field, sort_order)
    get_review_grid         GET    /dw/{dw_id}/dataset/{dataset_id}/review
    reviewer_decision       POST   /dw/{dw_id}/dataset/{dataset_id}/review  (approved[] / rejected[]; status=REVISION or APPROVED)

Error convention:
    Functions raise ValueError("<ERROR_CODE>") for business-rule violations.
    Callers (router) map error codes to HTTP responses.

Error codes:
    WORKFLOW_NOT_FOUND       — workflow_id does not exist or is inactive
    WORKFLOW_DW_MISMATCH     — workflow belongs to a different DW
    DATASET_NOT_FOUND        — dataset_id not found for this dw_id / user
    DATASET_NOT_EDITABLE     — dataset status does not allow data-point edits
    NO_DATA_POINTS           — submit attempted on a dataset with zero rows
    EXCLUSIVITY_CONFLICT     — another active dataset on same DW holds same IUS×source×area×tp combo
    TRANSITION_NOT_ALLOWED   — status transition is not valid from current state
    DELETE_NOT_ALLOWED       — only DRAFT datasets may be permanently deleted
    NOT_AUTHORIZED           — reviewer has no active slice for this dataset / no review access to resource
    DATASET_NOT_REVIEWABLE   — dataset is not in a reviewable state
    INVALID_DATA_POINT       — data_point_id not in reviewer's scope
    STAGE_APPROVAL_NOT_READY — status APPROVED but not all active-stage slices are fully approved yet
    DATASET_ID_REQUIRED      — dataset_id must be provided
    DATA_POINT_NOT_FOUND     — data_point_id not found in this dataset
    UNKNOWN_IUS_NID          — one or more iusnid values are not present in ut_indicator_unit_subgroup
    INVALID_DATASET_LIST_SORT_FIELD — list_datasets sort_field not in allowed set
    INVALID_DATASET_LIST_SEARCH_FIELD — list_datasets search_by not in allowed set
    UNIFIED_DATAPOINT_SEARCH_SORT_UNSCOPED — search without dataset_id/scope, or sort on unscoped whole-table browse

    UnifiedUpsertPreflightError — PATCH /dw/{dw_id}/data-points batch preflight failures
        (expose ``.failures`` list; resolver + AREA_NOT_ASSIGNED before commit)

"""
import html
import json
import logging
import math
import uuid
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from typing import Any, Collection, Iterable, Iterator, List, NamedTuple, Optional, Sequence, Set, Tuple

from apps.shared.exceptions import AppException, BadRequest, Conflict
from apps.shared.utils.log_event import log_background_incident
from sqlalchemy import and_, asc, case, desc, func, or_
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import Session

from apps.app_db.models.core import (
    Dataset,
    DatasetDataPoint,
    DatasetRejectionReason,
    DatasetRejectionReasonI18n,
    DatasetReviewActionLog,
    DatasetReviewComment,
    DatasetReviewSlice,
    DatasetReviewSliceRejection,
    DatasetReviewStage,
    IamUser,
    IamUserRole,
    IamUserRoleContent,
    ReviewWorkflow,
    ReviewWorkflowI18n,
    ReviewWorkflowLevel,
    WorkflowDataentryRule,
)
from apps.app_db.schemas.dataset import (
    DataPointDeleteRequest,
    DataPointDeleteResponse,
    DataPointInput,
    DataPointListResponse,
    DataPointReviewStatusLiteral,
    DataPointResponse,
    DataPointUpsertRequest,
    DataPointUpsertResponse,
    DatasetCommentCreateRequest,
    DatasetCommentResponse,
    DatasetCreateRequest,
    DatasetCreateResponse,
    DatasetDeleteResponse,
    DatasetDetailResponse,
    DatasetListItem,
    DatasetListResponse,
    DatasetListStageItem,
    DatasetOperatorPatchRequest,
    DatasetOperatorTransitionRequest,
    DatasetTransitionResponse,
    RejectionReasonResponse,
    ReviewDataPointRow,
    ReviewDatasetListItem,
    ReviewDatasetListResponse,
    ReviewGridResponse,
    ReviewerDecisionRequest,
    ReviewerDecisionResponse,
    UnifiedDataPointItem,
    UnifiedDataPointsMeta,
    UnifiedDeleteRequest,
    UnifiedSubmitRequest,
    UnifiedUpsertRequest,
)
from apps.shared.config.config import settings
from apps.shared.utils.email_utils import EmailTemplate, get_app_from_name, get_fed_email_urls, send_email
from apps.app_db.services.notification_service import notification_service

logger = logging.getLogger(__name__)
_DATASET_SERVICE_SOURCE = "apps.app_db.services.dataset_service"

# Statuses that allow the operator to add / edit data points
_EDITABLE_STATUSES = {"DRAFT", "REVISION"}

# Statuses after which a dataset can no longer be re-activated
_TERMINAL_STATUSES = {"APPROVED", "REJECTED"}


class UnifiedUpsertPreflightError(Exception):
    """Unified PATCH /data-points: validation before commit (resolver + area constraints)."""

    def __init__(self, failures: list[dict[str, Any]]) -> None:
        self.failures = failures
        super().__init__("Unified upsert preflight validation failed.")


def _dataset_scope_content_sets(db: Session, dataset: Dataset) -> tuple[set[int], set[int], set[int], set[int]]:
    """Distinct area / indicator / timeperiod / indicator_classification NIDs for overlap checks."""
    areas: set[int] = {
        int(r[0])
        for r in db.query(DatasetDataPoint.area_nid)
        .filter(DatasetDataPoint.dataset_id == dataset.dataset_id)
        .distinct()
        .all()
        if r[0] is not None
    }
    if dataset.area_nids:
        areas.update(int(x) for x in dataset.area_nids if x is not None)

    tps: set[int] = {
        int(r[0])
        for r in db.query(DatasetDataPoint.timeperiod_nid)
        .filter(DatasetDataPoint.dataset_id == dataset.dataset_id)
        .distinct()
        .all()
        if r[0] is not None
    }
    if dataset.timeperiod_nids:
        tps.update(int(x) for x in dataset.timeperiod_nids if x is not None)

    inds: set[int] = set()
    if dataset.indicator_nids:
        inds.update(int(x) for x in dataset.indicator_nids if x is not None)

    ics: set[int] = {
        int(r[0])
        for r in db.query(DatasetDataPoint.indicator_classification_id)
        .filter(
            DatasetDataPoint.dataset_id == dataset.dataset_id,
            DatasetDataPoint.indicator_classification_id.isnot(None),
        )
        .distinct()
        .all()
        if r[0] is not None
    }
    return areas, inds, tps, ics


def _assigned_area_covers_dataset_areas(
    dw_id: int,
    locale: str,
    assigned_area_nid: int,
    dataset_areas: set[int],
    level: Optional[ReviewWorkflowLevel],
) -> bool:
    if not dataset_areas:
        return False
    if assigned_area_nid in dataset_areas:
        return True
    if level and _review_scope_type_is_area(level) and level.include_childs:
        expanded = expand_descendant_area_nids(dw_id, locale, [assigned_area_nid])
        return bool(expanded & dataset_areas)
    return False


def _urc_row_overlaps_dataset(
    resource_code: str,
    content_id: int,
    areas: set[int],
    inds: set[int],
    tps: set[int],
    ics: set[int],
    dw_id: int,
    locale: str,
    level: Optional[ReviewWorkflowLevel],
) -> bool:
    if resource_code == "dm_dw_area":
        return _assigned_area_covers_dataset_areas(dw_id, locale, content_id, areas, level)
    if resource_code == "dm_dw_indicator":
        return bool(inds) and content_id in inds
    if resource_code == "dm_dw_timeperiod":
        return bool(tps) and content_id in tps
    if resource_code == "dm_dw_indicator_classification":
        return bool(ics) and content_id in ics
    return False


def _workflow_display_name(db: Session, workflow_id: int, locale: str) -> str:
    row = (
        db.query(ReviewWorkflowI18n.workflow_name)
        .filter(
            ReviewWorkflowI18n.master_id == workflow_id,
            ReviewWorkflowI18n.locale == locale,
        )
        .scalar()
    )
    if row:
        return str(row)
    row_en = (
        db.query(ReviewWorkflowI18n.workflow_name)
        .filter(
            ReviewWorkflowI18n.master_id == workflow_id,
            ReviewWorkflowI18n.locale == "en",
        )
        .scalar()
    )
    if row_en:
        return str(row_en)
    wf = db.query(ReviewWorkflow).filter(ReviewWorkflow.workflow_id == workflow_id).first()
    return wf.workflow_code if wf else ""


def _collect_dataset_stakeholder_users(
    db: Session,
    dataset: Dataset,
    dw_id: int,
    app_key: str,
    locale: str,
    *,
    require_email: bool = True,
) -> List[IamUser]:
    """Operator plus workflow IAM users whose content assignments overlap the dataset scope."""
    user_ids: set[int] = {int(dataset.created_user_id)}

    if dataset.workflow_id is not None:
        areas, inds, tps, ics = _dataset_scope_content_sets(db, dataset)
        level = _current_review_workflow_level_for_dataset(db, dataset)

        rows = (
            db.query(IamUserRoleContent, IamUserRole)
            .join(IamUserRole, IamUserRole.id == IamUserRoleContent.user_role_id)
            .filter(
                IamUserRoleContent.workflow_id == dataset.workflow_id,
                IamUserRole.app_key == app_key,
                or_(IamUserRole.dw_id == dw_id, IamUserRole.dw_id.is_(None)),
            )
            .all()
        )
        for urc, iur in rows:
            eff_uid = urc.user_id if urc.user_id is not None else iur.user_id
            if eff_uid is None:
                continue
            if _urc_row_overlaps_dataset(
                urc.resource_code,
                int(urc.content_id),
                areas,
                inds,
                tps,
                ics,
                dw_id,
                locale,
                level,
            ):
                user_ids.add(int(eff_uid))

    users = (
        db.query(IamUser)
        .filter(IamUser.id.in_(user_ids))
        .all()
    )
    out: List[IamUser] = []
    for u in users:
        if require_email and (not u.email or not str(u.email).strip()):
            logger.info(
                "dataset status notify: skip user_id=%s — no email",
                u.id,
            )
            continue
        if u.status is not None and int(u.status) == 0:
            continue
        out.append(u)
    return out


def _build_dataset_notification_context(
    db: Session,
    dataset: Dataset,
    *,
    actor_user_id: int,
    app_key: str,
    content_locale: Optional[str] = None,
    from_db_rejections: bool = False,
) -> dict[str, Any]:
    """Context dict for notification templates and email rendering."""
    locale = content_locale or notification_service._resolve_locale(db, int(dataset.dw_id))

    wf_name = ""
    if dataset.workflow_id is not None:
        wf_name = _workflow_display_name(db, int(dataset.workflow_id), locale)

    actor = (
        db.query(IamUser).filter(IamUser.id == actor_user_id).first()
        if actor_user_id
        else None
    )
    if actor:
        actor_name = f"{actor.first_name} {actor.last_name or ''}".strip() or actor.username
    else:
        actor_name = "(system)"

    submitted_at = "—"
    if dataset.submitted_at:
        submitted_at = dataset.submitted_at.isoformat(sep=" ", timespec="seconds")
    elif dataset.last_updated_at:
        submitted_at = dataset.last_updated_at.isoformat(sep=" ", timespec="seconds")

    approved_on = "—"
    if dataset.approved_on:
        approved_on = dataset.approved_on.isoformat(sep=" ", timespec="seconds")
    elif dataset.last_updated_at:
        approved_on = dataset.last_updated_at.isoformat(sep=" ", timespec="seconds")

    returned_on = "—"
    if dataset.last_returned_at:
        returned_on = dataset.last_returned_at.isoformat(sep=" ", timespec="seconds")
    elif dataset.last_updated_at:
        returned_on = dataset.last_updated_at.isoformat(sep=" ", timespec="seconds")

    corrected_count = 0
    rejection_reasons = "—"
    reviewer_remarks = "—"
    if from_db_rejections:
        corrected_count, rejection_reasons, reviewer_remarks = (
            _load_rejected_notification_fields_from_db(db, int(dataset.dataset_id), locale)
        )

    login_url, _ = get_fed_email_urls(app_key, db)
    return {
        "dataset_name": dataset.dataset_name,
        "dataset_id": str(dataset.dataset_id),
        "submitter_name": actor_name,
        "actor_name": actor_name,
        "submitted_at": submitted_at,
        "revision_count": dataset.revision_count or 0,
        "workflow_name": wf_name or "—",
        "from_name": get_app_from_name(),
        "login_url": login_url or "",
        "approved_on": approved_on,
        "returned_on": returned_on,
        "corrected_count": corrected_count,
        "rejection_reasons": rejection_reasons,
        "reviewer_remarks": reviewer_remarks,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    """UTC-aware datetime stripped of tzinfo for MySQL DATETIME columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _dataset_scope_nids_kwargs(d: Dataset) -> dict:
    """Serialize JSON scope columns for Pydantic responses."""
    def _as_list(val):
        if val is None:
            return None
        return list(val) if isinstance(val, (list, tuple)) else None

    return {
        "area_nids": _as_list(d.area_nids),
        "indicator_nids": _as_list(d.indicator_nids),
        "unit_nids": _as_list(d.unit_nids),
        "subgroup_val_nids": _as_list(d.subgroup_val_nids),
        "timeperiod_nids": _as_list(d.timeperiod_nids),
        "source_nids": _as_list(d.source_nids),
        "ius_nids": _as_list(d.ius_nids),
    }


def _generate_gid() -> str:
    """Generate a short, URL-safe dataset GID. Example: ds-a3f1c9b0e2d84712."""
    return f"ds-{uuid.uuid4().hex[:16]}"


def _normalize_data_source_nid(source_nid: Optional[int]) -> Optional[int]:
    """Treat NULL / 0 from ut_data or dataset rows as no source for keys and joins."""
    if source_nid is None or source_nid == 0:
        return None
    return int(source_nid)


def _workflow_show_previous_time(db: Session, workflow_id: Optional[int]) -> bool:
    """True when workflow data-entry rule exists and show_previous_time is enabled."""
    if workflow_id is None:
        return False
    rule = (
        db.query(WorkflowDataentryRule)
        .filter(WorkflowDataentryRule.workflow_id == workflow_id)
        .first()
    )
    return bool(rule and rule.show_previous_time)


def _natural_key_tuple(
    iusnid: int,
    area_nid: int,
    timeperiod_nid: int,
    source_nid: Optional[int],
) -> tuple[int, int, int, Optional[int]]:
    """Natural key for dataset_data_point ↔ ut_data alignment (includes source)."""
    return (
        int(iusnid),
        int(area_nid),
        int(timeperiod_nid),
        _normalize_data_source_nid(source_nid),
    )


def _resolve_ius_rows_for_scope(
    dw_db: Session,
    *,
    ius_nids: Optional[List[int]] = None,
    indicator_nids: Optional[List[int]] = None,
    unit_nids: Optional[List[int]] = None,
    subgroup_val_nids: Optional[List[int]] = None,
) -> List[Any]:
    """
    Return IndicatorUnitSubgroup ORM rows for dataset scope.

    If ``ius_nids`` is non-empty, rows are loaded by primary key; every NID must exist
    or ``ValueError('UNKNOWN_IUS_NID:...')`` is raised.

    Otherwise rows match the Cartesian filters (indicator × unit × subgroup).
    When all four inputs are empty / None, returns every IUS row in the warehouse
    (legacy behaviour for unrestricted scope).
    """
    from apps.datawarehouse.models.datawarehouse import IndicatorUnitSubgroup

    raw = list(ius_nids) if ius_nids else []
    want_ius = list(dict.fromkeys(int(x) for x in raw))
    if want_ius:
        rows = (
            dw_db.query(IndicatorUnitSubgroup)
            .filter(IndicatorUnitSubgroup.iusnid.in_(want_ius))
            .all()
        )
        found = {r.iusnid for r in rows}
        missing = [nid for nid in want_ius if nid not in found]
        if missing:
            raise ValueError(f"UNKNOWN_IUS_NID:{json.dumps(missing)}")
        order = {nid: i for i, nid in enumerate(want_ius)}
        rows.sort(key=lambda r: order.get(r.iusnid, 10**9))
        return rows

    ind = list(indicator_nids or [])
    unt = list(unit_nids or [])
    sg = list(subgroup_val_nids or [])
    q = dw_db.query(IndicatorUnitSubgroup)
    if ind:
        q = q.filter(IndicatorUnitSubgroup.indicator_nid.in_(ind))
    if unt:
        q = q.filter(IndicatorUnitSubgroup.unit_nid.in_(unt))
    if sg:
        q = q.filter(IndicatorUnitSubgroup.subgroup_val_nid.in_(sg))
    if not ind and not unt and not sg:
        return dw_db.query(IndicatorUnitSubgroup).all()
    return q.all()


def _ut_data_matches_natural_key(Data, key: tuple[int, int, int, Optional[int]]):
    """SQL condition: ut_data row matches (iusnid, area_nid, timeperiod_nid, source_nid)."""
    i, a, t, s = key
    parts = [Data.iusnid == i, Data.area_nid == a, Data.timeperiod_nid == t]
    if s is None:
        parts.append(or_(Data.source_nid.is_(None), Data.source_nid == 0))
    else:
        parts.append(Data.source_nid == s)
    return and_(*parts)


def _delete_ut_data_row_for_datapoint(dw_id: int, dp: DatasetDataPoint) -> None:
    """
    Delete ut_data row matching this dataset_data_point natural key (including source).
    Commits the warehouse session on success. Raises ValueError("UT_DATA_DELETE_FAILED") on failure.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Data

    key = _natural_key_tuple(dp.iusnid, dp.area_nid, dp.timeperiod_nid, dp.source_nid)
    try:
        with get_warehouse_session_from_id(str(dw_id)) as dw_db:
            n = (
                dw_db.query(Data)
                .filter(_ut_data_matches_natural_key(Data, key))
                .delete(synchronize_session=False)
            )
            dw_db.commit()
        if n:
            logger.debug(
                "ut_data delete: dw_id=%s data_point_id=%s rows=%s key=%s",
                dw_id, dp.data_point_id, n, key,
            )
    except Exception as exc:
        log_background_incident(
            message=(
                f"ut_data delete failed for data_point_id={dp.data_point_id} "
                f"dataset={dp.dataset_id} dw_id={dw_id}: {exc}"
            ),
            error_code="DATASET_UT_DATA_DELETE_FAILED",
            exc=exc,
            source=_DATASET_SERVICE_SOURCE,
        )
        raise ValueError("UT_DATA_DELETE_FAILED") from exc


def _delete_ut_data_for_soft_deleted_approved_datapoints(
    db: Session,
    dw_id: int,
    datapoints: List[DatasetDataPoint],
) -> None:
    """For each row that is APPROVED and is_deleted, remove matching ut_data (if any)."""
    for dp in datapoints:
        if dp.is_deleted and str(dp.review_status) == "APPROVED":
            _delete_ut_data_row_for_datapoint(dw_id, dp)


def apply_datapoint_soft_delete_flags(
    db: Session,
    dw_id: int,
    user_id: int,
    dataset_id: int,
    deleted_ids: List[int],
    restore_ids: List[int],
    *,
    is_super_admin: bool = False,
) -> tuple[int, int]:
    """
    Set or clear dataset_data_point.is_deleted (DRAFT / REVISION only).

    Restore runs first so the same id can appear in both lists in one request.

    Returns:
        (marked_deleted_count, restored_count)

    Raises:
        ValueError("DATASET_NOT_FOUND") / ValueError("DATASET_NOT_EDITABLE") from owner assert.
    """
    d = _assert_dataset_owner(
        db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
    )
    if d.dataset_status not in _EDITABLE_STATUSES:
        raise ValueError("DATASET_NOT_EDITABLE")

    now = _now()
    marked_deleted = 0
    restored = 0

    seen_restore: Set[int] = set()
    for raw_id in restore_ids:
        dp_id = int(raw_id)
        if dp_id in seen_restore:
            continue
        seen_restore.add(dp_id)
        row = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.dataset_id == dataset_id,
                DatasetDataPoint.data_point_id == dp_id,
            )
            .first()
        )
        if not row:
            continue
        if not row.is_deleted:
            continue
        row.is_deleted = False
        row.modified = now
        row.modified_user_id = user_id
        restored += 1

    seen_del: Set[int] = set()
    for raw_id in deleted_ids:
        dp_id = int(raw_id)
        if dp_id in seen_del:
            continue
        seen_del.add(dp_id)
        row = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.dataset_id == dataset_id,
                DatasetDataPoint.data_point_id == dp_id,
            )
            .first()
        )
        if not row:
            continue
        if str(row.review_status) == "APPROVED":
            continue
        if row.is_deleted:
            continue
        row.is_deleted = True
        row.modified = now
        row.modified_user_id = user_id
        marked_deleted += 1

    return marked_deleted, restored


def _resolution_detail_to_messages(detail: str) -> list[str]:
    parts = [p.strip() for p in detail.split("; ") if p.strip()]
    return parts if parts else [detail.strip() or "Resolution failed"]


def _normalize_footnote_text(value: Optional[str]) -> Optional[str]:
    """Normalize operator-provided footnote text for staging/approval resolution."""
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _norm_datapoint_textual(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def _dp_cell_kind_payload(
    data_value: Optional[float],
    textual_data_value: Optional[str],
) -> tuple[str, Any]:
    """Classify observation cell: empty | numeric | textual (text wins over numeric)."""
    nt = _norm_datapoint_textual(textual_data_value)
    if nt is not None:
        return ("text", nt)
    if data_value is not None:
        return ("num", float(data_value))
    return ("empty", None)


def _dp_cell_snapshot_str(
    data_value: Optional[float],
    textual_data_value: Optional[str],
) -> Optional[str]:
    """String snapshot for prev_data_value from ut_data; None when cell is empty."""
    kind, payload = _dp_cell_kind_payload(data_value, textual_data_value)
    if kind == "empty":
        return None
    if kind == "text":
        return str(payload)
    return str(payload)


def _log(
    db: Session,
    *,
    dataset_id: int,
    action: str,
    user_id: int,
    prev_status: Optional[str] = None,
    new_status: Optional[str] = None,
    remarks: Optional[str] = None,
    stage_id: Optional[int] = None,
    slice_id: Optional[int] = None,
    data_point_id: Optional[int] = None,
) -> None:
    """Append one row to dataset_review_action_log. Never call db.commit() here."""
    db.add(DatasetReviewActionLog(
        dataset_id=dataset_id,
        stage_id=stage_id,
        slice_id=slice_id,
        data_point_id=data_point_id,
        action=action,
        prev_status=prev_status,
        new_status=new_status,
        action_by_user_id=user_id,
        remarks=remarks,
    ))


def _workflow_name(db: Session, workflow_id: int, locale: str) -> Optional[str]:
    """Resolve translated workflow name; falls back to English, then None."""
    row = (
        db.query(ReviewWorkflowI18n.workflow_name)
        .filter(
            ReviewWorkflowI18n.master_id == workflow_id,
            ReviewWorkflowI18n.locale == locale,
        )
        .first()
    )
    if row:
        return row.workflow_name
    if locale != "en":
        row = (
            db.query(ReviewWorkflowI18n.workflow_name)
            .filter(
                ReviewWorkflowI18n.master_id == workflow_id,
                ReviewWorkflowI18n.locale == "en",
            )
            .first()
        )
        return row.workflow_name if row else None
    return None


def get_workflow_display_name(db: Session, workflow_id: int, locale: str) -> Optional[str]:
    """Public helper for exports and UI — translated workflow title (locale then en)."""
    return _workflow_name(db, workflow_id, locale)


def _dp_counts(db: Session, dataset_id: int) -> tuple[int, int]:
    """Return (total_count, missing_count) for a dataset's data points.

    Soft-deleted rows (``is_deleted=True``) are excluded from both counts so
    completeness % reflects only active datapoints.
    """
    total = (
        db.query(func.count(DatasetDataPoint.data_point_id))
        .filter(
            DatasetDataPoint.dataset_id == dataset_id,
            DatasetDataPoint.is_deleted.is_(False),
        )
        .scalar()
    ) or 0

    missing = (
        db.query(func.count(DatasetDataPoint.data_point_id))
        .filter(
            DatasetDataPoint.dataset_id == dataset_id,
            DatasetDataPoint.is_deleted.is_(False),
            DatasetDataPoint.data_value.is_(None),
            DatasetDataPoint.textual_data_value.is_(None),
        )
        .scalar()
    ) or 0

    return int(total), int(missing)


def _assert_dataset_owner(
    db: Session,
    dataset_id: int,
    dw_id: int,
    user_id: int,
    *,
    is_super_admin: bool = False,
) -> Dataset:
    """
    Return the Dataset row if it exists and belongs to dw_id + user_id.
    Raises ValueError("DATASET_NOT_FOUND") otherwise.

    Super-admin override: when ``is_super_admin`` is True the
    ``created_user_id`` filter is dropped so the caller may operate on any
    dataset within ``dw_id``. Status / lifecycle rules are still enforced by
    callers (this function only validates ownership).
    """
    q = db.query(Dataset).filter(
        Dataset.dataset_id == dataset_id,
        Dataset.dw_id == dw_id,
    )
    if not is_super_admin:
        q = q.filter(Dataset.created_user_id == user_id)
    d = q.first()
    if not d:
        raise ValueError("DATASET_NOT_FOUND")
    return d


def _assert_dataset_owner_or_current_reviewer(
    db: Session,
    dataset_id: int,
    dw_id: int,
    user_id: int,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> Dataset:
    """Dataset must exist; caller must be owner or a current-stage reviewer (PENDING_REVIEW).

    Super-admin override: super admins skip the owner / reviewer-eligibility
    check entirely.
    """
    d = (
        db.query(Dataset)
        .filter(Dataset.dataset_id == dataset_id, Dataset.dw_id == dw_id)
        .first()
    )
    if not d:
        raise ValueError("DATASET_NOT_FOUND")
    if is_super_admin:
        return d
    if d.created_user_id == user_id:
        return d
    if d.dataset_status == "PENDING_REVIEW" and _user_may_access_dataset_for_review(
        db, dw_id, user_id, d, locale
    ):
        return d
    raise ValueError("NOT_AUTHORIZED")


def _row_to_dp_response(row: DatasetDataPoint, include_prev: bool) -> DataPointResponse:
    return DataPointResponse(
        data_point_id=row.data_point_id,
        dataset_id=row.dataset_id,
        iusnid=row.iusnid,
        indicator_nid=row.indicator_nid,
        unit_nid=row.unit_nid,
        subgroup_val_nid=row.subgroup_val_nid,
        area_nid=row.area_nid,
        timeperiod_nid=row.timeperiod_nid,
        source_nid=row.source_nid,
        footnote_nid=row.footnote_nid,
        data_value=row.data_value,
        textual_data_value=row.textual_data_value,
        istextualdata=row.istextualdata,
        reject_reason_id=row.reject_reason_id,
        # display names (cross-DB DW lookups) populated by caller if needed
        prev_timeperiod_nid=row.prev_timeperiod_nid if include_prev else None,
        prev_tmprd_data_value=row.prev_tmprd_data_value if include_prev else None,
        prev_tmprd_textual_data_value=row.prev_tmprd_textual_data_value if include_prev else None,
        prev_data_value=row.prev_data_value,
        review_status=row.review_status,
        is_locked=row.is_locked,
        is_deleted=bool(row.is_deleted),
        dataset_review_slice_id=row.dataset_review_slice_id,
        cmnt_cnt=row.cmnt_cnt,
        created=row.created,
        modified=row.modified,
    )


def _expected_scope_datapoint_count(
    ius_count: int,
    area_nids: list,
    timeperiod_nids: list,
    source_nids: Optional[list],
) -> int:
    """Cartesian product size for scope seeding threshold checks."""
    if not area_nids or not timeperiod_nids or ius_count <= 0:
        return 0
    n_src = len(source_nids) if source_nids else 1
    return ius_count * len(area_nids) * len(timeperiod_nids) * n_src


def _source_nid_in_scope_condition(source_nids: Optional[list]):
    """SQLAlchemy filter: source_nid matches dataset source scope (NULL/0 when unset)."""
    if source_nids:
        return DatasetDataPoint.source_nid.in_([int(x) for x in source_nids])
    return or_(DatasetDataPoint.source_nid.is_(None), DatasetDataPoint.source_nid == 0)


def _delete_unlocked_datapoints_outside_scope(
    db: Session,
    dataset_id: int,
    *,
    iusnids: list[int],
    area_nids: list[int],
    timeperiod_nids: list[int],
    source_nids: Optional[list],
) -> int:
    """
    Bulk-delete unlocked rows whose natural key falls outside the new scope.
    Avoids materializing the full IUS×area×timeperiod×source Cartesian product.
    """
    in_scope = and_(
        DatasetDataPoint.iusnid.in_(iusnids),
        DatasetDataPoint.area_nid.in_(area_nids),
        DatasetDataPoint.timeperiod_nid.in_(timeperiod_nids),
        _source_nid_in_scope_condition(source_nids),
    )
    deleted = (
        db.query(DatasetDataPoint)
        .filter(
            DatasetDataPoint.dataset_id == dataset_id,
            DatasetDataPoint.is_locked.is_(False),
            ~in_scope,
        )
        .delete(synchronize_session=False)
    )
    return int(deleted or 0)


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

def create_dataset(
    db: Session,
    dw_id: int,
    user_id: int,
    payload: DatasetCreateRequest,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> DatasetCreateResponse:
    """
    Create a new DRAFT dataset.

    workflow_id is required; workflow is validated and assignment checked
    when constraint_data_entry=True.

    Super-admin override: skips the ``NOT_ASSIGNED_TO_WORKFLOW`` area
    assignment gate so a super admin can create datasets in any workflow.

    Raises:
        ValueError("WORKFLOW_NOT_FOUND")       — workflow_id missing/inactive (enabled mode)
        ValueError("WORKFLOW_DW_MISMATCH")     — workflow belongs to different DW
        ValueError("NOT_ASSIGNED_TO_WORKFLOW") — operator not assigned (constrained)
        ValueError("DATASET_NAME_REQUIRED")    — dataset_name not provided
        Conflict — scope overlaps another active dataset on this warehouse
        ValueError("UNKNOWN_IUS_NID:...")      — invalid iusnid for this warehouse
        BadRequest                               — review workflow missing data-entry rule or curr_timeperiod_nid
    """
    if not payload.dataset_name:
        raise ValueError("DATASET_NAME_REQUIRED")

    if not payload.workflow_id:
        raise ValueError("WORKFLOW_NOT_FOUND")

    workflow = (
        db.query(ReviewWorkflow)
        .filter(
            ReviewWorkflow.workflow_id == payload.workflow_id,
            ReviewWorkflow.is_active.is_(True),
        )
        .first()
    )
    if not workflow:
        raise ValueError("WORKFLOW_NOT_FOUND")
    if workflow.dw_id is not None and workflow.dw_id != dw_id:
        raise ValueError("WORKFLOW_DW_MISMATCH")

    # When constraint_data_entry=True the operator must have an area assignment.
    # Super admins are exempt from this gate.
    if workflow.constraint_data_entry and not is_super_admin:
        assigned = (
            db.query(IamUserRoleContent.id)
            .filter(
                IamUserRoleContent.user_id == user_id,
                IamUserRoleContent.workflow_id == payload.workflow_id,
                IamUserRoleContent.resource_code == "dm_dw_area",
            )
            .first()
        )
        if not assigned:
            raise ValueError("NOT_ASSIGNED_TO_WORKFLOW")

    reporting_timeperiod_nid: Optional[int] = None
    if workflow.allow_review:
        dataentry_rule = (
            db.query(WorkflowDataentryRule)
            .filter(WorkflowDataentryRule.workflow_id == workflow.workflow_id)
            .first()
        )
        if not dataentry_rule:
            raise BadRequest(
                "Workflow data-entry rule is required before creating a dataset for a review-enabled workflow.",
                error_code="WORKFLOW_DATAENTRY_RULE_REQUIRED",
            )
        if not dataentry_rule.curr_timeperiod_nid:
            raise BadRequest(
                "Workflow curr_timeperiod_nid must be configured before creating a dataset for a review-enabled workflow.",
                error_code="WORKFLOW_CURR_TIMEPERIOD_REQUIRED",
            )
        reporting_timeperiod_nid = int(dataentry_rule.curr_timeperiod_nid)

    workflow_id = payload.workflow_id

    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id

    ius_rows_resolved: List[Any] = []
    if payload.ius_nids:
        with get_warehouse_session_from_id(str(dw_id)) as dw_db:
            ius_rows_resolved = _resolve_ius_rows_for_scope(
                dw_db,
                ius_nids=payload.ius_nids,
                indicator_nids=None,
                unit_nids=None,
                subgroup_val_nids=None,
            )
    elif payload.area_nids and payload.timeperiod_nids:
        with get_warehouse_session_from_id(str(dw_id)) as dw_db:
            ius_rows_resolved = _resolve_ius_rows_for_scope(
                dw_db,
                ius_nids=None,
                indicator_nids=payload.indicator_nids,
                unit_nids=payload.unit_nids,
                subgroup_val_nids=payload.subgroup_val_nids,
            )

    if payload.area_nids and payload.timeperiod_nids and ius_rows_resolved:
        iusnid_list = [r.iusnid for r in ius_rows_resolved]
        if iusnid_list:
            conflicts = _check_scope_exclusivity(
                db,
                dw_id,
                iusnid_list,
                payload.area_nids,
                payload.timeperiod_nids,
                source_nids=payload.source_nids,
            )
            if conflicts:
                raise Conflict(
                    "Dataset scope overlaps with another active dataset on this data warehouse.",
                    error_code="EXCLUSIVITY_CONFLICT",
                )

    if payload.ius_nids:
        store_ius_nids = list(dict.fromkeys(int(x) for x in payload.ius_nids))
        store_indicator_nids = sorted({r.indicator_nid for r in ius_rows_resolved})
        store_unit_nids = sorted({r.unit_nid for r in ius_rows_resolved})
        store_subgroup_val_nids = sorted(
            {r.subgroup_val_nid for r in ius_rows_resolved if r.subgroup_val_nid is not None}
        )
    else:
        store_ius_nids = None
        store_indicator_nids = payload.indicator_nids
        store_unit_nids = payload.unit_nids
        store_subgroup_val_nids = payload.subgroup_val_nids

    now = _now()
    dataset = Dataset(
        dataset_gid=_generate_gid(),
        dataset_name=payload.dataset_name,
        dw_id=dw_id,
        workflow_id=workflow_id,
        reporting_timeperiod_nid=reporting_timeperiod_nid,
        dataset_status="DRAFT",
        revision_count=0,
        created_user_id=user_id,
        area_nids=payload.area_nids,
        indicator_nids=store_indicator_nids,
        unit_nids=store_unit_nids,
        subgroup_val_nids=store_subgroup_val_nids,
        timeperiod_nids=payload.timeperiod_nids,
        source_nids=payload.source_nids,
        ius_nids=store_ius_nids,
        created=now,
        last_updated_at=now,
    )
    db.add(dataset)
    db.flush()
    _log(db, dataset_id=dataset.dataset_id, action="DATASET_CREATED",
         new_status="DRAFT", user_id=user_id)

    seeding_async = False
    if payload.area_nids and payload.timeperiod_nids:
        expected_dp = _expected_scope_datapoint_count(
            len(ius_rows_resolved),
            payload.area_nids,
            payload.timeperiod_nids,
            payload.source_nids,
        )
        if settings.DATASET_SEED_BG_THRESHOLD > 0 and expected_dp > settings.DATASET_SEED_BG_THRESHOLD:
            dataset.datapoint_readiness = "CREATED"
            from apps.shared.services.bg_job_dispatch import (
                JOB_TYPE_SEED_DATASET_DATA_POINTS,
                dispatch_bg_job,
            )
            dispatch_bg_job(
                db=db,
                job_type=JOB_TYPE_SEED_DATASET_DATA_POINTS,
                payload={"dataset_id": dataset.dataset_id, "dw_id": dw_id, "locale": locale},
                dw_id=str(dw_id),
                priority=1,
            )
            seeding_async = True
        else:
            try:
                _seed_dataset_data_points(db, dataset, dw_id, locale=locale)
                dataset.datapoint_readiness = "COMPLETED"
            except Exception as exc:
                dataset.datapoint_readiness = "FAILED"
                logger.error("Data point seeding failed for dataset %s: %s", dataset.dataset_id, exc)

    db.refresh(dataset)

    uname_by_id = _iam_usernames_for_ids(db, {int(dataset.created_user_id)})
    return DatasetCreateResponse(
        dataset_id=dataset.dataset_id,
        dataset_gid=dataset.dataset_gid,
        dataset_name=dataset.dataset_name,
        dw_id=dataset.dw_id,
        workflow_id=dataset.workflow_id,
        dataset_status=dataset.dataset_status,
        datapoint_readiness=dataset.datapoint_readiness,
        created_username=_username_from_map(uname_by_id, dataset.created_user_id),
        created=dataset.created,
        seeding_async=seeding_async,
        **_dataset_scope_nids_kwargs(dataset),
    )


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------

_DATASET_LIST_SEARCH_FIELDS = {
    "dataset_name": Dataset.dataset_name,
    "dataset_gid": Dataset.dataset_gid,
}

_DATASET_LIST_SORT_FIELDS = {
    "dataset_name": Dataset.dataset_name,
    "created_on": Dataset.created,
    "updated_on": Dataset.last_updated_at,
}


def _stages_for_dataset_ids(
    db: Session, dataset_ids: List[int]
) -> dict[int, List[DatasetReviewStage]]:
    if not dataset_ids:
        return {}
    rows = (
        db.query(DatasetReviewStage)
        .filter(DatasetReviewStage.dataset_id.in_(dataset_ids))
        .order_by(DatasetReviewStage.dataset_id, DatasetReviewStage.level_no)
        .all()
    )
    out: dict[int, List[DatasetReviewStage]] = {}
    for s in rows:
        out.setdefault(s.dataset_id, []).append(s)
    return out


def _add_positive_user_id(bucket: Set[int], uid: Optional[int]) -> None:
    if uid is None:
        return
    iv = int(uid)
    if iv > 0:
        bucket.add(iv)


def _collect_user_ids_for_dataset_list(
    datasets: List[Dataset],
    stages_map: dict[int, List[DatasetReviewStage]],
) -> Set[int]:
    ids: Set[int] = set()
    for d in datasets:
        _add_positive_user_id(ids, d.returned_by_user_id)
        _add_positive_user_id(ids, d.approved_by_user_id)
        _add_positive_user_id(ids, d.created_user_id)
    for stage_rows in stages_map.values():
        for s in stage_rows:
            _add_positive_user_id(ids, s.approved_by_user_id)
    return ids


def _iam_usernames_for_ids(db: Session, ids: Collection[int]) -> dict[int, Optional[str]]:
    id_set = {int(x) for x in ids if x is not None and int(x) > 0}
    if not id_set:
        return {}
    rows = (
        db.query(IamUser.id, IamUser.username)
        .filter(IamUser.id.in_(id_set))
        .all()
    )
    return {int(r.id): r.username for r in rows}


def _username_from_map(uname_by_id: dict[int, Optional[str]], uid: Optional[int]) -> Optional[str]:
    if uid is None:
        return None
    iv = int(uid)
    if iv <= 0:
        return None
    return uname_by_id.get(iv)


def _rows_to_dataset_list_stage_items(
    rows: List[DatasetReviewStage],
    uname_by_id: dict[int, Optional[str]],
) -> List[DatasetListStageItem]:
    return [
        DatasetListStageItem(
            stage_id=s.stage_id,
            workflow_review_level_id=s.workflow_review_level_id,
            level_no=s.level_no,
            stage_status=s.stage_status,
            approved_by_username=_username_from_map(uname_by_id, s.approved_by_user_id),
        )
        for s in rows
    ]


def _build_dataset_list_items(
    db: Session,
    datasets: List[Dataset],
    wf_names: dict[int, Optional[str]],
    stages_map: dict[int, List[DatasetReviewStage]],
) -> List[DatasetListItem]:
    uname_by_id = _iam_usernames_for_ids(
        db, _collect_user_ids_for_dataset_list(datasets, stages_map)
    )
    items: List[DatasetListItem] = []
    for d in datasets:
        total, missing = _dp_counts(db, d.dataset_id)
        sd = stages_map.get(d.dataset_id, [])
        items.append(
            DatasetListItem(
                dataset_id=d.dataset_id,
                dataset_gid=d.dataset_gid,
                dataset_name=d.dataset_name,
                dw_id=d.dw_id,
                workflow_id=d.workflow_id,
                workflow_name=wf_names.get(d.workflow_id),
                reporting_timeperiod_nid=d.reporting_timeperiod_nid,
                dataset_status=d.dataset_status,
                datapoint_readiness=d.datapoint_readiness,
                revision_count=d.revision_count,
                cmnt_cnt=d.cmnt_cnt,
                data_point_count=total,
                missing_data_count=missing,
                last_returned_at=d.last_returned_at,
                returned_by_username=_username_from_map(uname_by_id, d.returned_by_user_id),
                submitted_at=d.submitted_at,
                approved_on=d.approved_on,
                approved_by_username=_username_from_map(uname_by_id, d.approved_by_user_id),
                created=d.created,
                created_username=_username_from_map(uname_by_id, d.created_user_id),
                stages=_rows_to_dataset_list_stage_items(sd, uname_by_id),
                **_dataset_scope_nids_kwargs(d),
            )
        )
    return items


def list_datasets(
    db: Session,
    dw_id: int,
    user_id: int,
    locale: str = "en",
    workflow_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    area_nid: Optional[int] = None,
    period_id: Optional[int] = None,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort_field: Optional[str] = None,
    sort_order: str = "desc",
    *,
    is_super_admin: bool = False,
) -> DatasetListResponse:
    """
    List datasets in the given DW.

    By default (and for any status other than PENDING_REVIEW), only datasets
    created by user_id are returned. Optional workflow_id and status_filter apply.

    When status_filter is PENDING_REVIEW, returns datasets in that workflow with
    that status that the caller may access as the **current-stage** reviewer
    (same rules as GET /dataset/review). workflow_id is required in that case;
    raises ValueError("WORKFLOW_REQUIRED_FOR_PENDING_REVIEW_LIST") if missing.

    area_nid / period_id filters are noted but not yet joined (no FK on dataset table).

    Optional search: case-insensitive partial match; column from search_by
    (default dataset_name) or dataset_gid. Raises INVALID_DATASET_LIST_SEARCH_FIELD if invalid.
    sort_field: dataset_name | created_on | updated_on (maps to created / last_updated_at).
    sort_order: asc | desc (caller must validate).

    Super-admin override: skips the ``created_user_id`` filter on the default
    branch and per-reviewer IAM scope on the PENDING_REVIEW branch; still requires
    an ACTIVE current stage with at least one slice on that stage in ACTIVE, APPROVED,
    or REVISION_REQUESTED.

    Each ``DatasetListItem`` includes username audit fields (``created_username``,
    ``returned_by_username``, ``approved_by_username`` from ``iam_user``) and ``stages``
    (bulk-loaded): ordered rows from ``dataset_review_stage`` with per-level
    ``stage_status`` and ``approved_by_username``.
    """
    if status_filter == "PENDING_REVIEW":
        if workflow_id is None:
            raise ValueError("WORKFLOW_REQUIRED_FOR_PENDING_REVIEW_LIST")
        q = db.query(Dataset).filter(
            Dataset.dw_id == dw_id,
            Dataset.workflow_id == workflow_id,
            Dataset.dataset_status == "PENDING_REVIEW",
        )
        if search and search.strip():
            sb_key = (search_by or "dataset_name").strip().lower() or "dataset_name"
            if sb_key not in _DATASET_LIST_SEARCH_FIELDS:
                raise ValueError("INVALID_DATASET_LIST_SEARCH_FIELD")
            search_col = _DATASET_LIST_SEARCH_FIELDS[sb_key]
            q = q.filter(search_col.ilike(f"%{search.strip()}%"))
        field_key = (sort_field or "created_on").strip().lower() or "created_on"
        if field_key not in _DATASET_LIST_SORT_FIELDS:
            raise ValueError("INVALID_DATASET_LIST_SORT_FIELD")
        sort_col = _DATASET_LIST_SORT_FIELDS[field_key]
        sort_dir = desc if sort_order == "desc" else asc
        pending_rows = q.order_by(sort_dir(sort_col)).all()
        datasets = [
            d for d in pending_rows
            if _user_may_access_dataset_for_review(
                db, dw_id, user_id, d, locale, is_super_admin=is_super_admin
            )
        ]
        wf_names = {workflow_id: _workflow_name(db, workflow_id, locale)}
        stages_map = _stages_for_dataset_ids(db, [d.dataset_id for d in datasets])
        items = _build_dataset_list_items(db, datasets, wf_names, stages_map)
        return DatasetListResponse(datasets=items)
    else:
        q = db.query(Dataset).filter(
            Dataset.dw_id == dw_id,
            Dataset.dataset_status != "DELETED",
        )
        if not is_super_admin:
            q = q.filter(Dataset.created_user_id == user_id)
        if workflow_id:
            q = q.filter(Dataset.workflow_id == workflow_id)
        if status_filter:
            q = q.filter(Dataset.dataset_status == status_filter)

    if search and search.strip():
        sb_key = (search_by or "dataset_name").strip().lower() or "dataset_name"
        if sb_key not in _DATASET_LIST_SEARCH_FIELDS:
            raise ValueError("INVALID_DATASET_LIST_SEARCH_FIELD")
        search_col = _DATASET_LIST_SEARCH_FIELDS[sb_key]
        q = q.filter(search_col.ilike(f"%{search.strip()}%"))

    field_key = (sort_field or "created_on").strip().lower() or "created_on"
    if field_key not in _DATASET_LIST_SORT_FIELDS:
        raise ValueError("INVALID_DATASET_LIST_SORT_FIELD")
    sort_col = _DATASET_LIST_SORT_FIELDS[field_key]
    sort_dir = desc if sort_order == "desc" else asc
    datasets = q.order_by(sort_dir(sort_col)).all()

    # Resolve workflow names once per unique workflow_id (skip NULL)
    wf_ids = {d.workflow_id for d in datasets if d.workflow_id is not None}
    wf_names: dict[int, Optional[str]] = {
        wid: _workflow_name(db, wid, locale) for wid in wf_ids
    }

    stages_map = _stages_for_dataset_ids(db, [d.dataset_id for d in datasets])
    items = _build_dataset_list_items(db, datasets, wf_names, stages_map)

    return DatasetListResponse(datasets=items)


# ---------------------------------------------------------------------------
# GET HEADER
# ---------------------------------------------------------------------------

def get_dataset(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    locale: str = "en",
    status_filter: Optional[str] = None,
    *,
    is_super_admin: bool = False,
) -> DatasetDetailResponse:
    """
    Return dataset header (no data points), including ``stages`` (same shape as list).

    When status_filter (query `status`) is PENDING_REVIEW, returns the header only if
    the dataset is pending and the caller is a **current-stage** reviewer for it
    (same rule as GET .../dataset/review).

    Otherwise only the dataset creator may read the header.

    Super-admin override: bypasses both the reviewer-eligibility and owner
    checks; the dataset header is returned for any matching dataset.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("NOT_AUTHORIZED")
    """
    sf = (status_filter or "").strip()
    if sf == "PENDING_REVIEW":
        d = (
            db.query(Dataset)
            .filter(
                Dataset.dataset_id == dataset_id,
                Dataset.dw_id == dw_id,
                Dataset.dataset_status == "PENDING_REVIEW",
            )
            .first()
        )
        if not d:
            raise ValueError("DATASET_NOT_FOUND")
        if not _user_may_access_dataset_for_review(
            db, dw_id, user_id, d, locale, is_super_admin=is_super_admin
        ):
            raise ValueError("NOT_AUTHORIZED")
    else:
        d = _assert_dataset_owner(
            db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
        )

    stages_map = _stages_for_dataset_ids(db, [d.dataset_id])
    sd = stages_map.get(d.dataset_id, [])

    uid_set: Set[int] = set()
    _add_positive_user_id(uid_set, d.returned_by_user_id)
    _add_positive_user_id(uid_set, d.approved_by_user_id)
    _add_positive_user_id(uid_set, d.created_user_id)
    for s in sd:
        _add_positive_user_id(uid_set, s.approved_by_user_id)
    uname_by_id = _iam_usernames_for_ids(db, uid_set)
    return DatasetDetailResponse(
        dataset_id=d.dataset_id,
        dataset_gid=d.dataset_gid,
        dataset_name=d.dataset_name,
        dw_id=d.dw_id,
        workflow_id=d.workflow_id,
        workflow_name=_workflow_name(db, d.workflow_id, locale) if d.workflow_id else None,
        reporting_timeperiod_nid=d.reporting_timeperiod_nid,
        dataset_status=d.dataset_status,
        datapoint_readiness=d.datapoint_readiness,
        revision_count=d.revision_count,
        cmnt_cnt=d.cmnt_cnt,
        last_returned_at=d.last_returned_at,
        returned_by_username=_username_from_map(uname_by_id, d.returned_by_user_id),
        submitted_at=d.submitted_at,
        approved_on=d.approved_on,
        approved_by_username=_username_from_map(uname_by_id, d.approved_by_user_id),
        created=d.created,
        created_username=_username_from_map(uname_by_id, d.created_user_id),
        stages=_rows_to_dataset_list_stage_items(sd, uname_by_id),
        **_dataset_scope_nids_kwargs(d),
    )


# ---------------------------------------------------------------------------
# GET DATA POINTS
# ---------------------------------------------------------------------------

def get_dataset_data_points(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    include_prev: bool = False,
    review_status_filter: Optional[str] = None,
) -> DataPointListResponse:
    """
    Return all data points for a dataset (owned by user_id).

    Raises:
        ValueError("DATASET_NOT_FOUND")
    """
    d = _assert_dataset_owner(db, dataset_id, dw_id, user_id)

    q = db.query(DatasetDataPoint).filter(
        DatasetDataPoint.dataset_id == dataset_id
    )
    if review_status_filter:
        q = q.filter(DatasetDataPoint.review_status == review_status_filter)

    rows = q.order_by(DatasetDataPoint.data_point_id).all()

    # Completeness metrics exclude soft-deleted rows; the list still returns them
    # so the UI can show / restore deleted datapoints.
    active_rows = [r for r in rows if not r.is_deleted]
    with_data = sum(
        1 for r in active_rows
        if r.data_value is not None or r.textual_data_value is not None
    )

    return DataPointListResponse(
        dataset_id=dataset_id,
        dataset_status=d.dataset_status,
        total_count=len(active_rows),
        with_data_count=with_data,
        missing_count=len(active_rows) - with_data,
        data_points=[_row_to_dp_response(r, include_prev) for r in rows],
    )


# ---------------------------------------------------------------------------
# UPSERT DATA POINTS
# ---------------------------------------------------------------------------

def upsert_data_points(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    payload: DataPointUpsertRequest,
    *,
    is_super_admin: bool = False,
    commit: bool = True,
) -> DataPointUpsertResponse:
    """
    Insert or update data point rows in a DRAFT or REVISION dataset.

    Match key: (dataset_id, iusnid, area_nid, timeperiod_nid, source_nid) with NULL-safe source.

    Rules:
    - DRAFT: all rows can be inserted or updated freely.
    - REVISION: only rows where is_locked=False may be updated
      (locked rows are silently skipped); review_status is reset to PENDING_REVIEW on update.

    Super-admin override: bypasses the ownership filter on the dataset and the
    ``AREA_NOT_ASSIGNED`` constraint-data-entry gate. Status / lock rules still
    apply.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("DATASET_NOT_EDITABLE")
    """
    d = _assert_dataset_owner(
        db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
    )
    if d.dataset_status not in _EDITABLE_STATUSES:
        raise ValueError("DATASET_NOT_EDITABLE")

    # Restrict data entry to operator's assigned areas when the workflow
    # has constraint_data_entry=True. Super admins are exempt.
    if d.workflow_id is not None and not is_super_admin:
        workflow = (
            db.query(ReviewWorkflow)
            .filter(ReviewWorkflow.workflow_id == d.workflow_id)
            .first()
        )
        if workflow and workflow.constraint_data_entry:
            assigned_area_rows = (
                db.query(IamUserRoleContent.content_id)
                .filter(
                    IamUserRoleContent.user_id == user_id,
                    IamUserRoleContent.workflow_id == d.workflow_id,
                    IamUserRoleContent.resource_code == "dm_dw_area",
                )
                .all()
            )
            assigned_area_nids = {r.content_id for r in assigned_area_rows}
            if assigned_area_nids:
                for inp in payload.data_points:
                    if inp.area_nid not in assigned_area_nids:
                        raise ValueError(f"AREA_NOT_ASSIGNED:{inp.area_nid}")

    in_revision = d.dataset_status == "REVISION"
    inserted = updated = skipped = 0
    now = _now()

    show_prev = _workflow_show_previous_time(db, d.workflow_id)
    ut_slice_insert: Optional[dict[NaturalKey, _UtSeedSnapshot]] = None
    prev_fallback_insert: Optional[dict[TripleKey, _UtSeedSnapshot]] = None

    def _upsert_one_datapoint(
        inp: DataPointInput,
        *,
        dw_db: Session,
        upsert_locale: str,
        display_maps: dict[str, dict[int, str]],
    ) -> None:
        nonlocal inserted, updated, skipped
        src = _normalize_data_source_nid(inp.source_nid)
        footnote_text = _normalize_footnote_text(inp.footnote_text)
        q_existing = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.dataset_id == dataset_id,
                DatasetDataPoint.iusnid == inp.iusnid,
                DatasetDataPoint.area_nid == inp.area_nid,
                DatasetDataPoint.timeperiod_nid == inp.timeperiod_nid,
            )
        )
        if src is None:
            q_existing = q_existing.filter(DatasetDataPoint.source_nid.is_(None))
        else:
            q_existing = q_existing.filter(DatasetDataPoint.source_nid == src)
        existing = q_existing.first()

        if existing:
            if in_revision and existing.is_locked:
                skipped += 1
                return

            existing.indicator_nid = inp.indicator_nid
            existing.unit_nid = inp.unit_nid
            existing.subgroup_val_nid = inp.subgroup_val_nid
            existing.source_nid = src
            existing.footnote_text = footnote_text
            existing.data_value = inp.data_value
            existing.textual_data_value = inp.textual_data_value
            existing.istextualdata = inp.textual_data_value is not None
            existing.modified = now
            if in_revision:
                existing.review_status = "PENDING_REVIEW"
            _populate_datapoint_display_names(dw_db, upsert_locale, existing, display_maps)
            updated += 1
        else:
            prev_tp_ins: Optional[int] = None
            prev_data_ins = None
            prev_text_ins = None
            if show_prev and ut_slice_insert is not None and prev_fallback_insert is not None:
                prev_tp_ins, prev_data_ins, prev_text_ins = _resolve_prev_tmprd_fields(
                    show_prev=show_prev,
                    fixed_prev_tp=fixed_prev_tp_upsert,
                    ut_slice=ut_slice_insert,
                    prev_fallback_by_triple=prev_fallback_insert,
                    iusnid=int(inp.iusnid),
                    area_nid=int(inp.area_nid),
                    src_norm=src,
                )
            prev_data_val = None
            if ut_slice_insert is not None:
                pk_cur = _natural_key_tuple(
                    int(inp.iusnid),
                    int(inp.area_nid),
                    int(inp.timeperiod_nid),
                    src,
                )
                cur_ut = ut_slice_insert.get(pk_cur)
                if cur_ut is not None:
                    prev_data_val = _dp_cell_snapshot_str(
                        cur_ut.data_value,
                        cur_ut.textual_data_value,
                    )
            dp = DatasetDataPoint(
                dataset_id=dataset_id,
                iusnid=inp.iusnid,
                indicator_nid=inp.indicator_nid,
                unit_nid=inp.unit_nid,
                subgroup_val_nid=inp.subgroup_val_nid,
                area_nid=inp.area_nid,
                timeperiod_nid=inp.timeperiod_nid,
                source_nid=src,
                footnote_text=footnote_text,
                data_value=inp.data_value,
                textual_data_value=inp.textual_data_value,
                istextualdata=inp.textual_data_value is not None,
                prev_timeperiod_nid=prev_tp_ins,
                prev_tmprd_data_value=prev_data_ins,
                prev_tmprd_textual_data_value=prev_text_ins,
                prev_data_value=prev_data_val,
                review_status="DRAFT",
                is_locked=False,
                created_user_id=user_id,
                created=now,
            )
            _populate_datapoint_display_names(dw_db, upsert_locale, dp, display_maps)
            db.add(dp)
            inserted += 1

    if payload.data_points:
        from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
        from apps.datawarehouse.models.datawarehouse import Data, get_default_locale
        from apps.datawarehouse.utils.timeperiod_predecessor import (
            build_previous_timeperiod_nid_map,
            resolve_previous_timeperiod_nid_for_selection,
        )

        with get_warehouse_session_from_id(str(dw_id)) as dw_db:
            upsert_locale = get_default_locale(dw_db)
            display_maps = _new_display_name_maps()
            ius_set = {int(inp.iusnid) for inp in payload.data_points}
            ar_set = {int(inp.area_nid) for inp in payload.data_points}
            tp_set = {int(inp.timeperiod_nid) for inp in payload.data_points}
            all_tp: set[int] = set(tp_set)
            fixed_prev_tp_upsert: Optional[int] = None
            if show_prev:
                prev_map_insert = build_previous_timeperiod_nid_map(dw_db)
                dataset_tp_nids = [int(t) for t in (d.timeperiod_nids or [])] or list(tp_set)
                fixed_prev_tp_upsert = resolve_previous_timeperiod_nid_for_selection(
                    dw_db, dataset_tp_nids, prev_map_insert
                )
                if fixed_prev_tp_upsert is not None:
                    all_tp.add(fixed_prev_tp_upsert)
            ut_rows_ins = (
                dw_db.query(Data)
                .filter(
                    Data.iusnid.in_(ius_set),
                    Data.area_nid.in_(ar_set),
                    Data.timeperiod_nid.in_(all_tp),
                )
                .all()
            )
            upsert_source_priority: list[Optional[int]] = (
                [int(x) for x in d.source_nids] if d.source_nids else [None]
            )
            ut_slice_insert = {}
            for r in ut_rows_ins:
                k_ins = _natural_key_tuple(
                    int(r.iusnid) if r.iusnid is not None else 0,
                    int(r.area_nid) if r.area_nid is not None else 0,
                    int(r.timeperiod_nid) if r.timeperiod_nid is not None else 0,
                    getattr(r, "source_nid", None),
                )
                ut_slice_insert[k_ins] = _ut_row_to_seed_snapshot(r)
            prev_fallback_insert = _build_prev_fallback_by_triple(
                ut_slice_insert, upsert_source_priority
            )

            for inp in payload.data_points:
                _upsert_one_datapoint(
                    inp,
                    dw_db=dw_db,
                    upsert_locale=upsert_locale,
                    display_maps=display_maps,
                )

    if commit:
        db.commit()

    return DataPointUpsertResponse(
        dataset_id=dataset_id,
        inserted=inserted,
        updated=updated,
        total=inserted + updated,
    )


# ---------------------------------------------------------------------------
# UPDATE DATASET FIELDS (no status change)
# ---------------------------------------------------------------------------

def update_dataset(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    payload: DatasetOperatorPatchRequest,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> DatasetTransitionResponse:
    """
    Update editable fields (dataset_name, scope NID lists) on a DRAFT dataset.
    At least one field must be provided.
    When scope changes, reconciles dataset_data_point rows.

    Super-admin override: bypasses ownership; the DRAFT-only status guard
    still applies.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("DATASET_NOT_EDITABLE")  — only DRAFT allows field edits
        ValueError("DATAPOINT_POPULATION_IN_PROGRESS") — async seed/import in progress
    """
    d = _assert_dataset_owner(
        db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
    )
    if d.dataset_status != "DRAFT":
        raise ValueError("DATASET_NOT_EDITABLE")

    scope_changed = False
    seeding_async = False
    if payload.dataset_name is not None:
        d.dataset_name = payload.dataset_name
    if payload.area_nids is not None:
        d.area_nids = payload.area_nids
        scope_changed = True
    if payload.indicator_nids is not None:
        d.indicator_nids = payload.indicator_nids
        scope_changed = True
    if payload.unit_nids is not None:
        d.unit_nids = payload.unit_nids
        scope_changed = True
    if payload.subgroup_val_nids is not None:
        d.subgroup_val_nids = payload.subgroup_val_nids
        scope_changed = True
    if payload.timeperiod_nids is not None:
        d.timeperiod_nids = payload.timeperiod_nids
        scope_changed = True
    if payload.source_nids is not None:
        d.source_nids = payload.source_nids
    if payload.ius_nids is not None:
        d.ius_nids = payload.ius_nids
        scope_changed = True
        if payload.ius_nids:
            from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
            with get_warehouse_session_from_id(str(dw_id)) as dw_db:
                rows = _resolve_ius_rows_for_scope(
                    dw_db,
                    ius_nids=payload.ius_nids,
                    indicator_nids=None,
                    unit_nids=None,
                    subgroup_val_nids=None,
                )
            d.indicator_nids = sorted({r.indicator_nid for r in rows})
            d.unit_nids = sorted({r.unit_nid for r in rows})
            d.subgroup_val_nids = sorted(
                {r.subgroup_val_nid for r in rows if r.subgroup_val_nid is not None}
            )
    d.last_updated_at = _now()
    db.flush()

    if scope_changed:
        if d.datapoint_readiness in ("CREATED", "UPDATED"):
            raise ValueError("DATAPOINT_POPULATION_IN_PROGRESS")
        try:
            seeding_async = _reconcile_scope(db, d, dw_id, locale=locale)
        except ValueError as e:
            if str(e).startswith("UNKNOWN_IUS_NID"):
                raise
            d.datapoint_readiness = "FAILED"
            logger.error("Scope reconcile failed for dataset %s: %s", dataset_id, e)
        except Exception as exc:
            d.datapoint_readiness = "FAILED"
            logger.error("Scope reconcile failed for dataset %s: %s", dataset_id, exc)

    db.commit()
    db.refresh(d)

    return DatasetTransitionResponse(
        dataset_id=dataset_id,
        dataset_status=d.dataset_status,
        message="Dataset updated successfully.",
        datapoint_readiness=d.datapoint_readiness,
        seeding_async=seeding_async,
    )


# ---------------------------------------------------------------------------
# STAGE + SLICE CREATION (called on submit / resubmit)
# ---------------------------------------------------------------------------

def _write_back_to_dw(db: Session, dataset: Dataset) -> None:
    """
    Upsert all approved data points for this dataset into the DW's ut_data table.

    Upsert behavior follows MySQL ON DUPLICATE KEY UPDATE on ut_data; the effective
    grain should include source_nid when the warehouse unique index does. Values
    written include source_nid from each approved dataset_data_point row.
    Sets ismrd=False so MRD recalculation can be triggered separately.
    On failure the dataset status is NOT rolled back; the error is logged to
    dataset_review_action_log so an admin can retry.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Data, Footnote, get_default_locale
    from apps.shared.utils.validators import generate_guid

    data_points = (
        db.query(DatasetDataPoint)
        .filter(
            DatasetDataPoint.dataset_id == dataset.dataset_id,
            DatasetDataPoint.review_status == "APPROVED",
            DatasetDataPoint.is_deleted.is_(False),
        )
        .all()
    )
    if not data_points:
        return

    try:
        with get_warehouse_session_from_id(str(dataset.dw_id)) as dw_db:
            locale = get_default_locale(dw_db)
            FootnoteModel = Footnote(locale)
            written = 0
            for dp in data_points:
                resolved_footnote_nid = dp.footnote_nid
                if resolved_footnote_nid is None:
                    footnote_text = _normalize_footnote_text(dp.footnote_text)
                    if footnote_text:
                        footnote_row = (
                            dw_db.query(FootnoteModel)
                            .filter(FootnoteModel.footnote == footnote_text)
                            .first()
                        )
                        if footnote_row:
                            resolved_footnote_nid = footnote_row.footnote_nid
                        else:
                            new_footnote = FootnoteModel(
                                footnote=footnote_text,
                                footnote_gid=generate_guid(),
                            )
                            dw_db.add(new_footnote)
                            dw_db.flush()
                            resolved_footnote_nid = new_footnote.footnote_nid
                stmt = (
                    mysql_insert(Data)
                    .values(
                        iusnid=dp.iusnid,
                        area_nid=dp.area_nid,
                        timeperiod_nid=dp.timeperiod_nid,
                        indicator_nid=dp.indicator_nid,
                        unit_nid=dp.unit_nid,
                        subgroup_val_nid=dp.subgroup_val_nid,
                        source_nid=dp.source_nid,
                        footnote_nid=resolved_footnote_nid,
                        data_value=dp.data_value,
                        textual_data_value=dp.textual_data_value,
                        istextualdata=dp.istextualdata,
                        ismrd=False,
                    )
                    .on_duplicate_key_update(
                        indicator_nid=dp.indicator_nid,
                        unit_nid=dp.unit_nid,
                        subgroup_val_nid=dp.subgroup_val_nid,
                        source_nid=dp.source_nid,
                        footnote_nid=resolved_footnote_nid,
                        data_value=dp.data_value,
                        textual_data_value=dp.textual_data_value,
                        istextualdata=dp.istextualdata,
                        ismrd=False,
                    )
                )
                dw_db.execute(stmt)
                written += 1
            dw_db.commit()

        _log(db, dataset_id=dataset.dataset_id, action="DATASET_APPROVED",
             user_id=0, remarks=f"{written} rows written to ut_data")
    except Exception as exc:
        log_background_incident(
            message=(
                f"ut_data write-back failed for dataset {dataset.dataset_id} "
                f"(dw_id={dataset.dw_id}): {exc}"
            ),
            error_code="DATASET_UT_DATA_WRITEBACK_FAILED",
            exc=exc,
            source=_DATASET_SERVICE_SOURCE,
        )
        _log(db, dataset_id=dataset.dataset_id, action="DATASET_APPROVED",
             user_id=0, remarks=f"ut_data write failed: {exc}")


_DATASET_SEED_INSERT_BATCH_SIZE = 1000
_DATASET_SEED_IUS_CHUNK_SIZE = 25
_DATASET_SEED_UT_LOAD_MAX_WORKERS = 3

NaturalKey = Tuple[int, int, int, Optional[int]]
TripleKey = Tuple[int, int, int]


class _UtSeedSnapshot(NamedTuple):
    data_value: Optional[Any]
    textual_data_value: Optional[str]
    istextualdata: bool


def _ut_snapshot_has_data(snap: _UtSeedSnapshot) -> bool:
    kind, _ = _dp_cell_kind_payload(snap.data_value, snap.textual_data_value)
    return kind != "empty"


def _ut_row_to_seed_snapshot(row: Any) -> _UtSeedSnapshot:
    return _UtSeedSnapshot(
        data_value=row.data_value,
        textual_data_value=row.textual_data_value,
        istextualdata=bool(row.istextualdata),
    )


def _build_prev_fallback_by_triple(
    ut_slice: dict[NaturalKey, _UtSeedSnapshot],
    source_priority: Sequence[Optional[int]],
) -> dict[TripleKey, _UtSeedSnapshot]:
    """
    For each (ius, area, timeperiod), pick one non-empty ut_data row using source_priority.
    Built once per ut_data chunk — no extra SQL.
    """
    grouped: dict[TripleKey, list[tuple[Optional[int], _UtSeedSnapshot]]] = {}
    for (ius, area, tp, src), snap in ut_slice.items():
        if not _ut_snapshot_has_data(snap):
            continue
        triple = (ius, area, tp)
        grouped.setdefault(triple, []).append((src, snap))

    pri = {s: i for i, s in enumerate(source_priority)}
    default_pri = len(source_priority)
    out: dict[TripleKey, _UtSeedSnapshot] = {}
    for triple, items in grouped.items():
        items.sort(key=lambda x: (pri.get(x[0], default_pri), x[0] or 0))
        out[triple] = items[0][1]
    return out


def _resolve_prev_ut_snapshot(
    *,
    ut_slice: dict[NaturalKey, _UtSeedSnapshot],
    prev_fallback_by_triple: dict[TripleKey, _UtSeedSnapshot],
    iusnid: int,
    area_nid: int,
    prev_tp: int,
    src_norm: Optional[int],
) -> Optional[_UtSeedSnapshot]:
    """Prior-period ut_data: exact source first, then any other source with data."""
    exact = ut_slice.get(_natural_key_tuple(iusnid, area_nid, prev_tp, src_norm))
    if exact and _ut_snapshot_has_data(exact):
        return exact
    return prev_fallback_by_triple.get((iusnid, area_nid, prev_tp))


def _prev_tmprd_columns_from_snapshot(
    snap: Optional[_UtSeedSnapshot],
) -> tuple[Optional[float], Optional[str]]:
    """Map ut_data prior-period cell to prev_tmprd_data_value / prev_tmprd_textual_data_value."""
    if snap is None:
        return None, None
    kind, payload = _dp_cell_kind_payload(snap.data_value, snap.textual_data_value)
    if kind == "empty":
        return None, None
    if kind == "text":
        return None, str(payload)
    return float(payload), None


def _resolve_prev_tmprd_fields(
    *,
    show_prev: bool,
    fixed_prev_tp: Optional[int],
    ut_slice: dict[NaturalKey, _UtSeedSnapshot],
    prev_fallback_by_triple: dict[TripleKey, _UtSeedSnapshot],
    iusnid: int,
    area_nid: int,
    src_norm: Optional[int],
) -> tuple[Optional[int], Optional[float], Optional[str]]:
    """
    Resolve prev_timeperiod_nid and prev_tmprd_* columns for show_previous_time datasets.

    All rows share the predecessor of the chronologically earliest scoped time period
    (same invariant as upsert and unified list meta). Source fallback applies when the
    datapoint's own source has no prior-period data.
    """
    if not show_prev or fixed_prev_tp is None:
        return None, None, None
    prev_ut = _resolve_prev_ut_snapshot(
        ut_slice=ut_slice,
        prev_fallback_by_triple=prev_fallback_by_triple,
        iusnid=iusnid,
        area_nid=area_nid,
        prev_tp=int(fixed_prev_tp),
        src_norm=src_norm,
    )
    prev_num, prev_text = _prev_tmprd_columns_from_snapshot(prev_ut)
    return int(fixed_prev_tp), prev_num, prev_text


def _chunked(seq: List[Any], size: int) -> Iterator[List[Any]]:
    """Yield successive slices of ``seq`` with at most ``size`` items."""
    if size <= 0:
        raise ValueError("chunk size must be positive")
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def _iter_seed_combinations(
    iusnid_list: List[int],
    area_nids: List[int],
    tp_nids: List[int],
    source_vals: List[Optional[int]],
) -> Iterator[Tuple[int, int, int, Optional[int]]]:
    """Yield (iusnid, area_nid, timeperiod_nid, source_nid) without allocating a master list."""
    for iusnid in iusnid_list:
        for area_nid in area_nids:
            for tp_nid in tp_nids:
                for src in source_vals:
                    yield iusnid, int(area_nid), int(tp_nid), src


def _load_ut_data_slice(
    dw_id: int,
    ius_chunk: List[int],
    area_nids: List[int],
    tp_query_nids: List[int],
) -> dict[NaturalKey, _UtSeedSnapshot]:
    """
    Load a slim ut_data slice for one IUS chunk (own DW session — safe for thread pool).
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Data

    if not ius_chunk:
        return {}

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        ut_rows = (
            dw_db.query(Data)
            .filter(
                Data.iusnid.in_(ius_chunk),
                Data.area_nid.in_(area_nids),
                Data.timeperiod_nid.in_(tp_query_nids),
            )
            .all()
        )
        ut_slice: dict[NaturalKey, _UtSeedSnapshot] = {}
        for r in ut_rows:
            k = _natural_key_tuple(
                int(r.iusnid) if r.iusnid is not None else 0,
                int(r.area_nid) if r.area_nid is not None else 0,
                int(r.timeperiod_nid) if r.timeperiod_nid is not None else 0,
                getattr(r, "source_nid", None),
            )
            ut_slice[k] = _ut_row_to_seed_snapshot(r)
    return ut_slice


def _existing_keys_for_ius_slice(
    db: Session,
    dataset_id: int,
    ius_chunk: List[int],
    area_nids: List[int],
    tp_nids: List[int],
) -> set[NaturalKey]:
    """Existing natural keys for this dataset scoped to the current IUS chunk."""
    if not ius_chunk:
        return set()
    rows = (
        db.query(
            DatasetDataPoint.iusnid,
            DatasetDataPoint.area_nid,
            DatasetDataPoint.timeperiod_nid,
            DatasetDataPoint.source_nid,
        )
        .filter(
            DatasetDataPoint.dataset_id == dataset_id,
            DatasetDataPoint.iusnid.in_(ius_chunk),
            DatasetDataPoint.area_nid.in_(area_nids),
            DatasetDataPoint.timeperiod_nid.in_(tp_nids),
        )
        .all()
    )
    return {
        _natural_key_tuple(r.iusnid, r.area_nid, r.timeperiod_nid, r.source_nid)
        for r in rows
    }


def _build_seed_datapoint(
    *,
    dataset_id: int,
    created_user_id: int,
    ius: Any,
    iusnid: int,
    area_nid: int,
    tp_nid: int,
    src_norm: Optional[int],
    source_name: Optional[str],
    ut: Optional[_UtSeedSnapshot],
    ut_slice: dict[NaturalKey, _UtSeedSnapshot],
    prev_fallback_by_triple: dict[TripleKey, _UtSeedSnapshot],
    show_prev: bool,
    fixed_prev_tp: Optional[int],
    ic_nid: Optional[int],
) -> DatasetDataPoint:
    """Build one dataset_data_point row for seeding."""
    prev_tp, prev_tmprd_num, prev_tmprd_text = _resolve_prev_tmprd_fields(
        show_prev=show_prev,
        fixed_prev_tp=fixed_prev_tp,
        ut_slice=ut_slice,
        prev_fallback_by_triple=prev_fallback_by_triple,
        iusnid=iusnid,
        area_nid=area_nid,
        src_norm=src_norm,
    )
    prev_data_val = (
        _dp_cell_snapshot_str(ut.data_value, ut.textual_data_value)
        if ut
        else None
    )
    return DatasetDataPoint(
        dataset_id=dataset_id,
        iusnid=iusnid,
        indicator_nid=ius.indicator_nid,
        unit_nid=ius.unit_nid,
        subgroup_val_nid=ius.subgroup_val_nid,
        area_nid=area_nid,
        timeperiod_nid=tp_nid,
        source_nid=src_norm,
        source_name=source_name,
        data_value=ut.data_value if ut else None,
        textual_data_value=ut.textual_data_value if ut else None,
        istextualdata=ut.istextualdata if ut else False,
        prev_timeperiod_nid=prev_tp,
        prev_tmprd_data_value=prev_tmprd_num,
        prev_tmprd_textual_data_value=prev_tmprd_text,
        prev_data_value=prev_data_val,
        indicator_classification_id=ic_nid,
        review_status="DRAFT",
        is_locked=False,
        created_user_id=created_user_id,
    )


def _flush_seed_batch(db: Session, batch: List[DatasetDataPoint]) -> None:
    """Persist one insert batch and release ORM identity-map memory."""
    if not batch:
        return
    db.bulk_save_objects(batch)
    db.flush()
    batch.clear()
    db.expire_all()


def _process_ius_chunk_seed(
    db: Session,
    *,
    dataset: Dataset,
    ius_chunk: List[int],
    ius_map: dict[int, Any],
    area_nids: List[int],
    tp_nids: List[int],
    source_vals: List[Optional[int]],
    source_name_by_nid: dict[int, str],
    ut_slice: dict[NaturalKey, _UtSeedSnapshot],
    show_prev: bool,
    fixed_prev_tp: Optional[int],
    ic_map: dict[int, int],
    seed_maps: dict[str, dict[int, str]],
    eff_locale: str,
    dw_db: Session,
    insert_batch: List[DatasetDataPoint],
) -> None:
    """Insert missing datapoints for one IUS chunk using a pre-loaded ut_data slice."""
    prev_fallback_by_triple = _build_prev_fallback_by_triple(ut_slice, source_vals)
    existing_keys = _existing_keys_for_ius_slice(
        db,
        dataset.dataset_id,
        ius_chunk,
        area_nids,
        tp_nids,
    )
    ius_chunk_set = set(ius_chunk)

    for iusnid, area_nid, tp_nid, src in _iter_seed_combinations(
        ius_chunk, area_nids, tp_nids, source_vals
    ):
        if iusnid not in ius_chunk_set:
            continue
        key4 = _natural_key_tuple(iusnid, area_nid, tp_nid, src)
        if key4 in existing_keys:
            continue
        ius = ius_map[iusnid]
        src_norm = key4[3]
        sn = source_name_by_nid.get(src_norm) if src_norm is not None else None
        ut = ut_slice.get(key4)
        dp = _build_seed_datapoint(
            dataset_id=dataset.dataset_id,
            created_user_id=dataset.created_user_id,
            ius=ius,
            iusnid=iusnid,
            area_nid=area_nid,
            tp_nid=tp_nid,
            src_norm=src_norm,
            source_name=sn,
            ut=ut,
            ut_slice=ut_slice,
            prev_fallback_by_triple=prev_fallback_by_triple,
            show_prev=show_prev,
            fixed_prev_tp=fixed_prev_tp,
            ic_nid=ic_map.get(iusnid),
        )
        _populate_datapoint_display_names(dw_db, eff_locale, dp, seed_maps)
        insert_batch.append(dp)
        if len(insert_batch) >= _DATASET_SEED_INSERT_BATCH_SIZE:
            _flush_seed_batch(db, insert_batch)

    ut_slice.clear()
    prev_fallback_by_triple.clear()


def _seed_ius_chunks_pipelined(
    db: Session,
    *,
    dw_id: int,
    dataset: Dataset,
    ius_chunks: List[List[int]],
    area_nids: List[int],
    tp_nids: List[int],
    tp_query_nids: List[int],
    source_vals: List[Optional[int]],
    ius_map: dict[int, Any],
    source_name_by_nid: dict[int, str],
    show_prev: bool,
    fixed_prev_tp: Optional[int],
    ic_map: dict[int, int],
    seed_maps: dict[str, dict[int, str]],
    eff_locale: str,
    dw_db: Session,
) -> None:
    """Run IUS-chunk seeding with pipelined parallel ut_data loads."""
    insert_batch: List[DatasetDataPoint] = []
    max_workers = min(_DATASET_SEED_UT_LOAD_MAX_WORKERS, len(ius_chunks))
    next_idx = 0

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        pending: dict[Any, List[int]] = {}

        def _submit(chunk: List[int]) -> None:
            fut = pool.submit(
                _load_ut_data_slice,
                dw_id,
                chunk,
                area_nids,
                tp_query_nids,
            )
            pending[fut] = chunk

        while next_idx < min(max_workers, len(ius_chunks)):
            _submit(ius_chunks[next_idx])
            next_idx += 1

        while pending:
            done, _ = wait(pending.keys(), return_when=FIRST_COMPLETED)
            for fut in done:
                chunk = pending.pop(fut)
                ut_slice = fut.result()
                _process_ius_chunk_seed(
                    db,
                    dataset=dataset,
                    ius_chunk=chunk,
                    ius_map=ius_map,
                    area_nids=area_nids,
                    tp_nids=tp_nids,
                    source_vals=source_vals,
                    source_name_by_nid=source_name_by_nid,
                    ut_slice=ut_slice,
                    show_prev=show_prev,
                    fixed_prev_tp=fixed_prev_tp,
                    ic_map=ic_map,
                    seed_maps=seed_maps,
                    eff_locale=eff_locale,
                    dw_db=dw_db,
                    insert_batch=insert_batch,
                )
                if next_idx < len(ius_chunks):
                    _submit(ius_chunks[next_idx])
                    next_idx += 1

    _flush_seed_batch(db, insert_batch)


def _seed_ius_chunks_sequential(
    db: Session,
    *,
    dw_id: int,
    dataset: Dataset,
    ius_chunks: List[List[int]],
    area_nids: List[int],
    tp_nids: List[int],
    tp_query_nids: List[int],
    source_vals: List[Optional[int]],
    ius_map: dict[int, Any],
    source_name_by_nid: dict[int, str],
    show_prev: bool,
    fixed_prev_tp: Optional[int],
    ic_map: dict[int, int],
    seed_maps: dict[str, dict[int, str]],
    eff_locale: str,
    dw_db: Session,
) -> None:
    """Run IUS-chunk seeding sequentially (small datasets)."""
    insert_batch: List[DatasetDataPoint] = []
    for chunk in ius_chunks:
        ut_slice = _load_ut_data_slice(dw_id, chunk, area_nids, tp_query_nids)
        _process_ius_chunk_seed(
            db,
            dataset=dataset,
            ius_chunk=chunk,
            ius_map=ius_map,
            area_nids=area_nids,
            tp_nids=tp_nids,
            source_vals=source_vals,
            source_name_by_nid=source_name_by_nid,
            ut_slice=ut_slice,
            show_prev=show_prev,
            fixed_prev_tp=fixed_prev_tp,
            ic_map=ic_map,
            seed_maps=seed_maps,
            eff_locale=eff_locale,
            dw_db=dw_db,
            insert_batch=insert_batch,
        )
    _flush_seed_batch(db, insert_batch)


def _seed_dataset_data_points(
    db: Session,
    dataset: Dataset,
    dw_id: int,
    *,
    locale: Optional[str] = None,
) -> None:
    """
    Seed dataset_data_point rows for the Cartesian product:
    resolved IUS rows × area_nids × timeperiod_nids × source scope.

    When ``dataset.source_nids`` is empty or missing, only ``source_nid=None`` is used
    (aligned with exclusivity checks). Otherwise one row per listed source NID.

    Baseline numeric/text values are copied from ``ut_data`` when a matching row exists
    (same natural key including source). ``source_name`` is resolved from
    ``ut_indicator_classifications_<locale>`` for non-null sources.

    Inserts are batched and ut_data is loaded per IUS chunk so peak memory stays bounded.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import (
        IcIus,
        IndicatorClassification,
        get_default_locale,
    )
    from apps.datawarehouse.utils.timeperiod_predecessor import (
        build_previous_timeperiod_nid_map,
        resolve_previous_timeperiod_nid_for_selection,
    )

    area_nids = dataset.area_nids or []
    indicator_nids = dataset.indicator_nids or []
    unit_nids = dataset.unit_nids or []
    sg_nids = dataset.subgroup_val_nids or []
    tp_nids = dataset.timeperiod_nids or []
    source_vals: list[Optional[int]] = (
        [int(x) for x in dataset.source_nids] if dataset.source_nids else [None]
    )

    if not (area_nids and tp_nids):
        return  # nothing to seed without area+timeperiod

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        eff_locale = locale or get_default_locale(dw_db)
        ic_name_model = IndicatorClassification(eff_locale)

        ius_store = list(dataset.ius_nids) if dataset.ius_nids else []
        ius_rows = _resolve_ius_rows_for_scope(
            dw_db,
            ius_nids=ius_store if ius_store else None,
            indicator_nids=indicator_nids if indicator_nids else None,
            unit_nids=unit_nids if unit_nids else None,
            subgroup_val_nids=sg_nids if sg_nids else None,
        )
        if not ius_rows:
            return

        iusnid_list = [r.iusnid for r in ius_rows]
        ius_map = {r.iusnid: r for r in ius_rows}

        ic_map: dict[int, int] = {}
        try:
            ic_rows = dw_db.query(IcIus).filter(IcIus.iusnid.in_(iusnid_list)).all()
            for ic in ic_rows:
                if ic.iusnid not in ic_map:
                    ic_map[ic.iusnid] = ic.ic_nid
        except Exception:
            pass  # ic_ius optional

        source_name_by_nid: dict[int, str] = {}
        non_null_sources = [s for s in source_vals if s is not None]
        if non_null_sources:
            try:
                ic_src_rows = (
                    dw_db.query(ic_name_model)
                    .filter(ic_name_model.ic_nid.in_(non_null_sources))
                    .all()
                )
                for row in ic_src_rows:
                    if row.ic_nid is not None and row.ic_name is not None:
                        source_name_by_nid[int(row.ic_nid)] = row.ic_name
            except Exception as exc:
                logger.warning("Source name resolution skipped: %s", exc)

        show_prev = _workflow_show_previous_time(db, dataset.workflow_id)
        fixed_prev_tp: Optional[int] = None
        tp_query_nids = [int(x) for x in tp_nids]
        if show_prev:
            prev_timeperiod_map = build_previous_timeperiod_nid_map(dw_db)
            fixed_prev_tp = resolve_previous_timeperiod_nid_for_selection(
                dw_db, [int(t) for t in tp_nids], prev_timeperiod_map
            )
            if fixed_prev_tp is not None:
                tp_query_nids = list(set(tp_query_nids) | {fixed_prev_tp})

        seed_maps = _new_display_name_maps()
        _fetch_dw_display_name_maps(
            dw_db,
            eff_locale,
            {r.indicator_nid for r in ius_rows},
            {r.unit_nid for r in ius_rows},
            {r.subgroup_val_nid for r in ius_rows if r.subgroup_val_nid is not None},
            [int(x) for x in area_nids],
            existing=seed_maps,
        )

        ius_chunks = list(_chunked(iusnid_list, _DATASET_SEED_IUS_CHUNK_SIZE))
        seed_kwargs = dict(
            dw_id=dw_id,
            dataset=dataset,
            ius_chunks=ius_chunks,
            area_nids=area_nids,
            tp_nids=tp_nids,
            tp_query_nids=tp_query_nids,
            source_vals=source_vals,
            ius_map=ius_map,
            source_name_by_nid=source_name_by_nid,
            show_prev=show_prev,
            fixed_prev_tp=fixed_prev_tp,
            ic_map=ic_map,
            seed_maps=seed_maps,
            eff_locale=eff_locale,
            dw_db=dw_db,
        )
        if len(ius_chunks) == 1 or _DATASET_SEED_UT_LOAD_MAX_WORKERS <= 1:
            _seed_ius_chunks_sequential(db, **seed_kwargs)
        else:
            _seed_ius_chunks_pipelined(db, **seed_kwargs)


def _check_scope_exclusivity(
    db: Session,
    dw_id: int,
    iusnid_list: list[int],
    area_nids: list[int],
    tp_nids: list[int],
    source_nids: Optional[list[int]] = None,
    exclude_dataset_id: Optional[int] = None,
) -> list[dict]:
    """
    Returns list of conflict dicts: {iusnid, source_nid, area_nid, timeperiod_nid,
    locked_by_dataset_id, locked_by_dataset_name, status}.

    Any non-terminal dataset on this dw_id counts. Uniqueness key is
    (iusnid, source_nid, area_nid, timeperiod_nid). When source_nids is omitted or empty,
    only the candidate source_nid None (NULL) is checked — i.e. ius×area×timeperiod with NULL source.

    Raises nothing — caller decides what to do with the list.
    """
    if not (iusnid_list and area_nids and tp_nids):
        return []

    source_vals: list[Optional[int]] = list(source_nids) if source_nids else [None]

    q = (
        db.query(
            DatasetDataPoint.iusnid,
            DatasetDataPoint.source_nid,
            DatasetDataPoint.area_nid,
            DatasetDataPoint.timeperiod_nid,
            Dataset.dataset_id,
            Dataset.dataset_name,
            Dataset.dataset_status,
        )
        .join(Dataset, Dataset.dataset_id == DatasetDataPoint.dataset_id)
        .filter(
            Dataset.dw_id == dw_id,
            Dataset.dataset_status.notin_(list(_TERMINAL_STATUSES)),
            DatasetDataPoint.iusnid.in_(iusnid_list),
            DatasetDataPoint.area_nid.in_(area_nids),
            DatasetDataPoint.timeperiod_nid.in_(tp_nids),
        )
    )
    if exclude_dataset_id:
        q = q.filter(Dataset.dataset_id != exclude_dataset_id)

    existing = q.all()
    existing_set = {
        (r.iusnid, r.source_nid, r.area_nid, r.timeperiod_nid): r for r in existing
    }

    combos = [
        (i, s, a, t)
        for i in iusnid_list
        for s in source_vals
        for a in area_nids
        for t in tp_nids
    ]
    conflicts = []
    for (i, s, a, t) in combos:
        if (i, s, a, t) in existing_set:
            r = existing_set[(i, s, a, t)]
            conflicts.append({
                "iusnid": i,
                "source_nid": s,
                "area_nid": a,
                "timeperiod_nid": t,
                "locked_by_dataset_id": r.dataset_id,
                "locked_by_dataset_name": r.dataset_name,
                "status": r.dataset_status,
            })
    return conflicts


def _reconcile_scope(
    db: Session,
    dataset: Dataset,
    dw_id: int,
    *,
    locale: Optional[str] = None,
) -> bool:
    """
    On scope change: delete out-of-scope rows, seed new in-scope rows.
    Out-of-scope = in dataset_data_point but not in new scope combinations.

    Returns True when seeding was queued as a background job (datapoint_readiness CREATED).
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id

    new_area = dataset.area_nids or []
    new_tp = dataset.timeperiod_nids or []

    if not new_area or not new_tp:
        return False

    # Resolve new iusnids (explicit ius_nids on the dataset takes precedence over I×U×SG filters)
    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        ius_store = list(dataset.ius_nids) if dataset.ius_nids else []
        ius_rows = _resolve_ius_rows_for_scope(
            dw_db,
            ius_nids=ius_store if ius_store else None,
            indicator_nids=list(dataset.indicator_nids or []) or None,
            unit_nids=list(dataset.unit_nids or []) or None,
            subgroup_val_nids=list(dataset.subgroup_val_nids or []) or None,
        )
        new_iusnids = [r.iusnid for r in ius_rows]

    expected_dp = _expected_scope_datapoint_count(
        len(new_iusnids),
        new_area,
        new_tp,
        dataset.source_nids,
    )

    removed = _delete_unlocked_datapoints_outside_scope(
        db,
        dataset.dataset_id,
        iusnids=new_iusnids,
        area_nids=new_area,
        timeperiod_nids=new_tp,
        source_nids=list(dataset.source_nids) if dataset.source_nids else None,
    )
    if removed:
        logger.debug(
            "Scope reconcile removed %s out-of-scope datapoints for dataset %s",
            removed,
            dataset.dataset_id,
        )
    db.flush()
    eff_locale = locale or "en"
    if (
        settings.DATASET_SEED_BG_THRESHOLD > 0
        and expected_dp > settings.DATASET_SEED_BG_THRESHOLD
    ):
        dataset.datapoint_readiness = "CREATED"
        from apps.shared.services.bg_job_dispatch import (
            JOB_TYPE_SEED_DATASET_DATA_POINTS,
            dispatch_bg_job,
        )
        dispatch_bg_job(
            db=db,
            job_type=JOB_TYPE_SEED_DATASET_DATA_POINTS,
            payload={
                "dataset_id": dataset.dataset_id,
                "dw_id": dw_id,
                "locale": eff_locale,
            },
            dw_id=str(dw_id),
            priority=1,
        )
        return True

    try:
        _seed_dataset_data_points(db, dataset, dw_id, locale=eff_locale)
        dataset.datapoint_readiness = "COMPLETED"
    except Exception as exc:
        dataset.datapoint_readiness = "FAILED"
        logger.error("Scope reconcile seeding failed for dataset %s: %s", dataset.dataset_id, exc)
    return False


def _create_stages_and_slices(db: Session, dataset: Dataset, now: datetime) -> None:
    """
    Called synchronously when a dataset transitions to PENDING_REVIEW.

    1. Creates one DatasetReviewStage per active workflow level (all PENDING).
       When workflow.allow_review is true, levels with level_no == 0 are skipped.
    2. Activates the first stage.
    3. Creates one DatasetReviewSlice per distinct area_nid (AREA scope) or
       indicator_classification_id (CLASSIFICATION scope) in the dataset's data points.
    4. Assigns each data point to its slice and locks it (is_locked=True).
    5. Updates dataset.current_stage_id and transitions dataset_status → PENDING_REVIEW.

    On resubmit (REVISION → PENDING_REVIEW):
    - Existing stages that are still PENDING are reused.
    - The current active stage's slices that were REVISION_REQUESTED are reset to ACTIVE.
    - Unlocked (corrected) data points are re-linked to their slice.
    """
    dataset_id = dataset.dataset_id

    # Fetch workflow first; review_operational requires allow_review and review_level_count > 0
    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == dataset.workflow_id)
        .one()
    )

    # ── Active workflow levels (omit level_no 0 when allow_review for dataset-review path) ──
    level_q = db.query(ReviewWorkflowLevel).filter(
        ReviewWorkflowLevel.workflow_id == dataset.workflow_id,
        ReviewWorkflowLevel.is_active.is_(True),
    )
    if workflow.allow_review:
        level_q = level_q.filter(ReviewWorkflowLevel.level_no > 0)
    levels = level_q.order_by(ReviewWorkflowLevel.level_no).all()

    if not workflow.review_operational or not levels:
        # No review needed — approve immediately
        db.query(DatasetDataPoint).filter(
            DatasetDataPoint.dataset_id == dataset_id,
        ).update(
            {"is_locked": True, "review_status": "APPROVED"},
            synchronize_session=False,
        )
        dataset.dataset_status = "APPROVED"
        dataset.approved_on = now
        dataset.last_updated_at = now
        _log(db, dataset_id=dataset_id, action="DATASET_APPROVED",
             prev_status="PENDING_REVIEW", new_status="APPROVED", user_id=0,
             remarks="Auto-approved: no review required")
        # Flush so data points have review_status=APPROVED before write-back reads them
        db.flush()
        to_del = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.dataset_id == dataset_id,
                DatasetDataPoint.review_status == "APPROVED",
                DatasetDataPoint.is_deleted.is_(True),
            )
            .all()
        )
        _delete_ut_data_for_soft_deleted_approved_datapoints(db, int(dataset.dw_id), to_del)
        _write_back_to_dw(db, dataset)
        return

    # ── Create stages (skip if already exist for resubmit) ───────────────────
    existing_stage_map: dict[int, DatasetReviewStage] = {
        s.workflow_review_level_id: s
        for s in db.query(DatasetReviewStage)
        .filter(DatasetReviewStage.dataset_id == dataset_id)
        .all()
    }

    ordered_stages: list[DatasetReviewStage] = []
    for level in levels:
        if level.workflow_review_level_id in existing_stage_map:
            ordered_stages.append(existing_stage_map[level.workflow_review_level_id])
        else:
            stage = DatasetReviewStage(
                dataset_id=dataset_id,
                workflow_review_level_id=level.workflow_review_level_id,
                level_no=level.level_no,
                stage_status="PENDING",
            )
            db.add(stage)
            ordered_stages.append(stage)

    db.flush()  # get stage_ids for newly created stages

    # ── Activate first PENDING stage ─────────────────────────────────────────
    active_stage: Optional[DatasetReviewStage] = None
    active_level: Optional[ReviewWorkflowLevel] = None

    for stage, level in zip(ordered_stages, levels):
        if stage.stage_status in ("PENDING", "ACTIVE"):
            active_stage = stage
            active_level = level
            break

    if active_stage is None:
        logger.warning("Dataset %s: no PENDING/ACTIVE stage found after creation.", dataset_id)
        return

    if active_stage.stage_status == "PENDING":
        active_stage.stage_status = "ACTIVE"
        active_stage.activated_at = now
        _log(db, dataset_id=dataset_id, action="STAGE_ACTIVATED",
             user_id=0, stage_id=active_stage.stage_id,
             remarks=f"Level {active_level.level_no}")

    dataset.current_stage_id = active_stage.stage_id

    # ── Create / reset slices for the active stage ───────────────────────────
    scope_type = active_level.review_scope_type  # "AREA" or "CLASSIFICATION"

    existing_slices: dict[int, DatasetReviewSlice] = {}
    if scope_type == "AREA":
        for s in (
            db.query(DatasetReviewSlice)
            .filter(
                DatasetReviewSlice.stage_id == active_stage.stage_id,
                DatasetReviewSlice.scope_type == "AREA",
            )
            .all()
        ):
            existing_slices[s.area_nid] = s
    elif scope_type == "CLASSIFICATION":
        for s in (
            db.query(DatasetReviewSlice)
            .filter(
                DatasetReviewSlice.stage_id == active_stage.stage_id,
                DatasetReviewSlice.scope_type == "CLASSIFICATION",
            )
            .all()
        ):
            existing_slices[s.classification_nid] = s

    if scope_type == "AREA":
        area_nids = [
            r[0] for r in
            db.query(DatasetDataPoint.area_nid)
            .filter(DatasetDataPoint.dataset_id == dataset_id)
            .distinct()
            .all()
        ]

        for area_nid in area_nids:
            if area_nid in existing_slices:
                # Resubmit: re-activate RETURNED slice
                sl = existing_slices[area_nid]
                if sl.slice_status == "REVISION_REQUESTED":
                    sl.slice_status = "ACTIVE"
                    sl.started_at = now
                    sl.completed_at = None
            else:
                sl = DatasetReviewSlice(
                    dataset_id=dataset_id,
                    stage_id=active_stage.stage_id,
                    scope_type="AREA",
                    area_nid=area_nid,
                    slice_status="ACTIVE",
                    started_at=now,
                    created=now,
                )
                db.add(sl)
                db.flush()
                existing_slices[area_nid] = sl
                _log(db, dataset_id=dataset_id, action="SLICE_ACTIVATED",
                     user_id=0, stage_id=active_stage.stage_id,
                     slice_id=sl.slice_id,
                     remarks=f"area_nid={area_nid}")

            # Assign unlocked data points to this slice, lock them, and mark PENDING_REVIEW
            db.query(DatasetDataPoint).filter(
                DatasetDataPoint.dataset_id == dataset_id,
                DatasetDataPoint.area_nid == area_nid,
                DatasetDataPoint.is_locked.is_(False),
            ).update(
                {
                    "dataset_review_slice_id": existing_slices[area_nid].slice_id,
                    "is_locked": True,
                    "review_status": "PENDING_REVIEW",
                },
                synchronize_session=False,
            )

    elif scope_type == "CLASSIFICATION":
        class_nids = [
            r[0] for r in
            db.query(DatasetDataPoint.indicator_classification_id)
            .filter(
                DatasetDataPoint.dataset_id == dataset_id,
                DatasetDataPoint.indicator_classification_id.isnot(None),
            )
            .distinct()
            .all()
        ]

        for class_nid in class_nids:
            if class_nid in existing_slices:
                sl = existing_slices[class_nid]
                if sl.slice_status == "REVISION_REQUESTED":
                    sl.slice_status = "ACTIVE"
                    sl.started_at = now
                    sl.completed_at = None
            else:
                sl = DatasetReviewSlice(
                    dataset_id=dataset_id,
                    stage_id=active_stage.stage_id,
                    scope_type="CLASSIFICATION",
                    classification_nid=class_nid,
                    slice_status="ACTIVE",
                    started_at=now,
                    created=now,
                )
                db.add(sl)
                db.flush()
                existing_slices[class_nid] = sl
                _log(db, dataset_id=dataset_id, action="SLICE_ACTIVATED",
                     user_id=0, stage_id=active_stage.stage_id,
                     slice_id=sl.slice_id,
                     remarks=f"classification_nid={class_nid}")

            db.query(DatasetDataPoint).filter(
                DatasetDataPoint.dataset_id == dataset_id,
                DatasetDataPoint.indicator_classification_id == class_nid,
                DatasetDataPoint.is_locked.is_(False),
            ).update(
                {
                    "dataset_review_slice_id": existing_slices[class_nid].slice_id,
                    "is_locked": True,
                    "review_status": "PENDING_REVIEW",
                },
                synchronize_session=False,
            )

    # ── Advance dataset to PENDING_REVIEW ────────────────────────────────────
    dataset.dataset_status = "PENDING_REVIEW"
    dataset.last_updated_at = now


# ---------------------------------------------------------------------------
# OPERATOR STATUS TRANSITION
# ---------------------------------------------------------------------------

def operator_transition(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    payload: DatasetOperatorTransitionRequest,
    app_key: str,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> DatasetTransitionResponse:
    """
    Drive operator status transitions:
        DRAFT    → PENDING_REVIEW   (initial submit)
        REVISION → PENDING_REVIEW   (resubmit after reviewer requests revision)

    _create_stages_and_slices() auto-approves when review is not operational (allow_review false,
    review_level_count 0, or no runnable levels—including when allow_review trims level_no == 0)
    and runs the full review flow when operational with matching levels.

    Submit checks:
    - Dataset must have at least one data point.
    - No other non-terminal dataset on this warehouse with overlapping IUS×source×area×timeperiod.

    Super-admin override: bypasses ownership; transition state machine and
    exclusivity checks are still enforced.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("TRANSITION_NOT_ALLOWED")
        ValueError("NO_DATA_POINTS")
        ValueError("EXCLUSIVITY_CONFLICT")
    """
    d = _assert_dataset_owner(
        db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
    )
    prev = d.dataset_status
    target = payload.status
    now = _now()

    # ── PENDING_REVIEW (submit / resubmit) ───────────────────────────────────
    if target == "PENDING_REVIEW":
        if prev not in {"DRAFT", "REVISION"}:
            raise ValueError("TRANSITION_NOT_ALLOWED")

        # At least one data point required
        dp_count = (
            db.query(func.count(DatasetDataPoint.data_point_id))
            .filter(DatasetDataPoint.dataset_id == dataset_id)
            .scalar()
        ) or 0
        if dp_count == 0:
            raise ValueError("NO_DATA_POINTS")

        # ── Exclusivity check then stage/slice creation ─────────────────────────
        dp_alias = DatasetDataPoint.__table__.alias("dp2")
        source_match = or_(
            and_(DatasetDataPoint.source_nid.is_(None), dp_alias.c.source_nid.is_(None)),
            and_(
                DatasetDataPoint.source_nid.isnot(None),
                DatasetDataPoint.source_nid == dp_alias.c.source_nid,
            ),
        )
        conflict_row = (
            db.query(Dataset.dataset_id, Dataset.dataset_name, Dataset.dataset_status)
            .join(
                dp_alias,
                (dp_alias.c.dataset_id == Dataset.dataset_id),
            )
            .join(
                DatasetDataPoint,
                (DatasetDataPoint.iusnid == dp_alias.c.iusnid)
                & (DatasetDataPoint.area_nid == dp_alias.c.area_nid)
                & (DatasetDataPoint.timeperiod_nid == dp_alias.c.timeperiod_nid)
                & source_match
                & (DatasetDataPoint.dataset_id == dataset_id),
            )
            .filter(
                Dataset.dataset_id != dataset_id,
                Dataset.dataset_status.notin_(list(_TERMINAL_STATUSES)),
            )
            .first()
        )
        if conflict_row:
            raise ValueError(
                f"EXCLUSIVITY_CONFLICT:{conflict_row.dataset_name}:{conflict_row.dataset_status}"
            )

        action = "DATASET_SUBMITTED" if prev == "DRAFT" else "DATASET_RESUBMITTED"
        d.dataset_status = "PENDING_REVIEW"
        d.submitted_at = now
        d.submitted_by_user_id = user_id
        if prev == "REVISION":
            d.revision_count = (d.revision_count or 0) + 1
        d.last_updated_at = now
        _log(db, dataset_id=dataset_id, action=action,
             prev_status=prev, new_status="PENDING_REVIEW", user_id=user_id)

        _create_stages_and_slices(db, d, now)

        db.commit()
        db.refresh(d)

        event_code = "DATASET_SUBMITTED" if prev == "DRAFT" else "DATASET_RESUBMITTED"
        notify_ctx = _build_dataset_notification_context(
            db, d, actor_user_id=user_id, app_key=app_key
        )
        notification_service.emit(
            db,
            event_code=event_code,
            context=notify_ctx,
            dw_id=dw_id,
            app_key=app_key,
            dataset=d,
            actor_user_id=user_id,
            locale=locale,
        )

        msg = (
            "Dataset submitted for review."
            if prev == "DRAFT"
            else f"Dataset resubmitted for review (revision {d.revision_count})."
        )
        return DatasetTransitionResponse(
            dataset_id=dataset_id,
            dataset_status=d.dataset_status,
            message=msg,
        )

    raise ValueError("TRANSITION_NOT_ALLOWED")


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

def delete_dataset(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    *,
    is_super_admin: bool = False,
) -> DatasetDeleteResponse:
    """
    Permanently delete a DRAFT dataset and all its data points.
    Only allowed when dataset_status is DRAFT.

    When the data-point count exceeds DATASET_DELETE_BG_THRESHOLD the dataset is
    marked DELETED and deletion is delegated to a background job; the caller
    receives delete_async=True in the response.

    Super-admin override: bypasses ownership; DRAFT-only guard still applies.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("DELETE_NOT_ALLOWED")
    """
    d = _assert_dataset_owner(
        db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
    )
    if d.dataset_status != "DRAFT":
        raise ValueError("DELETE_NOT_ALLOWED")

    # Count data points to decide sync vs async path.
    dp_count = (
        db.query(func.count(DatasetDataPoint.data_point_id))
        .filter(DatasetDataPoint.dataset_id == dataset_id)
        .scalar()
    ) or 0
    
    if settings.DATASET_DELETE_BG_THRESHOLD > 0 and dp_count > settings.DATASET_DELETE_BG_THRESHOLD:
        d.dataset_status = "DELETED"
        from apps.shared.services.bg_job_dispatch import (
            JOB_TYPE_DELETE_DATASET,
            dispatch_bg_job,
        )
        dispatch_bg_job(
            db=db,
            job_type=JOB_TYPE_DELETE_DATASET,
            payload={"dataset_id": dataset_id, "dw_id": dw_id},
            dw_id=str(dw_id),
            priority=1,
        )
        return DatasetDeleteResponse(
            dataset_id=dataset_id,
            message=f"Dataset {dataset_id} queued for deletion.",
            delete_async=True,
        )

    # Action log rows are intentionally kept — they are the audit history.
    # Delete only data points (no other FK children exist for a DRAFT dataset).
    db.query(DatasetDataPoint).filter(
        DatasetDataPoint.dataset_id == dataset_id
    ).delete(synchronize_session=False)

    db.delete(d)
    db.commit()

    return DatasetDeleteResponse(
        dataset_id=dataset_id,
        message=f"Dataset {dataset_id} deleted.",
    )


# ---------------------------------------------------------------------------
# DELETE DATA POINTS
# ---------------------------------------------------------------------------

def delete_data_points(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    payload: DataPointDeleteRequest,
    *,
    is_super_admin: bool = False,
) -> DataPointDeleteResponse:
    """
    Delete selected data points from a DRAFT dataset only.

    Rules:
    - Dataset must be in DRAFT status.
    - Only unlocked rows (is_locked=False) may be deleted.
      Locked rows (assigned to an active review slice) are silently skipped.
    - Data points that do not belong to this dataset are silently skipped.

    Super-admin override: bypasses ownership; status / lock rules still apply.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("DATASET_NOT_EDITABLE")
    """
    d = _assert_dataset_owner(
        db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
    )
    if d.dataset_status not in _DELETABLE_STATUSES:
        raise ValueError("DATASET_NOT_EDITABLE")

    # Fetch only the rows that belong to this dataset
    rows = (
        db.query(DatasetDataPoint)
        .filter(
            DatasetDataPoint.dataset_id == dataset_id,
            DatasetDataPoint.data_point_id.in_(payload.data_point_ids),
        )
        .all()
    )

    deleted = 0
    skipped = 0
    for row in rows:
        if row.is_locked:
            skipped += 1
            continue
        db.delete(row)
        deleted += 1

    # IDs requested but not found in this dataset count as skipped
    skipped += len(payload.data_point_ids) - len(rows)

    db.commit()

    return DataPointDeleteResponse(
        dataset_id=dataset_id,
        deleted=deleted,
        skipped=skipped,
        message=f"Deleted {deleted} data point(s)."
        + (f" {skipped} skipped (locked or not found)." if skipped else ""),
    )


# Data point delete only allowed in DRAFT; in REVISION operator corrects values, not deletes
_DELETABLE_STATUSES = {"DRAFT"}

# Statuses where delete is completely blocked
_NON_DELETABLE_STATUSES = {"PENDING_REVIEW", "REVISION", "APPROVED", "REJECTED"}


def delete_data_point(
    db: Session,
    dw_id: int,
    dataset_id: int,
    data_point_id: int,
    user_id: int,
    *,
    is_super_admin: bool = False,
) -> DataPointDeleteResponse:
    """
    Delete a single data point.

    Non-APPROVED dataset (DRAFT only):
        - Row must be unlocked (is_locked=False).
        - Deletes from dataset_data_point.
        - Authorized: dataset owner.

    APPROVED dataset (all modes):
        - Deletes from ut_data (DW).
        - Keeps dataset_data_point row (audit history).
        - Logs DATA_POINT_DELETED to dataset_review_action_log.
        - Authorized: dataset owner (same dm_dw_data_entry DELETE permission).

    Super-admin override: bypasses ownership; status / lock rules still apply.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("DATA_POINT_NOT_DELETABLE")  — status blocks any delete
        ValueError("DATA_POINT_NOT_FOUND")       — row not in this dataset
        ValueError("DATA_POINT_LOCKED")          — is_locked=True in editable status
        ValueError("UT_DATA_DELETE_FAILED")      — DW write failure
    """
    d = _assert_dataset_owner(
        db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
    )

    # ── APPROVED path: delete from ut_data ───────────────────────────────────
    if d.dataset_status == "APPROVED":
        row = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.dataset_id == dataset_id,
                DatasetDataPoint.data_point_id == data_point_id,
            )
            .first()
        )
        if not row:
            raise ValueError("DATA_POINT_NOT_FOUND")

        # Delete from ut_data in the DW (natural key includes source)
        try:
            _delete_ut_data_row_for_datapoint(dw_id, row)
        except ValueError:
            raise
        except Exception as exc:
            log_background_incident(
                message=(
                    f"ut_data delete failed for data_point_id={data_point_id} "
                    f"dataset={dataset_id} dw_id={dw_id}: {exc}"
                ),
                error_code="DATASET_UT_DATA_DELETE_FAILED",
                exc=exc,
                source=_DATASET_SERVICE_SOURCE,
            )
            raise ValueError("UT_DATA_DELETE_FAILED")

        # Keep dataset_data_point row; log the deletion
        _log(
            db, dataset_id=dataset_id, action="DATA_POINT_DELETED",
            user_id=user_id, data_point_id=data_point_id,
            remarks=f"Deleted from ut_data by user {user_id}",
        )
        db.commit()

        return DataPointDeleteResponse(
            dataset_id=dataset_id,
            deleted=1,
            skipped=0,
            message=f"Data point {data_point_id} deleted from datawarehouse.",
        )

    # ── Blocked statuses ─────────────────────────────────────────────────────
    if d.dataset_status in _NON_DELETABLE_STATUSES:
        raise ValueError("DATA_POINT_NOT_DELETABLE")

    # ── Non-APPROVED editable statuses: delete from dataset_data_point ───────
    if d.dataset_status not in _DELETABLE_STATUSES:
        raise ValueError("DATA_POINT_NOT_DELETABLE")

    row = (
        db.query(DatasetDataPoint)
        .filter(
            DatasetDataPoint.dataset_id == dataset_id,
            DatasetDataPoint.data_point_id == data_point_id,
        )
        .first()
    )
    if not row:
        raise ValueError("DATA_POINT_NOT_FOUND")
    if row.is_locked:
        raise ValueError("DATA_POINT_LOCKED")

    db.delete(row)
    db.commit()

    return DataPointDeleteResponse(
        dataset_id=dataset_id,
        deleted=1,
        skipped=0,
        message=f"Data point {data_point_id} deleted.",
    )


# ===========================================================================
# REVIEWER — helpers
# ===========================================================================

def _review_scope_type_is_area(level: Optional[ReviewWorkflowLevel]) -> bool:
    if level is None:
        return False
    st = level.review_scope_type
    if st is None:
        return False
    val = getattr(st, "value", st)
    return str(val).upper() == "AREA"


def _review_scope_type_is_classification(level: Optional[ReviewWorkflowLevel]) -> bool:
    if level is None:
        return False
    st = level.review_scope_type
    if st is None:
        return False
    val = getattr(st, "value", st)
    return str(val).upper() == "CLASSIFICATION"


def _current_review_workflow_level_for_dataset(
    db: Session, dataset: Dataset
) -> Optional[ReviewWorkflowLevel]:
    if not dataset.current_stage_id:
        return None
    stage = (
        db.query(DatasetReviewStage)
        .filter(DatasetReviewStage.stage_id == dataset.current_stage_id)
        .first()
    )
    if not stage:
        return None
    return (
        db.query(ReviewWorkflowLevel)
        .filter(ReviewWorkflowLevel.workflow_review_level_id == stage.workflow_review_level_id)
        .first()
    )


def expand_descendant_area_nids(dw_id: int, locale: str, seed_nids: list[int]) -> set[int]:
    """
    Union of seed_nids and every area_nid whose area chain leads up to a seed
    (BFS downward via area_parent_nid).
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Area

    out: set[int] = {int(x) for x in seed_nids if x is not None}
    if not out:
        return out
    try:
        with get_warehouse_session_from_id(str(dw_id)) as wh_db:
            AreaModel = Area(locale)
            frontier = list(out)
            while frontier:
                rows = (
                    wh_db.query(AreaModel.area_nid)
                    .filter(AreaModel.area_parent_nid.in_(frontier))
                    .all()
                )
                children = {int(r[0]) for r in rows if r[0] is not None}
                children -= out
                if not children:
                    break
                out.update(children)
                frontier = list(children)
    except AppException as e:
        logger.warning(
            "DW unavailable for reviewer area expansion dw_id=%s: %s", dw_id, e.public_message
        )
    except Exception as e:
        logger.warning("Reviewer area expansion failed dw_id=%s: %s", dw_id, e)

    return out


_AREA_ASSIGNMENT_CLEANUP_CHUNK = 500


def delete_workflow_area_assignments_wrong_level(
    db: Session,
    dw_id: int,
    locale: str,
    workflow_id: int,
    area_level: int,
) -> int:
    """
    Delete workflow-scoped ``iam_user_role_content`` rows with ``dm_dw_area`` where
    ``content_id`` is not an area at ``area_level`` in the warehouse (including
    missing area rows and NULL ``area_level`` on the area).

    Raises ``AppException`` if the warehouse session cannot be opened (same as
    other DW-backed routes).

    Returns the number of rows deleted.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Area

    assigned_rows = (
        db.query(IamUserRoleContent.content_id)
        .filter(
            IamUserRoleContent.workflow_id == workflow_id,
            IamUserRoleContent.resource_code == "dm_dw_area",
        )
        .distinct()
        .all()
    )
    assigned: Set[int] = {int(r[0]) for r in assigned_rows if r[0] is not None}
    if not assigned:
        return 0

    valid_nids: Set[int] = set()
    ids_list = list(assigned)
    try:
        with get_warehouse_session_from_id(str(dw_id)) as wh_db:
            AreaModel = Area(locale)
            for i in range(0, len(ids_list), _AREA_ASSIGNMENT_CLEANUP_CHUNK):
                chunk = ids_list[i : i + _AREA_ASSIGNMENT_CLEANUP_CHUNK]
                rows = (
                    wh_db.query(AreaModel.area_nid)
                    .filter(
                        AreaModel.area_nid.in_(chunk),
                        AreaModel.area_level == area_level,
                    )
                    .all()
                )
                valid_nids.update(int(r[0]) for r in rows if r[0] is not None)
    except AppException:
        raise

    invalid_nids = assigned - valid_nids
    if not invalid_nids:
        return 0

    deleted_total = 0
    inv_list = list(invalid_nids)
    for i in range(0, len(inv_list), _AREA_ASSIGNMENT_CLEANUP_CHUNK):
        chunk = inv_list[i : i + _AREA_ASSIGNMENT_CLEANUP_CHUNK]
        deleted_total += (
            db.query(IamUserRoleContent)
            .filter(
                IamUserRoleContent.workflow_id == workflow_id,
                IamUserRoleContent.resource_code == "dm_dw_area",
                IamUserRoleContent.content_id.in_(chunk),
            )
            .delete(synchronize_session=False)
        )
    print(f"deleted_total: {deleted_total}")
    return deleted_total


def _effective_reviewer_area_nids(
    db: Session,
    dw_id: int,
    base_area_nids: list[int],
    level: Optional[ReviewWorkflowLevel],
    locale: str = "en",
) -> list[int]:
    """IAM-assigned areas, optionally expanded to DW descendants when level.include_childs."""
    if not base_area_nids:
        return []
    dedup = list(dict.fromkeys(base_area_nids))
    if not _review_scope_type_is_area(level) or not level or not level.include_childs:
        return dedup
    expanded = expand_descendant_area_nids(dw_id, locale, dedup)
    return list(expanded)


def _get_effective_reviewer_area_nids_for_dataset(
    db: Session,
    dw_id: int,
    user_id: int,
    workflow_id: Optional[int],
    dataset: Dataset,
    locale: str = "en",
) -> list[int]:
    if workflow_id is None:
        return []
    level = _current_review_workflow_level_for_dataset(db, dataset)
    base = _get_reviewer_area_nids(db, user_id, workflow_id, level)
    return _effective_reviewer_area_nids(db, dw_id, base, level, locale)


def _get_reviewer_area_nids(
    db: Session,
    user_id: int,
    workflow_id: int,
    level: Optional[ReviewWorkflowLevel] = None,
) -> list[int]:
    """
    Return area_nids this user is authorized for under the given workflow.

    When ``level`` is set, only ``iam_user_role_content`` rows whose role matches
    ``level.role_id`` are included (direct ``role_id`` on the row, or legacy NULL
    ``role_id`` resolved via ``iam_user_role.role_id``).
    """
    q = (
        db.query(IamUserRoleContent.content_id)
        .filter(
            IamUserRoleContent.user_id == user_id,
            IamUserRoleContent.resource_code == "dm_dw_area",
            IamUserRoleContent.workflow_id == workflow_id,
        )
    )
    if level is not None:
        q = q.outerjoin(IamUserRole, IamUserRole.id == IamUserRoleContent.user_role_id).filter(
            or_(
                IamUserRoleContent.role_id == level.role_id,
                and_(
                    IamUserRoleContent.role_id.is_(None),
                    IamUserRole.role_id == level.role_id,
                ),
            )
        )
    rows = q.all()
    return list(dict.fromkeys(r.content_id for r in rows))


def _get_reviewer_classification_nids(
    db: Session,
    user_id: int,
    workflow_id: int,
    level: Optional[ReviewWorkflowLevel] = None,
) -> list[int]:
    """Return indicator_classification nids for workflow-scoped reviewer assignments."""
    q = (
        db.query(IamUserRoleContent.content_id)
        .filter(
            IamUserRoleContent.user_id == user_id,
            IamUserRoleContent.resource_code == "dm_dw_indicator_classification",
            IamUserRoleContent.workflow_id == workflow_id,
        )
    )
    if level is not None:
        q = q.outerjoin(IamUserRole, IamUserRole.id == IamUserRoleContent.user_role_id).filter(
            or_(
                IamUserRoleContent.role_id == level.role_id,
                and_(
                    IamUserRoleContent.role_id.is_(None),
                    IamUserRole.role_id == level.role_id,
                ),
            )
        )
    rows = q.all()
    return list(dict.fromkeys(r.content_id for r in rows))


# Slice statuses for which an ACTIVE review stage stays visible as current-reviewer
# list/inbox access (includes reconciled APPROVED slices awaiting stage decision).
_REVIEW_VISIBILITY_SLICE_STATUSES: tuple[str, ...] = (
    "ACTIVE",
    "APPROVED",
    "REVISION_REQUESTED",
)


def _dataset_current_review_stage_is_active(db: Session, dataset: Dataset) -> bool:
    if not dataset.current_stage_id:
        return False
    st = (
        db.query(DatasetReviewStage.stage_status)
        .filter(DatasetReviewStage.stage_id == dataset.current_stage_id)
        .scalar()
    )
    return st == "ACTIVE"


def _list_reviewer_slices_for_dataset_with_statuses(
    db: Session,
    dw_id: int,
    user_id: int,
    dataset: Dataset,
    locale: str,
    slice_statuses: Collection[str],
    *,
    is_super_admin: bool = False,
) -> list[DatasetReviewSlice]:
    """
    Slices on ``dataset.current_stage_id`` with one of ``slice_statuses`` that
    intersect the caller's IAM scope for the current workflow review level.

    Super-admin override: when ``is_super_admin`` is True the IAM-scope
    intersection is skipped and every slice on the current stage with one of
    the requested statuses is returned.
    """
    if (
        not dataset.current_stage_id
        or not dataset.workflow_id
        or dataset.dataset_status != "PENDING_REVIEW"
    ):
        return []
    base_q = (
        db.query(DatasetReviewSlice)
        .filter(
            DatasetReviewSlice.dataset_id == dataset.dataset_id,
            DatasetReviewSlice.stage_id == dataset.current_stage_id,
            DatasetReviewSlice.slice_status.in_(tuple(slice_statuses)),
        )
    )
    if is_super_admin:
        return base_q.all()
    level = _current_review_workflow_level_for_dataset(db, dataset)
    if not level:
        return []
    if _review_scope_type_is_area(level):
        areas = _effective_reviewer_area_nids(
            db,
            dw_id,
            _get_reviewer_area_nids(db, user_id, dataset.workflow_id, level),
            level,
            locale,
        )
        if not areas:
            return []
        return base_q.filter(DatasetReviewSlice.area_nid.in_(areas)).all()
    if _review_scope_type_is_classification(level):
        cids = _get_reviewer_classification_nids(db, user_id, dataset.workflow_id, level)
        if not cids:
            return []
        return base_q.filter(DatasetReviewSlice.classification_nid.in_(cids)).all()
    return []


def _list_reviewer_active_slices_for_dataset(
    db: Session,
    dw_id: int,
    user_id: int,
    dataset: Dataset,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> list[DatasetReviewSlice]:
    """
    ACTIVE slices on ``dataset.current_stage_id`` that intersect the caller's
    IAM scope for the current workflow review level (AREA or CLASSIFICATION).

    Super-admin override: returns every ACTIVE slice on the current stage.
    """
    return _list_reviewer_slices_for_dataset_with_statuses(
        db, dw_id, user_id, dataset, locale, ("ACTIVE",),
        is_super_admin=is_super_admin,
    )


def _user_may_access_dataset_for_review(
    db: Session,
    dw_id: int,
    user_id: int,
    dataset: Dataset,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> bool:
    """True when the dataset's current review stage row is ACTIVE and the caller intersects IAM
    scope with at least one slice on that stage in ACTIVE, APPROVED, or REVISION_REQUESTED.

    Stays True after datapoint approval reconciles slices to APPROVED while the reviewer has not yet
    submitted the stage APPROVED decision.

    Super-admin override: skips IAM-scope intersection on slices but still requires an ACTIVE stage
    and those slice statuses on ``current_stage_id``.
    """
    if (
        not dataset.current_stage_id
        or dataset.dataset_status != "PENDING_REVIEW"
        or not _dataset_current_review_stage_is_active(db, dataset)
    ):
        return False
    return bool(
        _list_reviewer_slices_for_dataset_with_statuses(
            db,
            dw_id,
            user_id,
            dataset,
            locale,
            _REVIEW_VISIBILITY_SLICE_STATUSES,
            is_super_admin=is_super_admin,
        )
    )


def _complete_stage_and_advance(
    db: Session,
    dataset: Dataset,
    stage: DatasetReviewStage,
    now: datetime,
    *,
    acting_user_id: int = 0,
) -> bool:
    """
    Mark stage COMPLETED. If all slices for stage are APPROVED:
      - If final level → dataset becomes APPROVED, return True (terminal).
      - If not final   → activate next stage + create its slices, return False.
    Returns True when the dataset reached terminal APPROVED state.
    """
    # Are all slices for this stage APPROVED?
    non_approved = (
        db.query(DatasetReviewSlice.slice_id)
        .filter(
            DatasetReviewSlice.stage_id == stage.stage_id,
            DatasetReviewSlice.slice_status != "APPROVED",
        )
        .first()
    )
    if non_approved:
        return False  # stage not yet fully approved

    # Mark stage COMPLETED
    stage.stage_status = "COMPLETED"
    stage.completed_at = now
    stage.approved_by_user_id = acting_user_id
    _log(db, dataset_id=dataset.dataset_id, action="STAGE_COMPLETED",
         user_id=acting_user_id, stage_id=stage.stage_id,
         remarks=f"level_no={stage.level_no}")

    # Check if this was the final workflow level
    wf_level = (
        db.query(ReviewWorkflowLevel)
        .filter(ReviewWorkflowLevel.workflow_review_level_id == stage.workflow_review_level_id)
        .one()
    )

    if wf_level.is_final_level:
        dataset.dataset_status = "APPROVED"
        dataset.approved_on = now
        dataset.approved_by_user_id = acting_user_id
        dataset.last_updated_at = now
        _log(db, dataset_id=dataset.dataset_id, action="DATASET_APPROVED",
             prev_status="PENDING_REVIEW", new_status="APPROVED", user_id=acting_user_id)
        db.flush()
        _write_back_to_dw(db, dataset)
        return True

    # Activate next stage
    next_stage = (
        db.query(DatasetReviewStage)
        .filter(
            DatasetReviewStage.dataset_id == dataset.dataset_id,
            DatasetReviewStage.stage_status == "PENDING",
            DatasetReviewStage.level_no > stage.level_no,
        )
        .order_by(DatasetReviewStage.level_no)
        .first()
    )
    if not next_stage:
        # No further stage defined — treat as final
        dataset.dataset_status = "APPROVED"
        dataset.approved_on = now
        dataset.approved_by_user_id = acting_user_id
        dataset.last_updated_at = now
        _log(db, dataset_id=dataset.dataset_id, action="DATASET_APPROVED",
             prev_status="PENDING_REVIEW", new_status="APPROVED", user_id=acting_user_id)
        db.flush()
        _write_back_to_dw(db, dataset)
        return True

    next_stage.stage_status = "ACTIVE"
    next_stage.activated_at = now
    dataset.current_stage_id = next_stage.stage_id
    dataset.approved_by_user_id = acting_user_id
    dataset.last_updated_at = now
    db.flush()

    _log(db, dataset_id=dataset.dataset_id, action="STAGE_ACTIVATED",
         user_id=acting_user_id, stage_id=next_stage.stage_id,
         remarks=f"level_no={next_stage.level_no}")

    # Load the next level to determine scope_type
    next_level = (
        db.query(ReviewWorkflowLevel)
        .filter(ReviewWorkflowLevel.workflow_review_level_id == next_stage.workflow_review_level_id)
        .one()
    )
    next_scope = next_level.review_scope_type  # "AREA" or "CLASSIFICATION"

    # Create slices for the next stage based on the level's scope_type
    if next_scope == "AREA":
        scope_values = [
            r[0] for r in
            db.query(DatasetDataPoint.area_nid.distinct())
            .filter(DatasetDataPoint.dataset_id == dataset.dataset_id)
            .all()
        ]
        for scope_val in scope_values:
            sl = DatasetReviewSlice(
                dataset_id=dataset.dataset_id,
                stage_id=next_stage.stage_id,
                scope_type="AREA",
                area_nid=scope_val,
                slice_status="ACTIVE",
                started_at=now,
                created=now,
            )
            db.add(sl)
            db.flush()
            db.query(DatasetDataPoint).filter(
                DatasetDataPoint.dataset_id == dataset.dataset_id,
                DatasetDataPoint.area_nid == scope_val,
            ).update(
                {"dataset_review_slice_id": sl.slice_id, "is_locked": True, "review_status": "PENDING_REVIEW"},
                synchronize_session=False,
            )
            _log(db, dataset_id=dataset.dataset_id, action="SLICE_ACTIVATED",
                 user_id=acting_user_id, stage_id=next_stage.stage_id, slice_id=sl.slice_id,
                 remarks=f"area_nid={scope_val}")
    else:
        scope_values = [
            r[0] for r in
            db.query(DatasetDataPoint.indicator_classification_id.distinct())
            .filter(
                DatasetDataPoint.dataset_id == dataset.dataset_id,
                DatasetDataPoint.indicator_classification_id.isnot(None),
            )
            .all()
        ]
        for scope_val in scope_values:
            sl = DatasetReviewSlice(
                dataset_id=dataset.dataset_id,
                stage_id=next_stage.stage_id,
                scope_type="CLASSIFICATION",
                classification_nid=scope_val,
                slice_status="ACTIVE",
                started_at=now,
                created=now,
            )
            db.add(sl)
            db.flush()
            db.query(DatasetDataPoint).filter(
                DatasetDataPoint.dataset_id == dataset.dataset_id,
                DatasetDataPoint.indicator_classification_id == scope_val,
            ).update(
                {"dataset_review_slice_id": sl.slice_id, "is_locked": True, "review_status": "PENDING_REVIEW"},
                synchronize_session=False,
            )
            _log(db, dataset_id=dataset.dataset_id, action="SLICE_ACTIVATED",
                 user_id=acting_user_id, stage_id=next_stage.stage_id, slice_id=sl.slice_id,
                 remarks=f"classification_nid={scope_val}")

    return False


# ===========================================================================
# REVIEWER — list datasets
# ===========================================================================

def _dp_missing_count_expr():
    """SQL expression: 1 when both value columns are null, else 0."""
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


def _batch_dp_counts_for_slice_ids(
    db: Session,
    slice_ids: Collection[int],
) -> dict[int, tuple[int, int]]:
    """
    Batch count (total, missing) per dataset_id for rows linked to any slice_id.
    Includes superseded rows (same as GET .../dataset/{id}/review grid).
    Soft-deleted rows are excluded from completeness counts.
    """
    if not slice_ids:
        return {}
    missing_expr = _dp_missing_count_expr()
    rows = (
        db.query(
            DatasetDataPoint.dataset_id,
            func.count(DatasetDataPoint.data_point_id),
            func.sum(missing_expr),
        )
        .filter(
            DatasetDataPoint.dataset_review_slice_id.in_(list(slice_ids)),
            DatasetDataPoint.is_deleted.is_(False),
        )
        .group_by(DatasetDataPoint.dataset_id)
        .all()
    )
    return {int(r[0]): (int(r[1]), int(r[2] or 0)) for r in rows}


def _batch_dp_counts_for_datasets_by_area_nids(
    db: Session,
    dataset_ids: Collection[int],
    area_nids: Collection[int],
) -> dict[int, tuple[int, int]]:
    """Batch count per dataset_id where area_nid is in the caller's IAM area set.

    Soft-deleted rows are excluded from completeness counts.
    """
    if not dataset_ids or not area_nids:
        return {}
    missing_expr = _dp_missing_count_expr()
    rows = (
        db.query(
            DatasetDataPoint.dataset_id,
            func.count(DatasetDataPoint.data_point_id),
            func.sum(missing_expr),
        )
        .filter(
            DatasetDataPoint.dataset_id.in_(list(dataset_ids)),
            DatasetDataPoint.area_nid.in_(list(area_nids)),
            DatasetDataPoint.is_deleted.is_(False),
        )
        .group_by(DatasetDataPoint.dataset_id)
        .all()
    )
    return {int(r[0]): (int(r[1]), int(r[2] or 0)) for r in rows}


def _batch_dp_counts_for_datasets_by_classification_nids(
    db: Session,
    dataset_ids: Collection[int],
    classification_nids: Collection[int],
) -> dict[int, tuple[int, int]]:
    """Batch count per dataset_id where indicator_classification_id is in IAM scope.

    Soft-deleted rows are excluded from completeness counts.
    """
    if not dataset_ids or not classification_nids:
        return {}
    missing_expr = _dp_missing_count_expr()
    rows = (
        db.query(
            DatasetDataPoint.dataset_id,
            func.count(DatasetDataPoint.data_point_id),
            func.sum(missing_expr),
        )
        .filter(
            DatasetDataPoint.dataset_id.in_(list(dataset_ids)),
            DatasetDataPoint.indicator_classification_id.in_(list(classification_nids)),
            DatasetDataPoint.is_deleted.is_(False),
        )
        .group_by(DatasetDataPoint.dataset_id)
        .all()
    )
    return {int(r[0]): (int(r[1]), int(r[2] or 0)) for r in rows}


def _terminal_review_workflow_level(
    db: Session,
    workflow_id: int,
) -> Optional[ReviewWorkflowLevel]:
    """Final active review level for APPROVED/REVISION inbox scope (fallback: highest level_no)."""
    level = (
        db.query(ReviewWorkflowLevel)
        .filter(
            ReviewWorkflowLevel.workflow_id == workflow_id,
            ReviewWorkflowLevel.is_active.is_(True),
            ReviewWorkflowLevel.is_final_level.is_(True),
        )
        .order_by(ReviewWorkflowLevel.level_no.desc())
        .first()
    )
    if level:
        return level
    return (
        db.query(ReviewWorkflowLevel)
        .filter(
            ReviewWorkflowLevel.workflow_id == workflow_id,
            ReviewWorkflowLevel.is_active.is_(True),
        )
        .order_by(ReviewWorkflowLevel.level_no.desc())
        .first()
    )


def _reviewer_scoped_dp_counts_map(
    db: Session,
    dw_id: int,
    user_id: int,
    datasets: Sequence[Dataset],
    locale: str,
) -> dict[int, tuple[int, int]]:
    """
    Reviewer-scoped (total, missing) counts per dataset_id for the review inbox.

    PENDING_REVIEW: rows in visible slices on the current stage (batched by slice_id).
    APPROVED / REVISION: rows matching IAM area or classification scope at the workflow's
    terminal review level (batched per workflow_id).
    """
    if not datasets:
        return {}

    result: dict[int, tuple[int, int]] = {}
    pending = [d for d in datasets if d.dataset_status == "PENDING_REVIEW"]
    terminal = [d for d in datasets if d.dataset_status in ("APPROVED", "REVISION")]

    all_slice_ids: list[int] = []
    pending_dataset_ids: list[int] = []
    for d in pending:
        slices = _list_reviewer_slices_for_dataset_with_statuses(
            db,
            dw_id,
            user_id,
            d,
            locale,
            _REVIEW_VISIBILITY_SLICE_STATUSES,
        )
        slice_ids = [s.slice_id for s in slices]
        pending_dataset_ids.append(d.dataset_id)
        if not slice_ids:
            result[d.dataset_id] = (0, 0)
        else:
            all_slice_ids.extend(slice_ids)

    if all_slice_ids:
        batch = _batch_dp_counts_for_slice_ids(db, all_slice_ids)
        for did in pending_dataset_ids:
            if did not in result:
                result[did] = batch.get(did, (0, 0))

    by_workflow: dict[int, list[Dataset]] = {}
    for d in terminal:
        if d.workflow_id is not None:
            by_workflow.setdefault(int(d.workflow_id), []).append(d)

    for wf_id, wf_datasets in by_workflow.items():
        level = _terminal_review_workflow_level(db, wf_id)
        ds_ids = [d.dataset_id for d in wf_datasets]
        if not level:
            for did in ds_ids:
                result[did] = (0, 0)
            continue
        if _review_scope_type_is_area(level):
            areas = _effective_reviewer_area_nids(
                db,
                dw_id,
                _get_reviewer_area_nids(db, user_id, wf_id, level),
                level,
                locale,
            )
            batch = _batch_dp_counts_for_datasets_by_area_nids(db, ds_ids, areas)
        elif _review_scope_type_is_classification(level):
            cids = _get_reviewer_classification_nids(db, user_id, wf_id, level)
            batch = _batch_dp_counts_for_datasets_by_classification_nids(db, ds_ids, cids)
        else:
            batch = {}
        for did in ds_ids:
            result[did] = batch.get(did, (0, 0))

    return result


def list_review_datasets(
    db: Session,
    dw_id: int,
    user_id: int,
    locale: str = "en",
    workflow_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    area_nid: Optional[int] = None,
    period_id: Optional[int] = None,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort_field: Optional[str] = None,
    sort_order: str = "desc",
    *,
    is_super_admin: bool = False,
) -> ReviewDatasetListResponse:
    """
    Reviewer inbox: datasets visible to the caller across PENDING_REVIEW, APPROVED,
    and REVISION statuses.

    PENDING_REVIEW: requires an ACTIVE current review stage with at least one slice in
    ACTIVE, APPROVED, or REVISION_REQUESTED within the caller's IAM scope.

    APPROVED / REVISION: datasets from workflows where the caller has any IAM assignment
    (workflow-level access check — no active-stage requirement).

    When no status_filter is given all three statuses are returned. Passing status filters
    down to a single value restricts results to that status.

    Filters: workflow_id, area_nid (JSON contains on area_nids), period_id (JSON contains
    on timeperiod_nids), status, search / search_by, sort_field / sort_order.

    ``data_point_count`` and ``missing_data_count`` on each item are scoped to the caller's
    review visibility (slice-linked rows for PENDING_REVIEW; IAM area/classification for
    APPROVED/REVISION). Super-admin sees full dataset totals.

    Super-admin override: skips all IAM checks.
    """
    if not is_super_admin:
        has_scope = (
            db.query(IamUserRoleContent.id)
            .filter(
                IamUserRoleContent.user_id == user_id,
                IamUserRoleContent.workflow_id.isnot(None),
                IamUserRoleContent.resource_code.in_(
                    ("dm_dw_area", "dm_dw_indicator_classification")
                ),
            )
            .first()
        )
        if not has_scope:
            return ReviewDatasetListResponse(datasets=[])

    requested_statuses = (
        [status_filter.strip().upper()]
        if status_filter
        else ["PENDING_REVIEW", "APPROVED", "REVISION"]
    )

    # PENDING_REVIEW candidate ids: require ACTIVE stage + valid slices
    pending_subq = None
    if "PENDING_REVIEW" in requested_statuses:
        pending_subq = (
            db.query(Dataset.dataset_id)
            .join(
                DatasetReviewStage,
                DatasetReviewStage.stage_id == Dataset.current_stage_id,
            )
            .join(
                DatasetReviewSlice,
                and_(
                    DatasetReviewSlice.dataset_id == Dataset.dataset_id,
                    DatasetReviewSlice.stage_id == DatasetReviewStage.stage_id,
                ),
            )
            .filter(
                Dataset.dw_id == dw_id,
                Dataset.dataset_status == "PENDING_REVIEW",
                DatasetReviewStage.stage_status == "ACTIVE",
                DatasetReviewSlice.slice_status.in_(_REVIEW_VISIBILITY_SLICE_STATUSES),
            )
            .distinct()
            .subquery()
        )

    non_pending_statuses = [s for s in requested_statuses if s != "PENDING_REVIEW"]

    # Build the status condition
    conditions: list = [Dataset.dw_id == dw_id]
    if pending_subq is not None and non_pending_statuses:
        conditions.append(
            or_(
                Dataset.dataset_id.in_(pending_subq),
                Dataset.dataset_status.in_(non_pending_statuses),
            )
        )
    elif pending_subq is not None:
        conditions.append(Dataset.dataset_id.in_(pending_subq))
    elif non_pending_statuses:
        conditions.append(Dataset.dataset_status.in_(non_pending_statuses))
    else:
        return ReviewDatasetListResponse(datasets=[])

    if workflow_id:
        conditions.append(Dataset.workflow_id == workflow_id)

    if area_nid is not None:
        conditions.append(func.json_contains(Dataset.area_nids, str(area_nid)) == 1)

    if period_id is not None:
        conditions.append(func.json_contains(Dataset.timeperiod_nids, str(period_id)) == 1)

    if search and search.strip():
        sb_key = (search_by or "dataset_name").strip().lower() or "dataset_name"
        if sb_key not in _DATASET_LIST_SEARCH_FIELDS:
            raise ValueError("INVALID_DATASET_LIST_SEARCH_FIELD")
        search_col = _DATASET_LIST_SEARCH_FIELDS[sb_key]
        conditions.append(search_col.ilike(f"%{search.strip()}%"))

    field_key = (sort_field or "created_on").strip().lower() or "created_on"
    if field_key not in _DATASET_LIST_SORT_FIELDS:
        raise ValueError("INVALID_DATASET_LIST_SORT_FIELD")
    sort_col = _DATASET_LIST_SORT_FIELDS[field_key]
    sort_dir = desc if sort_order == "desc" else asc

    candidates = (
        db.query(Dataset)
        .filter(*conditions)
        .order_by(sort_dir(sort_col))
        .all()
    )

    # IAM filtering
    if not is_super_admin:
        # Batch-check which workflow_ids the user has any assignment for (APPROVED/REVISION)
        allowed_workflow_ids: Optional[set] = None
        if non_pending_statuses:
            non_pending_wf_ids = {
                d.workflow_id for d in candidates
                if d.dataset_status in non_pending_statuses and d.workflow_id is not None
            }
            if non_pending_wf_ids:
                rows = (
                    db.query(IamUserRoleContent.workflow_id)
                    .filter(
                        IamUserRoleContent.user_id == user_id,
                        IamUserRoleContent.workflow_id.in_(non_pending_wf_ids),
                    )
                    .distinct()
                    .all()
                )
                allowed_workflow_ids = {r.workflow_id for r in rows}
            else:
                allowed_workflow_ids = set()

        datasets: list[Dataset] = []
        for d in candidates:
            if d.workflow_id is None:
                continue
            if d.dataset_status == "PENDING_REVIEW":
                if _user_may_access_dataset_for_review(db, dw_id, user_id, d, locale):
                    datasets.append(d)
            else:
                if allowed_workflow_ids is not None and d.workflow_id in allowed_workflow_ids:
                    datasets.append(d)
    else:
        datasets = [d for d in candidates if d.workflow_id is not None]

    if not datasets:
        return ReviewDatasetListResponse(datasets=[])

    # Build base dataset list items using the shared helper (batch-loads usernames,
    # stages, data-point counts, workflow names — identical to the data-entry list).
    wf_ids = list({d.workflow_id for d in datasets if d.workflow_id is not None})
    wf_names = {wid: _workflow_name(db, wid, locale) for wid in wf_ids}
    stages_map = _stages_for_dataset_ids(db, [d.dataset_id for d in datasets])
    base_items = _build_dataset_list_items(db, datasets, wf_names, stages_map)

    # Batch-resolve submitter full names (review-specific field).
    submitter_ids = list({d.submitted_by_user_id for d in datasets if d.submitted_by_user_id})
    submitter_map: dict[int, str] = {}
    if submitter_ids:
        for u in db.query(IamUser).filter(IamUser.id.in_(submitter_ids)).all():
            submitter_map[u.id] = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username

    scoped_dp_counts: dict[int, tuple[int, int]] = {}
    if not is_super_admin:
        scoped_dp_counts = _reviewer_scoped_dp_counts_map(
            db, dw_id, user_id, datasets, locale,
        )

    dataset_by_id = {d.dataset_id: d for d in datasets}
    items = []
    for base_item in base_items:
        d = dataset_by_id[base_item.dataset_id]
        my_pending = 0
        my_returned = 0
        if d.dataset_status == "PENDING_REVIEW":
            my_pending = len(
                _list_reviewer_slices_for_dataset_with_statuses(
                    db, dw_id, user_id, d, locale, ("ACTIVE",),
                    is_super_admin=is_super_admin,
                )
            )
            my_returned = len(
                _list_reviewer_slices_for_dataset_with_statuses(
                    db, dw_id, user_id, d, locale, ("REVISION_REQUESTED",),
                    is_super_admin=is_super_admin,
                )
            )

        item_data = base_item.model_dump()
        if not is_super_admin:
            dp_total, dp_missing = scoped_dp_counts.get(d.dataset_id, (0, 0))
            item_data["data_point_count"] = dp_total
            item_data["missing_data_count"] = dp_missing

        items.append(ReviewDatasetListItem(
            **item_data,
            submitted_by_name=submitter_map.get(d.submitted_by_user_id) if d.submitted_by_user_id else None,
            my_pending_count=my_pending,
            my_returned_count=my_returned,
        ))

    return ReviewDatasetListResponse(datasets=items)


# ===========================================================================
# REVIEWER — get review grid
# ===========================================================================

def get_review_grid(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> ReviewGridResponse:
    """
    Return the unified review grid for the caller's scope on this dataset.

    Super-admin override: returns the grid for every ACTIVE slice on the
    current stage, regardless of IAM scope.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("DATASET_NOT_REVIEWABLE")
        ValueError("NOT_AUTHORIZED")
    """
    d = (
        db.query(Dataset)
        .filter(Dataset.dataset_id == dataset_id, Dataset.dw_id == dw_id)
        .first()
    )
    if not d:
        raise ValueError("DATASET_NOT_FOUND")
    if d.dataset_status != "PENDING_REVIEW":
        raise ValueError("DATASET_NOT_REVIEWABLE")

    active_slices = _list_reviewer_active_slices_for_dataset(
        db, dw_id, user_id, d, locale, is_super_admin=is_super_admin
    )
    if not active_slices:
        raise ValueError("NOT_AUTHORIZED")

    slice_ids = [s.slice_id for s in active_slices]
    dps = (
        db.query(DatasetDataPoint)
        .filter(DatasetDataPoint.dataset_review_slice_id.in_(slice_ids))
        .order_by(DatasetDataPoint.area_nid, DatasetDataPoint.iusnid)
        .all()
    )

    # Count by review_status
    pending_count = sum(1 for p in dps if p.review_status == "PENDING_REVIEW")
    approved_count = sum(1 for p in dps if p.review_status == "APPROVED")
    returned_count = sum(1 for p in dps if p.review_status == "REJECTED")

    rows = []
    for dp in dps:
        prev_val = dp.prev_tmprd_data_value
        delta = None
        if prev_val is not None and prev_val != 0 and dp.data_value is not None:
            delta = round(((dp.data_value - prev_val) / abs(prev_val)) * 100, 2)

        rows.append(ReviewDataPointRow(
            data_point_id=dp.data_point_id,
            iusnid=dp.iusnid,
            indicator_nid=dp.indicator_nid,
            unit_nid=dp.unit_nid,
            subgroup_val_nid=dp.subgroup_val_nid,
            area_nid=dp.area_nid,
            timeperiod_nid=dp.timeperiod_nid,
            source_nid=dp.source_nid,
            data_value=dp.data_value,
            textual_data_value=dp.textual_data_value,
            istextualdata=dp.istextualdata,
            prev_timeperiod_nid=dp.prev_timeperiod_nid,
            prev_tmprd_data_value=dp.prev_tmprd_data_value,
            prev_tmprd_textual_data_value=dp.prev_tmprd_textual_data_value,
            prev_data_value=dp.prev_data_value,
            delta_percent=delta,
            review_status=dp.review_status,
            reject_reason_id=dp.reject_reason_id,
        ))

    return ReviewGridResponse(
        dataset_id=d.dataset_id,
        dataset_gid=d.dataset_gid,
        dataset_name=d.dataset_name,
        dataset_status=d.dataset_status,
        workflow_id=d.workflow_id,
        workflow_name=_workflow_name(db, d.workflow_id, locale) if d.workflow_id else None,
        submitted_at=d.submitted_at,
        revision_count=d.revision_count or 0,
        total_count=len(rows),
        pending_count=pending_count,
        approved_count=approved_count,
        returned_count=returned_count,
        data_points=rows,
    )


# ===========================================================================
# REVIEWER — decision (approved[] / rejected[] batches)
# ===========================================================================

def _reconcile_slices_for_stage(
    db: Session,
    *,
    dataset_id: int,
    stage_id: int,
    user_id: int,
    now: datetime,
) -> None:
    """Set each slice in the stage to APPROVED when all its data points are approved; otherwise leave slice status unchanged."""
    slices = (
        db.query(DatasetReviewSlice)
        .filter(
            DatasetReviewSlice.dataset_id == dataset_id,
            DatasetReviewSlice.stage_id == stage_id,
        )
        .all()
    )
    for sl in slices:
        dps = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.dataset_review_slice_id == sl.slice_id,
                DatasetDataPoint.superseded_by_data_point_id.is_(None),
            )
            .all()
        )
        if not dps:
            continue
        if all(p.review_status == "APPROVED" for p in dps):
            if sl.slice_status != "APPROVED":
                prev = sl.slice_status
                sl.slice_status = "APPROVED"
                sl.reviewed_by_user_id = user_id
                sl.completed_at = now
                _log(
                    db, dataset_id=dataset_id, action="SLICE_APPROVED",
                    user_id=user_id, stage_id=sl.stage_id, slice_id=sl.slice_id,
                    remarks=f"from_slice_status={prev}",
                )


def _mark_slices_revision_requested_for_stage(
    db: Session,
    *,
    dataset_id: int,
    stage_id: int,
    user_id: int,
    now: datetime,
) -> None:
    """When the dataset is finalized for operator revision, mark slices that contain rejected rows."""
    slices = (
        db.query(DatasetReviewSlice)
        .filter(
            DatasetReviewSlice.dataset_id == dataset_id,
            DatasetReviewSlice.stage_id == stage_id,
        )
        .all()
    )
    for sl in slices:
        dps = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.dataset_review_slice_id == sl.slice_id,
                DatasetDataPoint.superseded_by_data_point_id.is_(None),
            )
            .all()
        )
        if not dps:
            continue
        if not any(p.review_status == "REJECTED" for p in dps):
            continue
        if sl.slice_status != "REVISION_REQUESTED":
            prev = sl.slice_status
            sl.slice_status = "REVISION_REQUESTED"
            sl.reviewed_by_user_id = user_id
            sl.completed_at = now
            _log(
                db, dataset_id=dataset_id, action="SLICE_RETURNED",
                user_id=user_id, stage_id=sl.stage_id, slice_id=sl.slice_id,
                remarks=f"from_slice_status={prev}",
            )


def _dataset_has_rejected_point(db: Session, dataset_id: int) -> bool:
    row = (
        db.query(DatasetDataPoint.data_point_id)
        .filter(
            DatasetDataPoint.dataset_id == dataset_id,
            DatasetDataPoint.superseded_by_data_point_id.is_(None),
            DatasetDataPoint.review_status == "REJECTED",
        )
        .first()
    )
    return row is not None


def _stage_all_slices_approved(db: Session, stage_id: int) -> bool:
    """True when every review slice for this stage has slice_status APPROVED."""
    pending = (
        db.query(DatasetReviewSlice.slice_id)
        .filter(
            DatasetReviewSlice.stage_id == stage_id,
            DatasetReviewSlice.slice_status != "APPROVED",
        )
        .first()
    )
    return pending is None


_REVIEW_BATCH_EMAIL_ROW_CAP = 100


def _rejection_reason_text_by_ids(
    db: Session, reason_ids: Set[int], locale: str
) -> dict[int, str]:
    if not reason_ids:
        return {}
    reasons = (
        db.query(DatasetRejectionReason)
        .filter(DatasetRejectionReason.reason_id.in_(reason_ids))
        .all()
    )
    if not reasons:
        return {}
    ids = [r.reason_id for r in reasons]
    i18n_rows = (
        db.query(DatasetRejectionReasonI18n)
        .filter(
            DatasetRejectionReasonI18n.master_id.in_(ids),
            DatasetRejectionReasonI18n.locale.in_([locale, "en"]),
        )
        .all()
    )
    i18n_map: dict[int, dict[str, str]] = {}
    for row in i18n_rows:
        i18n_map.setdefault(row.master_id, {})[row.locale] = row.reason_text
    out: dict[int, str] = {}
    for r in reasons:
        translations = i18n_map.get(r.reason_id, {})
        out[r.reason_id] = (
            translations.get(locale) or translations.get("en") or r.reason_text
        )
    return out


def _load_rejected_notification_fields_from_db(
    db: Session,
    dataset_id: int,
    locale: str,
) -> tuple[int, str, str]:
    """Load RETURNED notification fields from persisted rejected datapoints."""
    rejected_dps = (
        db.query(DatasetDataPoint)
        .filter(
            DatasetDataPoint.dataset_id == dataset_id,
            DatasetDataPoint.superseded_by_data_point_id.is_(None),
            DatasetDataPoint.review_status == "REJECTED",
        )
        .all()
    )
    if not rejected_dps:
        return 0, "—", "—"

    corrected_count = len(rejected_dps)
    reason_ids = {
        int(dp.reject_reason_id)
        for dp in rejected_dps
        if dp.reject_reason_id is not None
    }
    rejection_reasons = "—"
    if reason_ids:
        rtext = _rejection_reason_text_by_ids(db, reason_ids, locale)
        texts = sorted({rtext.get(rid, "—") for rid in reason_ids})
        texts = [t for t in texts if t and t != "—"]
        if texts:
            rejection_reasons = "; ".join(texts)

    dp_ids = [int(dp.data_point_id) for dp in rejected_dps]
    comment_rows = (
        db.query(DatasetReviewComment.comment_text)
        .filter(
            DatasetReviewComment.dataset_id == dataset_id,
            DatasetReviewComment.data_point_id.in_(dp_ids),
            DatasetReviewComment.commenter_role == "DATAREVIEW",
        )
        .order_by(DatasetReviewComment.created.asc())
        .all()
    )
    reviewer_remarks = "—"
    remark_texts = [
        str(text).strip()
        for (text,) in comment_rows
        if text and str(text).strip()
    ]
    if remark_texts:
        reviewer_remarks = "; ".join(remark_texts)

    return corrected_count, rejection_reasons, reviewer_remarks


def _format_dp_display_value(dp: DatasetDataPoint) -> str:
    if dp.textual_data_value not in (None, ""):
        return str(dp.textual_data_value)
    if dp.data_value is not None:
        return str(dp.data_value)
    return "—"


def _review_batch_summary_line(n_app: int, n_rej: int) -> str:
    parts: List[str] = []
    if n_app:
        parts.append(
            f"{n_app} data point{'s' if n_app != 1 else ''} approved"
        )
    if n_rej:
        parts.append(
            f"{n_rej} data point{'s' if n_rej != 1 else ''} returned for revision"
        )
    return ", ".join(parts) if parts else ""


def _fetch_dw_timeperiod_labels(
    dw_db: Session,
    timeperiod_nids: Collection[int],
) -> dict[int, str]:
    """Batch-resolve ut_timeperiod.timeperiod labels by NID (same source as unified data grid)."""
    from apps.datawarehouse.models.datawarehouse import TimePeriod

    nids = list({int(n) for n in timeperiod_nids if n is not None})
    if not nids:
        return {}
    return {
        int(r.timeperiod_nid): (r.timeperiod or "")
        for r in dw_db.query(TimePeriod).filter(TimePeriod.timeperiod_nid.in_(nids)).all()
    }


def _review_batch_period_label(
    dp: DatasetDataPoint,
    tp_labels: dict[int, str],
) -> Optional[str]:
    if dp.timeperiod_nid is not None:
        label = tp_labels.get(int(dp.timeperiod_nid))
        if label:
            return label
    return dp.timeperiod_name


def _build_review_batch_points_detail(
    db: Session,
    dw_id: int,
    ordered_dp_ids: List[int],
    approved_ids: Set[int],
    reject_map: dict[int, Any],
    approve_comment_by_id: dict[int, str],
    locale: str,
) -> tuple[str, str]:
    """Escaped HTML fragment (table + optional truncation note) and plain-text body."""
    if not ordered_dp_ids:
        return "", ""
    rows = (
        db.query(DatasetDataPoint)
        .filter(DatasetDataPoint.data_point_id.in_(ordered_dp_ids))
        .all()
    )
    by_id = {r.data_point_id: r for r in rows}

    tp_labels: dict[int, str] = {}
    if rows:
        from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id

        try:
            with get_warehouse_session_from_id(str(dw_id)) as dw_db:
                tp_labels = _fetch_dw_timeperiod_labels(
                    dw_db,
                    [r.timeperiod_nid for r in rows if r.timeperiod_nid is not None],
                )
        except Exception:
            logger.exception(
                "review batch email: failed to resolve time period labels dw_id=%s",
                dw_id,
            )

    reason_ids: Set[int] = set()
    for pid in ordered_dp_ids:
        if pid in approved_ids:
            continue
        dp = by_id.get(pid)
        if dp and dp.reject_reason_id is not None:
            reason_ids.add(int(dp.reject_reason_id))
    rtext = _rejection_reason_text_by_ids(db, reason_ids, locale)

    def _cell(x: Any) -> str:
        if x is None or x == "":
            return "—"
        return str(x)

    esc = html.escape
    lines_html = [
        "<table border=\"1\" cellpadding=\"4\" cellspacing=\"0\">",
        "<thead><tr>"
        "<th>Outcome</th><th>Indicator</th><th>Area</th><th>Period</th>"
        "<th>Value</th><th>Rejection reason</th><th>Reviewer note</th>"
        "</tr></thead><tbody>",
    ]
    lines_txt: List[str] = [
        "Data points:",
        "Outcome | Indicator | Area | Period | Value | Reason | Note",
    ]
    for pid in ordered_dp_ids:
        dp = by_id.get(pid)
        if not dp:
            continue
        if pid in approved_ids:
            outcome = "APPROVED"
            reason = "—"
            note_raw = approve_comment_by_id.get(pid, "") or "—"
        else:
            outcome = "REJECTED"
            rid = dp.reject_reason_id
            reason = rtext.get(int(rid)) if rid is not None else "—"
            ret = reject_map.get(pid)
            note_raw = (ret.comment.strip() if ret else "") or "—"
        ind = esc(_cell(dp.indicator_name))
        area = esc(_cell(dp.area_name))
        period = esc(_cell(_review_batch_period_label(dp, tp_labels)))
        val = esc(_format_dp_display_value(dp))
        oc = esc(outcome)
        rs = esc(_cell(reason))
        nt = esc(note_raw)
        lines_html.append(
            f"<tr><td>{oc}</td><td>{ind}</td><td>{area}</td><td>{period}</td>"
            f"<td>{val}</td><td>{rs}</td><td>{nt}</td></tr>"
        )
        lines_txt.append(
            f"{outcome} | {_cell(dp.indicator_name)} | {_cell(dp.area_name)} | "
            f"{_cell(_review_batch_period_label(dp, tp_labels))} | {_format_dp_display_value(dp)} | "
            f"{_cell(reason)} | {note_raw}"
        )
    lines_html.append("</tbody></table>")
    html_out = "<p><strong>Updated rows:</strong></p>" + "".join(lines_html)
    text_out = "\n".join(lines_txt)
    return html_out, text_out


def _notify_operator_review_batch(
    db: Session,
    dataset: Dataset,
    payload: ReviewerDecisionRequest,
    reviewer_user_id: int,
    approved_ids: Set[int],
    rejected_ids: Set[int],
    reject_map: dict[int, Any],
    prev_status: str,
    new_status: str,
    locale: str,
    app_key: str,
) -> bool:
    """
    Email the operator with per-row review detail. Returns True if send_email was invoked.
    """
    n_app = len(approved_ids)
    n_rej = len(rejected_ids)
    if n_app + n_rej == 0:
        return False

    operator = (
        db.query(IamUser).filter(IamUser.id == int(dataset.created_user_id)).first()
    )
    if not operator or not operator.email or not str(operator.email).strip():
        logger.info(
            "review batch notify: skip — operator user_id=%s has no email",
            dataset.created_user_id,
        )
        return False
    if operator.status is not None and int(operator.status) == 0:
        return False

    reviewer = (
        db.query(IamUser).filter(IamUser.id == reviewer_user_id).first()
        if reviewer_user_id
        else None
    )
    if reviewer:
        reviewer_name = (
            f"{reviewer.first_name} {reviewer.last_name or ''}".strip()
            or reviewer.username
        )
    else:
        reviewer_name = "(unknown)"

    wf_name = ""
    if dataset.workflow_id is not None:
        wf_name = _workflow_display_name(db, int(dataset.workflow_id), locale)

    reviewed_at = "—"
    if dataset.last_updated_at:
        reviewed_at = dataset.last_updated_at.isoformat(sep=" ", timespec="seconds")

    all_ids_sorted = sorted(approved_ids | rejected_ids)
    omitted = max(0, len(all_ids_sorted) - _REVIEW_BATCH_EMAIL_ROW_CAP)
    capped_ids = all_ids_sorted[:_REVIEW_BATCH_EMAIL_ROW_CAP]

    approve_comment_by_id = {
        a.data_point_id: (a.comment or "").strip()
        for a in payload.approved
    }
    points_html, points_text = _build_review_batch_points_detail(
        db,
        int(dataset.dw_id),
        capped_ids,
        approved_ids,
        reject_map,
        approve_comment_by_id,
        locale,
    )
    if omitted:
        note = html.escape(f"… and {omitted} more row(s) not shown.")
        points_html = f"{points_html}<p><em>{note}</em></p>"
        points_text = f"{points_text}\n\n… and {omitted} more row(s) not shown."

    summary_line = _review_batch_summary_line(n_app, n_rej)
    full_name = (
        f"{operator.first_name} {operator.last_name or ''}".strip()
        or operator.username
    )
    login_url, _ = get_fed_email_urls(app_key, db)
    ctx = {
        "full_name": full_name,
        "dataset_name": dataset.dataset_name,
        "previous_status": str(prev_status),
        "dataset_status": str(new_status),
        "workflow_name": wf_name or "—",
        "reviewer_name": reviewer_name,
        "reviewed_at": reviewed_at,
        "summary_line": summary_line,
        "points_detail_html": points_html,
        "points_detail_text": points_text,
        "login_url": login_url,
        "from_name": get_app_from_name(),
    }
    send_email(
        template=EmailTemplate.DATA_POINTS_REVIEWED,
        recipient_email=str(operator.email).strip(),
        recipient_name=full_name,
        context=ctx,
        locale=locale,
    )
    return True


def reviewer_decision(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    payload: ReviewerDecisionRequest,
    app_key: str,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> ReviewerDecisionResponse:
    """
    Apply reviewer batch decisions: approve and/or reject data points in the caller's scope.

    Super-admin override: acts as a current-stage reviewer regardless of IAM
    scope; the slice-scope ``INVALID_DATA_POINT`` check is widened to "must
    belong to this dataset" (still validated). The decision is recorded
    against ``current_stage_id`` like a normal reviewer at that level.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("DATASET_NOT_REVIEWABLE")
        ValueError("NOT_AUTHORIZED")
        ValueError("INVALID_DATA_POINT")
        ValueError("REVISION_STATUS_WITHOUT_REJECTED_ROWS")
        ValueError("STAGE_APPROVAL_NOT_READY")
    """
    d = (
        db.query(Dataset)
        .filter(Dataset.dataset_id == dataset_id, Dataset.dw_id == dw_id)
        .first()
    )
    if not d:
        raise ValueError("DATASET_NOT_FOUND")
    if d.dataset_status != "PENDING_REVIEW":
        raise ValueError("DATASET_NOT_REVIEWABLE")

    prev_dataset_status = str(d.dataset_status)

    now = _now()
    finalize_stage_only = (
        payload.status == "APPROVED"
        and not payload.approved
        and not payload.rejected
    )
    if finalize_stage_only:
        # Slices reconcile to APPROVED after the last data-point approvals; a follow-up
        # POST with only status APPROVED must still authorize the same reviewer.
        auth_slices = _list_reviewer_slices_for_dataset_with_statuses(
            db,
            dw_id,
            user_id,
            d,
            locale,
            ("ACTIVE", "APPROVED"),
            is_super_admin=is_super_admin,
        )
    else:
        auth_slices = _list_reviewer_active_slices_for_dataset(
            db, dw_id, user_id, d, locale, is_super_admin=is_super_admin
        )
    if not auth_slices:
        raise ValueError("NOT_AUTHORIZED")

    slice_ids = {s.slice_id for s in auth_slices}
    approved_ids = {a.data_point_id for a in payload.approved}
    rejected_ids = {r.data_point_id for r in payload.rejected}

    if is_super_admin:
        # Super admins can act on any data point in this dataset; the only
        # constraint is that the data point belongs to the dataset.
        scope_dp_ids = {
            row.data_point_id
            for row in db.query(DatasetDataPoint.data_point_id)
            .filter(DatasetDataPoint.dataset_id == dataset_id)
            .all()
        }
    else:
        scope_dp_ids = {
            row.data_point_id
            for row in db.query(DatasetDataPoint.data_point_id)
            .filter(DatasetDataPoint.dataset_review_slice_id.in_(slice_ids))
            .all()
        }

    if not (approved_ids | rejected_ids).issubset(scope_dp_ids):
        raise ValueError("INVALID_DATA_POINT")

    current_stage = (
        db.query(DatasetReviewStage)
        .filter(DatasetReviewStage.stage_id == auth_slices[0].stage_id)
        .one()
    )
    level_no = current_stage.level_no

    comment_dp_ids = approved_ids | rejected_ids
    review_status_by_dp: dict[int, str] = {}
    if comment_dp_ids:
        for row in (
            db.query(DatasetDataPoint.data_point_id, DatasetDataPoint.review_status)
            .filter(DatasetDataPoint.data_point_id.in_(comment_dp_ids))
            .all()
        ):
            review_status_by_dp[row.data_point_id] = str(row.review_status)

    for item in payload.approved:
        if item.comment and item.comment.strip():
            db.add(DatasetReviewComment(
                dataset_id=dataset_id,
                data_point_id=item.data_point_id,
                commenter_role="DATAREVIEW",
                comment_text=item.comment.strip(),
                status=review_status_by_dp.get(item.data_point_id),
                created_user_id=user_id,
            ))

    for item in payload.rejected:
        db.add(DatasetReviewComment(
            dataset_id=dataset_id,
            data_point_id=item.data_point_id,
            commenter_role="DATAREVIEW",
            comment_text=item.comment.strip(),
            status=review_status_by_dp.get(item.data_point_id),
            created_user_id=user_id,
        ))

    commented_dp_ids: set[int] = {
        item.data_point_id
        for item in payload.approved
        if item.comment and item.comment.strip()
    } | {item.data_point_id for item in payload.rejected}
    if commented_dp_ids:
        db.query(DatasetDataPoint).filter(
            DatasetDataPoint.data_point_id.in_(commented_dp_ids),
        ).update({"cmnt_cnt": DatasetDataPoint.cmnt_cnt + 1}, synchronize_session=False)

    if approved_ids:
        db.query(DatasetDataPoint).filter(
            DatasetDataPoint.data_point_id.in_(approved_ids),
        ).update(
            {
                "review_status": "APPROVED",
                "is_locked": True,
                "approved_at_level_no": level_no,
                "reject_reason_id": None,
            },
            synchronize_session=False,
        )

    reject_map = {r.data_point_id: r for r in payload.rejected}
    for dp_id, ret in reject_map.items():
        db.query(DatasetDataPoint).filter(
            DatasetDataPoint.data_point_id == dp_id,
        ).update(
            {
                "review_status": "REJECTED",
                "reject_reason_id": ret.reject_reason_id,
                "is_locked": False,
            },
            synchronize_session=False,
        )

    if approved_ids:
        db.flush()
        to_del = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.data_point_id.in_(approved_ids),
                DatasetDataPoint.is_deleted.is_(True),
            )
            .all()
        )
        _delete_ut_data_for_soft_deleted_approved_datapoints(db, dw_id, to_del)

    _reconcile_slices_for_stage(
        db, dataset_id=dataset_id, stage_id=current_stage.stage_id, user_id=user_id, now=now,
    )
    db.flush()

    has_rej = _dataset_has_rejected_point(db, dataset_id)
    if payload.status == "REVISION":
        if not has_rej:
            raise ValueError("REVISION_STATUS_WITHOUT_REJECTED_ROWS")
        d.dataset_status = "REVISION"
        d.last_returned_at = now
        d.returned_by_user_id = user_id
        d.last_updated_at = now
        _mark_slices_revision_requested_for_stage(
            db,
            dataset_id=dataset_id,
            stage_id=current_stage.stage_id,
            user_id=user_id,
            now=now,
        )
    elif payload.status == "APPROVED":
        if d.dataset_status != "PENDING_REVIEW":
            raise ValueError("DATASET_NOT_REVIEWABLE")
        if not _stage_all_slices_approved(db, current_stage.stage_id):
            raise ValueError("STAGE_APPROVAL_NOT_READY")
        _complete_stage_and_advance(
            db, d, current_stage, now, acting_user_id=user_id,
        )

    db.flush()

    db.commit()
    db.refresh(d)

    n_app = len(approved_ids)
    n_rej = len(rejected_ids)
    if n_app + n_rej > 0:
        _notify_operator_review_batch(
            db,
            d,
            payload,
            user_id,
            approved_ids,
            rejected_ids,
            reject_map,
            prev_dataset_status,
            str(d.dataset_status),
            locale,
            app_key,
        )

    new_status = str(d.dataset_status)
    if new_status == "REVISION" and prev_dataset_status == "PENDING_REVIEW":
        notify_ctx = _build_dataset_notification_context(
            db,
            d,
            actor_user_id=user_id,
            app_key=app_key,
            from_db_rejections=True,
        )
        notification_service.emit(
            db,
            event_code="DATASET_RETURNED",
            context=notify_ctx,
            dw_id=dw_id,
            app_key=app_key,
            dataset=d,
            actor_user_id=user_id,
            locale=locale,
        )
    elif new_status == "APPROVED":
        notify_ctx = _build_dataset_notification_context(
            db, d, actor_user_id=user_id, app_key=app_key
        )
        notification_service.emit(
            db,
            event_code="DATASET_APPROVED",
            context=notify_ctx,
            dw_id=dw_id,
            app_key=app_key,
            dataset=d,
            actor_user_id=user_id,
            locale=locale,
        )

    if d.dataset_status == "APPROVED":
        msg = "Dataset fully approved."
    elif d.dataset_status == "REVISION":
        msg = (
            f"{n_rej} data point(s) flagged for revision."
            if n_rej
            else "Dataset returned for revision."
        )
    elif d.dataset_status == "PENDING_REVIEW" and _dataset_has_rejected_point(db, dataset_id):
        msg = (
            'Rejected rows recorded. Send "status": "REVISION" in a follow-up POST '
            "to return the dataset to the operator."
        )
    elif payload.status == "APPROVED" and d.dataset_status == "PENDING_REVIEW":
        msg = "Review stage completed. The next review stage is now active."
    elif (
        d.dataset_status == "PENDING_REVIEW"
        and payload.status != "APPROVED"
        and d.current_stage_id is not None
        and _stage_all_slices_approved(db, int(d.current_stage_id))
    ):
        msg = (
            "All data points for the current review stage are approved. "
            'Send a POST with "status": "APPROVED" to complete this stage '
            "and continue (or finish) the review workflow."
        )
    elif n_app and not n_rej:
        msg = "Slice progress saved. Awaiting remaining review actions."
    else:
        msg = "Review batch applied."

    return ReviewerDecisionResponse(
        dataset_id=dataset_id,
        dataset_status=d.dataset_status,
        approved_count=n_app,
        returned_count=n_rej,
        message=msg,
    )


# ===========================================================================
# REFERENCE — Rejection reasons
# ===========================================================================

def list_rejection_reasons(
    db: Session,
    locale: str = "en",
) -> list[RejectionReasonResponse]:
    """
    Return all active rejection reasons with i18n-resolved text.
    Falls back to the default reason_text when no translation exists for the locale.
    """
    reasons = (
        db.query(DatasetRejectionReason)
        .filter(DatasetRejectionReason.is_active.is_(True))
        .order_by(DatasetRejectionReason.display_order)
        .all()
    )
    if not reasons:
        return []

    reason_ids = [r.reason_id for r in reasons]

    # Batch-load translations for the requested locale and English fallback
    i18n_rows = (
        db.query(DatasetRejectionReasonI18n)
        .filter(
            DatasetRejectionReasonI18n.master_id.in_(reason_ids),
            DatasetRejectionReasonI18n.locale.in_([locale, "en"]),
        )
        .all()
    )
    # Build {reason_id: {locale: text}}
    i18n_map: dict[int, dict[str, str]] = {}
    for row in i18n_rows:
        i18n_map.setdefault(row.master_id, {})[row.locale] = row.reason_text

    items = []
    for r in reasons:
        translations = i18n_map.get(r.reason_id, {})
        text = translations.get(locale) or translations.get("en") or r.reason_text
        items.append(RejectionReasonResponse(
            reason_id=r.reason_id,
            reason_code=r.reason_code,
            reason_text=text,
            display_order=r.display_order,
        ))

    return items


def get_rejection_reason(
    db: Session,
    reason_id: int,
    locale: str = "en",
) -> RejectionReasonResponse:
    """
    Return a single active rejection reason with i18n-resolved text.
    Raises ValueError("REASON_NOT_FOUND") when not found or inactive.
    """
    r = (
        db.query(DatasetRejectionReason)
        .filter(
            DatasetRejectionReason.reason_id == reason_id,
            DatasetRejectionReason.is_active.is_(True),
        )
        .first()
    )
    if not r:
        raise ValueError("REASON_NOT_FOUND")

    i18n = (
        db.query(DatasetRejectionReasonI18n)
        .filter(
            DatasetRejectionReasonI18n.master_id == reason_id,
            DatasetRejectionReasonI18n.locale.in_([locale, "en"]),
        )
        .all()
    )
    translations = {row.locale: row.reason_text for row in i18n}
    text = translations.get(locale) or translations.get("en") or r.reason_text

    return RejectionReasonResponse(
        reason_id=r.reason_id,
        reason_code=r.reason_code,
        reason_text=text,
        display_order=r.display_order,
    )


# ===========================================================================
# UNIFIED — DW-level data-point endpoints (FED uniform API)
#
#   GET    /dw/{dw_id}/data-points            → get_unified_data_points
#   PATCH  /dw/{dw_id}/data-points            → unified_upsert_data_points
#   DELETE /dw/{dw_id}/data-points            → unified_delete_data_points  (bulk)
#   DELETE /dw/{dw_id}/data-point/{id}        → unified_delete_data_point   (single)
#   PATCH  /dw/{dw_id}/dataset                → unified_submit
# ===========================================================================

def _resolve_dataset_by_id(
    db: Session,
    dw_id: int,
    user_id: int,
    dataset_id: Optional[int],
    require_dataset: bool = True,
    *,
    is_super_admin: bool = False,
) -> Optional[Dataset]:
    """
    Resolve a dataset by explicit dataset_id.
    Raises DATASET_ID_REQUIRED if dataset_id is None and require_dataset=True.
    Raises DATASET_NOT_FOUND if the dataset doesn't exist on this warehouse.

    The owner check is intentionally not enforced here; unified GET treats
    dataset_id as a presentation overlay handle. ``is_super_admin`` is
    accepted so callers may pass it through uniformly.
    """
    if dataset_id is None:
        if require_dataset:
            raise ValueError("DATASET_ID_REQUIRED")
        return None

    d = (
        db.query(Dataset)
        .filter(
            Dataset.dataset_id == dataset_id,
            Dataset.dw_id == dw_id,
        )
        .first()
    )
    if not d:
        raise ValueError("DATASET_NOT_FOUND")
    return d


def _sql_datetime_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else None


def _nonempty_query_str(value: Optional[str]) -> bool:
    return bool(value and str(value).strip())


def _merge_legacy_ius_filters(
    filters: "DataFilters",
    *,
    iusnids: Optional[list[int]],
    area_nids: Optional[list[int]],
    timeperiod_nids: Optional[list[int]],
) -> bool:
    """
    Merge legacy numeric filters into DataFilters (AND semantics via intersection).
    Returns False if user supplied conflicting legacy + resolved lists with empty intersection.
    """
    def _merge_dim(resolved: list[int], leg: Optional[list[int]]) -> tuple[list[int], bool]:
        if not leg:
            return resolved, True
        if not resolved:
            return list(dict.fromkeys(leg)), True
        inter = sorted(set(resolved) & set(leg))
        return (inter, bool(inter))

    ok = True
    if iusnids:
        filters.ius_nids, ok = _merge_dim(filters.ius_nids, iusnids)
        if not ok:
            return False
    if area_nids:
        filters.area_nids, ok = _merge_dim(filters.area_nids, area_nids)
        if not ok:
            return False
    if timeperiod_nids:
        filters.timeperiod_nids, ok = _merge_dim(filters.timeperiod_nids, timeperiod_nids)
        if not ok:
            return False
    return True


def _ut_data_query_with_filters(q, filters: "DataFilters", Data):
    """Apply DataFilters to a SQLAlchemy query on ut_data (Data)."""
    if filters.indicator_nids:
        q = q.filter(Data.indicator_nid.in_(filters.indicator_nids))
    if filters.ius_nids:
        q = q.filter(Data.iusnid.in_(filters.ius_nids))
    if filters.unit_nids:
        q = q.filter(Data.unit_nid.in_(filters.unit_nids))
    if filters.subgroup_val_nids:
        q = q.filter(Data.subgroup_val_nid.in_(filters.subgroup_val_nids))
    if filters.area_nids:
        q = q.filter(Data.area_nid.in_(filters.area_nids))
    if filters.timeperiod_nids:
        q = q.filter(Data.timeperiod_nid.in_(filters.timeperiod_nids))
    if filters.source_nids:
        q = q.filter(Data.source_nid.in_(filters.source_nids))
    return q


def _pending_query_with_filters(q, filters: "DataFilters"):
    """Apply same dimensions to DatasetDataPoint query where columns exist."""
    if filters.ius_nids:
        q = q.filter(DatasetDataPoint.iusnid.in_(filters.ius_nids))
    if filters.area_nids:
        q = q.filter(DatasetDataPoint.area_nid.in_(filters.area_nids))
    if filters.timeperiod_nids:
        q = q.filter(DatasetDataPoint.timeperiod_nid.in_(filters.timeperiod_nids))
    if filters.indicator_nids:
        q = q.filter(DatasetDataPoint.indicator_nid.in_(filters.indicator_nids))
    if filters.unit_nids:
        q = q.filter(DatasetDataPoint.unit_nid.in_(filters.unit_nids))
    if filters.subgroup_val_nids:
        q = q.filter(DatasetDataPoint.subgroup_val_nid.in_(filters.subgroup_val_nids))
    if filters.source_nids:
        q = q.filter(DatasetDataPoint.source_nid.in_(filters.source_nids))
    return q


def _data_filters_has_scope(filters: "DataFilters") -> bool:
    return bool(
        filters.indicator_nids
        or filters.ius_nids
        or filters.unit_nids
        or filters.subgroup_val_nids
        or filters.area_nids
        or filters.timeperiod_nids
        or filters.source_nids
    )


def _data_filters_has_dimension_scope(filters: "DataFilters") -> bool:
    """Dimension filters only — excludes source_nid (source narrows within dataset path)."""
    return bool(
        filters.indicator_nids
        or filters.ius_nids
        or filters.unit_nids
        or filters.subgroup_val_nids
        or filters.area_nids
        or filters.timeperiod_nids
    )


def _merge_source_nids_into_filters(
    filters: "DataFilters",
    source_nids: list[int],
) -> bool:
    """Intersect resolved source NIDs into filters. Returns False if intersection is empty."""
    if not source_nids:
        return False
    if not filters.source_nids:
        filters.source_nids = list(dict.fromkeys(source_nids))
        return True
    inter = sorted(set(filters.source_nids) & set(source_nids))
    filters.source_nids = inter
    return bool(inter)


def _apply_pending_source_nid_filter(q, source_nids: Optional[list[int]]):
    if source_nids:
        q = q.filter(DatasetDataPoint.source_nid.in_([int(x) for x in source_nids]))
    return q


def _empty_unified_datapoints_meta(
    *,
    dw_id: int,
    active: Optional[Dataset],
    dataset_id: Optional[int],
    page_size: Optional[int],
    filters: "DataFilters",
    meta_prev_tp: Optional[int],
) -> UnifiedDataPointsMeta:
    return UnifiedDataPointsMeta(
        dw_id=dw_id,
        dataset_id=active.dataset_id if active else None,
        dataset_status=active.dataset_status if active else None,
        dataset_id_query=dataset_id,
        total_count=0,
        count=0,
        page=1,
        page_size=page_size,
        total_pages=1,
        pending_count=0,
        approved_count=0,
        new_count=0,
        rejected_count=0,
        iusnid_filter=filters.ius_nids or None,
        area_nid_filter=filters.area_nids or None,
        timeperiod_nid_filter=filters.timeperiod_nids or None,
        indicator_nid_filter=filters.indicator_nids or None,
        unit_nid_filter=filters.unit_nids or None,
        subgroup_val_nid_filter=filters.subgroup_val_nids or None,
        source_nid_filter=filters.source_nids or None,
        ut_baseline_queried=False,
        prev_timeperiod_nid=meta_prev_tp,
    )


def _filter_unified_items_by_review_status(
    items: list[UnifiedDataPointItem],
    review_status_filter: Optional[DataPointReviewStatusLiteral],
) -> list[UnifiedDataPointItem]:
    """Apply strict review_status filter to unified rows."""
    if review_status_filter is None:
        return items
    return [it for it in items if it.review_status == review_status_filter]


def _unified_datapoint_search_pattern(search: str) -> Optional[str]:
    """Return ILIKE pattern for unified data-point text search, or None if empty."""
    s = (search or "").strip()
    if not s:
        return None
    return f"%{s}%"


def _intersect_nids_with_dataset_scope(
    nids: list[int],
    scope: Optional[list],
) -> list[int]:
    if not nids:
        return []
    if not scope:
        return nids
    scope_set = {int(x) for x in scope if x is not None}
    return [n for n in nids if n in scope_set]


def _resolve_unified_datapoint_text_search_nids(
    dw_db: Session,
    locale: str,
    search: str,
    search_by: str,
    dataset: Optional[Dataset] = None,
) -> dict[str, list[int]]:
    """Resolve matching dimension NIDs from DW locale tables for text search."""
    from apps.datawarehouse.models.datawarehouse import Area, Indicator, SubgroupVal, Unit

    pattern = _unified_datapoint_search_pattern(search)
    if not pattern:
        return {}

    sb = (search_by or "indicator_unit").strip().lower()
    result: dict[str, list[int]] = {}

    if sb == "indicator_unit":
        Ind = Indicator(locale)
        UnitM = Unit(locale)
        ind_rows = (
            dw_db.query(Ind.indicator_nid)
            .filter(
                or_(
                    Ind.indicator_name.ilike(pattern),
                    Ind.indicator_gid.ilike(pattern),
                )
            )
            .all()
        )
        u_rows = (
            dw_db.query(UnitM.unit_nid)
            .filter(
                or_(
                    UnitM.unit_name.ilike(pattern),
                    UnitM.unit_gid.ilike(pattern),
                )
            )
            .all()
        )
        ind_nids = [int(r[0]) for r in ind_rows]
        u_nids = [int(r[0]) for r in u_rows]
        if dataset and dataset.indicator_nids:
            ind_nids = _intersect_nids_with_dataset_scope(ind_nids, dataset.indicator_nids)
        if dataset and dataset.unit_nids:
            u_nids = _intersect_nids_with_dataset_scope(u_nids, dataset.unit_nids)
        result["indicator_nids"] = ind_nids
        result["unit_nids"] = u_nids
    elif sb == "subgroup":
        Sv = SubgroupVal(locale)
        rows = (
            dw_db.query(Sv.subgroup_val_nid)
            .filter(
                or_(
                    Sv.subgroup_val.ilike(pattern),
                    Sv.subgroup_val_gid.ilike(pattern),
                )
            )
            .all()
        )
        sg_nids = [int(r[0]) for r in rows]
        if dataset and dataset.subgroup_val_nids:
            sg_nids = _intersect_nids_with_dataset_scope(sg_nids, dataset.subgroup_val_nids)
        result["subgroup_val_nids"] = sg_nids
    elif sb == "area":
        Ar = Area(locale)
        rows = (
            dw_db.query(Ar.area_nid)
            .filter(
                or_(
                    Ar.area_name.ilike(pattern),
                    Ar.area_id.ilike(pattern),
                )
            )
            .all()
        )
        ar_nids = [int(r[0]) for r in rows]
        if dataset and dataset.area_nids:
            ar_nids = _intersect_nids_with_dataset_scope(ar_nids, dataset.area_nids)
        result["area_nids"] = ar_nids

    return result


def _dataset_datapoint_text_search_filter(
    search: str,
    search_by: str,
    *,
    dw_db: Session,
    locale: str,
    dataset: Optional[Dataset] = None,
):
    """
    Build SQLAlchemy filter for DatasetDataPoint text search.

    Returns:
        None — no search term
        False — definite no-match (caller should return empty)
        clause — SQLAlchemy boolean expression
    """
    pattern = _unified_datapoint_search_pattern(search)
    if not pattern:
        return None

    sb = (search_by or "indicator_unit").strip().lower()
    nids = _resolve_unified_datapoint_text_search_nids(
        dw_db, locale, search, sb, dataset
    )
    parts: list[Any] = []

    if sb == "indicator_unit":
        parts.append(
            or_(
                DatasetDataPoint.indicator_name.ilike(pattern),
                DatasetDataPoint.unit_name.ilike(pattern),
            )
        )
        ind_nids = nids.get("indicator_nids") or []
        u_nids = nids.get("unit_nids") or []
        nid_parts: list[Any] = []
        if ind_nids:
            nid_parts.append(DatasetDataPoint.indicator_nid.in_(ind_nids))
        if u_nids:
            nid_parts.append(DatasetDataPoint.unit_nid.in_(u_nids))
        if nid_parts:
            parts.append(or_(*nid_parts))
    elif sb == "subgroup":
        parts.append(DatasetDataPoint.subgroup_name.ilike(pattern))
        sg_nids = nids.get("subgroup_val_nids") or []
        if sg_nids:
            parts.append(DatasetDataPoint.subgroup_val_nid.in_(sg_nids))
    elif sb == "area":
        area_parts: list[Any] = [DatasetDataPoint.area_name.ilike(pattern)]
        ar_nids = nids.get("area_nids") or []
        if ar_nids:
            area_parts.append(DatasetDataPoint.area_nid.in_(ar_nids))
        parts.append(or_(*area_parts))

    if not parts:
        return False
    return or_(*parts) if len(parts) > 1 else parts[0]


def _new_display_name_maps() -> dict[str, dict[int, str]]:
    return {"indicator": {}, "unit": {}, "subgroup": {}, "area": {}}


def _fetch_dw_display_name_maps(
    dw_db: Session,
    locale: str,
    indicator_nids: Collection[int],
    unit_nids: Collection[int],
    subgroup_val_nids: Collection[int],
    area_nids: Collection[int],
    *,
    existing: Optional[dict[str, dict[int, str]]] = None,
) -> dict[str, dict[int, str]]:
    """Batch-load locale display strings for unified datapoint sort / denormalized columns."""
    from apps.datawarehouse.models.datawarehouse import Area, Indicator, SubgroupVal, Unit

    maps = existing if existing is not None else _new_display_name_maps()
    ind_missing = [int(n) for n in indicator_nids if n is not None and int(n) not in maps["indicator"]]
    if ind_missing:
        Ind = Indicator(locale)
        for r in dw_db.query(Ind.indicator_nid, Ind.indicator_name).filter(
            Ind.indicator_nid.in_(ind_missing)
        ).all():
            maps["indicator"][int(r[0])] = r[1] or ""
    u_missing = [int(n) for n in unit_nids if n is not None and int(n) not in maps["unit"]]
    if u_missing:
        UnitM = Unit(locale)
        for r in dw_db.query(UnitM.unit_nid, UnitM.unit_name).filter(
            UnitM.unit_nid.in_(u_missing)
        ).all():
            maps["unit"][int(r[0])] = r[1] or ""
    sg_missing = [
        int(n) for n in subgroup_val_nids if n is not None and int(n) not in maps["subgroup"]
    ]
    if sg_missing:
        Sv = SubgroupVal(locale)
        for r in dw_db.query(Sv.subgroup_val_nid, Sv.subgroup_val).filter(
            Sv.subgroup_val_nid.in_(sg_missing)
        ).all():
            maps["subgroup"][int(r[0])] = r[1] or ""
    ar_missing = [int(n) for n in area_nids if n is not None and int(n) not in maps["area"]]
    if ar_missing:
        Ar = Area(locale)
        for r in dw_db.query(Ar.area_nid, Ar.area_name).filter(Ar.area_nid.in_(ar_missing)).all():
            maps["area"][int(r[0])] = r[1] or ""
    return maps


def _populate_datapoint_display_names(
    dw_db: Session,
    locale: str,
    dp: DatasetDataPoint,
    maps: Optional[dict[str, dict[int, str]]] = None,
) -> dict[str, dict[int, str]]:
    """Fill denormalized display name columns on a dataset_data_point from warehouse locale tables."""
    ind_nids = [int(dp.indicator_nid)] if dp.indicator_nid is not None else []
    u_nids = [int(dp.unit_nid)] if dp.unit_nid is not None else []
    sg_nids = [int(dp.subgroup_val_nid)] if dp.subgroup_val_nid is not None else []
    ar_nids = [int(dp.area_nid)] if dp.area_nid is not None else []
    maps = _fetch_dw_display_name_maps(
        dw_db,
        locale,
        ind_nids,
        u_nids,
        sg_nids,
        ar_nids,
        existing=maps,
    )
    if dp.indicator_nid is not None:
        dp.indicator_name = maps["indicator"].get(int(dp.indicator_nid), "")
    if dp.unit_nid is not None:
        dp.unit_name = maps["unit"].get(int(dp.unit_nid), "")
    if dp.subgroup_val_nid is not None:
        dp.subgroup_name = maps["subgroup"].get(int(dp.subgroup_val_nid), "")
    if dp.area_nid is not None:
        dp.area_name = maps["area"].get(int(dp.area_nid), "")
    return maps


def _datapoint_display_sort_key(
    *,
    data_point_id: int,
    indicator_nid: Optional[int],
    unit_nid: Optional[int],
    subgroup_val_nid: Optional[int],
    area_nid: Optional[int],
    sort_field: str,
    maps: dict[str, dict[int, str]],
) -> tuple[str, int]:
    """Casefolded display sort key + stable data_point_id tie-break."""
    sf = (sort_field or "").strip().lower()
    if sf == "indicator_name" and indicator_nid is not None:
        label = maps["indicator"].get(int(indicator_nid), "")
    elif sf == "unit_name" and unit_nid is not None:
        label = maps["unit"].get(int(unit_nid), "")
    elif sf == "subgroup" and subgroup_val_nid is not None:
        label = maps["subgroup"].get(int(subgroup_val_nid), "")
    elif sf == "area" and area_nid is not None:
        label = maps["area"].get(int(area_nid), "")
    else:
        label = ""
    return (label.casefold(), int(data_point_id))


def _large_pending_filtered_id_rows(
    db: Session,
    dataset_id: int,
    review_status_filter: Optional[DataPointReviewStatusLiteral],
    dataset_text_search_clause: Any,
    source_nids: Optional[list[int]] = None,
) -> list[tuple[int, Optional[int], Optional[int], Optional[int], Optional[int]]]:
    """Lightweight rows for sort: data_point_id, indicator_nid, unit_nid, subgroup_val_nid, area_nid."""
    q = db.query(
        DatasetDataPoint.data_point_id,
        DatasetDataPoint.indicator_nid,
        DatasetDataPoint.unit_nid,
        DatasetDataPoint.subgroup_val_nid,
        DatasetDataPoint.area_nid,
    ).filter(DatasetDataPoint.dataset_id == dataset_id)
    if review_status_filter:
        q = q.filter(DatasetDataPoint.review_status == review_status_filter)
    if dataset_text_search_clause is not None:
        q = q.filter(dataset_text_search_clause)
    q = _apply_pending_source_nid_filter(q, source_nids)
    return q.all()


def _large_pending_sorted_data_point_ids(
    db: Session,
    *,
    dw_id: int,
    locale: str,
    dataset_id: int,
    sort_field: str,
    sort_order: str,
    review_status_filter: Optional[DataPointReviewStatusLiteral],
    dataset_text_search_clause: Any,
    source_nids: Optional[list[int]] = None,
) -> list[int]:
    """
    All matching data_point_ids for a dataset, ordered by locale display name (warehouse lookup).
    """
    from apps.datawarehouse.constants import UNIFIED_DATAPOINT_SORT_FIELDS
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id

    rows = _large_pending_filtered_id_rows(
        db, dataset_id, review_status_filter, dataset_text_search_clause, source_nids
    )
    if not rows:
        return []
    sf = (sort_field or "").strip().lower()
    if not sf or sf not in UNIFIED_DATAPOINT_SORT_FIELDS:
        return sorted(int(r[0]) for r in rows)

    ind_nids = {int(r[1]) for r in rows if r[1] is not None}
    u_nids = {int(r[2]) for r in rows if r[2] is not None}
    sg_nids = {int(r[3]) for r in rows if r[3] is not None}
    ar_nids = {int(r[4]) for r in rows if r[4] is not None}
    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        maps = _fetch_dw_display_name_maps(
            dw_db, locale, ind_nids, u_nids, sg_nids, ar_nids
        )

    reverse = (sort_order or "asc").strip().lower() == "desc"
    keyed = [
        _datapoint_display_sort_key(
            data_point_id=int(r[0]),
            indicator_nid=r[1],
            unit_nid=r[2],
            subgroup_val_nid=r[3],
            area_nid=r[4],
            sort_field=sf,
            maps=maps,
        )
        for r in rows
    ]
    pairs = list(zip(keyed, [int(r[0]) for r in rows]))
    pairs.sort(key=lambda p: p[0], reverse=reverse)
    return [pid for _, pid in pairs]


def _merge_dataset_scope_into_filters(filters: "DataFilters", dataset: Dataset) -> None:
    """Intersect DataFilters with dataset JSON scope columns (AND semantics)."""
    def _merge_dim(current: list[int], scope_raw: Optional[list]) -> list[int]:
        scope = [int(x) for x in (scope_raw or []) if x is not None]
        if not scope:
            return current
        if not current:
            return scope
        inter = sorted(set(current) & set(scope))
        return inter

    filters.indicator_nids = _merge_dim(
        filters.indicator_nids, dataset.indicator_nids
    )
    filters.unit_nids = _merge_dim(filters.unit_nids, dataset.unit_nids)
    filters.subgroup_val_nids = _merge_dim(
        filters.subgroup_val_nids, dataset.subgroup_val_nids
    )
    filters.area_nids = _merge_dim(filters.area_nids, dataset.area_nids)
    filters.timeperiod_nids = _merge_dim(
        filters.timeperiod_nids, dataset.timeperiod_nids
    )
    filters.source_nids = _merge_dim(filters.source_nids, dataset.source_nids)
    filters.ius_nids = _merge_dim(filters.ius_nids, dataset.ius_nids)


def _dataset_has_saved_scope(dataset: Dataset) -> bool:
    scope = _dataset_scope_nids_kwargs(dataset)
    return any(scope.get(k) for k in (
        "area_nids",
        "indicator_nids",
        "unit_nids",
        "subgroup_val_nids",
        "timeperiod_nids",
        "source_nids",
        "ius_nids",
    ))


def _unified_datapoint_row_matches_text_search(
    row_dict: dict[str, Any],
    needle_cf: str,
    search_by: str,
) -> bool:
    """needle_cf must be casefolded. search_by: indicator_unit | subgroup | area."""
    if search_by == "indicator_unit":
        i = (row_dict.get("i_name") or "").casefold()
        u = (row_dict.get("u_name") or "").casefold()
        return needle_cf in i or needle_cf in u
    if search_by == "subgroup":
        return needle_cf in (row_dict.get("sg_name") or "").casefold()
    if search_by == "area":
        name = (row_dict.get("ar_name") or "").casefold()
        aid = (row_dict.get("ar_id") or "").casefold()
        return needle_cf in name or needle_cf in aid
    return False


def _unified_datapoint_stable_sort_tuple(it: UnifiedDataPointItem) -> tuple[int, int, int, int]:
    return (
        it.data_nid if it.data_nid is not None else 0,
        it.iusnid or 0,
        int(it.area_nid) if it.area_nid is not None else 0,
        int(it.timeperiod_nid) if it.timeperiod_nid is not None else 0,
    )


def _unified_datapoint_apply_text_filter_sort(
    items: list[UnifiedDataPointItem],
    *,
    dw_id: int,
    locale: str,
    search: str,
    search_by: Optional[str],
    sort_field: Optional[str],
    sort_order: str,
    skip_search_filter: bool = False,
) -> list[UnifiedDataPointItem]:
    """
    Enrich row dicts in DW, optional substring filter, optional sort by display name.
    sort_field: indicator_name | unit_name | subgroup | area (lowercase).
    """
    from apps.datawarehouse.constants import UNIFIED_DATAPOINT_SORT_FIELD_TO_ROW_KEY
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.services.data_service import DataService

    search_stripped = (search or "").strip()
    needs_filter = bool(search_stripped) and not skip_search_filter
    sf = (sort_field or "").strip().lower() if sort_field else ""
    needs_sort = bool(sf)
    if not needs_filter and not needs_sort:
        return items

    row_dicts = [it.to_internal_data_row_dict() for it in items]
    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        DataService()._enrich_unified_datapoint_row_dicts(dw_db, locale, row_dicts)

    pairs: list[tuple[UnifiedDataPointItem, dict[str, Any]]] = list(zip(items, row_dicts))

    if needs_filter:
        needle = search_stripped.casefold()
        sb = ((search_by or "").strip().lower() or "indicator_unit")
        pairs = [p for p in pairs if _unified_datapoint_row_matches_text_search(p[1], needle, sb)]

    if needs_sort:
        row_key = UNIFIED_DATAPOINT_SORT_FIELD_TO_ROW_KEY.get(sf)
        if row_key:
            reverse = (sort_order or "asc").strip().lower() == "desc"
            pairs.sort(key=lambda p: _unified_datapoint_stable_sort_tuple(p[0]))
            pairs.sort(
                key=lambda p: ((p[1].get(row_key) or "").casefold(),),
                reverse=reverse,
            )

    return [p[0] for p in pairs]


def get_unified_data_points(
    db: Session,
    dw_id: int,
    user_id: int,
    dataset_id: Optional[int] = None,
    iusnids: Optional[list[int]] = None,
    area_nids: Optional[list[int]] = None,
    timeperiod_nids: Optional[list[int]] = None,
    page: int = 1,
    page_size: Optional[int] = None,
    *,
    locale: str = "en",
    i_identifier: Optional[str] = None,
    u_identifier: Optional[str] = None,
    sg_identifier: Optional[str] = None,
    ar_identifier: Optional[str] = None,
    tp_nid: Optional[str] = None,
    tp_timeperiod: Optional[str] = None,
    ius_identifier: Optional[str] = None,
    src_identifier: Optional[str] = None,
    isdefaultenabled: bool = True,
    review_status_filter: Optional[DataPointReviewStatusLiteral] = None,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort_field: Optional[str] = None,
    sort_order: Optional[str] = None,
    is_super_admin: bool = False,
) -> tuple[list[UnifiedDataPointItem], UnifiedDataPointsMeta]:
    """
    Unified read: merge ut_data (approved baseline) with the active dataset overlay.

    Resolution:
        Pass `dataset_id` to overlay that dataset's pending rows on `ut_data`.
        If omitted, there is no active dataset overlay — only the `ut_data` baseline applies.

    **Baseline `ut_data`** is loaded when:
    - the request is **scoped** (same filters as GET /data: legacy nids and/or identifier params), or
    - the active dataset has **pending rows** (overlay keys), or
    - **neither** applies: **paginated browse** of the whole `ut_data` table ordered by `data_nid`
      (default **page_size=100** if omitted, max **1000**; avoids loading the full table into memory).

    With pending rows on the active dataset but no scope, behavior is unchanged: only `ut_data` rows
    matching those pending keys are loaded (not a full-table browse).
    """
    from sqlalchemy import or_, and_
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.models.datawarehouse import Data
    from apps.datawarehouse.services.data_service import DataFilters, DataService

    search_stripped = (search or "").strip() if search else ""
    sort_field_s = (sort_field or "").strip().lower() if sort_field else ""
    sort_order_norm = (sort_order or "asc").strip().lower() if sort_order else "asc"
    if sort_order_norm not in ("asc", "desc"):
        sort_order_norm = "asc"

    active = _resolve_dataset_by_id(
        db, dw_id, user_id, dataset_id, require_dataset=False,
        is_super_admin=is_super_admin,
    )

    # Resolve meta.prev_timeperiod_nid once: when the active dataset's workflow has
    # show_previous_time=true, derive the predecessor of the chronologically minimum
    # selected time period. Works for both single and multiselect time period scopes.
    meta_prev_tp: Optional[int] = None
    if active and _workflow_show_previous_time(db, active.workflow_id):
        tp_scope = [int(t) for t in (active.timeperiod_nids or [])]
        if tp_scope:
            from apps.datawarehouse.utils.timeperiod_predecessor import (
                build_previous_timeperiod_nid_map,
                resolve_previous_timeperiod_nid_for_selection,
            )
            with get_warehouse_session_from_id(str(dw_id)) as dw_db_prev:
                prev_map = build_previous_timeperiod_nid_map(dw_db_prev)
                meta_prev_tp = resolve_previous_timeperiod_nid_for_selection(
                    dw_db_prev, tp_scope, prev_map
                )
    has_non_source_identifiers = any(
        [
            _nonempty_query_str(i_identifier),
            _nonempty_query_str(u_identifier),
            _nonempty_query_str(sg_identifier),
            _nonempty_query_str(ar_identifier),
            _nonempty_query_str(tp_nid),
            _nonempty_query_str(tp_timeperiod),
            _nonempty_query_str(ius_identifier),
        ]
    )
    has_src_identifier = _nonempty_query_str(src_identifier)

    svc = DataService()
    filters = DataFilters()
    if has_non_source_identifiers:
        # When both area_nids and timeperiod_nids are supplied (legacy slice), do not apply
        # default-IUS narrowing from GET /data — it would add iusnid IN (default only) and hide
        # facts on non-default units unless u_identifier / iusnid is passed.
        has_legacy_area_tp = bool(area_nids and timeperiod_nids)
        resolve_default_ius = isdefaultenabled and not has_legacy_area_tp
        filters = svc._resolve_filters(
            str(dw_id),
            locale,
            i_identifier=i_identifier,
            u_identifier=u_identifier,
            sg_identifier=sg_identifier,
            ar_identifier=ar_identifier,
            tp_nid=tp_nid,
            tp_timeperiod=tp_timeperiod,
            ius_identifier=ius_identifier,
            src_identifier=None,
            isdefaultenabled=resolve_default_ius,
        )

    if has_src_identifier:
        src_nids = svc.resolve_source_identifier_nids(str(dw_id), locale, src_identifier)
        if not _merge_source_nids_into_filters(filters, src_nids):
            return [], _empty_unified_datapoints_meta(
                dw_id=dw_id,
                active=active,
                dataset_id=dataset_id,
                page_size=page_size,
                filters=filters,
                meta_prev_tp=meta_prev_tp,
            )

    if not _merge_legacy_ius_filters(
        filters,
        iusnids=iusnids,
        area_nids=area_nids,
        timeperiod_nids=timeperiod_nids,
    ):
        # Conflicting legacy + resolved filters → empty result
        return [], _empty_unified_datapoints_meta(
            dw_id=dw_id,
            active=active,
            dataset_id=dataset_id,
            page_size=page_size,
            filters=filters,
            meta_prev_tp=meta_prev_tp,
        )

    has_dimension_scope = _data_filters_has_dimension_scope(filters)
    has_dw_scope = _data_filters_has_scope(filters)
    legacy_scoped = bool(iusnids or area_nids or timeperiod_nids)

    n_pending = 0
    if active:
        n_pending = (
            db.query(func.count(DatasetDataPoint.data_point_id))
            .filter(DatasetDataPoint.dataset_id == active.dataset_id)
            .scalar()
        ) or 0

    search_blocked_unscoped = (
        search_stripped
        and active is None
        and not has_dimension_scope
        and not legacy_scoped
    )

    use_unscoped_ut_page = (
        not has_dimension_scope
        and not legacy_scoped
        and n_pending == 0
        and review_status_filter is None
    )
    # Dataset-bounded search/sort: do not browse whole ut_data when dataset_id + search/sort.
    if use_unscoped_ut_page and active is not None and (search_stripped or sort_field_s):
        use_unscoped_ut_page = False

    # When a dataset is active with no pending rows and no explicit scope, scope to the
    # dataset's saved dimensions instead of browsing the full ut_data table.
    if use_unscoped_ut_page and active is not None and _dataset_has_saved_scope(active):
        _merge_dataset_scope_into_filters(filters, active)
        has_dw_scope = _data_filters_has_scope(filters)
        use_unscoped_ut_page = False

    if use_unscoped_ut_page and (
        search_blocked_unscoped
        or sort_field_s
        or sort_order_norm == "desc"
    ):
        raise ValueError("UNIFIED_DATAPOINT_SEARCH_SORT_UNSCOPED")

    pending_map: dict[tuple, DatasetDataPoint] = {}
    ut_map: dict[tuple, Data] = {}
    already_paginated = False
    total_ut_for_meta: int = 0
    _UNSCOPED_DEFAULT_PAGE = 100
    _PAGE_CAP = 1000
    eff_page_unscoped: int = _UNSCOPED_DEFAULT_PAGE
    safe_page_unscoped: int = 1
    db_search_applied = False
    dataset_text_search_clause: Any = None

    if search_stripped and active is not None:
        with get_warehouse_session_from_id(str(dw_id)) as dw_db:
            dataset_text_search_clause = _dataset_datapoint_text_search_filter(
                search_stripped,
                search_by or "indicator_unit",
                dw_db=dw_db,
                locale=locale,
                dataset=active,
            )
        if dataset_text_search_clause is False:
            return [], _empty_unified_datapoints_meta(
                dw_id=dw_id,
                active=active,
                dataset_id=dataset_id,
                page_size=page_size,
                filters=filters,
                meta_prev_tp=meta_prev_tp,
            )

    # Zero-pending dataset + search/sort: scope ut_data to dataset JSON scope, then in-memory filter/sort.
    use_dataset_scoped_baseline = (
        active is not None
        and (search_stripped or sort_field_s)
        and n_pending == 0
        and not has_dimension_scope
        and not legacy_scoped
    )
    if use_dataset_scoped_baseline:
        if not _dataset_has_saved_scope(active):
            return [], _empty_unified_datapoints_meta(
                dw_id=dw_id,
                active=active,
                dataset_id=dataset_id,
                page_size=page_size,
                filters=filters,
                meta_prev_tp=meta_prev_tp,
            )
        _merge_dataset_scope_into_filters(filters, active)
        has_dw_scope = _data_filters_has_scope(filters)

    # Large-pending path: n_pending > 0 but no scope.
    # Paginates dataset_data_point at the DB level and does a tiny ut_data lookup
    # for only the page's keys — avoids the full-table load + 100k-condition OR of the slow path.
    use_large_pending_page = (
        active is not None
        and n_pending > 0
        and not has_dimension_scope
        and not legacy_scoped
        and page_size is not None  # export path (page_size=None) must load all rows
    )

    if use_large_pending_page and search_blocked_unscoped:
        raise ValueError("UNIFIED_DATAPOINT_SEARCH_SORT_UNSCOPED")

    # State variables populated by the large-pending path and consumed by meta construction.
    _lpp_pending_count: int = 0
    _lpp_approved_count: int = 0
    _lpp_rejected_count: int = 0
    _lpp_total_count: int = 0
    _lpp_filtered_count: int = 0
    _lpp_safe_page: int = 1
    _lpp_total_pages: int = 1
    _lpp_eff_ps: int = _UNSCOPED_DEFAULT_PAGE

    if use_unscoped_ut_page:
        eff_ps = page_size if page_size is not None else _UNSCOPED_DEFAULT_PAGE
        eff_ps = max(1, min(int(eff_ps), _PAGE_CAP))
        with get_warehouse_session_from_id(str(dw_id)) as dw_db:
            total_ut = dw_db.query(Data).count()
            total_pages_db = max(1, math.ceil(total_ut / eff_ps)) if total_ut else 1
            safe_pg = min(max(1, page), total_pages_db)
            offset = (safe_pg - 1) * eff_ps
            rows = (
                dw_db.query(Data)
                .order_by(Data.data_nid.asc())
                .offset(offset)
                .limit(eff_ps)
                .all()
            )
        ut_map = {
            _natural_key_tuple(
                int(r.iusnid) if r.iusnid is not None else 0,
                int(r.area_nid) if r.area_nid is not None else 0,
                int(r.timeperiod_nid) if r.timeperiod_nid is not None else 0,
                getattr(r, "source_nid", None),
            ): r
            for r in rows
        }
        already_paginated = True
        total_ut_for_meta = total_ut
        eff_page_unscoped = eff_ps
        safe_page_unscoped = safe_pg
    elif use_large_pending_page:
        # ── Fast path: DB-level pagination for large-pending no-scope datasets ─
        eff_ps = page_size if page_size is not None else _UNSCOPED_DEFAULT_PAGE
        eff_ps = max(1, min(int(eff_ps), _PAGE_CAP))

        # Step 1: Meta counts via GROUP BY — one query, no Python scan.
        status_q = (
            db.query(DatasetDataPoint.review_status, func.count(DatasetDataPoint.data_point_id))
            .filter(DatasetDataPoint.dataset_id == active.dataset_id)
        )
        status_q = _apply_pending_source_nid_filter(status_q, filters.source_nids)
        status_count_rows = status_q.group_by(DatasetDataPoint.review_status).all()
        status_count_map: dict[str, int] = {(r[0] or ""): int(r[1]) for r in status_count_rows}
        _lpp_pending_count = status_count_map.get("PENDING_REVIEW", 0)
        _lpp_approved_count = status_count_map.get("APPROVED", 0)
        _lpp_rejected_count = status_count_map.get("REJECTED", 0)
        _lpp_total_count = sum(status_count_map.values()) if filters.source_nids else n_pending

        # Step 2: Filtered total count — review_status + optional text search at DB.
        count_q = db.query(func.count(DatasetDataPoint.data_point_id)).filter(
            DatasetDataPoint.dataset_id == active.dataset_id
        )
        count_q = _apply_pending_source_nid_filter(count_q, filters.source_nids)
        if review_status_filter:
            count_q = count_q.filter(DatasetDataPoint.review_status == review_status_filter)
        if dataset_text_search_clause is not None:
            count_q = count_q.filter(dataset_text_search_clause)
            db_search_applied = True
        _lpp_filtered_count = count_q.scalar() or 0

        _lpp_total_pages = (
            max(1, math.ceil(_lpp_filtered_count / eff_ps)) if _lpp_filtered_count else 1
        )
        _lpp_safe_page = min(max(1, page), _lpp_total_pages)
        _lpp_eff_ps = eff_ps
        offset = (_lpp_safe_page - 1) * eff_ps

        # Step 3: Paginate pending rows — sort by warehouse display names before slicing IDs.
        if sort_field_s:
            sorted_ids = _large_pending_sorted_data_point_ids(
                db,
                dw_id=dw_id,
                locale=locale,
                dataset_id=active.dataset_id,
                sort_field=sort_field_s,
                sort_order=sort_order_norm,
                review_status_filter=review_status_filter,
                dataset_text_search_clause=dataset_text_search_clause,
                source_nids=filters.source_nids or None,
            )
            page_ids = sorted_ids[offset : offset + eff_ps]
            if page_ids:
                fetched = (
                    db.query(DatasetDataPoint)
                    .filter(DatasetDataPoint.data_point_id.in_(page_ids))
                    .all()
                )
                by_id = {int(dp.data_point_id): dp for dp in fetched}
                page_pending = [by_id[i] for i in page_ids if i in by_id]
            else:
                page_pending = []
        else:
            page_q = db.query(DatasetDataPoint).filter(
                DatasetDataPoint.dataset_id == active.dataset_id
            )
            page_q = _apply_pending_source_nid_filter(page_q, filters.source_nids)
            if review_status_filter:
                page_q = page_q.filter(DatasetDataPoint.review_status == review_status_filter)
            if dataset_text_search_clause is not None:
                page_q = page_q.filter(dataset_text_search_clause)
            page_pending = (
                page_q.order_by(DatasetDataPoint.data_point_id)
                .offset(offset)
                .limit(eff_ps)
                .all()
            )

        # Build pending_map from page rows only (not all 100k rows).
        for dp in page_pending:
            nk = _natural_key_tuple(dp.iusnid, dp.area_nid, dp.timeperiod_nid, dp.source_nid)
            pending_map[nk] = dp

        # Step 4: Tiny ut_data lookup — only ~page_size OR conditions.
        if pending_map:
            conds = [_ut_data_matches_natural_key(Data, k) for k in pending_map.keys()]
            with get_warehouse_session_from_id(str(dw_id)) as dw_db:
                for row in dw_db.query(Data).filter(or_(*conds)).all():
                    nk = _natural_key_tuple(
                        int(row.iusnid) if row.iusnid is not None else 0,
                        int(row.area_nid) if row.area_nid is not None else 0,
                        int(row.timeperiod_nid) if row.timeperiod_nid is not None else 0,
                        getattr(row, "source_nid", None),
                    )
                    ut_map[nk] = row
    else:
        # ── Slow path: scoped requests (bounded by has_dw_scope / legacy_scoped) ─
        # ── Fetch pending rows from dataset_data_point ────────────────────────
        if active:
            q = db.query(DatasetDataPoint).filter(DatasetDataPoint.dataset_id == active.dataset_id)
            if has_dw_scope:
                q = _pending_query_with_filters(q, filters)
            elif legacy_scoped:
                if iusnids:
                    q = q.filter(DatasetDataPoint.iusnid.in_(iusnids))
                if area_nids:
                    q = q.filter(DatasetDataPoint.area_nid.in_(area_nids))
                if timeperiod_nids:
                    q = q.filter(DatasetDataPoint.timeperiod_nid.in_(timeperiod_nids))
            elif dataset_text_search_clause is not None:
                q = q.filter(dataset_text_search_clause)
                db_search_applied = True
            for dp in q.all():
                nk = _natural_key_tuple(dp.iusnid, dp.area_nid, dp.timeperiod_nid, dp.source_nid)
                pending_map[nk] = dp

        # ── Fetch ut_data rows ───────────────────────────────────────────────
        has_filters = bool(has_dw_scope or pending_map)
        if has_filters:
            from dataclasses import replace

            ut_query_filters = filters
            if (
                active is not None
                and filters.source_nids
                and not _data_filters_has_dimension_scope(filters)
                and _dataset_has_saved_scope(active)
            ):
                ut_query_filters = replace(filters)
                _merge_dataset_scope_into_filters(ut_query_filters, active)

            with get_warehouse_session_from_id(str(dw_id)) as dw_db:
                q = dw_db.query(Data)
                if _data_filters_has_dimension_scope(ut_query_filters):
                    q = _ut_data_query_with_filters(q, ut_query_filters, Data)
                elif pending_map:
                    conds = [_ut_data_matches_natural_key(Data, k) for k in pending_map.keys()]
                    q = q.filter(or_(*conds))
                elif ut_query_filters.source_nids:
                    q = _ut_data_query_with_filters(q, ut_query_filters, Data)
                for row in q.all():
                    nk = _natural_key_tuple(
                        int(row.iusnid) if row.iusnid is not None else 0,
                        int(row.area_nid) if row.area_nid is not None else 0,
                        int(row.timeperiod_nid) if row.timeperiod_nid is not None else 0,
                        getattr(row, "source_nid", None),
                    )
                    ut_map[nk] = row

    # ── Merge ─────────────────────────────────────────────────────────────────
    items: list[UnifiedDataPointItem] = []

    # Pending rows (override ut_data where key matches)
    for key, dp in pending_map.items():
        ut = ut_map.get(key)
        source = "new" if ut is None else "pending"
        items.append(UnifiedDataPointItem(
            data_point_id=dp.data_point_id,
            dataset_id=dp.dataset_id,
            data_nid=ut.data_nid if ut else None,
            start_date=_sql_datetime_iso(ut.start_date) if ut else None,
            end_date=_sql_datetime_iso(ut.end_date) if ut else None,
            data_denominator=int(ut.data_denominator) if ut and ut.data_denominator is not None else None,
            ic_ius_order=getattr(ut, "ic_ius_order", None) if ut else None,
            iusnid=dp.iusnid,
            indicator_nid=dp.indicator_nid,
            unit_nid=dp.unit_nid,
            subgroup_val_nid=dp.subgroup_val_nid,
            area_nid=dp.area_nid,
            timeperiod_nid=dp.timeperiod_nid,
            source_nid=dp.source_nid,
            footnote_nid=int(dp.footnote_nid) if dp.footnote_nid is not None else None,
            footnote_text=_normalize_footnote_text(dp.footnote_text),
            data_value=dp.data_value,
            textual_data_value=dp.textual_data_value,
            istextualdata=dp.istextualdata or False,
            approved_value=ut.data_value if ut else None,
            approved_textual_value=ut.textual_data_value if ut else None,
            source=source,
            review_status=dp.review_status,
            is_locked=dp.is_locked,
            is_deleted=bool(dp.is_deleted),
            prev_timeperiod_nid=dp.prev_timeperiod_nid,
            prev_tmprd_data_value=dp.prev_tmprd_data_value,
            prev_tmprd_textual_data_value=dp.prev_tmprd_textual_data_value,
            prev_data_value=dp.prev_data_value,
            cmnt_cnt=dp.cmnt_cnt,
        ))

    # Approved-only rows (in ut_data, not in any pending dataset)
    for key, ut in ut_map.items():
        if key not in pending_map:
            items.append(UnifiedDataPointItem(
                data_point_id=None,
                dataset_id=None,
                data_nid=ut.data_nid,
                start_date=_sql_datetime_iso(getattr(ut, "start_date", None)),
                end_date=_sql_datetime_iso(getattr(ut, "end_date", None)),
                data_denominator=int(ut.data_denominator) if ut.data_denominator is not None else None,
                ic_ius_order=getattr(ut, "ic_ius_order", None),
                iusnid=ut.iusnid,
                indicator_nid=int(ut.indicator_nid) if ut.indicator_nid is not None else 0,
                unit_nid=int(ut.unit_nid) if ut.unit_nid is not None else 0,
                subgroup_val_nid=int(ut.subgroup_val_nid) if ut.subgroup_val_nid is not None else None,
                area_nid=ut.area_nid,
                timeperiod_nid=ut.timeperiod_nid,
                source_nid=_normalize_data_source_nid(
                    int(ut.source_nid) if ut.source_nid is not None else None
                ),
                footnote_nid=int(ut.footnote_nid) if ut.footnote_nid is not None else None,
                footnote_text=None,
                data_value=ut.data_value,
                textual_data_value=ut.textual_data_value,
                istextualdata=ut.istextualdata or False,
                approved_value=ut.data_value,
                approved_textual_value=ut.textual_data_value,
                source="approved",
                review_status=None,
                is_locked=None,
            ))

    # For the large-pending path counts come from DB queries (computed above);
    # review_status filter was already pushed to the DB so skip the Python post-filter.
    # For all other paths, derive counts from the in-memory items scan as before.
    if use_large_pending_page:
        merged_total = _lpp_total_count
        pending_count = _lpp_pending_count
        new_count = 0  # accurate computation requires a cross-DB join; not feasible inline
        approved_count = _lpp_approved_count
        rejected_count = _lpp_rejected_count
    else:
        merged_total = len(items)
        pending_count = sum(1 for i in items if i.review_status == "PENDING_REVIEW")
        new_count = sum(1 for i in items if i.source == "new")
        approved_count = sum(1 for i in items if i.review_status == "APPROVED")
        rejected_count = sum(1 for i in items if i.review_status == "REJECTED")

        items = _filter_unified_items_by_review_status(items, review_status_filter)

    if search_stripped or sort_field_s:
        items = _unified_datapoint_apply_text_filter_sort(
            items,
            dw_id=dw_id,
            locale=locale,
            search=search_stripped,
            search_by=search_by,
            sort_field=sort_field_s or None,
            sort_order=sort_order_norm,
            skip_search_filter=db_search_applied,
        )

    if already_paginated:
        paged_items = items
        total_all = total_ut_for_meta
        total_pages = (
            max(1, math.ceil(total_all / eff_page_unscoped)) if total_all and eff_page_unscoped else 1
        )
        safe_page = safe_page_unscoped
        meta_page_size = eff_page_unscoped
        ut_baseline_queried = True
        meta_count = total_ut_for_meta
    elif use_large_pending_page:
        paged_items = items  # already paginated via DB LIMIT/OFFSET
        total_all = _lpp_filtered_count
        total_pages = _lpp_total_pages
        safe_page = _lpp_safe_page
        meta_page_size = _lpp_eff_ps
        ut_baseline_queried = True
        meta_count = _lpp_total_count  # unfiltered total (before review_status filter)
    else:
        has_filters = bool(has_dw_scope or pending_map)
        total_all = len(items)
        safe_page = max(1, page)
        if page_size is not None and page_size > 0:
            total_pages = max(1, math.ceil(total_all / page_size))
            safe_page = min(safe_page, total_pages)
            start = (safe_page - 1) * page_size
            paged_items = items[start : start + page_size]
            meta_page_size = page_size
        else:
            paged_items = items
            total_pages = 1
            safe_page = 1
            meta_page_size = None
        ut_baseline_queried = has_filters
        meta_count = merged_total

    meta = UnifiedDataPointsMeta(
        dw_id=dw_id,
        dataset_id=active.dataset_id if active else None,
        dataset_status=active.dataset_status if active else None,
        dataset_id_query=dataset_id,
        total_count=total_all,
        count=meta_count,
        page=safe_page,
        page_size=meta_page_size,
        total_pages=total_pages,
        pending_count=pending_count,
        approved_count=approved_count,
        new_count=new_count,
        rejected_count=rejected_count,
        iusnid_filter=filters.ius_nids or None,
        area_nid_filter=filters.area_nids or None,
        timeperiod_nid_filter=filters.timeperiod_nids or None,
        indicator_nid_filter=filters.indicator_nids or None,
        unit_nid_filter=filters.unit_nids or None,
        subgroup_val_nid_filter=filters.subgroup_val_nids or None,
        source_nid_filter=filters.source_nids or None,
        ut_baseline_queried=ut_baseline_queried,
        prev_timeperiod_nid=meta_prev_tp,
    )
    return paged_items, meta


def unified_upsert_data_points(
    db: Session,
    dw_id: int,
    user_id: int,
    payload: UnifiedUpsertRequest,
    *,
    locale: str = "en",
    is_super_admin: bool = False,
) -> DataPointUpsertResponse:
    """
    Upsert data points via the unified endpoint.
    dataset_id is required; raises DATASET_ID_REQUIRED if missing.

    Optional ``deleted`` / ``restore`` lists update ``is_deleted`` (DRAFT/REVISION only).
    At least one of non-empty ``data_points``, ``deleted``, or ``restore`` is required (schema).

    Resolves each `data_points` row into `DataPointInput`, runs batch preflight (resolver messages
    and constraint-data-entry area checks), then delegates to `upsert_data_points`, which carries
    the show_previous_time invariant.

    Rows with ``data_point_id`` set: IUS/area/time/source are taken from ``dataset_data_point`` for
    this ``dataset_id``; only ``dt_value`` / ``footnote`` / ``data_entry_note`` (and legacy value
    fields) from the request body apply — coordinate fields in the body are ignored.

    Raises:
        UnifiedUpsertPreflightError: structured `failures` list (resolver + area), no DB commit.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.schemas.data import UnifiedDataPointUpsertItemSchema
    from apps.datawarehouse.services.data_service import DataService

    if payload.dataset_id is None:
        raise ValueError("DATASET_ID_REQUIRED")
    resolved_id = payload.dataset_id

    d_owner = _assert_dataset_owner(
        db, resolved_id, dw_id, user_id, is_super_admin=is_super_admin
    )
    if d_owner.dataset_status not in _EDITABLE_STATUSES:
        raise ValueError("DATASET_NOT_EDITABLE")

    marked_deleted = 0
    restored = 0
    if payload.deleted or payload.restore:
        del_ids = [int(e.data_point_id) for e in payload.deleted]
        res_ids = [int(e.data_point_id) for e in payload.restore]
        marked_deleted, restored = apply_datapoint_soft_delete_flags(
            db,
            dw_id,
            user_id,
            resolved_id,
            del_ids,
            res_ids,
            is_super_admin=is_super_admin,
        )

    if not payload.data_points:
        db.commit()
        return DataPointUpsertResponse(
            dataset_id=resolved_id,
            inserted=0,
            updated=0,
            total=0,
            marked_deleted=marked_deleted,
            restored=restored,
        )

    failures: list[dict[str, Any]] = []
    resolved_bundle: list[tuple[DataPointInput, Optional[int], int]] = []

    dp_ids = [
        int(item.data_point_id)
        for item in payload.data_points
        if item.data_point_id is not None
    ]
    ddp_by_id: dict[int, DatasetDataPoint] = {}
    if dp_ids:
        rows = (
            db.query(DatasetDataPoint)
            .filter(
                DatasetDataPoint.dataset_id == resolved_id,
                DatasetDataPoint.data_point_id.in_(dp_ids),
            )
            .all()
        )
        ddp_by_id = {int(r.data_point_id): r for r in rows}

    svc = DataService()
    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        for idx, item in enumerate(payload.data_points):
            item_to_resolve = item
            if item.data_point_id is not None:
                dpid = int(item.data_point_id)
                ddp = ddp_by_id.get(dpid)
                if ddp is None:
                    failures.append(
                        {
                            "index": idx,
                            "data_point_id": item.data_point_id,
                            "code": "DATAPOINT_RESOLVE",
                            "messages": [
                                f"data_point_id {dpid} not found for this dataset",
                            ],
                        }
                    )
                    continue
                synth_payload: dict[str, Any] = {
                    "iusnid": ddp.iusnid,
                    "area_nid": ddp.area_nid,
                    "timeperiod_nid": ddp.timeperiod_nid,
                    "source_nid": ddp.source_nid,
                    "dt_value": item.dt_value,
                    "data_point_id": item.data_point_id,
                }
                if item.data_value is not None:
                    synth_payload["data_value"] = item.data_value
                if item.textual_data_value is not None:
                    synth_payload["textual_data_value"] = item.textual_data_value
                if item.data_entry_note is not None:
                    synth_payload["data_entry_note"] = item.data_entry_note
                if item.fn is not None:
                    synth_payload["footnote"] = item.fn
                item_to_resolve = UnifiedDataPointUpsertItemSchema.model_validate(
                    synth_payload
                )
            try:
                row = svc.resolve_unified_datapoint_upsert_item(
                    dw_db, locale, item_to_resolve, resolve_footnote=False
                )
            except ValueError as e:
                failures.append(
                    {
                        "index": idx,
                        "data_point_id": item.data_point_id,
                        "code": "DATAPOINT_RESOLVE",
                        "messages": _resolution_detail_to_messages(str(e)),
                    }
                )
                continue
            row["footnote_nid"] = None
            row["footnote_text"] = _normalize_footnote_text(item.fn)
            resolved_bundle.append(
                (
                    DataPointInput(**row),
                    item.data_point_id,
                    idx,
                )
            )

    area_forbidden_msg = (
        "You are not assigned to enter data for this area."
    )
    if (
        d_owner.workflow_id is not None
        and not is_super_admin
    ):
        workflow = (
            db.query(ReviewWorkflow)
            .filter(ReviewWorkflow.workflow_id == d_owner.workflow_id)
            .first()
        )
        if workflow and workflow.constraint_data_entry:
            assigned_area_rows = (
                db.query(IamUserRoleContent.content_id)
                .filter(
                    IamUserRoleContent.user_id == user_id,
                    IamUserRoleContent.workflow_id == d_owner.workflow_id,
                    IamUserRoleContent.resource_code == "dm_dw_area",
                )
                .all()
            )
            assigned_area_nids = {r.content_id for r in assigned_area_rows}
            if assigned_area_nids:
                for inp, cid, idx in resolved_bundle:
                    if inp.area_nid not in assigned_area_nids:
                        failures.append(
                            {
                                "index": idx,
                                "data_point_id": cid,
                                "code": "AREA_NOT_ASSIGNED",
                                "messages": [area_forbidden_msg],
                            }
                        )

    if failures:
        raise UnifiedUpsertPreflightError(failures)

    upsert_res = upsert_data_points(
        db,
        dw_id=dw_id,
        dataset_id=resolved_id,
        user_id=user_id,
        payload=DataPointUpsertRequest(data_points=[b[0] for b in resolved_bundle]),
        is_super_admin=is_super_admin,
        commit=False,
    )
    db.commit()
    return DataPointUpsertResponse(
        dataset_id=resolved_id,
        inserted=upsert_res.inserted,
        updated=upsert_res.updated,
        total=upsert_res.total,
        marked_deleted=marked_deleted,
        restored=restored,
    )


def unified_delete_data_points(
    db: Session,
    dw_id: int,
    user_id: int,
    payload: UnifiedDeleteRequest,
    *,
    is_super_admin: bool = False,
) -> DataPointDeleteResponse:
    """
    Bulk delete via the unified endpoint.
    dataset_id required; raises DATASET_ID_REQUIRED if missing.
    """
    if payload.dataset_id is None:
        raise ValueError("DATASET_ID_REQUIRED")
    resolved_id = payload.dataset_id

    return delete_data_points(
        db, dw_id=dw_id, dataset_id=resolved_id, user_id=user_id,
        payload=DataPointDeleteRequest(data_point_ids=payload.data_point_ids),
        is_super_admin=is_super_admin,
    )


def unified_delete_data_point(
    db: Session,
    dw_id: int,
    user_id: int,
    data_point_id: int,
    dataset_id: Optional[int] = None,
    *,
    is_super_admin: bool = False,
) -> DataPointDeleteResponse:
    """
    Single delete via the unified endpoint.
    dataset_id required; raises DATASET_ID_REQUIRED if missing.
    """
    if dataset_id is None:
        raise ValueError("DATASET_ID_REQUIRED")
    resolved_id = dataset_id

    return delete_data_point(
        db, dw_id=dw_id, dataset_id=resolved_id,
        data_point_id=data_point_id, user_id=user_id,
        is_super_admin=is_super_admin,
    )


def unified_submit(
    db: Session,
    dw_id: int,
    user_id: int,
    payload: UnifiedSubmitRequest,
    app_key: str,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> DatasetTransitionResponse:
    """
    Submit or cancel a dataset via the unified endpoint.
    dataset_id required; raises DATASET_ID_REQUIRED if missing.
    """
    if payload.dataset_id is None:
        raise ValueError("DATASET_ID_REQUIRED")
    resolved_id = payload.dataset_id

    return operator_transition(
        db,
        dw_id=dw_id,
        dataset_id=resolved_id,
        user_id=user_id,
        payload=DatasetOperatorPatchRequest(status=payload.status),
        app_key=app_key,
        locale=locale,
        is_super_admin=is_super_admin,
    )


# ===========================================================================
# Association counts — used by FED before delete confirmation dialogs
# ===========================================================================

def count_datasets_by_workflow_ids(
    db: Session,
    dw_id: int,
    workflow_ids: Collection[int],
) -> dict[int, int]:
    """Return {workflow_id: number of datasets} for the given DW. Missing keys imply zero."""
    if not workflow_ids:
        return {}
    rows = (
        db.query(Dataset.workflow_id, func.count(Dataset.dataset_id))
        .filter(Dataset.dw_id == dw_id, Dataset.workflow_id.in_(workflow_ids))
        .group_by(Dataset.workflow_id)
        .all()
    )
    return {int(wid): int(c) for wid, c in rows}


_IN_PROGRESS_STATUSES = {"DRAFT", "PENDING_REVIEW", "REVISION", "REJECTED"}


def count_in_progress_datasets_by_workflow_ids(
    db: Session,
    dw_id: int,
    workflow_ids: Collection[int],
) -> dict[int, int]:
    """Return {workflow_id: count of non-approved, non-deleted datasets} for the given DW."""
    if not workflow_ids:
        return {}
    rows = (
        db.query(Dataset.workflow_id, func.count(Dataset.dataset_id))
        .filter(
            Dataset.dw_id == dw_id,
            Dataset.workflow_id.in_(workflow_ids),
            Dataset.dataset_status.in_(list(_IN_PROGRESS_STATUSES)),
        )
        .group_by(Dataset.workflow_id)
        .all()
    )
    return {int(wid): int(c) for wid, c in rows}


def get_workflow_association_counts(db: Session, dw_id: int, workflow_id: int) -> dict:
    """
    Return association counts for a workflow (for delete confirmation).

    Keys:
      dataset_count        — total datasets referencing this workflow (any status)
      active_dataset_count — datasets in a non-terminal state (block deletion)
      level_count          — configured review levels
      user_assignment_count — IAM user-role-content assignments scoped to this workflow

    Raises ValueError("WORKFLOW_NOT_FOUND") when the workflow does not exist for dw_id.
    """
    wf = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not wf:
        raise ValueError("WORKFLOW_NOT_FOUND")

    dataset_count = count_datasets_by_workflow_ids(db, dw_id, [workflow_id]).get(workflow_id, 0)

    active_dataset_count = (
        db.query(func.count(Dataset.dataset_id))
        .filter(
            Dataset.workflow_id == workflow_id,
            Dataset.dw_id == dw_id,
            Dataset.dataset_status.notin_(list(_TERMINAL_STATUSES)),
        )
        .scalar() or 0
    )

    level_count = (
        db.query(func.count(ReviewWorkflowLevel.workflow_review_level_id))
        .filter(ReviewWorkflowLevel.workflow_id == workflow_id)
        .scalar() or 0
    )

    user_assignment_count = (
        db.query(func.count(IamUserRoleContent.id))
        .filter(IamUserRoleContent.workflow_id == workflow_id)
        .scalar() or 0
    )

    return {
        "dataset_count": int(dataset_count),
        "active_dataset_count": int(active_dataset_count),
        "level_count": int(level_count),
        "user_assignment_count": int(user_assignment_count),
    }


def get_dataset_association_counts(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> dict:
    """
    Return association counts for a dataset (for delete confirmation).

    Keys:
      data_point_count   — data points in the dataset
      review_stage_count — review stages created for this dataset
      review_slice_count — review slices created for this dataset
      action_log_count   — action log entries recorded for this dataset

    Super-admin override: bypasses owner / current-reviewer eligibility.

    Raises:
        ValueError("DATASET_NOT_FOUND")
        ValueError("NOT_AUTHORIZED")
    """
    ds = _assert_dataset_owner_or_current_reviewer(
        db, dataset_id, dw_id, user_id, locale,
        is_super_admin=is_super_admin,
    )
    did = ds.dataset_id

    data_point_count = (
        db.query(func.count(DatasetDataPoint.data_point_id))
        .filter(DatasetDataPoint.dataset_id == did)
        .scalar() or 0
    )

    review_stage_count = (
        db.query(func.count(DatasetReviewStage.stage_id))
        .filter(DatasetReviewStage.dataset_id == did)
        .scalar() or 0
    )

    review_slice_count = (
        db.query(func.count(DatasetReviewSlice.slice_id))
        .filter(DatasetReviewSlice.dataset_id == did)
        .scalar() or 0
    )

    action_log_count = (
        db.query(func.count(DatasetReviewActionLog.log_id))
        .filter(DatasetReviewActionLog.dataset_id == did)
        .scalar() or 0
    )

    return {
        "data_point_count": int(data_point_count),
        "review_stage_count": int(review_stage_count),
        "review_slice_count": int(review_slice_count),
        "action_log_count": int(action_log_count),
    }


# ===========================================================================
# COMMENTS
# ===========================================================================

def add_comment(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    payload: DatasetCommentCreateRequest,
    commenter_role: str,  # "DATAENTRY" | "DATAREVIEW" | "SYSTEM"
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> DatasetCommentResponse:
    """Add a comment to a dataset or data point.

    Super-admin override: bypasses owner / current-reviewer eligibility.
    """
    d = _assert_dataset_owner_or_current_reviewer(
        db, dataset_id, dw_id, user_id, locale=locale,
        is_super_admin=is_super_admin,
    )
    dp: Optional[DatasetDataPoint] = None
    if payload.data_point_id is not None:
        dp = db.query(DatasetDataPoint).filter(
            DatasetDataPoint.data_point_id == payload.data_point_id,
            DatasetDataPoint.dataset_id == dataset_id,
        ).first()
        if not dp:
            raise ValueError("DATA_POINT_NOT_FOUND")
    status = (
        str(d.dataset_status)
        if dp is None
        else str(dp.review_status)
    )
    comment = DatasetReviewComment(
        dataset_id=dataset_id,
        data_point_id=payload.data_point_id,
        commenter_role=commenter_role,
        comment_text=payload.comment_text,
        status=status,
        created_user_id=user_id,
    )
    db.add(comment)
    if dp is not None:
        dp.cmnt_cnt += 1
    else:
        d.cmnt_cnt += 1
    db.commit()
    db.refresh(comment)
    uname_by_id = _iam_usernames_for_ids(db, {int(comment.created_user_id)})
    return DatasetCommentResponse(
        comment_id=comment.comment_id,
        dataset_id=comment.dataset_id,
        data_point_id=comment.data_point_id,
        commenter_role=comment.commenter_role,
        comment_text=comment.comment_text,
        status=comment.status,
        created_username=_username_from_map(uname_by_id, comment.created_user_id),
        created=comment.created,
    )


def list_comments(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    data_point_id: Optional[int] = None,
    locale: str = "en",
    *,
    is_super_admin: bool = False,
) -> list[DatasetCommentResponse]:
    """List dataset-level comments (data_point_id is NULL), or one data point if data_point_id is set.

    Super-admin override: bypasses owner / current-reviewer eligibility.
    """
    _assert_dataset_owner_or_current_reviewer(
        db, dataset_id, dw_id, user_id, locale=locale,
        is_super_admin=is_super_admin,
    )
    q = (
        db.query(DatasetReviewComment, IamUser.username)
        .outerjoin(IamUser, DatasetReviewComment.created_user_id == IamUser.id)
        .filter(DatasetReviewComment.dataset_id == dataset_id)
    )
    if data_point_id is not None:
        q = q.filter(DatasetReviewComment.data_point_id == data_point_id)
    else:
        q = q.filter(DatasetReviewComment.data_point_id.is_(None))
    rows = q.order_by(DatasetReviewComment.created.asc()).all()
    return [
        DatasetCommentResponse(
            comment_id=r.comment_id,
            dataset_id=r.dataset_id,
            data_point_id=r.data_point_id,
            commenter_role=r.commenter_role,
            comment_text=r.comment_text,
            status=r.status,
            created_username=uname,
            created=r.created,
        )
        for r, uname in rows
    ]


def scope_check(
    db: Session,
    dw_id: int,
    dataset_id: int,
    user_id: int,
    proposed: DatasetOperatorPatchRequest,
    *,
    is_super_admin: bool = False,
) -> dict:
    """
    Advisory: compute what would change if the proposed scope were applied.
    Returns: { rows_to_remove, rows_to_add, exclusivity_conflicts }
    No side effects.

    Super-admin override: bypasses ownership.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id

    d = _assert_dataset_owner(
        db, dataset_id, dw_id, user_id, is_super_admin=is_super_admin
    )

    new_area = proposed.area_nids if proposed.area_nids is not None else (d.area_nids or [])
    new_tp = proposed.timeperiod_nids if proposed.timeperiod_nids is not None else (d.timeperiod_nids or [])
    new_ind = proposed.indicator_nids if proposed.indicator_nids is not None else (d.indicator_nids or [])
    new_unit = proposed.unit_nids if proposed.unit_nids is not None else (d.unit_nids or [])
    new_sg = proposed.subgroup_val_nids if proposed.subgroup_val_nids is not None else (d.subgroup_val_nids or [])
    new_ius = proposed.ius_nids if proposed.ius_nids is not None else (d.ius_nids or [])
    new_sources = (
        proposed.source_nids if proposed.source_nids is not None else d.source_nids
    )
    source_vals: list[Optional[int]] = (
        [int(x) for x in new_sources] if new_sources else [None]
    )

    if not new_area or not new_tp:
        return {"rows_to_remove": [], "rows_to_add": [], "exclusivity_conflicts": []}

    with get_warehouse_session_from_id(str(dw_id)) as dw_db:
        ius_rows = _resolve_ius_rows_for_scope(
            dw_db,
            ius_nids=new_ius if new_ius else None,
            indicator_nids=new_ind if new_ind else None,
            unit_nids=new_unit if new_unit else None,
            subgroup_val_nids=new_sg if new_sg else None,
        )
        new_iusnids = [r.iusnid for r in ius_rows]

    new_set = {
        _natural_key_tuple(i, a, t, s)
        for i in new_iusnids
        for a in new_area
        for t in new_tp
        for s in source_vals
    }

    current_dps = db.query(DatasetDataPoint).filter(DatasetDataPoint.dataset_id == dataset_id).all()
    current_set = {
        _natural_key_tuple(dp.iusnid, dp.area_nid, dp.timeperiod_nid, dp.source_nid)
        for dp in current_dps
    }
    dp_map = {
        _natural_key_tuple(dp.iusnid, dp.area_nid, dp.timeperiod_nid, dp.source_nid): dp
        for dp in current_dps
    }

    to_remove = [
        {
            "data_point_id": dp_map[k].data_point_id,
            "iusnid": k[0],
            "area_nid": k[1],
            "timeperiod_nid": k[2],
            "source_nid": k[3],
        }
        for k in (current_set - new_set)
    ]
    to_add = [
        {"iusnid": k[0], "area_nid": k[1], "timeperiod_nid": k[2], "source_nid": k[3]}
        for k in (new_set - current_set)
    ]

    conflicts = _check_scope_exclusivity(
        db,
        dw_id,
        new_iusnids,
        new_area,
        new_tp,
        source_nids=new_sources,
        exclude_dataset_id=dataset_id,
    )

    return {"rows_to_remove": to_remove, "rows_to_add": to_add, "exclusivity_conflicts": conflicts}


# ===========================================================================
# XLSX/CSV IMPORT — delegated to datapoint_import_service (batched / async)
# ===========================================================================

_IMPORT_INVALID_FORMAT = "INVALID_IMPORT_FORMAT"


def import_data_points_from_xlsx(
    db: Session,
    dw_id: int,
    dataset_id: int,
    file_bytes: bytes,
    user_id: int,
    *,
    is_super_admin: bool = False,
) -> dict:
    """See :func:`apps.app_db.services.datapoint_import_service.import_data_points_sync`."""
    del is_super_admin
    from apps.app_db.services.datapoint_import_service import import_data_points_sync

    try:
        return import_data_points_sync(
            db,
            dw_id=dw_id,
            dataset_id=dataset_id,
            file_bytes=file_bytes,
            user_id=user_id,
            fmt="xlsx",
        )
    except ValueError as e:
        if str(e) == "INVALID_IMPORT_FORMAT":
            raise ValueError(_IMPORT_INVALID_FORMAT) from e
        raise


def import_data_points_from_csv(
    db: Session,
    dw_id: int,
    dataset_id: int,
    file_bytes: bytes,
    user_id: int,
    *,
    is_super_admin: bool = False,
) -> dict:
    """See :func:`apps.app_db.services.datapoint_import_service.import_data_points_sync`."""
    del is_super_admin
    from apps.app_db.services.datapoint_import_service import import_data_points_sync

    try:
        return import_data_points_sync(
            db,
            dw_id=dw_id,
            dataset_id=dataset_id,
            file_bytes=file_bytes,
            user_id=user_id,
            fmt="csv",
        )
    except ValueError as e:
        if str(e) == "INVALID_IMPORT_FORMAT":
            raise ValueError(_IMPORT_INVALID_FORMAT) from e
        raise
