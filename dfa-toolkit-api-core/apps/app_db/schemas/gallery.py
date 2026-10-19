"""
Gallery API schemas aligned with frontend GalleryItem.
Request/response shapes for List, Create, Update.
"""
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class GalleryIndicatorSchema(BaseModel):
    """Indicator reference used in data request (indicator + filters)."""
    id: Optional[str] = None
    name: str = ""
    code: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class GalleryFiltersSchema(BaseModel):
    """Filters for data request: area, time, subgroup."""
    area: Optional[list[str]] = None
    timeStart: Optional[str] = None
    timeEnd: Optional[str] = None
    subgroup: Optional[list[str]] = None

    model_config = ConfigDict(extra="allow")

    @field_validator("timeStart", "timeEnd", mode="before")
    @classmethod
    def coerce_time_to_str(cls, v: Any) -> Optional[str]:
        """Accept int or str from frontend (e.g. timeStart: 2020) and coerce to str."""
        if v is None:
            return None
        return str(v)


class GalleryItemAddPayload(BaseModel):
    """
    Payload for POST /gallery (create item).
    Maps to system_gallery; indicator + filters stored in payload for re-fetch.
    """
    type: str = Field("visualization", description="Item category: visualization | table")
    indicator: GalleryIndicatorSchema = Field(default_factory=GalleryIndicatorSchema)
    filters: Optional[GalleryFiltersSchema] = Field(default_factory=GalleryFiltersSchema)
    vizSettings: Optional[dict[str, Any]] = None
    selectedComponents: Optional[dict[str, Any]] = None
    # Exact JSON used to render table (list of rows) or chart (object or list); stored in datacube when isDynamic is false.
    previewData: Optional[Any] = None
    isDynamic: bool = True
    dw_id: Optional[int] = Field(None, description="Data warehouse id for re-fetching data")

    model_config = ConfigDict(extra="allow")


class GalleryItemUpdatePayload(BaseModel):
    """
    Payload for PATCH /gallery/{id} (partial update).
    Supports full visualization state updates (indicator, filters, vizSettings,
    selectedComponents, previewData) as well as metadata edits (name/desc/tags).
    """
    indicator: Optional[GalleryIndicatorSchema] = None
    filters: Optional[GalleryFiltersSchema] = None
    isDynamic: Optional[bool] = None
    previewData: Optional[Any] = None
    item_name: Optional[str] = None
    item_desc: Optional[str] = None
    item_tags: Optional[str] = None
    vizSettings: Optional[dict[str, Any]] = None
    selectedComponents: Optional[dict[str, Any]] = None
    dw_id: Optional[int] = None

    model_config = ConfigDict(extra="allow")


class GalleryItemResponse(BaseModel):
    """
    Single gallery item for list and detail responses.
    Matches frontend GalleryItem shape.
    """
    id: str = Field(..., description="Gallery item id (string)")
    type: str = Field(..., description="Item category: visualization | table")
    indicator: dict[str, Any] = Field(default_factory=dict)
    filters: dict[str, Any] = Field(default_factory=dict)
    timestamp: Optional[str] = None
    vizSettings: Optional[dict[str, Any]] = None
    selectedComponents: Optional[dict[str, Any]] = None
    previewData: Optional[Any] = None
    isDynamic: bool = True
    dw_id: Optional[int] = Field(None, description="Data warehouse id")

    model_config = ConfigDict(extra="allow")
