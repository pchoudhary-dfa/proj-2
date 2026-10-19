"""
IUS (Indicator-Unit-Subgroup) service for list operations.
Uses ut_indicator_unit_subgroup. Filtering via ius_scope and GID-based params.
API response keys are applied via db_tbl_cols_mapping.json (IUS entity).
"""
import logging
from typing import List, Optional, Dict, Any, Set, Tuple, Union

from sqlalchemy.orm import Session
from sqlalchemy import or_

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.config.config import settings
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.shared.exceptions import NotFound
from apps.datawarehouse.models.datawarehouse import (
    IndicatorUnitSubgroup,
    Data,
    IcIus,
    Indicator,
    Unit,
    SubgroupVal,
    IndicatorClassification,
    SubgroupValsSubgroup,
    get_default_locale,
)
from apps.datawarehouse.constants import INDICATOR_SEARCH_BOOLEAN_ENTITIES
from apps.datawarehouse.schemas.ius import IUSResponseSchema
from apps.datawarehouse.services.ius_creation import (
    create_ius_record,
    get_subgroup_val_nids_from_sg_catg_val_nids,
    resolve_ius_sg_catg_val_nids,
)

logger = logging.getLogger(__name__)


# Map from API alias (external) / internal ORM field names to ORM column attr names on IndicatorUnitSubgroup
_SORT_FIELD_MAP: Dict[str, str] = {
    # external aliases
    "ius_nid": "iusnid",
    "i_nid": "indicator_nid",
    "u_nid": "unit_nid",
    "sg_nid": "subgroup_val_nid",
    "ius_min_value": "min_value",
    "ius_max_value": "max_value",
    "ius_has_data": "data_exist",
    "ius_is_default_subgroup": "isdefaultsubgroup",
    # internal names (pass-through)
    "iusnid": "iusnid",
    "indicator_nid": "indicator_nid",
    "unit_nid": "unit_nid",
    "subgroup_val_nid": "subgroup_val_nid",
    "min_value": "min_value",
    "max_value": "max_value",
    "data_exist": "data_exist",
    "isdefaultsubgroup": "isdefaultsubgroup",
}


def _record_to_ius(record: Any) -> Dict[str, Any]:
    """Map IUS ORM record to dict using schema (single source of truth)."""
    return IUSResponseSchema.from_record(record)


def _parse_search_term_as_bool(term: str) -> Optional[bool]:
    """Parse a search term as boolean for indicator boolean entities. Returns None if not recognized."""
    t = (term or "").strip().lower()
    if t in ("true", "1", "yes"):
        return True
    if t in ("false", "0", "no"):
        return False
    return None


def _get_ius_gid_separator() -> str:
    """Return the IUS composite GID separator from system_configuration (via ius_utils; default "|")."""
    from apps.shared.utils.ius_utils import get_ius_gid_separator
    return get_ius_gid_separator()


def _resolve_ius_identifier(
    dw_db: Session,
    identifier: str,
    language_code: str,
) -> Any:
    """
    Resolve an IUS identifier string to an IndicatorUnitSubgroup ORM row.

    Supported formats:
      - All digits          → iusnid direct lookup
      - composite all digits → composite NID (indicator_nid, unit_nid, subgroup_val_nid; separator from IUS_GID_SEPARATOR)
      - composite non-digits  → composite GID (indicator_gid, unit_gid, subgroup_val_gid; separator from IUS_GID_SEPARATOR)

    Returns the ORM row or None if not found.
    """
    identifier = identifier.strip()
    sep = _get_ius_gid_separator()

    # Numeric → iusnid
    if identifier.isdigit():
        return (
            dw_db.query(IndicatorUnitSubgroup)
            .filter(IndicatorUnitSubgroup.iusnid == int(identifier))
            .first()
        )

    # Composite (separator from IUS_GID_SEPARATOR, e.g. | or ~)
    if sep and sep in identifier:
        parts = identifier.split(sep)
        if len(parts) != 3:
            return None

        # All parts numeric → composite NID
        if all(p.strip().isdigit() for p in parts):
            i_nid, u_nid, sv_nid = (int(p.strip()) for p in parts)
            return (
                dw_db.query(IndicatorUnitSubgroup)
                .filter(
                    IndicatorUnitSubgroup.indicator_nid == i_nid,
                    IndicatorUnitSubgroup.unit_nid == u_nid,
                    IndicatorUnitSubgroup.subgroup_val_nid == sv_nid,
                )
                .first()
            )

        # Composite GID → resolve each GID to its NID then query
        i_gid, u_gid, sv_gid = (p.strip() for p in parts)
        IndicatorModel = Indicator(language_code)
        UnitModel = Unit(language_code)
        SubgroupValModel = SubgroupVal(language_code)

        i_nid_row = dw_db.query(IndicatorModel.indicator_nid).filter(IndicatorModel.indicator_gid == i_gid).first()
        u_nid_row = dw_db.query(UnitModel.unit_nid).filter(UnitModel.unit_gid == u_gid).first()
        sv_nid_row = dw_db.query(SubgroupValModel.subgroup_val_nid).filter(SubgroupValModel.subgroup_val_gid == sv_gid).first()

        if not i_nid_row or not u_nid_row or not sv_nid_row:
            return None

        return (
            dw_db.query(IndicatorUnitSubgroup)
            .filter(
                IndicatorUnitSubgroup.indicator_nid == i_nid_row[0],
                IndicatorUnitSubgroup.unit_nid == u_nid_row[0],
                IndicatorUnitSubgroup.subgroup_val_nid == sv_nid_row[0],
            )
            .first()
        )

    return None


def resolve_ius_by_indicator_unit_subgroup_gids(
    dw_db: Session,
    language_code: str,
    indicator_gid: str,
    unit_gid: str,
    subgroup_val_gid: str,
) -> Any:
    """
    Resolve ``ut_indicator_unit_subgroup`` row from indicator / unit / subgroup value GIDs.

    Same resolution rules as the composite-GID branch of ``_resolve_ius_identifier``.
    Returns the ORM row or ``None`` if any GID is missing/unknown or the IUS tuple does not exist.
    """
    i_gid = (indicator_gid or "").strip()
    u_gid = (unit_gid or "").strip()
    sv_gid = (subgroup_val_gid or "").strip()
    if not i_gid or not u_gid or not sv_gid:
        return None

    IndicatorModel = Indicator(language_code)
    UnitModel = Unit(language_code)
    SubgroupValModel = SubgroupVal(language_code)

    i_nid_row = dw_db.query(IndicatorModel.indicator_nid).filter(IndicatorModel.indicator_gid == i_gid).first()
    u_nid_row = dw_db.query(UnitModel.unit_nid).filter(UnitModel.unit_gid == u_gid).first()
    sv_nid_row = dw_db.query(SubgroupValModel.subgroup_val_nid).filter(SubgroupValModel.subgroup_val_gid == sv_gid).first()

    if not i_nid_row or not u_nid_row or not sv_nid_row:
        return None

    return (
        dw_db.query(IndicatorUnitSubgroup)
        .filter(
            IndicatorUnitSubgroup.indicator_nid == i_nid_row[0],
            IndicatorUnitSubgroup.unit_nid == u_nid_row[0],
            IndicatorUnitSubgroup.subgroup_val_nid == sv_nid_row[0],
        )
        .first()
    )


