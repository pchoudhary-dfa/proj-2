"""
Unit service for CRUD operations on unit table with i18n support
Uses SQLAlchemy ORM with temporary sessions for dynamic warehouse connections
"""
import logging
from io import BytesIO
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func

from apps.datawarehouse.schemas.unit import UnitCreateSchema, UnitUpdateSchema, UnitResponseSchema
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import Conflict, NotFound
from apps.shared.utils.validators import validate_unit_gid_guid, generate_guid
from apps.datawarehouse.utils.unit_data_format import validate_selectable_unit_format_code
from apps.datawarehouse.models.datawarehouse import (
    IndicatorUnitSubgroup,
    IcIus,
    Data,
    Unit,
    MetadataReport,
    get_default_locale,
)
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.datawarehouse.constants import ASSOC_DATA_ROWS, ASSOC_IUS_ROWS
from apps.datawarehouse.utils.export_utils import build_simple_xlsx, make_export_filename
from apps.datawarehouse.utils.audit_events import (
    buffer_delete_step,
    buffer_manual_audit,
    deleted_ids_preview,
    snapshot_entity_for_audit,
)

logger = logging.getLogger(__name__)


def build_units_export_xlsx(
    dw_db: Session,
    language_code: str,
    db_connection_display_name: str,
    sort_order: str = "asc",
    sort_field: str = "u_nid",
    search: Optional[str] = None,
    filter_global: Optional[bool] = None,
) -> Tuple[BytesIO, str]:
    """
    Build XLSX export for all units. Caller must validate DW and pass active dw_db session.
    Returns (xlsx_stream, filename).
    """
    UnitDefaultModel = Unit(get_default_locale(dw_db))
    UnitModel = Unit(language_code)
    UnitLangAlias = aliased(UnitModel)
    base_query = dw_db.query(UnitDefaultModel).select_from(UnitDefaultModel).outerjoin(
        UnitLangAlias, UnitDefaultModel.unit_nid == UnitLangAlias.unit_nid
    )
    filter_query = base_query
    if search and search.strip():
        pattern = f"%{search.strip().lower()}%"
        filter_query = filter_query.filter(func.lower(UnitLangAlias.unit_name).like(pattern))
    if filter_global is not None:
        filter_query = filter_query.filter(UnitDefaultModel.unit_global == filter_global)
    order_column = UnitDefaultModel.unit_nid
    if sort_field == "u_name":
        order_column = UnitDefaultModel.unit_name
    elif sort_field == "u_gid":
        order_column = UnitDefaultModel.unit_gid
    if sort_order and sort_order.lower() == "desc":
        order_column = order_column.desc()
    else:
        order_column = order_column.asc()
    units = filter_query.distinct().order_by(order_column).all()
    result = []
    for unit in units:
        unit_record = dw_db.query(UnitModel).filter(UnitModel.unit_nid == unit.unit_nid).first()
        result.append(
            UnitResponseSchema.from_record(unit, locale_record=unit_record, locale=language_code)
        )
    headers = ["unit_nid", "unit_gid", "unit_name", "unit_global", "unit_format", "locale"]
    rows = [
        [
            u.get("unit_nid"),
            u.get("unit_gid"),
            u.get("unit_name"),
            u.get("unit_global"),
            u.get("unit_format"),
            u.get("locale", ""),
        ]
        for u in result
    ]
    output = build_simple_xlsx("Units", headers, rows)
    filename = make_export_filename("UNITS", db_connection_display_name)
    return output, filename


