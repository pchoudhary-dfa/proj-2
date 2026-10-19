"""
Compute Formula Router — Data Warehouse.

Manages formula configuration for compute operations.
All routes live under /dw/{dw_id}/compute/formula/.
"""

import logging
import urllib.parse
from typing import List
from fastapi import APIRouter, Depends, Path, Query

from apps.shared.config.dependencies import get_db
from apps.shared.utils.response import (
    success_response, error_response, validation_error_response
)
from apps.datawarehouse.db.datawarehouse import get_dw_language_code, get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import CeIusComputeTime
from apps.shared.schemas.response import SuccessResponse
from apps.datawarehouse.services.formula_service import FormulaService
from apps.datawarehouse.schemas.compute_formula import (
    TotalFormulaRequest, PercentFormulaRequest, MinusFormulaRequest, TimeFormulaRequest,
    AreaFormulaRequest,
)
from apps.datawarehouse.constants import (
    OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS, OPERATION_AREA,
    PERIODICITY_MAP, PATH_DW_ID
)
from apps.datawarehouse.utils.compute_ius_utils import IusUtils
from .common_responses import COMMON_RESPONSES

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/dw",
    tags=["Data Warehouse - Compute Formula"],
)


# ---------------------------------------------------------------------------
# Formula CRUD
# ---------------------------------------------------------------------------

@router.post(
    "/{dw_id}/compute/formula/total",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Save TOTAL formula",
    description=(
        "Create or update a **TOTAL** (sum aggregation) formula: `target = source1 + source2 + ...`\n\n"
        
        "## Required Payload Fields:\n"
        "- **`target_ius`** (string): Target IUS in format `indicator|unit|subgroup`\n"
        "- **`sources`** (array): List of source references - **ALWAYS REQUIRED**, even for bulk operations\n\n"
        
        "## Source Types (`sources[].type`):\n"
        "- **`ius`**: Direct IUS reference → requires `ius_gid`\n"
        "- **`iu`**: Indicator-Unit (expands to all subgroups) → requires `i_gid`, `u_gid`\n"
        "- **`ic`**: Indicator Classification (expands to all IUS) → requires `ic_nid`\n\n"
        
        "## Optional Fields:\n"
        "- **`target_decimal`** (integer, 0-10): Decimal precision for results\n"
        "- **`order`** (integer, ≥1): Processing order for multiple formulas\n\n"
        
        "## Bulk Operations (`bulk_operations`):\n"
        "- **`total_all_sub`** (boolean): Auto-create identical formulas for ALL indicators with same unit and complete subgroup set as sources\n"
        "- **`total_overwrite`** (boolean): When bulk=true, overwrite existing formulas (default: skip existing)\n\n"
        
        "**Example**: If sources have subgroups [MALE, FEMALE] and unit=STUDENTS, bulk will create formulas for ALL indicators with STUDENTS unit that also have exactly MALE+FEMALE subgroups."
    ),
)
async def save_total_formula(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    formula_data: TotalFormulaRequest = ...,
    language_code: str = Depends(get_dw_language_code),
):
    service = FormulaService()
    result = service.save_total_formula(
        dw_id,
        formula_data.dict(exclude={"language_code"}),
        language_code=language_code,
    )
    return success_response(
        message="TOTAL formula saved successfully",
        data={
            "formula_id": result["formula_id"],
            "target_ius": result["target_ius"],
            "target_ius_name": result.get("target_ius_name"),
            "operation_type": result["operation_type"],
            "source_count": result["source_count"],
        },
    )


@router.post(
    "/{dw_id}/compute/formula/percent",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Save PERCENT formula",
    description=(
        "Create or update a **PERCENT** (ratio) formula for the given target IUS.\n\n"
        "Computes `(numerator_ius / denominator_ius) × 100` and writes the result to the "
        "target IUS. Supports an optional area-specific denominator and a multiplier to "
        "scale the denominator before division."
    ),
)
async def save_percent_formula(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    formula_data: PercentFormulaRequest = ...,
    language_code: str = Depends(get_dw_language_code),
):
    service = FormulaService()
    result = service.save_percent_formula(
        dw_id,
        formula_data.dict(exclude={"language_code"}),
        language_code=language_code,
    )
    return success_response(
        message="PERCENT formula saved successfully",
        data={
            "formula_id": result["formula_id"],
            "target_ius": result["target_ius"],
            "target_ius_name": result.get("target_ius_name"),
            "operation_type": result["operation_type"],
        },
    )


