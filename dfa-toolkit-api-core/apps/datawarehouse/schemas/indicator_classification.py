"""
Indicator Classification API schemas for request/response validation.
"""
from typing import Optional, Any, Dict, List

from pydantic import field_validator, model_validator, ConfigDict, Field

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.constants import IC_TYPE_ALLOWED_FOR_IC_API
from apps.datawarehouse.utils.alias_loader import AliasField, create_key_validator, alias_field


class IndicatorClassificationCreateSchema(BaseSchema):
    """Schema for creating a new indicator classification."""
    ic_name: str = AliasField(
        "ut_indicator_classifications", "ic_name",
        description="Indicator classification name", min_length=1,
        validation_alias=alias_field("ut_indicator_classifications", "ic_name"),
    )
    ic_gid: str = AliasField(
        "ut_indicator_classifications", "ic_gid",
        description="Global identifier (unique). Auto-generated if not provided.", max_length=60,
        validation_alias=alias_field("ut_indicator_classifications", "ic_gid"),
    )
    ic_parent_nid: int = AliasField(
        "ut_indicator_classifications", "ic_parent_nid", 0,
        description="Parent IC NID (0 for root)",
        validation_alias=alias_field("ut_indicator_classifications", "ic_parent_nid"),
    )
    ic_type: str = AliasField(
        "ut_indicator_classifications", "ic_type",
        description="Classification type (SC, GL, CF, TH, IT, CN). SR is not allowed in this API.", max_length=2,
        validation_alias=alias_field("ut_indicator_classifications", "ic_type"),
    )
    ic_short_name: Optional[str] = AliasField(
        "ut_indicator_classifications", "ic_short_name", None,
        description="Short name", max_length=50,
        validation_alias=alias_field("ut_indicator_classifications", "ic_short_name"),
    )
    ic_info: Optional[str] = AliasField(
        "ut_indicator_classifications", "ic_info", None,
        description="Description/info",
        validation_alias=alias_field("ut_indicator_classifications", "ic_info"),
    )
    ic_global: bool = AliasField(
        "ut_indicator_classifications", "ic_global", False,
        description="Global availability flag",
        validation_alias=alias_field("ut_indicator_classifications", "ic_global"),
    )
    publisher: Optional[str] = AliasField(
        "ut_indicator_classifications", "publisher", None,
        description="Source metadata", max_length=100,
        validation_alias=alias_field("ut_indicator_classifications", "publisher"),
    )
    title: Optional[str] = AliasField(
        "ut_indicator_classifications", "title", None,
        description="Source metadata",
        validation_alias=alias_field("ut_indicator_classifications", "title"),
    )
    diyear: Optional[str] = AliasField(
        "ut_indicator_classifications", "diyear", None,
        description="Source year", max_length=10,
        validation_alias=alias_field("ut_indicator_classifications", "diyear"),
    )
    sourcelink1: Optional[str] = AliasField(
        "ut_indicator_classifications", "sourcelink1", None,
        description="Source link 1", max_length=255,
        validation_alias=alias_field("ut_indicator_classifications", "sourcelink1"),
    )
    sourcelink2: Optional[str] = AliasField(
        "ut_indicator_classifications", "sourcelink2", None,
        description="Source link 2", max_length=255,
        validation_alias=alias_field("ut_indicator_classifications", "sourcelink2"),
    )
    ic_order: Optional[int] = AliasField(
        "ut_indicator_classifications", "ic_order", None,
        description="Display order",
        validation_alias=alias_field("ut_indicator_classifications", "ic_order"),
    )
    isbn: Optional[str] = AliasField(
        "ut_indicator_classifications", "isbn", None,
        description="ISBN", max_length=255,
        validation_alias=alias_field("ut_indicator_classifications", "isbn"),
    )
    nature: Optional[str] = AliasField(
        "ut_indicator_classifications", "nature", None,
        description="Nature", max_length=255,
        validation_alias=alias_field("ut_indicator_classifications", "nature"),
    )

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_indicator_classifications")

    @field_validator("ic_type")
    @classmethod
    def ic_type_allowed(cls, v: Any) -> str:
        if v is None or (isinstance(v, str) and not v.strip()):
            return v
        s = v.strip().upper() if isinstance(v, str) else v
        if s not in IC_TYPE_ALLOWED_FOR_IC_API:
            raise ValueError(f"ic_type must be one of {IC_TYPE_ALLOWED_FOR_IC_API}; got {s!r}. Use the dedicated module for other types.")
        return s


