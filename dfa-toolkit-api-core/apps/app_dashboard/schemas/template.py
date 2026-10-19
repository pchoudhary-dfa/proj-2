"""
Pydantic schemas for Dashboard Template endpoints (legacy services 111/112).
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class TemplateResponse(BaseModel):
    """Dashboard gridster layout row for GET /dash/{dashboard_id}/template."""

    id: int
    dashboard_id: Optional[int] = None
    gridster: Optional[Any] = Field(
        None,
        description="Widget layout per section (section_id -> widget list)",
    )
    global_filter_gridster: Optional[Any] = Field(
        None,
        description="Global area filter widget layout",
    )
    counter: int = 0
    is_system: Optional[str] = None
    is_default: Optional[str] = None
    thumbnail: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TemplateUpdateRequest(BaseModel):
    """Payload for PUT /dash/{dashboard_id}/template (legacy setTemplateGridster)."""

    gridster: Any = Field(
        ...,
        description="Full replacement widget layout JSON (section-keyed dict or list)",
    )
    global_filter_gridster: Optional[Any] = Field(
        None,
        description="Optional full replacement global filter layout JSON",
    )
