"""
Format ut_data numeric/text values by per-unit unit_format code.

Catalog JSON (UNIT_DATA_FORMAT_CATALOG) holds format codes only; UI labels come from translations.
Formatting rules live in unit_format_registry (number formats + ISO 4217 currencies).
"""
from __future__ import annotations

import json
import math
from typing import Any, Optional

from sqlalchemy.orm import Session

from apps.app_db.db.core import SessionLocal
from apps.app_db.models.core import SystemConfiguration
from apps.datawarehouse.models.datawarehouse import Unit, get_default_locale
from apps.datawarehouse.utils.unit_format_registry import (
    get_currency_format,
    is_currency_format_code,
    is_number_format_code,
)
from apps.shared.config.config import settings


def _catalog_currency_code(entry: Any) -> Optional[str]:
    if isinstance(entry, str):
        code = entry.strip().upper()
        return code or None
    if isinstance(entry, dict):
        code = str(entry.get("code") or "").strip().upper()
        return code or None
    return None


def enrich_unit_format_catalog_for_client(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Add display metadata (currency symbols) for GET /app-config responses.
    Persisted UNIT_DATA_FORMAT_CATALOG remains codes-only; symbols come from unit_format_registry.
    """
    currencies: list[dict[str, str]] = []
    seen: set[str] = set()
    for entry in raw.get("currencies") or []:
        code = _catalog_currency_code(entry)
        if not code or code in seen:
            continue
        seen.add(code)
        item: dict[str, str] = {"code": code}
        spec = get_currency_format(code)
        if spec and spec.get("symbol"):
            item["symbol"] = spec["symbol"]
        currencies.append(item)

    enriched: dict[str, Any] = {
        "version": raw.get("version", 4),
        "number_formats": raw.get("number_formats") or [],
        "currencies": currencies,
    }
    if "formatting_enabled" in raw:
        enriched["formatting_enabled"] = raw["formatting_enabled"]
    return enriched


UNIT_DATA_FORMAT_CATALOG_KEY = "UNIT_DATA_FORMAT_CATALOG"

_CATALOG_CACHE: Optional[dict[str, dict[str, Any]]] = None
_FORMATTING_ENABLED_CACHE: Optional[frozenset[str]] = None


def clear_unit_format_catalog_cache() -> None:
    global _CATALOG_CACHE, _FORMATTING_ENABLED_CACHE
    _CATALOG_CACHE = None
    _FORMATTING_ENABLED_CACHE = None


def load_unit_format_catalog_from_db(app_key: Optional[str] = None) -> dict[str, Any]:
    """Load catalog JSON from system_configuration (application scope, DFA_DM)."""
    app_key = app_key or settings.DFA_DM_APP_KEY
    db = SessionLocal()
    try:
        row = (
            db.query(SystemConfiguration.key_value)
            .filter(
                SystemConfiguration.app_key == app_key,
                SystemConfiguration.key_code == UNIT_DATA_FORMAT_CATALOG_KEY,
            )
            .first()
        )
        if not row or not row.key_value:
            return {"number_formats": [], "currencies": []}
        return json.loads(row.key_value)
    except (json.JSONDecodeError, TypeError):
        return {"number_formats": [], "currencies": []}
    finally:
        db.close()


def _catalog_codes(raw: dict[str, Any]) -> set[str]:
    codes: set[str] = set()
    for bucket in ("number_formats", "currencies"):
        for entry in raw.get(bucket) or []:
            if isinstance(entry, str):
                code = entry.strip().upper()
                if code:
                    codes.add(code)
                continue
            if isinstance(entry, dict):
                code = str(entry.get("code") or "").strip().upper()
                if code:
                    codes.add(code)
    return codes


def get_formatting_enabled_codes(
    catalog: Optional[dict[str, Any]] = None,
) -> frozenset[str]:
    """
    Codes for which unit_format rules are applied when formatting data values.
    When ``formatting_enabled`` is absent, all catalog codes are enabled (legacy behavior).
    """
    global _FORMATTING_ENABLED_CACHE
    if _FORMATTING_ENABLED_CACHE is None:
        raw = catalog if catalog is not None else load_unit_format_catalog_from_db()
        enabled_raw = raw.get("formatting_enabled")
        if enabled_raw is None:
            _FORMATTING_ENABLED_CACHE = frozenset(_catalog_codes(raw))
        elif isinstance(enabled_raw, list):
            _FORMATTING_ENABLED_CACHE = frozenset(
                str(c).strip().upper() for c in enabled_raw if c and str(c).strip()
            )
        else:
            _FORMATTING_ENABLED_CACHE = frozenset(_catalog_codes(raw))
    return _FORMATTING_ENABLED_CACHE


def is_unit_format_formatting_enabled(
    code: str,
    catalog: Optional[dict[str, Any]] = None,
) -> bool:
    normalized = str(code or "").strip().upper()
    if not normalized:
        return True
    return normalized in get_formatting_enabled_codes(catalog)


def _normalize_catalog_bucket_entry(entry: Any) -> Optional[str]:
    return _catalog_currency_code(entry)


def filter_catalog_for_selectable(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Client-facing catalog: only enabled format codes in ``number_formats`` / ``currencies``.
    ``formatting_enabled`` is omitted (lists are already restricted).
    """
    enabled = get_formatting_enabled_codes(raw)

    def _filter_bucket(bucket: str) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for entry in raw.get(bucket) or []:
            code = _normalize_catalog_bucket_entry(entry)
            if not code or code not in enabled or code in seen:
                continue
            seen.add(code)
            out.append(code)
        return out

    filtered: dict[str, Any] = {
        "version": raw.get("version", 4),
        "number_formats": _filter_bucket("number_formats"),
        "currencies": _filter_bucket("currencies"),
    }
    return filtered


def validate_selectable_unit_format_code(code: Optional[str]) -> None:
    """Raise BadRequest when ``code`` is set but not in formatting_enabled."""
    from apps.shared.exceptions import BadRequest

    normalized = str(code or "").strip().upper()
    if not normalized:
        return
    if not is_unit_format_formatting_enabled(normalized):
        raise BadRequest(
            f"Unit format code '{normalized}' is not enabled",
            error_code="UNIT_FORMAT_NOT_ENABLED",
            details={"unit_format": normalized},
        )


def get_unit_format_catalog_index(
    catalog: Optional[dict[str, Any]] = None,
) -> dict[str, dict[str, Any]]:
    """Code (upper) → catalog entry (code only); cached per process. Used for UI lookups."""
    global _CATALOG_CACHE
    if _CATALOG_CACHE is None:
        raw = catalog if catalog is not None else load_unit_format_catalog_from_db()
        index: dict[str, dict[str, Any]] = {}
        for bucket in ("number_formats", "currencies"):
            for entry in raw.get(bucket) or []:
                if isinstance(entry, str):
                    code = entry.strip().upper()
                    if code:
                        index[code] = {"code": code}
                    continue
                if not isinstance(entry, dict):
                    continue
                code = str(entry.get("code") or "").strip().upper()
                if code:
                    index[code] = {"code": code}
        _CATALOG_CACHE = index
    return _CATALOG_CACHE


def _format_grouped_number(value: float, decimal_places: int, use_grouping: bool) -> str:
    if decimal_places < 0:
        decimal_places = 0
    rounded = round(value, decimal_places)
    if decimal_places == 0:
        body = str(int(round(rounded)))
    else:
        body = f"{rounded:.{decimal_places}f}"
    if not use_grouping:
        return body
    sign = "-" if rounded < 0 else ""
    abs_body = body.lstrip("-")
    if "." in abs_body:
        int_part, frac_part = abs_body.split(".", 1)
    else:
        int_part, frac_part = abs_body, ""
    grouped = f"{int(int_part):,}" if int_part else "0"
    if frac_part:
        grouped = f"{grouped}.{frac_part}"
    return sign + grouped


def _format_compact(value: float, decimal_places: int) -> str:
    sign = "-" if value < 0 else ""
    n = abs(value)
    for threshold, suffix in (
        (1e12, "T"),
        (1e9, "B"),
        (1e6, "M"),
        (1e3, "K"),
    ):
        if n >= threshold:
            scaled = n / threshold
            s = f"{scaled:.{max(0, decimal_places)}f}".rstrip("0").rstrip(".")
            return f"{sign}{s}{suffix}"
    return _format_grouped_number(value, decimal_places, use_grouping=False)


def format_value_by_unit_format_code(value: float, code: str) -> str:
    """
    Format a numeric value using hardcoded rules for the given catalog code.
    Unknown codes fall back to grouped decimal (2 places).
    """
    normalized = str(code or "").strip().upper()
    if not normalized:
        return _format_grouped_number(value, 2, use_grouping=True)

    if not is_unit_format_formatting_enabled(normalized):
        return _format_grouped_number(value, 2, use_grouping=True)

    if normalized == "INTEGER":
        return _format_grouped_number(value, 0, use_grouping=True)
    if normalized == "DECIMAL":
        return _format_grouped_number(value, 2, use_grouping=True)
    if normalized == "PERCENTAGE":
        return f"{_format_grouped_number(value, 0, use_grouping=False)}%"
    if normalized == "SCIENTIFIC":
        return f"{value:.2E}"
    if normalized == "COMPACT":
        return _format_compact(value, 1)

    if is_currency_format_code(normalized):
        spec = get_currency_format(normalized)
        if spec:
            symbol = spec["symbol"]
            decimal_places = int(spec["decimal_places"])
            position = str(spec.get("symbol_position") or "before").strip().lower()
            body = _format_grouped_number(value, decimal_places, use_grouping=True)
            if position == "after":
                return f"{body}{symbol}"
            return f"{symbol}{body}"

    if is_number_format_code(normalized):
        return _format_grouped_number(value, 2, use_grouping=True)

    return _format_grouped_number(value, 2, use_grouping=True)


def format_numeric_value(value: float, entry: dict[str, Any]) -> str:
    """Backward-compatible wrapper: formats by entry code only."""
    code = str(entry.get("code") or "").strip().upper()
    return format_value_by_unit_format_code(value, code)


def format_data_value(
    *,
    data_value: Optional[float],
    textual_data_value: Optional[str],
    istextualdata: bool,
    unit_format_code: Optional[str],
    catalog_index: Optional[dict[str, dict[str, Any]]] = None,
) -> Optional[str]:
    """
    Return display string for one observation, or None when empty.
    Textual rows return textual_data_value unchanged.
    catalog_index is ignored (kept for call-site compatibility).
    """
    del catalog_index
    if istextualdata:
        if textual_data_value is None:
            return None
        text = str(textual_data_value).strip()
        return text if text else None
    if data_value is None:
        return None
    try:
        num = float(data_value)
    except (TypeError, ValueError):
        return None
    if math.isnan(num) or math.isinf(num):
        return str(data_value)

    return format_value_by_unit_format_code(num, str(unit_format_code or ""))


def _row_unit_nid(row: dict[str, Any]) -> Optional[int]:
    """Resolve unit NID from internal or external (u_nid) keys."""
    raw = row.get("unit_nid")
    if raw is None:
        raw = row.get("u_nid")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def fetch_unit_formats_by_nid(
    dw_db: Session,
    locale: str,
    unit_nids: list[int],
) -> dict[int, Optional[str]]:
    """
    Load unit_format per unit_nid.

    Format codes are warehouse-global (same as GET /units: read from the default-locale
    ``ut_unit_<default>`` row, not the request display locale).
    """
    if not unit_nids:
        return {}
    format_locale = get_default_locale(dw_db)
    UnitLocale = Unit(format_locale)
    rows = (
        dw_db.query(UnitLocale.unit_nid, UnitLocale.unit_format)
        .filter(UnitLocale.unit_nid.in_(unit_nids))
        .all()
    )
    out: dict[int, Optional[str]] = {}
    for nid, fmt in rows:
        if fmt is None or str(fmt).strip() == "":
            out[int(nid)] = None
        else:
            out[int(nid)] = str(fmt).strip()
    return out


def enrich_rows_with_formatted_data_values(
    rows: list[dict[str, Any]],
    *,
    dw_db: Session,
    locale: str,
    catalog_index: Optional[dict[str, dict[str, Any]]] = None,
) -> None:
    """
    Mutates each row: sets unit_format and formatted_data_value when unit_nid is present.
    Optional: approved_value/approved_textual_value → formatted_approved_value;
    prev_tmprd_* → formatted_prev_tmprd_value.
    """
    del catalog_index
    if not rows:
        return
    unit_nids = list(
        {nid for r in rows if (nid := _row_unit_nid(r)) is not None}
    )
    fmt_by_nid = fetch_unit_formats_by_nid(dw_db, locale, unit_nids)

    for row in rows:
        u_nid_int = _row_unit_nid(row)
        if u_nid_int is None:
            row.setdefault("unit_format", None)
            row.setdefault("formatted_data_value", None)
            continue
        unit_fmt = fmt_by_nid.get(u_nid_int)
        row["unit_format"] = unit_fmt

        istext = bool(row.get("istextualdata"))
        row["formatted_data_value"] = format_data_value(
            data_value=row.get("data_value"),
            textual_data_value=row.get("textual_data_value"),
            istextualdata=istext,
            unit_format_code=unit_fmt,
        )

        if "approved_value" in row or "approved_textual_value" in row:
            atv = row.get("approved_textual_value")
            av = row.get("approved_value")
            approved_is_text = atv is not None and (av is None)
            row["formatted_approved_value"] = format_data_value(
                data_value=av,
                textual_data_value=atv,
                istextualdata=approved_is_text,
                unit_format_code=unit_fmt,
            )

        if "prev_tmprd_data_value" in row or "prev_tmprd_textual_data_value" in row:
            row["formatted_prev_tmprd_value"] = format_data_value(
                data_value=row.get("prev_tmprd_data_value"),
                textual_data_value=row.get("prev_tmprd_textual_data_value"),
                istextualdata=bool(row.get("prev_tmprd_textual_data_value")),
                unit_format_code=unit_fmt,
            )


def enrich_published_data_rows(
    rows: list[dict[str, Any]],
    *,
    dw_db: Session,
    locale: str,
    catalog_index: Optional[dict[str, dict[str, Any]]] = None,
) -> None:
    """Published report rows use dt_value / dt_text_value / dt_is_textual keys."""
    del catalog_index
    if not rows:
        return
    unit_nids = list({int(r["u_nid"]) for r in rows if r.get("u_nid") is not None})
    fmt_by_nid = fetch_unit_formats_by_nid(dw_db, locale, unit_nids)

    for row in rows:
        u_nid = row.get("u_nid")
        if u_nid is None:
            row.setdefault("u_format", None)
            row.setdefault("formatted_dt_value", None)
            continue
        unit_fmt = fmt_by_nid.get(int(u_nid))
        row["u_format"] = unit_fmt
        is_text = bool(row.get("dt_is_textual"))
        row["formatted_dt_value"] = format_data_value(
            data_value=row.get("dt_value"),
            textual_data_value=row.get("dt_text_value"),
            istextualdata=is_text,
            unit_format_code=unit_fmt,
        )
