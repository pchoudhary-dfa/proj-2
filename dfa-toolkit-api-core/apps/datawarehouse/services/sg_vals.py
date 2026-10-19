"""
Subgroup Vals (combination entity) service for read, create and delete operations.
Uses ut_subgroup_vals_<locale> and ut_subgroup_vals_subgroup + ut_subgroup_<locale> + ut_subgroup_type_<locale> for composition.
API field names: sv_nid, sv_gid, sv_name, sv_order, sv_is_global; subgroup_categories = { category_name: { sg_cat_nid, sg_val_nid, sg_val_name, sg_val_gid } }.
"""
import logging
from typing import List, Optional, Dict, Any

from sqlalchemy import and_, case, func, or_

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import Conflict, NotFound
from apps.datawarehouse.models.datawarehouse import (
    SubgroupCategory,
    Subgroup,
    SubgroupVal,
    MetadataReport,
    get_default_locale,
    SubgroupValsSubgroup,
    Data,
    IcIus,
    IndicatorUnitSubgroup,
)
from apps.shared.utils.validators import generate_guid
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.schemas.sg_vals import SgValResponseSchema, SgValUpdateSchema
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.shared.utils.display_order import reorder_display_orders_multi_locale
from apps.datawarehouse.constants import QUERY_INC_SUBGROUPS, ASSOC_DATA_COUNT, ASSOC_IUS_COUNT
from apps.datawarehouse.utils.export_utils import build_sg_vals_grid_export_xlsx
from apps.datawarehouse.utils.audit_events import (
    buffer_delete_step,
    buffer_manual_audit,
    deleted_ids_preview,
    snapshot_entity_for_audit,
)

logger = logging.getLogger(__name__)

# Error message when duplicate combination is detected (locale-agnostic, uses ut_subgroup_vals_subgroup).
_ERR_SUBGROUP_COMBINATION_ALREADY_EXISTS = (
    "Validation failed: a subgroup combination with the same dimension values already exists"
)
# When sv_gid is omitted, build from subgroup value gids in order (subgroup_val_gid column is typically varchar(50)).
_SUBGROUP_GID_DELIMITER = "_"
_SUBGROUP_VAL_GID_MAX_LENGTH = 50
_SUBGROUP_NAME_DELIMITER = " "


def _normalize_sg_cat_val_gids(gids: Optional[List[str]]) -> List[str]:
    return [str(x).strip() for x in (gids or []) if x and str(x).strip()]


def _resolve_sg_cat_val_gids(
    dw_db: Any,
    sg_cat_val_gids: List[str],
    language_code: str,
) -> tuple[List[int], str]:
    """
    Resolve category value GIDs to subgroup_nids and build combination display name
    (space-separated value names in GID list order).
    """
    default_loc = get_default_locale(dw_db)
    SubgroupDefaultModel = Subgroup(default_loc)
    SubgroupModelForName = Subgroup(language_code)

    subgroup_nids: List[int] = []
    for gid in sg_cat_val_gids:
        gid_str = str(gid).strip()
        rec = dw_db.query(SubgroupDefaultModel).filter(
            SubgroupDefaultModel.subgroup_gid == gid_str
        ).first()
        if not rec:
            raise NotFound(f"subgroup GID '{gid_str}' not found")
        subgroup_nids.append(rec.subgroup_nid)

    names_in_order: List[str] = []
    for nid in subgroup_nids:
        row = dw_db.query(SubgroupModelForName.subgroup_name).filter(
            SubgroupModelForName.subgroup_nid == nid
        ).first()
        names_in_order.append((row.subgroup_name or "").strip() if row else "")
    sv_name = _SUBGROUP_NAME_DELIMITER.join(n for n in names_in_order if n).strip() or str(subgroup_nids[0])
    if not sv_name:
        sv_name = _SUBGROUP_NAME_DELIMITER.join(str(n) for n in subgroup_nids)
    return subgroup_nids, sv_name


def _replace_subgroup_vals_subgroup(
    dw_db: Any,
    subgroup_val_nid: int,
    subgroup_nids: List[int],
) -> None:
    """Replace all junction rows for one subgroup val with a new set of subgroup_nids."""
    dw_db.query(SubgroupValsSubgroup).filter(
        SubgroupValsSubgroup.subgroup_val_nid == subgroup_val_nid
    ).delete(synchronize_session=False)
    for subgroup_nid in list(dict.fromkeys(subgroup_nids)):
        dw_db.add(
            SubgroupValsSubgroup(
                subgroup_val_nid=subgroup_val_nid,
                subgroup_nid=subgroup_nid,
            )
        )


def _subgroup_combination_exists(
    dw_db: Any,
    subgroup_nids: List[int],
    exclude_subgroup_val_nid: Optional[int] = None,
) -> bool:
    """
    Return True if a subgroup val with exactly the same set of subgroup_nids already exists.
    Uses a single grouped query on ut_subgroup_vals_subgroup (locale-agnostic, efficient).
    """
    nids_set = set(subgroup_nids)
    if not nids_set:
        return False
    nids_list = sorted(nids_set)
    len_ours = len(nids_list)
    q = (
        dw_db.query(SubgroupValsSubgroup.subgroup_val_nid)
        .group_by(SubgroupValsSubgroup.subgroup_val_nid)
        .having(
            and_(
                func.count() == len_ours,
                func.sum(
                    case((SubgroupValsSubgroup.subgroup_nid.in_(nids_list), 1), else_=0)
                ) == len_ours,
            )
        )
    )
    if exclude_subgroup_val_nid is not None:
        q = q.filter(SubgroupValsSubgroup.subgroup_val_nid != exclude_subgroup_val_nid)
    row = q.first()
    return row is not None


