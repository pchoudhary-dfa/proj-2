"""Pydantic schemas for dashboard media APIs."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class MediaUploadAction(str, Enum):
    copy = "copy"
    replace = "replace"


class MediaListTypeFilter(str, Enum):
    image = "image"
    video = "video"


class MediaListItem(BaseModel):
    upload_id: int = Field(..., description="dash_uploads primary key")
    filename: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    dashboard_id: Optional[int] = None
    visualization_id: Optional[int] = None
    media_url: str
    is_system: bool = False
    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MediaUploadResponse(MediaListItem):
    pass
