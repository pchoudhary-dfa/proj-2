"""
IUS (Indicator-Unit-Subgroup) Utilities for Compute Engine.

This module provides utilities for IUS resolution, validation, and metadata handling
following the Laravel compute engine patterns for statistical indicator management.
"""

from typing import List, Dict, Optional, Tuple, Set
from sqlalchemy.orm import Session
from apps.shared.utils.ius_utils import get_ius_gid_separator, parse_ius_gid, build_ius_gid, validate_ius_gid_format
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import Indicator, Unit, get_default_locale, SubgroupVal


class IusUtils:
    """Utility class for IUS operations."""
    
    @staticmethod
    def parse_ius_gid(ius_gid: str) -> Tuple[str, str, str]:
        """
        Parse IUS GID string into component parts.
        
        Args:
            ius_gid: IUS GID in format "i_gid|u_gid|s_gid" (separator configurable)
            
        Returns:
            Tuple of (i_gid, u_gid, s_gid)
            
        Raises:
            ValueError: If IUS GID format is invalid
        """
        return parse_ius_gid(ius_gid)
    
    @staticmethod
    def build_ius_gid(i_gid: str, u_gid: str, s_gid: str) -> str:
        """
        Build IUS GID string from component parts.
        
        Args:
            i_gid: Indicator GID
            u_gid: Unit GID
            s_gid: Subgroup Value GID
            
        Returns:
            IUS GID string
        """
        return build_ius_gid(i_gid, u_gid, s_gid)
    
    @staticmethod
    def validate_ius_gid_format(ius_gid: str) -> bool:
        """
        Validate IUS GID format without raising exceptions.
        
        Args:
            ius_gid: IUS GID to validate
            
        Returns:
            True if format is valid, False otherwise
        """
        return validate_ius_gid_format(ius_gid)
    
    @staticmethod
    def resolve_ius_names(dw_id: str, ius_gids: List[str], language_code: Optional[str] = None) -> Dict[str, Dict[str, str]]:
        """
        Resolve IUS GIDs to human-readable names and metadata.
        
        Args:
            dw_id: Data warehouse ID
            ius_gids: List of IUS GID strings
            language_code: Language code for locale-specific models (optional)
            
        Returns:
            Dictionary mapping IUS GIDs to metadata dictionaries
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            result = {}
            
            # Get locale for this data warehouse
            if language_code is None:
                language_code = get_default_locale(dw_db)
            
            # Create locale-specific model classes
            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)
            SubgroupModel = SubgroupVal(language_code)
            
            # Collect all unique GIDs for batch queries
            i_gids = set()
            u_gids = set()
            s_gids = set()
            
            valid_ius_gids = []
            for ius_gid in ius_gids:
                try:
                    i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(ius_gid)
                    i_gids.add(i_gid)
                    u_gids.add(u_gid)
                    s_gids.add(s_gid)
                    valid_ius_gids.append((ius_gid, i_gid, u_gid, s_gid))
                except ValueError:
                    # Invalid format, add with error info
                    result[ius_gid] = {
                        'ius_name': ius_gid,
                        'i_name': 'Invalid',
                        'u_name': 'Format',
                        's_name': 'Error',
                        'error': 'Invalid IUS GID format'
                    }
            
            # Batch query indicators
            indicators = {}
            if i_gids:
                indicator_rows = dw_db.query(IndicatorModel).filter(
                    IndicatorModel.indicator_gid.in_(list(i_gids))
                ).all()
                indicators = {ind.indicator_gid: ind for ind in indicator_rows}
            
            # Batch query units
            units = {}
            if u_gids:
                unit_rows = dw_db.query(UnitModel).filter(
                    UnitModel.unit_gid.in_(list(u_gids))
                ).all()
                units = {unit.unit_gid: unit for unit in unit_rows}
            
            # Batch query subgroups
            subgroups = {}
            if s_gids:
                subgroup_rows = dw_db.query(SubgroupModel).filter(
                    SubgroupModel.subgroup_val_gid.in_(list(s_gids))
                ).all()
                subgroups = {sg.subgroup_val_gid: sg for sg in subgroup_rows}
            
            # Build result for valid IUS GIDs
            for ius_gid, i_gid, u_gid, s_gid in valid_ius_gids:
                indicator = indicators.get(i_gid)
                unit = units.get(u_gid)
                subgroup = subgroups.get(s_gid)
                
                i_name = getattr(indicator, 'indicator_name', i_gid) if indicator else i_gid
                u_name = getattr(unit, 'unit_name', u_gid) if unit else u_gid
                s_name = getattr(subgroup, 'subgroup_val', s_gid) if subgroup else s_gid
                
                # Build composite name
                ius_name = f"{i_name} - {u_name} - {s_name}"
                
                result[ius_gid] = {
                    'ius_name': ius_name,
                    'i_name': i_name,
                    'u_name': u_name,
                    's_name': s_name,
                    'i_gid': i_gid,
                    'u_gid': u_gid,
                    's_gid': s_gid,
                    'indicator_exists': indicator is not None,
                    'unit_exists': unit is not None,
                    'subgroup_exists': subgroup is not None
                }
            
            return result
    
    @staticmethod
    def get_ius_nids(dw_id: str, ius_gids: List[str], language_code: Optional[str] = None) -> Dict[str, Dict[str, Optional[int]]]:
        """
        Get numeric IDs (NIDs) for IUS GIDs.
        
        Args:
            dw_id: Data warehouse ID
            ius_gids: List of IUS GID strings
            language_code: Language code for locale-specific models (optional)
            
        Returns:
            Dictionary mapping IUS GIDs to NID dictionaries
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            result = {}
            
            # Get locale for this data warehouse
            if language_code is None:
                language_code = get_default_locale(dw_db)
            
            # Create locale-specific model classes
            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)
            SubgroupModel = SubgroupVal(language_code)
            
            # Collect all unique GIDs
            i_gids = set()
            u_gids = set()
            s_gids = set()
            
            valid_ius_gids = []
            for ius_gid in ius_gids:
                try:
                    i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(ius_gid)
                    i_gids.add(i_gid)
                    u_gids.add(u_gid)
                    s_gids.add(s_gid)
                    valid_ius_gids.append((ius_gid, i_gid, u_gid, s_gid))
                except ValueError:
                    result[ius_gid] = {
                        'i_nid': None,
                        'u_nid': None,
                        's_nid': None,
                        'error': 'Invalid IUS GID format'
                    }
            
            # Batch query for NIDs
            i_nids = {}
            if i_gids:
                indicator_rows = dw_db.query(IndicatorModel.indicator_gid, IndicatorModel.indicator_nid).filter(
                    IndicatorModel.indicator_gid.in_(list(i_gids))
                ).all()
                i_nids = {row.indicator_gid: row.indicator_nid for row in indicator_rows}
            
            u_nids = {}
            if u_gids:
                unit_rows = dw_db.query(UnitModel.unit_gid, UnitModel.unit_nid).filter(
                    UnitModel.unit_gid.in_(list(u_gids))
                ).all()
                u_nids = {row.unit_gid: row.unit_nid for row in unit_rows}
            
            s_nids = {}
            if s_gids:
                subgroup_rows = dw_db.query(SubgroupModel.subgroup_val_gid, SubgroupModel.subgroup_val_nid).filter(
                    SubgroupModel.subgroup_val_gid.in_(list(s_gids))
                ).all()
                s_nids = {row.subgroup_val_gid: row.subgroup_val_nid for row in subgroup_rows}
            
            # Build result
            for ius_gid, i_gid, u_gid, s_gid in valid_ius_gids:
                result[ius_gid] = {
                    'i_nid': i_nids.get(i_gid),
                    'u_nid': u_nids.get(u_gid),
                    's_nid': s_nids.get(s_gid),
                    'i_gid': i_gid,
                    'u_gid': u_gid,
                    's_gid': s_gid
                }
            
            return result
    
    @staticmethod
    def expand_ius_patterns(dw_id: str, ius_patterns: List[str], language_code: Optional[str] = None) -> List[str]:
        """
        Expand IUS patterns with wildcards to actual IUS combinations.
        
        Supports patterns like:
        - "IND001|*|*" (all units and subgroups for indicator)
        - "*|UNIT001|*" (all indicators and subgroups for unit)
        - "IND001|UNIT001|*" (all subgroups for specific indicator-unit)
        
        Args:
            dw_id: Data warehouse ID
            ius_patterns: List of IUS patterns (may include wildcards)
            language_code: Language code for locale-specific models (optional)
            
        Returns:
            List of expanded IUS GIDs
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            expanded_ius = set()
            
            # Get locale for this data warehouse
            if language_code is None:
                language_code = get_default_locale(dw_db)
            
            # Create locale-specific model classes
            IndicatorModel = Indicator(language_code)
            UnitModel = Unit(language_code)
            SubgroupModel = SubgroupVal(language_code)
            
            for pattern in ius_patterns:
                if '*' not in pattern:
                    # No wildcards, add as-is if valid
                    if IusUtils.validate_ius_gid_format(pattern):
                        expanded_ius.add(pattern)
                    continue
                
                try:
                    i_pattern, u_pattern, s_pattern = IusUtils.parse_ius_gid(pattern)
                    
                    # Build query conditions using cross join (Cartesian product)
                    query = dw_db.query(IndicatorModel.indicator_gid, UnitModel.unit_gid, SubgroupModel.subgroup_val_gid).select_from(
                        IndicatorModel, UnitModel, SubgroupModel
                    )
                    
                    # Apply filters based on patterns
                    if i_pattern != '*':
                        query = query.filter(IndicatorModel.indicator_gid == i_pattern)
                    if u_pattern != '*':
                        query = query.filter(UnitModel.unit_gid == u_pattern)
                    if s_pattern != '*':
                        query = query.filter(SubgroupModel.subgroup_val_gid == s_pattern)
                    
                    # Execute query and build IUS GIDs
                    results = query.all()
                    for i_gid, u_gid, s_gid in results:
                        ius_gid = IusUtils.build_ius_gid(i_gid, u_gid, s_gid)
                        expanded_ius.add(ius_gid)
                        
                except ValueError:
                    # Invalid pattern format, skip
                    continue
            
            return list(expanded_ius)
    
    @staticmethod
    def filter_ius_by_data_availability(
        dw_id: str, 
        ius_gids: List[str], 
        area_ids: Optional[List[str]] = None,
        time_periods: Optional[List[str]] = None
    ) -> List[str]:
        """
        Filter IUS combinations by data availability.
        
        Args:
            dw_id: Data warehouse ID
            ius_gids: List of IUS GIDs to filter
            area_ids: Optional list of area IDs to check
            time_periods: Optional list of time periods to check
            
        Returns:
            List of IUS GIDs that have data available
        """
        # This is a placeholder implementation
        # In practice, this would query the actual data tables (ut_data, etc.)
        # to check for data availability
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            available_ius = []
            
            for ius_gid in ius_gids:
                try:
                    i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(ius_gid)
                    
                    # Placeholder query - replace with actual data availability check
                    # This would typically check ut_data or similar tables
                    has_data = True  # Assume data exists for now
                    
                    if has_data:
                        available_ius.append(ius_gid)
                        
                except ValueError:
                    # Invalid IUS format, skip
                    continue
            
            return available_ius
    
    @staticmethod
    def group_ius_by_indicator(ius_gids: List[str]) -> Dict[str, List[str]]:
        """
        Group IUS GIDs by indicator.
        
        Args:
            ius_gids: List of IUS GIDs
            
        Returns:
            Dictionary mapping indicator GIDs to lists of IUS GIDs
        """
        grouped = {}
        
        for ius_gid in ius_gids:
            try:
                i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(ius_gid)
                if i_gid not in grouped:
                    grouped[i_gid] = []
                grouped[i_gid].append(ius_gid)
            except ValueError:
                # Invalid format, skip
                continue
        
        return grouped
    
    @staticmethod
    def group_ius_by_unit(ius_gids: List[str]) -> Dict[str, List[str]]:
        """
        Group IUS GIDs by unit.
        
        Args:
            ius_gids: List of IUS GIDs
            
        Returns:
            Dictionary mapping unit GIDs to lists of IUS GIDs
        """
        grouped = {}
        
        for ius_gid in ius_gids:
            try:
                i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(ius_gid)
                if u_gid not in grouped:
                    grouped[u_gid] = []
                grouped[u_gid].append(ius_gid)
            except ValueError:
                # Invalid format, skip
                continue
        
        return grouped
    
    @staticmethod
    def sort_ius_gids(ius_gids: List[str], sort_by: str = 'indicator') -> List[str]:
        """
        Sort IUS GIDs by specified component.
        
        Args:
            ius_gids: List of IUS GIDs to sort
            sort_by: Sort criteria ('indicator', 'unit', 'subgroup', or 'full')
            
        Returns:
            Sorted list of IUS GIDs
        """
        def sort_key(ius_gid: str) -> Tuple[str, str, str]:
            try:
                i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(ius_gid)
                
                if sort_by == 'indicator':
                    return (i_gid, u_gid, s_gid)
                elif sort_by == 'unit':
                    return (u_gid, i_gid, s_gid)
                elif sort_by == 'subgroup':
                    return (s_gid, i_gid, u_gid)
                else:  # 'full' or default
                    return (i_gid, u_gid, s_gid)
                    
            except ValueError:
                # Invalid format, sort to end
                return ('zzz', 'zzz', 'zzz')
        
        return sorted(ius_gids, key=sort_key)
    
    @staticmethod
    def find_ius_conflicts(
        dw_id: str, 
        target_ius_gids: List[str], 
        operation_type: str
    ) -> Dict[str, List[str]]:
        """
        Find IUS combinations that already have formulas of different types.
        
        Args:
            dw_id: Data warehouse ID
            target_ius_gids: List of target IUS GIDs to check
            operation_type: Operation type being configured
            
        Returns:
            Dictionary mapping IUS GIDs to lists of conflicting operation types
        """
        from apps.datawarehouse.models.datawarehouse import (
            CeIusComputeAddTarget, CeIusComputeDiv, CeIusComputeMinus, CeIusComputeTime,
            CeIusComputeArea,
        )
        from apps.datawarehouse.constants import (
            OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
            OPERATION_AREA,
        )
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            conflicts = {}
            
            for ius_gid in target_ius_gids:
                try:
                    i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(ius_gid)
                    existing_operations = []
                    
                    # Check TOTAL formulas
                    if operation_type != OPERATION_TOTAL:
                        total_exists = dw_db.query(CeIusComputeAddTarget).filter(
                            CeIusComputeAddTarget.dw_id == int(dw_id),
                            CeIusComputeAddTarget.i_gid == i_gid,
                            CeIusComputeAddTarget.u_gid == u_gid,
                            CeIusComputeAddTarget.s_gid == s_gid
                        ).first()
                        if total_exists:
                            existing_operations.append(OPERATION_TOTAL)
                    
                    # Check PERCENT formulas
                    if operation_type != OPERATION_PERCENT:
                        percent_exists = dw_db.query(CeIusComputeDiv).filter(
                            CeIusComputeDiv.dw_id == int(dw_id),
                            CeIusComputeDiv.i_gid == i_gid,
                            CeIusComputeDiv.u_gid == u_gid,
                            CeIusComputeDiv.s_gid == s_gid
                        ).first()
                        if percent_exists:
                            existing_operations.append(OPERATION_PERCENT)
                    
                    # Check TIME formulas
                    if operation_type != OPERATION_TIME:
                        time_exists = dw_db.query(CeIusComputeTime).filter(
                            CeIusComputeTime.dw_id == int(dw_id),
                            CeIusComputeTime.i_gid == i_gid,
                            CeIusComputeTime.u_gid == u_gid,
                            CeIusComputeTime.s_gid == s_gid
                        ).first()
                        if time_exists:
                            existing_operations.append(OPERATION_TIME)
                    
                    # Check MINUS formulas
                    if operation_type != OPERATION_MINUS:
                        minus_exists = dw_db.query(CeIusComputeMinus).filter(
                            CeIusComputeMinus.dw_id == int(dw_id),
                            CeIusComputeMinus.i_gid == i_gid,
                            CeIusComputeMinus.u_gid == u_gid,
                            CeIusComputeMinus.s_gid == s_gid
                        ).first()
                        if minus_exists:
                            existing_operations.append(OPERATION_MINUS)

                    # Check AREA formulas
                    if operation_type != OPERATION_AREA:
                        area_exists = dw_db.query(CeIusComputeArea).filter(
                            CeIusComputeArea.dw_id == int(dw_id),
                            CeIusComputeArea.i_gid == i_gid,
                            CeIusComputeArea.u_gid == u_gid,
                            CeIusComputeArea.s_gid == s_gid
                        ).first()
                        if area_exists:
                            existing_operations.append(OPERATION_AREA)

                    if existing_operations:
                        conflicts[ius_gid] = existing_operations
                        
                except ValueError:
                    # Invalid IUS format, skip
                    continue
            
            return conflicts
    