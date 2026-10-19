"""
Fill missing default subgroup flags on ut_indicator_unit_subgroup (one default per indicator+unit pair).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple, Union

from sqlalchemy import func
from sqlalchemy.orm import Session

from apps.app_db.models.core import SystemConfiguration
from apps.app_db.services.datawarehouse import SystemDatawarehouseService
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    IndicatorUnitSubgroup,
    SubgroupVal,
    get_default_locale,
)
from apps.datawarehouse.utils.data_utils import _normalize_dimension_param
from apps.shared.config.config import settings

logger = logging.getLogger(__name__)

KEY_DEFAULT_SYSTEM_DW_SUBGROUP_GID = "DEFAULT_SYSTEM_DW_SUBGROUP_GID"


def _default_subgroup_queue_payload(
    dw_id: str,
    i_nid: Optional[Union[int, List[int]]],
    u_nid: Optional[Union[int, List[int]]],
) -> dict:
    return {
        "dw_id": dw_id,
        "i_nid": i_nid,
        "u_nid": u_nid,
    }


def _queue_default_subgroup_job(
    dw_id: str,
    *,
    i_nid: Optional[Union[int, List[int]]],
    u_nid: Optional[Union[int, List[int]]],
    core_db: Optional[Session],
) -> dict:
    payload = _default_subgroup_queue_payload(dw_id, i_nid, u_nid)
    mq = str(settings.BG_JOB_MQ_TYPE).strip().upper()
    if mq == "DB":
        if core_db is not None and settings.BG_JOB_POLLER_ENABLED:
            from apps.shared.services.bg_job_dispatch import (
                JOB_TYPE_MARK_DEFAULT_SUBGROUPS,
                dispatch_bg_job,
            )

            res = dispatch_bg_job(
                db=core_db,
                job_type=JOB_TYPE_MARK_DEFAULT_SUBGROUPS,
                payload=payload,
                dw_id=dw_id,
            )
            ref = res.celery_task_id or res.db_job_id
            return {"queued": True, "task_id": ref}
    elif core_db is not None:
        from apps.shared.services.bg_job_dispatch import (
            JOB_TYPE_MARK_DEFAULT_SUBGROUPS,
            dispatch_bg_job,
        )

        res = dispatch_bg_job(
            db=core_db,
            job_type=JOB_TYPE_MARK_DEFAULT_SUBGROUPS,
            payload=payload,
            dw_id=dw_id,
        )
        ref = res.celery_task_id or res.db_job_id
        return {"queued": True, "task_id": ref}

    from apps.datawarehouse.tasks.bg_default_subgroup_tasks import (
        bg_mark_default_subgroups_task,
    )

    task = bg_mark_default_subgroups_task.apply_async(
        kwargs=payload,
        queue=settings.CELERY_QUEUE_NAME_DEFAULT_SUBGROUP,
    )
    return {"queued": True, "task_id": task.id}


def _apply_ius_filters(
    q: Any,
    ind_list: Optional[List[int]],
    unit_list: Optional[List[int]],
) -> Any:
    if ind_list is not None:
        q = q.filter(IndicatorUnitSubgroup.indicator_nid.in_(ind_list))
    if unit_list is not None:
        q = q.filter(IndicatorUnitSubgroup.unit_nid.in_(unit_list))
    return q


def _count_ius_and_pairs(
    dw_db: Any,
    ind_list: Optional[List[int]],
    unit_list: Optional[List[int]],
) -> Tuple[int, int]:
    base = dw_db.query(IndicatorUnitSubgroup)
    base = _apply_ius_filters(base, ind_list, unit_list)
    ius_row_count = base.count()

    pair_q = dw_db.query(
        IndicatorUnitSubgroup.indicator_nid,
        IndicatorUnitSubgroup.unit_nid,
    )
    pair_q = _apply_ius_filters(pair_q, ind_list, unit_list)
    pair_subq = pair_q.distinct().subquery()
    iu_pair_count = dw_db.query(func.count()).select_from(pair_subq).scalar() or 0
    return int(ius_row_count), int(iu_pair_count)


def _get_default_system_dw_subgroup_gid_needle(
    core_db: Optional[Session],
    dw_numeric_id: int,
) -> str:
    """
    Read DEFAULT_SYSTEM_DW_SUBGROUP_GID from warehouse db_configuration, then
    system_configuration, then settings.DEFAULT_SYSTEM_DW_SUBGROUP_GID.
    """
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.services.ut_dw_config_reader import fetch_ut_dw_configs

    if dw_numeric_id:
        try:
            conn_params = SystemDatawarehouseService().get_mysql_warehouse_connection_params(
                dw_numeric_id
            )
            if conn_params:
                wh = fetch_ut_dw_configs(settings.DFA_DM_APP_KEY, conn_params)
                entry = wh.get(KEY_DEFAULT_SYSTEM_DW_SUBGROUP_GID)
                if entry and (entry.get("value") or "").strip():
                    return str(entry["value"]).strip().lower()
        except Exception as e:
            logger.warning(
                "DEFAULT_SYSTEM_DW_SUBGROUP_GID db_configuration lookup failed for dw_id=%s: %s",
                dw_numeric_id,
                e,
            )

    def _core_query(session: Session) -> str:
        row = (
            session.query(SystemConfiguration)
            .filter(
                SystemConfiguration.app_key == settings.DFA_DM_APP_KEY,
                SystemConfiguration.key_code == KEY_DEFAULT_SYSTEM_DW_SUBGROUP_GID,
            )
            .first()
        )
        if row is not None and (row.key_value or "").strip():
            return (row.key_value or "").strip().lower()
        return (settings.DEFAULT_SYSTEM_DW_SUBGROUP_GID or "").strip().lower()

    if core_db is not None:
        return _core_query(core_db)
    with SessionLocal() as s:
        return _core_query(s)


def _mark_default_subgroups_on_session(
    dw_db: Any,
    ind_list: Optional[List[int]],
    unit_list: Optional[List[int]],
    *,
    needle: str,
) -> Dict[str, Any]:
    pairs_examined = 0
    pairs_skipped_already_have_default = 0
    pairs_updated = 0
    ius_rows_updated = 0

    locale = get_default_locale(dw_db)
    SubgroupValModel = SubgroupVal(locale)

    q = dw_db.query(IndicatorUnitSubgroup).order_by(
        IndicatorUnitSubgroup.indicator_nid.asc(),
        IndicatorUnitSubgroup.unit_nid.asc(),
        IndicatorUnitSubgroup.iusnid.asc(),
    )
    q = _apply_ius_filters(q, ind_list, unit_list)
    rows: List[IndicatorUnitSubgroup] = q.all()

    by_pair: Dict[Tuple[Optional[int], Optional[int]], List[IndicatorUnitSubgroup]] = defaultdict(list)
    for r in rows:
        by_pair[(r.indicator_nid, r.unit_nid)].append(r)

    sg_nids = {r.subgroup_val_nid for r in rows if r.subgroup_val_nid is not None}
    gid_by_nid: Dict[int, str] = {}
    if sg_nids:
        for nid, gid in (
            dw_db.query(SubgroupValModel.subgroup_val_nid, SubgroupValModel.subgroup_val_gid)
            .filter(SubgroupValModel.subgroup_val_nid.in_(sg_nids))
            .all()
        ):
            gid_by_nid[int(nid)] = (gid or "")

    for _pair, group in by_pair.items():
        pairs_examined += 1
        if any(bool(getattr(x, "isdefaultsubgroup", False)) for x in group):
            pairs_skipped_already_have_default += 1
            continue

        ordered = sorted(group, key=lambda x: (x.iusnid or 0))
        chosen: Optional[IndicatorUnitSubgroup] = None
        if needle:
            for r in ordered:
                g = (gid_by_nid.get(r.subgroup_val_nid) if r.subgroup_val_nid is not None else "") or ""
                if needle in g.lower():
                    chosen = r
                    break
        if chosen is None:
            chosen = ordered[0]

        chosen.isdefaultsubgroup = True
        pairs_updated += 1
        ius_rows_updated += 1

    return {
        "pairs_examined": pairs_examined,
        "pairs_skipped_already_have_default": pairs_skipped_already_have_default,
        "pairs_updated": pairs_updated,
        "ius_rows_updated": ius_rows_updated,
    }


def mark_default_subgroups_for_dw(
    dw_id: str,
    i_nid: Optional[Union[int, List[int]]] = None,
    u_nid: Optional[Union[int, List[int]]] = None,
    *,
    core_db: Optional[Session] = None,
    _internal_skip_check: bool = False,
) -> Dict[str, Any]:
    """
    For each (indicator, unit) among matching IUS rows: if none is default, set one row default.
    Prefers subgroup_val_gid containing the GID from db_configuration DEFAULT_SYSTEM_DW_SUBGROUP_GID
    for this warehouse, then system_configuration, then env; else first by iusnid.

    When IS_BACKGROUND_ENABLED and counts exceed thresholds, queues work per BG_JOB_MQ_TYPE
    (Celery or system_bg_job_queue + poller) and returns queued/task_id.

    core_db: optional app DB session; with BG_JOB_POLLER_ENABLED required for BG_JOB_MQ_TYPE=DB when deferring work from the API.
    """
    ind_list = _normalize_dimension_param(i_nid)
    unit_list = _normalize_dimension_param(u_nid)

    resolved_dw = SystemDatawarehouseService().resolve_datawarehouse_id(dw_id)
    if resolved_dw is None:
        logger.warning(
            "Could not resolve system_datawarehouse id for dw_id=%r; using dw_id=0 for "
            "system_configuration DEFAULT_SYSTEM_DW_SUBGROUP_GID lookup",
            dw_id,
        )
    config_dw_numeric_id = resolved_dw if resolved_dw is not None else 0
    needle = _get_default_system_dw_subgroup_gid_needle(core_db, config_dw_numeric_id)

    if settings.IS_BACKGROUND_ENABLED and not _internal_skip_check:
        with get_warehouse_session_from_id(dw_id) as dw_db:
            ius_row_count, iu_pair_count = _count_ius_and_pairs(dw_db, ind_list, unit_list)
            over_rows = ius_row_count > settings.DEFAULT_SUBGROUP_SYNC_MAX_IUS_ROWS
            over_pairs = iu_pair_count > settings.DEFAULT_SUBGROUP_SYNC_MAX_IU_PAIRS
            if not over_rows and not over_pairs:
                result = _mark_default_subgroups_on_session(
                    dw_db, ind_list, unit_list, needle=needle
                )
                result["queued"] = False
                return result

        base = _queue_default_subgroup_job(
            dw_id,
            i_nid=i_nid,
            u_nid=u_nid,
            core_db=core_db,
        )
        return {
            **base,
            "ius_row_count": ius_row_count,
            "iu_pair_count": iu_pair_count,
        }

    with get_warehouse_session_from_id(dw_id) as dw_db:
        result = _mark_default_subgroups_on_session(dw_db, ind_list, unit_list, needle=needle)
    result["queued"] = False
    return result