class IndicatorClassificationUpdateSchema(BaseUpdateSchema):
    """Schema for updating an indicator classification (all fields optional)."""
    ic_name: Optional[str] = AliasField(
        "ut_indicator_classifications", "ic_name", None,
        description="Indicator classification name", min_length=1,
        validation_alias=alias_field("ut_indicator_classifications", "ic_name"),
    )
    ic_gid: Optional[str] = AliasField(
        "ut_indicator_classifications", "ic_gid", None,
        description="Global identifier (unique)", max_length=60,
        validation_alias=alias_field("ut_indicator_classifications", "ic_gid"),
    )
    ic_parent_nid: Optional[int] = AliasField(
        "ut_indicator_classifications", "ic_parent_nid", None,
        description="Parent IC NID",
        validation_alias=alias_field("ut_indicator_classifications", "ic_parent_nid"),
    )
    ic_type: Optional[str] = AliasField(
        "ut_indicator_classifications", "ic_type", None,
        description="Classification type (SC, GL, CF, TH, IT, CN). SR is not allowed.", max_length=2,
        validation_alias=alias_field("ut_indicator_classifications", "ic_type"),
    )
    ic_short_name: Optional[str] = AliasField(
        "ut_indicator_classifications", "ic_short_name", None,
        description="Short name", max_length=50,
        validation_alias=alias_field("ut_indicator_classifications", "ic_short_name"),
    )
    ic_info: Optional[str] = AliasField(
        "ut_indicator_classifications", "ic_info", None,
        description="Description/info",
        validation_alias=alias_field("ut_indicator_classifications", "ic_info"),
    )
    ic_global: Optional[bool] = AliasField(
        "ut_indicator_classifications", "ic_global", None,
        description="Global availability flag",
        validation_alias=alias_field("ut_indicator_classifications", "ic_global"),
    )
    publisher: Optional[str] = AliasField(
        "ut_indicator_classifications", "publisher", None,
        description="Source metadata", max_length=100,
        validation_alias=alias_field("ut_indicator_classifications", "publisher"),
    )
    title: Optional[str] = AliasField(
        "ut_indicator_classifications", "title", None,
        description="Source metadata",
        validation_alias=alias_field("ut_indicator_classifications", "title"),
    )
    diyear: Optional[str] = AliasField(
        "ut_indicator_classifications", "diyear", None,
        description="Source year", max_length=10,
        validation_alias=alias_field("ut_indicator_classifications", "diyear"),
    )
    sourcelink1: Optional[str] = AliasField(
        "ut_indicator_classifications", "sourcelink1", None,
        description="Source link 1", max_length=255,
        validation_alias=alias_field("ut_indicator_classifications", "sourcelink1"),
    )
    sourcelink2: Optional[str] = AliasField(
        "ut_indicator_classifications", "sourcelink2", None,
        description="Source link 2", max_length=255,
        validation_alias=alias_field("ut_indicator_classifications", "sourcelink2"),
    )
    ic_order: Optional[int] = AliasField(
        "ut_indicator_classifications", "ic_order", None,
        description="Display order",
        validation_alias=alias_field("ut_indicator_classifications", "ic_order"),
    )
    isbn: Optional[str] = AliasField(
        "ut_indicator_classifications", "isbn", None,
        description="ISBN", max_length=255,
        validation_alias=alias_field("ut_indicator_classifications", "isbn"),
    )
    nature: Optional[str] = AliasField(
        "ut_indicator_classifications", "nature", None,
        description="Nature", max_length=255,
        validation_alias=alias_field("ut_indicator_classifications", "nature"),
    )

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_indicator_classifications")

    @field_validator("ic_type")
    @classmethod
    def ic_type_allowed(cls, v: Any) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return v
        s = v.strip().upper() if isinstance(v, str) else v
        if s not in IC_TYPE_ALLOWED_FOR_IC_API:
            raise ValueError(f"ic_type must be one of {IC_TYPE_ALLOWED_FOR_IC_API}; got {s!r}. Use the dedicated module for other types.")
        return s


