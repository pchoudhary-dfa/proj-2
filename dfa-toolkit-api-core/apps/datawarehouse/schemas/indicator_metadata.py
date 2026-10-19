"""
Indicator Metadata API schemas for request/response validation.
"""
from typing import Optional, List, Any, Dict

from pydantic import Field, field_validator, model_validator, ConfigDict

from apps.shared.schemas.base import BaseSchema
from apps.datawarehouse.utils.alias_loader import AliasField, create_key_validator, create_key_validator_multi, alias_field


class MetadataCategoryResponseSchema(BaseSchema):
    """Schema for metadata category in metadata response"""
    categorynid: int = AliasField("ut_metadata_category", "categorynid", description="Category NID")
    categoryname: Optional[str] = AliasField("ut_metadata_category", "categoryname", None, description="Category name")
    categorygid: Optional[str] = AliasField("ut_metadata_category", "categorygid", None, description="Category GID")
    categoryorder: Optional[int] = AliasField("ut_metadata_category", "categoryorder", None, description="Category order")
    description: Optional[str] = Field(None, description="Metadata description text")

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class IndicatorInfoMetaSchema(BaseSchema):
    """Schema for indicator info when returned in the 'meta' field (include_indicator=true)."""
    indicator_name: Optional[str] = AliasField("ut_indicator", "indicator_name", None, description="Indicator name")
    indicator_gid: Optional[str] = AliasField("ut_indicator", "indicator_gid", None, description="Indicator GID")
    short_name: Optional[str] = AliasField("ut_indicator", "short_name", None, description="Short name")
    keywords: Optional[str] = AliasField("ut_indicator", "keywords", None, description="Keywords")
    indicator_order: Optional[float] = AliasField("ut_indicator", "indicator_order", None, description="Indicator order")
    highisgood: bool = AliasField("ut_indicator", "highisgood", False, description="Whether higher values are better")

    @field_validator("highisgood", mode="before")
    @classmethod
    def coerce_bool_none_to_false(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class IndicatorInfoSchema(BaseSchema):
    """Schema for indicator basic information (used in meta field when need_indicator_info=true)"""
    indicator_name: Optional[str] = AliasField("ut_indicator", "indicator_name", None, description="Indicator name")
    indicator_gid: Optional[str] = AliasField("ut_indicator", "indicator_gid", None, description="Indicator GID")
    short_name: Optional[str] = AliasField("ut_indicator", "short_name", None, description="Short name")
    keywords: Optional[str] = AliasField("ut_indicator", "keywords", None, description="Keywords")
    indicator_order: Optional[float] = AliasField("ut_indicator", "indicator_order", None, description="Indicator order")
    highisgood: bool = AliasField("ut_indicator", "highisgood", False, description="Whether higher values are better")

    @field_validator("highisgood", mode="before")
    @classmethod
    def coerce_bool_none_to_false(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from indicator ORM record using schema field names."""
        return {
            "indicator_name": getattr(record, "indicator_name", None),
            "indicator_gid": getattr(record, "indicator_gid", None),
            "short_name": getattr(record, "short_name", None) or "",
            "keywords": getattr(record, "keywords", None) or "",
            "indicator_order": getattr(record, "indicator_order", None),
            "highisgood": bool(getattr(record, "highisgood", False)) if getattr(record, "highisgood", None) is not None else False,
        }

    model_config = ConfigDict(populate_by_name=True, by_alias=False)

class IndicatorMetadataUpdateItemSchema(BaseSchema):
    """Schema for individual metadata update item. Uses METADATA_CATEGORY / METADATA_REPORT aliases."""
    mt_catg_gid: str = Field(..., description="Metadata category GID (resolved server-side)")
    metadata_text: Optional[str] = AliasField(
        "ut_metadatareport", "metadata_text", None,
        description="Metadata text. If empty/null, deletes the metadata record.",
        validation_alias=alias_field("ut_metadatareport", "metadata_text"),
    )
    _validate_keys = create_key_validator("ut_metadatareport")


    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class IndicatorMetadataUpdateRequestSchema(BaseSchema):
    """PATCH body for /indicators/{id}/metadata — JSON object with update_items array."""

    update_items: List[IndicatorMetadataUpdateItemSchema] = Field(
        ...,
        description="Per category: mt_catg_gid and metadata_text (empty deletes report for that category)",
    )

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


# Backward-compat alias (was incorrectly used as FastAPI Body type)
IndicatorMetadataUpdateSchema = List[IndicatorMetadataUpdateItemSchema]
