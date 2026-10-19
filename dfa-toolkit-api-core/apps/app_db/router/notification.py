"""
In-app notification inbox API.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from apps.app_db.dependencies import get_current_user_id
from apps.app_db.schemas.notification import NotificationItemResponse
from apps.app_db.services.notification_service import notification_service
from apps.shared.config.dependencies import get_db
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import success_response

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _serialize_notification(row) -> dict:
    return NotificationItemResponse(
        id=int(row.id),
        event_code=str(row.event_code),
        locale=str(row.locale),
        title=str(row.title),
        body=str(row.body),
        ref_entity_type=row.ref_entity_type,
        ref_entity_id=int(row.ref_entity_id) if row.ref_entity_id is not None else None,
        action_url=row.action_url,
        dw_id=int(row.dw_id) if row.dw_id is not None else None,
        is_read=bool(row.is_read),
        read_at=row.read_at,
        created=row.created,
    ).model_dump()


@router.get(
    "/unread-count",
    summary="Get unread notification count",
    description=(
        "Return the number of unread in-app notifications for the current user. "
        "Optionally scope by data warehouse id."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Unread count retrieved", "model": SuccessResponse},
        401: {"description": "Unauthorized", "model": ErrorResponse},
    },
)
async def get_unread_count(
    dw_id: Optional[int] = Query(None, description="Filter by data warehouse id"),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    count = notification_service.unread_count(db, user_id=user_id, dw_id=dw_id)
    return success_response(
        message="Unread notification count retrieved successfully",
        data={"count": count},
    )


@router.get(
    "",
    summary="List notifications",
    description=(
        "Return up to 20 notifications (unread first, then newest). "
        "Only unread notifications in that returned page are marked read."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Notifications retrieved", "model": SuccessResponse},
        401: {"description": "Unauthorized", "model": ErrorResponse},
    },
)
async def list_notifications(
    dw_id: Optional[int] = Query(None, description="Filter by data warehouse id"),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    rows = notification_service.fetch_and_mark_read(
        db,
        user_id=user_id,
        dw_id=dw_id,
    )
    items = [_serialize_notification(row) for row in rows]
    return success_response(
        message="Notifications retrieved successfully",
        data=items,
    )