def _record_to_sv(
    record: Any,
    include_subgroups: bool = False,
    dw_db: Optional[Any] = None,
    language_code: str = "en",
) -> Dict[str, Any]:
    """Map SubgroupVal locale record to dict using SgValResponseSchema (single source of truth for keys)."""
    out = SgValResponseSchema.from_record(record)
    if include_subgroups and dw_db is not None:
        SubgroupCategoryModel = SubgroupCategory(language_code)
        SubgroupModel = Subgroup(language_code)
        # Composition: subgroup_vals_subgroup -> subgroup_nid; join Subgroup + SubgroupCategory for category name
        mapping_rows = (
            dw_db.query(SubgroupValsSubgroup.subgroup_nid)
            .filter(SubgroupValsSubgroup.subgroup_val_nid == record.subgroup_val_nid)
            .all()
        )
        subgroup_nids = [r[0] for r in mapping_rows if r[0] is not None]
        dimension = {}
        if subgroup_nids:
            sub_rows = (
                dw_db.query(
                    SubgroupCategoryModel.subgroup_type_nid,
                    SubgroupCategoryModel.subgroup_type_name,
                    SubgroupCategoryModel.subgroup_type_gid,
                    SubgroupModel.subgroup_nid,
                    SubgroupModel.subgroup_gid,
                    SubgroupModel.subgroup_name,
                )
                .join(SubgroupModel, SubgroupModel.subgroup_type == SubgroupCategoryModel.subgroup_type_nid)
                .filter(SubgroupModel.subgroup_nid.in_(subgroup_nids))
                .all()
            )
            for r in sub_rows:
                sg_cat_nid, sg_cat_name, sg_cat_gid, sg_val_nid, sg_val_gid, sg_val_name = r
                key = sg_cat_name or f"sg_cat_nid_{sg_cat_nid}"
                dimension[key] = {
                    "sg_cat_nid": sg_cat_nid,
                    "sg_cat_name": sg_cat_name,
                    "sg_cat_gid": sg_cat_gid,
                    "sg_val_nid": sg_val_nid,
                    "sg_val_name": sg_val_name,
                    "sg_val_gid": sg_val_gid,
                }
        out[QUERY_INC_SUBGROUPS] = dimension
    return out


