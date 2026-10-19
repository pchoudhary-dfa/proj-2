"""
Source Expansion Service for Data Warehouse Compute Engine.

This service handles expansion of IC (Indicator Classification) and IU (Indicator-Unit)
references to full IUS lists, matching Laravel's expansion logic exactly.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, distinct

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import NotFound
from apps.datawarehouse.models.datawarehouse import (
    IndicatorUnitSubgroup, Indicator, Unit, SubgroupVal, 
    IndicatorClassification, IcIus
)
from apps.shared.utils.ius_utils import build_ius_gid, get_ius_gid_separator
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SOURCE_EXPANSION_SOURCE = "apps.datawarehouse.services.source_expansion_service"


class SourceExpansionService:
    """Service for expanding IC and IU references to IUS lists."""
    
    def __init__(self):
        self.ius_delimiter = get_ius_gid_separator()
    
    def expand_ic_to_ius_list(
        self, 
        dw_db: Session, 
        ic_nid: int, 
        language_code: str = "en"
    ) -> List[Dict[str, Any]]:
        """
        Expand IC (Indicator Classification) to all IUS under that classification.
        
        This replicates Laravel's logic from ComputeEngineController where
        srcType == 'ic' expands to all IUS linked via ut_ic_ius table.
        
        Args:
            dw_db: Data warehouse database session
            ic_nid: Indicator Classification NID
            language_code: Language code for metadata resolution
        
        Returns:
            List of IUS dictionaries with gid and name information
        """
        try:
            logger.info(f"Expanding IC {ic_nid} to IUS list")
            
            # Get models for the specified language
            indicator_model = Indicator(language_code)
            unit_model = Unit(language_code)
            subgroup_model = SubgroupVal(language_code)
            
            # Query matching Laravel's IC expansion logic
            # This replicates the complex join from Laravel ComputeEngineController
            ius_records = dw_db.query(
                IndicatorUnitSubgroup.indicator_nid,
                IndicatorUnitSubgroup.unit_nid,
                IndicatorUnitSubgroup.subgroup_val_nid,
                IndicatorUnitSubgroup.iusnid,
                indicator_model.indicator_name,
                indicator_model.indicator_gid,
                unit_model.unit_name,
                unit_model.unit_gid,
                subgroup_model.subgroup_val,
                subgroup_model.subgroup_val_gid,
                IcIus.ic_nid
            ).distinct().join(
                indicator_model, 
                indicator_model.indicator_nid == IndicatorUnitSubgroup.indicator_nid
            ).join(
                unit_model, 
                unit_model.unit_nid == IndicatorUnitSubgroup.unit_nid
            ).join(
                subgroup_model, 
                subgroup_model.subgroup_val_nid == IndicatorUnitSubgroup.subgroup_val_nid
            ).join(
                IcIus, 
                IcIus.iusnid == IndicatorUnitSubgroup.iusnid
            ).filter(
                IcIus.ic_nid == ic_nid
            ).order_by(
                indicator_model.indicator_name.asc(),
                unit_model.unit_name.asc(),
                subgroup_model.subgroup_val.asc()
            ).all()
            
            # Convert to IUS list format
            ius_list = []
            for record in ius_records:
                (indicator_nid, unit_nid, subgroup_val_nid, iusnid, 
                 indicator_name, indicator_gid, unit_name, unit_gid, 
                 subgroup_val, subgroup_val_gid, ic_nid_check) = record
                
                ius_gid = build_ius_gid(indicator_gid, unit_gid, subgroup_val_gid)
                ius_name = f"{indicator_name}{self.ius_delimiter}{unit_name}{self.ius_delimiter}{subgroup_val}"
                
                ius_list.append({
                    "ius_gid": ius_gid,
                    "ius_name": ius_name,
                    "i_gid": indicator_gid,
                    "u_gid": unit_gid,
                    "s_gid": subgroup_val_gid,
                    "i_name": indicator_name,
                    "u_name": unit_name,
                    "s_name": subgroup_val,
                    "iusnid": iusnid,
                    "source_type": "ic",
                    "ic_nid": ic_nid
                })
            
            logger.info(f"Expanded IC {ic_nid} to {len(ius_list)} IUS combinations")
            return ius_list
            
        except Exception as e:
            log_background_incident(
                message=f"Failed to expand IC {ic_nid} to IUS list: {e}",
                error_code="SOURCE_EXPAND_IC_TO_IUS_FAILED",
                exc=e,
                source=_SOURCE_EXPANSION_SOURCE,
            )
            raise
    
    def expand_iu_to_ius_list(
        self, 
        dw_db: Session, 
        i_gid: str, 
        u_gid: str, 
        language_code: str = "en"
    ) -> List[Dict[str, Any]]:
        """
        Expand IU (Indicator-Unit) to all subgroups for that combination.
        
        This replicates Laravel's logic from ComputeEngineController where
        srcType == 'iu' expands to all subgroups for the indicator-unit pair.
        
        Args:
            dw_db: Data warehouse database session
            i_gid: Indicator GID
            u_gid: Unit GID
            language_code: Language code for metadata resolution
        
        Returns:
            List of IUS dictionaries with gid and name information
        """
        try:
            logger.info(f"Expanding IU {i_gid}-{u_gid} to IUS list")
            
            # Get models for the specified language
            indicator_model = Indicator(language_code)
            unit_model = Unit(language_code)
            subgroup_model = SubgroupVal(language_code)
            
            # Get indicator and unit NIDs
            indicator = dw_db.query(indicator_model).filter(
                indicator_model.indicator_gid == i_gid
            ).first()
            
            unit = dw_db.query(unit_model).filter(
                unit_model.unit_gid == u_gid
            ).first()
            
            if not indicator or not unit:
                raise NotFound(f"Indicator or Unit not found: {i_gid}, {u_gid}")
            
            # Query matching Laravel's IU expansion logic
            subgroups = dw_db.query(
                IndicatorUnitSubgroup.subgroup_val_nid,
                IndicatorUnitSubgroup.iusnid,
                subgroup_model.subgroup_val_gid,
                subgroup_model.subgroup_val
            ).join(
                subgroup_model, 
                subgroup_model.subgroup_val_nid == IndicatorUnitSubgroup.subgroup_val_nid
            ).filter(
                and_(
                    IndicatorUnitSubgroup.indicator_nid == indicator.indicator_nid,
                    IndicatorUnitSubgroup.unit_nid == unit.unit_nid
                )
            ).all()
            
            # Convert to IUS list format
            ius_list = []
            for subgroup_record in subgroups:
                subgroup_val_nid, iusnid, subgroup_val_gid, subgroup_val = subgroup_record
                
                ius_gid = build_ius_gid(i_gid, u_gid, subgroup_val_gid)
                ius_name = f"{indicator.indicator_name}{self.ius_delimiter}{unit.unit_name}{self.ius_delimiter}{subgroup_val}"
                
                ius_list.append({
                    "ius_gid": ius_gid,
                    "ius_name": ius_name,
                    "i_gid": i_gid,
                    "u_gid": u_gid,
                    "s_gid": subgroup_val_gid,
                    "i_name": indicator.indicator_name,
                    "u_name": unit.unit_name,
                    "s_name": subgroup_val,
                    "iusnid": iusnid,
                    "source_type": "iu"
                })
            
            logger.info(f"Expanded IU {i_gid}-{u_gid} to {len(ius_list)} IUS combinations")
            return ius_list
            
        except Exception as e:
            log_background_incident(
                message=f"Failed to expand IU {i_gid}-{u_gid} to IUS list: {e}",
                error_code="SOURCE_EXPAND_IU_TO_IUS_FAILED",
                exc=e,
                source=_SOURCE_EXPANSION_SOURCE,
            )
            raise
    
    def expand_source_references(
        self, 
        dw_id: str, 
        source_references: List[Dict[str, Any]], 
        language_code: str = "en"
    ) -> List[Dict[str, Any]]:
        """
        Expand a list of source references (IC/IU/IUS) to a complete IUS list.
        
        Args:
            dw_id: Data warehouse ID
            source_references: List of source reference dictionaries
            language_code: Language code for metadata resolution
        
        Returns:
            List of expanded IUS dictionaries
        """
        expanded_ius_list = []
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            for source_ref in source_references:
                source_type = source_ref.get("type", "ius")
                
                try:
                    if source_type == "ic":
                        # Expand IC to all IUS under classification
                        ic_nid = source_ref.get("ic_nid")
                        if ic_nid:
                            ic_ius_list = self.expand_ic_to_ius_list(dw_db, ic_nid, language_code)
                            expanded_ius_list.extend(ic_ius_list)
                        else:
                            logger.warning(f"IC source reference missing ic_nid: {source_ref}")
                    
                    elif source_type == "iu":
                        # Expand IU to all subgroups
                        i_gid = source_ref.get("i_gid")
                        u_gid = source_ref.get("u_gid")
                        if i_gid and u_gid:
                            iu_ius_list = self.expand_iu_to_ius_list(dw_db, i_gid, u_gid, language_code)
                            expanded_ius_list.extend(iu_ius_list)
                        else:
                            logger.warning(f"IU source reference missing i_gid or u_gid: {source_ref}")
                    
                    elif source_type == "ius":
                        # Direct IUS reference - no expansion needed
                        ius_gid = source_ref.get("ius_gid")
                        if ius_gid:
                            # Validate and resolve IUS name if needed
                            from apps.datawarehouse.utils.compute_ius_utils import IusUtils
                            resolved_names = IusUtils.resolve_ius_names(dw_id, [ius_gid], language_code)
                            ius_data = resolved_names.get(ius_gid, {})
                            
                            expanded_ius_list.append({
                                "ius_gid": ius_gid,
                                "ius_name": f"{ius_data.get('i_name', '')}{self.ius_delimiter}{ius_data.get('u_name', '')}{self.ius_delimiter}{ius_data.get('s_name', '')}",
                                "i_gid": ius_data.get('i_gid', ''),
                                "u_gid": ius_data.get('u_gid', ''),
                                "s_gid": ius_data.get('s_gid', ''),
                                "i_name": ius_data.get('i_name', ''),
                                "u_name": ius_data.get('u_name', ''),
                                "s_name": ius_data.get('s_name', ''),
                                "source_type": "ius"
                            })
                        else:
                            logger.warning(f"IUS source reference missing ius_gid: {source_ref}")
                    
                    else:
                        logger.warning(f"Unknown source type: {source_type}")
                
                except Exception as e:
                    log_background_incident(
                        message=f"Failed to expand source reference {source_ref}: {e}",
                        error_code="SOURCE_EXPAND_REFERENCE_FAILED",
                        exc=e,
                        source=_SOURCE_EXPANSION_SOURCE,
                    )
                    continue
        
        logger.info(f"Expanded {len(source_references)} source references to {len(expanded_ius_list)} IUS combinations")
        return expanded_ius_list
    
    def validate_ic_exists(self, dw_db: Session, ic_nid: int, language_code: str = "en") -> bool:
        """Validate that an Indicator Classification exists."""
        ic_model = IndicatorClassification(language_code)
        ic = dw_db.query(ic_model).filter(ic_model.ic_nid == ic_nid).first()
        return ic is not None
    
    def validate_iu_exists(self, dw_db: Session, i_gid: str, u_gid: str, language_code: str = "en") -> bool:
        """Validate that an Indicator-Unit combination exists."""
        indicator_model = Indicator(language_code)
        unit_model = Unit(language_code)
        
        indicator = dw_db.query(indicator_model).filter(indicator_model.indicator_gid == i_gid).first()
        unit = dw_db.query(unit_model).filter(unit_model.unit_gid == u_gid).first()
        
        if not indicator or not unit:
            return False
        
        # Check if there's at least one IUS combination for this IU
        ius_exists = dw_db.query(IndicatorUnitSubgroup).filter(
            and_(
                IndicatorUnitSubgroup.indicator_nid == indicator.indicator_nid,
                IndicatorUnitSubgroup.unit_nid == unit.unit_nid
            )
        ).first()
        
        return ius_exists is not None