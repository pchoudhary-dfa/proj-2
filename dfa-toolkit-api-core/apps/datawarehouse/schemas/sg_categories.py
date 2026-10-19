"""
Subgroup Categories (Subgroup Types) API schemas.
API field names: sg_cat_nid, sg_cat_name, sg_cat_gid, sg_cat_order, sg_cat_global.
"""
from typing import Optional, List, Any, Dict
from pydantic import Field, field_validator, ConfigDict, AliasChoices

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import AliasField, create_key_validator, alias_field


class SgCategoryCreateSchema(BaseSchema):
    """Schema for creating a Subgroup Category. Accepts aliases: sg_cat_name, sg_cat_gid, etc."""
    subgroup_type_name: str = AliasField(
        "ut_subgroup_type", "subgroup_type_name",
        description="Subgroup category name (required, max 128 chars)", min_length=1, max_length=128,
        validation_alias=alias_field("ut_subgroup_type", "subgroup_type_name"),
    )
    subgroup_type_gid: Optional[str] = AliasField(
        "ut_subgroup_type", "subgroup_type_gid", None,
        description="External identifier (optional; valid GUID format, unique if provided)",
        validation_alias=alias_field("ut_subgroup_type", "subgroup_type_gid"),
    )
    subgroup_type_order: Optional[float] = AliasField(
        "ut_subgroup_type", "subgroup_type_order", None,
        description="Display order (optional)",
        validation_alias=alias_field("ut_subgroup_type", "subgroup_type_order"),
    )
    subgroup_type_global: Optional[bool] = AliasField(
        "ut_subgroup_type", "subgroup_type_global", False,
        description="Global availability flag (optional; default 0)",
        validation_alias=alias_field("ut_subgroup_type", "subgroup_type_global"),
    )

    @field_validator("subgroup_type_gid")
    @classmethod
    def validate_subgroup_type_gid_guid(cls, v: Optional[str]) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        from apps.shared.utils.validators import validate_unit_gid_guid
        if not validate_unit_gid_guid(v):
            raise ValueError("subgroup_type_gid must be a valid GUID (UUID) format")
        return v.strip()

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_subgroup_type")


class SgCategoryValueCreateSchema(BaseSchema):
    """Schema for creating one subgroup category value with its category association. Accepts aliases: sg_catg_val_name, sg_catg_val_gid, sg_catg_val_order, sg_catg_val_global."""
    sg_cat_gid: str = Field(
        ...,
        description="Category GID (subgroup_type_gid). Resolved to category nid server-side.",
    )
    subgroup_name: str = AliasField(
        "ut_subgroup", "subgroup_name",
        description="Subgroup category value label (required, max 128 chars)", min_length=1, max_length=128,
        validation_alias=alias_field("ut_subgroup", "subgroup_name"),
    )
    subgroup_gid: Optional[str] = AliasField(
        "ut_subgroup", "subgroup_gid", None,
        description="External identifier (optional; GUID format, unique if provided)", max_length=255,
        validation_alias=alias_field("ut_subgroup", "subgroup_gid"),
    )
    subgroup_order: Optional[int] = AliasField(
        "ut_subgroup", "subgroup_order", None,
        description="Display order (optional)",
        validation_alias=alias_field("ut_subgroup", "subgroup_order"),
    )
    subgroup_global: Optional[bool] = AliasField(
        "ut_subgroup", "subgroup_global", False,
        description="Global availability flag (optional, default False)",
        validation_alias=alias_field("ut_subgroup", "subgroup_global"),
    )
    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_subgroup")


class SgCategoryValueUpdateSchema(BaseUpdateSchema):
    """Partial update for a subgroup category value. Accepts aliases from ut_subgroup mapping."""
    subgroup_name: Optional[str] = AliasField(
        "ut_subgroup", "subgroup_name", None,
        description="Subgroup value label (max 128 chars)", min_length=1, max_length=128,
        validation_alias=alias_field("ut_subgroup", "subgroup_name"),
    )
    subgroup_gid: Optional[str] = AliasField(
        "ut_subgroup", "subgroup_gid", None,
        description="External identifier (GUID format, unique if provided)", max_length=255,
        validation_alias=alias_field("ut_subgroup", "subgroup_gid"),
    )
    subgroup_order: Optional[int] = AliasField(
        "ut_subgroup", "subgroup_order", None,
        description="Display order",
        validation_alias=alias_field("ut_subgroup", "subgroup_order"),
    )
    subgroup_global: Optional[bool] = AliasField(
        "ut_subgroup", "subgroup_global", None,
        description="Global availability flag",
        validation_alias=alias_field("ut_subgroup", "subgroup_global"),
    )
    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_subgroup")


