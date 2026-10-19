"""
Compute Operations Service for Compute Engine.

This service implements the core computation algorithms matching Laravel logic exactly:
- TOTAL: Sum aggregation with source expansion
- PERCENT: Ratio calculations with area-specific denominators
- MINUS: Subtraction operations
- TIME: Temporal aggregation with frequency conversion
- Decimal precision handling
- Source attribution and metadata creation
"""

import json
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import and_, text, func, or_

from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
    OPERATION_AREA,
    PERIODICITY_MAP, DEFAULT_DECIMAL_PLACES,
    JOB_STATUS_PASSED, JOB_STATUS_FAILED, STATUS_DONE
)
from apps.shared.utils.ius_utils import get_ius_gid_separator, parse_ius_gid, build_ius_gid
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    CeIusComputeAddTarget, CeIusComputeAddSource, CeIusComputeDiv,
    CeIusComputeMinus, CeIusComputeTime, CeIusComputeArea, CeProcessTimeLog,
    Data, IndicatorUnitSubgroup,
    TimePeriod, Indicator, Unit, SubgroupVal, Area
)
from apps.shared.exceptions import NotFound
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_COMPUTE_OPS_SOURCE = "apps.datawarehouse.services.compute_operations"


class ComputeOperationsService:
    """Service for executing compute engine operations."""
    
    def __init__(self):
        pass
    
    def _resolve_gid_to_nid(self, dw_db: Session, model_class: Any, gid_column: str, nid_column: str, gid: str, locale: str = None) -> int:
        """Resolve a single GID to its corresponding NID."""
        if locale:
            # For locale-specific models (Indicator, Unit, SubgroupVal, Area)
            model = model_class(locale)
        else:
            # For non-locale models (TimePeriod)
            model = model_class
        
        gid_attr = getattr(model, gid_column)
        nid_attr = getattr(model, nid_column)
        
        row = dw_db.query(nid_attr).filter(gid_attr == gid).first()
        
        if not row or row[0] is None:
            raise NotFound(f"GID not found: {gid_column}={gid}")
        
        return int(row[0])
    
    def _area_id_to_nid(self, dw_db: Session, area_id: str, locale: str) -> int:
        """
        Convert area_id to area_nid with enhanced Laravel-style resolution.
        
        Enhanced to match Laravel's area resolution logic with proper table joins
        and support for area-specific denominator handling in PERCENT operations.
        """
        return self._enhanced_area_resolution(dw_db, area_id, locale)
    
    def _enhanced_area_resolution(self, dw_db: Session, area_id: str, locale: str) -> int:
        """
        Enhanced area resolution matching Laravel logic with multiple fallback methods.
        
        This implements Laravel's sophisticated area resolution with:
        - Direct area_id lookup
        - Numeric area_nid fallback
        - DEFAULT area mapping
        - Area inheritance rules
        """
        if area_id == "DEFAULT":
            # Handle legacy DEFAULT case - map to a specific default area
            # In Laravel, this might map to a system-wide default area
            logger.info("Resolving DEFAULT area_id to system default")
            return self._get_default_area_nid(dw_db, locale)
        
        try:
            area_model = Area(locale)
            
            # Primary lookup: area_id to area_nid
            row = dw_db.query(area_model.area_nid).filter(area_model.area_id == area_id).first()
            
            if row and row[0] is not None:
                logger.debug(f"Resolved area_id {area_id} to area_nid {row[0]}")
                return int(row[0])
            
            # Fallback 1: Check if it's a numeric area_nid already (Laravel compatibility)
            try:
                area_nid = int(area_id)
                # Verify this area_nid exists
                area_check = dw_db.query(area_model.area_nid).filter(area_model.area_nid == area_nid).first()
                if area_check:
                    logger.info(f"Using numeric area_id {area_id} as area_nid directly")
                    return area_nid
            except ValueError:
                pass
            
            # Fallback 2: Try area name lookup (Laravel sometimes uses area names)
            area_by_name = dw_db.query(area_model.area_nid).filter(area_model.area_name == area_id).first()
            if area_by_name and area_by_name[0] is not None:
                logger.info(f"Resolved area_id {area_id} by area_name to area_nid {area_by_name[0]}")
                return int(area_by_name[0])
            
            # Fallback 3: Try case-insensitive lookup
            area_case_insensitive = dw_db.query(area_model.area_nid).filter(
                func.lower(area_model.area_id) == area_id.lower()
            ).first()
            if area_case_insensitive and area_case_insensitive[0] is not None:
                logger.info(f"Resolved area_id {area_id} with case-insensitive lookup to area_nid {area_case_insensitive[0]}")
                return int(area_case_insensitive[0])
            
            raise NotFound(f"Area not found: area_id={area_id}")
            
        except Exception as e:
            log_background_incident(
                message=f"Failed to resolve area_id to area_nid: {e}",
                error_code="COMPUTE_AREA_RESOLVE_FAILED",
                exc=e,
                source=_COMPUTE_OPS_SOURCE,
            )
            raise ValueError(f"Could not resolve area_id {area_id}: {str(e)}")
    
    def _get_default_area_nid(self, dw_db: Session, locale: str) -> int:
        """Get the default area NID for the system."""
        try:
            area_model = Area(locale)
            # Look for common default area identifiers
            default_candidates = ["DEFAULT", "ALL", "TOTAL", "WORLD", "GLOBAL"]
            
            for candidate in default_candidates:
                area = dw_db.query(area_model.area_nid).filter(
                    or_(
                        area_model.area_id == candidate,
                        area_model.area_name == candidate
                    )
                ).first()
                if area and area[0] is not None:
                    logger.info(f"Found default area: {candidate} -> area_nid {area[0]}")
                    return int(area[0])
            
            # If no default found, use the first area (fallback)
            first_area = dw_db.query(area_model.area_nid).order_by(area_model.area_nid).first()
            if first_area and first_area[0] is not None:
                logger.warning(f"Using first available area as default: area_nid {first_area[0]}")
                return int(first_area[0])
            
            raise ValueError("No areas found in database")
            
        except Exception as e:
            log_background_incident(
                message=f"Failed to get default area NID: {e}",
                error_code="COMPUTE_DEFAULT_AREA_NID_FAILED",
                exc=e,
                source=_COMPUTE_OPS_SOURCE,
            )
            raise
    
    def _apply_area_specific_denominator_logic(self, percent_formula, area_id: str) -> str:
        """
        Apply Laravel's sophisticated area-specific denominator logic.
        
        This handles:
        - Area-specific denominator selection
        - Area multiplier calculations  
        - Area inheritance rules
        - Default area fallback behavior
        """
        if not percent_formula.den_area_specific:
            return area_id
        
        # Use specified denominator area
        if percent_formula.den_area_id:
            logger.info(f"Using area-specific denominator area: {percent_formula.den_area_id} instead of {area_id}")
            return percent_formula.den_area_id
        
        # Fallback to original area if no specific area configured
        logger.warning(f"Area-specific denominator enabled but no den_area_id specified, using original area: {area_id}")
        return area_id
    
    def _timeperiod_to_nid(self, dw_db: Session, timeperiod: str) -> int:
        """
        Convert timeperiod string to timeperiod_nid.
        
        Note: Since 'all' is now expanded to specific timeperiod strings in job generation,
        this method should only receive specific timeperiod strings, never 'all' or 'DEFAULT'.
        """
        if timeperiod == "DEFAULT":
            # Handle legacy DEFAULT case
            raise ValueError(f"Unexpected 'DEFAULT' timeperiod - should be expanded to specific timeperiod strings")
        
        row = dw_db.query(TimePeriod.timeperiod_nid).filter(TimePeriod.timeperiod == timeperiod).first()
        
        if not row or row[0] is None:
            raise NotFound(f"Timeperiod not found: timeperiod={timeperiod}")
        
        return int(row[0])
    
    def _get_or_create_iusnid(self, dw_db: Session, indicator_nid: int, unit_nid: int, subgroup_val_nid: int) -> int:
        """Get existing or create new IUS combination and return iusnid."""
        # First try to find existing combination
        existing = dw_db.query(IndicatorUnitSubgroup).filter(
            and_(
                IndicatorUnitSubgroup.indicator_nid == indicator_nid,
                IndicatorUnitSubgroup.unit_nid == unit_nid,
                IndicatorUnitSubgroup.subgroup_val_nid == subgroup_val_nid
            )
        ).first()
        
        if existing:
            return existing.iusnid
        
        # Create new IUS combination
        new_ius = IndicatorUnitSubgroup(
            indicator_nid=indicator_nid,
            unit_nid=unit_nid,
            subgroup_val_nid=subgroup_val_nid,
            min_value=0,
            max_value=0,
            data_exist=False,
            isdefaultsubgroup=False
        )
        dw_db.add(new_ius)
        dw_db.flush()  # Get the ID without committing
        return new_ius.iusnid
    
    def execute_total_operation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute TOTAL operation (sum aggregation) with Laravel's exact logic.

        Laravel's handleTotalType:
        1. Resolves all source IUSNIDs upfront
        2. Fires a single SQL query: SUM(data_value) GROUP BY timeperiod_nid across all source IUSNIDs
        3. Only stores/logs a result row for time periods that actually have source data
        4. Logs ALL requested time periods — PASSED if data found, FAILED otherwise
        5. For logging: re-queries each source individually to build source_details
        """
        dw_id = payload["dw_id"]
        ius_gid = payload["ius_gid"]
        area_id = payload["area_id"]
        time_period = payload["time_period"]
        table_name = payload["table_name"]

        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Parse IUS
                i_gid, u_gid, s_gid = parse_ius_gid(ius_gid)

                # Get default locale
                from apps.datawarehouse.models.datawarehouse import get_default_locale
                locale = get_default_locale(dw_db)

                # Get TOTAL formula
                target_formula = dw_db.query(CeIusComputeAddTarget).filter(
                    and_(
                        CeIusComputeAddTarget.dw_id == int(dw_id),
                        CeIusComputeAddTarget.i_gid == i_gid,
                        CeIusComputeAddTarget.u_gid == u_gid,
                        CeIusComputeAddTarget.s_gid == s_gid
                    )
                ).first()

                if not target_formula:
                    raise NotFound(f"TOTAL formula not found for IUS: {ius_gid}")

                # Get source formulas
                source_formulas = dw_db.query(CeIusComputeAddSource).filter(
                    CeIusComputeAddSource.target_id == target_formula.id
                ).all()

                if not source_formulas:
                    raise ValueError(f"No source formulas found for target: {target_formula.id}")

                # Resolve area and time period NIDs
                area_nid = self._area_id_to_nid(dw_db, area_id, locale)
                timeperiod_nid = self._timeperiod_to_nid(dw_db, time_period)

                # Resolve all source IUSNIDs upfront (Laravel: foreach($sourceIUS as $srcGid))
                source_iusnids = []
                sources_for_log = {}   # gid -> resolved NID info for logging
                for source in source_formulas:
                    indicator_nid = self._resolve_gid_to_nid(dw_db, Indicator, "indicator_gid", "indicator_nid", source.i_gid, locale)
                    unit_nid = self._resolve_gid_to_nid(dw_db, Unit, "unit_gid", "unit_nid", source.u_gid, locale)
                    subgroup_val_nid = self._resolve_gid_to_nid(dw_db, SubgroupVal, "subgroup_val_gid", "subgroup_val_nid", source.s_gid, locale)
                    if all([indicator_nid, unit_nid, subgroup_val_nid]):
                        iusnid = self._get_or_create_iusnid(dw_db, indicator_nid, unit_nid, subgroup_val_nid)
                        source_iusnids.append(iusnid)
                        gid = build_ius_gid(source.i_gid, source.u_gid, source.s_gid)
                        sources_for_log[gid] = {
                            "iusnid": iusnid,
                            "ius_name": source.ius_name
                        }

                # MAX(data_nid) per iusnid to pick the most recently inserted
                # row for each source IUS, then SUM those values.
                # Prevents double-counting when multiple sources exist.
                calc_data_for_log = {}   # timeperiod_nid -> {data_value, source_nid}

                if source_iusnids:
                    max_data_sq = dw_db.query(
                        Data.iusnid,
                        func.max(Data.data_nid).label("max_data_nid"),
                    ).filter(
                        and_(
                            Data.iusnid.in_(source_iusnids),
                            Data.area_nid == area_nid,
                            Data.timeperiod_nid == timeperiod_nid,
                        )
                    ).group_by(Data.iusnid).subquery()

                    aggregated_rows = dw_db.query(
                        Data.timeperiod_nid,
                        func.sum(Data.data_value).label("data_value"),
                    ).join(
                        max_data_sq,
                        Data.data_nid == max_data_sq.c.max_data_nid,
                    ).group_by(Data.timeperiod_nid).all()

                    # BUG FIX #2: Only store when source data actually exists (Laravel: foreach($data as $dt))
                    publisher = payload.get("src_publisher", "DFA")
                    title = payload.get("src_title", "Calculated")

                    for row in aggregated_rows:
                        raw_value = row.data_value
                        if raw_value is None:
                            continue

                        summed_value = Decimal(str(raw_value))

                        # Apply decimal precision
                        if target_formula.target_decimal is not None:
                            summed_value = self._apply_decimal_precision(summed_value, target_formula.target_decimal)

                        computed_value = float(summed_value)

                        # Get or create source NID (Laravel: $sourceNid = $this->getSourceNid(..., $dt->timeperiod_nid))
                        source_nid = self._get_or_create_source_nid(dw_db, publisher, title, time_period, dw_id=dw_id)

                        # Store result (Laravel: updateOrInsert)
                        self._store_computed_value(
                            dw_db, dw_id, i_gid, u_gid, s_gid, area_id, time_period,
                            computed_value, source_nid, OPERATION_TOTAL
                        )

                        calc_data_for_log[timeperiod_nid] = {
                            "data_value": computed_value,
                            "source_name": source_nid
                        }

                        logger.info(f"TOTAL computation completed for time_period={time_period}: sum={computed_value}")

                # BUG FIX #3 + #4: Log ALL requested time periods with proper status and
                # re-query each source for detailed source_details (Laravel's createLogForTotal)
                source_list = self._get_source_list(dw_db)
                area_name = payload.get("area_name", area_id)

                # Build source_details by re-querying each source for actual stored data
                source_details = []
                for gid, src_info in sources_for_log.items():
                    src_row = dw_db.query(Data).filter(
                        and_(
                            Data.iusnid == src_info["iusnid"],
                            Data.area_nid == area_nid,
                            Data.timeperiod_nid == timeperiod_nid
                        )
                    ).order_by(Data.data_nid.desc()).first()

                    src_nid = src_row.source_nid if src_row else None
                    src_label = (
                        source_list.get(src_nid, "") if src_nid is not None else ""
                    )
                    source_details.append({
                        "type": "TOTAL",
                        "gid": gid,
                        "name": src_info["ius_name"],
                        "area": area_name,
                        "timeperiod": time_period,
                        "source": src_label,
                        "source_nid": src_nid,
                        "dv": src_row.data_value if src_row else None,
                    })

                # Determine status (Laravel: isset($dataArray[$timeperiods[$i]]))
                time_period_payload = payload.copy()
                time_period_payload["time_period"] = time_period

                if timeperiod_nid in calc_data_for_log:
                    calc_data = calc_data_for_log[timeperiod_nid]
                    log_status = "PASSED"
                    log_value = calc_data["data_value"]
                    log_remarks = ""
                    time_period_payload["source_nid"] = calc_data["source_name"]
                else:
                    log_status = "FAILED"
                    log_value = None
                    log_remarks = "Source Values not available"

                self._create_computation_log(
                    dw_db, table_name, "TOTAL", time_period_payload,
                    log_value, source_details,
                    status=log_status, remarks=log_remarks,
                    resolve_source_names=True
                )

                job_outcome = JOB_STATUS_PASSED if log_status == "PASSED" else JOB_STATUS_FAILED
                self._update_job_status(dw_db, table_name, payload, job_outcome)

                return {
                    "success": log_status == "PASSED",
                    "operation": OPERATION_TOTAL,
                    "ius_gid": ius_gid,
                    "area_id": area_id,
                    "time_period": time_period,
                    "computed_value": calc_data_for_log.get(timeperiod_nid, {}).get("data_value"),
                    "source_count": len(source_iusnids),
                    "data_found": timeperiod_nid in calc_data_for_log
                }

            except Exception as e:
                log_background_incident(
                    message=f"TOTAL operation failed: {e}",
                    error_code="COMPUTE_TOTAL_OPERATION_FAILED",
                    exc=e,
                    source=_COMPUTE_OPS_SOURCE,
                )
                self._update_job_status(dw_db, table_name, payload, JOB_STATUS_FAILED, str(e))
                raise
    
    def execute_percent_operation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute PERCENT operation (ratio calculation) with Laravel's exact logic.
        
        Laravel's handleDivType can process multiple time periods within a single job,
        though CreateJobs typically creates separate jobs for each period.
        This matches Laravel's handleDivType method structure exactly.
        
        Args:
            payload: Job payload containing operation parameters
            
        Returns:
            Dictionary with operation result
        """
        dw_id = payload["dw_id"]
        ius_gid = payload["ius_gid"]
        area_id = payload["area_id"]
        time_period = payload["time_period"]  # Single period from job payload
        table_name = payload["table_name"]
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Parse IUS
                i_gid, u_gid, s_gid = parse_ius_gid(ius_gid)
                
                # Get PERCENT formula
                percent_formula = dw_db.query(CeIusComputeDiv).filter(
                    and_(
                        CeIusComputeDiv.dw_id == int(dw_id),
                        CeIusComputeDiv.i_gid == i_gid,
                        CeIusComputeDiv.u_gid == u_gid,
                        CeIusComputeDiv.s_gid == s_gid
                    )
                ).first()
                
                if not percent_formula:
                    raise NotFound(f"PERCENT formula not found for IUS: {ius_gid}")
                
                from apps.datawarehouse.models.datawarehouse import get_default_locale
                locale = get_default_locale(dw_db)
                area_name = payload.get("area_name", area_id)

                # Laravel approach: Get numerator data first — using full record to distinguish
                # "no row" from "row with value 0" (important for most_recent logic)
                # $numData = $dwConn->table('ut_data')->select([...])->first()
                numerator_record = self._get_data_value(
                    dw_db, dw_id, percent_formula.num_i_gid, percent_formula.num_u_gid,
                    percent_formula.num_s_gid, area_id, time_period, return_full_record=True
                )
                numerator_value = numerator_record["data_value"] if numerator_record else None

                # Laravel approach: Get denominator data (may be area-specific)
                denominator_area = self._apply_area_specific_denominator_logic(percent_formula, area_id)

                # Use full record for denominator — to distinguish absent row from zero value
                # Laravel: if(empty($denomData) && $isMostRecent) — $denomData is the whole row object
                denominator_record = self._get_data_value(
                    dw_db, dw_id, percent_formula.den_i_gid, percent_formula.den_u_gid,
                    percent_formula.den_s_gid, denominator_area, time_period, return_full_record=True
                )
                denominator_value = denominator_record["data_value"] if denominator_record else None

                # Laravel's "Most Recent Data" feature — fallback ONLY when the row is absent
                # Laravel: if(empty($denomData) && $isMostRecent)
                # empty($denomData) means the row was not found at all, NOT that value == 0
                if denominator_record is None and percent_formula.is_most_recent:
                    logger.info(f"Denominator row absent for {percent_formula.den_i_gid}|{percent_formula.den_u_gid}|{percent_formula.den_s_gid}, time_period={time_period}, trying most recent data")

                    denominator_value = self._get_most_recent_data(
                        dw_db, percent_formula.den_i_gid, percent_formula.den_u_gid,
                        percent_formula.den_s_gid, denominator_area, locale
                    )

                    if denominator_value is not None:
                        logger.info(f"Using most recent denominator value: {denominator_value}")

                # Laravel approach: Only calculate if BOTH data objects exist AND denominator != 0
                # if($numData && $denomData) { ... $targetValue = $num / $denom * multiplier ... }
                computed_value = None
                calculation_performed = False
                source_nid = None

                if (numerator_value is not None and denominator_value is not None and
                        denominator_value != 0):

                    # Laravel: ($numData->data_value / $denomData->data_value) * multiplier
                    ratio = Decimal(str(numerator_value)) / Decimal(str(denominator_value))

                    # Laravel: * (!empty($denominatorMultiplier) ? $denominatorMultiplier : 1)
                    if percent_formula.den_multiplier:
                        ratio *= Decimal(str(percent_formula.den_multiplier))
                    # else multiplier is 1 — no-op

                    # Apply decimal precision (Laravel's doDecimals)
                    if percent_formula.target_decimal is not None:
                        ratio = self._apply_decimal_precision_laravel_compatible(ratio, percent_formula.target_decimal)

                    computed_value = float(ratio)
                    calculation_performed = True

                    publisher = payload.get("src_publisher", "DFA")
                    title = payload.get("src_title", "Calculated")

                    source_nid = self._get_or_create_source_nid(dw_db, publisher, title, time_period, dw_id=dw_id)

                    self._store_computed_value(
                        dw_db, dw_id, i_gid, u_gid, s_gid, area_id, time_period,
                        computed_value, source_nid, OPERATION_PERCENT
                    )

                    logger.info(f"PERCENT calculation performed: {numerator_value} / {denominator_value} * {percent_formula.den_multiplier or 1} = {computed_value}")
                else:
                    if numerator_value is None:
                        logger.info(f"PERCENT calculation skipped: numerator data missing for {percent_formula.num_i_gid}|{percent_formula.num_u_gid}|{percent_formula.num_s_gid}")
                    elif denominator_value is None:
                        logger.info(f"PERCENT calculation skipped: denominator row absent for {percent_formula.den_i_gid}|{percent_formula.den_u_gid}|{percent_formula.den_s_gid}")
                    elif denominator_value == 0:
                        logger.info(f"PERCENT calculation skipped: denominator is zero for {percent_formula.den_i_gid}|{percent_formula.den_u_gid}|{percent_formula.den_s_gid}")

                # Build source details matching Laravel's createLogForPercent structure
                # Laravel: $sourcesForLog[$tpNid][gid] = {type, gid, name, area, timeperiod, source, dv}
                source_list = self._get_source_list(dw_db)
                num_gid = build_ius_gid(percent_formula.num_i_gid, percent_formula.num_u_gid, percent_formula.num_s_gid)
                den_gid = build_ius_gid(percent_formula.den_i_gid, percent_formula.den_u_gid, percent_formula.den_s_gid)

                source_details = [
                    {
                        "type": "NUMERATOR",
                        "gid": num_gid,
                        "name": percent_formula.num_ius_name,
                        "area": area_name,
                        "timeperiod": time_period,
                        "source": source_list.get(numerator_record["source_nid"], "") if numerator_record else "",
                        "dv": numerator_value
                    },
                    {
                        "type": "DENOMINATOR",
                        "gid": den_gid,
                        "name": percent_formula.den_ius_name,
                        "area": area_name,
                        "timeperiod": time_period,
                        "source": source_list.get(denominator_record["source_nid"], "") if denominator_record else "",
                        "dv": denominator_value
                    }
                ]

                # Determine log status (Laravel: PASSED if calculated, FAILED if skipped)
                if calculation_performed:
                    log_status = "PASSED"
                    log_remarks = ""
                    payload_with_source = payload.copy()
                    payload_with_source["source_nid"] = source_nid
                else:
                    log_status = "FAILED"
                    log_remarks = "Source Values not available"
                    payload_with_source = payload

                self._create_computation_log(
                    dw_db, table_name, "PERCENT", payload_with_source, computed_value, source_details,
                    status=log_status, remarks=log_remarks, resolve_source_names=True
                )

                job_outcome = JOB_STATUS_PASSED if log_status == "PASSED" else JOB_STATUS_FAILED
                self._update_job_status(dw_db, table_name, payload, job_outcome)
                
                return {
                    "success": calculation_performed,
                    "operation": OPERATION_PERCENT,
                    "ius_gid": ius_gid,
                    "area_id": area_id,
                    "time_period": time_period,
                    "computed_value": computed_value,
                    "calculation_performed": calculation_performed,
                    "numerator_value": float(numerator_value) if numerator_value is not None else None,
                    "denominator_value": float(denominator_value) if denominator_value is not None else None,
                    "denominator_area": denominator_area
                }
                
            except Exception as e:
                log_background_incident(
                    message=f"PERCENT operation failed: {e}",
                    error_code="COMPUTE_PERCENT_OPERATION_FAILED",
                    exc=e,
                    source=_COMPUTE_OPS_SOURCE,
                )
                self._update_job_status(dw_db, table_name, payload, JOB_STATUS_FAILED, str(e))
                raise
    
    def execute_minus_operation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute MINUS operation (subtraction) with Laravel's exact logic.

        Laravel loops through multiple time periods and only calculates when both
        minuend and subtrahend rows exist with non-null ``data_value`` (same as
        PERCENT's value-level guard). Missing rows or NULL values skip storage.

        Args:
            payload: Job payload containing operation parameters

        Returns:
            Dictionary with operation result
        """
        dw_id = payload["dw_id"]
        ius_gid = payload["ius_gid"]
        area_id = payload["area_id"]
        
        # Laravel creates individual jobs per time period, so we process the single time_period
        time_period = payload.get("time_period")
        timeperiods = [time_period] if time_period else []
        
        table_name = payload["table_name"]
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Parse IUS
                i_gid, u_gid, s_gid = parse_ius_gid(ius_gid)
                
                # Get MINUS formula
                minus_formula = dw_db.query(CeIusComputeMinus).filter(
                    and_(
                        CeIusComputeMinus.dw_id == int(dw_id),
                        CeIusComputeMinus.i_gid == i_gid,
                        CeIusComputeMinus.u_gid == u_gid,
                        CeIusComputeMinus.s_gid == s_gid
                    )
                ).first()
                
                if not minus_formula:
                    raise NotFound(f"MINUS formula not found for IUS: {ius_gid}")
                
                calc_data_for_log = {}
                sources_for_log = {}
                
                # Laravel's multi-period processing: foreach($timeperiods as $tpNid)
                for i, time_period in enumerate(timeperiods):
                    if not time_period:
                        continue
                        
                    logger.info(f"Processing MINUS for time_period: {time_period}")
                    
                    # Get minuend data (Laravel: $minuendData = $dwConn->table('ut_data')->...)
                    minuend_data = self._get_data_value(
                        dw_db, dw_id, minus_formula.min_i_gid, minus_formula.min_u_gid,
                        minus_formula.min_s_gid, area_id, time_period, return_full_record=True
                    )
                    
                    # Get subtrahend data (Laravel: $subtrahendData = $dwConn->table('ut_data')->...)
                    subtrahend_data = self._get_data_value(
                        dw_db, dw_id, minus_formula.sub_i_gid, minus_formula.sub_u_gid,
                        minus_formula.sub_s_gid, area_id, time_period, return_full_record=True
                    )

                    minuend_value = minuend_data.get("data_value") if minuend_data else None
                    subtrahend_value = subtrahend_data.get("data_value") if subtrahend_data else None

                    # Prepare source logging (Laravel approach)
                    minuend_ius_gid = build_ius_gid(minus_formula.min_i_gid, minus_formula.min_u_gid, minus_formula.min_s_gid)
                    subtrahend_ius_gid = build_ius_gid(minus_formula.sub_i_gid, minus_formula.sub_u_gid, minus_formula.sub_s_gid)
                    
                    sources_for_log[time_period] = {
                        minuend_ius_gid: {
                            "type": "MINUEND",
                            "gid": minuend_ius_gid,
                            "name": minus_formula.min_ius_name,
                            "area": payload.get("area_name", area_id),
                            "timeperiod": payload.get("timeperiods_name", [time_period])[i] if i < len(payload.get("timeperiods_name", [])) else time_period,
                            "source": minuend_data.get("source_nid") if minuend_data else None,
                            "dv": minuend_value
                        },
                        subtrahend_ius_gid: {
                            "type": "SUBTRAHEND", 
                            "gid": subtrahend_ius_gid,
                            "name": minus_formula.sub_ius_name,
                            "area": payload.get("area_name", area_id),
                            "timeperiod": payload.get("timeperiods_name", [time_period])[i] if i < len(payload.get("timeperiods_name", [])) else time_period,
                            "source": subtrahend_data.get("source_nid") if subtrahend_data else None,
                            "dv": subtrahend_value
                        }
                    }
                    
                    # Value-level guard (aligned with PERCENT): both operands must be non-null
                    if minuend_value is not None and subtrahend_value is not None:
                        # Get source information from payload (Laravel approach)
                        publisher = payload.get("src_publisher", "DFA")
                        title = payload.get("src_title", "Calculated")
                        
                        # Get or create source NID (Laravel: $sourceNid = $this->getSourceNid(...))
                        source_nid = self._get_or_create_source_nid(dw_db, publisher, title, time_period, dw_id=dw_id)
                        
                        # Calculate difference (Laravel: $targetValue = ($minuendData->data_value - $subtrahendData->data_value))
                        target_value = Decimal(str(minuend_value)) - Decimal(str(subtrahend_value))
                        
                        # Apply decimal precision (Laravel: $targetValue = $this->doDecimals($targetValue, $decimals))
                        if minus_formula.target_decimal is not None:
                            target_value = self._apply_decimal_precision(target_value, minus_formula.target_decimal)
                        
                        computed_value = float(target_value)
                        
                        # Store result (Laravel: $dwConn->table('ut_data')->updateOrInsert(...))
                        self._store_computed_value(
                            dw_db, dw_id, i_gid, u_gid, s_gid, area_id, time_period,
                            computed_value, source_nid, OPERATION_MINUS
                        )
                        
                        # Prepare data for logs (Laravel approach)
                        calc_data_for_log[time_period] = {
                            'data_value': computed_value,
                            "source_name": source_nid
                        }
                        
                        logger.info(f"MINUS calculation completed for time_period={time_period}: {minuend_value} - {subtrahend_value} = {computed_value}")
                    else:
                        if minuend_data is None:
                            logger.info(
                                f"MINUS calculation skipped: minuend row absent for "
                                f"{minus_formula.min_i_gid}|{minus_formula.min_u_gid}|{minus_formula.min_s_gid}"
                            )
                        elif minuend_value is None:
                            logger.info(
                                f"MINUS calculation skipped: minuend data_value is null for "
                                f"{minus_formula.min_i_gid}|{minus_formula.min_u_gid}|{minus_formula.min_s_gid}"
                            )
                        elif subtrahend_data is None:
                            logger.info(
                                f"MINUS calculation skipped: subtrahend row absent for "
                                f"{minus_formula.sub_i_gid}|{minus_formula.sub_u_gid}|{minus_formula.sub_s_gid}"
                            )
                        else:
                            logger.info(
                                f"MINUS calculation skipped: subtrahend data_value is null for "
                                f"{minus_formula.sub_i_gid}|{minus_formula.sub_u_gid}|{minus_formula.sub_s_gid}"
                            )
                
                # Create computation log for ALL time periods (Laravel approach)
                # Laravel logs both successful and failed calculations
                for time_period in timeperiods:
                    if not time_period:
                        continue
                    
                    # Prepare source details for the generic function
                    source_details = []
                    if time_period in sources_for_log:
                        # Use src_gid to avoid shadowing the outer ius_gid (target GID)
                        for src_gid, source_info in sources_for_log[time_period].items():
                            source_details.append({
                                "type": source_info.get("type", ""),
                                "gid": source_info.get("gid", src_gid),
                                "name": source_info.get("name", ""),
                                "area": source_info.get("area", ""),
                                "timeperiod": source_info.get("timeperiod", time_period),
                                "source": source_info.get("source"),  # Will be resolved by _create_computation_log
                                "dv": source_info.get("dv")
                            })
                    
                    # Create a time-period specific payload for logging
                    time_period_payload = payload.copy()
                    time_period_payload["time_period"] = time_period
                    
                    # Determine status and values based on whether calculation succeeded
                    if time_period in calc_data_for_log:
                        # Successful calculation (Laravel: isset($dataArray[$timeperiods[$i]]))
                        calc_data = calc_data_for_log[time_period]
                        log_status = "PASSED"
                        log_value = calc_data.get("data_value", 0)
                        log_remarks = ""  # Laravel uses empty string for PASSED
                        # Add source_nid to payload for source name resolution
                        time_period_payload["source_nid"] = calc_data.get("source_name")
                    else:
                        # Failed/skipped calculation (Laravel: else case with "FAILED" status)
                        log_status = "FAILED"
                        log_value = None
                        log_remarks = "Source Values not available"  # Laravel's exact message
                    
                    # Use the enhanced generic function
                    self._create_computation_log(
                        dw_db, table_name, "MINUS", time_period_payload, 
                        log_value, source_details,
                        status=log_status, 
                        remarks=log_remarks,
                        resolve_source_names=True
                    )
                
                _non_empty_tps = [tp for tp in timeperiods if tp]
                minus_ok = bool(_non_empty_tps) and all(
                    tp in calc_data_for_log for tp in _non_empty_tps
                )
                job_outcome = JOB_STATUS_PASSED if minus_ok else JOB_STATUS_FAILED
                self._update_job_status(dw_db, table_name, payload, job_outcome)
                
                return {
                    "success": minus_ok,
                    "operation": OPERATION_MINUS,
                    "ius_gid": ius_gid,
                    "area_id": area_id,
                    "timeperiods": timeperiods,
                    "calculations_performed": len(calc_data_for_log),
                    "calculations_skipped": len(timeperiods) - len(calc_data_for_log)
                }
                
            except Exception as e:
                log_background_incident(
                    message=f"MINUS operation failed: {e}",
                    error_code="COMPUTE_MINUS_OPERATION_FAILED",
                    exc=e,
                    source=_COMPUTE_OPS_SOURCE,
                )
                self._update_job_status(dw_db, table_name, payload, JOB_STATUS_FAILED, str(e))
                raise
    
    def execute_time_operation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute TIME operation (temporal aggregation) with Laravel's exact logic.
        
        Laravel loops through multiple target time periods, processing each individually.
        This matches Laravel's handleTimeType method structure exactly.
        
        Args:
            payload: Job payload containing operation parameters
            
        Returns:
            Dictionary with operation result
        """
        dw_id = payload["dw_id"]
        ius_gid = payload["ius_gid"]
        area_id = payload["area_id"]
        time_period = payload["time_period"]  # Single period from job payload
        table_name = payload["table_name"]
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                # Parse IUS
                i_gid, u_gid, s_gid = parse_ius_gid(ius_gid)
                
                # Get TIME formula
                time_formula = dw_db.query(CeIusComputeTime).filter(
                    and_(
                        CeIusComputeTime.dw_id == int(dw_id),
                        CeIusComputeTime.i_gid == i_gid,
                        CeIusComputeTime.u_gid == u_gid,
                        CeIusComputeTime.s_gid == s_gid
                    )
                ).first()
                
                if not time_formula:
                    raise NotFound(f"TIME formula not found for IUS: {ius_gid}")
                
                #  approach: Get all target time periods with correct frequency
                #  $targetTimePeriods = $dwConn->table('ut_timeperiod')->select([...])
                #          ->where("periodicity", $targetTpFreqency)->whereIn('timeperiod_nid', $timeperiods)->get();
                target_time_periods = dw_db.query(
                    TimePeriod.timeperiod_nid,
                    TimePeriod.timeperiod
                ).filter(
                    and_(
                        TimePeriod.periodicity == time_formula.target_tp_freq,
                        TimePeriod.timeperiod == time_period  # Single period for this job
                    )
                ).all()
                
                if not target_time_periods:
                    raise NotFound(f"Target time period '{time_period}' not found or does not match expected frequency '{time_formula.target_tp_freq}' for TIME formula")
                
                # approach: Loop through target time periods
                # foreach($targetTimePeriods as $targetTp) {
                total_computed_value = None
                data_found = False
                source_period_nids = {}
                target_source_nid = None

                for target_tp_nid, target_tp_period in target_time_periods:
                    # Get source time periods for this target period (Laravel approach)
                    source_period_nids = self._get_source_time_periods(
                        dw_db, target_tp_period, time_formula.source_tp_freq, time_formula.target_tp_freq
                    )
                    
                    if source_period_nids:
                        # Get default locale for metadata resolution
                        from apps.datawarehouse.models.datawarehouse import get_default_locale
                        locale = get_default_locale(dw_db)
                        
                        # Resolve GIDs to NIDs
                        indicator_nid = self._resolve_gid_to_nid(dw_db, Indicator, "indicator_gid", "indicator_nid", i_gid, locale)
                        unit_nid = self._resolve_gid_to_nid(dw_db, Unit, "unit_gid", "unit_nid", u_gid, locale)
                        subgroup_val_nid = self._resolve_gid_to_nid(dw_db, SubgroupVal, "subgroup_val_gid", "subgroup_val_nid", s_gid, locale)
                        
                        if all([indicator_nid, unit_nid, subgroup_val_nid]):
                            # Resolve area
                            area_nid = self._area_id_to_nid(dw_db, area_id, locale)
                            
                            # Get IUS combination
                            iusnid = self._get_or_create_iusnid(dw_db, indicator_nid, unit_nid, subgroup_val_nid)
                            
                            # MAX(data_nid) per timeperiod_nid to pick the most
                            # recently inserted row per source period, then
                            # SUM/AVG those values into a single deterministic result.
                            from sqlalchemy import func as sa_func

                            max_data_sq = dw_db.query(
                                Data.timeperiod_nid,
                                sa_func.max(Data.data_nid).label("max_data_nid"),
                            ).filter(
                                and_(
                                    Data.timeperiod_nid.in_(list(source_period_nids.keys())),
                                    Data.iusnid == iusnid,
                                    Data.area_nid == area_nid,
                                )
                            ).group_by(Data.timeperiod_nid).subquery()

                            agg_func = (
                                sa_func.avg(Data.data_value)
                                if time_formula.aggregation_type == "avg"
                                else sa_func.sum(Data.data_value)
                            )

                            aggregated_value = dw_db.query(
                                agg_func.label("aggregated_value"),
                            ).join(
                                max_data_sq,
                                Data.data_nid == max_data_sq.c.max_data_nid,
                            ).scalar()

                            publisher = payload.get("src_publisher", "DFA")
                            title = payload.get("src_title", "Calculated")
                            target_source_nid = self._get_or_create_source_nid(dw_db, publisher, title, target_tp_period, dw_id=dw_id)

                            if aggregated_value is not None:
                                rounded_value = self._apply_decimal_precision_laravel_compatible(
                                    Decimal(str(aggregated_value)), time_formula.target_decimal
                                )

                                self._store_computed_value(
                                    dw_db, dw_id, i_gid, u_gid, s_gid, area_id, target_tp_period,
                                    float(rounded_value), target_source_nid, OPERATION_TIME
                                )

                                total_computed_value = rounded_value
                                data_found = True
                            else:
                                data_found = False

                            logger.info(f"TIME operation processed target period '{target_tp_period}': value={total_computed_value}, data_found={data_found}")
                        else:
                            logger.warning(f"Could not resolve GIDs to NIDs for TIME operation: i_gid={i_gid}, u_gid={u_gid}, s_gid={s_gid}")
                            data_found = False
                    else:
                        logger.warning(f"No source periods found for TIME operation: target={target_tp_period}, source_freq={time_formula.source_tp_freq}, target_freq={time_formula.target_tp_freq}")
                        data_found = False

                # Build source details matching Laravel's createLogForTime structure
                # Laravel: foreach($sourceArray['tps'] as $tpNid=>$tpVal) — re-queries ut_data per source period
                # Source is the TARGET IUS itself (not a separate source IUS)
                source_list = self._get_source_list(dw_db)
                area_name = payload.get("area_name", area_id)
                target_ius_gid = ius_gid
                target_ius_name = payload.get("target_ius_name", ius_gid)

                source_details = []
                if target_time_periods:
                    # Re-query actual stored data for source details (Laravel approach)
                    from apps.datawarehouse.models.datawarehouse import get_default_locale
                    locale = get_default_locale(dw_db)
                    indicator_nid = self._resolve_gid_to_nid(dw_db, Indicator, "indicator_gid", "indicator_nid", i_gid, locale)
                    unit_nid = self._resolve_gid_to_nid(dw_db, Unit, "unit_gid", "unit_nid", u_gid, locale)
                    subgroup_val_nid = self._resolve_gid_to_nid(dw_db, SubgroupVal, "subgroup_val_gid", "subgroup_val_nid", s_gid, locale)
                    area_nid_for_log = self._area_id_to_nid(dw_db, area_id, locale)

                    if all([indicator_nid, unit_nid, subgroup_val_nid]):
                        iusnid_for_log = self._get_or_create_iusnid(dw_db, indicator_nid, unit_nid, subgroup_val_nid)

                        if source_period_nids:
                            for src_tp_nid in source_period_nids.keys():
                                src_row = dw_db.query(Data).filter(
                                    and_(
                                        Data.iusnid == iusnid_for_log,
                                        Data.area_nid == area_nid_for_log,
                                        Data.timeperiod_nid == src_tp_nid
                                    )
                                ).order_by(Data.data_nid.desc()).first()

                                source_details.append({
                                    "type": "TIME",
                                    "gid": target_ius_gid,
                                    "name": target_ius_name,
                                    "area": area_name,
                                    "timeperiod": time_period,
                                    "source": source_list.get(src_row.source_nid, "") if src_row else "",
                                    "dv": src_row.data_value if src_row else None
                                })

                # Determine status — PASSED if data was found, FAILED otherwise (Laravel pattern)
                time_period_payload = payload.copy()
                time_period_payload["time_period"] = time_period

                # Laravel: isset($dataArray[$timeperiods[$i]]) — only checks if key exists, not the value
                # A legitimate computation of 0.0 is still PASSED
                if data_found:
                    log_status = "PASSED"
                    log_remarks = ""
                    time_period_payload["source_nid"] = target_source_nid if target_time_periods else None
                else:
                    log_status = "FAILED"
                    log_remarks = "Source Values not available"

                time_log_value = (
                    float(total_computed_value)
                    if data_found and total_computed_value is not None
                    else None
                )
                self._create_computation_log(
                    dw_db, table_name, "TIME", time_period_payload, time_log_value, source_details,
                    status=log_status, remarks=log_remarks, resolve_source_names=True
                )

                job_outcome = JOB_STATUS_PASSED if data_found else JOB_STATUS_FAILED
                self._update_job_status(dw_db, table_name, payload, job_outcome)
                
                return {
                    "success": data_found,
                    "operation": OPERATION_TIME,
                    "ius_gid": ius_gid,
                    "area_id": area_id,
                    "time_period": time_period,
                    "computed_value": (
                        float(total_computed_value)
                        if total_computed_value is not None
                        else None
                    ),
                    "source_periods_count": len(source_period_nids),
                    "target_periods_processed": len(target_time_periods),
                    "aggregation_type": time_formula.aggregation_type
                }
                
            except Exception as e:
                log_background_incident(
                    message=f"TIME operation failed: {e}",
                    error_code="COMPUTE_TIME_OPERATION_FAILED",
                    exc=e,
                    source=_COMPUTE_OPS_SOURCE,
                )
                self._update_job_status(dw_db, table_name, payload, JOB_STATUS_FAILED, str(e))
                raise

    # ---- AREA operation (spatial aggregation) ----

    def execute_area_operation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute AREA operation (spatial aggregation across area levels).

        Unified logic for both ``populate_mid_levels`` true and false:

        1. **Bottom (source) level**: For each child area, pick the data row
           with ``MAX(source_nid)`` (most recent source that has data).
           Aggregate (SUM/AVG) those values into each parent area and store
           with the target source NID.
        2. **Upper levels**: Query data filtered by target ``source_nid`` only
           (the data we just stored). Aggregate into the next parent level.
        3. Repeat until the target area level is populated.

        With ``populate_mid_levels=True`` every intermediate level is stored.
        With ``populate_mid_levels=False`` only the target level is stored,
        but the bottom-level ``MAX(source_nid)`` pick is the same.
        """
        dw_id = payload["dw_id"]
        ius_gid = payload["ius_gid"]
        area_id = payload["area_id"]
        time_period = payload["time_period"]
        table_name = payload["table_name"]

        target_area_level = int(payload["target_area_level"])
        source_area_level = int(payload["source_area_level"])
        aggregation_type = payload.get("aggregation_type", "sum")
        populate_intermediate = bool(payload.get("populate_mid_levels", False))
        target_decimal = payload.get("decimals")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                i_gid, u_gid, s_gid = parse_ius_gid(ius_gid)

                from apps.datawarehouse.models.datawarehouse import get_default_locale
                locale = get_default_locale(dw_db)

                indicator_nid = self._resolve_gid_to_nid(dw_db, Indicator, "indicator_gid", "indicator_nid", i_gid, locale)
                unit_nid = self._resolve_gid_to_nid(dw_db, Unit, "unit_gid", "unit_nid", u_gid, locale)
                subgroup_val_nid = self._resolve_gid_to_nid(dw_db, SubgroupVal, "subgroup_val_gid", "subgroup_val_nid", s_gid, locale)

                if not all([indicator_nid, unit_nid, subgroup_val_nid]):
                    raise ValueError(f"Could not resolve GIDs to NIDs: i={i_gid}, u={u_gid}, s={s_gid}")

                iusnid = self._get_or_create_iusnid(dw_db, indicator_nid, unit_nid, subgroup_val_nid)
                timeperiod_nid = self._timeperiod_to_nid(dw_db, time_period)
                if not timeperiod_nid:
                    raise NotFound(f"Time period not found: {time_period}")

                publisher = payload.get("src_publisher", "DFA")
                title = payload.get("src_title", "Calculated")
                target_source_nid = self._get_or_create_source_nid(dw_db, publisher, title, time_period, dw_id=dw_id)

                AreaModel = Area(locale)

                final_value = None
                source_details: List[Dict[str, Any]] = []

                if populate_intermediate:
                    # ── Cascading: step one level at a time, store at each ──
                    # e.g. source=3, target=1 → [(3,2), (2,1)]
                    level_steps = [
                        (child_lvl, child_lvl - 1)
                        for child_lvl in range(source_area_level, target_area_level, -1)
                    ]

                    for step_idx, (child_level, parent_level) in enumerate(level_steps):
                        is_bottom_level = (step_idx == 0)

                        parent_child_map = self._get_parent_child_area_mapping(
                            dw_db, AreaModel, area_id,
                            parent_level=parent_level,
                            child_level=child_level,
                        )

                        if not parent_child_map:
                            logger.warning(
                                "No parent-child mapping found for level %s→%s under area %s",
                                child_level, parent_level, area_id,
                            )
                            continue

                        for mapping in parent_child_map:
                            parent_area_id = mapping["parent_area_id"]
                            child_areas_for_parent = mapping["child_areas"]
                            child_area_nids = [ca["area_nid"] for ca in child_areas_for_parent]

                            if is_bottom_level:
                                aggregated_value = self._aggregate_bottom_level(
                                    dw_db, iusnid, timeperiod_nid,
                                    child_area_nids, aggregation_type,
                                )
                            else:
                                if aggregation_type == "avg":
                                    agg_func = func.avg(Data.data_value)
                                else:
                                    agg_func = func.sum(Data.data_value)

                                result = dw_db.query(
                                    agg_func.label("aggregated_value"),
                                ).filter(
                                    and_(
                                        Data.iusnid == iusnid,
                                        Data.timeperiod_nid == timeperiod_nid,
                                        Data.area_nid.in_(child_area_nids),
                                        Data.source_nid == target_source_nid,
                                    )
                                ).scalar()
                                aggregated_value = float(result) if result is not None else None

                            if aggregated_value is not None:
                                rounded = self._apply_decimal_precision_laravel_compatible(
                                    Decimal(str(aggregated_value)), target_decimal
                                )

                                self._store_computed_value(
                                    dw_db, dw_id, i_gid, u_gid, s_gid,
                                    parent_area_id, time_period,
                                    float(rounded), target_source_nid, OPERATION_AREA,
                                )

                                if parent_area_id == area_id:
                                    final_value = rounded

                            for ca in child_areas_for_parent:
                                child_data = dw_db.query(Data.data_value).filter(
                                    and_(
                                        Data.iusnid == iusnid,
                                        Data.timeperiod_nid == timeperiod_nid,
                                        Data.area_nid == ca["area_nid"],
                                    )
                                ).first()
                                source_details.append({
                                    "type": "AREA",
                                    "gid": ius_gid,
                                    "name": payload.get("target_ius_name", ius_gid),
                                    "area": ca["area_name"],
                                    "area_id": ca["area_id"],
                                    "level": child_level,
                                    "timeperiod": time_period,
                                    "dv": child_data.data_value if child_data else None,
                                })
                else:
                    # ── Direct: aggregate all source-level areas into target in one shot ──
                    all_source_areas = self._get_descendant_areas_for_parent(
                        dw_db, AreaModel, area_id, source_area_level
                    )

                    if not all_source_areas:
                        logger.warning(
                            "No descendant areas found at level %s under area %s",
                            source_area_level, area_id,
                        )
                    else:
                        child_area_nids = [ca["area_nid"] for ca in all_source_areas]

                        aggregated_value = self._aggregate_bottom_level(
                            dw_db, iusnid, timeperiod_nid,
                            child_area_nids, aggregation_type,
                        )

                        if aggregated_value is not None:
                            rounded = self._apply_decimal_precision_laravel_compatible(
                                Decimal(str(aggregated_value)), target_decimal
                            )

                            self._store_computed_value(
                                dw_db, dw_id, i_gid, u_gid, s_gid,
                                area_id, time_period,
                                float(rounded), target_source_nid, OPERATION_AREA,
                            )
                            final_value = rounded

                        for ca in all_source_areas:
                            child_data = dw_db.query(Data.data_value).filter(
                                and_(
                                    Data.iusnid == iusnid,
                                    Data.timeperiod_nid == timeperiod_nid,
                                    Data.area_nid == ca["area_nid"],
                                )
                            ).first()
                            source_details.append({
                                "type": "AREA",
                                "gid": ius_gid,
                                "name": payload.get("target_ius_name", ius_gid),
                                "area": ca["area_name"],
                                "area_id": ca["area_id"],
                                "level": source_area_level,
                                "timeperiod": time_period,
                                "dv": child_data.data_value if child_data else None,
                            })

                area_name = payload.get("area_name", area_id)
                status = JOB_STATUS_PASSED if final_value is not None else JOB_STATUS_FAILED
                remarks = "" if status == JOB_STATUS_PASSED else "No child data found for aggregation"

                self._create_computation_log(
                    dw_db, table_name, OPERATION_AREA, payload,
                    float(final_value) if final_value is not None else None,
                    source_details,
                    status=status,
                    remarks=remarks,
                )

                self._update_job_status(dw_db, table_name, payload, status)

                return {
                    "success": status == JOB_STATUS_PASSED,
                    "operation": OPERATION_AREA,
                    "ius_gid": ius_gid,
                    "area_id": area_id,
                    "time_period": time_period,
                    "computed_value": float(final_value) if final_value is not None else None,
                    "aggregation_type": aggregation_type,
                    "populate_mid_levels": populate_intermediate,
                }

            except Exception as e:
                log_background_incident(
                    message=f"AREA operation failed: {e}",
                    error_code="COMPUTE_AREA_OPERATION_FAILED",
                    exc=e,
                    source=_COMPUTE_OPS_SOURCE,
                )
                self._update_job_status(dw_db, table_name, payload, JOB_STATUS_FAILED, str(e))
                raise

    def _aggregate_bottom_level(
        self,
        dw_db: Session,
        iusnid: int,
        timeperiod_nid: int,
        child_area_nids: List[int],
        aggregation_type: str,
    ) -> Optional[float]:
        """
        Aggregate data at the bottom (source) level using MAX(data_nid)
        per area to pick the most recently inserted row per child area,
        then SUM/AVG those values.

        SQL equivalent:
            SELECT SUM(d.data_value)        -- or AVG
            FROM ut_data d
            INNER JOIN (
                SELECT area_nid, MAX(data_nid) AS max_data_nid
                FROM ut_data
                WHERE iusnid=? AND timeperiod_nid=? AND area_nid IN (...)
                GROUP BY area_nid
            ) latest ON d.data_nid = latest.max_data_nid
            WHERE d.iusnid=? AND d.timeperiod_nid=?
        """
        from sqlalchemy import func as sa_func

        # Subquery: MAX(data_nid) per area — most recently inserted row
        max_data_sq = dw_db.query(
            Data.area_nid,
            sa_func.max(Data.data_nid).label("max_data_nid"),
        ).filter(
            and_(
                Data.iusnid == iusnid,
                Data.timeperiod_nid == timeperiod_nid,
                Data.area_nid.in_(child_area_nids),
            )
        ).group_by(Data.area_nid).subquery()

        if aggregation_type == "avg":
            agg_func = sa_func.avg(Data.data_value)
        else:
            agg_func = sa_func.sum(Data.data_value)

        result = dw_db.query(
            agg_func.label("aggregated_value"),
        ).join(
            max_data_sq,
            Data.data_nid == max_data_sq.c.max_data_nid,
        ).filter(
            and_(
                Data.iusnid == iusnid,
                Data.timeperiod_nid == timeperiod_nid,
            )
        ).scalar()

        return float(result) if result is not None else None

    def _get_descendant_areas_for_parent(
        self,
        dw_db: Session,
        area_model,
        parent_area_id: str,
        child_level: int,
    ) -> List[Dict[str, Any]]:
        """
        Return all areas at ``child_level`` that are descendants of
        ``parent_area_id``.

        Uses iterative breadth-first expansion from the parent's actual
        area_level (read from DB) down to ``child_level``.
        """
        parent_row = dw_db.query(area_model).filter(
            area_model.area_id == parent_area_id,
        ).first()
        if not parent_row:
            return []

        current_nids = [parent_row.area_nid]
        current_level = parent_row.area_level

        if current_level >= child_level:
            return []

        while current_level < child_level:
            next_rows = dw_db.query(area_model).filter(
                and_(
                    area_model.area_parent_nid.in_(current_nids),
                    area_model.area_level == current_level + 1,
                )
            ).all()
            if not next_rows:
                return []
            current_nids = [r.area_nid for r in next_rows]
            current_level += 1

        return [
            {"area_nid": r.area_nid, "area_id": r.area_id, "area_name": r.area_name}
            for r in dw_db.query(area_model).filter(
                area_model.area_nid.in_(current_nids)
            ).all()
        ]

    def _get_parent_child_area_mapping(
        self,
        dw_db: Session,
        area_model,
        parent_area_id: str,
        parent_level: int,
        child_level: int,
    ) -> List[Dict[str, Any]]:
        """
        Return a list of dicts, one per parent area at ``parent_level``,
        each containing the parent info and its direct children at ``child_level``.

        Only returns parents that are descendants of ``parent_area_id``.
        Used by the cascading AREA operation to store aggregated values
        at the correct intermediate parent area.
        """
        top_row = dw_db.query(area_model).filter(
            area_model.area_id == parent_area_id,
        ).first()
        if not top_row:
            return []

        top_level = top_row.area_level

        # Walk from the top area down to parent_level to find all intermediate parents
        current_nids = [top_row.area_nid]
        current_level = top_level

        if parent_level == top_level:
            parent_rows = [top_row]
        else:
            while current_level < parent_level:
                next_rows = dw_db.query(area_model).filter(
                    and_(
                        area_model.area_parent_nid.in_(current_nids),
                        area_model.area_level == current_level + 1,
                    )
                ).all()
                if not next_rows:
                    return []
                current_nids = [r.area_nid for r in next_rows]
                current_level += 1
            parent_rows = next_rows

        # For each parent, find its children at child_level (one hop: child_level = parent_level + 1)
        result = []
        for parent in parent_rows:
            children = dw_db.query(area_model).filter(
                and_(
                    area_model.area_parent_nid == parent.area_nid,
                    area_model.area_level == child_level,
                )
            ).all()
            if children:
                result.append({
                    "parent_area_nid": parent.area_nid,
                    "parent_area_id": parent.area_id,
                    "parent_area_name": parent.area_name,
                    "child_areas": [
                        {"area_nid": c.area_nid, "area_id": c.area_id, "area_name": c.area_name}
                        for c in children
                    ],
                })
        return result

    def _get_data_value(
        self, 
        dw_db: Session, 
        dw_id: str, 
        i_gid: str, 
        u_gid: str, 
        s_gid: str, 
        area_id: str, 
        time_period: str,
        return_full_record: bool = False
    ) -> Optional[Union[float, Dict[str, Any]]]:
        """
        Retrieve the most recent data value for an IUS + area + timeperiod.

        Uses MAX(data_nid) to deterministically pick the most recently
        inserted row when multiple sources exist for the same combination.
        
        Args:
            return_full_record: If True, returns dict with source_nid and data_value.
                               If False, returns just the data_value as float.
        
        Returns:
            If return_full_record=False: Optional[float] - the data value
            If return_full_record=True: Optional[Dict] - {"source_nid": int, "data_value": float} or None
        """
        try:
            from apps.datawarehouse.models.datawarehouse import get_default_locale
            locale = get_default_locale(dw_db)
            
            indicator_nid = self._resolve_gid_to_nid(dw_db, Indicator, "indicator_gid", "indicator_nid", i_gid, locale)
            unit_nid = self._resolve_gid_to_nid(dw_db, Unit, "unit_gid", "unit_nid", u_gid, locale)
            subgroup_val_nid = self._resolve_gid_to_nid(dw_db, SubgroupVal, "subgroup_val_gid", "subgroup_val_nid", s_gid, locale)
            
            if not all([indicator_nid, unit_nid, subgroup_val_nid]):
                logger.warning(f"Could not resolve GIDs to NIDs: i_gid={i_gid}({indicator_nid}), u_gid={u_gid}({unit_nid}), s_gid={s_gid}({subgroup_val_nid})")
                return None
            
            area_nid = self._area_id_to_nid(dw_db, area_id, locale)
            timeperiod_nid = self._timeperiod_to_nid(dw_db, time_period)
            iusnid = self._get_or_create_iusnid(dw_db, indicator_nid, unit_nid, subgroup_val_nid)
            
            # Most recent row by data_nid (auto-increment = insertion order)
            result = dw_db.query(Data).filter(
                and_(
                    Data.iusnid == iusnid,
                    Data.area_nid == area_nid,
                    Data.timeperiod_nid == timeperiod_nid
                )
            ).order_by(Data.data_nid.desc()).first()
            
            if not result:
                return None
            
            if return_full_record:
                return {
                    "source_nid": result.source_nid,
                    "data_value": result.data_value
                }
            else:
                return float(result.data_value) if result.data_value is not None else None
            
        except Exception as e:
            logger.warning("Failed to retrieve data value/record: %s", str(e))
            return None
    
    
    def _store_computed_value(
        self,
        dw_db: Session,
        dw_id: str,
        i_gid: str,
        u_gid: str,
        s_gid: str,
        area_id: str,
        time_period: str,
        computed_value: float,
        source_nid: int,
        operation_type: str = "TOTAL"
    ) -> None:
        """
        Store computed value back to the data warehouse using Laravel's exact approach.
        
        Matches Laravel's ProcessCompute.php data storage logic exactly.
        """
        try:
            # Get default locale for metadata resolution
            from apps.datawarehouse.models.datawarehouse import get_default_locale
            locale = get_default_locale(dw_db)
            
            # Resolve GIDs to NIDs
            indicator_nid = self._resolve_gid_to_nid(dw_db, Indicator, "indicator_gid", "indicator_nid", i_gid, locale)
            unit_nid = self._resolve_gid_to_nid(dw_db, Unit, "unit_gid", "unit_nid", u_gid, locale)
            subgroup_val_nid = self._resolve_gid_to_nid(dw_db, SubgroupVal, "subgroup_val_gid", "subgroup_val_nid", s_gid, locale)
            
            if not all([indicator_nid, unit_nid, subgroup_val_nid]):
                raise ValueError(f"Could not resolve GIDs to NIDs: i_gid={i_gid}({indicator_nid}), u_gid={u_gid}({unit_nid}), s_gid={s_gid}({subgroup_val_nid})")
            
            # Resolve area and timeperiod (now always specific values, never None)
            area_nid = self._area_id_to_nid(dw_db, area_id, locale)
            timeperiod_nid = self._timeperiod_to_nid(dw_db, time_period)
            
            # Get or create IUS combination
            iusnid = self._get_or_create_iusnid(dw_db, indicator_nid, unit_nid, subgroup_val_nid)
            
            # Create iunid (Laravel format: indicator_nid + '_' + unit_nid)
            iunid = f"{indicator_nid}_{unit_nid}"
            
            # Laravel's updateOrInsert logic - check if record exists
            existing = dw_db.query(Data).filter(
                and_(
                    Data.iusnid == iusnid,
                    Data.timeperiod_nid == timeperiod_nid,
                    Data.area_nid == area_nid,
                    Data.source_nid == source_nid,
                    Data.indicator_nid == indicator_nid,
                    Data.unit_nid == unit_nid,
                    Data.subgroup_val_nid == subgroup_val_nid
                )
            ).first()
            
            if existing:
                # Update existing record (Laravel's updateOrInsert behavior)
                existing.data_value = computed_value
                existing.iunid = iunid
                existing.footnote_nid = -1  # Laravel sets this to -1
                logger.info("Updated existing data record: iusnid=%s, value=%s", iusnid, computed_value)
            else:
                # Create new record (Laravel's updateOrInsert behavior)
                new_data = Data(
                    iusnid=iusnid,
                    timeperiod_nid=timeperiod_nid,
                    area_nid=area_nid,
                    source_nid=source_nid,  # Use actual source NID from Laravel logic
                    indicator_nid=indicator_nid,
                    unit_nid=unit_nid,
                    subgroup_val_nid=subgroup_val_nid,
                    data_value=computed_value,
                    iunid=iunid,  # Laravel's iunid field
                    footnote_nid=-1,  # Laravel sets this to -1
                    # Note: Laravel does NOT set textual_data_value for computed data
                    # Other fields use default values
                )
                dw_db.add(new_data)
                logger.info("Created new data record: iusnid=%s, value=%s", iusnid, computed_value)
            
            dw_db.commit()
            
            logger.info(
                "Stored computed value: dw_id=%s, ius=%s|%s|%s, area=%s, tp=%s, value=%s, source_nid=%s",
                dw_id, i_gid, u_gid, s_gid, area_id, time_period, computed_value, source_nid
            )
            
        except Exception as e:
            dw_db.rollback()
            log_background_incident(
                message=f"Failed to store computed value: {e}",
                error_code="COMPUTE_STORE_VALUE_FAILED",
                exc=e,
                source=_COMPUTE_OPS_SOURCE,
            )
            raise
    
    def _get_or_create_source_nid(
        self,
        dw_db: Session,
        publisher: str,
        title: str,
        time_period: str,
        dw_id: str = None,
    ) -> int:
        """
        Get or create source NID using Laravel's exact logic from getSourceNid method.

        Creates source name as: {publisher}_{title}_{time_period}
        Manages source hierarchy: Publisher (parent) -> Source (child)

        When dw_id is provided, new records are replicated to all other language tables
        matching Laravel's createSource loop:
            foreach($this->availableLangs as $oLang) { ic_name = '#' + ic_name; insert(...) }
        """
        try:
            from apps.datawarehouse.models.datawarehouse import get_default_locale, IndicatorClassification
            from apps.datawarehouse.services.language_service import get_dw_language_codes

            locale = get_default_locale(dw_db)
            year = time_period  # Laravel uses the full period string, e.g. "2012-13"
            source_name = f"{publisher}_{title}_{year}"

            ic_model = IndicatorClassification(locale)

            existing_source = dw_db.query(ic_model).filter(
                and_(
                    ic_model.ic_name == source_name,
                    ic_model.ic_type == "SR"
                )
            ).first()

            if existing_source:
                return existing_source.ic_nid

            # Resolve or create the publisher (root) record
            publisher_record = dw_db.query(ic_model).filter(
                and_(
                    ic_model.ic_name == publisher,
                    ic_model.ic_type == "SR",
                    ic_model.ic_parent_nid == -1
                )
            ).first()

            if publisher_record:
                parent_nid = publisher_record.ic_nid
            else:
                new_publisher = ic_model(
                    ic_type="SR",
                    ic_parent_nid=-1,
                    ic_gid=publisher,
                    ic_name=publisher,
                    ic_global=0,
                )
                dw_db.add(new_publisher)
                dw_db.flush()
                parent_nid = new_publisher.ic_nid
                logger.info("Created new publisher: %s (NID: %s)", publisher, parent_nid)

                # Replicate publisher to all other language tables (Laravel createSource pattern)
                if dw_id:
                    for lang_code in get_dw_language_codes(dw_id):
                        if lang_code == locale:
                            continue
                        other_ic = IndicatorClassification(lang_code)
                        dw_db.add(other_ic(
                            ic_nid=parent_nid,
                            ic_name=f"#{publisher}",
                            ic_type="SR",
                            ic_parent_nid=-1,
                            ic_gid=publisher,
                            ic_global=0,
                        ))
                    dw_db.flush()

            # Create the source record under the publisher
            new_source = ic_model(
                ic_type="SR",
                ic_parent_nid=parent_nid,
                ic_gid=source_name,
                ic_name=source_name,
                publisher=publisher,
                title=title,
                diyear=year,
                ic_global=0,
            )
            dw_db.add(new_source)
            dw_db.flush()
            source_nid = new_source.ic_nid
            logger.info("Created new source: %s (NID: %s, Parent: %s)", source_name, source_nid, parent_nid)

            # Replicate source to all other language tables (Laravel createSource pattern)
            if dw_id:
                for lang_code in get_dw_language_codes(dw_id):
                    if lang_code == locale:
                        continue
                    other_ic = IndicatorClassification(lang_code)
                    dw_db.add(other_ic(
                        ic_nid=source_nid,
                        ic_name=f"#{source_name}",
                        ic_type="SR",
                        ic_parent_nid=parent_nid,
                        ic_gid=source_name,
                        ic_global=0,
                        publisher=publisher,
                        title=title,
                        diyear=year,
                    ))
                dw_db.flush()

            return source_nid

        except Exception as e:
            log_background_incident(
                message=f"Failed to get/create source NID: {e}",
                error_code="COMPUTE_SOURCE_NID_FAILED",
                exc=e,
                source=_COMPUTE_OPS_SOURCE,
            )
            return 1
    
    def _get_most_recent_data(
        self,
        dw_db: Session,
        i_gid: str,
        u_gid: str,
        s_gid: str,
        area_id: str,
        locale: str
    ) -> Optional[float]:
        """
        Get most recent data when current time period data is unavailable.
        
        Matches Laravel's logic for handling missing denominator data in PERCENT operations
        when is_most_recent flag is true.
        """
        try:
            # Resolve GIDs to NIDs
            indicator_nid = self._resolve_gid_to_nid(dw_db, Indicator, "indicator_gid", "indicator_nid", i_gid, locale)
            unit_nid = self._resolve_gid_to_nid(dw_db, Unit, "unit_gid", "unit_nid", u_gid, locale)
            subgroup_val_nid = self._resolve_gid_to_nid(dw_db, SubgroupVal, "subgroup_val_gid", "subgroup_val_nid", s_gid, locale)
            
            if not all([indicator_nid, unit_nid, subgroup_val_nid]):
                logger.warning(f"Could not resolve GIDs to NIDs for most recent data: i_gid={i_gid}, u_gid={u_gid}, s_gid={s_gid}")
                return None
            
            # Resolve area
            area_nid = self._area_id_to_nid(dw_db, area_id, locale)
            
            # Get IUS combination
            iusnid = self._get_or_create_iusnid(dw_db, indicator_nid, unit_nid, subgroup_val_nid)
            
            # Query for most recent data (Laravel approach)
            # Join with TimePeriod table and order by startdate DESC
            from sqlalchemy import func
            
            result = dw_db.query(Data.data_value).join(
                TimePeriod, Data.timeperiod_nid == TimePeriod.timeperiod_nid
            ).filter(
                and_(
                    Data.iusnid == iusnid,
                    Data.area_nid == area_nid,
                    Data.data_value.isnot(None)
                )
            ).order_by(TimePeriod.startdate.desc(), Data.data_nid.desc()).first()
            
            if result and result[0] is not None:
                logger.info(f"Found most recent data for IUS {i_gid}|{u_gid}|{s_gid}, area {area_id}: {result[0]}")
                return float(result[0])
            
            return None
            
        except Exception as e:
            logger.warning("Failed to retrieve most recent data: %s", str(e))
            return None
    
    def _apply_decimal_precision(self, value: Decimal, decimal_places: Optional[int]) -> Decimal:
        """Apply decimal precision rounding with Laravel compatibility."""
        return self._apply_decimal_precision_laravel_compatible(value, decimal_places)
    
    def _apply_decimal_precision_laravel_compatible(self, value: Decimal, decimal_places: Optional[int]) -> Decimal:
        """
        Laravel-compatible decimal precision handling.
        
        Matches Laravel's doDecimals() method behavior:
        - If decimal_places is None or empty: 2 decimals if fractional, unchanged if whole
        - If decimal_places is specified: use that precision with ROUND_HALF_UP
        """
        if decimal_places is None or decimal_places == "":
            # Laravel behavior: 2 decimals if fractional, unchanged if whole
            if value % 1 != 0:  # Has fractional part
                quantize_exp = Decimal('0.01')  # 2 decimal places
                return value.quantize(quantize_exp, rounding=ROUND_HALF_UP)
            else:
                return value  # Keep as-is for whole numbers
        
        # Use specified precision with Laravel-compatible rounding
        if decimal_places < 0:
            decimal_places = DEFAULT_DECIMAL_PLACES
        
        quantize_exp = Decimal('0.1') ** decimal_places
        return value.quantize(quantize_exp, rounding=ROUND_HALF_UP)
    
    def _get_source_time_periods(
        self, 
        dw_db: Session,
        target_period: str, 
        source_freq: str, 
        target_freq: str
    ) -> Dict[int, str]:
        """
        Get source time periods for temporal aggregation.
        
        Matches Laravel's prepareSourceTimeperiods method exactly.
        Returns dict of timeperiod_nid => timeperiod_string mappings.
        """
        try:
            frequency_combination = f"{target_freq}-{source_freq}"
            source_periods = []
            
            # Handle all Laravel frequency combinations
            if frequency_combination == "A-Q":  # Annual to Quarterly
                source_periods = self._find_quarters_from_year(target_period)
            elif frequency_combination == "A-M":  # Annual to Monthly
                source_periods = self._find_months_from_year(target_period)
            elif frequency_combination == "A-H":  # Annual to Half-Yearly
                source_periods = self._find_half_yearly_from_year(target_period)
            elif frequency_combination == "A-D":  # Annual to Daily
                # TODO: Implement when needed
                logger.warning(f"A-D frequency combination not yet implemented")
                source_periods = [target_period]
            elif frequency_combination == "Q-M":  # Quarterly to Monthly
                # TODO: Implement when needed
                logger.warning(f"Q-M frequency combination not yet implemented")
                source_periods = [target_period]
            elif frequency_combination == "Q-D":  # Quarterly to Daily
                # TODO: Implement when needed
                logger.warning(f"Q-D frequency combination not yet implemented")
                source_periods = [target_period]
            elif frequency_combination == "M-F":  # Monthly to Fortnightly
                # TODO: Implement when needed
                logger.warning(f"M-F frequency combination not yet implemented")
                source_periods = [target_period]
            elif frequency_combination == "M-D":  # Monthly to Daily
                # TODO: Implement when needed
                logger.warning(f"M-D frequency combination not yet implemented")
                source_periods = [target_period]
            elif frequency_combination == "H-M":  # Half-Yearly to Monthly
                # TODO: Implement when needed
                logger.warning(f"H-M frequency combination not yet implemented")
                source_periods = [target_period]
            elif frequency_combination == "H-D":  # Half-Yearly to Daily
                # TODO: Implement when needed
                logger.warning(f"H-D frequency combination not yet implemented")
                source_periods = [target_period]
            else:
                # Same frequency or unsupported combination
                source_periods = [target_period]
            
            if not source_periods:
                return {}
            
            # Query ut_timeperiod table for actual NIDs (Laravel approach)
            timeperiod_nids = {}
            if source_periods:
                results = dw_db.query(TimePeriod.timeperiod_nid, TimePeriod.timeperiod).filter(
                    and_(
                        TimePeriod.timeperiod.in_(source_periods),
                        TimePeriod.periodicity == source_freq
                    )
                ).all()
                
                for nid, period in results:
                    timeperiod_nids[nid] = period
                    
                logger.info(f"Resolved {len(timeperiod_nids)} time periods for {frequency_combination}: {list(timeperiod_nids.values())}")
            
            return timeperiod_nids
            
        except Exception as e:
            log_background_incident(
                message=f"Failed to get source time periods: {e}",
                error_code="COMPUTE_SOURCE_TIME_PERIODS_FAILED",
                exc=e,
                source=_COMPUTE_OPS_SOURCE,
            )
            return {}
    
    def _find_quarters_from_year(self, year: str) -> List[str]:
        """
        Find quarters from given year (Laravel's findQuartersFromYear logic).
        
        Handles both single years and year ranges (e.g., "2023-24").
        """
        quarters = []
        # For now, use 'Q' as quarter code (Laravel uses 'T' for SISO adaptation)
        qtr_code = 'Q'
        
        if '-' in year:
            # Year range (e.g., "2023-24")
            year_parts = year.split('-')
            year1 = year_parts[0]
            year2 = year_parts[1]
            
            # Handle 2-digit year format
            if len(year2) == 2:
                year2 = year1[:2] + year2
            
            quarters = [
                f"{qtr_code}2.{year1}",
                f"{qtr_code}3.{year1}",
                f"{qtr_code}4.{year1}",
                f"{qtr_code}1.{year2}",
            ]
        else:
            # Single year
            quarters = [
                f"{qtr_code}1.{year}",
                f"{qtr_code}2.{year}",
                f"{qtr_code}3.{year}",
                f"{qtr_code}4.{year}",
            ]
        
        return quarters
    
    def _find_months_from_year(self, year: str) -> List[str]:
        """
        Find months from given year (Laravel's findMonthsFromYear logic).
        
        Handles both single years and year ranges.
        """
        months = []
        
        if '-' in year:
            # Year range (e.g., "2023-24") - months 4-15 (Apr of year1 to Mar of year2)
            year_parts = year.split('-')
            year1 = year_parts[0]
            year2 = year_parts[1]
            
            # Handle 2-digit year format
            if len(year2) == 2:
                year2 = '20' + year2
            
            # Months 4-12 of first year
            for i in range(4, 13):
                months.append(f"{year1}.{i:02d}")
            
            # Months 1-3 of second year
            for i in range(1, 4):
                months.append(f"{year2}.{i:02d}")
        else:
            # Single year - all 12 months
            for i in range(1, 13):
                months.append(f"{year}.{i:02d}")
        
        return months
    
    def _find_half_yearly_from_year(self, year: str) -> List[str]:
        """
        Find half-yearly periods from given year (Laravel's findHalfYearlyFromYear logic).
        
        Note: Laravel's implementation seems to have a bug - it returns months instead of half-yearly periods.
        This implementation follows the intended logic for half-yearly periods.
        """
        half_years = []
        
        if '-' in year:
            # Year range - return months like Laravel does (seems to be a bug in Laravel)
            year_parts = year.split('-')
            year1 = year_parts[0]
            year2 = year_parts[1]
            
            # Handle 2-digit year format
            if len(year2) == 2:
                year2 = '20' + year2
            
            # Months 4-12 of first year
            for i in range(4, 13):
                half_years.append(f"{year1}.{i:02d}")
            
            # Months 1-3 of second year
            for i in range(1, 4):
                half_years.append(f"{year2}.{i:02d}")
        else:
            # Single year - two half-yearly periods
            half_years = [
                f"{year}.01",  # First half
                f"{year}.06"   # Second half
            ]
        
        return half_years
    
    def _update_job_status(
        self,
        dw_db: Session,
        table_name: str,
        payload: Dict[str, Any],
        status: str,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Atomic counter update matching Laravel's jobSuccess / jobFailed pattern.

        Laravel performs:
            DB::table('ce_process_time_logs')->where('id', $id)
                ->increment('total_executed')
                ->decrement('total_pending')
                // if failed: ->increment('total_failed')
            // auto-complete when total_jobs == total_executed

        We replicate this using SQLAlchemy's bulk update with column arithmetic so
        each counter change is a single atomic UPDATE statement — no full-table scan.

        On completion, remarks are set from aggregate counters: if total_failed > 0 we
        store "Completed with failures", else "Job done" (not based on the last job only).
        """
        import re

        job_id = None
        filter_obj = payload.get("filter_object")
        if isinstance(filter_obj, dict):
            job_id = filter_obj.get("process_time_log_id")
        if not job_id:
            match = re.search(r'ce_process_time_log_(\d+)_details', table_name or "")
            if match:
                job_id = int(match.group(1))
        if not job_id:
            return

        try:
            update_vals = {
                CeProcessTimeLog.total_executed: CeProcessTimeLog.total_executed + 1,
                CeProcessTimeLog.total_pending: func.greatest(CeProcessTimeLog.total_pending - 1, 0),
                CeProcessTimeLog.updated_at: datetime.utcnow(),
            }
            if status == JOB_STATUS_FAILED:
                update_vals[CeProcessTimeLog.total_failed] = CeProcessTimeLog.total_failed + 1

            dw_db.query(CeProcessTimeLog).filter(
                CeProcessTimeLog.id == job_id
            ).update(update_vals, synchronize_session=False)

            # Bulk update leaves any loaded instance stale; reload for accurate counters.
            dw_db.expire_all()

            # Auto-complete when all jobs are done (Laravel: WHERE total_jobs = total_executed).
            # Remarks follow aggregate total_failed, not the last job's outcome.
            log_row = (
                dw_db.query(CeProcessTimeLog)
                .filter(CeProcessTimeLog.id == job_id)
                .one_or_none()
            )
            completion_remarks = None
            if log_row and log_row.completed_at is None:
                tj, te, tf = log_row.total_jobs, log_row.total_executed, log_row.total_failed or 0
                if tj is not None and te is not None and tj == te:
                    completion_remarks = (
                        "Completed with failures" if tf > 0 else "Job done"
                    )
            if completion_remarks is not None:
                dw_db.query(CeProcessTimeLog).filter(
                    CeProcessTimeLog.id == job_id,
                    CeProcessTimeLog.total_jobs == CeProcessTimeLog.total_executed,
                    CeProcessTimeLog.completed_at.is_(None),
                ).update(
                    {
                        CeProcessTimeLog.status: STATUS_DONE,
                        CeProcessTimeLog.remarks: completion_remarks,
                        CeProcessTimeLog.completed_at: datetime.utcnow(),
                    },
                    synchronize_session=False,
                )

            dw_db.commit()
        except Exception as e:
            log_background_incident(
                message=f"Failed to update job counter for log_id={job_id}: {e}",
                error_code="COMPUTE_UPDATE_JOB_COUNTER_FAILED",
                exc=e,
                source=_COMPUTE_OPS_SOURCE,
            )
    
    def _create_computation_log(
        self,
        dw_db: Session,
        table_name: str,
        operation_type: str,
        payload: Dict[str, Any],
        computed_value: Optional[float],
        source_details: List[Dict[str, Any]],
        status: str = "PASSED",
        remarks: str = "",
        resolve_source_names: bool = True
    ) -> None:
        """
        Create detailed computation log matching Laravel's exact logging structure.
        
        This matches Laravel's createLogForTotal, createLogForDiv, etc. methods exactly.
        Enhanced to support source name resolution and failed status logging.
        """
        try:
            # Extract process_time_log_id from payload (Laravel gets this from job_id)
            process_time_log_id = None
            if "filter_object" in payload:
                filter_obj = payload["filter_object"]
                if isinstance(filter_obj, dict):
                    process_time_log_id = filter_obj.get("process_time_log_id")
                elif isinstance(filter_obj, str):
                    try:
                        filter_data = json.loads(filter_obj)
                        process_time_log_id = filter_data.get("process_time_log_id")
                    except:
                        pass
            
            # Fallback to extracting from table name if not found
            if process_time_log_id is None:
                # Extract from table name: ce_process_time_log_1_details -> 1
                import re
                match = re.search(r'ce_process_time_log_(\d+)_details', table_name)
                if match:
                    process_time_log_id = int(match.group(1))
                else:
                    process_time_log_id = 0
            
            # Get area name (Laravel includes this)
            area_name = payload.get("area_name", "")
            if not area_name and "area_id" in payload:
                # Try to resolve area name from area_id
                try:
                    from apps.datawarehouse.models.datawarehouse import get_default_locale, Area
                    locale = get_default_locale(dw_db)
                    area_model = Area(locale)
                    area_record = dw_db.query(area_model).filter(area_model.area_id == payload["area_id"]).first()
                    if area_record:
                        area_name = area_record.area_name
                except Exception:
                    pass
            
            # Get source list for name resolution (Laravel approach)
            source_list = self._get_source_list(dw_db) if resolve_source_names else {}
            
            # Resolve source name (Laravel: $sourceListPluck[$logObject["source_name"]] ?? $logObject["source_name"])
            source_name_raw = payload.get("source_nid") or f"{payload.get('src_publisher', 'DFA')}_{payload.get('src_title', 'Calculated')}"
            if resolve_source_names and isinstance(source_name_raw, int) and source_name_raw in source_list:
                resolved_source_name = source_list[source_name_raw]
            else:
                resolved_source_name = str(source_name_raw)
            
            # Resolve source names in source details (Laravel approach)
            resolved_source_details = []
            for detail in source_details:
                detail_copy = detail.copy()
                if resolve_source_names:
                    raw_source = detail_copy.get("source")
                    raw_nid = detail_copy.get("source_nid")
                    resolved = ""
                    for candidate in (raw_source, raw_nid):
                        if candidate is None or candidate == "":
                            continue
                        if isinstance(candidate, int) and candidate in source_list:
                            resolved = source_list[candidate]
                            break
                        if isinstance(candidate, str) and candidate.strip().isdigit():
                            nid = int(candidate.strip())
                            if nid in source_list:
                                resolved = source_list[nid]
                                break
                        if isinstance(candidate, str) and candidate.strip():
                            resolved = candidate.strip()
                            break
                    if resolved:
                        detail_copy["source"] = resolved
                resolved_source_details.append(detail_copy)
            
            # Prepare log entry matching Laravel's exact structure
            log_entry = {
                "process_time_log_id": process_time_log_id,
                "process_type": operation_type,
                "status": status,
                "target_ius_gid": payload.get("ius_gid", ""),
                "target_ius_name": payload.get("target_ius_name", ""),
                "area_id": payload.get("area_id", ""),
                "area_name": area_name,
                "time_period": payload.get("time_period", ""),
                "data_value": computed_value,
                "source_name": resolved_source_name,
                "remarks": remarks,
                "source_details": json.dumps(resolved_source_details) if resolved_source_details else "[]"
            }
            
            # Insert into dynamic log table (Laravel approach)
            insert_sql = f"""
            INSERT INTO `{table_name}` 
            (process_time_log_id, process_type, status, target_ius_gid, target_ius_name, 
             area_id, area_name, time_period, data_value, source_name, remarks, 
             source_details, created_at)
            VALUES (:process_time_log_id, :process_type, :status, :target_ius_gid, :target_ius_name,
                    :area_id, :area_name, :time_period, :data_value, :source_name, :remarks,
                    :source_details, NOW())
            """
            
            dw_db.execute(text(insert_sql), log_entry)
            dw_db.commit()

            logger.info(
                "Created computation log: operation=%s, status=%s, value=%s, log_id=%s",
                operation_type, status, computed_value, process_time_log_id,
            )

        except Exception as e:
            log_background_incident(
                message=f"Failed to create computation log: {e}",
                error_code="COMPUTE_CREATE_LOG_FAILED",
                exc=e,
                source=_COMPUTE_OPS_SOURCE,
            )
            # Don't raise - logging failure shouldn't stop computation
    
    def _get_source_list(self, dw_db: Session) -> Dict[int, str]:
        """
        Get source list mapping from source NIDs to readable names.
        
        Replicates Laravel's getSourceList() method exactly:
        - Queries ut_indicator_classifications_{lang} table
        - Filters by ic_type = 'SR' and ic_parent_nid != '-1'
        - Returns mapping of ic_nid -> ic_name
        
        Returns:
            Dictionary mapping source NID to source name
        """
        try:
            # Get default locale for source resolution
            from apps.datawarehouse.models.datawarehouse import get_default_locale
            locale = get_default_locale(dw_db)
            
            # Laravel: $dwConn->table('ut_indicator_classifications_'.$this->langCode)
            #         ->where('ic_type', 'SR')->where('ic_parent_nid', '!=', '-1')
            #         ->pluck('ic_name', 'ic_nid')->toArray()
            
            # Use raw SQL to match Laravel's exact query
            query = text(f"""
                SELECT ic_nid, ic_name 
                FROM ut_indicator_classifications_{locale}
                WHERE ic_type = 'SR' AND ic_parent_nid != '-1'
            """)
            
            result = dw_db.execute(query).fetchall()
            
            # Convert to dictionary mapping NID -> Name
            source_mapping = {row.ic_nid: row.ic_name for row in result}
            
            logger.debug(f"Retrieved {len(source_mapping)} sources for locale {locale}")
            return source_mapping
            
        except Exception as e:
            logger.warning("Failed to retrieve source list: %s", str(e))
            return {}
    