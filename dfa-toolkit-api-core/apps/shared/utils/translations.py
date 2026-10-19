import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


_TRANSLATIONS_DIR = Path(__file__).resolve().parents[1] / "translations"


def _normalize_locale(locale: Optional[str]) -> str:
    if not locale:
        return "en"
    locale = str(locale).strip().lower().replace("_", "-")
    return (locale.split("-")[0] or "en").strip() or "en"


@lru_cache(maxsize=32)
def _load_translations(locale: str) -> Dict[str, Any]:
    """
    Load a flat JSON dictionary from apps/shared/translations/<locale>.json.
    Falls back to en.json if locale file doesn't exist or isn't a dict.
    """
    normalized = _normalize_locale(locale)
    path = _TRANSLATIONS_DIR / f"{normalized}.json"
    if not path.exists():
        path = _TRANSLATIONS_DIR / "en.json"

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = {}

    if isinstance(data, dict):
        return data

    # Last-resort fallback
    if normalized != "en":
        return _load_translations("en")
    return {}


def t(key: str, locale: Optional[str] = None, default: Optional[str] = None) -> str:
    """
    Translate a single key using apps/shared/translations/<locale>.json.

    - If key exists in locale file, returns the translated string.
    - Else falls back to en.json.
    - Else returns `default` if provided, otherwise returns `key`.
    """
    if key is None:
        return default or ""

    normalized = _normalize_locale(locale)
    key_str = str(key)

    data = _load_translations(normalized)
    val = data.get(key_str)
    if isinstance(val, str) and val:
        return val

    if normalized != "en":
        data_en = _load_translations("en")
        val_en = data_en.get(key_str)
        if isinstance(val_en, str) and val_en:
            return val_en

    return default if default is not None else key_str


def t_list(keys: Iterable[str], locale: Optional[str] = None) -> List[str]:
    """Translate a list/iterable of keys."""
    return [t(k, locale=locale) for k in keys]

