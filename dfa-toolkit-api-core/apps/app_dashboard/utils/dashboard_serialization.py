"""Serialization helpers for dashboard API responses and writes."""
from __future__ import annotations

import json
from typing import Any, Optional

from apps.shared.utils.encryption import encrypt_secret


def parse_json_field(value: Any) -> Any | None:
    """Parse a JSON column value; return None when empty or invalid."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped or stripped.lower() == "null":
            return None
        try:
            return json.loads(stripped)
        except (json.JSONDecodeError, TypeError):
            return None
    return None


def parse_json_or_raw_field(value: Any) -> Any | None:
    """Parse JSON when valid; otherwise return non-empty string as-is (e.g. HTML columns)."""
    parsed = parse_json_field(value)
    if parsed is not None:
        return parsed
    if isinstance(value, str):
        stripped = value.strip()
        if stripped and stripped.lower() != "null":
            return stripped
    return None


def bool_from_smallint(value: Any) -> bool:
    """Convert DB smallint/enum 0/1 values to bool."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value) not in ("0", "false", "False")


def redact_ai_settings(
    enable_insights: bool,
    raw: Any,
) -> dict[str, Any] | None:
    """Legacy parity: expose ai_api_key_configured, strip ai_api_key."""
    if not enable_insights:
        return parse_json_field(raw) if raw else None

    parsed = parse_json_field(raw)
    if not isinstance(parsed, dict):
        return None
    if not parsed and raw in (None, "", "{}"):
        return None

    result = dict(parsed)
    result["ai_api_key_configured"] = bool(result.get("ai_api_key"))
    result["ai_api_key"] = None
    return result


def serialize_json_column(value: Any) -> str | None:
    """Serialize a JSON column value for DB storage."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)


def bool_to_smallint(value: bool) -> int:
    """Convert bool to DB smallint 0/1."""
    return 1 if value else 0


def coerce_legacy_truthy(value: Any) -> bool:
    """Legacy PHP !empty()-style truthiness for flags sent as strings or numbers."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() not in ("0", "false", "no", "")
    return bool(value)


def is_meaningful_api_key(value: Any) -> bool:
    """True when the client supplied a real API key (not redacted or empty)."""
    if value is None:
        return False
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped or stripped in ("***", "null"):
            return False
    return True


def merge_ai_settings_for_write(
    existing_raw: str | None,
    incoming: Any,
) -> str | None:
    """
    Legacy service 104 AI settings merge before persist.

    - If ai_api_key_configured=true and ai_api_key empty → keep existing DB value.
    - Otherwise merge incoming and set ai_api_key_configured from whether key provided.
    - Encrypt ai_api_key at rest when a new key is supplied.
    """
    if incoming is None:
        return None

    ai_settings = parse_json_field(incoming)
    if not isinstance(ai_settings, dict):
        return None

    key_configured = coerce_legacy_truthy(ai_settings.get("ai_api_key_configured"))
    key_provided = is_meaningful_api_key(ai_settings.get("ai_api_key"))

    if key_configured and not key_provided:
        if existing_raw not in (None, ""):
            return existing_raw if isinstance(existing_raw, str) else json.dumps(existing_raw)
        ai_settings = {
            "ai_provider": "",
            "ai_api_key_configured": False,
            "ai_api_key": None,
        }
        return json.dumps(ai_settings)

    ai_settings = dict(ai_settings)
    ai_settings["ai_api_key_configured"] = key_provided
    if key_provided:
        ai_settings["ai_api_key"] = encrypt_secret(str(ai_settings["ai_api_key"]))
    else:
        ai_settings["ai_api_key"] = None

    return json.dumps(ai_settings)