class SgValsService:
    """Service for Subgroup Vals (combination entity) read and delete operations."""
    _CASCADE_CHUNK_SIZE = 500

    def get_all_sg_vals(
        self,
        dw_id: str,
        language_code: str = "en",
        inc_subgroups: bool = False,
        filter_type: Optional[str] = None,
        page: int = 1,
        page_size: Optional[int] = 10,
        search: Optional[str] = None,
        search_by: Optional[str] = None,
        search_field: Optional[str] = None,
        category_val: Optional[str] = None,
        sort_order: str = "asc",
        sort_field: str = "sv_order",
    ) -> tuple[List[Dict[str, Any]], int, Optional[int]]:
        """
        List subgroup vals (combinations) with pagination and optional sorting.

        sort_field: sv_nid, sv_name, sv_gid, sv_order (map to subgroup_val_nid, subgroup_val, subgroup_val_gid, subgroup_val_order)

        Returns:
            Tuple of (list of dicts with sv_nid, sv_gid, sv_name, sv_order, sv_is_global; optional subgroup_categories, total_count)
        """
        use_pagination = page_size is not None
        if use_pagination:
            page = max(1, page)
            page_size = max(1, min(page_size, 1000))
            skip = (page - 1) * page_size

        with get_warehouse_session_from_id(dw_id) as dw_db:
            SubgroupValModel = SubgroupVal(language_code)
            order_column = SubgroupValModel.subgroup_val_order
            if sort_field == "sv_nid":
                order_column = SubgroupValModel.subgroup_val_nid
            elif sort_field == "sv_name":
                order_column = SubgroupValModel.subgroup_val
            elif sort_field == "sv_gid":
                order_column = SubgroupValModel.subgroup_val_gid
            elif sort_field == "sv_order":
                order_column = SubgroupValModel.subgroup_val_order
            if sort_order and sort_order.lower() == "desc":
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()
            q = (
                dw_db.query(SubgroupValModel)
                .order_by(order_column)
            )
            has_list_filters = bool(
                (search and search.strip() and search_by and search_field)
                or filter_type in ("NO_IUS", "NO_DATA")
                or (category_val and category_val.strip())
            )
            total_count_unfiltered: Optional[int] = (
                dw_db.query(SubgroupValModel).count() if has_list_filters else None
            )
            if filter_type == "NO_IUS":
                # Exclude subgroup vals that appear in ut_indicator_unit_subgroup (IUS)
                ius_sv_nids = [
                    r[0]
                    for r in dw_db.query(IndicatorUnitSubgroup.subgroup_val_nid)
                    .distinct()
                    .all()
                ]
                ius_sv_nids = [n for n in ius_sv_nids if n is not None]
                if ius_sv_nids:
                    q = q.filter(SubgroupValModel.subgroup_val_nid.notin_(ius_sv_nids))
            elif filter_type == "NO_DATA":
                # Exclude subgroup vals that appear in ut_data
                data_sv_nids = [
                    r[0]
                    for r in dw_db.query(Data.subgroup_val_nid).distinct().all()
                ]
                data_sv_nids = [n for n in data_sv_nids if n is not None]
                if data_sv_nids:
                    q = q.filter(SubgroupValModel.subgroup_val_nid.notin_(data_sv_nids))
            # Enhanced search logic - no legacy support
            if search and search.strip() and search_by and search_field:
                pattern = f"%{search.strip()}%"
                
                if search_by == "subgroup":
                    # Case 1: Search in SubgroupVal table directly
                    if search_field == "subgroup_val":
                        q = q.filter(SubgroupValModel.subgroup_val.ilike(pattern))
                    elif search_field == "subgroup_val_gid":
                        q = q.filter(SubgroupValModel.subgroup_val_gid.ilike(pattern))
                        
                elif search_by == "subgroup_category_val":
                    # Case 2: Search in Subgroup table with optional category filtering
                    SubgroupModel = Subgroup(language_code)
                    SubgroupCategoryModel = SubgroupCategory(language_code)
                    
                    # Build subquery to find matching subgroup_val_nids
                    subquery = (
                        dw_db.query(SubgroupValsSubgroup.subgroup_val_nid)
                        .join(SubgroupModel, SubgroupValsSubgroup.subgroup_nid == SubgroupModel.subgroup_nid)
                    )
                    
                    # Apply search field filter
                    if search_field == "subgroup_name":
                        subquery = subquery.filter(SubgroupModel.subgroup_name.ilike(pattern))
                    elif search_field == "subgroup_gid":
                        subquery = subquery.filter(SubgroupModel.subgroup_gid.ilike(pattern))
                    
                    # Apply category filter if provided
                    if category_val and category_val.strip():
                        category_pattern = f"%{category_val.strip()}%"
                        subquery = subquery.join(
                            SubgroupCategoryModel, 
                            SubgroupModel.subgroup_type == SubgroupCategoryModel.subgroup_type_nid
                        ).filter(
                            or_(
                                SubgroupCategoryModel.subgroup_type_name.ilike(category_pattern),
                                SubgroupCategoryModel.subgroup_type_gid.ilike(category_pattern)
                            )
                        )
                    
                    # Apply the subquery filter to main query
                    q = q.filter(SubgroupValModel.subgroup_val_nid.in_(subquery))
            total_count = q.count()
            if use_pagination:
                rows = q.offset(skip).limit(page_size).all()
            else:
                rows = q.all()
            items = [_record_to_sv(r, include_subgroups=inc_subgroups, dw_db=dw_db, language_code=language_code) for r in rows]
            return items, total_count, total_count_unfiltered

    def get_sg_val_nid_by_gid(self, dw_id: str, sv_gid: str) -> Optional[int]:
        """Resolve sv_gid to sv_nid (subgroup_val_nid)."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            SubgroupValDefaultModel = SubgroupVal(get_default_locale(dw_db))
            row = dw_db.query(SubgroupValDefaultModel).filter(SubgroupValDefaultModel.subgroup_val_gid == sv_gid).first()
            return row.subgroup_val_nid if row else None

    def get_association_counts(
        self,
        dw_id: str,
        subgroup_val_nids: List[int],
    ) -> Dict[str, int]:
        """
        Return association counts for the given subgroup vals (for delete confirmation).
        Counts data rows (ut_data) and IUS rows (indicator-unit-subgroup) linked to those subgroup_val_nids.
        Raises ValueError with message "Subgroup(s) not found: ..." if any requested subgroup_val_nid does not exist.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            if not subgroup_val_nids:
                data_count = dw_db.query(func.count(Data.data_nid)).scalar() or 0
                ius_count = dw_db.query(func.count(IndicatorUnitSubgroup.iusnid)).scalar() or 0
                return {ASSOC_DATA_COUNT: data_count, ASSOC_IUS_COUNT: ius_count}
            SubgroupValDefaultModel = SubgroupVal(get_default_locale(dw_db))
            existing = (
                dw_db.query(SubgroupValDefaultModel.subgroup_val_nid)
                .filter(SubgroupValDefaultModel.subgroup_val_nid.in_(subgroup_val_nids))
                .all()
            )
            existing_nids = {r[0] for r in existing}
            missing = set(subgroup_val_nids) - existing_nids
            if missing:
                raise ValueError(
                    f"Subgroup(s) not found: {', '.join(str(n) for n in sorted(missing))}"
                )

            data_count = (
                dw_db.query(func.count(Data.data_nid))
                .filter(Data.subgroup_val_nid.in_(subgroup_val_nids))
                .scalar() or 0
            )
            ius_count = (
                dw_db.query(func.count(IndicatorUnitSubgroup.iusnid))
                .filter(IndicatorUnitSubgroup.subgroup_val_nid.in_(subgroup_val_nids))
                .scalar() or 0
            )
            return {ASSOC_DATA_COUNT: data_count, ASSOC_IUS_COUNT: ius_count}

    def get_sg_val_by_identifier(
        self,
        dw_id: str,
        identifier: str,
        language_code: str = "en",
        inc_subgroups: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Get one subgroup val by identifier (numeric sv_nid or non-numeric sv_gid).

        Args:
            dw_id: Data warehouse identifier
            identifier: sv_nid (numeric) or sv_gid (non-numeric)
            language_code: Language for locale content
            inc_subgroups: If True, include composition (dimension keyed by category name)

        Returns:
            Dict with sv_nid, sv_gid, sv_name, sv_order, sv_is_global; optional subgroup_categories (category name -> { sg_cat_nid, sg_val_nid, sg_val_name, sg_val_gid }), or None
        """

        with get_warehouse_session_from_id(dw_id) as dw_db:
            SubgroupValModel = SubgroupVal(language_code)
            if identifier.isdigit():
                row = dw_db.query(SubgroupValModel).filter(
                    SubgroupValModel.subgroup_val_nid == int(identifier)
                ).first()
            else:
                row = dw_db.query(SubgroupValModel).filter(
                    SubgroupValModel.subgroup_val_gid == identifier
                ).first()
            return _record_to_sv(row, include_subgroups=inc_subgroups, dw_db=dw_db, language_code=language_code) if row else None

    def update_sg_val(
        self,
        dw_id: str,
        identifier: str,
        data: SgValUpdateSchema,
        language_code: str = "en",
    ) -> Optional[Dict[str, Any]]:
        """
        Partial update for a subgroup combination (ut_subgroup_vals).
        identifier: numeric subgroup_val_nid or alphanumeric subgroup_val_gid.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            DefaultModel = SubgroupVal(get_default_locale(dw_db))
            if identifier.isdigit():
                row = dw_db.query(DefaultModel).filter(
                    DefaultModel.subgroup_val_nid == int(identifier)
                ).first()
            else:
                row = dw_db.query(DefaultModel).filter(
                    DefaultModel.subgroup_val_gid == identifier
                ).first()
            if not row:
                return None
            if getattr(row, "is_system", False):
                raise ValueError("System subgroup cannot be updated via API")

            sv_nid = row.subgroup_val_nid
            payload: Dict[str, Any] = {}
            composition_gids: Optional[List[str]] = None

            if data.sg_cat_val_gids is not None:
                composition_gids = _normalize_sg_cat_val_gids(data.sg_cat_val_gids)
                if not composition_gids:
                    raise ValueError(
                        "Validation failed: sg_cat_val_gids is required and must not be empty"
                    )
                subgroup_nids, sv_name = _resolve_sg_cat_val_gids(
                    dw_db, composition_gids, language_code
                )
                if _subgroup_combination_exists(
                    dw_db, subgroup_nids, exclude_subgroup_val_nid=sv_nid
                ):
                    raise ValueError(_ERR_SUBGROUP_COMBINATION_ALREADY_EXISTS)
                _replace_subgroup_vals_subgroup(dw_db, sv_nid, subgroup_nids)
                payload["subgroup_val"] = sv_name

            if data.subgroup_val is not None and composition_gids is None:
                name = data.subgroup_val.strip()
                if not name:
                    raise ValueError("Validation failed: subgroup_val cannot be empty")
                if len(name) > 255:
                    raise ValueError("Validation failed: subgroup_val max 255 characters")
                payload["subgroup_val"] = name

            if data.subgroup_val_gid is not None:
                gid = data.subgroup_val_gid.strip()
                if len(gid) > _SUBGROUP_VAL_GID_MAX_LENGTH:
                    raise ValueError(
                        f"Validation failed: subgroup_val_gid max {_SUBGROUP_VAL_GID_MAX_LENGTH} characters"
                    )
                existing = dw_db.query(DefaultModel).filter(
                    DefaultModel.subgroup_val_gid == gid,
                    DefaultModel.subgroup_val_nid != sv_nid,
                ).first()
                if existing:
                    raise Conflict(f"subgroup_val_gid already exists: {gid!r}")
                payload["subgroup_val_gid"] = gid

            if data.subgroup_val_order is not None:
                payload["subgroup_val_order"] = data.subgroup_val_order

            if data.subgroup_val_global is not None:
                payload["subgroup_val_global"] = data.subgroup_val_global

            old_order = row.subgroup_val_order
            if data.subgroup_val_order is not None:
                old_o = old_order if old_order is not None else 0
                new_o = data.subgroup_val_order
                if new_o != old_o:
                    reorder_display_orders_multi_locale(
                        dw_db=dw_db,
                        dw_id=dw_id,
                        model_class_factory=SubgroupVal,
                        order_column_name="subgroup_val_order",
                        pk_column_name="subgroup_val_nid",
                        updated_record_id=sv_nid,
                        new_order=new_o,
                        old_order=old_o,
                    )

            apply_locale_update(
                dw_db,
                dw_id,
                SubgroupVal,
                "subgroup_val_nid",
                sv_nid,
                payload,
                language_code,
            )
            dw_db.flush()
            dw_db.refresh(row)
            result = SgValResponseSchema.from_record(row)
            if composition_gids is not None:
                result["sg_cat_val_gids"] = composition_gids
            return result

    def _create_subgroup_combination_in_session(
        self,
        dw_db,
        dw_id: str,
        item: Dict[str, Any],
        language_code: str,
    ) -> Dict[str, Any]:
        """
        Create a single subgroup combination within an existing session. Raises ValueError on validation failure.
        """
        SubgroupValDefaultModel = SubgroupVal(get_default_locale(dw_db))
        SubgroupDefaultModel = Subgroup(get_default_locale(dw_db))

        sg_cat_val_gids = _normalize_sg_cat_val_gids(item.get("sg_cat_val_gids"))
        if not sg_cat_val_gids:
            raise ValueError("Validation failed: sg_cat_val_gids is required and must not be empty")

        subgroup_nids, sv_name = _resolve_sg_cat_val_gids(dw_db, sg_cat_val_gids, language_code)

        if _subgroup_combination_exists(dw_db, subgroup_nids):
            raise ValueError(_ERR_SUBGROUP_COMBINATION_ALREADY_EXISTS)

        sv_gid = (item.get("sv_gid") or "").strip() or None
        if not sv_gid:
            gid_rows = (
                dw_db.query(SubgroupDefaultModel.subgroup_nid, SubgroupDefaultModel.subgroup_gid)
                .filter(SubgroupDefaultModel.subgroup_nid.in_(subgroup_nids))
                .all()
            )
            gid_by_nid = {r[0]: (r[1] or "").strip() or str(r[0]) for r in gid_rows}
            gids_in_order = [gid_by_nid.get(nid, str(nid)) for nid in subgroup_nids]
            combined_gid = _SUBGROUP_GID_DELIMITER.join(g for g in gids_in_order if g)
            if combined_gid and len(combined_gid) <= _SUBGROUP_VAL_GID_MAX_LENGTH:
                existing = dw_db.query(SubgroupValDefaultModel).filter(
                    SubgroupValDefaultModel.subgroup_val_gid == combined_gid
                ).first()
                sv_gid = combined_gid if not existing else generate_guid()
            else:
                sv_gid = generate_guid()
        else:
            existing_gid = dw_db.query(SubgroupValDefaultModel).filter(
                SubgroupValDefaultModel.subgroup_val_gid == sv_gid
            ).first()
            if existing_gid:
                raise Conflict(f"sv_gid already exists: {sv_gid!r}")

        max_nid = dw_db.query(func.coalesce(func.max(SubgroupValDefaultModel.subgroup_val_nid), 0)).scalar()
        subgroup_val_nid = int(max_nid) + 1

        sv_order = item.get("sv_order")
        if sv_order is None:
            max_order = dw_db.query(
                func.coalesce(func.max(SubgroupValDefaultModel.subgroup_val_order), 0)
            ).scalar()
            sv_order = int(max_order or 0) + 1

        sv_global = bool(item.get("sv_global") or False)

        for lang_code in get_dw_language_codes(dw_id):
            SubgroupValModel = SubgroupVal(lang_code)
            row = SubgroupValModel(
                subgroup_val_nid=subgroup_val_nid,
                subgroup_val=value_for_locale(sv_name, lang_code, language_code),
                subgroup_val_gid=sv_gid,
                subgroup_val_global=sv_global,
                subgroup_val_order=sv_order,
                is_system=False,
            )
            dw_db.add(row)
        dw_db.flush()

        _replace_subgroup_vals_subgroup(dw_db, subgroup_val_nid, subgroup_nids)
        dw_db.flush()

        return {
            "subgroup_val_nid": subgroup_val_nid,
            "subgroup_val_gid": sv_gid,
            "subgroup_val": sv_name,
            "subgroup_val_order": sv_order,
            "subgroup_val_global": sv_global,
        }

    def create_subgroup_combinations(
        self,
        dw_id: str,
        subgroup_list: List[Dict[str, Any]],
        language_code: str = "en",
    ) -> Dict[str, Any]:
        """
        Create one or more subgroup combinations with partial-success support.
        Each item is committed independently; failures are collected in errors.
        Returns dict with created (list of result dicts) and errors (list of {index, error} dicts).
        """
        created: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []

        for idx, item in enumerate(subgroup_list):
            with get_warehouse_session_from_id(dw_id) as dw_db:
                try:
                    result = self._create_subgroup_combination_in_session(dw_db, dw_id, item, language_code)
                    dw_db.commit()
                    created.append(result)
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

        return {"created": created, "errors": errors}

    def _delete_sg_val_in_session(
        self,
        dw_db: Any,
        dw_id: str,
        subgroup_val_id: int,
        language_codes: Optional[List[str]] = None,
    ) -> bool:
        """
        Cascade-delete a single subgroup val within an existing session (no commit).
        Caller must commit. Prefer ``cascade_delete_sg_val_in_session`` for external call sites.

        Pass ``language_codes`` when repeating this in a loop to avoid reloading warehouse
        locale lists on every call (e.g. category-value delete).
        """
        lang_codes = language_codes if language_codes is not None else get_dw_language_codes(dw_id)
        default_loc = get_default_locale(dw_db)
        SvDefault = SubgroupVal(default_loc)
        sv_entity = (
            dw_db.query(SvDefault)
            .filter(SvDefault.subgroup_val_nid == subgroup_val_id)
            .first()
        )

        # 1) Delete ut_data where subgroup_val_nid = subgroup_val_id (chunked)
        data_nids = [
            r[0]
            for r in dw_db.query(Data.data_nid).filter(
                Data.subgroup_val_nid == subgroup_val_id
            ).all()
        ]
        for i in range(0, len(data_nids), self._CASCADE_CHUNK_SIZE):
            chunk = data_nids[i : i + self._CASCADE_CHUNK_SIZE]
            dw_db.query(Data).filter(Data.data_nid.in_(chunk)).delete(
                synchronize_session=False
            )
        if data_nids:
            logger.info(f"Cascade deleted {len(data_nids)} ut_data row(s) for subgroup val {subgroup_val_id}")
            buffer_delete_step(
                dw_db,
                module="data",
                description=(
                    f"Cascade deleted {len(data_nids)} ut_data row(s) for "
                    f"subgroup_val_nid={subgroup_val_id}"
                ),
                previous_value={
                    "subgroup_val_nid": subgroup_val_id,
                    **deleted_ids_preview(data_nids),
                },
            )

        # 2) Get IUS nids for this subgroup_val_nid, then delete ut_ic_ius (chunked)
        ius_rows = dw_db.query(IndicatorUnitSubgroup.iusnid).filter(
            IndicatorUnitSubgroup.subgroup_val_nid == subgroup_val_id
        ).all()
        ius_nids = [r[0] for r in ius_rows]
        ic_ius_pks: List[int] = []
        if ius_nids:
            ic_ius_pks = [
                r[0]
                for r in dw_db.query(IcIus.ic_iusnid).filter(
                    IcIus.iusnid.in_(ius_nids)
                ).all()
            ]
        for i in range(0, len(ius_nids), self._CASCADE_CHUNK_SIZE):
            chunk = ius_nids[i : i + self._CASCADE_CHUNK_SIZE]
            dw_db.query(IcIus).filter(IcIus.iusnid.in_(chunk)).delete(
                synchronize_session=False
            )
        if ius_nids:
            logger.info(f"Cascade deleted ut_ic_ius for {len(ius_nids)} IUS for subgroup val {subgroup_val_id}")
            buffer_delete_step(
                dw_db,
                module="ic_ius",
                description=(
                    f"Cascade deleted ut_ic_ius links for {len(ius_nids)} IUS "
                    f"(subgroup_val_nid={subgroup_val_id})"
                ),
                previous_value={
                    "subgroup_val_nid": subgroup_val_id,
                    "linked_ius": deleted_ids_preview(ius_nids),
                    "deleted_ic_ius": deleted_ids_preview(ic_ius_pks),
                },
            )

        # 3) Delete metadata reports (ut_metadatareport_* by target_nid) for all locales
        deleted_meta_by_locale: Dict[str, int] = {}
        for lang_code in lang_codes:
            MetadataReportModel = MetadataReport(lang_code)
            deleted_meta = dw_db.query(MetadataReportModel).filter(
                MetadataReportModel.target_nid == subgroup_val_id
            ).delete(synchronize_session=False)
            if deleted_meta:
                logger.info(
                    f"Cascade deleted {deleted_meta} metadata report(s) "
                    f"for subgroup val {subgroup_val_id} (locale {lang_code})"
                )
                deleted_meta_by_locale[str(lang_code)] = int(deleted_meta)
        if deleted_meta_by_locale:
            buffer_delete_step(
                dw_db,
                module="metadata_report",
                identifier=str(subgroup_val_id),
                description=(
                    f"Cascade deleted {sum(deleted_meta_by_locale.values())} metadata report row(s) "
                    f"for subgroup_val_nid={subgroup_val_id} (locale tables)"
                ),
                previous_value={
                    "target_nid": subgroup_val_id,
                    "deleted_by_locale": deleted_meta_by_locale,
                },
            )

        # 4) Delete IUS where subgroup_val_nid = subgroup_val_id
        deleted_ius = dw_db.query(IndicatorUnitSubgroup).filter(
            IndicatorUnitSubgroup.subgroup_val_nid == subgroup_val_id
        ).delete(synchronize_session=False)
        if deleted_ius:
            logger.info(f"Cascade deleted {deleted_ius} IUS record(s) for subgroup val {subgroup_val_id}")
            buffer_delete_step(
                dw_db,
                module="indicator_unit_subgroup",
                description=f"Cascade deleted {deleted_ius} IUS record(s) for subgroup_val_nid={subgroup_val_id}",
                previous_value={
                    "subgroup_val_nid": subgroup_val_id,
                    **deleted_ids_preview(ius_nids),
                },
            )

        # 5) Delete ut_subgroup_vals_subgroup where subgroup_val_nid = subgroup_val_id
        junc_pks = [
            r[0]
            for r in dw_db.query(SubgroupValsSubgroup.subgroup_val_subgroup_nid).filter(
                SubgroupValsSubgroup.subgroup_val_nid == subgroup_val_id
            ).all()
        ]
        del_junc = dw_db.query(SubgroupValsSubgroup).filter(
            SubgroupValsSubgroup.subgroup_val_nid == subgroup_val_id
        ).delete(synchronize_session=False)
        if del_junc:
            buffer_delete_step(
                dw_db,
                module="subgroup_vals_subgroup",
                description=(
                    f"Deleted {del_junc} ut_subgroup_vals_subgroup row(s) "
                    f"for subgroup_val_nid={subgroup_val_id}"
                ),
                previous_value={
                    "subgroup_val_nid": subgroup_val_id,
                    **deleted_ids_preview(junc_pks),
                },
            )

        # 6) Delete locale ut_subgroup_vals (all locales)
        for lang_code in lang_codes:
            SubgroupValModel = SubgroupVal(lang_code)
            dw_db.query(SubgroupValModel).filter(
                SubgroupValModel.subgroup_val_nid == subgroup_val_id
            ).delete(synchronize_session=False)
        sv_prev: Dict[str, Any]
        if sv_entity is not None:
            sv_prev = snapshot_entity_for_audit(sv_entity)
        else:
            sv_prev = {
                "subgroup_val_nid": subgroup_val_id,
                "note": "subgroup_val row not found in default locale before delete",
            }
        buffer_manual_audit(
            dw_db,
            action="DELETE",
            module="subgroup_val",
            identifier=str(subgroup_val_id),
            description=f"Deleted subgroup val nid={subgroup_val_id} with cascade IUS, metadata, and data rows",
            previous_value=sv_prev,
        )

        dw_db.flush()
        return True

    def cascade_delete_sg_val_in_session(
        self,
        dw_db: Any,
        dw_id: str,
        subgroup_val_nid: int,
        language_codes: Optional[List[str]] = None,
    ) -> bool:
        """
        Public entry for cascade-deleting one subgroup combination (ut_subgroup_vals) within
        an open warehouse session; does not commit. Delegates to _delete_sg_val_in_session.
        """
        return self._delete_sg_val_in_session(
            dw_db, dw_id, subgroup_val_nid, language_codes=language_codes
        )

    def delete_sg_val(
        self,
        dw_id: str,
        subgroup_val_id: int,
        language_code: str = "en",
    ) -> bool:
        """
        Delete a subgroup val (sv_nid) with full cascade (on confirmed delete).

        Cascade order:
        1. ut_data (by subgroup_val_nid), chunked
        2. ut_ic_ius (for IUS rows with this subgroup_val_nid), chunked
        3. Metadata reports (ut_metadatareport_* by target_nid) for all locales
        4. IUS (ut_indicator_unit_subgroup by subgroup_val_nid)
        5. ut_subgroup_vals_subgroup (by subgroup_val_nid)
        6. Locale ut_subgroup_vals (all locales)
        """
        logger.info(f"Deleting subgroup val ID {subgroup_val_id} from warehouse '{dw_id}' (cascade)")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            lang_codes = get_dw_language_codes(dw_id)
            SubgroupValDefaultModel = SubgroupVal(get_default_locale(dw_db))
            row = dw_db.query(SubgroupValDefaultModel).filter(
                SubgroupValDefaultModel.subgroup_val_nid == subgroup_val_id
            ).first()
            if not row:
                logger.warning(f"Subgroup val {subgroup_val_id} not found for deletion")
                return False
            if getattr(row, "is_system", False):
                raise ValueError("System subgroup cannot be deleted via API")

            self.cascade_delete_sg_val_in_session(
                dw_db, dw_id, subgroup_val_id, language_codes=lang_codes
            )
            dw_db.commit()
            logger.info(f"Subgroup val {subgroup_val_id} deleted successfully (cascade)")

        notify_dbmetadata_counts_changed(dw_id)
        return True

    def multiple_delete(
        self,
        dw_id: str,
        subgroup_val_nids: List[int],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete multiple subgroup vals by subgroup_val_nid with partial-success support.
        Returns deleted nids, aggregated data/ius deleted counts, and per-item errors.
        """
        if not subgroup_val_nids:
            return {"deleted": [], "data_rows_deleted": 0, "ius_deleted": 0, "errors": []}

        with get_warehouse_session_from_id(dw_id) as dw_db:
            lang_codes = get_dw_language_codes(dw_id)
            deleted: List[int] = []
            errors: List[Dict[str, Any]] = []
            total_data = 0
            total_ius = 0
            for idx, sv_id in enumerate(subgroup_val_nids):
                SubgroupValDefaultModel = SubgroupVal(get_default_locale(dw_db))
                row = dw_db.query(SubgroupValDefaultModel).filter(
                    SubgroupValDefaultModel.subgroup_val_nid == sv_id
                ).first()
                if not row:
                    errors.append({"index": idx, "error": f"Subgroup with nid '{sv_id}' not found"})
                    continue
                if getattr(row, "is_system", False):
                    errors.append({"index": idx, "error": "System subgroup cannot be deleted via API"})
                    continue
                try:
                    data_before = (
                        dw_db.query(func.count(Data.data_nid))
                        .filter(Data.subgroup_val_nid == sv_id)
                        .scalar()
                        or 0
                    )
                    ius_before = (
                        dw_db.query(func.count(IndicatorUnitSubgroup.iusnid))
                        .filter(IndicatorUnitSubgroup.subgroup_val_nid == sv_id)
                        .scalar()
                        or 0
                    )
                    if self.cascade_delete_sg_val_in_session(
                        dw_db, dw_id, sv_id, language_codes=lang_codes
                    ):
                        deleted.append(sv_id)
                        total_data += data_before
                        total_ius += ius_before
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})
            dw_db.commit()

        if deleted:
            notify_dbmetadata_counts_changed(dw_id)
        return {
            "deleted": deleted,
            "data_rows_deleted": total_data,
            "ius_deleted": total_ius,
            "errors": errors,
        }

    def update_affected_subgroup_names(self, dw_id: str, category_value_nid: int, language_code: str) -> dict:
        """
        Update names of all subgroups that include the specified category value.
        
        Args:
            dw_id: Data warehouse identifier  
            category_value_nid: subgroup_nid that had its order changed
            language_code: Language for name generation
            
        Returns:
            dict: {"updated_count": int, "affected_subgroups": [subgroup_val_nids]}
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Find all subgroup_vals that include this category value
            affected_subgroup_val_nids = self._get_affected_subgroup_vals(dw_db, category_value_nid)
            
            updated_count = 0
            for subgroup_val_nid in affected_subgroup_val_nids:
                if self._regenerate_subgroup_name(dw_db, dw_id, subgroup_val_nid, language_code):
                    updated_count += 1
            
            dw_db.commit()
            return {
                "updated_count": updated_count,
                "affected_subgroups": affected_subgroup_val_nids
            }

    def update_subgroups_for_category_order_change(self, dw_id: str, category_nid: int, language_code: str) -> dict:
        """
        Update names of all subgroups that include values from the specified category.
        This is triggered when a subgroup category's display order changes.
        
        Args:
            dw_id: Data warehouse identifier
            category_nid: subgroup_type_nid that had its order changed
            language_code: Language for name generation
            
        Returns:
            dict: {"updated_count": int, "affected_subgroups": [subgroup_val_nids]}
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Find all subgroup_vals that include values from this category
            affected_subgroup_val_nids = self._get_subgroups_using_category(dw_db, category_nid)
            
            updated_count = 0
            for subgroup_val_nid in affected_subgroup_val_nids:
                if self._regenerate_subgroup_name(dw_db, dw_id, subgroup_val_nid, language_code):
                    updated_count += 1
            
            dw_db.commit()
            return {
                "updated_count": updated_count,
                "affected_subgroups": affected_subgroup_val_nids
            }

    def _get_subgroups_using_category(self, dw_db, category_nid: int) -> List[int]:
        """Find all subgroup_val_nids that include values from the specified category."""
        # Get all subgroup values (individual items) in this category
        SubgroupModel = Subgroup(get_default_locale(dw_db))
        category_value_nids = (
            dw_db.query(SubgroupModel.subgroup_nid)
            .filter(SubgroupModel.subgroup_type == category_nid)
            .all()
        )
        
        if not category_value_nids:
            return []
        
        category_value_nids = [r[0] for r in category_value_nids]
        
        # Find all subgroup combinations that use any of these values
        affected_subgroup_val_nids = (
            dw_db.query(SubgroupValsSubgroup.subgroup_val_nid)
            .filter(SubgroupValsSubgroup.subgroup_nid.in_(category_value_nids))
            .distinct()
            .all()
        )
        
        return [r[0] for r in affected_subgroup_val_nids if r[0] is not None]

    def _get_affected_subgroup_vals(self, dw_db, category_value_nid: int) -> List[int]:
        """Find subgroup_val_nids that include the specified category value."""
        records = (
            dw_db.query(SubgroupValsSubgroup.subgroup_val_nid)
            .filter(SubgroupValsSubgroup.subgroup_nid == category_value_nid)
            .distinct()
            .all()
        )
        return [r[0] for r in records if r[0] is not None]

    def _regenerate_subgroup_name(self, dw_db, dw_id: str, subgroup_val_nid: int, language_code: str) -> bool:
        """Regenerate name for a specific subgroup_val using current category hierarchy ordering."""
        # Get all category values for this subgroup_val in their current order
        mapping_rows = (
            dw_db.query(SubgroupValsSubgroup.subgroup_nid)
            .filter(SubgroupValsSubgroup.subgroup_val_nid == subgroup_val_nid)
            .all()
        )
        subgroup_nids = [r[0] for r in mapping_rows if r[0] is not None]
        
        if not subgroup_nids:
            return False
        
        # Get category values ordered by parent category's subgroup_type_order
        SubgroupModel = Subgroup(language_code)
        SubgroupCategoryModel = SubgroupCategory(language_code)
        category_values = (
            dw_db.query(SubgroupModel)
            .join(SubgroupCategoryModel, SubgroupModel.subgroup_type == SubgroupCategoryModel.subgroup_type_nid)
            .filter(SubgroupModel.subgroup_nid.in_(subgroup_nids))
            .order_by(
                SubgroupCategoryModel.subgroup_type_order.asc(),  # Primary: Category hierarchy order
                SubgroupModel.subgroup_order.asc(),               # Secondary: Value order within category
                SubgroupModel.subgroup_nid.asc()                  # Tertiary: Stable sort
            )
            .all()
        )
        
        # Generate new name (same logic as creation)
        _SUBGROUP_NAME_DELIMITER = " "
        names_in_order = [(cv.subgroup_name or "").strip() for cv in category_values]
        new_name = _SUBGROUP_NAME_DELIMITER.join(n for n in names_in_order if n).strip()
        
        if not new_name:
            new_name = str(subgroup_nids[0])
        
        # Update all locale tables
        for lang_code in get_dw_language_codes(dw_id):
            SubgroupValModel = SubgroupVal(lang_code)
            dw_db.query(SubgroupValModel).filter(
                SubgroupValModel.subgroup_val_nid == subgroup_val_nid
            ).update({
                SubgroupValModel.subgroup_val: value_for_locale(new_name, lang_code, language_code)
            })
        buffer_manual_audit(
            dw_db,
            action="UPDATE",
            module="subgroup_val",
            identifier=str(subgroup_val_nid),
            description=f"Auto-renamed subgroup val nid={subgroup_val_nid} to '{new_name}' across all locales",
            new_value={"subgroup_val": new_name},
        )

        return True


def _subgroup_type_columns_for_export(dw_db: Any, language_code: str) -> List[Dict[str, Any]]:
    """All ut_subgroup_type columns in display order for pivoted subgroup export."""
    SubgroupCategoryModel = SubgroupCategory(language_code)
    rows = (
        dw_db.query(
            SubgroupCategoryModel.subgroup_type_nid,
            SubgroupCategoryModel.subgroup_type_name,
            SubgroupCategoryModel.subgroup_type_order,
        )
        .order_by(
            SubgroupCategoryModel.subgroup_type_order.asc(),
            SubgroupCategoryModel.subgroup_type_nid.asc(),
        )
        .all()
    )
    return [
        {"sg_cat_nid": r[0], "sg_cat_name": r[1], "sg_cat_order": r[2]}
        for r in rows
    ]


def build_sg_vals_export_xlsx(
    dw_id: str,
    language_code: str,
    db_connection_display_name: str,
    sort_order: str = "asc",
    sort_field: str = "sv_order",
    search: Optional[str] = None,
    search_by: Optional[str] = None,
    search_field: Optional[str] = None,
    category_val: Optional[str] = None,
    scope: Optional[str] = None,
):
    """
    Build pivoted XLSX export for subgroup vals (FED grid layout).
    Respects the same filters/sort as the list API. scope: NO_DATA, NO_IUS.
    Returns (xlsx_stream, filename).
    """
    service = SgValsService()
    items, _, _ = service.get_all_sg_vals(
        dw_id,
        language_code=language_code,
        inc_subgroups=True,
        filter_type=scope,
        page=1,
        page_size=None,
        search=search,
        search_by=search_by,
        search_field=search_field,
        category_val=category_val,
        sort_order=sort_order,
        sort_field=sort_field,
    )
    with get_warehouse_session_from_id(dw_id) as dw_db:
        category_columns = _subgroup_type_columns_for_export(dw_db, language_code)
    return build_sg_vals_grid_export_xlsx(
        items, category_columns, language_code, db_connection_display_name
    )