class UnitService:
    """
    Service for unit CRUD operations with dynamic database connections and i18n support.
    """

    def _validate_unit_name(
        self,
        dw_db: Session,
        dw_id: str,
        name: str,
        unit_id: Optional[int] = None
    ) -> bool:
        """
        Validate unit name for uniqueness and format requirements.
        
        Validates that the unit name:
        - Is not empty or whitespace
        - Does not exceed 128 characters
        - Is unique across all units (excluding current unit for updates)
        
        Args:
            dw_db: Datawarehouse database session
            name: Unit name to validate
            unit_id: Current unit ID (for update operations, to exclude from uniqueness check)
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If validation fails with specific error codes:
                - UNIT_NAME_REQUIRED: Name is empty
                - UNIT_NAME_TOO_LONG: Name exceeds 128 characters
                - UNIT_NAME_EXISTS: Name already exists
        """
        if not name or not name.strip():
            raise ValueError("UNIT_NAME_REQUIRED: Unit name is required")
        
        if len(name) > 128:
            raise ValueError("UNIT_NAME_TOO_LONG: Unit name must be 128 characters or less")
        
        # Check uniqueness across all locale tables (stored values use lang prefix)
        for lang_code in get_dw_language_codes(dw_id):
            UnitModel = Unit(lang_code)
            query = dw_db.query(UnitModel).filter(UnitModel.unit_name == apply_lang_prefix(name.strip()))
            if unit_id:
                query = query.filter(UnitModel.unit_nid != unit_id)
            existing = query.first()
            if existing:
                raise Conflict("Unit name already exists", error_code="UNIT_NAME_EXISTS")
        
        return True
    
    def _validate_unit_gid(
        self,
        dw_db: Session,
        gid: str,
        unit_id: Optional[int] = None
    ) -> bool:
        """
        Validate unit GID (Global Identifier) for format and uniqueness.
        
        Validates that the unit GID:
        - Does not exceed 60 characters
        - Matches the allowed pattern (alphanumeric, $, @, _, -, {, })
        - Is unique across all units (excluding current unit for updates)
        
        Args:
            dw_db: Datawarehouse database session
            gid: GID to validate
            unit_id: Current unit ID (for update operations, to exclude from uniqueness check)
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If validation fails with specific error codes:
                - UNIT_GID_TOO_LONG: GID exceeds 60 characters
                - UNIT_GID_INVALID: GID contains invalid characters
                - UNIT_GID_EXISTS: GID already exists
        """
        if len(gid) > 60:
            raise ValueError("UNIT_GID_TOO_LONG: Unit GID must be 60 characters or less")
        
        if not validate_unit_gid_guid(gid):
            raise ValueError(
                "UNIT_GID_INVALID: Unit GID contains invalid characters; allowed: letters, numbers, and $ @ _ - { }"
            )
        
        # Locale-only schema: check uniqueness in default locale table
        UnitDefaultModel = Unit(get_default_locale(dw_db))
        query = dw_db.query(UnitDefaultModel).filter(UnitDefaultModel.unit_gid == gid)
        if unit_id:
            query = query.filter(UnitDefaultModel.unit_nid != unit_id)
        
        existing = query.first()
        if existing:
            raise Conflict(f"Unit GID '{gid}' already exists", error_code="UNIT_GID_EXISTS")
        
        return True
    
    def _create_unit_in_session(
        self,
        dw_db: Session,
        dw_id: str,
        unit_data: UnitCreateSchema,
        language_code: str,
    ) -> int:
        """
        Create a single unit in the given session (no commit).
        Caller must commit. Used by create_unit and create_units_batch.
        Returns unit_nid.
        """
        self._validate_unit_name(dw_db, dw_id, unit_data.unit_name)

        unit_gid = unit_data.unit_gid
        if not unit_gid:
            unit_gid = generate_guid()
        else:
            self._validate_unit_gid(dw_db, unit_gid)

        validate_selectable_unit_format_code(unit_data.unit_format)

        UnitDefaultModel = Unit(get_default_locale(dw_db))
        existing_unit = dw_db.query(UnitDefaultModel).filter(
            UnitDefaultModel.unit_gid == unit_gid
        ).first()

        if existing_unit:
            unit_id = existing_unit.unit_nid
            logger.info(f"Unit with GID '{unit_gid}' exists (ID: {unit_id}), adding translation for '{language_code}'")
        else:
            max_nid = dw_db.query(func.max(UnitDefaultModel.unit_nid)).scalar()
            unit_id = (max_nid or 0) + 1
            logger.info(f"Creating new unit with ID: {unit_id} (locale-only schema)")

        for lang_code in get_dw_language_codes(dw_id):
            UnitModel = Unit(lang_code)
            existing_unit = dw_db.query(UnitModel).filter(
                UnitModel.unit_nid == unit_id
            ).first()
            name_val = value_for_locale(unit_data.unit_name, lang_code, language_code)
            unit_format = unit_data.unit_format
            if existing_unit:
                existing_unit.unit_name = name_val
                existing_unit.unit_gid = unit_gid
                existing_unit.unit_global = unit_data.unit_global or False
                existing_unit.unit_format = unit_format
                logger.info(f"Updated locale record for unit {unit_id} with locale '{lang_code}'")
            else:
                unit_record = UnitModel(
                    unit_nid=unit_id,
                    unit_name=name_val,
                    unit_gid=unit_gid,
                    unit_global=unit_data.unit_global or False,
                    unit_format=unit_format,
                )
                dw_db.add(unit_record)
                logger.info(f"Created locale record for unit {unit_id} with locale '{lang_code}'")

        return unit_id

    def create_unit(
        self,
        dw_id: str,
        unit_data: UnitCreateSchema,
        language_code: str = 'en'
    ) -> Dict[str, Any]:
        """
        Create a new unit in the datawarehouse with i18n support.
        
        Creates a new unit with internationalization support. If a unit
        with the same unit_gid already exists, it will add/update the
        translation for the specified language instead of creating a duplicate.
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            unit_data: Unit data to create (UnitCreateSchema)
            language_code: Language code for translations (default: 'en')
            
        Returns:
            Dictionary with created/updated unit data including all related information
            
        Raises:
            ValueError: If validation fails (name or GID)
        """
        logger.info(f"Creating unit '{unit_data.unit_name}' in warehouse '{dw_id}' with language '{language_code}'")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Validate unit name using ORM
            self._validate_unit_name(dw_db, dw_id, unit_data.unit_name)
            
            # Generate GID if not provided
            unit_gid = unit_data.unit_gid
            if not unit_gid:
                unit_gid = generate_guid()
            else:
                # Validate GID if provided using ORM
                self._validate_unit_gid(dw_db, unit_gid)

            validate_selectable_unit_format_code(unit_data.unit_format)
            
            # Locale-only schema: check if unit_gid exists in default locale table; else get next unit_nid
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            existing_unit = dw_db.query(UnitDefaultModel).filter(
                UnitDefaultModel.unit_gid == unit_gid
            ).first()
            
            if existing_unit:
                unit_id = existing_unit.unit_nid
                logger.info(f"Unit with GID '{unit_gid}' exists (ID: {unit_id}), adding translation for '{language_code}'")
            else:
                max_nid = dw_db.query(func.max(UnitDefaultModel.unit_nid)).scalar()
                unit_id = (max_nid or 0) + 1
                logger.info(f"Creating new unit with ID: {unit_id} (locale-only schema)")
            
            # Create or update locale records for ALL registered languages
            for lang_code in get_dw_language_codes(dw_id):
                UnitModel = Unit(lang_code)
                existing_unit = dw_db.query(UnitModel).filter(
                    UnitModel.unit_nid == unit_id
                ).first()
                name_val = value_for_locale(unit_data.unit_name, lang_code, language_code)
                unit_format = unit_data.unit_format
                if existing_unit:
                    existing_unit.unit_name = name_val
                    existing_unit.unit_gid = unit_gid
                    existing_unit.unit_global = unit_data.unit_global or False
                    existing_unit.unit_format = unit_format
                    logger.info(f"Updated locale record for unit {unit_id} with locale '{lang_code}'")
                else:
                    unit_record = UnitModel(
                        unit_nid=unit_id,
                        unit_name=name_val,
                        unit_gid=unit_gid,
                        unit_global=unit_data.unit_global or False,
                        unit_format=unit_format,
                    )
                    dw_db.add(unit_record)
                    logger.info(f"Created locale record for unit {unit_id} with locale '{lang_code}'")
            
            dw_db.commit()

        return self.get_unit_by_id(dw_id, unit_id, language_code)

    def create_units_batch(
        self,
        dw_id: str,
        items: List[UnitCreateSchema],
        language_code: str = 'en',
    ) -> Dict[str, Any]:
        """
        Create multiple units with partial-success support.
        Each item is committed independently; failures are collected in errors.
        Returns dict with created (list of result dicts) and errors (list of {index, error} dicts).
        """
        if not items:
            return {"created": [], "errors": []}
        logger.info(f"Creating {len(items)} unit(s) in warehouse '{dw_id}' with language '{language_code}'")

        created = []
        errors = []
        for idx, unit_data in enumerate(items):
            with get_warehouse_session_from_id(dw_id) as dw_db:
                try:
                    unit_id = self._create_unit_in_session(dw_db, dw_id, unit_data, language_code)
                    dw_db.commit()
                    result = self.get_unit_by_id(dw_id, unit_id, language_code)
                    if result:
                        created.append(result)
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

        return {"created": created, "errors": errors}

    def get_unit_by_id(
        self,
        dw_id: str,
        unit_id: int,
        language_code: str = 'en'
    ) -> Optional[Dict[str, Any]]:
        """
        Get a unit by ID with i18n support.
        
        Retrieves a complete unit record including:
        - Base unit information
        - i18n translation data for the specified language
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            unit_id: Unit NID to retrieve
            language_code: Language code for translations (default: 'en')
            
        Returns:
            Dictionary with complete unit data, or None if unit not found
        """
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Locale-only schema: get unit from default locale table
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            unit = dw_db.query(UnitDefaultModel).filter(
                UnitDefaultModel.unit_nid == unit_id
            ).first()
            
            if not unit:
                return None
            
            UnitModel = Unit(language_code)
            unit_record = dw_db.query(UnitModel).filter(
                UnitModel.unit_nid == unit_id
            ).first()
            return UnitResponseSchema.from_record(unit, locale_record=unit_record, locale=language_code)
    
    def get_unit_nid_by_gid(
        self,
        dw_id: str,
        unit_gid: str
    ) -> Optional[int]:
        """
        Resolve unit GID to unit NID (numeric ID).
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            unit_gid: Unit GID (global identifier string)
            
        Returns:
            Unit NID if found, None otherwise
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            unit = dw_db.query(UnitDefaultModel).filter(
                UnitDefaultModel.unit_gid == unit_gid
            ).first()
            return unit.unit_nid if unit else None
    
    def get_unit_by_gid(
        self,
        dw_id: str,
        unit_gid: str,
        language_code: str = 'en'
    ) -> Optional[Dict[str, Any]]:
        """
        Get a unit by GID with i18n support.
        
        Resolves GID to NID and returns the same data as get_unit_by_id.
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            unit_gid: Unit GID (global identifier string)
            language_code: Language code for translations (default: 'en')
            
        Returns:
            Dictionary with unit data, or None if unit not found
        """
        unit_nid = self.get_unit_nid_by_gid(dw_id, unit_gid)
        if unit_nid is None:
            return None
        return self.get_unit_by_id(dw_id, unit_nid, language_code)
    
    def get_all_units(
        self,
        dw_id: str,
        page: int = 1,
        page_size: Optional[int] = 10,
        language_code: str = 'en',
        sort_order: str = 'asc',
        sort_field: str = 'u_nid',
        search: Optional[str] = None,
        search_by: Optional[str] = None,
        filter_global: Optional[bool] = None,
    ) -> Tuple[List[Dict[str, Any]], int, int]:
        """
        Get all units with pagination, sorting, search, filter and i18n support.

        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            page: Page number (1-based)
            page_size: Number of records per page
            language_code: Language code for translations (default: 'en')
            sort_order: 'asc' or 'desc'
            sort_field: 'u_nid', 'u_name', or 'u_gid'
            search: Optional search string (requires search_by u_name or u_gid when non-empty)
            search_by: 'u_name' or 'u_gid' when search is non-empty
            filter_global: Optional filter by u_is_global (True/False)

        Returns:
            Tuple of (list of unit dicts, total_count without filters, filtered_count)
        """
        use_pagination = page_size is not None
        if use_pagination:
            page_size = max(1, min(page_size, 1000))
            skip = (page - 1) * page_size

        with get_warehouse_session_from_id(dw_id) as dw_db:
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            UnitModel = Unit(language_code)
            UnitLangAlias = aliased(UnitModel)
            base_query = dw_db.query(UnitDefaultModel).select_from(UnitDefaultModel).outerjoin(
                UnitLangAlias,
                UnitDefaultModel.unit_nid == UnitLangAlias.unit_nid
            )
            filter_query = base_query
            if search and search.strip():
                if search_by not in ("u_name", "u_gid"):
                    raise ValueError("search_by must be u_name or u_gid when search is provided")
                pattern = f"%{search.strip()}%"
                if search_by == "u_name":
                    filter_query = filter_query.filter(UnitLangAlias.unit_name.ilike(pattern))
                else:
                    filter_query = filter_query.filter(UnitDefaultModel.unit_gid.ilike(pattern))
            if filter_global is not None:
                filter_query = filter_query.filter(UnitDefaultModel.unit_global == filter_global)

            total_count = dw_db.query(UnitDefaultModel).count()
            filtered_count = filter_query.distinct().count()

            order_column = UnitDefaultModel.unit_nid
            if sort_field == 'u_name':
                order_column = UnitDefaultModel.unit_name
            elif sort_field == 'u_gid':
                order_column = UnitDefaultModel.unit_gid
            if sort_order and sort_order.lower() == 'desc':
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()

            if use_pagination:
                units = (
                    filter_query.distinct()
                    .order_by(order_column)
                    .offset(skip)
                    .limit(page_size)
                    .all()
                )
            else:
                units = (
                    filter_query.distinct()
                    .order_by(order_column)
                    .all()
                )

            result = []
            for unit in units:
                unit_record = dw_db.query(UnitModel).filter(
                    UnitModel.unit_nid == unit.unit_nid
                ).first()
                result.append(
                    UnitResponseSchema.from_record(unit, locale_record=unit_record, locale=language_code)
                )

            return result, total_count, filtered_count

    def get_all_units_for_export(
        self,
        dw_id: str,
        language_code: str = 'en',
        sort_order: str = 'asc',
        sort_field: str = 'u_nid',
        search: Optional[str] = None,
        search_by: Optional[str] = None,
        filter_global: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get all units (no pagination) for export with same sort/filter as list.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            UnitModel = Unit(language_code)
            UnitLangAlias = aliased(UnitModel)
            base_query = dw_db.query(UnitDefaultModel).select_from(UnitDefaultModel).outerjoin(
                UnitLangAlias,
                UnitDefaultModel.unit_nid == UnitLangAlias.unit_nid
            )
            filter_query = base_query
            if search and search.strip():
                if search_by not in ("u_name", "u_gid"):
                    raise ValueError("search_by must be u_name or u_gid when search is provided")
                pattern = f"%{search.strip()}%"
                if search_by == "u_name":
                    filter_query = filter_query.filter(UnitLangAlias.unit_name.ilike(pattern))
                else:
                    filter_query = filter_query.filter(UnitDefaultModel.unit_gid.ilike(pattern))
            if filter_global is not None:
                filter_query = filter_query.filter(UnitDefaultModel.unit_global == filter_global)
            order_column = UnitDefaultModel.unit_nid
            if sort_field == 'u_name':
                order_column = UnitDefaultModel.unit_name
            elif sort_field == 'u_gid':
                order_column = UnitDefaultModel.unit_gid
            if sort_order and sort_order.lower() == 'desc':
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()
            units = (
                filter_query.distinct()
                .order_by(order_column)
                .all()
            )
            result = []
            for unit in units:
                unit_record = dw_db.query(UnitModel).filter(
                    UnitModel.unit_nid == unit.unit_nid
                ).first()
                result.append(
                    UnitResponseSchema.from_record(unit, locale_record=unit_record, locale=language_code)
                )
            return result

    def update_unit(
        self,
        dw_id: str,
        unit_id: int,
        unit_data: UnitUpdateSchema,
        language_code: str = 'en'
    ) -> Optional[Dict[str, Any]]:
        """
        Update a unit with i18n support.
        
        Partially updates an existing unit. Only provided fields will be updated.
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            unit_id: Unit NID to update
            unit_data: Updated unit data (UnitUpdateSchema with optional fields)
            language_code: Language code for translations (default: 'en')
            
        Returns:
            Dictionary with updated unit data, or None if unit not found
            
        Raises:
            ValueError: If validation fails (name or GID)
        """
        logger.info(f"Updating unit ID {unit_id} in warehouse '{dw_id}' with language '{language_code}'")
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Locale-only schema: get unit from default locale table
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            unit = dw_db.query(UnitDefaultModel).filter(
                UnitDefaultModel.unit_nid == unit_id
            ).first()
            
            if not unit:
                logger.warning(f"Unit {unit_id} not found for update")
                return None
            
            if unit_data.unit_name is not None:
                self._validate_unit_name(dw_db, dw_id, unit_data.unit_name, unit_id)
            if unit_data.unit_gid is not None:
                self._validate_unit_gid(dw_db, unit_data.unit_gid, unit_id)

            if unit_data.unit_format is not None:
                validate_selectable_unit_format_code(unit_data.unit_format)

            payload = unit_data.model_dump(exclude_none=True)
            apply_locale_update(dw_db, dw_id, Unit, "unit_nid", unit_id, payload, language_code)
            
            dw_db.commit()
            logger.info(f"Unit {unit_id} updated successfully")
            return self.get_unit_by_id(dw_id, unit_id, language_code)
    
    _CASCADE_CHUNK_SIZE = 500

    def get_association_counts(
        self,
        dw_id: str,
        unit_nids: List[int],
        language_code: Optional[str] = None,
    ) -> Dict[str, int]:
        """
        Return association counts for the given units (for delete confirmation).
        Counts data rows (ut_data) and IUS rows (indicator-unit-subgroup) linked to those units.
        Raises ValueError with message "Unit(s) not found: ..." if any requested unit_nid does not exist.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            if not unit_nids:
                data_count = dw_db.query(func.count(Data.data_nid)).scalar() or 0
                ius_count = dw_db.query(func.count(IndicatorUnitSubgroup.iusnid)).scalar() or 0
                return {ASSOC_DATA_ROWS: data_count, ASSOC_IUS_ROWS: ius_count}

            UnitDefaultModel = Unit(get_default_locale(dw_db))
            existing = dw_db.query(UnitDefaultModel.unit_nid).filter(
                UnitDefaultModel.unit_nid.in_(unit_nids)
            ).all()
            existing_nids = {r[0] for r in existing}
            missing = set(unit_nids) - existing_nids
            if missing:
                raise NotFound(f"Unit(s) not found: {', '.join(str(n) for n in sorted(missing))}")

            data_count = (
                dw_db.query(func.count(Data.data_nid))
                .filter(Data.unit_nid.in_(unit_nids))
                .scalar() or 0
            )
            ius_count = (
                dw_db.query(func.count(IndicatorUnitSubgroup.iusnid))
                .filter(IndicatorUnitSubgroup.unit_nid.in_(unit_nids))
                .scalar() or 0
            )
            return {ASSOC_DATA_ROWS: data_count, ASSOC_IUS_ROWS: ius_count}

    def _delete_unit_in_session(
        self,
        dw_db: Session,
        dw_id: str,
        unit_id: int,
    ) -> bool:
        """
        Cascade-delete a single unit within an existing session (no commit).
        Caller must commit. Used by delete_unit and multiple_delete.
        """
        default_loc = get_default_locale(dw_db)
        UnitDefault = Unit(default_loc)
        unit_entity = (
            dw_db.query(UnitDefault).filter(UnitDefault.unit_nid == unit_id).first()
        )

        # 1) Delete fact data (ut_data) where unit_nid = unit_id (chunked)
        data_nids = [
            row[0]
            for row in dw_db.query(Data.data_nid).filter(Data.unit_nid == unit_id).all()
        ]
        for i in range(0, len(data_nids), self._CASCADE_CHUNK_SIZE):
            chunk = data_nids[i : i + self._CASCADE_CHUNK_SIZE]
            dw_db.query(Data).filter(Data.data_nid.in_(chunk)).delete(
                synchronize_session=False
            )
        if data_nids:
            buffer_delete_step(
                dw_db,
                module="data",
                description=f"Cascade deleted {len(data_nids)} ut_data row(s) for unit_nid={unit_id}",
                previous_value={"unit_nid": unit_id, **deleted_ids_preview(data_nids)},
            )
        dw_db.flush()

        # 2) Fetch IUS rows for this unit
        ius_rows = dw_db.query(IndicatorUnitSubgroup.iusnid).filter(
            IndicatorUnitSubgroup.unit_nid == unit_id
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

        # 3) Delete IC_IUS where iusnid IN (ius_nids) (chunked)
        for i in range(0, len(ius_nids), self._CASCADE_CHUNK_SIZE):
            chunk = ius_nids[i : i + self._CASCADE_CHUNK_SIZE]
            dw_db.query(IcIus).filter(IcIus.iusnid.in_(chunk)).delete(
                synchronize_session=False
            )
        if ius_nids:
            buffer_delete_step(
                dw_db,
                module="ic_ius",
                description=f"Cascade deleted ut_ic_ius links for {len(ius_nids)} IUS (unit_nid={unit_id})",
                previous_value={
                    "unit_nid": unit_id,
                    "linked_ius": deleted_ids_preview(ius_nids),
                    "deleted_ic_ius": deleted_ids_preview(ic_ius_pks),
                },
            )
        dw_db.flush()

        # 4) Delete validation/metadata reports (ut_metadatareport_* by target_nid) for all locales
        deleted_meta_by_locale: Dict[str, int] = {}
        for lang_code in get_dw_language_codes(dw_id):
            MetadataReportModel = MetadataReport(lang_code)
            deleted_meta = dw_db.query(MetadataReportModel).filter(
                MetadataReportModel.target_nid == unit_id
            ).delete(synchronize_session=False)
            if deleted_meta:
                logger.info(f"Cascade deleted {deleted_meta} metadata report(s) for unit {unit_id} (locale {lang_code})")
                deleted_meta_by_locale[str(lang_code)] = int(deleted_meta)
        if deleted_meta_by_locale:
            buffer_delete_step(
                dw_db,
                module="metadata_report",
                identifier=str(unit_id),
                description=(
                    f"Cascade deleted {sum(deleted_meta_by_locale.values())} metadata report row(s) "
                    f"for unit_nid={unit_id} (locale tables)"
                ),
                previous_value={
                    "target_nid": unit_id,
                    "deleted_by_locale": deleted_meta_by_locale,
                },
            )
        dw_db.flush()

        # 5) Delete IUS rows for this unit
        deleted_ius = dw_db.query(IndicatorUnitSubgroup).filter(
            IndicatorUnitSubgroup.unit_nid == unit_id
        ).delete(synchronize_session=False)
        if deleted_ius:
            buffer_delete_step(
                dw_db,
                module="indicator_unit_subgroup",
                description=f"Cascade deleted {deleted_ius} IUS record(s) for unit nid={unit_id}",
                previous_value={"unit_nid": unit_id, **deleted_ids_preview(ius_nids)},
            )
        dw_db.flush()

        # 6) Delete locale unit records (locale-only schema: no base table)
        for lang_code in get_dw_language_codes(dw_id):
            UnitModel = Unit(lang_code)
            dw_db.query(UnitModel).filter(UnitModel.unit_nid == unit_id).delete(
                synchronize_session=False
            )
        unit_prev: Dict[str, Any]
        if unit_entity is not None:
            unit_prev = snapshot_entity_for_audit(unit_entity)
        else:
            unit_prev = {"unit_nid": unit_id, "note": "unit row not found in default locale before delete"}
        buffer_manual_audit(
            dw_db,
            action="DELETE",
            module="unit",
            identifier=str(unit_id),
            description=f"Deleted unit nid={unit_id} with cascade data, IUS, and metadata rows",
            previous_value=unit_prev,
        )
        dw_db.flush()

        return True

    def delete_unit(
        self,
        dw_id: str,
        unit_id: int,
        language_code: str = 'en'
    ) -> bool:
        """
        Delete a unit with cascade cleanup in order:
        ut_data (unit_nid) -> IC_IUS (iusnid in deleted IUS) -> IUS (unit_nid) -> locale unit -> base unit.
        Deletions are chunked where needed to avoid DB parameter limits.
        """
        logger.info(f"Deleting unit ID {unit_id} from warehouse '{dw_id}' (cascade)")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            unit = dw_db.query(UnitDefaultModel).filter(UnitDefaultModel.unit_nid == unit_id).first()
            if not unit:
                logger.warning(f"Unit {unit_id} not found for deletion")
                return False
            self._delete_unit_in_session(dw_db, dw_id, unit_id)
            dw_db.commit()
            logger.info(f"Unit {unit_id} deleted successfully (cascade)")

        notify_dbmetadata_counts_changed(dw_id)
        return True

    def multiple_delete(
        self,
        dw_id: str,
        unit_nids: List[int],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete multiple units by unit_nid with partial-success support.
        Returns deleted nids, aggregated data/ius deleted counts, and per-item errors.
        """
        if not unit_nids:
            return {"deleted": [], "data_rows_deleted": 0, "ius_deleted": 0, "errors": []}

        with get_warehouse_session_from_id(dw_id) as dw_db:
            deleted = []
            errors = []
            total_data = 0
            total_ius = 0
            for idx, unit_id in enumerate(unit_nids):
                UnitDefaultModel = Unit(get_default_locale(dw_db))
                unit = dw_db.query(UnitDefaultModel).filter(UnitDefaultModel.unit_nid == unit_id).first()
                if not unit:
                    errors.append({"index": idx, "error": f"Unit with nid '{unit_id}' not found"})
                    continue
                try:
                    data_before = (
                        dw_db.query(func.count(Data.data_nid)).filter(Data.unit_nid == unit_id).scalar() or 0
                    )
                    ius_before = (
                        dw_db.query(func.count(IndicatorUnitSubgroup.iusnid))
                        .filter(IndicatorUnitSubgroup.unit_nid == unit_id)
                        .scalar() or 0
                    )
                    if self._delete_unit_in_session(dw_db, dw_id, unit_id):
                        deleted.append(unit_id)
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

    def count_units(
        self,
        dw_id: str
    ) -> int:
        """
        Count total units in the datawarehouse.
        
        Returns the total number of units in the specified warehouse.
        This count includes all units regardless of language.
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            
        Returns:
            Total count of units in the warehouse
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            return dw_db.query(UnitDefaultModel).count()

