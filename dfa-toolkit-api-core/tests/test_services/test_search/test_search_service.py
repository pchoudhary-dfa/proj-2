"""
Tests for the search service orchestrator.
"""
from __future__ import annotations

from apps.datawarehouse.services.search.service import SearchService
from apps.datawarehouse.services.search.types import (
    KeywordRecord,
    MatchSource,
    SearchContext,
    SynonymMatch,
    TrigramCandidate,
)


# =============================================================================
# Stub Readers for Testing
# =============================================================================


class StubKeywordReader:
    """Stub reader for testing keyword lookups."""

    def __init__(
        self,
        exact_matches: list[KeywordRecord] | None = None,
        records_by_id: dict[int, KeywordRecord] | None = None,
    ):
        self.exact_matches = exact_matches or []
        self.records_by_id = records_by_id or {}
        self.find_exact_calls: list[dict] = []
        self.fetch_by_ids_calls: list[dict] = []

    def find_exact_matches(
        self, dw_db, *, normalized_query, language_code, keyword_types=None, limit=100
    ):
        self.find_exact_calls.append(
            {
                "normalized_query": normalized_query,
                "language_code": language_code,
                "keyword_types": keyword_types,
                "limit": limit,
            }
        )
        return self.exact_matches

    def fetch_by_ids(
        self, dw_db, *, keyword_ids, language_code=None, keyword_types=None
    ):
        self.fetch_by_ids_calls.append(
            {
                "keyword_ids": keyword_ids,
                "language_code": language_code,
                "keyword_types": keyword_types,
            }
        )
        return {kid: self.records_by_id[kid] for kid in keyword_ids if kid in self.records_by_id}


class StubNgramReader:
    """Stub reader for testing trigram lookups."""

    def __init__(self, candidates: list[TrigramCandidate] | None = None):
        self.candidates = candidates or []
        self.calls: list[dict] = []

    def find_trigram_candidates(
        self,
        dw_db,
        *,
        trigrams,
        language_code,
        keyword_types=None,
        min_overlap=2,
        candidate_limit=500,
    ):
        self.calls.append(
            {
                "trigrams": trigrams,
                "language_code": language_code,
                "keyword_types": keyword_types,
                "min_overlap": min_overlap,
                "candidate_limit": candidate_limit,
            }
        )
        return self.candidates


class StubSynonymReader:
    """Stub reader for testing synonym lookups."""

    def __init__(self, matches: list[SynonymMatch] | None = None):
        self.matches = matches or []
        self.calls: list[dict] = []

    def find_by_exact_synonym(
        self, dw_db, *, normalized_query, language_code, keyword_types=None
    ):
        self.calls.append(
            {
                "normalized_query": normalized_query,
                "language_code": language_code,
                "keyword_types": keyword_types,
            }
        )
        return self.matches


class StubSession:
    """Stub database session for testing."""
    pass


# =============================================================================
# Test Fixtures
# =============================================================================


def make_keyword_record(
    keyword_id: int,
    keyword_type: str = "INDICATOR",
    entity_id: int | None = None,
    canonical_text: str = "Test Keyword",
) -> KeywordRecord:
    """Helper to create KeywordRecord for tests."""
    return KeywordRecord(
        keyword_id=keyword_id,
        keyword_type=keyword_type,
        entity_id=entity_id or keyword_id,
        canonical_text=canonical_text,
        normalized_text=canonical_text.lower(),
    )


def make_context(
    query: str = "test",
    normalized_query: str = "test",
    query_trigrams: frozenset[str] | None = None,
    language_code: str = "en",
    keyword_types: tuple[str, ...] | None = None,
    limit: int = 20,
) -> SearchContext:
    """Helper to create SearchContext for tests."""
    return SearchContext(
        query=query,
        normalized_query=normalized_query,
        query_trigrams=query_trigrams or frozenset(["  t", " te", "tes", "est", "st "]),
        language_code=language_code,
        keyword_types=keyword_types,
        limit=limit,
    )


# =============================================================================
# Tests
# =============================================================================


