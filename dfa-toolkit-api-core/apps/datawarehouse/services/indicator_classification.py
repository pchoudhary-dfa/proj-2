"""
Indicator Classification service for CRUD operations with i18n support.
Uses locale-only IC tables (ut_indicator_classifications_<locale>).
"""
import logging
from typing import List, Optional, Dict, Any, Tuple, Set

from collections import defaultdict

from sqlalchemy import or_, func, case
from sqlalchemy.orm import Session

from apps.shared.config.config import settings
from apps.shared.utils.ius_utils import get_ius_gid_separator
from apps.shared.exceptions import Conflict, NotFound
from apps.shared.utils.validators import generate_guid, validate_guid
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    IndicatorClassification,
    Indicator,
    Unit,
    SubgroupVal,
    get_default_locale,
    IcIus,
    IndicatorUnitSubgroup,
)
from apps.datawarehouse.schemas.indicator_classification import (
    IndicatorClassificationCreateSchema,
    IndicatorClassificationUpdateSchema,
    IndicatorClassificationResponseSchema,
    IcIusMappingItemSchema,
)
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.datawarehouse.constants import IC_TYPE_ALLOWED_FOR_IC_API
from apps.datawarehouse.utils.export_utils import build_simple_xlsx, make_export_filename
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_INDICATOR_CLASSIFICATION_SOURCE = "apps.datawarehouse.services.indicator_classification"


class IcIusMappingResolveError(NotFound):
    """I|U|SG resolution failure with structured context for map_ic_ius_batch responses."""

    def __init__(
        self,
        message: str,
        *,
        composite_gid: Optional[str] = None,
        indicator_gid: Optional[str] = None,
        unit_gid: Optional[str] = None,
        subgroup_gid: Optional[str] = None,
        indicator_name: Optional[str] = None,
        unit_name: Optional[str] = None,
        subgroup_name: Optional[str] = None,
        ic_name: Optional[str] = None,
    ):
        super().__init__(message)
        self.composite_gid = composite_gid
        self.indicator_gid = indicator_gid
        self.unit_gid = unit_gid
        self.subgroup_gid = subgroup_gid
        self.indicator_name = indicator_name
        self.unit_name = unit_name
        self.subgroup_name = subgroup_name
        self.ic_name = ic_name


def _entity_name_from_row(row: Any, name_attr: str) -> Optional[str]:
    name = getattr(row, name_attr, None) if row else None
    if name is not None and str(name).strip():
        return str(name).strip()
    return None


def _entity_display_label(row: Any, name_attr: str, gid: str) -> str:
    """Human-readable entity reference: caption/name first, GID only when name is missing."""
    name = _entity_name_from_row(row, name_attr)
    if name:
        return f"'{name}'"
    return f"'{gid}'"


def _ius_resolve_error_kwargs(
    *,
    composite_gid: Optional[str] = None,
    indicator_gid: Optional[str] = None,
    unit_gid: Optional[str] = None,
    subgroup_gid: Optional[str] = None,
    indicator_row: Any = None,
    unit_row: Any = None,
    subgroup_row: Any = None,
    ic_name: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "composite_gid": composite_gid,
        "indicator_gid": indicator_gid,
        "unit_gid": unit_gid,
        "subgroup_gid": subgroup_gid or None,
        "indicator_name": _entity_name_from_row(indicator_row, "indicator_name"),
        "unit_name": _entity_name_from_row(unit_row, "unit_name"),
        "subgroup_name": _entity_name_from_row(subgroup_row, "subgroup_val"),
        "ic_name": ic_name,
    }


def _ic_ius_batch_error_entry(
    ic_gid: str,
    exc: Exception,
    ic_name: Optional[str] = None,
) -> Dict[str, Any]:
    entry: Dict[str, Any] = {"ic_gid": ic_gid, "error": str(exc)}
    if ic_name:
        entry["ic_name"] = ic_name
    if isinstance(exc, IcIusMappingResolveError):
        if exc.composite_gid is not None:
            entry["composite_gid"] = exc.composite_gid
        if exc.indicator_gid is not None:
            entry["indicator_gid"] = exc.indicator_gid
        if exc.unit_gid is not None:
            entry["unit_gid"] = exc.unit_gid
        entry["subgroup_gid"] = exc.subgroup_gid
        if exc.indicator_name:
            entry["indicator_name"] = exc.indicator_name
        if exc.unit_name:
            entry["unit_name"] = exc.unit_name
        if exc.subgroup_name:
            entry["subgroup_name"] = exc.subgroup_name
        if exc.ic_name:
            entry["ic_name"] = exc.ic_name
    return entry


def compute_ic_ius_count_annotations(
    flat_nodes: List[Dict[str, Any]],
    ius_by_ic: Dict[int, Set[Any]],
) -> None:
    """
    Mutate each node dict with ic_ius_subtree_union_count.

    Distinct IUS (ut_ic_ius.iusnid) mapped on this IC or any descendant—full subtree union.
    Matches the tree badge with “Mapped (this classification)” for internal nodes: mappings
    on the node itself are included, not only on leaf descendants.
    """
    if not flat_nodes:
        return
    by_nid: Dict[int, Dict[str, Any]] = {}
    for n in flat_nodes:
        nid = n.get("ic_nid")
        if nid is None:
            continue
        by_nid[int(nid)] = n

    children: Dict[int, List[int]] = defaultdict(list)
    for n in flat_nodes:
        nid = n.get("ic_nid")
        if nid is None:
            continue
        nid = int(nid)
        pid = n.get("ic_parent_nid")
        if pid in (None, 0, -1):
            continue
        children[int(pid)].append(nid)

    sub_memo: Dict[int, Set[int]] = {}

    def subtree_ic_nids(nid: int) -> Set[int]:
        if nid in sub_memo:
            return sub_memo[nid]
        acc: Set[int] = {nid}
        for c in children.get(nid, []):
            acc |= subtree_ic_nids(c)
        sub_memo[nid] = acc
        return acc

    for nid, node in by_nid.items():
        union: Set[Any] = set()
        for desc_nid in subtree_ic_nids(nid):
            union |= ius_by_ic.get(desc_nid, set())
        node["ic_ius_subtree_union_count"] = len(union)


