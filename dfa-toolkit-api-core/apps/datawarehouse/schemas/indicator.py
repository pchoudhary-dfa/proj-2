"""
Indicator API schemas for request/response validation.
"""
from typing import Optional, List, Union, Any, Dict

from pydantic import Field, field_validator, model_validator, ConfigDict, AliasChoices

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import AliasField, create_key_validator_multi, alias_field


class IndicatorCreateSchema(BaseSchema):
    """Schema for creating a new indicator"""
    # Core indicator fields
    indicator_name: str = AliasField(
        "ut_indicator", "indicator_name",
        description="Indicator name", min_length=1, max_length=255,
        validation_alias=alias_field("ut_indicator", "indicator_name"),
    )
    indicator_gid: Optional[str] = AliasField(
        "ut_indicator", "indicator_gid", None,
        description="Indicator GID", max_length=60,
        validation_alias=alias_field("ut_indicator", "indicator_gid"),
    )
    indicator_info: Optional[str] = AliasField(
        "ut_indicator", "indicator_info", None,
        description="Indicator information/description",
        validation_alias=alias_field("ut_indicator", "indicator_info"),
    )
    indicator_global: bool = AliasField(
        "ut_indicator", "indicator_global", False,
        description="Whether indicator is global",
        validation_alias=alias_field("ut_indicator", "indicator_global"),
    )
    short_name: Optional[str] = AliasField(
        "ut_indicator", "short_name", None,
        description="Short name", max_length=50,
        validation_alias=alias_field("ut_indicator", "short_name"),
    )
    keywords: Optional[str] = AliasField(
        "ut_indicator", "keywords", None,
        description="Keywords", max_length=255,
        validation_alias=alias_field("ut_indicator", "keywords"),
    )
    indicator_order: Optional[float] = AliasField(
        "ut_indicator", "indicator_order", None,
        description="Display order",
        validation_alias=alias_field("ut_indicator", "indicator_order"),
    )
    data_exist: bool = AliasField(
        "ut_indicator", "data_exist", False,
        description="Whether data exists for this indicator",
        validation_alias=alias_field("ut_indicator", "data_exist"),
    )
    highisgood: bool = AliasField(
        "ut_indicator", "highisgood", False,
        description="Whether higher values are better",
        validation_alias=alias_field("ut_indicator", "highisgood"),
    )

    # Schema-only relationship fields (not DB columns): list of GIDs or s_gid mapping; resolved server-side.
    # s_gid: unit GID -> list of subgroup GIDs; only these (unit, subgroup) pairs get IUS (no Cartesian product).
    # unit_gid + subgroup_val_gid: legacy; if provided without s_gid, treated as s_gid with each unit mapping to all subgroups.
    s_gid: Optional[Dict[str, List[str]]] = Field(
        None,
        description="Subgroups by unit: map of unit GID to list of subgroup GIDs. Only these (unit, subgroup) pairs get IUS; no Cartesian product. Preferred over unit_gid+subgroup_val_gid.",
        validation_alias=AliasChoices("s_gid", alias_field("ut_subgroup_vals", "s_gid")),
    )
    unit_gid: Optional[List[str]] = AliasField(
        "ut_unit", "unit_gid", None,
        description="Unit GIDs: list of unit global identifiers. Resolved to unit NIDs server-side. With subgroup_val_gid or s_gid, IUS rows are created; if neither unit/subgroup nor s_gid nor ic_gid is sent, no IUS is created (link via IUS API). For IUS shape, prefer s_gid to avoid Cartesian product.",
        validation_alias=AliasChoices("unit_gid", alias_field("ut_unit", "unit_gid")),
    )
    subgroup_val_gid: Optional[List[str]] = AliasField(
        "ut_subgroup_vals", "subgroup_val_gid", None,
        description="Subgroup value GIDs: list of subgroup value global identifiers. Resolved to subgroup_val_nids server-side. Must be sent together with unit_gid (or use s_gid). For IUS-only linking after create, omit both and use POST /ius.",
        validation_alias=AliasChoices("subgroup_val_gid", alias_field("ut_subgroup_vals", "subgroup_val_gid")),
    )
    default_sg_gid: Optional[str] = AliasField(
        "ut_subgroup_vals", "default_sg_gid", None,
        description="Primary default subgroup GID (backward compatible). Merged with default_sg_gids; also echoed as the first entry when both are used.",
        validation_alias=AliasChoices("default_sg_gid", alias_field("ut_subgroup_vals", "default_sg_gid")),
    )
    default_sg_gids: Optional[List[str]] = Field(
        None,
        description="Default subgroup GIDs: multiple IUS rows (one per unit×subgroup) may have isdefaultsubgroup=True. Order is preserved. Combined with default_sg_gid if both are sent.",
        validation_alias=AliasChoices("default_sg_gids", alias_field("ut_subgroup_vals", "default_sg_gids")),
    )
    ic_gid: Optional[List[str]] = AliasField(
        "ut_indicator_classifications", "ic_gid", None,
        description="Indicator Classification GIDs: list of IC global identifiers. Resolved to ic_nids server-side.",
        validation_alias=AliasChoices("ic_gid", alias_field("ut_indicator_classifications", "ic_gid")),
    )

    model_config = ConfigDict(
        populate_by_name=True,
        by_alias=False,
        json_schema_extra={
            "example": {
                "i_name": "My indicator",
                "i_description": "Optional description",
                "i_is_global": False,
                "i_short_name": "Short",
                "i_keywords": "tag1, tag2",
                "i_order": 0,
                "i_has_data": False,
                "i_high_is_good": False,
            }
        }
    )
    _validate_keys = create_key_validator_multi(["ut_indicator", "ut_unit", "ut_subgroup_vals", "ut_indicator_classifications"])

    @field_validator("unit_gid", "subgroup_val_gid", "ic_gid", "default_sg_gids", mode="before")
    @classmethod
    def normalize_gid_to_list(cls, v: Optional[Union[str, List[str]]]) -> Optional[List[str]]:
        if v is None:
            return None
        if isinstance(v, str):
            return [v]
        return [str(x) for x in v]

    @model_validator(mode='after')
    def validate_related_ids(self):
        has_s_gid = self.s_gid is not None and len(self.s_gid) > 0
        has_unit = self.unit_gid is not None
        has_subgroup = self.subgroup_val_gid is not None
        if has_unit and not has_subgroup and not has_s_gid:
            raise ValueError("Unit (unit_gid/u_gid) and subgroup (subgroup_val_gid/sg_gid) must be provided together, or use s_gid (unit -> subgroups), or neither (indicator-only create; add IUS via IUS API)")
        if has_subgroup and not has_unit and not has_s_gid:
            raise ValueError("Unit (unit_gid/u_gid) and subgroup (subgroup_val_gid/sg_gid) must be provided together, or use s_gid (unit -> subgroups), or neither (indicator-only create; add IUS via IUS API)")
        return self


