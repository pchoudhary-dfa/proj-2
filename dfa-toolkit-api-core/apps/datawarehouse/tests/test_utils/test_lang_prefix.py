"""
Unit tests for lang_prefix: apply_lang_prefix helper.
"""
import pytest

from apps.datawarehouse.constants import LANG_PREFIX
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix


class TestApplyLangPrefix:
    """Tests for apply_lang_prefix."""

    def test_none_returns_none(self):
        """None input returns None."""
        assert apply_lang_prefix(None) is None

    def test_empty_string_returns_prefix_only(self):
        """Empty string returns LANG_PREFIX only."""
        assert apply_lang_prefix("") == LANG_PREFIX

    def test_non_empty_string_returns_prefixed(self):
        """Non-empty string returns prefix + value."""
        assert apply_lang_prefix("x") == f"{LANG_PREFIX}x"
        assert apply_lang_prefix("My Name") == f"{LANG_PREFIX}My Name"

    def test_prefix_value(self):
        """LANG_PREFIX is # (hardcoded for untranslated marker)."""
        assert LANG_PREFIX == "#"
        assert apply_lang_prefix("Foo") == "#Foo"