class IndicatorClassificationService:
    """Service for Indicator Classification CRUD operations."""

    def _ic_record_to_dict(
        self,
        record: Any,
        language_code: str,
    ) -> Dict[str, Any]:
        """Build response dict from a locale IC record using schema (single source of truth)."""
        return IndicatorClassificationResponseSchema.from_record(record, locale=language_code)

    def _build_ic_tree(
        self,
        items: List[Dict[str, Any]],
        parent_nid: Optional[int],
    ) -> List[Dict[str, Any]]:
        """Build parent-child tree from flat list using ic_parent_nid. Root when parent_nid in (None, -1, 0)."""
        root_nids = (None, -1, 0)
        by_parent: Dict[Optional[int], List[Dict[str, Any]]] = {}
        for item in items:
            pid = item.get("ic_parent_nid")
            if pid in root_nids:
                pid = None
            by_parent.setdefault(pid, []).append(item)

        def attach_children(node: Dict[str, Any]) -> Dict[str, Any]:
            nid = node.get("ic_nid")
            children = by_parent.get(nid, [])
            out = {k: v for k, v in node.items()}
            out["children"] = [attach_children(c) for c in sorted(children, key=lambda x: (x.get("ic_order") is None, x.get("ic_order"), x.get("ic_nid")))]
            return out

        roots = by_parent.get(None, [])
        return [attach_children(r) for r in sorted(roots, key=lambda x: (x.get("ic_order") is None, x.get("ic_order"), x.get("ic_nid")))]

    def _flatten_ic_tree_dicts(
        self,
        nodes: List[Dict[str, Any]],
        out: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        if out is None:
            out = []
        for n in nodes:
            out.append(n)
            kids = n.get("children") or []
            if kids:
                self._flatten_ic_tree_dicts(kids, out)
        return out

    def _attach_ic_ius_mapping_counts(self, dw_db: Session, flat_nodes: List[Dict[str, Any]]) -> None:
        """Load ut_ic_ius pairs for given IC NIDs and annotate nodes in place."""
        if not flat_nodes:
            return
        nids: List[int] = []
        for n in flat_nodes:
            raw = n.get("ic_nid")
            if raw is not None:
                nids.append(int(raw))
        if not nids:
            return
        pairs = dw_db.query(IcIus.ic_nid, IcIus.iusnid).filter(IcIus.ic_nid.in_(nids)).all()
        ius_by_ic: Dict[int, Set[Any]] = defaultdict(set)
        for ic_nid, iusnid in pairs:
            if ic_nid is not None and iusnid is not None:
                ius_by_ic[int(ic_nid)].add(iusnid)
        compute_ic_ius_count_annotations(flat_nodes, ius_by_ic)

    def get_all_indicator_classifications(
        self,
        dw_id: str,
        page: int = 1,
        page_size: Optional[int] = 10,
        language_code: Optional[str] = None,
        sort_order: str = "asc",
        sort_field: str = "ic_nid",
        search: Optional[str] = None,
        ic_type: Optional[str] = None,
        ic_parent_nid: Optional[int] = None,
        filter_global: Optional[bool] = None,
        hierarchical: bool = False,
        include_ic_ius_counts: bool = False,
        active_ic_types: Optional[Tuple[str, ...]] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get list of Indicator Classifications with i18n support.
        When hierarchical=True, returns a parent-child tree using ic_parent_nid (pagination ignored).
        When hierarchical=False, returns flat paginated list.

        Args:
            dw_id: Data warehouse identifier
            page: Page number (1-based); ignored when hierarchical=True
            page_size: Items per page; ignored when hierarchical=True
            language_code: Language for locale content
            sort_order: 'asc' or 'desc'
            sort_field: ic_nid, ic_name, ic_gid, ic_type, ic_order
            search: Search in ic_name / ic_short_name / ic_gid
            ic_type: Filter by classification type
            ic_parent_nid: Filter by parent NID (flat mode only)
            filter_global: Filter by global flag
            hierarchical: If True, return data as parent-child tree; if False, flat paginated list
            active_ic_types: IC types enabled for the app (ENABLED_IC_TYPES); defaults to all API types

        Returns:
            Tuple of (list of IC dicts or tree roots with children, total count)
        """
        use_pagination = page_size is not None and not hierarchical
        if use_pagination:
            page_size = max(1, min(page_size, 1000))
            skip = (page - 1) * page_size

        types_for_query = active_ic_types if active_ic_types is not None else IC_TYPE_ALLOWED_FOR_IC_API

        if ic_type is not None and isinstance(ic_type, str):
            ic_type = ic_type.strip().upper()
        if ic_type is not None and ic_type not in types_for_query:
            raise ValueError(
                "IC_TYPE_NOT_ALLOWED: ic_type must be one of %s; use the dedicated module for other types."
                % (list(types_for_query),)
            )

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            IndicatorClassificationModel = IndicatorClassification(language_code)

            query = dw_db.query(IndicatorClassificationModel).filter(
                IndicatorClassificationModel.ic_type.in_(types_for_query)
            )

            if search and search.strip():
                pattern = f"%{search.strip()}%"
                query = query.filter(
                    or_(
                        IndicatorClassificationModel.ic_name.ilike(pattern),
                        IndicatorClassificationModel.ic_short_name.ilike(pattern),
                        IndicatorClassificationModel.ic_gid.ilike(pattern),
                    )
                )

            if ic_type is not None:
                query = query.filter(IndicatorClassificationModel.ic_type == ic_type)
            if not hierarchical and ic_parent_nid is not None:
                query = query.filter(IndicatorClassificationModel.ic_parent_nid == ic_parent_nid)
            if filter_global is not None:
                query = query.filter(IndicatorClassificationModel.ic_global == filter_global)

            total_count = query.count()

            order_col = getattr(IndicatorClassificationModel, sort_field, IndicatorClassificationModel.ic_nid)
            if sort_order and sort_order.lower() == "desc":
                query = query.order_by(order_col.desc())
            else:
                query = query.order_by(order_col.asc())

            if hierarchical:
                rows = query.all()
                flat = [self._ic_record_to_dict(row, language_code) for row in rows]
                result = self._build_ic_tree(flat, None)
                if include_ic_ius_counts:
                    flat_for_counts = self._flatten_ic_tree_dicts(result)
                    self._attach_ic_ius_mapping_counts(dw_db, flat_for_counts)
                return result, total_count

            if use_pagination:
                rows = query.offset(skip).limit(page_size).all()
            else:
                rows = query.all()
            result = [
                self._ic_record_to_dict(row, language_code)
                for row in rows
            ]
            if include_ic_ius_counts:
                self._attach_ic_ius_mapping_counts(dw_db, result)
            return result, total_count

    def get_all_ic_flat_for_export(
        self,
        dw_db: Session,
        language_code: str,
        sort_order: str = "asc",
        sort_field: str = "ic_nid",
        search: Optional[str] = None,
        ic_type: Optional[str] = None,
        ic_parent_nid: Optional[int] = None,
        filter_global: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        """Get flat list of all ICs for XLSX export. Caller provides dw_db session. Excludes ic_type SR."""
        if ic_type is not None and isinstance(ic_type, str):
            ic_type = ic_type.strip().upper()
        if ic_type is not None and ic_type not in IC_TYPE_ALLOWED_FOR_IC_API:
            raise ValueError("IC_TYPE_NOT_ALLOWED: ic_type must be one of %s; use the dedicated module for other types." % (list(IC_TYPE_ALLOWED_FOR_IC_API),))
        lang = language_code or get_default_locale(dw_db)
        IndicatorClassificationModel = IndicatorClassification(lang)
        query = dw_db.query(IndicatorClassificationModel).filter(
            IndicatorClassificationModel.ic_type.in_(IC_TYPE_ALLOWED_FOR_IC_API)
        )
        if search and search.strip():
            pattern = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    IndicatorClassificationModel.ic_name.ilike(pattern),
                    IndicatorClassificationModel.ic_short_name.ilike(pattern),
                    IndicatorClassificationModel.ic_gid.ilike(pattern),
                )
            )
        if ic_type is not None:
            query = query.filter(IndicatorClassificationModel.ic_type == ic_type)
        if ic_parent_nid is not None:
            query = query.filter(IndicatorClassificationModel.ic_parent_nid == ic_parent_nid)
        if filter_global is not None:
            query = query.filter(IndicatorClassificationModel.ic_global == filter_global)
        order_col = getattr(IndicatorClassificationModel, sort_field, IndicatorClassificationModel.ic_nid)
        if sort_order and sort_order.lower() == "desc":
            query = query.order_by(order_col.desc())
        else:
            query = query.order_by(order_col.asc())
        rows = query.all()
        return [self._ic_record_to_dict(row, lang) for row in rows]

    def get_ic_nid_by_gid(self, dw_id: str, ic_gid: str) -> Optional[int]:
        """Resolve IC GID to ic_nid."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorClassificationModel = IndicatorClassification(get_default_locale(dw_db))
            row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_gid == ic_gid).first()
            return row.ic_nid if row else None

    def _resolve_identifier_to_ic_nid(self, dw_db: Any, identifier: str) -> Optional[int]:
        """
        Resolve IC identifier (numeric ic_nid or alphanumeric ic_gid) to ic_nid.
        Returns None if not found.
        """
        if not identifier or not str(identifier).strip():
            return None
        identifier = str(identifier).strip()
        IndicatorClassificationModel = IndicatorClassification(get_default_locale(dw_db))
        if identifier.isdigit():
            row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_nid == int(identifier)).first()
        else:
            row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_gid == identifier).first()
        return row.ic_nid if row else None

    def _get_ic_detail_and_parent(
        self,
        dw_db: Any,
        ic_nid: int,
        language_code: str,
    ) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
        """
        Get ic_detail and ic_parent_dtl for an IC. Returns None if IC not found or if IC has ic_type SR (SR is a separate module).
        Both dicts use API keys: ic_nid, ic_gid, ic_name. Parent uses ic_nid -1 for root.
        """
        IndicatorClassificationModel = IndicatorClassification(language_code)
        row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_nid == ic_nid).first()
        if not row:
            return None
        if (getattr(row, "ic_type", None) or "").upper() not in IC_TYPE_ALLOWED_FOR_IC_API:
            return None
        ic_detail_full = IndicatorClassificationResponseSchema.from_record(row)
        ic_detail = {k: ic_detail_full.get(k) or "" if k in ("ic_gid", "ic_name") else ic_detail_full.get(k) for k in ("ic_nid", "ic_gid", "ic_name")}
        parent_nid = getattr(row, "ic_parent_nid", None)
        if parent_nid is None or parent_nid == -1 or parent_nid == 0:
            ic_parent_dtl = {"ic_nid": -1, "ic_gid": "", "ic_name": ""}
        else:
            parent_row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_nid == parent_nid).first()
            if not parent_row:
                ic_parent_dtl = {"ic_nid": int(parent_nid), "ic_gid": "", "ic_name": ""}
            else:
                parent_full = IndicatorClassificationResponseSchema.from_record(parent_row)
                ic_parent_dtl = {k: parent_full.get(k) or "" if k in ("ic_gid", "ic_name") else parent_full.get(k) for k in ("ic_nid", "ic_gid", "ic_name")}
        return ic_detail, ic_parent_dtl

    def list_ius_for_ic(
        self,
        dw_id: str,
        ic_identifier: str,
        language_code: Optional[str] = None,
        page: int = 1,
        page_size: Optional[int] = 25,
        sort_order: str = "asc",
        sort_field: Optional[str] = None,
        only_sel_ius: bool = False,
        only_unsel_ius: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """
        List all IUS for the data warehouse with is_mapped_to_ic and ic_ius fields for the given IC.
        ic_identifier is either numeric ic_nid or alphanumeric ic_gid. Returns None if IC not found.
        Response uses API field names only (snake_case).
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            ic_nid = self._resolve_identifier_to_ic_nid(dw_db, ic_identifier)
            if ic_nid is None:
                return None
            detail_parent = self._get_ic_detail_and_parent(dw_db, ic_nid, language_code)
            if not detail_parent:
                return None
            ic_detail, ic_parent_dtl = detail_parent

            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)
            SubgroupValModel = SubgroupVal(language_code)

            # Mapped IUS for this IC: ic_ius rows keyed by iusnid
            ic_ius_rows = (
                dw_db.query(IcIus)
                .filter(IcIus.ic_nid == ic_nid)
                .all()
            )
            mapped_by_ius: Dict[int, Dict[str, Any]] = {}
            for r in ic_ius_rows:
                if r.iusnid is not None:
                    mapped_by_ius[r.iusnid] = {
                        "ic_ius_nid": r.ic_iusnid,
                        "ic_ius_is_recommended_source": bool(r.recommendedsource) if r.recommendedsource is not None else False,
                        "ic_ius_order": r.ic_ius_order,
                        "ic_ius_label": r.ic_ius_label or "",
                    }

            # All IUS with locale labels (indicator / unit / subgroup)
            q = (
                dw_db.query(IndicatorUnitSubgroup)
                .outerjoin(IndicatorModel, IndicatorModel.indicator_nid == IndicatorUnitSubgroup.indicator_nid)
                .outerjoin(UnitModel, UnitModel.unit_nid == IndicatorUnitSubgroup.unit_nid)
                .outerjoin(SubgroupValModel, SubgroupValModel.subgroup_val_nid == IndicatorUnitSubgroup.subgroup_val_nid)
            )
            total_query = q
            if only_sel_ius:
                if not mapped_by_ius:
                    return {
                        "data": [],
                        "count": 0,
                        "total_count": 0,
                        "ic_detail": ic_detail,
                        "ic_parent_dtl": ic_parent_dtl,
                        "sel_ius_count": 0,
                    }
                q = q.filter(IndicatorUnitSubgroup.iusnid.in_(mapped_by_ius.keys()))
                total_query = q
            elif only_unsel_ius:
                if mapped_by_ius:
                    q = q.filter(IndicatorUnitSubgroup.iusnid.notin_(mapped_by_ius.keys()))
                total_query = q

            total_count = total_query.count()

            order_col = getattr(
                IndicatorUnitSubgroup,
                sort_field if sort_field in ("iusnid", "indicator_nid", "unit_nid", "subgroup_val_nid") else "iusnid",
                IndicatorUnitSubgroup.iusnid,
            )
            if sort_order and sort_order.lower() == "desc":
                q = q.order_by(order_col.desc())
            else:
                q = q.order_by(order_col.asc())

            if page_size is not None:
                page_size = max(1, min(page_size, 1000))
                skip = (max(1, page) - 1) * page_size
                rows = q.offset(skip).limit(page_size).all()
            else:
                rows = q.all()

            # Build rows: data with gids only (ius_nid, ius_gid, i_gid, u_gid, sg_gid, is_mapped_to_ic, ic_ius_*).
            # Full indicator/unit/subgroup info is returned in context_nids for router to build meta by_gid.
            _sep = get_ius_gid_separator()
            items = []
            indicator_nids: Set[int] = set()
            unit_nids: Set[int] = set()
            sg_nids: Set[int] = set()
            for ius_row in rows:
                ind_gid = ""
                u_gid = ""
                sg_gid = ""
                if ius_row.indicator_nid is not None:
                    indicator_nids.add(ius_row.indicator_nid)
                    ir = dw_db.query(IndicatorModel.indicator_gid).filter(
                        IndicatorModel.indicator_nid == ius_row.indicator_nid
                    ).first()
                    if ir and ir[0] is not None:
                        ind_gid = ir[0]
                if ius_row.unit_nid is not None:
                    unit_nids.add(ius_row.unit_nid)
                    ur = dw_db.query(UnitModel.unit_gid).filter(
                        UnitModel.unit_nid == ius_row.unit_nid
                    ).first()
                    if ur and ur[0] is not None:
                        u_gid = ur[0]
                if ius_row.subgroup_val_nid is not None:
                    sg_nids.add(ius_row.subgroup_val_nid)
                    sr = dw_db.query(SubgroupValModel.subgroup_val_gid).filter(
                        SubgroupValModel.subgroup_val_nid == ius_row.subgroup_val_nid
                    ).first()
                    if sr and sr[0] is not None:
                        sg_gid = sr[0]
                ius_gid = f"{ind_gid}{_sep}{u_gid}{_sep}{sg_gid}" if (ind_gid or u_gid or sg_gid) else ""

                mapped = mapped_by_ius.get(ius_row.iusnid)
                is_mapped = mapped is not None
                item = {
                    "ius_nid": ius_row.iusnid,
                    "ius_gid": ius_gid or None,
                    "i_gid": ind_gid or None,
                    "u_gid": u_gid or None,
                    "sg_gid": sg_gid or None,
                    "is_mapped_to_ic": is_mapped,
                }
                if is_mapped and mapped:
                    item["ic_ius_nid"] = mapped["ic_ius_nid"]
                    item["ic_ius_is_recommended_source"] = mapped["ic_ius_is_recommended_source"]
                    item["ic_ius_order"] = mapped["ic_ius_order"]
                    item["ic_ius_label"] = mapped["ic_ius_label"]
                else:
                    item["ic_ius_nid"] = None
                    item["ic_ius_is_recommended_source"] = False
                    item["ic_ius_order"] = None
                    item["ic_ius_label"] = ""
                items.append(item)

            sel_ius_count = len(mapped_by_ius)
            return {
                "data": items,
                "count": len(items),
                "total_count": total_count,
                "ic_detail": ic_detail,
                "ic_parent_dtl": ic_parent_dtl,
                "sel_ius_count": sel_ius_count,
                "context_nids": {
                    "indicator_nids": indicator_nids,
                    "unit_nids": unit_nids,
                    "sg_nids": sg_nids,
                },
            }

    def list_iu_for_ic(
        self,
        dw_id: str,
        ic_identifier: str,
        language_code: Optional[str] = None,
        page: int = 1,
        page_size: Optional[int] = 25,
        only_sel_ius: bool = False,
        only_unsel_ius: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """
        List all IU (indicator+unit) for the data warehouse with is_mapped_to_ic for the given IC.
        ic_identifier is either numeric ic_nid or alphanumeric ic_gid. IU is mapped if any IUS
        with that (indicator_nid, unit_nid) is in ut_ic_ius for this IC. Returns None if IC not found.
        only_sel_ius: when True, return only IU mapped to this IC. only_unsel_ius: when True, return only IU not mapped.
        Response data uses: i_nid, u_nid, i_gid, u_gid, is_mapped_to_ic. Names and other indicator/unit
        details are provided in meta.indicator and meta.unit (keyed by gid), built from context_nids.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            ic_nid = self._resolve_identifier_to_ic_nid(dw_db, ic_identifier)
            if ic_nid is None:
                return None
            detail_parent = self._get_ic_detail_and_parent(dw_db, ic_nid, language_code)
            if not detail_parent:
                return None
            ic_detail, ic_parent_dtl = detail_parent

            # Distinct (indicator_nid, unit_nid) from IUS
            iu_tuples = (
                dw_db.query(
                    IndicatorUnitSubgroup.indicator_nid,
                    IndicatorUnitSubgroup.unit_nid,
                )
                .distinct()
                .all()
            )

            # Set of (indicator_nid, unit_nid) that are mapped (any IUS with that i,u is linked to this IC)
            mapped_ius_nids = [
                r[0]
                for r in dw_db.query(IcIus.iusnid).filter(IcIus.ic_nid == ic_nid, IcIus.iusnid.isnot(None)).all()
            ]
            mapped_iu_set: set = set()
            if mapped_ius_nids:
                iu_from_mapped = (
                    dw_db.query(
                        IndicatorUnitSubgroup.indicator_nid,
                        IndicatorUnitSubgroup.unit_nid,
                    )
                    .filter(IndicatorUnitSubgroup.iusnid.in_(mapped_ius_nids))
                    .distinct()
                    .all()
                )
                mapped_iu_set = {(r[0], r[1]) for r in iu_from_mapped}

            # Filter by only_sel_ius / only_unsel_ius (IU mapping to this IC)
            if only_sel_ius:
                if not mapped_iu_set:
                    return {
                        "data": [],
                        "count": 0,
                        "total_count": 0,
                        "ic_detail": ic_detail,
                        "ic_parent_dtl": ic_parent_dtl,
                        "sel_iu_count": 0,
                    }
                iu_tuples = [(i_nid, u_nid) for (i_nid, u_nid) in iu_tuples if (i_nid, u_nid) in mapped_iu_set]
            elif only_unsel_ius:
                if mapped_iu_set:
                    iu_tuples = [(i_nid, u_nid) for (i_nid, u_nid) in iu_tuples if (i_nid, u_nid) not in mapped_iu_set]

            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)

            # Batch-fetch indicator and unit GIDs for all (i_nid, u_nid) in iu_tuples
            all_i_nids = {i_nid for (i_nid, _) in iu_tuples if i_nid is not None}
            all_u_nids = {u_nid for (_, u_nid) in iu_tuples if u_nid is not None}
            i_gid_map: Dict[int, Optional[str]] = {}
            if all_i_nids:
                for row in dw_db.query(IndicatorModel.indicator_nid, IndicatorModel.indicator_gid).filter(
                    IndicatorModel.indicator_nid.in_(all_i_nids)
                ).all():
                    i_gid_map[row[0]] = row[1]
            u_gid_map: Dict[int, Optional[str]] = {}
            if all_u_nids:
                for row in dw_db.query(UnitModel.unit_nid, UnitModel.unit_gid).filter(
                    UnitModel.unit_nid.in_(all_u_nids)
                ).all():
                    u_gid_map[row[0]] = row[1]

            items = []
            for (i_nid, u_nid) in iu_tuples:
                is_mapped = (i_nid, u_nid) in mapped_iu_set
                items.append({
                    "i_nid": i_nid,
                    "u_nid": u_nid,
                    "i_gid": i_gid_map.get(i_nid) if i_nid is not None else None,
                    "u_gid": u_gid_map.get(u_nid) if u_nid is not None else None,
                    "is_mapped_to_ic": is_mapped,
                })

            total_count = len(items)
            sel_iu_count = len(mapped_iu_set)

            if page_size is not None:
                page_size = max(1, min(page_size, 1000))
                skip = (max(1, page) - 1) * page_size
                items_paged = items[skip : skip + page_size]
            else:
                items_paged = items

            # Context NIDs for current page so router can build meta.indicator / meta.unit by gid
            ind_nids_page = {it["i_nid"] for it in items_paged if it.get("i_nid") is not None}
            u_nids_page = {it["u_nid"] for it in items_paged if it.get("u_nid") is not None}

            return {
                "data": items_paged,
                "count": len(items_paged),
                "total_count": total_count,
                "ic_detail": ic_detail,
                "ic_parent_dtl": ic_parent_dtl,
                "sel_iu_count": sel_iu_count,
                "context_nids": {
                    "indicator_nids": ind_nids_page,
                    "unit_nids": u_nids_page,
                },
            }

    def get_indicator_classification_by_identifier(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get a single Indicator Classification by ic_nid (numeric) or ic_gid (non-numeric).

        Args:
            dw_id: Data warehouse identifier
            identifier: ic_nid (numeric) or ic_gid (non-numeric)
            language_code: Language for locale content

        Returns:
            IC record dict or None if not found.
        """

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            IndicatorClassificationModel = IndicatorClassification(language_code)

            if identifier.isdigit():
                ic_nid = int(identifier)
                row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_nid == ic_nid).first()
            else:
                DefaultModel = IndicatorClassification(get_default_locale(dw_db))
                default_row = dw_db.query(DefaultModel).filter(
                    DefaultModel.ic_gid == identifier
                ).first()
                if not default_row:
                    return None
                ic_nid = default_row.ic_nid
                row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_nid == ic_nid).first()

            if not row:
                return None
            if (getattr(row, "ic_type", None) or "").upper() not in IC_TYPE_ALLOWED_FOR_IC_API:
                return None

            return self._ic_record_to_dict(row, language_code)

    def _validate_ic_gid(
        self,
        dw_db: Any,
        ic_gid: str,
        exclude_ic_nid: Optional[int] = None,
    ) -> None:
        """Validate IC GID format and uniqueness. Raises ValueError if invalid."""
        if not ic_gid or not ic_gid.strip():
            raise ValueError("IC_GID_REQUIRED: Indicator classification GID is required")
        ic_gid = ic_gid.strip()
        if len(ic_gid) > 60:
            raise ValueError("IC_GID_TOO_LONG: Indicator classification GID must be 60 characters or less")
        if not validate_guid(ic_gid):
            raise ValueError(
                "IC_GID_INVALID: Indicator classification GID contains invalid characters; allowed: letters, numbers, and $ @ _ - { }"
            )
        IndicatorClassificationModel = IndicatorClassification(get_default_locale(dw_db))
        query = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_gid == ic_gid)
        if exclude_ic_nid is not None:
            query = query.filter(IndicatorClassificationModel.ic_nid != exclude_ic_nid)
        existing = query.first()
        if existing:
            raise Conflict(f"Indicator classification GID '{ic_gid}' already exists", error_code="IC_GID_EXISTS")

    def _create_ic_in_session(
        self,
        dw_db: Session,
        dw_id: str,
        data: IndicatorClassificationCreateSchema,
        language_code: Optional[str] = None,
    ) -> int:
        """
        Create a single indicator classification in the given session (no commit).
        Caller must commit. Used by create_indicator_classification and create_indicator_classifications_batch.
        Returns ic_nid.
        """
        raw_ic_type = getattr(data, "ic_type", None)
        if raw_ic_type is not None and (raw_ic_type if isinstance(raw_ic_type, str) else str(raw_ic_type)).strip().upper() not in IC_TYPE_ALLOWED_FOR_IC_API:
            raise ValueError("IC_TYPE_NOT_ALLOWED: ic_type must be one of %s; use the dedicated module for other types." % (list(IC_TYPE_ALLOWED_FOR_IC_API),))
        ic_gid = data.ic_gid
        if not ic_gid or not ic_gid.strip():
            ic_gid = generate_guid()
        else:
            ic_gid = ic_gid.strip()

        self._validate_ic_gid(dw_db, ic_gid)
        default_locale = get_default_locale(dw_db)
        language_code = language_code or default_locale
        IndicatorClassificationModel = IndicatorClassification(get_default_locale(dw_db))
        max_nid = dw_db.query(func.max(IndicatorClassificationModel.ic_nid)).scalar()
        ic_nid = (max_nid or 0) + 1
        ic_parent_nid = data.ic_parent_nid if data.ic_parent_nid is not None else 0
        ic_global = getattr(data, "ic_global", False) or False
        ic_order = data.ic_order

        if ic_order is None:
            max_order = dw_db.query(func.max(IndicatorClassificationModel.ic_order)).scalar()
            ic_order = (max_order or 0) + 1

        for locale in get_dw_language_codes(dw_id):
            IndicatorClassificationModel = IndicatorClassification(locale)
            row = IndicatorClassificationModel(
                ic_nid=ic_nid,
                ic_parent_nid=ic_parent_nid,
                ic_gid=ic_gid,
                ic_name=value_for_locale(data.ic_name, locale, language_code),
                ic_global=ic_global,
                ic_info=value_for_locale(data.ic_info, locale, language_code) if data.ic_info else None,
                ic_type=(data.ic_type or "").strip().upper(),
                ic_short_name=value_for_locale(data.ic_short_name, locale, language_code) if data.ic_short_name else None,
                publisher=value_for_locale(data.publisher, locale, language_code) if data.publisher else None,
                title=value_for_locale(data.title, locale, language_code) if data.title else None,
                diyear=value_for_locale(data.diyear, locale, language_code) if data.diyear else None,
                sourcelink1=data.sourcelink1,
                sourcelink2=data.sourcelink2,
                ic_order=ic_order,
                isbn=data.isbn,
                nature=data.nature,
            )
            dw_db.add(row)
        logger.info("Created indicator classification ic_nid=%s ic_gid=%s", ic_nid, ic_gid)
        return ic_nid

    def create_indicator_classification(
        self,
        dw_id: str,
        data: IndicatorClassificationCreateSchema,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new indicator classification with i18n support.
        Inserts into all locale tables with the same ic_nid (and ic_parent_nid).
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            ic_nid = self._create_ic_in_session(dw_db, dw_id, data, language_code=language_code)
            dw_db.commit()

        return self.get_indicator_classification_by_identifier(
            dw_id, str(ic_nid), language_code=language_code
        ) or {"ic_nid": ic_nid, "ic_gid": None, "locale": language_code}

    def create_indicator_classifications_batch(
        self,
        dw_id: str,
        items: List[IndicatorClassificationCreateSchema],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create multiple indicator classifications with partial-success support.
        Each item is committed independently; failures are collected in errors.
        Returns dict with created (list of result dicts) and errors (list of {index, error} dicts).
        """
        if not items:
            return {"created": [], "errors": []}
        logger.info("Creating %s indicator classification(s) in warehouse '%s'", len(items), dw_id)

        created = []
        errors = []
        default_locale = None
        for idx, data in enumerate(items):
            with get_warehouse_session_from_id(dw_id) as dw_db:
                try:
                    lc = language_code or get_default_locale(dw_db)
                    if default_locale is None:
                        default_locale = lc
                    ic_nid = self._create_ic_in_session(dw_db, dw_id, data, language_code=lc)
                    dw_db.commit()
                    result = self.get_indicator_classification_by_identifier(dw_id, str(ic_nid), language_code=lc)
                    created.append(result or {"ic_nid": ic_nid, "ic_gid": None, "locale": lc})
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

        if created:
            notify_dbmetadata_counts_changed(dw_id)
        return {"created": created, "errors": errors}

    def update_indicator_classification(
        self,
        dw_id: str,
        identifier: str,
        data: IndicatorClassificationUpdateSchema,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update an existing indicator classification by ic_nid or ic_gid.
        Only provided fields are updated; all locale tables are updated for shared fields.
        """
        payload = data.model_dump(exclude_none=True)

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            IndicatorClassificationModel = IndicatorClassification(get_default_locale(dw_db))
            if identifier.isdigit():
                ic_nid = int(identifier)
                row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_nid == ic_nid).first()
            else:
                row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_gid == identifier).first()
                ic_nid = row.ic_nid if row else None

            if not row:
                return None
            if (getattr(row, "ic_type", None) or "").upper() not in IC_TYPE_ALLOWED_FOR_IC_API:
                return None
            if payload.get("ic_type") is not None:
                payload_ic = (payload.get("ic_type") or "").strip().upper() if isinstance(payload.get("ic_type"), str) else payload.get("ic_type")
                if payload_ic not in IC_TYPE_ALLOWED_FOR_IC_API:
                    raise ValueError("IC_TYPE_NOT_ALLOWED: ic_type must be one of %s; use the dedicated module for other types." % (list(IC_TYPE_ALLOWED_FOR_IC_API),))
                payload["ic_type"] = payload_ic

            if "ic_gid" in payload:
                self._validate_ic_gid(dw_db, payload["ic_gid"], exclude_ic_nid=ic_nid)

            # ic_name, ic_short_name, ic_info → locale-specific (requested locale only)
            # all other fields → structural (all locale tables)
            apply_locale_update(dw_db, dw_id, IndicatorClassification, "ic_nid", ic_nid, payload, language_code)

            dw_db.commit()
            logger.info("Updated indicator classification ic_nid=%s", ic_nid)

        return self.get_indicator_classification_by_identifier(
            dw_id, str(ic_nid), language_code=language_code
        )

    def delete_indicator_classification(
        self,
        dw_id: str,
        identifier: str,
    ) -> bool:
        """
        Delete an indicator classification by ic_nid or ic_gid.
        Removes any ut_ic_ius rows for this ic_nid before deleting locale IC rows.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorClassificationModel = IndicatorClassification(get_default_locale(dw_db))
            if identifier.isdigit():
                ic_nid = int(identifier)
                row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_nid == ic_nid).first()
            else:
                row = dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_gid == identifier).first()
                ic_nid = row.ic_nid if row else None

            if not row:
                return False
            if (getattr(row, "ic_type", None) or "").upper() not in IC_TYPE_ALLOWED_FOR_IC_API:
                return False

            from apps.datawarehouse.utils.audit_events import (
                buffer_delete_step,
                buffer_manual_audit,
                deleted_ids_preview,
                snapshot_entity_for_audit,
            )

            ic_ius_rows = (
                dw_db.query(IcIus.ic_iusnid, IcIus.iusnid)
                .filter(IcIus.ic_nid == ic_nid)
                .all()
            )
            if ic_ius_rows:
                ic_ius_pks = [int(r[0]) for r in ic_ius_rows if r[0] is not None]
                ius_nids = [int(r[1]) for r in ic_ius_rows if r[1] is not None]
                dw_db.query(IcIus).filter(IcIus.ic_nid == ic_nid).delete(
                    synchronize_session=False
                )
                buffer_delete_step(
                    dw_db,
                    module="ic_ius",
                    identifier=str(ic_nid),
                    description=(
                        f"Removed {len(ic_ius_rows)} IUS mapping(s) from ut_ic_ius "
                        f"before deleting indicator classification ic_nid={ic_nid}"
                    ),
                    previous_value={
                        "ic_nid": ic_nid,
                        "linked_ius": deleted_ids_preview(ius_nids),
                        "deleted_ic_ius": deleted_ids_preview(ic_ius_pks),
                    },
                )

            ic_gid = getattr(row, "ic_gid", None)
            buffer_manual_audit(
                dw_db,
                action="DELETE",
                module="indicator_classification",
                identifier=str(ic_gid) if ic_gid else str(ic_nid),
                previous_value=snapshot_entity_for_audit(row),
                description=f"Deleted indicator classification ic_nid={ic_nid}",
            )

            for locale in get_dw_language_codes(dw_id):
                IndicatorClassificationModel = IndicatorClassification(locale)
                dw_db.query(IndicatorClassificationModel).filter(IndicatorClassificationModel.ic_nid == ic_nid).delete()
            dw_db.commit()
            logger.info("Deleted indicator classification ic_nid=%s", ic_nid)

        notify_dbmetadata_counts_changed(dw_id)
        return True

    def map_ic_ius_batch(
        self,
        dw_id: str,
        mapping_data: List[Any],
        language_code: str = "en"
    ) -> Dict[str, Any]:
        """
        Map ICs to IUS combinations (Data Manager v5–aligned `associateIcWithIUS` flow).

        For each edited IC, computes added/removed IUS vs current `ut_ic_ius` for that IC only.
        Deletes and inserts apply to the v5 scope: ancestors of the IC (see optional
        `parent_ic_gid`), the first ordered child chain under the IC (v5 `getIcChilds` with
        first-child path), and the IC itself—not the full descendant subtree and without
        reconcile/rollup passes beyond that scope.
        """
        results = {"success": True, "processed": [], "errors": []}
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            for item in mapping_data:
                ic_name: Optional[str] = None
                try:
                    # Resolve IC GID to ic_nid
                    ic_nid = self._resolve_identifier_to_ic_nid(dw_db, item.ic_gid)
                    if not ic_nid:
                        raise NotFound(f"IC not found: {item.ic_gid}")
                    
                    # Validate IC type is allowed (exclude SR types)
                    ic_detail = self._get_ic_detail_and_parent(dw_db, ic_nid, language_code)
                    if not ic_detail:
                        raise ValueError(f"IC type not allowed for this API: {item.ic_gid}")
                    ic_name = ic_detail[0].get("ic_name") or None
                    
                    parent_ic_nid: Optional[int] = None
                    raw_parent = item.parent_ic_gid
                    if raw_parent and str(raw_parent).strip() and str(raw_parent).strip().lower() not in ("-1", "none"):
                        parent_ic_nid = self._resolve_identifier_to_ic_nid(dw_db, str(raw_parent).strip())
                        if not parent_ic_nid:
                            raise NotFound(f"Parent IC not found: {raw_parent}")

                    # Resolve composite GIDs to IUS NIDs
                    target_ius_nids = []
                    if item.i_u_gid:
                        target_ius_nids = self._resolve_composite_gids_to_ius_nids(
                            dw_db, item.i_u_gid, language_code, include_all_subgroups=True
                        )
                    elif item.i_u_sg_gid:
                        target_ius_nids = self._resolve_composite_gids_to_ius_nids(
                            dw_db, item.i_u_sg_gid, language_code, include_all_subgroups=False
                        )

                    sync_result = self._associate_ic_with_ius_v5(
                        dw_db, ic_nid, target_ius_nids, parent_ic_nid=parent_ic_nid
                    )
                    
                    results["processed"].append({
                        "ic_gid": item.ic_gid,
                        "ic_nid": ic_nid,
                        "mappings_added": sync_result["added"],
                        "mappings_removed": sync_result["removed"],
                        "total_mappings": len(target_ius_nids)
                    })
                    
                except Exception as e:
                    if isinstance(e, IcIusMappingResolveError) and ic_name and not e.ic_name:
                        e.ic_name = ic_name
                    results["errors"].append(_ic_ius_batch_error_entry(item.ic_gid, e, ic_name=ic_name))
                    results["success"] = False
            
            # Commit all changes at once (all-or-nothing)
            if results["success"]:
                dw_db.commit()
                logger.info("Successfully processed %d IC-IUS mappings", len(results["processed"]))
            else:
                dw_db.rollback()
                log_background_incident(
                    message="Failed to process IC-IUS mappings, rolled back transaction",
                    error_code="IC_IUS_MAPPING_BATCH_FAILED",
                    source=_INDICATOR_CLASSIFICATION_SOURCE,
                )
        
        return results

    def _resolve_composite_gids_to_ius_nids(
        self,
        dw_db: Session,
        composite_gids: List[str],
        language_code: str,
        include_all_subgroups: bool = False
    ) -> List[int]:
        """
        Resolve composite GIDs (I|U or I|U|SG) to IUS NIDs.
        When include_all_subgroups=True, expands I|U to all SG combinations.
        """
        separator = get_ius_gid_separator()
        ius_nids = []
        
        for gid_string in composite_gids:
            parts = gid_string.split(separator)
            
            if len(parts) == 2:  # I|U format
                i_gid, u_gid = [part.strip() for part in parts]
                if include_all_subgroups:
                    # Get all IUS combinations for this I|U pair
                    ius_nids.extend(
                        self._get_all_ius_for_indicator_unit(
                            dw_db, i_gid, u_gid, language_code, composite_gid=gid_string
                        )
                    )
                else:
                    raise ValueError(f"i_u_gid format requires all subgroup expansion: {gid_string}")
                    
            elif len(parts) == 3:  # I|U|SG format
                i_gid, u_gid, sg_gid = [part.strip() for part in parts]
                ius_nid = self._resolve_specific_ius(
                    dw_db,
                    i_gid,
                    u_gid,
                    sg_gid,
                    language_code,
                    composite_gid=gid_string,
                )
                ius_nids.append(ius_nid)
            else:
                raise IcIusMappingResolveError(
                    f"Invalid composite GID format: '{gid_string}' "
                    f"(expected indicator{separator}unit or indicator{separator}unit{separator}subgroup)",
                    composite_gid=gid_string,
                )
        
        return list(set(ius_nids))  # Remove duplicates

    def _get_all_ius_for_indicator_unit(
        self,
        dw_db: Session,
        i_gid: str,
        u_gid: str,
        language_code: str,
        composite_gid: Optional[str] = None,
    ) -> List[int]:
        """Get all IUS NIDs for a given indicator-unit pair (all subgroup combinations)."""
        IndicatorModel = Indicator(language_code)
        UnitModel = Unit(language_code)

        if not i_gid:
            raise IcIusMappingResolveError(
                "Indicator is missing in composite mapping",
                **_ius_resolve_error_kwargs(
                    composite_gid=composite_gid,
                    indicator_gid=i_gid or None,
                    unit_gid=u_gid or None,
                ),
            )

        indicator_row = dw_db.query(IndicatorModel).filter(IndicatorModel.indicator_gid == i_gid).first()
        ind_label = _entity_display_label(indicator_row, "indicator_name", i_gid)
        err_kw = _ius_resolve_error_kwargs(
            composite_gid=composite_gid,
            indicator_gid=i_gid,
            unit_gid=u_gid or None,
            indicator_row=indicator_row,
        )

        if not indicator_row:
            suffix = f" in composite '{composite_gid}'" if composite_gid else ""
            raise IcIusMappingResolveError(
                f"Indicator {ind_label} not found{suffix}",
                **err_kw,
            )

        if not u_gid:
            raise IcIusMappingResolveError(
                f"Unit is missing for indicator {ind_label}",
                **err_kw,
            )

        unit_row = dw_db.query(UnitModel).filter(UnitModel.unit_gid == u_gid).first()
        unit_label = _entity_display_label(unit_row, "unit_name", u_gid)
        err_kw = _ius_resolve_error_kwargs(
            composite_gid=composite_gid,
            indicator_gid=i_gid,
            unit_gid=u_gid,
            indicator_row=indicator_row,
            unit_row=unit_row,
        )

        if not unit_row:
            raise IcIusMappingResolveError(
                f"Unit {unit_label} not found for indicator {ind_label}",
                **err_kw,
            )
        
        # Query all IUS combinations for this indicator-unit pair
        ius_rows = dw_db.query(IndicatorUnitSubgroup).filter(
            IndicatorUnitSubgroup.indicator_nid == indicator_row.indicator_nid,
            IndicatorUnitSubgroup.unit_nid == unit_row.unit_nid
        ).all()
        
        return [row.iusnid for row in ius_rows]

    def _resolve_specific_ius(
        self,
        dw_db: Session,
        i_gid: str,
        u_gid: str,
        sg_gid: str,
        language_code: str,
        composite_gid: Optional[str] = None,
    ) -> int:
        """Resolve a specific I|U|SG combination to IUS NID."""
        IndicatorModel = Indicator(language_code)
        UnitModel = Unit(language_code)
        SubgroupValModel = SubgroupVal(language_code)

        if not i_gid:
            raise IcIusMappingResolveError(
                "Indicator is missing in composite mapping",
                **_ius_resolve_error_kwargs(
                    composite_gid=composite_gid,
                    indicator_gid=i_gid or None,
                    unit_gid=u_gid or None,
                    subgroup_gid=sg_gid or None,
                ),
            )

        indicator_row = dw_db.query(IndicatorModel).filter(IndicatorModel.indicator_gid == i_gid).first()
        ind_label = _entity_display_label(indicator_row, "indicator_name", i_gid)
        err_kw = _ius_resolve_error_kwargs(
            composite_gid=composite_gid,
            indicator_gid=i_gid,
            unit_gid=u_gid or None,
            subgroup_gid=sg_gid or None,
            indicator_row=indicator_row,
        )

        if not indicator_row:
            suffix = f" in composite '{composite_gid}'" if composite_gid else ""
            raise IcIusMappingResolveError(
                f"Indicator {ind_label} not found{suffix}",
                **err_kw,
            )

        if not u_gid:
            raise IcIusMappingResolveError(
                f"Unit is missing for indicator {ind_label}",
                **err_kw,
            )

        unit_row = dw_db.query(UnitModel).filter(UnitModel.unit_gid == u_gid).first()
        unit_label = _entity_display_label(unit_row, "unit_name", u_gid)
        err_kw = _ius_resolve_error_kwargs(
            composite_gid=composite_gid,
            indicator_gid=i_gid,
            unit_gid=u_gid,
            subgroup_gid=sg_gid or None,
            indicator_row=indicator_row,
            unit_row=unit_row,
        )

        if not unit_row:
            raise IcIusMappingResolveError(
                f"Unit {unit_label} not found for indicator {ind_label}",
                **err_kw,
            )

        if not sg_gid:
            raise IcIusMappingResolveError(
                f"Subgroup is missing for indicator {ind_label} and unit {unit_label} "
                "(composite may reference a deleted subgroup value)",
                **err_kw,
            )

        subgroup_row = dw_db.query(SubgroupValModel).filter(SubgroupValModel.subgroup_val_gid == sg_gid).first()
        sg_label = _entity_display_label(subgroup_row, "subgroup_val", sg_gid)
        err_kw = _ius_resolve_error_kwargs(
            composite_gid=composite_gid,
            indicator_gid=i_gid,
            unit_gid=u_gid,
            subgroup_gid=sg_gid,
            indicator_row=indicator_row,
            unit_row=unit_row,
            subgroup_row=subgroup_row,
        )

        if not subgroup_row:
            raise IcIusMappingResolveError(
                f"Subgroup {sg_label} not found for indicator {ind_label} and unit {unit_label}",
                **err_kw,
            )
        
        # Find the specific IUS combination
        ius_row = dw_db.query(IndicatorUnitSubgroup).filter(
            IndicatorUnitSubgroup.indicator_nid == indicator_row.indicator_nid,
            IndicatorUnitSubgroup.unit_nid == unit_row.unit_nid,
            IndicatorUnitSubgroup.subgroup_val_nid == subgroup_row.subgroup_val_nid
        ).first()
        
        if not ius_row or ius_row.iusnid is None:
            raise IcIusMappingResolveError(
                f"No IUS link for indicator {ind_label}, unit {unit_label}, subgroup {sg_label} "
                "(subgroup exists but indicator is not linked to it)",
                **err_kw,
            )

        return int(ius_row.iusnid)

    def _ic_parent_nid(self, dw_db: Session, ic_nid: int) -> Optional[int]:
        """Return structural parent ic_nid, or None when root (parent -1 / 0 / missing)."""
        IC = IndicatorClassification(get_default_locale(dw_db))
        row = dw_db.query(IC.ic_parent_nid).filter(IC.ic_nid == ic_nid).first()
        if not row or row[0] is None:
            return None
        pid = int(row[0])
        if pid <= 0:
            return None
        return pid

    def _ic_ancestor_nids_ordered(self, dw_db: Session, ic_nid: int) -> List[int]:
        """v5 `getIcAncestors(IcNid)` (addNid false): immediate parent first, then upward."""
        out: List[int] = []
        cur = ic_nid
        while True:
            p = self._ic_parent_nid(dw_db, cur)
            if p is None:
                break
            out.append(p)
            cur = p
        return out

    def _v5_ancestor_nids_when_parent_param(self, dw_db: Session, parent_ic_nid: int) -> List[int]:
        """v5 branch: `getIcAncestors(parentIcNid)` then append parent (excludes edited IC)."""
        chain: List[int] = []
        cur = parent_ic_nid
        while True:
            p = self._ic_parent_nid(dw_db, cur)
            if p is None:
                break
            chain.append(p)
            cur = p
        chain.append(parent_ic_nid)
        return chain

    def _first_child_chain_nids(self, dw_db: Session, ic_nid: int) -> List[int]:
        """
        v5 `getIcChilds(IcNid, getFirstChild=True)`: walk down the first ordered direct child
        at each level (`ic_order` then `ic_nid`).
        """
        IC = IndicatorClassification(get_default_locale(dw_db))
        chain: List[int] = []
        cur = ic_nid
        while True:
            # MySQL (and some other dialects) do not support NULLS LAST; put NULL ic_order after values.
            row = (
                dw_db.query(IC.ic_nid)
                .filter(IC.ic_parent_nid == cur)
                .order_by(
                    case((IC.ic_order.is_(None), 1), else_=0),
                    IC.ic_order.asc(),
                    IC.ic_nid.asc(),
                )
                .first()
            )
            if not row or row[0] is None:
                break
            cid = int(row[0])
            chain.append(cid)
            cur = cid
        return chain

    def _v5_ic_ius_scope_ic_nids(
        self,
        dw_db: Session,
        ic_nid: int,
        parent_ic_nid: Optional[int],
    ) -> List[int]:
        """Ordered unique IC nids: ancestors (+ optional parent path) + first-child chain + edited IC."""
        if parent_ic_nid is not None and parent_ic_nid > 0:
            ancestors = self._v5_ancestor_nids_when_parent_param(dw_db, parent_ic_nid)
        else:
            ancestors = self._ic_ancestor_nids_ordered(dw_db, ic_nid)
        child_chain = self._first_child_chain_nids(dw_db, ic_nid)
        merged: List[int] = []
        seen: Set[int] = set()
        for n in (*ancestors, *child_chain, ic_nid):
            if n not in seen:
                seen.add(n)
                merged.append(n)
        return merged

    def _associate_ic_with_ius_v5(
        self,
        dw_db: Session,
        ic_nid: int,
        target_ius_nids: List[int],
        parent_ic_nid: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Port of v5 `associateIcWithIUS`: diff vs DB for edited IC; delete/add pairs across
        ancestors + first-child path + self (not whole subtree).
        """
        existing = (
            dw_db.query(IcIus.iusnid)
            .filter(IcIus.ic_nid == ic_nid, IcIus.iusnid.isnot(None))
            .all()
        )
        existing_set = {row.iusnid for row in existing}
        target_set = set(target_ius_nids)
        to_add = target_set - existing_set
        to_remove = existing_set - target_set

        scope_ids = self._v5_ic_ius_scope_ic_nids(dw_db, ic_nid, parent_ic_nid)
        scope_set = set(scope_ids)

        added_list = sorted({int(x) for x in to_add if x is not None})
        removed_list = sorted({int(x) for x in to_remove if x is not None})
        if added_list or removed_list:
            from apps.datawarehouse.utils.audit_events import (
                buffer_manual_audit,
                deleted_ids_preview,
            )

            buffer_manual_audit(
                dw_db,
                action="UPDATE",
                module="ic_ius",
                identifier=str(ic_nid),
                previous_value={
                    "removed_count": len(removed_list),
                    "preview_iusnids": deleted_ids_preview(removed_list)["preview_ids"],
                },
                new_value={
                    "added_count": len(added_list),
                    "preview_iusnids": deleted_ids_preview(added_list)["preview_ids"],
                },
                description=(
                    f"map_ic_ius_batch ic_nid={ic_nid} scope_nodes={len(scope_set)}"
                ),
            )

        if to_remove:
            dw_db.query(IcIus).filter(
                IcIus.ic_nid.in_(scope_set),
                IcIus.iusnid.in_(list(to_remove)),
            ).delete(synchronize_session=False)

        if to_add:
            existing_pairs = {
                (int(r[0]), int(r[1]))
                for r in dw_db.query(IcIus.ic_nid, IcIus.iusnid).filter(
                    IcIus.ic_nid.in_(scope_set),
                    IcIus.iusnid.in_(list(to_add)),
                ).all()
                if r[0] is not None and r[1] is not None
            }
            for snid in scope_ids:
                for ius_nid in to_add:
                    if (snid, ius_nid) in existing_pairs:
                        continue
                    dw_db.add(
                        IcIus(
                            ic_nid=snid,
                            iusnid=ius_nid,
                            recommendedsource=False,
                            ic_ius_order=None,
                            ic_ius_label=None,
                        )
                    )
                    existing_pairs.add((snid, ius_nid))

        return {
            "added": len(to_add),
            "removed": len(to_remove),
        }


def build_indicator_classifications_export_xlsx(
    dw_db: Session,
    language_code: str,
    db_connection_display_name: str,
    sort_order: str = "asc",
    sort_field: str = "ic_nid",
    search: Optional[str] = None,
    ic_type: Optional[str] = None,
    ic_parent_nid: Optional[int] = None,
    filter_global: Optional[bool] = None,
) -> Tuple[Any, str]:
    """Build XLSX export for indicator classifications with optional filters (same as list API). Caller must validate DW and pass active dw_db. Returns (xlsx_stream, filename)."""
    service = IndicatorClassificationService()
    dicts = service.get_all_ic_flat_for_export(
        dw_db, language_code,
        sort_order=sort_order, sort_field=sort_field,
        search=search, ic_type=ic_type, ic_parent_nid=ic_parent_nid, filter_global=filter_global,
    )
    headers = ["ic_nid", "ic_name", "ic_gid", "ic_parent_nid", "ic_order", "ic_type", "ic_short_name", "ic_global", "locale"]
    rows = [
        [
            d.get("ic_nid"), d.get("ic_name"), d.get("ic_gid"), d.get("ic_parent_nid"),
            d.get("ic_order"), d.get("ic_type"), d.get("ic_short_name"), d.get("ic_global"), d.get("locale", ""),
        ]
        for d in dicts
    ]
    output = build_simple_xlsx("Indicator Classifications", headers, rows)
    filename = make_export_filename("INDICATOR_CLASSIFICATIONS", db_connection_display_name)
    return output, filename
