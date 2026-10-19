"""
Unit API schemas for request/response validation.
"""
from typing import Optional, Any, Dict, List

from pydantic import field_validator, ConfigDict, Field

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import AliasField, create_key_validator, alias_field


class UnitCreateSchema(BaseSchema):
    """Schema for creating a new unit"""
    unit_name: str = AliasField(
        "ut_unit", "unit_name",
        description="Unit name", min_length=1, max_length=128,
        validation_alias=alias_field("ut_unit", "unit_name"),
    )
    unit_gid: Optional[str] = AliasField(
        "ut_unit", "unit_gid", None,
        description="Unit GID", max_length=60,
        validation_alias=alias_field("ut_unit", "unit_gid"),
    )
    unit_global: bool = AliasField(
        "ut_unit", "unit_global", False,
        description="Whether unit is global (null from DB treated as False)",
        validation_alias=alias_field("ut_unit", "unit_global"),
    )
    unit_format: Optional[str] = AliasField(
        "ut_unit", "unit_format", None,
        description="Display/format code for data values using this unit",
        max_length=255,
        validation_alias=alias_field("ut_unit", "unit_format"),
    )

    @field_validator("unit_global", mode="before")
    @classmethod
    def coerce_unit_global(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    model_config = ConfigDict(populate_by_name=True, by_alias=False)
    _validate_keys = create_key_validator("ut_unit")


class UnitUpdateSchema(BaseUpdateSchema):
    """Schema for updating a unit (all fields optional) - accepts both formats"""
    unit_name: Optional[str] = AliasField(
        "ut_unit", "unit_name", None,
        description="Unit name", max_length=128,
        validation_alias=alias_field("ut_unit", "unit_name"),
    )
    unit_gid: Optional[str] = AliasField(
        "ut_unit", "unit_gid", None,
        description="Unit GID", max_length=60,
        validation_alias=alias_field("ut_unit", "unit_gid"),
    )
    unit_global: Optional[bool] = AliasField(
        "ut_unit", "unit_global", None,
        description="Whether unit is global",
        validation_alias=alias_field("ut_unit", "unit_global"),
    )
    unit_format: Optional[str] = AliasField(
        "ut_unit", "unit_format", None,
        description="Display/format code for data values using this unit",
        max_length=255,
        validation_alias=alias_field("ut_unit", "unit_format"),
    )

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_unit")


class UnitMultipleDeleteSchema(BaseSchema):
    """Request body for bulk delete units. GID-only."""
    unit_gid: List[str] = Field(..., description="List of unit GIDs to delete (cascade)")


class UnitResponseSchema(BaseSchema):
    """Schema for unit response"""
    unit_nid: int = AliasField("ut_unit", "unit_nid", description="Unit ID (primary key)")
    unit_name: str = AliasField("ut_unit", "unit_name", description="Unit name", min_length=1, max_length=128)
    unit_gid: Optional[str] = AliasField("ut_unit", "unit_gid", None, description="Unit GID", max_length=60)
    unit_global: bool = AliasField("ut_unit", "unit_global", False, description="Whether unit is global (null from DB treated as False)")
    unit_format: Optional[str] = AliasField(
        "ut_unit", "unit_format", None,
        description="Display/format code for data values using this unit",
        max_length=255,
    )

    @field_validator("unit_global", mode="before")
    @classmethod
    def coerce_unit_global(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    @classmethod
    def from_record(
        cls,
        record: Any,
        locale_record: Optional[Any] = None,
        locale: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Build dict from ORM record(s) using schema field names. Optionally add unit_name from locale_record and locale."""
        data: Dict[str, Any] = {
            "unit_nid": record.unit_nid,
            "unit_gid": getattr(record, "unit_gid", None),
            "unit_global": bool(getattr(record, "unit_global", False)) if getattr(record, "unit_global", None) is not None else False,
            "unit_format": getattr(record, "unit_format", None),
        }
        if locale_record is not None:
            data["unit_name"] = getattr(locale_record, "unit_name", None) or ""
        else:
            data["unit_name"] = getattr(record, "unit_name", None) or ""
        if locale is not None:
            data["locale"] = locale
        return data

    model_config = ConfigDict(populate_by_name=True, by_alias=False)
