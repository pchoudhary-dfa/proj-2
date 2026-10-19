from __future__ import annotations

import re
from collections.abc import Iterable

from apps.datawarehouse.services.search_index.readers import (
    AreaSourceRow,
    IndicatorSourceRow,
    SubgroupSourceRow,
    TimePeriodSourceRow,
)
from apps.datawarehouse.services.search_index.types import KeywordType, SearchKeywordRow, SynonymType
from apps.shared.utils.text import normalize_text

MAX_LANGUAGE_CODE_LEN = 3
MAX_TEXT_LEN = 255
MAX_NGRAM_LEN = 10

_SPLIT_KEYWORDS_RE = re.compile(r"[,\n;|]+")


def clamp(value: str, max_len: int) -> str:
    if len(value) <= max_len:
        return value
    return value[:max_len]


def clamp_language_code(language_code: str) -> str:
    return clamp(str(language_code).strip(), MAX_LANGUAGE_CODE_LEN)


def normalized(value: str) -> str:
    return clamp(normalize_text(value), MAX_TEXT_LEN)


def split_indicator_keywords(raw_keywords: str | None) -> list[str]:
    if not raw_keywords:
        return []
    return [t.strip() for t in _SPLIT_KEYWORDS_RE.split(raw_keywords) if t and t.strip()]


def build_indicator_keyword_and_synonyms(
    *, language_code: str, row: IndicatorSourceRow
) -> tuple[SearchKeywordRow | None, list[tuple[str, str, SynonymType]]]:
    canonical = clamp(str(row.indicator_name or "").strip(), MAX_TEXT_LEN)
    norm = normalized(canonical)
    if not canonical or not norm:
        return None, []

    seeds: list[tuple[str, str, SynonymType]] = []
    if row.short_name:
        abbr_text = clamp(str(row.short_name).strip(), MAX_TEXT_LEN)
        abbr_norm = normalized(abbr_text)
        if abbr_text and abbr_norm:
            seeds.append((abbr_text, abbr_norm, SynonymType.ABBREVIATION))

    for token in split_indicator_keywords(row.keywords):
        syn_text = clamp(token, MAX_TEXT_LEN)
        syn_norm = normalized(syn_text)
        if syn_text and syn_norm:
            seeds.append((syn_text, syn_norm, SynonymType.SYNONYM))

    return (
        SearchKeywordRow(
            keyword_type=KeywordType.INDICATOR,
            language_code=language_code,
            canonical_text=canonical,
            normalized_text=norm,
            entity_id=int(row.indicator_nid),
        ),
        seeds,
    )


def build_area_keyword_and_synonyms(
    *, language_code: str, row: AreaSourceRow
) -> tuple[SearchKeywordRow | None, list[tuple[str, str, SynonymType]]]:
    canonical = clamp(str(row.area_name or "").strip(), MAX_TEXT_LEN)
    norm = normalized(canonical)
    if not canonical or not norm:
        return None, []

    seeds: list[tuple[str, str, SynonymType]] = []
    if row.areashortname:
        abbr_text = clamp(str(row.areashortname).strip(), MAX_TEXT_LEN)
        abbr_norm = normalized(abbr_text)
        if abbr_text and abbr_norm:
            seeds.append((abbr_text, abbr_norm, SynonymType.ABBREVIATION))

    # seed area_name as synonym (per requirement)
    seeds.append((canonical, norm, SynonymType.SYNONYM))

    return (
        SearchKeywordRow(
            keyword_type=KeywordType.AREA,
            language_code=language_code,
            canonical_text=canonical,
            normalized_text=norm,
            entity_id=int(row.area_nid),
        ),
        seeds,
    )


def build_subgroup_keyword_and_synonyms(
    *, language_code: str, row: SubgroupSourceRow
) -> tuple[SearchKeywordRow | None, list[tuple[str, str, SynonymType]]]:
    canonical = clamp(str(row.subgroup_val or "").strip(), MAX_TEXT_LEN)
    norm = normalized(canonical)
    if not canonical or not norm:
        return None, []

    seeds = [(canonical, norm, SynonymType.SYNONYM)]
    return (
        SearchKeywordRow(
            keyword_type=KeywordType.SUBGROUP,
            language_code=language_code,
            canonical_text=canonical,
            normalized_text=norm,
            entity_id=int(row.subgroup_val_nid),
        ),
        seeds,
    )


def build_timeperiod_keyword_and_synonyms(
    *, language_code: str, row: TimePeriodSourceRow
) -> tuple[SearchKeywordRow | None, list[tuple[str, str, SynonymType]]]:
    canonical = clamp(str(row.timeperiod or "").strip(), MAX_TEXT_LEN)
    norm = normalized(canonical)
    if not canonical or not norm:
        return None, []

    seeds = [(canonical, norm, SynonymType.SYNONYM)]
    return (
        SearchKeywordRow(
            keyword_type=KeywordType.TIME_PERIOD,
            language_code=language_code,
            canonical_text=canonical,
            normalized_text=norm,
            entity_id=int(row.timeperiod_nid),
        ),
        seeds,
    )

