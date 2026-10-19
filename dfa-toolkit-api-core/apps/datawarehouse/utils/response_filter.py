"""
Response key mapping for ADAPTATION=external (internal field names -> external aliases).
Used by routers to transform response dicts when ADAPTATION is not "internal".
Uses db_tbl_cols_mapping.json for entity key mapping (via alias_loader).
"""
from typing import Dict, Any

from apps.shared.config.config import settings


def get_adaptation_value() -> str:
    """Return ADAPTATION env value, stripped. Used by is_external_adaptation."""
    return getattr(settings, "ADAPTATION", "") or ""


def is_external_adaptation() -> bool:
    """
    True when ADAPTATION is missing, empty, or "external"; False only when "internal".
    When True, responses should use external key names from db_tbl_cols_mapping.json.
    """
    adaptation = get_adaptation_value().strip().lower()
    return adaptation != "internal"


def apply_external_response_mapping(entity_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    When ADAPTATION is external, map internal keys to external aliases per entity type.
    Unmapped keys are left as-is. When not external, returns data unchanged.
    """
    if not is_external_adaptation():
        return dict(data)

    from apps.datawarehouse.utils.alias_loader import get_alias

    result = {}
    for k, v in data.items():
        alias = get_alias(entity_type, k)
        result[alias if alias is not None else k] = v
    return result
