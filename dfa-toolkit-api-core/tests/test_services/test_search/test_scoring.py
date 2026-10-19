"""
Tests for the scoring strategy.
"""
import pytest

from apps.datawarehouse.services.search.scoring import DefaultScoringStrategy, MatchType


class TestDefaultScoringStrategy:
    """Tests for DefaultScoringStrategy."""

    def test_score_exact_match_returns_configured_value(self):
        """Exact match should return the configured score."""
        strategy = DefaultScoringStrategy(exact_match_score=150)
        assert strategy.score_exact_match() == 150

    def test_score_exact_match_default_value(self):
        """Exact match should return default score when not configured."""
        strategy = DefaultScoringStrategy()
        assert strategy.score_exact_match() == 120

    def test_score_synonym_match_abbreviation(self):
        """Abbreviation synonym should score highest among synonyms."""
        strategy = DefaultScoringStrategy()
        score = strategy.score_synonym_match("ABBREVIATION")
        assert score == 110

    def test_score_synonym_match_alias(self):
        """Alias synonym should score between abbreviation and synonym."""
        strategy = DefaultScoringStrategy()
        score = strategy.score_synonym_match("ALIAS")
        assert score == 105

    def test_score_synonym_match_synonym(self):
        """Regular synonym should score lowest among synonyms."""
        strategy = DefaultScoringStrategy()
        score = strategy.score_synonym_match("SYNONYM")
        assert score == 100

    def test_score_synonym_match_case_insensitive(self):
        """Synonym type matching should be case-insensitive."""
        strategy = DefaultScoringStrategy()
        assert strategy.score_synonym_match("abbreviation") == 110
        assert strategy.score_synonym_match("Alias") == 105
        assert strategy.score_synonym_match("synonym") == 100

    def test_score_synonym_match_unknown_type(self):
        """Unknown synonym type should fallback to regular synonym score."""
        strategy = DefaultScoringStrategy()
        score = strategy.score_synonym_match("UNKNOWN")
        assert score == 100

    def test_score_trigram_match_returns_count(self):
        """Trigram score should equal the trigram count."""
        strategy = DefaultScoringStrategy()
        score = strategy.score_trigram_match(trigram_count=15, query_trigram_count=20)
        assert score == 15

    def test_calculate_confidence_ratio(self):
        """Confidence should be ratio of top_score to query_trigram_count."""
        strategy = DefaultScoringStrategy()
        confidence = strategy.calculate_confidence(top_score=10, query_trigram_count=20)
        assert confidence == 0.5

    def test_calculate_confidence_zero_trigrams(self):
        """Confidence should be 0 when query has no trigrams."""
        strategy = DefaultScoringStrategy()
        confidence = strategy.calculate_confidence(top_score=10, query_trigram_count=0)
        assert confidence == 0.0

    def test_should_fallback_no_hits(self):
        """Should always fallback when there are no hits."""
        strategy = DefaultScoringStrategy()
        assert strategy.should_fallback_to_synonyms(
            hits_count=0, limit=20, confidence=0.8
        ) is True

    def test_should_fallback_low_confidence(self):
        """Should fallback when confidence is below threshold."""
        strategy = DefaultScoringStrategy(confidence_threshold=0.35)
        assert strategy.should_fallback_to_synonyms(
            hits_count=5, limit=20, confidence=0.2
        ) is True

    def test_should_not_fallback_high_confidence_enough_hits(self):
        """Should not fallback when confidence is high and enough hits."""
        strategy = DefaultScoringStrategy(confidence_threshold=0.35, min_hits_ratio=0.5)
        assert strategy.should_fallback_to_synonyms(
            hits_count=15, limit=20, confidence=0.5
        ) is False

    def test_should_fallback_few_hits_high_confidence(self):
        """Should not fallback if hits are few but confidence is high."""
        strategy = DefaultScoringStrategy(confidence_threshold=0.35, min_hits_ratio=0.5)
        # 5 hits < 20 * 0.5 = 10, but confidence is high
        assert strategy.should_fallback_to_synonyms(
            hits_count=5, limit=20, confidence=0.6
        ) is False

    def test_get_min_trigram_overlap(self):
        """Should return configured minimum trigram overlap."""
        strategy = DefaultScoringStrategy(min_trigram_overlap=3)
        assert strategy.get_min_trigram_overlap() == 3

    def test_configurable_scores(self):
        """All score values should be configurable."""
        strategy = DefaultScoringStrategy(
            exact_match_score=200,
            abbreviation_score=180,
            alias_score=160,
            synonym_score=140,
        )
        assert strategy.score_exact_match() == 200
        assert strategy.score_synonym_match("ABBREVIATION") == 180
        assert strategy.score_synonym_match("ALIAS") == 160
        assert strategy.score_synonym_match("SYNONYM") == 140


class TestMatchType:
    """Tests for MatchType enum."""

    def test_match_type_values(self):
        """MatchType should have expected values."""
        assert MatchType.EXACT_CANONICAL == 120
        assert MatchType.ABBREVIATION_SYNONYM == 110
        assert MatchType.ALIAS_SYNONYM == 105
        assert MatchType.SYNONYM == 100
        assert MatchType.TRIGRAM_BASE == 0

    def test_match_type_ordering(self):
        """Match types should be ordered by preference."""
        assert MatchType.EXACT_CANONICAL > MatchType.ABBREVIATION_SYNONYM
        assert MatchType.ABBREVIATION_SYNONYM > MatchType.ALIAS_SYNONYM
        assert MatchType.ALIAS_SYNONYM > MatchType.SYNONYM
        assert MatchType.SYNONYM > MatchType.TRIGRAM_BASE
