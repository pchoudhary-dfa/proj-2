"""
Subgroup Category (Subgroup Type) service – CRUD and read.
Uses ut_subgroup_type_<locale> (built from SubgroupTypeLocaleMixin). API field names: sg_cat_nid, sg_cat_name, sg_cat_gid, sg_cat_order, sg_cat_global.
"""
import logging
from typing import List, Optional, Dict, Any, Tuple

from sqlalchemy import func, or_, distinct

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import NotFound
from apps.datawarehouse.models.datawarehouse import (
    SubgroupCategory,
    Subgroup,
    SubgroupVal,
    MetadataReport,
    get_default_locale,
    SubgroupValsSubgroup,
    IndicatorUnitSubgroup,
    Data,
    IcIus,
)
from apps.datawarehouse.schemas.sg_categories import (
    SgCategoryCreateSchema,
    SgCategoryUpdateSchema,
    SgCategoryResponseSchema,
)
from apps.shared.utils.validators import generate_guid
from apps.datawarehouse.constants import ASSOC_SG_COUNT, ASSOC_IUS_COUNT, ASSOC_DATA_COUNT
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.datawarehouse.utils.export_utils import build_simple_xlsx, make_export_filename
from apps.datawarehouse.utils.audit_events import (
    buffer_delete_step,
    buffer_manual_audit,
    deleted_ids_preview,
    snapshot_entity_for_audit,
)
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SG_CATEGORY_SOURCE = "apps.datawarehouse.services.sg_category"
_CASCADE_CHUNK_SIZE = 500


