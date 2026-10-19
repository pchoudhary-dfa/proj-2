"""
Subgroup (combination of subgroup category values) API schemas.
Internal field names = DB columns (subgroup_val_nid, subgroup_val, subgroup_val_gid, etc.).
API aliases: sg_nid, sg_name, sg_gid, sg_order, sg_is_global.
"""
from typing import Optional, List, Dict, Any, Union
from pydantic import Field, AliasChoices, ConfigDict, RootModel

from apps.datawarehouse.constants import QUERY_INC_SUBGROUPS
from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import AliasField, alias_field

from apps.datawarehouse.utils.alias_loader import create_key_validator

def _val_alias(entity: str, internal: str):
    """Accept both alias and internal key when validating (e.g. from_record returns internal keys)."""
    return AliasChoices(alias_field(entity, internal), internal)


class SgCategoryMetaSchema(BaseSchema):
    """Subgroup category (dimension type) entry for meta lookup dict, keyed by sg_cat_gid."""
    sg_cat_nid: int = AliasField("ut_subgroup_type", "subgroup_type_nid", ..., description="Subgroup category nid")
    sg_cat_name: Optional[str] = AliasField("ut_subgroup_type", "subgroup_type_name", None, description="Subgroup category display name")
    sg_cat_gid: Optional[str] = AliasField("ut_subgroup_type", "subgroup_type_gid", None, description="Subgroup category gid")


class SgValDimensionItemSchema(BaseSchema):
    """One subgroup category value in a subgroup combination, keyed by subgroup category name (e.g. Location, Sex)."""
    sg_cat_nid: int = AliasField("ut_subgroup_type", "subgroup_type_nid", ..., description="Subgroup category nid (subgroup_type_nid)")
    sg_cat_gid: Optional[str] = AliasField("ut_subgroup_type", "subgroup_type_gid", None, description="Subgroup category gid — references sg_categories in meta")
    sg_val_nid: int = AliasField("ut_subgroup", "subgroup_nid", ..., description="Subgroup category value nid (subgroup_nid)")
    sg_val_name: Optional[str] = AliasField("ut_subgroup", "subgroup_name", None, description="Subgroup category value display label")
    sg_val_gid: Optional[str] = AliasField("ut_subgroup", "subgroup_gid", None, description="Subgroup category value gid")


