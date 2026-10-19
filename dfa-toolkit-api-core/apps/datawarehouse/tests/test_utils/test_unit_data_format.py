"""Tests for unit_data_format formatting helpers."""
from apps.datawarehouse.utils.unit_data_format import (
    clear_unit_format_catalog_cache,
    enrich_unit_format_catalog_for_client,
    filter_catalog_for_selectable,
    format_data_value,
    format_numeric_value,
    format_value_by_unit_format_code,
    get_formatting_enabled_codes,
    is_unit_format_formatting_enabled,
)


def test_format_integer():
    assert format_value_by_unit_format_code(1234.0, "INTEGER") == "1,234"
    assert (
        format_data_value(
            data_value=1234.0,
            textual_data_value=None,
            istextualdata=False,
            unit_format_code="INTEGER",
        )
        == "1,234"
    )


def test_format_decimal():
    assert format_value_by_unit_format_code(1234.56, "DECIMAL") == "1,234.56"


def test_format_percentage():
    assert format_value_by_unit_format_code(25.0, "PERCENTAGE") == "25%"


def test_format_usd():
    assert format_value_by_unit_format_code(1234.0, "USD") == "$1,234.00"


def test_format_inr():
    assert format_value_by_unit_format_code(1234.0, "INR") == "₹1,234.00"


def test_format_compact():
    assert format_value_by_unit_format_code(1200.0, "COMPACT") == "1.2K"
    assert format_value_by_unit_format_code(3_400_000.0, "COMPACT") == "3.4M"


def test_format_jpy_zero_decimals():
    assert format_value_by_unit_format_code(1234.0, "JPY") == "¥1,234"


def test_format_kwd_three_decimals():
    assert format_value_by_unit_format_code(1234.0, "KWD") == "د.ك1,234.000"


def test_format_textual_passthrough():
    assert (
        format_data_value(
            data_value=None,
            textual_data_value="N/A",
            istextualdata=True,
            unit_format_code="USD",
        )
        == "N/A"
    )


def test_format_no_unit_format_defaults():
    assert format_value_by_unit_format_code(99.5, "") == "99.50"


def test_format_numeric_value_by_code_only():
    assert format_numeric_value(1234.0, {"code": "USD", "label": "US Dollar"}) == "$1,234.00"


def test_formatting_disabled_falls_back_to_plain_decimal():
    catalog = {
        "number_formats": ["USD"],
        "currencies": ["USD"],
        "formatting_enabled": [],
    }
    clear_unit_format_catalog_cache()
    get_formatting_enabled_codes(catalog)
    assert not is_unit_format_formatting_enabled("USD", catalog)
    assert format_value_by_unit_format_code(1234.0, "USD") == "1,234.00"
    clear_unit_format_catalog_cache()


def test_formatting_enabled_only_listed_codes():
    catalog = {
        "number_formats": ["INTEGER", "USD"],
        "currencies": ["USD", "INR"],
        "formatting_enabled": ["INTEGER", "INR"],
    }
    clear_unit_format_catalog_cache()
    get_formatting_enabled_codes(catalog)
    assert is_unit_format_formatting_enabled("INTEGER", catalog)
    assert is_unit_format_formatting_enabled("INR", catalog)
    assert not is_unit_format_formatting_enabled("USD", catalog)
    assert format_value_by_unit_format_code(1234.0, "USD") == "1,234.00"
    assert format_value_by_unit_format_code(1234.0, "INR") == "₹1,234.00"
    assert format_value_by_unit_format_code(1234.0, "INTEGER") == "1,234"
    clear_unit_format_catalog_cache()


def test_formatting_enabled_absent_means_all_enabled():
    catalog = {
        "number_formats": ["INTEGER"],
        "currencies": ["USD"],
    }
    clear_unit_format_catalog_cache()
    enabled = get_formatting_enabled_codes(catalog)
    assert enabled == frozenset({"INTEGER", "USD"})
    clear_unit_format_catalog_cache()


def test_enrich_catalog_adds_currency_symbols():
    catalog = {
        "version": 4,
        "number_formats": ["INTEGER"],
        "currencies": ["USD", {"code": "INR"}, "XXX"],
        "formatting_enabled": ["INTEGER", "USD"],
    }
    enriched = enrich_unit_format_catalog_for_client(catalog)
    assert enriched["number_formats"] == ["INTEGER"]
    assert enriched["formatting_enabled"] == ["INTEGER", "USD"]
    assert enriched["currencies"] == [
        {"code": "USD", "symbol": "$"},
        {"code": "INR", "symbol": "₹"},
        {"code": "XXX", "symbol": "XXX"},
    ]


def test_filter_catalog_for_selectable():
    catalog = {
        "version": 4,
        "number_formats": ["INTEGER", "DECIMAL"],
        "currencies": ["USD", "EUR", "INR"],
        "formatting_enabled": ["INTEGER", "USD", "INR"],
    }
    clear_unit_format_catalog_cache()
    filtered = filter_catalog_for_selectable(catalog)
    assert filtered["number_formats"] == ["INTEGER"]
    assert filtered["currencies"] == ["USD", "INR"]
    assert "formatting_enabled" not in filtered
    clear_unit_format_catalog_cache()
