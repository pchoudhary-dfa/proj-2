"""
Area and Area Level API schemas for request/response validation.
API: ar_nid, ar_parent_nid, ar_id, ar_name, ar_gid, ar_level, ar_short_name, block_nids, ar_map, ar_is_global, ar_has_data
"""
from typing import Optional, List, Dict, Any, Union
from pydantic import Field, field_validator, model_validator, ConfigDict

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import (
    AliasField,
    create_key_validator,
    create_key_validator_multi,
    alias_field,
    get_external_to_internal_mapping,
)


def _normalize_area_keys(data: Any, entity_type: str = "AREA") -> Any:
    """Normalize external keys (e.g. ar_*) to internal (e.g. area_*) from db_tbl_cols_mapping.json."""
    if not isinstance(data, dict):
        return data
    ext_to_int = dict(get_external_to_internal_mapping(entity_type))
    ext_to_int.update(get_external_to_internal_mapping("ut_area_latlong"))
    if not ext_to_int:
        return data
    out = dict(data)
    for ext_key, int_key in ext_to_int.items():
        if ext_key in out and int_key not in out:
            out[int_key] = out[ext_key]
    return out


class AreaResponseSchema(BaseSchema):
    """Schema for an Area in detail response - aliases loaded from JSON"""
    area_nid: int = AliasField("ut_area", "area_nid", description="Internal primary identifier (area_nid)")
    area_parent_nid: Optional[int] = AliasField("ut_area", "area_parent_nid", None, description="Parent area nid (root uses -1 or 0)")
    area_id: Optional[str] = AliasField("ut_area", "area_id", None, description="External Area ID (unique)")
    area_name: Optional[str] = AliasField("ut_area", "area_name", None, description="Area name (max 60)")
    area_gid: Optional[str] = AliasField("ut_area", "area_gid", None, description="Area global identifier (alphanumeric + special chars: $ @ _ - { })")
    area_level: Optional[int] = AliasField("ut_area", "area_level", None, description="Hierarchy level (derived from parent)")
    area_short_name: Optional[str] = AliasField("ut_area", "area_short_name", None, description="Short name")
    block_nids: Optional[str] = AliasField("ut_area", "block_nids", None, description="Comma-separated ar_nids for group areas")
    area_map: Optional[str] = AliasField("ut_area", "area_map", None, description="Map reference")
    area_is_global: Optional[bool] = AliasField("ut_area", "area_is_global", None, description="Global availability flag")
    area_has_data: Optional[bool] = AliasField("ut_area", "area_has_data", None, description="Flag indicating if data exists")
    area_lat: Optional[float] = AliasField(
        "ut_area_latlong",
        "area_lat",
        None,
        description="Latitude from ut_area_latlong.area_lat",
    )
    area_long: Optional[float] = AliasField(
        "ut_area_latlong",
        "area_long",
        None,
        description="Longitude from ut_area_latlong.area_long",
    )
    id: Optional[int] = AliasField(
        "ut_area_latlong",
        "id",
        None,
        description="ut_area_latlong primary key",
    )
    ancestors: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Parent chain from immediate parent up to root",
    )
    selectable: Optional[bool] = Field(
        None,
        description="Present only when dashboard_id is supplied: false when the user has area ACL and this area is not in their allowlist.",
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_area_keys(cls, data: Any) -> Any:
        data = _normalize_area_keys(data)
        if isinstance(data, dict) and "ancestors" in data and isinstance(data["ancestors"], list):
            data = {**data, "ancestors": [_normalize_area_keys(a) for a in data["ancestors"]]}
        return data

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from ORM record using schema field names. Maps model attrs (areashortname, area_block, area_global, data_exist) to schema keys."""
        return {
            "area_nid": record.area_nid,
            "area_parent_nid": getattr(record, "area_parent_nid", None),
            "area_id": getattr(record, "area_id", None),
            "area_name": getattr(record, "area_name", None),
            "area_gid": getattr(record, "area_gid", None),
            "area_level": getattr(record, "area_level", None),
            "area_short_name": getattr(record, "areashortname", None),
            "block_nids": getattr(record, "area_block", None),
            "area_map": getattr(record, "area_map", None),
            "area_is_global": bool(getattr(record, "area_global", False)) if getattr(record, "area_global", None) is not None else False,
            "area_has_data": bool(getattr(record, "data_exist", False)) if getattr(record, "data_exist", None) is not None else False,
        }


class AreaParentResponseSchema(BaseSchema):
    """Schema for GET area parent: parent record or root marker."""
    area_nid: Optional[int] = AliasField("ut_area", "area_nid", None, description="Parent area nid (null if root)")
    area_gid: Optional[str] = AliasField("ut_area", "area_gid", None, description="Parent area gid (null if root)")
    area_name: Optional[str] = AliasField("ut_area", "area_name", None, description="Parent area name (null if root)")
    is_root: bool = AliasField("ut_area", "is_root", False, description="True if this area has no parent (root)")

    @model_validator(mode="before")
    @classmethod
    def normalize_area_keys(cls, data: Any) -> Any:
        return _normalize_area_keys(data)

    @field_validator("is_root", mode="before")
    @classmethod
    def coerce_is_root(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    @classmethod
    def from_record(cls, record: Any, is_root: bool = False) -> Dict[str, Any]:
        """Build dict from ORM record for parent response. Keys from schema."""
        if record is None or is_root:
            return {"area_nid": None, "area_gid": None, "area_name": None, "is_root": True}
        return {
            "area_nid": record.area_nid,
            "area_gid": getattr(record, "area_gid", None),
            "area_name": getattr(record, "area_name", None),
            "is_root": False,
        }


class AreaLevelResponseSchema(BaseSchema):
    """Schema for an Area Level in list or detail - aliases loaded from JSON"""
    level_nid: int = AliasField("ut_area_level", "level_nid", description="Internal primary identifier (level_nid)")
    area_level: int = AliasField("ut_area_level", "area_level", description="Area level number (area_level)")
    area_level_name: Optional[str] = AliasField("ut_area_level", "area_level_name", None, description="Area level name (area_level_name)")

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from ORM record using schema field names."""
        return {
            "level_nid": record.level_nid,
            "area_level": record.area_level,
            "area_level_name": getattr(record, "area_level_name", None),
        }


class AreaLevelCreateSchema(BaseSchema):
    """Schema for creating a new area level - accepts internal and alias keys"""
    area_level: int = AliasField(
        "ut_area_level", "area_level",
        description="Area level number (required, unique)",
        validation_alias=alias_field("ut_area_level", "area_level"),
    )
    area_level_name: str = AliasField(
        "ut_area_level", "area_level_name",
        description="Area level name (required, unique)",
        min_length=1, max_length=255,
        validation_alias=alias_field("ut_area_level", "area_level_name"),
    )

    model_config = ConfigDict(populate_by_name=True, by_alias=False)
    _validate_keys = create_key_validator("ut_area_level")


class AreaLevelUpdateSchema(BaseUpdateSchema):
    """Schema for updating an area level (all fields optional) - accepts internal and alias keys"""
    area_level: Optional[int] = AliasField(
        "ut_area_level", "area_level", None,
        description="Area level number (must remain unique)",
        validation_alias=alias_field("ut_area_level", "area_level"),
    )
    area_level_name: Optional[str] = AliasField(
        "ut_area_level", "area_level_name", None,
        description="Area level name (must remain unique)",
        min_length=1, max_length=255,
        validation_alias=alias_field("ut_area_level", "area_level_name"),
    )

    model_config = ConfigDict(populate_by_name=True, by_alias=False)
    _validate_keys = create_key_validator("ut_area_level")


class AreaLevelAssociationCountRequestSchema(BaseSchema):
    """Request body for association count (delete confirmation)."""
    identifier: List[int] = Field(..., description="List of area level identifiers (level_nid)")


class AreaLevelMultipleDeleteSchema(BaseSchema):
    """Request body for bulk delete area levels."""
    level_nid: List[int] = Field(..., description="List of area level nids to delete (cascade to areas)")


class AreaAssociationCountRequestSchema(BaseSchema):
    """Request body for area association count (delete confirmation). GID-only."""
    ar_gid: List[str] = Field(..., description="List of area GIDs (ar_gid)")


class AreaMultipleDeleteSchema(BaseSchema):
    """Request body for bulk delete areas. GID-only."""
    ar_gid: List[str] = Field(..., description="List of area GIDs to delete (cascade)")


class AreaCreateSchema(BaseSchema):
    """Schema for creating a new area - accepts both formats"""
    area_name: str = AliasField(
        "ut_area", "area_name",
        description="Area name (required)", min_length=1, max_length=60,
        validation_alias=alias_field("ut_area", "area_name"),
    )
    area_id: str = AliasField(
        "ut_area", "area_id",
        description="External Area ID (required, must be unique)", min_length=1, max_length=255,
        validation_alias=alias_field("ut_area", "area_id"),
    )
    area_parent_nid: Optional[int] = AliasField(
        "ut_area", "area_parent_nid", -1,
        description="Parent area nid (defaults to -1 for root)",
        validation_alias=alias_field("ut_area", "area_parent_nid"),
    )
    area_short_name: Optional[str] = AliasField(
        "ut_area", "area_short_name", None,
        description="Short name", max_length=255,
        validation_alias=alias_field("ut_area", "area_short_name"),
    )
    block_nids: Optional[str] = AliasField(
        "ut_area", "block_nids", None,
        description="Comma-separated ar_nids for group areas",
        validation_alias=alias_field("ut_area", "block_nids"),
    )
    area_gid: Optional[str] = AliasField(
        "ut_area", "area_gid", None,
        description="Area global identifier (alphanumeric + special chars: $ @ _ - { }, auto-generated UUID if not provided)", max_length=60,
        validation_alias=alias_field("ut_area", "area_gid"),
    )
    area_is_global: bool = AliasField(
        "ut_area", "area_is_global", False,
        description="Global availability flag",
        validation_alias=alias_field("ut_area", "area_is_global"),
    )
    area_lat: Optional[float] = AliasField("ut_area_latlong", "area_lat", None, description="Latitude coordinate", validation_alias=alias_field("ut_area_latlong", "area_lat"))
    area_long: Optional[float] = AliasField("ut_area_latlong", "area_long", None, description="Longitude coordinate", validation_alias=alias_field("ut_area_latlong", "area_long"))
    id: Optional[str] = AliasField("ut_area_latlong", "id", None, description="Lat/Long identifier", validation_alias=alias_field("ut_area_latlong", "id"))

    @model_validator(mode="after")
    def validate_lat_long_together(self):
        lat_provided = self.area_lat is not None
        long_provided = self.area_long is not None
        if lat_provided != long_provided:
            raise ValueError("area_lat and area_long must both be provided together or both omitted.")
        return self

    model_config = ConfigDict(populate_by_name=True, by_alias=False)
    _validate_keys = create_key_validator_multi(["ut_area", "ut_area_latlong"])


class AreaUpdateSchema(BaseUpdateSchema):
    """Schema for updating an area (all fields optional) - accepts both formats"""
    area_name: Optional[str] = AliasField(
        "ut_area", "area_name", None,
        description="Area name", min_length=1, max_length=60,
        validation_alias=alias_field("ut_area", "area_name"),
    )
    area_id: Optional[str] = AliasField(
        "ut_area", "area_id", None,
        description="External Area ID (must remain unique)", min_length=1, max_length=255,
        validation_alias=alias_field("ut_area", "area_id"),
    )
    area_parent_nid: Optional[int] = AliasField(
        "ut_area", "area_parent_nid", None,
        description="Parent area nid (affects derived level)",
        validation_alias=alias_field("ut_area", "area_parent_nid"),
    )
    area_short_name: Optional[str] = AliasField(
        "ut_area", "area_short_name", None,
        description="Short name", max_length=255,
        validation_alias=alias_field("ut_area", "area_short_name"),
    )
    block_nids: Optional[str] = AliasField(
        "ut_area", "block_nids", None,
        description="Comma-separated ar_nids for group areas",
        validation_alias=alias_field("ut_area", "block_nids"),
    )
    area_is_global: Optional[bool] = AliasField(
        "ut_area", "area_is_global", None,
        description="Global availability flag",
        validation_alias=alias_field("ut_area", "area_is_global"),
    )
    area_lat: Optional[float] = AliasField("ut_area_latlong", "area_lat", None, description="Latitude coordinate", validation_alias=alias_field("ut_area_latlong", "area_lat"))
    area_long: Optional[float] = AliasField("ut_area_latlong", "area_long", None, description="Longitude coordinate", validation_alias=alias_field("ut_area_latlong", "area_long"))
    id: Optional[str] = AliasField("ut_area_latlong", "id", None, description="Lat/Long identifier", validation_alias=alias_field("ut_area_latlong", "id"))

    model_config = ConfigDict(populate_by_name=True, by_alias=False)
    _validate_keys = create_key_validator_multi(["ut_area", "ut_area_latlong"])
