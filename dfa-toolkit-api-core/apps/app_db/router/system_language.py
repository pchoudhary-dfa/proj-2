"""
Router for system language read/create/patch endpoints.
"""
import logging

from fastapi import APIRouter, Depends, Path, status

from apps.app_db.dependencies import get_current_user_id
from apps.app_db.schemas.core import (
    SystemLanguageCreateSchema,
    SystemLanguagePatchSchema,
    SystemLanguageResponseSchema,
)
from apps.app_db.services.system_language_service import SystemLanguageService
from apps.shared.exceptions import NotFound
from apps.shared.schemas.response import SuccessResponse, ErrorResponse
from apps.shared.utils.response import (
    created_response,
    no_content_response,
    success_response,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system-language", tags=["System Language"])
service = SystemLanguageService()


def _system_language_public_payload(data: dict) -> dict:
    """Hide audit fields from GET responses."""
    payload = dict(data)
    payload.pop("created_user_id", None)
    payload.pop("created", None)
    payload.pop("modified_user_id", None)
    payload.pop("modified", None)
    return payload


@router.get(
    "",
    summary="Get system languages",
    description="Returns only non-deleted system languages.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "System languages returned", "model": SuccessResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_system_languages():
    rows = service.list_non_deleted()
    data = [
        _system_language_public_payload(
            SystemLanguageResponseSchema.model_validate(row).model_dump(mode="json")
        )
        for row in rows
    ]
    return success_response(
        message=f"Retrieved {len(data)} system language(s)",
        data=data,
    )


@router.get(
    "/{id}",
    summary="Get system language by id",
    description="Get a non-deleted system language row by id.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "System language returned", "model": SuccessResponse},
        404: {"description": "System language not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_system_language_by_id(
    id: int = Path(..., description="System language id"),
):
    row = service.get_language_by_id(language_id=id)
    if not row:
        raise NotFound(f"System language identifier {id} not found", identifier=str(id))
    data = _system_language_public_payload(
        SystemLanguageResponseSchema.model_validate(row).model_dump(mode="json")
    )
    return success_response(
        message="System language retrieved successfully",
        data=data,
    )


@router.post(
    "",
    summary="Create system language",
    description="Create a new system language row.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "System language created", "model": SuccessResponse},
        409: {"description": "System language already exists", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_system_language(
    payload: SystemLanguageCreateSchema,
    current_user_id: int = Depends(get_current_user_id),
):
    row = service.create_language(
        payload=payload,
        created_user_id=current_user_id,
    )
    data = SystemLanguageResponseSchema.model_validate(row).model_dump(mode="json")
    return created_response(
        message="System language created successfully",
        data=data,
    )


@router.patch(
    "/{id}",
    summary="Patch system language",
    description="Partially update a system language row by id.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "System language updated", "model": SuccessResponse},
        404: {"description": "System language not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def patch_system_language(
    id: int = Path(..., description="System language id"),
    payload: SystemLanguagePatchSchema = ...,
    current_user_id: int = Depends(get_current_user_id),
):
    row = service.patch_language(
        language_id=id,
        payload=payload,
        modified_user_id=current_user_id,
    )
    if not row:
        raise NotFound(f"System language identifier {id} not found", identifier=str(id))
    data = SystemLanguageResponseSchema.model_validate(row).model_dump(mode="json")
    return success_response(
        message="System language updated successfully",
        data=data,
    )


@router.delete(
    "/{id}",
    summary="Delete system language",
    description="Hard-delete a system language row by id and clear translation i18n rows for that locale.",
    response_model=SuccessResponse,
    responses={
        204: {"description": "System language deleted"},
        404: {"description": "System language not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_system_language(
    id: int = Path(..., description="System language id"),
    current_user_id: int = Depends(get_current_user_id),
):
    deleted = service.delete_language(
        language_id=id,
        modified_user_id=current_user_id,
    )
    if not deleted:
        raise NotFound(f"System language identifier {id} not found", identifier=str(id))
    return no_content_response()
