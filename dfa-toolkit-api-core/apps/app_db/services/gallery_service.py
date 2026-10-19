"""
Gallery service: CRUD for system_gallery and search index (system_gallery_keyword).
Gallery items are scoped to users via iam_user_role_content (resource_code = "viz_gallery").
Uses app_db SessionLocal; services own session lifecycle.
"""
import json
import logging
import re
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select, func, delete
from sqlalchemy.orm import Session

from apps.app_db.db.core import SessionLocal
from apps.app_db.models.core import SystemGallery, SystemGalleryKeyword, IamUserRole, IamUserRoleContent
from apps.app_db.schemas.gallery import GalleryItemAddPayload, GalleryItemUpdatePayload, GalleryItemResponse

logger = logging.getLogger(__name__)

_GALLERY_RESOURCE_CODE = "viz_gallery"


def _keywords_from_text(*parts: Optional[str]) -> list[str]:
    """Extract keywords from name, description, tags: split on non-alnum, lower, dedupe."""
    seen: set[str] = set()
    keywords: list[str] = []
    for part in parts:
        if not part or not isinstance(part, str):
            continue
        for word in re.split(r"[\s,]+", part.strip()):
            w = word.lower().strip()
            if w and len(w) <= 255 and w not in seen:
                seen.add(w)
                keywords.append(w)
    return keywords


def _row_to_response(row: SystemGallery) -> GalleryItemResponse:
    """Map SystemGallery ORM row to GalleryItemResponse (frontend shape)."""
    payload_obj: dict[str, Any] = {}
    if row.payload:
        try:
            payload_obj = json.loads(row.payload)
        except (json.JSONDecodeError, TypeError):
            pass
    indicator = payload_obj.get("indicator") or {}
    filters = payload_obj.get("filters") or {}

    properties_obj: dict[str, Any] = {}
    if row.properties:
        try:
            properties_obj = json.loads(row.properties)
        except (json.JSONDecodeError, TypeError):
            pass
    viz_settings = properties_obj.get("vizSettings") if "vizSettings" in properties_obj else properties_obj
    selected_components = properties_obj.get("selectedComponents")

    preview_data: Optional[Any] = None
    if not row.is_dynamic and row.datacube:
        try:
            preview_data = json.loads(row.datacube)
        except (json.JSONDecodeError, TypeError):
            pass

    timestamp_str: Optional[str] = None
    if row.created:
        timestamp_str = row.created.isoformat() if hasattr(row.created, "isoformat") else str(row.created)

    return GalleryItemResponse(
        id=str(row.id),
        type=row.item_cat or "visualization",
        indicator=indicator,
        filters=filters,
        timestamp=timestamp_str,
        vizSettings=viz_settings,
        selectedComponents=selected_components,
        previewData=preview_data,
        isDynamic=bool(row.is_dynamic),
        dw_id=row.dw_id,
    )


def _refresh_search_index(
    db: Session,
    gallery_id: int,
    item_name: Optional[str],
    item_desc: Optional[str],
    item_tags: Optional[str],
) -> None:
    """Delete existing search rows for gallery_id and insert new keywords from name, desc, tags."""
    db.execute(
        delete(SystemGalleryKeyword).where(
            SystemGalleryKeyword.gallery_id == gallery_id
        )
    )
    keywords = _keywords_from_text(item_name, item_desc, item_tags)
    for kw in keywords:
        db.add(SystemGalleryKeyword(gallery_id=gallery_id, keyword=kw))


