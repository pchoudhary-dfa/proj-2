"""
Data models and schemas for DFA Help Service.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, validator


class AdaptationBase(BaseModel):
    """Base model for Adaptation."""
    code: str = Field(..., max_length=10, description="Unique adaptation code")
    name: str = Field(..., max_length=255, description="Adaptation name")
    desc: str = Field(..., description="Adaptation description")


class AdaptationCreate(AdaptationBase):
    """Model for creating a new Adaptation."""
    pass


class AdaptationUpdate(BaseModel):
    """Model for updating an Adaptation."""
    code: Optional[str] = Field(None, max_length=10)
    name: Optional[str] = Field(None, max_length=255)
    desc: Optional[str] = Field(None)


class Adaptation(AdaptationBase):
    """Model for Adaptation."""
    id: int = Field(..., description="Unique identifier")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    deleted_at: Optional[datetime] = Field(None, description="Deletion timestamp")

    class Config:
        from_attributes = True


class AdaptationKeyBase(BaseModel):
    """Base model for AdaptationKey."""
    adaptation_id: int = Field(..., description="Reference to adaptation")
    key: Optional[str] = Field(None, max_length=255, description="Unique key identifier")
    code: Optional[str] = Field(None, max_length=255, description="Key code")
    related_keys: Optional[str] = Field(None, description="Related keys as JSON string")
    parent_id: Optional[int] = Field(None, description="Parent key reference")


class AdaptationKeyCreate(AdaptationKeyBase):
    """Model for creating a new AdaptationKey."""
    pass


class AdaptationKeyUpdate(BaseModel):
    """Model for updating an AdaptationKey."""
    adaptation_id: Optional[int] = Field(None)
    key: Optional[str] = Field(None, max_length=255)
    code: Optional[str] = Field(None, max_length=255)
    related_keys: Optional[str] = Field(None)
    parent_id: Optional[int] = Field(None)


class AdaptationKey(AdaptationKeyBase):
    """Model for AdaptationKey."""
    id: int = Field(..., description="Unique identifier")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    deleted_at: Optional[datetime] = Field(None, description="Deletion timestamp")

    class Config:
        from_attributes = True


class AdaptationKeyI18nBase(BaseModel):
    """Base model for AdaptationKeyI18n."""
    adaptation_key_id: int = Field(..., description="Reference to adaptation key")
    locale: str = Field(..., max_length=3, description="Language locale code")
    title: Optional[str] = Field(None, max_length=255, description="Localized title")
    desc: Optional[str] = Field(None, description="Localized description")
    purpose: Optional[str] = Field(None, description="Localized purpose")


class AdaptationKeyI18nCreate(AdaptationKeyI18nBase):
    """Model for creating a new AdaptationKeyI18n."""
    pass


class AdaptationKeyI18nUpdate(BaseModel):
    """Model for updating an AdaptationKeyI18n."""
    adaptation_key_id: Optional[int] = Field(None)
    locale: Optional[str] = Field(None, max_length=3)
    title: Optional[str] = Field(None, max_length=255)
    desc: Optional[str] = Field(None)
    purpose: Optional[str] = Field(None)


class AdaptationKeyI18n(AdaptationKeyI18nBase):
    """Model for AdaptationKeyI18n."""
    id: int = Field(..., description="Unique identifier")

    class Config:
        from_attributes = True


class KeyUpdatePayload(BaseModel):
    """Payload for updating key data."""
    id: int = Field(..., description="Key ID to update")
    code: Optional[str] = Field(None, max_length=255)
    desc: Optional[str] = Field(None)
    title: Optional[str] = Field(None, max_length=255)
    key: Optional[str] = Field(None, max_length=255)
    lang: str = Field(..., max_length=3, description="Language locale")
    purpose: Optional[str] = Field(None)
    related_keys: Optional[str] = Field(None)

    @validator('lang')
    def validate_lang(cls, v):
        """Validate language locale."""
        valid_locales = ['en', 'fr', 'es', 'ar', 'pt', 'ru']
        if v not in valid_locales:
            raise ValueError(f'Invalid locale. Must be one of: {valid_locales}')
        return v


class KeyCreatePayload(BaseModel):
    """Payload for creating a new key."""
    adaptation_id: int = Field(..., description="Adaptation ID")
    parent_id: Optional[int] = Field(None, description="Parent key ID")
    title: str = Field(..., max_length=255, description="Key title")


class KeyDataResponse(BaseModel):
    """Response model for key data."""
    key: AdaptationKey
    i18n_data: List[AdaptationKeyI18n]
    adaptation: Adaptation


class APIResponse(BaseModel):
    """Generic API response model."""
    success: bool = Field(..., description="Operation success status")
    data: Optional[Any] = Field(None, description="Response data")
    message: Optional[str] = Field(None, description="Response message")
    error: Optional[str] = Field(None, description="Error message if any")
