"""
IUS (Indicator-Unit-Subgroup) API schemas for response validation and mutations.
Request body keys follow db_tbl_cols_mapping.json (external keys: i_nid, u_nid, sg_nid, ius_min_value, etc.).
Upsert payload mirrors GET /dw/{dw_id}/indicators (subgroup=true): u_sg_gid = { unit_gid: { sg_gid, default_sg_gids } }; optional default_sg_gid on write is merged into default_sg_gids.
"""
from typing import Optional, List, Dict, Any, Union
from pydantic import Field, field_validator, model_validator, ConfigDict, AliasChoices

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import AliasField, alias_field


class IUSUpsertSgConfigSchema(BaseSchema):
    """Per-unit subgroup config for IUS upsert. Same shape as GET indicators s_gid value."""
    sg_gid: List[Union[int, str]] = Field(
        ...,
        min_length=1,
        description="Subgroup value NIDs or GIDs for this unit; saved in subgroup_val_nid. subgroup_nids column is derived from relationship table.",
    )
    default_sg_gid: Optional[Union[int, str]] = Field(
        None,
        description="First / primary default subgroup (NID or GID). Merged with default_sg_gids.",
        validation_alias=AliasChoices("default_sg_gid", "default_subgroup", "defualt_subgroup"),
    )
    default_sg_gids: Optional[List[Union[int, str]]] = Field(
        None,
        description="Multiple default subgroups (NID or GID each); merged with default_sg_gid. Same as GET indicators default_sg_gids.",
    )

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    @field_validator("default_sg_gids", mode="before")
    @classmethod
    def normalize_default_sg_gids(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, (int, str, float)):
            return [v]
        return v


class IUSUpsertItemSchema(BaseSchema):
    """One item in the IUS upsert batch: one indicator with unit -> subgroups mapping. Same structure as GET /dw/{dw_id}/indicators (subgroup=true)."""
    i_gid: str = Field(..., description="Indicator GID")
    u_gid: List[str] = Field(..., min_length=1, description="Unit GIDs")
    u_sg_gid: Dict[str, IUSUpsertSgConfigSchema] = Field(
        ...,
        min_length=1,
        description="Subgroup config per unit: keys are unit GIDs (u_gid, must be in u_gid list), values are { sg_gid, default_sg_gids } (optional default_sg_gid merged server-side). Same as GET indicators s_gid.",
        json_schema_extra={
            "propertyNames": {
                "description": "Unit GID (u_gid) - one of the values from the u_gid array",
                "type": "string",
            },
        },
    )

    @model_validator(mode="after")
    def u_sg_gid_keys_in_u_gid(self):
        u_set = set(self.u_gid)
        for unit_gid in self.u_sg_gid.keys():
            if unit_gid not in u_set:
                raise ValueError(f"u_sg_gid key {unit_gid!r} must be in u_gid list.")
        return self


class IUSUpsertRequestSchema(BaseSchema):
    """Request body for POST /dw/{dw_id}/ius: array of items to upsert."""
    data: List[IUSUpsertItemSchema] = Field(..., min_length=1, description="Array of IUS upsert items")


