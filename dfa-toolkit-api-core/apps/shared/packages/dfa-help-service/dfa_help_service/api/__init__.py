"""
API layer for DFA Help Service.
"""

from .routes import router
from .schemas import (
    AdaptationKeyRequest, KeyUpdateRequest,
    AdaptationResponse, KeyResponse, KeyDataResponse
)

__all__ = [
    "router",
    "AdaptationKeyRequest",
    "KeyUpdateRequest", 
    "AdaptationResponse",
    "KeyResponse",
    "KeyDataResponse",
]