class TestSearchServiceExactMatch:
    """Tests for Phase 0: Exact canonical matching."""

    def test_exact_match_found(self):
        """Should return exact matches with highest score."""
        record = make_keyword_record(1, canonical_text="GDP")
        keyword_reader = StubKeywordReader(exact_matches=[record])

        service = SearchService(
            keyword_reader=keyword_reader,
            ngram_reader=StubNgramReader(),
            synonym_reader=StubSynonymReader(),
        )

        context = make_context(query="GDP", normalized_query="gdp")
        results = service.search(StubSession(), context)

        assert len(results) == 1
        assert results[0].keyword_id == 1
        assert results[0].match_source == MatchSource.EXACT
        assert results[0].score == 120  # Default exact match score

    def test_exact_match_empty_query(self):
        """Should return empty results for empty normalized query."""
        service = SearchService(
            keyword_reader=StubKeywordReader(),
            ngram_reader=StubNgramReader(),
            synonym_reader=StubSynonymReader(),
        )

        context = make_context(query="  ", normalized_query="")
        results = service.search(StubSession(), context)

        assert len(results) == 0


class TestSearchServiceTrigramSearch:
    """Tests for Phase 1: Trigram-based fuzzy search."""

    def test_trigram_search_returns_candidates(self):
        """Should return trigram candidates when no exact match."""
        record = make_keyword_record(10, canonical_text="Mortality Rate")
        keyword_reader = StubKeywordReader(
            exact_matches=[],
            records_by_id={10: record},
        )
        ngram_reader = StubNgramReader(
            candidates=[TrigramCandidate(keyword_id=10, trigram_count=8)]
        )

        service = SearchService(
            keyword_reader=keyword_reader,
            ngram_reader=ngram_reader,
            synonym_reader=StubSynonymReader(),
        )

        context = make_context(query="mortality", normalized_query="mortality")
        results = service.search(StubSession(), context)

        assert len(results) == 1
        assert results[0].keyword_id == 10
        assert results[0].match_source == MatchSource.TRIGRAM
        assert results[0].score == 8  # Trigram count as score

    def test_exact_match_not_overwritten_by_trigram(self):
        """Exact match should not be overwritten by trigram result."""
        record = make_keyword_record(1, canonical_text="GDP")
        keyword_reader = StubKeywordReader(
            exact_matches=[record],
            records_by_id={1: record},
        )
        ngram_reader = StubNgramReader(
            candidates=[TrigramCandidate(keyword_id=1, trigram_count=3)]
        )

        service = SearchService(
            keyword_reader=keyword_reader,
            ngram_reader=ngram_reader,
            synonym_reader=StubSynonymReader(),
        )

        context = make_context(query="GDP", normalized_query="gdp")
        results = service.search(StubSession(), context)

        assert len(results) == 1
        assert results[0].match_source == MatchSource.EXACT
        assert results[0].score == 120  # Exact score, not trigram


