"""
Database metadata API schemas.
"""
from pydantic import BaseModel, Field


class DbMetadataUpdateSchema(BaseModel):
    """Schema for updating database metadata description."""
    
    description: str = Field(
        ..., 
        description="Database description text for the specified language",
        min_length=1,
        max_length=1000,
        example="Updated database description for English locale"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "description": "Updated database description for English locale"
            }
        }