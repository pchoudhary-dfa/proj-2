from __future__ import annotations

from collections.abc import Iterable, Sequence

from sqlalchemy import delete, select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from apps.datawarehouse.services.search_index.tables import (
    search_keyword_ngram,
    search_keyword_synonym,
    search_keywords,
)
from apps.datawarehouse.services.search_index.types import SearchKeywordRow


def _chunks(seq: Sequence[int], size: int) -> Iterable[list[int]]:
    for i in range(0, len(seq), size):
        yield list(seq[i : i + size])


class SearchKeywordWriter:
    """
    Writes to `search_keywords` using dialect-appropriate upsert semantics.

    Assumes a unique constraint exists on (keyword_type, entity_id, language_code).
    """

    def upsert(self, dw_db: Session, rows: list[SearchKeywordRow]) -> int:
        if not rows:
            return 0

        values = [
            {
                "keyword_type": r.keyword_type.value,
                "language_code": r.language_code,
                "canonical_text": r.canonical_text,
                "normalized_text": r.normalized_text,
                "entity_id": r.entity_id,
            }
            for r in rows
        ]

        bind = dw_db.get_bind()
        dialect = getattr(getattr(bind, "dialect", None), "name", None)

        if dialect in ("mysql", "mariadb"):
            stmt = mysql_insert(search_keywords).values(values)
            stmt = stmt.on_duplicate_key_update(
                canonical_text=stmt.inserted.canonical_text,
                normalized_text=stmt.inserted.normalized_text,
            )
        elif dialect == "postgresql":
            stmt = pg_insert(search_keywords).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=[
                    search_keywords.c.keyword_type,
                    search_keywords.c.entity_id,
                    search_keywords.c.language_code,
                ],
                set_={
                    "canonical_text": stmt.excluded.canonical_text,
                    "normalized_text": stmt.excluded.normalized_text,
                },
            )
        else:
            raise ValueError(f"Unsupported DW dialect for keyword upsert: {dialect!r}")

        result = dw_db.execute(stmt)
        # MySQL reports "affected rows" for upserts inconsistently; treat as best-effort.
        return int(getattr(result, "rowcount", 0) or 0)

    def fetch_keyword_ids(
        self,
        dw_db: Session,
        *,
        keyword_type: str,
        language_code: str,
        entity_ids: Sequence[int],
        chunk_size: int = 1000,
    ) -> dict[int, int]:
        """
        Returns mapping: entity_id -> keyword_id for a given language.
        """
        if not entity_ids:
            return {}

        mapping: dict[int, int] = {}
        for batch in _chunks(list(entity_ids), chunk_size):
            stmt = (
                select(search_keywords.c.id, search_keywords.c.entity_id)
                .where(search_keywords.c.keyword_type == keyword_type)
                .where(search_keywords.c.language_code == language_code)
                .where(search_keywords.c.entity_id.in_(batch))
            )
            for row in dw_db.execute(stmt):
                keyword_id = int(row[0])
                entity_id = int(row[1])
                mapping[entity_id] = keyword_id
        return mapping

    def delete_by_identity(
        self,
        dw_db: Session,
        *,
        keyword_type: str,
        language_code: str,
        entity_id: int,
    ) -> int:
        """
        Delete a keyword by its natural identity.

        Note:
        - If the DB schema has FK cascades from synonyms/ngrams to search_keywords,
          dependents will be removed automatically.
        - If not, callers should delete dependents explicitly (incremental updater does).
        """
        stmt = (
            delete(search_keywords)
            .where(search_keywords.c.keyword_type == keyword_type)
            .where(search_keywords.c.language_code == language_code)
            .where(search_keywords.c.entity_id == int(entity_id))
        )
        result = dw_db.execute(stmt)
        return int(getattr(result, "rowcount", 0) or 0)

    def fetch_keyword_id(
        self,
        dw_db: Session,
        *,
        keyword_type: str,
        language_code: str,
        entity_id: int,
    ) -> int | None:
        stmt = (
            select(search_keywords.c.id)
            .where(search_keywords.c.keyword_type == keyword_type)
            .where(search_keywords.c.language_code == language_code)
            .where(search_keywords.c.entity_id == int(entity_id))
            .limit(1)
        )
        row = dw_db.execute(stmt).first()
        if not row:
            return None
        return int(row[0])


class SearchSynonymWriter:
    """
    Idempotent synonym writes by (re)seeding per keyword_id.

    Since the requirements don't state a uniqueness constraint for synonyms, we:
    - delete existing synonyms for keyword_ids (scoped by language_code), then
    - bulk insert the newly computed synonyms.
    """

    def replace_for_keyword_ids(
        self,
        dw_db: Session,
        *,
        language_code: str,
        keyword_ids: Sequence[int],
        rows: list[dict],
        delete_chunk_size: int = 1000,
    ) -> int:
        if not keyword_ids:
            return 0

        for batch in _chunks(list(keyword_ids), delete_chunk_size):
            dw_db.execute(
                delete(search_keyword_synonym)
                .where(search_keyword_synonym.c.language_code == language_code)
                .where(search_keyword_synonym.c.keyword_id.in_(batch))
            )

        if not rows:
            return 0

        result = dw_db.execute(search_keyword_synonym.insert().values(rows))
        return int(getattr(result, "rowcount", 0) or 0)

    def delete_for_keyword_ids(
        self,
        dw_db: Session,
        *,
        language_code: str,
        keyword_ids: Sequence[int],
        delete_chunk_size: int = 1000,
    ) -> int:
        if not keyword_ids:
            return 0
        total = 0
        for batch in _chunks(list(keyword_ids), delete_chunk_size):
            result = dw_db.execute(
                delete(search_keyword_synonym)
                .where(search_keyword_synonym.c.language_code == language_code)
                .where(search_keyword_synonym.c.keyword_id.in_(batch))
            )
            total += int(getattr(result, "rowcount", 0) or 0)
        return total


class SearchNgramWriter:
    """
    Idempotent ngram writes by replacing per keyword_id.
    """

    def replace_for_keyword_ids(
        self,
        dw_db: Session,
        *,
        keyword_ids: Sequence[int],
        rows: list[dict],
        delete_chunk_size: int = 1000,
    ) -> int:
        if not keyword_ids:
            return 0

        for batch in _chunks(list(keyword_ids), delete_chunk_size):
            dw_db.execute(delete(search_keyword_ngram).where(search_keyword_ngram.c.keyword_id.in_(batch)))

        if not rows:
            return 0

        result = dw_db.execute(search_keyword_ngram.insert().values(rows))
        return int(getattr(result, "rowcount", 0) or 0)

    def delete_for_keyword_ids(
        self,
        dw_db: Session,
        *,
        keyword_ids: Sequence[int],
        delete_chunk_size: int = 1000,
    ) -> int:
        if not keyword_ids:
            return 0
        total = 0
        for batch in _chunks(list(keyword_ids), delete_chunk_size):
            result = dw_db.execute(delete(search_keyword_ngram).where(search_keyword_ngram.c.keyword_id.in_(batch)))
            total += int(getattr(result, "rowcount", 0) or 0)
        return total
