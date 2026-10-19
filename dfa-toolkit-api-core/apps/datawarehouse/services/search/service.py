"""
Search Service (Orchestrator)

Implements a multi-phase search strategy:
1. Phase 0: Exact canonical match (cheap win)
2. Phase 1: Trigram-based fuzzy search
3. Phase 2: Exact synonym match (always executed)

All phases run unconditionally; results are merged, deduplicated, and
ranked by score so that exact > synonym > trigram.
"""
from __future__ import annotations

import logging
from collections.abc import Sequence

from sqlalchemy.orm import Session

from apps.datawarehouse.services.search.readers import (
    SearchKeywordReader,
    SearchNgramReader,
    SearchSynonymReader,
)
from apps.datawarehouse.services.search.scoring import DefaultScoringStrategy, ScoringStrategy
from apps.datawarehouse.services.search.types import (
    KeywordRecord,
    MatchSource,
    SearchCandidate,
    SearchContext,
    SynonymMatch,
    TrigramCandidate,
)

logger = logging.getLogger(__name__)


# Safety bounds for query processing
MAX_TRIGRAMS_PER_QUERY = 30
MAX_CANDIDATE_LIMIT = 500


class SearchService:
    """
    Orchestrates search operations across search tables.
    
    Uses dependency injection for all collaborators (readers, scoring strategy)
    to enable easy testing and customization.
    
    The search flow:
    1. Check for exact canonical matches (Phase 0)
    2. Perform trigram-based fuzzy search (Phase 1)
    3. Perform exact synonym match (Phase 2) — always runs
    4. Merge, deduplicate, and rank all results
    5. Return top N candidates
    """
    
    def __init__(
        self,
        *,
        scoring_strategy: ScoringStrategy | None = None,
        keyword_reader: SearchKeywordReader | None = None,
        ngram_reader: SearchNgramReader | None = None,
        synonym_reader: SearchSynonymReader | None = None,
    ) -> None:
        """
        Initialize SearchService with optional custom collaborators.
        
        Args:
            scoring_strategy: Custom scoring strategy (defaults to DefaultScoringStrategy)
            keyword_reader: Custom keyword reader (defaults to SearchKeywordReader)
            ngram_reader: Custom ngram reader (defaults to SearchNgramReader)
            synonym_reader: Custom synonym reader (defaults to SearchSynonymReader)
        """
        self._scoring = scoring_strategy or DefaultScoringStrategy()
        self._keyword_reader = keyword_reader or SearchKeywordReader()
        self._ngram_reader = ngram_reader or SearchNgramReader()
        self._synonym_reader = synonym_reader or SearchSynonymReader()
    
    def search(
        self,
        dw_db: Session,
        context: SearchContext,
    ) -> list[SearchCandidate]:
        """
        Execute search with the two-phase strategy.
        
        Args:
            dw_db: DW database session
            context: Search context with query and filters
            
        Returns:
            List of SearchCandidate sorted by score descending, limited to context.limit
        """
        if not context.normalized_query:
            return []
        
        # Track all candidates by keyword_id to merge and dedupe
        candidates_by_id: dict[int, SearchCandidate] = {}
        
        # Phase 0: Exact canonical match
        exact_matches = self._phase_exact_canonical(dw_db, context)
        for candidate in exact_matches:
            candidates_by_id[candidate.keyword_id] = candidate
        
        # Phase 1: Trigram search
        trigram_candidates, _confidence = self._phase_trigram_search(dw_db, context)
        
        # Merge trigram candidates (don't overwrite exact matches which have higher scores)
        for candidate in trigram_candidates:
            if candidate.keyword_id not in candidates_by_id:
                candidates_by_id[candidate.keyword_id] = candidate
        
        # Phase 2: Exact synonym match (always runs — the query is a cheap
        # indexed exact-match lookup and guarantees user-defined synonyms
        # like abbreviations are never silently dropped).
        synonym_candidates = self._phase_synonym_search(dw_db, context)
        for candidate in synonym_candidates:
            existing = candidates_by_id.get(candidate.keyword_id)
            if existing is None or candidate.score > existing.score:
                candidates_by_id[candidate.keyword_id] = candidate
        
        # Sort by score descending, then by keyword_id for stable ordering
        all_candidates = sorted(
            candidates_by_id.values(),
            key=lambda c: (-c.score, -c.keyword_id),
        )
        
        return all_candidates[: context.limit]
    
    def _phase_exact_canonical(
        self,
        dw_db: Session,
        context: SearchContext,
    ) -> list[SearchCandidate]:
        """
        Phase 0: Find exact matches on canonical (normalized) text.
        
        This is a cheap win for queries that exactly match a keyword.
        """
        keyword_types = list(context.keyword_types) if context.keyword_types else None
        
        exact_records = self._keyword_reader.find_exact_matches(
            dw_db,
            normalized_query=context.normalized_query,
            language_code=context.language_code,
            keyword_types=keyword_types,
            limit=context.limit,
        )
        
        score = self._scoring.score_exact_match()
        
        return [
            SearchCandidate(
                keyword_id=record.keyword_id,
                keyword_type=record.keyword_type,
                entity_id=record.entity_id,
                canonical_text=record.canonical_text,
                score=score,
                match_source=MatchSource.EXACT,
            )
            for record in exact_records
        ]
    
    def _phase_trigram_search(
        self,
        dw_db: Session,
        context: SearchContext,
    ) -> tuple[list[SearchCandidate], float]:
        """
        Phase 1: Trigram-based fuzzy search.
        
        Returns:
            Tuple of (candidates, confidence)
            - candidates: List of SearchCandidate from trigram matching
            - confidence: Confidence value for determining synonym fallback
        """
        if not context.query_trigrams:
            return [], 0.0
        
        # Bound trigrams for safety
        trigrams = list(context.query_trigrams)[:MAX_TRIGRAMS_PER_QUERY]
        query_trigram_count = len(trigrams)
        
        keyword_types = list(context.keyword_types) if context.keyword_types else None
        
        # Get trigram candidates
        trigram_results = self._ngram_reader.find_trigram_candidates(
            dw_db,
            trigrams=trigrams,
            language_code=context.language_code,
            keyword_types=keyword_types,
            min_overlap=self._scoring.get_min_trigram_overlap(),
            candidate_limit=MAX_CANDIDATE_LIMIT,
        )
        
        if not trigram_results:
            return [], 0.0
        
        # Fetch keyword details for candidates
        keyword_ids = [tc.keyword_id for tc in trigram_results]
        keyword_records = self._keyword_reader.fetch_by_ids(
            dw_db,
            keyword_ids=keyword_ids,
            language_code=context.language_code,
            keyword_types=keyword_types,
        )
        
        # Build candidates with scores
        candidates: list[SearchCandidate] = []
        top_score = 0
        
        for tc in trigram_results:
            record = keyword_records.get(tc.keyword_id)
            if not record:
                continue
            
            score = self._scoring.score_trigram_match(
                trigram_count=tc.trigram_count,
                query_trigram_count=query_trigram_count,
            )
            
            if score > top_score:
                top_score = score
            
            candidates.append(
                SearchCandidate(
                    keyword_id=record.keyword_id,
                    keyword_type=record.keyword_type,
                    entity_id=record.entity_id,
                    canonical_text=record.canonical_text,
                    score=score,
                    match_source=MatchSource.TRIGRAM,
                )
            )
        
        confidence = self._scoring.calculate_confidence(
            top_score=top_score,
            query_trigram_count=query_trigram_count,
        )
        
        return candidates, confidence
    
    def _phase_synonym_search(
        self,
        dw_db: Session,
        context: SearchContext,
    ) -> list[SearchCandidate]:
        """
        Phase 2: Exact synonym match.
        
        Always executed so that user-defined synonyms/abbreviations are never
        dropped by the trigram confidence gate.
        Uses exact match on normalized_synonym (no LIKE or fuzzy).
        """
        keyword_types = list(context.keyword_types) if context.keyword_types else None
        
        synonym_matches = self._synonym_reader.find_by_exact_synonym(
            dw_db,
            normalized_query=context.normalized_query,
            language_code=context.language_code,
            keyword_types=keyword_types,
        )
        
        if not synonym_matches:
            return []
        
        # Fetch keyword details
        keyword_ids = [sm.keyword_id for sm in synonym_matches]
        keyword_records = self._keyword_reader.fetch_by_ids(
            dw_db,
            keyword_ids=keyword_ids,
            language_code=context.language_code,
            keyword_types=keyword_types,
        )
        
        # Build candidate mapping by keyword_id for synonym type lookup
        synonym_type_by_id: dict[int, str] = {
            sm.keyword_id: sm.synonym_type for sm in synonym_matches
        }
        
        candidates: list[SearchCandidate] = []
        for keyword_id, record in keyword_records.items():
            synonym_type = synonym_type_by_id.get(keyword_id, "SYNONYM")
            score = self._scoring.score_synonym_match(synonym_type)
            
            candidates.append(
                SearchCandidate(
                    keyword_id=record.keyword_id,
                    keyword_type=record.keyword_type,
                    entity_id=record.entity_id,
                    canonical_text=record.canonical_text,
                    score=score,
                    match_source=MatchSource.SYNONYM,
                )
            )
        
        return candidates
