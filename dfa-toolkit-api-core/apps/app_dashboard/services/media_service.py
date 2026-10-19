"""Dashboard media service."""

from __future__ import annotations

import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from apps.app_dashboard.constants import (
    DASH_MEDIA_ALLOWED_EXTENSIONS,
    DASH_MEDIA_ALLOWED_TYPE_PREFIXES,
    DASH_MEDIA_COPY_SUFFIX_MAX,
    DASH_MEDIA_MAX_BYTES,
)
from apps.app_dashboard.models.dashboard import Dashboard, DashboardUpload, DashVisualization
from apps.app_dashboard.schemas.media import (
    MediaListItem,
    MediaListTypeFilter,
    MediaUploadAction,
    MediaUploadResponse,
)
from apps.app_dashboard.utils.media_paths import build_media_url, resolve_media_file_path
from apps.shared.exceptions import BadRequest, Conflict, Forbidden, NotFound


def _safe_filename(filename: str | None) -> str:
    raw = (filename or "").strip()
    if not raw:
        raise BadRequest("Media filename is required", error_code="MEDIA_FILENAME_REQUIRED")

    normalized = raw.replace("\\", "/")
    clean = normalized.rsplit("/", 1)[-1].strip()
    if not clean or clean in {".", ".."} or "\x00" in clean or clean != raw:
        raise BadRequest("Invalid media filename", error_code="INVALID_MEDIA_FILENAME")
    return clean


def _validate_media_type(filename: str, content_type: str | None) -> None:
    """Allow only image and video uploads (extension allowlist + MIME prefix)."""
    ext = Path(filename).suffix.lstrip(".").lower()
    if ext not in DASH_MEDIA_ALLOWED_EXTENSIONS:
        raise BadRequest(
            "Only image and video files are allowed",
            error_code="MEDIA_TYPE_NOT_ALLOWED",
            details={"extension": ext},
        )

    resolved = (content_type or mimetypes.guess_type(filename)[0] or "").lower()
    if resolved and not resolved.startswith(DASH_MEDIA_ALLOWED_TYPE_PREFIXES):
        raise BadRequest(
            "Only image and video files are allowed",
            error_code="MEDIA_TYPE_NOT_ALLOWED",
            details={"content_type": resolved},
        )


def _to_item(upload: DashboardUpload) -> MediaListItem:
    return MediaListItem(
        upload_id=upload.id,
        filename=upload.filename or "",
        file_type=upload.file_type,
        file_size=upload.file_size,
        dashboard_id=upload.dashboard_id,
        visualization_id=upload.visualization_id,
        media_url=build_media_url(upload.id),
        is_system=bool(upload.is_system),
        created=upload.created,
        modified=upload.modified,
    )


def _assert_dashboard_exists(db: Session, dashboard_id: int | None) -> None:
    if dashboard_id is None:
        return
    exists = db.query(Dashboard.id).filter(Dashboard.id == dashboard_id).first()
    if not exists:
        raise NotFound(
            f"Dashboard with id {dashboard_id} not found",
            error_code="DASHBOARD_NOT_FOUND",
        )


def _assert_visualization_exists(
    db: Session,
    visualization_id: int | None,
    dashboard_id: int | None,
) -> None:
    if visualization_id is None:
        return

    query = db.query(DashVisualization).filter(
        DashVisualization.id == visualization_id,
        DashVisualization.is_deleted == 0,
    )
    viz = query.first()
    if not viz:
        raise NotFound(
            f"Visualization with id {visualization_id} not found",
            error_code="VISUALIZATION_NOT_FOUND",
        )
    if dashboard_id is not None and viz.dashboard_id != dashboard_id:
        raise BadRequest(
            "Visualization does not belong to the supplied dashboard",
            error_code="VISUALIZATION_DASHBOARD_MISMATCH",
        )


def _split_filename(filename: str) -> tuple[str, str]:
    suffix = Path(filename).suffix
    stem = filename[: -len(suffix)] if suffix else filename
    return stem, suffix


def _next_copy_filename(db: Session, filename: str) -> str:
    stem, suffix = _split_filename(filename)
    for counter in range(1, DASH_MEDIA_COPY_SUFFIX_MAX + 1):
        candidate = f"{stem}-{counter}{suffix}"
        exists = db.query(DashboardUpload.id).filter(DashboardUpload.filename == candidate).first()
        if not exists:
            return candidate
    raise Conflict(
        "Unable to create a copy filename; too many duplicate media files",
        error_code="MEDIA_COPY_LIMIT_REACHED",
        details={"filename": filename, "copy_limit": DASH_MEDIA_COPY_SUFFIX_MAX},
    )


def _apply_upload_metadata(
    upload: DashboardUpload,
    *,
    filename: str,
    file_bytes: bytes,
    content_type: str | None,
    dashboard_id: int | None,
    visualization_id: int | None,
    user_id: int,
) -> None:
    now = datetime.utcnow()
    upload.filename = filename
    upload.file_path = None
    upload.file_type = content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    upload.file_size = len(file_bytes)
    upload.binary_obj = file_bytes
    upload.dashboard_id = dashboard_id
    upload.visualization_id = visualization_id
    upload.user_id = user_id
    upload.status = "COMPLETE"
    upload.modified = now
    upload.modified_user_id = user_id
    if upload.created is None:
        upload.created = now
    if upload.created_user_id is None:
        upload.created_user_id = user_id
    upload.is_system = 0


