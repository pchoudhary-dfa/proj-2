"""
Search Service Package

Provides query-time search functionality against the DW search tables.
"""
from apps.datawarehouse.services.search.readers import (
    SearchKeywordReader,
    SearchNgramReader,
    SearchSynonymReader,
)
from apps.datawarehouse.services.search.scoring import DefaultScoringStrategy, ScoringStrategy
from apps.datawarehouse.services.search.service import SearchService
from apps.datawarehouse.services.search.types import (
    KeywordRecord,
    MatchSource,
    SearchCandidate,
    SearchContext,
    SynonymMatch,
    TrigramCandidate,
)

__all__ = [
    # Service
    "SearchService",
    # Scoring
    "ScoringStrategy",
    "DefaultScoringStrategy",
    # Types
    "SearchCandidate",
    "SearchContext",
    "MatchSource",
    "KeywordRecord",
    "TrigramCandidate",
    "SynonymMatch",
    # Readers
    "SearchKeywordReader",
    "SearchNgramReader",
    "SearchSynonymReader",
]
