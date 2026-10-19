"""
DW report query functions — one per report slug.
All functions follow the signature:
    fn(dw_db, locale, page, page_size, **kwargs) -> (rows: list[dict], total, has_more: bool)
page_size=None means fetch all rows (used for export).
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import and_, case, exists, func, or_, text, tuple_
from sqlalchemy.orm import Session, aliased

from apps.datawarehouse.models.datawarehouse import (
    Area,
    Data,
    IcIus,
    Indicator,
    IndicatorClassification,
    IndicatorUnitSubgroup,
    MetadataCategory,
    MetadataReport,
    SubgroupVal,
    TimePeriod,
    Unit,
    get_default_locale,
)
from apps.datawarehouse.services.data_service import DataService, _normalize_list_param
from apps.datawarehouse.services.dw_published_data_service import (
    OperatorFilter,
    PublishedDataFilters,
    query_published_data,
)
from apps.shared.exceptions import BadRequest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _paginate(
    query,
    page: int,
    page_size: Optional[int],
) -> tuple[list, Optional[int], bool]:
    """
    Apply LIMIT/OFFSET and return (rows, total, has_more).

    - page_size=None: fetch all rows (export mode).
    - Otherwise: always compute total_count, then fetch the requested page.
    """
    if page_size is None:
        rows = query.all()
        return rows, len(rows), False

    total = query.order_by(None).count() or 0
    offset = (page - 1) * page_size
    rows = query.offset(offset).limit(page_size).all()
    has_more = (offset + len(rows)) < total
    return rows, total, has_more


def _apply_search(q, search: Optional[str], search_by: Optional[str], field_map: dict):
    """Apply case-insensitive substring filter if search and search_by are provided."""
    if search and search_by:
        if search_by not in field_map:
            raise BadRequest(
                f"Invalid search_by value '{search_by}'. "
                f"Allowed: {', '.join(sorted(field_map))}",
            )
        q = q.filter(field_map[search_by].ilike(f"%{search}%"))
    return q


def _apply_sort(q, sort_field: Optional[str], sort_order: str, field_map: dict, default_col=None):
    """
    Override ORDER BY when sort_field is provided.
    When sort_field is None and default_col is given, apply a default sort (clears existing).
    When sort_field is None and default_col is None, preserve the existing ORDER BY.
    """
    if sort_field:
        if sort_field not in field_map:
            raise BadRequest(
                f"Invalid sort_field value '{sort_field}'. "
                f"Allowed: {', '.join(sorted(field_map))}",
            )
        col = field_map[sort_field]
        q = q.order_by(False)
        return q.order_by(col.desc() if (sort_order or "asc").lower() == "desc" else col.asc())
    elif default_col is not None:
        q = q.order_by(False)
        return q.order_by(default_col.asc())
    return q


def _stub_query(
    dw_db: Session,
    locale: str,
    page: int,
    page_size: Optional[int],
    **kwargs: Any,
) -> tuple[list[dict], int]:
    """Placeholder — not yet implemented."""
    del dw_db, locale, page, page_size, kwargs
    return [], 0, False


# ---------------------------------------------------------------------------
# Group A — Indicator Quality
# ---------------------------------------------------------------------------

def query_indicators_no_ius(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    I = Indicator(locale)
    IUS = IndicatorUnitSubgroup
    search_map = {"i_name": I.indicator_name}
    sort_map = {"i_nid": I.indicator_nid, "i_name": I.indicator_name}
    q = (
        dw_db.query(I.indicator_nid, I.indicator_gid, I.indicator_name)
        .outerjoin(IUS, IUS.indicator_nid == I.indicator_nid)
        .filter(IUS.iusnid == None)  # noqa: E711
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=I.indicator_name)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {"i_nid": r.indicator_nid, "i_gid": r.indicator_gid, "i_name": r.indicator_name}
        for r in rows
    ], total, has_more


def query_indicators_no_default_subgroup(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    I = Indicator(locale)
    IUS = IndicatorUnitSubgroup
    SV = SubgroupVal(locale)
    search_map = {"i_name": I.indicator_name}
    sort_map = {"i_nid": I.indicator_nid, "i_name": I.indicator_name}

    has_ius = dw_db.query(IUS.indicator_nid).filter(IUS.indicator_nid == I.indicator_nid)
    has_default = dw_db.query(IUS.indicator_nid).filter(
        IUS.indicator_nid == I.indicator_nid, IUS.isdefaultsubgroup == True  # noqa: E712
    )
    q = (
        dw_db.query(I.indicator_nid, I.indicator_gid, I.indicator_name)
        .filter(has_ius.exists())
        .filter(~has_default.exists())
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=I.indicator_name)
    rows, total, has_more = _paginate(q, page, page_size)

    indicator_nids = [r.indicator_nid for r in rows]
    breakdown: dict[int, list[dict]] = {n: [] for n in indicator_nids}
    if indicator_nids:
        sb_rows = (
            dw_db.query(
                IUS.indicator_nid,
                SV.subgroup_val_nid,
                SV.subgroup_val_gid,
                SV.subgroup_val,
                IUS.isdefaultsubgroup,
            )
            .join(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
            .filter(IUS.indicator_nid.in_(indicator_nids))
            .all()
        )
        for sb in sb_rows:
            breakdown[sb.indicator_nid].append({
                "sg_nid": sb.subgroup_val_nid,
                "sg_gid": sb.subgroup_val_gid,
                "sg_name": sb.subgroup_val,
                "ius_is_default_subgroup": bool(sb.isdefaultsubgroup),
            })

    return [
        {
            "i_nid": r.indicator_nid,
            "i_gid": r.indicator_gid,
            "i_name": r.indicator_name,
            "subgroup_breakdown": breakdown.get(r.indicator_nid, []),
        }
        for r in rows
    ], total, has_more


def query_indicators_no_data(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    del locale  # indicator flags and names come from default-locale ut_indicator_*
    default_locale = get_default_locale(dw_db)
    I = Indicator(default_locale)
    search_map = {"i_name": I.indicator_name}
    sort_map = {"i_nid": I.indicator_nid, "i_name": I.indicator_name}

    q = dw_db.query(
        I.indicator_nid,
        I.indicator_gid,
        I.indicator_name,
        I.data_exist,
    ).filter(I.data_exist == False)  # noqa: E712
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=I.indicator_name)
    rows, total, has_more = _paginate(q, page, page_size)

    return [
        {
            "i_nid": r.indicator_nid,
            "i_gid": r.indicator_gid,
            "i_name": r.indicator_name,
            "i_has_data": bool(r.data_exist),
        }
        for r in rows
    ], total, has_more


# ---------------------------------------------------------------------------
# Group B — IUS Quality
# ---------------------------------------------------------------------------

def query_ius_invalid_value_range(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    IUS = IndicatorUnitSubgroup
    I = Indicator(locale)
    SV = SubgroupVal(locale)
    search_map = {"i_name": I.indicator_name, "sg_name": SV.subgroup_val}
    sort_map = {"ius_nid": IUS.iusnid, "i_name": I.indicator_name, "sg_name": SV.subgroup_val}
    q = (
        dw_db.query(
            IUS.iusnid, IUS.indicator_nid, IUS.unit_nid, IUS.subgroup_val_nid,
            IUS.min_value, IUS.max_value,
            I.indicator_name,
            SV.subgroup_val,
        )
        .outerjoin(I, I.indicator_nid == IUS.indicator_nid)
        .outerjoin(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
        .filter(
            IUS.min_value > 0, IUS.max_value > 0, IUS.min_value > IUS.max_value
        )
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=IUS.iusnid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "ius_nid": r.iusnid, "i_nid": r.indicator_nid,
            "u_nid": r.unit_nid, "sg_nid": r.subgroup_val_nid,
            "ius_min_value": float(r.min_value), "ius_max_value": float(r.max_value),
            "i_name": r.indicator_name, "sg_name": r.subgroup_val,
        }
        for r in rows
    ], total, has_more


def query_ius_no_ic_mapping(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    IUS = IndicatorUnitSubgroup
    IC_IUS = IcIus
    I = Indicator(locale)
    U = Unit(locale)
    SV = SubgroupVal(locale)
    search_map = {
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
    }
    sort_map = {
        "ius_nid": IUS.iusnid,
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
    }
    mapped_ius = dw_db.query(IC_IUS.iusnid).distinct().subquery()
    q = (
        dw_db.query(
            IUS.iusnid, IUS.indicator_nid, IUS.unit_nid, IUS.subgroup_val_nid,
            I.indicator_name, U.unit_name, SV.subgroup_val,
        )
        .outerjoin(I, I.indicator_nid == IUS.indicator_nid)
        .outerjoin(U, U.unit_nid == IUS.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
        .outerjoin(mapped_ius, mapped_ius.c.iusnid == IUS.iusnid)
        .filter(mapped_ius.c.iusnid.is_(None))
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=IUS.iusnid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "ius_nid": r.iusnid, "i_nid": r.indicator_nid,
            "u_nid": r.unit_nid, "sg_nid": r.subgroup_val_nid,
            "i_name": r.indicator_name, "u_name": r.unit_name, "sg_name": r.subgroup_val,
        }
        for r in rows
    ], total, has_more


def query_ius_orphan_refs(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    IUS = IndicatorUnitSubgroup
    I = Indicator(locale)
    U = Unit(locale)
    SV = SubgroupVal(locale)
    search_map = {"i_name": I.indicator_name, "sg_name": SV.subgroup_val}
    sort_map = {"ius_nid": IUS.iusnid, "i_name": I.indicator_name, "sg_name": SV.subgroup_val}

    q = (
        dw_db.query(
            IUS.iusnid, IUS.indicator_nid, IUS.unit_nid, IUS.subgroup_val_nid,
            I.indicator_nid.label("i_ref"),
            U.unit_nid.label("u_ref"),
            SV.subgroup_val_nid.label("sg_ref"),
            I.indicator_name,
            SV.subgroup_val,
        )
        .outerjoin(I, I.indicator_nid == IUS.indicator_nid)
        .outerjoin(U, U.unit_nid == IUS.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
        .filter(
            or_(I.indicator_nid == None, U.unit_nid == None, SV.subgroup_val_nid == None)  # noqa: E711
        )
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=IUS.iusnid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "ius_nid": r.iusnid, "i_nid": r.indicator_nid,
            "u_nid": r.unit_nid, "sg_nid": r.subgroup_val_nid,
            "i_ref_missing": r.i_ref is None,
            "u_ref_missing": r.u_ref is None,
            "sg_ref_missing": r.sg_ref is None,
            "i_name": r.indicator_name,
            "sg_name": r.subgroup_val,
        }
        for r in rows
    ], total, has_more


# ---------------------------------------------------------------------------
# Group C — Area Quality
# ---------------------------------------------------------------------------

def query_areas_no_data(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    A = Area(locale)
    search_map = {"ar_name": A.area_name, "ar_id": A.area_id}
    sort_map = {"ar_nid": A.area_nid, "ar_name": A.area_name}
    q = dw_db.query(A.area_nid, A.area_gid, A.area_id, A.area_name).filter(A.data_exist == False)  # noqa: E712
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=A.area_name)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "ar_nid": r.area_nid,
            "ar_gid": r.area_gid,
            "ar_id": r.area_id or "",
            "ar_name": r.area_name,
        }
        for r in rows
    ], total, has_more


def query_areas_orphan_parent(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    A = Area(locale)
    Parent = aliased(Area(locale))
    search_map = {"ar_name": A.area_name, "ar_id": A.area_id}
    sort_map = {"ar_nid": A.area_nid, "ar_name": A.area_name}
    q = (
        dw_db.query(A.area_nid, A.area_gid, A.area_id, A.area_name, A.area_parent_nid)
        .select_from(A)
        .outerjoin(Parent, Parent.area_nid == A.area_parent_nid)
        .filter(
            A.area_parent_nid != 0,
            A.area_parent_nid.isnot(None),
            Parent.area_nid.is_(None),
        )
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=A.area_name)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "ar_nid": r.area_nid,
            "ar_gid": r.area_gid,
            "ar_id": r.area_id or "",
            "ar_name": r.area_name,
            "ar_parent_nid": r.area_parent_nid,
        }
        for r in rows
    ], total, has_more


# ---------------------------------------------------------------------------
# Group D — Time Period Quality
# ---------------------------------------------------------------------------

def query_time_periods_unused(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    TP = TimePeriod
    D = Data
    search_map = {"tp_timeperiod": TP.timeperiod}
    sort_map = {"tp_nid": TP.timeperiod_nid, "tp_timeperiod": TP.timeperiod}
    used_tp = dw_db.query(D.timeperiod_nid).distinct().subquery()
    q = (
        dw_db.query(TP.timeperiod_nid, TP.timeperiod)
        .outerjoin(used_tp, used_tp.c.timeperiod_nid == TP.timeperiod_nid)
        .filter(used_tp.c.timeperiod_nid.is_(None))
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=TP.timeperiod)
    rows, total, has_more = _paginate(q, page, page_size)
    return [{"tp_nid": r.timeperiod_nid, "tp_timeperiod": r.timeperiod} for r in rows], total, has_more


# ---------------------------------------------------------------------------
# Group E — Subgroup Quality
# ---------------------------------------------------------------------------

def query_subgroups_vals_not_in_ius(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    SV = SubgroupVal(locale)
    IUS = IndicatorUnitSubgroup
    search_map = {"sg_name": SV.subgroup_val, "sg_gid": SV.subgroup_val_gid}
    sort_map = {"sg_nid": SV.subgroup_val_nid, "sg_gid": SV.subgroup_val_gid, "sg_name": SV.subgroup_val}
    used_sg = dw_db.query(IUS.subgroup_val_nid).distinct().subquery()
    q = (
        dw_db.query(SV.subgroup_val_nid, SV.subgroup_val_gid, SV.subgroup_val)
        .outerjoin(used_sg, used_sg.c.subgroup_val_nid == SV.subgroup_val_nid)
        .filter(used_sg.c.subgroup_val_nid.is_(None))
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=SV.subgroup_val)
    rows, total, has_more = _paginate(q, page, page_size)
    return [{"sg_nid": r.subgroup_val_nid, "sg_gid": r.subgroup_val_gid, "sg_name": r.subgroup_val} for r in rows], total, has_more


# ---------------------------------------------------------------------------
# Group F — Data Value Integrity
# ---------------------------------------------------------------------------

def query_data_values_out_of_range(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest("No matching time period(s) found", details={"time_period": time_period})

    D = Data
    IUS = IndicatorUnitSubgroup
    I = Indicator(locale)
    A = Area(locale)
    TP = TimePeriod
    search_map = {"i_name": I.indicator_name, "ar_name": A.area_name, "tp_timeperiod": TP.timeperiod}
    sort_map = {
        "dt_nid": D.data_nid, "dt_value": D.data_value,
        "i_name": I.indicator_name, "ar_name": A.area_name,
    }
    base_filters = [
        D.istextualdata == False,  # noqa: E712
        D.data_value != None,  # noqa: E711
        IUS.min_value > 0, IUS.max_value > 0,
        or_(D.data_value < IUS.min_value, D.data_value > IUS.max_value),
    ]
    if timeperiod_nids:
        base_filters.append(D.timeperiod_nid.in_(timeperiod_nids))
    q = (
        dw_db.query(
            D.data_nid, D.iusnid, D.data_value,
            IUS.min_value, IUS.max_value,
            D.area_nid, D.timeperiod_nid,
            I.indicator_name,
            A.area_name,
            TP.timeperiod,
        )
        .join(IUS, IUS.iusnid == D.iusnid)
        .outerjoin(I, I.indicator_nid == IUS.indicator_nid)
        .outerjoin(A, A.area_nid == D.area_nid)
        .outerjoin(TP, TP.timeperiod_nid == D.timeperiod_nid)
        .filter(*base_filters)
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=D.data_nid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "dt_nid": r.data_nid, "ius_nid": r.iusnid, "dt_value": r.data_value,
            "ius_min_value": float(r.min_value), "ius_max_value": float(r.max_value),
            "ar_nid": r.area_nid, "tp_nid": r.timeperiod_nid,
            "i_name": r.indicator_name, "ar_name": r.area_name,
        }
        for r in rows
    ], total, has_more


def _missing_mrd_combo_subquery(dw_db: Session):
    """IUS+area pairs in ut_data with no row where ismrd=True (single-pass GROUP BY)."""
    D = Data
    return (
        dw_db.query(
            D.iusnid.label("iusnid"),
            D.area_nid.label("area_nid"),
        )
        .group_by(D.iusnid, D.area_nid)
        .having(func.sum(case((D.ismrd == True, 1), else_=0)) == 0)  # noqa: E712
        .subquery()
    )


def query_data_missing_mrd(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    IUS = IndicatorUnitSubgroup
    I = Indicator(locale)
    U = Unit(locale)
    SV = SubgroupVal(locale)
    A = Area(locale)
    combo_sq = _missing_mrd_combo_subquery(dw_db)
    search_map = {
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ar_name": A.area_name,
    }
    sort_map = {
        "ius_nid": combo_sq.c.iusnid,
        "ar_nid": combo_sq.c.area_nid,
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ar_name": A.area_name,
    }
    q = (
        dw_db.query(
            combo_sq.c.iusnid,
            combo_sq.c.area_nid,
            I.indicator_name,
            U.unit_name,
            SV.subgroup_val,
            A.area_name,
        )
        .outerjoin(IUS, IUS.iusnid == combo_sq.c.iusnid)
        .outerjoin(I, I.indicator_nid == IUS.indicator_nid)
        .outerjoin(U, U.unit_nid == IUS.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
        .outerjoin(A, A.area_nid == combo_sq.c.area_nid)
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=combo_sq.c.iusnid)

    count_q = dw_db.query(func.count()).select_from(combo_sq)
    if search and search_by:
        count_q = (
            dw_db.query(func.count())
            .select_from(combo_sq)
            .outerjoin(IUS, IUS.iusnid == combo_sq.c.iusnid)
            .outerjoin(I, I.indicator_nid == IUS.indicator_nid)
            .outerjoin(U, U.unit_nid == IUS.unit_nid)
            .outerjoin(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
            .outerjoin(A, A.area_nid == combo_sq.c.area_nid)
        )
        count_q = _apply_search(count_q, search, search_by, search_map)

    rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
    return [
        {
            "ius_nid": r.iusnid,
            "ar_nid": r.area_nid,
            "i_name": r.indicator_name,
            "u_name": r.unit_name,
            "sg_name": r.subgroup_val,
            "ar_name": r.area_name,
        }
        for r in rows
    ], total, has_more


# ---------------------------------------------------------------------------
# Group G — Metadata Completeness
# ---------------------------------------------------------------------------

def query_metadata_missing_mandatory(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    I = Indicator(locale)
    MC = MetadataCategory(locale)
    MR = MetadataReport(locale)
    search_map = {"i_name": I.indicator_name, "mt_catg_name": MC.categoryname}
    sort_map = {"i_nid": I.indicator_nid, "i_name": I.indicator_name, "mt_catg_name": MC.categoryname}

    has_report = (
        dw_db.query(MR.target_nid)
        .filter(
            MR.target_nid == I.indicator_nid,
            MR.category_nid == MC.categorynid,
            func.trim(func.coalesce(MR.metadata_text, "")) != "",
        )
    )
    q = (
        dw_db.query(I.indicator_nid, I.indicator_gid, I.indicator_name,
                    MC.categorynid, MC.categoryname)
        .filter(MC.ismandatory == True)  # noqa: E712
        .filter(~has_report.exists())
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=I.indicator_name)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "i_nid": r.indicator_nid, "i_gid": r.indicator_gid, "i_name": r.indicator_name,
            "mt_catg_nid": r.categorynid, "mt_catg_name": r.categoryname,
        }
        for r in rows
    ], total, has_more


# ---------------------------------------------------------------------------
# Group H — Source Quality
# ---------------------------------------------------------------------------

def query_sources_unused(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    IC = IndicatorClassification(locale)
    D = Data
    search_map = {"src_name": IC.ic_name, "src_gid": IC.ic_gid}
    sort_map = {"src_nid": IC.ic_nid, "src_gid": IC.ic_gid, "src_name": IC.ic_name}
    used_src = (
        dw_db.query(D.source_nid)
        .filter(D.source_nid.isnot(None), D.source_nid != 0)
        .distinct()
        .subquery()
    )
    q = (
        dw_db.query(IC.ic_nid, IC.ic_gid, IC.ic_name)
        .filter(IC.ic_type == "SR")
        .outerjoin(used_src, used_src.c.source_nid == IC.ic_nid)
        .filter(used_src.c.source_nid.is_(None))
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=IC.ic_name)
    rows, total, has_more = _paginate(q, page, page_size)
    return [{"src_nid": r.ic_nid, "src_gid": r.ic_gid, "src_name": r.ic_name} for r in rows], total, has_more


# ---------------------------------------------------------------------------
# Group I — IC / Classification Quality
# ---------------------------------------------------------------------------

def query_ic_no_ius(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    include_sr: bool = False,
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    IC = IndicatorClassification(locale)
    IC_IUS = IcIus
    search_map = {"ic_gid": IC.ic_gid, "ic_name": IC.ic_name, "ic_type": IC.ic_type}
    sort_map = {"ic_nid": IC.ic_nid, "ic_gid": IC.ic_gid, "ic_name": IC.ic_name, "ic_type": IC.ic_type}
    mapped_ic = dw_db.query(IC_IUS.ic_nid).distinct().subquery()
    q = (
        dw_db.query(IC.ic_nid, IC.ic_gid, IC.ic_name, IC.ic_type)
        .outerjoin(mapped_ic, mapped_ic.c.ic_nid == IC.ic_nid)
        .filter(mapped_ic.c.ic_nid.is_(None))
    )
    if not include_sr:
        q = q.filter(IC.ic_type != "SR")
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=IC.ic_name)
    rows, total, has_more = _paginate(q, page, page_size)
    return [{"ic_nid": r.ic_nid, "ic_gid": r.ic_gid, "ic_name": r.ic_name, "ic_type": r.ic_type} for r in rows], total, has_more


def query_ic_leaf_no_ius(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    IC = IndicatorClassification(locale)
    Child = aliased(IndicatorClassification(locale))
    IC_IUS = IcIus
    search_map = {"ic_name": IC.ic_name, "ic_type": IC.ic_type}
    sort_map = {"ic_nid": IC.ic_nid, "ic_name": IC.ic_name, "ic_type": IC.ic_type}
    mapped_ic = dw_db.query(IC_IUS.ic_nid).distinct().subquery()
    q = (
        dw_db.query(IC.ic_nid, IC.ic_gid, IC.ic_name, IC.ic_type)
        .select_from(IC)
        .outerjoin(Child, Child.ic_parent_nid == IC.ic_nid)
        .outerjoin(mapped_ic, mapped_ic.c.ic_nid == IC.ic_nid)
        .filter(Child.ic_nid.is_(None), mapped_ic.c.ic_nid.is_(None))
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=IC.ic_name)
    rows, total, has_more = _paginate(q, page, page_size)
    return [{"ic_nid": r.ic_nid, "ic_gid": r.ic_gid, "ic_name": r.ic_name, "ic_type": r.ic_type} for r in rows], total, has_more


def query_ic_ius_orphan_refs(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    IC_IUS = IcIus
    IC = IndicatorClassification(locale)
    IUS = IndicatorUnitSubgroup
    search_map = {"ic_name": IC.ic_name}
    sort_map = {"ic_ius_nid": IC_IUS.ic_iusnid, "ic_name": IC.ic_name}

    q = (
        dw_db.query(
            IC_IUS.ic_iusnid, IC_IUS.ic_nid, IC_IUS.iusnid,
            IC.ic_nid.label("ic_ref"),
            IUS.iusnid.label("ius_ref"),
            IC.ic_name,
        )
        .outerjoin(IC, IC.ic_nid == IC_IUS.ic_nid)
        .outerjoin(IUS, IUS.iusnid == IC_IUS.iusnid)
        .filter(or_(IC.ic_nid == None, IUS.iusnid == None))  # noqa: E711
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=IC_IUS.ic_iusnid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "ic_ius_nid": r.ic_iusnid, "ic_nid": r.ic_nid, "ius_nid": r.iusnid,
            "ic_ref_missing": r.ic_ref is None,
            "ius_ref_missing": r.ius_ref is None,
            "ic_name": r.ic_name,
        }
        for r in rows
    ], total, has_more


# ---------------------------------------------------------------------------
# Group N — Data Referential Integrity
# ---------------------------------------------------------------------------

def query_data_orphan_ius(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest("No matching time period(s) found", details={"time_period": time_period})

    D = Data
    IUS = IndicatorUnitSubgroup
    I = Indicator(locale)
    U = Unit(locale)
    SV = SubgroupVal(locale)
    A = Area(locale)
    TP = TimePeriod
    search_map = {
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ar_name": A.area_name,
        "tp_timeperiod": TP.timeperiod,
    }
    sort_map = {
        "dt_nid": D.data_nid,
        "dt_value": D.data_value,
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ar_name": A.area_name,
        "tp_timeperiod": TP.timeperiod,
    }
    base_filter = [IUS.iusnid.is_(None)]
    if timeperiod_nids:
        base_filter.append(D.timeperiod_nid.in_(timeperiod_nids))
    q = (
        dw_db.query(
            D.data_nid, D.iusnid, D.area_nid, D.timeperiod_nid, D.source_nid, D.data_value,
            I.indicator_name, U.unit_name, SV.subgroup_val, A.area_name, TP.timeperiod,
        )
        .outerjoin(IUS, IUS.iusnid == D.iusnid)
        .outerjoin(I, I.indicator_nid == D.indicator_nid)
        .outerjoin(U, U.unit_nid == D.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == D.subgroup_val_nid)
        .outerjoin(A, A.area_nid == D.area_nid)
        .outerjoin(TP, TP.timeperiod_nid == D.timeperiod_nid)
        .filter(*base_filter)
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=D.data_nid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "dt_nid": r.data_nid,
            "ius_nid": r.iusnid,
            "ar_nid": r.area_nid,
            "tp_nid": r.timeperiod_nid,
            "tp_timeperiod": r.timeperiod,
            "ic_nid": r.source_nid,
            "dt_value": r.data_value,
            "i_name": r.indicator_name,
            "u_name": r.unit_name,
            "sg_name": r.subgroup_val,
            "ar_name": r.area_name,
        }
        for r in rows
    ], total, has_more


def query_data_orphan_area(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest("No matching time period(s) found", details={"time_period": time_period})

    D = Data
    A = Area(locale)
    I = Indicator(locale)
    U = Unit(locale)
    SV = SubgroupVal(locale)
    TP = TimePeriod
    search_map = {
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "tp_timeperiod": TP.timeperiod,
    }
    sort_map = {
        "dt_nid": D.data_nid,
        "dt_value": D.data_value,
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "tp_timeperiod": TP.timeperiod,
    }
    base_filter = [A.area_nid.is_(None)]
    if timeperiod_nids:
        base_filter.append(D.timeperiod_nid.in_(timeperiod_nids))
    q = (
        dw_db.query(
            D.data_nid, D.iusnid, D.area_nid, D.timeperiod_nid, D.data_value,
            I.indicator_name, U.unit_name, SV.subgroup_val, TP.timeperiod,
        )
        .outerjoin(A, A.area_nid == D.area_nid)
        .outerjoin(I, I.indicator_nid == D.indicator_nid)
        .outerjoin(U, U.unit_nid == D.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == D.subgroup_val_nid)
        .outerjoin(TP, TP.timeperiod_nid == D.timeperiod_nid)
        .filter(*base_filter)
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=D.data_nid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "dt_nid": r.data_nid,
            "ius_nid": r.iusnid,
            "ar_nid": r.area_nid,
            "tp_nid": r.timeperiod_nid,
            "tp_timeperiod": r.timeperiod,
            "dt_value": r.data_value,
            "i_name": r.indicator_name,
            "u_name": r.unit_name,
            "sg_name": r.subgroup_val,
        }
        for r in rows
    ], total, has_more


def query_data_orphan_timeperiod(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    D = Data
    TP = TimePeriod
    A = Area(locale)
    I = Indicator(locale)
    U = Unit(locale)
    SV = SubgroupVal(locale)
    search_map = {
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ar_name": A.area_name,
        "ar_id": A.area_id,
    }
    sort_map = {
        "dt_nid": D.data_nid,
        "dt_value": D.data_value,
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ar_name": A.area_name,
    }
    q = (
        dw_db.query(
            D.data_nid, D.iusnid, D.area_nid, D.timeperiod_nid, D.data_value,
            A.area_id, A.area_name, I.indicator_name, U.unit_name, SV.subgroup_val,
        )
        .outerjoin(TP, TP.timeperiod_nid == D.timeperiod_nid)
        .outerjoin(A, A.area_nid == D.area_nid)
        .outerjoin(I, I.indicator_nid == D.indicator_nid)
        .outerjoin(U, U.unit_nid == D.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == D.subgroup_val_nid)
        .filter(TP.timeperiod_nid.is_(None))
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=D.data_nid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "dt_nid": r.data_nid,
            "ius_nid": r.iusnid,
            "ar_nid": r.area_nid,
            "ar_id": r.area_id or "",
            "tp_nid": r.timeperiod_nid,
            "dt_value": r.data_value,
            "i_name": r.indicator_name,
            "u_name": r.unit_name,
            "sg_name": r.subgroup_val,
            "ar_name": r.area_name,
        }
        for r in rows
    ], total, has_more


def query_data_orphan_source(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest("No matching time period(s) found", details={"time_period": time_period})

    D = Data
    IC = IndicatorClassification(locale)
    A = Area(locale)
    I = Indicator(locale)
    U = Unit(locale)
    SV = SubgroupVal(locale)
    TP = TimePeriod
    search_map = {
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ar_name": A.area_name,
        "ar_id": A.area_id,
        "tp_timeperiod": TP.timeperiod,
    }
    sort_map = {
        "dt_nid": D.data_nid,
        "dt_value": D.data_value,
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ar_name": A.area_name,
        "tp_timeperiod": TP.timeperiod,
    }
    base_filter = [
        D.source_nid.isnot(None),
        D.source_nid != 0,
        IC.ic_nid.is_(None),
    ]
    if timeperiod_nids:
        base_filter.append(D.timeperiod_nid.in_(timeperiod_nids))
    q = (
        dw_db.query(
            D.data_nid, D.iusnid, D.area_nid, D.timeperiod_nid, D.source_nid, D.data_value,
            A.area_id, A.area_name, I.indicator_name, U.unit_name, SV.subgroup_val, TP.timeperiod,
        )
        .outerjoin(IC, IC.ic_nid == D.source_nid)
        .outerjoin(A, A.area_nid == D.area_nid)
        .outerjoin(I, I.indicator_nid == D.indicator_nid)
        .outerjoin(U, U.unit_nid == D.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == D.subgroup_val_nid)
        .outerjoin(TP, TP.timeperiod_nid == D.timeperiod_nid)
        .filter(*base_filter)
    )
    q = _apply_search(q, search, search_by, search_map)
    q = _apply_sort(q, sort_field, sort_order, sort_map, default_col=D.data_nid)
    rows, total, has_more = _paginate(q, page, page_size)
    return [
        {
            "dt_nid": r.data_nid,
            "ius_nid": r.iusnid,
            "ar_nid": r.area_nid,
            "ar_id": r.area_id or "",
            "tp_nid": r.timeperiod_nid,
            "tp_timeperiod": r.timeperiod,
            "ic_nid": r.source_nid,
            "dt_value": r.data_value,
            "i_name": r.indicator_name,
            "u_name": r.unit_name,
            "sg_name": r.subgroup_val,
            "ar_name": r.area_name,
        }
        for r in rows
    ], total, has_more


# ---------------------------------------------------------------------------
# Group J — Coverage & Completeness
# ---------------------------------------------------------------------------

_SCOPED_STATS_BATCH = 500
_INDICATOR_SUBGROUP_METRIC_SORT_FIELDS = frozenset({"data_row_count"})
_INDICATOR_BY_AREA_METRIC_SORT_FIELDS = frozenset({"areas_with_data"})
_AREA_COMPLETENESS_METRIC_SORT_FIELDS = frozenset({"ius_with_data"})
_SOURCE_USAGE_METRIC_SORT_FIELDS = frozenset({
    "total_data_rows",
    "distinct_ius",
    "distinct_areas",
    "distinct_time_periods",
})
_IC_COVERAGE_METRIC_SORT_FIELDS = frozenset({
    "total_data_rows",
    "mapped_ius_count",
    "distinct_areas",
})


def _default_ius_subquery(dw_db: Session):
    IUS = IndicatorUnitSubgroup
    return (
        dw_db.query(IUS.iusnid, IUS.indicator_nid)
        .filter(IUS.isdefaultsubgroup == True)  # noqa: E712
        .subquery()
    )


def _paginate_with_cheap_count(
    q,
    count_q,
    page: int,
    page_size: Optional[int],
) -> tuple[list, Optional[int], bool]:
    """Apply LIMIT/OFFSET; always uses a separate cheap COUNT query."""
    if page_size is None:
        rows = q.all()
        return rows, len(rows), False

    total = count_q.scalar() or 0
    offset = (page - 1) * page_size
    rows = q.offset(offset).limit(page_size).all()
    has_more = (offset + len(rows)) < total
    return rows, total, has_more


def _indicator_area_data_join_condition(default_ius, timeperiod_nids: list[int]):
    """LEFT JOIN ut_data on default IUS; period filter stays in ON so zero-data indicators remain."""
    conditions = [Data.iusnid == default_ius.c.iusnid]
    if timeperiod_nids:
        conditions.extend([
            Data.timeperiod_nid.in_(timeperiod_nids),
            Data.area_nid.isnot(None),
            Data.area_nid != 0,
        ])
    return and_(*conditions)


def _indicator_by_area_total_areas(
    dw_db: Session,
    locale: str,
    timeperiod_nids: list[int],
) -> int:
    """All ut_area rows when unfiltered; distinct areas in ut_data for period(s) when filtered."""
    if not timeperiod_nids:
        A = Area(locale)
        return dw_db.query(func.count(A.area_nid)).scalar() or 1
    return (
        dw_db.query(func.count(func.distinct(Data.area_nid)))
        .filter(*_area_completeness_data_filters(timeperiod_nids))
        .scalar()
        or 1
    )


def _indicator_area_stats_subquery(
    dw_db: Session,
    timeperiod_nids: list[int] | None = None,
):
    """One GROUP BY pass: areas_with_data per indicator (default IUS only)."""
    default_ius = _default_ius_subquery(dw_db)
    tp_nids = timeperiod_nids or []
    return (
        dw_db.query(
            default_ius.c.indicator_nid.label("indicator_nid"),
            func.count(func.distinct(Data.area_nid)).label("areas_with_data"),
        )
        .select_from(default_ius)
        .outerjoin(Data, _indicator_area_data_join_condition(default_ius, tp_nids))
        .group_by(default_ius.c.indicator_nid)
        .subquery()
    )


def _fetch_scoped_indicator_area_stats(
    dw_db: Session,
    indicator_nids: list[int],
    timeperiod_nids: list[int] | None = None,
) -> dict[int, int]:
    """areas_with_data for a page of indicators only (default IUS path)."""
    if not indicator_nids:
        return {}

    default_ius = _default_ius_subquery(dw_db)
    tp_nids = timeperiod_nids or []
    stats: dict[int, int] = {}
    for offset in range(0, len(indicator_nids), _SCOPED_STATS_BATCH):
        chunk = indicator_nids[offset: offset + _SCOPED_STATS_BATCH]
        for row in (
            dw_db.query(
                default_ius.c.indicator_nid,
                func.count(func.distinct(Data.area_nid)).label("areas_with_data"),
            )
            .select_from(default_ius)
            .outerjoin(Data, _indicator_area_data_join_condition(default_ius, tp_nids))
            .filter(default_ius.c.indicator_nid.in_(chunk))
            .group_by(default_ius.c.indicator_nid)
            .all()
        ):
            stats[row.indicator_nid] = row.areas_with_data
    return stats


def _build_indicator_by_area_rows(
    indicator_rows,
    stats: dict[int, int],
    total_areas_scalar: int,
) -> list[dict]:
    seen: set[int] = set()
    out: list[dict] = []
    for r in indicator_rows:
        i_nid = r.indicator_nid
        if i_nid in seen:
            continue
        seen.add(i_nid)
        areas_with_data = stats.get(i_nid, 0)
        out.append({
            "i_nid": i_nid,
            "i_gid": r.indicator_gid,
            "i_name": r.indicator_name,
            "total_areas": total_areas_scalar,
            "areas_with_data": areas_with_data,
            "coverage_pct": round(areas_with_data * 100.0 / total_areas_scalar, 1)
            if total_areas_scalar
            else 0.0,
        })
    return out


def query_coverage_indicator_by_area(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    """
    Indicator coverage by area.

    Default: paginate indicators by name (default IUS only), then aggregate
    ut_data for the current page only. sort_field=areas_with_data uses a single
    pre-aggregated stats subquery for global ranking (full ut_data pass).

    Optional time_period (NID or label, comma-separated) scopes ut_data stats and
    total_areas to the selected period(s).
    """
    I = Indicator(locale)

    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest(
            "No matching time period(s) found",
            details={"time_period": time_period},
        )

    total_areas_scalar = _indicator_by_area_total_areas(dw_db, locale, timeperiod_nids)
    search_map = {"i_name": I.indicator_name}
    use_global_metric_sort = sort_field in _INDICATOR_BY_AREA_METRIC_SORT_FIELDS

    if use_global_metric_sort:
        indicator_stats = _indicator_area_stats_subquery(dw_db, timeperiod_nids)
        areas_col = func.coalesce(indicator_stats.c.areas_with_data, 0)
        sort_map = {"i_name": I.indicator_name, "areas_with_data": areas_col}

        q = (
            dw_db.query(
                I.indicator_nid,
                I.indicator_gid,
                I.indicator_name,
                areas_col.label("areas_with_data"),
            )
            .join(indicator_stats, indicator_stats.c.indicator_nid == I.indicator_nid)
        )
        q = _apply_search(q, search, search_by, search_map)
        q = _apply_sort(q, sort_field, sort_order, sort_map)

        count_q = (
            dw_db.query(func.count(indicator_stats.c.indicator_nid))
            .select_from(indicator_stats)
            .join(I, I.indicator_nid == indicator_stats.c.indicator_nid)
        )
        count_q = _apply_search(count_q, search, search_by, search_map)
        rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
        stats = {r.indicator_nid: r.areas_with_data for r in rows}
        return _build_indicator_by_area_rows(
            rows, stats, total_areas_scalar
        ), total, has_more

    ind_sort_map = {"i_name": I.indicator_name}
    default_ius = _default_ius_subquery(dw_db)
    q = (
        dw_db.query(
            I.indicator_nid,
            I.indicator_gid,
            I.indicator_name,
        )
        .join(default_ius, default_ius.c.indicator_nid == I.indicator_nid)
        .group_by(I.indicator_nid, I.indicator_gid, I.indicator_name)
        .order_by(I.indicator_name.asc())
    )
    q = _apply_search(q, search, search_by, search_map)
    if sort_field:
        q = _apply_sort(q, sort_field, sort_order, ind_sort_map)

    count_q = (
        dw_db.query(func.count(func.distinct(I.indicator_nid)))
        .join(default_ius, default_ius.c.indicator_nid == I.indicator_nid)
    )
    count_q = _apply_search(count_q, search, search_by, search_map)
    ind_rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
    indicator_nids = list(dict.fromkeys(r.indicator_nid for r in ind_rows))
    stats = _fetch_scoped_indicator_area_stats(dw_db, indicator_nids, timeperiod_nids)
    return _build_indicator_by_area_rows(
        ind_rows, stats, total_areas_scalar
    ), total, has_more


def _indicator_by_timeperiod_total_periods(
    dw_db: Session,
    timeperiod_nids: list[int],
) -> int:
    """All ut_timeperiod rows when unfiltered; count of selected period(s) when filtered."""
    if timeperiod_nids:
        return len(timeperiod_nids)
    return dw_db.query(func.count(TimePeriod.timeperiod_nid)).scalar() or 1


def query_coverage_indicator_by_timeperiod(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    I = Indicator(locale)
    D = Data
    TP = TimePeriod

    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest(
            "No matching time period(s) found",
            details={"time_period": time_period},
        )

    total_periods = _indicator_by_timeperiod_total_periods(dw_db, timeperiod_nids)
    default_ius = _default_ius_subquery(dw_db)

    stats_q = (
        dw_db.query(
            default_ius.c.indicator_nid.label("indicator_nid"),
            func.min(TP.timeperiod).label("earliest_period"),
            func.max(TP.timeperiod).label("latest_period"),
            func.count(func.distinct(D.timeperiod_nid)).label("periods_with_data"),
        )
        .select_from(default_ius)
        .join(D, D.iusnid == default_ius.c.iusnid)
        .join(TP, TP.timeperiod_nid == D.timeperiod_nid)
    )
    if timeperiod_nids:
        stats_q = stats_q.filter(D.timeperiod_nid.in_(timeperiod_nids))
    indicator_stats = stats_q.group_by(default_ius.c.indicator_nid).subquery()

    periods_col = indicator_stats.c.periods_with_data
    search_map = {"i_name": I.indicator_name}
    sort_map = {"i_name": I.indicator_name, "periods_with_data": periods_col}

    q = (
        dw_db.query(
            I.indicator_nid,
            I.indicator_gid,
            I.indicator_name,
            indicator_stats.c.earliest_period,
            indicator_stats.c.latest_period,
            periods_col.label("periods_with_data"),
        )
        .join(indicator_stats, indicator_stats.c.indicator_nid == I.indicator_nid)
    )
    q = _apply_search(q, search, search_by, search_map)
    if sort_field:
        q = _apply_sort(q, sort_field, sort_order, sort_map)

    count_q = dw_db.query(func.count(I.indicator_nid)).join(
        indicator_stats, indicator_stats.c.indicator_nid == I.indicator_nid
    )
    count_q = _apply_search(count_q, search, search_by, search_map)
    rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)

    return [
        {
            "i_nid": r.indicator_nid, "i_gid": r.indicator_gid, "i_name": r.indicator_name,
            "earliest_period": r.earliest_period, "latest_period": r.latest_period,
            "periods_with_data": r.periods_with_data, "total_periods": total_periods,
        }
        for r in rows
    ], total, has_more


def _resolve_timeperiod_nids(dw_db: Session, time_period: Optional[str]) -> list[int]:
    """Resolve comma-separated time period NID or label values to ut_timeperiod NIDs."""
    if not time_period or not str(time_period).strip():
        return []
    svc = DataService()
    nids: list[int] = []
    for tp in _normalize_list_param(time_period):
        nid = svc._resolve_timeperiod_identifier(dw_db, tp)
        if nid is not None:
            nids.append(nid)
    return list(dict.fromkeys(nids))


def _area_completeness_data_filters(timeperiod_nids: list[int]) -> list:
    filters = [
        Data.area_nid.isnot(None),
        Data.area_nid != 0,
        Data.iusnid.isnot(None),
        Data.iusnid != 0,
    ]
    if timeperiod_nids:
        filters.append(Data.timeperiod_nid.in_(timeperiod_nids))
    return filters


def _count_area_completeness_total_ius(
    dw_db: Session,
    timeperiod_nids: list[int],
) -> int:
    """All IUS when unfiltered; distinct IUS in ut_data for the period(s) when filtered."""
    if not timeperiod_nids:
        return dw_db.query(func.count(IndicatorUnitSubgroup.iusnid)).scalar() or 1
    return (
        dw_db.query(func.count(func.distinct(Data.iusnid)))
        .filter(*_area_completeness_data_filters(timeperiod_nids))
        .scalar()
        or 1
    )


def _area_ius_stats_subquery(dw_db: Session, timeperiod_nids: list[int] | None = None):
    """One GROUP BY pass: distinct IUS count per area."""
    tp_nids = timeperiod_nids or []
    return (
        dw_db.query(
            Data.area_nid.label("area_nid"),
            func.count(func.distinct(Data.iusnid)).label("ius_with_data"),
        )
        .filter(*_area_completeness_data_filters(tp_nids))
        .group_by(Data.area_nid)
        .subquery()
    )


def _fetch_scoped_area_ius_stats(
    dw_db: Session,
    area_nids: list[int],
    timeperiod_nids: list[int] | None = None,
) -> dict[int, int]:
    """ius_with_data for a page of areas only."""
    if not area_nids:
        return {}

    tp_nids = timeperiod_nids or []
    stats: dict[int, int] = {}
    for offset in range(0, len(area_nids), _SCOPED_STATS_BATCH):
        chunk = area_nids[offset: offset + _SCOPED_STATS_BATCH]
        for row in (
            dw_db.query(
                Data.area_nid,
                func.count(func.distinct(Data.iusnid)).label("ius_with_data"),
            )
            .filter(
                Data.area_nid.in_(chunk),
                *_area_completeness_data_filters(tp_nids),
            )
            .group_by(Data.area_nid)
            .all()
        ):
            stats[row.area_nid] = row.ius_with_data
    return stats


def _build_area_completeness_rows(
    area_rows,
    stats: dict[int, int],
    total_ius_count: int,
) -> list[dict]:
    out: list[dict] = []
    for r in area_rows:
        ius_with_data = stats.get(r.area_nid, getattr(r, "ius_with_data", 0))
        out.append({
            "ar_nid": r.area_nid,
            "ar_gid": r.area_gid,
            "ar_id": r.area_id or "",
            "ar_name": r.area_name,
            "ar_level": r.area_level,
            "total_ius": total_ius_count,
            "ius_with_data": ius_with_data,
            "completeness_pct": round(ius_with_data * 100.0 / total_ius_count, 1)
            if total_ius_count
            else 0.0,
        })
    return out


def query_coverage_area_completeness(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    """
    Area data completeness.

    Default: paginate areas by name, then aggregate ut_data for the current page
    only. sort_field=ius_with_data uses a single pre-aggregated stats subquery for
    global ranking (full ut_data pass).

    Optional time_period (NID or label, comma-separated) scopes ut_data stats and
    total_ius to the selected period(s).
    """
    A = Area(locale)

    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest(
            "No matching time period(s) found",
            details={"time_period": time_period},
        )

    total_ius_count = _count_area_completeness_total_ius(dw_db, timeperiod_nids)
    search_map = {"ar_name": A.area_name}
    use_global_metric_sort = sort_field in _AREA_COMPLETENESS_METRIC_SORT_FIELDS

    if use_global_metric_sort:
        area_stats = _area_ius_stats_subquery(dw_db, timeperiod_nids)
        ius_col = func.coalesce(area_stats.c.ius_with_data, 0)
        sort_map = {"ar_name": A.area_name, "ius_with_data": ius_col}

        q = (
            dw_db.query(
                A.area_nid,
                A.area_gid,
                A.area_id,
                A.area_name,
                A.area_level,
                ius_col.label("ius_with_data"),
            )
            .outerjoin(area_stats, area_stats.c.area_nid == A.area_nid)
        )
        q = _apply_search(q, search, search_by, search_map)
        q = _apply_sort(q, sort_field, sort_order, sort_map)

        count_q = dw_db.query(func.count(A.area_nid))
        count_q = _apply_search(count_q, search, search_by, search_map)
        rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
        stats = {r.area_nid: r.ius_with_data for r in rows}
        return _build_area_completeness_rows(rows, stats, total_ius_count), total, has_more

    area_sort_map = {"ar_name": A.area_name}
    q = (
        dw_db.query(
            A.area_nid,
            A.area_gid,
            A.area_id,
            A.area_name,
            A.area_level,
        )
        .order_by(A.area_name.asc())
    )
    q = _apply_search(q, search, search_by, search_map)
    if sort_field:
        q = _apply_sort(q, sort_field, sort_order, area_sort_map)

    count_q = dw_db.query(func.count(A.area_nid))
    count_q = _apply_search(count_q, search, search_by, search_map)
    area_rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
    area_nids = [r.area_nid for r in area_rows]
    stats = _fetch_scoped_area_ius_stats(dw_db, area_nids, timeperiod_nids)
    return _build_area_completeness_rows(area_rows, stats, total_ius_count), total, has_more


def _apply_indicator_subgroup_indicator_filter(q, indicator_model, indicator_filter: Optional[str]):
    if not indicator_filter:
        return q
    try:
        return q.filter(indicator_model.indicator_nid == int(indicator_filter))
    except ValueError:
        return q.filter(
            or_(
                indicator_model.indicator_gid == indicator_filter,
                indicator_model.indicator_name.like(f"%{indicator_filter}%"),
            )
        )


def _fetch_indicator_subgroup_data_counts(
    dw_db: Session,
    pairs: list[tuple[int, int]],
) -> dict[tuple[int, int], int]:
    if not pairs:
        return {}

    counts: dict[tuple[int, int], int] = {}
    for offset in range(0, len(pairs), _SCOPED_STATS_BATCH):
        chunk = pairs[offset: offset + _SCOPED_STATS_BATCH]
        for row in (
            dw_db.query(
                Data.indicator_nid,
                Data.subgroup_val_nid,
                func.count(Data.data_nid).label("data_row_count"),
            )
            .filter(tuple_(Data.indicator_nid, Data.subgroup_val_nid).in_(chunk))
            .group_by(Data.indicator_nid, Data.subgroup_val_nid)
            .all()
        ):
            counts[(int(row.indicator_nid), int(row.subgroup_val_nid))] = row.data_row_count
    return counts


def query_coverage_indicator_subgroup(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    indicator_filter: Optional[str] = None,
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    **_: Any,
) -> tuple[list[dict], int]:
    """
    Indicator × subgroup coverage matrix — paginate distinct IUS pairs first,
    then aggregate ut_data only for pairs on the current page.
    """
    I = Indicator(locale)
    IUS = IndicatorUnitSubgroup
    SV = SubgroupVal(locale)

    search_map = {"i_name": I.indicator_name, "sg_name": SV.subgroup_val}
    ius_sort_map = {
        "i_name": I.indicator_name,
        "sg_name": SV.subgroup_val,
        "i_nid": I.indicator_nid,
        "sg_nid": SV.subgroup_val_nid,
    }

    pairs_q = (
        dw_db.query(
            IUS.indicator_nid,
            IUS.subgroup_val_nid,
            I.indicator_gid,
            I.indicator_name,
            SV.subgroup_val_gid,
            SV.subgroup_val,
        )
        .join(I, I.indicator_nid == IUS.indicator_nid)
        .join(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
        .group_by(
            IUS.indicator_nid,
            IUS.subgroup_val_nid,
            I.indicator_gid,
            I.indicator_name,
            SV.subgroup_val_gid,
            SV.subgroup_val,
        )
    )
    if indicator_filter:
        try:
            pairs_q = pairs_q.filter(IUS.indicator_nid == int(indicator_filter))
        except ValueError:
            pass
    pairs_q = _apply_indicator_subgroup_indicator_filter(pairs_q, I, indicator_filter)
    pairs_q = _apply_search(pairs_q, search, search_by, search_map)

    use_metric_sort = sort_field in _INDICATOR_SUBGROUP_METRIC_SORT_FIELDS
    if sort_field and not use_metric_sort:
        pairs_q = _apply_sort(pairs_q, sort_field, sort_order, ius_sort_map)
    else:
        pairs_q = pairs_q.order_by(I.indicator_nid.asc(), IUS.subgroup_val_nid.asc())

    count_q = (
        dw_db.query(func.count())
        .select_from(pairs_q.order_by(None).subquery())
    )

    if page_size is None:
        pair_rows = pairs_q.all()
        pairs = [(r.indicator_nid, r.subgroup_val_nid) for r in pair_rows]
        counts = _fetch_indicator_subgroup_data_counts(dw_db, pairs)
        rows = [
            {
                "i_nid": r.indicator_nid,
                "i_gid": r.indicator_gid,
                "i_name": r.indicator_name,
                "sg_nid": r.subgroup_val_nid,
                "sg_gid": r.subgroup_val_gid,
                "sg_name": r.subgroup_val,
                "ius_has_data": counts.get((r.indicator_nid, r.subgroup_val_nid), 0) > 0,
                "data_row_count": counts.get((r.indicator_nid, r.subgroup_val_nid), 0),
            }
            for r in pair_rows
        ]
        if use_metric_sort:
            reverse = (sort_order or "asc").lower() == "desc"
            rows.sort(key=lambda row: row.get(sort_field) or 0, reverse=reverse)
        return rows, len(rows), False

    pair_rows, total, has_more = _paginate_with_cheap_count(
        pairs_q, count_q, page, page_size
    )
    pairs = [(r.indicator_nid, r.subgroup_val_nid) for r in pair_rows]
    counts = _fetch_indicator_subgroup_data_counts(dw_db, pairs)
    rows = [
        {
            "i_nid": r.indicator_nid,
            "i_gid": r.indicator_gid,
            "i_name": r.indicator_name,
            "sg_nid": r.subgroup_val_nid,
            "sg_gid": r.subgroup_val_gid,
            "sg_name": r.subgroup_val,
            "ius_has_data": counts.get((r.indicator_nid, r.subgroup_val_nid), 0) > 0,
            "data_row_count": counts.get((r.indicator_nid, r.subgroup_val_nid), 0),
        }
        for r in pair_rows
    ]
    if use_metric_sort:
        reverse = (sort_order or "asc").lower() == "desc"
        rows.sort(key=lambda row: row.get(sort_field) or 0, reverse=reverse)
    return rows, total, has_more


# ---------------------------------------------------------------------------
# Group K — Data Volume & Distribution
# ---------------------------------------------------------------------------

def query_volume_top_indicators(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest("No matching time period(s) found", details={"time_period": time_period})

    I = Indicator(locale)

    data_filters = [Data.indicator_nid.isnot(None)]
    if timeperiod_nids:
        data_filters.append(Data.timeperiod_nid.in_(timeperiod_nids))
    data_stats = (
        dw_db.query(
            Data.indicator_nid,
            func.count(Data.data_nid).label("total_data_rows"),
        )
        .filter(*data_filters)
        .group_by(Data.indicator_nid)
        .subquery()
    )

    total_col = data_stats.c.total_data_rows
    search_map = {"i_name": I.indicator_name}
    sort_map = {"i_name": I.indicator_name, "total_data_rows": total_col}

    q = (
        dw_db.query(
            I.indicator_nid,
            I.indicator_gid,
            I.indicator_name,
            total_col.label("total_data_rows"),
        )
        .join(data_stats, data_stats.c.indicator_nid == I.indicator_nid)
    )
    q = _apply_search(q, search, search_by, search_map)
    if sort_field:
        q = _apply_sort(q, sort_field, sort_order, sort_map)
    else:
        q = q.order_by(total_col.desc())

    count_q = (
        dw_db.query(func.count(I.indicator_nid))
        .join(data_stats, data_stats.c.indicator_nid == I.indicator_nid)
    )
    count_q = _apply_search(count_q, search, search_by, search_map)

    if page_size is None:
        rows = q.all()
        total = len(rows)
        has_more = False
    else:
        rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)

    return [
        {
            "i_nid": r.indicator_nid,
            "i_gid": r.indicator_gid,
            "i_name": r.indicator_name,
            "total_data_rows": r.total_data_rows,
        }
        for r in rows
    ], total, has_more


_IUS_DENSITY_METRIC_SORT_FIELDS = frozenset({"total_rows", "avg_data_value"})
_IUS_DENSITY_STATS_BATCH = 500


def _ius_density_has_data_clause(ius_model):
    return exists().where(
        Data.iusnid == ius_model.iusnid,
        Data.iusnid.isnot(None),
        Data.iusnid != 0,
    )


def _apply_ius_density_ius_filters(
    q,
    *,
    ius_model,
    indicator_model,
    ius_filter: Optional[str],
    indicator_filter: Optional[str],
):
    if ius_filter:
        try:
            q = q.filter(ius_model.iusnid == int(ius_filter))
        except ValueError:
            pass

    if indicator_filter:
        try:
            q = q.filter(ius_model.indicator_nid == int(indicator_filter))
        except ValueError:
            q = q.filter(
                or_(
                    indicator_model.indicator_gid == indicator_filter,
                    indicator_model.indicator_name.like(f"%{indicator_filter}%"),
                )
            )
    return q


def _ius_density_row_dict(
    ius_row,
    stats,
    tp_labels: dict[int, Optional[str]],
) -> dict:
    min_tp = stats.min_tp_nid if stats else None
    max_tp = stats.max_tp_nid if stats else None
    avg_val = float(stats.avg_data_value) if stats and stats.avg_data_value is not None else None
    return {
        "ius_nid": ius_row.iusnid,
        "i_nid": ius_row.indicator_nid,
        "u_nid": ius_row.unit_nid,
        "sg_nid": ius_row.subgroup_val_nid,
        "total_rows": stats.total_rows if stats else 0,
        "min_data_value": float(stats.min_data_value) if stats and stats.min_data_value is not None else None,
        "max_data_value": float(stats.max_data_value) if stats and stats.max_data_value is not None else None,
        "avg_data_value": round(avg_val, 4) if avg_val is not None else None,
        "earliest_period": tp_labels.get(min_tp) if min_tp else None,
        "latest_period": tp_labels.get(max_tp) if max_tp else None,
        "i_name": ius_row.indicator_name,
        "u_name": ius_row.unit_name,
        "sg_name": ius_row.subgroup_val,
    }


def _fetch_ius_density_stats(
    dw_db: Session,
    ius_ids: list[int],
) -> dict[int, Any]:
    if not ius_ids:
        return {}

    stats_by_ius: dict[int, Any] = {}
    for offset in range(0, len(ius_ids), _IUS_DENSITY_STATS_BATCH):
        chunk = ius_ids[offset: offset + _IUS_DENSITY_STATS_BATCH]
        for row in (
            dw_db.query(
                Data.iusnid,
                func.count(Data.data_nid).label("total_rows"),
                func.min(Data.data_value).label("min_data_value"),
                func.max(Data.data_value).label("max_data_value"),
                func.avg(Data.data_value).label("avg_data_value"),
                func.min(Data.timeperiod_nid).label("min_tp_nid"),
                func.max(Data.timeperiod_nid).label("max_tp_nid"),
            )
            .filter(Data.iusnid.in_(chunk))
            .group_by(Data.iusnid)
            .all()
        ):
            stats_by_ius[row.iusnid] = row
    return stats_by_ius


def _load_timeperiod_labels(dw_db: Session, stats_by_ius: dict[int, Any]) -> dict[int, Optional[str]]:
    tp_nids: set[int] = set()
    for stats in stats_by_ius.values():
        if stats.min_tp_nid:
            tp_nids.add(stats.min_tp_nid)
        if stats.max_tp_nid:
            tp_nids.add(stats.max_tp_nid)
    if not tp_nids:
        return {}
    return {
        tp.timeperiod_nid: tp.timeperiod
        for tp in dw_db.query(TimePeriod.timeperiod_nid, TimePeriod.timeperiod)
        .filter(TimePeriod.timeperiod_nid.in_(tp_nids))
        .all()
    }


def query_volume_ius_density(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    indicator_filter: Optional[str] = None,
    ius_filter: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    """
    Per-IUS data density — paginate ut_indicator_unit_subgroup first (IUS catalog),
    then aggregate ut_data only for the current page's iusnid values.

    Default sort is indicator name (browse mode). sort_field=total_rows or avg_data_value
    sorts the current page by density metrics only (does not rank the full warehouse).
    """
    IUS = IndicatorUnitSubgroup
    I = Indicator(locale)
    U = Unit(locale)
    SV = SubgroupVal(locale)

    search_map = {
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
    }
    ius_sort_map = {
        "i_name": I.indicator_name,
        "u_name": U.unit_name,
        "sg_name": SV.subgroup_val,
        "ius_nid": IUS.iusnid,
    }

    ius_q = (
        dw_db.query(
            IUS.iusnid,
            IUS.indicator_nid,
            IUS.unit_nid,
            IUS.subgroup_val_nid,
            I.indicator_name,
            U.unit_name,
            SV.subgroup_val,
        )
        .outerjoin(I, I.indicator_nid == IUS.indicator_nid)
        .outerjoin(U, U.unit_nid == IUS.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
        .filter(_ius_density_has_data_clause(IUS))
    )
    ius_q = _apply_ius_density_ius_filters(
        ius_q,
        ius_model=IUS,
        indicator_model=I,
        ius_filter=ius_filter,
        indicator_filter=indicator_filter,
    )
    ius_q = _apply_search(ius_q, search, search_by, search_map)

    use_metric_sort = sort_field in _IUS_DENSITY_METRIC_SORT_FIELDS
    if sort_field and not use_metric_sort:
        ius_q = _apply_sort(ius_q, sort_field, sort_order, ius_sort_map)
    else:
        ius_q = ius_q.order_by(I.indicator_name.asc(), IUS.iusnid.asc())

    if page_size is None:
        ius_rows = ius_q.all()
        ius_ids = [r.iusnid for r in ius_rows]
        stats_by_ius = _fetch_ius_density_stats(dw_db, ius_ids)
        tp_labels = _load_timeperiod_labels(dw_db, stats_by_ius)
        rows = [
            _ius_density_row_dict(r, stats_by_ius.get(r.iusnid), tp_labels)
            for r in ius_rows
        ]
        if use_metric_sort:
            reverse = (sort_order or "asc").lower() == "desc"
            rows.sort(key=lambda row: row.get(sort_field) or 0, reverse=reverse)
        return rows, len(rows), False

    count_q = (
        dw_db.query(func.count(IUS.iusnid))
        .outerjoin(I, I.indicator_nid == IUS.indicator_nid)
        .outerjoin(U, U.unit_nid == IUS.unit_nid)
        .outerjoin(SV, SV.subgroup_val_nid == IUS.subgroup_val_nid)
        .filter(_ius_density_has_data_clause(IUS))
    )
    count_q = _apply_ius_density_ius_filters(
        count_q,
        ius_model=IUS,
        indicator_model=I,
        ius_filter=ius_filter,
        indicator_filter=indicator_filter,
    )
    count_q = _apply_search(count_q, search, search_by, search_map)
    total = count_q.scalar() or 0

    offset = (page - 1) * page_size
    ius_rows = ius_q.offset(offset).limit(page_size).all()
    has_more = (offset + len(ius_rows)) < total

    ius_ids = [r.iusnid for r in ius_rows]
    stats_by_ius = _fetch_ius_density_stats(dw_db, ius_ids)
    tp_labels = _load_timeperiod_labels(dw_db, stats_by_ius)
    rows = [
        _ius_density_row_dict(r, stats_by_ius.get(r.iusnid), tp_labels)
        for r in ius_rows
    ]
    if use_metric_sort:
        reverse = (sort_order or "asc").lower() == "desc"
        rows.sort(key=lambda row: row.get(sort_field) or 0, reverse=reverse)

    return rows, total, has_more


def query_volume_subgroup_distribution(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    """
    Per-subgroup data distribution — pre-aggregate ut_data by subgroup_val_nid,
    then join dimension rows (avoids joining every data row before GROUP BY).
    Page-1 total_count counts ut_subgroup_vals rows only (cheap dimension count).
    """
    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest("No matching time period(s) found", details={"time_period": time_period})

    SV = SubgroupVal(locale)

    data_filters = [Data.subgroup_val_nid.isnot(None), Data.subgroup_val_nid != 0]
    if timeperiod_nids:
        data_filters.append(Data.timeperiod_nid.in_(timeperiod_nids))
    data_stats = (
        dw_db.query(
            Data.subgroup_val_nid,
            func.count(Data.data_nid).label("total_data_rows"),
            func.count(func.distinct(Data.indicator_nid)).label("distinct_indicators"),
            func.count(func.distinct(Data.area_nid)).label("distinct_areas"),
        )
        .filter(*data_filters)
        .group_by(Data.subgroup_val_nid)
        .subquery()
    )

    total_col = func.coalesce(data_stats.c.total_data_rows, 0)
    dist_ind_col = func.coalesce(data_stats.c.distinct_indicators, 0)
    dist_area_col = func.coalesce(data_stats.c.distinct_areas, 0)
    search_map = {"sg_name": SV.subgroup_val}
    sort_map = {
        "sg_name": SV.subgroup_val,
        "total_data_rows": total_col,
        "distinct_indicators": dist_ind_col,
        "distinct_areas": dist_area_col,
    }

    q = (
        dw_db.query(
            SV.subgroup_val_nid,
            SV.subgroup_val_gid,
            SV.subgroup_val,
            total_col.label("total_data_rows"),
            dist_ind_col.label("distinct_indicators"),
            dist_area_col.label("distinct_areas"),
        )
        .outerjoin(data_stats, data_stats.c.subgroup_val_nid == SV.subgroup_val_nid)
        .order_by(total_col.desc())
    )
    q = _apply_search(q, search, search_by, search_map)
    if sort_field:
        q = _apply_sort(q, sort_field, sort_order, sort_map)

    if page_size is None:
        rows = q.all()
        return [
            {
                "sg_nid": r.subgroup_val_nid,
                "sg_gid": r.subgroup_val_gid,
                "sg_name": r.subgroup_val,
                "total_data_rows": r.total_data_rows,
                "distinct_indicators": r.distinct_indicators,
                "distinct_areas": r.distinct_areas,
            }
            for r in rows
        ], len(rows), False

    count_q = dw_db.query(func.count(SV.subgroup_val_nid))
    count_q = _apply_search(count_q, search, search_by, search_map)
    total = count_q.scalar() or 0

    offset = (page - 1) * page_size
    rows = q.offset(offset).limit(page_size).all()
    has_more = (offset + len(rows)) < total

    return [
        {
            "sg_nid": r.subgroup_val_nid,
            "sg_gid": r.subgroup_val_gid,
            "sg_name": r.subgroup_val,
            "total_data_rows": r.total_data_rows,
            "distinct_indicators": r.distinct_indicators,
            "distinct_areas": r.distinct_areas,
        }
        for r in rows
    ], total, has_more


# ---------------------------------------------------------------------------
# Group L — IC & Source Utilisation
# ---------------------------------------------------------------------------

def _source_data_stats_subquery(dw_db: Session, timeperiod_nids: list[int] | None = None):
    """One GROUP BY pass: utilisation metrics per source_nid."""
    filters = [Data.source_nid.isnot(None), Data.source_nid != 0]
    if timeperiod_nids:
        filters.append(Data.timeperiod_nid.in_(timeperiod_nids))
    return (
        dw_db.query(
            Data.source_nid.label("source_nid"),
            func.count(Data.data_nid).label("total_data_rows"),
            func.count(func.distinct(Data.iusnid)).label("distinct_ius"),
            func.count(func.distinct(Data.area_nid)).label("distinct_areas"),
            func.count(func.distinct(Data.timeperiod_nid)).label("distinct_time_periods"),
        )
        .filter(*filters)
        .group_by(Data.source_nid)
        .subquery()
    )


def _fetch_scoped_source_stats(
    dw_db: Session,
    source_nids: list[int],
    timeperiod_nids: list[int] | None = None,
) -> dict[int, dict[str, int]]:
    """Utilisation metrics for a page of sources only."""
    if not source_nids:
        return {}

    stats: dict[int, dict[str, int]] = {}
    for offset in range(0, len(source_nids), _SCOPED_STATS_BATCH):
        chunk = source_nids[offset: offset + _SCOPED_STATS_BATCH]
        filters = [
            Data.source_nid.in_(chunk),
            Data.source_nid.isnot(None),
            Data.source_nid != 0,
        ]
        if timeperiod_nids:
            filters.append(Data.timeperiod_nid.in_(timeperiod_nids))
        for row in (
            dw_db.query(
                Data.source_nid,
                func.count(Data.data_nid).label("total_data_rows"),
                func.count(func.distinct(Data.iusnid)).label("distinct_ius"),
                func.count(func.distinct(Data.area_nid)).label("distinct_areas"),
                func.count(func.distinct(Data.timeperiod_nid)).label("distinct_time_periods"),
            )
            .filter(*filters)
            .group_by(Data.source_nid)
            .all()
        ):
            stats[row.source_nid] = {
                "total_data_rows": row.total_data_rows,
                "distinct_ius": row.distinct_ius,
                "distinct_areas": row.distinct_areas,
                "distinct_time_periods": row.distinct_time_periods,
            }
    return stats


def _zero_source_stats() -> dict[str, int]:
    return {
        "total_data_rows": 0,
        "distinct_ius": 0,
        "distinct_areas": 0,
        "distinct_time_periods": 0,
    }


def _build_source_usage_rows(
    ic_rows,
    stats: dict[int, dict[str, int]],
    *,
    from_global_join: bool = False,
) -> list[dict]:
    out: list[dict] = []
    for r in ic_rows:
        if from_global_join:
            metrics = {
                "total_data_rows": r.total_data_rows,
                "distinct_ius": r.distinct_ius,
                "distinct_areas": r.distinct_areas,
                "distinct_time_periods": r.distinct_time_periods,
            }
        else:
            metrics = stats.get(r.ic_nid, _zero_source_stats())
        out.append({
            "src_nid": r.ic_nid,
            "src_gid": r.ic_gid,
            "src_name": r.ic_name,
            **metrics,
        })
    return out


def query_utilisation_source_usage(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    """
    Per-source utilisation.

    Default: paginate source IC rows (ic_type=SR) by name, then aggregate ut_data
    for the current page only. Metric sort fields use a single pre-aggregated stats
    subquery for global ranking (full ut_data pass).
    """
    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest("No matching time period(s) found", details={"time_period": time_period})

    IC = IndicatorClassification(locale)
    search_map = {"src_name": IC.ic_name}
    use_global_metric_sort = sort_field in _SOURCE_USAGE_METRIC_SORT_FIELDS

    if use_global_metric_sort:
        data_stats = _source_data_stats_subquery(dw_db, timeperiod_nids or None)
        total_col = func.coalesce(data_stats.c.total_data_rows, 0)
        dist_ius_col = func.coalesce(data_stats.c.distinct_ius, 0)
        dist_area_col = func.coalesce(data_stats.c.distinct_areas, 0)
        dist_tp_col = func.coalesce(data_stats.c.distinct_time_periods, 0)
        sort_map = {
            "src_name": IC.ic_name,
            "total_data_rows": total_col,
            "distinct_ius": dist_ius_col,
            "distinct_areas": dist_area_col,
            "distinct_time_periods": dist_tp_col,
        }

        q = (
            dw_db.query(
                IC.ic_nid,
                IC.ic_gid,
                IC.ic_name,
                total_col.label("total_data_rows"),
                dist_ius_col.label("distinct_ius"),
                dist_area_col.label("distinct_areas"),
                dist_tp_col.label("distinct_time_periods"),
            )
            .outerjoin(data_stats, data_stats.c.source_nid == IC.ic_nid)
            .filter(IC.ic_type == "SR")
        )
        q = _apply_search(q, search, search_by, search_map)
        q = _apply_sort(q, sort_field, sort_order, sort_map)

        count_q = dw_db.query(func.count(IC.ic_nid)).filter(IC.ic_type == "SR")
        count_q = _apply_search(count_q, search, search_by, search_map)
        rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
        return _build_source_usage_rows(rows, {}, from_global_join=True), total, has_more

    src_sort_map = {"src_name": IC.ic_name}
    q = (
        dw_db.query(
            IC.ic_nid,
            IC.ic_gid,
            IC.ic_name,
        )
        .filter(IC.ic_type == "SR")
        .order_by(IC.ic_name.asc())
    )
    q = _apply_search(q, search, search_by, search_map)
    if sort_field:
        q = _apply_sort(q, sort_field, sort_order, src_sort_map)

    count_q = dw_db.query(func.count(IC.ic_nid)).filter(IC.ic_type == "SR")
    count_q = _apply_search(count_q, search, search_by, search_map)
    ic_rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
    source_nids = [r.ic_nid for r in ic_rows]
    stats = _fetch_scoped_source_stats(dw_db, source_nids, timeperiod_nids or None)
    return _build_source_usage_rows(ic_rows, stats), total, has_more


def _ic_coverage_stats_subquery(dw_db: Session, timeperiod_nids: list[int] | None = None):
    """One GROUP BY pass: mapped IUS + ut_data metrics per ic_nid."""
    IC_IUS = IcIus
    q = (
        dw_db.query(
            IC_IUS.ic_nid.label("ic_nid"),
            func.count(func.distinct(IC_IUS.iusnid)).label("mapped_ius_count"),
            func.count(func.distinct(Data.data_nid)).label("total_data_rows"),
            func.count(func.distinct(Data.area_nid)).label("distinct_areas"),
        )
        .outerjoin(Data, Data.iusnid == IC_IUS.iusnid)
        .filter(IC_IUS.ic_nid.isnot(None))
    )
    if timeperiod_nids:
        q = q.filter(or_(Data.timeperiod_nid.in_(timeperiod_nids), Data.data_nid.is_(None)))
    return q.group_by(IC_IUS.ic_nid).subquery()


def _fetch_scoped_ic_mapped_ius_counts(
    dw_db: Session,
    ic_nids: list[int],
) -> dict[int, int]:
    """mapped_ius_count for a page of IC nodes (ut_ic_ius only)."""
    if not ic_nids:
        return {}

    IC_IUS = IcIus
    counts: dict[int, int] = {}
    for offset in range(0, len(ic_nids), _SCOPED_STATS_BATCH):
        chunk = ic_nids[offset: offset + _SCOPED_STATS_BATCH]
        for row in (
            dw_db.query(
                IC_IUS.ic_nid,
                func.count(func.distinct(IC_IUS.iusnid)).label("mapped_ius_count"),
            )
            .filter(IC_IUS.ic_nid.in_(chunk), IC_IUS.ic_nid.isnot(None))
            .group_by(IC_IUS.ic_nid)
            .all()
        ):
            counts[row.ic_nid] = row.mapped_ius_count
    return counts


def _fetch_scoped_ic_data_stats(
    dw_db: Session,
    ic_nids: list[int],
    timeperiod_nids: list[int] | None = None,
) -> dict[int, dict[str, int]]:
    """total_data_rows and distinct_areas for a page of IC nodes only."""
    if not ic_nids:
        return {}

    IC_IUS = IcIus
    stats: dict[int, dict[str, int]] = {}
    for offset in range(0, len(ic_nids), _SCOPED_STATS_BATCH):
        chunk = ic_nids[offset: offset + _SCOPED_STATS_BATCH]
        q = (
            dw_db.query(
                IC_IUS.ic_nid,
                func.count(func.distinct(Data.data_nid)).label("total_data_rows"),
                func.count(func.distinct(Data.area_nid)).label("distinct_areas"),
            )
            .outerjoin(Data, Data.iusnid == IC_IUS.iusnid)
            .filter(IC_IUS.ic_nid.in_(chunk), IC_IUS.ic_nid.isnot(None))
        )
        if timeperiod_nids:
            q = q.filter(or_(Data.timeperiod_nid.in_(timeperiod_nids), Data.data_nid.is_(None)))
        for row in q.group_by(IC_IUS.ic_nid).all():
            stats[row.ic_nid] = {
                "total_data_rows": row.total_data_rows,
                "distinct_areas": row.distinct_areas,
            }
    return stats


def _zero_ic_coverage_stats() -> dict[str, int]:
    return {
        "mapped_ius_count": 0,
        "total_data_rows": 0,
        "distinct_areas": 0,
    }


def _build_ic_coverage_rows(
    ic_rows,
    mapped_counts: dict[int, int],
    data_stats: dict[int, dict[str, int]],
    *,
    from_global_join: bool = False,
) -> list[dict]:
    out: list[dict] = []
    for r in ic_rows:
        if from_global_join:
            metrics = {
                "mapped_ius_count": r.mapped_ius_count,
                "total_data_rows": r.total_data_rows,
                "distinct_areas": r.distinct_areas,
            }
        else:
            base = _zero_ic_coverage_stats()
            base["mapped_ius_count"] = mapped_counts.get(r.ic_nid, 0)
            data = data_stats.get(r.ic_nid, {})
            base["total_data_rows"] = data.get("total_data_rows", 0)
            base["distinct_areas"] = data.get("distinct_areas", 0)
            metrics = base
        out.append({
            "ic_nid": r.ic_nid,
            "ic_gid": r.ic_gid,
            "ic_name": r.ic_name,
            "ic_type": r.ic_type,
            **metrics,
        })
    return out


def query_utilisation_ic_coverage(
    dw_db: Session, locale: str, page: int, page_size: Optional[int],
    search: Optional[str] = None, search_by: Optional[str] = None,
    sort_field: Optional[str] = None, sort_order: str = "asc",
    time_period: Optional[str] = None,
    **_: Any,
) -> tuple[list[dict], int]:
    """
    Per-IC node coverage.

    Default: paginate IC rows by name, then aggregate ut_ic_ius / ut_data for the
    current page only. Metric sort fields use a single pre-aggregated stats
    subquery for global ranking (full ut_ic_ius + ut_data pass).
    """
    timeperiod_nids = _resolve_timeperiod_nids(dw_db, time_period)
    if time_period and str(time_period).strip() and not timeperiod_nids:
        raise BadRequest("No matching time period(s) found", details={"time_period": time_period})

    IC = IndicatorClassification(locale)
    search_map = {"ic_name": IC.ic_name, "ic_type": IC.ic_type}
    use_global_metric_sort = sort_field in _IC_COVERAGE_METRIC_SORT_FIELDS

    if use_global_metric_sort:
        ic_stats = _ic_coverage_stats_subquery(dw_db, timeperiod_nids or None)
        mapped_col = func.coalesce(ic_stats.c.mapped_ius_count, 0)
        total_col = func.coalesce(ic_stats.c.total_data_rows, 0)
        dist_area_col = func.coalesce(ic_stats.c.distinct_areas, 0)
        sort_map = {
            "ic_name": IC.ic_name,
            "ic_type": IC.ic_type,
            "total_data_rows": total_col,
            "mapped_ius_count": mapped_col,
            "distinct_areas": dist_area_col,
        }

        q = (
            dw_db.query(
                IC.ic_nid,
                IC.ic_gid,
                IC.ic_name,
                IC.ic_type,
                mapped_col.label("mapped_ius_count"),
                total_col.label("total_data_rows"),
                dist_area_col.label("distinct_areas"),
            )
            .outerjoin(ic_stats, ic_stats.c.ic_nid == IC.ic_nid)
        )
        q = _apply_search(q, search, search_by, search_map)
        q = _apply_sort(q, sort_field, sort_order, sort_map)

        count_q = dw_db.query(func.count(IC.ic_nid))
        count_q = _apply_search(count_q, search, search_by, search_map)
        rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
        return _build_ic_coverage_rows(
            rows, {}, {}, from_global_join=True
        ), total, has_more

    ic_sort_map = {"ic_name": IC.ic_name, "ic_type": IC.ic_type}
    q = (
        dw_db.query(
            IC.ic_nid,
            IC.ic_gid,
            IC.ic_name,
            IC.ic_type,
        )
        .order_by(IC.ic_name.asc())
    )
    q = _apply_search(q, search, search_by, search_map)
    if sort_field:
        q = _apply_sort(q, sort_field, sort_order, ic_sort_map)

    count_q = dw_db.query(func.count(IC.ic_nid))
    count_q = _apply_search(count_q, search, search_by, search_map)
    ic_rows, total, has_more = _paginate_with_cheap_count(q, count_q, page, page_size)
    ic_nids = [r.ic_nid for r in ic_rows]
    mapped_counts = _fetch_scoped_ic_mapped_ius_counts(dw_db, ic_nids)
    data_stats = _fetch_scoped_ic_data_stats(dw_db, ic_nids, timeperiod_nids or None)
    return _build_ic_coverage_rows(ic_rows, mapped_counts, data_stats), total, has_more


# ---------------------------------------------------------------------------
# Group M — Published Data
# ---------------------------------------------------------------------------

def query_data_published(
    dw_db: Session,
    locale: str,
    page: int,
    page_size: Optional[int],
    *,
    filters: PublishedDataFilters,
    op_filters: Optional[list[OperatorFilter]] = None,
    aggregate_by: Optional[str] = None,
    agg: str = "count",
    **kwargs: Any,
) -> tuple[list[dict], int]:
    """Published data report query (full export — no mandatory anchor)."""
    del kwargs
    return query_published_data(
        dw_db,
        locale,
        filters=filters,
        op_filters=op_filters,
        page=page,
        page_size=page_size,
        aggregate_by=aggregate_by,
        agg=agg,
        require_anchor=False,
    )
