"""
Service for retrieving indicator metadata including metadata categories and unit-subgroupval combinations.

This service uses dynamic locale model resolution via mixin classes defined in
datawarehouse.py (e.g. Indicator(locale)). Locale-specific models are built from
those mixins with __table_prefix__ and the locale suffix.
"""
import logging
from typing import Optional, Dict, Any, List
from sqlalchemy import func

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import NotFound
from apps.datawarehouse.models.datawarehouse import (
    Indicator,
    MetadataReport,
    MetadataCategory,
    get_default_locale,
)
from apps.datawarehouse.schemas.indicator_metadata import IndicatorInfoSchema
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_INDICATOR_METADATA_SOURCE = "apps.datawarehouse.services.indicator_metadata"


class IndicatorMetadataService:
    """Service for indicator metadata operations."""
    
    def get_indicator_metadata(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get indicator metadata including categories and unit-subgroupval combinations.
        
        Args:
            dw_id: Data warehouse identifier
            identifier: Indicator identifier (numeric nid or alphanumeric gid)
            language_code: Language code for locale-specific data
        
        Returns:
            Dict with indicator info, metadata categories, and unit-subgroupval list
        """
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            # Resolve identifier to indicator_nid
            indicator_nid = self._resolve_indicator_identifier(dw_db, identifier)
            if indicator_nid is None:
                return None
            
            # Get indicator basic info
            IndicatorModel = Indicator(language_code)
            indicator = dw_db.query(IndicatorModel).filter(
                IndicatorModel.indicator_nid == indicator_nid
            ).first()
            
            if not indicator:
                return None
            
            # Get metadata reports with categories
            metadata_list = self._get_metadata_with_categories(
                dw_db, indicator_nid, language_code
            )
            data = IndicatorInfoSchema.from_record(indicator)
            data["meta_data"] = metadata_list
            return data
    
    def _resolve_indicator_identifier(self, dw_db, identifier: str) -> Optional[int]:
        """Resolve indicator identifier (nid or gid) to indicator_nid."""
        if identifier.isdigit():
            return int(identifier)
        else:
            DefaultIndicator = Indicator(get_default_locale(dw_db))
            ind = dw_db.query(DefaultIndicator).filter(
                DefaultIndicator.indicator_gid == identifier
            ).first()
            return ind.indicator_nid if ind else None
    
    def _get_metadata_with_categories(
        self, dw_db, indicator_nid: int, language_code: str
    ) -> List[Dict[str, Any]]:
        """Get metadata reports with category details for an indicator."""
        MetadataReportLocale = MetadataReport(language_code)
        MetadataCategoryLocale = MetadataCategory(language_code)
        
        # Query metadata reports for this indicator
        reports = dw_db.query(MetadataReportLocale).filter(
            MetadataReportLocale.target_nid == indicator_nid
        ).all()
        
        result = []
        for report in reports:
            if report.category_nid:
                # Get category details
                category = dw_db.query(MetadataCategoryLocale).filter(
                    MetadataCategoryLocale.categorynid == report.category_nid,
                    MetadataCategoryLocale.categorytype == 'I'  # Only indicator categories
                ).first()
                
                if category:
                    result.append({
                        "categorygid": category.categorygid,
                        "categoryname": category.categoryname,
                        "categorynid": category.categorynid,
                        "description": report.metadata_text or "",
                        "categoryorder": category.categoryorder,
                    })
        
        # Sort by category order
        result.sort(key=lambda x: x.get("categoryorder") or 999999)
        return result
    
    def _resolve_category_gid_to_nid(
        self, dw_db, category_gid: str, language_code: str
    ) -> Optional[int]:
        """
        Resolve metadata category GID to category_nid.
        
        Args:
            dw_db: Database session
            category_gid: Metadata category GID
            language_code: Language code for locale-specific category model
        
        Returns:
            category_nid if found, None otherwise
        """
        MetadataCategoryLocale = MetadataCategory(language_code)
        category = dw_db.query(MetadataCategoryLocale).filter(
            MetadataCategoryLocale.categorygid == category_gid
        ).first()
        return category.categorynid if category else None
    
    def update_indicator_metadata(
        self,
        dw_id: str,
        identifier: str,
        update_items: List[Dict[str, Any]],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update indicator metadata for specified categories.
        
        Args:
            dw_id: Data warehouse identifier
            identifier: Indicator identifier (numeric nid or alphanumeric gid)
            update_items: List of update items, each with 'mt_catg_gid' (metadata category GID) and 'metadata_text' (internal keys)
            language_code: Language code for locale-specific data
        
        Returns:
            Dict with updated_count, deleted_count, and errors list
        
        Raises:
            ValueError: If indicator not found, category not found, or validation fails
        """
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            # Resolve identifier to indicator_nid
            indicator_nid = self._resolve_indicator_identifier(dw_db, identifier)
            if indicator_nid is None:
                raise NotFound(f"Indicator not found: {identifier}")
            
            # Get locale-specific models
            MetadataReportLocale = MetadataReport(language_code)
            DefaultMetadataReport = MetadataReport(get_default_locale(dw_db))
            # Allocate new metadatareport_nid once per INSERT batch item. Re-querying max() inside
            # the loop returns the same value until flush/commit, so multiple new categories in one
            # save would reuse one nid and hit PRIMARY duplicate on ut_metadatareport_*.
            max_existing = dw_db.query(
                func.max(DefaultMetadataReport.metadatareport_nid)
            ).scalar()
            next_metadatareport_nid = (max_existing or 0) + 1

            updated_count = 0
            deleted_count = 0
            errors = []

            for idx, item in enumerate(update_items):
                try:
                    # Get category GID from schema
                    mt_catg_gid = item.get("mt_catg_gid")
                    if not mt_catg_gid:
                        errors.append({"index": idx, "error": "Missing 'mt_catg_gid' field in update item"})
                        continue
                    
                    # Resolve category GID to category_nid
                    category_nid = self._resolve_category_gid_to_nid(
                        dw_db, str(mt_catg_gid), language_code
                    )
                    
                    if not category_nid:
                        errors.append({"index": idx, "error": f"Category not found: {mt_catg_gid}"})
                        continue
                    
                    
                    # Get metadata text (internal key: metadata_text)
                    metadata_text = item.get("metadata_text")
                    is_empty = not metadata_text or (isinstance(metadata_text, str) and not metadata_text.strip())
                    
                    # MetadataReport business rules (by target_nid + category_nid):
                    # - If metadata_text is empty/null → DELETE existing report row (if any).
                    # - If metadata_text has a value → UPDATE existing row, or INSERT if none exists.
                    existing_report = dw_db.query(MetadataReportLocale).filter(
                        MetadataReportLocale.target_nid == indicator_nid,
                        MetadataReportLocale.category_nid == category_nid
                    ).first()
                    
                    if is_empty:
                        # DELETE from ALL language tables atomically (Rule 3.4)
                        if existing_report:
                            for lang_code in get_dw_language_codes(dw_id):
                                MetadataReportLang = MetadataReport(lang_code)
                                lang_report = dw_db.query(MetadataReportLang).filter(
                                    MetadataReportLang.target_nid == indicator_nid,
                                    MetadataReportLang.category_nid == category_nid,
                                ).first()
                                if lang_report:
                                    dw_db.delete(lang_report)
                            deleted_count += 1
                            logger.info(
                                f"Deleted metadata report for indicator {indicator_nid}, "
                                f"category {category_nid} from all language tables"
                            )
                    else:
                        # UPDATE metadata column if record exists, else INSERT new report row
                        if existing_report:
                            existing_report.metadata_text = metadata_text
                            updated_count += 1
                            logger.info(
                                f"Updated metadata report for indicator {indicator_nid}, "
                                f"category {category_nid} in locale {language_code}"
                            )
                        else:
                            # INSERT into ALL language tables with same NID (Rule 3.1)
                            new_nid = next_metadatareport_nid
                            next_metadatareport_nid += 1

                            for lang_code in get_dw_language_codes(dw_id):
                                MetadataReportLang = MetadataReport(lang_code)
                                new_report = MetadataReportLang(
                                    metadatareport_nid=new_nid,
                                    target_nid=indicator_nid,
                                    category_nid=category_nid,
                                    metadata_text=value_for_locale(metadata_text, lang_code, language_code),
                                )
                                dw_db.add(new_report)
                            updated_count += 1
                            logger.info(
                                f"Created metadata report for indicator {indicator_nid}, "
                                f"category {category_nid} across all language tables (nid={new_nid})"
                            )
                
                except Exception as e:
                    log_background_incident(
                        message=f"Error processing update item at index {idx}: {e}",
                        error_code="INDICATOR_METADATA_BATCH_ITEM_FAILED",
                        exc=e,
                        source=_INDICATOR_METADATA_SOURCE,
                    )
                    errors.append({"index": idx, "error": str(e)})
            
            dw_db.commit()

            return {
                "updated_count": updated_count,
                "deleted_count": deleted_count,
                "errors": errors,
                "total_processed": len(update_items)
            }
    