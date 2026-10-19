"""
Unit tests for platform-wide IUS_GID_SEPARATOR via DFA_CORE.
"""
import pytest
from unittest.mock import MagicMock, patch

from apps.shared.utils.ius_utils import (
    IUS_GID_SEPARATOR_KEY_CODE,
    _separator_cache,
    get_ius_gid_separator,
    invalidate_ius_gid_separator_cache,
    invalidate_ius_gid_separator_cache_for_app,
)


@pytest.fixture(autouse=True)
def clear_cache():
    _separator_cache.clear()
    yield
    _separator_cache.clear()


class TestGetIusGidSeparator:
    """get_ius_gid_separator reads DFA_CORE first, falls back to legacy per-app row."""

    @patch("apps.shared.utils.ius_utils._read_separator_from_db")
    def test_reads_from_dfa_core(self, mock_read):
        mock_read.side_effect = lambda ak: "~" if ak == "DFA_CORE" else None
        assert get_ius_gid_separator() == "~"
        mock_read.assert_called_once_with("DFA_CORE")

    @patch("apps.shared.utils.ius_utils._read_separator_from_db")
    def test_falls_back_to_product_when_global_missing(self, mock_read):
        mock_read.side_effect = lambda ak: "|" if ak == "DFA_DM" else None
        assert get_ius_gid_separator() == "|"
        assert mock_read.call_count == 2

    @patch("apps.shared.utils.ius_utils._read_separator_from_db")
    def test_returns_default_when_no_row_exists(self, mock_read):
        mock_read.return_value = None
        assert get_ius_gid_separator() == "|"


class TestInvalidateIusGidSeparatorCache:
    def test_clear_all(self):
        _separator_cache["DFA_CORE"] = "~"
        invalidate_ius_gid_separator_cache(None)
        assert len(_separator_cache) == 0

    def test_for_app_alias_clears_all(self):
        _separator_cache["DFA_CORE"] = "~"
        invalidate_ius_gid_separator_cache_for_app("DFA_DM")
        assert len(_separator_cache) == 0
