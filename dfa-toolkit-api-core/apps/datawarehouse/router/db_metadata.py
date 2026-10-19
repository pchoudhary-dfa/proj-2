"""
DB metadata router – GET counts from ut_dbmetadata_* (dbmtd_areacnt, dbmtd_indcnt, etc.).
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, status

from apps.app_db.dependencies import get_current_username
from apps.datawarehouse.constants import PATH_DW_ID
from apps.datawarehouse.db.datawarehouse import (
    get_cached_dw_language_info,
    get_dw_language_code,
    get_warehouse_session_from_id,
    validate_dw_id,
)
from apps.datawarehouse.services.db_metadata import get_dbmetadata_counts
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.models.datawarehouse import DbMetadata
from apps.datawarehouse.schemas.db_metadata import DbMetadataUpdateSchema
from apps.datawarehouse.schemas.language import LanguageResponseSchema
from apps.datawarehouse.services.language_service import LanguageService
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.exceptions import BadRequest
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import error_response, success_response
from apps.shared.utils.validators import normalize_language_code

logger = logging.getLogger(__name__)

_DBMETADATA_PUBNAME_MAX_LEN = 50

router = APIRouter(
    tags=["System Datawarehouses"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/dbmetadata",
)

_language_service = LanguageService()


def _resolve_dbmetadata_language_code(
    dw_id: str,
    query_language: Optional[str],
    header_language_code: str,
) -> str:
    """Resolve locale for metadata counts: `language` query param or Accept-Language / DW default."""
    if query_language is None:
        return header_language_code
    normalized = normalize_language_code(query_language)
    info = get_cached_dw_language_info(dw_id)
    if normalized not in info.codes:
        raise BadRequest(
            f"Language '{normalized}' is not registered in this data warehouse.",
            error_code="LANGUAGE_NOT_REGISTERED",
        )
    return normalized


@router.get(
    "",
    summary="Get DB metadata counts",
    description="""
    Return database metadata counts for the warehouse (ut_dbmetadata_*).
    Counts: dbmtd_areacnt (areas), dbmtd_indcnt (indicators), dbmtd_iuscnt (IUS),
    dbmtd_timecnt (time periods), dbmtd_srccnt (SR source rows, excluding publisher parent),
    dbmtd_datacnt (data rows). Also returns description and publication_date.
    Language for counts is taken from the `language` query parameter when provided,
    otherwise from Accept-Language or the DW default. Set `isLang=true` to include a
    `languages` array in the response (same shape as GET /languages).
    """,
    response_model=SuccessResponse,
    responses={
        200: {"description": "DB metadata counts retrieved successfully", "model": SuccessResponse},
        400: {"description": "Invalid language", "model": ErrorResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_dbmetadata(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    language: Optional[str] = Query(
        None,
        description="Language code for metadata counts (e.g. en, fr). Defaults to Accept-Language or DW default.",
    ),
    is_lang: bool = Query(
        False,
        alias="isLang",
        description="When true, include the warehouse languages list in the response.",
    ),
):
    effective_language_code = _resolve_dbmetadata_language_code(
        dw_id, language, language_code
    )
    data = get_dbmetadata_counts(dw_id, effective_language_code)
    if is_lang:
        ser_mode = get_serialization_mode()
        language_items = _language_service.list_languages(dw_id)
        data["languages"] = [
            LanguageResponseSchema.model_validate(item).model_dump(**ser_mode)
            for item in language_items
        ]
    return success_response(
        message="DB metadata counts retrieved successfully",
        data=data,
    )


@router.patch(
    "",
    summary="Update DB metadata description",
    description="""
    Update the database metadata description field for the specified language.
    Uses locale-specific updates - only updates the description in the requested language,
    preserving descriptions in other languages.
    Also updates publication_date (dbmtd_pubdate) and published_by (dbmtd_pubname) from the current user.
    """,
    response_model=SuccessResponse,
    responses={
        200: {"description": "DB metadata updated successfully", "model": SuccessResponse},
        400: {"description": "Invalid language or data", "model": ErrorResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_dbmetadata(
    payload: DbMetadataUpdateSchema,
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    language_code: str = Depends(get_dw_language_code),
    current_username: Optional[str] = Depends(get_current_username),
):
    """
    Update database metadata description using locale-specific updates.
    
    The request body is validated using DbMetadataUpdateSchema and should contain:
    - description: New description text for the specified language (required, 1-1000 characters)
    
    This operation also updates publication_date (dbmtd_pubdate) and published_by (dbmtd_pubname) for the current user.
    """
    payload_dict = {"description": payload.description}

    with get_warehouse_session_from_id(dw_id) as dw_db:
        # Check if metadata record exists, create if not
        DbMetadataModel = DbMetadata(language_code)
        existing = dw_db.query(DbMetadataModel).first()
        
        # Set current timestamp for publication date
        current_time = datetime.utcnow()
        
        pubname = (current_username or "service_account")[:_DBMETADATA_PUBNAME_MAX_LEN]
        if not existing:
            # Create new metadata record with default values
            new_record = DbMetadataModel(
                description=payload.description,
                publication_date=current_time,
                dbmtd_pubname=pubname,
                dbmtd_areacnt=0,
                dbmtd_indcnt=0,
                dbmtd_iuscnt=0,
                dbmtd_timecnt=0,
                dbmtd_srccnt=0,
                dbmtd_datacnt=0,
            )
            dw_db.add(new_record)
            dw_db.flush()
            pk_value = new_record.dbmtd_nid
        else:
            pk_value = existing.dbmtd_nid
            existing.publication_date = current_time
            existing.dbmtd_pubname = pubname

        # Apply locale-specific update
        apply_locale_update(
            dw_db=dw_db,
            dw_id=dw_id,
            mixin_class=DbMetadata,
            pk_field="dbmtd_nid",
            pk_value=pk_value,
            payload=payload_dict,
            language_code=language_code,
        )
        
        dw_db.commit()

    # Return updated data
    updated_data = get_dbmetadata_counts(dw_id, language_code)
    return success_response(
        message="DB metadata updated successfully",
        data=updated_data,
    )
