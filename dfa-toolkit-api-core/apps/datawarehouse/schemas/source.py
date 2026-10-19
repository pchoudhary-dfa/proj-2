"""
Source API schemas. Sources are IC rows with ic_type='SR' and ic_parent_nid != -1.
Uses ut_sources mapping from db_tbl_cols_mapping.json for response aliases (src_gid, src_name, etc.).
"""
from typing import Optional, Any, Dict, List

from pydantic import BaseModel, Field, ConfigDict

from apps.datawarehouse.utils.alias_loader import AliasField, alias_field, create_key_validator


# Entity type for alias lookup (key in db_tbl_cols_mapping.json)
SOURCE_ENTITY = "ut_sources"


class SourceCreateSchema(BaseModel):
    """Schema for creating a Source. Required: src_title. Optional: src_publisher, year, short_name, src_gid."""
    publisher: Optional[str] = AliasField(
        SOURCE_ENTITY, "publisher", None,
        description="Publisher name; defaults to GLOBAL if omitted", max_length=100,
        validation_alias=alias_field(SOURCE_ENTITY, "publisher"),
    )
    title: str = AliasField(
        SOURCE_ENTITY, "title", ...,
        description="Source title (required)", min_length=1,
        validation_alias=alias_field(SOURCE_ENTITY, "title"),
    )
    year: Optional[str] = Field(None, max_length=10, description="Year (diyear)")
    short_name: Optional[str] = Field(None, max_length=255, description="Short name; must be unique across all SR rows")
    ic_gid: Optional[str] = AliasField(
        SOURCE_ENTITY, "ic_gid", None,
        description="Global identifier; auto-generated if omitted", max_length=60,
        validation_alias=alias_field(SOURCE_ENTITY, "ic_gid"),
    )

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator(SOURCE_ENTITY)


class SourceUpdateSchema(BaseModel):
    """Schema for PATCH update of a Source. All fields optional. Same fields as create: src_publisher, src_title, year, short_name, src_gid."""
    publisher: Optional[str] = AliasField(
        SOURCE_ENTITY, "publisher", None, max_length=100,
        validation_alias=alias_field(SOURCE_ENTITY, "publisher"),
    )
    title: Optional[str] = AliasField(
        SOURCE_ENTITY, "title", None, min_length=1, max_length=255,
        validation_alias=alias_field(SOURCE_ENTITY, "title"),
    )
    year: Optional[str] = Field(None, max_length=10)
    short_name: Optional[str] = Field(None, max_length=255)
    ic_gid: Optional[str] = AliasField(
        SOURCE_ENTITY, "ic_gid", None, max_length=60,
        validation_alias=alias_field(SOURCE_ENTITY, "ic_gid"),
    )

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator(SOURCE_ENTITY)


class SourceListResponseSchema(BaseModel):
    """Source list item – only essential fields for list view (identifiers + display name components)."""
    ic_nid: int = AliasField(SOURCE_ENTITY, "ic_nid", description="Source NID (primary key)")
    ic_gid: Optional[str] = AliasField(SOURCE_ENTITY, "ic_gid", None, description="Global identifier", max_length=60)
    ic_name: Optional[str] = AliasField(SOURCE_ENTITY, "ic_name", None, description="Composite name (publisher_title_year)")
    ic_short_name: Optional[str] = AliasField(SOURCE_ENTITY, "ic_short_name", None, description="Short name", max_length=255)
    publisher: Optional[str] = AliasField(SOURCE_ENTITY, "publisher", None, description="Publisher name", max_length=255)
    title: Optional[str] = AliasField(SOURCE_ENTITY, "title", None, description="Source title", max_length=255)
    diyear: Optional[str] = AliasField(SOURCE_ENTITY, "diyear", None, description="Year", max_length=10)

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class SourceResponseSchema(BaseModel):
    """Source response (IC row with ic_type=SR, ic_parent_nid != -1). Uses ut_sources mapping: serializes as src_nid, src_gid, src_name, etc. when by_alias=True. ic_type is excluded from response."""
    ic_nid: int = AliasField(SOURCE_ENTITY, "ic_nid", description="Source NID (primary key)")
    ic_parent_nid: int = AliasField(SOURCE_ENTITY, "ic_parent_nid", 0, description="Publisher parent IC NID")
    ic_gid: Optional[str] = AliasField(SOURCE_ENTITY, "ic_gid", None, description="Global identifier", max_length=60)
    ic_name: Optional[str] = AliasField(SOURCE_ENTITY, "ic_name", None, description="Composite name (publisher_title_year)")
    ic_short_name: Optional[str] = AliasField(SOURCE_ENTITY, "ic_short_name", None, description="Short name", max_length=255)
    ic_order: Optional[int] = AliasField(SOURCE_ENTITY, "ic_order", None, description="Display order")
    ic_global: bool = Field(False, description="Global availability flag")
    publisher: Optional[str] = AliasField(SOURCE_ENTITY, "publisher", None, description="Publisher name", max_length=255)
    title: Optional[str] = AliasField(SOURCE_ENTITY, "title", None, description="Source title", max_length=255)
    diyear: Optional[str] = AliasField(SOURCE_ENTITY, "diyear", None, description="Year", max_length=10)
    sourcelink1: Optional[str] = Field(None, description="Source link 1")
    sourcelink2: Optional[str] = Field(None, description="Source link 2")
    isbn: Optional[str] = Field(None, description="ISBN")
    nature: Optional[str] = Field(None, description="Nature")
    locale: Optional[str] = Field(None, description="Response locale")

    model_config = ConfigDict(populate_by_name=True, by_alias=False)

    @classmethod
    def from_record(cls, record: Any, locale: Optional[str] = None) -> Dict[str, Any]:
        """Build dict from ORM record (internal keys for schema validation)."""
        data = {
            "ic_nid": getattr(record, "ic_nid", None),
            "ic_parent_nid": getattr(record, "ic_parent_nid", None),
            "ic_gid": getattr(record, "ic_gid", None),
            "ic_name": getattr(record, "ic_name", None),
            "ic_short_name": getattr(record, "ic_short_name", None),
            "ic_order": getattr(record, "ic_order", None),
            "ic_global": bool(getattr(record, "ic_global", False)),
            "publisher": getattr(record, "publisher", None),
            "title": getattr(record, "title", None),
            "diyear": getattr(record, "diyear", None),
            "sourcelink1": getattr(record, "sourcelink1", None),
            "sourcelink2": getattr(record, "sourcelink2", None),
            "isbn": getattr(record, "isbn", None),
            "nature": getattr(record, "nature", None),
        }
        if locale is not None:
            data["locale"] = locale
        return data


class SourceMultipleDeleteSchema(BaseModel):
    """Request body for bulk delete sources. GID-only."""
    src_gid: List[str] = Field(
        ...,
        description="List of source GIDs (ic_gid) to delete (cascade)",
    )

    model_config = ConfigDict(populate_by_name=True)


class SourceBreakupSchema(BaseModel):
    """Breakup response: distinct publishers, titles, years for dropdowns."""
    publishers: List[str] = Field(default_factory=list)
    titles: List[str] = Field(default_factory=list)
    years: List[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)