@router.post(
    "/{dw_id}/compute/formula/minus",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Save MINUS formula",
    description=(
        "Create or update a **MINUS** (subtraction) formula for the given target IUS.\n\n"
        "Computes `minuend_ius − subtrahend_ius` and writes the result to the target IUS."
    ),
)
async def save_minus_formula(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    formula_data: MinusFormulaRequest = ...,
    language_code: str = Depends(get_dw_language_code),
):
    service = FormulaService()
    result = service.save_minus_formula(
        dw_id,
        formula_data.dict(exclude={"language_code"}),
        language_code=language_code,
    )
    return success_response(
        message="MINUS formula saved successfully",
        data={
            "formula_id": result["formula_id"],
            "target_ius": result["target_ius"],
            "target_ius_name": result.get("target_ius_name"),
            "operation_type": result["operation_type"],
        },
    )


@router.post(
    "/{dw_id}/compute/formula/time",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Save TIME formula",
    description=(
        "Create or update a **TIME** (temporal aggregation) formula for the given target IUS.\n\n"
        "Aggregates data from a finer source frequency (e.g. monthly) into a coarser target "
        "frequency (e.g. annually) using the specified aggregation method (sum or average).\n\n"
        "**Bulk flags** (`bulk_operations`):\n"
        "- `time_all_sub` — apply the same TIME settings to every IUS that shares the same "
        "unit, across all indicators and subgroups.\n"
        "- `time_oth_sub` — apply to all subgroups of the same indicator + unit combination "
        "only (narrower scope than `time_all_sub`).\n"
        "- `time_all_overwrite` — overwrite pre-existing TIME formulas during bulk operation.\n\n"
        "`time_all_sub` and `time_oth_sub` are mutually exclusive."
    ),
)
async def save_time_formula(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    formula_data: TimeFormulaRequest = ...,
    language_code: str = Depends(get_dw_language_code),
):
    service = FormulaService()
    result = service.save_time_formula(
        dw_id,
        formula_data.dict(exclude={"language_code"}),
        language_code=language_code,
    )
    return success_response(
        message="TIME formula saved successfully",
        data={
            "formula_id": result["formula_id"],
            "target_ius": result["target_ius"],
            "target_ius_name": result.get("target_ius_name"),
            "operation_type": result["operation_type"],
        },
    )


@router.post(
    "/{dw_id}/compute/formula/area",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Save AREA formula",
    description=(
        "Create or update an **AREA** (spatial aggregation) formula for the given target IUS.\n\n"
        "Aggregates data from a finer source area level (e.g. districts) into a coarser target "
        "area level (e.g. states) using the specified aggregation method (sum or average).\n\n"
        "When `populate_mid_levels` is true, cascading aggregation through each "
        "intermediate level is performed sequentially.\n\n"
        "**Bulk flags** (`bulk_operations`):\n"
        "- `area_all_sub` — apply the same AREA settings to every IUS that shares the same "
        "unit, across all indicators and subgroups.\n"
        "- `area_oth_sub` — apply to all subgroups of the same indicator + unit combination "
        "only (narrower scope than `area_all_sub`).\n"
        "- `area_all_overwrite` — overwrite pre-existing AREA formulas during bulk operation.\n\n"
        "`area_all_sub` and `area_oth_sub` are mutually exclusive."
    ),
)
async def save_area_formula(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    formula_data: AreaFormulaRequest = ...,
    language_code: str = Depends(get_dw_language_code),
):
    service = FormulaService()
    result = service.save_area_formula(
        dw_id,
        formula_data.dict(exclude={"language_code"}),
        language_code=language_code,
    )
    return success_response(
        message="AREA formula saved successfully",
        data={
            "formula_id": result["formula_id"],
            "target_ius": result["target_ius"],
            "target_ius_name": result.get("target_ius_name"),
            "operation_type": result["operation_type"],
        },
    )


