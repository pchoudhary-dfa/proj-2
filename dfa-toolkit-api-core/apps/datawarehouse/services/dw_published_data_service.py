"""
Published data report — enriched ut_data query with filters and aggregation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Query, Session

from apps.datawarehouse.utils.unit_data_format import enrich_published_data_rows
from apps.datawarehouse.models.datawarehouse import (
    Area,
    Data,
    Footnote,
    IcIus,
    Indicator,
    IndicatorClassification,
    IndicatorUnitSubgroup,
    SubgroupVal,
    TimePeriod,
    Unit,
)
from apps.datawarehouse.services.area import _load_latlong_by_area_nids
from apps.datawarehouse.services.data_service import (
    DataService,
    _normalize_list_param,
    _parse_ius_gid,
)
from apps.shared.exceptions import BadRequest
from apps.shared.utils.validators import resolve_identifier_to_nid

# ---------------------------------------------------------------------------
# Column definitions
# ---------------------------------------------------------------------------

PUBLISHED_DATA_COLUMN_DEFS = [
    "dt_nid",
    "dt_value",
    "dt_text_value",
    "dt_is_mrd",
    "dt_is_planned_value",
    "dt_is_textual",
    "i_nid",
    "i_gid",
    "i_name",
    "u_nid",
    "u_gid",
    "u_name",
    "sg_nid",
    "sg_gid",
    "sg_name",
    "ar_nid",
    "ar_id",
    "ar_gid",
    "ar_name",
    "ar_level",
    "ar_latitude",
    "ar_longitude",
    "tp_nid",
    "tp_timeperiod",
    "src_nid",
    "src_gid",
    "src_name",
    "fn_nid",
    "fn_gid",
    "fn_text",
]

PUBLISHED_DATA_AGG_COLUMN_DEFS = [
    "i_nid",
    "i_gid",
    "i_name",
    "u_nid",
    "u_gid",
    "u_name",
    "sg_nid",
    "sg_gid",
    "sg_name",
    "ar_nid",
    "ar_id",
    "ar_gid",
    "ar_name",
    "ar_level",
    "ar_latitude",
    "ar_longitude",
    "tp_nid",
    "tp_timeperiod",
    "src_nid",
    "src_gid",
    "src_name",
    "dt_is_mrd",
    "dt_is_planned_value",
    "dt_value_count",
    "dt_value_sum",
    "dt_value_avg",
    "dt_value_min",
    "dt_value_max",
]

# ---------------------------------------------------------------------------
# Operator filter allowlists
# ---------------------------------------------------------------------------

FILTER_FIELD_OPS: dict[str, frozenset[str]] = {
    "data_value": frozenset({"eq", "neq", "gt", "gte", "lt", "lte"}),
    "i_name": frozenset({"eq", "like", "in"}),
    "u_name": frozenset({"eq", "like", "in"}),
    "sg_name": frozenset({"eq", "like", "in"}),
    "ar_name": frozenset({"eq", "like", "in"}),
    "area_level": frozenset({"eq", "gt", "gte", "lt", "lte"}),
    "tp_timeperiod": frozenset({"eq", "neq", "gt", "gte", "lt", "lte", "in"}),
    "src_name": frozenset({"eq", "like", "in"}),
    "dt_is_mrd": frozenset({"eq"}),
    "dt_is_planned_value": frozenset({"eq"}),
    "dt_is_textual": frozenset({"eq"}),
}

ANCHOR_FILTER_FIELDS = frozenset({"i_name", "i_gid", "ar_name", "ar_gid", "src_name", "src_gid"})

PUBLISHED_DATA_SEARCH_BY_FIELDS: tuple[str, ...] = (
    "i_name",
    "sg_name",
    "ar_name",
    "tp_timeperiod",
    "src_name",
)

PUBLISHED_DATA_SORT_FIELDS: tuple[str, ...] = (
    "i_name",
    "sg_name",
    "ar_name",
    "tp_timeperiod",
    "src_name",
    "dt_value",
    "dt_nid",
)

AGGREGATE_DIMENSIONS: dict[str, list[str]] = {
    "indicator": ["i_nid", "i_gid", "i_name"],
    "unit": ["u_nid", "u_gid", "u_name"],
    "subgroup": ["sg_nid", "sg_gid", "sg_name"],
    "area": ["ar_nid", "ar_id", "ar_gid", "ar_name", "ar_level"],
    "area_level": ["ar_level"],
    "time_period": ["tp_nid", "tp_timeperiod"],
    "source": ["src_nid", "src_gid", "src_name"],
    "dt_is_mrd": ["dt_is_mrd"],
    "dt_is_planned_value": ["dt_is_planned_value"],
}

AGG_FUNCTIONS = frozenset({"count", "sum", "avg", "min", "max"})


class DefaultSubgroupMode(str, Enum):
    """Tri-state isdefaultsubgroup for published data when indicator is set without subgroup/ius."""

    DEFAULT = "true"
    NON_DEFAULT = "false"
    ALL = "all"


def parse_default_subgroup_mode(value: str | None) -> DefaultSubgroupMode:
    if value is None:
        return DefaultSubgroupMode.DEFAULT
    normalized = value.strip().lower()
    try:
        return DefaultSubgroupMode(normalized)
    except ValueError:
        raise BadRequest(
            "isdefaultsubgroup must be true, false, or all",
            details={"isdefaultsubgroup": value},
        )


def _append_resolved_ius_rows(
    ius_rows: list[Any],
    ius_nids: list[int],
    unit_nids: list[int],
    subgroup_val_nids: list[int],
) -> tuple[list[int], list[int], list[int]]:
    for ius_row in ius_rows:
        ius_nids.append(ius_row.iusnid)
        if ius_row.unit_nid and ius_row.unit_nid not in unit_nids:
            unit_nids.append(ius_row.unit_nid)
        if ius_row.subgroup_val_nid and ius_row.subgroup_val_nid not in subgroup_val_nids:
            subgroup_val_nids.append(ius_row.subgroup_val_nid)
    return (
        list(dict.fromkeys(ius_nids)),
        list(dict.fromkeys(unit_nids)),
        list(dict.fromkeys(subgroup_val_nids)),
    )


@dataclass
class OperatorFilter:
    field: str
    operator: str
    value: str


@dataclass
class PublishedDataFilters:
    indicator_nids: list[int] = field(default_factory=list)
    unit_nids: list[int] = field(default_factory=list)
    subgroup_val_nids: list[int] = field(default_factory=list)
    ius_nids: list[int] = field(default_factory=list)
    area_nids: list[int] = field(default_factory=list)
    # When True, apply area_nid filter even if area_nids is empty (ACL empty ∩ → no rows).
    area_nids_enforced: bool = False
    area_param_provided: bool = False
    area_has_unresolved: bool = False
    timeperiod_nids: list[int] = field(default_factory=list)
    source_nids: list[int] = field(default_factory=list)
    ic_nids: list[int] = field(default_factory=list)
    area_level: Optional[int] = None
    ismrd: Optional[bool] = None
    isplannedvalue: Optional[bool] = None
    istextualdata: Optional[bool] = None


def _int_or_none(value: str) -> Optional[int]:
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _parse_bool(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in ("true", "1", "yes"):
        return True
    if lowered in ("false", "0", "no"):
        return False
    raise BadRequest(f"Invalid boolean value: {value!r}")


def parse_operator_filters(filter_params: list[str]) -> list[OperatorFilter]:
    """Parse repeatable filter=field:operator:value params."""
    parsed: list[OperatorFilter] = []
    for raw in filter_params:
        parts = raw.split(":", 2)
        if len(parts) != 3:
            raise BadRequest(
                f"Invalid filter syntax: {raw!r}. Expected field:operator:value",
                details={"filter": raw},
            )
        fld, op, val = parts[0].strip(), parts[1].strip(), parts[2]
        if fld not in FILTER_FIELD_OPS:
            raise BadRequest(
                f"Unknown filter field: {fld!r}",
                details={"filter": raw, "field": fld},
            )
        if op not in FILTER_FIELD_OPS[fld]:
            raise BadRequest(
                f"Operator {op!r} is not supported for field {fld!r}",
                details={"filter": raw, "field": fld, "operator": op},
            )
        parsed.append(OperatorFilter(field=fld, operator=op, value=val))
    return parsed


def _has_anchor(
    filters: PublishedDataFilters,
    op_filters: list[OperatorFilter],
) -> bool:
    if filters.indicator_nids or filters.ic_nids or filters.area_nids or filters.source_nids:
        return True
    for op in op_filters:
        if op.field in ANCHOR_FILTER_FIELDS and op.operator in ("eq", "in"):
            return True
    return False


def validate_mandatory_anchor(
    filters: PublishedDataFilters,
    op_filters: list[OperatorFilter],
) -> None:
    if not _has_anchor(filters, op_filters):
        raise BadRequest(
            "At least one anchor filter is required: indicator, ic, area, or source "
            "(directly or via filter= on i_name/i_gid, ar_name/ar_gid, src_name/src_gid with eq/in)",
            error_code="MISSING_ANCHOR_FILTER",
        )


def resolve_published_filters(
    dw_db: Session,
    locale: str,
    *,
    indicator: Optional[str] = None,
    unit: Optional[str] = None,
    subgroup: Optional[str] = None,
    area: Optional[str] = None,
    area_level: Optional[int] = None,
    time_period: Optional[str] = None,
    source: Optional[str] = None,
    ic: Optional[str] = None,
    ius: Optional[str] = None,
    ismrd: Optional[bool] = None,
    isplannedvalue: Optional[bool] = None,
    istextualdata: Optional[bool] = None,
    isdefaultsubgroup: DefaultSubgroupMode = DefaultSubgroupMode.DEFAULT,
) -> PublishedDataFilters:
    """Resolve query param strings to NID lists."""
    svc = DataService()
    IndLocale = Indicator(locale)
    UnitLocale = Unit(locale)
    SvLocale = SubgroupVal(locale)
    AreaLocale = Area(locale)
    IcLocale = IndicatorClassification(locale)

    indicator_nids = svc._resolve_identifier_values_to_nids(
        _normalize_list_param(indicator),
        lambda identifier: svc._indicator_gid_to_nid(dw_db, IndLocale, identifier),
    )
    unit_nids = svc._resolve_identifier_values_to_nids(
        _normalize_list_param(unit),
        lambda identifier: svc._unit_gid_to_nid(dw_db, UnitLocale, identifier),
    )
    subgroup_val_nids = svc._resolve_identifier_values_to_nids(
        _normalize_list_param(subgroup),
        lambda identifier: svc._subgroup_gid_to_nid(dw_db, SvLocale, identifier),
    )
    source_nids = svc._resolve_identifier_values_to_nids(
        _normalize_list_param(source),
        lambda identifier: svc._ic_gid_to_nid(dw_db, IcLocale, identifier),
    )
    ic_nids = svc._resolve_identifier_values_to_nids(
        _normalize_list_param(ic),
        lambda identifier: svc._ic_gid_to_nid(dw_db, IcLocale, identifier),
    )

    area_tokens = _normalize_list_param(area)
    area_param_provided = bool(area_tokens)
    area_has_unresolved = False
    area_nids: list[int] = []
    for identifier in area_tokens:
        nid = _resolve_area_identifier_to_nid(dw_db, svc, AreaLocale, identifier)
        if nid is None:
            area_has_unresolved = True
        else:
            area_nids.append(nid)
    area_nids = list(dict.fromkeys(area_nids))

    timeperiod_nids: list[int] = []
    for tp in _normalize_list_param(time_period):
        nid = svc._resolve_timeperiod_identifier(dw_db, tp)
        if nid is not None:
            timeperiod_nids.append(nid)
    timeperiod_nids = list(dict.fromkeys(timeperiod_nids))

    ius_identifiers = _normalize_list_param(ius)
    ius_nids = [int(v) for v in ius_identifiers if v.isdigit()]
    ius_gid_values = [v for v in ius_identifiers if not v.isdigit()]
    for i_g, u_g, s_g in _parse_ius_gid(ius_gid_values):
        ius_row = (
            dw_db.query(IndicatorUnitSubgroup)
            .join(IndLocale, IndicatorUnitSubgroup.indicator_nid == IndLocale.indicator_nid)
            .join(UnitLocale, IndicatorUnitSubgroup.unit_nid == UnitLocale.unit_nid)
            .join(SvLocale, IndicatorUnitSubgroup.subgroup_val_nid == SvLocale.subgroup_val_nid)
            .filter(
                IndLocale.indicator_gid == i_g,
                UnitLocale.unit_gid == u_g,
                SvLocale.subgroup_val_gid == s_g,
            )
            .first()
        )
        if ius_row:
            ius_nids.append(ius_row.iusnid)
    ius_nids = list(dict.fromkeys(ius_nids))

    if ic_nids:
        ic_ius_nids = [
            row[0]
            for row in dw_db.query(IcIus.iusnid)
            .filter(IcIus.ic_nid.in_(ic_nids), IcIus.iusnid.isnot(None))
            .distinct()
            .all()
        ]
        if ius_nids:
            ius_nids = list(dict.fromkeys(n for n in ius_nids if n in ic_ius_nids))
        else:
            ius_nids = ic_ius_nids

    has_explicit_subgroup_or_ius = bool(
        _normalize_list_param(subgroup) or _normalize_list_param(ius)
    )
    if bool(indicator_nids) and not has_explicit_subgroup_or_ius:
        if isdefaultsubgroup == DefaultSubgroupMode.DEFAULT:
            ius_q = dw_db.query(IndicatorUnitSubgroup).filter(
                IndicatorUnitSubgroup.indicator_nid.in_(indicator_nids),
                IndicatorUnitSubgroup.isdefaultsubgroup.is_(True),
            )
        elif isdefaultsubgroup == DefaultSubgroupMode.NON_DEFAULT:
            ius_q = dw_db.query(IndicatorUnitSubgroup).filter(
                IndicatorUnitSubgroup.indicator_nid.in_(indicator_nids),
                IndicatorUnitSubgroup.isdefaultsubgroup.is_(False),
            )
        else:
            ius_q = None
        if ius_q is not None:
            if unit_nids:
                ius_q = ius_q.filter(IndicatorUnitSubgroup.unit_nid.in_(unit_nids))
            ius_nids_before_resolution = list(ius_nids)
            resolved_ius_rows = ius_q.all()
            ius_nids, unit_nids, subgroup_val_nids = _append_resolved_ius_rows(
                resolved_ius_rows,
                ius_nids,
                unit_nids,
                subgroup_val_nids,
            )
            if not resolved_ius_rows and not ius_nids_before_resolution:
                # No matching default/non-default IUS for these indicators —
                # fall back to all subgroups (no IUS filter) so the caller
                # still receives data rather than an empty set.
                pass

    return PublishedDataFilters(
        indicator_nids=indicator_nids,
        unit_nids=unit_nids,
        subgroup_val_nids=subgroup_val_nids,
        ius_nids=ius_nids,
        area_nids=area_nids,
        area_param_provided=area_param_provided,
        area_has_unresolved=area_has_unresolved,
        timeperiod_nids=timeperiod_nids,
        source_nids=source_nids,
        ic_nids=ic_nids,
        area_level=area_level,
        ismrd=ismrd,
        isplannedvalue=isplannedvalue,
        istextualdata=istextualdata,
    )


def _area_gid_to_nid(dw_db: Session, model: Any, gid: str) -> Optional[int]:
    row = dw_db.query(model.area_nid).filter(model.area_gid == gid).first()
    return int(row[0]) if row else None


def _resolve_area_identifier_to_nid(
    dw_db: Session,
    svc: DataService,
    area_model: Any,
    identifier: str,
) -> Optional[int]:
    """Resolve area token to area_nid; None when not found in the warehouse."""
    nid = resolve_identifier_to_nid(
        identifier,
        lambda gid, _m=area_model: _area_gid_to_nid(dw_db, _m, gid),
    )
    if nid is None and not identifier.isdigit():
        nid = svc._area_id_to_nid(dw_db, area_model, identifier)
    if nid is None:
        return None
    row = dw_db.query(area_model.area_nid).filter(area_model.area_nid == nid).first()
    return int(row[0]) if row else None


def _join_models(locale: str) -> tuple[Any, ...]:
    Ind = Indicator(locale)
    UnitM = Unit(locale)
    Sv = SubgroupVal(locale)
    AreaM = Area(locale)
    Ic = IndicatorClassification(locale)
    Fn = Footnote(locale)
    return Ind, UnitM, Sv, AreaM, Ic, Fn


def _base_query(dw_db: Session, locale: str) -> tuple[Query, Any, Any, Any, Any, Any, Any, Any]:
    Ind, UnitM, Sv, AreaM, Ic, Fn = _join_models(locale)
    q = (
        dw_db.query(Data, Ind, UnitM, Sv, AreaM, TimePeriod, Ic, Fn)
        .join(Ind, Data.indicator_nid == Ind.indicator_nid)
        .join(UnitM, Data.unit_nid == UnitM.unit_nid)
        .join(Sv, Data.subgroup_val_nid == Sv.subgroup_val_nid)
        .join(AreaM, Data.area_nid == AreaM.area_nid)
        .outerjoin(TimePeriod, Data.timeperiod_nid == TimePeriod.timeperiod_nid)
        .outerjoin(Ic, Data.source_nid == Ic.ic_nid)
        .outerjoin(Fn, Data.footnote_nid == Fn.footnote_nid)
    )
    return q, Ind, UnitM, Sv, AreaM, Ic, TimePeriod, Fn


def _apply_simple_filters(
    q: Query,
    filters: PublishedDataFilters,
    Ind: Any,
    UnitM: Any,
    Sv: Any,
    AreaM: Any,
) -> Query:
    if filters.indicator_nids:
        q = q.filter(Data.indicator_nid.in_(filters.indicator_nids))
    if filters.unit_nids:
        q = q.filter(Data.unit_nid.in_(filters.unit_nids))
    if filters.subgroup_val_nids:
        q = q.filter(Data.subgroup_val_nid.in_(filters.subgroup_val_nids))
    if filters.ius_nids:
        q = q.filter(Data.iusnid.in_(filters.ius_nids))
    elif filters.ic_nids:
        # IC anchor provided but no IUS mappings — return empty result set
        q = q.filter(Data.iusnid == -1)
    if filters.area_nids_enforced:
        nids = filters.area_nids if filters.area_nids else [-1]
        q = q.filter(Data.area_nid.in_(nids))
    elif filters.area_nids:
        q = q.filter(Data.area_nid.in_(filters.area_nids))
    if filters.timeperiod_nids:
        q = q.filter(Data.timeperiod_nid.in_(filters.timeperiod_nids))
    if filters.source_nids:
        q = q.filter(Data.source_nid.in_(filters.source_nids))
    if filters.area_level is not None:
        q = q.filter(AreaM.area_level == filters.area_level)
    if filters.ismrd is not None:
        q = q.filter(Data.ismrd == filters.ismrd)
    if filters.isplannedvalue is not None:
        q = q.filter(Data.isplannedvalue == filters.isplannedvalue)
    if filters.istextualdata is not None:
        q = q.filter(Data.istextualdata == filters.istextualdata)
    return q


def _field_column(
    field: str,
    Ind: Any,
    UnitM: Any,
    Sv: Any,
    AreaM: Any,
    Tp: Any,
    Ic: Any,
) -> Any:
    mapping = {
        "data_value": Data.data_value,
        "i_name": Ind.indicator_name,
        "u_name": UnitM.unit_name,
        "sg_name": Sv.subgroup_val,
        "ar_name": AreaM.area_name,
        "area_level": AreaM.area_level,
        "tp_timeperiod": Tp.timeperiod,
        "src_name": Ic.ic_name,
        "dt_is_mrd": Data.ismrd,
        "dt_is_planned_value": Data.isplannedvalue,
        "dt_is_textual": Data.istextualdata,
    }
    return mapping[field]


def _apply_operator_filter(
    q: Query,
    op: OperatorFilter,
    Ind: Any,
    UnitM: Any,
    Sv: Any,
    AreaM: Any,
    Tp: Any,
    Ic: Any,
) -> Query:
    col = _field_column(op.field, Ind, UnitM, Sv, AreaM, Tp, Ic)

    if op.operator == "eq":
        if op.field in ("dt_is_mrd", "dt_is_planned_value", "dt_is_textual"):
            return q.filter(col == _parse_bool(op.value))
        if op.field == "data_value":
            return q.filter(col == float(op.value))
        if op.field == "area_level":
            return q.filter(col == int(op.value))
        return q.filter(col == op.value)

    if op.operator == "neq":
        if op.field == "data_value":
            return q.filter(col != float(op.value))
        if op.field == "tp_timeperiod":
            return q.filter(col != op.value)
        raise BadRequest(f"Operator neq not supported for {op.field!r}")

    if op.operator in ("gt", "gte", "lt", "lte"):
        val: Any = float(op.value) if op.field == "data_value" else (
            int(op.value) if op.field == "area_level" else op.value
        )
        ops = {"gt": col > val, "gte": col >= val, "lt": col < val, "lte": col <= val}
        return q.filter(ops[op.operator])

    if op.operator == "like":
        return q.filter(col.like(f"%{op.value}%"))

    if op.operator == "in":
        parts = [p.strip() for p in op.value.split(",") if p.strip()]
        if op.field == "data_value":
            return q.filter(col.in_([float(p) for p in parts]))
        if op.field == "area_level":
            return q.filter(col.in_([int(p) for p in parts]))
        return q.filter(col.in_(parts))

    raise BadRequest(f"Unsupported operator: {op.operator!r}")


def _row_to_dict(
    data: Data,
    ind: Any,
    unit: Any,
    sv: Any,
    area: Any,
    tp: Any,
    ic: Any,
    fn: Any,
) -> dict[str, Any]:
    return {
        "dt_nid": data.data_nid,
        "dt_value": data.data_value,
        "dt_text_value": data.textual_data_value,
        "dt_is_mrd": bool(data.ismrd),
        "dt_is_planned_value": bool(data.isplannedvalue),
        "dt_is_textual": bool(data.istextualdata),
        "i_nid": int(ind.indicator_nid) if ind and ind.indicator_nid is not None else None,
        "i_gid": getattr(ind, "indicator_gid", None) or "",
        "i_name": ind.indicator_name if ind else "",
        "u_nid": int(unit.unit_nid) if unit and unit.unit_nid is not None else None,
        "u_gid": getattr(unit, "unit_gid", None) or "",
        "u_name": unit.unit_name if unit else "",
        "sg_nid": int(sv.subgroup_val_nid) if sv and sv.subgroup_val_nid is not None else None,
        "sg_gid": getattr(sv, "subgroup_val_gid", None) or "",
        "sg_name": sv.subgroup_val if sv else "",
        "ar_nid": int(area.area_nid) if area and area.area_nid is not None else None,
        "ar_id": getattr(area, "area_id", None) or "",
        "ar_gid": getattr(area, "area_gid", None) or "",
        "ar_name": area.area_name if area else "",
        "ar_level": int(area.area_level) if area and area.area_level is not None else None,
        "tp_nid": int(tp.timeperiod_nid) if tp and tp.timeperiod_nid is not None else None,
        "tp_timeperiod": tp.timeperiod if tp else "",
        "src_nid": int(ic.ic_nid) if ic and ic.ic_nid is not None else None,
        "src_gid": getattr(ic, "ic_gid", None) or "",
        "src_name": ic.ic_name if ic else "",
        "fn_nid": int(fn.footnote_nid) if fn and fn.footnote_nid is not None else None,
        "fn_gid": getattr(fn, "footnote_gid", None) or "",
        "fn_text": fn.footnote if fn else "",
    }


def _enrich_rows_with_area_latlong(dw_db: Session, rows: list[dict]) -> None:
    """Attach ar_latitude / ar_longitude from ut_area_latlong (latest id per area_nid)."""
    if not rows:
        return
    nids = list({int(r["ar_nid"]) for r in rows if r.get("ar_nid") is not None})
    if not nids:
        return

    by_nid = _load_latlong_by_area_nids(dw_db, nids)
    for r in rows:
        nid = r.get("ar_nid")
        if nid is None:
            continue
        ll = by_nid.get(int(nid)) or {}
        r["ar_latitude"] = ll.get("area_lat")
        r["ar_longitude"] = ll.get("area_long")


def _get_search_col(
    search_by: str,
    Ind: Any,
    UnitM: Any,
    Sv: Any,
    AreaM: Any,
    Tp: Any,
    Ic: Any,
) -> Any:
    mapping: dict[str, Any] = {
        "i_name": Ind.indicator_name,
        "sg_name": Sv.subgroup_val,
        "ar_name": AreaM.area_name,
        "tp_timeperiod": Tp.timeperiod,
        "src_name": Ic.ic_name,
    }
    if search_by not in mapping:
        raise BadRequest(
            f"Unknown search_by field: {search_by!r}. Allowed: {', '.join(PUBLISHED_DATA_SEARCH_BY_FIELDS)}",
            details={"search_by": search_by},
        )
    return mapping[search_by]


def _get_sort_col(
    sort: Optional[str],
    Ind: Any,
    UnitM: Any,
    Sv: Any,
    AreaM: Any,
    Tp: Any,
    Ic: Any,
) -> Any:
    if sort is None:
        return Ind.indicator_name
    mapping: dict[str, Any] = {
        "i_name": Ind.indicator_name,
        "sg_name": Sv.subgroup_val,
        "ar_name": AreaM.area_name,
        "tp_timeperiod": Tp.timeperiod,
        "src_name": Ic.ic_name,
        "dt_value": Data.data_value,
        "dt_nid": Data.data_nid,
    }
    if sort not in mapping:
        raise BadRequest(
            f"Unknown sort field: {sort!r}. Allowed: {', '.join(PUBLISHED_DATA_SORT_FIELDS)}",
            details={"sort": sort},
        )
    return mapping[sort]


def _parse_aggregate_by(aggregate_by: str) -> list[str]:
    dims = [d.strip() for d in aggregate_by.split(",") if d.strip()]
    unknown = [d for d in dims if d not in AGGREGATE_DIMENSIONS]
    if unknown:
        raise BadRequest(
            f"Unknown aggregate_by dimension(s): {', '.join(unknown)}",
            details={"aggregate_by": unknown},
        )
    if not dims:
        raise BadRequest("aggregate_by must contain at least one dimension")
    return dims


def _parse_agg_functions(agg: str) -> list[str]:
    funcs = [f.strip() for f in agg.split(",") if f.strip()]
    unknown = [f for f in funcs if f not in AGG_FUNCTIONS]
    if unknown:
        raise BadRequest(
            f"Unknown agg function(s): {', '.join(unknown)}",
            details={"agg": unknown},
        )
    return funcs or ["count"]


def _agg_select_columns(
    dims: list[str],
    agg_funcs: list[str],
    Ind: Any,
    UnitM: Any,
    Sv: Any,
    AreaM: Any,
    Tp: Any,
    Ic: Any,
) -> tuple[list[Any], list[Any], list[str]]:
    """Return (select_exprs, group_by_cols, output_keys)."""
    dim_col_map: dict[str, tuple[Any, str]] = {
        "i_nid": (Ind.indicator_nid, "i_nid"),
        "i_gid": (Ind.indicator_gid, "i_gid"),
        "i_name": (Ind.indicator_name, "i_name"),
        "u_nid": (UnitM.unit_nid, "u_nid"),
        "u_gid": (UnitM.unit_gid, "u_gid"),
        "u_name": (UnitM.unit_name, "u_name"),
        "sg_nid": (Sv.subgroup_val_nid, "sg_nid"),
        "sg_gid": (Sv.subgroup_val_gid, "sg_gid"),
        "sg_name": (Sv.subgroup_val, "sg_name"),
        "ar_nid": (AreaM.area_nid, "ar_nid"),
        "ar_id": (AreaM.area_id, "ar_id"),
        "ar_gid": (AreaM.area_gid, "ar_gid"),
        "ar_name": (AreaM.area_name, "ar_name"),
        "ar_level": (AreaM.area_level, "ar_level"),
        "tp_nid": (TimePeriod.timeperiod_nid, "tp_nid"),
        "tp_timeperiod": (TimePeriod.timeperiod, "tp_timeperiod"),
        "src_nid": (Ic.ic_nid, "src_nid"),
        "src_gid": (Ic.ic_gid, "src_gid"),
        "src_name": (Ic.ic_name, "src_name"),
        "dt_is_mrd": (Data.ismrd, "dt_is_mrd"),
        "dt_is_planned_value": (Data.isplannedvalue, "dt_is_planned_value"),
    }

    select_exprs: list[Any] = []
    group_by_cols: list[Any] = []
    output_keys: list[str] = []
    seen_keys: set[str] = set()

    for dim in dims:
        for col_key in AGGREGATE_DIMENSIONS[dim]:
            col, out_key = dim_col_map[col_key]
            if out_key not in seen_keys:
                select_exprs.append(col.label(out_key))
                group_by_cols.append(col)
                output_keys.append(out_key)
                seen_keys.add(out_key)

    for fn in agg_funcs:
        if fn == "count":
            select_exprs.append(func.count(Data.data_nid).label("dt_value_count"))
            output_keys.append("dt_value_count")
        elif fn == "sum":
            select_exprs.append(func.sum(Data.data_value).label("dt_value_sum"))
            output_keys.append("dt_value_sum")
        elif fn == "avg":
            select_exprs.append(func.avg(Data.data_value).label("dt_value_avg"))
            output_keys.append("dt_value_avg")
        elif fn == "min":
            select_exprs.append(func.min(Data.data_value).label("dt_value_min"))
            output_keys.append("dt_value_min")
        elif fn == "max":
            select_exprs.append(func.max(Data.data_value).label("dt_value_max"))
            output_keys.append("dt_value_max")

    return select_exprs, group_by_cols, output_keys


def _query_raw(
    dw_db: Session,
    locale: str,
    filters: PublishedDataFilters,
    op_filters: list[OperatorFilter],
    page: int,
    page_size: Optional[int],
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort: Optional[str] = None,
    sort_order: str = "asc",
) -> tuple[list[dict], Optional[int], bool]:
    q, Ind, UnitM, Sv, AreaM, Ic, Tp, Fn = _base_query(dw_db, locale)
    q = _apply_simple_filters(q, filters, Ind, UnitM, Sv, AreaM)
    for op in op_filters:
        q = _apply_operator_filter(q, op, Ind, UnitM, Sv, AreaM, Tp, Ic)

    if search and search_by:
        search_col = _get_search_col(search_by, Ind, UnitM, Sv, AreaM, Tp, Ic)
        q = q.filter(search_col.ilike(f"%{search}%"))

    sort_col = _get_sort_col(sort, Ind, UnitM, Sv, AreaM, Tp, Ic)
    if sort_order and sort_order.lower() == "desc":
        q = q.order_by(sort_col.desc())
    else:
        q = q.order_by(sort_col.asc())

    if page_size is None:
        rows = q.all()
        out = [_row_to_dict(d, i, u, s, a, t, ic, fn) for d, i, u, s, a, t, ic, fn in rows]
        _enrich_rows_with_area_latlong(dw_db, out)
        enrich_published_data_rows(out, dw_db=dw_db, locale=locale)
        return out, len(out), False

    total = q.with_entities(func.count(Data.data_nid)).scalar() or 0

    offset = (max(1, page) - 1) * max(1, page_size)
    rows = q.offset(offset).limit(page_size).all()
    has_more = (offset + len(rows)) < total

    out = [_row_to_dict(d, i, u, s, a, t, ic, fn) for d, i, u, s, a, t, ic, fn in rows]
    _enrich_rows_with_area_latlong(dw_db, out)
    enrich_published_data_rows(out, dw_db=dw_db, locale=locale)
    return out, total, has_more


def _query_aggregate(
    dw_db: Session,
    locale: str,
    filters: PublishedDataFilters,
    op_filters: list[OperatorFilter],
    aggregate_by: str,
    agg: str,
    page: int,
    page_size: Optional[int],
) -> tuple[list[dict], Optional[int], bool]:
    dims = _parse_aggregate_by(aggregate_by)
    agg_funcs = _parse_agg_functions(agg)
    numeric_aggs = [f for f in agg_funcs if f != "count"]

    q, Ind, UnitM, Sv, AreaM, Ic, Tp, _Fn = _base_query(dw_db, locale)
    q = _apply_simple_filters(q, filters, Ind, UnitM, Sv, AreaM)
    for op in op_filters:
        q = _apply_operator_filter(q, op, Ind, UnitM, Sv, AreaM, Tp, Ic)

    if numeric_aggs:
        q = q.filter(or_(Data.istextualdata == False, Data.istextualdata.is_(None)))  # noqa: E712

    select_exprs, group_by_cols, output_keys = _agg_select_columns(
        dims, agg_funcs, Ind, UnitM, Sv, AreaM, Tp, Ic
    )

    agg_q = q.with_entities(*select_exprs).group_by(*group_by_cols).order_by(*group_by_cols)

    if page_size is None:
        result_rows = agg_q.all()
        total = len(result_rows)
        has_more = False
    else:
        count_sub = agg_q.subquery()
        total = dw_db.query(func.count()).select_from(count_sub).scalar() or 0
        offset = (max(1, page) - 1) * max(1, page_size)
        result_rows = agg_q.offset(offset).limit(page_size).all()
        has_more = (offset + len(result_rows)) < total

    out: list[dict] = []
    for row in result_rows:
        row_dict: dict[str, Any] = {}
        for i, key in enumerate(output_keys):
            val = row[i]
            if key == "dt_value_avg" and val is not None:
                val = round(float(val), 4)
            elif key in ("dt_is_mrd", "dt_is_planned_value") and val is not None:
                val = bool(val)
            row_dict[key] = val
        out.append(row_dict)
    _enrich_rows_with_area_latlong(dw_db, out)
    return out, total, has_more


def _query_footnotes(
    dw_db: Session,
    locale: str,
    filters: PublishedDataFilters,
    op_filters: list[OperatorFilter],
    search: Optional[str] = None,
    search_by: Optional[str] = None,
) -> list[dict]:
    """Distinct footnotes for the same filtered dataset (same filters + search as raw query)."""
    q, Ind, UnitM, Sv, AreaM, Ic, Tp, Fn = _base_query(dw_db, locale)
    q = _apply_simple_filters(q, filters, Ind, UnitM, Sv, AreaM)
    for op in op_filters:
        q = _apply_operator_filter(q, op, Ind, UnitM, Sv, AreaM, Tp, Ic)

    if search and search_by:
        search_col = _get_search_col(search_by, Ind, UnitM, Sv, AreaM, Tp, Ic)
        q = q.filter(search_col.ilike(f"%{search}%"))

    q = q.filter(
        Data.footnote_nid.isnot(None),
        Data.footnote_nid != 0,
        Fn.footnote_nid.isnot(None),
    )

    fn_rows = (
        q.with_entities(Fn.footnote_nid, Fn.footnote_gid, Fn.footnote)
        .distinct()
        .all()
    )

    seen: set[int] = set()
    result: list[dict] = []
    for fn_nid, fn_gid, fn_text in fn_rows:
        if fn_nid is not None and fn_nid not in seen:
            seen.add(fn_nid)
            result.append({
                "fn_nid": int(fn_nid),
                "fn_gid": fn_gid or "",
                "fn_text": fn_text or "",
            })
    return result


def query_published_data(
    dw_db: Session,
    locale: str,
    *,
    filters: PublishedDataFilters,
    op_filters: Optional[list[OperatorFilter]] = None,
    page: int = 1,
    page_size: Optional[int] = 50,
    aggregate_by: Optional[str] = None,
    agg: str = "count",
    require_anchor: bool = False,
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    sort: Optional[str] = None,
    sort_order: str = "asc",
    include_footnotes: bool = True,
) -> tuple[list[dict], Optional[int], list[dict], bool]:
    """Run published data report query (raw or aggregation mode).

    Returns:
        (rows, total, footnotes, has_more) — footnotes is always [] in aggregate mode.

    Args:
        require_anchor: When True, enforces the mandatory anchor filter rule.
                        Defaults to False — data/published/full is AUTHENTICATED and
                        bounded by page_size ceiling, so no anchor is required.
    """
    op_filters = op_filters or []

    if require_anchor:
        validate_mandatory_anchor(filters, op_filters)

    if aggregate_by:
        rows, total, has_more = _query_aggregate(
            dw_db, locale, filters, op_filters, aggregate_by, agg, page, page_size
        )
        return rows, total, [], has_more

    footnotes = (
        _query_footnotes(dw_db, locale, filters, op_filters, search, search_by)
        if include_footnotes
        else []
    )
    rows, total, has_more = _query_raw(
        dw_db, locale, filters, op_filters, page, page_size,
        search=search, search_by=search_by, sort=sort, sort_order=sort_order,
    )
    return rows, total, footnotes, has_more


def get_column_defs_for_result(aggregate_by: Optional[str]) -> list[str]:
    """Return export column defs based on query mode."""
    if aggregate_by:
        return PUBLISHED_DATA_AGG_COLUMN_DEFS
    return PUBLISHED_DATA_COLUMN_DEFS


# ---------------------------------------------------------------------------
# UI-friendly export (Data Report page "Export" button)
# ---------------------------------------------------------------------------

PUBLISHED_DATA_UI_EXPORT_COLUMNS = [
    "dr_indicator_unit",  # combined "Indicator, Unit"
    "dr_subgroup",
    "dr_area",
    "dr_timeperiod",
    "dr_data",
    "dr_source",
    "dr_footnote",
]


def transform_rows_for_ui_export(rows: list[dict]) -> list[dict]:
    """Map raw published-data rows to the 7-column UI export layout."""
    result = []
    for row in rows:
        unit = (row.get("u_name") or "").strip()
        indicator = (row.get("i_name") or "").strip()
        indicator_unit = f"{indicator}, {unit}" if unit else indicator
        result.append({
            "dr_indicator_unit": indicator_unit,
            "dr_subgroup": row.get("sg_name") or "",
            "dr_area": row.get("ar_name") or "",
            "dr_timeperiod": row.get("tp_timeperiod") or "",
            "dr_data": row.get("formatted_dt_value") or "",
            "dr_source": row.get("src_name") or "",
            "dr_footnote": row.get("fn_text") or "",
        })
    return result