class IUSResponseSchema(BaseSchema):
    """Schema for IUS (Indicator-Unit-Subgroup) response - aliases loaded from JSON"""
    iusnid: int = AliasField("ut_indicator_unit_subgroup", "iusnid", description="IUS NID (primary key)")
    indicator_nid: Optional[int] = AliasField("ut_indicator_unit_subgroup", "indicator_nid", None, description="Indicator NID (from record)")
    unit_nid: Optional[int] = AliasField("ut_indicator_unit_subgroup", "unit_nid", None, description="Unit NID (from record)")
    subgroup_val_nid: Optional[int] = AliasField("ut_indicator_unit_subgroup", "subgroup_val_nid", None, description="Subgroup Val NID (from record)")
    indicator_gid: Optional[str] = AliasField("ut_indicator", "indicator_gid", None, description="Indicator GID")
    unit_gid: Optional[str] = AliasField("ut_unit", "unit_gid", None, description="Unit GID")
    subgroup_gid: Optional[str] = AliasField("ut_subgroup_vals", "subgroup_val_gid", None, description="Subgroup Val GID")
    min_value: Optional[float] = AliasField("ut_indicator_unit_subgroup", "min_value", None, description="Minimum value")
    max_value: Optional[float] = AliasField("ut_indicator_unit_subgroup", "max_value", None, description="Maximum value")
    subgroup_nids: Optional[str] = AliasField("ut_indicator_unit_subgroup", "subgroup_nids", None, description="Subgroup NIDs (comma-separated)")
    data_exist: bool = AliasField("ut_indicator_unit_subgroup", "data_exist", False, description="Whether data exists")
    isdefaultsubgroup: bool = AliasField("ut_indicator_unit_subgroup", "isdefaultsubgroup", False, description="Is default subgroup")
    avlmindatavalue: Optional[float] = AliasField("ut_indicator_unit_subgroup", "avlmindatavalue", None, description="Available min data value")
    avlmaxdatavalue: Optional[float] = AliasField("ut_indicator_unit_subgroup", "avlmaxdatavalue", None, description="Available max data value")
    avlmintimeperiod: Optional[str] = AliasField("ut_indicator_unit_subgroup", "avlmintimeperiod", None, description="Available min time period")
    avlmaxtimeperiod: Optional[str] = AliasField("ut_indicator_unit_subgroup", "avlmaxtimeperiod", None, description="Available max time period")
    validations: Optional[List[Dict[str, Any]]] = Field(None, description="Validation info (optional)")

    @field_validator("data_exist", "isdefaultsubgroup", mode="before")
    @classmethod
    def coerce_bool_none_to_false(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from IUS ORM record using schema field names (single source of truth)."""
        data: Dict[str, Any] = {}
        for name in cls.model_fields:
            if name == "validations" or name in ("indicator_gid", "unit_gid", "subgroup_gid"):
                continue
            if not hasattr(record, name):
                continue
            val = getattr(record, name)
            if name in ("data_exist", "isdefaultsubgroup"):
                val = bool(val) if val is not None else False
            data[name] = val
        return data

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class IUSCreateSchema(BaseSchema):
    """
    Schema for IUS upsert (create or update per subgroup value).
    Request body: indicator + unit (i_nid/u_nid or i_gid/u_gid) and sg_catg_val_nids (list of
    subgroup category value NIDs or GIDs). Subgroup values are fetched from sg_catg_val_nids
    via ut_subgroup_vals_subgroup — do not send sg_nids or sg_gids.
    Optional: ius_min_value, ius_max_value, ius_is_default_subgroup, ius_sg_catg_val_nids (stored on row).
    """
    indicator_nid: Optional[int] = Field(
        None,
        description="Indicator NID (API key: i_nid). Use with u_nid.",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "indicator_nid"),
    )
    unit_nid: Optional[int] = Field(
        None,
        description="Unit NID (API key: u_nid)",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "unit_nid"),
    )
    indicator_gid: Optional[str] = Field(
        None,
        description="Indicator GID (API key: i_gid). Use with u_gid.",
        validation_alias=alias_field("ut_indicator", "indicator_gid"),
    )
    unit_gid: Optional[str] = Field(
        None,
        description="Unit GID (API key: u_gid)",
        validation_alias=alias_field("ut_unit", "unit_gid"),
    )
    # Subgroup category value NIDs or GIDs; subgroup values are derived from this via ut_subgroup_vals_subgroup.
    sg_catg_val_nids: List[Union[int, str]] = Field(
        ...,
        min_length=1,
        description="Subgroup category value NIDs or GIDs (API key: sg_catg_val_nids). Subgroup values for IUS are fetched from these; do not send sg_nids/sg_gids.",
        validation_alias="sg_catg_val_nids",
    )
    min_value: Optional[float] = Field(
        None,
        description="Minimum value (API key: ius_min_value)",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "min_value"),
    )
    max_value: Optional[float] = Field(
        None,
        description="Maximum value (API key: ius_max_value)",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "max_value"),
    )
    isdefaultsubgroup: bool = Field(
        False,
        description="Is default subgroup (API key: ius_is_default_subgroup)",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "isdefaultsubgroup"),
    )
    # Optional: stored subgroup_nids on each IUS row (comma-sep). API key: ius_sg_catg_val_nids.
    subgroup_nids: Optional[List[Union[int, str]]] = Field(
        None,
        description="Subgroup category value NIDs or GIDs (API key: ius_sg_catg_val_nids) to store on each row. If omitted, derived per subgroup_val via ut_subgroup_vals_subgroup.",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "subgroup_nids"),
    )

    @model_validator(mode="after")
    def require_indicator_unit(self):
        has_nids = self.indicator_nid is not None and self.unit_nid is not None
        has_gids = self.indicator_gid is not None and self.unit_gid is not None
        if has_nids and has_gids:
            raise ValueError("Provide either (i_nid, u_nid) or (i_gid, u_gid), not both.")
        if not has_nids and not has_gids:
            raise ValueError("Provide (i_nid, u_nid) or (i_gid, u_gid).")
        return self

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class IUSUpdateSchema(BaseUpdateSchema):
    """Schema for PATCH update of an IUS (all fields optional). Uses API keys: ius_min_value, ius_max_value, ius_is_default_subgroup, sg_catg_val_nids."""
    min_value: Optional[float] = Field(
        None,
        description="Minimum value (API key: ius_min_value)",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "min_value"),
    )
    max_value: Optional[float] = Field(
        None,
        description="Maximum value (API key: ius_max_value)",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "max_value"),
    )
    isdefaultsubgroup: Optional[bool] = Field(
        None,
        description="Is default subgroup (API key: ius_is_default_subgroup)",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "isdefaultsubgroup"),
    )
    subgroup_nids: Optional[List[Union[int, str]]] = Field(
        None,
        description="Subgroup category value NIDs or GIDs (API key: sg_catg_val_nids). Resolved to comma-separated NIDs server-side.",
        validation_alias=alias_field("ut_indicator_unit_subgroup", "subgroup_nids"),
    )

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class IUSMultiDeleteSchema(BaseSchema):
    """Request body for bulk IUS hard delete. GID-only (composite GID form)."""
    ius_gid: List[str] = Field(
        ...,
        min_length=1,
        description=(
            "List of IUS composite GIDs to delete. Each item must be "
            "indicator_gid<sep>unit_gid<sep>subgroup_val_gid (separator from IUS_GID_SEPARATOR, default '|')."
        ),
    )
    force: bool = Field(
        False,
        description="If true, cascade-delete existing data rows. If false and data exists, returns 409.",
    )
