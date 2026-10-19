from __future__ import annotations

from dataclasses import dataclass

import pytest

from apps.datawarehouse.services.search_index.readers import AreaSourceRow, IndicatorSourceRow, SubgroupSourceRow, TimePeriodSourceRow
from apps.datawarehouse.services.search_index.search_index_incremental_updater import SearchIndexIncrementalUpdater
from apps.datawarehouse.services.search_index.types import KeywordType, SearchKeywordRow, SynonymType
from apps.shared.utils.ngrams import generate_trigrams
from apps.shared.utils.text import normalize_text


class _StubIndicatorReader:
    def __init__(self, row: IndicatorSourceRow | None):
        self._row = row

    def read_one(self, dw_db, language_code: str, indicator_nid: int) -> IndicatorSourceRow | None:
        return self._row


class _StubAreaReader:
    def __init__(self, row: AreaSourceRow | None):
        self._row = row

    def read_one(self, dw_db, language_code: str, area_nid: int) -> AreaSourceRow | None:
        return self._row


class _StubSubgroupReader:
    def __init__(self, row: SubgroupSourceRow | None):
        self._row = row

    def read_one(self, dw_db, language_code: str, subgroup_val_nid: int) -> SubgroupSourceRow | None:
        return self._row


class _StubTimePeriodReader:
    def __init__(self, row: TimePeriodSourceRow | None):
        self._row = row

    def read_one(self, dw_db, timeperiod_nid: int) -> TimePeriodSourceRow | None:
        return self._row


@dataclass
class _StubKeywordWriter:
    upsert_calls: list[list[SearchKeywordRow]]
    fetch_calls: list[tuple[str, str, int]]
    deleted: list[tuple[str, str, int]]

    def upsert(self, dw_db, rows: list[SearchKeywordRow]) -> int:
        self.upsert_calls.append(rows)
        return len(rows)

    def fetch_keyword_ids(self, dw_db, *, keyword_type: str, language_code: str, entity_ids, chunk_size: int = 1000):
        self.fetch_calls.append((keyword_type, language_code, int(entity_ids[0])))
        return {int(entity_ids[0]): 999}

    def fetch_keyword_id(self, dw_db, *, keyword_type: str, language_code: str, entity_id: int):
        return 999

    def delete_by_identity(self, dw_db, *, keyword_type: str, language_code: str, entity_id: int) -> int:
        self.deleted.append((keyword_type, language_code, int(entity_id)))
        return 1


@dataclass
class _StubSynonymWriter:
    replaced: list[tuple[str, list[int], list[dict]]]
    deleted: list[tuple[str, list[int]]]

    def replace_for_keyword_ids(self, dw_db, *, language_code: str, keyword_ids, rows, delete_chunk_size: int = 1000) -> int:
        self.replaced.append((language_code, list(keyword_ids), list(rows)))
        return len(rows)

    def delete_for_keyword_ids(self, dw_db, *, language_code: str, keyword_ids, delete_chunk_size: int = 1000) -> int:
        self.deleted.append((language_code, list(keyword_ids)))
        return 0


@dataclass
class _StubNgramWriter:
    replaced: list[tuple[list[int], list[dict]]]
    deleted: list[list[int]]

    def replace_for_keyword_ids(self, dw_db, *, keyword_ids, rows, delete_chunk_size: int = 1000) -> int:
        self.replaced.append((list(keyword_ids), list(rows)))
        return len(rows)

    def delete_for_keyword_ids(self, dw_db, *, keyword_ids, delete_chunk_size: int = 1000) -> int:
        self.deleted.append(list(keyword_ids))
        return 0


class _StubSession:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_incremental_upsert_indicator_success() -> None:
    # Arrange
    dw_db = _StubSession()
    indicator = IndicatorSourceRow(indicator_nid=1, indicator_name="GDP growth", short_name="GDP", keywords="growth,rate")
    kw_writer = _StubKeywordWriter(upsert_calls=[], fetch_calls=[], deleted=[])
    syn_writer = _StubSynonymWriter(replaced=[], deleted=[])
    ng_writer = _StubNgramWriter(replaced=[], deleted=[])

    svc = SearchIndexIncrementalUpdater(
        indicator_reader=_StubIndicatorReader(indicator),
        area_reader=_StubAreaReader(None),
        subgroup_reader=_StubSubgroupReader(None),
        timeperiod_reader=_StubTimePeriodReader(None),
        keyword_writer=kw_writer,  # type: ignore[arg-type]
        synonym_writer=syn_writer,  # type: ignore[arg-type]
        ngram_writer=ng_writer,  # type: ignore[arg-type]
    )

    # Act
    svc.upsert(dw_db, keyword_type=KeywordType.INDICATOR, language_code="en", entity_id=1, commit=True)  # type: ignore[arg-type]

    # Assert
    assert dw_db.commits == 1
    assert len(kw_writer.upsert_calls) == 1
    assert kw_writer.upsert_calls[0][0].canonical_text == "GDP growth"

    # synonyms: abbreviation + 2 tokens
    _, _, rows = syn_writer.replaced[0]
    assert any(r["synonym_type"] == SynonymType.ABBREVIATION.value and r["synonym_text"] == "GDP" for r in rows)
    assert any(r["synonym_type"] == SynonymType.SYNONYM.value and r["synonym_text"] == "growth" for r in rows)
    assert any(r["synonym_type"] == SynonymType.SYNONYM.value and r["synonym_text"] == "rate" for r in rows)

    # ngrams correspond to normalized keyword
    ngram_rows = ng_writer.replaced[0][1]
    expected = generate_trigrams(normalize_text("GDP growth"))
    assert {r["ngram"] for r in ngram_rows} == expected


def test_incremental_upsert_missing_ut_row_falls_back_to_delete() -> None:
    # Arrange
    dw_db = _StubSession()
    kw_writer = _StubKeywordWriter(upsert_calls=[], fetch_calls=[], deleted=[])
    syn_writer = _StubSynonymWriter(replaced=[], deleted=[])
    ng_writer = _StubNgramWriter(replaced=[], deleted=[])

    svc = SearchIndexIncrementalUpdater(
        indicator_reader=_StubIndicatorReader(None),
        area_reader=_StubAreaReader(None),
        subgroup_reader=_StubSubgroupReader(None),
        timeperiod_reader=_StubTimePeriodReader(None),
        keyword_writer=kw_writer,  # type: ignore[arg-type]
        synonym_writer=syn_writer,  # type: ignore[arg-type]
        ngram_writer=ng_writer,  # type: ignore[arg-type]
    )

    # Act
    svc.upsert(dw_db, keyword_type=KeywordType.INDICATOR, language_code="en", entity_id=123, commit=True)  # type: ignore[arg-type]

    # Assert (delete path)
    assert dw_db.commits == 1
    assert kw_writer.deleted == [(KeywordType.INDICATOR.value, "en", 123)]
    assert syn_writer.deleted == [("en", [999])]
    assert ng_writer.deleted == [[999]]


def test_incremental_delete_requires_language_code() -> None:
    # Arrange
    svc = SearchIndexIncrementalUpdater()

    # Act / Assert
    with pytest.raises(ValueError):
        svc.delete(dw_db=None, keyword_type=KeywordType.AREA, language_code="  ", entity_id=1)  # type: ignore[arg-type]

