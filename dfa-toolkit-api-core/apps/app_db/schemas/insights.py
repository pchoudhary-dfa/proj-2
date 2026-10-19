"""
Schemas for insights API requests and responses.
"""
from typing import Any, Optional

from pydantic import BaseModel, Field


class InsightsRequestSchema(BaseModel):
    data: Any = Field(..., description="Visualization / chart payload — JSON object or JSON string")
    useCase: Optional[str] = Field(
        default="",
        description="Use case code, e.g. UC1 … UC10 (empty → UC0 general analysis)",
    )
    langCode: Optional[str] = Field(default="", description="Locale hint for the model")
    stream: Optional[bool] = Field(
        default=True,
        description="If true, response is streamed as SSE (text/event-stream)",
    )
    visualizationId: Optional[str] = Field(default=None, description="Visualization identifier")
    dashboardId: Optional[str] = Field(default=None, description="Dashboard identifier")