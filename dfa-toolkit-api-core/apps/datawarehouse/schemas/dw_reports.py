"""
Pydantic schemas for DW reports catalogue and responses.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from pydantic import BaseModel, Field


@dataclass(frozen=True)
class ReportListParams:
    """Shared pagination, search, sort, and export query parameters for report detail routes."""

    page: int
    page_size: int
    export: bool
    search: Optional[str]
    search_by: Optional[str]
    sort_field: Optional[str]
    sort_order: str

ReportCategory = Literal["quality", "analytics", "data"]
ReportAccessLevel = Literal["PUBLIC", "APP_CLIENT", "AUTHENTICATED", "PERMISSION"]


class ReportCatalogItem(BaseModel):
    slug: str = Field(..., description="Report slug used in the detail URL path")
    title: str = Field(..., description="Human-readable report title")
    category: ReportCategory = Field(..., description="Report category")
    description: str = Field(..., description="What the report surfaces or answers")
    access_level: ReportAccessLevel = Field(
        ...,
        description="Required access level: PUBLIC, APP_CLIENT, AUTHENTICATED, or PERMISSION",
    )


class PublishedDataRow(BaseModel):
    """Enriched ut_data row returned by data/published (raw mode)."""

    dt_nid: Optional[int] = None
    dt_value: Optional[float] = None
    dt_text_value: Optional[str] = None
    dt_is_mrd: Optional[bool] = None
    dt_is_planned_value: Optional[bool] = None
    dt_is_textual: Optional[bool] = None
    i_nid: Optional[int] = None
    i_gid: Optional[str] = None
    i_name: Optional[str] = None
    u_nid: Optional[int] = None
    u_gid: Optional[str] = None
    u_name: Optional[str] = None
    sg_nid: Optional[int] = None
    sg_gid: Optional[str] = None
    sg_name: Optional[str] = None
    ar_nid: Optional[int] = None
    ar_id: Optional[str] = None
    ar_gid: Optional[str] = None
    ar_name: Optional[str] = None
    ar_level: Optional[int] = None
    tp_nid: Optional[int] = None
    tp_timeperiod: Optional[str] = None
    src_nid: Optional[int] = None
    src_gid: Optional[str] = None
    src_name: Optional[str] = None


class PublishedDataAggregateRow(BaseModel):
    """Aggregated row returned by data/published when aggregate_by is set."""

    i_nid: Optional[int] = None
    i_gid: Optional[str] = None
    i_name: Optional[str] = None
    u_nid: Optional[int] = None
    u_gid: Optional[str] = None
    u_name: Optional[str] = None
    sg_nid: Optional[int] = None
    sg_gid: Optional[str] = None
    sg_name: Optional[str] = None
    ar_nid: Optional[int] = None
    ar_id: Optional[str] = None
    ar_gid: Optional[str] = None
    ar_name: Optional[str] = None
    ar_level: Optional[int] = None
    tp_nid: Optional[int] = None
    tp_timeperiod: Optional[str] = None
    src_nid: Optional[int] = None
    src_gid: Optional[str] = None
    src_name: Optional[str] = None
    dt_is_mrd: Optional[bool] = None
    dt_is_planned_value: Optional[bool] = None
    dt_value_count: Optional[int] = None
    dt_value_sum: Optional[float] = None
    dt_value_avg: Optional[float] = None
    dt_value_min: Optional[float] = None
    dt_value_max: Optional[float] = None
