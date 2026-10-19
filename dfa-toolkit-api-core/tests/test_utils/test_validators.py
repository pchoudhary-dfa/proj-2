"""
Unit tests for shared validators (e.g. normalize_language_code).
Uses Arrange-Act-Assert and descriptive test names.
"""
import pytest

from apps.shared.utils.validators import normalize_language_code


class TestNormalizeLanguageCode:
    """Tests for normalize_language_code from Accept-Language header."""

    def test_none_returns_en(self) -> None:
        # Arrange: no header
        accept_language = None
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "en"

    def test_empty_string_returns_en(self) -> None:
        # Arrange
        accept_language = ""
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "en"

    def test_simple_code_returns_lowercase(self) -> None:
        # Arrange
        accept_language = "en"
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "en"

    def test_uppercase_code_normalized_to_lowercase(self) -> None:
        # Arrange
        accept_language = "EN"
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "en"

    def test_locale_with_region_extracts_primary(self) -> None:
        # Arrange: en-US -> en
        accept_language = "en-US"
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "en"

    def test_complex_header_uses_first_language(self) -> None:
        # Arrange: "en,fr;q=0.9" -> first is "en"
        accept_language = "en,fr;q=0.9"
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "en"

    def test_complex_header_with_region_uses_first_primary(self) -> None:
        # Arrange
        accept_language = "fr-FR,en;q=0.8"
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "fr"

    def test_whitespace_around_first_code_stripped(self) -> None:
        # Arrange
        accept_language = "  fr  "
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "fr"

    def test_three_letter_code_preserved(self) -> None:
        # Arrange: e.g. "fil" for Filipino
        accept_language = "fil"
        # Act
        result = normalize_language_code(accept_language)
        # Assert
        assert result == "fil"
