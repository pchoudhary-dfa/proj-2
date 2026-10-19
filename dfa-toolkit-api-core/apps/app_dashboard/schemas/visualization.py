"""
Pydantic schemas for Visualization CRUD endpoints.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field


class VisualizationCreateRequest(BaseModel):
    """Payload for POST /dash/{dashboard_id}/vis."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Visualization display name",
    )
    type: str = Field(
        ...,
        description="Visualization type (bar, line, pie, html, text, etc.)",
    )
    chart_variant: Optional[str] = Field(
        None,
        max_length=100,
        description="Chart variant (vertical, stacked, donut, etc.)",
    )
    properties: Optional[Dict[str, Any]] = Field(
        None,
        description="JSON: chart configuration (general, series, categories, theme, advance, custom*)",
    )
    data_cube_info: Optional[Dict[str, Any]] = Field(
        None,
        description="JSON: data dimensions (indicators, subgroups, areas, timePeriods, mapping)",
    )


class VisualizationPatchRequest(BaseModel):
    """Payload for PATCH /dash/{dashboard_id}/vis/{viz_id}. All fields optional."""

    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Visualization display name",
    )
    type: Optional[str] = Field(
        None,
        description="Visualization type",
    )
    chart_variant: Optional[str] = Field(
        None,
        max_length=100,
        description="Chart variant",
    )
    properties: Optional[Dict[str, Any]] = Field(
        None,
        description="JSON: chart configuration (full replacement)",
    )
    data_cube_info: Optional[Dict[str, Any]] = Field(
        None,
        description="JSON: data dimensions (full replacement)",
    )
    is_used_in_layout: Optional[bool] = Field(
        None,
        description="Whether visualization is placed on the dashboard canvas",
    )


class VisualizationListItem(BaseModel):
    """Single row in the GET /dash/{dashboard_id}/vis list response."""

    id: int
    name: str
    type: Optional[str] = None
    chart_variant: Optional[str] = None
    category: Optional[str] = None
    is_used_in_layout: bool = False
    properties: Optional[Dict[str, Any]] = None
    data_cube_info: Optional[Dict[str, Any]] = None
    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class VisualizationDetail(VisualizationListItem):
    """Full visualization detail returned by GET /dash/{dashboard_id}/vis/{viz_id}."""

    properties: Optional[Dict[str, Any]] = None
    data_cube_info: Optional[Dict[str, Any]] = None
    created_user_id: Optional[int] = None
    modified_user_id: Optional[int] = None


class ViewerVisualization(VisualizationListItem):
    """Full visualization config for publish viewer bundle (no audit user ids)."""

    system_dw_id: Optional[int] = Field(
        None,
        description="Linked data warehouse id (legacy dbid)",
    )
    database_type: Optional[str] = Field(
        None,
        description="Warehouse db_source_type from connection details (legacy dbtype)",
    )
    explore_enabled: bool = True
    explore_da_enabled: bool = True
    explore_qa_enabled: bool = True
    explore_md_enabled: bool = True
    properties: Optional[Dict[str, Any]] = None
    data_cube_info: Optional[Dict[str, Any]] = None


class VisualizationCopyRequest(BaseModel):
    """Payload for POST /dash/{dashboard_id}/vis/{viz_id}/copy (legacy service 222)."""

    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Name for the copy; defaults to '{original} - Copy'",
    )
    target_dashboard_ids: Optional[list[int]] = Field(
        None,
        description=(
            "Edit-mode dashboard ids to copy into. "
            "Defaults to the source dashboard_id when omitted or empty."
        ),
    )


class VisualizationCopyItem(BaseModel):
    """One created visualization from a copy operation."""

    dashboard_id: int
    id: int
    name: str
    system_dw_id: Optional[int] = None
    is_used_in_layout: bool = False


class VisualizationCopyResponse(BaseModel):
    """Result of copying a visualization into one or more dashboards."""

    source_viz_id: int
    copies: list[VisualizationCopyItem]
