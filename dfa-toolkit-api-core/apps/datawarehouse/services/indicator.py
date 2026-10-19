"""
Indicator service for CRUD operations on indicator table with i18n support
Uses SQLAlchemy ORM with temporary sessions for dynamic warehouse connections
"""
import logging
from io import BytesIO
from typing import List, Optional, Dict, Any, Tuple, Type, Set
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, or_

from apps.shared.config.config import settings
from apps.shared.exceptions import Conflict, NotFound

from apps.datawarehouse.schemas.indicator import (
    IndicatorCreateSchema,
    IndicatorUpdateSchema,
    IndicatorResponseSchema,
    MetadataItemSchema,
)
from apps.datawarehouse.schemas.unit import UnitResponseSchema
from apps.datawarehouse.schemas.sg_vals import SgValResponseSchema
from apps.datawarehouse.schemas.indicator_classification import IndicatorClassificationResponseSchema
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.utils.validators import (
    validate_guid,
    generate_guid,
)
from apps.datawarehouse.models.datawarehouse import (
    IndicatorUnitSubgroup,
    IcIus,
    Data,
    Indicator,
    Unit,
    SubgroupVal,
    IndicatorClassification,
    MetadataReport,
    MetadataCategory,
    get_default_locale,
)
from apps.datawarehouse.constants import (
    IC_TYPE_ALLOWED_FOR_IC_API,
    ASSOC_DATA_COUNT,
    ASSOC_IUS_COUNT,
)
from apps.datawarehouse.utils.meta_response import filter_meta_entity_fields
from apps.datawarehouse.services.ius import IusService
from apps.datawarehouse.services.formula_service import FormulaService
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix
from apps.datawarehouse.utils.audit_events import (
    buffer_delete_step,
    buffer_manual_audit,
    deleted_ids_preview,
    snapshot_entity_for_audit,
)
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_INDICATOR_SERVICE_SOURCE = "apps.datawarehouse.services.indicator"


def _normalize_default_sg_gids_from_payload(obj: Any) -> List[str]:
    """Merge default_sg_gids and default_sg_gid from create/update schema into unique ordered GID strings."""
    out: List[str] = []
    raw_list = getattr(obj, "default_sg_gids", None)
    if raw_list:
        for x in raw_list:
            if x is None:
                continue
            s = str(x).strip()
            if s and s not in out:
                out.append(s)
    single = getattr(obj, "default_sg_gid", None)
    if single is not None:
        s = str(single).strip()
        if s and s not in out:
            out.append(s)
    return out


def _finalize_s_gid_unit_config(cfg: Dict[str, Any]) -> None:
    """Sort sg_gid and normalize default_sg_gids after lists are finalized (no default_sg_gid in API output).
    When ius_nid is present with the same length as sg_gid, sort (sg_gid, ius_nid) pairs by sg_gid."""
    sg_list = cfg.get("sg_gid")
    ius_nid_list = cfg.get("ius_nid")
    if isinstance(sg_list, list):
        if isinstance(ius_nid_list, list) and len(ius_nid_list) == len(sg_list):
            pairs = sorted(zip(sg_list, ius_nid_list), key=lambda x: x[0])
            cfg["sg_gid"] = [p[0] for p in pairs]
            cfg["ius_nid"] = [p[1] for p in pairs]
        else:
            cfg["sg_gid"] = sorted(sg_list)
            if ius_nid_list is not None:
                cfg.pop("ius_nid", None)
    dfl = cfg.get("default_sg_gids")
    if not isinstance(dfl, list):
        dfl = []
    cfg["default_sg_gids"] = list(dfl)
    cfg.pop("default_sg_gid", None)


