"""
Schemas for indicator validation rules (iu_validation, iu_validation_enum, iu_validation_enum_i18n).
"""
from decimal import Decimal
from typing import Dict, List, Literal, Optional

from pydantic import Field, model_validator

from apps.shared.schemas.base import BaseSchema

_VALIDATION_TYPES = Literal["NUM", "TEXT", "ENUM"]


class ValidationEnumOptionSchema(BaseSchema):
    """One enum option as returned in a GET response."""

    option_code: str
    labels: Dict[str, Optional[str]] = Field(
        default_factory=dict,
        description="Labels keyed by every language_code registered in the data warehouse (ut_language); value null if no i18n row.",
    )
    score: Optional[Decimal] = None
    display_order: Optional[int] = None
    is_active: bool = True


class ValidationRuleSchema(BaseSchema):
    """Single validation rule for one (indicator_gid, unit_gid) combination."""
    unit_gid: Optional[str] = None
    validation_type: _VALIDATION_TYPES
    min_value: Optional[Decimal] = None
    max_value: Optional[Decimal] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    options: List[ValidationEnumOptionSchema] = Field(default_factory=list)


class ValidationRuleUpsertOptionSchema(BaseSchema):
    """One enum option supplied in a PATCH payload."""
    option_code: str = Field(..., max_length=50)
    label: Optional[str] = Field(
        None,
        max_length=255,
        description=(
            "Single-locale label when ``labels`` is omitted. For a new option_code, written to "
            "all DW locales (ut_language). For an existing option_code, only the request header "
            "language is updated."
        ),
    )
    labels: Optional[Dict[str, Optional[str]]] = Field(
        None,
        description=(
            "Per-locale labels. When set, overrides ``label`` for those locales. "
            "Null removes i18n for that locale; empty string stores a blank label."
        ),
    )
    score: Optional[Decimal] = Field(None)
    display_order: Optional[int] = Field(0)
    is_active: Optional[bool] = Field(True)


class ValidationRuleUpsertSchema(BaseSchema):
    """
    Payload for PATCH /indicators/{identifier}/validation-rules.
    Applies the same rule to every (indicator, unit_gid) combination.
    Pass an empty unit_gids list to delete all validation rules for the indicator.
    """
    unit_gids: List[str] = Field(
        ...,
        description="Unit GIDs to upsert rules for. Pass an empty list to delete all rules for this indicator.",
    )
    validation_type: _VALIDATION_TYPES = Field(..., description="NUM, TEXT, or ENUM")
    min_value: Optional[Decimal] = Field(None, description="Minimum value (NUM only)")
    max_value: Optional[Decimal] = Field(None, description="Maximum value (NUM only)")
    min_length: Optional[int] = Field(None, description="Minimum length (TEXT only)")
    max_length: Optional[int] = Field(None, description="Maximum length (TEXT only)")
    options: List[ValidationRuleUpsertOptionSchema] = Field(
        default_factory=list,
        description="Enum options (ENUM only)",
    )

    @model_validator(mode="after")
    def validate_type_fields(self) -> "ValidationRuleUpsertSchema":
        if not self.unit_gids:
            return self
        if self.validation_type == "ENUM" and not self.options:
            raise ValueError("options must not be empty when validation_type is ENUM")
        if self.validation_type != "ENUM" and self.options:
            raise ValueError("options should only be provided when validation_type is ENUM")
        if self.validation_type == "ENUM":
            for opt in self.options:
                code = (opt.option_code or "").strip()
                if not code:
                    raise ValueError("each enum option must have a non-empty option_code")
                if opt.labels is not None:
                    if not any(
                        v is not None and str(v).strip() != "" for v in opt.labels.values()
                    ):
                        raise ValueError(
                            f"enum option {opt.option_code!r}: at least one non-empty label "
                            "is required when using labels map"
                        )
                else:
                    if opt.label is None or str(opt.label).strip() == "":
                        raise ValueError(
                            f"enum option {opt.option_code!r}: label is required when labels is omitted"
                        )
        return self