class SgValResponseSchema(BaseSchema):
    """Schema for a Subgroup (combination) in list or detail. Serializes with aliases s_nid, s_name, s_gid, s_order, s_is_global. Accepts both alias and internal keys when validating."""
    subgroup_val_nid: int = AliasField(
        "ut_subgroup_vals", "subgroup_val_nid",
        description="Primary key (subgroup_val_nid)"
    )
    subgroup_val_gid: Optional[str] = AliasField(
        "ut_subgroup_vals", "subgroup_val_gid", None,
        description="External identifier"    
        )
    subgroup_val: Optional[str] = AliasField(
        "ut_subgroup_vals", "subgroup_val", None,
        description="Subgroup display name (combination label)"
            )
    subgroup_val_order: Optional[int] = AliasField(
        "ut_subgroup_vals", "subgroup_val_order", None,
        description="Display order",
    )
    subgroup_val_global: Optional[bool] = AliasField(
        "ut_subgroup_vals", "subgroup_val_global", None,
        description="Global flag",
    )
    is_system: bool = AliasField(
        "ut_subgroup_vals", "is_system", False,
        description="If true, this subgroup cannot be deleted via API.",
    )
    subgroup_info: Optional[Dict[str, SgValDimensionItemSchema]] = Field(
        None,
        serialization_alias=QUERY_INC_SUBGROUPS,
        validation_alias=QUERY_INC_SUBGROUPS,
        description="...",
    )
    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from ORM record using schema field names (single source of truth)."""
        data: Dict[str, Any] = {}
            
        for name in cls.model_fields:
            if name == "subgroup_info":
                continue
            if not hasattr(record, name):
                continue
            val = getattr(record, name)
            if name == "subgroup_val_global" and val is not None:
                val = bool(val)
            elif name == "subgroup_val_global" and val is None:
                val = False
            elif name == "is_system":
                val = bool(val) if val is not None else False
            data[name] = val
        return data


class SgValMultipleDeleteSchema(BaseSchema):
    """Request body for bulk delete subgroups. GID-only."""
    subgroup_val_gid: List[str] = Field(
        ...,
        description="List of subgroup val GIDs (subgroup_val_gid) to delete (cascade)",
    )


class SgValCreateItemSchema(BaseSchema):
    """One subgroup combination to create: sg_cat_val_gids (required); display name is built internally from category value names in order (space-separated)."""
    sg_cat_val_gids: List[str] = Field(..., min_length=1, description="List of subgroup category value GIDs (subgroup_gid) that form this combination, in display order. Name is built from these values' names in this order. Must reference existing sg-categories-values.")
    sv_gid: Optional[str] = AliasField("ut_subgroup_vals", "subgroup_val_gid", None, description="Optional external identifier (GUID). Generated if not provided.", max_length=50, validation_alias=alias_field("ut_subgroup_vals", "subgroup_val_gid"))
    sv_order: Optional[int] = AliasField("ut_subgroup_vals", "subgroup_val_order", None, description="Optional display order.", validation_alias=alias_field("ut_subgroup_vals", "subgroup_val_order"))
    sv_global: Optional[bool] = AliasField("ut_subgroup_vals", "subgroup_val_global", None, description="Optional global flag.", validation_alias=alias_field("ut_subgroup_vals", "subgroup_val_global"))

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_subgroup_vals")
class SgValCreateSchema(RootModel[List[SgValCreateItemSchema]]):
    """Body for creating one or more subgroup combinations (subgroup vals + mapping). Root is the list of items; each: sg_cat_val_gids (required, order defines name), optional sv_gid, sv_order, sv_global. Name is always built from category value names in order."""


class SgValUpdateSchema(BaseUpdateSchema):
    """Partial update for one subgroup combination (ut_subgroup_vals). Identifier in URL: sv_nid (numeric) or sv_gid.
    Optional sg_cat_val_gids replaces ut_subgroup_vals_subgroup mappings and rebuilds the display name from category value names in list order (sg_cat_val_gids wins over sv_name when both are sent).
    """

    sg_cat_val_gids: Optional[List[str]] = Field(
        None,
        min_length=1,
        description="Replace dimension composition: list of subgroup category value GIDs in display order. Rebuilds name from value names in this order.",
    )
    subgroup_val: Optional[str] = AliasField(
        "ut_subgroup_vals",
        "subgroup_val",
        None,
        description="Combination display name",
        min_length=1,
        max_length=255,
        validation_alias=AliasChoices(
            alias_field("ut_subgroup_vals", "subgroup_val"),
            "sv_name",
        ),
    )
    subgroup_val_gid: Optional[str] = AliasField(
        "ut_subgroup_vals",
        "subgroup_val_gid",
        None,
        description="External identifier (max 50 chars in DB)",
        max_length=50,
        validation_alias=AliasChoices(
            alias_field("ut_subgroup_vals", "subgroup_val_gid"),
            "sv_gid",
        ),
    )
    subgroup_val_order: Optional[int] = AliasField(
        "ut_subgroup_vals",
        "subgroup_val_order",
        None,
        description="Display order",
        validation_alias=AliasChoices(
            alias_field("ut_subgroup_vals", "subgroup_val_order"),
            "sv_order",
        ),
    )
    subgroup_val_global: Optional[bool] = AliasField(
        "ut_subgroup_vals",
        "subgroup_val_global",
        None,
        description="Global flag",
        validation_alias=AliasChoices(
            alias_field("ut_subgroup_vals", "subgroup_val_global"),
            "sv_global",
        ),
    )

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_subgroup_vals")
