"""
Language API schemas for request/response validation (ut_language).
"""

from typing import Optional, Any, Dict

from pydantic import ConfigDict, Field, field_validator, model_validator

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema
from apps.datawarehouse.utils.alias_loader import AliasField, alias_field, create_key_validator
from apps.shared.utils.validators import normalize_language_code_value


class LanguageCreateSchema(BaseSchema):
    """Schema for creating a new language configuration in a data warehouse."""

    language_name: str = AliasField(
        "ut_language",
        "language_name",
        description="Display name (e.g., 'Hindi [hi]')",
        min_length=1,
        max_length=50,
        validation_alias=alias_field("ut_language", "language_name"),
    )
    language_code: str = AliasField(
        "ut_language",
        "language_code",
        description="ISO language code (lowercased, e.g., 'en', 'fr')",
        min_length=1,
        max_length=50,
        validation_alias=alias_field("ut_language", "language_code"),
    )
    source_lang: Optional[str] = None
    language_default: bool = AliasField(
        "ut_language",
        "language_default",
        False,
        description="Whether this language is the default for the DW",
        validation_alias=alias_field("ut_language", "language_default"),
    )
    language_globallock: bool = AliasField(
        "ut_language",
        "language_globallock",
        False,
        description="Globally locked languages cannot be updated/deleted",
        validation_alias=alias_field("ut_language", "language_globallock"),
    )

    @field_validator("language_code", mode="before")
    @classmethod
    def normalize_code(cls, v: Any) -> str:
        return normalize_language_code_value(str(v) if v is not None else "")

    @field_validator("source_lang", mode="before")
    @classmethod
    def normalize_source_lang(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        code = normalize_language_code_value(str(v))
        return code or None

    @field_validator("language_default", "language_globallock", mode="before")
    @classmethod
    def coerce_bool(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    model_config = ConfigDict(populate_by_name=True, by_alias=False)
    _validate_keys = create_key_validator("ut_language")


class LanguagePatchSchema(BaseUpdateSchema):
    """Partial update for an existing ut_language row (PATCH)."""

    language_name: Optional[str] = AliasField(
        "ut_language",
        "language_name",
        None,
        description="Display name (e.g., 'Hindi [hi]')",
        max_length=50,
        validation_alias=alias_field("ut_language", "language_name"),
    )
    language_default: Optional[bool] = AliasField(
        "ut_language",
        "language_default",
        None,
        description="When true, this row becomes the sole default language for the DW",
        validation_alias=alias_field("ut_language", "language_default"),
    )

    @field_validator("language_default", mode="before")
    @classmethod
    def coerce_optional_bool(cls, v: Any) -> Optional[bool]:
        if v is None:
            return None
        return bool(v)

    @field_validator("language_name", mode="before")
    @classmethod
    def normalize_optional_name(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        return s if s else None

    @model_validator(mode="after")
    def require_at_least_one_patch_field(self):
        if self.language_name is None and self.language_default is None:
            raise ValueError("Provide at least one of language_name or language_default")
        return self

    model_config = ConfigDict(populate_by_name=True, by_alias=False)
    _validate_keys = create_key_validator("ut_language")


class LanguageResponseSchema(BaseSchema):
    """Schema for language response."""

    language_nid: int = AliasField("ut_language", "language_nid", description="Language ID (primary key)")
    language_name: Optional[str] = AliasField("ut_language", "language_name", None, description="Language name")
    language_code: Optional[str] = AliasField("ut_language", "language_code", None, description="Language code")
    language_default: bool = AliasField("ut_language", "language_default", False, description="Is default language")
    language_globallock: bool = AliasField("ut_language", "language_globallock", False, description="Is globally locked")

    @field_validator("language_default", "language_globallock", mode="before")
    @classmethod
    def coerce_bool(cls, v: Any) -> bool:
        if v is None:
            return False
        return bool(v)

    @classmethod
    def from_record(cls, record: Any) -> Dict[str, Any]:
        return {
            "language_nid": int(getattr(record, "language_nid")),
            "language_name": getattr(record, "language_name", None),
            "language_code": getattr(record, "language_code", None),
            "language_default": bool(getattr(record, "language_default", False) or False),
            "language_globallock": bool(getattr(record, "language_globallock", False) or False),
        }

    model_config = ConfigDict(populate_by_name=True, by_alias=False)


class LanguageExportRequestSchema(BaseSchema):
    """
    Request body for POST /dw/{dw_id}/languages/export.

    Accepts camelCase keys from clients:
      - from_lang_code (optional)
      - to_lang_code (required)
    """

    from_lang_code: Optional[str] = Field(
        None,
        alias="from_lang_code",
        description=(
            "Optional source language code. When omitted, the DW default language (ut_language.language_default=1) "
            "is used if present; if no default language exists, the from-language column is skipped."
        ),
    )
    to_lang_code: str = Field(
        ...,
        alias="to_lang_code",
        description="Target language code to export (must exist in ut_language).",
        min_length=1,
    )

    @field_validator("from_lang_code", mode="before")
    @classmethod
    def normalize_from(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        code = normalize_language_code_value(str(v))
        return code or None

    @field_validator("to_lang_code", mode="before")
    @classmethod
    def normalize_to(cls, v: Any) -> str:
        return normalize_language_code_value(str(v) if v is not None else "")

    model_config = ConfigDict(populate_by_name=True)

