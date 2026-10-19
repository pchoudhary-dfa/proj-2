"""
Data service: fetch ut_data rows with filters, optional meta enrichment, and pagination.
Supports mandatory indicator filter; when only indicator is given, uses default IUS from ut_indicator_unit_subgroup.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.shared.exceptions import NotFound
from apps.datawarehouse.constants import (
    QUERY_INDICATOR,
    QUERY_UNIT,
    QUERY_SUBGROUP,
    QUERY_TIME_PERIOD,
    QUERY_AREA,
    QUERY_AREA_LEVEL,
    QUERY_IUS,
    QUERY_IC,
    QUERY_IUS,
)
from apps.shared.config.config import settings
from apps.shared.utils.ius_utils import get_ius_gid_separator
from apps.shared.schemas.response import ListPaginationMetaSchema
from apps.shared.utils.validators import resolve_identifier_to_nid
from apps.datawarehouse.utils.audit_events import buffer_manual_audit, deleted_ids_preview
from apps.datawarehouse.utils.unit_data_format import enrich_rows_with_formatted_data_values
from apps.shared.utils.validators import generate_guid
from apps.datawarehouse.models.datawarehouse import (
    Data,
    Area,
    Footnote,
    IndicatorUnitSubgroup,
    IndicatorClassification,
    Indicator,
    Unit,
    SubgroupVal,
    TimePeriod,
    get_default_locale,
)
logger = logging.getLogger(__name__)


def _normalize_list_param(value: Optional[str | list[str | int]]) -> list[str]:
    """Normalize query param to list of strings (comma-separated or repeated)."""
    if value is None:
        return []
    if isinstance(value, list):
        out: list[str] = []
        for x in value:
            part = str(x).strip()
            if part:
                out.extend(v.strip() for v in part.split(",") if v.strip())
        return out
    return [v.strip() for v in str(value).split(",") if v.strip()]


def _parse_ius_gid(ius_gid_param: Optional[str | list[str]]) -> list[tuple[str, str, str]]:
    """Parse ius_gid (i_gid<sep>u_gid<sep>s_gid, ...) into list of (i_gid, u_gid, s_gid). Separator from IUS_GID_SEPARATOR."""
    sep = get_ius_gid_separator()
    parts = _normalize_list_param(ius_gid_param)
    result = []
    for p in parts:
        segs = p.split(sep)
        if len(segs) == 3:
            result.append((segs[0].strip(), segs[1].strip(), segs[2].strip()))
    return result


def _process_data_value(dt_value: Any) -> dict:
    """
    Route a raw observation value to the correct DB columns.

    Fallback logic (no rules engine):
      - None              → all columns NULL / False
      - Numeric-castable  → data_value (float), textual_data_value NULL, istextualdata False
      - Otherwise         → data_value NULL, textual_data_value str, istextualdata True
    """
    if dt_value is None or dt_value == "":
        return {"data_value": None, "textual_data_value": None, "istextualdata": False}
    try:
        return {"data_value": float(dt_value), "textual_data_value": None, "istextualdata": False}
    except (ValueError, TypeError):
        return {"data_value": None, "textual_data_value": str(dt_value), "istextualdata": True}


def _resolve_footnote(
    dw_db,
    locale: str,
    fn_nid: Optional[int],
    fn_gid: Optional[str],
    fn_caption: Optional[str],
) -> Optional[int]:
    """
    Resolve a footnote NID using the 3-step cascade:
      1. fn_nid provided  → validate existence; return as-is.
      2. fn_gid provided  → look up by GID; return its fn_nid.
      3. fn (caption)     → look up by caption text; create a new record if absent.
    Returns the resolved fn_nid, or None when no footnote input was supplied.
    Raises ValueError if a provided fn_nid or fn_gid cannot be found.
    """
    FootnoteModel = Footnote(locale)

    if fn_nid :
        row = dw_db.query(FootnoteModel).filter(FootnoteModel.footnote_nid == fn_nid).first()
        if not row:
            raise NotFound(f"footnote NID '{fn_nid}' not found")
        return fn_nid

    if fn_gid:
        row = dw_db.query(FootnoteModel).filter(FootnoteModel.footnote_gid == fn_gid).first()
        if not row:
            raise NotFound(f"footnote GID '{fn_gid}' not found")
        return row.footnote_nid

    if fn_caption:
        row = dw_db.query(FootnoteModel).filter(FootnoteModel.footnote == fn_caption).first()
        if row:
            return row.footnote_nid
        new_fn = FootnoteModel(footnote=fn_caption, footnote_gid=generate_guid())
        dw_db.add(new_fn)
        dw_db.flush()
        return new_fn.footnote_nid

    return None


def _compute_ismrd(dw_db, timeperiod_nid: Optional[int]) -> bool:
    """
    Return True if timeperiod_nid matches the globally most-recent timeperiod (max enddate).

    Designed to be callable synchronously now and via a background job in the future.
    """
    if timeperiod_nid is None:
        return False
    row = (
        dw_db.query(TimePeriod)
        .filter(TimePeriod.enddate.isnot(None))
        .order_by(TimePeriod.enddate.desc())
        .first()
    )
    return row is not None and row.timeperiod_nid == timeperiod_nid


@dataclass
class DataFilters:
    """Resolved filter sets (NIDs) for querying ut_data."""
    indicator_nids: list[int] = field(default_factory=list)
    unit_nids: list[int] = field(default_factory=list)
    subgroup_val_nids: list[int] = field(default_factory=list)
    ius_nids: list[int] = field(default_factory=list)
    area_nids: list[int] = field(default_factory=list)
    timeperiod_nids: list[int] = field(default_factory=list)
    source_nids: list[int] = field(default_factory=list)
    use_default_ius: bool = False  # indicator (+ optional unit) without sg/ius; expand default IUS rows


@dataclass
class MetaFlags:
    i_info: bool = False
    u_info: bool = False
    sv_info: bool = False
    ius_info: bool = False
    ic_info: bool = False
    tp_info: bool = False
    ar_info: bool = False
    arl_info: bool = False


class DataService:
    """
    Service for reading ut_data with filters, default IUS when indicator is given
    without subgroup or explicit IUS (optionally constrained by unit when unit is given),
    and optional meta enrichment.
    """

    def get_data(
        self,
        dw_id: str,
        *,
        i_identifier: Optional[str | list] = None,
        u_identifier: Optional[str | list] = None,
        sg_identifier: Optional[str | list] = None,
        ar_identifier: Optional[str | list] = None,
        tp_nid: Optional[str | list] = None,
        tp_timeperiod: Optional[str | list] = None,
        ius_identifier: Optional[str | list] = None,
        src_identifier: Optional[str | list] = None,
        i_info: bool = False,
        u_info: bool = False,
        sv_info: bool = False,
        ius_info: bool = False,
        ic_info: bool = False,
        tp_info: bool = False,
        ar_info: bool = False,
        arl_info: bool = False,
        page: int = 1,
        page_size: Optional[int] = 100,
        isdefaultenabled: bool = False,
        locale: str = "en",
    ) -> tuple[list[dict], dict]:
        """
        Fetch data rows and meta. Returns (data_rows, meta_dict).
        Raises ValueError if no indicator filter (i_identifier) is provided.

        Default subgroup: with ``isdefaultenabled`` true and no ``sg_identifier`` / ``ius_identifier``,
        default IUS rows are applied; if ``u_identifier`` is set, only default rows for those units
        are used.
        """
        if not _normalize_list_param(i_identifier):
            raise ValueError("Mandatory Classification/Indicator/Subgroups parameter is missing")

        filters = self._resolve_filters(
            dw_id, locale,
            i_identifier=i_identifier,
            u_identifier=u_identifier,
            sg_identifier=sg_identifier,
            ar_identifier=ar_identifier,
            tp_nid=tp_nid,
            tp_timeperiod=tp_timeperiod,
            ius_identifier=ius_identifier,
            src_identifier=src_identifier,
            isdefaultenabled=isdefaultenabled,
        )
        meta_flags = MetaFlags(
            i_info=i_info, u_info=u_info, sv_info=sv_info, ius_info=ius_info,
            ic_info=ic_info, tp_info=tp_info, ar_info=ar_info, arl_info=arl_info,
        )

        with get_warehouse_session_from_id(dw_id) as dw_db:
            total = self._count_data(dw_db, filters)
            
            # Use single method for both paginated and unlimited queries
            data_rows = self._query_data_rows(dw_db, filters, page, page_size, locale)
            
            if page_size is not None:
                # Paginated response metadata
                page_size_eff = max(1, min(page_size, 1000))
                if total > 0:
                    total_pages = (total + page_size_eff - 1) // page_size_eff
                else:
                    total_pages = 0
                meta = {
                    "pagination": ListPaginationMetaSchema(
                        total_count=total,
                        count=len(data_rows),
                        page=page,
                        page_size=page_size_eff,
                        total_pages=total_pages,
                    ).model_dump(),
                }
            else:
                # Unlimited response metadata for export
                meta = {
                    "pagination": ListPaginationMetaSchema(
                        total_count=total,
                        count=len(data_rows),
                        page=1,
                        page_size=total,
                        total_pages=1,
                    ).model_dump(),
                }

            if meta_flags.i_info or meta_flags.u_info or meta_flags.sv_info or meta_flags.ius_info or meta_flags.tp_info or meta_flags.ar_info:
                self._enrich_meta(dw_db, data_rows, meta, meta_flags, locale)

            return data_rows, meta

    def _resolve_filters(
        self,
        dw_id: str,
        locale: str,
        *,
        i_identifier: Optional[str | list] = None,
        u_identifier: Optional[str | list] = None,
        sg_identifier: Optional[str | list] = None,
        ar_identifier: Optional[str | list] = None,
        tp_nid: Optional[str | list] = None,
        tp_timeperiod: Optional[str | list] = None,
        ius_identifier: Optional[str | list] = None,
        src_identifier: Optional[str | list] = None,
        isdefaultenabled: bool = False,
    ) -> DataFilters:
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndLocale = Indicator(locale)
            UnitLocale = Unit(locale)
            SvLocale = SubgroupVal(locale)
            indicator_nids = self._resolve_identifier_values_to_nids(
                _normalize_list_param(i_identifier),
                lambda identifier: self._indicator_gid_to_nid(dw_db, IndLocale, identifier),
            )

            # Subgroup or explicit IUS fully specifies the IUS axis; unit alone does not
            # (indicator + unit + isdefaultenabled still resolves default subgroup for that unit).
            has_explicit_subgroup_or_ius = bool(
                _normalize_list_param(ius_identifier) or _normalize_list_param(sg_identifier)
            )
            use_default_ius = bool(indicator_nids) and not has_explicit_subgroup_or_ius and isdefaultenabled

            unit_nids = self._resolve_identifier_values_to_nids(
                _normalize_list_param(u_identifier),
                lambda identifier: self._unit_gid_to_nid(dw_db, UnitLocale, identifier),
            )
            unit_nids = list(dict.fromkeys(unit_nids))

            subgroup_val_nids = self._resolve_identifier_values_to_nids(
                _normalize_list_param(sg_identifier),
                lambda identifier: self._subgroup_gid_to_nid(dw_db, SvLocale, identifier),
            )
            subgroup_val_nids = list(dict.fromkeys(subgroup_val_nids))

            ius_identifiers = _normalize_list_param(ius_identifier)
            ius_nids = [int(v) for v in ius_identifiers if v.isdigit()]
            ius_gid_values = [v for v in ius_identifiers if not v.isdigit()]
            for i_g, u_g, s_g in _parse_ius_gid(ius_gid_values):
                ius = (
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
                if ius:
                    ius_nids.append(ius.iusnid)
            ius_nids = list(dict.fromkeys(ius_nids))

            if use_default_ius:
                default_q = dw_db.query(IndicatorUnitSubgroup).filter(
                    IndicatorUnitSubgroup.indicator_nid.in_(indicator_nids),
                    IndicatorUnitSubgroup.isdefaultsubgroup == True,
                )
                if unit_nids:
                    default_q = default_q.filter(IndicatorUnitSubgroup.unit_nid.in_(unit_nids))
                default_ius = default_q.all()
                for ius in default_ius:
                    ius_nids.append(ius.iusnid)
                    if ius.unit_nid and ius.unit_nid not in unit_nids:
                        unit_nids.append(ius.unit_nid)
                    if ius.subgroup_val_nid and ius.subgroup_val_nid not in subgroup_val_nids:
                        subgroup_val_nids.append(ius.subgroup_val_nid)
                ius_nids = list(dict.fromkeys(ius_nids))
                unit_nids = list(dict.fromkeys(unit_nids))
                subgroup_val_nids = list(dict.fromkeys(subgroup_val_nids))

            area_nids = self._resolve_identifier_values_to_nids(
                _normalize_list_param(ar_identifier),
                lambda identifier: self._area_id_to_nid(dw_db, Area(locale), identifier),
            )
            area_nids = list(dict.fromkeys(area_nids))

            timeperiod_nids = [_int_or_none(s) for s in _normalize_list_param(tp_nid) if _int_or_none(s) is not None]
            for tp in _normalize_list_param(tp_timeperiod):
                nid = self._timeperiod_to_nid(dw_db, tp)
                if nid is not None:
                    timeperiod_nids.append(nid)
            timeperiod_nids = list(dict.fromkeys(timeperiod_nids))

            IcLocale = IndicatorClassification(locale)
            source_nids = self._resolve_identifier_values_to_nids(
                _normalize_list_param(src_identifier),
                lambda identifier: self._ic_gid_to_nid(dw_db, IcLocale, identifier),
            )
            source_nids = list(dict.fromkeys(source_nids))

            return DataFilters(
                indicator_nids=indicator_nids,
                unit_nids=unit_nids,
                subgroup_val_nids=subgroup_val_nids,
                ius_nids=ius_nids,
                area_nids=area_nids,
                timeperiod_nids=timeperiod_nids,
                source_nids=source_nids,
                use_default_ius=use_default_ius,
            )

    def resolve_source_identifier_nids(
        self,
        dw_id: str,
        locale: str,
        src_identifier: Optional[str | list],
    ) -> list[int]:
        """Resolve source (IC) NIDs or GIDs from src_identifier (comma-separated)."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IcLocale = IndicatorClassification(locale)
            return self._resolve_identifier_values_to_nids(
                _normalize_list_param(src_identifier),
                lambda identifier: self._ic_gid_to_nid(dw_db, IcLocale, identifier),
            )

    def _resolve_identifier_values_to_nids(
        self,
        identifiers: list[str],
        get_nid_by_gid: Callable[[str], Optional[int]],
    ) -> list[int]:
        nids: list[int] = []
        for identifier in identifiers:
            nid = resolve_identifier_to_nid(identifier, get_nid_by_gid)
            if nid is not None:
                nids.append(nid)
        return list(dict.fromkeys(nids))

    def _indicator_gid_to_nid(self, dw_db: Session, model: Any, gid: str) -> Optional[int]:
        row = dw_db.query(model.indicator_nid).filter(model.indicator_gid == gid).first()
        return int(row[0]) if row else None

    def _unit_gid_to_nid(self, dw_db: Session, model: Any, gid: str) -> Optional[int]:
        row = dw_db.query(model.unit_nid).filter(model.unit_gid == gid).first()
        return int(row[0]) if row else None

    def _subgroup_gid_to_nid(self, dw_db: Session, model: Any, gid: str) -> Optional[int]:
        row = dw_db.query(model.subgroup_val_nid).filter(model.subgroup_val_gid == gid).first()
        return int(row[0]) if row else None

    def _ic_gid_to_nid(self, dw_db: Session, model: Any, gid: str) -> Optional[int]:
        row = dw_db.query(model.ic_nid).filter(model.ic_gid == gid).first()
        return int(row[0]) if row else None

    def _area_id_to_nid(self, dw_db: Session, model: Any, area_id: str) -> Optional[int]:
        row = dw_db.query(model.area_nid).filter(model.area_id == area_id).first()
        return int(row[0]) if row else None

    def _timeperiod_to_nid(self, dw_db: Session, timeperiod: str) -> Optional[int]:
        row = dw_db.query(TimePeriod.timeperiod_nid).filter(TimePeriod.timeperiod == timeperiod).first()
        return int(row[0]) if row else None

    def _resolve_timeperiod_identifier(self, dw_db: Session, identifier: str) -> Optional[int]:
        """Resolve time period by label first, then by NID if identifier is all digits."""
        row = dw_db.query(TimePeriod.timeperiod_nid).filter(
            TimePeriod.timeperiod == identifier
        ).first()
        if row:
            return int(row[0])
        if identifier.isdigit():
            row = dw_db.query(TimePeriod.timeperiod_nid).filter(
                TimePeriod.timeperiod_nid == int(identifier)
            ).first()
            return int(row[0]) if row else None
        return None

    def _count_data(self, dw_db: Session, filters: DataFilters) -> int:
        q = dw_db.query(Data)
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
        return q.count()

    def _query_data_rows(
        self,
        dw_db: Session,
        filters: DataFilters,
        page: int,
        page_size: Optional[int],
        locale: str,
    ) -> list[dict]:
        q = dw_db.query(Data)
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
        
        if page_size is not None:
            # Paginated query
            offset = (max(1, page) - 1) * max(1, min(page_size, 1000))
            rows = q.offset(offset).limit(max(1, min(page_size, 1000))).all()
        else:
            # Unlimited query for export
            rows = q.all()

        if not rows:
            return []

        ius_nids = list({r.iusnid for r in rows if r.iusnid})
        area_nids = list({r.area_nid for r in rows if r.area_nid})
        tp_nids = list({r.timeperiod_nid for r in rows if r.timeperiod_nid})

        IndLocale = Indicator(locale)
        UnitLocale = Unit(locale)
        SvLocale = SubgroupVal(locale)

        ius_records = dw_db.query(IndicatorUnitSubgroup).filter(IndicatorUnitSubgroup.iusnid.in_(ius_nids)).all() if ius_nids else []
        ius_by_nid = {r.iusnid: r for r in ius_records}
        ind_nids = list({r.indicator_nid for r in ius_records})
        u_nids = list({r.unit_nid for r in ius_records})
        sv_nids = list({r.subgroup_val_nid for r in ius_records})

        ind_locale = dw_db.query(IndLocale).filter(IndLocale.indicator_nid.in_(ind_nids)).all() if ind_nids else []
        ind_locale_by_nid = {r.indicator_nid: r for r in ind_locale}

        unit_locale = dw_db.query(UnitLocale).filter(UnitLocale.unit_nid.in_(u_nids)).all() if u_nids else []
        unit_locale_by_nid = {r.unit_nid: r for r in unit_locale}

        sv_locale = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_nid.in_(sv_nids)).all() if sv_nids else []
        sv_locale_by_nid = {r.subgroup_val_nid: r for r in sv_locale}

        area_map = self._fetch_areas(dw_db, locale, area_nids) if area_nids else {}
        tp_map = self._fetch_timeperiods(dw_db, tp_nids) if tp_nids else {}

        out = []
        for r in rows:
            ius = ius_by_nid.get(r.iusnid) if r.iusnid else None
            i_nid = int(r.indicator_nid) if r.indicator_nid is not None else (ius.indicator_nid if ius else None)
            u_nid = int(r.unit_nid) if r.unit_nid is not None else (ius.unit_nid if ius else None)
            s_nid = int(r.subgroup_val_nid) if r.subgroup_val_nid is not None else (ius.subgroup_val_nid if ius else None)

            ind_loc = ind_locale_by_nid.get(i_nid) if i_nid is not None else None
            u_loc = unit_locale_by_nid.get(u_nid) if u_nid is not None else None
            sv_loc = sv_locale_by_nid.get(s_nid) if s_nid is not None else None

            i_gid = (getattr(ind_loc, "indicator_gid", None) or "") if ind_loc else ""
            i_name = (ind_loc.indicator_name or "") if ind_loc else ""
            u_gid = (getattr(u_loc, "unit_gid", None) or "") if u_loc else ""
            u_name = (u_loc.unit_name or "") if u_loc else ""
            s_gid = (getattr(sv_loc, "subgroup_val_gid", None) or "") if sv_loc else ""
            s_name = (sv_loc.subgroup_val or "") if sv_loc else ""

            _sep = get_ius_gid_separator()
            ius_gid = f"{i_gid}{_sep}{u_gid}{_sep}{s_gid}" if (i_gid or u_gid or s_gid) else ""

            ar_nid = int(r.area_nid) if r.area_nid is not None else None
            ar_info = area_map.get(ar_nid, {}) if ar_nid is not None else {}
            ar_id = ar_info.get("area_id") or ""
            ar_name = ar_info.get("area_name") or ""

            tp_nid = int(r.timeperiod_nid) if r.timeperiod_nid is not None else None
            tp_timeperiod = tp_map.get(tp_nid, "") if tp_nid is not None else ""

            is_textual = getattr(r, "istextualdata", False)

            # Serialize datetime for JSON; internal names match DATA key in db_tbl_cols_mapping.json
            start_dt = getattr(r, "start_date", None)
            end_dt = getattr(r, "end_date", None)

            row = {
                # DATA table fields (internal names; router applies external mapping when ADAPTATION != "internal")
                "data_nid": r.data_nid,
                "iusnid": r.iusnid,
                "timeperiod_nid": int(r.timeperiod_nid) if r.timeperiod_nid is not None else None,
                "area_nid": int(r.area_nid) if r.area_nid is not None else None,
                "start_date": start_dt.isoformat() if start_dt else None,
                "end_date": end_dt.isoformat() if end_dt else None,
                "data_denominator": int(r.data_denominator) if r.data_denominator is not None else None,
                "footnote_nid": int(r.footnote_nid) if r.footnote_nid is not None else None,
                "source_nid": int(r.source_nid) if r.source_nid is not None else None,
                "indicator_nid": i_nid,
                "unit_nid": u_nid,
                "subgroup_val_nid": s_nid,
                "ic_ius_order": getattr(r, "ic_ius_order", None),
                "textual_data_value": getattr(r, "textual_data_value", None),
                "istextualdata": is_textual,
                "data_value": r.data_value,
            }

            # Denormalized / joined fields (not in DATA mapping; kept as-is)
            row["i_name"] = i_name
            row["i_gid"] = i_gid
            row["u_name"] = u_name
            row["u_gid"] = u_gid
            row["sg_name"] = s_name
            row["sg_gid"] = s_gid
            row["ar_id"] = ar_id
            row["ar_name"] = ar_name
            row["tp_timeperiod"] = tp_timeperiod
            row["ius_gid"] = ius_gid
            row["src_name"] = ""
            row["footnote"] = ""

            out.append(row)
        enrich_rows_with_formatted_data_values(out, dw_db=dw_db, locale=locale)
        return out

    def _enrich_unified_datapoint_row_dicts(
        self, dw_db: Session, locale: str, rows: list[dict[str, Any]]
    ) -> None:
        """
        Populate i_name, i_gid, u_name, u_gid, sg_*, ar_*, tp_timeperiod, ius_gid on each row
        (internal keys), matching GET /dw/{dw_id}/data row shape. Mutates rows in place.
        """
        if not rows:
            return

        ius_nids = list({r["iusnid"] for r in rows if r.get("iusnid") is not None})
        area_nids = list({r["area_nid"] for r in rows if r.get("area_nid") is not None})
        tp_nids = list({r["timeperiod_nid"] for r in rows if r.get("timeperiod_nid") is not None})

        IndLocale = Indicator(locale)
        UnitLocale = Unit(locale)
        SvLocale = SubgroupVal(locale)

        ius_records = (
            dw_db.query(IndicatorUnitSubgroup).filter(IndicatorUnitSubgroup.iusnid.in_(ius_nids)).all()
            if ius_nids
            else []
        )
        ius_by_nid = {r.iusnid: r for r in ius_records}
        ind_nids = list({r.indicator_nid for r in ius_records})
        u_nids = list({r.unit_nid for r in ius_records})
        sv_nids = list({r.subgroup_val_nid for r in ius_records})

        ind_locale = dw_db.query(IndLocale).filter(IndLocale.indicator_nid.in_(ind_nids)).all() if ind_nids else []
        ind_locale_by_nid = {r.indicator_nid: r for r in ind_locale}

        unit_locale = dw_db.query(UnitLocale).filter(UnitLocale.unit_nid.in_(u_nids)).all() if u_nids else []
        unit_locale_by_nid = {r.unit_nid: r for r in unit_locale}

        sv_locale = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_nid.in_(sv_nids)).all() if sv_nids else []
        sv_locale_by_nid = {r.subgroup_val_nid: r for r in sv_locale}

        area_map = self._fetch_areas(dw_db, locale, area_nids) if area_nids else {}
        tp_map = self._fetch_timeperiods(dw_db, tp_nids) if tp_nids else {}

        _sep = get_ius_gid_separator()

        for r in rows:
            ius = ius_by_nid.get(r.get("iusnid")) if r.get("iusnid") is not None else None
            ind_raw = r.get("indicator_nid")
            u_raw = r.get("unit_nid")
            s_raw = r.get("subgroup_val_nid")
            i_nid = int(ind_raw) if ind_raw is not None else (ius.indicator_nid if ius else None)
            u_nid = int(u_raw) if u_raw is not None else (ius.unit_nid if ius else None)
            s_nid = int(s_raw) if s_raw is not None else (ius.subgroup_val_nid if ius else None)

            ind_loc = ind_locale_by_nid.get(i_nid) if i_nid is not None else None
            u_loc = unit_locale_by_nid.get(u_nid) if u_nid is not None else None
            sv_loc = sv_locale_by_nid.get(s_nid) if s_nid is not None else None

            i_gid = (getattr(ind_loc, "indicator_gid", None) or "") if ind_loc else ""
            i_name = (ind_loc.indicator_name or "") if ind_loc else ""
            u_gid = (getattr(u_loc, "unit_gid", None) or "") if u_loc else ""
            u_name = (u_loc.unit_name or "") if u_loc else ""
            s_gid = (getattr(sv_loc, "subgroup_val_gid", None) or "") if sv_loc else ""
            s_name = (sv_loc.subgroup_val or "") if sv_loc else ""

            ius_gid = f"{i_gid}{_sep}{u_gid}{_sep}{s_gid}" if (i_gid or u_gid or s_gid) else ""

            ar_nid = int(r["area_nid"]) if r.get("area_nid") is not None else None
            ar_info = area_map.get(ar_nid, {}) if ar_nid is not None else {}
            ar_id = ar_info.get("area_id") or ""
            ar_name = ar_info.get("area_name") or ""

            tp_nid = int(r["timeperiod_nid"]) if r.get("timeperiod_nid") is not None else None
            tp_timeperiod = tp_map.get(tp_nid, "") if tp_nid is not None else ""

            r["i_name"] = i_name
            r["i_gid"] = i_gid
            r["u_name"] = u_name
            r["u_gid"] = u_gid
            r["sg_name"] = s_name
            r["sg_gid"] = s_gid
            r["ar_id"] = ar_id
            r["ar_name"] = ar_name
            r["tp_timeperiod"] = tp_timeperiod
            r["ius_gid"] = ius_gid
            r.setdefault("src_name", "")
            r.setdefault("footnote", "")

        enrich_rows_with_formatted_data_values(rows, dw_db=dw_db, locale=locale)

    def _fetch_areas(self, dw_db: Session, locale: str, area_nids: list[int]) -> dict[int, dict]:
        if not area_nids:
            return {}
        ArLocale = Area(locale)
        rows = dw_db.query(ArLocale).filter(ArLocale.area_nid.in_(area_nids)).all()
        return {int(r.area_nid): {"area_id": r.area_id or "", "area_name": r.area_name or ""} for r in rows}

    def _fetch_timeperiods(self, dw_db: Session, tp_nids: list[int]) -> dict[int, str]:
        if not tp_nids:
            return {}
        rows = dw_db.query(TimePeriod).filter(TimePeriod.timeperiod_nid.in_(tp_nids)).all()
        return {int(r.timeperiod_nid): (r.timeperiod or "") for r in rows}

    def _enrich_meta(
        self,
        dw_db: Session,
        data_rows: list[dict],
        meta: dict,
        flags: MetaFlags,
        locale: str,
    ) -> None:
        if flags.i_info and data_rows:
            ind_nids = list({r["indicator_nid"] for r in data_rows if r.get("indicator_nid") is not None})
            if ind_nids:
                IndLocale = Indicator(locale)
                ind_locale = dw_db.query(IndLocale).filter(IndLocale.indicator_nid.in_(ind_nids)).all()
                meta[QUERY_INDICATOR] = {}
                for loc in ind_locale:
                    meta[QUERY_INDICATOR][str(loc.indicator_nid)] = {
                        "i_nid": loc.indicator_nid,
                        "i_gid": getattr(loc, "indicator_gid", None) or "",
                        "i_name": loc.indicator_name or "",
                    }
        if flags.u_info and data_rows:
            u_nids = list({r["unit_nid"] for r in data_rows if r.get("unit_nid") is not None})
            if u_nids:
                UnitLocale = Unit(locale)
                unit_locale = dw_db.query(UnitLocale).filter(UnitLocale.unit_nid.in_(u_nids)).all()
                meta[QUERY_UNIT] = {}
                for loc in unit_locale:
                    meta[QUERY_UNIT][str(loc.unit_nid)] = {
                        "u_nid": loc.unit_nid,
                        "u_gid": getattr(loc, "unit_gid", None) or "",
                        "u_name": loc.unit_name or "",
                    }
        if flags.sv_info and data_rows:
            sv_nids = list({r["subgroup_val_nid"] for r in data_rows if r.get("subgroup_val_nid") is not None})
            if sv_nids:
                SvLocale = SubgroupVal(locale)
                sv_locale = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_nid.in_(sv_nids)).all()
                meta[QUERY_SUBGROUP] = {}
                for loc in sv_locale:
                    meta[QUERY_SUBGROUP][str(loc.subgroup_val_nid)] = {
                        "sv_nid": loc.subgroup_val_nid,
                        "sv_gid": getattr(loc, "subgroup_val_gid", None) or "",
                        "sv_name": loc.subgroup_val or "",
                        "sv_order": getattr(loc, "subgroup_val_order", None),
                    }
        if flags.tp_info and data_rows:
            tp_nids = list({r["timeperiod_nid"] for r in data_rows if r.get("timeperiod_nid") is not None})
            if tp_nids:
                tp_map = self._fetch_timeperiods(dw_db, tp_nids)
                meta[QUERY_TIME_PERIOD] = {str(nid): {"tp_nid": nid, "tp_timeperiod": tp_map.get(nid, "")} for nid in tp_nids}
        if flags.ar_info and data_rows:
            ar_nids = list({r["area_nid"] for r in data_rows if r.get("area_nid") is not None})
            if ar_nids:
                area_map = self._fetch_areas(dw_db, locale, ar_nids)
                meta[QUERY_AREA] = {}
                for nid in ar_nids:
                    info = area_map.get(nid, {})
                    meta[QUERY_AREA][str(nid)] = {"ar_nid": nid, "ar_id": info.get("area_id", ""), "ar_name": info.get("area_name", "")}
        if flags.ic_info:
            meta[QUERY_IC] = {}
        if flags.arl_info:
            meta[QUERY_AREA_LEVEL] = {}
        if flags.ius_info and data_rows:
            ius_nids = list({r["iusnid"] for r in data_rows if r.get("iusnid") is not None})
            if ius_nids:
                IndLocale = Indicator(locale)
                UnitLocale = Unit(locale)
                SvLocale = SubgroupVal(locale)
                ius_list = dw_db.query(IndicatorUnitSubgroup).filter(IndicatorUnitSubgroup.iusnid.in_(ius_nids)).all()
                ind_nids = list({r.indicator_nid for r in ius_list})
                u_nids = list({r.unit_nid for r in ius_list})
                sv_nids = list({r.subgroup_val_nid for r in ius_list})
                ind_by_nid = {r.indicator_nid: r for r in dw_db.query(IndLocale).filter(IndLocale.indicator_nid.in_(ind_nids)).all()} if ind_nids else {}
                unit_by_nid = {r.unit_nid: r for r in dw_db.query(UnitLocale).filter(UnitLocale.unit_nid.in_(u_nids)).all()} if u_nids else {}
                sv_by_nid = {r.subgroup_val_nid: r for r in dw_db.query(SvLocale).filter(SvLocale.subgroup_val_nid.in_(sv_nids)).all()} if sv_nids else {}
                meta[QUERY_IUS] = {}
                for ius in ius_list:
                    i = ind_by_nid.get(ius.indicator_nid)
                    u = unit_by_nid.get(ius.unit_nid)
                    s = sv_by_nid.get(ius.subgroup_val_nid)
                    i_gid = (getattr(i, "indicator_gid", None) or "") if i else ""
                    u_gid = (getattr(u, "unit_gid", None) or "") if u else ""
                    s_gid = (getattr(s, "subgroup_val_gid", None) or "") if s else ""
                    _sep = get_ius_gid_separator()
                    meta[QUERY_IUS][str(ius.iusnid)] = {"ius_nid": ius.iusnid, "ius_gid": f"{i_gid}{_sep}{u_gid}{_sep}{s_gid}"}

    def _value_fields_for_unified_datapoint_upsert(self, item: Any) -> dict:
        """Map unified PATCH body to data_value / textual_data_value (same rules as dt_value)."""
        if item.data_value is not None or item.textual_data_value is not None:
            return {
                "data_value": item.data_value,
                "textual_data_value": item.textual_data_value,
                "istextualdata": item.textual_data_value is not None,
            }
        return _process_data_value(item.dt_value)

    def resolve_unified_datapoint_upsert_item(
        self,
        dw_db: Session,
        locale: str,
        item: Any,
        *,
        resolve_footnote: bool = True,
    ) -> dict:
        """
        Resolve one UnifiedDataPointUpsertItemSchema into fields for dataset_data_point upsert.

        Same NID/GID resolution rules as POST /dw/{dw_id}/data. Raises ValueError on resolution errors.
        """
        from apps.datawarehouse.schemas.data import UnifiedDataPointUpsertItemSchema

        if not isinstance(item, UnifiedDataPointUpsertItemSchema):
            item = UnifiedDataPointUpsertItemSchema.model_validate(item)

        IndLocale = Indicator(locale)
        UnitLocale = Unit(locale)
        SvLocale = SubgroupVal(locale)
        IcLocale = IndicatorClassification(locale)
        ArLocale = Area(locale)

        row_errors: list[str] = []
        indicator_nid: Optional[int] = None
        unit_nid: Optional[int] = None
        subgroup_val_nid: Optional[int] = None
        iusnid: Optional[int] = None

        if item.iusnid is not None:
            ius = (
                dw_db.query(IndicatorUnitSubgroup)
                .filter(IndicatorUnitSubgroup.iusnid == item.iusnid)
                .first()
            )
            if not ius:
                raise NotFound(f"IUS NID '{item.iusnid}' not found")
            indicator_nid = ius.indicator_nid
            unit_nid = ius.unit_nid
            subgroup_val_nid = ius.subgroup_val_nid
            iusnid = ius.iusnid
        else:
            indicator_nid = item.indicator_nid
            unit_nid = item.unit_nid
            subgroup_val_nid = item.subgroup_val_nid

            if indicator_nid is not None:
                rec = dw_db.query(IndLocale).filter(IndLocale.indicator_nid == indicator_nid).first()
                if not rec:
                    row_errors.append(f"indicator NID '{indicator_nid}' not found")
            elif item.indicator_gid:
                rec = dw_db.query(IndLocale).filter(IndLocale.indicator_gid == item.indicator_gid).first()
                if rec:
                    indicator_nid = rec.indicator_nid
                else:
                    row_errors.append(f"indicator GID '{item.indicator_gid}' not found")
            else:
                row_errors.append("indicator_nid could not be resolved (provide i_nid or i_gid)")

            if unit_nid is not None:
                rec = dw_db.query(UnitLocale).filter(UnitLocale.unit_nid == unit_nid).first()
                if not rec:
                    row_errors.append(f"unit NID '{unit_nid}' not found")
            elif item.u_gid:
                rec = dw_db.query(UnitLocale).filter(UnitLocale.unit_gid == item.u_gid).first()
                if rec:
                    unit_nid = rec.unit_nid
                else:
                    row_errors.append(f"unit GID '{item.u_gid}' not found")
            else:
                row_errors.append("unit_nid could not be resolved (provide u_nid or u_gid)")

            if subgroup_val_nid is not None:
                rec = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_nid == subgroup_val_nid).first()
                if not rec:
                    row_errors.append(f"subgroup_val NID '{subgroup_val_nid}' not found")
            elif item.sg_gid:
                rec = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_gid == item.sg_gid).first()
                if rec:
                    subgroup_val_nid = rec.subgroup_val_nid
                else:
                    row_errors.append(f"subgroup_val GID '{item.sg_gid}' not found")
            else:
                row_errors.append("subgroup_val_nid could not be resolved (provide sg_nid or sg_gid)")

            if indicator_nid is not None and unit_nid is not None and subgroup_val_nid is not None:
                ius_rec = (
                    dw_db.query(IndicatorUnitSubgroup)
                    .filter(
                        IndicatorUnitSubgroup.indicator_nid == indicator_nid,
                        IndicatorUnitSubgroup.unit_nid == unit_nid,
                        IndicatorUnitSubgroup.subgroup_val_nid == subgroup_val_nid,
                    )
                    .first()
                )
                if ius_rec:
                    iusnid = ius_rec.iusnid
                else:
                    row_errors.append(
                        "no IUS record found for "
                        f"(indicator_nid={indicator_nid}, unit_nid={unit_nid}, subgroup_val_nid={subgroup_val_nid})"
                    )

        area_nid: Optional[int] = None
        if item.area_nid is not None:
            rec = dw_db.query(ArLocale).filter(ArLocale.area_nid == item.area_nid).first()
            if not rec:
                row_errors.append(f"area NID '{item.area_nid}' not found")
            else:
                area_nid = item.area_nid
        elif item.ar_id:
            area_nid = self._area_id_to_nid(dw_db, ArLocale, item.ar_id)
            if area_nid is None:
                row_errors.append(f"area ID '{item.ar_id}' not found")
        else:
            row_errors.append("area_nid could not be resolved (provide ar_nid or ar_id)")

        timeperiod_nid = item.timeperiod_nid
        if timeperiod_nid is not None:
            tp_row = dw_db.query(TimePeriod).filter(TimePeriod.timeperiod_nid == timeperiod_nid).first()
            if not tp_row:
                row_errors.append(f"timeperiod NID '{timeperiod_nid}' not found")
        else:
            row_errors.append("timeperiod_nid is required (provide tp_nid)")

        source_nid: Optional[int] = item.source_nid
        if source_nid is not None:
            rec = dw_db.query(IcLocale).filter(IcLocale.ic_nid == source_nid).first()
            if not rec:
                row_errors.append(f"source/IC NID '{source_nid}' not found")
        elif item.ic_gid:
            rec = dw_db.query(IcLocale).filter(IcLocale.ic_gid == item.ic_gid).first()
            if rec:
                source_nid = rec.ic_nid
            else:
                row_errors.append(f"IC GID '{item.ic_gid}' not found")

        footnote_nid: Optional[int] = None
        if resolve_footnote:
            try:
                footnote_nid = _resolve_footnote(
                    dw_db,
                    locale,
                    fn_nid=item.footnote_nid,
                    fn_gid=item.fn_gid,
                    fn_caption=item.fn,
                )
            except ValueError as fn_err:
                row_errors.append(str(fn_err))

        if row_errors:
            raise ValueError("; ".join(row_errors))

        if iusnid is None or area_nid is None or timeperiod_nid is None:
            raise ValueError("Could not resolve IUS, area, or time period for this row")
        if indicator_nid is None or unit_nid is None:
            raise ValueError("Could not resolve indicator or unit for this row")

        vf = self._value_fields_for_unified_datapoint_upsert(item)
        if vf.get("data_value") is None and vf.get("textual_data_value") is None:
            raise ValueError("observation value resolved to empty; provide a non-empty dt_value or data_value/textual_data_value")

        return {
            "iusnid": iusnid,
            "indicator_nid": int(indicator_nid),
            "unit_nid": int(unit_nid),
            "subgroup_val_nid": int(subgroup_val_nid) if subgroup_val_nid is not None else None,
            "area_nid": int(area_nid),
            "timeperiod_nid": int(timeperiod_nid),
            "source_nid": int(source_nid) if source_nid is not None else None,
            "footnote_nid": (int(footnote_nid) if footnote_nid is not None else None),
            "data_value": vf["data_value"],
            "textual_data_value": vf["textual_data_value"],
            "data_entry_note": item.data_entry_note,
        }

    def upsert_data(
        self,
        dw_id: str,
        items: list,
        locale: str = "en",
    ) -> dict:
        """
        Upsert (insert / update / smart-delete) fact rows in ut_data.

        For each item:
          1. Resolve GIDs → NIDs for indicator, unit, subgroup_val, area, IC/source.
          2. Resolve footnote via 3-step cascade: fn_nid → fn_gid → fn caption (auto-create).
          3. Process dt_value → data_value / textual_data_value / istextualdata.
          4. Compute iunid = "{indicator_nid},{unit_nid}".
          5. Resolve iusnid from (indicator_nid, unit_nid, subgroup_val_nid).
          6. Smart-delete condition: fn_nid IS NULL AND dt_value blank.
          7. Composite match on (area_nid, indicator_nid, unit_nid, subgroup_val_nid, timeperiod_nid).
          8. INSERT / UPDATE / DELETE accordingly.

        All rows share one transaction; any resolution failure rolls back everything and raises ValueError.
        Returns {"inserted": N, "updated": N, "deleted": N}.
        """
        IndLocale = Indicator(locale)
        UnitLocale = Unit(locale)
        SvLocale = SubgroupVal(locale)
        IcLocale = IndicatorClassification(locale)
        ArLocale = Area(locale)

        errors: list[dict] = []
        resolved: list[dict] = []

        with get_warehouse_session_from_id(dw_id) as dw_db:
            for idx, item in enumerate(items):
                indicator_nid = item.indicator_nid
                unit_nid = item.unit_nid
                subgroup_val_nid = item.subgroup_val_nid
                area_nid = item.area_nid
                source_nid = item.source_nid
                row_errors: list[str] = []

                # --- Indicator ---
                if indicator_nid is not None:
                    rec = dw_db.query(IndLocale).filter(IndLocale.indicator_nid == indicator_nid).first()
                    if not rec:
                        row_errors.append(f"indicator NID '{indicator_nid}' not found")
                elif item.indicator_gid:
                    rec = dw_db.query(IndLocale).filter(IndLocale.indicator_gid == item.indicator_gid).first()
                    if rec:
                        indicator_nid = rec.indicator_nid
                    else:
                        row_errors.append(f"indicator GID '{item.indicator_gid}' not found")
                else:
                    row_errors.append("indicator_nid could not be resolved (provide i_nid or i_gid)")

                # --- Unit ---
                if unit_nid is not None:
                    rec = dw_db.query(UnitLocale).filter(UnitLocale.unit_nid == unit_nid).first()
                    if not rec:
                        row_errors.append(f"unit NID '{unit_nid}' not found")
                elif item.u_gid:
                    rec = dw_db.query(UnitLocale).filter(UnitLocale.unit_gid == item.u_gid).first()
                    if rec:
                        unit_nid = rec.unit_nid
                    else:
                        row_errors.append(f"unit GID '{item.u_gid}' not found")
                else:
                    row_errors.append("unit_nid could not be resolved (provide u_nid or u_gid)")

                # --- Subgroup value ---
                if subgroup_val_nid is not None:
                    rec = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_nid == subgroup_val_nid).first()
                    if not rec:
                        row_errors.append(f"subgroup_val NID '{subgroup_val_nid}' not found")
                elif item.sg_gid:
                    rec = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_gid == item.sg_gid).first()
                    if rec:
                        subgroup_val_nid = rec.subgroup_val_nid
                    else:
                        row_errors.append(f"subgroup_val GID '{item.sg_gid}' not found")
                else:
                    row_errors.append("subgroup_val_nid could not be resolved (provide sg_nid or sg_gid)")

                # --- Area ---
                if area_nid is not None:
                    rec = dw_db.query(ArLocale).filter(ArLocale.area_nid == area_nid).first()
                    if not rec:
                        row_errors.append(f"area NID '{area_nid}' not found")
                elif item.ar_id:
                    area_nid = self._area_id_to_nid(dw_db, ArLocale, item.ar_id)
                    if area_nid is None:
                        row_errors.append(f"area ID '{item.ar_id}' not found")
                else:
                    row_errors.append("area_nid could not be resolved (provide ar_nid or ar_id)")

                # --- Time period ---
                timeperiod_nid = item.timeperiod_nid
                if timeperiod_nid is not None:
                    tp_row = dw_db.query(TimePeriod).filter(TimePeriod.timeperiod_nid == timeperiod_nid).first()
                    if not tp_row:
                        row_errors.append(f"timeperiod NID '{timeperiod_nid}' not found")
                else:
                    row_errors.append("timeperiod_nid is required (provide tp_nid)")

                # --- Source / IC ---
                if source_nid is not None:
                    rec = dw_db.query(IcLocale).filter(IcLocale.ic_nid == source_nid).first()
                    if not rec:
                        row_errors.append(f"source/IC NID '{source_nid}' not found")
                elif item.ic_gid:
                    rec = dw_db.query(IcLocale).filter(IcLocale.ic_gid == item.ic_gid).first()
                    if rec:
                        source_nid = rec.ic_nid
                    else:
                        row_errors.append(f"IC GID '{item.ic_gid}' not found")
                # source_nid optional — no error when both absent

                # --- Footnote (3-step cascade) ---
                footnote_nid = None
                try:
                    footnote_nid = _resolve_footnote(
                        dw_db, locale,
                        fn_nid=item.footnote_nid,
                        fn_gid=item.fn_gid,
                        fn_caption=item.fn,
                    )
                except ValueError as fn_err:
                    row_errors.append(str(fn_err))

                # --- IUS NID ---
                iusnid = None
                if indicator_nid is not None and unit_nid is not None and subgroup_val_nid is not None:
                    ius_rec = (
                        dw_db.query(IndicatorUnitSubgroup)
                        .filter(
                            IndicatorUnitSubgroup.indicator_nid == indicator_nid,
                            IndicatorUnitSubgroup.unit_nid == unit_nid,
                            IndicatorUnitSubgroup.subgroup_val_nid == subgroup_val_nid,
                        )
                        .first()
                    )
                    if ius_rec:
                        iusnid = ius_rec.iusnid
                    else:
                        row_errors.append(
                            f"no IUS record found for "
                            f"(indicator_nid={indicator_nid}, unit_nid={unit_nid}, subgroup_val_nid={subgroup_val_nid})"
                        )

                if row_errors:
                    errors.append({"index": idx, "error": "; ".join(row_errors)})
                    continue

                # --- dt_value processing ---
                value_fields = _process_data_value(item.dt_value)

                # --- iunid ---
                iunid = f"{indicator_nid},{unit_nid}" if indicator_nid is not None and unit_nid is not None else None

                resolved.append({
                    "indicator_nid": indicator_nid,
                    "unit_nid": unit_nid,
                    "subgroup_val_nid": subgroup_val_nid,
                    "area_nid": area_nid,
                    "timeperiod_nid": timeperiod_nid,
                    "footnote_nid": footnote_nid,
                    "source_nid": source_nid,
                    "iusnid": iusnid,
                    "iunid": iunid,
                    "dt_value": item.dt_value,
                    **value_fields,
                })

            inserted = updated = deleted = 0
            inserted_ids: list[int] = []
            updated_ids: list[int] = []
            deleted_ids: list[int] = []

            # Pre-compute the globally most-recent timeperiod (max enddate) once for the batch.
            mrd_tp_row = (
                dw_db.query(TimePeriod)
                .filter(TimePeriod.enddate.isnot(None))
                .order_by(TimePeriod.enddate.desc())
                .first()
            )
            max_mrd_tp_nid = mrd_tp_row.timeperiod_nid if mrd_tp_row else None

            for r in resolved:
                # Smart-delete: fn_nid absent AND dt_value blank
                is_smart_delete = (
                    r["footnote_nid"] is None
                    and (r["dt_value"] is None or r["dt_value"] == "")
                )

                # Composite match key: (area_nid, indicator_nid, unit_nid, subgroup_val_nid, timeperiod_nid)
                existing = (
                    dw_db.query(Data)
                    .filter(
                        Data.area_nid == r["area_nid"],
                        Data.indicator_nid == r["indicator_nid"],
                        Data.unit_nid == r["unit_nid"],
                        Data.subgroup_val_nid == r["subgroup_val_nid"],
                        Data.timeperiod_nid == r["timeperiod_nid"],
                    )
                    .first()
                )

                is_mrd = (r["timeperiod_nid"] == max_mrd_tp_nid) if max_mrd_tp_nid is not None else False

                if is_smart_delete:
                    if existing:
                        deleted_ids.append(int(existing.data_nid))
                        dw_db.delete(existing)
                        deleted += 1
                elif existing:
                    updated_ids.append(int(existing.data_nid))
                    existing.iusnid = r["iusnid"]
                    existing.iunid = r["iunid"]
                    existing.footnote_nid = r["footnote_nid"]
                    existing.source_nid = r["source_nid"]
                    existing.data_value = r["data_value"]
                    existing.textual_data_value = r["textual_data_value"]
                    existing.istextualdata = r["istextualdata"]
                    existing.ismrd = is_mrd
                    updated += 1
                else:
                    new_row = Data(
                        iusnid=r["iusnid"],
                        iunid=r["iunid"],
                        indicator_nid=r["indicator_nid"],
                        unit_nid=r["unit_nid"],
                        subgroup_val_nid=r["subgroup_val_nid"],
                        timeperiod_nid=r["timeperiod_nid"],
                        area_nid=r["area_nid"],
                        footnote_nid=r["footnote_nid"],
                        source_nid=r["source_nid"],
                        data_value=r["data_value"],
                        textual_data_value=r["textual_data_value"],
                        istextualdata=r["istextualdata"],
                        ismrd=is_mrd,
                    )
                    dw_db.add(new_row)
                    dw_db.flush()
                    inserted_ids.append(int(new_row.data_nid))
                    inserted += 1

            batch_desc = f"inserted={inserted} updated={updated} deleted={deleted}"
            if inserted_ids:
                buffer_manual_audit(
                    dw_db,
                    action="CREATE",
                    module="data",
                    description=batch_desc,
                    new_value=deleted_ids_preview(inserted_ids),
                )
            if updated_ids:
                updated_preview = deleted_ids_preview(updated_ids)
                buffer_manual_audit(
                    dw_db,
                    action="UPDATE",
                    module="data",
                    description=batch_desc,
                    previous_value=updated_preview,
                    new_value=updated_preview,
                )
            if deleted_ids:
                buffer_manual_audit(
                    dw_db,
                    action="DELETE",
                    module="data",
                    description=batch_desc,
                    previous_value=deleted_ids_preview(deleted_ids),
                )
            dw_db.commit()

        if inserted or updated or deleted:
            notify_dbmetadata_counts_changed(dw_id)
        return {"inserted": inserted, "updated": updated, "deleted": deleted, "errors": errors}


    def delete_data(
        self,
        dw_id: str,
        *,
        i_identifier: Optional[str] = None,
        u_identifier: Optional[str] = None,
        sg_identifier: Optional[str] = None,
        ar_identifier: Optional[str] = None,
        tp_nid: Optional[str] = None,
        tp_timeperiod: Optional[str] = None,
        ic_identifier: Optional[str] = None,
        locale: str = "en",
    ) -> dict:
        """
        Bulk-delete ut_data rows matching the provided filters.
        At least one filter must be provided. All identifiers are validated for existence.
        Identifier filters accept NID (numeric) or GID/string where applicable.
        Time period filter uses tp_nid and tp_timeperiod.
        Returns {"deleted_rows": N}.
        """
        if all(v is None for v in (i_identifier, u_identifier, sg_identifier,
                                    ar_identifier, tp_nid, tp_timeperiod, ic_identifier)):
            raise ValueError("AT_LEAST_ONE_FILTER")

        IndLocale = Indicator(locale)
        UnitLocale = Unit(locale)
        SvLocale = SubgroupVal(locale)
        IcLocale = IndicatorClassification(locale)
        ArLocale = Area(locale)

        errors: list[str] = []
        indicator_nid_f: Optional[int] = None
        unit_nid_f: Optional[int] = None
        subgroup_val_nid_f: Optional[int] = None
        area_nid_f: Optional[int] = None
        timeperiod_nid_f: Optional[int] = None
        source_nid_f: Optional[int] = None

        with get_warehouse_session_from_id(dw_id) as dw_db:
            # --- Indicator ---
            if i_identifier is not None:
                nid = _int_or_none(i_identifier)
                if nid is not None:
                    rec = dw_db.query(IndLocale).filter(IndLocale.indicator_nid == nid).first()
                    if not rec:
                        errors.append(f"indicator NID '{nid}' not found")
                    else:
                        indicator_nid_f = nid
                else:
                    rec = dw_db.query(IndLocale).filter(IndLocale.indicator_gid == i_identifier).first()
                    if not rec:
                        errors.append(f"indicator GID '{i_identifier}' not found")
                    else:
                        indicator_nid_f = rec.indicator_nid

            # --- Unit ---
            if u_identifier is not None:
                nid = _int_or_none(u_identifier)
                if nid is not None:
                    rec = dw_db.query(UnitLocale).filter(UnitLocale.unit_nid == nid).first()
                    if not rec:
                        errors.append(f"unit NID '{nid}' not found")
                    else:
                        unit_nid_f = nid
                else:
                    rec = dw_db.query(UnitLocale).filter(UnitLocale.unit_gid == u_identifier).first()
                    if not rec:
                        errors.append(f"unit GID '{u_identifier}' not found")
                    else:
                        unit_nid_f = rec.unit_nid

            # --- Subgroup value ---
            if sg_identifier is not None:
                nid = _int_or_none(sg_identifier)
                if nid is not None:
                    rec = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_nid == nid).first()
                    if not rec:
                        errors.append(f"subgroup_val NID '{nid}' not found")
                    else:
                        subgroup_val_nid_f = nid
                else:
                    rec = dw_db.query(SvLocale).filter(SvLocale.subgroup_val_gid == sg_identifier).first()
                    if not rec:
                        errors.append(f"subgroup_val GID '{sg_identifier}' not found")
                    else:
                        subgroup_val_nid_f = rec.subgroup_val_nid

            # --- Area ---
            if ar_identifier is not None:
                nid = _int_or_none(ar_identifier)
                if nid is not None:
                    rec = dw_db.query(ArLocale).filter(ArLocale.area_nid == nid).first()
                    if not rec:
                        errors.append(f"area NID '{nid}' not found")
                    else:
                        area_nid_f = nid
                else:
                    resolved = self._area_id_to_nid(dw_db, ArLocale, ar_identifier)
                    if resolved is None:
                        errors.append(f"area ID '{ar_identifier}' not found")
                    else:
                        area_nid_f = resolved

            # --- Time period ---
            tp_nid_resolved: Optional[int] = None
            if tp_nid is not None:
                tp_nid_resolved = _int_or_none(tp_nid)
                if tp_nid_resolved is None:
                    errors.append(f"timeperiod NID '{tp_nid}' is invalid")
                else:
                    row = dw_db.query(TimePeriod).filter(TimePeriod.timeperiod_nid == tp_nid_resolved).first()
                    if not row:
                        errors.append(f"timeperiod NID '{tp_nid_resolved}' not found")

            tp_timeperiod_resolved: Optional[int] = None
            if tp_timeperiod is not None:
                tp_timeperiod_resolved = self._timeperiod_to_nid(dw_db, tp_timeperiod)
                if tp_timeperiod_resolved is None:
                    errors.append(f"timeperiod '{tp_timeperiod}' not found")

            if tp_nid_resolved is not None and tp_timeperiod_resolved is not None:
                if tp_nid_resolved != tp_timeperiod_resolved:
                    errors.append("tp_nid and tp_timeperiod refer to different time periods")
                else:
                    timeperiod_nid_f = tp_nid_resolved
            elif tp_nid_resolved is not None:
                timeperiod_nid_f = tp_nid_resolved
            elif tp_timeperiod_resolved is not None:
                timeperiod_nid_f = tp_timeperiod_resolved

            # --- IC / Source ---
            if ic_identifier is not None:
                nid = _int_or_none(ic_identifier)
                if nid is not None:
                    rec = dw_db.query(IcLocale).filter(IcLocale.ic_nid == nid).first()
                    if not rec:
                        errors.append(f"IC/source NID '{nid}' not found")
                    else:
                        source_nid_f = nid
                else:
                    rec = dw_db.query(IcLocale).filter(IcLocale.ic_gid == ic_identifier).first()
                    if not rec:
                        errors.append(f"IC GID '{ic_identifier}' not found")
                    else:
                        source_nid_f = rec.ic_nid

            if errors:
                raise ValueError("VALIDATION_FAILED:" + "; ".join(errors))

            q = dw_db.query(Data)
            if indicator_nid_f is not None:
                q = q.filter(Data.indicator_nid == indicator_nid_f)
            if unit_nid_f is not None:
                q = q.filter(Data.unit_nid == unit_nid_f)
            if subgroup_val_nid_f is not None:
                q = q.filter(Data.subgroup_val_nid == subgroup_val_nid_f)
            if area_nid_f is not None:
                q = q.filter(Data.area_nid == area_nid_f)
            if timeperiod_nid_f is not None:
                q = q.filter(Data.timeperiod_nid == timeperiod_nid_f)
            if source_nid_f is not None:
                q = q.filter(Data.source_nid == source_nid_f)

            deleted_ids = [r[0] for r in q.with_entities(Data.data_nid).all()]
            deleted_count = q.delete(synchronize_session=False)
            if deleted_ids:
                buffer_manual_audit(
                    dw_db,
                    action="DELETE",
                    module="data",
                    description=f"Bulk deleted {deleted_count} data rows",
                    previous_value=deleted_ids_preview(deleted_ids),
                )
            dw_db.commit()

        if deleted_count:
            notify_dbmetadata_counts_changed(dw_id)
        return {"deleted_rows": deleted_count}


def _int_or_none(s: str) -> Optional[int]:
    try:
        return int(s)
    except (ValueError, TypeError):
        return None
