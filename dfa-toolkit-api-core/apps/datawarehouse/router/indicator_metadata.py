"""
Indicator Metadata router - GET and PATCH metadata for indicators
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, status, Path, Header, HTTPException, Body, Depends, Query
from fastapi.responses import JSONResponse

from apps.shared.schemas.response import SuccessResponse, ErrorResponse
from apps.datawarehouse.services.indicator_metadata import IndicatorMetadataService
from apps.datawarehouse.schemas.indicator_metadata import (
    IndicatorMetadataUpdateRequestSchema,
    IndicatorInfoSchema,
    MetadataCategoryResponseSchema,
)
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.shared.utils.response import (
    success_response,
)
from apps.datawarehouse.db.datawarehouse import get_dw_language_code
from apps.shared.config.config import settings
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.datawarehouse.db.datawarehouse import validate_dw_id
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    PATH_IDENTIFIER,
    QUERY_INDICATOR_META,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Data Warehouse - Indicators"], prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/indicators/{{{PATH_IDENTIFIER}}}/metadata")
metadata_service = IndicatorMetadataService()


# @router.get(
#     "/",
#     summary="List metadata for indicator",
#     description="Get indicator metadata including metadata categories and unit-subgroupval combinations. **identifier**: numeric → indicator_nid, alphanumeric → indicator_gid. Metadata is returned directly under `data`. Use `include_indicator=true` to also return indicator info in `meta`.",
#     response_model=SuccessResponse,
#     responses={
#         200: {"description": "Indicator metadata retrieved successfully", "model": SuccessResponse},
#         404: {"description": "Indicator or warehouse not found", "model": ErrorResponse},
#         500: {"description": "Internal server error", "model": ErrorResponse},
#     },
# )
# async def get_indicator_metadata(
#     dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
#     _: str = Depends(validate_dw_id),
#     identifier: str = Path(..., description="Indicator identifier: numeric for indicator_nid, alphanumeric for indicator_gid", alias=PATH_IDENTIFIER),
#     language_code: str = Depends(get_dw_language_code),
#     indicator: bool = Query(False, description="Include indicator basic info in meta field", alias=QUERY_INDICATOR_META),
# ):
#     """Get metadata for an indicator including categories and unit-subgroupval combinations. Metadata list is in `data`; optionally include indicator info in `meta`."""
#     try:
        
#         cache_key = f"dw:indicators:metadata:{dw_id}:{identifier}:{language_code}:{indicator}"
#         cached = cache_get(cache_key)
#         if cached is not None:
#             return JSONResponse(content=cached, status_code=status.HTTP_200_OK)
        
#         result = metadata_service.get_indicator_metadata(dw_id, identifier, language_code)
        
#         if not result:
#             raise not_found_for_identifier("Indicator", identifier)
        
#         # Restructure response based on need_indicator_info flag
#         if indicator:
#             # Extract indicator info and metadata list from result
#             indicator_info_data = {
#                 "indicator_name": result.get("indicator_name"),
#                 "indicator_gid": result.get("indicator_gid"),
#                 "short_name": result.get("short_name"),
#                 "keywords": result.get("keywords"),
#                 "indicator_order": result.get("indicator_order"),
#                 "highisgood": result.get("highisgood"),
#             }
            
#             # Serialize metadata list
#             metadata_list = [
#                 MetadataCategoryResponseSchema.model_validate(item).model_dump(
#                     **get_serialization_mode()
#                 )
#                 for item in result.get("meta_data", [])
#             ]
            
#             # Serialize indicator info
#             indicator_info = IndicatorInfoSchema.model_validate(indicator_info_data).model_dump(
#                 **get_serialization_mode()
#             )
            
#             response_data = metadata_list
#             meta_data = {"indicator": indicator_info}
            
#             body = {
#                 "success": True,
#                 "message": "",
#                 "data": response_data,
#                 "meta": meta_data,
#             }
#             cache_set(cache_key, body)
#             return success_response(message="", data=response_data, meta=meta_data)
#         else:
#             # Return only metadata list in data field
#             metadata_list = [
#                 MetadataCategoryResponseSchema.model_validate(item).model_dump(
#                     **get_serialization_mode()
#                 )
#                 for item in result.get("meta_data", [])
#             ]
            
#             body = {
#                 "success": True,
#                 "message": "",
#                 "data": metadata_list,
#             }
#             cache_set(cache_key, body)
#             return success_response(message="", data=metadata_list)
        
#     except ValueError as e:
#         logger.error(f"Error retrieving indicator metadata: {str(e)}", exc_info=True)
#         error_msg = str(e)
#         if "Warehouse" in error_msg and "not found" in error_msg:
#             raise not_found_for_identifier("Datawarehouse", dw_id)
#         if "Language code" in error_msg:
#             return error_response(
#                 message=error_msg,
#                 status_code=status.HTTP_400_BAD_REQUEST
#             )
#         return error_response(
#             message=error_msg,
#             status_code=status.HTTP_404_NOT_FOUND,
#         )
#     except HTTPException as e:
#         if e.status_code == status.HTTP_404_NOT_FOUND:
#             raise not_found_for_identifier("Datawarehouse", dw_id)
#         raise
#     except Exception as e:
#         logger.error(f"Error retrieving indicator metadata: {str(e)}", exc_info=True)
#         return error_response(
#             message=f"Failed to retrieve indicator metadata: {str(e)}",
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#         )


def _invalidate_indicator_metadata_cache(dw_id: str, identifier: str) -> None:
    """Invalidate indicator metadata cache keys for this indicator."""
    # Invalidate pattern-based (covers all language variants)
    cache_delete_pattern(f"dw:indicators:metadata:{dw_id}:{identifier}:*")


@router.patch(
    "",
    summary="Update indicator metadata",
    description="Update indicator metadata by category. For each item: if mt_rpt_metadata is empty/null, deletes the metadata record; if it has a value, inserts or updates the metadata record. **identifier**: numeric → indicator_nid, alphanumeric → indicator_gid.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Indicator metadata updated successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid input", "model": ErrorResponse},
        404: {"description": "Indicator, category, or warehouse not found", "model": ErrorResponse},
        422: {"description": "Validation error", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_indicator_metadata(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    identifier: str = Path(..., description="Indicator identifier: numeric for indicator_nid, alphanumeric for indicator_gid", alias=PATH_IDENTIFIER),
    body: IndicatorMetadataUpdateRequestSchema = Body(..., description="Payload with update_items array"),
    language_code: str = Depends(get_dw_language_code),
):
    """Update metadata for an indicator by category."""
    items_dict = [item.model_dump(by_alias=False) for item in body.update_items]

    result = metadata_service.update_indicator_metadata(
        dw_id, identifier, items_dict, language_code
    )

    # Invalidate cache for this indicator
    _invalidate_indicator_metadata_cache(dw_id, identifier)

    all_errors = result.get("errors", [])

    response_data = {
        "updated_count": result["updated_count"],
        "deleted_count": result["deleted_count"],
        "total_processed": len(body.update_items),
    }
    meta = {"errors": all_errors} if all_errors else None

    if all_errors:
        return success_response(
            message=f"Metadata updated with {result['updated_count']} updates and {result['deleted_count']} deletions. Some errors occurred.",
            data=response_data,
            meta=meta,
        )

    return success_response(
        message=f"Metadata updated successfully: {result['updated_count']} updates, {result['deleted_count']} deletions",
        data=response_data,
    )

