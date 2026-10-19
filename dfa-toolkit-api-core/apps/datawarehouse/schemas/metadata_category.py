"""
Metadata Category API schemas.
API field names (via db_tbl_cols_mapping.json ut_metadata_category):
  categorynid        → mt_catg_nid
  categorygid        → mt_catg_gid
  categoryname       → mt_catg_name
  categorytype       → mt_catg_type
  categoryorder      → mt_catg_order
  parentcategorynid  → mt_catg_parent_nid
  categorydescription→ mt_catg_description
  ispresentational   → mt_catg_is_presentational
  ismandatory        → mt_catg_is_mandatory
"""
from typing import Optional, Any, Dict

from pydantic import ConfigDict, Field, field_validator

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import AliasField, create_key_validator, alias_field

_ALLOWED_CATEGORY_TYPES = ("I", "A", "S")

_ENTITY = "ut_metadata_category"


class MetadataCategoryCreateSchema(BaseSchema):
    """Schema for creating one metadata category. Accepts aliases from ut_metadata_category mapping."""
    categoryname: str = AliasField(
        _ENTITY, "categoryname",
        description="Category name (required, max 255 chars, unique within categorytype)",
        min_length=1, max_length=255,
        validation_alias=alias_field(_ENTITY, "categoryname"),
    )
    categorytype: str = AliasField(
        _ENTITY, "categorytype",
        description="Category type: I (Indicator), A (Area), S (Source)",
        min_length=1, max_length=2,
        json_schema_extra={"example": "I"},
        validation_alias=alias_field(_ENTITY, "categorytype"),
    )
    categorygid: Optional[str] = AliasField(
        _ENTITY, "categorygid", None,
        description="External identifier (GUID). Auto-generated if not provided.",
        validation_alias=alias_field(_ENTITY, "categorygid"),
    )
    categoryorder: Optional[int] = AliasField(
        _ENTITY, "categoryorder", None,
        description="Display order (optional).",
        validation_alias=alias_field(_ENTITY, "categoryorder"),
    )
    parentcategorynid: Optional[float] = AliasField(
        _ENTITY, "parentcategorynid", -1,
        description="Parent category NID. Defaults to -1 (no parent). If > 0, must reference an existing category.",
        validation_alias=alias_field(_ENTITY, "parentcategorynid"),
    )
    categorydescription: Optional[str] = AliasField(
        _ENTITY, "categorydescription", None,
        description="Category description (optional).",
        validation_alias=alias_field(_ENTITY, "categorydescription"),
    )
    ispresentational: Optional[bool] = AliasField(
        _ENTITY, "ispresentational", False,
        description="Presentational flag (optional, default False).",
        validation_alias=alias_field(_ENTITY, "ispresentational"),
    )
    ismandatory: Optional[bool] = AliasField(
        _ENTITY, "ismandatory", False,
        description="Mandatory flag (optional, default False).",
        validation_alias=alias_field(_ENTITY, "ismandatory"),
    )

    @field_validator("categorytype")
    @classmethod
    def validate_categorytype(cls, v: str) -> str:
        upper = v.strip().upper()
        if upper not in _ALLOWED_CATEGORY_TYPES:
            raise ValueError(f"categorytype must be one of {list(_ALLOWED_CATEGORY_TYPES)}")
        return upper

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator(_ENTITY)


class MetadataCategoryUpdateSchema(BaseUpdateSchema):
    """Partial update schema for a metadata category. categorytype is immutable."""
    categoryname: Optional[str] = AliasField(
        _ENTITY, "categoryname", None,
        description="Category name (max 255 chars, unique within categorytype).",
        min_length=1, max_length=255,
        validation_alias=alias_field(_ENTITY, "categoryname"),
    )
    categorygid: Optional[str] = AliasField(
        _ENTITY, "categorygid", None,
        description="External identifier (GUID, unique if provided).",
        validation_alias=alias_field(_ENTITY, "categorygid"),
    )
    categoryorder: Optional[int] = AliasField(
        _ENTITY, "categoryorder", None,
        description="Display order.",
        validation_alias=alias_field(_ENTITY, "categoryorder"),
    )
    parentcategorynid: Optional[float] = AliasField(
        _ENTITY, "parentcategorynid", None,
        description="Parent category NID. If > 0, must reference an existing category.",
        validation_alias=alias_field(_ENTITY, "parentcategorynid"),
    )
    categorydescription: Optional[str] = AliasField(
        _ENTITY, "categorydescription", None,
        description="Category description.",
        validation_alias=alias_field(_ENTITY, "categorydescription"),
    )
    ispresentational: Optional[bool] = AliasField(
        _ENTITY, "ispresentational", None,
        description="Presentational flag.",
        validation_alias=alias_field(_ENTITY, "ispresentational"),
    )
    ismandatory: Optional[bool] = AliasField(
        _ENTITY, "ismandatory", None,
        description="Mandatory flag.",
        validation_alias=alias_field(_ENTITY, "ismandatory"),
    )

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator(_ENTITY)


class MetadataCategoryResponseSchema(BaseSchema):
    """Response schema for one metadata category record."""
    categorynid: int = AliasField(_ENTITY, "categorynid", description="Primary key (categorynid)")
    categoryname: Optional[str] = AliasField(_ENTITY, "categoryname", None, description="Category name")
    categorygid: Optional[str] = AliasField(_ENTITY, "categorygid", None, description="External identifier (GID)")
    categorytype: Optional[str] = AliasField(_ENTITY, "categorytype", None, description="Category type (I/A/S)")
    categoryorder: Optional[int] = AliasField(_ENTITY, "categoryorder", None, description="Display order")
    parentcategorynid: Optional[float] = AliasField(_ENTITY, "parentcategorynid", None, description="Parent category NID")
    categorydescription: Optional[str] = AliasField(_ENTITY, "categorydescription", None, description="Description")
    ispresentational: Optional[bool] = AliasField(_ENTITY, "ispresentational", None, description="Presentational flag")
    ismandatory: Optional[bool] = AliasField(_ENTITY, "ismandatory", None, description="Mandatory flag")

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from ORM record using schema field names."""
        data: Dict[str, Any] = {}
        for name in cls.model_fields:
            if not hasattr(record, name):
                continue
            val = getattr(record, name)
            if name in ("ispresentational", "ismandatory") and val is not None:
                val = bool(val)
            data[name] = val
        return data


class MetadataCategoryAssocCountSchema(BaseSchema):
    """Response schema for one category's association count."""
    categorynid: int = AliasField(_ENTITY, "categorynid", description="Category NID")
    categorygid: Optional[str] = AliasField(_ENTITY, "categorygid", None, description="Category GID")
    categoryname: Optional[str] = AliasField(_ENTITY, "categoryname", None, description="Category name")
    metadata_count: int = Field(0, description="Number of metadata report rows referencing this category")

    model_config = ConfigDict(populate_by_name=True)