def get_subgroup_nids(dw_db: Session, subgroup_val_nid: int) -> str:
    """
    Get comma-separated subgroup NIDs for a given subgroup value NID.

    Queries the SubgroupValsSubgroup table to find all subgroup NIDs
    associated with a specific subgroup value NID.

    Args:
        dw_db: Datawarehouse database session
        subgroup_val_nid: Subgroup value NID to lookup

    Returns:
        Comma-separated string of subgroup NIDs, or empty string if none found
    """
    records = dw_db.query(SubgroupValsSubgroup).filter(
        SubgroupValsSubgroup.subgroup_val_nid == subgroup_val_nid
    ).order_by(SubgroupValsSubgroup.subgroup_nid).all()

    if not records:
        return ""

    subgroup_nids = sorted(set(record.subgroup_nid for record in records if record.subgroup_nid))
    return ",".join(str(nid) for nid in subgroup_nids)


def _resolve_gids_to_nids(
    db: Session,
    model_class: Any,
    gid_column_attr: str,
    nid_column_attr: str,
    gids: List[str],
) -> List[int]:
    """Query the DB to resolve a list of GID strings to their integer NID values."""
    gid_col = getattr(model_class, gid_column_attr)
    nid_col = getattr(model_class, nid_column_attr)
    rows = db.query(nid_col).filter(gid_col.in_(gids)).all()
    return [r[0] for r in rows if r[0] is not None]


def _resolve_ic_filter_nids(
    dw_db: Session,
    language_code: str,
    ic_nids: Optional[List[int]],
    ic_gids: Optional[List[str]],
    ic_type: Optional[str],
) -> Optional[List[int]]:
    """
    Resolve IC NIDs for GET /indicators IC filters (ic_identifier, ic_type).

    Returns None when no IC filter params are provided; [] when filters match nothing.
    """
    if not ic_nids and not ic_gids and not ic_type:
        return None

    ICModel = IndicatorClassification(language_code)
    ic_filter_nids: Optional[List[int]] = None
    if ic_nids:
        ic_filter_nids = list(ic_nids)
    elif ic_gids:
        resolved_ic_nids = _resolve_gids_to_nids(dw_db, ICModel, "ic_gid", "ic_nid", ic_gids)
        if not resolved_ic_nids:
            return []
        ic_filter_nids = resolved_ic_nids

    if ic_type:
        ic_type_nids = [
            r[0]
            for r in dw_db.query(ICModel.ic_nid).filter(ICModel.ic_type == ic_type).all()
            if r[0] is not None
        ]
        if not ic_type_nids:
            return []
        ic_filter_nids = (
            list(set(ic_filter_nids) & set(ic_type_nids))
            if ic_filter_nids is not None
            else list(ic_type_nids)
        )
        if not ic_filter_nids:
            return []

    return ic_filter_nids


