"""
Search Readers (Data Access Layer)

Provides read-only access to search tables for query-time operations.
Uses SQLAlchemy Core for optimal read performance.
"""
from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.datawarehouse.services.search.types import KeywordRecord, SynonymMatch, TrigramCandidate
from apps.datawarehouse.services.search_index.tables import (
    search_keyword_ngram,
    search_keyword_synonym,
    search_keywords,
)


class SearchKeywordReader:
    """
    Reader for search_keywords table.
    
    Provides exact match lookups and bulk fetching by IDs.
    """
    
    def find_exact_matches(
        self,
        dw_db: Session,
        *,
        normalized_query: str,
        language_code: str,
        keyword_types: Sequence[str] | None = None,
        limit: int = 100,
    ) -> list[KeywordRecord]:
        """
        Find keywords where normalized_text exactly matches the query.
        
        This is the "cheap win" for exact matches before trigram scoring.
        
        Args:
            dw_db: DW database session
            normalized_query: Normalized search query
            language_code: Language filter
            keyword_types: Optional filter for specific keyword types
            limit: Maximum results to return
            
        Returns:
            List of matching KeywordRecord instances
        """
        stmt = (
            select(
                search_keywords.c.id,
                search_keywords.c.keyword_type,
                search_keywords.c.entity_id,
                search_keywords.c.canonical_text,
                search_keywords.c.normalized_text,
            )
            .where(search_keywords.c.language_code == language_code)
            .where(search_keywords.c.normalized_text == normalized_query)
            .limit(limit)
        )
        
        if keyword_types:
            stmt = stmt.where(search_keywords.c.keyword_type.in_(keyword_types))
        
        results: list[KeywordRecord] = []
        for row in dw_db.execute(stmt):
            results.append(
                KeywordRecord(
                    keyword_id=int(row[0]),
                    keyword_type=str(row[1]),
                    entity_id=int(row[2]),
                    canonical_text=str(row[3]),
                    normalized_text=str(row[4]),
                )
            )
        return results
    
    def fetch_by_ids(
        self,
        dw_db: Session,
        *,
        keyword_ids: Sequence[int],
        language_code: str | None = None,
        keyword_types: Sequence[str] | None = None,
    ) -> dict[int, KeywordRecord]:
        """
        Fetch keyword records by their IDs.
        
        Args:
            dw_db: DW database session
            keyword_ids: List of keyword IDs to fetch
            language_code: Optional language filter
            keyword_types: Optional keyword type filter
            
        Returns:
            Dict mapping keyword_id to KeywordRecord
        """
        if not keyword_ids:
            return {}
        
        stmt = (
            select(
                search_keywords.c.id,
                search_keywords.c.keyword_type,
                search_keywords.c.entity_id,
                search_keywords.c.canonical_text,
                search_keywords.c.normalized_text,
            )
            .where(search_keywords.c.id.in_(keyword_ids))
        )
        
        if language_code:
            stmt = stmt.where(search_keywords.c.language_code == language_code)
        
        if keyword_types:
            stmt = stmt.where(search_keywords.c.keyword_type.in_(keyword_types))
        
        results: dict[int, KeywordRecord] = {}
        for row in dw_db.execute(stmt):
            keyword_id = int(row[0])
            results[keyword_id] = KeywordRecord(
                keyword_id=keyword_id,
                keyword_type=str(row[1]),
                entity_id=int(row[2]),
                canonical_text=str(row[3]),
                normalized_text=str(row[4]),
            )
        return results


