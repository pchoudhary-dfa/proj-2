"""
Centralized alias management for Pydantic schemas.
Loads aliases from JSON once at module import time for zero runtime overhead.
"""
import json
import os
from typing import Dict, List, Optional, Any, Set, Callable
from functools import lru_cache
from pydantic import Field as PydanticField, model_validator

_MAPPING_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "config",
    "db_tbl_cols_mapping.json"
)


@lru_cache(maxsize=1)
def _load_alias_mapping() -> Dict[str, Dict[str, str]]:
    """
    Load and cache alias mapping from JSON (called once at import).
    
    Returns:
        Dict mapping entity types to field aliases
        Example: {"ut_indicator": {"indicator_name": "i_name", ...}, ...}
    """
    if not os.path.exists(_MAPPING_PATH):
        return {}
    
    with open(_MAPPING_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _resolve_mapping_key(entity_type: str) -> str:
    """
    Resolve entity_type to the key used in db_tbl_cols_mapping.json.
    JSON uses keys like ut_area, ut_indicator, ut_unit; callers may pass AREA, INDICATOR, UNIT.
    """
    mapping = _load_alias_mapping()
    if entity_type in mapping:
        return entity_type
    alt = "ut_" + entity_type.lower()
    return alt if alt in mapping else entity_type


def get_adaptation_for_validation() -> str:
    """
    Return ADAPTATION value for key-format validation (internal vs external).
    Tests can patch this to force internal keys without touching settings.
    """
    from apps.shared.config.config import settings
    return getattr(settings, "ADAPTATION", "").strip().lower()


def get_alias(entity_type: str, internal_field: str) -> Optional[str]:
    """
    Get external alias for an internal field name.
    
    Args:
        entity_type: Entity type (e.g., "INDICATOR", "UNIT")
        internal_field: Internal field name (e.g., "indicator_name")
    
    Returns:
        External alias (e.g., "i_name") or None if no mapping exists
    
    Example:
        >>> get_alias("INDICATOR", "indicator_name")
        "i_name"
    """
    mapping = _load_alias_mapping()
    key = _resolve_mapping_key(entity_type)
    entity_map = mapping.get(key, {})
    return entity_map.get(internal_field)


def alias_field(entity_type: str, internal_field: str) -> str:
    """
    Get alias or return field name itself (for use in Field()).
    
    Returns the alias if exists, otherwise returns the internal field name.
    This allows fields without mappings to use their internal name as alias.
    
    Example:
        >>> alias_field("INDICATOR", "indicator_name")
        "i_name"
        >>> alias_field("INDICATOR", "unmapped_field")
        "unmapped_field"
    """
    alias = get_alias(entity_type, internal_field)
    return alias if alias is not None else internal_field


def AliasField(
    entity_type: str,
    internal_name: str,
    default: Any = ...,
    **kwargs
) -> Any:
    """
    Create a Pydantic Field with automatic alias lookup from JSON.
    
    This is a convenience wrapper that combines Field() with alias_field().
    
    Args:
        entity_type: Entity type (e.g., "INDICATOR")
        internal_name: Internal field name (e.g., "indicator_name")
        default: Default value for the field
        **kwargs: All other Field() parameters (description, min_length, etc.)
    
    Returns:
        Pydantic Field with serialization_alias set from JSON mapping
    
    Example:
        indicator_name: str = AliasField(
            "INDICATOR", "indicator_name",
            description="Indicator name",
            min_length=1,
            max_length=255
        )
        # Equivalent to:
        # indicator_name: str = Field(
        #     ...,
        #     description="Indicator name",
        #     min_length=1,
        #     max_length=255,
        #     serialization_alias="i_name"
        # )
    """
    return PydanticField(
        default=default,
        serialization_alias=alias_field(entity_type, internal_name),
        **kwargs
    )


def get_external_to_internal_mapping(entity_type: str) -> Dict[str, str]:
    """
    Get mapping from external (alias) keys to internal keys for an entity.

    JSON stores internal_key -> external_key. This returns external_key -> internal_key
    so that dicts using external keys can be normalized for model_validate().

    Args:
        entity_type: Entity type (e.g. "AREA", "ut_area", "INDICATOR")

    Returns:
        Dict mapping external key -> internal key, e.g. {"ar_nid": "area_nid", ...}
    """
    mapping = _load_alias_mapping()
    key = _resolve_mapping_key(entity_type)
    entity_map = mapping.get(key, {})
    return {external: internal for internal, external in entity_map.items()}


def get_internal_to_external_mapping(entity_type: str) -> Dict[str, str]:
    """
    Internal column / schema key -> external API alias from db_tbl_cols_mapping.json
    (same key order as stored in the JSON for that entity).
    """
    mapping = _load_alias_mapping()
    key = _resolve_mapping_key(entity_type)
    entity_map = mapping.get(key, {})
    return dict(entity_map)


def map_dict_internal_to_external_for_entities(
    data: Dict[str, Any],
    *entity_types: str,
) -> Dict[str, Any]:
    """
    When ADAPTATION is not ``internal``, rewrite keys using merged internal→external
    mappings for the given entities (later entity types override on key collision).

    Keys with no mapping pass through unchanged (e.g. already-external keys).

    Used by import/batch code that builds payloads with internal field names while
    AreaCreateSchema key validation expects external keys under ADAPTATION=external.
    """
    if get_adaptation_for_validation() == "internal":
        return dict(data)
    merged: Dict[str, str] = {}
    for et in entity_types:
        merged.update(get_internal_to_external_mapping(et))
    return {merged.get(k, k): v for k, v in data.items()}


def get_allowed_keys(entity_type: str, use_internal: bool) -> Set[str]:
    """
    Get the set of allowed keys for an entity based on ADAPTATION mode.
    
    Args:
        entity_type: Entity type (e.g., "INDICATOR", "UNIT")
        use_internal: If True, return internal keys; if False, return external keys
    
    Returns:
        Set of allowed key names
    
    Example:
        >>> get_allowed_keys("INDICATOR", use_internal=True)
        {"indicator_name", "indicator_gid", "indicator_nid", ...}
        >>> get_allowed_keys("INDICATOR", use_internal=False)
        {"i_name", "i_gid", "i_nid", ...}
    """
    mapping = _load_alias_mapping()
    key = _resolve_mapping_key(entity_type)
    entity_map = mapping.get(key, {})

    if use_internal:
        # Return internal keys (left side of mapping)
        return set(entity_map.keys())
    else:
        # Return external keys (right side of mapping)
        return set(entity_map.values())


def create_key_validator(entity_type: str) -> Callable:
    """
    Factory function to create a reusable validator for enforcing key format.
    
    This validator enforces that incoming data uses ONLY the keys allowed
    by the current ADAPTATION setting (internal vs external).
    
    Args:
        entity_type: Entity type (e.g., "INDICATOR", "UNIT")
    
    Returns:
        A Pydantic model_validator decorator function
    
    Example:
        class IndicatorCreateSchema(BaseSchema):
            indicator_name: str = AliasField("INDICATOR", "indicator_name")
            # ... other fields
            
            _validate_keys = create_key_validator("INDICATOR")
    
    Usage in Schema:
        - If ADAPTATION="internal", only accepts: {"indicator_name": "GDP", ...}
        - If ADAPTATION="external", only accepts: {"i_name": "GDP", ...}
        - Rejects mixed or wrong format with clear error message
    """
    @model_validator(mode='before')
    @classmethod
    def validate_key_format(cls, data: Any) -> Any:
        """
        Validate that incoming data uses the correct key format based on ADAPTATION.
        
        Raises:
            ValueError: If data contains keys from the wrong format
        """
        if not isinstance(data, dict):
            return data
        # Tests can skip key-format check by setting DFA_TEST_INTERNAL_KEYS=1 (same process only)
        if os.environ.get("DFA_TEST_INTERNAL_KEYS") == "1":
            return data

        # Determine which format to enforce (uses get_adaptation_for_validation, patchable in tests)
        adaptation = get_adaptation_for_validation()
        use_internal = (adaptation == "internal")
        
        # Get allowed keys for this entity and mode
        allowed_keys = get_allowed_keys(entity_type, use_internal)
        
        # Reject keys that are from the wrong format (in forbidden but not in
        # allowed). This allows extra schema-only keys (e.g. "values" on SUBGROUP_CATEGORY)
        # and handles entities where some names appear in both (e.g. TIMEPERIOD).
        forbidden_keys = get_allowed_keys(entity_type, not use_internal)
        incoming_keys = set(data.keys())
        invalid_keys = (incoming_keys & forbidden_keys) - allowed_keys

        if invalid_keys:
            raise ValueError(
                f"Invalid key format detected."
            )
        
        return data
    
    return validate_key_format


def create_key_validator_multi(entity_types: List[str]) -> Callable:
    """
    Factory function to create a reusable validator for enforcing key format
    across multiple entity types (e.g. METADATA_CATEGORY + METADATA_REPORT).

    Same behavior as create_key_validator but builds allowed/forbidden key sets
    as the union of keys from all given entity types.

    Args:
        entity_types: List of entity types (e.g. ["METADATA_CATEGORY", "METADATA_REPORT"])

    Returns:
        A Pydantic model_validator decorator function
    """
    @model_validator(mode='before')
    @classmethod
    def validate_key_format(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if os.environ.get("DFA_TEST_INTERNAL_KEYS") == "1":
            return data

        adaptation = get_adaptation_for_validation()
        use_internal = (adaptation == "internal")

        allowed_keys = set()
        forbidden_keys = set()
        for et in entity_types:
            allowed_keys |= get_allowed_keys(et, use_internal)
            forbidden_keys |= get_allowed_keys(et, not use_internal)

        incoming_keys = set(data.keys())
        invalid_keys = (incoming_keys & forbidden_keys) - allowed_keys

        if invalid_keys:
            raise ValueError("Invalid key format detected.")

        return data

    return validate_key_format