class IusService:
    """Service for IUS (Indicator-Unit-Subgroup) list operations."""

    def get_all_ius(
        self,
        dw_id: str,
        language_code: str = "en",
        ius_scope: Optional[str] = None,
        i_gids: Optional[List[str]] = None,
        u_gids: Optional[List[str]] = None,
        sg_gids: Optional[List[str]] = None,
        ic_gids: Optional[List[str]] = None,
        i_nids: Optional[List[int]] = None,
        u_nids: Optional[List[int]] = None,
        sg_nids: Optional[List[int]] = None,
        ic_nids: Optional[List[int]] = None,
        ic_type: Optional[str] = None,
        sort_field: Optional[str] = None,
        sort_order: Optional[str] = None,
        with_validation: bool = False,
        page: int = 1,
        page_size: Optional[int] = 10,
        indicator_nid: Optional[int] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        List IUS records for the data warehouse with pagination and filtering.

        Args:
            dw_id: Data warehouse identifier
            language_code: Locale code for GID resolution (locale-specific tables).
            ius_scope: Scope filter: ALL_IC, MAPPED_IC, UNMAPPED_IC, HAS_DATA, NO_DATA, DEFAULT.
            i_gids: Indicator GIDs to filter by (mutually exclusive with i_nids).
            u_gids: Unit GIDs to filter by (mutually exclusive with u_nids).
            sg_gids: Subgroup val GIDs to filter by (mutually exclusive with sg_nids).
            ic_gids: IC GIDs; filters IUS mapped to those ICs (mutually exclusive with ic_nids).
            i_nids: Indicator NIDs to filter by directly (bypasses GID resolution).
            u_nids: Unit NIDs to filter by directly (bypasses GID resolution).
            sg_nids: Subgroup val NIDs to filter by directly (bypasses GID resolution).
            ic_nids: IC NIDs to filter by directly (bypasses GID resolution).
            ic_type: IC type (e.g. SC, TH); filters IUS mapped to ICs of that type.
            sort_field: Field name (alias or internal) to sort by.
            sort_order: "asc" or "desc".
            with_validation: If True, include empty validations placeholder per IUS.
            page: Page number (1-based).
            page_size: Number of records per page.
            indicator_nid: Legacy single-indicator filter (kept for backward compat).

        Returns:
            Tuple of (list of dicts with IUS fields, total count).
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)
            SubgroupValModel = SubgroupVal(language_code)
            ICModel = IndicatorClassification(language_code)

            q = dw_db.query(IndicatorUnitSubgroup)

            # --- GID-based filters ---
            if indicator_nid is not None:
                q = q.filter(IndicatorUnitSubgroup.indicator_nid == indicator_nid)

            if i_nids:
                q = q.filter(IndicatorUnitSubgroup.indicator_nid.in_(i_nids))
            elif i_gids:
                nids = _resolve_gids_to_nids(dw_db, IndicatorModel, "indicator_gid", "indicator_nid", i_gids)
                if not nids:
                    return [], 0
                q = q.filter(IndicatorUnitSubgroup.indicator_nid.in_(nids))

            if u_nids:
                q = q.filter(IndicatorUnitSubgroup.unit_nid.in_(u_nids))
            elif u_gids:
                nids = _resolve_gids_to_nids(dw_db, UnitModel, "unit_gid", "unit_nid", u_gids)
                if not nids:
                    return [], 0
                q = q.filter(IndicatorUnitSubgroup.unit_nid.in_(nids))

            if sg_nids:
                q = q.filter(IndicatorUnitSubgroup.subgroup_val_nid.in_(sg_nids))
            elif sg_gids:
                nids = _resolve_gids_to_nids(dw_db, SubgroupValModel, "subgroup_val_gid", "subgroup_val_nid", sg_gids)
                if not nids:
                    return [], 0
                q = q.filter(IndicatorUnitSubgroup.subgroup_val_nid.in_(nids))

            # --- IC-based filters (resolve via ut_ic_ius) ---
            ic_filter_nids: Optional[List[int]] = None
            ic_type_nids_set: Optional[Set[int]] = None
            if ic_nids:
                ic_filter_nids = ic_nids
            elif ic_gids:
                resolved_ic_nids = _resolve_gids_to_nids(dw_db, ICModel, "ic_gid", "ic_nid", ic_gids)
                if not resolved_ic_nids:
                    return [], 0
                ic_filter_nids = resolved_ic_nids

            if ic_type:
                ic_type_nids = [
                    r[0]
                    for r in dw_db.query(ICModel.ic_nid).filter(ICModel.ic_type == ic_type).all()
                    if r[0] is not None
                ]
                if not ic_type_nids:
                    return [], 0
                ic_type_nids_set = set(int(x) for x in ic_type_nids)
                ic_filter_nids = (
                    list(set(ic_filter_nids) & ic_type_nids_set)
                    if ic_filter_nids is not None
                    else list(ic_type_nids_set)
                )
                if not ic_filter_nids:
                    return [], 0

            if ic_filter_nids is not None:
                ius_via_ic = [
                    r[0]
                    for r in dw_db.query(IcIus.iusnid)
                    .filter(IcIus.ic_nid.in_(ic_filter_nids), IcIus.iusnid.isnot(None))
                    .distinct()
                    .all()
                    if r[0] is not None
                ]
                if not ius_via_ic:
                    return [], 0
                q = q.filter(IndicatorUnitSubgroup.iusnid.in_(ius_via_ic))

            # --- ius_scope filter ---
            if ius_scope and ius_scope != "ALL":
                if ius_scope == "MAPPED":
                    mapped_nids = [
                        r[0]
                        for r in dw_db.query(IcIus.iusnid).filter(IcIus.iusnid.isnot(None)).distinct().all()
                        if r[0] is not None
                    ]
                    if mapped_nids:
                        q = q.filter(IndicatorUnitSubgroup.iusnid.in_(mapped_nids))
                    else:
                        return [], 0

                elif ius_scope == "UNMAPPED":
                    mapped_nids = [
                        r[0]
                        for r in dw_db.query(IcIus.iusnid).filter(IcIus.iusnid.isnot(None)).distinct().all()
                        if r[0] is not None
                    ]
                    if mapped_nids:
                        q = q.filter(IndicatorUnitSubgroup.iusnid.notin_(mapped_nids))

                elif ius_scope == "HAS_DATA":
                    q = q.filter(IndicatorUnitSubgroup.data_exist.is_(True))

                elif ius_scope == "NO_DATA":
                    q = q.filter(
                        (IndicatorUnitSubgroup.data_exist.is_(False))
                        | (IndicatorUnitSubgroup.data_exist.is_(None))
                    )

                elif ius_scope == "DEFAULT":
                    q = q.filter(IndicatorUnitSubgroup.isdefaultsubgroup.is_(True))

            # --- Sorting ---
            orm_sort_col = None
            if sort_field:
                orm_attr = _SORT_FIELD_MAP.get(sort_field)
                if orm_attr:
                    col = getattr(IndicatorUnitSubgroup, orm_attr, None)
                    if col is not None:
                        orm_sort_col = col.desc() if sort_order == "desc" else col.asc()

            if orm_sort_col is not None:
                q = q.order_by(orm_sort_col)
            else:
                q = q.order_by(
                    IndicatorUnitSubgroup.indicator_nid.asc(),
                    IndicatorUnitSubgroup.unit_nid.asc(),
                    IndicatorUnitSubgroup.subgroup_val_nid.asc(),
                )

            total_count = q.count()
            if page_size is not None:
                page_size = max(1, min(page_size, 1000))
                skip = (max(1, page) - 1) * page_size
                rows = q.offset(skip).limit(page_size).all()
            else:
                rows = q.all()
            items = [_record_to_ius(r) for r in rows]

            # Enrich items with GIDs via batch NID→GID lookups
            if items:
                i_nids = list({item["indicator_nid"] for item in items})
                u_nids = list({item["unit_nid"] for item in items})
                sv_nids = list({item["subgroup_val_nid"] for item in items})

                i_gid_map = {
                    r[0]: r[1]
                    for r in dw_db.query(IndicatorModel.indicator_nid, IndicatorModel.indicator_gid)
                    .filter(IndicatorModel.indicator_nid.in_(i_nids)).all()
                }
                u_gid_map = {
                    r[0]: r[1]
                    for r in dw_db.query(UnitModel.unit_nid, UnitModel.unit_gid)
                    .filter(UnitModel.unit_nid.in_(u_nids)).all()
                }
                sg_gid_map = {
                    r[0]: r[1]
                    for r in dw_db.query(SubgroupValModel.subgroup_val_nid, SubgroupValModel.subgroup_val_gid)
                    .filter(SubgroupValModel.subgroup_val_nid.in_(sv_nids)).all()
                }

                for item in items:
                    item["indicator_gid"] = i_gid_map.get(item["indicator_nid"])
                    item["unit_gid"] = u_gid_map.get(item["unit_nid"])
                    item["subgroup_gid"] = sg_gid_map.get(item["subgroup_val_nid"])

            if with_validation:
                for item in items:
                    item["validations"] = []

            return items, total_count

    def get_indicator_nids_by_filters(
        self,
        dw_id: str,
        language_code: str = "en",
        u_gids: Optional[List[str]] = None,
        u_nids: Optional[List[int]] = None,
        sg_gids: Optional[List[str]] = None,
        sg_nids: Optional[List[int]] = None,
        ic_gids: Optional[List[str]] = None,
        ic_nids: Optional[List[int]] = None,
        ic_type: Optional[str] = None,
    ) -> Optional[List[int]]:
        """
        Return distinct indicator_nids that have at least one IUS matching the given
        unit/subgroup/IC filters. Used by the indicators list API to filter by u_identifier,
        sg_identifier, ic_identifier, ic_type.

        Returns None if no contextual filters are provided (no restriction); returns [] if
        filters are provided but no IUS match.
        """
        has_filter = any([u_gids, u_nids, sg_gids, sg_nids, ic_gids, ic_nids, ic_type])
        if not has_filter:
            return None

        with get_warehouse_session_from_id(dw_id) as dw_db:
            UnitModel = Unit(language_code)
            SubgroupValModel = SubgroupVal(language_code)

            q = dw_db.query(IndicatorUnitSubgroup.indicator_nid).distinct()

            if u_nids:
                q = q.filter(IndicatorUnitSubgroup.unit_nid.in_(u_nids))
            elif u_gids:
                nids = _resolve_gids_to_nids(dw_db, UnitModel, "unit_gid", "unit_nid", u_gids)
                if not nids:
                    return []
                q = q.filter(IndicatorUnitSubgroup.unit_nid.in_(nids))

            if sg_nids:
                q = q.filter(IndicatorUnitSubgroup.subgroup_val_nid.in_(sg_nids))
            elif sg_gids:
                nids = _resolve_gids_to_nids(
                    dw_db, SubgroupValModel, "subgroup_val_gid", "subgroup_val_nid", sg_gids
                )
                if not nids:
                    return []
                q = q.filter(IndicatorUnitSubgroup.subgroup_val_nid.in_(nids))

            ic_filter_nids = _resolve_ic_filter_nids(
                dw_db, language_code, ic_nids, ic_gids, ic_type
            )
            if ic_filter_nids is not None and not ic_filter_nids:
                return []

            if ic_filter_nids is not None:
                ius_via_ic = [
                    r[0]
                    for r in dw_db.query(IcIus.iusnid)
                    .filter(IcIus.ic_nid.in_(ic_filter_nids), IcIus.iusnid.isnot(None))
                    .distinct()
                    .all()
                    if r[0] is not None
                ]
                if not ius_via_ic:
                    return []
                q = q.filter(IndicatorUnitSubgroup.iusnid.in_(ius_via_ic))

            rows = q.all()
            return [r[0] for r in rows if r[0] is not None]

    def get_iusnids_for_ic_mapping_filter(
        self,
        dw_id: str,
        language_code: str,
        ic_nids: Optional[List[int]],
        ic_gids: Optional[List[str]],
        ic_type: Optional[str],
    ) -> Optional[Set[int]]:
        """
        Return IUS NIDs linked to ICs in ut_ic_ius for GET /indicators expansion.

        - ic_nids / ic_gids: restrict to those ICs (optional ic_type intersection).
        - ic_type only: all IUS mapped to any IC of that type.

        Returns None when no ic_nids, ic_gids, or ic_type filter is provided.
        """
        if not ic_nids and not ic_gids and not ic_type:
            return None

        with get_warehouse_session_from_id(dw_id) as dw_db:
            ic_filter_nids = _resolve_ic_filter_nids(
                dw_db, language_code, ic_nids, ic_gids, ic_type
            )
            if ic_filter_nids is None:
                return None
            if not ic_filter_nids:
                return set()

            ius_via_ic = [
                r[0]
                for r in dw_db.query(IcIus.iusnid)
                .filter(IcIus.ic_nid.in_(ic_filter_nids), IcIus.iusnid.isnot(None))
                .distinct()
                .all()
                if r[0] is not None
            ]
            return set(ius_via_ic)

    def get_ic_nids_for_ic_mapping_filter(
        self,
        dw_id: str,
        language_code: str,
        ic_nids: Optional[List[int]],
        ic_gids: Optional[List[str]],
        ic_type: Optional[str],
    ) -> Optional[Set[int]]:
        """
        Return IC NIDs allowed in GET /indicators ic_gid expansion for the same filters
        as get_iusnids_for_ic_mapping_filter (ic_identifier, ic_type).

        Returns None when no IC filter params are provided.
        """
        if not ic_nids and not ic_gids and not ic_type:
            return None

        with get_warehouse_session_from_id(dw_id) as dw_db:
            ic_filter_nids = _resolve_ic_filter_nids(
                dw_db, language_code, ic_nids, ic_gids, ic_type
            )
            if ic_filter_nids is None:
                return None
            return set(ic_filter_nids)

    def get_indicator_nids_by_search_criteria(
        self,
        dw_id: str,
        language_code: str,
        criteria: List[Tuple[str, str]],
    ) -> Optional[List[int]]:
        """
        Return indicator_nids that satisfy ALL (entity, term) search criteria.
        criteria: list of (search_by_entity, search_field_term), e.g. [("indicator", "gdp"), ("unit", "ratio")].
        Text entities (indicator, unit, subgroup, ic): case-insensitive ILIKE %term%.
        Boolean entities (highisgood, data_exist, indicator_global): term parsed as true/false (true, false, 1, 0, yes, no).
        Returns None if criteria is empty (no search restriction); otherwise returns list of matching indicator_nids.
        """
        if not criteria:
            return None

        with get_warehouse_session_from_id(dw_id) as dw_db:
            result_sets: Optional[List[Set[int]]] = None

            for entity, term in criteria:
                term = (term or "").strip()
                UnitModel = Unit(language_code)
                SubgroupValModel = SubgroupVal(language_code)
                ICModel = IndicatorClassification(language_code)

                if entity in INDICATOR_SEARCH_BOOLEAN_ENTITIES:
                    bool_val = _parse_search_term_as_bool(term)
                    if bool_val is None:
                        # Invalid boolean term -> no match
                        nids = set()
                    else:
                        IndicatorModel = Indicator(language_code)
                        col = getattr(IndicatorModel, entity, None)
                        if col is None:
                            nids = set()
                        else:
                            rows = (
                                dw_db.query(IndicatorModel.indicator_nid)
                                .filter(col == bool_val)
                                .distinct()
                                .all()
                            )
                            nids = {r[0] for r in rows if r[0] is not None}
                    if result_sets is None:
                        result_sets = [nids]
                    else:
                        result_sets.append(nids)
                    continue

                if not term:
                    continue
                pattern = f"%{term}%"

                if entity == "indicator":
                    IndicatorModel = Indicator(language_code)
                    rows = (
                        dw_db.query(IndicatorModel.indicator_nid)
                        .filter(
                            or_(
                                IndicatorModel.indicator_name.ilike(pattern),
                                IndicatorModel.indicator_gid.ilike(pattern),
                            )
                        )
                        .distinct()
                        .all()
                    )
                    nids = {r[0] for r in rows if r[0] is not None}
                elif entity == "unit":
                    # Only indicators that have exclusively this unit (single-unit match)
                    matching_units = (
                        dw_db.query(UnitModel.unit_nid)
                        .filter(
                            or_(
                                UnitModel.unit_name.ilike(pattern),
                                UnitModel.unit_gid.ilike(pattern),
                            )
                        )
                        .distinct()
                        .all()
                    )
                    matching_unit_nids = {r[0] for r in matching_units if r[0] is not None}
                    if not matching_unit_nids:
                        nids = set()
                    else:
                        with_matching = {
                            r[0]
                            for r in dw_db.query(IndicatorUnitSubgroup.indicator_nid)
                            .filter(IndicatorUnitSubgroup.unit_nid.in_(matching_unit_nids))
                            .distinct()
                            .all()
                            if r[0] is not None
                        }
                        with_other_unit = {
                            r[0]
                            for r in dw_db.query(IndicatorUnitSubgroup.indicator_nid)
                            .filter(
                                IndicatorUnitSubgroup.unit_nid.notin_(matching_unit_nids)
                            )
                            .distinct()
                            .all()
                            if r[0] is not None
                        }
                        nids = with_matching - with_other_unit
                elif entity == "subgroup":
                    rows = (
                        dw_db.query(IndicatorUnitSubgroup.indicator_nid)
                        .join(
                            SubgroupValModel,
                            IndicatorUnitSubgroup.subgroup_val_nid == SubgroupValModel.subgroup_val_nid,
                        )
                        .filter(
                            or_(
                                SubgroupValModel.subgroup_val.ilike(pattern),
                                SubgroupValModel.subgroup_val_gid.ilike(pattern),
                            )
                        )
                        .distinct()
                        .all()
                    )
                    nids = {r[0] for r in rows if r[0] is not None}
                elif entity == "ic":
                    ius_subq = (
                        dw_db.query(IcIus.iusnid)
                        .join(ICModel, IcIus.ic_nid == ICModel.ic_nid)
                        .filter(
                            or_(
                                ICModel.ic_name.ilike(pattern),
                                ICModel.ic_gid.ilike(pattern),
                            )
                        )
                        .distinct()
                        .subquery()
                    )
                    rows = (
                        dw_db.query(IndicatorUnitSubgroup.indicator_nid)
                        .filter(
                            IndicatorUnitSubgroup.iusnid.isnot(None),
                            IndicatorUnitSubgroup.iusnid.in_(ius_subq),
                        )
                        .distinct()
                        .all()
                    )
                    nids = {r[0] for r in rows if r[0] is not None}
                else:
                    continue

                if result_sets is None:
                    result_sets = [nids]
                else:
                    result_sets.append(nids)

            if not result_sets:
                return []
            intersected = result_sets[0]
            for s in result_sets[1:]:
                intersected = intersected & s
            return list(intersected)

    def get_ius_context_meta(
        self,
        dw_id: str,
        indicator_nids: Set[int],
        unit_nids: Set[int],
        sg_nids: Set[int],
        language_code: str,
    ) -> Dict[str, List[Any]]:
        """
        Fetch raw ORM records for the indicator/unit/subgroup NIDs present on the current IUS page.

        Returns:
            Dict with keys "indicators", "units", "subgroups", each a list of ORM row objects.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)
            SubgroupValModel = SubgroupVal(language_code)

            indicators = (
                dw_db.query(IndicatorModel)
                .filter(IndicatorModel.indicator_nid.in_(indicator_nids))
                .all()
                if indicator_nids else []
            )
            units = (
                dw_db.query(UnitModel)
                .filter(UnitModel.unit_nid.in_(unit_nids))
                .all()
                if unit_nids else []
            )
            subgroups = (
                dw_db.query(SubgroupValModel)
                .filter(SubgroupValModel.subgroup_val_nid.in_(sg_nids))
                .all()
                if sg_nids else []
            )

            # Detach records from session so they can be used after session closes
            dw_db.expunge_all()

            return {
                "indicators": indicators,
                "units": units,
                "subgroups": subgroups,
            }

    def _enrich_ius_item_with_gids(
        self,
        dw_db: Session,
        item: Dict[str, Any],
        language_code: str,
    ) -> None:
        """Add indicator_gid, unit_gid, subgroup_gid and composite ius_gid to a single IUS item dict (mutates in place)."""
        IndicatorModel = Indicator(language_code)
        UnitModel = Unit(language_code)
        SubgroupValModel = SubgroupVal(language_code)
        i_nid = item.get("indicator_nid")
        u_nid = item.get("unit_nid")
        sv_nid = item.get("subgroup_val_nid")
        if i_nid is not None:
            row = dw_db.query(IndicatorModel.indicator_gid).filter(IndicatorModel.indicator_nid == i_nid).first()
            item["indicator_gid"] = row[0] if row else None
        if u_nid is not None:
            row = dw_db.query(UnitModel.unit_gid).filter(UnitModel.unit_nid == u_nid).first()
            item["unit_gid"] = row[0] if row else None
        if sv_nid is not None:
            row = dw_db.query(SubgroupValModel.subgroup_val_gid).filter(SubgroupValModel.subgroup_val_nid == sv_nid).first()
            item["subgroup_gid"] = row[0] if row else None
        # Composite ius_gid using configured separator (single place for format)
        i_gid = item.get("indicator_gid")
        u_gid = item.get("unit_gid")
        sg_gid = item.get("subgroup_gid")
        sep = _get_ius_gid_separator()
        if i_gid or u_gid or sg_gid:
            item["ius_gid"] = f"{i_gid or ''}{sep}{u_gid or ''}{sep}{sg_gid or ''}"
        else:
            item["ius_gid"] = None

    def create_one_ius_record(
        self,
        dw_db: Session,
        indicator_nid: int,
        unit_nid: int,
        subgroup_val_nid: int,
        is_default_subgroup: bool = False,
        min_value: float = 0.0,
        max_value: float = 0.0,
        subgroup_nids: Optional[str] = None,
    ) -> Any:
        """
        Create a single IUS (Indicator-Unit-Subgroup) record in the given session.

        Used by both the public create_ius API and by indicator create/update flows.
        Does not commit; caller is responsible for transaction.

        Args:
            dw_db: Datawarehouse database session
            indicator_nid: Indicator NID
            unit_nid: Unit NID
            subgroup_val_nid: Subgroup value NID
            is_default_subgroup: Whether this is the default subgroup (e.g. TOTAL)
            min_value: Minimum value (default 0)
            max_value: Maximum value (default 0)
            subgroup_nids: Comma-separated subgroup NIDs; if None, computed from subgroup_val_nid

        Returns:
            The created IndicatorUnitSubgroup ORM row (with iusnid set after flush).
        """
        if subgroup_nids is None:
            subgroup_nids = get_subgroup_nids(dw_db, subgroup_val_nid)

        row = IndicatorUnitSubgroup(
            indicator_nid=indicator_nid,
            unit_nid=unit_nid,
            subgroup_val_nid=subgroup_val_nid,
            subgroup_nids=subgroup_nids or None,
            min_value=min_value,
            max_value=max_value,
            data_exist=False,
            isdefaultsubgroup=is_default_subgroup,
            avlmindatavalue=0,
            avlmaxdatavalue=0,
            avlmintimeperiod=None,
            avlmaxtimeperiod=None,
        )
        dw_db.add(row)
        dw_db.flush()
        return row

    def create_ius_records(
        self,
        dw_db: Session,
        indicator_nid: int,
        unit_nids: List[int],
        subgroup_val_nids: List[int],
        is_default_subgroup: bool = False,
        default_subgroup_val_nids: Optional[Set[int]] = None,
    ) -> List[int]:
        """
        Create IUS (Indicator-Unit-Subgroup) records for all unit x subgroup value combinations.

        Used by indicator create/update to create multiple IUS rows in one transaction.
        Does not commit; caller is responsible for transaction.

        Args:
            dw_db: Datawarehouse database session
            indicator_nid: Indicator NID to associate with IUS records
            unit_nids: List of unit NIDs
            subgroup_val_nids: List of subgroup value NIDs
            is_default_subgroup: When default_subgroup_val_nids is None, whether all created
                rows are default subgroup (e.g. TOTAL). Ignored when default_subgroup_val_nids is set.
            default_subgroup_val_nids: Optional set of subgroup_val_nid values for which the
                created IUS row(s) should have isdefaultsubgroup=True. When provided, per-row
                default is determined by subgroup_val_nid in this set.

        Returns:
            List of created IUS NIDs (iusnid values)
        """
        ius_nids: List[int] = []
        for unit_nid in unit_nids:
            for subgroup_val_nid in subgroup_val_nids:
                if default_subgroup_val_nids is not None:
                    is_default = subgroup_val_nid in default_subgroup_val_nids
                else:
                    is_default = is_default_subgroup
                row = self.create_one_ius_record(
                    dw_db,
                    indicator_nid=indicator_nid,
                    unit_nid=unit_nid,
                    subgroup_val_nid=subgroup_val_nid,
                    is_default_subgroup=is_default,
                )
                ius_nids.append(row.iusnid)
        return ius_nids

    def create_ius_records_from_pairs(
        self,
        dw_db: Session,
        indicator_nid: int,
        pairs: List[Tuple[int, int]],
        default_subgroup_val_nids: Optional[Set[int]] = None,
    ) -> List[int]:
        """
        Create IUS records only for the given (unit_nid, subgroup_val_nid) pairs.
        No Cartesian product: each pair becomes exactly one IUS row.

        Args:
            dw_db: Datawarehouse database session
            indicator_nid: Indicator NID
            pairs: List of (unit_nid, subgroup_val_nid) tuples
            default_subgroup_val_nids: Set of subgroup_val_nid for which isdefaultsubgroup=True

        Returns:
            List of created IUS NIDs.
        """
        default_subgroup_val_nids = default_subgroup_val_nids or set()
        ius_nids: List[int] = []
        for unit_nid, subgroup_val_nid in pairs:
            is_default = subgroup_val_nid in default_subgroup_val_nids
            row = self.create_one_ius_record(
                dw_db,
                indicator_nid=indicator_nid,
                unit_nid=unit_nid,
                subgroup_val_nid=subgroup_val_nid,
                is_default_subgroup=is_default,
            )
            ius_nids.append(row.iusnid)
        return ius_nids

    def upsert_ius(
        self,
        dw_id: str,
        payload: Dict[str, Any],
        language_code: str = "en",
    ) -> List[Dict[str, Any]]:
        """
        Upsert IUS (Indicator-Unit-Subgroup): create or update one row per subgroup value.

        Payload: (indicator_nid, unit_nid) or (indicator_gid, unit_gid), and sg_catg_val_nids (list
        of subgroup category value NIDs or GIDs). Subgroup values are fetched from sg_catg_val_nids
        via ut_subgroup_vals_subgroup. Optional: min_value, max_value, isdefaultsubgroup, subgroup_nids.

        Returns:
            List of IUS dicts (schema-style keys, including GIDs) for each upserted row.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            indicator_nid = payload.get("indicator_nid")
            unit_nid = payload.get("unit_nid")
            if indicator_nid is None or unit_nid is None:
                IndicatorModel = Indicator(language_code)
                UnitModel = Unit(language_code)
                i_gid = payload.get("indicator_gid")
                u_gid = payload.get("unit_gid")
                if not i_gid or not u_gid:
                    raise ValueError("Provide (indicator_nid, unit_nid) or (indicator_gid, unit_gid).")
                i_row = dw_db.query(IndicatorModel.indicator_nid).filter(IndicatorModel.indicator_gid == i_gid).first()
                u_row = dw_db.query(UnitModel.unit_nid).filter(UnitModel.unit_gid == u_gid).first()
                if not i_row:
                    raise ValueError("INDICATOR_NOT_FOUND")
                if not u_row:
                    raise ValueError("UNIT_NOT_FOUND")
                indicator_nid = i_row[0]
                unit_nid = u_row[0]

            # Derive subgroup value NIDs from sg_catg_val_nids (ut_subgroup_vals_subgroup)
            sg_catg_raw = payload.get("sg_catg_val_nids")
            if not sg_catg_raw:
                raise ValueError("Provide sg_catg_val_nids (non-empty list of subgroup category value NIDs or GIDs).")
            subgroup_val_nids = get_subgroup_val_nids_from_sg_catg_val_nids(dw_db, language_code, sg_catg_raw)
            if not subgroup_val_nids:
                raise ValueError("No subgroup values found for the given sg_catg_val_nids.")

            min_value = float(payload["min_value"]) if payload.get("min_value") is not None else 0.0
            max_value = float(payload["max_value"]) if payload.get("max_value") is not None else 0.0
            isdefaultsubgroup = bool(payload.get("isdefaultsubgroup", False))
            raw_subgroup_nids = payload.get("subgroup_nids")
            if isinstance(raw_subgroup_nids, list):
                subgroup_nids_str = resolve_ius_sg_catg_val_nids(dw_db, language_code, raw_subgroup_nids) if raw_subgroup_nids else None
            else:
                subgroup_nids_str = raw_subgroup_nids

            results: List[Dict[str, Any]] = []
            _sep = _get_ius_gid_separator()
            for subgroup_val_nid in subgroup_val_nids:
                existing = (
                    dw_db.query(IndicatorUnitSubgroup)
                    .filter(
                        IndicatorUnitSubgroup.indicator_nid == indicator_nid,
                        IndicatorUnitSubgroup.unit_nid == unit_nid,
                        IndicatorUnitSubgroup.subgroup_val_nid == subgroup_val_nid,
                    )
                    .first()
                )
                if existing is not None:
                    # Update
                    existing.min_value = min_value
                    existing.max_value = max_value
                    existing.isdefaultsubgroup = isdefaultsubgroup
                    if subgroup_nids_str is not None:
                        existing.subgroup_nids = subgroup_nids_str
                    else:
                        existing.subgroup_nids = get_subgroup_nids(dw_db, subgroup_val_nid) or None
                    dw_db.flush()
                    dw_db.refresh(existing)
                    row = existing
                else:
                    per_row_subgroup_nids = subgroup_nids_str
                    if per_row_subgroup_nids is None:
                        per_row_subgroup_nids = get_subgroup_nids(dw_db, subgroup_val_nid) or None
                    row = self.create_one_ius_record(
                        dw_db,
                        indicator_nid=indicator_nid,
                        unit_nid=unit_nid,
                        subgroup_val_nid=subgroup_val_nid,
                        is_default_subgroup=isdefaultsubgroup,
                        min_value=min_value,
                        max_value=max_value,
                        subgroup_nids=per_row_subgroup_nids,
                    )
                    dw_db.refresh(row)
                item = _record_to_ius(row)
                self._enrich_ius_item_with_gids(dw_db, item, language_code)
                results.append(item)
            return results

    def _resolve_sugrp_to_subgroup_val_nids(
        self,
        dw_db: Session,
        language_code: str,
        sugrp: List[Union[int, str]],
    ) -> List[int]:
        """Resolve sugrp (NIDs or GIDs) to list of subgroup_val_nid. Raises ValueError if any not found."""
        if not sugrp:
            return []
        SubgroupValModel = SubgroupVal(language_code)
        default_locale = get_default_locale(dw_db)
        SubgroupValDefault = SubgroupVal(default_locale)
        nids: List[int] = []
        for x in sugrp:
            if isinstance(x, int):
                row = dw_db.query(SubgroupValDefault.subgroup_val_nid).filter(
                    SubgroupValDefault.subgroup_val_nid == x
                ).first()
                if not row:
                    raise NotFound(f"Subgroup value NID not found: {x}")
                nids.append(row[0])
            else:
                row = dw_db.query(SubgroupValModel.subgroup_val_nid).filter(
                    SubgroupValModel.subgroup_val_gid == str(x).strip()
                ).first()
                if not row:
                    raise NotFound(f"Subgroup value GID not found: {x}")
                nids.append(row[0])
        return nids

    def _resolve_default_subgroups_to_nids(
        self,
        dw_db: Session,
        language_code: str,
        default_items: List[Any],
        sugrp_nids: List[int],
    ) -> Set[int]:
        """Resolve zero or more default subgroup NIDs/GIDs to subgroup_val_nid set; each must be in sugrp_nids."""
        out: Set[int] = set()
        for item in default_items:
            if item is None:
                continue
            nid = self._resolve_default_subgroup_to_nid(dw_db, language_code, item, sugrp_nids)
            if nid is not None:
                out.add(nid)
        return out

    def _resolve_default_subgroup_to_nid(
        self,
        dw_db: Session,
        language_code: str,
        default_subgroup: Union[int, str],
        sugrp_nids: List[int],
    ) -> Optional[int]:
        """Resolve default_subgroup (NID or GID) to subgroup_val_nid. Must be in sugrp_nids."""
        if default_subgroup is None:
            return None
        SubgroupValModel = SubgroupVal(language_code)
        default_locale = get_default_locale(dw_db)
        SubgroupValDefault = SubgroupVal(default_locale)
        if isinstance(default_subgroup, int):
            if default_subgroup not in sugrp_nids:
                raise ValueError(f"default_subgroup NID {default_subgroup} not in sugrp list")
            return default_subgroup
        row = dw_db.query(SubgroupValModel.subgroup_val_nid).filter(
            SubgroupValModel.subgroup_val_gid == str(default_subgroup).strip()
        ).first()
        if not row:
            raise NotFound(f"default_subgroup GID not found: {default_subgroup}")
        nid = row[0]
        if nid not in sugrp_nids:
            raise ValueError(f"default_subgroup {default_subgroup} not in sugrp list")
        return nid

    def upsert_ius_batch(
        self,
        dw_id: str,
        data: List[Dict[str, Any]],
        language_code: str = "en",
    ) -> List[Dict[str, Any]]:
        """
        Upsert IUS from batch payload: data = [ { i_gid, u_gid: [], u_sg_gid: { unit_gid: { sg_gid: [], default_sg_gids } } }, ... ].
        Same structure as GET /dw/{dw_id}/indicators (subgroup=true). Optional default_sg_gid / default_subgroup aliases are merged server-side.
        """
        results: List[Dict[str, Any]] = []
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)
            _sep = _get_ius_gid_separator()
            for item in data:
                i_gid = (item.get("i_gid") or "").strip()
                u_gids = [str(x).strip() for x in (item.get("u_gid") or []) if str(x).strip()]
                u_sg_gid_dict = item.get("u_sg_gid") or {}
                # Normalize u_sg_gid (dict, same as GET indicators s_gid) to internal list form
                sg_gid_list: List[Dict[str, Any]] = []
                for unit_gid, cfg in u_sg_gid_dict.items():
                    if not isinstance(cfg, dict):
                        continue
                    sg_vals = cfg.get("sg_gid")
                    if not sg_vals:
                        continue
                    default_items: List[Any] = []
                    raw_multi = cfg.get("default_sg_gids")
                    if raw_multi:
                        default_items.extend(raw_multi)
                    default_val = cfg.get("default_sg_gid") if cfg.get("default_sg_gid") is not None else cfg.get("default_subgroup")
                    if default_val is not None:
                        default_items.append(default_val)
                    sg_gid_list.append({
                        "unit_gid": str(unit_gid).strip(),
                        "sg_gid": sg_vals,
                        "default_subgroups": default_items,
                    })
                if not i_gid:
                    raise ValueError("Each item must have i_gid.")
                if not u_gids:
                    raise ValueError("Each item must have u_gid (non-empty list).")
                if not sg_gid_list:
                    raise ValueError("Each item must have u_sg_gid (dict of unit_gid -> { sg_gid, default_sg_gids }) with at least one unit.")
                i_row = dw_db.query(IndicatorModel.indicator_nid).filter(IndicatorModel.indicator_gid == i_gid).first()
                if not i_row:
                    raise ValueError("INDICATOR_NOT_FOUND")
                indicator_nid = i_row[0]
                u_gid_set = set(u_gids)
                for unit_cfg in sg_gid_list:
                    u_gid = (unit_cfg.get("unit_gid") or "").strip()
                    if not u_gid:
                        raise ValueError("Each sg_gid entry must have unit_gid.")
                    if u_gid not in u_gid_set:
                        raise ValueError(f"unit_gid {u_gid} must be in u_gid list.")
                    unit_row = dw_db.query(UnitModel.unit_nid).filter(UnitModel.unit_gid == u_gid).first()
                    if not unit_row:
                        raise ValueError(f"UNIT_NOT_FOUND: {u_gid}")
                    unit_nid = unit_row[0]
                    sg_gid_raw = unit_cfg.get("sg_gid") or []
                    subgroup_val_nids = self._resolve_sugrp_to_subgroup_val_nids(dw_db, language_code, sg_gid_raw)
                    if not subgroup_val_nids:
                        raise ValueError(f"Unit {u_gid}: sg_gid must be non-empty.")
                    default_items = unit_cfg.get("default_subgroups") or []
                    default_subgroup_val_nids = self._resolve_default_subgroups_to_nids(
                        dw_db, language_code, list(default_items), subgroup_val_nids
                    )
                    if not default_subgroup_val_nids and len(subgroup_val_nids) == 1:
                        default_subgroup_val_nids = {subgroup_val_nids[0]}
                    for subgroup_val_nid in subgroup_val_nids:
                        is_default = subgroup_val_nid in default_subgroup_val_nids
                        existing = (
                            dw_db.query(IndicatorUnitSubgroup)
                            .filter(
                                IndicatorUnitSubgroup.indicator_nid == indicator_nid,
                                IndicatorUnitSubgroup.unit_nid == unit_nid,
                                IndicatorUnitSubgroup.subgroup_val_nid == subgroup_val_nid,
                            )
                            .first()
                        )
                        subgroup_nids_str = get_subgroup_nids(dw_db, subgroup_val_nid) or None
                        if existing is not None:
                            existing.min_value = 0.0
                            existing.max_value = 0.0
                            existing.isdefaultsubgroup = is_default
                            existing.subgroup_nids = subgroup_nids_str
                            dw_db.flush()
                            dw_db.refresh(existing)
                            row = existing
                        else:
                            row = self.create_one_ius_record(
                                dw_db,
                                indicator_nid=indicator_nid,
                                unit_nid=unit_nid,
                                subgroup_val_nid=subgroup_val_nid,
                                is_default_subgroup=is_default,
                                min_value=0.0,
                                max_value=0.0,
                                subgroup_nids=subgroup_nids_str,
                            )
                            dw_db.refresh(row)
                        ius_item = _record_to_ius(row)
                        self._enrich_ius_item_with_gids(dw_db, ius_item, language_code)
                        results.append(ius_item)
            dw_db.commit()

        if results:
            notify_dbmetadata_counts_changed(dw_id)
        return results

    def update_ius(
        self,
        dw_id: str,
        identifier: str,
        payload: Dict[str, Any],
        language_code: str = "en",
    ) -> Dict[str, Any]:
        """
        Update an existing IUS by identifier (partial update).

        Args:
            dw_id: Warehouse identifier.
            identifier: iusnid, or composite NID/GID (separator from IUS_GID_SEPARATOR, default '|').
            payload: Dict with optional min_value, max_value, isdefaultsubgroup, subgroup_nids.
            language_code: Locale for GID resolution.

        Returns:
            Updated IUS as dict (schema-style keys, including GIDs).

        Raises:
            ValueError("IUS_NOT_FOUND") if identifier resolves to nothing.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            row = _resolve_ius_identifier(dw_db, identifier, language_code)
            if row is None:
                raise ValueError("IUS_NOT_FOUND")

            if "min_value" in payload and payload["min_value"] is not None:
                row.min_value = float(payload["min_value"])
            if "max_value" in payload and payload["max_value"] is not None:
                row.max_value = float(payload["max_value"])
            if "isdefaultsubgroup" in payload and payload["isdefaultsubgroup"] is not None:
                row.isdefaultsubgroup = bool(payload["isdefaultsubgroup"])
            if "subgroup_nids" in payload:
                raw = payload["subgroup_nids"]
                if isinstance(raw, list):
                    row.subgroup_nids = resolve_ius_sg_catg_val_nids(dw_db, language_code, raw) if raw else None
                else:
                    row.subgroup_nids = raw

            dw_db.flush()
            dw_db.refresh(row)
            item = _record_to_ius(row)
            self._enrich_ius_item_with_gids(dw_db, item, language_code)
            return item

    # ------------------------------------------------------------------
    # Delete helpers
    # ------------------------------------------------------------------
    _CASCADE_CHUNK_SIZE = 500

    def _cascade_delete_ius_nids(self, dw_db: Session, iusnids: List[int]) -> None:
        """
        Execute cascade delete for the given list of iusnids within an open session.

        Cascade order (matches indicator delete pattern):
          1. ut_data rows (by iusnid)
          2. ut_ic_ius rows (by iusnid)
          3. ut_indicator_unit_subgroup rows (by iusnid)
        """
        from apps.datawarehouse.utils.audit_events import (
            buffer_delete_step,
            deleted_ids_preview,
        )

        chunk_size = self._CASCADE_CHUNK_SIZE
        uniq_ius = sorted({int(x) for x in iusnids if x is not None})

        # 1) Delete ut_data rows
        data_nids: List[int] = []
        if uniq_ius:
            data_nids = [
                r[0]
                for r in dw_db.query(Data.data_nid).filter(Data.iusnid.in_(uniq_ius)).all()
            ]
        for i in range(0, len(uniq_ius), chunk_size):
            chunk = uniq_ius[i: i + chunk_size]
            dw_db.query(Data).filter(Data.iusnid.in_(chunk)).delete(synchronize_session=False)
        if data_nids:
            logger.info(f"Cascade deleted ut_data rows for {len(uniq_ius)} IUS nid(s)")
            buffer_delete_step(
                dw_db,
                module="data",
                description=f"Cascade deleted {len(data_nids)} ut_data row(s) for iusnid(s) batch",
                previous_value={
                    **deleted_ids_preview(data_nids),
                    "linked_ius": deleted_ids_preview(uniq_ius),
                },
            )
        dw_db.flush()

        # 2) Delete ut_ic_ius rows
        ic_ius_pks: List[int] = []
        if uniq_ius:
            ic_ius_pks = [
                r[0]
                for r in dw_db.query(IcIus.ic_iusnid).filter(
                    IcIus.iusnid.in_(uniq_ius)
                ).all()
            ]
        for i in range(0, len(uniq_ius), chunk_size):
            chunk = uniq_ius[i: i + chunk_size]
            dw_db.query(IcIus).filter(IcIus.iusnid.in_(chunk)).delete(synchronize_session=False)
        if uniq_ius:
            logger.info(f"Cascade deleted ut_ic_ius rows for {len(uniq_ius)} IUS nid(s)")
            buffer_delete_step(
                dw_db,
                module="ic_ius",
                description=f"Cascade deleted ut_ic_ius links for {len(uniq_ius)} IUS record(s)",
                previous_value={
                    "linked_ius": deleted_ids_preview(uniq_ius),
                    "deleted_ic_ius": deleted_ids_preview(ic_ius_pks),
                },
            )
        dw_db.flush()

        # 3) Delete IUS rows
        for i in range(0, len(uniq_ius), chunk_size):
            chunk = uniq_ius[i: i + chunk_size]
            dw_db.query(IndicatorUnitSubgroup).filter(
                IndicatorUnitSubgroup.iusnid.in_(chunk)
            ).delete(synchronize_session=False)
        if uniq_ius:
            logger.info(f"Deleted {len(uniq_ius)} IUS record(s)")
            buffer_delete_step(
                dw_db,
                module="indicator_unit_subgroup",
                description=f"Cascade deleted {len(uniq_ius)} IUS record(s)",
                previous_value=deleted_ids_preview(uniq_ius),
            )
        dw_db.flush()

    def delete_ius(
        self,
        dw_id: str,
        identifier: str,
        language_code: str = "en",
        force: bool = False,
    ) -> Dict[str, Any]:
        """
        Hard-delete a single IUS record with cascade.

        Args:
            dw_id: Warehouse identifier.
            identifier: iusnid, or composite NID/GID (separator from IUS_GID_SEPARATOR, default '|').
            language_code: Locale for GID resolution.
            force: If False and data rows exist, raises ValueError("IUS_HAS_DATA:<count>").

        Returns:
            Dict with deleted IUS info (iusnid, indicator_nid, unit_nid, subgroup_val_nid).

        Raises:
            ValueError("IUS_NOT_FOUND") if identifier resolves to nothing.
            ValueError("IUS_HAS_DATA:<count>") if data exists and force=False.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            row = _resolve_ius_identifier(dw_db, identifier, language_code)
            if row is None:
                raise ValueError("IUS_NOT_FOUND")

            iusnid = row.iusnid
            indicator_nid = row.indicator_nid
            unit_nid = row.unit_nid
            subgroup_val_nid = row.subgroup_val_nid
            was_default = bool(row.isdefaultsubgroup) if row.isdefaultsubgroup is not None else False

            # Pre-delete validation: check for existing data rows
            data_count = (
                dw_db.query(Data)
                .filter(
                    Data.indicator_nid == indicator_nid,
                    Data.unit_nid == unit_nid,
                    Data.subgroup_val_nid == subgroup_val_nid,
                )
                .count()
            )
            if data_count > 0 and not force:
                raise ValueError(f"IUS_HAS_DATA:{data_count}")

            self._cascade_delete_ius_nids(dw_db, [iusnid])

            if was_default:
                logger.info(
                    f"Deleted IUS {iusnid} was the default subgroup for "
                    f"indicator_nid={indicator_nid}, unit_nid={unit_nid}. "
                    "No auto-reassignment performed."
                )

        notify_dbmetadata_counts_changed(dw_id)
        return {
            "iusnid": iusnid,
            "indicator_nid": indicator_nid,
            "unit_nid": unit_nid,
            "subgroup_val_nid": subgroup_val_nid,
            "was_default_subgroup": was_default,
            "data_rows_deleted": data_count if force else 0,
        }

    def bulk_delete_ius(
        self,
        dw_id: str,
        identifiers: List[str],
        language_code: str = "en",
        force: bool = False,
    ) -> Dict[str, Any]:
        """
        Hard-delete multiple IUS records with cascade and partial-success support.

        Each identifier is processed independently; failures are collected in errors.
        If force=False and an IUS has data rows, that item is skipped with an error.

        Args:
            dw_id: Warehouse identifier.
            identifiers: List of iusnid / composite NID / composite GID strings.
            language_code: Locale for GID resolution.
            force: If False and any IUS has data rows, that item is added to errors.

        Returns:
            Dict with deleted_count, deleted_iusnids, and errors list.
        """
        if not identifiers:
            return {"deleted_count": 0, "deleted_iusnids": [], "errors": []}

        deleted_iusnids: List[int] = []
        errors: List[Dict[str, Any]] = []

        with get_warehouse_session_from_id(dw_id) as dw_db:
            seen: Set[int] = set()
            for idx, ident in enumerate(identifiers):
                try:
                    row = _resolve_ius_identifier(dw_db, ident, language_code)
                    if row is None:
                        errors.append({"index": idx, "error": f"IUS identifier '{ident}' not found"})
                        continue

                    if row.iusnid in seen:
                        continue
                    seen.add(row.iusnid)

                    if not force:
                        count = (
                            dw_db.query(Data)
                            .filter(
                                Data.indicator_nid == row.indicator_nid,
                                Data.unit_nid == row.unit_nid,
                                Data.subgroup_val_nid == row.subgroup_val_nid,
                            )
                            .count()
                        )
                        if count > 0:
                            errors.append({
                                "index": idx,
                                "error": f"IUS '{ident}' (iusnid={row.iusnid}) has {count} data row(s). Pass force=true to confirm cascade delete.",
                            })
                            continue

                    self._cascade_delete_ius_nids(dw_db, [row.iusnid])
                    deleted_iusnids.append(row.iusnid)

                    if row.isdefaultsubgroup:
                        logger.info(f"Deleted default-subgroup IUS record: iusnid={row.iusnid}. No auto-reassignment performed.")

                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

            dw_db.commit()

        if deleted_iusnids:
            notify_dbmetadata_counts_changed(dw_id)
        return {
            "deleted_count": len(deleted_iusnids),
            "deleted_iusnids": deleted_iusnids,
            "errors": errors,
        }
