"""
Search Service Types and DTOs

Defines the domain types used by the search service.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class MatchSource(str, Enum):
    """Indicates how a search result was matched."""
    EXACT = "exact"
    TRIGRAM = "trigram"
    SYNONYM = "synonym"


@dataclass(frozen=True)
class SearchCandidate:
    """
    Represents a search result candidate with scoring information.
    
    Attributes:
        keyword_id: Primary key from search_keywords table
        keyword_type: Type of keyword (INDICATOR, AREA, SUBGROUP, TIME_PERIOD)
        entity_id: Foreign key to the original UT table row
        canonical_text: The display text for this keyword
        score: Computed relevance score (higher is better)
        match_source: How this candidate was matched (exact, trigram, synonym)
    """
    keyword_id: int
    keyword_type: str
    entity_id: int
    canonical_text: str
    score: int
    match_source: MatchSource


@dataclass(frozen=True)
class SearchContext:
    """
    Encapsulates all parameters needed for a search operation.
    
    Attributes:
        query: Original user query string
        normalized_query: Query after normalization (lowercase, ASCII folded, etc.)
        query_trigrams: Set of trigrams generated from normalized query
        language_code: Language filter (e.g., "en", "fr")
        keyword_types: Optional filter for specific keyword types
        limit: Maximum number of results to return
    """
    query: str
    normalized_query: str
    query_trigrams: frozenset[str]
    language_code: str
    keyword_types: tuple[str, ...] | None
    limit: int


@dataclass(frozen=True)
class TrigramCandidate:
    """
    Raw candidate from trigram matching before full scoring.
    
    Attributes:
        keyword_id: Primary key from search_keywords table
        trigram_count: Number of matching trigrams
    """
    keyword_id: int
    trigram_count: int


@dataclass(frozen=True)
class KeywordRecord:
    """
    A keyword record fetched from the search_keywords table.
    
    Attributes:
        keyword_id: Primary key
        keyword_type: Type of keyword
        entity_id: Foreign key to original entity
        canonical_text: Display text
        normalized_text: Normalized text for matching
    """
    keyword_id: int
    keyword_type: str
    entity_id: int
    canonical_text: str
    normalized_text: str


@dataclass(frozen=True)
class SynonymMatch:
    """
    A synonym match result.
    
    Attributes:
        keyword_id: The keyword this synonym belongs to
        synonym_type: Type of synonym (SYNONYM, ALIAS, ABBREVIATION)
    """
    keyword_id: int
    synonym_type: str