class SgCategoryUpdateSchema(BaseUpdateSchema):
    """Schema for updating a Subgroup Category (partial update). Accepts aliases: sg_cat_name, sg_cat_order, sg_cat_global."""
    subgroup_type_name: Optional[str] = AliasField(
        "ut_subgroup_type", "subgroup_type_name", None,
        description="Subgroup category name (max 128 chars)",min_length=1, max_length=128,
        validation_alias=alias_field("ut_subgroup_type", "subgroup_type_name"),
    )
    subgroup_type_gid: Optional[str] = AliasField(
        "ut_subgroup_type", "subgroup_type_gid", None,
        description="External identifier (optional; valid GUID format, unique if provided)",min_length=1,
        validation_alias=alias_field("ut_subgroup_type", "subgroup_type_gid"),
    )
    subgroup_type_order: Optional[float] = AliasField(
        "ut_subgroup_type", "subgroup_type_order", None,
        description="Display order",
        validation_alias=alias_field("ut_subgroup_type", "subgroup_type_order"),
    )
    subgroup_type_global: Optional[bool] = AliasField(
        "ut_subgroup_type", "subgroup_type_global", None,
        description="Global availability flag",
        validation_alias=alias_field("ut_subgroup_type", "subgroup_type_global"),
    )

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_subgroup_type")


class SgCategoryMultipleDeleteSchema(BaseSchema):
    """Request body for bulk delete subgroup categories. GID-only."""
    sg_cat_gid: List[str] = Field(..., description="List of subgroup category GIDs to delete")


class SgCategoryAssociationCountRequestSchema(BaseSchema):
    """Request body for association count (delete confirmation). GID-only."""
    sg_cat_gid: List[str] = Field(..., description="List of subgroup category GIDs")


class SgCategoryUsedInSchema(BaseSchema):
    """Nested used_in payload; subgroup_count is junction-based (distinct ut_subgroup_vals) with different rollup grain per endpoint."""
    subgroup_count: int = Field(
        0,
        description="Category list: distinct ut_subgroup_vals (subgroup_val_nid) in ut_subgroup_vals_subgroup for any ut_subgroup in that category. Category-values list: distinct ut_subgroup_vals linked via junction for this single ut_subgroup row.",
    )


class SgCategoryResponseSchema(BaseSchema):
    """Schema for a Subgroup Category in list or detail. Serializes with aliases sg_cat_nid, sg_cat_name, etc."""
    subgroup_type_nid: int = AliasField("ut_subgroup_type", "subgroup_type_nid", description="Primary key (subgroup_type_nid)")
    subgroup_type_name: Optional[str] = AliasField("ut_subgroup_type", "subgroup_type_name", None, description="Subgroup category name")
    subgroup_type_gid: Optional[str] = AliasField("ut_subgroup_type", "subgroup_type_gid", None, description="External identifier (GUID)")
    subgroup_type_order: Optional[float] = AliasField("ut_subgroup_type", "subgroup_type_order", None, description="Display order")
    subgroup_type_global: Optional[bool] = AliasField("ut_subgroup_type", "subgroup_type_global", None, description="Global flag")
    is_system: bool = AliasField(
        "ut_subgroup_type",
        "is_system",
        False,
        description="Built-in category row that cannot be deleted via API",
    )
    used_in: Optional[SgCategoryUsedInSchema] = Field(
        default=None,
        description='When requested on list (?used_in=true): {"subgroup_count": n} = distinct ut_subgroup_vals linked via ut_subgroup_vals_subgroup for any ut_subgroup in this category',
    )

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from ORM record using schema field names (single source of truth)."""
        data: Dict[str, Any] = {}
        for name in cls.model_fields:
            if not hasattr(record, name):
                continue
            val = getattr(record, name)
            if name == "subgroup_type_global" and val is not None:
                val = bool(val)
            if name == "is_system":
                val = bool(val) if val is not None else False
            data[name] = val
        data.setdefault("is_system", bool(getattr(record, "is_system", False)))
        return data


def _val_alias(entity: str, internal: str):
    """Accept both alias and internal key when validating (e.g. from_record returns internal keys)."""
    return AliasChoices(alias_field(entity, internal), internal)


class SgValRecordSchema(BaseSchema):
    """Schema for one subgroup in category-values list. Uses SUBGROUP entity. Serializes with aliases sg_nid, sg_name, sg_gid, sg_order, sg_is_global, sg_type."""
    subgroup_nid: int = AliasField(
        "ut_subgroup_vals", "subgroup_val_nid",
        description="Primary key (subgroup_nid)",
        validation_alias=_val_alias("ut_subgroup_vals", "subgroup_val_nid"),
    )
    subgroup_name: Optional[str] = AliasField(
        "ut_subgroup_vals", "subgroup_val", None,
        description="Subgroup display label",
        validation_alias=_val_alias("ut_subgroup_vals", "subgroup_val"),
    )
    subgroup_gid: Optional[str] = AliasField(
        "ut_subgroup_vals", "subgroup_val_gid", None,
        description="External identifier",
        validation_alias=_val_alias("ut_subgroup_vals", "subgroup_val_gid"),
    )
    subgroup_order: Optional[int] = AliasField(
        "ut_subgroup_vals", "subgroup_val_order", None,
        description="Display order",
        validation_alias=_val_alias("ut_subgroup_vals", "subgroup_val_order"),
    )
    subgroup_global: Optional[bool] = AliasField(
        "ut_subgroup_vals", "subgroup_val_global", False,
        description="Global availability flag",
        validation_alias=_val_alias("ut_subgroup_vals", "subgroup_val_global"),
    )
    subgroup_type: Optional[int] = AliasField(
        "ut_subgroup", "subgroup_type", None,
        description="Subgroup category nid (FK)",
        validation_alias=_val_alias("ut_subgroup_vals", "subgroup_type"),
    )

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from ORM record (Subgroup) using schema field names (single source of truth)."""
        data: Dict[str, Any] = {}
        for name in cls.model_fields:
            if hasattr(record, name):
                data[name] = getattr(record, name)
        return data


