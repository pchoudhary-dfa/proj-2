"""
Data warehouse utilities: ISMRD updates and helpers.
"""
from __future__ import annotations

from itertools import product
from typing import List, Optional, Tuple, Union

from sqlalchemy import func, or_, tuple_
from sqlalchemy.orm import Session

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import Data, IndicatorUnitSubgroup, TimePeriod
from apps.shared.config.config import settings


def _normalize_dimension_param(
    value: Optional[Union[int, List[int]]],
) -> Optional[List[int]]:
    """Normalize optional dimension to list[int] or None for use in .in_() filters."""
    if value is None:
        return None
    if isinstance(value, list):
        if not value:
            return None
        return [int(x) for x in value]
    return [int(value)]


def _count_ius_rows_for_perimeter(
    dw_id: str,
    ind_list: Optional[List[int]],
    unit_list: Optional[List[int]],
    sg_list: Optional[List[int]],
) -> int:
    """
    Count total rows in ut_indicator_unit_subgroup for the perimeter of provided
    (indicator, unit, subgroup_val) dimensions in a single query.
    Only dimensions that are provided (non-None) are used; missing dims mean "all" for the filter.
    """
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
        with get_warehouse_session_from_id(dw_id) as dw_db:
            return dw_db.query(func.count(IndicatorUnitSubgroup.iusnid)).scalar() or 0

    if not combinations:
        return 0

    with get_warehouse_session_from_id(dw_id) as dw_db:
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
        return (
            dw_db.query(func.count(IndicatorUnitSubgroup.iusnid))
            .filter(cols.in_(combinations))
            .scalar()
            or 0
        )


def _ismrd_queue_payload(
    dw_id: str,
    *,
    indicator_nid: Optional[Union[int, List[int]]],
    unit_nid: Optional[Union[int, List[int]]],
    subgroup_val_nid: Optional[Union[int, List[int]]],
    area_nid: Optional[Union[int, List[int]]],
) -> dict:
    return {
        "dw_id": dw_id,
        "indicator_nid": indicator_nid,
        "unit_nid": unit_nid,
        "subgroup_val_nid": subgroup_val_nid,
        "area_nid": area_nid,
    }


def _queue_ismrd_job(
    dw_id: str,
    *,
    indicator_nid: Optional[Union[int, List[int]]],
    unit_nid: Optional[Union[int, List[int]]],
    subgroup_val_nid: Optional[Union[int, List[int]]],
    area_nid: Optional[Union[int, List[int]]],
    core_db: Optional[Session],
) -> dict:
    payload = _ismrd_queue_payload(
        dw_id,
        indicator_nid=indicator_nid,
        unit_nid=unit_nid,
        subgroup_val_nid=subgroup_val_nid,
        area_nid=area_nid,
    )
    mq = str(settings.BG_JOB_MQ_TYPE).strip().upper()
    if mq == "DB":
        if core_db is not None and settings.BG_JOB_POLLER_ENABLED:
            from apps.shared.services.bg_job_dispatch import (
                JOB_TYPE_ISMRD_COMBINATION,
                dispatch_bg_job,
            )

            res = dispatch_bg_job(
                db=core_db,
                job_type=JOB_TYPE_ISMRD_COMBINATION,
                payload=payload,
                dw_id=dw_id,
            )
            ref = res.celery_task_id or res.db_job_id
            return {"queued": True, "task_id": ref}
    elif core_db is not None:
        from apps.shared.services.bg_job_dispatch import (
            JOB_TYPE_ISMRD_COMBINATION,
            dispatch_bg_job,
        )

        res = dispatch_bg_job(
            db=core_db,
            job_type=JOB_TYPE_ISMRD_COMBINATION,
            payload=payload,
            dw_id=dw_id,
        )
        ref = res.celery_task_id or res.db_job_id
        return {"queued": True, "task_id": ref}

    from apps.datawarehouse.tasks.bg_setmrd_tasks import (
        bg_run_setmrd_for_combination_task,
    )

    task = bg_run_setmrd_for_combination_task.apply_async(
        kwargs=payload,
        queue=settings.CELERY_QUEUE_NAME_ISMRD,
    )
    return {"queued": True, "task_id": task.id}


