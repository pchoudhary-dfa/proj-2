"""
Serialization mode utility for ADAPTATION environment variable support.
"""
from apps.shared.config.config import settings


def get_serialization_mode() -> dict:
    """
    Return Pydantic model_dump kwargs based on ADAPTATION env var.
    
    - ADAPTATION="internal" → {"by_alias": False} → indicator_nid, indicator_name
    - ADAPTATION="external" or empty → {"by_alias": True} → i_nid, i_name
    
    Returns:
        Dict with by_alias parameter for model_dump()
    
    Example:
        schema.model_dump(**get_serialization_mode())
    """
    adaptation = getattr(settings, "ADAPTATION", "").strip().lower()
    return {"by_alias": adaptation != "internal"}


