"""
N-gram generation utilities.

These are used for search indexing and (later) query-time tokenization.
"""

from __future__ import annotations


def generate_trigrams(normalized_text: str) -> set[str]:
    """
    Generate a set of trigrams for a *normalized* string.

    Notes:
    - Assumes input is already normalized (lowercased, ASCII folded, etc.)
    - Pads with spaces to preserve prefix/suffix similarity.
    """
    if not normalized_text:
        return set()

    # Pad with spaces so prefixes/suffixes contribute trigrams.
    padded = f"  {normalized_text}  "
    if len(padded) < 3:
        return {padded}

    return {padded[i : i + 3] for i in range(0, len(padded) - 2)}

