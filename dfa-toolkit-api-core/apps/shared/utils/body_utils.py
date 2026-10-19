"""
Shared utilities for request body handling (e.g. single vs array normalization).
"""
from typing import List, TypeVar, Union

T = TypeVar("T")


def normalize_to_list(value: Union[T, List[T]]) -> List[T]:
    """
    Normalize a request body that may be either a single object or an array to a list.
    Use this when an endpoint accepts both shapes (single item or array of items).

    - If value is already a list, return it unchanged.
    - Otherwise treat value as a single item and return [value].

    Example:
        # In router: body can be Union[Schema, List[Schema]]
        items = normalize_to_list(body)
        if not items:
            raise BadRequest("Body must be a non-empty object or array")
        results = service.create_batch(items)
    """
    if isinstance(value, list):
        return value
    return [value]
