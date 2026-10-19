"""
Shared utility for filtering meta response fields across all datawarehouse APIs.
Uses META_RESPONSE_FIELDS and META_FIELD_ENTITY_MAP from constants to ensure
only allowed fields are included in meta.ic, meta.unit, meta.sg, meta.indicator, meta.metadata.
"""
from typing import Any, Dict

from apps.datawarehouse.constants import (
    META_FIELD_ENTITY_MAP,
    META_RESPONSE_FIELDS,
)
from apps.datawarehouse.utils.alias_loader import get_alias


def filter_meta_entity_fields(entity_dict: Dict[str, Any], meta_key: str) -> Dict[str, Any]:
    """
    Return only fields allowed by META_RESPONSE_FIELDS for the given meta key.
    Uses internal field names; resolves to alias keys when the dict uses them
    (e.g. when by_alias serialization is used).

    Used by: indicator (list/get), IUS (list/get), indicator_classification (list IUS/IU),
    and any other API that returns meta with ic, unit, sg, indicator, or metadata.

    Args:
        entity_dict: Single entity as dict (e.g. one unit, one indicator, one sg).
        meta_key: Key in META_RESPONSE_FIELDS: "ic", "indicator", "unit", "sg", "metadata".

    Returns:
        Dict with only allowed keys (internal or alias, depending on entity_dict keys).
    """
    allowed_internal = META_RESPONSE_FIELDS.get(meta_key)
    if not allowed_internal:
        return entity_dict
    allowed_set = set(allowed_internal)
    if not any(k in allowed_set for k in entity_dict):
        allowed_set = set()
        entity_map = META_FIELD_ENTITY_MAP.get(meta_key)
        for field in allowed_internal:
            if isinstance(entity_map, str):
                alias = get_alias(entity_map, field)
            else:
                pair = entity_map.get(field) if isinstance(entity_map, dict) else None
                if pair:
                    alias = get_alias(pair[0], pair[1])
                else:
                    alias = field
            if alias:
                allowed_set.add(alias)
    return {k: v for k, v in entity_dict.items() if k in allowed_set}
