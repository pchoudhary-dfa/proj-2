"""
Recompute ut_indicator_unit_subgroup.data_exist from actual ut_data rows, then roll
up ut_indicator.data_exist (true when any IUS for that indicator has data_exist=true)
and ut_area.data_exist (true when any ut_data row references that area_nid).

Uses the same IUS perimeter and background thresholds as ISMRD bulk maintenance
(IS_BACKGROUND_ENABLED, ISMRD_SYNC_MAX_COMBINATIONS, ISMRD_SYNC_MAX_IUS_ROWS).
"""
from __future__ import annotations

from itertools import product
from typing import Dict, List, Optional, Set, Tuple, Union

from sqlalchemy import false, tuple_
from sqlalchemy.orm import Session

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import Area, Data, Indicator, IndicatorUnitSubgroup
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.utils.data_utils import (
    _count_ius_rows_for_perimeter,
    _normalize_dimension_param,
)
from apps.shared.config.config import settings


def _filtered_iusnid_query(dw_db, ind_list, unit_list, sg_list):
    """
    Query of iusnid values matching the same perimeter as _count_ius_rows_for_perimeter.
    """
    q = dw_db.query(IndicatorUnitSubgroup.iusnid)
    if ind_list is not None and unit_list is not None and sg_list is not None:
        combinations: List[Tuple[int, ...]] = [
            (i, u, s) for i, u, s in product(ind_list, unit_list, sg_list)
        ]
    elif ind_list is not None and unit_list is not None:
        combinations = [(i, u) for i, u in product(ind_list, unit_list)]
    elif ind_list is not None and sg_list is not None:
        combinations = [(i, s) for i, s in product(ind_list, sg_list)]
    elif unit_list is not None and sg_list is not None:
        combinations = [(u, s) for u, s in product(unit_list, sg_list)]
    elif ind_list is not None:
        combinations = [(i,) for i in ind_list]
    elif unit_list is not None:
        combinations = [(u,) for u in unit_list]
    elif sg_list is not None:
        combinations = [(s,) for s in sg_list]
    else:
        return q

    if not combinations:
        return q.filter(false())

    if len(combinations[0]) == 3:
        cols = tuple_(
            IndicatorUnitSubgroup.indicator_nid,
            IndicatorUnitSubgroup.unit_nid,
            IndicatorUnitSubgroup.subgroup_val_nid,
        )
    elif len(combinations[0]) == 2:
        if ind_list is not None and unit_list is not None:
            cols = tuple_(
                IndicatorUnitSubgroup.indicator_nid,
                IndicatorUnitSubgroup.unit_nid,
            )
        elif ind_list is not None and sg_list is not None:
            cols = tuple_(
                IndicatorUnitSubgroup.indicator_nid,
                IndicatorUnitSubgroup.subgroup_val_nid,
            )
        else:
            cols = tuple_(
                IndicatorUnitSubgroup.unit_nid,
                IndicatorUnitSubgroup.subgroup_val_nid,
            )
    else:
        if ind_list is not None:
            cols = tuple_(IndicatorUnitSubgroup.indicator_nid)
        elif unit_list is not None:
            cols = tuple_(IndicatorUnitSubgroup.unit_nid)
        else:
            cols = tuple_(IndicatorUnitSubgroup.subgroup_val_nid)
    return q.filter(cols.in_(combinations))


def _resolve_affected_indicator_nids(
    dw_db,
    ind_list: Optional[List[int]],
    unit_list: Optional[List[int]],
    sg_list: Optional[List[int]],
) -> Optional[Set[int]]:
    """
    Indicator NIDs whose ut_indicator.data_exist should be recomputed after the IUS pass.

    None means full warehouse (every indicator row). When indicator_nid filter is provided,
    only those indicators are updated (using all of their IUS rows, not just the filtered
    subset). Otherwise derive affected indicators from unit/subgroup perimeter filters.
    """
    if ind_list is not None:
        return set(ind_list)
    if unit_list is None and sg_list is None:
        return None

    q = dw_db.query(IndicatorUnitSubgroup.indicator_nid).distinct()
    if unit_list is not None:
        q = q.filter(IndicatorUnitSubgroup.unit_nid.in_(unit_list))
    if sg_list is not None:
        q = q.filter(IndicatorUnitSubgroup.subgroup_val_nid.in_(sg_list))
    return {r[0] for r in q.all() if r[0] is not None}


