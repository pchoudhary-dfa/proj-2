"""
Search API Schemas

Response serialization for the search endpoint.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# Valid keyword types (used by router for Query validation)
KeywordTypeEnum = Literal["INDICATOR", "AREA", "SUBGROUP", "TIME_PERIOD"]


class SearchResultItem(BaseModel):
    """A single search result item. keywordId is the entity id (e.g. indicator_nid, area_nid) for linking to the entity API."""
    keywordId: int  # Entity id
    keywordType: str
    displayText: str


class SearchResponseMeta(BaseModel):
    """Meta payload for successful search response (SuccessResponse.meta)."""

    count: int = Field(..., description="Number of results returned in this response")
    limit: int = Field(
        ...,
        description="Applied maximum result count from the limit query parameter",
    )


class SearchResponseData(BaseModel):
    """Data payload for successful search response."""
    results: list[SearchResultItem]
