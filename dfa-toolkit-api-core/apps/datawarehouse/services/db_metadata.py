"""
DB metadata (ut_dbmetadata_*) service.

Maintains count columns (dbmtd_areacnt, dbmtd_indcnt, dbmtd_iuscnt, dbmtd_timecnt,
dbmtd_srccnt, dbmtd_datacnt) in ut_dbmetadata_ar, ut_dbmetadata_en, ut_dbmetadata_fr, etc.
Counts are computed from: ut_area_{lang}, ut_indicator_{lang},
ut_indicator_classifications_{lang} (SR sources only, excluding publisher parent),
ut_indicator_unit_subgroup, ut_timeperiod, ut_data.

Warehouse services call notify_dbmetadata_counts_changed(dw_id) after mutations that affect
these counts. published_by is taken from the dbmetadata_published_by ContextVar (set by auth
middleware on JWT requests) unless passed explicitly. Use get_dbmetadata_counts for the GET API.
"""
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from apps.shared.middleware.request_context import dbmetadata_published_by
from apps.datawarehouse.constants import IC_TYPE_SR, SOURCE_PUBLISHER_PARENT_NID
from apps.datawarehouse.db.datawarehouse import (
    get_cached_dw_language_info,
    get_warehouse_session_from_id,
)
from apps.datawarehouse.models.datawarehouse import (
    Area,
    Data,
    DbMetadata,
    DbVersion,
    Indicator,
    IndicatorClassification,
    IndicatorUnitSubgroup,
    TimePeriod,
)
from apps.datawarehouse.utils.response_filter import apply_external_response_mapping
from apps.shared.exceptions import BadRequest

logger = logging.getLogger(__name__)

# Only allow safe language suffixes for table names (alphanumeric, typically 2-5 chars)
_SAFE_LANG_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,10}$")
# ut_dbmetadata_*.dbmtd_pubname column max length
_DBMETADATA_PUBNAME_MAX_LEN = 50


def _safe_lang(lang_code: str) -> str:
    """Return normalized language code safe for use in table names; raise if invalid."""
    if not lang_code or not isinstance(lang_code, str):
        raise BadRequest("Language code is required")
    normalized = lang_code.strip().lower()
    if not _SAFE_LANG_PATTERN.match(normalized):
        raise BadRequest(f"Invalid language code for table name: {lang_code!r}")
    return normalized


def _compute_counts(dw_db: Session, lang_code: str) -> Dict[str, float]:
    """
    Compute current counts for the warehouse for the given language.
    Uses ORM: Area, Indicator, IndicatorClassification (SR sources excluding publisher parent),
    IUS, TimePeriod, Data.
    """
    lang = _safe_lang(lang_code)
    counts: Dict[str, float] = {
        "dbmtd_areacnt": 0,
        "dbmtd_indcnt": 0,
        "dbmtd_iuscnt": 0,
        "dbmtd_timecnt": 0,
        "dbmtd_srccnt": 0,
        "dbmtd_datacnt": 0,
    }
    # Lang-specific tables (may not exist for all warehouses)
    try:
        AreaModel = Area(lang)
        counts["dbmtd_areacnt"] = float(dw_db.query(AreaModel).count())
    except Exception as e:
        logger.debug("ut_area_%s count failed: %s", lang, e)
    try:
        IndicatorModel = Indicator(lang)
        counts["dbmtd_indcnt"] = float(dw_db.query(IndicatorModel).count())
    except Exception as e:
        logger.debug("ut_indicator_%s count failed: %s", lang, e)
    try:
        IcModel = IndicatorClassification(lang)
        counts["dbmtd_srccnt"] = float(
            dw_db.query(IcModel)
            .filter(
                IcModel.ic_type == IC_TYPE_SR,
                IcModel.ic_parent_nid != SOURCE_PUBLISHER_PARENT_NID,
            )
            .count()
        )
    except Exception as e:
        logger.debug("ut_indicator_classifications_%s source count failed: %s", lang, e)

    # Non-locale tables
    try:
        counts["dbmtd_iuscnt"] = float(dw_db.query(IndicatorUnitSubgroup).count())
    except Exception as e:
        logger.debug("ut_indicator_unit_subgroup count failed: %s", e)
    try:
        counts["dbmtd_timecnt"] = float(dw_db.query(TimePeriod).count())
    except Exception as e:
        logger.debug("ut_timeperiod count failed: %s", e)
    try:
        counts["dbmtd_datacnt"] = float(dw_db.query(Data).count())
    except Exception as e:
        logger.debug("ut_data count failed: %s", e)

    return counts


