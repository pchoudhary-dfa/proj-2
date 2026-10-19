from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from apps.datawarehouse.services.search_index.readers import (
    UtAreaReader,
    UtIndicatorReader,
    UtLanguageReader,
    UtSubgroupValsReader,
    UtTimePeriodReader,
)
from apps.datawarehouse.services.search_index.types import (
    BuildCounts,
    BuildResult,
    KeywordType,
    SearchKeywordRow,
    SynonymType,
)
from apps.datawarehouse.services.search_index.writers import SearchKeywordWriter, SearchNgramWriter, SearchSynonymWriter
from apps.datawarehouse.services.search_index.transform import (
    MAX_NGRAM_LEN,
    MAX_TEXT_LEN,
    clamp_language_code,
    clamp,
    build_area_keyword_and_synonyms,
    build_indicator_keyword_and_synonyms,
    build_subgroup_keyword_and_synonyms,
    build_timeperiod_keyword_and_synonyms,
)
from apps.shared.utils.ngrams import generate_trigrams

logger = logging.getLogger(__name__)


class SearchIndexBuilderService:
    """
    Builds / refreshes DW-side search tables from UT tables.

    This service is intentionally **DB-agnostic** with respect to connection lifecycle:
    callers provide an already-configured DW SQLAlchemy `Session`.
    """

    def __init__(
        self,
        *,
        language_reader: UtLanguageReader | None = None,
        indicator_reader: UtIndicatorReader | None = None,
        area_reader: UtAreaReader | None = None,
        subgroup_reader: UtSubgroupValsReader | None = None,
        timeperiod_reader: UtTimePeriodReader | None = None,
        keyword_writer: SearchKeywordWriter | None = None,
        synonym_writer: SearchSynonymWriter | None = None,
        ngram_writer: SearchNgramWriter | None = None,
    ) -> None:
        self._language_reader = language_reader or UtLanguageReader()
        self._indicator_reader = indicator_reader or UtIndicatorReader()
        self._area_reader = area_reader or UtAreaReader()
        self._subgroup_reader = subgroup_reader or UtSubgroupValsReader()
        self._timeperiod_reader = timeperiod_reader or UtTimePeriodReader()
        self._keyword_writer = keyword_writer or SearchKeywordWriter()
        self._synonym_writer = synonym_writer or SearchSynonymWriter()
        self._ngram_writer = ngram_writer or SearchNgramWriter()

    def build(
        self,
        dw_db: Session,
        *,
        batch_size: int = 1000,
        commit: bool = True,
    ) -> BuildResult:
        """
        Populate/refresh `search_*` tables in the external DW DB.

        The operation is designed to be idempotent:
        - keywords are upserted (MySQL ON DUPLICATE KEY UPDATE)
        - synonyms + ngrams are replaced per keyword_id (delete + insert)
        """
        language_codes = self._language_reader.read_language_codes(dw_db)
        counts = BuildCounts(languages=len(language_codes))

        logger.info("Search index build started. languages=%s", len(language_codes))

        # Read time periods once; re-seed per language (as per your loop requirement).
        timeperiod_rows = list(self._timeperiod_reader.read(dw_db))

        for language_code in language_codes:
            language_code = clamp_language_code(language_code)
            if not language_code:
                continue

            logger.info("Building search index for language=%s", language_code)

            counts = self._build_for_language(dw_db, language_code, timeperiod_rows, batch_size, counts)

            if commit:
                dw_db.commit()

        logger.info(
            "Search index build complete. languages=%s keywords_upserted=%s synonyms_inserted=%s ngrams_inserted=%s",
            counts.languages,
            counts.keywords_upserted,
            counts.synonyms_inserted,
            counts.ngrams_inserted,
        )
        return BuildResult(counts=counts)

    def _build_for_language(
        self,
        dw_db: Session,
        language_code: str,
        timeperiod_rows,
        batch_size: int,
        counts: BuildCounts,
    ) -> BuildCounts:
        counts = self._process_indicators(dw_db, language_code, batch_size, counts)
        counts = self._process_areas(dw_db, language_code, batch_size, counts)
        counts = self._process_subgroups(dw_db, language_code, batch_size, counts)
        counts = self._process_timeperiods(dw_db, language_code, timeperiod_rows, batch_size, counts)
        return counts

    def _flush_keyword_batch(
        self,
        dw_db: Session,
        *,
        language_code: str,
        keyword_type: KeywordType,
        keyword_rows: list[SearchKeywordRow],
        synonyms_by_entity_id: dict[int, list[tuple[str, str, SynonymType]]],
        batch_size: int,
        counts: BuildCounts,
    ) -> BuildCounts:
        if not keyword_rows:
            return counts

        counts = BuildCounts(
            languages=counts.languages,
            keywords_upserted=counts.keywords_upserted + self._keyword_writer.upsert(dw_db, keyword_rows),
            synonyms_inserted=counts.synonyms_inserted,
            ngrams_inserted=counts.ngrams_inserted,
        )

        entity_ids = [r.entity_id for r in keyword_rows]
        keyword_id_by_entity_id = self._keyword_writer.fetch_keyword_ids(
            dw_db,
            keyword_type=keyword_type.value,
            language_code=language_code,
            entity_ids=entity_ids,
            chunk_size=batch_size,
        )

        # Build synonym rows for this batch (idempotent replace per keyword_id).
        synonym_rows: list[dict] = []
        keyword_ids: set[int] = set()
        seen_syn: set[tuple[int, str, str]] = set()  # (keyword_id, normalized_synonym, synonym_type)
        for entity_id, seeds in synonyms_by_entity_id.items():
            keyword_id = keyword_id_by_entity_id.get(entity_id)
            if not keyword_id:
                continue
            for synonym_text, normalized_synonym, synonym_type in seeds:
                if not synonym_text or not normalized_synonym:
                    continue
                key = (keyword_id, normalized_synonym, synonym_type.value)
                if key in seen_syn:
                    continue
                seen_syn.add(key)
                keyword_ids.add(keyword_id)
                synonym_rows.append(
                    {
                        "keyword_id": keyword_id,
                        "language_code": language_code,
                        "synonym_text": clamp(synonym_text, MAX_TEXT_LEN),
                        "normalized_synonym": clamp(normalized_synonym, MAX_TEXT_LEN),
                        "synonym_type": synonym_type.value,
                    }
                )

        if keyword_ids:
            inserted = self._synonym_writer.replace_for_keyword_ids(
                dw_db,
                language_code=language_code,
                keyword_ids=sorted(keyword_ids),
                rows=synonym_rows,
                delete_chunk_size=batch_size,
            )
            counts = BuildCounts(
                languages=counts.languages,
                keywords_upserted=counts.keywords_upserted,
                synonyms_inserted=counts.synonyms_inserted + inserted,
                ngrams_inserted=counts.ngrams_inserted,
            )

        # Build trigram rows from canonical text AND synonym text so that
        # fuzzy searches on synonyms (e.g. partial abbreviation) also surface
        # the parent keyword.
        ngram_rows: list[dict] = []
        ngram_keyword_ids: set[int] = set()
        for kw in keyword_rows:
            keyword_id = keyword_id_by_entity_id.get(kw.entity_id)
            if not keyword_id:
                continue
            all_trigrams = generate_trigrams(kw.normalized_text)
            for _, normalized_synonym, _ in synonyms_by_entity_id.get(kw.entity_id, []):
                if normalized_synonym:
                    all_trigrams |= generate_trigrams(normalized_synonym)
            if not all_trigrams:
                continue
            ngram_keyword_ids.add(keyword_id)
            for tri in all_trigrams:
                ngram_rows.append({"keyword_id": keyword_id, "ngram": clamp(tri, MAX_NGRAM_LEN)})

        if ngram_keyword_ids:
            inserted = self._ngram_writer.replace_for_keyword_ids(
                dw_db,
                keyword_ids=sorted(ngram_keyword_ids),
                rows=ngram_rows,
                delete_chunk_size=batch_size,
            )
            counts = BuildCounts(
                languages=counts.languages,
                keywords_upserted=counts.keywords_upserted,
                synonyms_inserted=counts.synonyms_inserted,
                ngrams_inserted=counts.ngrams_inserted + inserted,
            )

        return counts

    def _process_indicators(self, dw_db: Session, language_code: str, batch_size: int, counts: BuildCounts) -> BuildCounts:
        keyword_rows: list[SearchKeywordRow] = []
        synonyms_by_entity_id: dict[int, list[tuple[str, str, SynonymType]]] = {}

        for row in self._indicator_reader.read(dw_db, language_code):
            keyword_row, seeds = build_indicator_keyword_and_synonyms(language_code=language_code, row=row)
            if not keyword_row:
                continue
            keyword_rows.append(keyword_row)
            if seeds:
                synonyms_by_entity_id[keyword_row.entity_id] = seeds

            if len(keyword_rows) >= batch_size:
                counts = self._flush_keyword_batch(
                    dw_db,
                    language_code=language_code,
                    keyword_type=KeywordType.INDICATOR,
                    keyword_rows=keyword_rows,
                    synonyms_by_entity_id=synonyms_by_entity_id,
                    batch_size=batch_size,
                    counts=counts,
                )
                keyword_rows = []
                synonyms_by_entity_id = {}

        return self._flush_keyword_batch(
            dw_db,
            language_code=language_code,
            keyword_type=KeywordType.INDICATOR,
            keyword_rows=keyword_rows,
            synonyms_by_entity_id=synonyms_by_entity_id,
            batch_size=batch_size,
            counts=counts,
        )

    def _process_areas(self, dw_db: Session, language_code: str, batch_size: int, counts: BuildCounts) -> BuildCounts:
        keyword_rows: list[SearchKeywordRow] = []
        synonyms_by_entity_id: dict[int, list[tuple[str, str, SynonymType]]] = {}

        for row in self._area_reader.read(dw_db, language_code):
            keyword_row, seeds = build_area_keyword_and_synonyms(language_code=language_code, row=row)
            if not keyword_row:
                continue
            keyword_rows.append(keyword_row)
            synonyms_by_entity_id[keyword_row.entity_id] = seeds

            if len(keyword_rows) >= batch_size:
                counts = self._flush_keyword_batch(
                    dw_db,
                    language_code=language_code,
                    keyword_type=KeywordType.AREA,
                    keyword_rows=keyword_rows,
                    synonyms_by_entity_id=synonyms_by_entity_id,
                    batch_size=batch_size,
                    counts=counts,
                )
                keyword_rows = []
                synonyms_by_entity_id = {}

        return self._flush_keyword_batch(
            dw_db,
            language_code=language_code,
            keyword_type=KeywordType.AREA,
            keyword_rows=keyword_rows,
            synonyms_by_entity_id=synonyms_by_entity_id,
            batch_size=batch_size,
            counts=counts,
        )

    def _process_subgroups(
        self, dw_db: Session, language_code: str, batch_size: int, counts: BuildCounts
    ) -> BuildCounts:
        keyword_rows: list[SearchKeywordRow] = []
        synonyms_by_entity_id: dict[int, list[tuple[str, str, SynonymType]]] = {}

        for row in self._subgroup_reader.read(dw_db, language_code):
            keyword_row, seeds = build_subgroup_keyword_and_synonyms(language_code=language_code, row=row)
            if not keyword_row:
                continue
            keyword_rows.append(keyword_row)
            synonyms_by_entity_id[keyword_row.entity_id] = seeds

            if len(keyword_rows) >= batch_size:
                counts = self._flush_keyword_batch(
                    dw_db,
                    language_code=language_code,
                    keyword_type=KeywordType.SUBGROUP,
                    keyword_rows=keyword_rows,
                    synonyms_by_entity_id=synonyms_by_entity_id,
                    batch_size=batch_size,
                    counts=counts,
                )
                keyword_rows = []
                synonyms_by_entity_id = {}

        return self._flush_keyword_batch(
            dw_db,
            language_code=language_code,
            keyword_type=KeywordType.SUBGROUP,
            keyword_rows=keyword_rows,
            synonyms_by_entity_id=synonyms_by_entity_id,
            batch_size=batch_size,
            counts=counts,
        )

    def _process_timeperiods(
        self, dw_db: Session, language_code: str, timeperiod_rows, batch_size: int, counts: BuildCounts
    ) -> BuildCounts:
        keyword_rows: list[SearchKeywordRow] = []
        synonyms_by_entity_id: dict[int, list[tuple[str, str, SynonymType]]] = {}

        for row in timeperiod_rows:
            keyword_row, seeds = build_timeperiod_keyword_and_synonyms(language_code=language_code, row=row)
            if not keyword_row:
                continue
            keyword_rows.append(keyword_row)
            synonyms_by_entity_id[keyword_row.entity_id] = seeds

            if len(keyword_rows) >= batch_size:
                counts = self._flush_keyword_batch(
                    dw_db,
                    language_code=language_code,
                    keyword_type=KeywordType.TIME_PERIOD,
                    keyword_rows=keyword_rows,
                    synonyms_by_entity_id=synonyms_by_entity_id,
                    batch_size=batch_size,
                    counts=counts,
                )
                keyword_rows = []
                synonyms_by_entity_id = {}

        return self._flush_keyword_batch(
            dw_db,
            language_code=language_code,
            keyword_type=KeywordType.TIME_PERIOD,
            keyword_rows=keyword_rows,
            synonyms_by_entity_id=synonyms_by_entity_id,
            batch_size=batch_size,
            counts=counts,
        )

