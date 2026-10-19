"""
Bulk Operations Service for Data Warehouse Compute Engine.

This service implements Laravel's bulk operation methods:
- handleMatchIusForTotal: Creates TOTAL formulas for indicators with same unit and subgroup set
- handleMatchIusAllForTime: Applies TIME settings to all IUS with same unit
- handleMatchIusOthForTime: Applies TIME settings to same indicator+unit, all subgroups

These methods replicate the exact Laravel logic for bulk formula creation.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, text

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    CeIusComputeAddTarget, CeIusComputeAddSource, CeIusComputeDiv,
    CeIusComputeMinus, CeIusComputeTime, CeIusComputeArea,
    IndicatorUnitSubgroup, Indicator, Unit, SubgroupVal
)
from apps.shared.exceptions import NotFound
from apps.shared.utils.ius_utils import parse_ius_gid, build_ius_gid, get_ius_gid_separator
from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
    OPERATION_AREA,
)
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_BULK_OPS_SOURCE = "apps.datawarehouse.services.bulk_operations_service"


class BulkOperationsService:
    """Service for executing bulk operations matching Laravel behavior."""
    
    def __init__(self):
        self.ius_delimiter = get_ius_gid_separator()
    
    def handle_match_ius_for_total(
        self, 
        dw_db: Session, 
        target_data: Dict[str, Any], 
        source_data: List[Dict[str, Any]], 
        dw_id: str, 
        overwrite: bool,
        language_code: str = "en"
    ) -> Dict[str, Any]:
        """
        Equivalent to Laravel's handleMatchIusForTotal.
        
        Find indicators with same unit and complete subgroup set as sources,
        then create TOTAL formulas for each matched indicator.
        
        Args:
            dw_db: Data warehouse database session
            target_data: Target IUS data with u_gid, s_gid, target_decimal, order
            source_data: List of source IUS data from request
            dw_id: Data warehouse ID
            overwrite: Whether to overwrite existing formulas
            language_code: Language code for metadata resolution
        
        Returns:
            Dictionary with operation results
        """
        try:
            logger.info(f"Starting bulk TOTAL operation for target: {target_data}")
            
            # Parse target IUS
            target_i_gid, target_u_gid, target_s_gid = parse_ius_gid(target_data["ius_gid"])
            
            # Get target unit and subgroup details
            unit_model = Unit(language_code)
            subgroup_model = SubgroupVal(language_code)
            
            target_unit = dw_db.query(unit_model).filter(
                unit_model.unit_gid == target_u_gid
            ).first()
            
            target_subgroup = dw_db.query(subgroup_model).filter(
                subgroup_model.subgroup_val_gid == target_s_gid
            ).first()
            
            if not target_unit or not target_subgroup:
                raise NotFound(f"Target unit or subgroup not found: {target_u_gid}, {target_s_gid}")
            
            # Build subgroup NIDs list from source data and target
            sub_nids = []
            
            # Extract subgroup GIDs from source data
            source_subgroup_gids = []
            for source in source_data:
                if isinstance(source, dict) and "ius_gid" in source:
                    _, _, s_gid = parse_ius_gid(source["ius_gid"])
                    source_subgroup_gids.append(s_gid)
                elif isinstance(source, str):
                    _, _, s_gid = parse_ius_gid(source)
                    source_subgroup_gids.append(s_gid)
            
            # Get NIDs for source subgroups
            if source_subgroup_gids:
                source_subgroups = dw_db.query(subgroup_model.subgroup_val_nid).filter(
                    subgroup_model.subgroup_val_gid.in_(source_subgroup_gids)
                ).all()
                sub_nids.extend([sg[0] for sg in source_subgroups])
            
            # Add target subgroup NID
            sub_nids.append(target_subgroup.subgroup_val_nid)
            
            # Find IUS combinations with same unit and all required subgroups
            ius_with_same_unit = dw_db.query(
                IndicatorUnitSubgroup.indicator_nid,
                IndicatorUnitSubgroup.unit_nid,
                IndicatorUnitSubgroup.subgroup_val_nid
            ).filter(
                and_(
                    IndicatorUnitSubgroup.unit_nid == target_unit.unit_nid,
                    IndicatorUnitSubgroup.subgroup_val_nid.in_(sub_nids)
                )
            ).group_by(
                IndicatorUnitSubgroup.indicator_nid,
                IndicatorUnitSubgroup.unit_nid,
                IndicatorUnitSubgroup.subgroup_val_nid
            ).all()
            
            # Count subgroups per indicator
            indicator_counts = {}
            for item in ius_with_same_unit:
                indicator_nid = item.indicator_nid
                if indicator_nid in indicator_counts:
                    indicator_counts[indicator_nid] += 1
                else:
                    indicator_counts[indicator_nid] = 1
            
            # Keep only indicators that have all required subgroups
            required_count = len(sub_nids)
            matched_indicator_nids = [
                nid for nid, count in indicator_counts.items() 
                if count == required_count
            ]
            
            if not matched_indicator_nids:
                logger.info("No matching indicators found for bulk TOTAL operation")
                return {"created_count": 0, "matched_indicators": []}
            
            # Get indicator details
            indicator_model = Indicator(language_code)
            matched_indicators = dw_db.query(indicator_model).filter(
                indicator_model.indicator_nid.in_(matched_indicator_nids)
            ).all()
            
            # Filter out existing formulas if not overwriting
            if not overwrite:
                existing_ius_gids = []
                for indicator in matched_indicators:
                    ius_gid = build_ius_gid(
                        indicator.indicator_gid, 
                        target_unit.unit_gid, 
                        target_subgroup.subgroup_val_gid
                    )
                    existing_ius_gids.append(ius_gid)
                
                # Check for existing formulas
                existing_i_gids = []
                
                # Check TOTAL formulas
                existing_total = dw_db.query(CeIusComputeAddTarget.i_gid).filter(
                    and_(
                        CeIusComputeAddTarget.dw_id == int(dw_id),
                        CeIusComputeAddTarget.i_gid.in_([ind.indicator_gid for ind in matched_indicators]),
                        CeIusComputeAddTarget.u_gid == target_unit.unit_gid,
                        CeIusComputeAddTarget.s_gid == target_subgroup.subgroup_val_gid
                    )
                ).all()
                existing_i_gids.extend([t[0] for t in existing_total])
                
                # Check PERCENT formulas
                existing_percent = dw_db.query(CeIusComputeDiv.i_gid).filter(
                    and_(
                        CeIusComputeDiv.dw_id == int(dw_id),
                        CeIusComputeDiv.i_gid.in_([ind.indicator_gid for ind in matched_indicators]),
                        CeIusComputeDiv.u_gid == target_unit.unit_gid,
                        CeIusComputeDiv.s_gid == target_subgroup.subgroup_val_gid
                    )
                ).all()
                existing_i_gids.extend([p[0] for p in existing_percent])
                
                # Check MINUS formulas
                existing_minus = dw_db.query(CeIusComputeMinus.i_gid).filter(
                    and_(
                        CeIusComputeMinus.dw_id == int(dw_id),
                        CeIusComputeMinus.i_gid.in_([ind.indicator_gid for ind in matched_indicators]),
                        CeIusComputeMinus.u_gid == target_unit.unit_gid,
                        CeIusComputeMinus.s_gid == target_subgroup.subgroup_val_gid
                    )
                ).all()
                existing_i_gids.extend([m[0] for m in existing_minus])
                
                # Filter out indicators with existing formulas
                existing_i_gids = list(set(existing_i_gids))
                matched_indicators = [
                    ind for ind in matched_indicators 
                    if ind.indicator_gid not in existing_i_gids
                ]
            
            # Create TOTAL formulas for each matched indicator
            created_count = 0
            created_formulas = []
            
            for indicator in matched_indicators:
                try:
                    # Check if target already exists
                    existing_target = dw_db.query(CeIusComputeAddTarget).filter(
                        and_(
                            CeIusComputeAddTarget.dw_id == int(dw_id),
                            CeIusComputeAddTarget.i_gid == indicator.indicator_gid,
                            CeIusComputeAddTarget.u_gid == target_unit.unit_gid,
                            CeIusComputeAddTarget.s_gid == target_subgroup.subgroup_val_gid
                        )
                    ).first()
                    
                    if existing_target:
                        # Update existing target
                        existing_target.target_decimal = target_data.get("target_decimal")
                        existing_target.ius_name = f"{indicator.indicator_name}{self.ius_delimiter}{target_unit.unit_name}{self.ius_delimiter}{target_subgroup.subgroup_val}"
                        existing_target.order = existing_target.order + 1
                        
                        # Delete existing sources
                        dw_db.query(CeIusComputeAddSource).filter(
                            CeIusComputeAddSource.target_id == existing_target.id
                        ).delete()
                        
                        target_record = existing_target
                    else:
                        # Create new target
                        target_record = CeIusComputeAddTarget(
                            dw_id=int(dw_id),
                            i_gid=indicator.indicator_gid,
                            u_gid=target_unit.unit_gid,
                            s_gid=target_subgroup.subgroup_val_gid,
                            ius_name=f"{indicator.indicator_name}{self.ius_delimiter}{target_unit.unit_name}{self.ius_delimiter}{target_subgroup.subgroup_val}",
                            target_decimal=target_data.get("target_decimal"),
                            order=target_data.get("order", 0)
                        )
                        dw_db.add(target_record)
                        dw_db.flush()  # Get the ID
                    
                    # Delete conflicting formulas
                    self._delete_conflicting_formulas(
                        dw_db, int(dw_id), indicator.indicator_gid, 
                        target_unit.unit_gid, target_subgroup.subgroup_val_gid
                    )
                    
                    # Create source records
                    for source in source_data:
                        source_ius_gid = source if isinstance(source, str) else source.get("ius_gid")
                        if source_ius_gid:
                            src_i_gid, src_u_gid, src_s_gid = parse_ius_gid(source_ius_gid)
                            
                            # Get source names
                            src_unit = dw_db.query(unit_model).filter(
                                unit_model.unit_gid == src_u_gid
                            ).first()
                            src_subgroup = dw_db.query(subgroup_model).filter(
                                subgroup_model.subgroup_val_gid == src_s_gid
                            ).first()
                            
                            if src_unit and src_subgroup:
                                source_record = CeIusComputeAddSource(
                                    dw_id=int(dw_id),
                                    target_id=target_record.id,
                                    i_gid=indicator.indicator_gid,  # Use matched indicator
                                    u_gid=src_u_gid,
                                    s_gid=src_s_gid,
                                    ius_name=f"{indicator.indicator_name}{self.ius_delimiter}{src_unit.unit_name}{self.ius_delimiter}{src_subgroup.subgroup_val}"
                                )
                                dw_db.add(source_record)
                    
                    created_formulas.append({
                        "indicator_gid": indicator.indicator_gid,
                        "target_ius": build_ius_gid(
                            indicator.indicator_gid, 
                            target_unit.unit_gid, 
                            target_subgroup.subgroup_val_gid
                        )
                    })
                    created_count += 1
                    
                except Exception as e:
                    log_background_incident(
                        message=(
                            f"Failed to create bulk TOTAL formula for indicator "
                            f"{indicator.indicator_gid}: {e}"
                        ),
                        error_code="BULK_TOTAL_ROW_FAILED",
                        exc=e,
                        source=_BULK_OPS_SOURCE,
                    )
                    continue
            
            dw_db.commit()
            
            logger.info(f"Bulk TOTAL operation completed: {created_count} formulas created")
            
            return {
                "created_count": created_count,
                "matched_indicators": created_formulas,
                "operation": "bulk_total"
            }
            
        except Exception as e:
            log_background_incident(
                message=f"Bulk TOTAL operation failed: {e}",
                error_code="BULK_TOTAL_FAILED",
                exc=e,
                source=_BULK_OPS_SOURCE,
            )
            dw_db.rollback()
            raise
    
    def handle_match_ius_all_for_time(
        self, 
        dw_db: Session, 
        target_data: Dict[str, Any], 
        dw_id: str, 
        overwrite: bool,
        language_code: str = "en"
    ) -> Dict[str, Any]:
        """
        Equivalent to Laravel's handleMatchIusAllForTime.
        
        Apply TIME settings to all IUS with the same unit as target.
        
        Args:
            dw_db: Data warehouse database session
            target_data: Target IUS data with TIME settings
            dw_id: Data warehouse ID
            overwrite: Whether to overwrite existing formulas
            language_code: Language code for metadata resolution
        
        Returns:
            Dictionary with operation results
        """
        try:
            logger.info(f"Starting bulk TIME (all) operation for target: {target_data}")
            
            # Parse target IUS
            target_i_gid, target_u_gid, target_s_gid = parse_ius_gid(target_data["ius_gid"])
            
            # Get target unit details
            unit_model = Unit(language_code)
            target_unit = dw_db.query(unit_model).filter(
                unit_model.unit_gid == target_u_gid
            ).first()
            
            if not target_unit:
                raise NotFound(f"Target unit not found: {target_u_gid}")
            
            # Get all IUS with same unit
            indicator_model = Indicator(language_code)
            subgroup_model = SubgroupVal(language_code)
            
            ius_with_same_unit = dw_db.query(
                IndicatorUnitSubgroup,
                indicator_model.indicator_gid,
                indicator_model.indicator_name,
                unit_model.unit_gid,
                unit_model.unit_name,
                subgroup_model.subgroup_val_gid,
                subgroup_model.subgroup_val
            ).join(
                indicator_model, IndicatorUnitSubgroup.indicator_nid == indicator_model.indicator_nid
            ).join(
                unit_model, IndicatorUnitSubgroup.unit_nid == unit_model.unit_nid
            ).join(
                subgroup_model, IndicatorUnitSubgroup.subgroup_val_nid == subgroup_model.subgroup_val_nid
            ).filter(
                IndicatorUnitSubgroup.unit_nid == target_unit.unit_nid
            ).all()
            
            # Create TIME formulas for each IUS
            created_count = 0
            updated_count = 0
            created_formulas = []
            
            for ius_record in ius_with_same_unit:
                try:
                    ius, i_gid, i_name, u_gid, u_name, s_gid, s_name = ius_record
                    
                    if overwrite:
                        # Update or insert
                        existing_time = dw_db.query(CeIusComputeTime).filter(
                            and_(
                                CeIusComputeTime.dw_id == int(dw_id),
                                CeIusComputeTime.i_gid == i_gid,
                                CeIusComputeTime.u_gid == u_gid,
                                CeIusComputeTime.s_gid == s_gid
                            )
                        ).first()
                        
                        if existing_time:
                            # Update existing
                            existing_time.ius_name = f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}"
                            existing_time.target_decimal = target_data.get("target_decimal")
                            existing_time.target_tp_freq = target_data["target_tp_freq"]
                            existing_time.source_tp_freq = target_data["source_tp_freq"]
                            existing_time.aggregation_type = target_data["aggregation_type"]
                            updated_count += 1
                        else:
                            # Create new
                            time_record = CeIusComputeTime(
                                dw_id=int(dw_id),
                                i_gid=i_gid,
                                u_gid=u_gid,
                                s_gid=s_gid,
                                ius_name=f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}",
                                target_decimal=target_data.get("target_decimal"),
                                target_tp_freq=target_data["target_tp_freq"],
                                source_tp_freq=target_data["source_tp_freq"],
                                aggregation_type=target_data["aggregation_type"]
                            )
                            dw_db.add(time_record)
                            created_count += 1
                    else:
                        # First or create (only if missing)
                        existing_time = dw_db.query(CeIusComputeTime).filter(
                            and_(
                                CeIusComputeTime.dw_id == int(dw_id),
                                CeIusComputeTime.i_gid == i_gid,
                                CeIusComputeTime.u_gid == u_gid,
                                CeIusComputeTime.s_gid == s_gid
                            )
                        ).first()
                        
                        if not existing_time:
                            time_record = CeIusComputeTime(
                                dw_id=int(dw_id),
                                i_gid=i_gid,
                                u_gid=u_gid,
                                s_gid=s_gid,
                                ius_name=f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}",
                                target_decimal=target_data.get("target_decimal"),
                                target_tp_freq=target_data["target_tp_freq"],
                                source_tp_freq=target_data["source_tp_freq"],
                                aggregation_type=target_data["aggregation_type"]
                            )
                            dw_db.add(time_record)
                            created_count += 1
                    
                    created_formulas.append({
                        "ius_gid": build_ius_gid(i_gid, u_gid, s_gid),
                        "ius_name": f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}"
                    })
                    
                except Exception as e:
                    log_background_incident(
                        message=(
                            f"Failed to create bulk TIME formula for IUS "
                            f"{i_gid}-{u_gid}-{s_gid}: {e}"
                        ),
                        error_code="BULK_TIME_ALL_ROW_FAILED",
                        exc=e,
                        source=_BULK_OPS_SOURCE,
                    )
                    continue
            
            dw_db.commit()
            
            logger.info(f"Bulk TIME (all) operation completed: {created_count} created, {updated_count} updated")
            
            return {
                "created_count": created_count,
                "updated_count": updated_count,
                "processed_ius": created_formulas,
                "operation": "bulk_time_all"
            }
            
        except Exception as e:
            log_background_incident(
                message=f"Bulk TIME (all) operation failed: {e}",
                error_code="BULK_TIME_ALL_FAILED",
                exc=e,
                source=_BULK_OPS_SOURCE,
            )
            dw_db.rollback()
            raise
    
    def handle_match_ius_oth_for_time(
        self, 
        dw_db: Session, 
        target_data: Dict[str, Any], 
        dw_id: str, 
        overwrite: bool,
        language_code: str = "en"
    ) -> Dict[str, Any]:
        """
        Equivalent to Laravel's handleMatchIusOthForTime.
        
        Apply TIME settings to all subgroups of the same indicator+unit as target.
        
        Args:
            dw_db: Data warehouse database session
            target_data: Target IUS data with TIME settings
            dw_id: Data warehouse ID
            overwrite: Whether to overwrite existing formulas
            language_code: Language code for metadata resolution
        
        Returns:
            Dictionary with operation results
        """
        try:
            logger.info(f"Starting bulk TIME (other) operation for target: {target_data}")
            
            # Parse target IUS
            target_i_gid, target_u_gid, target_s_gid = parse_ius_gid(target_data["ius_gid"])
            
            # Get target indicator and unit details
            indicator_model = Indicator(language_code)
            unit_model = Unit(language_code)
            subgroup_model = SubgroupVal(language_code)
            
            target_indicator = dw_db.query(indicator_model).filter(
                indicator_model.indicator_gid == target_i_gid
            ).first()
            
            target_unit = dw_db.query(unit_model).filter(
                unit_model.unit_gid == target_u_gid
            ).first()
            
            if not target_indicator or not target_unit:
                raise NotFound(f"Target indicator or unit not found: {target_i_gid}, {target_u_gid}")
            
            # Get all IUS with same indicator and unit (different subgroups)
            ius_with_same_indicator_unit = dw_db.query(
                IndicatorUnitSubgroup,
                indicator_model.indicator_gid,
                indicator_model.indicator_name,
                unit_model.unit_gid,
                unit_model.unit_name,
                subgroup_model.subgroup_val_gid,
                subgroup_model.subgroup_val
            ).join(
                indicator_model, IndicatorUnitSubgroup.indicator_nid == indicator_model.indicator_nid
            ).join(
                unit_model, IndicatorUnitSubgroup.unit_nid == unit_model.unit_nid
            ).join(
                subgroup_model, IndicatorUnitSubgroup.subgroup_val_nid == subgroup_model.subgroup_val_nid
            ).filter(
                and_(
                    IndicatorUnitSubgroup.unit_nid == target_unit.unit_nid,
                    IndicatorUnitSubgroup.indicator_nid == target_indicator.indicator_nid
                )
            ).all()
            
            # Create TIME formulas for each IUS
            created_count = 0
            updated_count = 0
            created_formulas = []
            
            for ius_record in ius_with_same_indicator_unit:
                try:
                    ius, i_gid, i_name, u_gid, u_name, s_gid, s_name = ius_record
                    
                    if overwrite:
                        # Update or insert
                        existing_time = dw_db.query(CeIusComputeTime).filter(
                            and_(
                                CeIusComputeTime.dw_id == int(dw_id),
                                CeIusComputeTime.i_gid == i_gid,
                                CeIusComputeTime.u_gid == u_gid,
                                CeIusComputeTime.s_gid == s_gid
                            )
                        ).first()
                        
                        if existing_time:
                            # Update existing
                            existing_time.ius_name = f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}"
                            existing_time.target_decimal = target_data.get("target_decimal")
                            existing_time.target_tp_freq = target_data["target_tp_freq"]
                            existing_time.source_tp_freq = target_data["source_tp_freq"]
                            existing_time.aggregation_type = target_data["aggregation_type"]
                            updated_count += 1
                        else:
                            # Create new
                            time_record = CeIusComputeTime(
                                dw_id=int(dw_id),
                                i_gid=i_gid,
                                u_gid=u_gid,
                                s_gid=s_gid,
                                ius_name=f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}",
                                target_decimal=target_data.get("target_decimal"),
                                target_tp_freq=target_data["target_tp_freq"],
                                source_tp_freq=target_data["source_tp_freq"],
                                aggregation_type=target_data["aggregation_type"]
                            )
                            dw_db.add(time_record)
                            created_count += 1
                    else:
                        # First or create (only if missing)
                        existing_time = dw_db.query(CeIusComputeTime).filter(
                            and_(
                                CeIusComputeTime.dw_id == int(dw_id),
                                CeIusComputeTime.i_gid == i_gid,
                                CeIusComputeTime.u_gid == u_gid,
                                CeIusComputeTime.s_gid == s_gid
                            )
                        ).first()
                        
                        if not existing_time:
                            time_record = CeIusComputeTime(
                                dw_id=int(dw_id),
                                i_gid=i_gid,
                                u_gid=u_gid,
                                s_gid=s_gid,
                                ius_name=f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}",
                                target_decimal=target_data.get("target_decimal"),
                                target_tp_freq=target_data["target_tp_freq"],
                                source_tp_freq=target_data["source_tp_freq"],
                                aggregation_type=target_data["aggregation_type"]
                            )
                            dw_db.add(time_record)
                            created_count += 1
                    
                    created_formulas.append({
                        "ius_gid": build_ius_gid(i_gid, u_gid, s_gid),
                        "ius_name": f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}"
                    })
                    
                except Exception as e:
                    log_background_incident(
                        message=(
                            f"Failed to create bulk TIME formula for IUS "
                            f"{i_gid}-{u_gid}-{s_gid}: {e}"
                        ),
                        error_code="BULK_TIME_OTHER_ROW_FAILED",
                        exc=e,
                        source=_BULK_OPS_SOURCE,
                    )
                    continue
            
            dw_db.commit()
            
            logger.info(f"Bulk TIME (other) operation completed: {created_count} created, {updated_count} updated")
            
            return {
                "created_count": created_count,
                "updated_count": updated_count,
                "processed_ius": created_formulas,
                "operation": "bulk_time_other"
            }
            
        except Exception as e:
            log_background_incident(
                message=f"Bulk TIME (other) operation failed: {e}",
                error_code="BULK_TIME_OTHER_FAILED",
                exc=e,
                source=_BULK_OPS_SOURCE,
            )
            dw_db.rollback()
            raise
    
    def handle_match_ius_all_for_area(
        self,
        dw_db: Session,
        target_data: Dict[str, Any],
        dw_id: str,
        overwrite: bool,
        language_code: str = "en",
    ) -> Dict[str, Any]:
        """
        Apply AREA settings to all IUS with the same unit as target.
        Mirrors handle_match_ius_all_for_time logic.
        """
        try:
            target_i_gid, target_u_gid, target_s_gid = parse_ius_gid(target_data["ius_gid"])

            unit_model = Unit(language_code)
            target_unit = dw_db.query(unit_model).filter(
                unit_model.unit_gid == target_u_gid
            ).first()
            if not target_unit:
                raise NotFound(f"Target unit not found: {target_u_gid}")

            indicator_model = Indicator(language_code)
            subgroup_model = SubgroupVal(language_code)

            ius_with_same_unit = dw_db.query(
                IndicatorUnitSubgroup,
                indicator_model.indicator_gid,
                indicator_model.indicator_name,
                unit_model.unit_gid,
                unit_model.unit_name,
                subgroup_model.subgroup_val_gid,
                subgroup_model.subgroup_val,
            ).join(
                indicator_model, IndicatorUnitSubgroup.indicator_nid == indicator_model.indicator_nid
            ).join(
                unit_model, IndicatorUnitSubgroup.unit_nid == unit_model.unit_nid
            ).join(
                subgroup_model, IndicatorUnitSubgroup.subgroup_val_nid == subgroup_model.subgroup_val_nid
            ).filter(
                IndicatorUnitSubgroup.unit_nid == target_unit.unit_nid
            ).all()

            created_count = 0
            updated_count = 0
            processed = []

            for ius_record in ius_with_same_unit:
                try:
                    _ius, i_gid, i_name, u_gid, u_name, s_gid, s_name = ius_record
                    ius_name = f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}"

                    existing = dw_db.query(CeIusComputeArea).filter(
                        and_(
                            CeIusComputeArea.dw_id == int(dw_id),
                            CeIusComputeArea.i_gid == i_gid,
                            CeIusComputeArea.u_gid == u_gid,
                            CeIusComputeArea.s_gid == s_gid,
                        )
                    ).first()

                    if existing and overwrite:
                        existing.ius_name = ius_name
                        existing.target_decimal = target_data.get("target_decimal")
                        existing.target_area_level = target_data["target_area_level"]
                        existing.source_area_level = target_data["source_area_level"]
                        existing.aggregation_type = target_data["aggregation_type"]
                        existing.populate_mid_levels = target_data.get("populate_mid_levels", 0)
                        updated_count += 1
                    elif not existing:
                        dw_db.add(CeIusComputeArea(
                            dw_id=int(dw_id),
                            i_gid=i_gid,
                            u_gid=u_gid,
                            s_gid=s_gid,
                            ius_name=ius_name,
                            target_decimal=target_data.get("target_decimal"),
                            target_area_level=target_data["target_area_level"],
                            source_area_level=target_data["source_area_level"],
                            aggregation_type=target_data["aggregation_type"],
                            populate_mid_levels=target_data.get("populate_mid_levels", 0),
                        ))
                        created_count += 1

                    processed.append({"ius_gid": build_ius_gid(i_gid, u_gid, s_gid), "ius_name": ius_name})
                except Exception as e:
                    log_background_incident(
                        message=(
                            f"Failed to create bulk AREA formula for "
                            f"{i_gid}-{u_gid}-{s_gid}: {e}"
                        ),
                        error_code="BULK_AREA_ALL_ROW_FAILED",
                        exc=e,
                        source=_BULK_OPS_SOURCE,
                    )
                    continue

            dw_db.commit()
            return {"created_count": created_count, "updated_count": updated_count, "processed_ius": processed, "operation": "bulk_area_all"}

        except Exception as e:
            log_background_incident(
                message=f"Bulk AREA (all) operation failed: {e}",
                error_code="BULK_AREA_ALL_FAILED",
                exc=e,
                source=_BULK_OPS_SOURCE,
            )
            dw_db.rollback()
            raise

    def handle_match_ius_oth_for_area(
        self,
        dw_db: Session,
        target_data: Dict[str, Any],
        dw_id: str,
        overwrite: bool,
        language_code: str = "en",
    ) -> Dict[str, Any]:
        """
        Apply AREA settings to all subgroups of the same indicator+unit as target.
        Mirrors handle_match_ius_oth_for_time logic.
        """
        try:
            target_i_gid, target_u_gid, target_s_gid = parse_ius_gid(target_data["ius_gid"])

            indicator_model = Indicator(language_code)
            unit_model = Unit(language_code)
            subgroup_model = SubgroupVal(language_code)

            target_indicator = dw_db.query(indicator_model).filter(
                indicator_model.indicator_gid == target_i_gid
            ).first()
            target_unit = dw_db.query(unit_model).filter(
                unit_model.unit_gid == target_u_gid
            ).first()
            if not target_indicator or not target_unit:
                raise NotFound(f"Target indicator or unit not found: {target_i_gid}, {target_u_gid}")

            ius_records = dw_db.query(
                IndicatorUnitSubgroup,
                indicator_model.indicator_gid,
                indicator_model.indicator_name,
                unit_model.unit_gid,
                unit_model.unit_name,
                subgroup_model.subgroup_val_gid,
                subgroup_model.subgroup_val,
            ).join(
                indicator_model, IndicatorUnitSubgroup.indicator_nid == indicator_model.indicator_nid
            ).join(
                unit_model, IndicatorUnitSubgroup.unit_nid == unit_model.unit_nid
            ).join(
                subgroup_model, IndicatorUnitSubgroup.subgroup_val_nid == subgroup_model.subgroup_val_nid
            ).filter(
                and_(
                    IndicatorUnitSubgroup.indicator_nid == target_indicator.indicator_nid,
                    IndicatorUnitSubgroup.unit_nid == target_unit.unit_nid,
                )
            ).all()

            created_count = 0
            updated_count = 0
            processed = []

            for ius_record in ius_records:
                try:
                    _ius, i_gid, i_name, u_gid, u_name, s_gid, s_name = ius_record
                    ius_name = f"{i_name}{self.ius_delimiter}{u_name}{self.ius_delimiter}{s_name}"

                    existing = dw_db.query(CeIusComputeArea).filter(
                        and_(
                            CeIusComputeArea.dw_id == int(dw_id),
                            CeIusComputeArea.i_gid == i_gid,
                            CeIusComputeArea.u_gid == u_gid,
                            CeIusComputeArea.s_gid == s_gid,
                        )
                    ).first()

                    if existing and overwrite:
                        existing.ius_name = ius_name
                        existing.target_decimal = target_data.get("target_decimal")
                        existing.target_area_level = target_data["target_area_level"]
                        existing.source_area_level = target_data["source_area_level"]
                        existing.aggregation_type = target_data["aggregation_type"]
                        existing.populate_mid_levels = target_data.get("populate_mid_levels", 0)
                        updated_count += 1
                    elif not existing:
                        dw_db.add(CeIusComputeArea(
                            dw_id=int(dw_id),
                            i_gid=i_gid,
                            u_gid=u_gid,
                            s_gid=s_gid,
                            ius_name=ius_name,
                            target_decimal=target_data.get("target_decimal"),
                            target_area_level=target_data["target_area_level"],
                            source_area_level=target_data["source_area_level"],
                            aggregation_type=target_data["aggregation_type"],
                            populate_mid_levels=target_data.get("populate_mid_levels", 0),
                        ))
                        created_count += 1

                    processed.append({"ius_gid": build_ius_gid(i_gid, u_gid, s_gid), "ius_name": ius_name})
                except Exception as e:
                    log_background_incident(
                        message=(
                            f"Failed to create bulk AREA formula for "
                            f"{i_gid}-{u_gid}-{s_gid}: {e}"
                        ),
                        error_code="BULK_AREA_OTHER_ROW_FAILED",
                        exc=e,
                        source=_BULK_OPS_SOURCE,
                    )
                    continue

            dw_db.commit()
            return {"created_count": created_count, "updated_count": updated_count, "processed_ius": processed, "operation": "bulk_area_other"}

        except Exception as e:
            log_background_incident(
                message=f"Bulk AREA (other) operation failed: {e}",
                error_code="BULK_AREA_OTHER_FAILED",
                exc=e,
                source=_BULK_OPS_SOURCE,
            )
            dw_db.rollback()
            raise

    def _delete_conflicting_formulas(
        self, 
        dw_db: Session, 
        dw_id: int, 
        i_gid: str, 
        u_gid: str, 
        s_gid: str
    ):
        """Delete conflicting formulas for the given IUS combination."""
        # Delete MINUS formulas
        dw_db.query(CeIusComputeMinus).filter(
            and_(
                CeIusComputeMinus.dw_id == dw_id,
                CeIusComputeMinus.i_gid == i_gid,
                CeIusComputeMinus.u_gid == u_gid,
                CeIusComputeMinus.s_gid == s_gid
            )
        ).delete()
        
        # Delete PERCENT formulas
        dw_db.query(CeIusComputeDiv).filter(
            and_(
                CeIusComputeDiv.dw_id == dw_id,
                CeIusComputeDiv.i_gid == i_gid,
                CeIusComputeDiv.u_gid == u_gid,
                CeIusComputeDiv.s_gid == s_gid
            )
        ).delete()

        # Delete AREA formulas
        dw_db.query(CeIusComputeArea).filter(
            and_(
                CeIusComputeArea.dw_id == dw_id,
                CeIusComputeArea.i_gid == i_gid,
                CeIusComputeArea.u_gid == u_gid,
                CeIusComputeArea.s_gid == s_gid
            )
        ).delete()