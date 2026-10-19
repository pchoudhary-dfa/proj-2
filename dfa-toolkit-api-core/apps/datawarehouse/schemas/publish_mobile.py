"""Pydantic schemas for mobile app publish endpoints."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class DatabaseContentSelection(BaseModel):
    """Which JSON file types to include in the package."""
    source_data: bool = False
    area_data: bool = False
    indicator_data: bool = False
    indicator_classification_data: bool = False
    data_folders: bool = False
    exclude_no_data: bool = False


class CreateMobilePackageRequest(BaseModel):
    database_content: DatabaseContentSelection
    indicator_classifications: List[str] = []
    exclude_time_periods: List[str] = []
    languages: List[str]
    comments: str = ""
    map_level_id: str = ""

    @field_validator("languages")
    @classmethod
    def at_least_one_language(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("At least one language must be selected")
        return v


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class MobilePackageDetailSchema(BaseModel):
    """Nested detail block for a package history entry."""
    data_files: str
    languages: str
    ic_types: Optional[str] = None
    exclude_no_data: bool
    exclude_time_periods: Optional[str] = None

    model_config = {"from_attributes": True}


class MobilePackageSchema(BaseModel):
    """One entry in the package history list."""
    id: int
    update_version: int
    package_status: str
    comments: Optional[str] = None
    map_level_id: Optional[str] = None
    is_deleted: bool
    created_on: datetime = Field(alias="created")
    published_on: Optional[datetime] = Field(default=None, alias="published")
    deleted_on: Optional[datetime] = Field(default=None, alias="deleted")
    detail: Optional[MobilePackageDetailSchema] = None

    model_config = {"from_attributes": True, "populate_by_name": True}


class MobilePackageStatusSchema(BaseModel):
    """Build status poll response."""
    id: int
    package_status: str

    model_config = {"from_attributes": True}


class MobileUpdateResponseData(BaseModel):
    """Data payload returned to mobile clients."""
    latest_version: Optional[int] = None
    url: Optional[str] = None
    map_url: Optional[str] = None