class TestSearchServiceSynonymSearch:
    """Tests for Phase 2: Synonym search (always executed)."""

    def test_synonym_match_when_no_trigram_hits(self):
        """Should find synonym matches even with zero trigram hits."""
        record = make_keyword_record(5, canonical_text="Infant Mortality Rate")
        keyword_reader = StubKeywordReader(
            exact_matches=[],
            records_by_id={5: record},
        )
        ngram_reader = StubNgramReader(candidates=[])
        synonym_reader = StubSynonymReader(
            matches=[SynonymMatch(keyword_id=5, synonym_type="ABBREVIATION")]
        )

        service = SearchService(
            keyword_reader=keyword_reader,
            ngram_reader=ngram_reader,
            synonym_reader=synonym_reader,
        )

        context = make_context(query="IMR", normalized_query="imr")
        results = service.search(StubSession(), context)

        assert len(results) == 1
        assert results[0].keyword_id == 5
        assert results[0].match_source == MatchSource.SYNONYM
        assert results[0].score == 110  # Abbreviation score

    def test_synonym_search_always_runs_even_with_high_confidence_trigrams(self):
        """Synonym search must execute even when trigram confidence is high."""
        record_trigram = make_keyword_record(10, canonical_text="Mortality")
        record_synonym = make_keyword_record(99, canonical_text="IMR Indicator")
        keyword_reader = StubKeywordReader(
            exact_matches=[],
            records_by_id={10: record_trigram, 99: record_synonym},
        )
        ngram_reader = StubNgramReader(
            candidates=[TrigramCandidate(keyword_id=10, trigram_count=15)]
        )
        synonym_reader = StubSynonymReader(
            matches=[SynonymMatch(keyword_id=99, synonym_type="SYNONYM")]
        )

        service = SearchService(
            keyword_reader=keyword_reader,
            ngram_reader=ngram_reader,
            synonym_reader=synonym_reader,
        )

        context = make_context(
            query="mort",
            normalized_query="mort",
            query_trigrams=frozenset(["  m", " mo", "mor", "ort", "rt "]),
            limit=20,
        )
        results = service.search(StubSession(), context)

        assert len(synonym_reader.calls) == 1
        assert len(results) == 2
        result_ids = {r.keyword_id for r in results}
        assert 10 in result_ids  # trigram hit
        assert 99 in result_ids  # synonym hit


class TestSearchServiceMerging:
    """Tests for result merging and deduplication."""

    def test_results_sorted_by_score(self):
        """Results should be sorted by score descending."""
        records = {
            1: make_keyword_record(1, canonical_text="Low"),
            2: make_keyword_record(2, canonical_text="High"),
        }
        keyword_reader = StubKeywordReader(
            exact_matches=[],
            records_by_id=records,
        )
        ngram_reader = StubNgramReader(
            candidates=[
                TrigramCandidate(keyword_id=1, trigram_count=5),
                TrigramCandidate(keyword_id=2, trigram_count=10),
            ]
        )

        service = SearchService(
            keyword_reader=keyword_reader,
            ngram_reader=ngram_reader,
            synonym_reader=StubSynonymReader(),
        )

        context = make_context()
        results = service.search(StubSession(), context)

        assert len(results) == 2
        assert results[0].keyword_id == 2  # Higher score
        assert results[0].score == 10
        assert results[1].keyword_id == 1  # Lower score
        assert results[1].score == 5

    def test_results_limited_to_context_limit(self):
        """Results should be limited to context.limit."""
        records = {i: make_keyword_record(i) for i in range(1, 11)}
        keyword_reader = StubKeywordReader(
            exact_matches=[],
            records_by_id=records,
        )
        ngram_reader = StubNgramReader(
            candidates=[TrigramCandidate(keyword_id=i, trigram_count=i) for i in range(1, 11)]
        )

        service = SearchService(
            keyword_reader=keyword_reader,
            ngram_reader=ngram_reader,
            synonym_reader=StubSynonymReader(),
        )

        context = make_context(limit=5)
        results = service.search(StubSession(), context)

        assert len(results) == 5
        # Should have top 5 scores (10, 9, 8, 7, 6)
        assert results[0].score == 10

    def test_synonym_upgrades_lower_score(self):
        """Synonym match should upgrade a lower-scored trigram match for the same keyword."""
        record = make_keyword_record(5, canonical_text="Infant Mortality Rate")
        keyword_reader = StubKeywordReader(
            exact_matches=[],
            records_by_id={5: record},
        )
        ngram_reader = StubNgramReader(
            candidates=[TrigramCandidate(keyword_id=5, trigram_count=2)]
        )
        synonym_reader = StubSynonymReader(
            matches=[SynonymMatch(keyword_id=5, synonym_type="ABBREVIATION")]
        )

        service = SearchService(
            keyword_reader=keyword_reader,
            ngram_reader=ngram_reader,
            synonym_reader=synonym_reader,
        )

        context = make_context(query="imr", normalized_query="imr")
        results = service.search(StubSession(), context)

        assert len(results) == 1
        # Should have synonym score (110), not trigram (2)
        assert results[0].score == 110
        assert results[0].match_source == MatchSource.SYNONYM