class IndicatorUpdateSchema(BaseUpdateSchema):
    """Schema for updating an indicator (all fields optional) - accepts both formats"""
    indicator_name: Optional[str] = AliasField(
        "ut_indicator", "indicator_name", None,
        description="Indicator name", max_length=255,
        validation_alias=alias_field("ut_indicator", "indicator_name"),
    )
    indicator_gid: Optional[str] = AliasField(
        "ut_indicator", "indicator_gid", None,
        description="Indicator GID", max_length=60,
        validation_alias=alias_field("ut_indicator", "indicator_gid"),
    )
    indicator_info: Optional[str] = AliasField(
        "ut_indicator", "indicator_info", None,
        description="Indicator information/description",
        validation_alias=alias_field("ut_indicator", "indicator_info"),
    )
    indicator_global: Optional[bool] = AliasField(
        "ut_indicator", "indicator_global", None,
        description="Whether indicator is global",
        validation_alias=alias_field("ut_indicator", "indicator_global"),
    )
    short_name: Optional[str] = AliasField(
        "ut_indicator", "short_name", None,
        description="Short name", max_length=50,
        validation_alias=alias_field("ut_indicator", "short_name"),
    )
    keywords: Optional[str] = AliasField(
        "ut_indicator", "keywords", None,
        description="Keywords", max_length=255,
        validation_alias=alias_field("ut_indicator", "keywords"),
    )
    indicator_order: Optional[float] = AliasField(
        "ut_indicator", "indicator_order", None,
        description="Display order",
        validation_alias=alias_field("ut_indicator", "indicator_order"),
    )
    data_exist: Optional[bool] = AliasField(
        "ut_indicator", "data_exist", None,
        description="Whether data exists for this indicator",
        validation_alias=alias_field("ut_indicator", "data_exist"),
    )
    highisgood: Optional[bool] = AliasField(
        "ut_indicator", "highisgood", None,
        description="Whether higher values are better",
        validation_alias=alias_field("ut_indicator", "highisgood"),
    )
    # Schema-only relationship fields (not DB columns): s_gid or unit_gid+subgroup_val_gid; resolved server-side.
    s_gid: Optional[Dict[str, List[str]]] = Field(
        None,
        description="Subgroups by unit: map of unit GID to list of subgroup GIDs. Only these (unit, subgroup) pairs; no Cartesian product.",
        validation_alias=AliasChoices("s_gid", alias_field("ut_subgroup_vals", "s_gid")),
    )
    unit_gid: Optional[List[str]] = AliasField(
        "ut_unit", "unit_gid", None,
        description="Unit GIDs: list of unit global identifiers. Resolved to unit NIDs server-side. For IUS use s_gid instead.",
        validation_alias=AliasChoices("unit_gid", alias_field("ut_unit", "unit_gid")),
    )
    subgroup_val_gid: Optional[List[str]] = AliasField(
        "ut_subgroup_vals", "subgroup_val_gid", None,
        description="Subgroup value GIDs: list of subgroup value global identifiers. Resolved to subgroup_val_nids server-side. For IUS use s_gid instead.",
        validation_alias=AliasChoices("subgroup_val_gid", alias_field("ut_subgroup_vals", "subgroup_val_gid")),
    )
    default_sg_gid: Optional[str] = AliasField(
        "ut_subgroup_vals", "default_sg_gid", None,
        description="Primary default subgroup GID (backward compatible). Merged with default_sg_gids.",
        validation_alias=AliasChoices("default_sg_gid", alias_field("ut_subgroup_vals", "default_sg_gid")),
    )
    default_sg_gids: Optional[List[str]] = Field(
        None,
        description="Multiple default subgroup GIDs; combined with default_sg_gid when both are sent.",
        validation_alias=AliasChoices("default_sg_gids", alias_field("ut_subgroup_vals", "default_sg_gids")),
    )
    ic_gid: Optional[List[str]] = AliasField(
        "ut_indicator_classifications", "ic_gid", None,
        description="Indicator Classification GIDs: list of IC global identifiers. Resolved to ic_nids server-side.",
        validation_alias=AliasChoices("ic_gid", alias_field("ut_indicator_classifications", "ic_gid")),
    )

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "i_name": "string",
                "i_gid": "string",
                "i_description": "string",
                "i_is_global": True,
                "i_short_name": "string",
                "i_keywords": "string",
                "i_order": 0,
                "i_has_data": True,
                "i_high_is_good": True,
                "s_gid": {"P": ["TOTAL", "RURAL", "URBAN"]},
                "default_sg_gid": "TOTAL",
                "default_sg_gids": ["TOTAL", "RURAL"],
                "ic_gid": ["IC_GID_1"],
            }
        },
    )
    _validate_keys = create_key_validator_multi(["ut_indicator", "ut_unit", "ut_subgroup_vals", "ut_indicator_classifications"])

    @field_validator("unit_gid", "subgroup_val_gid", "ic_gid", "default_sg_gids", mode="before")
    @classmethod
    def normalize_gid_to_list(cls, v: Optional[Union[str, List[str]]]) -> Optional[List[str]]:
        if v is None:
            return None
        if isinstance(v, str):
            return [v]
        return [str(x) for x in v]

    @model_validator(mode='after')
    def validate_related_ids(self):
        has_s_gid = self.s_gid is not None and len(self.s_gid) > 0
        has_unit = self.unit_gid is not None
        has_subgroup = self.subgroup_val_gid is not None
        if has_unit and not has_subgroup and not has_s_gid:
            raise ValueError("Unit (unit_gid/u_gid) and subgroup (subgroup_val_gid/sg_gid) must be provided together, or use s_gid, or neither")
        if has_subgroup and not has_unit and not has_s_gid:
            raise ValueError("Unit (unit_gid/u_gid) and subgroup (subgroup_val_gid/sg_gid) must be provided together, or use s_gid, or neither")
        return self


