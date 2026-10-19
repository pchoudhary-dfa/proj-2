"""Global and dashboard-scoped media routes."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Path, Query, Response, UploadFile
from sqlalchemy.orm import Session

from apps.app_dashboard.schemas.media import MediaListTypeFilter, MediaUploadAction
from apps.app_dashboard.services.media_service import (
    delete_media,
    get_media_content,
    list_media,
    upload_media,
)
from apps.app_db.dependencies import get_current_user_id, get_is_super_admin
from apps.shared.config.dependencies import get_db
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.pagination_meta import build_list_pagination_meta
from apps.shared.utils.response import created_response, no_content_response, success_response

router = APIRouter(prefix="/dash", tags=["Dashboard - Media"])


@router.get(
    "/media",
    response_model=SuccessResponse,
    summary="List dashboard media files",
    description=(
        "List global media files. When dashboard_id is supplied, returns a unified "
        "list of global media plus files scoped to that dashboard. "
        "Optional search filters by filename (case-insensitive substring). "
        "Optional type filters by MIME prefix on file_type (image or video)."
    ),
    responses={
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def list_media_endpoint(
    dashboard_id: Optional[int] = Query(None, description="Optional dashboard scope"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(
        None,
        description="Case-insensitive partial match on filename",
    ),
    type: Optional[MediaListTypeFilter] = Query(
        None,
        description="Filter by media kind: image (file_type image/*) or video (file_type video/*)",
    ),
    db: Session = Depends(get_db),
):
    items, total_count = list_media(
        db,
        dashboard_id=dashboard_id,
        page=page,
        page_size=page_size,
        search=search,
        media_type=type,
    )
    total_pages = (total_count + page_size - 1) // page_size if total_count else 0
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(items),
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
    return success_response(
        message="Media files retrieved successfully",
        data=[item.model_dump(mode="json", exclude_none=True) for item in items],
        meta=meta,
    )


@router.post(
    "/media",
    response_model=SuccessResponse,
    summary="Upload global media file",
    description=(
        "Upload a global media file as multipart/form-data. This endpoint is reserved "
        "for superadmins. Duplicate filenames are checked "
        "globally; use action=copy to create a suffixed filename or action=replace "
        "to overwrite the existing non-system upload row."
    ),
    responses={
        201: {"description": "Media file uploaded successfully"},
        400: {"description": "Invalid upload"},
        403: {"description": "System media cannot be replaced"},
        409: {"description": "Filename already exists"},
    },
)
async def upload_media_endpoint(
    file: UploadFile = File(..., description="Media file to upload"),
    action: Optional[MediaUploadAction] = Form(
        None,
        description="Duplicate handling action: copy or replace",
    ),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    is_super_admin: bool = Depends(get_is_super_admin),
):
    file_bytes = await file.read()
    item, created = upload_media(
        db,
        file_bytes=file_bytes,
        filename=file.filename or "",
        content_type=file.content_type,
        action=action,
        dashboard_id=None,
        visualization_id=None,
        user_id=user_id,
        is_super_admin=is_super_admin,
    )
    data = item.model_dump(mode="json", exclude_none=True)
    if created:
        return created_response(message="Media file uploaded successfully", data=data)
    return success_response(message="Media file replaced successfully", data=data)


@router.delete(
    "/media/{upload_id}",
    status_code=204,
    summary="Delete media file as superadmin",
    responses={
        403: {"description": "System media cannot be deleted", "model": ErrorResponse},
        404: {"description": "Media file not found", "model": ErrorResponse},
    },
)
def delete_media_endpoint(
    upload_id: int = Path(..., description="dash_uploads primary key"),
    db: Session = Depends(get_db),
):
    delete_media(db, upload_id)
    return no_content_response()


@router.get(
    "/media/{upload_id}/content",
    summary="Serve dashboard media binary content",
    responses={
        404: {"description": "Media content not found", "model": ErrorResponse},
    },
)
def get_media_content_endpoint(
    upload_id: int = Path(..., description="dash_uploads primary key"),
    db: Session = Depends(get_db),
):
    content, media_type, filename = get_media_content(db, upload_id)
    safe_filename = filename.replace('"', "")
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{safe_filename}"',
            "Cache-Control": "public, max-age=86400",
        },
    )


@router.post(
    "/{dashboard_id}/media",
    response_model=SuccessResponse,
    summary="Upload dashboard-scoped media file",
    description=(
        "Upload a media file scoped to the dashboard in the path. "
        "Only dashboard ADMIN and EDITOR roles are granted this endpoint."
    ),
    responses={
        201: {"description": "Dashboard media file uploaded successfully"},
        400: {"description": "Invalid upload"},
        403: {"description": "Media scope mismatch or insufficient permission"},
        404: {"description": "Dashboard not found"},
        409: {"description": "Filename already exists"},
    },
)
async def upload_scoped_media_endpoint(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    file: UploadFile = File(..., description="Media file to upload"),
    action: Optional[MediaUploadAction] = Form(
        None,
        description="Duplicate handling action: copy or replace",
    ),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    file_bytes = await file.read()
    item, created = upload_media(
        db,
        file_bytes=file_bytes,
        filename=file.filename or "",
        content_type=file.content_type,
        action=action,
        dashboard_id=dashboard_id,
        visualization_id=None,
        user_id=user_id,
    )
    data = item.model_dump(mode="json", exclude_none=True)
    if created:
        return created_response(
            message="Dashboard media file uploaded successfully",
            data=data,
        )
    return success_response(
        message="Dashboard media file replaced successfully",
        data=data,
    )


@router.delete(
    "/{dashboard_id}/media/{upload_id}",
    status_code=204,
    summary="Delete dashboard-scoped media file",
    responses={
        403: {"description": "Media does not belong to this dashboard", "model": ErrorResponse},
        404: {"description": "Dashboard or media file not found", "model": ErrorResponse},
    },
)
def delete_scoped_media_endpoint(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    upload_id: int = Path(..., description="dash_uploads primary key"),
    db: Session = Depends(get_db),
):
    delete_media(db, upload_id, dashboard_id=dashboard_id)
    return no_content_response()
