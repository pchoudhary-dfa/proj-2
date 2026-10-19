"""
Notification inbox schemas.
"""
from datetime import datetime
from typing import Optional

from pydantic import Field

from apps.shared.schemas.base import BaseSchema


class NotificationItemResponse(BaseSchema):
    """Single in-app notification row."""

    id: int = Field(..., description="Notification id")
    event_code: str = Field(..., description="Business event code")
    locale: str = Field(..., description="Locale used when rendering")
    title: str = Field(..., description="Rendered notification title")
    body: str = Field(..., description="Rendered notification body")
    ref_entity_type: Optional[str] = Field(None, description="Related entity type e.g. DATASET")
    ref_entity_id: Optional[int] = Field(None, description="Related entity id")
    action_url: Optional[str] = Field(None, description="Full FE navigation URL")
    dw_id: Optional[int] = Field(None, description="Data warehouse id")
    is_read: bool = Field(..., description="Whether the notification has been read")
    read_at: Optional[datetime] = Field(None, description="When marked read")
    created: datetime = Field(..., description="When the notification was created")


class NotificationUnreadCountData(BaseSchema):
    """Unread badge count payload."""

    count: int = Field(..., description="Number of unread notifications")
