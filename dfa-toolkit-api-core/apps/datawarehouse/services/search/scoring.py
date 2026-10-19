"""
Scoring Strategy for Search Results

Implements the Strategy pattern for configurable/replaceable scoring logic.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from enum import IntEnum


class MatchType(IntEnum):
    """
    Score values for different match types.
    
    Higher values indicate better/more precise matches.
    These are base scores that may be combined or adjusted.
    """
    EXACT_CANONICAL = 120
    ABBREVIATION_SYNONYM = 110
    ALIAS_SYNONYM = 105
    SYNONYM = 100
    TRIGRAM_BASE = 0  # Actual trigram count is added to this


class ScoringStrategy(ABC):
    """
    Abstract base class for scoring strategies.
    
    Implement this interface to create custom scoring logic.
    The strategy pattern allows swapping scoring algorithms without
    modifying the search service.
    """
    
    @abstractmethod
    def score_exact_match(self) -> int:
        """
        Get the score for an exact canonical text match.
        
        Returns:
            Score value for exact matches
        """
        ...
    
    @abstractmethod
    def score_synonym_match(self, synonym_type: str) -> int:
        """
        Get the score for a synonym match based on synonym type.
        
        Args:
            synonym_type: Type of synonym (ABBREVIATION, ALIAS, SYNONYM)
            
        Returns:
            Score value for this synonym type
        """
        ...
    
    @abstractmethod
    def score_trigram_match(self, trigram_count: int, query_trigram_count: int) -> int:
        """
        Calculate score for a trigram-based match.
        
        Args:
            trigram_count: Number of trigrams that matched
            query_trigram_count: Total trigrams in the query
            
        Returns:
            Computed score based on trigram overlap
        """
        ...
    
    @abstractmethod
    def calculate_confidence(self, top_score: int, query_trigram_count: int) -> float:
        """
        Calculate confidence level for the search results.
        
        Used to determine if synonym fallback is needed.
        
        Args:
            top_score: Highest score among trigram results
            query_trigram_count: Total trigrams in the query
            
        Returns:
            Confidence value between 0.0 and 1.0
        """
        ...
    
    @abstractmethod
    def should_fallback_to_synonyms(
        self, 
        hits_count: int, 
        limit: int, 
        confidence: float
    ) -> bool:
        """
        Determine if synonym fallback search should be performed.
        
        Args:
            hits_count: Number of results from trigram search
            limit: Requested result limit
            confidence: Confidence value from calculate_confidence
            
        Returns:
            True if synonym fallback should be executed
        """
        ...
    
    @abstractmethod
    def get_min_trigram_overlap(self) -> int:
        """
        Get minimum trigram overlap required for a candidate.
        
        Returns:
            Minimum number of matching trigrams
        """
        ...


class DefaultScoringStrategy(ScoringStrategy):
    """
    Default scoring strategy implementation.
    
    Configurable via constructor parameters for tuning.
    
    Attributes:
        confidence_threshold: Minimum confidence to skip synonym fallback (default: 0.35)
        min_hits_ratio: Minimum hits/limit ratio to skip synonym fallback (default: 0.5)
        min_trigram_overlap: Minimum trigrams that must match (default: 2)
        exact_match_score: Score for exact canonical matches (default: 120)
        abbreviation_score: Score for abbreviation synonym matches (default: 110)
        alias_score: Score for alias synonym matches (default: 105)
        synonym_score: Score for regular synonym matches (default: 100)
    """
    
    def __init__(
        self,
        *,
        confidence_threshold: float = 0.35,
        min_hits_ratio: float = 0.5,
        min_trigram_overlap: int = 2,
        exact_match_score: int = 120,
        abbreviation_score: int = 110,
        alias_score: int = 105,
        synonym_score: int = 100,
    ) -> None:
        self._confidence_threshold = confidence_threshold
        self._min_hits_ratio = min_hits_ratio
        self._min_trigram_overlap = min_trigram_overlap
        self._exact_match_score = exact_match_score
        self._abbreviation_score = abbreviation_score
        self._alias_score = alias_score
        self._synonym_score = synonym_score
    
    def score_exact_match(self) -> int:
        """Return score for exact canonical match."""
        return self._exact_match_score
    
    def score_synonym_match(self, synonym_type: str) -> int:
        """
        Return score based on synonym type.
        
        ABBREVIATION > ALIAS > SYNONYM in priority.
        """
        synonym_type_upper = synonym_type.upper()
        if synonym_type_upper == "ABBREVIATION":
            return self._abbreviation_score
        elif synonym_type_upper == "ALIAS":
            return self._alias_score
        else:
            return self._synonym_score
    
    def score_trigram_match(self, trigram_count: int, query_trigram_count: int) -> int:
        """
        Calculate trigram score.
        
        Uses raw trigram count as the score. This naturally favors
        queries with more matching trigrams.
        """
        return trigram_count
    
    def calculate_confidence(self, top_score: int, query_trigram_count: int) -> float:
        """
        Calculate confidence as ratio of matched trigrams to query trigrams.
        
        Handles edge case where query_trigram_count is 0.
        """
        if query_trigram_count <= 0:
            return 0.0
        return top_score / query_trigram_count
    
    def should_fallback_to_synonyms(
        self, 
        hits_count: int, 
        limit: int, 
        confidence: float
    ) -> bool:
        """
        Determine if synonym fallback is needed.
        
        Fallback is triggered when:
        - No hits from trigram search, OR
        - Hits are below minimum ratio of limit AND confidence is below threshold
        """
        # Always fallback if no results
        if hits_count == 0:
            return True
        
        # Check if we have enough confident results
        has_enough_hits = hits_count >= (limit * self._min_hits_ratio)
        has_high_confidence = confidence >= self._confidence_threshold
        
        # Skip fallback if we have sufficient confident results
        if has_enough_hits and has_high_confidence:
            return False
        
        # Fallback if confidence is low, even with some hits
        return confidence < self._confidence_threshold
    
    def get_min_trigram_overlap(self) -> int:
        """Return minimum trigram overlap threshold."""
        return self._min_trigram_overlap
