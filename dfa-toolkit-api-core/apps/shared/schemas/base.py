"""
Base schemas with common fields
"""
from typing import Any
from pydantic import BaseModel, ConfigDict, model_validator


class BaseSchema(BaseModel):
    """Base schema with common configuration"""
    model_config = ConfigDict(
        from_attributes=True,  # Allows conversion from ORM models
        validate_assignment=True,
        str_strip_whitespace=True,
    )


class BaseUpdateSchema(BaseSchema):
    """Base for all PATCH/update schemas. Rejects empty payloads ({})."""

    @model_validator(mode="before")
    @classmethod
    def reject_empty_payload(cls, values: Any) -> Any:
        if isinstance(values, dict) and not values:
            raise ValueError("Update payload must contain at least one field")
        return values
