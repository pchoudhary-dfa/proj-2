"""
Area Level service for CRUD operations (list, get one, create, update, delete, association-count, multiple-delete).
Uses ut_area_level_<locale> (built from AreaLevelLocaleMixin). API: level_nid, area_level, area_level_name.
"""
import logging
from typing import List, Optional, Dict, Any, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.utils.export_utils import build_simple_xlsx, make_export_filename
from apps.datawarehouse.models.datawarehouse import AreaLevel, Area, Data, get_default_locale
from apps.datawarehouse.schemas.area import AreaLevelCreateSchema, AreaLevelUpdateSchema, AreaLevelResponseSchema
from apps.datawarehouse.services.area import AreaService
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.constants import ASSOC_AREA_COUNT, ASSOC_DATA_COUNT
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.shared.exceptions import Conflict, NotFound
from apps.datawarehouse.utils.audit_events import buffer_manual_audit

logger = logging.getLogger(__name__)


def _record_to_level(record: Any) -> Dict[str, Any]:
    """Map Area Level record to API response using schema (single source of truth)."""
    return AreaLevelResponseSchema.from_record(record)


def resolve_identifier_to_level_nid(dw_id: str, identifier: str) -> Optional[int]:
    """
    Resolve area level identifier to level_nid. Only numeric identifier (level_nid) is accepted; no level_gid in schema.
    """
    if not identifier or not str(identifier).strip():
        return None
    identifier = str(identifier).strip()
    if identifier.isdigit():
        return int(identifier)
    return None