class IndicatorService:
    """
    Service for indicator CRUD operations with dynamic database connections and i18n support.
    """
    _CASCADE_CHUNK_SIZE = 500

    def _validate_indicator_name(
        self,
        dw_db: Session,
        dw_id: str,
        name: str,
        indicator_id: Optional[int] = None
    ) -> bool:
        """
        Validate indicator name for uniqueness and format requirements.
        
        Validates that the indicator name:
        - Is not empty or whitespace
        - Does not exceed 255 characters
        - Is unique across all indicators (excluding current indicator for updates)
        
        Args:
            dw_db: Datawarehouse database session
            name: Indicator name to validate
            indicator_id: Current indicator ID (for update operations, to exclude from uniqueness check)
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If validation fails with specific error codes:
                - INDICATOR_NAME_REQUIRED: Name is empty
                - INDICATOR_NAME_TOO_LONG: Name exceeds 255 characters
                - INDICATOR_NAME_EXISTS: Name already exists
        """
        if not name or not name.strip():
            raise ValueError("INDICATOR_NAME_REQUIRED: Indicator name is required")
        
        if len(name) > 255:
            raise ValueError("INDICATOR_NAME_TOO_LONG: Indicator name must be 255 characters or less")
        
        # Check uniqueness across all locale tables (stored values use lang prefix)
        for lang_code in get_dw_language_codes(dw_id):
            IndicatorModel = Indicator(lang_code)
            query = dw_db.query(IndicatorModel).filter(IndicatorModel.indicator_name == apply_lang_prefix(name.strip()))
            if indicator_id:
                query = query.filter(IndicatorModel.indicator_nid != indicator_id)
            existing = query.first()
            if existing:
                raise Conflict("Indicator name already exists", error_code="INDICATOR_NAME_EXISTS")
        
        return True
    
    def _validate_indicator_gid(
        self,
        dw_db: Session,
        gid: str,
        indicator_id: Optional[int] = None
    ) -> bool:
        """
        Validate indicator GID (Global Identifier) for format and uniqueness.
        
        Validates that the indicator GID:
        - Does not exceed 60 characters
        - Matches the allowed pattern (alphanumeric, $, @, _, -, {, }) — same as reference app
        - Is unique across all indicators (excluding current indicator for updates)
        
        Args:
            dw_db: Datawarehouse database session
            gid: GID to validate
            indicator_id: Current indicator ID (for update operations, to exclude from uniqueness check)
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If validation fails with specific error codes:
                - INDICATOR_GID_TOO_LONG: GID exceeds 60 characters
                - INDICATOR_GID_INVALID: GID contains invalid characters
                - INDICATOR_GID_EXISTS: GID already exists
        """
        if len(gid) > 60:
            raise ValueError("INDICATOR_GID_TOO_LONG: Indicator GID must be 60 characters or less")
        
        if not validate_guid(gid):
            raise ValueError(
                "INDICATOR_GID_INVALID: Indicator GID contains invalid characters; allowed: letters, numbers, and $ @ _ - { }"
            )
        
        # Check uniqueness using default locale table (locale-only schema)
        IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
        query = dw_db.query(IndicatorDefaultModel).filter(IndicatorDefaultModel.indicator_gid == gid)
        if indicator_id:
            query = query.filter(IndicatorDefaultModel.indicator_nid != indicator_id)
        
        existing = query.first()
        if existing:
            raise Conflict(f"Indicator GID '{gid}' already exists", error_code="INDICATOR_GID_EXISTS")
        
        return True
    
    def _validate_related_ids(
        self,
        dw_db: Session,
        unit_nids: Optional[List[int]],
        subgroup_val_nids: Optional[List[int]],
        ic_nids: Optional[List[int]],
        language_code: str = 'en'
    ) -> bool:
        """
        Validate that related entity IDs exist in their respective tables.

        Validates the existence of:
        - Unit NIDs in the Unit table
        - Subgroup value NIDs in the SubgroupVal table
        - Indicator Classification NIDs in the IndicatorClassification table

        Args:
            dw_db: Datawarehouse database session
            unit_nids: List of unit NIDs to validate (optional)
            subgroup_val_nids: List of subgroup value NIDs to validate (optional)
            ic_nids: List of Indicator Classification NIDs to validate (optional)
            language_code: Language code for i18n tables (default: 'en')

        Returns:
            True if all provided IDs are valid

        Raises:
            ValueError: If any ID doesn't exist with specific error codes:
                - UNIT_NOT_FOUND: One or more unit_nid values do not exist
                - SUBGROUP_NOT_FOUND: One or more subgroup_val_nid values do not exist
                - IC_NOT_FOUND: One or more Indicator Classification ic_nid values do not exist
        """

        if unit_nids:
            UnitDefaultModel = Unit(get_default_locale(dw_db))
            count = dw_db.query(UnitDefaultModel).filter(
                UnitDefaultModel.unit_nid.in_(unit_nids)
            ).count()

            if count != len(unit_nids):
                raise ValueError(f"UNIT_NOT_FOUND: One or more unit_nid values do not exist")

        if subgroup_val_nids:
            SubgroupValDefaultModel = SubgroupVal(get_default_locale(dw_db))
            count = dw_db.query(SubgroupValDefaultModel).filter(
                SubgroupValDefaultModel.subgroup_val_nid.in_(subgroup_val_nids)
            ).count()

            if count != len(subgroup_val_nids):
                raise ValueError(f"SUBGROUP_NOT_FOUND: One or more subgroup_val_nid values do not exist")

        if ic_nids:
            IndicatorClassificationDefaultModel = IndicatorClassification(get_default_locale(dw_db))
            count = dw_db.query(IndicatorClassificationDefaultModel).filter(
                IndicatorClassificationDefaultModel.ic_nid.in_(ic_nids)
            ).count()

            if count != len(ic_nids):
                raise ValueError(f"IC_NOT_FOUND: One or more Indicator Classification ic_nid values do not exist")

        return True
    
    def _resolve_unit_gids_to_nids(self, dw_db: Session, gids: List[str]) -> List[int]:
        """Resolve unit GIDs to unit NIDs. Raises ValueError if any GID not found."""
        if not gids:
            return []
        UnitDefaultModel = Unit(get_default_locale(dw_db))
        rows = dw_db.query(UnitDefaultModel).filter(UnitDefaultModel.unit_gid.in_(gids)).all()
        found = {r.unit_gid: r.unit_nid for r in rows}
        missing = [g for g in gids if g not in found]
        if missing:
            raise ValueError(f"UNIT_NOT_FOUND: One or more unit_gid values do not exist: {missing}")
        return [found[g] for g in gids]

    def _resolve_subgroup_gids_to_nids(self, dw_db: Session, gids: List[str]) -> List[int]:
        """Resolve subgroup value GIDs to subgroup_val_nids. Raises ValueError if any GID not found."""
        if not gids:
            return []
        SubgroupValDefaultModel = SubgroupVal(get_default_locale(dw_db))
        rows = dw_db.query(SubgroupValDefaultModel).filter(
            SubgroupValDefaultModel.subgroup_val_gid.in_(gids)
        ).all()
        found = {r.subgroup_val_gid: r.subgroup_val_nid for r in rows}
        missing = [g for g in gids if g not in found]
        if missing:
            raise ValueError(f"SUBGROUP_NOT_FOUND: One or more subgroup_gid values do not exist: {missing}")
        return [found[g] for g in gids]

    def _resolve_ic_gids_to_nids(self, dw_db: Session, gids: List[str]) -> List[int]:
        """Resolve IC GIDs to ic_nids. Raises ValueError if any GID not found."""
        if not gids:
            return []
        ICModel = IndicatorClassification(get_default_locale(dw_db))
        rows = dw_db.query(ICModel).filter(ICModel.ic_gid.in_(gids)).all()
        found = {r.ic_gid: r.ic_nid for r in rows}
        missing = [g for g in gids if g not in found]
        if missing:
            raise ValueError(f"IC_NOT_FOUND: One or more ic_gid values do not exist: {missing}")
        return [found[g] for g in gids]

    def _get_default_unit(self, dw_db: Session) -> Optional[int]:
        """
        Get default unit NID. Returns the first unit found in the default locale table.
        """
        UnitDefaultModel = Unit(get_default_locale(dw_db))
        unit = dw_db.query(UnitDefaultModel).first()
        return unit.unit_nid if unit else None
    
    def _get_total_subgroup(self, dw_db: Session) -> Optional[int]:
        """
        Get TOTAL subgroup value NID by looking for subgroup with gid='TOTAL' in default locale table.
        """
        SubgroupValDefaultModel = SubgroupVal(get_default_locale(dw_db))
        subgroup = dw_db.query(SubgroupValDefaultModel).filter(
            SubgroupValDefaultModel.subgroup_val_gid == 'TOTAL'
        ).first()
        return subgroup.subgroup_val_nid if subgroup else None
    
    def _create_ic_ius_relationships(
        self,
        dw_db: Session,
        ius_nids: List[int],
        ic_nid: int
    ) -> None:
        """
        Create IC-IUS (Indicator Classification - IUS) relationships.
        
        Links multiple IUS records to an Indicator Classification.
        Note: IC-IUS tables are not language-specific, use base table name.
        
        Args:
            dw_db: Datawarehouse database session
            ius_nids: List of IUS NIDs to link to the classification
            ic_nid: Indicator Classification NID to link to
        """
        for ius_nid in ius_nids:
            ic_ius = IcIus(
                ic_nid=ic_nid,
                iusnid=ius_nid,
                recommendedsource=False,
                ic_ius_order=None,
                ic_ius_label=None
            )
            dw_db.add(ic_ius)
    
    def _get_existing_ius(
        self,
        dw_db: Session,
        indicator_nid: int
    ) -> List[Dict[str, Any]]:
        """
        Get existing IUS records for an indicator.
        
        Retrieves all IUS (Indicator-Unit-Subgroup) records associated
        with a specific indicator and returns them as dictionaries.
        
        Args:
            dw_db: Datawarehouse database session
            indicator_nid: Indicator NID to lookup IUS records for
            
        Returns:
            List of IUS records as dictionaries with keys:
                - iusnid: IUS record ID
                - unit_nid: Unit NID
                - subgroup_val_nid: Subgroup value NID
                - isdefaultsubgroup: Boolean flag for default subgroup
        """
        ius_records = dw_db.query(IndicatorUnitSubgroup).filter(
            IndicatorUnitSubgroup.indicator_nid == indicator_nid
        ).all()
        
        return [
            {
                'iusnid': ius.iusnid,
                'unit_nid': ius.unit_nid,
                'subgroup_val_nid': ius.subgroup_val_nid,
                'isdefaultsubgroup': ius.isdefaultsubgroup
            }
            for ius in ius_records
        ]

    def _create_indicator_in_session(
        self,
        dw_db: Session,
        dw_id: str,
        indicator_data: IndicatorCreateSchema,
        language_code: str,
    ) -> Tuple[int, List[int]]:
        """
        Create one indicator using an existing session. Does not commit.
        Returns (indicator_nid, list of ius_nids).
        Raises ValueError on validation errors.
        """
        # Validate indicator name using ORM
        self._validate_indicator_name(dw_db, dw_id, indicator_data.indicator_name)

        # Generate GID if not provided
        indicator_gid = indicator_data.indicator_gid
        if not indicator_gid:
            indicator_gid = generate_guid()
        else:
            self._validate_indicator_gid(dw_db, indicator_gid)

        # Resolve IUS: s_gid (unit -> [subgroups]) or legacy unit_gid + subgroup_val_gid (then converted to s_gid for explicit pairs)
        s_gid_raw = getattr(indicator_data, "s_gid", None)
        if s_gid_raw and isinstance(s_gid_raw, dict) and len(s_gid_raw) > 0:
            # Explicit unit -> subgroups mapping; no Cartesian product
            s_gid = {str(k): [x for x in v if x and str(x).strip()] for k, v in s_gid_raw.items() if v}
            s_gid = {k: v for k, v in s_gid.items() if v}
        else:
            u_gids = [x for x in (indicator_data.unit_gid or []) if x and str(x).strip()]
            sg_gids = [x for x in (indicator_data.subgroup_val_gid or []) if x and str(x).strip()]
            if u_gids and sg_gids:
                # Legacy: treat as each unit maps to all subgroups (same as former Cartesian product)
                s_gid = {u: list(sg_gids) for u in u_gids}
            else:
                s_gid = None

        unit_nids = None
        subgroup_val_nids = None
        if s_gid:
            all_u_gids = list(s_gid.keys())
            all_sg_gids = list({sg for sgs in s_gid.values() for sg in sgs})
            unit_nids = self._resolve_unit_gids_to_nids(dw_db, all_u_gids) if all_u_gids else None
            subgroup_val_nids = self._resolve_subgroup_gids_to_nids(dw_db, all_sg_gids) if all_sg_gids else None

        ic_nids = None
        ic_gids = [x for x in (indicator_data.ic_gid or []) if x and str(x).strip()]
        if ic_gids:
            ic_nids = self._resolve_ic_gids_to_nids(dw_db, ic_gids)

        if unit_nids or subgroup_val_nids or ic_nids:
            self._validate_related_ids(
                dw_db,
                unit_nids,
                subgroup_val_nids,
                ic_nids,
                language_code,
            )

        IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
        existing_indicator = dw_db.query(IndicatorDefaultModel).filter(
            IndicatorDefaultModel.indicator_gid == indicator_gid
        ).first()
        if existing_indicator:
            raise Conflict("Indicator already exists", error_code="INDICATOR_ALREADY_EXISTS")

        max_nid = dw_db.query(func.max(IndicatorDefaultModel.indicator_nid)).scalar()
        indicator_id = (max_nid or 0) + 1

        indicator_order = indicator_data.indicator_order
        if indicator_order is None:
            max_order = dw_db.query(func.max(IndicatorDefaultModel.indicator_order)).scalar()
            indicator_order = (max_order or 0) + 1

        logger.info(f"Creating new indicator with ID: {indicator_id} (locale-only schema)")

        # For the request/default locale store text as-is; for other locales use prefix to mark untranslated.
        for lang_code in get_dw_language_codes(dw_id):
            is_request_locale = lang_code == language_code
            IndicatorModel = Indicator(lang_code)
            _name = indicator_data.indicator_name.strip() if indicator_data.indicator_name else ""
            indicator_name_val = _name if is_request_locale else apply_lang_prefix(indicator_data.indicator_name)
            indicator_info_val = (
                (indicator_data.indicator_info if is_request_locale else apply_lang_prefix(indicator_data.indicator_info))
                if indicator_data.indicator_info else None
            )
            short_name_val = (
                (indicator_data.short_name if is_request_locale else apply_lang_prefix(indicator_data.short_name))
                if indicator_data.short_name else None
            )
            keywords_val = (
                (indicator_data.keywords if is_request_locale else apply_lang_prefix(indicator_data.keywords))
                if indicator_data.keywords else None
            )
            indicator_record = IndicatorModel(
                indicator_nid=indicator_id,
                indicator_name=indicator_name_val,
                indicator_gid=indicator_gid,
                indicator_info=indicator_info_val,
                indicator_global=indicator_data.indicator_global or False,
                short_name=short_name_val,
                keywords=keywords_val,
                indicator_order=indicator_order,
                data_exist=indicator_data.data_exist or False,
                highisgood=indicator_data.highisgood or False,
            )
            dw_db.add(indicator_record)

        # Build (unit_nid, subgroup_val_nid) pairs from s_gid (no Cartesian product)
        default_sg_gids_list = _normalize_default_sg_gids_from_payload(indicator_data)
        pairs: List[Tuple[int, int]] = []
        default_subgroup_val_nids: Set[int] = set()

        if s_gid:
            unit_gid_to_nid = {gid: nid for gid, nid in zip(all_u_gids, unit_nids)} if unit_nids else {}
            sg_gid_to_nid = {gid: nid for gid, nid in zip(all_sg_gids, subgroup_val_nids)} if subgroup_val_nids else {}
            for u_gid, sg_gid_list in s_gid.items():
                unit_nid = unit_gid_to_nid.get(u_gid)
                if unit_nid is None:
                    continue
                for sg_gid in sg_gid_list:
                    sg_nid = sg_gid_to_nid.get(sg_gid)
                    if sg_nid is not None:
                        pairs.append((unit_nid, sg_nid))
            if default_sg_gids_list:
                pair_set = set(pairs)
                for u_gid, _sg_list in s_gid.items():
                    u_nid = unit_gid_to_nid.get(u_gid)
                    if u_nid is None:
                        continue
                    for g in default_sg_gids_list:
                        sg_nid = sg_gid_to_nid.get(g)
                        if sg_nid is not None and (u_nid, sg_nid) not in pair_set:
                            pairs.append((u_nid, sg_nid))
                            pair_set.add((u_nid, sg_nid))
                for g in default_sg_gids_list:
                    nid = sg_gid_to_nid.get(g)
                    if nid is not None:
                        default_subgroup_val_nids.add(nid)
            elif pairs and len(pairs) == 1:
                default_subgroup_val_nids = {pairs[0][1]}
        else:
            # No explicit unit/subgroup mapping: do not auto-create IUS (link via IUS API).
            # Exception: legacy create with ic_gid still needs at least one IUS row for IC–IUS links.
            if ic_nids:
                default_unit = self._get_default_unit(dw_db)
                if not default_unit:
                    raise ValueError("DEFAULT_UNIT_NOT_FOUND: No units found in database. Please create at least one unit.")
                total_subgroup = self._get_total_subgroup(dw_db)
                if not total_subgroup:
                    raise NotFound("Subgroup with gid='TOTAL' not found. Please create TOTAL subgroup.", error_code="TOTAL_SUBGROUP_NOT_FOUND")
                pairs = [(default_unit, total_subgroup)]
                default_subgroup_val_nids = {total_subgroup}
            else:
                pairs = []
                default_subgroup_val_nids = set()

        if pairs:
            ius_nids = IusService().create_ius_records_from_pairs(
                dw_db,
                indicator_id,
                pairs,
                default_subgroup_val_nids=default_subgroup_val_nids,
            )
        else:
            ius_nids = []

        if ic_nids and ius_nids:
            for ic_nid in ic_nids:
                self._create_ic_ius_relationships(dw_db, ius_nids, ic_nid)

        return indicator_id, ius_nids

    def create_indicator(
        self,
        dw_id: str,
        indicator_data: IndicatorCreateSchema,
        language_code: str = 'en'
    ) -> Dict[str, Any]:
        """
        Create a new indicator in the datawarehouse with i18n support.
        
        Creates a new indicator with internationalization support. If an indicator
        with the same indicator_gid already exists, it will add/update the
        translation for the specified language instead of creating a duplicate.
        
        The method performs the following operations:
        1. Validates indicator name and GID
        2. Validates related entity IDs (units, subgroup values, IC) - accepts u_gid, sg_gid, ic_gid (lists of GIDs; resolved to NIDs server-side)
        3. Creates or updates base indicator record
        4. Creates or updates i18n translation record
        5. Creates IUS records when unit/subgroup mapping is provided (s_gid or unit_gid+subgroup_val_gid); if omitted, no IUS rows (link via IUS API). Legacy: ic_gid without units still creates a default unit+TOTAL IUS for IC–IUS links.
        6. Creates IC-IUS relationships if provided
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            indicator_data: Indicator data to create (IndicatorCreateSchema)
            language_code: Language code for translations (default: 'en')
            
        Returns:
            Dictionary with filtered indicator data based on configuration
            
        Raises:
            ValueError: If validation fails (name, GID, or related IDs)
        """
        logger.info(f"Creating indicator '{indicator_data.indicator_name}' in warehouse '{dw_id}' with language '{language_code}'")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            indicator_id, ius_nids = self._create_indicator_in_session(dw_db, dw_id, indicator_data, language_code)
            dw_db.commit()

        result, _ = self.get_indicator_by_id(dw_id, indicator_id, language_code, include_gids=True)
        result["iusnid"] = ius_nids
        return result

    def create_indicators_batch(
        self,
        dw_id: str,
        items: List[IndicatorCreateSchema],
        language_code: str = 'en',
    ) -> Dict[str, Any]:
        """
        Create multiple indicators with partial-success support.
        Each item is committed independently; failures are collected in errors.
        Returns dict with created (list of result dicts) and errors (list of {index, error} dicts).
        """
        if not items:
            return {"created": [], "errors": []}

        logger.info(f"Creating {len(items)} indicators in warehouse '{dw_id}' (batch)")

        created = []
        errors = []
        for idx, item in enumerate(items):
            with get_warehouse_session_from_id(dw_id) as dw_db:
                try:
                    indicator_id, ius_nids = self._create_indicator_in_session(dw_db, dw_id, item, language_code)
                    dw_db.commit()
                    result, _ = self.get_indicator_by_id(dw_id, indicator_id, language_code, include_gids=True)
                    if result:
                        result["iusnid"] = ius_nids
                        created.append(result)
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

        if created:
            notify_dbmetadata_counts_changed(dw_id)
        return {"created": created, "errors": errors}

    def _enrich_metadata_with_categories(
        self, dw_db, metadata_records: List[Any], language_code: str
    ) -> List[Dict[str, Any]]:
        """Enrich metadata report records with category; output shape from MetadataItemSchema only."""
        if not metadata_records:
            return []
        MetadataCategoryModel = MetadataCategory(language_code)
        result = []
        for mr in metadata_records:
            category = None
            if mr.category_nid:
                category = dw_db.query(MetadataCategoryModel).filter(
                    MetadataCategoryModel.categorynid == mr.category_nid,
                    MetadataCategoryModel.categorytype == "I",
                ).first()
            item = MetadataItemSchema(
                metadatareport_nid=mr.metadatareport_nid,
                target_nid=mr.target_nid,
                category_nid=mr.category_nid,
                metadata=mr.metadata_text if hasattr(mr, "metadata_text") else getattr(mr, "metadata", None),
                categoryname=category.categoryname if category else None,
                categorygid=category.categorygid if category else None,
                categoryorder=category.categoryorder if category else None,
            )
            result.append(item.model_dump(by_alias=False))
        result.sort(key=lambda x: (x.get("categoryorder") is None, x.get("categoryorder") or 999999))
        return result

    def get_indicator_by_id(
        self,
        dw_id: str,
        indicator_id: int,
        language_code: str = 'en',
        include_gids: bool = False,
        give_ius: bool = False,
        default_subgroup_only: bool = False,
        give_iu_only: bool = False,
        give_ic: bool = False,
        give_metadata: bool = False,
        include_subgroup_compute_formula: bool = False,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Dict[str, Any]]]]:
        """
        Get an indicator by ID with i18n support.

        When give_ius, give_iu_only, or give_ic is True, returns (indicator_dict_with_gids, meta)
        where meta has the same structure as list API (ius, unit, sg, ic keyed by GID).
        When all give_* are False, returns (indicator_dict_minimal, None).
        When include_gids=True (e.g. create flow), populates GIDs and returns (dict, None).

        Returns:
            (indicator_data, meta_or_none). meta is None unless give_ius or give_iu_only or give_ic.
        """

        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
            indicator = dw_db.query(IndicatorDefaultModel).filter(
                IndicatorDefaultModel.indicator_nid == indicator_id
            ).first()

            if not indicator:
                return None, None

            IndicatorModel = Indicator(language_code)
            indicator_record = dw_db.query(IndicatorModel).filter(
                IndicatorModel.indicator_nid == indicator_id
            ).first()

            ius_records = dw_db.query(IndicatorUnitSubgroup).filter(
                IndicatorUnitSubgroup.indicator_nid == indicator_id
            ).all()

            indicator_data = IndicatorResponseSchema.from_record(
                indicator, locale_record=indicator_record, locale=language_code
            )

            need_relations = give_ius or give_iu_only or give_ic
            if need_relations or include_gids:
                unit_nids = list(set([ius.unit_nid for ius in ius_records if ius.unit_nid]))
                default_ius_rows = sorted(
                    [ius for ius in ius_records if getattr(ius, "isdefaultsubgroup", False)],
                    key=lambda x: x.iusnid or 0,
                )
                default_ius = default_ius_rows[0] if default_ius_rows else None
                if default_subgroup_only and give_ius:
                    indicator_data['unit_nid'] = unit_nids
                    def_nids = list(
                        dict.fromkeys(
                            ius.subgroup_val_nid
                            for ius in default_ius_rows
                            if ius.subgroup_val_nid is not None
                        )
                    )
                    if def_nids:
                        indicator_data['default_sg_nid'] = def_nids[0]
                        indicator_data['subgroup_val_nid'] = def_nids
                    else:
                        indicator_data['subgroup_val_nid'] = []
                    if give_ic and ius_records:
                        try:
                            ius_nids = [ius.iusnid for ius in ius_records]
                            IndicatorClassificationDefaultModel = IndicatorClassification(get_default_locale(dw_db))
                            ic_records = dw_db.query(IndicatorClassificationDefaultModel).join(
                                IcIus,
                                IndicatorClassificationDefaultModel.ic_nid == IcIus.ic_nid
                            ).filter(
                                IcIus.iusnid.in_(ius_nids)
                            ).distinct().all()
                            if ic_records:
                                ic_nids = [
                                    ic.ic_nid
                                    for ic in ic_records
                                    if (getattr(ic, "ic_type", None) or "").upper() in IC_TYPE_ALLOWED_FOR_IC_API
                                ]
                                if ic_nids:
                                    indicator_data['ic_nid'] = ic_nids[0] if len(ic_nids) == 1 else ic_nids
                        except Exception as e:
                            logger.debug(f"Could not fetch IC relationships: {str(e)}")
                else:
                    subgroup_val_nids = list(set([ius.subgroup_val_nid for ius in ius_records if ius.subgroup_val_nid]))
                    indicator_data['unit_nid'] = unit_nids
                    indicator_data['subgroup_val_nid'] = subgroup_val_nids
                    if default_ius:
                        indicator_data['default_sg_nid'] = default_ius.subgroup_val_nid
                    if ius_records:
                        indicator_data['iusnid'] = [ius.iusnid for ius in ius_records]
                    if give_ic and ius_records:
                        try:
                            ius_nids = [ius.iusnid for ius in ius_records]
                            IndicatorClassificationDefaultModel = IndicatorClassification(get_default_locale(dw_db))
                            ic_records = dw_db.query(IndicatorClassificationDefaultModel).join(
                                IcIus,
                                IndicatorClassificationDefaultModel.ic_nid == IcIus.ic_nid
                            ).filter(
                                IcIus.iusnid.in_(ius_nids)
                            ).distinct().all()
                            if ic_records:
                                ic_nids = [
                                    ic.ic_nid
                                    for ic in ic_records
                                    if (getattr(ic, "ic_type", None) or "").upper() in IC_TYPE_ALLOWED_FOR_IC_API
                                ]
                                if ic_nids:
                                    indicator_data['ic_nid'] = ic_nids[0] if len(ic_nids) == 1 else ic_nids
                        except Exception as e:
                            logger.debug(f"Could not fetch IC relationships: {str(e)}")

                if need_relations:
                    resolved_list, meta_entities = self._resolve_indicators_to_gids_and_meta(
                        dw_db,
                        dw_id,
                        [indicator_data],
                        [indicator],
                        {indicator_id: ius_records},
                        language_code,
                        default_subgroup_only=default_subgroup_only,
                        include_compute_formula_flags=bool(
                            give_ius
                            and not default_subgroup_only
                            and include_subgroup_compute_formula
                        ),
                        include_ius_nids_in_s_gid=False,
                    )
                    out = resolved_list[0] if resolved_list else indicator_data
                    if default_subgroup_only and give_ius:
                        out.pop("subgroup_gid", None)
                        out.pop("iusnid", None)
                    if give_iu_only and not give_ius:
                        for k in ("subgroup_gid", "default_sg_gid", "ic_gid"):
                            out.pop(k, None)
                    elif give_ic and not give_ius and not give_iu_only:
                        for k in ("unit_gid", "subgroup_gid", "default_sg_gid"):
                            out.pop(k, None)
                    elif not give_ic:
                        out.pop("ic_gid", None)
                    if give_metadata:
                        try:
                            MetadataReportModel = MetadataReport(language_code)
                            metadata_records = dw_db.query(MetadataReportModel).filter(
                                MetadataReportModel.target_nid == indicator_id
                            ).all()
                            if metadata_records:
                                enriched_list = self._enrich_metadata_with_categories(
                                    dw_db, metadata_records, language_code
                                )
                                ser_mode = get_serialization_mode()
                                out["metadata"] = [item["metadatareport_nid"] for item in enriched_list]
                                out["metadata_gid"] = [
                                    str(item.get("categorygid") or item["metadatareport_nid"])
                                    for item in enriched_list
                                ]
                                meta_entities["metadata"] = {
                                    str(item.get("categorygid") or item["metadatareport_nid"]): filter_meta_entity_fields(
                                        MetadataItemSchema.model_validate(item).model_dump(**ser_mode),
                                        "metadata",
                                    )
                                    for item in enriched_list
                                }
                        except Exception as e:
                            logger.debug(f"Could not fetch metadata: {str(e)}")
                    return out, meta_entities

                if include_gids and (unit_nids or subgroup_val_nids or ius_records):
                    UnitModel = Unit(get_default_locale(dw_db))
                    SubgroupValModel = SubgroupVal(get_default_locale(dw_db))
                    ICModel = IndicatorClassification(get_default_locale(dw_db))
                    ind_gid = indicator.indicator_gid or ""
                    unit_rows = dw_db.query(UnitModel).filter(UnitModel.unit_nid.in_(unit_nids)).all() if unit_nids else []
                    unit_gid_by_nid = {r.unit_nid: (r.unit_gid or "") for r in unit_rows}
                    sg_rows = dw_db.query(SubgroupValModel).filter(
                        SubgroupValModel.subgroup_val_nid.in_(subgroup_val_nids)
                    ).all() if subgroup_val_nids else []
                    sg_gid_by_nid = {r.subgroup_val_nid: (r.subgroup_val_gid or "") for r in sg_rows}
                    ic_nids = indicator_data.get("ic_nid")
                    if ic_nids is not None:
                        ic_list = ic_nids if isinstance(ic_nids, list) else [ic_nids]
                        ic_rows = dw_db.query(ICModel).filter(ICModel.ic_nid.in_(ic_list)).all()
                        ic_gid_by_nid = {
                            r.ic_nid: (r.ic_gid or "")
                            for r in ic_rows
                            if (getattr(r, "ic_type", None) or "").upper() in IC_TYPE_ALLOWED_FOR_IC_API
                        }
                    else:
                        ic_gid_by_nid = {}
                        ic_list = []
                    indicator_data['unit_gid'] = [g for nid in unit_nids for g in [unit_gid_by_nid.get(nid, "")] if g]
                    if ius_records:
                        s_gid_map: Dict[str, Dict[str, Any]] = {}
                        for ius in sorted(ius_records, key=lambda x: x.iusnid or 0):
                            u_gid = unit_gid_by_nid.get(ius.unit_nid, "") if ius.unit_nid else ""
                            sg_gid = sg_gid_by_nid.get(ius.subgroup_val_nid, "") if ius.subgroup_val_nid else ""
                            if u_gid and sg_gid:
                                if u_gid not in s_gid_map:
                                    s_gid_map[u_gid] = {"sg_gid": [], "default_sg_gids": []}
                                if sg_gid not in s_gid_map[u_gid]["sg_gid"]:
                                    s_gid_map[u_gid]["sg_gid"].append(sg_gid)
                                if getattr(ius, "isdefaultsubgroup", False) and sg_gid:
                                    dfl = s_gid_map[u_gid]["default_sg_gids"]
                                    if sg_gid not in dfl:
                                        dfl.append(sg_gid)
                        for cfg in s_gid_map.values():
                            _finalize_s_gid_unit_config(cfg)
                        if s_gid_map:
                            indicator_data["s_gid"] = s_gid_map
                    if ic_list:
                        indicator_data['ic_gid'] = [g for nid in ic_list for g in [ic_gid_by_nid.get(nid, "")] if g]
                    else:
                        indicator_data['ic_gid'] = None
            elif not need_relations:
                pass

            meta_entities = None
            if give_metadata:
                try:
                    MetadataReportModel = MetadataReport(language_code)
                    metadata_records = dw_db.query(MetadataReportModel).filter(
                        MetadataReportModel.target_nid == indicator_id
                    ).all()
                    if metadata_records:
                        enriched_list = self._enrich_metadata_with_categories(
                            dw_db, metadata_records, language_code
                        )
                        ser_mode = get_serialization_mode()
                        indicator_data["metadata"] = [
                            item["metadatareport_nid"] for item in enriched_list
                        ]
                        indicator_data["metadata_gid"] = [
                            str(item.get("categorygid") or item["metadatareport_nid"])
                            for item in enriched_list
                        ]
                        meta_entities = {
                            "metadata": {
                                str(item.get("categorygid") or item["metadatareport_nid"]): filter_meta_entity_fields(
                                    MetadataItemSchema.model_validate(item).model_dump(**ser_mode),
                                    "metadata",
                                )
                                for item in enriched_list
                            }
                        }
                except Exception as e:
                    logger.debug(f"Could not fetch metadata: {str(e)}")

            return indicator_data, meta_entities
    
    def get_indicator_nid_by_gid(
        self,
        dw_id: str,
        indicator_gid: str
    ) -> Optional[int]:
        """
        Resolve indicator GID to indicator NID (numeric ID).
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            indicator_gid: Indicator GID (global identifier string)
            
        Returns:
            Indicator NID if found, None otherwise
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
            indicator = dw_db.query(IndicatorDefaultModel).filter(
                IndicatorDefaultModel.indicator_gid == indicator_gid
            ).first()
            return indicator.indicator_nid if indicator else None
    
    def get_indicator_by_gid(
        self,
        dw_id: str,
        indicator_gid: str,
        language_code: str = 'en'
    ) -> Optional[Dict[str, Any]]:
        """
        Get an indicator by GID with i18n support.
        
        Resolves GID to NID and returns the same data as get_indicator_by_id.
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            indicator_gid: Indicator GID (global identifier string)
            language_code: Language code for translations (default: 'en')
            
        Returns:
            Dictionary with filtered indicator data, or None if indicator not found
        """
        indicator_nid = self.get_indicator_nid_by_gid(dw_id, indicator_gid)
        if indicator_nid is None:
            return None
        data, _ = self.get_indicator_by_id(dw_id, indicator_nid, language_code)
        return data

    def _build_indicator_dicts(
        self,
        dw_db: Session,
        indicators: List[Any],
        LocaleModel: Type,
        ius_by_indicator: Dict[int, List[Any]],
        language_code: str,
        give_ius: bool,
        give_iu_only: bool,
        give_ic: bool,
        default_subgroup_only: bool = False,
        include_ius_nids_in_s_gid: bool = False,
        ic_nid_allowlist: Optional[Set[int]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Build list of indicator dicts (internal keys) for a page of indicator ORM rows.
        Used by get_all_indicators and get_indicators_for_ic. Response key mapping
        (internal -> external) is applied by IndicatorResponseSchema + get_serialization_mode in the router.
        When default_subgroup_only is True and give_ius is True, only default_sg_nid and unit_nid are set;
        subgroup_val_nid is set to [default_sg_nid] for meta; iusnid is omitted.
        When include_ius_nids_in_s_gid is True (without give_ius), still populate unit/subgroup NIDs from IUS
        so _resolve_indicators_to_gids_and_meta can build s_gid with per-unit ius_nid lists.
        """
        result = []
        for indicator in indicators:
            locale_record = dw_db.query(LocaleModel).filter(
                LocaleModel.indicator_nid == indicator.indicator_nid
            ).first()
            indicator_dict = IndicatorResponseSchema.from_record(
                indicator, locale_record=locale_record, locale=language_code
            )
            ius_list = ius_by_indicator.get(indicator.indicator_nid, [])
            if (give_ius or include_ius_nids_in_s_gid) and ius_list:
                unit_nids = list(dict.fromkeys([ius.unit_nid for ius in ius_list if ius.unit_nid is not None]))
                default_ius_rows = sorted(
                    [ius for ius in ius_list if getattr(ius, "isdefaultsubgroup", False)],
                    key=lambda x: x.iusnid or 0,
                )
                default_ius = default_ius_rows[0] if default_ius_rows else None
                if default_subgroup_only:
                    indicator_dict["unit_nid"] = unit_nids
                    def_nids = list(
                        dict.fromkeys(
                            ius.subgroup_val_nid
                            for ius in default_ius_rows
                            if ius.subgroup_val_nid is not None
                        )
                    )
                    if def_nids:
                        indicator_dict["default_sg_nid"] = def_nids[0]
                        indicator_dict["subgroup_val_nid"] = def_nids
                    else:
                        indicator_dict["subgroup_val_nid"] = []
                else:
                    subgroup_val_nids = list(dict.fromkeys([ius.subgroup_val_nid for ius in ius_list if ius.subgroup_val_nid is not None]))
                    indicator_dict["unit_nid"] = unit_nids
                    indicator_dict["subgroup_val_nid"] = subgroup_val_nids
                    if default_ius is not None:
                        indicator_dict["default_sg_nid"] = default_ius.subgroup_val_nid
                    indicator_dict["iusnid"] = [ius.iusnid for ius in ius_list if ius.iusnid is not None]
            elif give_iu_only and ius_list:
                unit_nids = list(dict.fromkeys([ius.unit_nid for ius in ius_list if ius.unit_nid is not None]))
                indicator_dict["unit_nid"] = unit_nids
            if give_ic and ius_list:
                ius_nids = [ius.iusnid for ius in ius_list if ius.iusnid is not None]
                if ius_nids:
                    try:
                        DefaultIC = IndicatorClassification(get_default_locale(dw_db))
                        ic_query = (
                            dw_db.query(DefaultIC)
                            .join(IcIus, DefaultIC.ic_nid == IcIus.ic_nid)
                            .filter(IcIus.iusnid.in_(ius_nids))
                        )
                        if ic_nid_allowlist is not None:
                            ic_query = ic_query.filter(DefaultIC.ic_nid.in_(ic_nid_allowlist))
                        ic_records = ic_query.distinct().all()
                        if ic_records:
                            ic_nids = [
                                ic.ic_nid
                                for ic in ic_records
                                if (getattr(ic, "ic_type", None) or "").upper() in IC_TYPE_ALLOWED_FOR_IC_API
                            ]
                            if ic_nids:
                                indicator_dict["ic_nid"] = ic_nids[0] if len(ic_nids) == 1 else ic_nids
                    except Exception:
                        pass
            result.append(indicator_dict)
        return result

    def _resolve_indicators_to_gids_and_meta(
        self,
        dw_db: Session,
        dw_id: str,
        indicator_dicts: List[Dict[str, Any]],
        indicators: List[Any],
        ius_by_indicator: Dict[int, List[Any]],
        language_code: str,
        default_subgroup_only: bool = False,
        include_compute_formula_flags: bool = False,
        include_ius_nids_in_s_gid: bool = False,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
        """
        Replace NID relation fields with GID lists and build meta with full entity info keyed by GID.
        Returns (indicator dicts with unit_gid, s_gid per unit { sg_gid, default_sg_gids }, ic_gid; meta with unit, sg, ic).
        IUS-level Cartesian product (unit|subgroup) is not included in meta.
        No flat subgroup_gid or top-level default; defaults are per unit inside s_gid as default_sg_gids only.
        """
        if not indicator_dicts:
            return [], {"unit": {}, "sg": {}, "ic": {}}

        ind_by_nid = {ind.indicator_nid: ind for ind in indicators}
        default_locale = get_default_locale(dw_db)
        UnitDefaultModel = Unit(default_locale)
        SubgroupValDefaultModel = SubgroupVal(default_locale)
        ICDefaultModel = IndicatorClassification(default_locale)
        UnitLocaleModel = Unit(language_code)
        SubgroupValLocaleModel = SubgroupVal(language_code)
        ICLocaleModel = IndicatorClassification(language_code)

        unit_nids = set()
        subgroup_val_nids = set()
        ic_nids = set()
        for d in indicator_dicts:
            unit_nids.update(d.get("unit_nid") or [])
            subgroup_val_nids.update(d.get("subgroup_val_nid") or [])
            ic_list = d.get("ic_nid")
            if isinstance(ic_list, list):
                ic_nids.update(ic_list)
            elif ic_list is not None:
                ic_nids.add(ic_list)

        unit_default_rows = (
            dw_db.query(UnitDefaultModel).filter(UnitDefaultModel.unit_nid.in_(unit_nids)).all()
            if unit_nids else []
        )
        unit_default_by_nid = {r.unit_nid: r for r in unit_default_rows}
        unit_gid_by_nid = {
            nid: (unit_default_by_nid[nid].unit_gid or "")
            for nid in unit_nids
            if nid in unit_default_by_nid
        }
        unit_locale_by_nid = {
            r.unit_nid: r
            for r in (
                dw_db.query(UnitLocaleModel).filter(UnitLocaleModel.unit_nid.in_(unit_nids)).all()
                if unit_nids
                else []
            )
        }

        sg_default_rows = (
            dw_db.query(SubgroupValDefaultModel)
            .filter(SubgroupValDefaultModel.subgroup_val_nid.in_(subgroup_val_nids))
            .all()
            if subgroup_val_nids
            else []
        )
        sg_default_by_nid = {r.subgroup_val_nid: r for r in sg_default_rows}
        sg_gid_by_nid = {
            nid: (sg_default_by_nid[nid].subgroup_val_gid or "")
            for nid in subgroup_val_nids
            if nid in sg_default_by_nid
        }
        sg_locale_by_nid = {
            r.subgroup_val_nid: r
            for r in (
                dw_db.query(SubgroupValLocaleModel)
                .filter(SubgroupValLocaleModel.subgroup_val_nid.in_(subgroup_val_nids))
                .all()
                if subgroup_val_nids
                else []
            )
        }

        ic_default_rows = (
            dw_db.query(ICDefaultModel).filter(ICDefaultModel.ic_nid.in_(ic_nids)).all()
            if ic_nids
            else []
        )
        ic_default_by_nid = {r.ic_nid: r for r in ic_default_rows}
        ic_gid_by_nid = {
            nid: (ic_default_by_nid[nid].ic_gid or "")
            for nid in ic_nids
            if nid in ic_default_by_nid
            and (getattr(ic_default_by_nid[nid], "ic_type", None) or "").upper()
            in IC_TYPE_ALLOWED_FOR_IC_API
        }
        ic_locale_by_nid = {
            r.ic_nid: r
            for r in (
                dw_db.query(ICLocaleModel).filter(ICLocaleModel.ic_nid.in_(ic_nids)).all()
                if ic_nids
                else []
            )
        }

        meta_unit: Dict[str, Dict[str, Any]] = {}
        meta_sg: Dict[str, Dict[str, Any]] = {}
        meta_ic: Dict[str, Dict[str, Any]] = {}
        ser_mode = get_serialization_mode()

        for nid in unit_nids:
            gid = unit_gid_by_nid.get(nid, "")
            if not gid or gid in meta_unit:
                continue
            r = unit_locale_by_nid.get(nid) or unit_default_by_nid.get(nid)
            if not r:
                continue
            full = UnitResponseSchema.model_validate({
                "unit_nid": r.unit_nid,
                "unit_gid": gid,
                "unit_name": r.unit_name,
                "unit_global": bool(r.unit_global) if r.unit_global is not None else False,
                "unit_format": getattr(r, "unit_format", None),
            }).model_dump(**ser_mode)
            meta_unit[gid] = filter_meta_entity_fields(full, "unit")
        for nid in subgroup_val_nids:
            gid = sg_gid_by_nid.get(nid, "")
            if not gid or gid in meta_sg:
                continue
            r = sg_locale_by_nid.get(nid) or sg_default_by_nid.get(nid)
            if not r:
                continue
            full = SgValResponseSchema.model_validate({
                "subgroup_val_nid": r.subgroup_val_nid,
                "subgroup_val_gid": gid,
                "subgroup_val": getattr(r, "subgroup_val", None),
                "subgroup_val_global": getattr(r, "subgroup_val_global", None),
                "subgroup_val_order": getattr(r, "subgroup_val_order", None),
            }).model_dump(**ser_mode)
            meta_sg[gid] = filter_meta_entity_fields(full, "sg")
        for nid in ic_nids:
            default_r = ic_default_by_nid.get(nid)
            if default_r is None:
                continue
            if (getattr(default_r, "ic_type", None) or "").upper() not in IC_TYPE_ALLOWED_FOR_IC_API:
                continue
            gid = ic_gid_by_nid.get(nid, "")
            if not gid or gid in meta_ic:
                continue
            r = ic_locale_by_nid.get(nid) or default_r
            full = IndicatorClassificationResponseSchema.model_validate({
                "ic_nid": r.ic_nid,
                "ic_gid": gid,
                "ic_name": r.ic_name,
                "ic_parent_nid": getattr(r, "ic_parent_nid", 0),
                "ic_type": (getattr(r, "ic_type", None) or "").upper() or None,
                "ic_short_name": getattr(r, "ic_short_name", None),
                "ic_info": getattr(r, "ic_info", None),
                "ic_global": bool(r.ic_global) if r.ic_global is not None else False,
                "ic_order": getattr(r, "ic_order", None),
            }).model_dump(**ser_mode)
            meta_ic[gid] = filter_meta_entity_fields(full, "ic")

        result = []
        for d in indicator_dicts:
            new_d = {k: v for k, v in d.items() if k not in ("unit_nid", "subgroup_val_nid", "default_sg_nid", "iusnid", "ic_nid")}

            if "unit_nid" in d and d["unit_nid"]:
                gids = [unit_gid_by_nid.get(nid, "") for nid in d["unit_nid"]]
                new_d["unit_gid"] = [g for g in gids if g]
            if "ic_nid" in d and d["ic_nid"]:
                ic_list = d["ic_nid"] if isinstance(d["ic_nid"], list) else [d["ic_nid"]]
                ic_gids = [g for nid in ic_list for g in [ic_gid_by_nid.get(nid, "")] if g]
                new_d["ic_gid"] = ic_gids
            # Subgroups by unit: s_gid only (no flat sg_gid or top-level default). Per unit: sg_gid list + default_sg_gids.
            if "unit_nid" in d and d["unit_nid"]:
                if not default_subgroup_only and "subgroup_val_nid" in d and d["subgroup_val_nid"]:
                    ind_nid = d.get("indicator_nid")
                    ius_list = ius_by_indicator.get(ind_nid, [])
                    if ius_list:
                        s_gid_map: Dict[str, Dict[str, Any]] = {}
                        for ius in sorted(ius_list, key=lambda x: x.iusnid or 0):
                            u_gid = unit_gid_by_nid.get(ius.unit_nid, "") if ius.unit_nid else ""
                            sg_gid = sg_gid_by_nid.get(ius.subgroup_val_nid, "") if ius.subgroup_val_nid else ""
                            if u_gid and sg_gid:
                                if u_gid not in s_gid_map:
                                    entry: Dict[str, Any] = {"sg_gid": [], "default_sg_gids": []}
                                    if include_ius_nids_in_s_gid:
                                        entry["ius_nid"] = []
                                    s_gid_map[u_gid] = entry
                                if sg_gid not in s_gid_map[u_gid]["sg_gid"]:
                                    s_gid_map[u_gid]["sg_gid"].append(sg_gid)
                                    if include_ius_nids_in_s_gid:
                                        s_gid_map[u_gid]["ius_nid"].append(ius.iusnid)
                                if getattr(ius, "isdefaultsubgroup", False) and sg_gid:
                                    dfl = s_gid_map[u_gid]["default_sg_gids"]
                                    if sg_gid not in dfl:
                                        dfl.append(sg_gid)
                        for cfg in s_gid_map.values():
                            _finalize_s_gid_unit_config(cfg)
                        if s_gid_map:
                            if include_compute_formula_flags:
                                ind_row = ind_by_nid.get(d.get("indicator_nid"))
                                i_gid = (
                                    (new_d.get("indicator_gid") or "")
                                    or (getattr(ind_row, "indicator_gid", None) or "")
                                ).strip()
                                if i_gid:
                                    unit_sg = {
                                        u: list(cfg.get("sg_gid") or [])
                                        for u, cfg in s_gid_map.items()
                                    }
                                    by_unit = FormulaService().batch_subgroup_gids_with_compute_formula(
                                        dw_db, dw_id, i_gid, unit_sg
                                    )
                                    for u_gid, cfg in s_gid_map.items():
                                        sg_list = by_unit.get(u_gid, [])
                                        if sg_list:
                                            cfg["sg_gid_with_compute_formula"] = sg_list
                            new_d["s_gid"] = s_gid_map
                elif default_subgroup_only and "subgroup_val_nid" in d and d.get("subgroup_val_nid"):
                    def_nids = d["subgroup_val_nid"]
                    if not isinstance(def_nids, list):
                        def_nids = [def_nids]
                    default_sg_gids = [
                        g for nid in def_nids for g in [sg_gid_by_nid.get(nid, "")] if g
                    ]
                    if default_sg_gids and new_d.get("unit_gid"):
                        ind_nid = d.get("indicator_nid")
                        ius_list_def = ius_by_indicator.get(ind_nid, []) if ind_nid is not None else []
                        u_nid_by_gid = {g: n for n, g in unit_gid_by_nid.items() if g}
                        sg_nid_by_gid: Dict[str, int] = {}
                        for snid, sgid in sg_gid_by_nid.items():
                            if sgid and sgid not in sg_nid_by_gid:
                                sg_nid_by_gid[sgid] = snid
                        sorted_sg = sorted(default_sg_gids)
                        s_gid_default: Dict[str, Dict[str, Any]] = {}
                        for u_gid in new_d["unit_gid"]:
                            unit_entry: Dict[str, Any] = {
                                "sg_gid": list(sorted_sg),
                                "default_sg_gids": list(default_sg_gids),
                            }
                            if include_ius_nids_in_s_gid and ius_list_def:
                                u_nid = u_nid_by_gid.get(u_gid)
                                ius_row_ids: List[int] = []
                                complete = True
                                for sg in sorted_sg:
                                    sg_nid = sg_nid_by_gid.get(sg)
                                    found: Optional[int] = None
                                    if u_nid is not None and sg_nid is not None:
                                        for ius in ius_list_def:
                                            if (
                                                ius.unit_nid == u_nid
                                                and ius.subgroup_val_nid == sg_nid
                                                and ius.iusnid is not None
                                            ):
                                                found = ius.iusnid
                                                break
                                    if found is None:
                                        complete = False
                                        break
                                    ius_row_ids.append(found)
                                if complete and ius_row_ids:
                                    unit_entry["ius_nid"] = ius_row_ids
                            s_gid_default[u_gid] = unit_entry
                        new_d["s_gid"] = s_gid_default
            result.append(new_d)
        return result, {"unit": meta_unit, "sg": meta_sg, "ic": meta_ic}

    def get_all_indicators(
        self,
        dw_id: str,
        page: int = 1,
        page_size: Optional[int] = 10,
        language_code: str = 'en',
        sort_order: str = 'asc',
        sort_field: str = 'i_order',
        give_ius: bool = False,
        default_subgroup_only: bool = False,
        give_iu_only: bool = False,
        give_ic: bool = False,
        give_metadata: bool = False,
        search: Optional[str] = None,
        indicator_nids: Optional[List[int]] = None,
        iusnid_allowlist: Optional[Set[int]] = None,
        ic_nid_allowlist: Optional[Set[int]] = None,
        include_ius_nids_in_s_gid: bool = False,
    ) -> tuple[List[Dict[str, Any]], int, Optional[Dict[str, Any]], Optional[int]]:
        """
        Get all indicators with pagination and i18n support.

        By default only indicator (and locale) table data is returned. Optional flags:
        - give_ius: include full IUS (unit_nid, subgroup_val_nid, default_subgroup_nid, iusnid)
        - include_ius_nids_in_s_gid: add ius_nid list per unit inside s_gid (parallel to sg_gid); does not add meta.subgroup alone
        - default_subgroup_only: when give_ius is True, return only default subgroup id/gid (omit full subgroup list and ius_nid)
        - give_iu_only: include only unit_nid list per indicator
        - give_ic: include ic_nid (Indicator Classification) per indicator
        - give_metadata: include metadata report NIDs/GIDs per indicator and meta.metadata
        - search: search term for indicator name or GID
        - indicator_nids: when provided, return only these indicators (by primary key); order of result matches this list.
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            page: Page number (1-based)
            page_size: Number of records per page
            language_code: Language code for translations (default: 'en')
            sort_order: 'asc' or 'desc'
            sort_field: 'i_order', 'i_name', or 'i_gid' (maps to indicator_order, indicator_name, indicator_gid)
            give_ius: When True, include full IUS data per indicator
            give_iu_only: When True, include only unit_nid list per indicator
            give_ic: When True, include Indicator Classification (ic_nid) per indicator
            include_ius_nids_in_s_gid: When True, each s_gid[unit] includes ius_nid aligned with sg_gid

        Returns:
            Tuple of (list of indicator dicts, filtered total count, meta_entities or None,
            total_count_unfiltered or None).
            When give_ius/give_iu_only/give_ic is True, meta_entities is a dict with keys unit, sg, ic (full entity info by GID).
        """
        use_pagination = page_size is not None and indicator_nids is None
        if use_pagination:
            page_size = max(1, min(page_size, 1000))
            skip = (page - 1) * page_size
        need_ius = give_ius or give_iu_only or give_ic or include_ius_nids_in_s_gid

        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
            # Map external sort_field to model column (default locale table)
            sort_column_map = {
                'i_order': IndicatorDefaultModel.indicator_order,
                'i_name': None,  # locale table
                'i_gid': IndicatorDefaultModel.indicator_gid,
            }
            order_column = sort_column_map.get(sort_field, IndicatorDefaultModel.indicator_order)
            IndicatorModel = Indicator(language_code)
            IndicatorLangAlias = aliased(IndicatorModel)

            query = dw_db.query(IndicatorDefaultModel).select_from(IndicatorDefaultModel).outerjoin(
                IndicatorLangAlias,
                IndicatorDefaultModel.indicator_nid == IndicatorLangAlias.indicator_nid
            )
            has_list_filters = bool(search and search.strip()) or (
                indicator_nids is not None and len(indicator_nids) > 0
            )
            total_count_unfiltered: Optional[int] = (
                dw_db.query(IndicatorDefaultModel).count() if has_list_filters else None
            )

            if sort_field == 'i_name':
                query = query.order_by(
                    IndicatorLangAlias.indicator_name.asc() if sort_order == 'asc' else IndicatorLangAlias.indicator_name.desc()
                )
            else:
                if order_column is not None:
                    query = query.order_by(
                        order_column.asc() if sort_order == 'asc' else order_column.desc()
                    )
                else:
                    query = query.order_by(IndicatorDefaultModel.indicator_nid.asc() if sort_order == 'asc' else IndicatorDefaultModel.indicator_nid.desc())

            if search:
                term = f"%{search.strip()}%"
                query = query.filter(
                    or_(
                        IndicatorLangAlias.indicator_name.ilike(term),
                        IndicatorDefaultModel.indicator_gid.ilike(term),
                    )
                )

            if indicator_nids is not None and len(indicator_nids) > 0:
                query = query.filter(IndicatorDefaultModel.indicator_nid.in_(indicator_nids))

            total_count = query.count()
            if use_pagination:
                indicators = query.offset(skip).limit(page_size).all()
            else:
                indicators = query.all()

            # Batch-fetch IUS for this page when any of give_ius, give_iu_only, give_ic, include_ius_nids_in_s_gid is True
            ius_by_indicator: Dict[int, List[Any]] = {}
            if need_ius and indicators:
                page_nids = [ind.indicator_nid for ind in indicators]
                ius_records = dw_db.query(IndicatorUnitSubgroup).filter(
                    IndicatorUnitSubgroup.indicator_nid.in_(page_nids)
                ).all()
                if iusnid_allowlist is not None:
                    ius_records = [ius for ius in ius_records if ius.iusnid in iusnid_allowlist]
                for ius in ius_records:
                    nid = ius.indicator_nid
                    if nid not in ius_by_indicator:
                        ius_by_indicator[nid] = []
                    ius_by_indicator[nid].append(ius)

            result = self._build_indicator_dicts(
                dw_db, indicators, IndicatorModel, ius_by_indicator,
                language_code, give_ius, give_iu_only, give_ic,
                default_subgroup_only=default_subgroup_only,
                include_ius_nids_in_s_gid=include_ius_nids_in_s_gid,
                ic_nid_allowlist=ic_nid_allowlist,
            )
            meta_entities = None
            if need_ius and result:
                result, meta_entities = self._resolve_indicators_to_gids_and_meta(
                    dw_db,
                    dw_id,
                    result,
                    indicators,
                    ius_by_indicator,
                    language_code,
                    default_subgroup_only=default_subgroup_only,
                    include_compute_formula_flags=False,
                    include_ius_nids_in_s_gid=include_ius_nids_in_s_gid,
                )
            if give_metadata and result:
                try:
                    result_nids = [d.get("indicator_nid") for d in result if d.get("indicator_nid") is not None]
                    if result_nids:
                        MetadataReportModel = MetadataReport(language_code)
                        metadata_records = dw_db.query(MetadataReportModel).filter(
                            MetadataReportModel.target_nid.in_(result_nids)
                        ).all()
                        by_target: Dict[int, List[Any]] = {}
                        for mr in metadata_records:
                            nid = mr.target_nid
                            if nid not in by_target:
                                by_target[nid] = []
                            by_target[nid].append(mr)
                        if meta_entities is None:
                            meta_entities = {}
                        meta_entities["metadata"] = {}
                        ser_mode = get_serialization_mode()
                        for ind_dict in result:
                            ind_nid = ind_dict.get("indicator_nid")
                            records = by_target.get(ind_nid, [])
                            enriched_list = self._enrich_metadata_with_categories(
                                dw_db, records, language_code
                            )
                            if enriched_list:
                                ind_dict["metadata"] = [item["metadatareport_nid"] for item in enriched_list]
                                ind_dict["metadata_gid"] = [
                                    str(item.get("categorygid") or item["metadatareport_nid"])
                                    for item in enriched_list
                                ]
                                for item in enriched_list:
                                    key = str(item.get("categorygid") or item["metadatareport_nid"])
                                    meta_entities["metadata"][key] = filter_meta_entity_fields(
                                        MetadataItemSchema.model_validate(item).model_dump(**ser_mode),
                                        "metadata",
                                    )
                except Exception as e:
                    logger.debug("Could not fetch metadata for list: %s", str(e))
            # Preserve order of requested ids when filtering by indicator_nids
            if indicator_nids is not None and len(indicator_nids) > 0 and result:
                order_by_nid = {nid: i for i, nid in enumerate(indicator_nids)}
                result.sort(key=lambda d: order_by_nid.get(d.get("indicator_nid"), 999999))
            return result, total_count, meta_entities, total_count_unfiltered

    def get_all_indicators_for_export(
        self,
        dw_db: Session,
        language_code: str,
        sort_order: str = "asc",
        sort_field: str = "i_order",
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch all indicators (no pagination) for XLSX export. Caller provides dw_db session."""
        IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
        sort_column_map = {
            "i_order": IndicatorDefaultModel.indicator_order,
            "i_name": None,
            "i_gid": IndicatorDefaultModel.indicator_gid,
        }
        order_column = sort_column_map.get(sort_field, IndicatorDefaultModel.indicator_order)
        IndicatorModel = Indicator(language_code)
        IndicatorLangAlias = aliased(IndicatorModel)
        query = dw_db.query(IndicatorDefaultModel).select_from(IndicatorDefaultModel).outerjoin(
            IndicatorLangAlias,
            IndicatorDefaultModel.indicator_nid == IndicatorLangAlias.indicator_nid,
        )
        if sort_field == "i_name":
            query = query.order_by(
                IndicatorLangAlias.indicator_name.asc() if sort_order == "asc" else IndicatorLangAlias.indicator_name.desc()
            )
        else:
            if order_column is not None:
                query = query.order_by(order_column.asc() if sort_order == "asc" else order_column.desc())
            else:
                query = query.order_by(
                    IndicatorDefaultModel.indicator_nid.asc() if sort_order == "asc" else IndicatorDefaultModel.indicator_nid.desc()
                )
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    IndicatorLangAlias.indicator_name.ilike(term),
                    IndicatorDefaultModel.indicator_gid.ilike(term),
                )
            )
        indicators = query.all()
        result = self._build_indicator_dicts(
            dw_db, indicators, IndicatorModel, {}, language_code, False, False, False
        )
        return result

    def get_indicators_flat_for_export(
        self,
        dw_db: Session,
        language_code: str,
        sort_order: str = "asc",
        sort_field: str = "i_order",
        search: Optional[str] = None,
        indicator_nids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetch all indicators with IUS expansion for XLSX export.
        Returns one flat dict per IUS combination (indicator fields repeated per row).
        Each row includes unit_name, subgroup_val, and concatenated IC names/types for that IUS.
        Indicators with no IUS records produce one row with empty unit/subgroup/IC columns.
        Caller must provide an active dw_db session.
        When indicator_nids is provided, only those indicators are returned (search is ignored).
        """
        default_locale = get_default_locale(dw_db)
        IndicatorDefaultModel = Indicator(default_locale)
        IndicatorLocaleModel = Indicator(language_code)
        IndicatorLangAlias = aliased(IndicatorLocaleModel)

        sort_column_map = {
            "i_order": IndicatorDefaultModel.indicator_order,
            "i_gid": IndicatorDefaultModel.indicator_gid,
        }
        query = (
            dw_db.query(IndicatorDefaultModel)
            .select_from(IndicatorDefaultModel)
            .outerjoin(IndicatorLangAlias, IndicatorDefaultModel.indicator_nid == IndicatorLangAlias.indicator_nid)
        )
        if indicator_nids is not None and len(indicator_nids) > 0:
            query = query.filter(IndicatorDefaultModel.indicator_nid.in_(indicator_nids))
        elif search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    IndicatorLangAlias.indicator_name.ilike(term),
                    IndicatorDefaultModel.indicator_gid.ilike(term),
                )
            )
        if sort_field == "i_name":
            order_col = IndicatorLangAlias.indicator_name
        else:
            order_col = sort_column_map.get(sort_field, IndicatorDefaultModel.indicator_order)
        if sort_order == "desc":
            query = query.order_by(order_col.desc())
        else:
            query = query.order_by(order_col.asc())
        indicators = query.all()
        if not indicators:
            return []

        indicator_nids = [ind.indicator_nid for ind in indicators]

        # Fetch locale names for each indicator using the non-aliased model
        locale_by_nid: Dict[int, Any] = {}
        for r in dw_db.query(IndicatorLocaleModel).filter(
            IndicatorLocaleModel.indicator_nid.in_(indicator_nids)
        ).all():
            locale_by_nid[r.indicator_nid] = r

        # Fetch all IUS records for the indicator set
        ius_records = (
            dw_db.query(IndicatorUnitSubgroup)
            .filter(IndicatorUnitSubgroup.indicator_nid.in_(indicator_nids))
            .all()
        )
        ius_by_indicator: Dict[int, List[Any]] = {}
        for ius in ius_records:
            ius_by_indicator.setdefault(ius.indicator_nid, []).append(ius)

        all_ius_nids = [ius.iusnid for ius in ius_records if ius.iusnid is not None]
        unit_nids = list({ius.unit_nid for ius in ius_records if ius.unit_nid is not None})
        sv_nids = list({ius.subgroup_val_nid for ius in ius_records if ius.subgroup_val_nid is not None})

        # Fetch unit locale data
        UnitModel = Unit(language_code)
        unit_by_nid: Dict[int, Any] = {}
        if unit_nids:
            for r in dw_db.query(UnitModel).filter(UnitModel.unit_nid.in_(unit_nids)).all():
                unit_by_nid[r.unit_nid] = r

        # Fetch subgroup val locale data
        SvModel = SubgroupVal(language_code)
        sv_by_nid: Dict[int, Any] = {}
        if sv_nids:
            for r in dw_db.query(SvModel).filter(SvModel.subgroup_val_nid.in_(sv_nids)).all():
                sv_by_nid[r.subgroup_val_nid] = r

        # Fetch IC associations: ius_nid -> list of IC records
        ius_to_ics: Dict[int, List[Any]] = {}
        if all_ius_nids:
            ICModel = IndicatorClassification(language_code)
            ic_ius_rows = (
                dw_db.query(IcIus.iusnid, ICModel)
                .join(ICModel, ICModel.ic_nid == IcIus.ic_nid)
                .filter(IcIus.iusnid.in_(all_ius_nids))
                .filter(ICModel.ic_type.notin_(["SR"]))
                .all()
            )
            for ius_nid, ic_rec in ic_ius_rows:
                ius_to_ics.setdefault(ius_nid, []).append(ic_rec)

        flat_rows: List[Dict[str, Any]] = []
        for ind in indicators:
            nid = ind.indicator_nid
            locale_rec = locale_by_nid.get(nid)
            indicator_name = (locale_rec.indicator_name if locale_rec else None) or ind.indicator_name or ""
            base = {
                "indicator_nid": nid,
                "indicator_gid": ind.indicator_gid,
                "indicator_name": indicator_name,
                "indicator_order": ind.indicator_order,
                "indicator_global": ind.indicator_global,
                "data_exist": ind.data_exist,
                "highisgood": ind.highisgood,
                "short_name": ind.short_name,
                "keywords": ind.keywords,
            }
            ius_list = ius_by_indicator.get(nid, [])
            if not ius_list:
                row = {**base, "unit_nid": None, "unit_gid": None, "unit_name": None,
                       "subgroup_val_nid": None, "subgroup_val_gid": None, "subgroup_val": None,
                       "ic_names": None, "ic_types": None}
                flat_rows.append(row)
            else:
                for ius in ius_list:
                    u = unit_by_nid.get(ius.unit_nid) if ius.unit_nid else None
                    sv = sv_by_nid.get(ius.subgroup_val_nid) if ius.subgroup_val_nid else None
                    ics = ius_to_ics.get(ius.iusnid, [])
                    # One IUS can link to many ICs; several may share ic_type — export unique
                    # values in first-seen order so columns stay compact but complete for names.
                    ic_names = ", ".join(dict.fromkeys(ic.ic_name for ic in ics if ic.ic_name)) or None
                    ic_types = ", ".join(dict.fromkeys(ic.ic_type for ic in ics if ic.ic_type)) or None
                    row = {
                        **base,
                        "unit_nid": ius.unit_nid,
                        "unit_gid": u.unit_gid if u else None,
                        "unit_name": u.unit_name if u else None,
                        "subgroup_val_nid": ius.subgroup_val_nid,
                        "subgroup_val_gid": sv.subgroup_val_gid if sv else None,
                        "subgroup_val": sv.subgroup_val if sv else None,
                        "ic_names": ic_names,
                        "ic_types": ic_types,
                    }
                    flat_rows.append(row)
        return flat_rows

    def _resolve_ic_identifier_to_ic_nid(self, dw_db: Session, ic_identifier: str) -> Optional[int]:
        """
        Resolve IC identifier (numeric ic_nid or alphanumeric ic_gid) to ic_nid.
        Returns None if not found, identifier is empty, or IC has ic_type SR (SR is a separate module).
        """
        if not ic_identifier or not str(ic_identifier).strip():
            return None
        ic_identifier = str(ic_identifier).strip()
        DefaultIC = IndicatorClassification(get_default_locale(dw_db))
        if ic_identifier.isdigit():
            row = dw_db.query(DefaultIC).filter(DefaultIC.ic_nid == int(ic_identifier)).first()
        else:
            row = dw_db.query(DefaultIC).filter(DefaultIC.ic_gid == ic_identifier).first()
        if not row:
            return None
        if (getattr(row, "ic_type", None) or "").upper() not in IC_TYPE_ALLOWED_FOR_IC_API:
            return None
        return row.ic_nid

    def get_indicators_for_ic(
        self,
        dw_id: str,
        ic_identifier: str,
        page: int = 1,
        page_size: Optional[int] = 10,
        language_code: str = "en",
        sort_order: str = "asc",
        sort_field: str = "i_order",
        give_ius: bool = False,
        give_iu_only: bool = False,
        give_ic: bool = False,
    ) -> Tuple[Optional[List[Dict[str, Any]]], int]:
        """
        Get paginated list of indicators linked to the given indicator classification.

        Args:
            dw_id: Warehouse identifier.
            ic_identifier: ic_nid (numeric) or ic_gid (alphanumeric).
            page: Page number (1-based).
            page_size: Page size.
            language_code: Locale for indicator names.
            sort_order: 'asc' or 'desc'.
            sort_field: 'i_order', 'i_name', or 'i_gid'.
            give_ius: Include full IUS data per indicator.
            give_iu_only: Include only unit_nid list per indicator.
            give_ic: Include ic_nid per indicator.

        Returns:
            (list of indicator dicts, total_count) or (None, 0) when IC not found.
            For valid IC with no linked indicators, returns ([], 0).
        """
        use_pagination = page_size is not None
        if use_pagination:
            page_size = max(1, min(page_size, 1000))
            skip = (page - 1) * page_size
        need_ius = give_ius or give_iu_only or give_ic

        with get_warehouse_session_from_id(dw_id) as dw_db:
            DefaultIndicator = Indicator(get_default_locale(dw_db))
            sort_column_map = {
                "i_order": DefaultIndicator.indicator_order,
                "i_name": None,
                "i_gid": DefaultIndicator.indicator_gid,
            }
            order_column = sort_column_map.get(sort_field, DefaultIndicator.indicator_order)
            ic_nid = self._resolve_ic_identifier_to_ic_nid(dw_db, ic_identifier)
            if ic_nid is None:
                return None, 0

            # Distinct indicator_nids linked to this IC via ut_ic_ius -> ut_indicator_unit_subgroup
            ius_nids_for_ic = (
                dw_db.query(IcIus.iusnid).filter(IcIus.ic_nid == ic_nid, IcIus.iusnid.isnot(None)).all()
            )
            ius_nids_list = [r[0] for r in ius_nids_for_ic if r[0] is not None]
            if not ius_nids_list:
                return [], 0

            indicator_nids_subq = (
                dw_db.query(IndicatorUnitSubgroup.indicator_nid)
                .filter(IndicatorUnitSubgroup.iusnid.in_(ius_nids_list))
                .distinct()
            )
            indicator_nids = [r[0] for r in indicator_nids_subq.all() if r[0] is not None]
            if not indicator_nids:
                return [], 0

            total_count = len(indicator_nids)
            LocaleModel = Indicator(language_code)
            LocaleAlias = aliased(LocaleModel)

            query = (
                dw_db.query(DefaultIndicator)
                .select_from(DefaultIndicator)
                .outerjoin(
                    LocaleAlias,
                    DefaultIndicator.indicator_nid == LocaleAlias.indicator_nid,
                )
                .filter(DefaultIndicator.indicator_nid.in_(indicator_nids))
            )

            if sort_field == "i_name":
                query = query.order_by(
                    LocaleAlias.indicator_name.asc()
                    if sort_order == "asc"
                    else LocaleAlias.indicator_name.desc()
                )
            else:
                if order_column is not None:
                    query = query.order_by(
                        order_column.asc() if sort_order == "asc" else order_column.desc()
                    )
                else:
                    query = query.order_by(
                        DefaultIndicator.indicator_nid.asc()
                        if sort_order == "asc"
                        else DefaultIndicator.indicator_nid.desc()
                    )

            if use_pagination:
                indicators = query.offset(skip).limit(page_size).all()
            else:
                indicators = query.all()

            ius_by_indicator: Dict[int, List[Any]] = {}
            if need_ius and indicators:
                page_nids = [ind.indicator_nid for ind in indicators]
                ius_records = dw_db.query(IndicatorUnitSubgroup).filter(
                    IndicatorUnitSubgroup.indicator_nid.in_(page_nids)
                ).all()
                for ius in ius_records:
                    nid = ius.indicator_nid
                    if nid not in ius_by_indicator:
                        ius_by_indicator[nid] = []
                    ius_by_indicator[nid].append(ius)

            result = self._build_indicator_dicts(
                dw_db, indicators, LocaleModel, ius_by_indicator,
                language_code, give_ius, give_iu_only, give_ic,
            )
            return result, total_count

    def update_indicator(
        self,
        dw_id: str,
        indicator_id: int,
        indicator_data: IndicatorUpdateSchema,
        language_code: str = 'en'
    ) -> Optional[Dict[str, Any]]:
        """
        Update an indicator with i18n support.
        
        Partially updates an existing indicator. Only provided fields will be updated.
        The method handles:
        - Base indicator field updates
        - i18n translation updates/creation
        - IUS record management (add/remove combinations)
        - IC-IUS relationship updates
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            indicator_id: Indicator NID to update
            indicator_data: Updated indicator data (IndicatorUpdateSchema with optional fields)
            language_code: Language code for translations (default: 'en')
            
        Returns:
            Dictionary with filtered indicator data based on configuration, or None if indicator not found
            
        Raises:
            ValueError: If validation fails (name, GID, or related IDs)
        """
        logger.info(f"Updating indicator ID {indicator_id} in warehouse '{dw_id}' with language '{language_code}'")
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Locale-only schema: get indicator from default locale table
            IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
            indicator = dw_db.query(IndicatorDefaultModel).filter(
                IndicatorDefaultModel.indicator_nid == indicator_id
            ).first()
            
            if not indicator:
                logger.warning(f"Indicator {indicator_id} not found for update")
                return None
            
            # Validate indicator name if provided
            if indicator_data.indicator_name is not None:
                self._validate_indicator_name(dw_db, dw_id, indicator_data.indicator_name, indicator_id)
            
            # Validate GID if provided
            if indicator_data.indicator_gid is not None:
                self._validate_indicator_gid(dw_db, indicator_data.indicator_gid, indicator_id)

            # Resolve IUS: s_gid (unit -> [subgroups]) or legacy unit_gid + subgroup_val_gid
            s_gid_raw = getattr(indicator_data, "s_gid", None)
            s_gid = None
            if s_gid_raw and isinstance(s_gid_raw, dict) and len(s_gid_raw) > 0:
                s_gid = {str(k): [x for x in v if x and str(x).strip()] for k, v in s_gid_raw.items() if v}
                s_gid = {k: v for k, v in s_gid.items() if v}
                # Client sent unit keys but every subgroup list was empty (or whitespace-only).
                # Link each unit with default subgroup TOTAL — same expectation as indicator create.
                if not s_gid:
                    s_gid = {str(k): ["TOTAL"] for k in s_gid_raw.keys()}
            if s_gid is None:
                u_gids = [x for x in (indicator_data.unit_gid or []) if x and str(x).strip()]
                sg_gids = [x for x in (indicator_data.subgroup_val_gid or []) if x and str(x).strip()]
                s_gid = {u: list(sg_gids) for u in u_gids} if u_gids and sg_gids else None

            unit_nids = None
            subgroup_val_nids = None
            if s_gid:
                all_u_gids_upd = list(s_gid.keys())
                all_sg_gids_upd = list({sg for sgs in s_gid.values() for sg in sgs})
                unit_nids = self._resolve_unit_gids_to_nids(dw_db, all_u_gids_upd) if all_u_gids_upd else None
                subgroup_val_nids = self._resolve_subgroup_gids_to_nids(dw_db, all_sg_gids_upd) if all_sg_gids_upd else None

            default_sg_gids_list = _normalize_default_sg_gids_from_payload(indicator_data)
            default_subgroup_val_nids: Set[int] = set()

            ic_nids = None
            ic_gids = [x for x in (indicator_data.ic_gid or []) if x and str(x).strip()]
            if ic_gids:
                ic_nids = self._resolve_ic_gids_to_nids(dw_db, ic_gids)

            # Validate related IDs if provided
            if unit_nids or subgroup_val_nids or ic_nids:
                self._validate_related_ids(
                    dw_db,
                    unit_nids,
                    subgroup_val_nids,
                    ic_nids,
                    language_code
                )

            # Apply field updates: structural → all locales, locale-specific → requested locale only
            payload = indicator_data.model_dump(exclude_none=True)
            # unit_gid / subgroup_val_gid / ic_gid are schema-only relationship fields,
            # not DB columns. They were already resolved to NIDs above and are used later in
            # the IUS/IC update blocks. Removing them here prevents a no-op loop inside
            # apply_locale_update (the hasattr guard would catch them, but wastes per-locale queries).
            payload.pop("unit_gid", None)
            payload.pop("subgroup_val_gid", None)
            payload.pop("s_gid", None)
            payload.pop("default_sg_gid", None)
            payload.pop("default_sg_gids", None)
            payload.pop("ic_gid", None)
            apply_locale_update(dw_db, dw_id, Indicator, "indicator_nid", indicator_id, payload, language_code)

            # Create locale record for requested language if it does not exist yet
            IndicatorLangModel = Indicator(language_code)
            indicator_record = dw_db.query(IndicatorLangModel).filter(
                IndicatorLangModel.indicator_nid == indicator_id
            ).first()
            if not indicator_record:
                raw_name = (indicator_data.indicator_name or (indicator.indicator_name if hasattr(indicator, 'indicator_name') else '') or '').strip()
                new_indicator_record = IndicatorLangModel(
                    indicator_nid=indicator_id,
                    indicator_name=raw_name,
                    indicator_gid=indicator.indicator_gid,
                    indicator_info=indicator_data.indicator_info if indicator_data.indicator_info else None,
                    indicator_global=indicator.indicator_global,
                    short_name=indicator_data.short_name if indicator_data.short_name else None,
                    keywords=indicator_data.keywords if indicator_data.keywords else None,
                    indicator_order=indicator.indicator_order,
                    data_exist=indicator.data_exist,
                    highisgood=indicator.highisgood,
                )
                dw_db.add(new_indicator_record)
            
            # Handle IUS updates: new_combinations from s_gid (explicit pairs) or legacy Cartesian
            if s_gid and unit_nids is not None and subgroup_val_nids is not None:
                unit_gid_to_nid_upd = {gid: nid for gid, nid in zip(all_u_gids_upd, unit_nids)}
                sg_gid_to_nid_upd = {gid: nid for gid, nid in zip(all_sg_gids_upd, subgroup_val_nids)}
                new_combinations = set()
                for u_gid, sg_gid_list in s_gid.items():
                    unit_nid = unit_gid_to_nid_upd.get(u_gid)
                    if unit_nid is None:
                        continue
                    for sg_gid in sg_gid_list:
                        sg_nid = sg_gid_to_nid_upd.get(sg_gid)
                        if sg_nid is not None:
                            new_combinations.add((unit_nid, sg_nid))
                if default_sg_gids_list:
                    pair_set = set(new_combinations)
                    for u_gid, _sg_list in s_gid.items():
                        unit_nid = unit_gid_to_nid_upd.get(u_gid)
                        if unit_nid is None:
                            continue
                        for g in default_sg_gids_list:
                            sg_nid = sg_gid_to_nid_upd.get(g)
                            if sg_nid is not None and (unit_nid, sg_nid) not in pair_set:
                                new_combinations.add((unit_nid, sg_nid))
                                pair_set.add((unit_nid, sg_nid))
                    for g in default_sg_gids_list:
                        nid = sg_gid_to_nid_upd.get(g)
                        if nid is not None:
                            default_subgroup_val_nids.add(nid)
                elif new_combinations and len(new_combinations) == 1:
                    default_subgroup_val_nids = {next(iter(new_combinations))[1]}
            else:
                new_combinations = None

            if new_combinations is not None:
                # Get existing IUS records using ORM
                existing_ius = self._get_existing_ius(dw_db, indicator_id)

                # Create set of existing combinations
                existing_combinations = {
                    (ius['unit_nid'], ius['subgroup_val_nid']) for ius in existing_ius
                }
                
                # Find IUS to delete (existing but not in new)
                to_delete = existing_combinations - new_combinations
                ius_to_delete = [
                    ius['iusnid'] for ius in existing_ius
                    if (ius['unit_nid'], ius['subgroup_val_nid']) in to_delete
                ]
                
                if ius_to_delete:
                    IusService()._cascade_delete_ius_nids(dw_db, ius_to_delete)
                    logger.info(
                        "Cascade-deleted %d IUS record(s) for indicator %s during s_gid sync",
                        len(ius_to_delete),
                        indicator_id,
                    )
                
                # Find IUS to create (new but not in existing)
                to_create = list(new_combinations - existing_combinations)
                new_ius_nids = []
                if to_create:
                    new_ius_nids = IusService().create_ius_records_from_pairs(
                        dw_db,
                        indicator_id,
                        to_create,
                        default_subgroup_val_nids=default_subgroup_val_nids,
                    )
                    logger.info(f"Created {len(new_ius_nids)} new IUS records for indicator {indicator_id}")

                # Set isdefaultsubgroup on all IUS for this indicator: True for default_subgroup_val_nids, False otherwise
                all_ius_rows = dw_db.query(IndicatorUnitSubgroup).filter(
                    IndicatorUnitSubgroup.indicator_nid == indicator_id
                ).all()
                for row in all_ius_rows:
                    row.isdefaultsubgroup = row.subgroup_val_nid in default_subgroup_val_nids

                # Update IC-IUS relationships if ic_nids list is provided
                if ic_nids:
                    # Get all IUS NIDs that will exist after update (kept + new)
                    kept_ius_nids = [ius['iusnid'] for ius in existing_ius if (ius['unit_nid'], ius['subgroup_val_nid']) in new_combinations]
                    all_ius_nids = kept_ius_nids + new_ius_nids

                    if all_ius_nids:
                        # Delete existing IC-IUS relationships for all IUS of this indicator using ORM
                        all_current_ius = self._get_existing_ius(dw_db, indicator_id)
                        all_current_ius_nids = [ius['iusnid'] for ius in all_current_ius]

                        if all_current_ius_nids:
                            dw_db.query(IcIus).filter(
                                IcIus.iusnid.in_(all_current_ius_nids)
                            ).delete(synchronize_session=False)

                        # Create new relationships for each IC using ORM
                        for ic_nid in ic_nids:
                            self._create_ic_ius_relationships(
                                dw_db,
                                all_ius_nids,
                                ic_nid
                            )
                        logger.info(f"Updated IC-IUS relationships for indicator {indicator_id} with ICs {ic_nids}")
            elif default_sg_gids_list:
                # Only default subgroup GID(s) provided: update isdefaultsubgroup on existing IUS rows
                default_nids = self._resolve_subgroup_gids_to_nids(dw_db, default_sg_gids_list)
                default_subgroup_val_nid_set = set(default_nids)
                all_ius_rows = dw_db.query(IndicatorUnitSubgroup).filter(
                    IndicatorUnitSubgroup.indicator_nid == indicator_id
                ).all()
                for row in all_ius_rows:
                    row.isdefaultsubgroup = row.subgroup_val_nid in default_subgroup_val_nid_set
                logger.info(
                    f"Updated default subgroups for indicator {indicator_id} to subgroup_val_nids={sorted(default_subgroup_val_nid_set)}"
                )
            elif ic_nids:
                # Only ic_nids provided: update IC-IUS for existing IUS
                existing_ius = self._get_existing_ius(dw_db, indicator_id)
                all_ius_nids = [ius['iusnid'] for ius in existing_ius]
                if all_ius_nids:
                    dw_db.query(IcIus).filter(
                        IcIus.iusnid.in_(all_ius_nids)
                    ).delete(synchronize_session=False)
                    for ic_nid in ic_nids:
                        self._create_ic_ius_relationships(
                            dw_db,
                            all_ius_nids,
                            ic_nid
                        )
                    logger.info(f"Updated IC-IUS relationships for indicator {indicator_id} with ICs {ic_nids}")

            dw_db.commit()
            logger.info(f"Indicator {indicator_id} updated successfully")
            data, _ = self.get_indicator_by_id(dw_id, indicator_id, language_code)
            # Echo back default subgroup fields when sent in the request
            if getattr(indicator_data, "default_sg_gid", None) is not None:
                data["default_sg_gid"] = indicator_data.default_sg_gid
            if getattr(indicator_data, "default_sg_gids", None) is not None:
                data["default_sg_gids"] = indicator_data.default_sg_gids
            return data

    def delete_indicator(
        self,
        dw_id: str,
        indicator_id: int,
        language_code: str = 'en'
    ) -> bool:
        """
        Delete an indicator with full cascade (on confirmed delete).

        Cascade order:
        1. Delete fact rows from ut_data (by indicator_nid), chunked
        2. Delete ut_ic_ius mappings for this indicator's IUS, chunked
        3. Delete validation/metadata reports (ut_metadatareport_* by target_nid) for all locales
        4. Delete IUS records (ut_indicator_unit_subgroup by indicator_nid)
        5. Delete locale indicator records (i18n)

        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            indicator_id: Indicator NID to delete
            language_code: Language code for context (default: 'en')

        Returns:
            True if deleted successfully, False if indicator not found
        """
        logger.info(f"Deleting indicator ID {indicator_id} from warehouse '{dw_id}' (cascade)")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
            indicator = dw_db.query(IndicatorDefaultModel).filter(
                IndicatorDefaultModel.indicator_nid == indicator_id
            ).first()

            if not indicator:
                logger.warning(f"Indicator {indicator_id} not found for deletion")
                return False

            # 1) Delete fact rows from ut_data (by indicator_nid), chunked
            data_nids = [
                row[0]
                for row in dw_db.query(Data.data_nid).filter(
                    Data.indicator_nid == indicator_id
                ).all()
            ]
            for i in range(0, len(data_nids), self._CASCADE_CHUNK_SIZE):
                chunk = data_nids[i : i + self._CASCADE_CHUNK_SIZE]
                dw_db.query(Data).filter(Data.data_nid.in_(chunk)).delete(
                    synchronize_session=False
                )
            if data_nids:
                logger.info(f"Cascade deleted {len(data_nids)} ut_data row(s) for indicator {indicator_id}")
                buffer_delete_step(
                    dw_db,
                    module="data",
                    description=f"Cascade deleted {len(data_nids)} ut_data row(s) for indicator_nid={indicator_id}",
                    previous_value={
                        "indicator_nid": indicator_id,
                        **deleted_ids_preview(data_nids),
                    },
                )
            dw_db.flush()

            # 2) Get IUS nids for this indicator, then delete ut_ic_ius mappings (chunked)
            ius_rows = dw_db.query(IndicatorUnitSubgroup.iusnid).filter(
                IndicatorUnitSubgroup.indicator_nid == indicator_id
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
                logger.info(f"Cascade deleted ut_ic_ius mappings for {len(ius_nids)} IUS for indicator {indicator_id}")
                buffer_delete_step(
                    dw_db,
                    module="ic_ius",
                    description=f"Cascade deleted ut_ic_ius links for {len(ius_nids)} IUS (indicator_nid={indicator_id})",
                    previous_value={
                        "indicator_nid": indicator_id,
                        "linked_ius": deleted_ids_preview(ius_nids),
                        "deleted_ic_ius": deleted_ids_preview(ic_ius_pks),
                    },
                )
            dw_db.flush()

            # 3) Delete validation/metadata reports (ut_metadatareport_* by target_nid) for all locales
            deleted_meta_by_locale: Dict[str, int] = {}
            for lang_code in get_dw_language_codes(dw_id):
                MetadataReportModel = MetadataReport(lang_code)
                deleted_meta = dw_db.query(MetadataReportModel).filter(
                    MetadataReportModel.target_nid == indicator_id
                ).delete(synchronize_session=False)
                if deleted_meta:
                    logger.info(f"Cascade deleted {deleted_meta} metadata report(s) for indicator {indicator_id} (locale {lang_code})")
                    deleted_meta_by_locale[str(lang_code)] = int(deleted_meta)
            if deleted_meta_by_locale:
                buffer_delete_step(
                    dw_db,
                    module="metadata_report",
                    identifier=str(indicator_id),
                    description=(
                        f"Cascade deleted {sum(deleted_meta_by_locale.values())} metadata report row(s) "
                        f"for indicator_nid={indicator_id} (locale tables)"
                    ),
                    previous_value={
                        "target_nid": indicator_id,
                        "deleted_by_locale": deleted_meta_by_locale,
                    },
                )
            dw_db.flush()

            # 4) Delete IUS records (ut_indicator_unit_subgroup by indicator_nid)
            deleted_ius = dw_db.query(IndicatorUnitSubgroup).filter(
                IndicatorUnitSubgroup.indicator_nid == indicator_id
            ).delete(synchronize_session=False)
            if deleted_ius:
                logger.info(f"Cascade deleted {deleted_ius} IUS record(s) for indicator {indicator_id}")
                buffer_delete_step(
                    dw_db,
                    module="indicator_unit_subgroup",
                    description=f"Cascade deleted {deleted_ius} IUS record(s) for indicator_nid={indicator_id}",
                    previous_value={
                        "indicator_nid": indicator_id,
                        **deleted_ids_preview(ius_nids),
                    },
                )
            dw_db.flush()

            # 5) Delete locale indicator records (i18n)
            for lang_code in get_dw_language_codes(dw_id):
                IndicatorModel = Indicator(lang_code)
                dw_db.query(IndicatorModel).filter(
                    IndicatorModel.indicator_nid == indicator_id
                ).delete(synchronize_session=False)
            buffer_manual_audit(
                dw_db,
                action="DELETE",
                module="indicator",
                identifier=str(indicator_id),
                description=f"Deleted indicator nid={indicator_id} with cascade IUS, metadata, and data rows",
                previous_value=snapshot_entity_for_audit(indicator),
            )

            dw_db.commit()
            logger.info(f"Indicator {indicator_id} deleted successfully (cascade)")

        notify_dbmetadata_counts_changed(dw_id)
        return True

    def multiple_delete_indicators(
        self,
        dw_id: str,
        indicator_nids: List[int],
        language_code: str = "en",
    ) -> Dict[str, Any]:
        """
        Delete multiple indicators by NID with full cascade each (separate transaction per indicator).
        Continues on partial failure; returns deleted NIDs and per-item errors.
        """
        deleted: List[int] = []
        errors: List[Dict[str, Any]] = []
        seen: Set[int] = set()
        ordered_unique: List[int] = []
        for nid in indicator_nids:
            if nid in seen:
                continue
            seen.add(nid)
            ordered_unique.append(nid)
        for idx, nid in enumerate(ordered_unique):
            try:
                ok = self.delete_indicator(dw_id, nid, language_code)
                if ok:
                    deleted.append(nid)
                else:
                    errors.append(
                        {
                            "index": idx,
                            "indicator_nid": nid,
                            "error": f"Indicator {nid} not found",
                        }
                    )
            except Exception as e:
                log_background_incident(
                    message=f"multiple_delete_indicators item failed for nid={nid}",
                    error_code="INDICATOR_MULTIPLE_DELETE_ITEM_FAILED",
                    exc=e,
                    source=_INDICATOR_SERVICE_SOURCE,
                )
                errors.append(
                    {
                        "index": idx,
                        "indicator_nid": nid,
                        "error": str(e),
                    }
                )
        if deleted:
            notify_dbmetadata_counts_changed(dw_id)
        return {"deleted": deleted, "errors": errors}

    def count_indicators(
        self,
        dw_id: str
    ) -> int:
        """
        Count total indicators in the datawarehouse.
        
        Returns the total number of indicators in the specified warehouse.
        This count includes all indicators regardless of language.
        
        Args:
            dw_id: Warehouse identifier (can be ID or database name)
            
        Returns:
            Total count of indicators in the warehouse
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
            return dw_db.query(IndicatorDefaultModel).count()

    def get_association_counts(
        self,
        dw_id: str,
        indicator_nids: List[int],
    ) -> Dict[str, int]:
        """
        Return association counts for the given indicators (for delete confirmation).
        Counts data rows (ut_data) and IUS rows (ut_indicator_unit_subgroup) linked to those indicator_nids.
        Raises ValueError with message "Indicator(s) not found: ..." if any requested indicator_nid does not exist.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            if not indicator_nids:
                data_count = dw_db.query(func.count(Data.data_nid)).scalar() or 0
                ius_count = dw_db.query(func.count(IndicatorUnitSubgroup.iusnid)).scalar() or 0
                return {ASSOC_DATA_COUNT: data_count, ASSOC_IUS_COUNT: ius_count}
            IndicatorDefaultModel = Indicator(get_default_locale(dw_db))
            existing = (
                dw_db.query(IndicatorDefaultModel.indicator_nid)
                .filter(IndicatorDefaultModel.indicator_nid.in_(indicator_nids))
                .all()
            )
            existing_nids = {r[0] for r in existing}
            missing = set(indicator_nids) - existing_nids
            if missing:
                raise ValueError(
                    f"Indicator(s) not found: {', '.join(str(n) for n in sorted(missing))}"
                )

            data_count = (
                dw_db.query(func.count(Data.data_nid))
                .filter(Data.indicator_nid.in_(indicator_nids))
                .scalar() or 0
            )
            ius_count = (
                dw_db.query(func.count(IndicatorUnitSubgroup.iusnid))
                .filter(IndicatorUnitSubgroup.indicator_nid.in_(indicator_nids))
                .scalar() or 0
            )
            return {ASSOC_DATA_COUNT: data_count, ASSOC_IUS_COUNT: ius_count}


def build_indicators_export_xlsx(
    dw_db: Session,
    language_code: str,
    db_connection_display_name: str,
    sort_order: str = "asc",
    sort_field: str = "i_order",
    search: Optional[str] = None,
) -> Tuple[BytesIO, str]:
    """
    Build XLSX export for all indicators. Caller must validate DW and pass active dw_db session.
    Returns (xlsx_stream, filename).
    """
    from apps.datawarehouse.utils.export_utils import build_simple_xlsx, make_export_filename
    service = IndicatorService()
    dicts = service.get_all_indicators_for_export(
        dw_db, language_code, sort_order=sort_order, sort_field=sort_field, search=search
    )
    headers = [
        "indicator_nid", "indicator_gid", "indicator_name", "indicator_order",
        "indicator_global", "data_exist", "highisgood", "short_name", "keywords", "locale",
    ]
    rows = [
        [
            d.get("indicator_nid"),
            d.get("indicator_gid"),
            d.get("indicator_name"),
            d.get("indicator_order"),
            d.get("indicator_global"),
            d.get("data_exist"),
            d.get("highisgood"),
            d.get("short_name"),
            d.get("keywords"),
            d.get("locale", ""),
        ]
        for d in dicts
    ]
    output = build_simple_xlsx("Indicators", headers, rows)
    filename = make_export_filename("INDICATORS", db_connection_display_name)
    return output, filename

