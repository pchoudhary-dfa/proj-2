from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class KeywordType(str, Enum):
    INDICATOR = "INDICATOR"
    AREA = "AREA"
    TIME_PERIOD = "TIME_PERIOD"
    SUBGROUP = "SUBGROUP"


class SynonymType(str, Enum):
    SYNONYM = "SYNONYM"
    ALIAS = "ALIAS"
    ABBREVIATION = "ABBREVIATION"


@dataclass(frozen=True)
class SearchKeywordRow:
    keyword_type: KeywordType
    language_code: str
    canonical_text: str
    normalized_text: str
    entity_id: int


@dataclass(frozen=True)
class SearchSynonymSeed:
    """
    Represents a synonym concept tied to the originating entity.

    We resolve this into a real `search_keyword_synonym` row after we know
    the `search_keywords.id` (keyword_id).
    """

    keyword_type: KeywordType
    language_code: str
    entity_id: int
    synonym_text: str
    normalized_synonym: str
    synonym_type: SynonymType


@dataclass(frozen=True)
class BuildCounts:
    languages: int = 0
    keywords_upserted: int = 0
    synonyms_inserted: int = 0
    ngrams_inserted: int = 0


@dataclass(frozen=True)
class BuildResult:
    counts: BuildCounts