class SgCategoryService:
    """Service for Subgroup Category read and delete operations."""

    def _junction_distinct_subgroup_val_counts_by_type_nids(
        self,
        dw_db,
        type_nids: List[int],
        language_code: Optional[str] = None,
    ) -> Dict[int, int]:
        """
        Map subgroup_type_nid -> count of distinct ut_subgroup_vals (subgroup_val_nid)
        linked via ut_subgroup_vals_subgroup for any ut_subgroup row in that category.

        Rollup of the same junction semantics as sg-categories-values ?used_in=true
        (per-value row), aggregated per category.
        """
        if not type_nids:
            return {}
        lc = language_code or get_default_locale(dw_db)
        SubgroupModel = Subgroup(lc)
        zeroed: Dict[int, int] = {int(n): 0 for n in type_nids}
        rows = (
            dw_db.query(
                SubgroupModel.subgroup_type,
                func.count(distinct(SubgroupValsSubgroup.subgroup_val_nid)),
            )
            .select_from(SubgroupValsSubgroup)
            .join(
                SubgroupModel,
                SubgroupModel.subgroup_nid == SubgroupValsSubgroup.subgroup_nid,
            )
            .filter(
                SubgroupModel.subgroup_type.in_(type_nids),
                SubgroupValsSubgroup.subgroup_val_nid.isnot(None),
            )
            .group_by(SubgroupModel.subgroup_type)
            .all()
        )
        for t, cnt in rows:
            if t is not None:
                zeroed[int(t)] = int(cnt or 0)
        return zeroed

    def get_all_sg_categories(
        self,
        dw_id: str,
        language_code: Optional[str] = None,
        page: int = 1,
        page_size: Optional[int] = 10,
        search: Optional[str] = None,
        sort_order: str = "asc",
        sort_field: str = "sg_cat_order",
        include_used_in: bool = False,
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        List subgroup categories (subgroup types) with pagination and optional sorting.

        sort_field: sg_cat_nid, sg_cat_name, sg_cat_gid, sg_cat_order (map to subgroup_type_* columns).
        When include_used_in is True, each dict includes used_in with subgroup_count:
        distinct ut_subgroup_vals (subgroup_val_nid) in ut_subgroup_vals_subgroup for
        any ut_subgroup row in that category (rollup of sg-categories-values used_in).

        Returns:
            Tuple of (list of category dicts, total_count).
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            SubgroupCategoryModel = SubgroupCategory(language_code)
            order_column = SubgroupCategoryModel.subgroup_type_order
            if sort_field == "sg_cat_nid":
                order_column = SubgroupCategoryModel.subgroup_type_nid
            elif sort_field == "sg_cat_name":
                order_column = SubgroupCategoryModel.subgroup_type_name
            elif sort_field == "sg_cat_gid":
                order_column = SubgroupCategoryModel.subgroup_type_gid
            elif sort_field == "sg_cat_order":
                order_column = SubgroupCategoryModel.subgroup_type_order
            if sort_order and sort_order.lower() == "desc":
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()
            q = (
                dw_db.query(SubgroupCategoryModel)
                .order_by(order_column)
            )
            if search and search.strip():
                pattern = f"%{search.strip()}%"
                q = q.filter(
                    or_(
                        SubgroupCategoryModel.subgroup_type_name.ilike(pattern),
                        SubgroupCategoryModel.subgroup_type_gid.ilike(pattern),
                    )
                )
            total_count = q.count()
            if page_size is not None:
                page = max(1, page)
                page_size = max(1, min(page_size, 1000))
                skip = (page - 1) * page_size
                rows = q.offset(skip).limit(page_size).all()
            else:
                rows = q.all()
            items = [SgCategoryResponseSchema.from_record(r) for r in rows]
            if include_used_in and items:
                nids = [int(i["subgroup_type_nid"]) for i in items]
                counts = self._junction_distinct_subgroup_val_counts_by_type_nids(
                    dw_db, nids, language_code=language_code
                )
                for i in items:
                    nid = int(i["subgroup_type_nid"])
                    i["used_in"] = {ASSOC_SG_COUNT: counts.get(nid, 0)}
            return items, total_count

    def get_sg_category_by_identifier(
        self,
        dw_id: str,
        category_id: str,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get one subgroup category by category_id (numeric sg_cat_nid or GUID sg_cat_gid).

        Args:
            dw_id: Data warehouse identifier
            category_id: sg_cat_nid (numeric) or sg_cat_gid (GUID string)

        Returns:
            Category dict with sg_cat_nid, sg_cat_name, sg_cat_gid, sg_cat_order, sg_cat_global, or None if not found
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            SubgroupCategoryModel = SubgroupCategory(language_code)
            if category_id.isdigit():
                row = dw_db.query(SubgroupCategoryModel).filter(
                    SubgroupCategoryModel.subgroup_type_nid == int(category_id)
                ).first()
            else:
                row = dw_db.query(SubgroupCategoryModel).filter(
                    SubgroupCategoryModel.subgroup_type_gid == category_id
                ).first()
            return SgCategoryResponseSchema.from_record(row) if row else None

    def get_sg_category_nid_by_gid(self, dw_id: str, gid: str) -> Optional[int]:
        """Resolve sg_cat_gid to sg_cat_nid. Returns None if not found."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            return self._resolve_category_id_to_nid(dw_db, gid)

    def _resolve_category_id_to_nid(self, dw_db, category_id: str) -> Optional[int]:
        """Resolve a single category_id (nid or gid) to subgroup_type_nid."""
        SubgroupCategoryModel = SubgroupCategory(get_default_locale(dw_db))
        if category_id.isdigit():
            row = dw_db.query(SubgroupCategoryModel).filter(
                SubgroupCategoryModel.subgroup_type_nid == int(category_id)
            ).first()
        else:
            row = dw_db.query(SubgroupCategoryModel).filter(
                SubgroupCategoryModel.subgroup_type_gid == category_id
            ).first()
        return row.subgroup_type_nid if row else None

    def resolve_category_ids_to_nids(
        self, dw_id: str, category_ids: List[str]
    ) -> List[int]:
        """
        Resolve list of category_id (sg_cat_nid or sg_cat_gid) to list of sg_cat_nid.
        Raises ValueError if any identifier is not found.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            nids = []
            for cid in category_ids:
                nid = self._resolve_category_id_to_nid(dw_db, cid)
                if nid is None:
                    raise NotFound(f"Subgroup category not found: {cid!r}")
                nids.append(nid)
            return nids

    def _validate_categories_deletable(self, dw_db, sg_cat_nids: List[int]) -> None:
        """Raise ValueError if any category or child subgroup row is marked is_system."""
        if not sg_cat_nids:
            return
        CatModel = SubgroupCategory(get_default_locale(dw_db))
        SubModel = Subgroup(get_default_locale(dw_db))
        for nid in sg_cat_nids:
            cat = dw_db.query(CatModel).filter(CatModel.subgroup_type_nid == nid).first()
            if cat and getattr(cat, "is_system", False):
                raise ValueError("System subgroup category cannot be deleted via API")
        protected = (
            dw_db.query(func.count(SubModel.subgroup_nid))
            .filter(
                SubModel.subgroup_type.in_(sg_cat_nids),
                SubModel.is_system.is_(True),
            )
            .scalar()
            or 0
        )
        if protected > 0:
            raise ValueError(
                "Cannot delete subgroup category: one or more system subgroup values are protected"
            )

    def _validate_sg_cat_name_unique(
        self, dw_db, sg_cat_name: str, exclude_nid: Optional[int] = None
    ) -> None:
        """Raise ValueError if sg_cat_name already exists (excluding exclude_nid for updates)."""
        SubgroupCategoryModel = SubgroupCategory(get_default_locale(dw_db))
        q = dw_db.query(SubgroupCategoryModel).filter(
            SubgroupCategoryModel.subgroup_type_name == apply_lang_prefix(sg_cat_name.strip())
        )
        if exclude_nid is not None:
            q = q.filter(SubgroupCategoryModel.subgroup_type_nid != exclude_nid)
        if q.first() is not None:
            raise ValueError("Validation failed: subgroup category name must be unique")

    def _validate_sg_cat_gid_unique(
        self, dw_db, sg_cat_gid: str, exclude_nid: Optional[int] = None
    ) -> None:
        """Raise ValueError if sg_cat_gid already exists (excluding exclude_nid for updates)."""
        if not sg_cat_gid or not sg_cat_gid.strip():
            return
        SubgroupCategoryModel = SubgroupCategory(get_default_locale(dw_db))
        q = dw_db.query(SubgroupCategoryModel).filter(
            SubgroupCategoryModel.subgroup_type_gid == sg_cat_gid.strip()
        )
        if exclude_nid is not None:
            q = q.filter(SubgroupCategoryModel.subgroup_type_nid != exclude_nid)
        if q.first() is not None:
            raise ValueError("Validation failed: subgroup category GID must be unique")

    def create(
        self, dw_id: str, data: SgCategoryCreateSchema, language_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a single subgroup category. sg_cat_name required and unique; sg_cat_gid optional (generated if missing).
        Returns dict with subgroup_type_nid and subgroup_type_gid.
        """
        sg_cat_name = (data.subgroup_type_name or "").strip()
        if not sg_cat_name:
            raise ValueError("Validation failed: subgroup_type_name is required")
        if len(sg_cat_name) > 128:
            raise ValueError("Validation failed: subgroup_type_name max 128 characters")

        sg_cat_gid = (data.subgroup_type_gid or "").strip() or None
        if not sg_cat_gid:
            sg_cat_gid = generate_guid()

        with get_warehouse_session_from_id(dw_id) as dw_db:
            default_locale = get_default_locale(dw_db)
            language_code = language_code or default_locale
            SubgroupCategoryModel = SubgroupCategory(default_locale)
            self._validate_sg_cat_name_unique(dw_db, sg_cat_name)
            self._validate_sg_cat_gid_unique(dw_db, sg_cat_gid)

            max_order = dw_db.query(func.coalesce(func.max(SubgroupCategoryModel.subgroup_type_order), 0)).scalar()
            sg_cat_order = data.subgroup_type_order if data.subgroup_type_order is not None else (float(max_order) + 1)
            sg_cat_global = bool(data.subgroup_type_global) if data.subgroup_type_global is not None else False

            # Insert into default locale first to obtain the auto-generated NID
            name_in_default = value_for_locale(sg_cat_name, default_locale, language_code)
            default_row = SubgroupCategoryModel(
                subgroup_type_name=name_in_default,
                subgroup_type_gid=sg_cat_gid,
                subgroup_type_order=sg_cat_order,
                subgroup_type_global=sg_cat_global,
            )
            dw_db.add(default_row)
            dw_db.flush()
            sg_cat_nid = default_row.subgroup_type_nid

            # Replicate into every other configured language table with the same NID
            for locale in get_dw_language_codes(dw_id):
                if locale == default_locale:
                    continue
                LocaleModel = SubgroupCategory(locale)
                row = LocaleModel(
                    subgroup_type_nid=sg_cat_nid,
                    subgroup_type_name=value_for_locale(sg_cat_name, locale, language_code),
                    subgroup_type_gid=sg_cat_gid,
                    subgroup_type_order=sg_cat_order,
                    subgroup_type_global=sg_cat_global,
                )
                dw_db.add(row)
            dw_db.flush()
            return {"subgroup_type_nid": sg_cat_nid, "subgroup_type_gid": sg_cat_gid}

    def bulk_create(
        self, dw_id: str, items: List[SgCategoryCreateSchema], language_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Bulk-create subgroup categories. Partial-success: each item is attempted independently;
        failures are collected in errors without rolling back successful ones.
        Returns dict with created (list of result dicts) and errors (list of error strings).
        """
        created = []
        errors = []
        for idx, item in enumerate(items):
            try:
                result = self.create(dw_id, item, language_code=language_code)
                created.append(result)
            except ValueError as e:
                errors.append({"index": idx, "error": str(e)})
        return {"created": created, "errors": errors}

    def update(
        self, dw_id: str, category_id: str, data: SgCategoryUpdateSchema, language_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update a subgroup category (partial).
        - subgroup_type_name: locale-specific — updated only in the requested language table.
        - subgroup_type_gid / subgroup_type_order / subgroup_type_global: structural — updated in all locale tables.
        Returns dict with sg_cat_nid, sg_cat_gid.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            nid = self._resolve_category_id_to_nid(dw_db, category_id)
            if nid is None:
                raise NotFound("Subgroup category not found")

            SubgroupCategoryModel = SubgroupCategory(language_code)
            row = dw_db.query(SubgroupCategoryModel).filter(
                SubgroupCategoryModel.subgroup_type_nid == nid
            ).first()
            if not row:
                raise NotFound("Subgroup category not found")

            # Check if subgroup_type_order is being changed
            order_changed = data.subgroup_type_order is not None and data.subgroup_type_order != row.subgroup_type_order

            # Build payload; validate name before adding it
            payload: Dict[str, Any] = {}
            if data.subgroup_type_name is not None:
                sg_cat_name = data.subgroup_type_name.strip()
                if not sg_cat_name:
                    raise ValueError("Validation failed: subgroup_type_name cannot be empty")
                if len(sg_cat_name) > 128:
                    raise ValueError("Validation failed: subgroup_type_name max 128 characters")
                self._validate_sg_cat_name_unique(dw_db, sg_cat_name, exclude_nid=nid)
                payload["subgroup_type_name"] = sg_cat_name
            if data.subgroup_type_gid is not None:
                payload["subgroup_type_gid"] = data.subgroup_type_gid
            if data.subgroup_type_order is not None:
                payload["subgroup_type_order"] = data.subgroup_type_order
            if data.subgroup_type_global is not None:
                payload["subgroup_type_global"] = data.subgroup_type_global

            # Apply gap-based reordering FIRST if order changed to ensure unique display orders
            if data.subgroup_type_order is not None and data.subgroup_type_order != row.subgroup_type_order:
                from apps.shared.utils.display_order import reorder_display_orders_multi_locale
                
                reorder_display_orders_multi_locale(
                    dw_db=dw_db,
                    dw_id=dw_id,
                    model_class_factory=SubgroupCategory,
                    order_column_name="subgroup_type_order",
                    pk_column_name="subgroup_type_nid", 
                    updated_record_id=nid,
                    new_order=data.subgroup_type_order,
                    old_order=row.subgroup_type_order
                )

            # subgroup_type_name → locale-specific; gid/order/global → structural (all locales)
            apply_locale_update(dw_db, dw_id, SubgroupCategory, "subgroup_type_nid", nid, payload, language_code)

            dw_db.flush()
            
            # Trigger subgroup renaming if category order changed
            if order_changed:
                try:
                    from apps.app_db.db.core import SessionLocal
                    from apps.shared.services.bg_job_dispatch import (
                        JOB_TYPE_UPDATE_SUBGROUP_NAMES,
                        dispatch_bg_job,
                    )

                    job_payload = {
                        "dw_id": dw_id,
                        "category_nid": nid,
                        "language_code": language_code,
                    }
                    with SessionLocal() as core_db:
                        res = dispatch_bg_job(
                            db=core_db,
                            job_type=JOB_TYPE_UPDATE_SUBGROUP_NAMES,
                            payload=job_payload,
                            dw_id=dw_id,
                        )
                    ref = res.celery_task_id or res.db_job_id
                    logger.info(
                        "Queued subgroup name update job_type=%s ref=%s category_nid=%s",
                        JOB_TYPE_UPDATE_SUBGROUP_NAMES,
                        ref,
                        nid,
                    )
                except Exception as e:
                    log_background_incident(
                        message=f"Failed to queue subgroup name update task: {e}",
                        error_code="SG_CATEGORY_SUBGROUP_RENAME_QUEUE_FAILED",
                        exc=e,
                        source=_SG_CATEGORY_SOURCE,
                    )
                    # Don't fail the main operation if task queuing fails
            
            row_dict = SgCategoryResponseSchema.from_record(row)
            return {k: row_dict[k] for k in ("subgroup_type_nid", "subgroup_type_gid")}

    def get_association_counts(
        self, dw_id: str, sg_cat_ids: List[str]
    ) -> Dict[str, int]:
        """
        Return dependency counts for the given subgroup categories (for delete confirmation).
        Resolves category_ids to nids; returns subgroup_count, ius_count, data_count.

        subgroup_count matches list ``used_in`` / ``_junction_distinct_subgroup_val_counts_by_type_nids``:
        for each requested category, distinct ``subgroup_val_nid`` in ``ut_subgroup_vals_subgroup``
        linked to any ``ut_subgroup`` row in that category; summed over unique category nids.
        """
        if not sg_cat_ids:
            with get_warehouse_session_from_id(dw_id) as dw_db:
                SubgroupDefaultModel = Subgroup(get_default_locale(dw_db))
                sg_count = dw_db.query(func.count(SubgroupDefaultModel.subgroup_nid)).scalar() or 0
                ius_count = dw_db.query(func.count(IndicatorUnitSubgroup.iusnid)).scalar() or 0
                data_count = dw_db.query(func.count(Data.data_nid)).scalar() or 0
                return {ASSOC_SG_COUNT: sg_count, ASSOC_IUS_COUNT: ius_count, ASSOC_DATA_COUNT: data_count}

        nids = self.resolve_category_ids_to_nids(dw_id, sg_cat_ids)
        unique_type_nids = list(dict.fromkeys(int(n) for n in nids))

        with get_warehouse_session_from_id(dw_id) as dw_db:
            lc = get_default_locale(dw_db)
            junction_by_type = self._junction_distinct_subgroup_val_counts_by_type_nids(
                dw_db, unique_type_nids, language_code=lc
            )
            subgroup_count = sum(junction_by_type.get(tnid, 0) for tnid in unique_type_nids)

            SubgroupDefaultModel = Subgroup(lc)
            subgroup_nids_q = (
                dw_db.query(SubgroupDefaultModel.subgroup_nid).filter(
                    SubgroupDefaultModel.subgroup_type.in_(unique_type_nids)
                )
            )
            subgroup_nids = [r[0] for r in subgroup_nids_q.all()]

            if not subgroup_nids:
                return {
                    ASSOC_SG_COUNT: subgroup_count,
                    ASSOC_IUS_COUNT: 0,
                    ASSOC_DATA_COUNT: 0,
                }

            sv_nids_q = (
                dw_db.query(SubgroupValsSubgroup.subgroup_val_nid)
                .filter(SubgroupValsSubgroup.subgroup_nid.in_(subgroup_nids))
                .distinct()
            )
            sv_nids = [r[0] for r in sv_nids_q.all() if r[0] is not None]

            if not sv_nids:
                return {
                    ASSOC_SG_COUNT: subgroup_count,
                    ASSOC_IUS_COUNT: 0,
                    ASSOC_DATA_COUNT: 0,
                }

            ius_count = (
                dw_db.query(func.count(IndicatorUnitSubgroup.iusnid))
                .filter(IndicatorUnitSubgroup.subgroup_val_nid.in_(sv_nids))
                .scalar() or 0
            )

            iusnids_q = (
                dw_db.query(IndicatorUnitSubgroup.iusnid).filter(
                    IndicatorUnitSubgroup.subgroup_val_nid.in_(sv_nids)
                )
            )
            iusnids = [r[0] for r in iusnids_q.all()]

            if not iusnids:
                return {
                    ASSOC_SG_COUNT: subgroup_count,
                    ASSOC_IUS_COUNT: ius_count,
                    ASSOC_DATA_COUNT: 0,
                }

            data_count = (
                dw_db.query(func.count(Data.data_nid))
                .filter(Data.iusnid.in_(iusnids))
                .scalar() or 0
            )

            return {
                ASSOC_SG_COUNT: subgroup_count,
                ASSOC_IUS_COUNT: ius_count,
                ASSOC_DATA_COUNT: data_count,
            }

    def _cascade_delete_category(self, dw_db, sg_cat_nid: int) -> None:
        """
        Delete a subgroup category and its sg-category-values (cascade).
        Order: ut_subgroup_vals_subgroup -> ut_subgroup_<locale> (subgroup values) -> ut_subgroup_type_<locale>.
        Caller must be inside a session; no commit here.
        Does NOT delete ut_data, ut_ic_ius, IUS, subgroup_vals (use _full_cascade_delete_categories for that).
        """
        self._validate_categories_deletable(dw_db, [sg_cat_nid])
        SubgroupCategoryModel = SubgroupCategory(get_default_locale(dw_db))
        SubgroupModel = Subgroup(get_default_locale(dw_db))
        subgroup_nids = [
            r[0]
            for r in dw_db.query(SubgroupModel.subgroup_nid).filter(
                SubgroupModel.subgroup_type == sg_cat_nid
            ).all()
        ]
        cat_entity = (
            dw_db.query(SubgroupCategoryModel)
            .filter(SubgroupCategoryModel.subgroup_type_nid == sg_cat_nid)
            .first()
        )
        if subgroup_nids:
            junc_pks = [
                r[0]
                for r in dw_db.query(SubgroupValsSubgroup.subgroup_val_subgroup_nid)
                .filter(SubgroupValsSubgroup.subgroup_nid.in_(subgroup_nids))
                .all()
            ]
            del_j = dw_db.query(SubgroupValsSubgroup).filter(
                SubgroupValsSubgroup.subgroup_nid.in_(subgroup_nids)
            ).delete(synchronize_session=False)
            if del_j:
                buffer_delete_step(
                    dw_db,
                    module="subgroup_vals_subgroup",
                    description=(
                        f"Deleted {del_j} junction row(s) for subgroup category "
                        f"sg_cat_nid={sg_cat_nid} (by subgroup_nid)"
                    ),
                    previous_value={
                        "sg_cat_nid": sg_cat_nid,
                        **deleted_ids_preview(subgroup_nids),
                        "junction_rows": deleted_ids_preview(junc_pks),
                    },
                )
            dw_db.flush()
            deleted_sg = dw_db.query(SubgroupModel).filter(
                SubgroupModel.subgroup_nid.in_(subgroup_nids)
            ).delete(synchronize_session=False)
            if deleted_sg:
                buffer_delete_step(
                    dw_db,
                    module="subgroup_category_value",
                    description=(
                        f"Deleted {deleted_sg} ut_subgroup row(s) for "
                        f"category sg_cat_nid={sg_cat_nid}"
                    ),
                    identifier=str(subgroup_nids[0]) if subgroup_nids else None,
                    previous_value={
                        "sg_cat_nid": sg_cat_nid,
                        **deleted_ids_preview(subgroup_nids),
                    },
                )
            logger.debug(
                "Cascade deleted %s subgroup value(s) (sg-category-values) for category sg_cat_nid=%s",
                len(subgroup_nids),
                sg_cat_nid,
            )
            dw_db.flush()
        dw_db.query(SubgroupCategoryModel).filter(
            SubgroupCategoryModel.subgroup_type_nid == sg_cat_nid
        ).delete(synchronize_session=False)
        cat_prev = (
            snapshot_entity_for_audit(cat_entity)
            if cat_entity is not None
            else {"subgroup_type_nid": sg_cat_nid}
        )
        buffer_manual_audit(
            dw_db,
            action="DELETE",
            module="subgroup_category",
            identifier=str(sg_cat_nid),
            description=f"Deleted subgroup category nid={sg_cat_nid} with its category-value subgroups",
            previous_value=cat_prev,
        )

    def _full_cascade_delete_categories(self, dw_db, dw_id: str, sg_cat_nids: List[int]) -> None:
        """
        Delete subgroup categories and all related data (full cascade, no 409).
        Order: ut_data (chunked) -> ut_ic_ius (chunked) -> metadata (all locales) -> IUS ->
               ut_subgroup_vals_subgroup (by sv_nid) -> ut_subgroup_vals (all locales) ->
               ut_subgroup_vals_subgroup (by subgroup_nid) -> ut_subgroup (all locales) -> ut_subgroup_type (all locales).
        Caller must be inside a session; commits at end.
        """
        if not sg_cat_nids:
            return
        self._validate_categories_deletable(dw_db, sg_cat_nids)
        SubgroupCategoryModel = SubgroupCategory(get_default_locale(dw_db))
        SubgroupModel = Subgroup(get_default_locale(dw_db))
        subgroup_nids = [
            r[0]
            for r in dw_db.query(SubgroupModel.subgroup_nid).filter(
                SubgroupModel.subgroup_type.in_(sg_cat_nids)
            ).all()
        ]
        sv_nids = []
        if subgroup_nids:
            sv_nids = [
                r[0]
                for r in dw_db.query(SubgroupValsSubgroup.subgroup_val_nid)
                .filter(SubgroupValsSubgroup.subgroup_nid.in_(subgroup_nids))
                .distinct()
                .all()
                if r[0] is not None
            ]
        if sv_nids:
            ius_nids = [
                r[0]
                for r in dw_db.query(IndicatorUnitSubgroup.iusnid).filter(
                    IndicatorUnitSubgroup.subgroup_val_nid.in_(sv_nids)
                ).all()
            ]
            if ius_nids:
                data_nids = [
                    r[0]
                    for r in dw_db.query(Data.data_nid).filter(Data.iusnid.in_(ius_nids)).all()
                ]
                for i in range(0, len(data_nids), _CASCADE_CHUNK_SIZE):
                    chunk = data_nids[i : i + _CASCADE_CHUNK_SIZE]
                    dw_db.query(Data).filter(Data.data_nid.in_(chunk)).delete(
                        synchronize_session=False
                    )
                if data_nids:
                    logger.info("Cascade deleted %s ut_data row(s) for categories %s", len(data_nids), sg_cat_nids)
                    buffer_delete_step(
                        dw_db,
                        module="data",
                        description=(
                            f"Cascade deleted {len(data_nids)} ut_data row(s) for "
                            f"subgroup_categories {sg_cat_nids}"
                        ),
                        previous_value={
                            "sg_cat_nids": deleted_ids_preview(sg_cat_nids),
                            "linked_ius": deleted_ids_preview(ius_nids),
                            **deleted_ids_preview(data_nids),
                        },
                    )
                dw_db.flush()
                ic_ius_pks = [
                    r[0]
                    for r in dw_db.query(IcIus.ic_iusnid).filter(
                        IcIus.iusnid.in_(ius_nids)
                    ).all()
                ]
                for i in range(0, len(ius_nids), _CASCADE_CHUNK_SIZE):
                    chunk = ius_nids[i : i + _CASCADE_CHUNK_SIZE]
                    dw_db.query(IcIus).filter(IcIus.iusnid.in_(chunk)).delete(
                        synchronize_session=False
                    )
                logger.info("Cascade deleted ut_ic_ius for %s IUS for categories %s", len(ius_nids), sg_cat_nids)
                buffer_delete_step(
                    dw_db,
                    module="ic_ius",
                    description=(
                        f"Cascade deleted ut_ic_ius links for {len(ius_nids)} IUS "
                        f"(subgroup_categories {sg_cat_nids})"
                    ),
                    previous_value={
                        "sg_cat_nids": deleted_ids_preview(sg_cat_nids),
                        "linked_ius": deleted_ids_preview(ius_nids),
                        "deleted_ic_ius": deleted_ids_preview(ic_ius_pks),
                    },
                )
                dw_db.flush()
            deleted_meta_by_locale: Dict[str, int] = {}
            for lang_code in get_dw_language_codes(dw_id):
                MetadataReportModel = MetadataReport(lang_code)
                n_meta = dw_db.query(MetadataReportModel).filter(
                    MetadataReportModel.target_nid.in_(sv_nids)
                ).delete(synchronize_session=False)
                if n_meta:
                    deleted_meta_by_locale[str(lang_code)] = int(n_meta)
            if deleted_meta_by_locale:
                buffer_delete_step(
                    dw_db,
                    module="metadata_report",
                    description=(
                        f"Cascade deleted {sum(deleted_meta_by_locale.values())} metadata rows "
                        f"for subgroup_categories {sg_cat_nids} (target subgroup_val nids)"
                    ),
                    previous_value={
                        "deleted_by_locale": deleted_meta_by_locale,
                        "subgroup_val_nids": deleted_ids_preview(sv_nids),
                    },
                )
            dw_db.flush()
            deleted_ius = dw_db.query(IndicatorUnitSubgroup).filter(
                IndicatorUnitSubgroup.subgroup_val_nid.in_(sv_nids)
            ).delete(synchronize_session=False)
            if deleted_ius:
                logger.info("Cascade deleted %s IUS rows for categories %s", deleted_ius, sg_cat_nids)
                buffer_delete_step(
                    dw_db,
                    module="indicator_unit_subgroup",
                    description=f"Cascade deleted {deleted_ius} IUS record(s) for subgroup categories {sg_cat_nids}",
                    previous_value={
                        "sg_cat_nids": deleted_ids_preview(sg_cat_nids),
                        **(
                            deleted_ids_preview(ius_nids)
                            if ius_nids
                            else {"linked_sv_nids": deleted_ids_preview(sv_nids)}
                        ),
                    },
                )
            dw_db.flush()
            junc_sv_pks = [
                r[0]
                for r in dw_db.query(SubgroupValsSubgroup.subgroup_val_subgroup_nid)
                .filter(SubgroupValsSubgroup.subgroup_val_nid.in_(sv_nids))
                .all()
            ]
            del_j_sv = dw_db.query(SubgroupValsSubgroup).filter(
                SubgroupValsSubgroup.subgroup_val_nid.in_(sv_nids)
            ).delete(synchronize_session=False)
            if del_j_sv:
                buffer_delete_step(
                    dw_db,
                    module="subgroup_vals_subgroup",
                    description=(
                        f"Deleted {del_j_sv} junction row(s) by subgroup_val_nid "
                        f"for categories {sg_cat_nids}"
                    ),
                    previous_value={
                        "sg_cat_nids": deleted_ids_preview(sg_cat_nids),
                        "subgroup_val_nids": deleted_ids_preview(sv_nids),
                        "junction_rows": deleted_ids_preview(junc_sv_pks),
                    },
                )
            dw_db.flush()
            for lang_code in get_dw_language_codes(dw_id):
                SubgroupValModel = SubgroupVal(lang_code)
                dw_db.query(SubgroupValModel).filter(
                    SubgroupValModel.subgroup_val_nid.in_(sv_nids)
                ).delete(synchronize_session=False)
            buffer_delete_step(
                dw_db,
                module="subgroup_val",
                description=f"Cascade deleted subgroup val rows (all locales) for categories {sg_cat_nids}",
                previous_value={
                    "sg_cat_nids": deleted_ids_preview(sg_cat_nids),
                    **deleted_ids_preview(sv_nids),
                },
            )
            logger.info("Cascade deleted ut_subgroup_vals (all locales) for %s sv_nid(s) for categories %s", len(sv_nids), sg_cat_nids)
            dw_db.flush()
        if subgroup_nids:
            junc_sg_pks = [
                r[0]
                for r in dw_db.query(SubgroupValsSubgroup.subgroup_val_subgroup_nid)
                .filter(SubgroupValsSubgroup.subgroup_nid.in_(subgroup_nids))
                .all()
            ]
            del_j_sg = dw_db.query(SubgroupValsSubgroup).filter(
                SubgroupValsSubgroup.subgroup_nid.in_(subgroup_nids)
            ).delete(synchronize_session=False)
            if del_j_sg:
                buffer_delete_step(
                    dw_db,
                    module="subgroup_vals_subgroup",
                    description=(
                        f"Deleted {del_j_sg} junction row(s) by subgroup_nid "
                        f"for categories {sg_cat_nids}"
                    ),
                    previous_value={
                        "sg_cat_nids": deleted_ids_preview(sg_cat_nids),
                        "subgroup_nids": deleted_ids_preview(subgroup_nids),
                        "junction_rows": deleted_ids_preview(junc_sg_pks),
                    },
                )
            dw_db.flush()
            for lang_code in get_dw_language_codes(dw_id):
                SubgroupModel = Subgroup(lang_code)
                dw_db.query(SubgroupModel).filter(
                    SubgroupModel.subgroup_nid.in_(subgroup_nids)
                ).delete(synchronize_session=False)
            if subgroup_nids:
                buffer_delete_step(
                    dw_db,
                    module="subgroup_category_value",
                    description=(
                        f"Deleted ut_subgroup rows (all locales) for {len(subgroup_nids)} subgroup_nid(s) "
                        f"under categories {sg_cat_nids}"
                    ),
                    previous_value={
                        "sg_cat_nids": deleted_ids_preview(sg_cat_nids),
                        **deleted_ids_preview(subgroup_nids),
                    },
                )
            logger.info("Cascade deleted ut_subgroup (all locales) for %s subgroup_nid(s) for categories %s", len(subgroup_nids), sg_cat_nids)
            dw_db.flush()
        cat_row = None
        for cn in sg_cat_nids:
            cat_row = dw_db.query(SubgroupCategoryModel).filter(
                SubgroupCategoryModel.subgroup_type_nid == cn
            ).first()
            if cat_row is not None:
                break
        for lang_code in get_dw_language_codes(dw_id):
            SubgroupCategoryModel = SubgroupCategory(lang_code)
            dw_db.query(SubgroupCategoryModel).filter(
                SubgroupCategoryModel.subgroup_type_nid.in_(sg_cat_nids)
            ).delete(synchronize_session=False)
        cat_prev: Dict[str, Any] = {"sg_cat_nids": deleted_ids_preview(sg_cat_nids)}
        if cat_row is not None:
            cat_prev["snapshot"] = snapshot_entity_for_audit(cat_row)
        buffer_manual_audit(
            dw_db,
            action="DELETE",
            module="subgroup_category",
            identifier=str(sg_cat_nids[0]) if sg_cat_nids else None,
            description=f"Full cascade deleted {len(sg_cat_nids)} subgroup category(ies) with all related data",
            previous_value=cat_prev,
        )
        dw_db.commit()
        logger.info("Full cascade deleted subgroup categories %s and all related data", sg_cat_nids)

    def prepare_sg_category_delete_enqueue(
        self, dw_id: str, sg_category_identifier: str
    ) -> int:
        """
        Resolve category and ensure it can be deleted (system category / system values checks).
        Used by HTTP layer before enqueueing a background job. Raises ValueError on failure.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            nid = self._resolve_category_id_to_nid(dw_db, sg_category_identifier)
            if nid is None:
                raise NotFound("Subgroup category not found")
            self._validate_categories_deletable(dw_db, [nid])
            return int(nid)

    def run_delete_sg_category_job(
        self, dw_id: str, sg_category_identifier: str
    ) -> Dict[str, Any]:
        """
        Full cascade delete plus DW cache invalidation for DB poller / Celery workers.

        Raises ValueError if the category is missing when the job runs (race) or validation fails.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            nid = self._resolve_category_id_to_nid(dw_db, sg_category_identifier)
            if nid is None:
                raise ValueError(
                    f"Subgroup category not found for deletion: {sg_category_identifier!r}"
                )
            self._validate_categories_deletable(dw_db, [nid])
            self._full_cascade_delete_categories(dw_db, dw_id, [nid])

        from apps.shared.utils.cache import cache_delete_pattern

        cache_delete_pattern("dw:sg-categories:*")
        cache_delete_pattern("dw:sg-categories-values:*")
        cache_delete_pattern("dw:subgroups:*")
        notify_dbmetadata_counts_changed(dw_id)
        return {
            "deleted": True,
            "dw_id": dw_id,
            "sg_cat_nid": nid,
            "sg_category_identifier": sg_category_identifier,
        }

    def delete(self, dw_id: str, category_id: str) -> None:
        """
        Delete a subgroup category and all related data (full cascade).
        Cascades: ut_data, ut_ic_ius, metadata, IUS, subgroup_vals, ut_subgroup_vals_subgroup, subgroup values, category.

        Delegates to :meth:`run_delete_sg_category_job` (same semantics as the background job handler).
        """
        self.run_delete_sg_category_job(dw_id, category_id)

    def multiple_delete(self, dw_id: str, category_ids: List[str]) -> None:
        """
        Delete multiple subgroup categories and all related data (full cascade).
        Cascades: ut_data, ut_ic_ius, metadata, IUS, subgroup_vals, ut_subgroup_vals_subgroup, subgroup values, categories.
        Does not fail when categories have IUS or data dependents; deletes everything.
        """
        if not category_ids:
            return
        nids = self.resolve_category_ids_to_nids(dw_id, category_ids)
        with get_warehouse_session_from_id(dw_id) as dw_db:
            self._full_cascade_delete_categories(dw_db, dw_id, nids)
        notify_dbmetadata_counts_changed(dw_id)

    def delete_sg_category(
        self,
        dw_id: str,
        sg_cat_nid: int,
    ) -> bool:
        """
        Delete a subgroup category (sg_cat_nid) with full cascade.

        Cascade order:
        1. Get all subgroup_nids (subgroup values) under this category (subgroup_type = sg_cat_nid)
        2. Delete ut_subgroup_vals_subgroup where subgroup_nid in that list
        3. Delete ut_subgroup_en (subgroup values) where subgroup_nid in that list
        4. Delete ut_subgroup_type_en (category) where subgroup_type_nid = sg_cat_nid
        """
        logger.info(f"Deleting subgroup category (sg_cat_nid) {sg_cat_nid} from warehouse '{dw_id}' (cascade)")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            SubgroupCategoryModel = SubgroupCategory(get_default_locale(dw_db))
            SubgroupModel = Subgroup(get_default_locale(dw_db))
            row = dw_db.query(SubgroupCategoryModel).filter(
                SubgroupCategoryModel.subgroup_type_nid == sg_cat_nid
            ).first()
            if not row:
                logger.warning(f"Subgroup category {sg_cat_nid} not found for deletion")
                return False

            self._validate_categories_deletable(dw_db, [sg_cat_nid])

            # 1) Get all subgroup_nids (subgroup values) under this category
            subgroup_nids = [
                r[0]
                for r in dw_db.query(SubgroupModel.subgroup_nid).filter(
                    SubgroupModel.subgroup_type == sg_cat_nid
                ).all()
            ]

            # 2) Delete ut_subgroup_vals_subgroup where subgroup_nid in list
            if subgroup_nids:
                dw_db.query(SubgroupValsSubgroup).filter(
                    SubgroupValsSubgroup.subgroup_nid.in_(subgroup_nids)
                ).delete(synchronize_session=False)
                logger.info(f"Cascade deleted ut_subgroup_vals_subgroup for {len(subgroup_nids)} subgroup(s) for category {sg_cat_nid}")
            dw_db.flush()

            # 3) Delete subgroup values (ut_subgroup_<locale>) where subgroup_nid in list
            if subgroup_nids:
                dw_db.query(SubgroupModel).filter(
                    SubgroupModel.subgroup_nid.in_(subgroup_nids)
                ).delete(synchronize_session=False)
                logger.info(f"Cascade deleted {len(subgroup_nids)} subgroup value(s) for category {sg_cat_nid}")
            dw_db.flush()

            # 4) Delete category (ut_subgroup_type_<locale>)
            dw_db.query(SubgroupCategoryModel).filter(
                SubgroupCategoryModel.subgroup_type_nid == sg_cat_nid
            ).delete(synchronize_session=False)

            dw_db.commit()
            logger.info(f"Subgroup category {sg_cat_nid} deleted successfully (cascade)")
            return True


def build_sg_categories_export_xlsx(
    dw_db,
    language_code: str,
    db_connection_display_name: str,
    sort_order: str = "asc",
    sort_field: str = "sg_cat_order",
    search: Optional[str] = None,
) -> Tuple[Any, str]:
    """Build XLSX export for all subgroup categories. Caller must validate DW and pass active dw_db. Returns (xlsx_stream, filename)."""
    lang = language_code or get_default_locale(dw_db)
    SubgroupCategoryModel = SubgroupCategory(lang)
    order_column = SubgroupCategoryModel.subgroup_type_order
    if sort_field == "sg_cat_nid":
        order_column = SubgroupCategoryModel.subgroup_type_nid
    elif sort_field == "sg_cat_name":
        order_column = SubgroupCategoryModel.subgroup_type_name
    elif sort_field == "sg_cat_gid":
        order_column = SubgroupCategoryModel.subgroup_type_gid
    if sort_order and sort_order.lower() == "desc":
        order_column = order_column.desc()
    else:
        order_column = order_column.asc()
    q = dw_db.query(SubgroupCategoryModel).order_by(order_column)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(
            or_(
                SubgroupCategoryModel.subgroup_type_name.ilike(pattern),
                SubgroupCategoryModel.subgroup_type_gid.ilike(pattern),
            )
        )
    rows = q.all()
    items = [SgCategoryResponseSchema.from_record(r) for r in rows]
    headers = ["sg_cat_nid", "sg_cat_name", "sg_cat_gid", "sg_cat_order", "sg_cat_global", "is_system"]
    data_rows = [
        [
            it.get("sg_cat_nid"),
            it.get("sg_cat_name"),
            it.get("sg_cat_gid"),
            it.get("sg_cat_order"),
            it.get("sg_cat_global"),
            it.get("is_system"),
        ]
        for it in items
    ]
    output = build_simple_xlsx("Subgroup Categories", headers, data_rows)
    filename = make_export_filename("SG_CATEGORIES", db_connection_display_name)
    return output, filename
