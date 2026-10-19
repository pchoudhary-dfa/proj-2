"""
Formula Schemas for Compute Engine.

Pydantic models for formula configuration request/response validation.
These schemas handle validation for TOTAL, PERCENT, TIME, and MINUS operations.

BULK OPERATION FLAGS EXPLAINED:

TOTAL Formula Bulk Operations:
- total_all_sub: Creates TOTAL formulas for ALL indicators that have the same unit 
  and complete subgroup set as the source formulas. 
  Example: If creating "Population Total = Male + Female", it will also create 
  "Education Total = Male + Female" for any indicator with same unit and subgroups.
  
- total_overwrite: Controls whether to overwrite existing TOTAL formulas during 
  bulk operation. If False, only creates formulas where none exist.

TIME Formula Bulk Operations:
- time_all_sub: Applies TIME settings to ALL IUS with the same unit as target,
  across all indicators and subgroups.
  
- time_oth_sub: Applies TIME settings only to other subgroups of the same 
  indicator+unit combination as the target.
  
- time_all_overwrite: Controls whether to overwrite existing TIME formulas during 
  bulk operation. If False, only creates formulas where none exist.

Note: time_all_sub and time_oth_sub are mutually exclusive in practice - 
time_all_sub is broader (all indicators) while time_oth_sub is narrower (same indicator).
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, validator, model_validator
from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS,
    OPERATION_AREA,
    FREQ_ANNUALLY, FREQ_QUARTERLY, FREQ_MONTHLY, FREQ_DAILY,
    FREQ_HALFYEARLY, FREQ_FORTNIGHTLY, AGG_TYPE_SUM, AGG_TYPE_AVG,
    FREQUENCY_COMPATIBILITY_MAP
)
from apps.shared.utils.ius_utils import get_ius_gid_separator, validate_ius_gid_format


class TotalBulkOperationFlags(BaseModel):
    """Bulk operation flags for TOTAL formulas."""
    total_all_sub: Optional[bool] = Field(
        False, 
        description="Auto-create identical TOTAL formulas for ALL indicators that have: (1) same unit as target, (2) exact same subgroup set as sources. Example: if sources=[MALE,FEMALE] with unit=STUDENTS, creates formulas for all indicators with STUDENTS unit that also have exactly MALE+FEMALE subgroups"
    )
    total_overwrite: Optional[bool] = Field(
        False, 
        description="When total_all_sub=true, overwrite existing formulas (default: false = skip indicators that already have any formula)"
    )


class TimeBulkOperationFlags(BaseModel):
    """Bulk operation flags for TIME formulas."""
    time_all_sub: Optional[bool] = Field(
        False, 
        description="Apply TIME settings to all IUS with same unit (across all indicators)"
    )
    time_oth_sub: Optional[bool] = Field(
        False, 
        description="Apply TIME settings to all subgroups of same indicator+unit"
    )
    time_all_overwrite: Optional[bool] = Field(
        False, 
        description="Overwrite existing TIME formulas during bulk operation"
    )



class SourceReference(BaseModel):
    """Source reference for TOTAL formulas with IC/IU/IUS expansion support."""
    type: Literal["ius", "iu", "ic"] = Field(
        "ius", 
        description="Source type: 'ius' (single IUS), 'iu' (all subgroups of indicator-unit), 'ic' (all IUS under classification)"
    )
    
    # For IUS type (direct reference) - REQUIRED when type='ius'
    ius_gid: Optional[str] = Field(None, description="[type=ius] Direct IUS GID (indicator|unit|subgroup). Required when type='ius'")
    
    # For IU type (indicator-unit, expands to all subgroups) - REQUIRED when type='iu'
    i_gid: Optional[str] = Field(None, description="[type=iu] Indicator GID. Required when type='iu'")
    u_gid: Optional[str] = Field(None, description="[type=iu] Unit GID. Required when type='iu'")
    i_name: Optional[str] = Field(None, description="[type=iu] Indicator name (optional, for display)")
    u_name: Optional[str] = Field(None, description="[type=iu] Unit name (optional, for display)")
    
    # For IC type (indicator classification, expands to all IUS under classification) - REQUIRED when type='ic'
    ic_nid: Optional[int] = Field(None, description="[type=ic] Indicator Classification NID. Required when type='ic'")
    ic_name: Optional[str] = Field(None, description="[type=ic] Classification name (optional, for display)")
    
    @validator('ius_gid')
    def validate_ius_gid_when_type_ius(cls, v, values):
        """Validate IUS GID when type is 'ius'."""
        if values.get('type') == 'ius':
            if not v:
                raise ValueError("ius_gid is required when type is 'ius'")
            if not validate_ius_gid_format(v):
                separator = get_ius_gid_separator()
                raise ValueError(f"IUS GID must contain delimiter '{separator}' and have exactly 3 parts")
        return v
    
    @validator('ic_nid')
    def validate_ic_fields_when_type_ic(cls, v, values):
        """Validate IC fields when type is 'ic'."""
        if values.get('type') == 'ic':
            if not v:
                raise ValueError("ic_nid is required when type is 'ic'")
        return v
    
    @model_validator(mode='after')
    def validate_type_specific_fields(self):
        """Validate type-specific required fields."""
        if self.type == 'iu':
            if not self.i_gid or not self.u_gid:
                raise ValueError("i_gid and u_gid are required when type is 'iu'")
        
        return self


class IusReference(BaseModel):
    """IUS (Indicator-Unit-Subgroup) reference model."""
    ius_gid: str = Field(..., description="IUS GID in format: i_gid|u_gid|s_gid (separator configurable)")
    ius_name: Optional[str] = Field(None, description="Human-readable IUS name")
    
    @validator('ius_gid')
    def validate_ius_format(cls, v):
        """Validate IUS GID format."""
        if not validate_ius_gid_format(v):
            separator = get_ius_gid_separator()
            raise ValueError(f"IUS GID must contain delimiter '{separator}' and have exactly 3 parts: i_gid, u_gid, s_gid")
        return v


class TotalFormulaRequest(BaseModel):
    """
    Request schema for TOTAL formula creation.
    
    Creates sum formulas: target = source1 + source2 + ...
    
    Example payloads:
    
    1. Simple IUS sources:
    {
        "target_ius": "TOTAL_ENROLLMENT|STUDENTS|ALL",
        "sources": [
            {"type": "ius", "ius_gid": "ENROLLMENT|STUDENTS|MALE"},
            {"type": "ius", "ius_gid": "ENROLLMENT|STUDENTS|FEMALE"}
        ]
    }
    
    2. With bulk operations:
    {
        "target_ius": "TOTAL_ENROLLMENT|STUDENTS|ALL", 
        "sources": [
            {"type": "ius", "ius_gid": "ENROLLMENT|STUDENTS|MALE"},
            {"type": "ius", "ius_gid": "ENROLLMENT|STUDENTS|FEMALE"}
        ],
        "bulk_operations": {
            "total_all_sub": true,
            "total_overwrite": false
        }
    }
    
    3. Using IU expansion:
    {
        "target_ius": "TOTAL_ENROLLMENT|STUDENTS|ALL",
        "sources": [
            {"type": "iu", "i_gid": "ENROLLMENT", "u_gid": "STUDENTS"}
        ]
    }
    """
    target_ius: str = Field(..., description="Target IUS GID in format: indicator|unit|subgroup (e.g., 'ENROLLMENT|STUDENTS|TOTAL')")
    
    # Source references with IC/IU/IUS expansion support 
    sources: List[SourceReference] = Field(
        ..., 
        min_items=1, 
        description="Source references for summation. REQUIRED even for bulk operations - used for pattern matching. Supports IUS (direct), IU (indicator-unit expansion), IC (classification expansion)"
    )
    
    target_decimal: Optional[int] = Field(None, description="Decimal precision for computed results (0-10). Default uses system precision")
    order: Optional[int] = Field(1, ge=1, description="Processing order when multiple formulas exist for same IUS (higher = processed later)")
    bulk_operations: Optional[TotalBulkOperationFlags] = Field(None, description="Bulk formula creation settings. When total_all_sub=true, creates identical formulas for all indicators with same unit+subgroup pattern as sources")
    
    @validator('target_ius')
    def validate_target_ius(cls, v):
        """Validate target IUS format."""
        if not validate_ius_gid_format(v):
            separator = get_ius_gid_separator()
            raise ValueError(f"Target IUS must contain delimiter '{separator}'")
        return v
    
    
    @validator('target_decimal')
    def validate_decimal_precision_laravel_compatible(cls, v):
        """Allow empty string like Laravel for default behavior."""
        if v == "" or v is None:
            return None  # Use default precision handling
        
        # Ensure it's within valid range
        if isinstance(v, int) and 0 <= v <= 10:
            return v
        
        # Try to convert string to int
        if isinstance(v, str):
            try:
                decimal_val = int(v)
                if 0 <= decimal_val <= 10:
                    return decimal_val
            except ValueError:
                pass
        
        raise ValueError("target_decimal must be an integer between 0 and 10, or empty for default")


class PercentFormulaRequest(BaseModel):
    """Request schema for PERCENT formula creation."""
    target_ius: str = Field(..., description="Target IUS GID")
    numerator_ius: str = Field(..., description="Numerator IUS GID")
    denominator_ius: str = Field(..., description="Denominator IUS GID")
    target_decimal: Optional[int] = Field(None, description="Decimal precision (0-10, or None for default)")
    den_area_specific: Optional[bool] = Field(False, description="Use specific area for denominator")
    den_area_id: Optional[str] = Field(None, description="Specific area ID for denominator")
    den_area_name: Optional[str] = Field(None, description="Specific area name for denominator")
    den_multiplier: Optional[float] = Field(None, gt=0, description="Denominator multiplier")
    is_most_recent: Optional[bool] = Field(False, description="Use most recent data")
    
    @validator('target_ius', 'numerator_ius', 'denominator_ius')
    def validate_ius_format(cls, v):
        """Validate IUS format."""
        if not validate_ius_gid_format(v):
            separator = get_ius_gid_separator()
            raise ValueError(f"IUS must contain delimiter '{separator}'")
        return v
    
    @validator('target_decimal')
    def validate_decimal_precision_laravel_compatible(cls, v):
        """Allow empty string like Laravel for default behavior."""
        if v == "" or v is None:
            return None  # Use default precision handling
        
        # Ensure it's within valid range
        if isinstance(v, int) and 0 <= v <= 10:
            return v
        
        # Try to convert string to int
        if isinstance(v, str):
            try:
                decimal_val = int(v)
                if 0 <= decimal_val <= 10:
                    return decimal_val
            except ValueError:
                pass
        
        raise ValueError("target_decimal must be an integer between 0 and 10, or empty for default")


class MinusFormulaRequest(BaseModel):
    """Request schema for MINUS formula creation."""
    target_ius: str = Field(..., description="Target IUS GID")
    minuend_ius: str = Field(..., description="Minuend IUS GID (number being subtracted from)")
    subtrahend_ius: str = Field(..., description="Subtrahend IUS GID (number being subtracted)")
    target_decimal: Optional[int] = Field(None, description="Decimal precision (0-10, or None for default)")
    
    @validator('target_ius', 'minuend_ius', 'subtrahend_ius')
    def validate_ius_format(cls, v):
        """Validate IUS format."""
        if not validate_ius_gid_format(v):
            separator = get_ius_gid_separator()
            raise ValueError(f"IUS must contain delimiter '{separator}'")
        return v
    
    @validator('target_decimal')
    def validate_decimal_precision_laravel_compatible(cls, v):
        """Allow empty string like Laravel for default behavior."""
        if v == "" or v is None:
            return None  # Use default precision handling
        
        # Ensure it's within valid range
        if isinstance(v, int) and 0 <= v <= 10:
            return v
        
        # Try to convert string to int
        if isinstance(v, str):
            try:
                decimal_val = int(v)
                if 0 <= decimal_val <= 10:
                    return decimal_val
            except ValueError:
                pass
        
        raise ValueError("target_decimal must be an integer between 0 and 10, or empty for default")


class TimeFormulaRequest(BaseModel):
    """Request schema for TIME formula creation."""
    target_ius: str = Field(..., description="Target IUS GID")
    target_decimal: Optional[int] = Field(None, description="Decimal precision (0-10, or None for default)")
    target_tp_freq: str = Field(..., description="Target time period frequency")
    source_tp_freq: str = Field(..., description="Source time period frequency")
    aggregation_type: str = Field(AGG_TYPE_SUM, description="Aggregation type: sum or avg")
    bulk_operations: Optional[TimeBulkOperationFlags] = Field(None, description="Bulk operation flags for TIME formulas")
    
    @validator('target_ius')
    def validate_target_ius(cls, v):
        """Validate target IUS format."""
        if not validate_ius_gid_format(v):
            separator = get_ius_gid_separator()
            raise ValueError(f"Target IUS must contain delimiter '{separator}'")
        return v
    
    @validator('target_tp_freq', 'source_tp_freq')
    def validate_and_normalize_frequency(cls, v):
        """Validate and normalize time period frequency for Laravel compatibility."""
        if not v:
            raise ValueError("Frequency cannot be empty")
        
        # Check if it's already in uppercase format
        valid_frequencies = [FREQ_ANNUALLY, FREQ_QUARTERLY, FREQ_MONTHLY, 
                           FREQ_DAILY, FREQ_HALFYEARLY, FREQ_FORTNIGHTLY]
        if v in valid_frequencies:
            return v
        
        # Check if it's in Laravel lowercase format and convert
        if v.lower() in FREQUENCY_COMPATIBILITY_MAP:
            normalized = FREQUENCY_COMPATIBILITY_MAP[v.lower()]
            return normalized
        
        # Invalid frequency
        valid_options = list(valid_frequencies) + list(FREQUENCY_COMPATIBILITY_MAP.keys())
        raise ValueError(f"Frequency must be one of: {valid_options}")
    
    @validator('target_decimal')
    def validate_decimal_precision_laravel_compatible(cls, v):
        """Allow empty string like Laravel for default behavior."""
        if v == "" or v is None:
            return None  # Use default precision handling
        
        # Ensure it's within valid range
        if isinstance(v, int) and 0 <= v <= 10:
            return v
        
        # Try to convert string to int
        if isinstance(v, str):
            try:
                decimal_val = int(v)
                if 0 <= decimal_val <= 10:
                    return decimal_val
            except ValueError:
                pass
        
        raise ValueError("target_decimal must be an integer between 0 and 10, or empty for default")
    
    @validator('aggregation_type')
    def validate_aggregation_type(cls, v):
        """Validate aggregation type."""
        if v not in [AGG_TYPE_SUM, AGG_TYPE_AVG]:
            raise ValueError(f"Aggregation type must be '{AGG_TYPE_SUM}' or '{AGG_TYPE_AVG}'")
        return v


class AreaBulkOperationFlags(BaseModel):
    """Bulk operation flags for AREA formulas."""
    area_all_sub: Optional[bool] = Field(
        False,
        description="Apply AREA settings to all IUS with same unit (across all indicators)"
    )
    area_oth_sub: Optional[bool] = Field(
        False,
        description="Apply AREA settings to all subgroups of same indicator+unit"
    )
    area_all_overwrite: Optional[bool] = Field(
        False,
        description="Overwrite existing AREA formulas during bulk operation"
    )


class AreaFormulaRequest(BaseModel):
    """Request schema for AREA formula creation."""
    target_ius: str = Field(..., description="Target IUS GID (same IUS used as source)")
    target_decimal: Optional[int] = Field(None, description="Decimal precision (0-10, or None for default)")
    target_area_level: int = Field(..., description="Target (parent) area level")
    source_area_level: int = Field(..., description="Source (child) area level")
    aggregation_type: str = Field(AGG_TYPE_SUM, description="Aggregation type: sum or avg")
    populate_mid_levels: Optional[bool] = Field(
        False,
        description="When true, cascade aggregation through each intermediate level from source to target"
    )
    bulk_operations: Optional[AreaBulkOperationFlags] = Field(None, description="Bulk operation flags for AREA formulas")

    @validator('target_ius')
    def validate_target_ius(cls, v):
        if not validate_ius_gid_format(v):
            separator = get_ius_gid_separator()
            raise ValueError(f"Target IUS must contain delimiter '{separator}'")
        return v

    @validator('target_area_level', 'source_area_level')
    def validate_area_level(cls, v):
        if v < 0:
            raise ValueError("Area level must be a non-negative integer")
        return v

    @model_validator(mode='after')
    def validate_levels(self):
        if self.target_area_level >= self.source_area_level:
            raise ValueError(
                "target_area_level must be less than source_area_level "
                "(target is the parent/coarser level, source is the child/finer level)"
            )
        return self

    @validator('target_decimal')
    def validate_decimal_precision_laravel_compatible(cls, v):
        if v == "" or v is None:
            return None
        if isinstance(v, int) and 0 <= v <= 10:
            return v
        if isinstance(v, str):
            try:
                decimal_val = int(v)
                if 0 <= decimal_val <= 10:
                    return decimal_val
            except ValueError:
                pass
        raise ValueError("target_decimal must be an integer between 0 and 10, or empty for default")

    @validator('aggregation_type')
    def validate_aggregation_type(cls, v):
        if v not in [AGG_TYPE_SUM, AGG_TYPE_AVG]:
            raise ValueError(f"Aggregation type must be '{AGG_TYPE_SUM}' or '{AGG_TYPE_AVG}'")
        return v


class FormulaDeleteRequest(BaseModel):
    """Request schema for formula deletion."""
    target_ius: str = Field(..., description="Target IUS GID to delete")
    operation_type: str = Field(..., description="Operation type to delete")
    
    @validator('target_ius')
    def validate_target_ius(cls, v):
        """Validate target IUS format."""
        if not validate_ius_gid_format(v):
            separator = get_ius_gid_separator()
            raise ValueError(f"Target IUS must contain delimiter '{separator}'")
        return v
    
    @validator('operation_type')
    def validate_operation_type(cls, v):
        """Validate operation type."""
        valid_operations = [OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS, OPERATION_AREA]
        if v not in valid_operations:
            raise ValueError(f"Operation type must be one of: {valid_operations}")
        return v


class FormulaResponse(BaseModel):
    """Response schema for formula operations."""
    success: bool = Field(..., description="Operation success status")
    formula_id: Optional[int] = Field(None, description="Formula ID")
    target_ius: str = Field(..., description="Target IUS GID")
    operation_type: str = Field(..., description="Operation type")
    message: Optional[str] = Field(None, description="Success/error message")
    source_count: Optional[int] = Field(None, description="Number of source formulas (for TOTAL)")
    deleted_count: Optional[int] = Field(None, description="Number of deleted records")


class ExistingFormulaResponse(BaseModel):
    """Response schema for existing formula check."""
    exists: bool = Field(..., description="Whether formula exists")
    formula_id: Optional[int] = Field(None, description="Existing formula ID")
    operation_type: Optional[str] = Field(None, description="Existing operation type")
    ius_name: Optional[str] = Field(None, description="IUS display name")
    target_decimal: Optional[int] = Field(None, description="Decimal precision")


class TargetIusItem(BaseModel):
    """Target IUS list item."""
    ius_gid: str = Field(..., description="IUS GID")
    ius_name: str = Field(..., description="IUS display name")
    i_gid: str = Field(..., description="Indicator GID")
    u_gid: str = Field(..., description="Unit GID")
    s_gid: str = Field(..., description="Subgroup GID")


class TargetIusListResponse(BaseModel):
    """Response schema for target IUS list."""
    ius_list: List[TargetIusItem] = Field(..., description="Available IUS combinations")
    total_count: int = Field(..., description="Total number of available IUS combinations")
    ic_type: Optional[str] = Field(None, description="Indicator classification type filter")


class ExecutionTypeItem(BaseModel):
    """Execution type item."""
    operation_type: str = Field(..., description="Operation type code")
    operation_name: str = Field(..., description="Operation display name")
    description: str = Field(..., description="Operation description")
    enabled: bool = Field(True, description="Whether operation is enabled")


class ExecutionTypesResponse(BaseModel):
    """Response schema for available execution types."""
    execution_types: List[ExecutionTypeItem] = Field(..., description="Available execution types")


class FormulaValidationError(BaseModel):
    """Formula validation error details."""
    field: str = Field(..., description="Field name with error")
    message: str = Field(..., description="Error message")
    value: Optional[Any] = Field(None, description="Invalid value")


class FormulaErrorResponse(BaseModel):
    """Error response schema for formula operations."""
    success: bool = Field(False, description="Operation success status")
    error: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(None, description="Error code")
    validation_errors: Optional[List[FormulaValidationError]] = Field(None, description="Validation errors")
    target_ius: Optional[str] = Field(None, description="Target IUS that caused error")