class GalleryService:
    """Service for gallery CRUD with IAM content-level access control via iam_user_role_content."""

    # ── IAM helpers ─────────────────────────────────────────────────

    @staticmethod
    def _accessible_gallery_sq(user_id: int, app_key: str):
        """Subquery returning system_gallery IDs the user may access."""
        return (
            select(IamUserRoleContent.content_id)
            .join(IamUserRole, IamUserRole.id == IamUserRoleContent.user_role_id)
            .where(
                IamUserRole.user_id == user_id,
                IamUserRole.app_key == app_key,
                IamUserRoleContent.resource_code == _GALLERY_RESOURCE_CODE,
            )
            .correlate(None)
        )

    @staticmethod
    def _has_access(db: Session, user_id: int, app_key: str, gallery_id: int) -> bool:
        """Return True if user owns a content row for this gallery item."""
        row = db.scalar(
            select(IamUserRoleContent.id)
            .join(IamUserRole, IamUserRole.id == IamUserRoleContent.user_role_id)
            .where(
                IamUserRole.user_id == user_id,
                IamUserRole.app_key == app_key,
                IamUserRoleContent.resource_code == _GALLERY_RESOURCE_CODE,
                IamUserRoleContent.content_id == gallery_id,
            )
            .limit(1)
        )
        return row is not None

    @staticmethod
    def _resolve_user_role_id(db: Session, user_id: int, app_key: str) -> int:
        """Pick a user_role_id to attach content to. Raises ValueError when none found."""
        role_id = db.scalar(
            select(IamUserRole.id)
            .where(IamUserRole.user_id == user_id, IamUserRole.app_key == app_key)
            .order_by(IamUserRole.id)
            .limit(1)
        )
        if role_id is None:
            raise ValueError("No role assignment found for this application")
        return role_id

    # ── CRUD ────────────────────────────────────────────────────────

    def list_gallery(
        self,
        user_id: int,
        app_key: str,
        q: Optional[str] = None,
        type_filter: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[GalleryItemResponse], int]:
        """
        List gallery items the user can access, with optional search and type filter.
        Returns (items, total_count).
        """
        db: Session = SessionLocal()
        try:
            accessible_sq = self._accessible_gallery_sq(user_id, app_key)
            base = select(SystemGallery).where(SystemGallery.id.in_(accessible_sq))
            if type_filter:
                base = base.where(SystemGallery.item_cat == type_filter)
            if q and q.strip():
                pattern = f"%{q.strip()}%"
                sub = (
                    select(SystemGalleryKeyword.gallery_id).where(
                        SystemGalleryKeyword.keyword.like(pattern)
                    )
                )
                base = base.where(SystemGallery.id.in_(sub))
            count_query = select(func.count()).select_from(base.subquery())
            total = db.scalar(count_query) or 0
            base = base.order_by(SystemGallery.modified.desc(), SystemGallery.id.desc())
            base = base.offset((page - 1) * page_size).limit(page_size)
            rows = list(db.scalars(base).all())
            return [_row_to_response(r) for r in rows], total
        finally:
            db.close()

    def get_by_id(self, gallery_id: int, user_id: int, app_key: str) -> Optional[GalleryItemResponse]:
        """Get one gallery item by id if the user has access."""
        db: Session = SessionLocal()
        try:
            if not self._has_access(db, user_id, app_key, gallery_id):
                return None
            row = db.scalar(select(SystemGallery).where(SystemGallery.id == gallery_id))
            return _row_to_response(row) if row else None
        finally:
            db.close()

    def add_gallery(
        self,
        user_id: int,
        app_key: str,
        payload: GalleryItemAddPayload,
        dw_id: Optional[int] = None,
    ) -> GalleryItemResponse:
        """Create a gallery item, link it to the user via iam_user_role_content, and populate search index."""
        db: Session = SessionLocal()
        try:
            user_role_id = self._resolve_user_role_id(db, user_id, app_key)
            now = datetime.utcnow()
            ind = payload.indicator
            indicator_dict = ind.model_dump() if hasattr(ind, "model_dump") else (ind if isinstance(ind, dict) else {})
            fil = payload.filters
            filters_dict = fil.model_dump() if fil and hasattr(fil, "model_dump") else (fil if isinstance(fil, dict) else {})
            payload_json = {"indicator": indicator_dict, "filters": filters_dict}
            props: dict[str, Any] = {}
            if payload.vizSettings is not None:
                props["vizSettings"] = payload.vizSettings
            if payload.selectedComponents is not None:
                props["selectedComponents"] = payload.selectedComponents
            item_name = (payload.indicator.name if payload.indicator else "") or ""
            datacube_str: Optional[str] = None
            if not payload.isDynamic and payload.previewData is not None:
                datacube_str = json.dumps(payload.previewData)
            chart_type = None
            chart_sub_type = None
            if payload.vizSettings:
                chart_type = payload.vizSettings.get("chartType")
                chart_sub_type = payload.vizSettings.get("chartVariant")

            effective_dw_id = getattr(payload, "dw_id", None) if hasattr(payload, "dw_id") else dw_id
            row = SystemGallery(
                item_cat=payload.type or "visualization",
                item_name=item_name,
                item_desc=None,
                item_tags=None,
                is_dynamic=payload.isDynamic,
                chart_type=chart_type,
                chart_sub_type=chart_sub_type,
                dw_id=effective_dw_id,
                properties=json.dumps(props) if props else None,
                payload=json.dumps(payload_json),
                datacube=datacube_str,
                created=now,
                modified=now,
            )
            db.add(row)
            db.flush()

            db.add(IamUserRoleContent(
                user_role_id=user_role_id,
                resource_code=_GALLERY_RESOURCE_CODE,
                content_id=row.id,
                created=now,
                created_user_id=user_id,
            ))
            _refresh_search_index(db, row.id, row.item_name, row.item_desc, row.item_tags)
            db.commit()
            db.refresh(row)
            return _row_to_response(row)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def update_gallery(
        self, gallery_id: int, user_id: int, app_key: str, payload: GalleryItemUpdatePayload
    ) -> Optional[GalleryItemResponse]:
        """Partial update; only allowed if the user has access."""
        db: Session = SessionLocal()
        try:
            if not self._has_access(db, user_id, app_key, gallery_id):
                return None
            row = db.scalar(
                select(SystemGallery).where(SystemGallery.id == gallery_id)
            )
            if not row:
                return None
            now = datetime.utcnow()

            if payload.indicator is not None or payload.filters is not None:
                payload_obj: dict[str, Any] = {}
                if row.payload:
                    try:
                        payload_obj = json.loads(row.payload)
                    except (json.JSONDecodeError, TypeError):
                        pass
                if payload.indicator is not None:
                    ind = payload.indicator
                    payload_obj["indicator"] = ind.model_dump() if hasattr(ind, "model_dump") else ind
                    row.item_name = payload.indicator.name or row.item_name
                if payload.filters is not None:
                    fil = payload.filters
                    payload_obj["filters"] = fil.model_dump() if hasattr(fil, "model_dump") else fil
                row.payload = json.dumps(payload_obj)

            if payload.isDynamic is not None:
                row.is_dynamic = payload.isDynamic
            if payload.previewData is not None:
                row.datacube = json.dumps(payload.previewData)
            if payload.item_name is not None:
                row.item_name = payload.item_name
            if payload.item_desc is not None:
                row.item_desc = payload.item_desc
            if payload.item_tags is not None:
                row.item_tags = payload.item_tags
            if payload.dw_id is not None:
                row.dw_id = payload.dw_id
            if payload.vizSettings is not None or payload.selectedComponents is not None:
                props: dict[str, Any] = {}
                if row.properties:
                    try:
                        props = json.loads(row.properties)
                    except (json.JSONDecodeError, TypeError):
                        pass
                if payload.vizSettings is not None:
                    props["vizSettings"] = payload.vizSettings
                if payload.selectedComponents is not None:
                    props["selectedComponents"] = payload.selectedComponents
                row.properties = json.dumps(props) if props else None
            if payload.vizSettings and "chartType" in payload.vizSettings:
                row.chart_type = payload.vizSettings.get("chartType")
            if payload.vizSettings and "chartVariant" in payload.vizSettings:
                row.chart_sub_type = payload.vizSettings.get("chartVariant")
            row.modified = now
            if any(
                getattr(payload, f) is not None for f in ("item_name", "item_desc", "item_tags")
            ):
                _refresh_search_index(db, row.id, row.item_name, row.item_desc, row.item_tags)
            db.commit()
            db.refresh(row)
            return _row_to_response(row)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def delete_gallery(self, gallery_id: int, user_id: int, app_key: str) -> bool:
        """Delete gallery item, its search rows, and the iam_user_role_content link."""
        db: Session = SessionLocal()
        try:
            if not self._has_access(db, user_id, app_key, gallery_id):
                return False
            user_role_ids_sq = (
                select(IamUserRole.id)
                .where(IamUserRole.user_id == user_id, IamUserRole.app_key == app_key)
            )
            db.execute(
                delete(IamUserRoleContent).where(
                    IamUserRoleContent.user_role_id.in_(user_role_ids_sq),
                    IamUserRoleContent.resource_code == _GALLERY_RESOURCE_CODE,
                    IamUserRoleContent.content_id == gallery_id,
                )
            )
            db.execute(
                delete(SystemGalleryKeyword).where(SystemGalleryKeyword.gallery_id == gallery_id)
            )
            row = db.scalar(select(SystemGallery).where(SystemGallery.id == gallery_id))
            if row:
                db.delete(row)
            db.commit()
            return True
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
