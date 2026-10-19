"""
Pydantic schemas for Header/Footer theme library endpoints.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ThemeResponse(BaseModel):
    """Single header/footer theme row."""

    id: int
    theme_name: Optional[str] = None
    web_header_html: Optional[str] = None
    web_footer_html: Optional[str] = None
    mobile_header_html: Optional[str] = None
    mobile_footer_html: Optional[str] = None
    settings: Optional[Any] = Field(
        None,
        description="Parsed theme styling metadata JSON",
    )
    user_id: int
    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ThemeCreateRequest(BaseModel):
    """Payload for POST /dash/themes."""

    theme_name: str = Field(..., min_length=1, max_length=255, description="Theme display name")
    web_header_html: Optional[str] = Field(None, description="Desktop header HTML")
    web_footer_html: Optional[str] = Field(None, description="Desktop footer HTML")
    mobile_header_html: Optional[str] = Field(None, description="Mobile header HTML")
    mobile_footer_html: Optional[str] = Field(None, description="Mobile footer HTML")
    settings: Optional[Any] = Field(
        None,
        description="Theme styling metadata (object or JSON string)",
    )


class ThemePatchRequest(BaseModel):
    """Payload for PATCH /dash/themes/{theme_id}. All fields optional."""

    theme_name: Optional[str] = Field(None, min_length=1, max_length=255)
    web_header_html: Optional[str] = None
    web_footer_html: Optional[str] = None
    mobile_header_html: Optional[str] = None
    mobile_footer_html: Optional[str] = None
    settings: Optional[Any] = Field(
        None,
        description="Theme styling metadata (object or JSON string)",
    )
