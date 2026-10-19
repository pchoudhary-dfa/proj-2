"""
Helpers for serializing request bodies and headers into logs_server_error.

The middleware buffers raw bytes onto request.state.cached_body and stashes the raw
header list on request.state.cached_headers. The helpers here decode, optionally
redact, and cap the output for storage in TEXT columns.
"""
from __future__ import annotations

import json
from typing import Any, Iterable, Optional, Sequence, Union

DEFAULT_REDACT_KEYS: frozenset[str] = frozenset(
    {
        "password",
        "old_password",
        "current_password",
        "new_password",
        "refresh_token",
        "access_token",
        "token",
        "secret",
        "api_key",
        "db_password",
        "db_user",
    }
)

_REDACTED = "***"
_TRUNCATED_SUFFIX = "...[truncated]"

# Hard ceiling on the serialized headers JSON written to logs_server_error.request_headers.
# Comfortably above any realistic header set (typically 1-2 KB) while staying well below
# the TEXT column limit.
_HEADERS_MAX_BYTES = 16384

HeaderItem = Union[tuple[bytes, bytes], tuple[str, str]]


def _redact(obj: Any, redact_keys: Iterable[str]) -> Any:
    """Walk a JSON-decoded tree and replace any value whose key is in redact_keys."""
    redact_lower = {k.lower() for k in redact_keys}
    if isinstance(obj, dict):
        return {
            k: (_REDACTED if isinstance(k, str) and k.lower() in redact_lower else _redact(v, redact_keys))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact(item, redact_keys) for item in obj]
    return obj


def serialize_body_for_log(
    raw: Optional[bytes],
    *,
    max_bytes: int = 8192,
    redact_keys: Iterable[str] = DEFAULT_REDACT_KEYS,
) -> Optional[str]:
    """
    Serialize a buffered request body into a redacted, capped string for storage.

    - None / empty input -> None.
    - Non-UTF-8 bytes -> "<non-utf8 N bytes>" marker.
    - Valid JSON -> recursively redacted, compact JSON string.
    - Invalid JSON -> truncated raw text with a [truncated] suffix when over max_bytes.
    - Result capped at max_bytes with a [truncated] suffix when over.
    """
    if not raw:
        return None

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return f"<non-utf8 {len(raw)} bytes>"

    try:
        decoded = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        if len(text) > max_bytes:
            return text[: max(0, max_bytes - len(_TRUNCATED_SUFFIX))] + _TRUNCATED_SUFFIX
        return text

    redacted = _redact(decoded, redact_keys)
    out = json.dumps(redacted, separators=(",", ":"), ensure_ascii=False)
    if len(out) > max_bytes:
        return out[: max(0, max_bytes - len(_TRUNCATED_SUFFIX))] + _TRUNCATED_SUFFIX
    return out


def _decode_header_part(value: Any) -> str:
    """Decode a header name or value: bytes via latin-1, anything else via str()."""
    if isinstance(value, bytes):
        try:
            return value.decode("latin-1")
        except UnicodeDecodeError:
            return value.decode("latin-1", errors="replace")
    return str(value)


def serialize_headers_for_log(
    headers: Optional[Sequence[HeaderItem]],
) -> Optional[str]:
    """
    Build a JSON object string from the raw ASGI ``scope["headers"]`` list.

    - None / empty -> None.
    - Duplicate header names are joined with ", " (HTTP RFC 7230 list rule).
    - Names are normalised to lowercase (ASGI already lowercases incoming headers).
    - Bytes values are decoded via latin-1 (HTTP transport encoding).
    - NO redaction performed. Caller controls security.
    - Result capped at the module-level header cap with a "...[truncated]" suffix
      when over (defensive; realistic header sets are well under).
    """
    if not headers:
        return None

    merged: dict[str, str] = {}
    for item in headers:
        if not item:
            continue
        try:
            name_raw, value_raw = item
        except (TypeError, ValueError):
            continue
        name = _decode_header_part(name_raw).lower()
        value = _decode_header_part(value_raw)
        if name in merged:
            merged[name] = f"{merged[name]}, {value}"
        else:
            merged[name] = value

    if not merged:
        return None

    out = json.dumps(merged, separators=(",", ":"), ensure_ascii=False)
    if len(out) > _HEADERS_MAX_BYTES:
        return out[: max(0, _HEADERS_MAX_BYTES - len(_TRUNCATED_SUFFIX))] + _TRUNCATED_SUFFIX
    return out
