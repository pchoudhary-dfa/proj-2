"""
Helper for prefixing strings stored in lang/locale tables to mark them as untranslated.
"""
from __future__ import annotations

from typing import Optional

from apps.datawarehouse.constants import LANG_PREFIX


def apply_lang_prefix(value: Optional[str]) -> Optional[str]:
    """
    Prefix a string with LANG_PREFIX for storage in lang tables (indicates "not translated yet").

    - None -> None
    - Empty string -> LANG_PREFIX (so stored value is still marked)
    - Non-empty string -> LANG_PREFIX + value
    """
    if value is None:
        return None
    return LANG_PREFIX + (value if isinstance(value, str) else str(value))


def value_for_locale(
    value: Optional[str], locale: str, request_locale: str
) -> Optional[str]:
    """
    For create flows: value to store in a given locale table.
    - When locale == request_locale (the Accept-Language / default): return value as-is.
    - Otherwise: return apply_lang_prefix(value) to mark as untranslated.
    """
    if value is None:
        return None
    if locale == request_locale:
        return value if isinstance(value, str) else str(value)
    return apply_lang_prefix(value)
