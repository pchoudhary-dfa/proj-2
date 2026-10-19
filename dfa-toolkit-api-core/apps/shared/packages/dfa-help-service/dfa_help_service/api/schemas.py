"""
API schemas for DFA Help Service.
"""

from typing import Optional, List, Any
from pydantic import BaseModel, Field


class AdaptationKeyRequest(BaseModel):
    """Request schema for creating adaptation keys."""
    adaptation_id: int = Field(..., description="Adaptation ID")
    parent_id: Optional[int] = Field(None, description="Parent key ID")
    title: str = Field(..., max_length=255, description="Key title")


class KeyUpdateRequest(BaseModel):
    """Request schema for updating keys."""
    id: int = Field(..., description="Key ID to update")
    code: Optional[str] = Field(None, max_length=255, description="Key code")
    desc: Optional[str] = Field(None, description="Key description")
    title: Optional[str] = Field(None, max_length=255, description="Key title")
    key: Optional[str] = Field(None, max_length=255, description="Key identifier")
    lang: str = Field(..., max_length=3, description="Language locale")
    purpose: Optional[str] = Field(None, description="Key purpose")
    related_keys: Optional[str] = Field(None, description="Related keys")


class AdaptationResponse(BaseModel):
    """Response schema for adaptations."""
    id: int
    code: str
    name: str
    desc: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class RelatedKeyResponse(BaseModel):
    """Response schema for related keys."""
    key: str
    translations: List['TranslationResponse'] = []


class KeyResponse(BaseModel):
    """Response schema for adaptation keys."""
    id: int
    adaptation_id: int
    key: Optional[str] = None
    code: Optional[str] = None
    related_keys: Optional[List[RelatedKeyResponse]] = None
    parent_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    title: Optional[str] = None
    children: Optional[List['KeyResponse']] = None


class KeyResponseWithChildren(BaseModel):
    """Response schema for keys with nested children."""
    id: int
    key: Optional[str] = None
    parent_id: Optional[int] = None
    title: Optional[str] = None
    code: Optional[str] = None
    related_keys: Optional[List[RelatedKeyResponse]] = None
    children: Optional[List['KeyResponseWithChildren']] = []


class KeyI18nResponse(BaseModel):
    """Response schema for key internationalization data."""
    id: int
    adaptation_key_id: int
    locale: str
    title: Optional[str] = None
    desc: Optional[str] = None
    purpose: Optional[str] = None


class TranslationResponse(BaseModel):
    """Response schema for translations."""
    locale: str
    title: Optional[str] = None
    desc: Optional[str] = None
    purpose: Optional[str] = None


class KeyDataDetailResponse(BaseModel):
    """Response schema for detailed key data."""
    id: int
    code: Optional[str] = None
    key: Optional[str] = None
    parentKey: Optional[str] = None
    parent_id: Optional[int] = None
    title: Optional[str] = None
    translations: List[TranslationResponse] = []
    related_keys: List[RelatedKeyResponse] = []


class KeyDetailsResponse(BaseModel):
    """Response schema for key details in delete/update responses."""
    id: int
    code: Optional[str] = None
    key: Optional[str] = None
    parent_id: Optional[int] = None
    related_keys: Optional[str] = None
    title: Optional[str] = None


class KeyDataResponse(BaseModel):
    """Response schema for detailed key data."""
    key: KeyResponse
    i18n_data: List[KeyI18nResponse]
    adaptation: AdaptationResponse


class APIResponse(BaseModel):
    """Generic API response model."""
    success: bool = Field(..., description="Operation success status")
    data: Optional[Any] = Field(None, description="Response data")
    message: Optional[str] = Field(None, description="Response message")
    error: Optional[str] = Field(None, description="Error message if any")


class StandardAPIResponse(BaseModel):
    """Standard API response model with data, message, status, and success."""
    data: Any = Field(..., description="Response data")
    message: str = Field(..., description="Response message")
    status: int = Field(..., description="HTTP status code")
    success: bool = Field(..., description="Operation success status")


class AdaptationsResponse(StandardAPIResponse):
    """Response model for adaptations endpoint."""
    data: List[AdaptationResponse]


class KeysResponse(StandardAPIResponse):
    """Response model for keys endpoint."""
    data: List[KeyResponseWithChildren]


class KeyDataDetailResponseWrapper(StandardAPIResponse):
    """Response model for key data endpoint."""
    data: KeyDataDetailResponse


class DeleteKeyResponse(StandardAPIResponse):
    """Response model for delete key endpoint."""
    data: dict = Field(..., description="Key details after deletion")


class UpdateKeyResponse(StandardAPIResponse):
    """Response model for update key endpoint."""
    data: dict = Field(..., description="Key details after update")


class ErrorResponse(BaseModel):
    """Error response schema."""
    success: bool = False
    error: str = Field(..., description="Error message")
    details: Optional[str] = Field(None, description="Additional error details")


# Update forward references
KeyResponseWithChildren.model_rebuild()
RelatedKeyResponse.model_rebuild()
