"""
Unit tests for get_sso_enabled() — platform-wide SSO toggle.
"""
import pytest
from unittest.mock import MagicMock, patch

from apps.shared.packages.dfa_sso_service.core.config import (
    _SSO_CONFIG_CACHE,
    get_sso_enabled,
    invalidate_sso_config_cache,
)


@pytest.fixture(autouse=True)
def clear_cache():
    """Ensure each test starts with an empty config cache."""
    _SSO_CONFIG_CACHE.clear()
    yield
    _SSO_CONFIG_CACHE.clear()


class TestGetSsoEnabled:
    """get_sso_enabled reads DFA_CORE first, falls back to legacy per-app row."""

    @patch("apps.shared.packages.dfa_sso_service.core.config._read_system_config")
    def test_reads_from_dfa_core(self, mock_read):
        mock_read.side_effect = lambda db, ak, kc: "true" if ak == "DFA_CORE" else None
        db = MagicMock()
        assert get_sso_enabled(db, "DFA_DM") is True

    @patch("apps.shared.packages.dfa_sso_service.core.config._read_system_config")
    def test_falls_back_to_product_when_global_missing(self, mock_read):
        mock_read.side_effect = lambda db, ak, kc: "true" if ak == "DFA_VIZ" else None
        db = MagicMock()
        assert get_sso_enabled(db, "DFA_VIZ") is True

    @patch("apps.shared.packages.dfa_sso_service.core.config._read_system_config")
    def test_returns_false_when_no_row_exists(self, mock_read):
        mock_read.return_value = None
        db = MagicMock()
        assert get_sso_enabled(db, "DFA_DM") is False


class TestInvalidateSsoConfigCache:
    """invalidate_sso_config_cache clears platform-wide entries."""

    def test_clear_all(self):
        _SSO_CONFIG_CACHE[("DFA_CORE", "SSO_ENABLED")] = ("true", 0.0)
        _SSO_CONFIG_CACHE[("DFA_DM", "SSO_ENABLED")] = ("false", 0.0)
        invalidate_sso_config_cache(None)
        assert len(_SSO_CONFIG_CACHE) == 0

    def test_clear_specific_app_key(self):
        _SSO_CONFIG_CACHE[("DFA_CORE", "SSO_ENABLED")] = ("true", 0.0)
        _SSO_CONFIG_CACHE[("DFA_DM", "SSO_ENABLED")] = ("false", 0.0)
        invalidate_sso_config_cache("DFA_CORE")
        assert ("DFA_CORE", "SSO_ENABLED") not in _SSO_CONFIG_CACHE
        assert ("DFA_DM", "SSO_ENABLED") in _SSO_CONFIG_CACHE
