"""
Source Management Utilities for Compute Engine.

This module provides utilities for source management and attribution
following the Laravel compute engine patterns for data source tracking.
"""

import json
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.utils.compute_ius_utils import IusUtils


class SourceUtils:
    """Utility class for source management operations."""
    
    @staticmethod
    def create_source_attribution(
        operation_type: str,
        target_ius: str,
        source_data: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create source attribution record for computed values.
        
        Args:
            operation_type: Type of operation (TOTAL/PERCENT/TIME/MINUS)
            target_ius: Target IUS GID
            source_data: List of source data used in computation
            metadata: Optional metadata about the computation
            
        Returns:
            Source attribution dictionary
        """
        attribution = {
            'operation_type': operation_type,
            'target_ius': target_ius,
            'sources': source_data,
            'computed_at': datetime.utcnow().isoformat(),
            'metadata': metadata or {}
        }
        
        # Add source summary
        attribution['source_summary'] = {
            'total_sources': len(source_data),
            'source_types': list(set(item.get('type', 'data') for item in source_data)),
            'has_null_values': any(item.get('value') is None for item in source_data)
        }
        
        return attribution
    
    @staticmethod
    def validate_source_availability(
        dw_id: str,
        source_ius_list: List[str],
        area_ids: List[str],
        time_periods: List[str]
    ) -> Dict[str, Dict[str, bool]]:
        """
        Validate that source data is available for computation.
        
        Args:
            dw_id: Data warehouse ID
            source_ius_list: List of source IUS GIDs
            area_ids: List of area IDs
            time_periods: List of time periods
            
        Returns:
            Dictionary mapping source IUS to availability status by area/time
        """
        # This is a placeholder implementation
        # In practice, this would query actual data tables to check availability
        
        availability = {}
        
        for ius_gid in source_ius_list:
            availability[ius_gid] = {}
            
            for area_id in area_ids:
                for time_period in time_periods:
                    key = f"{area_id}_{time_period}"
                    # Placeholder: assume data is available
                    availability[ius_gid][key] = True
        
        return availability
    
    @staticmethod
    def get_source_metadata(
        dw_id: str,
        ius_gids: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get metadata for source IUS combinations.
        
        Args:
            dw_id: Data warehouse ID
            ius_gids: List of IUS GIDs
            
        Returns:
            Dictionary mapping IUS GIDs to metadata
        """
        # Use IusUtils to get basic IUS information
        ius_info = IusUtils.resolve_ius_names(dw_id, ius_gids)
        
        # Add additional source-specific metadata
        for ius_gid, info in ius_info.items():
            info.update({
                'data_type': 'numeric',  # Placeholder
                'unit_type': 'count',    # Placeholder
                'last_updated': None,    # Would query actual data tables
                'data_quality_score': None,  # Would calculate from data quality metrics
                'source_system': 'manual_entry'  # Placeholder
            })
        
        return ius_info
    
    @staticmethod
    def build_computation_lineage(
        operation_type: str,
        target_ius: str,
        formula_config: Dict[str, Any],
        execution_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Build computation lineage for audit and debugging.
        
        Args:
            operation_type: Type of operation
            target_ius: Target IUS GID
            formula_config: Formula configuration
            execution_context: Execution context (area, time period, etc.)
            
        Returns:
            Computation lineage dictionary
        """
        lineage = {
            'target_ius': target_ius,
            'operation_type': operation_type,
            'execution_context': execution_context,
            'formula_config': formula_config,
            'lineage_id': f"{target_ius}_{operation_type}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Extract source dependencies based on operation type
        if operation_type == 'TOTAL':
            # Handle both new 'sources' format and legacy 'source_ius_list' format
            source_dependencies = []
            
            # New format: sources array with expansion support
            if 'sources' in formula_config:
                for source in formula_config['sources']:
                    if source.get('type') == 'ius' and 'ius_gid' in source:
                        source_dependencies.append({
                            'ius_gid': source['ius_gid'],
                            'dependency_type': 'additive_source',
                            'weight': 1.0,
                            'source_type': 'ius'
                        })
                    # Note: IC and IU types would need expansion here, but this is a utility function
                    # that typically receives already-expanded data
            
            # Legacy format: direct IUS list (for backward compatibility)
            elif 'source_ius_list' in formula_config:
                source_dependencies = [
                    {
                        'ius_gid': source_ius,
                        'dependency_type': 'additive_source',
                        'weight': 1.0,
                        'source_type': 'ius'
                    }
                    for source_ius in formula_config['source_ius_list']
                ]
            
            lineage['source_dependencies'] = source_dependencies
        
        elif operation_type == 'PERCENT':
            lineage['source_dependencies'] = [
                {
                    'ius_gid': formula_config.get('numerator_ius'),
                    'dependency_type': 'numerator',
                    'weight': 1.0
                },
                {
                    'ius_gid': formula_config.get('denominator_ius'),
                    'dependency_type': 'denominator',
                    'weight': -1.0  # Negative to indicate it's in denominator
                }
            ]
        
        elif operation_type == 'MINUS':
            lineage['source_dependencies'] = [
                {
                    'ius_gid': formula_config.get('minuend_ius'),
                    'dependency_type': 'minuend',
                    'weight': 1.0
                },
                {
                    'ius_gid': formula_config.get('subtrahend_ius'),
                    'dependency_type': 'subtrahend',
                    'weight': -1.0
                }
            ]
        
        elif operation_type == 'TIME':
            # For TIME operations, the source is the same IUS but different time periods
            lineage['source_dependencies'] = [
                {
                    'ius_gid': target_ius,
                    'dependency_type': 'temporal_source',
                    'weight': 1.0,
                    'source_frequency': formula_config.get('source_tp_freq'),
                    'target_frequency': formula_config.get('target_tp_freq'),
                    'aggregation_type': formula_config.get('aggregation_type', 'sum')
                }
            ]
        
        return lineage
    
    @staticmethod
    def track_source_usage(
        dw_id: str,
        source_ius: str,
        target_ius: str,
        operation_type: str,
        usage_context: Dict[str, Any]
    ) -> None:
        """
        Track source IUS usage for analytics and optimization.
        
        Args:
            dw_id: Data warehouse ID
            source_ius: Source IUS GID
            target_ius: Target IUS GID
            operation_type: Operation type
            usage_context: Context information about the usage
        """
        # This would typically log to a usage tracking table
        # For now, we'll just log the usage
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(
            "Source usage tracked: dw_id=%s, source=%s, target=%s, operation=%s, context=%s",
            dw_id, source_ius, target_ius, operation_type, json.dumps(usage_context)
        )
    
    @staticmethod
    def detect_circular_dependencies(
        dw_id: str,
        target_ius: str,
        source_ius_list: List[str],
        operation_type: str,
        max_depth: int = 10
    ) -> Tuple[bool, List[str]]:
        """
        Detect circular dependencies in formula definitions.
        
        Args:
            dw_id: Data warehouse ID
            target_ius: Target IUS GID
            source_ius_list: List of source IUS GIDs
            operation_type: Operation type
            max_depth: Maximum depth to check
            
        Returns:
            Tuple of (has_circular_dependency, dependency_chain)
        """
        from apps.datawarehouse.models.datawarehouse import (
            CeIusComputeAddTarget, CeIusComputeAddSource, CeIusComputeDiv,
            CeIusComputeMinus, CeIusComputeTime
        )
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            visited = set()
            path = []
            
            def check_dependency_recursive(current_ius: str, depth: int) -> Tuple[bool, List[str]]:
                if depth > max_depth:
                    return False, []
                
                if current_ius in visited:
                    # Found a cycle
                    cycle_start = path.index(current_ius) if current_ius in path else 0
                    return True, path[cycle_start:] + [current_ius]
                
                visited.add(current_ius)
                path.append(current_ius)
                
                try:
                    i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(current_ius)
                    
                    # Check if current IUS is a computed target
                    dependencies = []
                    
                    # Check TOTAL formulas
                    total_target = dw_db.query(CeIusComputeAddTarget).filter(
                        CeIusComputeAddTarget.dw_id == dw_id,
                        CeIusComputeAddTarget.i_gid == i_gid,
                        CeIusComputeAddTarget.u_gid == u_gid,
                        CeIusComputeAddTarget.s_gid == s_gid
                    ).first()
                    
                    if total_target:
                        sources = dw_db.query(CeIusComputeAddSource).filter(
                            CeIusComputeAddSource.target_id == total_target.id
                        ).all()
                        for source in sources:
                            source_ius = IusUtils.build_ius_gid(source.i_gid, source.u_gid, source.s_gid)
                            dependencies.append(source_ius)
                    
                    # Check PERCENT formulas
                    percent_formula = dw_db.query(CeIusComputeDiv).filter(
                        CeIusComputeDiv.dw_id == dw_id,
                        CeIusComputeDiv.i_gid == i_gid,
                        CeIusComputeDiv.u_gid == u_gid,
                        CeIusComputeDiv.s_gid == s_gid
                    ).first()
                    
                    if percent_formula:
                        num_ius = IusUtils.build_ius_gid(
                            percent_formula.num_i_gid, percent_formula.num_u_gid, percent_formula.num_s_gid
                        )
                        den_ius = IusUtils.build_ius_gid(
                            percent_formula.den_i_gid, percent_formula.den_u_gid, percent_formula.den_s_gid
                        )
                        dependencies.extend([num_ius, den_ius])
                    
                    # Check MINUS formulas
                    minus_formula = dw_db.query(CeIusComputeMinus).filter(
                        CeIusComputeMinus.dw_id == dw_id,
                        CeIusComputeMinus.i_gid == i_gid,
                        CeIusComputeMinus.u_gid == u_gid,
                        CeIusComputeMinus.s_gid == s_gid
                    ).first()
                    
                    if minus_formula:
                        min_ius = IusUtils.build_ius_gid(
                            minus_formula.min_i_gid, minus_formula.min_u_gid, minus_formula.min_s_gid
                        )
                        sub_ius = IusUtils.build_ius_gid(
                            minus_formula.sub_i_gid, minus_formula.sub_u_gid, minus_formula.sub_s_gid
                        )
                        dependencies.extend([min_ius, sub_ius])
                    
                    # Recursively check dependencies
                    for dep_ius in dependencies:
                        has_cycle, cycle_path = check_dependency_recursive(dep_ius, depth + 1)
                        if has_cycle:
                            return True, cycle_path
                    
                except ValueError:
                    # Invalid IUS format, skip
                    pass
                
                path.pop()
                return False, []
            
            # Check each source IUS for circular dependencies
            for source_ius in source_ius_list:
                visited.clear()
                path.clear()
                
                has_cycle, cycle_path = check_dependency_recursive(source_ius, 0)
                if has_cycle and target_ius in cycle_path:
                    return True, cycle_path
            
            return False, []
    
    @staticmethod
    def get_formula_impact_analysis(
        dw_id: str,
        target_ius: str
    ) -> Dict[str, Any]:
        """
        Analyze the impact of changing or deleting a formula.
        
        Args:
            dw_id: Data warehouse ID
            target_ius: Target IUS GID to analyze
            
        Returns:
            Impact analysis dictionary
        """
        from apps.datawarehouse.models.datawarehouse import (
            CeIusComputeAddSource, CeIusComputeDiv, CeIusComputeMinus
        )
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(target_ius)
                
                impact = {
                    'target_ius': target_ius,
                    'dependent_formulas': [],
                    'impact_level': 'low',
                    'affected_operations': []
                }
                
                # Find formulas that use this IUS as a source
                
                # Check TOTAL formulas
                total_sources = dw_db.query(CeIusComputeAddSource).filter(
                    CeIusComputeAddSource.dw_id == dw_id,
                    CeIusComputeAddSource.i_gid == i_gid,
                    CeIusComputeAddSource.u_gid == u_gid,
                    CeIusComputeAddSource.s_gid == s_gid
                ).all()
                
                for source in total_sources:
                    # Get the target of this source
                    from apps.datawarehouse.models.datawarehouse import CeIusComputeAddTarget
                    target = dw_db.query(CeIusComputeAddTarget).filter(
                        CeIusComputeAddTarget.id == source.target_id
                    ).first()
                    
                    if target:
                        target_ius_gid = IusUtils.build_ius_gid(target.i_gid, target.u_gid, target.s_gid)
                        impact['dependent_formulas'].append({
                            'target_ius': target_ius_gid,
                            'operation_type': 'TOTAL',
                            'dependency_type': 'source'
                        })
                
                # Check PERCENT formulas (numerator)
                percent_numerators = dw_db.query(CeIusComputeDiv).filter(
                    CeIusComputeDiv.dw_id == dw_id,
                    CeIusComputeDiv.num_i_gid == i_gid,
                    CeIusComputeDiv.num_u_gid == u_gid,
                    CeIusComputeDiv.num_s_gid == s_gid
                ).all()
                
                for formula in percent_numerators:
                    target_ius_gid = IusUtils.build_ius_gid(formula.i_gid, formula.u_gid, formula.s_gid)
                    impact['dependent_formulas'].append({
                        'target_ius': target_ius_gid,
                        'operation_type': 'PERCENT',
                        'dependency_type': 'numerator'
                    })
                
                # Check PERCENT formulas (denominator)
                percent_denominators = dw_db.query(CeIusComputeDiv).filter(
                    CeIusComputeDiv.dw_id == dw_id,
                    CeIusComputeDiv.den_i_gid == i_gid,
                    CeIusComputeDiv.den_u_gid == u_gid,
                    CeIusComputeDiv.den_s_gid == s_gid
                ).all()
                
                for formula in percent_denominators:
                    target_ius_gid = IusUtils.build_ius_gid(formula.i_gid, formula.u_gid, formula.s_gid)
                    impact['dependent_formulas'].append({
                        'target_ius': target_ius_gid,
                        'operation_type': 'PERCENT',
                        'dependency_type': 'denominator'
                    })
                
                # Check MINUS formulas (minuend and subtrahend)
                minus_minuends = dw_db.query(CeIusComputeMinus).filter(
                    CeIusComputeMinus.dw_id == dw_id,
                    CeIusComputeMinus.min_i_gid == i_gid,
                    CeIusComputeMinus.min_u_gid == u_gid,
                    CeIusComputeMinus.min_s_gid == s_gid
                ).all()
                
                for formula in minus_minuends:
                    target_ius_gid = IusUtils.build_ius_gid(formula.i_gid, formula.u_gid, formula.s_gid)
                    impact['dependent_formulas'].append({
                        'target_ius': target_ius_gid,
                        'operation_type': 'MINUS',
                        'dependency_type': 'minuend'
                    })
                
                minus_subtrahends = dw_db.query(CeIusComputeMinus).filter(
                    CeIusComputeMinus.dw_id == dw_id,
                    CeIusComputeMinus.sub_i_gid == i_gid,
                    CeIusComputeMinus.sub_u_gid == u_gid,
                    CeIusComputeMinus.sub_s_gid == s_gid
                ).all()
                
                for formula in minus_subtrahends:
                    target_ius_gid = IusUtils.build_ius_gid(formula.i_gid, formula.u_gid, formula.s_gid)
                    impact['dependent_formulas'].append({
                        'target_ius': target_ius_gid,
                        'operation_type': 'MINUS',
                        'dependency_type': 'subtrahend'
                    })
                
                # Determine impact level
                dependent_count = len(impact['dependent_formulas'])
                if dependent_count == 0:
                    impact['impact_level'] = 'none'
                elif dependent_count <= 3:
                    impact['impact_level'] = 'low'
                elif dependent_count <= 10:
                    impact['impact_level'] = 'medium'
                else:
                    impact['impact_level'] = 'high'
                
                # Get unique operation types affected
                impact['affected_operations'] = list(set(
                    dep['operation_type'] for dep in impact['dependent_formulas']
                ))
                
                return impact
                
            except ValueError:
                return {
                    'target_ius': target_ius,
                    'error': 'Invalid IUS GID format',
                    'dependent_formulas': [],
                    'impact_level': 'unknown',
                    'affected_operations': []
                }
    
    @staticmethod
    def optimize_source_order(
        source_ius_list: List[str],
        optimization_strategy: str = 'alphabetical'
    ) -> List[str]:
        """
        Optimize the order of source IUS for computation efficiency.
        
        Args:
            source_ius_list: List of source IUS GIDs
            optimization_strategy: Strategy for optimization
            
        Returns:
            Optimized list of source IUS GIDs
        """
        if optimization_strategy == 'alphabetical':
            return IusUtils.sort_ius_gids(source_ius_list, 'full')
        elif optimization_strategy == 'by_indicator':
            return IusUtils.sort_ius_gids(source_ius_list, 'indicator')
        elif optimization_strategy == 'by_unit':
            return IusUtils.sort_ius_gids(source_ius_list, 'unit')
        else:
            # Default: return as-is
            return source_ius_list