"""
Share link schemas: create payload and response shapes.
"""
from typing import Any, Optional

from pydantic import Field

from apps.shared.schemas.base import BaseSchema


class ShareLinkCreatePayload(BaseSchema):
    """Payload for POST /share-links — stores visualization state as a short link."""
    fetchParams: dict[str, Any] = Field(..., description="Minimal share payload (indicator, area, subgroup, timePeriod)")
    chartConfig: dict[str, Any] = Field(..., description="Visualization config (chartType, title, colors, etc.)")
    dw_id: Optional[int] = Field(None, description="Data warehouse id")


class ShareLinkResponse(BaseSchema):
    """Response for POST /share-links — the short code to use in the URL."""
    code: str = Field(..., description="Short share link code")
