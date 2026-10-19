"""
Gallery API: system-wide gallery items (charts and tables).
Authentication is enforced by AccessControlMiddleware (AUTHENTICATED access level).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, status

from apps.app_db.dependencies import get_current_user_id, get_app_key
from apps.app_db.schemas.gallery import GalleryItemAddPayload, GalleryItemUpdatePayload, GalleryItemResponse
from apps.app_db.services.gallery_service import GalleryService
from apps.shared.exceptions import NotFound
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.shared.utils.response import (
    success_response,
    created_response,
    created_response_data,
    no_content_response,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/gallery", tags=["Gallery"])
service = GalleryService()


@router.get(
    "",
    summary="List gallery items",
    description="List gallery items with optional search and type filter.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "List of gallery items", "model": SuccessResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def list_gallery(
    q: Optional[str] = Query(None, description="Search keywords"),
    type_filter: Optional[str] = Query(None, alias="type", description="Filter by item type (e.g. visualization, table)"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=100, description="Number of records per page"),
    user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    items, total = service.list_gallery(
        user_id=user_id,
        app_key=app_key,
        q=q,
        type_filter=type_filter,
        page=page,
        page_size=page_size,
    )
    meta = ListPaginationMetaSchema(
        total_count=total,
        count=len(items),
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if page_size else 0,
    ).model_dump()
    return success_response(
        message="Gallery items retrieved successfully",
        data=items,
        meta=meta,
    )


@router.get(
    "/{id}",
    summary="Get gallery item by id",
    description="Get a single gallery item by id.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Gallery item", "model": SuccessResponse},
        404: {"description": "Gallery item not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_gallery(
    id: int = Path(..., description="Gallery item id"),
    user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    item = service.get_by_id(gallery_id=id, user_id=user_id, app_key=app_key)
    if not item:
        raise NotFound(f"Gallery item identifier {id} not found", identifier=str(id))
    return success_response(message="Gallery item retrieved successfully", data=item)


@router.post(
    "",
    summary="Create gallery item",
    description="Create a new gallery item (chart or table).",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Gallery item created", "model": SuccessResponse},
        400: {"description": "Bad request", "model": ErrorResponse},
        403: {"description": "No role assignment for this application", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def add_gallery(
    payload: GalleryItemAddPayload,
    user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    item = service.add_gallery(user_id=user_id, app_key=app_key, payload=payload, dw_id=getattr(payload, "dw_id", None))
    item_dict = item.model_dump() if hasattr(item, "model_dump") else item
    data_out = created_response_data(item_dict, "id", gid_key=None)
    return created_response(message="Gallery item created successfully", data=data_out)


@router.patch(
    "/{id}",
    summary="Update gallery item",
    description="Partial update (e.g. toggle Snapshot with isDynamic and previewData).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Gallery item updated", "model": SuccessResponse},
        404: {"description": "Gallery item not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def update_gallery(
    id: int = Path(..., description="Gallery item id"),
    payload: GalleryItemUpdatePayload = ...,
    user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    item = service.update_gallery(gallery_id=id, user_id=user_id, app_key=app_key, payload=payload)
    if not item:
        raise NotFound(f"Gallery item identifier {id} not found", identifier=str(id))
    payload_keys = set(payload.model_dump(exclude_unset=True).keys())
    full_response = item.model_dump()
    response_data = {k: full_response[k] for k in payload_keys if k in full_response}
    return success_response(message="Gallery item updated successfully", data=response_data)


@router.delete(
    "/{id}",
    summary="Delete gallery item",
    description="Delete a gallery item by id.",
    responses={
        204: {"description": "Gallery item deleted"},
        404: {"description": "Gallery item not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_gallery(
    id: int = Path(..., description="Gallery item id"),
    user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    deleted = service.delete_gallery(gallery_id=id, user_id=user_id, app_key=app_key)
    if not deleted:
        raise NotFound(f"Gallery item identifier {id} not found", identifier=str(id))
    return no_content_response()