def list_media(
    db: Session,
    *,
    dashboard_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    media_type: Optional[MediaListTypeFilter] = None,
) -> tuple[list[MediaListItem], int]:
    if dashboard_id is not None:
        _assert_dashboard_exists(db, dashboard_id)

    query = db.query(DashboardUpload)
    if dashboard_id is None:
        query = query.filter(DashboardUpload.dashboard_id.is_(None))
    else:
        query = query.filter(
            or_(
                DashboardUpload.dashboard_id.is_(None),
                DashboardUpload.dashboard_id == dashboard_id,
            )
        )

    if search and search.strip():
        query = query.filter(DashboardUpload.filename.ilike(f"%{search.strip()}%"))

    if media_type == MediaListTypeFilter.image:
        query = query.filter(DashboardUpload.file_type.ilike("image/%"))
    elif media_type == MediaListTypeFilter.video:
        query = query.filter(DashboardUpload.file_type.ilike("video/%"))

    total_count = query.count()
    rows = (
        query.order_by(DashboardUpload.filename.asc(), DashboardUpload.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [_to_item(row) for row in rows], total_count


def upload_media(
    db: Session,
    *,
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
    action: MediaUploadAction | None,
    dashboard_id: int | None,
    visualization_id: int | None,
    user_id: int,
    is_super_admin: bool = False,
) -> tuple[MediaUploadResponse, bool]:
    if not is_super_admin and dashboard_id is None:
        raise Forbidden(
            "Global media uploads require superadmin access",
            error_code="GLOBAL_MEDIA_UPLOAD_FORBIDDEN",
        )
    safe_filename = _safe_filename(filename)
    _validate_media_type(safe_filename, content_type)
    if not file_bytes:
        raise BadRequest("Uploaded media file is empty", error_code="MEDIA_FILE_EMPTY")
    if len(file_bytes) > DASH_MEDIA_MAX_BYTES:
        raise BadRequest(
            "Uploaded media file exceeds the allowed size",
            error_code="MEDIA_FILE_TOO_LARGE",
            details={"max_bytes": DASH_MEDIA_MAX_BYTES},
        )

    _assert_dashboard_exists(db, dashboard_id)
    _assert_visualization_exists(db, visualization_id, dashboard_id)

    existing = db.query(DashboardUpload).filter(DashboardUpload.filename == safe_filename).first()
    if existing:
        if action == MediaUploadAction.replace:
            if dashboard_id is not None and existing.dashboard_id != dashboard_id:
                raise Forbidden(
                    "Media can only be replaced from its owning dashboard",
                    error_code="MEDIA_REPLACE_SCOPE_MISMATCH",
                    details={
                        "upload_id": existing.id,
                        "dashboard_id": dashboard_id,
                        "media_dashboard_id": existing.dashboard_id,
                    },
                )
            if existing.is_system:
                raise Forbidden(
                    "System media cannot be replaced",
                    error_code="SYSTEM_MEDIA_REPLACE_FORBIDDEN",
                )
            _apply_upload_metadata(
                existing,
                filename=safe_filename,
                file_bytes=file_bytes,
                content_type=content_type,
                dashboard_id=dashboard_id,
                visualization_id=visualization_id,
                user_id=user_id,
            )
            db.flush()
            return MediaUploadResponse(**_to_item(existing).model_dump()), False

        if action == MediaUploadAction.copy:
            safe_filename = _next_copy_filename(db, safe_filename)
        else:
            raise Conflict(
                f"Media file '{safe_filename}' already exists",
                error_code="MEDIA_FILENAME_EXISTS",
                details={"filename": safe_filename, "upload_id": existing.id},
            )

    upload = DashboardUpload()
    _apply_upload_metadata(
        upload,
        filename=safe_filename,
        file_bytes=file_bytes,
        content_type=content_type,
        dashboard_id=dashboard_id,
        visualization_id=visualization_id,
        user_id=user_id,
    )
    db.add(upload)
    db.flush()
    return MediaUploadResponse(**_to_item(upload).model_dump()), True


def get_media_content(db: Session, upload_id: int) -> tuple[bytes, str, str]:
    upload = db.query(DashboardUpload).filter(DashboardUpload.id == upload_id).first()
    if not upload:
        raise NotFound(f"Media upload with id {upload_id} not found", error_code="MEDIA_NOT_FOUND")

    media_type = upload.file_type or mimetypes.guess_type(upload.filename or "")[0] or "application/octet-stream"
    filename = upload.filename or f"media-{upload.id}"

    if upload.binary_obj is not None:
        return bytes(upload.binary_obj), media_type, filename

    if upload.file_path:
        path = resolve_media_file_path(upload.file_path)
        if not path.exists() or not path.is_file():
            raise NotFound("Media file content not found on disk", error_code="MEDIA_CONTENT_NOT_FOUND")
        return path.read_bytes(), media_type, filename

    raise NotFound("Media content not found", error_code="MEDIA_CONTENT_NOT_FOUND")


def delete_media(
    db: Session,
    upload_id: int,
    *,
    dashboard_id: int | None = None,
) -> None:
    if dashboard_id is not None:
        _assert_dashboard_exists(db, dashboard_id)

    upload = db.query(DashboardUpload).filter(DashboardUpload.id == upload_id).first()
    if not upload:
        raise NotFound(f"Media upload with id {upload_id} not found", error_code="MEDIA_NOT_FOUND")

    if dashboard_id is not None and upload.dashboard_id != dashboard_id:
        raise Forbidden(
            "Media can only be deleted from its owning dashboard",
            error_code="MEDIA_DELETE_SCOPE_MISMATCH",
            details={
                "upload_id": upload_id,
                "dashboard_id": dashboard_id,
                "media_dashboard_id": upload.dashboard_id,
            },
        )

    if upload.is_system:
        raise Forbidden(
            "System media cannot be deleted",
            error_code="SYSTEM_MEDIA_DELETE_FORBIDDEN",
        )

    if upload.file_path:
        path = resolve_media_file_path(upload.file_path)
        if path.exists() and path.is_file():
            path.unlink()

    db.delete(upload)
    db.flush()
