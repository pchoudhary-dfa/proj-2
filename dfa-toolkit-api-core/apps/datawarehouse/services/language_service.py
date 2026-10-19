import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.datawarehouse.db.datawarehouse import (
    get_warehouse_session_from_id,
    get_cached_dw_language_info,
    invalidate_dw_language_cache,
)
from apps.datawarehouse.models.datawarehouse import Language
from apps.datawarehouse.schemas.language import LanguageCreateSchema, LanguagePatchSchema
from apps.shared.exceptions import BadRequest, Conflict, Forbidden, InternalError, NotFound
from apps.shared.utils.validators import normalize_language_code_value
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_LANGUAGE_SERVICE_SOURCE = "apps.datawarehouse.services.language_service"


_LANG_CODE_RE = re.compile(r"^[a-z]{2,10}$")


def get_dw_language_codes(dw_id: str) -> List[str]:
    """
    Return all language codes registered in this data warehouse's ut_language table.
    Results are served from the per-DW TTL cache (refreshed every 120 s) so the DB is
    not queried on every loop call.  Use this for create/update/delete locale iterations.
    """
    return get_cached_dw_language_info(dw_id).codes


class LanguageService:
    """
    CRUD for ut_language + localized table create/drop.

    Note: Data warehouse DDL/data-copy is implemented for MySQL warehouses.
    """

    # These tables are the ones used for dependency checks (translated differences).
    _DEPENDENCY_TABLE_BASES = [
        "ut_indicator",
        "ut_indicator_classifications",
        "ut_unit",
        "ut_subgroup_vals",
        "ut_subgroup_type",
        "ut_subgroup",
        "ut_metadata_category",
        "ut_metadatareport",
        "ut_ui_strings",  # optional (may not exist in all DWs)
    ]

    _DEPENDENCY_KEY_MAP = {
        "ut_indicator": "indicators",
        "ut_indicator_classifications": "classifications",
        "ut_unit": "units",
        "ut_subgroup_vals": "subgroups",
        "ut_subgroup_type": "subgroup_categories",
        "ut_subgroup": "subgroup_category_values",
        "ut_metadata_category": "metadata",
        "ut_metadatareport": "metadata_reports",
        "ut_ui_strings": "ui_strings",
    }

    def list_languages(self, dw_id: str) -> List[Dict[str, Any]]:
        with get_warehouse_session_from_id(dw_id) as dw_db:
            rows = (
                dw_db.query(Language)
                .order_by(Language.language_default.desc(), Language.language_code.asc())
                .all()
            )
            return [self._record_to_dict(r) for r in rows]

    def get_language_by_code(self, dw_id: str, lang_code: str) -> Optional[Dict[str, Any]]:
        lang_code = self._normalize_lang_code(lang_code)
        with get_warehouse_session_from_id(dw_id) as dw_db:
            row = (
                dw_db.query(Language)
                .filter(Language.language_code == lang_code)
                .first()
            )
            return self._record_to_dict(row) if row else None

    def create_language(self, dw_id: str, data: LanguageCreateSchema) -> Dict[str, Any]:
        lang_code = self._normalize_lang_code(data.language_code)
        source_lang = self._normalize_lang_code(data.source_lang) if getattr(data, "source_lang", None) else None
        if source_lang and source_lang == lang_code:
            raise BadRequest("source_lang must be different from language_code")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            self._require_mysql(dw_db)

            existing = dw_db.query(Language).filter(Language.language_code == lang_code).first()
            if existing:
                raise Conflict(f"Duplicate language code '{lang_code}'")

            default_code = self._resolve_default_language_code(dw_db)
            if default_code == lang_code:
                raise Conflict(f"Language '{lang_code}' already exists as default language")

            clone_from_code = source_lang or default_code

            prev_default_code: Optional[str] = None
            if bool(data.language_default):
                prev_default = (
                    dw_db.query(Language)
                    .filter(Language.language_default.is_(True))
                    .first()
                )
                prev_default_code = getattr(prev_default, "language_code", None) if prev_default else None
                dw_db.query(Language).update({Language.language_default: False})

            created_tables: List[str] = []
            try:
                record = Language(
                    language_name=data.language_name,
                    language_code=lang_code,
                    language_default=bool(data.language_default),
                    language_globallock=bool(data.language_globallock),
                )
                dw_db.add(record)
                dw_db.flush()  # assign PK

                # Clone ALL locale tables from the requested source (or resolved default locale)
                created_tables = self._clone_all_locale_tables(dw_db, clone_from_code, lang_code)

                dw_db.refresh(record)
                result = self._record_to_dict(record)
                invalidate_dw_language_cache(dw_id)
                return result
            except Exception as e:
                log_background_incident(
                    message=(
                        f"Failed to create language '{lang_code}' in dw_id={dw_id!r}: {e}"
                    ),
                    error_code="LANGUAGE_CREATE_FAILED",
                    exc=e,
                    source=_LANGUAGE_SERVICE_SOURCE,
                )
                # Best-effort cleanup: drop created tables + delete ut_language row and restore previous default flag.
                self._cleanup_failed_language_create(
                    dw_db,
                    lang_code=lang_code,
                    created_tables=created_tables,
                    prev_default_code=prev_default_code,
                )
                raise

    def delete_language(self, dw_id: str, lang_code: str) -> Tuple[bool, Dict[str, int]]:
        """
        Delete language configuration. Returns (deleted, dependency_counts).
        """
        lang_code = self._normalize_lang_code(lang_code)

        with get_warehouse_session_from_id(dw_id) as dw_db:
            self._require_mysql(dw_db)

            record = (
                dw_db.query(Language)
                .filter(Language.language_code == lang_code)
                .first()
            )
            if not record:
                raise NotFound("Language not found")

            if bool(getattr(record, "language_default", False) or False):
                raise Forbidden("Default language cannot be deleted", error_code="LANGUAGE_IS_DEFAULT")

            if bool(getattr(record, "language_globallock", False) or False):
                raise Forbidden("Globally locked language cannot be deleted", error_code="LANGUAGE_GLOBALLOCK")

            from apps.datawarehouse.utils.audit_events import (
                buffer_manual_audit,
                snapshot_entity_for_audit,
            )

            tables_to_drop = self._get_locale_tables(dw_db, lang_code)
            buffer_manual_audit(
                dw_db,
                action="DELETE",
                module="language",
                identifier=lang_code,
                previous_value=snapshot_entity_for_audit(record),
                description=(
                    f"Deleted language {lang_code!r}; dropped {len(tables_to_drop)} locale table(s)"
                ),
            )

            for t in tables_to_drop:
                dw_db.execute(text(f"DROP TABLE IF EXISTS `{t}`"))

            dw_db.query(Language).filter(Language.language_code == lang_code).delete(synchronize_session=False)
            invalidate_dw_language_cache(dw_id)
            return True, {}

    def patch_language(self, dw_id: str, lang_code: str, data: LanguagePatchSchema) -> Dict[str, Any]:
        lang_code = self._normalize_lang_code(lang_code)

        with get_warehouse_session_from_id(dw_id) as dw_db:
            record = (
                dw_db.query(Language)
                .filter(Language.language_code == lang_code)
                .first()
            )
            if not record:
                raise NotFound("Language not found")

            if data.language_name is not None:
                record.language_name = data.language_name

            if data.language_default is not None:
                if data.language_default:
                    dw_db.query(Language).update({Language.language_default: False})
                    record.language_default = True
                else:
                    if bool(getattr(record, "language_default", False) or False):
                        default_rows = (
                            dw_db.query(Language)
                            .filter(Language.language_default.is_(True))
                            .count()
                        )
                        if default_rows <= 1:
                            raise BadRequest(
                                "Cannot remove default; set another language as default first"
                            )
                    record.language_default = False

            dw_db.commit()
            dw_db.refresh(record)
            invalidate_dw_language_cache(dw_id)
            return self._record_to_dict(record)

    # -------------------------
    # Internal helpers
    # -------------------------

    def _normalize_lang_code(self, lang_code: str) -> str:
        code = normalize_language_code_value(lang_code)
        if not code or not _LANG_CODE_RE.match(code):
            raise BadRequest(f"Invalid language code '{lang_code}'")
        return code

    def _require_mysql(self, dw_db: Session) -> None:
        dialect = dw_db.get_bind().dialect.name
        if dialect != "mysql":
            raise NotImplementedError(
                f"Language table cloning is implemented for MySQL DWs only. Dialect={dialect!r}"
            )

    def _record_to_dict(self, record: Any) -> Dict[str, Any]:
        return {
            "language_nid": int(getattr(record, "language_nid")),
            "language_name": getattr(record, "language_name", None),
            "language_code": getattr(record, "language_code", None),
            "language_default": bool(getattr(record, "language_default", False) or False),
            "language_globallock": bool(getattr(record, "language_globallock", False) or False),
        }

    def _resolve_default_language_code(self, dw_db: Session) -> str:
        # Order: explicit default, fallback to 'en'
        row = dw_db.query(Language).filter(Language.language_default.is_(True)).first()
        if row and getattr(row, "language_code", None):
            return self._normalize_lang_code(row.language_code)
        en = dw_db.query(Language).filter(Language.language_code == "en").first()
        if en:
            return "en"
        raise InternalError("Default language could not be resolved (no default and no 'en' found)")

    def _get_locale_tables(self, dw_db: Session, lang_code: str) -> List[str]:
        lang_code = self._normalize_lang_code(lang_code)
        suffix = f"_{lang_code}"
        rows = dw_db.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_type = 'BASE TABLE'
                  AND table_name LIKE :pattern
                """
            ),
            {"pattern": f"%{suffix}"},
        ).fetchall()
        return sorted([r[0] for r in rows])

    def _table_exists(self, dw_db: Session, table_name: str) -> bool:
        row = dw_db.execute(
            text(
                """
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = :t
                LIMIT 1
                """
            ),
            {"t": table_name},
        ).fetchone()
        return bool(row)

    def _clone_all_locale_tables(self, dw_db: Session, src_lang: str, dst_lang: str) -> List[str]:
        src_lang = self._normalize_lang_code(src_lang)
        dst_lang = self._normalize_lang_code(dst_lang)
        src_tables = self._get_locale_tables(dw_db, src_lang)
        if not src_tables:
            raise NotFound(f"No locale tables found for source language '{src_lang}'")

        created: List[str] = []
        suffix_len = len(f"_{src_lang}")
        dst_tables = [t[:-suffix_len] + f"_{dst_lang}" for t in src_tables]

        existing_dst = [t for t in dst_tables if self._table_exists(dw_db, t)]
        if existing_dst:
            raise ValueError(
                f"Locale tables already exist for '{dst_lang}': {', '.join(existing_dst[:5])}"
                + (" ..." if len(existing_dst) > 5 else "")
            )

        for src_table, dst_table in zip(src_tables, dst_tables):
            # DDL: clone structure
            dw_db.execute(text(f"CREATE TABLE `{dst_table}` LIKE `{src_table}`"))
            created.append(dst_table)

            # Data copy: full replication
            dw_db.execute(text(f"INSERT INTO `{dst_table}` SELECT * FROM `{src_table}`"))

            # Auto-increment state: copy from source
            ai = dw_db.execute(
                text(
                    """
                    SELECT AUTO_INCREMENT
                    FROM information_schema.tables
                    WHERE table_schema = DATABASE()
                      AND table_name = :t
                    """
                ),
                {"t": src_table},
            ).scalar()
            if ai is not None:
                dw_db.execute(text(f"ALTER TABLE `{dst_table}` AUTO_INCREMENT = {int(ai)}"))

        return created

    def _cleanup_failed_language_create(
        self,
        dw_db: Session,
        *,
        lang_code: str,
        created_tables: List[str],
        prev_default_code: Optional[str],
    ) -> None:
        try:
            dw_db.rollback()
        except Exception:
            # rollback itself failed; continue best-effort cleanup
            pass

        try:
            for t in created_tables:
                try:
                    dw_db.execute(text(f"DROP TABLE IF EXISTS `{t}`"))
                except Exception as drop_exc:
                    log_background_incident(
                        message=f"Failed to drop table during cleanup: {t}",
                        error_code="LANGUAGE_CREATE_CLEANUP_DROP_FAILED",
                        exc=drop_exc,
                        source=_LANGUAGE_SERVICE_SOURCE,
                    )

            try:
                dw_db.query(Language).filter(Language.language_code == lang_code).delete(
                    synchronize_session=False
                )
            except Exception as del_exc:
                log_background_incident(
                    message=(
                        f"Failed to delete ut_language row during cleanup: {lang_code}"
                    ),
                    error_code="LANGUAGE_CREATE_CLEANUP_DELETE_ROW_FAILED",
                    exc=del_exc,
                    source=_LANGUAGE_SERVICE_SOURCE,
                )

            if prev_default_code:
                dw_db.query(Language).filter(Language.language_code == prev_default_code).update(
                    {Language.language_default: True}
                )

            dw_db.commit()
        except Exception as cleanup_exc:
            try:
                dw_db.rollback()
            except Exception:
                pass
            log_background_incident(
                message="Language create cleanup failed; DW may be inconsistent.",
                error_code="LANGUAGE_CREATE_CLEANUP_FAILED",
                exc=cleanup_exc,
                source=_LANGUAGE_SERVICE_SOURCE,
            )

    def _get_dependency_counts(self, dw_db: Session, default_code: str, lang_code: str) -> Dict[str, int]:
        default_code = self._normalize_lang_code(default_code)
        lang_code = self._normalize_lang_code(lang_code)

        counts: Dict[str, int] = {}
        for base in self._DEPENDENCY_TABLE_BASES:
            cnt = self._count_table_differences(dw_db, base, default_code, lang_code)
            key = self._DEPENDENCY_KEY_MAP.get(base, base)
            counts[key] = int(cnt)

        # remove zero-only if you prefer smaller payload; caller can decide.
        return counts

    def _get_pk_cols(self, dw_db: Session, table_name: str) -> List[str]:
        rows = dw_db.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.key_column_usage
                WHERE table_schema = DATABASE()
                  AND table_name = :t
                  AND constraint_name = 'PRIMARY'
                ORDER BY ordinal_position
                """
            ),
            {"t": table_name},
        ).fetchall()
        return [r[0] for r in rows]

    def _get_all_cols(self, dw_db: Session, table_name: str) -> List[str]:
        rows = dw_db.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = :t
                ORDER BY ordinal_position
                """
            ),
            {"t": table_name},
        ).fetchall()
        return [r[0] for r in rows]

    def _count_table_differences(
        self, dw_db: Session, base: str, default_code: str, lang_code: str
    ) -> int:
        src = f"{base}_{default_code}"
        trg = f"{base}_{lang_code}"
        if not self._table_exists(dw_db, src) or not self._table_exists(dw_db, trg):
            return 0

        pk_cols = self._get_pk_cols(dw_db, src)
        if not pk_cols:
            return 0

        src_cols = self._get_all_cols(dw_db, src)
        trg_cols = self._get_all_cols(dw_db, trg)
        common_cols = [c for c in src_cols if c in set(trg_cols)]
        non_pk = [c for c in common_cols if c not in set(pk_cols)]
        if not non_pk:
            return 0

        on_clause = " AND ".join([f"t.`{c}` = d.`{c}`" for c in pk_cols])
        # Use NULL-safe comparisons
        diffs = " OR ".join(
            [f"(t.`{c}` <> d.`{c}` OR (t.`{c}` IS NULL) <> (d.`{c}` IS NULL))" for c in non_pk]
        )
        first_pk = pk_cols[0]

        diff_rows = dw_db.execute(
            text(f"SELECT COUNT(*) FROM `{trg}` t JOIN `{src}` d ON {on_clause} WHERE {diffs}")
        ).scalar() or 0
        new_rows = dw_db.execute(
            text(
                f"SELECT COUNT(*) FROM `{trg}` t LEFT JOIN `{src}` d ON {on_clause} WHERE d.`{first_pk}` IS NULL"
            )
        ).scalar() or 0
        missing_rows = dw_db.execute(
            text(
                f"SELECT COUNT(*) FROM `{src}` d LEFT JOIN `{trg}` t ON {on_clause} WHERE t.`{first_pk}` IS NULL"
            )
        ).scalar() or 0

        return int(diff_rows) + int(new_rows) + int(missing_rows)