def update_ismrd_for_combination(
    dw_id: str,
    *,
    indicator_nid: Optional[Union[int, List[int]]] = None,
    unit_nid: Optional[Union[int, List[int]]] = None,
    subgroup_val_nid: Optional[Union[int, List[int]]] = None,
    area_nid: Optional[Union[int, List[int]]] = None,
    core_db: Optional[Session] = None,
    _internal_skip_check: bool = False,
) -> dict:
    """
    Set ismrd on ut_data per filter combination: 1 for the latest time period, 0 for others.

    When dimensions are provided as lists, runs the logic for each combination of filter
    values (Cartesian product). For each combination:
    - Filters ut_data to that exact combination (single values per dimension).
    - Joins ut_data to ut_timeperiod and picks the latest time period by ut_timeperiod.timeperiod desc
      (non-null timeperiod only).
    - Sets ismrd=1 for rows with that latest timeperiod_nid, ismrd=0 for all other
      rows for that combination.

    Uses get_warehouse_session_from_id(dw_id) for the warehouse session.

    Args:
        dw_id: Data warehouse identifier (required).
        indicator_nid: Optional indicator NID(s); list runs logic per value combination.
        unit_nid: Optional unit NID(s); list runs logic per value combination.
        subgroup_val_nid: Optional subgroup value NID(s); list runs logic per value combination.
        area_nid: Optional area NID(s); list runs logic per value combination.
        core_db: Optional app DB session; with BG_JOB_POLLER_ENABLED enables BG_JOB_MQ_TYPE=DB queue.

    Returns:
        Dict with keys: latest_timeperiod_nid (None, per-combination), rows_marked_ismrd_1,
        rows_marked_ismrd_0, combinations_processed; or when queued: queued=True, task_id=...
    """
    ind_list = _normalize_dimension_param(indicator_nid)
    unit_list = _normalize_dimension_param(unit_nid)
    sg_list = _normalize_dimension_param(subgroup_val_nid)
    area_list = _normalize_dimension_param(area_nid)

    is_background_enabled = settings.IS_BACKGROUND_ENABLED
    if is_background_enabled and not _internal_skip_check:
        all_three_provided = (
            ind_list is not None and unit_list is not None and sg_list is not None
        )
        if all_three_provided:
            combination_count = len(ind_list) * len(unit_list) * len(sg_list)
            if combination_count > settings.ISMRD_SYNC_MAX_COMBINATIONS:
                return _queue_ismrd_job(
                    dw_id,
                    indicator_nid=indicator_nid,
                    unit_nid=unit_nid,
                    subgroup_val_nid=subgroup_val_nid,
                    area_nid=area_nid,
                    core_db=core_db,
                )
        else:
            total_ius_rows = _count_ius_rows_for_perimeter(dw_id, ind_list, unit_list, sg_list)
            if is_background_enabled and total_ius_rows > settings.ISMRD_SYNC_MAX_IUS_ROWS:
                return _queue_ismrd_job(
                    dw_id,
                    indicator_nid=indicator_nid,
                    unit_nid=unit_nid,
                    subgroup_val_nid=subgroup_val_nid,
                    area_nid=area_nid,
                    core_db=core_db,
                )

    ind_values = ind_list if ind_list is not None else [None]
    unit_values = unit_list if unit_list is not None else [None]
    sg_values = sg_list if sg_list is not None else [None]
    area_values = area_list if area_list is not None else [None]

    combinations = list(product(ind_values, unit_values, sg_values, area_values))

    total_count1 = 0
    total_count0 = 0

    with get_warehouse_session_from_id(dw_id) as dw_db:
        for ind, unit, sg, area in combinations:
            base_filters: list = []
            if ind is not None:
                base_filters.append(Data.indicator_nid == ind)
            if unit is not None:
                base_filters.append(Data.unit_nid == unit)
            if sg is not None:
                base_filters.append(Data.subgroup_val_nid == sg)
            if area is not None:
                base_filters.append(Data.area_nid == area)

            latest_nid = (
                dw_db.query(TimePeriod.timeperiod_nid)
                .join(Data, Data.timeperiod_nid == TimePeriod.timeperiod_nid)
                .filter(*base_filters)
                .filter(TimePeriod.timeperiod.isnot(None))
                .order_by(TimePeriod.timeperiod.desc())
                .limit(1)
                .scalar()
            )

            if latest_nid is None:
                count0 = (
                    dw_db.query(Data)
                    .filter(*base_filters)
                    .update({Data.ismrd: False}, synchronize_session=False)
                )
                total_count0 += count0
            else:
                count1 = (
                    dw_db.query(Data)
                    .filter(*base_filters, Data.timeperiod_nid == latest_nid)
                    .update({Data.ismrd: True}, synchronize_session=False)
                )
                count0 = (
                    dw_db.query(Data)
                    .filter(*base_filters)
                    .filter(
                        or_(
                            Data.timeperiod_nid.is_(None),
                            Data.timeperiod_nid != latest_nid,
                        )
                    )
                    .update({Data.ismrd: False}, synchronize_session=False)
                )
                total_count1 += count1
                total_count0 += count0

        dw_db.commit()

    return {
        "latest_timeperiod_nid": None,
        "rows_marked_ismrd_1": total_count1,
        "rows_marked_ismrd_0": total_count0,
        "combinations_processed": len(combinations),
    }