def _update_or_insert_metadata(
    dw_db: Session,
    lang_code: str,
    counts: Dict[str, float],
    published_by: Optional[str] = None,
) -> None:
    """Update existing row in ut_dbmetadata_{lang} or insert if none (dbmtd_nid=1)."""
    lang = _safe_lang(lang_code)
    DbMetadataModel = DbMetadata(lang)
    now = datetime.utcnow()
    row = dw_db.query(DbMetadataModel).filter(DbMetadataModel.dbmtd_nid == 1).first()
    if row:
        row.dbmtd_areacnt = counts["dbmtd_areacnt"]
        row.dbmtd_indcnt = counts["dbmtd_indcnt"]
        row.dbmtd_iuscnt = counts["dbmtd_iuscnt"]
        row.dbmtd_timecnt = counts["dbmtd_timecnt"]
        row.dbmtd_srccnt = counts["dbmtd_srccnt"]
        row.dbmtd_datacnt = counts["dbmtd_datacnt"]
        row.publication_date = now
        if published_by is not None:
            row.dbmtd_pubname = published_by[:_DBMETADATA_PUBNAME_MAX_LEN]
    else:
        kwargs = dict(
            dbmtd_nid=1,
            dbmtd_areacnt=counts["dbmtd_areacnt"],
            dbmtd_indcnt=counts["dbmtd_indcnt"],
            dbmtd_iuscnt=counts["dbmtd_iuscnt"],
            dbmtd_timecnt=counts["dbmtd_timecnt"],
            dbmtd_srccnt=counts["dbmtd_srccnt"],
            dbmtd_datacnt=counts["dbmtd_datacnt"],
            publication_date=now,
        )
        if published_by is not None:
            kwargs["dbmtd_pubname"] = published_by[:_DBMETADATA_PUBNAME_MAX_LEN]
        new_row = DbMetadataModel(**kwargs)
        dw_db.add(new_row)


def refresh_dbmetadata_counts(
    dw_id: str,
    lang_codes: Optional[List[str]] = None,
    published_by: Optional[str] = None,
) -> None:
    """
    Recompute and persist counts for all ut_dbmetadata_{lang} tables for the given warehouse.
    Call this after create/delete of areas, indicators, IUS, time periods, indicator
    classifications, or data (signal-style update).

    Args:
        dw_id: Data warehouse identifier.
        lang_codes: If provided, only refresh these language tables; otherwise use
            all language codes from ut_language for this warehouse.
        published_by: JWT username (or similar) to store in dbmtd_pubname (truncated);
            if None, existing dbmtd_pubname is left unchanged on update.
    """
    if lang_codes is None:
        info = get_cached_dw_language_info(dw_id)
        lang_codes = list(info.codes) if info.codes else ["en"]
    if not lang_codes:
        return
    with get_warehouse_session_from_id(dw_id) as dw_db:
        for lang in lang_codes:
            try:
                normalized = _safe_lang(lang)
                counts = _compute_counts(dw_db, normalized)
                _update_or_insert_metadata(dw_db, normalized, counts, published_by=published_by)
            except Exception as e:
                logger.warning("refresh_dbmetadata_counts dw_id=%s lang=%s: %s", dw_id, lang, e)
        dw_db.flush()