def _recompute_indicator_data_exist(
    dw_db,
    dw_id: str,
    affected_indicator_nids: Optional[Set[int]],
) -> dict:
    """
    Set ut_indicator.data_exist on every locale table from IUS.data_exist rollup.

    An indicator has data when any of its IUS rows has data_exist=true. When
    affected_indicator_nids is set, only those indicators are updated; otherwise
    every indicator in the warehouse is evaluated.
    """
    lang_codes = get_dw_language_codes(dw_id)
    if not lang_codes:
        return {"indicators_processed": 0, "indicators_set_1": 0, "indicators_set_0": 0}

    if affected_indicator_nids is not None and not affected_indicator_nids:
        return {"indicators_processed": 0, "indicators_set_1": 0, "indicators_set_0": 0}

    q_with = (
        dw_db.query(IndicatorUnitSubgroup.indicator_nid)
        .filter(IndicatorUnitSubgroup.data_exist.is_(True))
        .distinct()
    )
    if affected_indicator_nids is not None:
        q_with = q_with.filter(
            IndicatorUnitSubgroup.indicator_nid.in_(affected_indicator_nids)
        )
    with_data = {r[0] for r in q_with.all() if r[0] is not None}

    if affected_indicator_nids is None:
        Ind = Indicator(lang_codes[0])
        affected = {
            r[0] for r in dw_db.query(Ind.indicator_nid).all() if r[0] is not None
        }
    else:
        affected = affected_indicator_nids

    without_data = affected - with_data
    scope_with_data = with_data & affected

    for lang_code in lang_codes:
        Ind = Indicator(lang_code)
        if scope_with_data:
            dw_db.query(Ind).filter(Ind.indicator_nid.in_(scope_with_data)).update(
                {Ind.data_exist: True}, synchronize_session=False
            )
        if without_data:
            dw_db.query(Ind).filter(Ind.indicator_nid.in_(without_data)).update(
                {Ind.data_exist: False}, synchronize_session=False
            )

    dw_db.commit()

    return {
        "indicators_processed": len(affected),
        "indicators_set_1": len(scope_with_data),
        "indicators_set_0": len(without_data),
    }


def _recompute_area_data_exist(dw_db, dw_id: str) -> dict:
    """
    Set ut_area_<locale>.data_exist on every locale table.

    An area has data when at least one ut_data row references its area_nid.
    This is always a full-warehouse pass — area coverage is not scoped by the
    IUS perimeter (indicator/unit/subgroup filters).
    """
    lang_codes = get_dw_language_codes(dw_id)
    if not lang_codes:
        return {"areas_processed": 0, "areas_set_1": 0, "areas_set_0": 0}

    areas_with_data: Set[int] = {
        r[0]
        for r in dw_db.query(Data.area_nid)
        .filter(Data.area_nid.isnot(None), Data.area_nid != 0)
        .distinct()
        .all()
        if r[0] is not None
    }

    A0 = Area(lang_codes[0])
    all_area_nids: Set[int] = {
        r[0] for r in dw_db.query(A0.area_nid).all() if r[0] is not None
    }
    areas_without_data = all_area_nids - areas_with_data
    scope_with_data = areas_with_data & all_area_nids

    for lang_code in lang_codes:
        A = Area(lang_code)
        if scope_with_data:
            dw_db.query(A).filter(A.area_nid.in_(scope_with_data)).update(
                {A.data_exist: True}, synchronize_session=False
            )
        if areas_without_data:
            dw_db.query(A).filter(A.area_nid.in_(areas_without_data)).update(
                {A.data_exist: False}, synchronize_session=False
            )

    dw_db.commit()

    return {
        "areas_processed": len(all_area_nids),
        "areas_set_1": len(scope_with_data),
        "areas_set_0": len(areas_without_data),
    }


def _ius_data_exist_queue_payload(
    dw_id: str,
    *,
    indicator_nid: Optional[Union[int, List[int]]],
    unit_nid: Optional[Union[int, List[int]]],
    subgroup_val_nid: Optional[Union[int, List[int]]],
) -> dict:
    return {
        "dw_id": dw_id,
        "indicator_nid": indicator_nid,
        "unit_nid": unit_nid,
        "subgroup_val_nid": subgroup_val_nid,
    }


def _queue_ius_data_exist_job(
    dw_id: str,
    *,
    indicator_nid: Optional[Union[int, List[int]]],
    unit_nid: Optional[Union[int, List[int]]],
    subgroup_val_nid: Optional[Union[int, List[int]]],
    core_db: Optional[Session],
) -> dict:
    payload = _ius_data_exist_queue_payload(
        dw_id,
        indicator_nid=indicator_nid,
        unit_nid=unit_nid,
        subgroup_val_nid=subgroup_val_nid,
    )
    mq = str(settings.BG_JOB_MQ_TYPE).strip().upper()
    if mq == "DB":
        if core_db is not None and settings.BG_JOB_POLLER_ENABLED:
            from apps.shared.services.bg_job_dispatch import (
                JOB_TYPE_IUS_DATA_EXIST,
                dispatch_bg_job,
            )

            res = dispatch_bg_job(
                db=core_db,
                job_type=JOB_TYPE_IUS_DATA_EXIST,
                payload=payload,
                dw_id=dw_id,
            )
            ref = res.celery_task_id or res.db_job_id
            return {"queued": True, "task_id": ref}
    elif core_db is not None:
        from apps.shared.services.bg_job_dispatch import (
            JOB_TYPE_IUS_DATA_EXIST,
            dispatch_bg_job,
        )

        res = dispatch_bg_job(
            db=core_db,
            job_type=JOB_TYPE_IUS_DATA_EXIST,
            payload=payload,
            dw_id=dw_id,
        )
        ref = res.celery_task_id or res.db_job_id
        return {"queued": True, "task_id": ref}

    from apps.datawarehouse.tasks.bg_ius_data_exist_tasks import (
        bg_recompute_ius_data_exist_task,
    )

    task = bg_recompute_ius_data_exist_task.apply_async(
        kwargs=payload,
        queue=settings.CELERY_QUEUE_NAME_ISMRD,
    )
    return {"queued": True, "task_id": task.id}


