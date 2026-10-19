"""
Unit tests for response_filter: apply_external_response_mapping and related helpers.
"""
import pytest
from unittest.mock import patch

from apps.datawarehouse.utils.response_filter import (
    apply_external_response_mapping,
    is_external_adaptation,
)


class TestApplyExternalResponseMapping:
    """Tests for apply_external_response_mapping."""

    @patch("apps.datawarehouse.utils.response_filter.is_external_adaptation")
    def test_returns_unchanged_when_not_external(self, mock_is_external):
        """When ADAPTATION is not external, data is returned unchanged."""
        mock_is_external.return_value = False
        data = {"indicator_nid": 1, "indicator_name": "Test"}
        result = apply_external_response_mapping("INDICATOR", data)
        assert result == data

    @patch("apps.datawarehouse.utils.response_filter.is_external_adaptation")
    def test_returns_unchanged_when_unknown_entity_type(self, mock_is_external):
        """When entity type is not in mapping JSON, data is returned unchanged."""
        mock_is_external.return_value = True
        data = {"some_key": "value"}
        result = apply_external_response_mapping("UNKNOWN_ENTITY", data)
        assert result == data

    @patch("apps.datawarehouse.utils.response_filter.is_external_adaptation")
    def test_returns_unchanged_when_entity_mapping_empty(self, mock_is_external):
        """When entity type has empty mapping (e.g. DATA), data is returned unchanged."""
        mock_is_external.return_value = True
        data = {"some_key": 1}
        result = apply_external_response_mapping("DATA", data)
        assert result == data

    @patch("apps.datawarehouse.utils.response_filter.is_external_adaptation")
    def test_maps_indicator_internal_to_external(self, mock_is_external):
        """When external and INDICATOR, internal keys are mapped to external keys from JSON."""
        mock_is_external.return_value = True
        data = {
            "indicator_nid": 1,
            "indicator_gid": "GID_001",
            "indicator_name": "Test Name",
            "indicator_info": "Description",
            "short_name": "Short",
            "keywords": "k1, k2",
            "indicator_global": True,
            "indicator_order": 1.0,
            "data_exist": True,
            "highisgood": True,
            "locale": "en",
        }
        result = apply_external_response_mapping("INDICATOR", data)
        assert result.get("i_nid") == 1
        assert result.get("i_gid") == "GID_001"
        assert result.get("i_name") == "Test Name"
        assert result.get("i_description") == "Description"
        assert result.get("i_short_name") == "Short"
        assert result.get("i_keywords") == "k1, k2"
        assert result.get("i_is_global") is True
        assert result.get("i_order") == 1.0
        assert result.get("i_has_data") is True
        assert result.get("i_high_is_good") is True
        assert result.get("locale") == "en"
        # Mapped keys appear only as external names
        assert "indicator_nid" not in result
        assert "indicator_name" not in result

    @patch("apps.datawarehouse.utils.response_filter.is_external_adaptation")
    def test_maps_unit_internal_to_external(self, mock_is_external):
        """When external and UNIT, internal keys are mapped to external keys from JSON."""
        mock_is_external.return_value = True
        data = {
            "unit_nid": 1,
            "unit_gid": "U_001",
            "unit_name": "Unit Name",
            "unit_global": True,
            "unit_format": "#,##0.00",
        }
        result = apply_external_response_mapping("UNIT", data)
        assert result.get("u_nid") == 1
        assert result.get("u_gid") == "U_001"
        assert result.get("u_name") == "Unit Name"
        assert result.get("u_is_global") is True
        assert result.get("u_format") == "#,##0.00"

    @patch("apps.datawarehouse.utils.response_filter.is_external_adaptation")
    def test_includes_unmapped_keys_as_is(self, mock_is_external):
        """Unmapped keys in data are included in the result as-is."""
        mock_is_external.return_value = True
        data = {"indicator_nid": 1, "indicator_name": "Test", "extra_field": "extra"}
        result = apply_external_response_mapping("INDICATOR", data)
        assert result.get("i_nid") == 1
        assert result.get("i_name") == "Test"
        assert result.get("extra_field") == "extra"


class TestIsExternalAdaptation:
    """Tests for is_external_adaptation: missing/empty or external -> True, only internal -> False."""

    @patch("apps.datawarehouse.utils.response_filter.get_adaptation_value")
    def test_returns_true_when_adaptation_missing_or_empty(self, mock_get_adaptation):
        """When ADAPTATION is missing or empty, consider it external."""
        mock_get_adaptation.return_value = ""
        assert is_external_adaptation() is True

    @patch("apps.datawarehouse.utils.response_filter.get_adaptation_value")
    def test_returns_true_when_adaptation_external(self, mock_get_adaptation):
        """When ADAPTATION=external, returns True."""
        mock_get_adaptation.return_value = "external"
        assert is_external_adaptation() is True
        mock_get_adaptation.return_value = "EXTERNAL"
        assert is_external_adaptation() is True

    @patch("apps.datawarehouse.utils.response_filter.get_adaptation_value")
    def test_returns_false_only_when_adaptation_internal(self, mock_get_adaptation):
        """When ADAPTATION=internal (case-insensitive), returns False."""
        mock_get_adaptation.return_value = "internal"
        assert is_external_adaptation() is False
        mock_get_adaptation.return_value = "INTERNAL"
        assert is_external_adaptation() is False