class MetadataItemSchema(BaseSchema):
    """Schema for metadata item in indicator response (same shape as GET .../metadata/ including category caption)."""
    metadatareport_nid: int = AliasField("ut_metadatareport", "metadatareport_nid", description="Metadata report ID")
    target_nid: int = AliasField("ut_metadatareport", "target_nid", description="Target ID")
    category_nid: Optional[int] = AliasField("ut_metadatareport", "category_nid", description="Category ID")
    metadata: Optional[str] = AliasField("ut_metadatareport", "metadata_text", description="Metadata text")
    # Category caption and metadata-API parity (from ut_metadata_category)
    categoryname: Optional[str] = AliasField("ut_metadata_category", "categoryname", None, description="Metadata category caption/name")
    categorygid: Optional[str] = AliasField("ut_metadata_category", "categorygid", None, description="Metadata category GID")
    categoryorder: Optional[int] = AliasField("ut_metadata_category", "categoryorder", None, description="Metadata category order")


class IndicatorResponseSchema(BaseSchema):
    """Schema for indicator response - outputs per ADAPTATION setting"""
    indicator_nid: int = AliasField("ut_indicator", "indicator_nid", description="Indicator ID (primary key)")
    indicator_name: Optional[str] = AliasField("ut_indicator", "indicator_name", None, description="Indicator name", max_length=255)
    indicator_gid: Optional[str] = AliasField("ut_indicator", "indicator_gid", None, description="Indicator GID", max_length=60)
    indicator_info: Optional[str] = AliasField("ut_indicator", "indicator_info", None, description="Indicator information/description")
    indicator_global: bool = AliasField("ut_indicator", "indicator_global", False, description="Whether indicator is global")
    short_name: Optional[str] = AliasField("ut_indicator", "short_name", None, description="Short name", max_length=50)
    keywords: Optional[str] = AliasField("ut_indicator", "keywords", None, description="Keywords", max_length=255)
    indicator_order: Optional[float] = AliasField("ut_indicator", "indicator_order", None, description="Display order")
    data_exist: bool = AliasField("ut_indicator", "data_exist", False, description="Whether data exists for this indicator (null from DB treated as False)")
    highisgood: bool = AliasField("ut_indicator", "highisgood", False, description="Whether higher values are better")

    @field_validator("data_exist", "highisgood", "indicator_global", mode="before")
    @classmethod
    def coerce_bool_none_to_false(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    locale: Optional[str] = AliasField("ut_indicator", "locale", None, description="Language code for translations")
    unit_nid: Optional[List[int]] = AliasField("ut_unit", "unit_nid", None, description="List of unit NIDs associated with indicator (external: u_nid)")
    subgroup_nid: Optional[List[int]] = AliasField("ut_subgroup_vals", "subgroup_val_nid", None, description="List of subgroup value NIDs associated with indicator (external: s_nid)")
    default_sg_nid: Optional[int] = Field(None, description="Default subgroup NID")
    ic_nid: Optional[Union[int, List[int]]] = AliasField("ut_indicator_classifications", "ic_nid", None, description="Indicator Classification NID(s) (external: ic_nid)")
    metadata: Optional[List[int]] = AliasField("ut_metadatareport", "metadatareport_nid", None, description="List of metadata report NIDs (full details in meta.metadata keyed by category GID when metadata=true)")
    metadata_gid: Optional[List[str]] = AliasField("ut_metadatareport", "report_category_gid", None, description="List of metadata category GIDs (same order as meta.metadata keys); use to look up meta.metadata[gid]")
    iusnid: Optional[List[int]] = AliasField("ut_indicator_unit_subgroup", "iusnid", None, description="List of IUS NIDs (e.g. created on POST); maps to ius_nid in external format")
    # GID lists (returned when include flags are set; NID fields omitted in that case)
    unit_gid: Optional[List[str]] = AliasField("ut_unit", "unit_gid", None, description="List of unit GIDs (external: u_gid)")
    s_gid: Optional[Dict[str, Dict[str, Any]]] = Field(
        None,
        description="Subgroups by unit: map of unit GID to { sg_gid, default_sg_gids, sg_gid_with_compute_formula (optional: subgroup GIDs that have a compute target IUS, only when requested), ius_nid (optional: list of IUS primary keys, same length and order as sg_gid after server-side sort, when GET /indicators?ius=true) }. No flat sg_gid or top-level default fields.",
    )
    ic_gid: Optional[List[str]] = AliasField("ut_indicator_classifications", "ic_gid", None, description="List of Indicator Classification GIDs (external: ic_gid)")

    @classmethod
    def from_record(
        cls,
        record: Any,
        locale_record: Optional[Any] = None,
        locale: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Build base dict from indicator ORM record(s) using schema field names. Relation fields (unit_nid, ic_nid, etc.) are added by the service."""
        data: Dict[str, Any] = {
            "indicator_nid": record.indicator_nid,
            "indicator_gid": getattr(record, "indicator_gid", None),
            "indicator_global": bool(getattr(record, "indicator_global", False)) if getattr(record, "indicator_global", None) is not None else False,
            "indicator_order": getattr(record, "indicator_order", None),
            "data_exist": bool(getattr(record, "data_exist", False)) if getattr(record, "data_exist", None) is not None else False,
            "highisgood": bool(getattr(record, "highisgood", False)) if getattr(record, "highisgood", None) is not None else False,
        }
        if locale_record is not None:
            data["indicator_name"] = getattr(locale_record, "indicator_name", None)
            data["indicator_info"] = getattr(locale_record, "indicator_info", None)
            data["short_name"] = getattr(locale_record, "short_name", None)
            data["keywords"] = getattr(locale_record, "keywords", None)
        else:
            data["indicator_name"] = getattr(record, "indicator_name", None)
            data["indicator_info"] = getattr(record, "indicator_info", None)
            data["short_name"] = getattr(record, "short_name", None)
            data["keywords"] = getattr(record, "keywords", None)
        if locale is not None:
            data["locale"] = locale
        return data


class IndicatorMultipleDeleteSchema(BaseSchema):
    """Bulk delete indicators by primary key (full cascade per indicator)."""

    indicator_nid: List[int] = Field(
        default_factory=list,
        description="Indicator NIDs to delete (duplicate NIDs are ignored server-side).",
    )