def notify_dbmetadata_counts_changed(
    dw_id: str,
    *,
    published_by: Optional[str] = None,
    lang_codes: Optional[List[str]] = None,
) -> None:
    """
    Recompute and persist ut_dbmetadata_* counts after a warehouse mutation.
    Non-fatal: logs and swallows errors so the primary operation is never rolled back.

    Args:
        dw_id: Data warehouse identifier.
        published_by: Override for dbmtd_pubname; if omitted, uses the
            dbmetadata_published_by ContextVar (JWT username on authenticated requests).
        lang_codes: Optional subset of locales to refresh; defaults to all warehouse languages.
    """
    pub = published_by if published_by is not None else dbmetadata_published_by.get()
    try:
        refresh_dbmetadata_counts(dw_id, lang_codes=lang_codes, published_by=pub)
    except Exception as e:
        logger.warning("notify_dbmetadata_counts_changed dw_id=%s: %s", dw_id, e)


def _row_to_response(row: Any) -> Dict[str, Any]:
    """
    Build API response dict from a DbMetadata ORM row using internal keys.
    Aliases (e.g. dbmtd_desc -> description, dbmtd_pubdate -> publication_date) are
    applied via apply_external_response_mapping using db_tbl_cols_mapping.json.
    """
    def _float_or_zero(val: Any) -> float:
        return float(val) if val is not None else 0.0

    pubdate = getattr(row, "publication_date", None)
    internal = {
        "dbmtd_areacnt": _float_or_zero(row.dbmtd_areacnt),
        "dbmtd_indcnt": _float_or_zero(row.dbmtd_indcnt),
        "dbmtd_iuscnt": _float_or_zero(row.dbmtd_iuscnt),
        "dbmtd_timecnt": _float_or_zero(row.dbmtd_timecnt),
        "dbmtd_srccnt": _float_or_zero(row.dbmtd_srccnt),
        "dbmtd_datacnt": _float_or_zero(row.dbmtd_datacnt),
        "dbmtd_desc": getattr(row, "description", None),
        "dbmtd_pubdate": pubdate.isoformat() if pubdate and hasattr(pubdate, "isoformat") else None,
        "dbmtd_pubname": getattr(row, "dbmtd_pubname", None),
    }
    return apply_external_response_mapping("ut_dbmetadata", internal)


def get_dbmetadata_counts(dw_id: str, lang_code: str) -> Dict[str, Any]:
    """
    Return the current dbmetadata counts for the warehouse and language.
    Reads from ut_dbmetadata_{lang_code} via ORM. If no row exists, returns computed counts
    without persisting (so GET is always consistent).
    Also appends the latest db_version number from the db_version table.

    Returns:
        Dict with keys per db_tbl_cols_mapping.json ut_dbmetadata (e.g. description,
        publication_date for dbmtd_desc/dbmtd_pubdate when ADAPTATION is external),
        plus db_version (latest version_number string or None).
    """
    lang = _safe_lang(lang_code)
    with get_warehouse_session_from_id(dw_id) as dw_db:
        DbMetadataModel = DbMetadata(lang)
        try:
            row = dw_db.query(DbMetadataModel).filter(DbMetadataModel.dbmtd_nid == 1).first()
            if row:
                result = _row_to_response(row)
            else:
                raise LookupError("no row")
        except Exception as e:
            logger.debug("Read ut_dbmetadata_%s failed: %s", lang, e)
            counts = _compute_counts(dw_db, lang)
            counts["dbmtd_desc"] = None
            counts["dbmtd_pubdate"] = None
            counts["dbmtd_pubname"] = None
            result = apply_external_response_mapping("ut_dbmetadata", counts)

        try:
            latest_ver = (
                dw_db.query(DbVersion)
                .order_by(DbVersion.version_nid.desc())
                .first()
            )
            result["db_version"] = latest_ver.version_number if latest_ver else None
        except Exception as e:
            logger.debug("db_version read failed for dw_id=%s: %s", dw_id, e)
            result["db_version"] = None

        return result