class SubgroupCategoryValueResponseSchema(BaseSchema):
    """Schema for one subgroup category value record from ut_subgroup. Serializes with aliases from db_tbl_cols_mapping.json ut_subgroup section: sg_catg_val_nid, sg_catg_val_name, sg_catg_val_gid, sg_catg_val_global, sg_cat_nid, sg_cat_gid, sg_catg_val_order."""
    subgroup_nid: int = AliasField(
        "ut_subgroup", "subgroup_nid",
        description="Primary key (subgroup_nid)",
    )
    subgroup_name: Optional[str] = AliasField(
        "ut_subgroup", "subgroup_name", None,
        description="Subgroup category value display label",
    )
    subgroup_gid: Optional[str] = AliasField(
        "ut_subgroup", "subgroup_gid", None,
        description="External identifier (GID)",
    )
    subgroup_global: Optional[bool] = AliasField(
        "ut_subgroup", "subgroup_global", None,
        description="Global availability flag",
    )
    subgroup_type: Optional[int] = AliasField(
        "ut_subgroup", "subgroup_type", None,
        description="Parent subgroup category NID (FK to ut_subgroup_type)",
    )
    subgroup_type_gid: Optional[str] = AliasField(
        "ut_subgroup_type", "subgroup_type_gid", None,
        description="Parent subgroup category GID",
    )
    subgroup_order: Optional[int] = AliasField(
        "ut_subgroup", "subgroup_order", None,
        description="Display order",
    )
    is_system: bool = AliasField(
        "ut_subgroup",
        "is_system",
        False,
        description="Built-in subgroup value row that cannot be deleted via API",
    )
    used_in: Optional[SgCategoryUsedInSchema] = Field(
        default=None,
        description="When requested (?used_in=true on sg-categories-values): subgroup_count = distinct ut_subgroup_vals (subgroup_val_nid) linked via ut_subgroup_vals_subgroup for this ut_subgroup row",
    )

    @classmethod
    def from_record(cls, record: Any, subgroup_type_gid: Optional[str] = None) -> Dict[str, Any]:
        """Build dict from ORM Subgroup record using schema field names."""
        data: Dict[str, Any] = {}
        for name in cls.model_fields:
            if name == "used_in":
                continue
            if name == "subgroup_type_gid":
                data[name] = subgroup_type_gid
                continue
            if not hasattr(record, name):
                continue
            val = getattr(record, name)
            if name == "subgroup_global" and val is not None:
                val = bool(val)
            if name == "is_system":
                val = bool(val) if val is not None else False
            data[name] = val
        data.setdefault("is_system", bool(getattr(record, "is_system", False)))
        return data


class SgCategoryWithValuesResponseSchema(BaseSchema):
    """Schema for a Subgroup Category with its value records (group_by format)."""
    subgroup_type_nid: int = AliasField("ut_subgroup_type", "subgroup_type_nid", description="Primary key (subgroup_type_nid)")
    subgroup_type_name: Optional[str] = AliasField("ut_subgroup_type", "subgroup_type_name", None, description="Subgroup category name")
    subgroup_type_gid: Optional[str] = AliasField("ut_subgroup_type", "subgroup_type_gid", None, description="External identifier (GUID)")
    subgroup_type_order: Optional[float] = AliasField("ut_subgroup_type", "subgroup_type_order", None, description="Display order")
    subgroup_type_global: Optional[bool] = AliasField("ut_subgroup_type", "subgroup_type_global", None, description="Global flag")
    is_system: bool = AliasField(
        "ut_subgroup_type",
        "is_system",
        False,
        description="Built-in category row that cannot be deleted via API",
    )
    sg_cat_val_records: List[SubgroupCategoryValueResponseSchema] = Field(
        default_factory=list,
        description="List of subgroup category value records under this category",
        serialization_alias="children",
    )
