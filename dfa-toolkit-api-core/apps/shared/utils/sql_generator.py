"""
SQL Generator for filtering schema by configured available languages.
Locale-only schema: no main dimension tables; only ut_*_{lang} tables are filtered by language.
"""
from __future__ import annotations

import re
import logging
from apps.shared.utils.sql_adapter import split_sql_statements

logger = logging.getLogger(__name__)

# Locale table suffix: 2-3 letter language code (e.g. en, ar, fr, es, ru)
_LOCALE_TABLE_SUFFIX_RE = re.compile(r"^ut_.+_([a-z]{2,3})$", re.IGNORECASE)
# Only treat as locale table when suffix is a known language (avoids ut_ic_ius etc.)
_KNOWN_LOCALE_SUFFIXES = frozenset({"en", "ar", "fr", "es", "ru", "de", "pt", "zh"})


def _extract_table_name_from_statement(statement: str) -> str | None:
    """
    Extract table name from DROP TABLE or CREATE TABLE statement.
    Handles MySQL backticks and PostgreSQL double quotes.
    """
    stmt_upper = statement.strip().upper()
    if not stmt_upper.startswith("DROP TABLE") and not stmt_upper.startswith("CREATE TABLE"):
        return None
    # MySQL: `table_name` or PostgreSQL: "table_name"
    for pattern in [r"`([^`]+)`", r'"([^"]+)"']:
        m = re.search(pattern, statement)
        if m:
            return m.group(1).strip()
    return None


def _is_locale_table(table_name: str, allowed_languages: set[str] | None = None) -> str | None:
    """
    If table_name is a locale table (ut_*_{lang}) with a known language suffix,
    return the language code when allowed_languages is None or suffix in allowed_languages; else None.
    Tables like ut_ic_ius have suffix "ius" which is not a known locale, so return None (keep as non-locale).
    """
    if not table_name:
        return None
    match = _LOCALE_TABLE_SUFFIX_RE.match(table_name.strip())
    if not match:
        return None
    suffix = match.group(1).lower()
    if suffix not in _KNOWN_LOCALE_SUFFIXES:
        return None
    if allowed_languages is not None and suffix not in allowed_languages:
        return None
    return suffix


def _get_locale_suffix_if_any(table_name: str) -> str | None:
    """Return locale suffix only if table matches ut_*_xxx and xxx is a known locale; else None."""
    if not table_name:
        return None
    match = _LOCALE_TABLE_SUFFIX_RE.match(table_name.strip())
    if not match:
        return None
    suffix = match.group(1).lower()
    if suffix not in _KNOWN_LOCALE_SUFFIXES:
        return None
    return suffix


def filter_schema_by_languages(sql: str, languages: list[str]) -> str:
    """
    Filter SQL schema to keep only non-locale statements and locale table DDL
    for tables whose language suffix is in the given list.

    - Non-locale tables (e.g. ut_data, ut_language, ut_ic_ius, ut_indicator_unit_subgroup): always kept.
    - Locale tables (e.g. ut_indicator_en, ut_unit_ar): kept only if suffix in languages.

    Args:
        sql: Full schema SQL (DDL).
        languages: Allowed language codes (e.g. ['en', 'ar', 'fr']). Lowercase.

    Returns:
        Filtered SQL string.
    """
    languages_set = {lang.strip().lower() for lang in languages if lang and str(lang).strip()}
    if not languages_set:
        logger.warning("filter_schema_by_languages: no languages provided, keeping all statements")
        return sql

    logger.info(f"Filtering schema by languages: {sorted(languages_set)}")
    statements = split_sql_statements(sql)
    kept = []
    for stmt in statements:
        if not stmt or not stmt.strip():
            continue
        table_name = _extract_table_name_from_statement(stmt)
        if table_name is None:
            kept.append(stmt)
            continue
        suffix = _get_locale_suffix_if_any(table_name)
        if suffix is None:
            kept.append(stmt)
            continue
        if suffix in languages_set:
            kept.append(stmt)
        else:
            logger.debug(f"Dropping statement for locale table {table_name} (lang={suffix} not in config)")

    return "\n".join(kept) if kept else ""
