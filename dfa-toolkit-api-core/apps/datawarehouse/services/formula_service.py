"""
Formula Service for Data Warehouse Compute Engine.

This service handles formula management operations including:
- Formula validation and conflict resolution
- Mutual exclusion enforcement (one formula type per IUS)
- Pattern expansion for bulk formula application
- Metadata resolution (GID to NID conversion)
"""

import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, tuple_

from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
    OPERATION_AREA,
)
from apps.shared.utils.ius_utils import get_ius_gid_separator, parse_ius_gid
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import NotFound
from apps.datawarehouse.models.datawarehouse import (
    CeIusComputeAddTarget, CeIusComputeAddSource, CeIusComputeDiv,
    CeIusComputeMinus, CeIusComputeTime, CeIusComputeArea,
    Indicator, Unit, SubgroupVal
)
from apps.datawarehouse.services.bulk_operations_service import BulkOperationsService
from apps.datawarehouse.services.source_expansion_service import SourceExpansionService
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_FORMULA_SERVICE_SOURCE = "apps.datawarehouse.services.formula_service"


class FormulaService:
    """Service for managing compute engine formulas."""
    
    def __init__(self):
        pass
    
    def check_existing_formula(self, dw_id: str, i_gid: str, u_gid: str, s_gid: str, language_code: str = None) -> Optional[Dict[str, Any]]:
        """
        Check if a formula already exists for the given IUS combination.
        Returns the existing formula details if found, None otherwise.
        
        Args:
            dw_id: Data warehouse ID
            i_gid: Indicator GID
            u_gid: Unit GID  
            s_gid: Subgroup GID
            language_code: Language code for IUS name translation (optional)
        """
        from apps.datawarehouse.utils.compute_ius_utils import IusUtils
        
        # Construct the IUS GID for name resolution
        ius_gid = f"{i_gid}|{u_gid}|{s_gid}"
        
        # Resolve IUS name in the requested language
        resolved_names = IusUtils.resolve_ius_names(dw_id, [ius_gid], language_code or "en")
        translated_ius_name = resolved_names.get(ius_gid, {}).get("ius_name", "")
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Check TOTAL formulas
            total_formula = dw_db.query(CeIusComputeAddTarget).filter(
                and_(
                    CeIusComputeAddTarget.dw_id == int(dw_id),
                    CeIusComputeAddTarget.i_gid == i_gid,
                    CeIusComputeAddTarget.u_gid == u_gid,
                    CeIusComputeAddTarget.s_gid == s_gid
                )
            ).first()
            
            if total_formula:
                return {
                    "operation_type": OPERATION_TOTAL,
                    "formula_id": total_formula.id,
                    "ius_name": translated_ius_name or total_formula.ius_name,
                    "target_decimal": total_formula.target_decimal
                }
            
            # Check PERCENT formulas
            percent_formula = dw_db.query(CeIusComputeDiv).filter(
                and_(
                    CeIusComputeDiv.dw_id == int(dw_id),
                    CeIusComputeDiv.i_gid == i_gid,
                    CeIusComputeDiv.u_gid == u_gid,
                    CeIusComputeDiv.s_gid == s_gid
                )
            ).first()
            
            if percent_formula:
                sep = get_ius_gid_separator()
                numerator_ius = sep.join(
                    (
                        percent_formula.num_i_gid,
                        percent_formula.num_u_gid,
                        percent_formula.num_s_gid,
                    )
                )
                denominator_ius = sep.join(
                    (
                        percent_formula.den_i_gid,
                        percent_formula.den_u_gid,
                        percent_formula.den_s_gid,
                    )
                )
                dm = percent_formula.den_multiplier
                den_multiplier_f: Optional[float] = None
                if dm is not None:
                    den_multiplier_f = float(dm)
                return {
                    "operation_type": OPERATION_PERCENT,
                    "formula_id": percent_formula.id,
                    "ius_name": translated_ius_name or percent_formula.ius_name,
                    "target_decimal": percent_formula.target_decimal,
                    "numerator_ius": numerator_ius,
                    "denominator_ius": denominator_ius,
                    "den_area_specific": bool(percent_formula.den_area_specific),
                    "den_area_id": percent_formula.den_area_id,
                    "den_area_name": percent_formula.den_area_name,
                    "den_multiplier": den_multiplier_f,
                    "is_most_recent": bool(percent_formula.is_most_recent),
                }
            
            # Check TIME formulas
            time_formula = dw_db.query(CeIusComputeTime).filter(
                and_(
                    CeIusComputeTime.dw_id == int(dw_id),
                    CeIusComputeTime.i_gid == i_gid,
                    CeIusComputeTime.u_gid == u_gid,
                    CeIusComputeTime.s_gid == s_gid
                )
            ).first()
            
            if time_formula:
                return {
                    "operation_type": OPERATION_TIME,
                    "formula_id": time_formula.id,
                    "ius_name": translated_ius_name or time_formula.ius_name,
                    "target_decimal": time_formula.target_decimal,
                    "target_tp_freq": time_formula.target_tp_freq,
                    "source_tp_freq": time_formula.source_tp_freq,
                    "aggregation_type": time_formula.aggregation_type,
                }
            
            # Check MINUS formulas
            minus_formula = dw_db.query(CeIusComputeMinus).filter(
                and_(
                    CeIusComputeMinus.dw_id == int(dw_id),
                    CeIusComputeMinus.i_gid == i_gid,
                    CeIusComputeMinus.u_gid == u_gid,
                    CeIusComputeMinus.s_gid == s_gid
                )
            ).first()
            
            if minus_formula:
                sep = get_ius_gid_separator()
                minuend_ius = sep.join(
                    (
                        minus_formula.min_i_gid,
                        minus_formula.min_u_gid,
                        minus_formula.min_s_gid,
                    )
                )
                subtrahend_ius = sep.join(
                    (
                        minus_formula.sub_i_gid,
                        minus_formula.sub_u_gid,
                        minus_formula.sub_s_gid,
                    )
                )
                return {
                    "operation_type": OPERATION_MINUS,
                    "formula_id": minus_formula.id,
                    "ius_name": translated_ius_name or minus_formula.ius_name,
                    "target_decimal": minus_formula.target_decimal,
                    "minuend_ius": minuend_ius,
                    "subtrahend_ius": subtrahend_ius,
                }

            # Check AREA formulas
            area_formula = dw_db.query(CeIusComputeArea).filter(
                and_(
                    CeIusComputeArea.dw_id == int(dw_id),
                    CeIusComputeArea.i_gid == i_gid,
                    CeIusComputeArea.u_gid == u_gid,
                    CeIusComputeArea.s_gid == s_gid
                )
            ).first()

            if area_formula:
                return {
                    "operation_type": OPERATION_AREA,
                    "formula_id": area_formula.id,
                    "ius_name": translated_ius_name or area_formula.ius_name,
                    "target_decimal": area_formula.target_decimal,
                    "target_area_level": area_formula.target_area_level,
                    "source_area_level": area_formula.source_area_level,
                    "aggregation_type": area_formula.aggregation_type,
                    "populate_mid_levels": bool(area_formula.populate_mid_levels),
                }

            return None

    def batch_subgroup_gids_with_compute_formula(
        self,
        dw_db: Session,
        dw_id: str,
        i_gid: str,
        unit_to_sg_gids: Dict[str, List[str]],
    ) -> Dict[str, List[str]]:
        """
        For one indicator GID, return per unit_gid the subgroup_val GIDs (in sg_gid list order)
        that have any compute row targeting that IUS (TOTAL / MINUS / PERCENT / TIME).
        """
        out: Dict[str, List[str]] = {
            u: [] for u in (unit_to_sg_gids or {}).keys()
        }
        ig = (i_gid or "").strip()
        if not ig:
            return out
        pair_tuples = list(
            dict.fromkeys(
                (u, s)
                for u, sgs in (unit_to_sg_gids or {}).items()
                for s in (sgs or [])
                if (u or "").strip() and (s or "").strip()
            )
        )
        if not pair_tuples:
            return out
        dw_int = int(dw_id)
        hits: set[Tuple[str, str]] = set()
        for model in (
            CeIusComputeAddTarget,
            CeIusComputeDiv,
            CeIusComputeMinus,
            CeIusComputeTime,
            CeIusComputeArea,
        ):
            rows = (
                dw_db.query(model.u_gid, model.s_gid)
                .filter(
                    and_(
                        model.dw_id == dw_int,
                        model.i_gid == ig,
                        tuple_(model.u_gid, model.s_gid).in_(pair_tuples),
                    )
                )
                .distinct()
                .all()
            )
            for u, s in rows:
                if u and s:
                    hits.add((u, s))
        for u, sgs in (unit_to_sg_gids or {}).items():
            ordered = [s for s in (sgs or []) if (s or "").strip()]
            out[u] = [s for s in ordered if (u, s) in hits]
        return out

    def _delete_any_formula_for_ius_session(
        self, dw_db: Session, dw_id: str, i_gid: str, u_gid: str, s_gid: str
    ) -> None:
        """
        Remove any compute formula for this target IUS within the open session so a save
        can replace it (same or different operation type). Order matches check_existing_formula.
        """
        dw_int = int(dw_id)
        target = (
            dw_db.query(CeIusComputeAddTarget)
            .filter(
                and_(
                    CeIusComputeAddTarget.dw_id == dw_int,
                    CeIusComputeAddTarget.i_gid == i_gid,
                    CeIusComputeAddTarget.u_gid == u_gid,
                    CeIusComputeAddTarget.s_gid == s_gid,
                )
            )
            .first()
        )
        if target:
            dw_db.query(CeIusComputeAddSource).filter(
                CeIusComputeAddSource.target_id == target.id
            ).delete()
            dw_db.delete(target)
            return

        percent_row = (
            dw_db.query(CeIusComputeDiv)
            .filter(
                and_(
                    CeIusComputeDiv.dw_id == dw_int,
                    CeIusComputeDiv.i_gid == i_gid,
                    CeIusComputeDiv.u_gid == u_gid,
                    CeIusComputeDiv.s_gid == s_gid,
                )
            )
            .first()
        )
        if percent_row:
            dw_db.delete(percent_row)
            return

        time_row = (
            dw_db.query(CeIusComputeTime)
            .filter(
                and_(
                    CeIusComputeTime.dw_id == dw_int,
                    CeIusComputeTime.i_gid == i_gid,
                    CeIusComputeTime.u_gid == u_gid,
                    CeIusComputeTime.s_gid == s_gid,
                )
            )
            .first()
        )
        if time_row:
            dw_db.delete(time_row)
            return

        minus_row = (
            dw_db.query(CeIusComputeMinus)
            .filter(
                and_(
                    CeIusComputeMinus.dw_id == dw_int,
                    CeIusComputeMinus.i_gid == i_gid,
                    CeIusComputeMinus.u_gid == u_gid,
                    CeIusComputeMinus.s_gid == s_gid,
                )
            )
            .first()
        )
        if minus_row:
            dw_db.delete(minus_row)
            return

        area_row = (
            dw_db.query(CeIusComputeArea)
            .filter(
                and_(
                    CeIusComputeArea.dw_id == dw_int,
                    CeIusComputeArea.i_gid == i_gid,
                    CeIusComputeArea.u_gid == u_gid,
                    CeIusComputeArea.s_gid == s_gid,
                )
            )
            .first()
        )
        if area_row:
            dw_db.delete(area_row)

    def save_total_formula(self, dw_id: str, formula_data: Dict[str, Any], language_code: str = "en") -> Dict[str, Any]:
        """
        Save a TOTAL formula configuration.
        
        Args:
            dw_id: Data warehouse ID
            formula_data: Formula configuration including target and sources
            language_code: Language code for IUS name resolution
            
        Returns:
            Dictionary with operation result
        """
        # Step 1: Format validation and source expansion
        target_ius = formula_data["target_ius"]
        sources = formula_data["sources"]
        
        # Validate target IUS format
        from apps.datawarehouse.utils.compute_ius_utils import IusUtils
        if not IusUtils.validate_ius_gid_format(target_ius):
            raise ValueError(f"Invalid target IUS format: {target_ius}")
        
        # Use source expansion service for IC/IU/IUS expansion
        expansion_service = SourceExpansionService()
        expanded_sources = expansion_service.expand_source_references(dw_id, sources, language_code)
        source_ius_list = [source["ius_gid"] for source in expanded_sources]
        
        logger.info(f"Expanded {len(sources)} source references to {len(source_ius_list)} IUS combinations")
        
        # Validate expanded source IUS formats
        for source_ius in source_ius_list:
            if not IusUtils.validate_ius_gid_format(source_ius):
                raise ValueError(f"Invalid source IUS format: {source_ius}")
        
        # Step 2: Existence validation
        all_ius = [target_ius] + source_ius_list
        resolved_names = IusUtils.resolve_ius_names(dw_id, all_ius, language_code)
        
        # Check target exists (all components must exist)
        target_data = resolved_names.get(target_ius, {})
        if not (target_data.get('indicator_exists') and target_data.get('unit_exists') and target_data.get('subgroup_exists')):
            missing_parts = []
            if not target_data.get('indicator_exists'):
                missing_parts.append('indicator')
            if not target_data.get('unit_exists'):
                missing_parts.append('unit')
            if not target_data.get('subgroup_exists'):
                missing_parts.append('subgroup')
            raise NotFound(f"Target IUS components not found in database: {', '.join(missing_parts)} for {target_ius}")
        
        # Check all sources exist (all components must exist)
        missing_sources = []
        for source_ius in source_ius_list:
            source_data = resolved_names.get(source_ius, {})
            if not (source_data.get('indicator_exists') and source_data.get('unit_exists') and source_data.get('subgroup_exists')):
                missing_parts = []
                if not source_data.get('indicator_exists'):
                    missing_parts.append('indicator')
                if not source_data.get('unit_exists'):
                    missing_parts.append('unit')
                if not source_data.get('subgroup_exists'):
                    missing_parts.append('subgroup')
                missing_sources.append(f"{source_ius} (missing: {', '.join(missing_parts)})")
        
        if missing_sources:
            raise NotFound(f"Source IUS components not found in database: {'; '.join(missing_sources)}")
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Extract target IUS components
                i_gid, u_gid, s_gid = parse_ius_gid(target_ius)

                self._delete_any_formula_for_ius_session(dw_db, dw_id, i_gid, u_gid, s_gid)

                # Step 3: Build IUS names using configurable separator
                name_separator = get_ius_gid_separator()
                target_resolved = resolved_names[target_ius]
                target_ius_name = f"{target_resolved['i_name']}{name_separator}{target_resolved['u_name']}{name_separator}{target_resolved['s_name']}"
                
                # Create target formula
                target_formula = CeIusComputeAddTarget(
                    dw_id=int(dw_id),
                    i_gid=i_gid,
                    u_gid=u_gid,
                    s_gid=s_gid,
                    ius_name=target_ius_name,
                    target_decimal=formula_data.get("target_decimal"),
                    order=formula_data.get("order", 1)
                )
                dw_db.add(target_formula)
                dw_db.flush()  # Get the ID
                
                # Create source formulas with resolved names
                source_count = 0
                for source_ius in source_ius_list:
                    source_i_gid, source_u_gid, source_s_gid = parse_ius_gid(source_ius)
                    
                    # Build source IUS name
                    source_resolved = resolved_names[source_ius]
                    source_ius_name = f"{source_resolved['i_name']}{name_separator}{source_resolved['u_name']}{name_separator}{source_resolved['s_name']}"
                    
                    source_formula = CeIusComputeAddSource(
                        dw_id=int(dw_id),
                        target_id=target_formula.id,
                        i_gid=source_i_gid,
                        u_gid=source_u_gid,
                        s_gid=source_s_gid,
                        ius_name=source_ius_name
                    )
                    dw_db.add(source_formula)
                    source_count += 1
                
                dw_db.commit()
                
                # Handle bulk operations if specified
                bulk_result = {}
                bulk_operations = formula_data.get("bulk_operations")
                if bulk_operations and bulk_operations.get("total_all_sub"):
                    try:
                        bulk_service = BulkOperationsService()
                        
                        # Prepare target data for bulk operation
                        target_data_for_bulk = {
                            "ius_gid": target_ius,
                            "target_decimal": formula_data.get("target_decimal"),
                            "order": formula_data.get("order", 1)
                        }
                        
                        # Prepare source data for bulk operation
                        source_data_for_bulk = [{"ius_gid": ius} for ius in source_ius_list]
                        
                        bulk_result = bulk_service.handle_match_ius_for_total(
                            dw_db, 
                            target_data_for_bulk, 
                            source_data_for_bulk, 
                            dw_id, 
                            bulk_operations.get("total_overwrite", False),
                            language_code
                        )
                        
                        logger.info(f"Bulk TOTAL operation completed: {bulk_result}")
                        
                    except Exception as e:
                        log_background_incident(
                            message=f"Bulk TOTAL operation failed: {e}",
                            error_code="FORMULA_BULK_TOTAL_FAILED",
                            exc=e,
                            source=_FORMULA_SERVICE_SOURCE,
                        )
                        # Don't fail the main operation if bulk fails
                        bulk_result = {"error": str(e)}
                
                result = {
                    "success": True,
                    "formula_id": target_formula.id,
                    "target_ius": target_ius,
                    "target_ius_name": target_ius_name,
                    "source_count": source_count,
                    "operation_type": OPERATION_TOTAL
                }
                
                if bulk_result:
                    result["bulk_operation"] = bulk_result
                
                return result
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to save TOTAL formula: {e}",
                    error_code="FORMULA_SAVE_TOTAL_FAILED",
                    exc=e,
                    source=_FORMULA_SERVICE_SOURCE,
                )
                raise
    
    def save_percent_formula(self, dw_id: str, formula_data: Dict[str, Any], language_code: str = "en") -> Dict[str, Any]:
        """
        Save a PERCENT formula configuration.
        """
        # Step 1: Format validation
        target_ius = formula_data["target_ius"]
        num_ius = formula_data["numerator_ius"]
        den_ius = formula_data["denominator_ius"]
        
        # Validate IUS formats
        from apps.datawarehouse.utils.compute_ius_utils import IusUtils
        for ius_gid, ius_type in [(target_ius, "target"), (num_ius, "numerator"), (den_ius, "denominator")]:
            if not IusUtils.validate_ius_gid_format(ius_gid):
                raise ValueError(f"Invalid {ius_type} IUS format: {ius_gid}")
        
        # Step 2: Existence validation
        all_ius = [target_ius, num_ius, den_ius]
        resolved_names = IusUtils.resolve_ius_names(dw_id, all_ius, language_code)
        
        # Check all IUS exist (all components must exist)
        for ius_gid, ius_type in [(target_ius, "target"), (num_ius, "numerator"), (den_ius, "denominator")]:
            ius_data = resolved_names.get(ius_gid, {})
            if not (ius_data.get('indicator_exists') and ius_data.get('unit_exists') and ius_data.get('subgroup_exists')):
                missing_parts = []
                if not ius_data.get('indicator_exists'):
                    missing_parts.append('indicator')
                if not ius_data.get('unit_exists'):
                    missing_parts.append('unit')
                if not ius_data.get('subgroup_exists'):
                    missing_parts.append('subgroup')
                raise NotFound(f"{ius_type.capitalize()} IUS components not found in database: {', '.join(missing_parts)} for {ius_gid}")
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Extract target IUS components
                i_gid, u_gid, s_gid = parse_ius_gid(target_ius)

                self._delete_any_formula_for_ius_session(dw_db, dw_id, i_gid, u_gid, s_gid)

                # Extract numerator and denominator components
                num_i_gid, num_u_gid, num_s_gid = parse_ius_gid(num_ius)
                den_i_gid, den_u_gid, den_s_gid = parse_ius_gid(den_ius)
                
                # Step 3: Build IUS names using configurable separator
                name_separator = get_ius_gid_separator()
                target_resolved = resolved_names[target_ius]
                target_ius_name = f"{target_resolved['i_name']}{name_separator}{target_resolved['u_name']}{name_separator}{target_resolved['s_name']}"
                
                num_resolved = resolved_names[num_ius]
                num_ius_name = f"{num_resolved['i_name']}{name_separator}{num_resolved['u_name']}{name_separator}{num_resolved['s_name']}"
                
                den_resolved = resolved_names[den_ius]
                den_ius_name = f"{den_resolved['i_name']}{name_separator}{den_resolved['u_name']}{name_separator}{den_resolved['s_name']}"
                
                # Create percent formula
                percent_formula = CeIusComputeDiv(
                    dw_id=int(dw_id),
                    i_gid=i_gid,
                    u_gid=u_gid,
                    s_gid=s_gid,
                    ius_name=target_ius_name,
                    num_i_gid=num_i_gid,
                    num_u_gid=num_u_gid,
                    num_s_gid=num_s_gid,
                    num_ius_name=num_ius_name,
                    den_i_gid=den_i_gid,
                    den_u_gid=den_u_gid,
                    den_s_gid=den_s_gid,
                    den_ius_name=den_ius_name,
                    target_decimal=formula_data.get("target_decimal"),
                    den_area_specific=formula_data.get("den_area_specific", False),
                    den_area_id=formula_data.get("den_area_id"),
                    den_area_name=formula_data.get("den_area_name"),
                    den_multiplier=formula_data.get("den_multiplier"),
                    is_most_recent=formula_data.get("is_most_recent", False)
                )
                dw_db.add(percent_formula)
                dw_db.commit()
                
                return {
                    "success": True,
                    "formula_id": percent_formula.id,
                    "target_ius": target_ius,
                    "target_ius_name": target_ius_name,
                    "operation_type": OPERATION_PERCENT
                }
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to save PERCENT formula: {e}",
                    error_code="FORMULA_SAVE_PERCENT_FAILED",
                    exc=e,
                    source=_FORMULA_SERVICE_SOURCE,
                )
                raise
    
    def save_minus_formula(self, dw_id: str, formula_data: Dict[str, Any], language_code: str = "en") -> Dict[str, Any]:
        """
        Save a MINUS formula configuration.
        """
        # Step 1: Format validation
        target_ius = formula_data["target_ius"]
        min_ius = formula_data["minuend_ius"]
        sub_ius = formula_data["subtrahend_ius"]
        
        # Validate IUS formats
        from apps.datawarehouse.utils.compute_ius_utils import IusUtils
        for ius_gid, ius_type in [(target_ius, "target"), (min_ius, "minuend"), (sub_ius, "subtrahend")]:
            if not IusUtils.validate_ius_gid_format(ius_gid):
                raise ValueError(f"Invalid {ius_type} IUS format: {ius_gid}")
        
        # Step 2: Existence validation
        all_ius = [target_ius, min_ius, sub_ius]
        resolved_names = IusUtils.resolve_ius_names(dw_id, all_ius, language_code)
        
        # Check all IUS exist (all components must exist)
        for ius_gid, ius_type in [(target_ius, "target"), (min_ius, "minuend"), (sub_ius, "subtrahend")]:
            ius_data = resolved_names.get(ius_gid, {})
            if not (ius_data.get('indicator_exists') and ius_data.get('unit_exists') and ius_data.get('subgroup_exists')):
                missing_parts = []
                if not ius_data.get('indicator_exists'):
                    missing_parts.append('indicator')
                if not ius_data.get('unit_exists'):
                    missing_parts.append('unit')
                if not ius_data.get('subgroup_exists'):
                    missing_parts.append('subgroup')
                raise NotFound(f"{ius_type.capitalize()} IUS components not found in database: {', '.join(missing_parts)} for {ius_gid}")
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Extract target IUS components
                i_gid, u_gid, s_gid = parse_ius_gid(target_ius)

                self._delete_any_formula_for_ius_session(dw_db, dw_id, i_gid, u_gid, s_gid)

                # Extract minuend and subtrahend components
                
                min_i_gid, min_u_gid, min_s_gid = parse_ius_gid(min_ius)
                sub_i_gid, sub_u_gid, sub_s_gid = parse_ius_gid(sub_ius)
                
                # Step 3: Build IUS names using configurable separator
                name_separator = get_ius_gid_separator()
                target_resolved = resolved_names[target_ius]
                target_ius_name = f"{target_resolved['i_name']}{name_separator}{target_resolved['u_name']}{name_separator}{target_resolved['s_name']}"
                
                min_resolved = resolved_names[min_ius]
                min_ius_name = f"{min_resolved['i_name']}{name_separator}{min_resolved['u_name']}{name_separator}{min_resolved['s_name']}"
                
                sub_resolved = resolved_names[sub_ius]
                sub_ius_name = f"{sub_resolved['i_name']}{name_separator}{sub_resolved['u_name']}{name_separator}{sub_resolved['s_name']}"
                
                # Create minus formula
                minus_formula = CeIusComputeMinus(
                    dw_id=int(dw_id),
                    i_gid=i_gid,
                    u_gid=u_gid,
                    s_gid=s_gid,
                    ius_name=target_ius_name,
                    min_i_gid=min_i_gid,
                    min_u_gid=min_u_gid,
                    min_s_gid=min_s_gid,
                    min_ius_name=min_ius_name,
                    sub_i_gid=sub_i_gid,
                    sub_u_gid=sub_u_gid,
                    sub_s_gid=sub_s_gid,
                    sub_ius_name=sub_ius_name,
                    target_decimal=formula_data.get("target_decimal")
                )
                dw_db.add(minus_formula)
                dw_db.commit()
                
                return {
                    "success": True,
                    "formula_id": minus_formula.id,
                    "target_ius": target_ius,
                    "target_ius_name": target_ius_name,
                    "operation_type": OPERATION_MINUS
                }
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to save MINUS formula: {e}",
                    error_code="FORMULA_SAVE_MINUS_FAILED",
                    exc=e,
                    source=_FORMULA_SERVICE_SOURCE,
                )
                raise
    
    def save_time_formula(self, dw_id: str, formula_data: Dict[str, Any], language_code: str = "en") -> Dict[str, Any]:
        """
        Save a TIME formula configuration.
        """
        # Step 1: Format validation
        target_ius = formula_data["target_ius"]
        
        # Validate IUS format
        from apps.datawarehouse.utils.compute_ius_utils import IusUtils
        if not IusUtils.validate_ius_gid_format(target_ius):
            raise ValueError(f"Invalid target IUS format: {target_ius}")
        
        # Step 2: Existence validation
        resolved_names = IusUtils.resolve_ius_names(dw_id, [target_ius], language_code)
        
        # Check target exists (all components must exist)
        target_data = resolved_names.get(target_ius, {})
        if not (target_data.get('indicator_exists') and target_data.get('unit_exists') and target_data.get('subgroup_exists')):
            missing_parts = []
            if not target_data.get('indicator_exists'):
                missing_parts.append('indicator')
            if not target_data.get('unit_exists'):
                missing_parts.append('unit')
            if not target_data.get('subgroup_exists'):
                missing_parts.append('subgroup')
            raise NotFound(f"Target IUS components not found in database: {', '.join(missing_parts)} for {target_ius}")
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Extract target IUS components
                i_gid, u_gid, s_gid = parse_ius_gid(target_ius)

                self._delete_any_formula_for_ius_session(dw_db, dw_id, i_gid, u_gid, s_gid)

                # Step 3: Build IUS name using configurable separator
                name_separator = get_ius_gid_separator()
                target_resolved = resolved_names[target_ius]
                target_ius_name = f"{target_resolved['i_name']}{name_separator}{target_resolved['u_name']}{name_separator}{target_resolved['s_name']}"
                
                # Create time formula
                time_formula = CeIusComputeTime(
                    dw_id=int(dw_id),
                    i_gid=i_gid,
                    u_gid=u_gid,
                    s_gid=s_gid,
                    ius_name=target_ius_name,
                    target_decimal=formula_data.get("target_decimal"),
                    target_tp_freq=formula_data["target_tp_freq"],
                    source_tp_freq=formula_data["source_tp_freq"],
                    aggregation_type=formula_data.get("aggregation_type", "sum")
                )
                dw_db.add(time_formula)
                dw_db.commit()
                
                # Handle bulk operations if specified
                bulk_result = {}
                bulk_operations = formula_data.get("bulk_operations")
                if bulk_operations:
                    try:
                        bulk_service = BulkOperationsService()
                        
                        # Prepare target data for bulk operation
                        target_data_for_bulk = {
                            "ius_gid": target_ius,
                            "target_decimal": formula_data.get("target_decimal"),
                            "target_tp_freq": formula_data["target_tp_freq"],
                            "source_tp_freq": formula_data["source_tp_freq"],
                            "aggregation_type": formula_data.get("aggregation_type", "sum")
                        }
                        
                        overwrite = bulk_operations.get("time_all_overwrite", False)
                        
                        if bulk_operations.get("time_all_sub"):
                            bulk_result = bulk_service.handle_match_ius_all_for_time(
                                dw_db, 
                                target_data_for_bulk, 
                                dw_id, 
                                overwrite,
                                language_code
                            )
                            logger.info(f"Bulk TIME (all) operation completed: {bulk_result}")
                        
                        elif bulk_operations.get("time_oth_sub"):
                            bulk_result = bulk_service.handle_match_ius_oth_for_time(
                                dw_db, 
                                target_data_for_bulk, 
                                dw_id, 
                                overwrite,
                                language_code
                            )
                            logger.info(f"Bulk TIME (other) operation completed: {bulk_result}")
                        
                    except Exception as e:
                        log_background_incident(
                            message=f"Bulk TIME operation failed: {e}",
                            error_code="FORMULA_BULK_TIME_FAILED",
                            exc=e,
                            source=_FORMULA_SERVICE_SOURCE,
                        )
                        # Don't fail the main operation if bulk fails
                        bulk_result = {"error": str(e)}
                
                result = {
                    "success": True,
                    "formula_id": time_formula.id,
                    "target_ius": target_ius,
                    "target_ius_name": target_ius_name,
                    "operation_type": OPERATION_TIME
                }
                
                if bulk_result:
                    result["bulk_operation"] = bulk_result
                
                return result
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to save TIME formula: {e}",
                    error_code="FORMULA_SAVE_TIME_FAILED",
                    exc=e,
                    source=_FORMULA_SERVICE_SOURCE,
                )
                raise

    def save_area_formula(self, dw_id: str, formula_data: Dict[str, Any], language_code: str = "en") -> Dict[str, Any]:
        """Save an AREA (spatial aggregation) formula configuration."""
        target_ius = formula_data["target_ius"]

        from apps.datawarehouse.utils.compute_ius_utils import IusUtils
        if not IusUtils.validate_ius_gid_format(target_ius):
            raise ValueError(f"Invalid target IUS format: {target_ius}")

        resolved_names = IusUtils.resolve_ius_names(dw_id, [target_ius], language_code)

        target_data = resolved_names.get(target_ius, {})
        if not (target_data.get('indicator_exists') and target_data.get('unit_exists') and target_data.get('subgroup_exists')):
            missing_parts = []
            if not target_data.get('indicator_exists'):
                missing_parts.append('indicator')
            if not target_data.get('unit_exists'):
                missing_parts.append('unit')
            if not target_data.get('subgroup_exists'):
                missing_parts.append('subgroup')
            raise NotFound(f"Target IUS components not found in database: {', '.join(missing_parts)} for {target_ius}")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                i_gid, u_gid, s_gid = parse_ius_gid(target_ius)

                self._delete_any_formula_for_ius_session(dw_db, dw_id, i_gid, u_gid, s_gid)

                name_separator = get_ius_gid_separator()
                target_resolved = resolved_names[target_ius]
                target_ius_name = f"{target_resolved['i_name']}{name_separator}{target_resolved['u_name']}{name_separator}{target_resolved['s_name']}"

                populate_flag = 1 if formula_data.get("populate_mid_levels") else 0

                area_formula = CeIusComputeArea(
                    dw_id=int(dw_id),
                    i_gid=i_gid,
                    u_gid=u_gid,
                    s_gid=s_gid,
                    ius_name=target_ius_name,
                    target_decimal=formula_data.get("target_decimal"),
                    target_area_level=formula_data["target_area_level"],
                    source_area_level=formula_data["source_area_level"],
                    aggregation_type=formula_data.get("aggregation_type", "sum"),
                    populate_mid_levels=populate_flag,
                )
                dw_db.add(area_formula)
                dw_db.commit()

                bulk_result = {}
                bulk_operations = formula_data.get("bulk_operations")
                if bulk_operations:
                    try:
                        bulk_service = BulkOperationsService()
                        target_data_for_bulk = {
                            "ius_gid": target_ius,
                            "target_decimal": formula_data.get("target_decimal"),
                            "target_area_level": formula_data["target_area_level"],
                            "source_area_level": formula_data["source_area_level"],
                            "aggregation_type": formula_data.get("aggregation_type", "sum"),
                            "populate_mid_levels": populate_flag,
                        }
                        overwrite = bulk_operations.get("area_all_overwrite", False)

                        if bulk_operations.get("area_all_sub"):
                            bulk_result = bulk_service.handle_match_ius_all_for_area(
                                dw_db, target_data_for_bulk, dw_id, overwrite, language_code
                            )
                        elif bulk_operations.get("area_oth_sub"):
                            bulk_result = bulk_service.handle_match_ius_oth_for_area(
                                dw_db, target_data_for_bulk, dw_id, overwrite, language_code
                            )
                    except Exception as e:
                        log_background_incident(
                            message=f"Bulk AREA operation failed: {e}",
                            error_code="FORMULA_BULK_AREA_FAILED",
                            exc=e,
                            source=_FORMULA_SERVICE_SOURCE,
                        )
                        bulk_result = {"error": str(e)}

                result = {
                    "success": True,
                    "formula_id": area_formula.id,
                    "target_ius": target_ius,
                    "target_ius_name": target_ius_name,
                    "operation_type": OPERATION_AREA,
                }
                if bulk_result:
                    result["bulk_operation"] = bulk_result
                return result

            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to save AREA formula: {e}",
                    error_code="FORMULA_SAVE_AREA_FAILED",
                    exc=e,
                    source=_FORMULA_SERVICE_SOURCE,
                )
                raise

    def delete_formula(self, dw_id: str, operation_type: str, formula_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Delete a formula configuration.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                target_ius = formula_data["target_ius"]
                i_gid, u_gid, s_gid = parse_ius_gid(target_ius)
                
                deleted_count = 0
                
                if operation_type == OPERATION_TOTAL:
                    # Delete sources first (foreign key constraint)
                    target = dw_db.query(CeIusComputeAddTarget).filter(
                        and_(
                            CeIusComputeAddTarget.dw_id == int(dw_id),
                            CeIusComputeAddTarget.i_gid == i_gid,
                            CeIusComputeAddTarget.u_gid == u_gid,
                            CeIusComputeAddTarget.s_gid == s_gid
                        )
                    ).first()
                    
                    if target:
                        # Delete sources
                        sources_deleted = dw_db.query(CeIusComputeAddSource).filter(
                            CeIusComputeAddSource.target_id == target.id
                        ).delete()
                        
                        # Delete target
                        dw_db.delete(target)
                        deleted_count = sources_deleted + 1
                
                elif operation_type == OPERATION_PERCENT:
                    deleted_count = dw_db.query(CeIusComputeDiv).filter(
                        and_(
                            CeIusComputeDiv.dw_id == int(dw_id),
                            CeIusComputeDiv.i_gid == i_gid,
                            CeIusComputeDiv.u_gid == u_gid,
                            CeIusComputeDiv.s_gid == s_gid
                        )
                    ).delete()
                
                elif operation_type == OPERATION_TIME:
                    deleted_count = dw_db.query(CeIusComputeTime).filter(
                        and_(
                            CeIusComputeTime.dw_id == int(dw_id),
                            CeIusComputeTime.i_gid == i_gid,
                            CeIusComputeTime.u_gid == u_gid,
                            CeIusComputeTime.s_gid == s_gid
                        )
                    ).delete()
                
                elif operation_type == OPERATION_MINUS:
                    deleted_count = dw_db.query(CeIusComputeMinus).filter(
                        and_(
                            CeIusComputeMinus.dw_id == int(dw_id),
                            CeIusComputeMinus.i_gid == i_gid,
                            CeIusComputeMinus.u_gid == u_gid,
                            CeIusComputeMinus.s_gid == s_gid
                        )
                    ).delete()

                elif operation_type == OPERATION_AREA:
                    deleted_count = dw_db.query(CeIusComputeArea).filter(
                        and_(
                            CeIusComputeArea.dw_id == int(dw_id),
                            CeIusComputeArea.i_gid == i_gid,
                            CeIusComputeArea.u_gid == u_gid,
                            CeIusComputeArea.s_gid == s_gid
                        )
                    ).delete()

                dw_db.commit()
                
                return {
                    "success": True,
                    "deleted_count": deleted_count,
                    "target_ius": target_ius,
                    "operation_type": operation_type
                }
                
            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to delete formula: {e}",
                    error_code="FORMULA_DELETE_FAILED",
                    exc=e,
                    source=_FORMULA_SERVICE_SOURCE,
                )
                raise
    
    def resolve_ius_names(self, dw_id: str, ius_gids: List[str], language_code: Optional[str] = None) -> Dict[str, str]:
        """
        Resolve IUS GIDs to human-readable names.
        
        Args:
            dw_id: Data warehouse ID
            ius_gids: List of IUS GID strings
            language_code: Language code for locale-specific models (optional)
            
        Returns:
            Dictionary mapping IUS GIDs to names
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            result = {}
            
            # Get locale for this data warehouse
            if language_code is None:
                from apps.datawarehouse.models.datawarehouse import get_default_locale
                language_code = get_default_locale(dw_db)
            
            # Create locale-specific model classes
            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)
            SubgroupModel = SubgroupVal(language_code)
            
            for ius_gid in ius_gids:
                try:
                    i_gid, u_gid, s_gid = parse_ius_gid(ius_gid)
                    
                    # Query indicator, unit, and subgroup names
                    indicator = dw_db.query(IndicatorModel).filter(IndicatorModel.indicator_gid == i_gid).first()
                    unit = dw_db.query(UnitModel).filter(UnitModel.unit_gid == u_gid).first()
                    subgroup = dw_db.query(SubgroupModel).filter(SubgroupModel.subgroup_val_gid == s_gid).first()
                    
                    # Construct name
                    parts = []
                    if indicator:
                        parts.append(getattr(indicator, 'indicator_name', i_gid))
                    if unit:
                        parts.append(getattr(unit, 'unit_name', u_gid))
                    if subgroup:
                        parts.append(getattr(subgroup, 'subgroup_val', s_gid))
                    
                    result[ius_gid] = " - ".join(parts) if parts else ius_gid
                    
                except ValueError:
                    # Invalid IUS format
                    result[ius_gid] = ius_gid
            
            return result