@router.delete(
    "/{dw_id}/compute/formula/{operation_type}/ius/{ius_gid}",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Delete formula",
    description=(
        "Permanently delete the formula of the given **operation type** for the specified IUS.\n\n"
        "`operation_type` must be one of `TOTAL`, `PERCENT`, `MINUS`, `TIME`, or `AREA`.\n\n"
        "`ius_gid` should be URL-encoded (replace `|` with `%7C`)."
    ),
)
async def delete_formula(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    operation_type: str = Path(..., description="Formula operation type: TOTAL | PERCENT | MINUS | TIME"),
    ius_gid: str = Path(..., description="URL-encoded IUS GID (e.g. ind_gid%7Cunit_gid%7Csub_gid)"),
):
    valid_operations = [OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS, OPERATION_AREA]
    if operation_type not in valid_operations:
        raise ValueError(f"operation_type must be one of: {valid_operations}")

    decoded_ius_gid = urllib.parse.unquote(ius_gid)
    service = FormulaService()
    result = service.delete_formula(
        dw_id,
        operation_type,
        {"target_ius": decoded_ius_gid, "operation_type": operation_type},
    )
    return success_response(
        message=f"{operation_type} formula deleted successfully",
        data={
            "target_ius": result["target_ius"],
            "operation_type": result["operation_type"],
            "deleted_count": result["deleted_count"],
        },
    )


# ---------------------------------------------------------------------------
# IUS helpers  (static segments defined before /{ius_gid} to avoid conflicts)
# ---------------------------------------------------------------------------

@router.post(
    "/{dw_id}/compute/formula/resolve-ius",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Resolve IUS GIDs to names",
    description=(
        "Accepts a list of IUS GIDs and returns the human-readable indicator, unit, and "
        "subgroup names for each one in the requested language.\n\n"
        "Useful for populating labels in the UI after formula selection."
    ),
)
async def resolve_ius_names(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    ius_gids: List[str] = ...,
    language_code: str = Depends(get_dw_language_code),
):
    service = FormulaService()
    resolved = service.resolve_ius_names(dw_id, ius_gids, language_code)
    return success_response(message="IUS names resolved successfully", data=resolved)


@router.get(
    "/{dw_id}/compute/formula/operation-types",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="List available operation types",
    description=(
        "Returns all supported formula operation types with their display names and descriptions.\n\n"
        "Core operations (TOTAL, PERCENT, MINUS) are always available. TIME operations are "
        "dynamically generated based on existing time aggregation formulas in the data warehouse.\n\n"
        "Use this to populate operation-type pickers in the compute settings UI."
    ),
)
async def get_operation_types(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
):
    core_operations = [
        {
            "id": 0,
            "name": "Total",
            "value": OPERATION_TOTAL,
            "description": "Aggregates multiple source IUS values by summing them into a single target IUS.",
        },
        {
            "id": 1, 
            "name": "Percentage",
            "value": OPERATION_PERCENT,
            "description": "Computes (numerator ÷ denominator) × 100 and writes the result to the target IUS.",
        },
        {
            "id": 2,
            "name": "Minus", 
            "value": OPERATION_MINUS,
            "description": "Computes minuend − subtrahend and writes the result to the target IUS.",
        },
    ]
    
    # Query existing TIME operation target frequencies from database
    time_frequencies = []
    try:
        with get_warehouse_session_from_id(dw_id) as dw_session:
            time_freq_results = (
                dw_session.query(CeIusComputeTime.target_tp_freq)
                .filter(CeIusComputeTime.dw_id == dw_id)
                .distinct()
                .all()
            )
            time_frequencies = [result[0] for result in time_freq_results]
    except Exception as db_error:
        logger.warning("Failed to query TIME frequencies from database: %s", db_error)
        # Continue without TIME operations if database query fails
    
    # Build final operation list
    operation_list = core_operations.copy()
    
    # Add TIME operations for each unique target frequency found
    current_id = len(core_operations)
    for freq_code in time_frequencies:
        freq_name = PERIODICITY_MAP.get(freq_code, freq_code)
        operation_list.append({
            "id": current_id,
            "name": f"Timeperiod {freq_name}",
            "value": f"Timeperiods {freq_name}",
            "description": f"Rolls up data from a finer time frequency to {freq_name.lower()} aggregation.",
        })
        current_id += 1
    
    # Sort by name for consistent ordering
    operation_list.sort(key=lambda x: x["name"])
    
    return success_response(
        message="Operation types retrieved successfully",
        data=operation_list,
    )


