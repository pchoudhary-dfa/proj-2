"""
Text utilities intended to be reused across the codebase.

This module is deliberately dependency-free (no external transliteration libs).
"""

from __future__ import annotations

import re
import unicodedata

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(value: str | None) -> str:
    """
    Normalize free-text for search:
    - Convert to string (None -> "")
    - Unicode NFKD normalize
    - Strip diacritics by ASCII-folding (best-effort)
    - Lowercase
    - Collapse whitespace
    - Strip leading/trailing whitespace
    """
    if not value:
        return ""

    # Unicode normalize then best-effort ASCII fold.
    normalized = unicodedata.normalize("NFKD", value)
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower()
    normalized = _WHITESPACE_RE.sub(" ", normalized).strip()
    return normalized

