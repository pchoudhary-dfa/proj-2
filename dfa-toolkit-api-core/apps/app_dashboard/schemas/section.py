"""
Pydantic schemas for Dashboard Section CRUD endpoints.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class SectionResponse(BaseModel):
    """Single section row returned by section list/detail endpoints."""

    id: int
    section_name: Optional[Any] = Field(
        None,
        description="Section display name; parsed i18n object when stored as JSON",
    )
    hide_global_filter: bool = False
    order: Optional[int] = None
    reload_section: bool = False
    resolution: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SectionCreateRequest(BaseModel):
    """Payload for POST /dash/{dashboard_id}/sections."""

    section_name: Optional[dict[str, str]] = Field(
        None,
        description="Locale-keyed section name; expanded across all warehouse languages",
    )
    order: Optional[int] = Field(
        None,
        ge=1,
        description="Display order; defaults to max existing order + 1",
    )


class SectionPatchRequest(BaseModel):
    """Payload for PATCH /dash/{dashboard_id}/sections/{section_id}. All fields optional."""

    section_name: Optional[dict[str, str]] = Field(
        None,
        description="Locale-keyed section name; expanded across all warehouse languages",
    )
    order: Optional[int] = Field(None, ge=1, description="Display order within the dashboard")
    hide_global_filter: Optional[bool] = Field(
        None,
        description="Hide global area filter in this section",
    )
    reload_section: Optional[bool] = Field(
        None,
        description="Auto-reload this section on interval",
    )
    resolution: Optional[str] = Field(
        None,
        max_length=50,
        description="Override screen resolution for this section",
    )


class SectionBulkItem(BaseModel):
    """One section entry in PUT /dash/{dashboard_id}/sections/bulk."""

    id: int = Field(..., description="Section primary key")
    section_name: dict[str, str] = Field(
        ...,
        description="Locale-keyed section name; expanded across all warehouse languages",
    )
    order: Optional[int] = Field(None, ge=1, description="Display order within the dashboard")
    hide_global_filter: Optional[bool] = Field(
        None,
        description="Hide global area filter in this section",
    )
    reload_section: Optional[bool] = Field(
        None,
        description="Auto-reload this section on interval",
    )
    resolution: Optional[str] = Field(
        None,
        max_length=50,
        description="Override screen resolution for this section",
    )


class SectionBulkUpdateRequest(BaseModel):
    """Payload for PUT /dash/{dashboard_id}/sections/bulk."""

    sections: list[SectionBulkItem] = Field(
        ...,
        min_length=1,
        description="Sections to update in batch (legacy section management modal)",
    )
