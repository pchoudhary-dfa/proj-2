"""
Validation utility functions
"""
import re
import uuid
from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar

T = TypeVar("T")


def normalize_language_code_value(language_code: Optional[str]) -> str:
    """
    Normalize an already-extracted language code (e.g. from header or param).
    Use when you have a single code string; for Accept-Language header use normalize_language_code.

    Args:
        language_code: Language code string (e.g. "en", "EN", "en-US")

    Returns:
        Normalized code: lowercase, stripped; default "en" if empty/None.
    """
    if not language_code:
        return "en"
    return language_code.lower().strip()


def resolve_identifier_to_nid(
    identifier: str,
    get_nid_by_gid: Callable[[str], Optional[int]],
) -> Optional[int]:
    """
    Resolve an identifier (numeric NID or alphanumeric GID) to an entity NID.

    If identifier is all digits, returns int(identifier). Otherwise calls
    get_nid_by_gid(identifier) to look up by GID.

    Args:
        identifier: Path/query identifier (e.g. "123" or "IND_001").
        get_nid_by_gid: Callable that takes a GID string and returns NID or None.

    Returns:
        Resolved NID, or None if not numeric and GID lookup returns None.
    """
    if identifier.isdigit():
        return int(identifier)
    return get_nid_by_gid(identifier)


def normalize_language_code(accept_language: Optional[str]) -> str:
    """
    Extract and normalize language code from Accept-Language header.
    
    Args:
        accept_language: Accept-Language header value (e.g., "en", "en-US", "en,fr;q=0.9")
        
    Returns:
        Normalized language code (e.g., "en")
    """
    if not accept_language:
        return 'en'
    
    # Extract first language code (format: "en" or "en-US" -> "en")
    language_code = accept_language.split(',')[0].strip().split('-')[0].lower()
    return language_code


def validate_language_code(language_code: str, available_languages: List[str]) -> bool:
    """
    Validate that language code is in the list of available languages.
    
    Args:
        language_code: Language code to validate
        available_languages: List of allowed language codes
        
    Returns:
        True if valid, False otherwise
        
    Raises:
        ValueError: If language code is not in allowed list
    """
    normalized_code = language_code.lower().strip()
    if normalized_code not in available_languages:
        raise ValueError(
            f"Language code '{language_code}' is not allowed. "
            f"Available languages: {', '.join(available_languages)}"
        )
    return True


def validate_indicator_gid_pattern(gid: str) -> bool:
    """
    Validate indicator GID pattern.
    Pattern: Alphanumeric only (a-z, A-Z, 0-9)
    Minimum length: 5 characters
    Maximum length: 60 characters
    
    Args:
        gid: GID to validate
        
    Returns:
        True if valid pattern, False otherwise
    """
    # Check min/max length
    if len(gid) < 5:
        return False
    if len(gid) > 60:
        return False
    
    # Pattern: alphanumeric only (no special characters)
    pattern = r"^[a-zA-Z0-9]+$"
    return bool(re.match(pattern, gid))


def validate_unit_gid_guid(gid: str) -> bool:
    """
    Validate unit GID format (matches reference app datamanager_v5).
    Accepts alphanumeric characters plus special characters: $ @ _ - { }
    Pattern: /^[0-9a-zA-Z$@_-{}]+$/
    Max length: 60 characters.

    Args:
        gid: GID to validate

    Returns:
        True if valid GID format and length <= 60, False otherwise
    """
    if not gid or len(gid) > 60:
        return False
    # Pattern: alphanumeric plus special chars $ @ _ - { } (same as validate_guid / reference app)
    pattern = r'^[0-9a-zA-Z$@_\-{}]+$'
    return bool(re.match(pattern, gid))


def validate_guid(gid: str) -> bool:
    """
    Validate GID format for area_gid.
    Accepts alphanumeric characters plus special characters: $ @ _ - { }
    Pattern matches the reference app (same character set as unit GID).
    Max length: 60 characters.

    Args:
        gid: GID to validate

    Returns:
        True if valid GID format and length <= 60, False otherwise
    """
    if not gid or len(gid) > 60:
        return False
    # Pattern: alphanumeric plus special chars: $ @ _ - { }
    pattern = r'^[0-9a-zA-Z$@_\-{}]+$'
    return bool(re.match(pattern, gid))


def generate_guid() -> str:
    """
    Generate a GUID for indicator GID if not provided.
    
    Returns:
        UUID string
    """
    return str(uuid.uuid4())


def validate_identifier_type_consistency(
    items: List[T],
    get_identifier: Callable[[T], str],
    item_label: str = "identifier",
    classify: Optional[Callable[[str], Any]] = None,
) -> Tuple[List[T], List[Dict[str, Any]]]:
    """
    Ensure all items use the same identifier type as the first item. Items that
    deviate are excluded and described in the returned errors list.

    Args:
        items: List of objects (Pydantic models, dicts, etc.)
        get_identifier: Callable that extracts the identifier string from one item.
        item_label: Field name used in error messages (e.g. "mt_catg_identifier").
        classify: Optional callable that maps an identifier string to a type label.
            Defaults to nid/gid classification via str.isdigit().

    Returns:
        Tuple of (valid_items, errors). valid_items preserves the first item and all
        subsequent items whose identifier type matches. errors contains one dict per
        skipped item with keys "index" (0-based position in original list) and "error".
    """
    if not items:
        return [], []

    _classify: Callable[[str], Any] = classify or (lambda s: "nid" if s.isdigit() else "gid")

    first_id = get_identifier(items[0]).strip()
    first_type = _classify(first_id)

    valid_items: List[T] = [items[0]]
    errors: List[Dict[str, Any]] = []

    for idx, item in enumerate(items[1:], start=1):
        item_id = get_identifier(item).strip()
        item_type = _classify(item_id)
        if item_type != first_type:
            errors.append({
                "index": idx,
                "error": (
                    f"{item_label}='{item_id}': identifier type mismatch — "
                    f"expected '{first_type}' (as per first item '{first_id}'), "
                    f"got '{item_type}'. Skipped."
                ),
            })
        else:
            valid_items.append(item)

    return valid_items, errors
