from __future__ import annotations

from dataclasses import dataclass

from apps.datawarehouse.services.search_index.readers import (
    AreaSourceRow,
    IndicatorSourceRow,
    SubgroupSourceRow,
    TimePeriodSourceRow,
)
from apps.datawarehouse.services.search_index.search_index_builder import SearchIndexBuilderService
from apps.datawarehouse.services.search_index.types import KeywordType, SearchKeywordRow, SynonymType
from apps.shared.utils.ngrams import generate_trigrams
from apps.shared.utils.text import normalize_text


class _StubLanguageReader:
    def read_language_codes(self, dw_db) -> list[str]:
        return ["en"]


class _StubIndicatorReader:
    def read(self, dw_db, language_code: str):
        yield IndicatorSourceRow(
            indicator_nid=1,
            indicator_name="GDP growth",
            short_name="GDP",
            keywords="growth,rate",
        )


class _StubAreaReader:
    def read(self, dw_db, language_code: str):
        yield AreaSourceRow(area_nid=2, area_name="Delhi", areashortname="DL")


class _StubSubgroupReader:
    def read(self, dw_db, language_code: str):
        yield SubgroupSourceRow(subgroup_val_nid=3, subgroup_val="Male")


class _StubTimePeriodReader:
    def read(self, dw_db):
        yield TimePeriodSourceRow(timeperiod_nid=4, timeperiod="2020")


@dataclass
class _StubKeywordWriter:
    upserted: list[SearchKeywordRow]

    def upsert(self, dw_db, rows: list[SearchKeywordRow]) -> int:
        self.upserted.extend(rows)
        return len(rows)

    def fetch_keyword_ids(
        self,
        dw_db,
        *,
        keyword_type: str,
        language_code: str,
        entity_ids,
        chunk_size: int = 1000,
    ) -> dict[int, int]:
        # Deterministic mapping for tests
        return {int(eid): int(eid) + 100 for eid in entity_ids}


@dataclass
class _StubSynonymWriter:
    calls: list[tuple[str, list[int], list[dict]]]

    def replace_for_keyword_ids(self, dw_db, *, language_code: str, keyword_ids, rows, delete_chunk_size: int = 1000) -> int:
        self.calls.append((language_code, list(keyword_ids), list(rows)))
        return len(rows)


@dataclass
class _StubNgramWriter:
    calls: list[tuple[list[int], list[dict]]]

    def replace_for_keyword_ids(self, dw_db, *, keyword_ids, rows, delete_chunk_size: int = 1000) -> int:
        self.calls.append((list(keyword_ids), list(rows)))
        return len(rows)


def test_search_index_builder_happy_path() -> None:
    # Arrange
    keyword_writer = _StubKeywordWriter(upserted=[])
    synonym_writer = _StubSynonymWriter(calls=[])
    ngram_writer = _StubNgramWriter(calls=[])

    svc = SearchIndexBuilderService(
        language_reader=_StubLanguageReader(),
        indicator_reader=_StubIndicatorReader(),
        area_reader=_StubAreaReader(),
        subgroup_reader=_StubSubgroupReader(),
        timeperiod_reader=_StubTimePeriodReader(),
        keyword_writer=keyword_writer,  # type: ignore[arg-type]
        synonym_writer=synonym_writer,  # type: ignore[arg-type]
        ngram_writer=ngram_writer,  # type: ignore[arg-type]
    )

    # Act
    result = svc.build(dw_db=None, batch_size=100, commit=False)  # type: ignore[arg-type]

    # Assert
    # Keywords: indicator + area + subgroup + timeperiod
    assert result.counts.keywords_upserted == 4
    assert {k.keyword_type for k in keyword_writer.upserted} == {
        KeywordType.INDICATOR,
        KeywordType.AREA,
        KeywordType.SUBGROUP,
        KeywordType.TIME_PERIOD,
    }

    # Check indicator synonyms: abbreviation + two keyword tokens.
    # keyword_id for indicator entity_id=1 is 101 (per stub mapping).
    indicator_kw_id = 101
    all_syn_rows = [r for _, _, rows in synonym_writer.calls for r in rows]
    indicator_rows = [r for r in all_syn_rows if r["keyword_id"] == indicator_kw_id]
    assert any(r["synonym_type"] == SynonymType.ABBREVIATION.value and r["synonym_text"] == "GDP" for r in indicator_rows)
    assert any(r["synonym_type"] == SynonymType.SYNONYM.value and r["synonym_text"] == "growth" for r in indicator_rows)
    assert any(r["synonym_type"] == SynonymType.SYNONYM.value and r["synonym_text"] == "rate" for r in indicator_rows)

    # Ngrams exist for each inserted keyword.
    all_ngram_rows = [r for _, rows in ngram_writer.calls for r in rows]
    assert len(all_ngram_rows) > 0

    # Spot-check area trigrams: should include trigrams from canonical text
    # ("Delhi") AND synonym text ("DL" abbreviation, "Delhi" synonym).
    area_kw_id = 102
    expected_area_tris = generate_trigrams(normalize_text("Delhi"))
    expected_area_tris |= generate_trigrams(normalize_text("DL"))
    area_rows = [r for r in all_ngram_rows if r["keyword_id"] == area_kw_id]
    assert {r["ngram"] for r in area_rows} == expected_area_tris

