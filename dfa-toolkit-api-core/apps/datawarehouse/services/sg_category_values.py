"""
Subgroup Values (Subgroups under a category) service for read and create operations.
Uses ut_subgroup_<locale> (built from SubgroupLocaleMixin). API field names: n_id, val, g_id, order, sg_cat_nid.
"""
import logging
from typing import List, Optional, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import func, or_, distinct

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import Conflict
from apps.datawarehouse.models.datawarehouse import (
    SubgroupCategory,
    Subgroup,
    SubgroupVal,
    get_default_locale,
    SubgroupValsSubgroup,
)
from apps.datawarehouse.schemas.sg_categories import (
    SgCategoryResponseSchema,
    SubgroupCategoryValueResponseSchema,
    SgCategoryValueUpdateSchema,
)
from apps.shared.utils.validators import generate_guid
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.datawarehouse.utils.audit_events import (
    buffer_manual_audit,
    deleted_ids_preview,
    snapshot_entity_for_audit,
)

logger = logging.getLogger(__name__)


def _propagate_name_to_subgroup_vals(
    dw_id: str,
    category_value_subgroup_nid: int,
    resolved_language_code: str,
) -> None:
    """After ut_subgroup label change, refresh ut_subgroup_vals concatenated names."""
    from apps.datawarehouse.services.sg_vals import SgValsService

    stats = SgValsService().update_affected_subgroup_names(
        dw_id, category_value_subgroup_nid, resolved_language_code
    )
    if stats.get("updated_count"):
        logger.info(
            "Propagated category value name to %s subgroup val(s) for subgroup_nid=%s",
            stats["updated_count"],
            category_value_subgroup_nid,
        )


def _resolve_category_to_sg_cat_nid(
    dw_db: Session, category_id: str, SubgroupCategoryModel: type
) -> Optional[int]:
    """Resolve category_id (numeric sg_cat_nid or GUID sg_cat_gid) to subgroup_type_nid."""
    if category_id.isdigit():
        row = dw_db.query(SubgroupCategoryModel).filter(
            SubgroupCategoryModel.subgroup_type_nid == int(category_id)
        ).first()
    else:
        row = dw_db.query(SubgroupCategoryModel).filter(
            SubgroupCategoryModel.subgroup_type_gid == category_id
        ).first()
    return row.subgroup_type_nid if row else None


