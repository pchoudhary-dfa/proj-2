"""
Data API schemas for response validation and upsert requests.
Response keys follow DATA entity in db_tbl_cols_mapping.json (internal names; aliases applied via get_serialization_mode).
"""
from typing import Annotated, Optional, Any, List, Literal
from pydantic import (
    ConfigDict,
    Field,
    SerializationInfo,
    field_validator,
    model_serializer,
    model_validator,
)
from pydantic.json_schema import SkipJsonSchema

from apps.shared.schemas.base import BaseSchema
from apps.datawarehouse.utils.alias_loader import AliasField, alias_field


class DataRowResponseSchema(BaseSchema):
    """
    Schema for one data row in GET /dw/{dw_id}/data response.
    DATA table fields use AliasField("DATA", ...); denormalized fields use Field() (same key in both modes).
    """
    # DATA entity fields (internal names; serialization_alias from db_tbl_cols_mapping.json DATA key)
    data_nid: int = AliasField("ut_data", "data_nid", description="Data row primary key")
    iusnid: Optional[int] = AliasField("ut_data", "iusnid", None, description="IUS NID")
    timeperiod_nid: Optional[int] = AliasField("ut_data", "timeperiod_nid", None, description="Time period NID")
    area_nid: Optional[int] = AliasField("ut_data", "area_nid", None, description="Area NID")
    start_date: Optional[str] = AliasField("ut_data", "start_date", None, description="Start date (ISO)")
    end_date: Optional[str] = AliasField("ut_data", "end_date", None, description="End date (ISO)")
    data_denominator: Optional[int] = AliasField("ut_data", "data_denominator", None, description="Data denominator")
    footnote_nid: Optional[int] = AliasField("ut_data", "footnote_nid", None, description="Footnote NID")
    source_nid: Optional[int] = AliasField("ut_data", "source_nid", None, description="Source NID")
    indicator_nid: Optional[int] = AliasField("ut_data", "indicator_nid", None, description="Indicator NID")
    unit_nid: Optional[int] = AliasField("ut_data", "unit_nid", None, description="Unit NID")
    subgroup_val_nid: Optional[int] = AliasField("ut_data", "subgroup_val_nid", None, description="Subgroup value NID")
    ic_ius_order: Optional[float] = AliasField("ut_data", "ic_ius_order", None, description="IC IUS order")
    textual_data_value: Optional[str] = AliasField("ut_data", "textual_data_value", None, description="Textual data value")
    istextualdata: bool = AliasField("ut_data", "istextualdata", False, description="Whether value is textual")
    data_value: Optional[float] = AliasField("ut_data", "data_value", None, description="Numeric data value")
    unit_format: Optional[str] = Field(
        None, description="Unit display format code from ut_unit (when set)"
    )
    formatted_data_value: Optional[str] = Field(
        None,
        description="Display string for data_value/textual_data_value using unit_format catalog",
    )

    # Denormalized / joined fields (not in DATA mapping; same key in both modes)
    i_name: str = Field("", description="Indicator name")
    i_gid: str = Field("", description="Indicator GID")
    u_name: str = Field("", description="Unit name")
    u_gid: str = Field("", description="Unit GID")
    sg_name: str = Field("", description="Subgroup value name")
    sg_gid: str = Field("", description="Subgroup value GID")
    ar_id: str = Field("", description="Area ID")
    ar_name: str = Field("", description="Area name")
    tp_timeperiod: str = Field("", description="Time period label")
    ius_gid: str = Field("", description="IUS GID (i_gid|u_gid|s_gid)")
    src_name: str = Field("", description="Source name")
    footnote: str = Field("", description="Footnote text")

    @field_validator("istextualdata", mode="before")
    @classmethod
    def coerce_istextualdata(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


UnifiedDataPointSourceLiteral = Literal["pending", "approved", "new"]


class UnifiedDataPointRowSchema(DataRowResponseSchema):
    """
    One row of GET /dw/{dw_id}/data-points: same DATA field aliases as GET /dw/{dw_id}/data
    (via AliasField + model_dump(by_alias=...)), plus workflow overlay fields.

    External ADAPTATION maps ``source_nid`` → ``ic_nid`` only; this schema also emits a literal
    ``source_nid`` key (same value) for data-points consumers.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=False)

    data_nid: Optional[int] = AliasField(
        "ut_data",
        "data_nid",
        None,
        description="ut_data.data_nid when a baseline fact row exists; null for dataset-only new rows",
    )

    data_point_id: Optional[int] = Field(default=None, description="dataset_data_point PK when applicable")
    dataset_id: Optional[int] = Field(default=None, description="Owning dataset when applicable")
    data_entry_note: Optional[str] = Field(default=None, description="Operator note (dataset layer)")
    approved_value: Optional[float] = Field(
        default=None,
        description="Approved numeric value from ut_data (for pending/new comparison)",
    )
    approved_textual_value: Optional[str] = Field(
        default=None,
        description="Approved textual value from ut_data (for pending/new comparison)",
    )
    source: UnifiedDataPointSourceLiteral = Field(
        ...,
        description="pending | approved | new — same semantics as unified data-points service",
    )
    review_status: Optional[str] = Field(default=None, description="Review status on dataset row")
    is_locked: Optional[bool] = Field(default=None, description="Locked flag on dataset row")
    is_deleted: Optional[bool] = Field(
        default=None,
        description="Soft-delete flag on dataset row; null when row is ut_data-only (source=approved)",
    )
    prev_timeperiod_nid: Optional[int] = Field(
        default=None,
        description="From dataset_data_point when source is pending or new; null for approved-only rows",
    )
    prev_tmprd_data_value: Optional[float] = Field(
        default=None,
        description="From dataset_data_point when source is pending or new; null for approved-only rows",
    )
    prev_tmprd_textual_data_value: Optional[str] = Field(
        default=None,
        description="From dataset_data_point when source is pending or new; null for approved-only rows",
    )
    prev_data_value: Optional[str] = Field(
        default=None,
        description=(
            "From dataset_data_point when source is pending or new — immutable ut_data baseline "
            "at creation; null for approved-only rows"
        ),
    )
    formatted_approved_value: Optional[str] = Field(
        default=None,
        description="Formatted approved baseline (ut_data) using unit_format",
    )
    formatted_prev_tmprd_value: Optional[str] = Field(
        default=None,
        description="Formatted previous-period comparison value using unit_format",
    )
    cmnt_cnt: Optional[int] = Field(
        default=None,
        description="Total comments on this data point; null for approved-only rows",
    )

    @model_serializer(mode="wrap")
    def _serialize_echo_source_nid(self, handler, info: SerializationInfo):
        data = handler(self)
        if info.by_alias:
            data["source_nid"] = data.get("ic_nid")
        return data


class DataUpsertItemSchema(BaseSchema):
    """
    Schema for one data row in POST /dw/{dw_id}/data (upsert).
    Accepts both internal column names and external aliases from db_tbl_cols_mapping.json.
    NID fields: accepts external alias (e.g. i_nid) OR internal name (e.g. indicator_nid).
    GID fields: resolution-only; used to look up the corresponding NID when NID is absent.

    Observation value:
      dt_value — unified input field (numeric or text). The service determines the storage
      column (data_value vs textual_data_value) based on value type.

    Footnote resolution order: fn_nid → fn_gid → fn (caption text, auto-created if absent).
    """
    # Indicator
    indicator_nid: Optional[int] = AliasField(
        "ut_data", "indicator_nid", None,
        description="Indicator NID (i_nid). Resolved from i_gid if absent.",
        validation_alias=alias_field("ut_data", "indicator_nid"),
    )
    indicator_gid: Optional[str] = AliasField(
        "ut_indicator", "indicator_gid", None,
        description="Indicator GID — used to resolve indicator_nid when not provided.",
        validation_alias=alias_field("ut_indicator", "indicator_gid"),
    )

    # Unit
    unit_nid: Optional[int] = AliasField(
        "ut_data", "unit_nid", None,
        description="Unit NID (u_nid). Resolved from u_gid if absent.",
        validation_alias=alias_field("ut_data", "unit_nid"),
    )
    u_gid: Optional[str] = AliasField(
        "ut_unit", "unit_gid", None,
        description="Unit GID — used to resolve unit_nid when not provided.",
        validation_alias=alias_field("ut_unit", "unit_gid"),
    )

    # Subgroup value
    subgroup_val_nid: Optional[int] = AliasField(
        "ut_data", "subgroup_val_nid", None,
        description="Subgroup value NID (sg_nid). Resolved from sg_gid if absent.",
        validation_alias=alias_field("ut_data", "subgroup_val_nid"),
    )
    sg_gid: Optional[str] = AliasField(
        "ut_subgroup_vals", "subgroup_val_gid", None,
        description="Subgroup value GID — used to resolve subgroup_val_nid when not provided.",
        validation_alias=alias_field("ut_subgroup_vals", "subgroup_val_gid"),
    )

    # Time period
    timeperiod_nid: Optional[int] = AliasField(
        "ut_data", "timeperiod_nid", None,
        description="Time period NID (tp_nid).",
        validation_alias=alias_field("ut_data", "timeperiod_nid"),
    )

    # Area
    area_nid: Optional[int] = AliasField(
        "ut_data", "area_nid", None,
        description="Area NID (ar_nid). Resolved from ar_id if absent.",
        validation_alias=alias_field("ut_data", "area_nid"),
    )
    ar_id: Optional[str] = AliasField(
        "ut_area", "area_id", None,
        description="Area ID string — used to resolve area_nid when not provided.",
        validation_alias=alias_field("ut_area", "area_id"),
    )

    # Footnote (resolution order: fn_nid → fn_gid → fn caption)
    footnote_nid: Optional[int] = AliasField(
        "ut_data", "footnote_nid", None,
        description="Footnote NID (fn_nid). Takes precedence over fn_gid and fn.",
        validation_alias=alias_field("ut_data", "footnote_nid"),
    )
    fn_gid: Optional[str] = AliasField(
        "ut_footnote", "footnote_gid", None,
        description="Footnote GID — used to resolve fn_nid when fn_nid is absent.",
        validation_alias=alias_field("ut_footnote", "footnote_gid"),
    )
    fn: Optional[str] = Field(
        None,
        description="Footnote caption text — reused if already exists, otherwise a new footnote record is created.",
    )

    # Source / IC
    source_nid: Optional[int] = AliasField(
        "ut_data", "source_nid", None,
        description="Source/IC NID (ic_nid). Resolved from ic_gid if absent.",
        validation_alias=alias_field("ut_data", "source_nid"),
    )
    ic_gid: Optional[str] = AliasField(
        "ut_indicator_classifications", "ic_gid", None,
        description="IC GID — used to resolve source_nid when not provided.",
        validation_alias=alias_field("ut_indicator_classifications", "ic_gid"),
    )

    # Observation value — unified input; service routes to data_value or textual_data_value
    dt_value: Optional[Any] = Field(
        None,
        description=(
            "Observation value (numeric or text). "
            "Numeric → stored in data_value; non-numeric → stored in textual_data_value."
        ),
    )

    model_config = ConfigDict(populate_by_name=True)


class UnifiedDataPointUpsertItemSchema(DataUpsertItemSchema):
    """
    One row for PATCH /dw/{dw_id}/data-points (unified upsert).

    **Edit by id:** when **`data_point_id`** is set, send **`dt_value`** (or legacy value fields), optional
    **`footnote`**, optional **`data_entry_note`** only. IUS, area, time period, and source are loaded from
    the existing ``dataset_data_point`` row for the parent request's ``dataset_id``; coordinate fields in the
    JSON body are ignored.

    **Full row:** when **`data_point_id`** is omitted, use the same identifier and value conventions as
    POST /dw/{dw_id}/data (`DataUpsertItemSchema`) except footnotes: unified PATCH accepts **only** optional
    plain-text **`footnote`** (JSON key). Do not send **`fn_nid`**, **`footnote_nid`**, **`fn_gid`**,
    **`footnote_gid`**, or legacy **`fn`**.

    External aliases (`i_nid`, `u_nid`, `ar_nid`, `tp_nid`, `ic_nid`, `dt_value`, …) or internal `ut_data`
    field names; optional `i_gid` / `u_gid` / `sg_gid` / `ar_id` / `ic_gid`.

    Additionally:
    - **`ius_nid`** (`iusnid`): optional; when set, indicator / unit / subgroup are taken from that IUS row
      (you still must provide area and time period, and a value).
    - **`data_entry_note`**: dataset operator note (not written to `ut_data`).

    Backward compatibility: you may send **`data_value`** / **`textual_data_value`** (or `dt_text_value` alias)
    instead of **`dt_value`** — do not mix `dt_value` with those in the same row.
    """

    footnote_nid: Annotated[
        Optional[int],
        SkipJsonSchema(),
    ] = Field(
        None,
        description="Not accepted on unified PATCH request bodies; use JSON key `footnote` only. Remains unset from input.",
    )
    fn_gid: Annotated[
        Optional[str],
        SkipJsonSchema(),
    ] = Field(
        None,
        description="Not accepted on unified PATCH request bodies; use JSON key `footnote` only. Remains unset from input.",
    )
    fn: Optional[str] = Field(
        None,
        description="Footnote caption text; JSON key must be `footnote` (unified PATCH only).",
        validation_alias="footnote",
    )

    @model_validator(mode="before")
    @classmethod
    def _reject_disallowed_footnote_keys_on_unified_patch(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "fn_nid" in data:
            raise ValueError(
                "fn_nid is not accepted on unified PATCH /data-points; use the `footnote` key for caption text only."
            )
        if "footnote_nid" in data:
            raise ValueError(
                "footnote_nid is not accepted on unified PATCH /data-points; use the `footnote` key for caption text only."
            )
        if "fn_gid" in data:
            raise ValueError(
                "fn_gid is not accepted on unified PATCH /data-points; use the `footnote` key for caption text only."
            )
        if "footnote_gid" in data:
            raise ValueError(
                "footnote_gid is not accepted on unified PATCH /data-points; use the `footnote` key for caption text only."
            )
        if "fn" in data:
            raise ValueError(
                "fn is not accepted on unified PATCH /data-points; use the `footnote` key for caption text."
            )
        return data

    iusnid: Optional[int] = AliasField(
        "ut_data",
        "iusnid",
        None,
        description="Optional IUS NID; when set, resolves i/u/sg from ut_indicator_unit_subgroup.",
        validation_alias=alias_field("ut_data", "iusnid"),
    )

    data_entry_note: Optional[str] = Field(
        None,
        max_length=2000,
        description="Operator note stored on dataset_data_point only.",
    )
    data_point_id: Optional[int] = Field(
        None,
        description=(
            "When set: minimal edit mode — load IUS/area/time/source from this `dataset_data_point` row; "
            "body coordinate fields are ignored. Echoed on 422 validation errors for this row."
        ),
    )

    # Internal names only — do not use AliasField here: external alias for data_value is `dt_value`,
    # which would double-bind the same JSON key as parent `dt_value`.
    data_value: Optional[float] = Field(
        None,
        description="Legacy numeric value (prefer `dt_value` for POST /data parity).",
    )
    textual_data_value: Optional[str] = Field(
        None,
        description="Legacy textual value (prefer `dt_value` for non-numeric /data parity).",
    )

    @model_validator(mode="after")
    def _value_and_legacy_exclusivity(self) -> "UnifiedDataPointUpsertItemSchema":
        explicit_legacy = self.data_value is not None or self.textual_data_value is not None
        dt_set = self.dt_value is not None and self.dt_value != ""
        if explicit_legacy and dt_set:
            raise ValueError("Use either dt_value or data_value/textual_data_value, not both")
        if self.data_value is not None and self.textual_data_value is not None:
            raise ValueError("Provide only one of data_value or textual_data_value")
        if not explicit_legacy and not dt_set:
            raise ValueError(
                "Provide a non-empty observation value"
            )
        return self


class DataUpsertRequestSchema(BaseSchema):
    """Request body for POST /dw/{dw_id}/data — smart upsert."""
    action: str = Field("upsert", description="Operation type; must be 'upsert'.")
    data: List[DataUpsertItemSchema] = Field(..., min_length=1, description="List of data rows to upsert.")

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        if v != "upsert":
            raise ValueError("action must be 'upsert'")
        return v

    model_config = ConfigDict(populate_by_name=True)