def recompute_ius_data_exist_from_ut_data(
    dw_id: str,
    *,
    indicator_nid: Optional[Union[int, List[int]]] = None,
    unit_nid: Optional[Union[int, List[int]]] = None,
    subgroup_val_nid: Optional[Union[int, List[int]]] = None,
    core_db: Optional[Session] = None,
    _internal_skip_check: bool = False,
) -> dict:
    """
    For each IUS in ut_indicator_unit_subgroup within the perimeter (in chunks):
    set data_exist=1 if ut_data has at least one row for that iusnid, else 0.
    Then roll up ut_indicator.data_exist on all locale tables (true when any IUS for
    that indicator has data_exist=true).

    When IS_BACKGROUND_ENABLED is True and work exceeds ISMRD_* thresholds, queues work
    per BG_JOB_MQ_TYPE (Celery or system_bg_job_queue + poller); returns queued/task_id.

    core_db: optional app DB session; with BG_JOB_POLLER_ENABLED required for
    BG_JOB_MQ_TYPE=DB when deferring work from the API.

    Returns:
        Sync: chunks, ius_processed, ius_set_1, ius_set_0, indicators_processed,
              indicators_set_1, indicators_set_0
        Async: queued=True, task_id=...
    """
    ind_list = _normalize_dimension_param(indicator_nid)
    unit_list = _normalize_dimension_param(unit_nid)
    sg_list = _normalize_dimension_param(subgroup_val_nid)

    is_background_enabled = settings.IS_BACKGROUND_ENABLED
    if is_background_enabled and not _internal_skip_check:
        all_three_provided = (
            ind_list is not None and unit_list is not None and sg_list is not None
        )
        if all_three_provided:
            combination_count = len(ind_list) * len(unit_list) * len(sg_list)
            if combination_count > settings.ISMRD_SYNC_MAX_COMBINATIONS:
                return _queue_ius_data_exist_job(
                    dw_id,
                    indicator_nid=indicator_nid,
                    unit_nid=unit_nid,
                    subgroup_val_nid=subgroup_val_nid,
                    core_db=core_db,
                )
        else:
            total_ius_rows = _count_ius_rows_for_perimeter(
                dw_id, ind_list, unit_list, sg_list
            )
            if total_ius_rows > settings.ISMRD_SYNC_MAX_IUS_ROWS:
                return _queue_ius_data_exist_job(
                    dw_id,
                    indicator_nid=indicator_nid,
                    unit_nid=unit_nid,
                    subgroup_val_nid=subgroup_val_nid,
                    core_db=core_db,
                )

    chunks = 0
    ius_processed = 0
    ius_set_1 = 0
    ius_set_0 = 0
    offset = 0

    with get_warehouse_session_from_id(dw_id) as dw_db:
        while True:
            base = _filtered_iusnid_query(dw_db, ind_list, unit_list, sg_list)
            chunk_rows = (
                base.order_by(IndicatorUnitSubgroup.iusnid)
                .limit(settings.IUS_DATA_EXIST_CHUNK_SIZE)
                .offset(offset)
                .all()
            )
            if not chunk_rows:
                break

            ids = [r[0] for r in chunk_rows]
            chunks += 1
            ius_processed += len(ids)

            with_data_rows = (
                dw_db.query(Data.iusnid)
                .filter(Data.iusnid.in_(ids))
                .distinct()
                .all()
            )
            has_data = {r[0] for r in with_data_rows if r[0] is not None}

            with_ids = [i for i in ids if i in has_data]
            without_ids = [i for i in ids if i not in has_data]

            if with_ids:
                n1 = (
                    dw_db.query(IndicatorUnitSubgroup)
                    .filter(IndicatorUnitSubgroup.iusnid.in_(with_ids))
                    .update({IndicatorUnitSubgroup.data_exist: True}, synchronize_session=False)
                )
                ius_set_1 += n1
            if without_ids:
                n0 = (
                    dw_db.query(IndicatorUnitSubgroup)
                    .filter(IndicatorUnitSubgroup.iusnid.in_(without_ids))
                    .update({IndicatorUnitSubgroup.data_exist: False}, synchronize_session=False)
                )
                ius_set_0 += n0

            dw_db.commit()
            offset += settings.IUS_DATA_EXIST_CHUNK_SIZE

        affected_indicators = _resolve_affected_indicator_nids(
            dw_db, ind_list, unit_list, sg_list
        )
        indicator_stats = _recompute_indicator_data_exist(
            dw_db, dw_id, affected_indicators
        )
        area_stats = _recompute_area_data_exist(dw_db, dw_id)

    return {
        "chunks": chunks,
        "ius_processed": ius_processed,
        "ius_set_1": ius_set_1,
        "ius_set_0": ius_set_0,
        **indicator_stats,
        **area_stats,
    }
