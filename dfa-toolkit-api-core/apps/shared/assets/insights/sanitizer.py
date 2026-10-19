"""
Sanitize insights payload: useCase normalization and string cleanup in data trees.
Mirrors CakePHP PayloadSanitizer behavior at a high level.
"""
import json
import re
from typing import Any

_HTML_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def normalize_use_case(raw: Any) -> str:
    if raw is None:
        return ""
    s = str(raw).strip().upper()
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s


def _clean_str(value: str) -> str:
    text = _HTML_RE.sub(" ", value)
    text = _WS_RE.sub(" ", text).strip()
    return text


def sanitize_data_leaf(value: Any) -> Any:
    if isinstance(value, str):
        return _clean_str(value)
    if isinstance(value, dict):
        return {k: sanitize_data_leaf(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_data_leaf(v) for v in value]
    return value


def parse_data_field(data: Any) -> Any:
    """Accept dict/list or JSON string (optional ``data: `` prefix)."""
    if data is None:
        return None
    if isinstance(data, (dict, list)):
        return sanitize_data_leaf(data)
    if isinstance(data, str):
        s = data.strip()
        if s.lower().startswith("data:"):
            s = s[5:].strip()
        try:
            parsed = json.loads(s)
        except (json.JSONDecodeError, TypeError):
            return _clean_str(data)
        return sanitize_data_leaf(parsed)
    return data


def sanitize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    out = dict(payload)
    out["useCase"] = normalize_use_case(out.get("useCase"))
    out["data"] = parse_data_field(out.get("data"))
    return out