class SgCategoryValuesService:
    """Service for Subgroup Values (Subgroups under a category) read and delete operations."""

    def count_combination_usage_by_subgroup_nids(
        self, dw_id: str, subgroup_nids: List[int]
    ) -> Dict[int, int]:
        """
        Map ut_subgroup.subgroup_nid -> count of distinct ut_subgroup_vals rows (subgroup_val_nid)
        linked via ut_subgroup_vals_subgroup.

        Args:
            dw_id: Warehouse id
            subgroup_nids: ut_subgroup primary keys

        Returns:
            Dict keyed by nid; nids with no junction rows resolve to 0.
        """
        if not subgroup_nids:
            return {}
        uniq = sorted({int(n) for n in subgroup_nids})
        with get_warehouse_session_from_id(dw_id) as dw_db:
            zeroed: Dict[int, int] = {n: 0 for n in uniq}
            rows = (
                dw_db.query(
                    SubgroupValsSubgroup.subgroup_nid,
                    func.count(distinct(SubgroupValsSubgroup.subgroup_val_nid)),
                )
                .filter(
                    SubgroupValsSubgroup.subgroup_nid.in_(uniq),
                    SubgroupValsSubgroup.subgroup_nid.isnot(None),
                    SubgroupValsSubgroup.subgroup_val_nid.isnot(None),
                )
                .group_by(SubgroupValsSubgroup.subgroup_nid)
                .all()
            )
            for nid, cnt in rows:
                if nid is not None:
                    zeroed[int(nid)] = int(cnt or 0)
            return zeroed

    def get_all_categories_with_values(
        self,
        dw_id: str,
        language_code: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        List all subgroup categories (subgroup types) with all their values in one response.
        Used for endpoint: All Subgroup Category All Values = /dw/{dw_id}/sg-categories-values

        Args:
            dw_id: Data warehouse identifier
        Returns:
            List of category dicts, each with sg_cat_nid, sg_cat_name, sg_cat_gid, sg_cat_order, sg_cat_global and values: [n_id, val, g_id, order, sg_cat_nid]
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            SubgroupCategoryModel = SubgroupCategory(language_code)
            SubgroupModel = Subgroup(language_code)
            categories = (
                dw_db.query(SubgroupCategoryModel)
                .order_by(SubgroupCategoryModel.subgroup_type_order.asc(), SubgroupCategoryModel.subgroup_type_nid.asc())
                .all()
            )
            result: List[Dict[str, Any]] = []
            for cat in categories:
                cat_dict = SgCategoryResponseSchema.from_record(cat)
                rows = (
                    dw_db.query(SubgroupModel)
                    .filter(SubgroupModel.subgroup_type == cat.subgroup_type_nid)
                    .order_by(SubgroupModel.subgroup_order.asc(), SubgroupModel.subgroup_nid.asc())
                    .all()
                )
                cat_gid = cat_dict.get("subgroup_type_gid")
                cat_dict["values"] = [SubgroupCategoryValueResponseSchema.from_record(r, subgroup_type_gid=cat_gid) for r in rows]
                result.append(cat_dict)
            return result

    def get_all_values(
        self,
        dw_id: str,
        category_id: str,
        language_code: Optional[str] = None,
        sort_order: str = "asc",
        sort_field: str = "sg_order",
    ) -> List[Dict[str, Any]]:
        """
        List all subgroup values (subgroups) under a subgroup category with optional sorting.

        sort_field: sg_nid, sg_name, sg_gid, sg_order (map to subgroup_nid, subgroup_name, subgroup_gid, subgroup_order)

        Returns:
            List of value dicts with n_id, val, g_id, order, sg_cat_nid; empty if category not found
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            SubgroupCategoryModel = SubgroupCategory(language_code)
            SubgroupModel = Subgroup(language_code)
            sg_cat_nid = _resolve_category_to_sg_cat_nid(dw_db, category_id, SubgroupCategoryModel)
            if sg_cat_nid is None:
                return []

            order_column = SubgroupModel.subgroup_order
            if sort_field == "sg_nid":
                order_column = SubgroupModel.subgroup_nid
            elif sort_field == "sg_name":
                order_column = SubgroupModel.subgroup_name
            elif sort_field == "sg_gid":
                order_column = SubgroupModel.subgroup_gid
            elif sort_field == "sg_order":
                order_column = SubgroupModel.subgroup_order
            if sort_order and sort_order.lower() == "desc":
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()

            rows = (
                dw_db.query(SubgroupModel)
                .filter(SubgroupModel.subgroup_type == sg_cat_nid)
                .order_by(order_column)
                .all()
            )
            return [SubgroupCategoryValueResponseSchema.from_record(r) for r in rows]

    def get_value_by_identifier(
        self,
        dw_id: str,
        category_id: str,
        value_id: str,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get one subgroup value (subgroup) by value_id within a category.

        Args:
            dw_id: Data warehouse identifier
            category_id: Numeric sg_cat_nid or GUID sg_cat_gid (category)
            value_id: Numeric subgroup_nid (n_id) or GUID subgroup_gid (g_id)

        Returns:
            Value dict with n_id, val, g_id, order, sg_cat_nid, or None if not found or wrong category
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            SubgroupCategoryModel = SubgroupCategory(language_code)
            SubgroupModel = Subgroup(language_code)
            sg_cat_nid = _resolve_category_to_sg_cat_nid(dw_db, category_id, SubgroupCategoryModel)
            if sg_cat_nid is None:
                return None

            if value_id.isdigit():
                row = (
                    dw_db.query(SubgroupModel)
                    .filter(
                        SubgroupModel.subgroup_nid == int(value_id),
                        SubgroupModel.subgroup_type == sg_cat_nid,
                    )
                    .first()
                )
            else:
                row = (
                    dw_db.query(SubgroupModel)
                    .filter(
                        SubgroupModel.subgroup_gid == value_id,
                        SubgroupModel.subgroup_type == sg_cat_nid,
                    )
                    .first()
                )
            return SubgroupCategoryValueResponseSchema.from_record(row) if row else None

    def get_value_by_value_identifier(
        self,
        dw_id: str,
        value_identifier: str,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get one subgroup value (sg-category-val) by value identifier only, without category.
        value_identifier: numeric → n_id (subgroup_nid), alphanumeric → g_id (subgroup_gid).

        Args:
            dw_id: Data warehouse identifier
            value_identifier: Numeric subgroup_nid (n_id) or GUID subgroup_gid (g_id)

        Returns:
            Value dict with n_id, val, g_id, order, sg_cat_nid, or None if not found
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)  # add this
            SubgroupModel = Subgroup(language_code)
            if value_identifier.isdigit():
                row = (
                    dw_db.query(SubgroupModel)
                    .filter(SubgroupModel.subgroup_nid == int(value_identifier))
                    .first()
                )
            else:
                row = (
                    dw_db.query(SubgroupModel)
                    .filter(SubgroupModel.subgroup_gid == value_identifier)
                    .first()
                )
            return SubgroupCategoryValueResponseSchema.from_record(row) if row else None

    def create_value_in_session(
        self,
        dw_db: Session,
        dw_id: str,
        sg_cat_nid: int,
        val: str,
        g_id: Optional[str] = None,
        order: Optional[int] = None,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create one subgroup value (subgroup) under a category in the given session.
        Inserts a row into every configured language table (same NID, same data).
        Caller is responsible for commit.

        Args:
            dw_db: Active warehouse session
            dw_id: Data warehouse identifier (needed to iterate language tables)
            sg_cat_nid: Subgroup category nid (subgroup_type_nid)
            val: Value label (required, max 128 chars)
            g_id: Optional external identifier (GUID); generated if not provided
            order: Optional display order; next available if not provided
            language_code: Request/default locale; stored without prefix for this locale

        Returns:
            Value dict with n_id, val, g_id, order, sg_cat_nid

        Raises:
            ValueError: if val empty, or g_id duplicate
        """
        val = (val or "").strip()
        if not val:
            raise ValueError("Validation failed: subgroup value (val) is required")
        if len(val) > 128:
            raise ValueError("Validation failed: subgroup value (val) max 128 characters")

        default_locale = get_default_locale(dw_db)
        language_code = language_code or default_locale
        DefaultSubgroupModel = Subgroup(default_locale)
        g_id = (g_id or "").strip() or None
        if not g_id:
            g_id = generate_guid()
        else:
            existing = dw_db.query(DefaultSubgroupModel).filter(DefaultSubgroupModel.subgroup_gid == g_id).first()
            if existing:
                raise Conflict(f"g_id already exists: {g_id!r}")

        if order is None:
            max_order = (
                dw_db.query(func.coalesce(func.max(DefaultSubgroupModel.subgroup_order), 0))
                .filter(DefaultSubgroupModel.subgroup_type == sg_cat_nid)
                .scalar()
            )
            order = int(max_order) + 1

        # Insert into default locale first to obtain the auto-generated NID
        default_row = DefaultSubgroupModel(
            subgroup_name=value_for_locale(val, default_locale, language_code),
            subgroup_gid=g_id,
            subgroup_type=sg_cat_nid,
            subgroup_order=order,
            subgroup_global=False,
        )
        dw_db.add(default_row)
        dw_db.flush()
        subgroup_nid = default_row.subgroup_nid

        # Replicate into every other configured language table with the same NID
        for locale in get_dw_language_codes(dw_id):
            if locale == default_locale:
                continue
            LocaleModel = Subgroup(locale)
            row = LocaleModel(
                subgroup_nid=subgroup_nid,
                subgroup_name=value_for_locale(val, locale, language_code),
                subgroup_gid=g_id,
                subgroup_type=sg_cat_nid,
                subgroup_order=order,
                subgroup_global=False,
            )
            dw_db.add(row)
        dw_db.flush()
        return SubgroupCategoryValueResponseSchema.from_record(default_row)

    def bulk_create_values(
        self,
        dw_id: str,
        items: List[Dict[str, Any]],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Bulk-create subgroup category values. Each item must include sg_cat_gid (category GID),
        subgroup_name (required), and optionally subgroup_gid, subgroup_order, subgroup_global.

        Partial-success: items that fail validation or have unresolvable category GIDs are
        collected in errors; valid items are committed together at the end.

        Returns dict with created (list of value dicts) and errors (list of error strings).
        """
        created = []
        errors = []

        with get_warehouse_session_from_id(dw_id) as dw_db:
            SubgroupCategoryModel = SubgroupCategory(get_default_locale(dw_db))
            for idx, item in enumerate(items):
                cat_gid = str(item.get("sg_cat_gid", "")).strip()
                if not cat_gid:
                    errors.append({"index": idx, "error": "sg_cat_gid is required"})
                    continue

                sg_cat_nid = _resolve_category_to_sg_cat_nid(dw_db, cat_gid, SubgroupCategoryModel)
                if sg_cat_nid is None:
                    errors.append({"index": idx, "error": f"category not found for sg_cat_gid '{cat_gid}'"})
                    continue

                try:
                    val_dict = self.create_value_in_session(
                        dw_db,
                        dw_id,
                        sg_cat_nid,
                        item.get("subgroup_name", ""),
                        item.get("subgroup_gid"),
                        item.get("subgroup_order"),
                        language_code=language_code,
                    )
                    created.append(val_dict)
                except ValueError as e:
                    errors.append({"index": idx, "error": str(e)})

        return {"created": created, "errors": errors}

    def update_value(
        self,
        dw_id: str,
        value_identifier: str,
        data: SgCategoryValueUpdateSchema,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Partial update for a subgroup category value.

        subgroup_name is locale-specific (written to the requested locale, auto-filled
        to other locales only when currently blank).  subgroup_gid, subgroup_order,
        and subgroup_global are structural (written to every locale table).

        When subgroup_name is provided, after commit all ut_subgroup_vals rows that include
        this category value get their concatenated display name regenerated (all locales).

        Args:
            dw_id: Data warehouse identifier
            value_identifier: Numeric subgroup_nid or GUID subgroup_gid
            data: Update payload (at least one field required)
            language_code: Requested language (Accept-Language)

        Returns:
            Updated value dict, or None if the record was not found

        Raises:
            ValueError: on validation failures (name too long, gid duplicate, etc.)
        """
        name_update_requested = data.subgroup_name is not None
        resolved_lc: Optional[str] = None
        propagate_nid: Optional[int] = None
        result: Optional[Dict[str, Any]] = None

        with get_warehouse_session_from_id(dw_id) as dw_db:
            resolved_lc = language_code or get_default_locale(dw_db)
            DefaultSubgroupModel = Subgroup(get_default_locale(dw_db))

            if value_identifier.isdigit():
                row = dw_db.query(DefaultSubgroupModel).filter(
                    DefaultSubgroupModel.subgroup_nid == int(value_identifier)
                ).first()
            else:
                row = dw_db.query(DefaultSubgroupModel).filter(
                    DefaultSubgroupModel.subgroup_gid == value_identifier
                ).first()
            if not row:
                return None

            subgroup_nid = row.subgroup_nid
            propagate_nid = subgroup_nid

            # Store old order before building payload for gap-based reordering
            old_order = row.subgroup_order if data.subgroup_order is not None else None

            payload: Dict[str, Any] = {}
            if data.subgroup_name is not None:
                name = data.subgroup_name.strip()
                if not name:
                    raise ValueError("Validation failed: subgroup_name cannot be empty")
                if len(name) > 128:
                    raise ValueError("Validation failed: subgroup_name max 128 characters")
                payload["subgroup_name"] = name
            if data.subgroup_gid is not None:
                gid = data.subgroup_gid.strip()
                existing = dw_db.query(DefaultSubgroupModel).filter(
                    DefaultSubgroupModel.subgroup_gid == gid,
                    DefaultSubgroupModel.subgroup_nid != subgroup_nid,
                ).first()
                if existing:
                    raise Conflict(f"subgroup_gid already exists: {gid!r}")
                payload["subgroup_gid"] = gid
            if data.subgroup_order is not None:
                payload["subgroup_order"] = data.subgroup_order
            if data.subgroup_global is not None:
                payload["subgroup_global"] = data.subgroup_global

            # Apply gap-based reordering FIRST if order changed (global scope)
            if data.subgroup_order is not None and data.subgroup_order != old_order:
                from apps.shared.utils.display_order import reorder_display_orders_multi_locale
                
                reorder_display_orders_multi_locale(
                    dw_db=dw_db,
                    dw_id=dw_id,
                    model_class_factory=Subgroup,
                    order_column_name="subgroup_order",
                    pk_column_name="subgroup_nid", 
                    updated_record_id=subgroup_nid,
                    new_order=data.subgroup_order,
                    old_order=old_order
                    # No additional_filters = global reordering across all subgroup values
                )

            # THEN apply the locale update
            apply_locale_update(dw_db, dw_id, Subgroup, "subgroup_nid", subgroup_nid, payload, resolved_lc)
            
            dw_db.flush()
            dw_db.refresh(row)

            result = SubgroupCategoryValueResponseSchema.from_record(row)

        if (
            name_update_requested
            and propagate_nid is not None
            and resolved_lc is not None
        ):
            _propagate_name_to_subgroup_vals(dw_id, propagate_nid, resolved_lc)

        return result

    def delete_sg_category_value(
        self,
        dw_id: str,
        subgroup_nid: int,
    ) -> bool:
        """
        Delete a subgroup category value (ut_subgroup) with full cascade.

        For every ut_subgroup_vals combination linked via ut_subgroup_vals_subgroup to this
        subgroup_nid, runs the same cascade as DELETE subgroup val (ut_data, ic_ius, metadata,
        IUS, junction, ut_subgroup_vals locales).

        Then deletes ut_subgroup_<locale> rows for this subgroup_nid.
        """
        logger.info(f"Deleting subgroup value (subgroup_nid) {subgroup_nid} from warehouse '{dw_id}' (cascade)")

        from apps.datawarehouse.services.sg_vals import SgValsService

        sg_vals_service = SgValsService()

        with get_warehouse_session_from_id(dw_id) as dw_db:
            lang_codes = get_dw_language_codes(dw_id)
            default_locale = get_default_locale(dw_db)
            DefaultSubgroupModel = Subgroup(default_locale)
            row = dw_db.query(DefaultSubgroupModel).filter(
                DefaultSubgroupModel.subgroup_nid == subgroup_nid
            ).first()
            if not row:
                logger.warning(f"Subgroup value (subgroup_nid) {subgroup_nid} not found for deletion")
                return False

            if getattr(row, "is_system", False):
                raise ValueError("System subgroup cannot be deleted via API")

            subgroup_val_nids = sorted(
                {
                    r[0]
                    for r in dw_db.query(SubgroupValsSubgroup.subgroup_val_nid)
                    .filter(SubgroupValsSubgroup.subgroup_nid == subgroup_nid)
                    .distinct()
                    .all()
                    if r[0] is not None
                }
            )

            SubgroupValDefaultModel = SubgroupVal(default_locale)
            if subgroup_val_nids:
                sv_rows = (
                    dw_db.query(SubgroupValDefaultModel)
                    .filter(SubgroupValDefaultModel.subgroup_val_nid.in_(subgroup_val_nids))
                    .all()
                )
                found = {r.subgroup_val_nid for r in sv_rows}
                missing = set(subgroup_val_nids) - found
                if missing:
                    miss = ",".join(str(n) for n in sorted(missing))
                    raise ValueError(
                        f"Inconsistent junction: subgroup_val_nid(s) not found [{miss}] "
                        f"(referenced for category value subgroup_nid {subgroup_nid})"
                    )
                for r in sv_rows:
                    if getattr(r, "is_system", False):
                        raise ValueError("System subgroup cannot be deleted via API")

            for sv_id in subgroup_val_nids:
                sg_vals_service.cascade_delete_sg_val_in_session(
                    dw_db, dw_id, sv_id, language_codes=lang_codes
                )

            for locale in lang_codes:
                LocaleModel = Subgroup(locale)
                dw_db.query(LocaleModel).filter(
                    LocaleModel.subgroup_nid == subgroup_nid
                ).delete(synchronize_session=False)

            prev = snapshot_entity_for_audit(row)
            prev["removed_subgroup_vals"] = deleted_ids_preview(subgroup_val_nids)
            ident = str(getattr(row, "subgroup_gid", None) or subgroup_nid)
            buffer_manual_audit(
                dw_db,
                action="DELETE",
                module="subgroup_category_value",
                identifier=ident[:255],
                description=(
                    f"Deleted category-value ut_subgroup subgroup_nid={subgroup_nid} "
                    f"after {len(subgroup_val_nids)} subgroup_val cascade(s)"
                ),
                previous_value=prev,
            )

            cascade_desc = (
                f"cascade deleted {len(subgroup_val_nids)} subgroup_val(s): "
                + ",".join(str(n) for n in subgroup_val_nids)
                if subgroup_val_nids
                else "no subgroup combinations linked"
            )
            logger.info(
                f"Subgroup value (subgroup_nid) {subgroup_nid} deleted successfully ({cascade_desc})"
            )
            return True

    def run_delete_sg_category_value_job(
        self,
        dw_id: str,
        subgroup_nid: int,
    ) -> Dict[str, Any]:
        """
        Run cascade delete plus DW cache invalidation for background workers (DB poller / Celery).

        Raises ValueError if the row is missing when delete runs (race) or for business-rule
        failures surfaced by delete_sg_category_value (system subgroup, inconsistent junction).
        """
        deleted = self.delete_sg_category_value(dw_id, subgroup_nid)
        if not deleted:
            raise ValueError(
                f"Subgroup value (subgroup_nid={subgroup_nid}) not found for deletion"
            )
        from apps.shared.utils.cache import cache_delete_pattern

        cache_delete_pattern("dw:sg-categories:*")
        cache_delete_pattern("dw:sg-categories-values:*")
        cache_delete_pattern("dw:subgroups:*")
        notify_dbmetadata_counts_changed(dw_id)
        return {"deleted": True, "subgroup_nid": subgroup_nid, "dw_id": dw_id}