class IndicatorClassificationResponseSchema(BaseSchema):
    """Schema for indicator classification response - aliases loaded from JSON"""
    ic_nid: int = AliasField("ut_indicator_classifications", "ic_nid", description="Indicator Classification NID (primary key)")
    ic_name: str = AliasField("ut_indicator_classifications", "ic_name", description="Indicator classification name")
    ic_gid: Optional[str] = AliasField("ut_indicator_classifications", "ic_gid", None, description="Global identifier (unique)", max_length=60)
    ic_parent_nid: int = AliasField("ut_indicator_classifications", "ic_parent_nid", 0, description="Parent IC NID (0 for root)")
    ic_type: Optional[str] = AliasField("ut_indicator_classifications", "ic_type", None, description="Classification type", max_length=2)
    ic_short_name: Optional[str] = AliasField("ut_indicator_classifications", "ic_short_name", None, description="Short name", max_length=50)
    ic_info: Optional[str] = AliasField("ut_indicator_classifications", "ic_info", None, description="Description/info")
    ic_global: bool = AliasField("ut_indicator_classifications", "ic_global", False, description="Global availability flag")
    publisher: Optional[str] = AliasField("ut_indicator_classifications", "publisher", None, description="Source metadata", max_length=100)
    title: Optional[str] = AliasField("ut_indicator_classifications", "title", None, description="Source metadata")
    diyear: Optional[str] = AliasField("ut_indicator_classifications", "diyear", None, description="Source year", max_length=10)
    sourcelink1: Optional[str] = AliasField("ut_indicator_classifications", "sourcelink1", None, description="Source link 1", max_length=255)
    sourcelink2: Optional[str] = AliasField("ut_indicator_classifications", "sourcelink2", None, description="Source link 2", max_length=255)
    ic_order: Optional[int] = AliasField("ut_indicator_classifications", "ic_order", None, description="Display order")
    isbn: Optional[str] = AliasField("ut_indicator_classifications", "isbn", None, description="ISBN", max_length=255)
    nature: Optional[str] = AliasField("ut_indicator_classifications", "nature", None, description="Nature", max_length=255)
    ic_ius_subtree_union_count: Optional[int] = Field(
        None,
        description=(
            "Distinct IUS (ut_ic_ius.iusnid) mapped on this classification or any descendant (full subtree union). "
            "Omitted unless include_ic_ius_counts=true."
        ),
    )

    @field_validator("ic_global", mode="before")
    @classmethod
    def coerce_ic_global(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    @field_validator("ic_type", mode="before")
    @classmethod
    def ic_type_uppercase(cls, v: Any) -> Optional[str]:
        """Ensure ic_type is always returned in uppercase (e.g. TH, GL)."""
        if v is None or (isinstance(v, str) and not v.strip()):
            return v
        return (v.strip().upper() if isinstance(v, str) else v) or None

    @classmethod
    def from_record(cls, record: Any, locale: Optional[str] = None) -> Dict[str, Any]:
        """Build dict from ORM record using schema field names (single source of truth)."""
        data: Dict[str, Any] = {}
        for name in cls.model_fields:
            if not hasattr(record, name):
                continue
            val = getattr(record, name)
            if name == "ic_global":
                val = bool(val) if val is not None else False
            if name == "ic_type" and val is not None and isinstance(val, str):
                val = val.strip().upper()
            data[name] = val
        if locale is not None:
            data["locale"] = locale
        return data

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class IcIusItemResponseSchema(BaseSchema):
    """Schema for a single IUS item returned by the IC-IUS list endpoint."""
    ius_nid: Optional[int] = AliasField("ut_ic_ius", "iusnid", None, description="IUS NID")
    ius_gid: Optional[str] = None  # computed composite (i_gid|u_gid|sg_gid), no DB column
    i_gid: Optional[str] = AliasField("ut_indicator", "indicator_gid", None, description="Indicator GID")
    u_gid: Optional[str] = AliasField("ut_unit", "unit_gid", None, description="Unit GID")
    sg_gid: Optional[str] = AliasField("ut_subgroup_vals", "subgroup_val_gid", None, description="Subgroup value GID")
    is_mapped_to_ic: bool = False  # computed flag, no DB column
    ic_ius_nid: Optional[int] = AliasField("ut_ic_ius", "ic_iusnid", None, description="IC-IUS mapping NID")
    ic_ius_is_recommended_source: bool = AliasField(
        "ut_ic_ius", "recommendedsource", False,
        description="Whether this IUS is the recommended source for the IC",
    )
    ic_ius_order: Optional[int] = AliasField("ut_ic_ius", "ic_ius_order", None, description="Display order within the IC")
    ic_ius_label: str = AliasField("ut_ic_ius", "ic_ius_label", "", description="Label for this IUS within the IC")

    model_config = ConfigDict(populate_by_name=True)


class IcIusMappingItemSchema(BaseSchema):
    """Schema for a single IC-IUS mapping item in the batch payload."""
    ic_gid: str = Field(description="Indicator Classification GID")
    parent_ic_gid: Optional[str] = Field(
        None,
        description="Optional parent IC GID (v5 parentIcNid): when set, ancestor scope uses "
        "getIcAncestors(parent)+[parent] instead of walking from the edited IC",
    )
    i_u_gid: Optional[List[str]] = Field(None, description="List of I|U composite GIDs")
    i_u_sg_gid: Optional[List[str]] = Field(None, description="List of I|U|SG composite GIDs")
    
    @model_validator(mode='after')
    def validate_exclusive_gid_types(self):
        """Ensure only one of i_u_gid or i_u_sg_gid is provided."""
        if self.i_u_gid and self.i_u_sg_gid:
            raise ValueError("Only one of i_u_gid or i_u_sg_gid can be provided")
        if not self.i_u_gid and not self.i_u_sg_gid:
            raise ValueError("Either i_u_gid or i_u_sg_gid must be provided")
        return self

    model_config = ConfigDict(populate_by_name=True)


class IcIusMappingSchema(BaseSchema):
    """Schema for the complete IC-IUS mapping payload."""
    data: List[IcIusMappingItemSchema] = Field(description="List of IC-IUS mapping items")

    model_config = ConfigDict(populate_by_name=True)
