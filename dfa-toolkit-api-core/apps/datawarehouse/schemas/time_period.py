"""
Time Period API schemas for request/response validation.
API response: id (timeperiod_nid), timeperiod, startdate, enddate, periodicity
"""
from enum import Enum
from typing import Optional, List, Any, Dict
from pydantic import Field, ConfigDict, model_validator

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import AliasField, create_key_validator, alias_field
from apps.datawarehouse.utils.time_period_format import validate_timeperiod_for_periodicity


class PeriodicityEnum(str, Enum):
    """Allowed periodicity values (aligned with datamanager). Stored as single-letter code."""

    A = "A"  # Annually
    M = "M"  # Monthly
    Q = "Q"  # Quarterly
    H = "H"  # Half-yearly
    D = "D"  # Daily
    F = "F"  # Fortnightly


class TimePeriodCreateSchema(BaseSchema):
    """Schema for creating a time period - accepts both formats"""
    timeperiod: str = AliasField(
        "ut_timeperiod", "timeperiod",
        description="Time period value (required, unique, max 30 chars)", min_length=1, max_length=30,
        validation_alias=alias_field("ut_timeperiod", "timeperiod"),
    )
    periodicity: Optional[PeriodicityEnum] = AliasField(
        "ut_timeperiod", "periodicity", None,
        description="Periodicity: one of A, M, Q, H, D, F (Annually, Monthly, Quarterly, Half-yearly, Daily, Fortnightly)",
        validation_alias=alias_field("ut_timeperiod", "periodicity"),
    )

    @model_validator(mode="after")
    def validate_timeperiod_encoded_format(self) -> "TimePeriodCreateSchema":
        """When periodicity is set, timeperiod must match the strict format for that code."""
        if self.periodicity is not None:
            validate_timeperiod_for_periodicity(self.timeperiod, self.periodicity.value)
        return self

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_timeperiod")


class TimePeriodUpdateSchema(BaseUpdateSchema):
    """Schema for updating a time period (partial): timeperiod and/or periodicity only."""
    timeperiod: Optional[str] = AliasField(
        "ut_timeperiod", "timeperiod", None,
        description="Time period value (max 30 chars, must remain unique)", max_length=30,
        validation_alias=alias_field("ut_timeperiod", "timeperiod"),
    )
    periodicity: Optional[PeriodicityEnum] = AliasField(
        "ut_timeperiod", "periodicity", None,
        description="Periodicity: one of A, M, Q, H, D, F (Annually, Monthly, Quarterly, Half-yearly, Daily, Fortnightly)",
        validation_alias=alias_field("ut_timeperiod", "periodicity"),
    )

    @model_validator(mode="after")
    def validate_timeperiod_encoded_format_when_both_set(self) -> "TimePeriodUpdateSchema":
        """When both timeperiod and periodicity are in the payload, enforce encoded format."""
        if self.timeperiod is not None and self.periodicity is not None:
            validate_timeperiod_for_periodicity(self.timeperiod, self.periodicity.value)
        return self

    model_config = ConfigDict(populate_by_name=True)
    _validate_keys = create_key_validator("ut_timeperiod")


class TimePeriodMultipleDeleteSchema(BaseSchema):
    """Request body for bulk delete time periods."""
    identifier: List[str] = Field(..., description="List of time period identifiers (id or timeperiod value)")


class TimePeriodAssociationCountRequestSchema(BaseSchema):
    """Request body for association count (delete confirmation)."""
    identifier: List[str] = Field(..., description="List of time period identifiers (id or timeperiod value)")


class TimePeriodResponseSchema(BaseSchema):
    """Schema for time period response - aliases loaded from JSON"""
    timeperiod_nid: int = AliasField("ut_timeperiod", "timeperiod_nid", description="Time period NID")
    timeperiod: str = AliasField("ut_timeperiod", "timeperiod", description="Time period value")
    startdate: Optional[str] = AliasField("ut_timeperiod", "startdate", None, description="Start date")
    enddate: Optional[str] = AliasField("ut_timeperiod", "enddate", None, description="End date")
    periodicity: Optional[str] = AliasField("ut_timeperiod", "periodicity", None, description="Periodicity")

    @model_validator(mode="before")
    @classmethod
    def normalize_timeperiod_keys(cls, data: Any) -> Any:
        """Accept external key 'id' or 'tp_nid' as timeperiod_nid for validation."""
        if not isinstance(data, dict):
            return data
        out = dict(data)
        if "timeperiod_nid" not in out and "id" in data:
            out["timeperiod_nid"] = data["id"]
        if "timeperiod_nid" not in out and "tp_nid" in data:
            out["timeperiod_nid"] = data["tp_nid"]
        return out

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        """Build dict from TimePeriod ORM record using schema field names (single source of truth). timeperiod_nid mapped from DB; dates serialized to ISO."""
        startdate = getattr(record, "startdate", None)
        enddate = getattr(record, "enddate", None)
        return {
            "timeperiod_nid": int(getattr(record, "timeperiod_nid")),
            "timeperiod": str(getattr(record, "timeperiod", None) or ""),
            "startdate": startdate.isoformat() if startdate else None,
            "enddate": enddate.isoformat() if enddate else None,
            "periodicity": str(record.periodicity) if getattr(record, "periodicity", None) is not None else None,
        }
