"""
Tests for sql_generator.filter_schema_by_languages (locale-only schema filtering).
"""
import pytest

from apps.shared.utils.sql_generator import (
    filter_schema_by_languages,
    _extract_table_name_from_statement,
    _is_locale_table,
)


class TestExtractTableName:
    def test_create_table_mysql(self):
        stmt = "CREATE TABLE `ut_indicator_en` ( `indicator_nid` int NOT NULL, PRIMARY KEY (`indicator_nid`) );"
        assert _extract_table_name_from_statement(stmt) == "ut_indicator_en"

    def test_create_table_postgres(self):
        stmt = 'CREATE TABLE "ut_unit_ar" ( "unit_nid" int NOT NULL, PRIMARY KEY ("unit_nid") );'
        assert _extract_table_name_from_statement(stmt) == "ut_unit_ar"

    def test_drop_table_mysql(self):
        stmt = "DROP TABLE IF EXISTS `ut_data`;"
        assert _extract_table_name_from_statement(stmt) == "ut_data"

    def test_drop_table_postgres(self):
        stmt = 'DROP TABLE IF EXISTS "ut_language";'
        assert _extract_table_name_from_statement(stmt) == "ut_language"

    def test_non_table_statement_returns_none(self):
        assert _extract_table_name_from_statement("SET NAMES utf8;") is None
        assert _extract_table_name_from_statement("INSERT INTO t VALUES (1);") is None
        assert _extract_table_name_from_statement("-- comment") is None


class TestIsLocaleTable:
    _allowed = {"en", "ar", "fr", "es", "ru"}

    def test_locale_tables(self):
        assert _is_locale_table("ut_indicator_en", self._allowed) == "en"
        assert _is_locale_table("ut_indicator_ar", self._allowed) == "ar"
        assert _is_locale_table("ut_unit_fr", self._allowed) == "fr"
        assert _is_locale_table("ut_subgroup_vals_es", self._allowed) == "es"
        assert _is_locale_table("ut_area_ru", self._allowed) == "ru"

    def test_non_locale_tables(self):
        assert _is_locale_table("ut_data", self._allowed) is None
        assert _is_locale_table("ut_language", self._allowed) is None
        assert _is_locale_table("ut_indicator_unit_subgroup", self._allowed) is None
        # ut_ic_ius matches *_xxx pattern but "ius" is not a configured language, so not locale
        assert _is_locale_table("ut_ic_ius", self._allowed) is None
        assert _is_locale_table("ut_timeperiod", self._allowed) is None


class TestFilterSchemaByLanguages:
    def test_keeps_non_locale_tables(self):
        sql = """
        DROP TABLE IF EXISTS `ut_data`;
        CREATE TABLE `ut_data` ( `id` int );
        DROP TABLE IF EXISTS `ut_language`;
        CREATE TABLE `ut_language` ( `lang` varchar(10) );
        """
        result = filter_schema_by_languages(sql, ["en"])
        assert "ut_data" in result
        assert "ut_language" in result

    def test_keeps_only_configured_locale_tables(self):
        sql = """
        DROP TABLE IF EXISTS `ut_indicator_en`;
        CREATE TABLE `ut_indicator_en` ( `indicator_nid` int PRIMARY KEY );
        DROP TABLE IF EXISTS `ut_indicator_ar`;
        CREATE TABLE `ut_indicator_ar` ( `indicator_nid` int PRIMARY KEY );
        DROP TABLE IF EXISTS `ut_indicator_fr`;
        CREATE TABLE `ut_indicator_fr` ( `indicator_nid` int PRIMARY KEY );
        """
        result = filter_schema_by_languages(sql, ["en", "ar"])
        assert "ut_indicator_en" in result
        assert "ut_indicator_ar" in result
        assert "ut_indicator_fr" not in result

    def test_empty_languages_keeps_all(self):
        sql = """
        CREATE TABLE `ut_indicator_en` ( `indicator_nid` int );
        CREATE TABLE `ut_indicator_fr` ( `indicator_nid` int );
        """
        result = filter_schema_by_languages(sql, [])
        # No filtering when no languages configured: full SQL returned
        assert "ut_indicator_en" in result
        assert "ut_indicator_fr" in result

    def test_mixed_locale_and_non_locale(self):
        sql = """
        CREATE TABLE `ut_data` ( `id` int );
        CREATE TABLE `ut_indicator_en` ( `indicator_nid` int );
        CREATE TABLE `ut_indicator_fr` ( `indicator_nid` int );
        CREATE TABLE `ut_language` ( `lang` varchar(10) );
        """
        result = filter_schema_by_languages(sql, ["en"])
        assert "ut_data" in result
        assert "ut_language" in result
        assert "ut_indicator_en" in result
        assert "ut_indicator_fr" not in result

    def test_case_insensitive_language_match(self):
        sql = """
        CREATE TABLE `ut_indicator_en` ( `indicator_nid` int );
        CREATE TABLE `ut_indicator_FR` ( `indicator_nid` int );
        """
        result = filter_schema_by_languages(sql, ["EN", "fr"])
        assert "ut_indicator_en" in result
        assert "ut_indicator_FR" in result