class AreaLevelService:
    """Service for Area Level read operations."""

    def get_all_area_levels(
        self,
        dw_id: str,
        language_code: Optional[str] = None,
        page: int = 1,
        page_size: Optional[int] = 10,
        sort_order: str = "asc",
        sort_field: str = "al_level",
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        List area levels with optional sorting. When page_size is None, returns all records (no pagination).

        Args:
            dw_id: Data warehouse identifier
            language_code: Language for locale content
            page: Page number (1-based); used only when page_size is not None
            page_size: Number of records per page; None to return all records
            sort_order: asc or desc
            sort_field: al_nid, al_level, al_name

        Returns:
            Tuple of (list of dicts with level_nid, area_level, area_level_name, total_count)
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaLevelModel = AreaLevel(language_code)
            order_column = AreaLevelModel.area_level
            if sort_field == "al_nid":
                order_column = AreaLevelModel.level_nid
            elif sort_field == "al_level":
                order_column = AreaLevelModel.area_level
            elif sort_field == "al_name":
                order_column = AreaLevelModel.area_level_name
            if sort_order and sort_order.lower() == "desc":
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()
            q = (
                dw_db.query(AreaLevelModel)
                .order_by(order_column)
            )
            total_count = q.count()
            if page_size is not None:
                page = max(1, page)
                page_size = max(1, min(page_size, 1000))
                skip = (page - 1) * page_size
                rows = q.offset(skip).limit(page_size).all()
            else:
                rows = q.all()
            return [_record_to_level(r) for r in rows], total_count

    def get_area_level_by_nid(
        self,
        dw_id: str,
        level_nid: int,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get one area level by level_nid.

        Args:
            dw_id: Data warehouse identifier
            level_nid: Level nid (primary key)
            language_code: Language for locale content

        Returns:
            Dict with level_nid, area_level, area_level_name; None if not found
        """

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaLevelModel = AreaLevel(language_code)
            row = dw_db.query(AreaLevelModel).filter(AreaLevelModel.level_nid == level_nid).first()
            return _record_to_level(row) if row else None

    def get_association_counts(
        self,
        dw_id: str,
        level_nids: List[int],
        language_code: Optional[str] = None,
    ) -> Dict[str, int]:
        """
        Return association counts for the given area levels (for delete confirmation).
        Counts areas at those levels and data rows under those areas.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            if not level_nids:
                language_code = language_code or get_default_locale(dw_db)
                AreaModel = Area(language_code)
                area_count = dw_db.query(func.count(AreaModel.area_nid)).scalar() or 0
                data_count = dw_db.query(func.count(Data.data_nid)).scalar() or 0
                return {ASSOC_AREA_COUNT: area_count, ASSOC_DATA_COUNT: data_count}
            language_code = language_code or get_default_locale(dw_db)
            AreaLevelModel = AreaLevel(language_code)
            rows = (
                dw_db.query(AreaLevelModel.area_level)
                .filter(AreaLevelModel.level_nid.in_(level_nids))
                .distinct()
                .all()
            )
            level_numbers = [r[0] for r in rows if r[0] is not None]
            if not level_numbers:
                return {ASSOC_AREA_COUNT: 0, ASSOC_DATA_COUNT: 0}

            AreaModel = Area(language_code)
            area_count = (
                dw_db.query(func.count(AreaModel.area_nid))
                .filter(AreaModel.area_level.in_(level_numbers))
                .scalar() or 0
            )
            area_nids_q = (
                dw_db.query(AreaModel.area_nid).filter(AreaModel.area_level.in_(level_numbers))
            )
            area_nids = [r[0] for r in area_nids_q.all()]
            if not area_nids:
                return {ASSOC_AREA_COUNT: area_count, ASSOC_DATA_COUNT: 0}

            data_count = (
                dw_db.query(func.count(Data.data_nid))
                .filter(Data.area_nid.in_(area_nids))
                .scalar() or 0
            )
            return {ASSOC_AREA_COUNT: area_count, ASSOC_DATA_COUNT: data_count}

    def multiple_delete(
        self,
        dw_id: str,
        level_nids: List[int],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete multiple area levels by level_nid with partial-success support.
        Cascade: deletes all areas at those levels (and area delete cascades to data/maps/descendants).
        Returns deleted nids, aggregate counts, and per-item errors.
        """
        if not level_nids:
            return {"deleted": [], "areas_deleted": 0, "descendants_deleted": 0, "data_rows_deleted": 0, "errors": []}

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaLevelModel = AreaLevel(language_code)

            # Validate existence per item
            errors = []
            valid_nids = []
            for idx, level_nid in enumerate(level_nids):
                row = dw_db.query(AreaLevelModel.level_nid, AreaLevelModel.area_level).filter(
                    AreaLevelModel.level_nid == level_nid
                ).first()
                if not row:
                    errors.append({"index": idx, "error": f"Area level with nid '{level_nid}' not found"})
                else:
                    valid_nids.append(level_nid)

            if not valid_nids:
                return {"deleted": [], "areas_deleted": 0, "descendants_deleted": 0, "data_rows_deleted": 0, "errors": errors}

            rows = (
                dw_db.query(AreaLevelModel.level_nid, AreaLevelModel.area_level)
                .filter(AreaLevelModel.level_nid.in_(valid_nids))
                .all()
            )
            level_numbers = list({r.area_level for r in rows if r.area_level is not None})
            deleted_nids = [r.level_nid for r in rows]

            area_service = AreaService()
            total_areas = total_descendants = total_data = 0
            for level_number in level_numbers:
                counts = area_service.delete_areas_by_level(dw_db, dw_id, level_number, language_code)
                total_areas += counts["areas_deleted"]
                total_descendants += counts["descendants_deleted"]
                total_data += counts["data_rows_deleted"]

            for locale in get_dw_language_codes(dw_id):
                AreaLevelModel = AreaLevel(locale)
                dw_db.query(AreaLevelModel).filter(
                    AreaLevelModel.area_level.in_(level_numbers)
                ).delete(synchronize_session=False)
            buffer_manual_audit(
                dw_db,
                action="DELETE",
                module="area_level",
                description=f"Bulk deleted {len(deleted_nids)} area level(s) with cascade areas and data rows",
                previous_value={"level_nids": deleted_nids},
            )
            dw_db.commit()

        notify_dbmetadata_counts_changed(dw_id)
        return {
            "deleted": deleted_nids,
            "areas_deleted": total_areas,
            "descendants_deleted": total_descendants,
            "data_rows_deleted": total_data,
            "errors": errors,
        }

    def _create_area_level_in_session(
        self,
        dw_db: Any,
        dw_id: str,
        data: AreaLevelCreateSchema,
        language_code: str,
    ) -> int:
        """
        Create one area level using an existing session. Does not commit.
        Returns level_nid of the created area level.

        Uniqueness checks are performed against the default locale table
        (authoritative source).  The NID is pre-computed from the current
        max so that the same value is written explicitly into every locale
        table, satisfying the shared-NID requirement.
        """
        DefaultAreaLevelModel = AreaLevel(get_default_locale(dw_db))
        existing_level = dw_db.query(DefaultAreaLevelModel).filter(
            DefaultAreaLevelModel.area_level == data.area_level
        ).first()
        if existing_level:
            raise Conflict("Area level number already exists")
        raw_name = (data.area_level_name or "").strip() or f"Level {data.area_level}"
        default_locale = get_default_locale(dw_db)
        name_in_default = value_for_locale(raw_name, default_locale, language_code)
        existing_name = dw_db.query(DefaultAreaLevelModel).filter(
            DefaultAreaLevelModel.area_level_name == name_in_default
        ).first()
        if existing_name:
            raise Conflict("Area level name already exists")

        max_nid = dw_db.query(func.max(DefaultAreaLevelModel.level_nid)).scalar()
        level_nid = (max_nid or 0) + 1

        for locale in get_dw_language_codes(dw_id):
            AreaLevelModel = AreaLevel(locale)
            area_level_name = value_for_locale(raw_name, locale, language_code)
            row = AreaLevelModel(
                level_nid=level_nid,
                area_level=data.area_level,
                area_level_name=area_level_name,
            )
            dw_db.add(row)
            dw_db.flush()
        return level_nid

    def create_area_level(
        self,
        dw_id: str,
        data: AreaLevelCreateSchema,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new area level. Validates level and name uniqueness, inserts in all locale tables.

        Args:
            dw_id: Data warehouse identifier
            data: Area level creation data (area_level, area_level_name)
            language_code: Language for locale content

        Returns:
            Created area level dict (level_nid, area_level, area_level_name)

        Raises:
            ValueError: If level or name missing, or duplicate level/name
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            level_nid = self._create_area_level_in_session(dw_db, dw_id, data, language_code)
            dw_db.commit()
        return self.get_area_level_by_nid(dw_id, level_nid, language_code)

    def create_area_levels_batch(
        self,
        dw_id: str,
        items: List[AreaLevelCreateSchema],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create multiple area levels with partial-success support.
        Each item is committed independently; failures are collected in errors.
        Returns dict with created (list of result dicts) and errors (list of {index, error} dicts).
        """
        if not items:
            return {"created": [], "errors": []}

        created = []
        errors = []
        for idx, data in enumerate(items):
            with get_warehouse_session_from_id(dw_id) as dw_db:
                try:
                    lc = language_code or get_default_locale(dw_db)
                    level_nid = self._create_area_level_in_session(dw_db, dw_id, data, lc)
                    dw_db.commit()
                    result = self.get_area_level_by_nid(dw_id, level_nid, lc)
                    if result:
                        created.append(result)
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

        return {"created": created, "errors": errors}

    def update_area_level(
        self,
        dw_id: str,
        identifier: str,
        data: AreaLevelUpdateSchema,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update an existing area level by identifier (numeric level_nid only). Uniqueness checks exclude the current record.

        Args:
            dw_id: Data warehouse identifier
            identifier: Level identifier: numeric only (level_nid)
            data: Area level update data (area_level and/or area_level_name optional)
            language_code: Language for locale content

        Returns:
            Updated area level dict

        Raises:
            ValueError: If identifier not found or duplicate level/name
        """
        level_nid = resolve_identifier_to_level_nid(dw_id, identifier)
        if level_nid is None:
            raise NotFound(f"Area level with identifier '{identifier}' not found")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaLevelModel = AreaLevel(language_code)
            row = dw_db.query(AreaLevelModel).filter(AreaLevelModel.level_nid == level_nid).first()
            if not row:
                raise NotFound(f"Area level with level_nid {level_nid} not found")

            if data.area_level is not None:
                other_level = dw_db.query(AreaLevelModel).filter(
                    AreaLevelModel.area_level == data.area_level,
                    AreaLevelModel.level_nid != level_nid,
                ).first()
                if other_level:
                    raise Conflict("Area level number already exists")
            if data.area_level_name is not None:
                name_stripped = (data.area_level_name or "").strip()
                other_name = dw_db.query(AreaLevelModel).filter(
                    or_(
                        AreaLevelModel.area_level_name == name_stripped,
                        AreaLevelModel.area_level_name == apply_lang_prefix(name_stripped),
                    ),
                    AreaLevelModel.level_nid != level_nid,
                ).first()
                if other_name:
                    raise Conflict("Area level name already exists")

            # Build payload with raw values; apply_locale_update applies prefix for non-request locales
            payload: Dict[str, Any] = {}
            if data.area_level is not None:
                payload["area_level"] = data.area_level
            if data.area_level_name is not None:
                payload["area_level_name"] = (data.area_level_name or "").strip()

            # area_level → structural (all locales via level_nid PK)
            # area_level_name → locale-specific (requested locale only)
            apply_locale_update(dw_db, dw_id, AreaLevel, "level_nid", level_nid, payload, language_code)

            dw_db.commit()
            return self.get_area_level_by_nid(dw_id, level_nid, language_code)

    def delete_area_level(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete area level by identifier (numeric level_nid only) and cascade: delete all areas whose area_level matches.

        Args:
            dw_id: Data warehouse identifier
            identifier: Level identifier: numeric only (level_nid)
            language_code: Language for locale content

        Returns:
            Dict with level_nid deleted and cascade counts (areas_deleted, etc.)

        Raises:
            ValueError: If identifier not found
        """
        level_nid = resolve_identifier_to_level_nid(dw_id, identifier)
        if level_nid is None:
            raise NotFound(f"Area level with identifier '{identifier}' not found")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaLevelModel = AreaLevel(language_code)
            row = dw_db.query(AreaLevelModel).filter(AreaLevelModel.level_nid == level_nid).first()
            if not row:
                raise NotFound(f"Area level with level_nid {level_nid} not found")
            level_number = row.area_level

            # Delete all areas at this level (cascade to descendants)
            area_service = AreaService()
            area_counts = area_service.delete_areas_by_level(dw_db, dw_id, level_number, language_code)

            for locale in get_dw_language_codes(dw_id):
                AreaLevelModel = AreaLevel(locale)
                dw_db.query(AreaLevelModel).filter(
                    AreaLevelModel.area_level == level_number
                ).delete(synchronize_session=False)
            buffer_manual_audit(
                dw_db,
                action="DELETE",
                module="area_level",
                identifier=str(level_nid),
                description=f"Deleted area level nid={level_nid} (level={level_number}) with cascade areas and data rows",
            )
            dw_db.commit()

        notify_dbmetadata_counts_changed(dw_id)
        return {
            "level_nid": level_nid,
            "area_level": level_number,
            "areas_deleted": area_counts["areas_deleted"],
            "descendants_deleted": area_counts["descendants_deleted"],
            "data_rows_deleted": area_counts["data_rows_deleted"],
        }


def build_area_levels_export_xlsx(
    dw_db: Session,
    language_code: str,
    db_connection_display_name: str,
    sort_order: str = "asc",
    sort_field: str = "al_level",
) -> Tuple[Any, str]:
    """Build XLSX export for all area levels. Caller must validate DW and pass active dw_db. Returns (xlsx_stream, filename)."""
    lang = language_code or get_default_locale(dw_db)
    AreaLevelModel = AreaLevel(lang)
    order_column = AreaLevelModel.area_level
    if sort_field == "al_nid":
        order_column = AreaLevelModel.level_nid
    elif sort_field == "al_name":
        order_column = AreaLevelModel.area_level_name
    if sort_order and sort_order.lower() == "desc":
        order_column = order_column.desc()
    else:
        order_column = order_column.asc()
    rows = dw_db.query(AreaLevelModel).order_by(order_column).all()
    items = [_record_to_level(r) for r in rows]
    headers = ["level_nid", "area_level", "area_level_name"]
    data_rows = [[it.get("level_nid"), it.get("area_level"), it.get("area_level_name")] for it in items]
    output = build_simple_xlsx("Area Levels", headers, data_rows)
    filename = make_export_filename("AREA_LEVELS", db_connection_display_name)
    return output, filename
