"""
Metadata Category service – CRUD for ut_metadata_category_<locale>.
Identifier: numeric → categorynid (mt_catg_nid), alphanumeric → categorygid (mt_catg_gid).
"""
import logging
from typing import List, Optional, Dict, Any, Tuple

from sqlalchemy import func

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import Conflict
from apps.datawarehouse.models.datawarehouse import (
    MetadataCategory,
    MetadataReport,
    get_default_locale,
)
from apps.datawarehouse.schemas.metadata_category import (
    MetadataCategoryCreateSchema,
    MetadataCategoryUpdateSchema,
    MetadataCategoryResponseSchema,
)
from apps.shared.utils.validators import generate_guid
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.datawarehouse.constants import ASSOC_INDICATOR_COUNT, ASSOC_AREA_COUNT

logger = logging.getLogger(__name__)

_SORT_FIELD_MAP = {
    "mt_catg_order": "categoryorder",
    "mt_catg_name": "categoryname",
    "mt_catg_gid": "categorygid",
    "mt_catg_nid": "categorynid",
}


class MetadataCategoryService:
    """Service for Metadata Category CRUD operations."""

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _resolve_identifier(self, dw_db, identifier: str, Model) -> Optional[int]:
        """Resolve identifier (numeric → categorynid, alphanumeric → categorygid) to categorynid."""
        if identifier.isdigit():
            row = dw_db.query(Model).filter(Model.categorynid == int(identifier)).first()
        else:
            row = dw_db.query(Model).filter(Model.categorygid == identifier).first()
        return row.categorynid if row else None

    def _validate_name_unique(
        self, dw_db, categoryname: str, categorytype: str, exclude_nid: Optional[int] = None
    ) -> None:
        """Raise ValueError if categoryname already exists within the given categorytype."""
        DefaultModel = MetadataCategory(get_default_locale(dw_db))
        q = dw_db.query(DefaultModel).filter(
            DefaultModel.categoryname == apply_lang_prefix(categoryname.strip()),
            DefaultModel.categorytype == categorytype,
        )
        if exclude_nid is not None:
            q = q.filter(DefaultModel.categorynid != exclude_nid)
        if q.first() is not None:
            raise Conflict(f"categoryname '{categoryname}' already exists for type '{categorytype}'")

    def _validate_gid_unique(
        self, dw_db, categorygid: str, exclude_nid: Optional[int] = None
    ) -> None:
        """Raise ValueError if categorygid already exists."""
        if not categorygid or not categorygid.strip():
            return
        DefaultModel = MetadataCategory(get_default_locale(dw_db))
        q = dw_db.query(DefaultModel).filter(DefaultModel.categorygid == categorygid.strip())
        if exclude_nid is not None:
            q = q.filter(DefaultModel.categorynid != exclude_nid)
        if q.first() is not None:
            raise Conflict(f"categorygid '{categorygid}' already exists")

    def _validate_parent_nid(self, dw_db, parentcategorynid: float) -> None:
        """Raise ValueError if parentcategorynid > 0 and does not reference an existing category."""
        if parentcategorynid is None or parentcategorynid <= 0:
            return
        DefaultModel = MetadataCategory(get_default_locale(dw_db))
        nid = int(parentcategorynid)
        row = dw_db.query(DefaultModel).filter(DefaultModel.categorynid == nid).first()
        if not row:
            raise ValueError(f"Validation failed: parentcategorynid {nid} does not reference an existing category")

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    def get_all(
        self,
        dw_id: str,
        language_code: Optional[str] = None,
        catg_type: Optional[str] = None,
        search: Optional[str] = None,
        sort_field: str = "mt_catg_order",
        sort_order: str = "asc",
        page: int = 1,
        page_size: Optional[int] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List metadata categories with optional type filter, search, sorting, and pagination.

        catg_type: 'I' | 'A' | 'S' (optional; if omitted returns all)
        search: substring match against categoryname or categorygid (case-insensitive)
        sort_field: mt_catg_order | mt_catg_name | mt_catg_gid | mt_catg_nid
        Returns:
            (list of category dicts, total_count)
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            Model = MetadataCategory(language_code)

            internal_sort = _SORT_FIELD_MAP.get(sort_field, "categoryorder")
            order_column = getattr(Model, internal_sort, Model.categoryorder)
            if sort_order and sort_order.lower() == "desc":
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()

            q = dw_db.query(Model).order_by(order_column)
            if catg_type:
                q = q.filter(Model.categorytype == catg_type.strip().upper())
            if search:
                pattern = f"%{search.strip()}%"
                q = q.filter(
                    Model.categoryname.ilike(pattern) | Model.categorygid.ilike(pattern)
                )

            total_count = q.count()
            if page_size is not None:
                page = max(1, page)
                page_size = max(1, min(page_size, 1000))
                skip = (page - 1) * page_size
                rows = q.offset(skip).limit(page_size).all()
            else:
                rows = q.all()

            return [MetadataCategoryResponseSchema.from_record(r) for r in rows], total_count

    def get_by_identifier(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Get one metadata category by nid or gid."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            Model = MetadataCategory(language_code)
            if identifier.isdigit():
                row = dw_db.query(Model).filter(Model.categorynid == int(identifier)).first()
            else:
                row = dw_db.query(Model).filter(Model.categorygid == identifier).first()
            return MetadataCategoryResponseSchema.from_record(row) if row else None

    def get_association_counts(
        self,
        dw_id: str,
        identifier: Optional[str] = None,
        language_code: Optional[str] = None,
    ) -> Dict[str, int]:
        """
        Return metadata report row counts keyed by category type.

        - No identifier: return counts for all type-'I' and type-'A' categories.
          → {"indicator_count": <n>, "area_count": <m>}
        - With identifier: resolve the category, count its metadatareport rows,
          and return under the appropriate key based on categorytype.
          → {"indicator_count": <n>}  or  {"area_count": <n>}

        Returns None if an identifier is given but the category is not found.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            CatgModel = MetadataCategory(language_code)
            ReportModel = MetadataReport(language_code)

            if identifier is not None:
                nid = self._resolve_identifier(dw_db, identifier, CatgModel)
                if nid is None:
                    return None

                cat_row = dw_db.query(CatgModel).filter(CatgModel.categorynid == nid).first()
                if not cat_row:
                    return None

                count = (
                    dw_db.query(func.count(ReportModel.metadatareport_nid))
                    .filter(ReportModel.category_nid == nid)
                    .scalar() or 0
                )
                cat_type = (cat_row.categorytype or "").strip().upper()
                key = ASSOC_INDICATOR_COUNT if cat_type == "I" else ASSOC_AREA_COUNT
                return {key: count}

            # No identifier — aggregate separately for type 'I' and type 'A'
            def _count_for_type(catg_type: str) -> int:
                nids = [
                    r[0]
                    for r in dw_db.query(CatgModel.categorynid)
                    .filter(CatgModel.categorytype == catg_type)
                    .all()
                ]
                if not nids:
                    return 0
                return (
                    dw_db.query(func.count(ReportModel.metadatareport_nid))
                    .filter(ReportModel.category_nid.in_(nids))
                    .scalar() or 0
                )

            return {
                ASSOC_INDICATOR_COUNT: _count_for_type("I"),
                ASSOC_AREA_COUNT: _count_for_type("A"),
            }

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def _create_one(
        self,
        dw_id: str,
        item: MetadataCategoryCreateSchema,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a single metadata category inside a fresh session.
        Returns the full response dict from the default-locale row.
        """
        categoryname = (item.categoryname or "").strip()
        if not categoryname:
            raise ValueError("Validation failed: categoryname is required")
        if len(categoryname) > 255:
            raise ValueError("Validation failed: categoryname max 255 characters")

        categorytype = (item.categorytype or "").strip().upper()
        if categorytype not in ("I", "A", "S"):
            raise ValueError("Validation failed: categorytype must be one of I, A, S")

        categorygid = (item.categorygid or "").strip() or None
        if not categorygid:
            categorygid = generate_guid()

        categoryorder = item.categoryorder
        parentcategorynid = item.parentcategorynid if item.parentcategorynid is not None else -1
        categorydescription = item.categorydescription
        ispresentational = bool(item.ispresentational) if item.ispresentational is not None else False
        ismandatory = bool(item.ismandatory) if item.ismandatory is not None else False

        with get_warehouse_session_from_id(dw_id) as dw_db:
            default_locale = get_default_locale(dw_db)
            language_code = language_code or default_locale
            DefaultModel = MetadataCategory(default_locale)

            self._validate_name_unique(dw_db, categoryname, categorytype)
            self._validate_gid_unique(dw_db, categorygid)
            self._validate_parent_nid(dw_db, parentcategorynid)

            if categoryorder is None:
                max_order = (
                    dw_db.query(func.coalesce(func.max(DefaultModel.categoryorder), 0))
                    .filter(DefaultModel.categorytype == categorytype)
                    .scalar()
                )
                categoryorder = int(max_order) + 1

            default_row = DefaultModel(
                categoryname=value_for_locale(categoryname, default_locale, language_code),
                categorytype=categorytype,
                categorygid=categorygid,
                categoryorder=categoryorder,
                parentcategorynid=parentcategorynid,
                categorydescription=value_for_locale(categorydescription, default_locale, language_code) if categorydescription else None,
                ispresentational=ispresentational,
                ismandatory=ismandatory,
            )
            dw_db.add(default_row)
            dw_db.flush()
            nid = default_row.categorynid

            for locale in get_dw_language_codes(dw_id):
                if locale == default_locale:
                    continue
                LocaleModel = MetadataCategory(locale)
                row = LocaleModel(
                    categorynid=nid,
                    categoryname=value_for_locale(categoryname, locale, language_code),
                    categorytype=categorytype,
                    categorygid=categorygid,
                    categoryorder=categoryorder,
                    parentcategorynid=parentcategorynid,
                    categorydescription=value_for_locale(categorydescription, locale, language_code) if categorydescription else None,
                    ispresentational=ispresentational,
                    ismandatory=ismandatory,
                )
                dw_db.add(row)

            dw_db.flush()
            result = MetadataCategoryResponseSchema.from_record(default_row)
            return result

    def bulk_create(
        self,
        dw_id: str,
        items: List[MetadataCategoryCreateSchema],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Bulk-create metadata categories. Partial-success: each item attempted independently.
        Returns dict with created (list of response dicts) and errors (list of error strings).
        """
        created = []
        errors = []
        for idx, item in enumerate(items):
            try:
                result = self._create_one(dw_id, item, language_code=language_code)
                created.append(result)
            except ValueError as e:
                errors.append({"index": idx, "error": str(e)})
        return {"created": created, "errors": errors}

    def update(
        self,
        dw_id: str,
        identifier: str,
        data: MetadataCategoryUpdateSchema,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Partial update for a metadata category.

        locale-specific fields: categoryname, categorydescription → written to requested locale table.
        structural fields: categorygid, categoryorder, parentcategorynid, ispresentational, ismandatory
                           → written to every locale table.

        Returns full updated record dict, or None if not found.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            DefaultModel = MetadataCategory(get_default_locale(dw_db))
            LangModel = MetadataCategory(language_code)

            nid = self._resolve_identifier(dw_db, identifier, DefaultModel)
            if nid is None:
                return None

            row = dw_db.query(LangModel).filter(LangModel.categorynid == nid).first()
            if not row:
                return None

            default_row = dw_db.query(DefaultModel).filter(DefaultModel.categorynid == nid).first()

            payload: Dict[str, Any] = {}
            if data.categoryname is not None:
                name = data.categoryname.strip()
                if not name:
                    raise ValueError("Validation failed: categoryname cannot be empty")
                if len(name) > 255:
                    raise ValueError("Validation failed: categoryname max 255 characters")
                catg_type = default_row.categorytype if default_row else row.categorytype
                self._validate_name_unique(dw_db, name, catg_type, exclude_nid=nid)
                payload["categoryname"] = name
            if data.categorygid is not None:
                gid = data.categorygid.strip()
                self._validate_gid_unique(dw_db, gid, exclude_nid=nid)
                payload["categorygid"] = gid
            if data.categoryorder is not None:
                payload["categoryorder"] = data.categoryorder
            if data.parentcategorynid is not None:
                self._validate_parent_nid(dw_db, data.parentcategorynid)
                payload["parentcategorynid"] = data.parentcategorynid
            if data.categorydescription is not None:
                payload["categorydescription"] = data.categorydescription
            if data.ispresentational is not None:
                payload["ispresentational"] = data.ispresentational
            if data.ismandatory is not None:
                payload["ismandatory"] = data.ismandatory

            apply_locale_update(dw_db, dw_id, MetadataCategory, "categorynid", nid, payload, language_code)
            dw_db.flush()
            dw_db.refresh(row)
            return MetadataCategoryResponseSchema.from_record(row)

    def delete(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> bool:
        """
        Delete a metadata category from all locale tables.

        Raises ValueError("HAS_METADATA_ROWS:<count>") if any ut_metadatareport rows reference it.
        Returns True on success, False if not found.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            DefaultModel = MetadataCategory(get_default_locale(dw_db))

            nid = self._resolve_identifier(dw_db, identifier, DefaultModel)
            if nid is None:
                return False

            ReportModel = MetadataReport(language_code)
            ref_count = (
                dw_db.query(func.count(ReportModel.metadatareport_nid))
                .filter(ReportModel.category_nid == nid)
                .scalar() or 0
            )
            if ref_count > 0:
                raise ValueError(f"HAS_METADATA_ROWS:{ref_count}")

            for locale in get_dw_language_codes(dw_id):
                LocaleModel = MetadataCategory(locale)
                dw_db.query(LocaleModel).filter(LocaleModel.categorynid == nid).delete(
                    synchronize_session=False
                )

            dw_db.commit()
            logger.info("Metadata category categorynid=%s deleted", nid)
            return True