@router.get(
    "/{dw_id}/compute/formula/ius/{ius_gid}/validate",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Validate IUS for formula creation",
    description=(
        "Checks whether the given IUS is valid for use as a formula target with the "
        "specified operation type.\n\n"
        "Validation steps:\n"
        "1. Parse and verify the IUS GID format.\n"
        "2. Confirm that each component (indicator, unit, subgroup) exists in the warehouse.\n"
        "3. Detect conflicts — i.e. an existing formula of a *different* operation type "
        "already assigned to this IUS.\n\n"
        "Returns a `is_valid` flag, component-level existence flags, any conflict details, "
        "and warnings for missing components.\n\n"
        "`ius_gid` must be URL-encoded."
    ),
)
async def validate_ius_for_formula(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    ius_gid: str = Path(..., description="URL-encoded IUS GID to validate"),
    operation_type: str = Query(..., description="Target operation type: TOTAL | PERCENT | MINUS | TIME"),
    language_code: str = Depends(get_dw_language_code),
):
    decoded_ius_gid = urllib.parse.unquote(ius_gid)

    valid_operations = [OPERATION_TOTAL, OPERATION_PERCENT, OPERATION_TIME, OPERATION_MINUS, OPERATION_AREA]
    if operation_type not in valid_operations:
        raise ValueError(f"Invalid operation type. Must be one of: {valid_operations}")

    i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(decoded_ius_gid)

    ius_metadata = IusUtils.resolve_ius_names(dw_id, [decoded_ius_gid], language_code)
    ius_info = ius_metadata.get(decoded_ius_gid, {})

    indicator_exists = ius_info.get("indicator_exists", False)
    unit_exists = ius_info.get("unit_exists", False)
    subgroup_exists = ius_info.get("subgroup_exists", False)
    is_valid = indicator_exists and unit_exists and subgroup_exists

    result = {
        "is_valid": is_valid,
        "ius_gid": decoded_ius_gid,
        "operation_type": operation_type,
        "ius_details": {
            "indicator_name": ius_info.get("i_name", i_gid),
            "unit_name": ius_info.get("u_name", u_gid),
            "subgroup_name": ius_info.get("s_name", s_gid),
            "indicator_exists": indicator_exists,
            "unit_exists": unit_exists,
            "subgroup_exists": subgroup_exists,
        },
        "conflicts": [],
        "warnings": [],
    }

    if not indicator_exists:
        result["warnings"].append(f"Indicator '{i_gid}' not found in warehouse")
    if not unit_exists:
        result["warnings"].append(f"Unit '{u_gid}' not found in warehouse")
    if not subgroup_exists:
        result["warnings"].append(f"Subgroup '{s_gid}' not found in warehouse")

    if is_valid:
        service = FormulaService()
        existing = service.check_existing_formula(dw_id, i_gid, u_gid, s_gid, language_code)
        if existing and existing["operation_type"] != operation_type:
            result["is_valid"] = False
            result["conflicts"].append(
                f"IUS already has a {existing['operation_type']} formula configured"
            )

    message = "IUS is valid for formula creation" if result["is_valid"] else "IUS validation failed"
    return success_response(message=message, data=result)


@router.get(
    "/{dw_id}/compute/formula/ius/{ius_gid}",
    response_model=SuccessResponse,
    responses=COMMON_RESPONSES,
    summary="Check existing formula for an IUS",
    description=(
        "Returns the formula already configured for the given IUS, if one exists.\n\n"
        "Use this before opening the formula editor to pre-fill existing settings and "
        "determine which operation tab (Total / Minus / Percentage / Time Period) should "
        "be active.\n\n"
        "`ius_gid` must be URL-encoded."
    ),
)
async def check_existing_formula(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    ius_gid: str = Path(..., description="URL-encoded IUS GID to check"),
    language_code: str = Depends(get_dw_language_code),
):
    decoded_ius_gid = urllib.parse.unquote(ius_gid)
    i_gid, u_gid, s_gid = IusUtils.parse_ius_gid(decoded_ius_gid)

    service = FormulaService()
    existing = service.check_existing_formula(dw_id, i_gid, u_gid, s_gid, language_code)

    if existing:
        return success_response(
            message="Formula found for IUS",
            data={"exists": True, **existing},
        )
    return success_response(
        message="No formula configured for this IUS",
        data={"exists": False},
    )