class SearchNgramReader:
    """
    Reader for search_keyword_ngram table.
    
    Provides trigram-based candidate scoring.
    """
    
    def find_trigram_candidates(
        self,
        dw_db: Session,
        *,
        trigrams: Sequence[str],
        language_code: str,
        keyword_types: Sequence[str] | None = None,
        min_overlap: int = 2,
        candidate_limit: int = 500,
    ) -> list[TrigramCandidate]:
        """
        Find keyword candidates based on trigram overlap.
        
        This is the main fuzzy matching mechanism. Candidates are
        scored by how many query trigrams they match.
        
        Args:
            dw_db: DW database session
            trigrams: Trigrams generated from the search query
            language_code: Language filter
            keyword_types: Optional filter for specific keyword types
            min_overlap: Minimum number of trigrams that must match
            candidate_limit: Maximum candidates to consider
            
        Returns:
            List of TrigramCandidate sorted by trigram_count descending
        """
        if not trigrams:
            return []
        
        # Build subquery to score candidates by trigram overlap
        # This joins with search_keywords to apply language/type filters
        score_subq = (
            select(
                search_keyword_ngram.c.keyword_id.label("keyword_id"),
                func.count().label("trigram_count"),
            )
            .where(search_keyword_ngram.c.ngram.in_(trigrams))
            .group_by(search_keyword_ngram.c.keyword_id)
            .having(func.count() >= min_overlap)
            .subquery()
        )
        
        # Join with keywords table to apply filters
        stmt = (
            select(
                score_subq.c.keyword_id,
                score_subq.c.trigram_count,
            )
            .join(
                search_keywords,
                search_keywords.c.id == score_subq.c.keyword_id,
            )
            .where(search_keywords.c.language_code == language_code)
            .order_by(score_subq.c.trigram_count.desc(), score_subq.c.keyword_id.desc())
            .limit(candidate_limit)
        )
        
        if keyword_types:
            stmt = stmt.where(search_keywords.c.keyword_type.in_(keyword_types))
        
        results: list[TrigramCandidate] = []
        for row in dw_db.execute(stmt):
            results.append(
                TrigramCandidate(
                    keyword_id=int(row[0]),
                    trigram_count=int(row[1]),
                )
            )
        return results


class SearchSynonymReader:
    """
    Reader for search_keyword_synonym table.
    
    Provides exact synonym matching for fallback searches.
    """
    
    def find_by_exact_synonym(
        self,
        dw_db: Session,
        *,
        normalized_query: str,
        language_code: str,
        keyword_types: Sequence[str] | None = None,
    ) -> list[SynonymMatch]:
        """
        Find keywords by exact synonym match.
        
        This is used as a fallback when trigram confidence is low.
        Only exact matches are performed (no LIKE or fuzzy).
        
        Args:
            dw_db: DW database session
            normalized_query: Normalized search query
            language_code: Language filter
            keyword_types: Optional filter for specific keyword types
            
        Returns:
            List of SynonymMatch with keyword_id and synonym_type
        """
        # First get synonym matches
        stmt = (
            select(
                search_keyword_synonym.c.keyword_id,
                search_keyword_synonym.c.synonym_type,
            )
            .where(search_keyword_synonym.c.language_code == language_code)
            .where(search_keyword_synonym.c.normalized_synonym == normalized_query)
        )
        
        # If keyword_types filter is provided, we need to join with keywords table
        if keyword_types:
            stmt = (
                select(
                    search_keyword_synonym.c.keyword_id,
                    search_keyword_synonym.c.synonym_type,
                )
                .join(
                    search_keywords,
                    search_keywords.c.id == search_keyword_synonym.c.keyword_id,
                )
                .where(search_keyword_synonym.c.language_code == language_code)
                .where(search_keyword_synonym.c.normalized_synonym == normalized_query)
                .where(search_keywords.c.keyword_type.in_(keyword_types))
            )
        
        results: list[SynonymMatch] = []
        seen_keyword_ids: set[int] = set()
        
        for row in dw_db.execute(stmt):
            keyword_id = int(row[0])
            # Deduplicate by keyword_id, keeping first (which might have better synonym_type)
            if keyword_id not in seen_keyword_ids:
                seen_keyword_ids.add(keyword_id)
                results.append(
                    SynonymMatch(
                        keyword_id=keyword_id,
                        synonym_type=str(row[1]),
                    )
                )
        
        return results
