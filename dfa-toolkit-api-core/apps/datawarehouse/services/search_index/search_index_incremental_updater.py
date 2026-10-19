from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from apps.datawarehouse.services.search_index.readers import (
    UtAreaReader,
    UtIndicatorReader,
    UtSubgroupValsReader,
    UtTimePeriodReader,
)
from apps.datawarehouse.services.search_index.types import KeywordType, SearchKeywordRow, SynonymType
from apps.datawarehouse.services.search_index.writers import SearchKeywordWriter, SearchNgramWriter, SearchSynonymWriter
from apps.datawarehouse.services.search_index.transform import (
    MAX_NGRAM_LEN,
    MAX_TEXT_LEN,
    clamp,
    clamp_language_code,
    build_area_keyword_and_synonyms,
    build_indicator_keyword_and_synonyms,
    build_subgroup_keyword_and_synonyms,
    build_timeperiod_keyword_and_synonyms,
)
from apps.shared.utils.ngrams import generate_trigrams

logger = logging.getLogger(__name__)


class SearchIndexIncrementalUpdater:
    """
    Incrementally updates search tables for a single entity row.

    Inputs are (keyword_type, language_code, entity_id). The updater fetches the
    UT row from the DW database and then updates search tables accordingly.
    """

    def __init__(
        self,
        *,
        indicator_reader: UtIndicatorReader | None = None,
        area_reader: UtAreaReader | None = None,
        subgroup_reader: UtSubgroupValsReader | None = None,
        timeperiod_reader: UtTimePeriodReader | None = None,
        keyword_writer: SearchKeywordWriter | None = None,
        synonym_writer: SearchSynonymWriter | None = None,
        ngram_writer: SearchNgramWriter | None = None,
    ) -> None:
        self._indicator_reader = indicator_reader or UtIndicatorReader()
        self._area_reader = area_reader or UtAreaReader()
        self._subgroup_reader = subgroup_reader or UtSubgroupValsReader()
        self._timeperiod_reader = timeperiod_reader or UtTimePeriodReader()
        self._keyword_writer = keyword_writer or SearchKeywordWriter()
        self._synonym_writer = synonym_writer or SearchSynonymWriter()
        self._ngram_writer = ngram_writer or SearchNgramWriter()

    def upsert(
        self,
        dw_db: Session,
        *,
        keyword_type: KeywordType,
        language_code: str,
        entity_id: int,
        commit: bool = True,
    ) -> None:
        """
        Upsert a single entity into search tables.

        If the UT row does not exist, this method falls back to `delete(...)`
        to keep search tables consistent.
        """
        language_code = clamp_language_code(language_code)
        if not language_code:
            raise ValueError("language_code is required")

        keyword_row, synonym_seeds = self._fetch_and_transform(
            dw_db,
            keyword_type=keyword_type,
            language_code=language_code,
            entity_id=entity_id,
        )

        if keyword_row is None:
            self.delete(dw_db, keyword_type=keyword_type, language_code=language_code, entity_id=entity_id, commit=commit)
            return

        # 1) upsert keyword
        self._keyword_writer.upsert(dw_db, [keyword_row])

        # 2) resolve keyword_id
        keyword_id_by_entity_id = self._keyword_writer.fetch_keyword_ids(
            dw_db,
            keyword_type=keyword_type.value,
            language_code=language_code,
            entity_ids=[keyword_row.entity_id],
            chunk_size=1,
        )
        keyword_id = keyword_id_by_entity_id.get(keyword_row.entity_id)
        if not keyword_id:
            raise RuntimeError("Failed to resolve keyword_id after upsert")

        # 3) replace synonyms (single keyword_id)
        synonym_rows: list[dict] = []
        seen: set[tuple[str, str]] = set()  # (normalized_synonym, synonym_type)
        for synonym_text, normalized_synonym, synonym_type in synonym_seeds:
            if not synonym_text or not normalized_synonym:
                continue
            key = (normalized_synonym, synonym_type.value)
            if key in seen:
                continue
            seen.add(key)
            synonym_rows.append(
                {
                    "keyword_id": keyword_id,
                    "language_code": language_code,
                    "synonym_text": clamp(synonym_text, MAX_TEXT_LEN),
                    "normalized_synonym": clamp(normalized_synonym, MAX_TEXT_LEN),
                    "synonym_type": synonym_type.value,
                }
            )
        self._synonym_writer.replace_for_keyword_ids(
            dw_db,
            language_code=language_code,
            keyword_ids=[keyword_id],
            rows=synonym_rows,
            delete_chunk_size=1,
        )

        # 4) replace ngrams (single keyword_id) — include synonym text so
        #    fuzzy searches on abbreviations/aliases also surface this keyword.
        all_trigrams = generate_trigrams(keyword_row.normalized_text)
        for _, normalized_synonym, _ in synonym_seeds:
            if normalized_synonym:
                all_trigrams |= generate_trigrams(normalized_synonym)
        ngram_rows = [{"keyword_id": keyword_id, "ngram": clamp(ng, MAX_NGRAM_LEN)} for ng in sorted(all_trigrams)]
        self._ngram_writer.replace_for_keyword_ids(
            dw_db,
            keyword_ids=[keyword_id],
            rows=ngram_rows,
            delete_chunk_size=1,
        )

        if commit:
            dw_db.commit()

    def delete(
        self,
        dw_db: Session,
        *,
        keyword_type: KeywordType,
        language_code: str,
        entity_id: int,
        commit: bool = True,
    ) -> None:
        """
        Delete a single entity from search tables.

        - Attempts to delete synonyms/ngrams explicitly first (works even without FK cascades).
        - Deletes the keyword by (keyword_type, language_code, entity_id).
        """
        language_code = clamp_language_code(language_code)
        if not language_code:
            raise ValueError("language_code is required")

        keyword_id = self._keyword_writer.fetch_keyword_id(
            dw_db,
            keyword_type=keyword_type.value,
            language_code=language_code,
            entity_id=entity_id,
        )
        if keyword_id:
            self._synonym_writer.delete_for_keyword_ids(dw_db, language_code=language_code, keyword_ids=[keyword_id], delete_chunk_size=1)
            self._ngram_writer.delete_for_keyword_ids(dw_db, keyword_ids=[keyword_id], delete_chunk_size=1)

        self._keyword_writer.delete_by_identity(
            dw_db,
            keyword_type=keyword_type.value,
            language_code=language_code,
            entity_id=entity_id,
        )

        if commit:
            dw_db.commit()

    def _fetch_and_transform(
        self,
        dw_db: Session,
        *,
        keyword_type: KeywordType,
        language_code: str,
        entity_id: int,
    ) -> tuple[SearchKeywordRow | None, list[tuple[str, str, SynonymType]]]:
        """
        Returns (keyword_row, synonym_seeds).
        synonym_seeds: list of (synonym_text, normalized_synonym, synonym_type)
        """
        if keyword_type == KeywordType.INDICATOR:
            row = self._indicator_reader.read_one(dw_db, language_code, entity_id)
            if not row:
                return None, []
            return build_indicator_keyword_and_synonyms(language_code=language_code, row=row)

        if keyword_type == KeywordType.AREA:
            row = self._area_reader.read_one(dw_db, language_code, entity_id)
            if not row:
                return None, []
            return build_area_keyword_and_synonyms(language_code=language_code, row=row)

        if keyword_type == KeywordType.SUBGROUP:
            row = self._subgroup_reader.read_one(dw_db, language_code, entity_id)
            if not row:
                return None, []
            return build_subgroup_keyword_and_synonyms(language_code=language_code, row=row)

        if keyword_type == KeywordType.TIME_PERIOD:
            row = self._timeperiod_reader.read_one(dw_db, entity_id)
            if not row:
                return None, []
            return build_timeperiod_keyword_and_synonyms(language_code=language_code, row=row)

        raise ValueError(f"Unsupported keyword_type: {keyword_type}")

