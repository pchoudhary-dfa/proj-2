"""
Time Period service – CRUD and read.
Uses ut_timeperiod. API: id (timeperiod_nid), timeperiod, startdate, enddate, periodicity.
"""
import logging
import math
import re
from datetime import date, datetime, time
from io import BytesIO
from typing import List, Optional, Dict, Any, Tuple

from sqlalchemy import cast, func, String, and_, or_

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.shared.exceptions import NotFound, UnprocessableEntity
from apps.datawarehouse.models.datawarehouse import TimePeriod, Data
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.utils.audit_events import (
    buffer_delete_step,
    buffer_manual_audit,
    deleted_ids_preview,
    snapshot_entity_for_audit,
)
from apps.datawarehouse.schemas.time_period import (
    TimePeriodCreateSchema,
    TimePeriodUpdateSchema,
    TimePeriodResponseSchema,
    PeriodicityEnum,
)
from apps.datawarehouse.constants import ASSOC_DATA_COUNT
from apps.datawarehouse.utils.export_utils import (
    build_simple_xlsx,
    make_export_filename,
    normalize_import_header_cell,
)
from apps.datawarehouse.utils.time_period_format import (
    date_bounds_for_timeperiod,
    validate_timeperiod_for_periodicity,
)

logger = logging.getLogger(__name__)


def _delete_time_period_cascade_with_audit(dw_db, nid: int) -> None:
    """Deletes dependent ut_data then ut_timeperiod; emits ordered manual audit rows."""
    data_nids = [
        r[0]
        for r in dw_db.query(Data.data_nid)
        .filter(Data.timeperiod_nid == nid)
        .all()
    ]
    tp_row = (
        dw_db.query(TimePeriod)
        .filter(TimePeriod.timeperiod_nid == nid)
        .first()
    )
    deleted_data = dw_db.query(Data).filter(Data.timeperiod_nid == nid).delete(
        synchronize_session=False
    )
    if data_nids or deleted_data > 0:
        buffer_delete_step(
            dw_db,
            module="data",
            description=f"Cascade delete data for timeperiod_nid={nid}",
            previous_value={
                "timeperiod_nid": nid,
                **deleted_ids_preview(data_nids),
            },
        )
    dw_db.query(TimePeriod).filter(TimePeriod.timeperiod_nid == nid).delete(
        synchronize_session=False
    )
    prev = snapshot_entity_for_audit(tp_row) if tp_row else {"timeperiod_nid": nid}
    buffer_manual_audit(
        dw_db,
        action="DELETE",
        module="time_period",
        identifier=str(nid),
        description=f"Deleted time period nid={nid} with cascade data rows",
        previous_value=prev,
    )

# Preamble rows for export (same width as data columns); import finds header by column names.
_TIME_PERIOD_EXPORT_PREAMBLE = (
    [
        "Instructions: Keep Time period and Periodicity as Text in Excel so values like 2019-2020 are not converted to dates.",
        "",
        "",
        "",
        "",
    ],
    [
        "Annual (A): use 4-digit years only — yyyy or yyyy-yyyy (examples: 2020 or 2019-2020). Monthly (M)/Half-yearly (H): yyyy.mm. Quarterly (Q): Q1.yyyy. Daily (D)/Fortnightly (F): yyyy.mm.dd.",
        "",
        "",
        "",
        "",
    ],
    [
        "Leave timeperiod_nid blank for new rows. Start/end columns are informational; the server derives calendar bounds from time period + periodicity.",
        "",
        "",
        "",
        "",
    ],
)


def _excel_optional_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def _excel_optional_int(label: str, val: Any) -> Optional[int]:
    if val is None:
        return None
    if isinstance(val, str) and not val.strip():
        return None
    try:
        if isinstance(val, float):
            return int(val)
        return int(val)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be an integer") from None


def _time_period_import_header_inverse() -> Dict[str, str]:
    """Map normalized spreadsheet header → internal field key (export layout + common aliases)."""
    inverse: Dict[str, str] = {}
    for field in ("timeperiod_nid", "timeperiod", "startdate", "enddate", "periodicity"):
        inverse[normalize_import_header_cell(field)] = field
    aliases = (
        ("tp_nid", "timeperiod_nid"),
        ("nid", "timeperiod_nid"),
        ("id", "timeperiod_nid"),
        ("tp_timeperiod", "timeperiod"),
        ("tp_startdate", "startdate"),
        ("tp_enddate", "enddate"),
        ("tp_periodicity", "periodicity"),
    )
    for alias, field in aliases:
        k = normalize_import_header_cell(alias)
        if k in inverse and inverse[k] != field:
            raise ValueError(
                f"Ambiguous time period import header alias {alias!r} for field {field!r}"
            )
        inverse[k] = field
    return inverse


def _normalize_timeperiod_import_value(val: Any) -> Optional[str]:
    """
    Turn an Excel cell value into the timeperiod string users expect on the API.
    Handles numeric year cells (2019), floats (2019.0), and accidental date serials (single-year Jan 1).
    """
    if val is None:
        return None
    if isinstance(val, bool):
        return None
    if isinstance(val, float):
        if math.isnan(val):
            return None
        if val.is_integer():
            iv = int(val)
            if 1800 <= iv <= 2300:
                return str(iv)
        try:
            from openpyxl.utils.datetime import from_excel

            dt = from_excel(val)
            if isinstance(dt, datetime):
                if dt.month == 1 and dt.day == 1 and dt.hour == 0 and dt.minute == 0:
                    return str(dt.year)
                return dt.strftime("%Y.%m.%d")
        except Exception:
            pass
    if isinstance(val, int):
        if 1800 <= val <= 2300:
            return str(val)
    if isinstance(val, datetime):
        if val.month == 1 and val.day == 1 and val.hour == 0 and val.minute == 0:
            return str(val.year)
        return val.strftime("%Y.%m.%d")
    if isinstance(val, date) and not isinstance(val, datetime):
        return val.strftime("%Y.%m.%d")
    s = str(val).strip()
    if not s:
        return None
    m = re.fullmatch(r"(\d{4})\.0+", s)
    if m:
        return m.group(1)
    return s


def _parse_periodicity_import(val: Any) -> Optional[str]:
    s = _excel_optional_str(val)
    if not s:
        return None
    u = s.strip().upper()
    if u in PeriodicityEnum.__members__:
        return u
    if len(u) == 1 and u in "AMQHDF":
        return u
    raise ValueError(
        f"Invalid periodicity {s!r}; expected one of {', '.join(sorted(PeriodicityEnum.__members__.keys()))}"
    )


def _load_xlsx_active_rows_all(file_bytes: bytes) -> List[Tuple[Any, ...]]:
    """Read all value rows from the active worksheet (read_only first, then standard load)."""
    from openpyxl import load_workbook

    try:
        workbook = load_workbook(
            filename=BytesIO(file_bytes),
            read_only=True,
            data_only=True,
        )
        try:
            ws = workbook.active
            return [tuple(r) for r in ws.iter_rows(values_only=True)]
        finally:
            workbook.close()
    except Exception as exc:
        logger.debug("Time periods import: read_only load failed, retrying: %s", exc)
    workbook_fb = load_workbook(filename=BytesIO(file_bytes), data_only=True)
    worksheet = workbook_fb.active
    return [tuple(r) for r in worksheet.iter_rows(values_only=True)]


def _find_time_period_import_header_row_index(
    rows: List[Tuple[Any, ...]], header_inverse: Dict[str, str]
) -> int:
    """First row that defines a ``timeperiod`` column (supports preamble rows above headers)."""
    for idx, row in enumerate(rows):
        if not row:
            continue
        fields = set()
        for cell in row:
            f = header_inverse.get(normalize_import_header_cell(cell))
            if f:
                fields.add(f)
        if "timeperiod" in fields:
            return idx
    raise ValueError(
        "Missing header row with column 'timeperiod' (or alias tp_timeperiod). "
        "Use the export layout or the downloadable template."
    )


def _parse_time_periods_import_xlsx_bytes(
    file_bytes: bytes, header_inverse: Dict[str, str]
) -> Tuple[List[Tuple[int, Dict[str, Any]]], int]:
    """
    Parse first worksheet: (excel_row_number, record) for each non-empty data row.
    ``excel_row_number`` is 1-based Excel row index.
    """
    all_rows = _load_xlsx_active_rows_all(file_bytes)
    if not all_rows:
        raise ValueError("Excel file does not contain any rows")
    hidx = _find_time_period_import_header_row_index(all_rows, header_inverse)
    header_row = all_rows[hidx]

    col_index: Dict[str, int] = {}
    header_cells = [normalize_import_header_cell(c) for c in header_row]
    for idx, cell in enumerate(header_cells):
        if not cell:
            continue
        field = header_inverse.get(cell)
        if field:
            if field in col_index and col_index[field] != idx:
                raise UnprocessableEntity(f"Duplicate column for field '{field}' in header row")
            col_index[field] = idx
    if "timeperiod" not in col_index:
        raise ValueError(
            "Missing required column 'timeperiod' (or alias tp_timeperiod); "
            "use the same layout as export"
        )

    raw_rows: List[Tuple[int, Dict[str, Any]]] = []
    skipped_empty = 0

    def _cell(field: str, raw: Tuple[Any, ...]) -> Any:
        j = col_index.get(field)
        if j is None or j >= len(raw):
            return None
        return raw[j]

    def _append_data_row(excel_offset: int, raw: Tuple[Any, ...]) -> None:
        nonlocal skipped_empty
        if not raw:
            skipped_empty += 1
            return
        nid_raw = _excel_optional_int("timeperiod_nid", _cell("timeperiod_nid", raw))
        tp = _normalize_timeperiod_import_value(_cell("timeperiod", raw))
        if nid_raw is None and not tp:
            skipped_empty += 1
            return
        if not tp:
            raise ValueError(
                f"Row {excel_offset}: timeperiod is required when the row is not empty"
            )
        per_s = _parse_periodicity_import(_cell("periodicity", raw))
        raw_rows.append(
            (
                excel_offset,
                {
                    "timeperiod_nid": nid_raw,
                    "timeperiod": tp,
                    "periodicity": per_s,
                },
            )
        )

    for ridx, raw in enumerate(all_rows[hidx + 1 :], start=hidx + 2):
        _append_data_row(ridx, tuple(raw) if raw else ())

    return raw_rows, skipped_empty


def _datetimes_from_periodicity(timeperiod: str, periodicity: str) -> Tuple[datetime, datetime]:
    """Midnight datetimes for inclusive calendar bounds derived from encoded timeperiod."""
    start_d, end_d = date_bounds_for_timeperiod(timeperiod, periodicity)
    return datetime.combine(start_d, time.min), datetime.combine(end_d, time.min)


def _apply_max_timeperiod_nid_filter(q, dw_db, max_timeperiod_nid: int):
    """
    Restrict query to rows with enddate <= reference enddate (reference row always included).
    When the reference has no enddate, only that row is returned.
    """
    ref = (
        dw_db.query(TimePeriod)
        .filter(TimePeriod.timeperiod_nid == max_timeperiod_nid)
        .first()
    )
    if ref is None:
        raise NotFound(
            f"Time period not found: {max_timeperiod_nid!r}",
            identifier=str(max_timeperiod_nid),
        )
    if ref.enddate is not None:
        return q.filter(
            or_(
                and_(TimePeriod.enddate.isnot(None), TimePeriod.enddate <= ref.enddate),
                TimePeriod.timeperiod_nid == max_timeperiod_nid,
            )
        )
    return q.filter(TimePeriod.timeperiod_nid == max_timeperiod_nid)


class TimePeriodService:
    """Service for Time Period CRUD and read from ut_timeperiod."""

    def get_all_time_periods(
        self,
        dw_id: str,
        page: int = 1,
        page_size: Optional[int] = 10,
        search: Optional[str] = None,
        search_by: Optional[str] = None,
        scope: Optional[str] = None,
        timeperiod_frequency: Optional[str] = None,
        max_timeperiod_nid: Optional[int] = None,
        sort_order: str = "asc",
        sort_field: str = "tp_nid",
    ) -> tuple[List[Dict[str, Any]], int, Optional[int]]:
        """
        List time periods from ut_timeperiod with optional sorting and pagination.

        sort_field: tp_nid, timeperiod, startdate, enddate, periodicity (internal: timeperiod_nid, timeperiod, etc.)
        max_timeperiod_nid: when set, only rows with enddate <= that period's enddate (reference included).

        Returns:
            Tuple of (list of time period dicts, filtered total_count, total_count_unfiltered or None).
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            order_column = TimePeriod.timeperiod_nid
            if sort_field == "tp_nid":
                order_column = TimePeriod.timeperiod_nid
            elif sort_field == "timeperiod":
                order_column = TimePeriod.timeperiod
            elif sort_field == "startdate":
                order_column = TimePeriod.startdate
            elif sort_field == "enddate":
                order_column = TimePeriod.enddate
            elif sort_field == "periodicity":
                order_column = TimePeriod.periodicity
            if sort_order and sort_order.lower() == "desc":
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()
            q = (
                dw_db.query(TimePeriod)
                .order_by(order_column)
            )
            has_list_filters = bool(
                (search and search.strip())
                or scope == "NO_DATA"
                or timeperiod_frequency in {"A", "M", "Q"}
                or max_timeperiod_nid is not None
            )
            total_count_unfiltered: Optional[int] = (
                dw_db.query(TimePeriod).count() if has_list_filters else None
            )
            if search and search.strip():
                pattern = f"%{search.strip()}%"
                if search_by:
                    # Search specific field using external key mapping
                    from apps.datawarehouse.constants import get_timeperiod_field_mapping
                    field_map = get_timeperiod_field_mapping()
                    if search_by in field_map:
                        col = field_map[search_by]
                        # DateTime columns must be cast to String before ilike.
                        # MySQL formats DateTime as 'YYYY-MM-DD HH:MM:SS' (space separator),
                        # so normalise ISO 8601 'T' separator in the search term to a space.
                        _DATE_FIELDS = {"tp_startdate", "tp_enddate"}
                        if search_by in _DATE_FIELDS:
                            col = cast(col, String)
                            normalised_search = search.strip().replace("T", " ")
                            pattern = f"%{normalised_search}%"
                        q = q.filter(col.ilike(pattern))
                else:
                    # Current behavior: search timeperiod field only
                    q = q.filter(TimePeriod.timeperiod.ilike(pattern))
            
            # Apply scope filtering
            if scope == "NO_DATA":
                used_nids = [
                    r[0]
                    for r in dw_db.query(Data.timeperiod_nid)
                    .filter(Data.timeperiod_nid.isnot(None), Data.timeperiod_nid != 0)
                    .distinct()
                    .all()
                ]
                if used_nids:
                    q = q.filter(TimePeriod.timeperiod_nid.notin_(used_nids))

            # Frequency filter for list API: A, M, Q (ALL/None means no filter)
            if timeperiod_frequency in {"A", "M", "Q"}:
                q = q.filter(TimePeriod.periodicity == timeperiod_frequency)

            if max_timeperiod_nid is not None:
                q = _apply_max_timeperiod_nid_filter(q, dw_db, max_timeperiod_nid)
            
            total_count = q.count()
            if page_size is not None:
                page = max(1, page)
                page_size = max(1, min(page_size, 1000))
                skip = (page - 1) * page_size
                rows = q.offset(skip).limit(page_size).all()
            else:
                rows = q.all()
            return [TimePeriodResponseSchema.from_record(r) for r in rows], total_count, total_count_unfiltered

    def get_time_period_by_identifier(
        self,
        dw_id: str,
        identifier: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get one time period by identifier (numeric timeperiod_nid or timeperiod string value).
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            if identifier.isdigit():
                row = dw_db.query(TimePeriod).filter(
                    TimePeriod.timeperiod_nid == int(identifier)
                ).first()
            else:
                row = dw_db.query(TimePeriod).filter(
                    TimePeriod.timeperiod == identifier
                ).first()
            return TimePeriodResponseSchema.from_record(row) if row else None

    def _resolve_identifier_to_nid(self, dw_db, identifier: str) -> Optional[int]:
        """Resolve identifier (nid or timeperiod value) to timeperiod_nid."""
        if identifier.isdigit():
            row = dw_db.query(TimePeriod).filter(
                TimePeriod.timeperiod_nid == int(identifier)
            ).first()
        else:
            row = dw_db.query(TimePeriod).filter(
                TimePeriod.timeperiod == identifier
            ).first()
        return row.timeperiod_nid if row else None

    def resolve_identifiers_to_nids(
        self, dw_id: str, identifiers: List[str]
    ) -> List[int]:
        """Resolve list of identifiers to timeperiod_nids. Raises ValueError if any not found."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            nids = []
            for ident in identifiers:
                nid = self._resolve_identifier_to_nid(dw_db, ident)
                if nid is None:
                    raise NotFound(f"Time period not found: {ident!r}")
                nids.append(nid)
            return nids

    def _validate_timeperiod_unique(
        self, dw_db, timeperiod: str, exclude_nid: Optional[int] = None
    ) -> None:
        """Raise ValueError if timeperiod value already exists (excluding exclude_nid for updates)."""
        q = dw_db.query(TimePeriod).filter(TimePeriod.timeperiod == timeperiod.strip())
        if exclude_nid is not None:
            q = q.filter(TimePeriod.timeperiod_nid != exclude_nid)
        if q.first() is not None:
            raise ValueError("Validation failed: timeperiod must be unique")

    def create(self, dw_id: str, data: TimePeriodCreateSchema) -> Dict[str, Any]:
        """
        Create a time period. timeperiod required and unique.
        Returns dict with id, timeperiod.
        """
        tp_val = (data.timeperiod or "").strip()
        if not tp_val:
            raise ValueError("Validation failed: timeperiod is required")
        if len(tp_val) > 30:
            raise ValueError("Validation failed: timeperiod max 30 characters")

        with get_warehouse_session_from_id(dw_id) as dw_db:
            self._validate_timeperiod_unique(dw_db, tp_val)

            periodicity = data.periodicity.value if data.periodicity is not None else None
            if periodicity:
                startdate, enddate = _datetimes_from_periodicity(tp_val, periodicity)
            else:
                startdate, enddate = None, None

            row = TimePeriod(
                timeperiod=tp_val,
                startdate=startdate,
                enddate=enddate,
                periodicity=periodicity,
            )
            dw_db.add(row)
            dw_db.flush()
            resp = TimePeriodResponseSchema.from_record(row)
            result = {k: resp[k] for k in ("id", "timeperiod")}

        notify_dbmetadata_counts_changed(dw_id)
        return result

    def create_batch(self, dw_id: str, items: List[TimePeriodCreateSchema]) -> Dict[str, Any]:
        """
        Create multiple time periods with partial-success support.
        Each item is committed independently; failures are collected in errors.
        Returns dict with created (list of result dicts) and errors (list of {index, error} dicts).
        """
        if not items:
            return {"created": [], "errors": []}

        created = []
        errors = []
        for idx, data in enumerate(items):
            with get_warehouse_session_from_id(dw_id) as dw_db:
                try:
                    tp_val = (data.timeperiod or "").strip()
                    if not tp_val:
                        raise ValueError("Validation failed: timeperiod is required")
                    if len(tp_val) > 30:
                        raise ValueError("Validation failed: timeperiod max 30 characters")
                    self._validate_timeperiod_unique(dw_db, tp_val)
                    periodicity = data.periodicity.value if data.periodicity is not None else None
                    if periodicity:
                        startdate, enddate = _datetimes_from_periodicity(tp_val, periodicity)
                    else:
                        startdate, enddate = None, None
                    row = TimePeriod(
                        timeperiod=tp_val,
                        startdate=startdate,
                        enddate=enddate,
                        periodicity=periodicity,
                    )
                    dw_db.add(row)
                    dw_db.flush()
                    result = TimePeriodResponseSchema.from_record(row)
                    created.append(result)
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

        if created:
            notify_dbmetadata_counts_changed(dw_id)
        return {"created": created, "errors": errors}

    def update(
        self, dw_id: str, identifier: str, data: TimePeriodUpdateSchema
    ) -> Dict[str, Any]:
        """Update a time period (partial). Returns dict with id, timeperiod."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            nid = self._resolve_identifier_to_nid(dw_db, identifier)
            if nid is None:
                raise NotFound("Time period not found")

            row = dw_db.query(TimePeriod).filter(
                TimePeriod.timeperiod_nid == nid
            ).first()
            if not row:
                raise NotFound("Time period not found")

            if data.timeperiod is not None:
                tp_val = data.timeperiod.strip()
                if not tp_val:
                    raise ValueError("Validation failed: timeperiod cannot be empty")
                if len(tp_val) > 30:
                    raise ValueError("Validation failed: timeperiod max 30 characters")
                self._validate_timeperiod_unique(dw_db, tp_val, exclude_nid=nid)
                row.timeperiod = tp_val
            if data.periodicity is not None:
                row.periodicity = data.periodicity.value

            final_tp = (row.timeperiod or "").strip()
            final_p = row.periodicity
            if final_p:
                validate_timeperiod_for_periodicity(final_tp, final_p)
                row.startdate, row.enddate = _datetimes_from_periodicity(final_tp, final_p)

            dw_db.flush()
            resp = TimePeriodResponseSchema.from_record(row)
            return resp

    def get_association_counts(
        self, dw_id: str, identifiers: List[str]
    ) -> Dict[str, int]:
        """
        Return data count for the given time periods (ut_data.timeperiod_nid).
        For delete confirmation; only data_count is relevant (no subgroup/ius chain).
        """
        if not identifiers:
            with get_warehouse_session_from_id(dw_id) as dw_db:
                data_count = dw_db.query(func.count(Data.data_nid)).scalar() or 0
                return {ASSOC_DATA_COUNT: data_count}

        nids = self.resolve_identifiers_to_nids(dw_id, identifiers)
        with get_warehouse_session_from_id(dw_id) as dw_db:
            data_count = (
                dw_db.query(func.count(Data.data_nid))
                .filter(Data.timeperiod_nid.in_(nids))
                .scalar() or 0
            )
            return {ASSOC_DATA_COUNT: data_count}

    def delete(self, dw_id: str, identifier: str) -> None:
        """Delete a time period. Cascades: deletes dependent ut_data rows first, then the time period."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            nid = self._resolve_identifier_to_nid(dw_db, identifier)
            if nid is None:
                raise NotFound("Time period not found")
            _delete_time_period_cascade_with_audit(dw_db, nid)
            dw_db.flush()
        notify_dbmetadata_counts_changed(dw_id)

    def multiple_delete(self, dw_id: str, identifiers: List[str]) -> Dict[str, Any]:
        """
        Delete multiple time periods with partial-success support.
        Cascades: deletes dependent ut_data rows first, then the time periods.
        Returns deleted identifiers and per-item errors.
        """
        if not identifiers:
            return {"deleted": [], "errors": []}

        deleted = []
        errors = []
        for idx, ident in enumerate(identifiers):
            with get_warehouse_session_from_id(dw_id) as dw_db:
                try:
                    nid = self._resolve_identifier_to_nid(dw_db, ident)
                    if nid is None:
                        raise NotFound(f"Time period not found: {ident!r}")
                    _delete_time_period_cascade_with_audit(dw_db, nid)
                    dw_db.flush()
                    deleted.append(ident)
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

        if deleted:
            notify_dbmetadata_counts_changed(dw_id)
        return {"deleted": deleted, "errors": errors}

    def import_time_periods_from_xlsx_bytes(self, dw_id: str, file_bytes: bytes) -> Dict[str, Any]:
        """
        Import time periods from XLSX matching GET /time-periods?export=true column layout.
        Rows with ``timeperiod_nid`` matching an existing row are updated; otherwise a new row is inserted.
        ``periodicity`` may be omitted on insert (optional); when present it must be A/M/Q/H/D/F.
        Single warehouse transaction (commit on success).
        """
        if not file_bytes:
            raise ValueError("Uploaded Excel file is empty")
        header_inverse = _time_period_import_header_inverse()
        raw_rows, skipped_empty = _parse_time_periods_import_xlsx_bytes(
            file_bytes, header_inverse
        )
        if not raw_rows:
            raise ValueError("No data rows to import")

        seen_nids: Dict[int, int] = {}
        for excel_off, rec in raw_rows:
            rn = rec["timeperiod_nid"]
            if rn is not None:
                if rn in seen_nids:
                    raise ValueError(
                        f"Duplicate timeperiod_nid '{rn}' in rows {seen_nids[rn]} and {excel_off}"
                    )
                seen_nids[rn] = excel_off

        inserted = 0
        updated = 0
        with get_warehouse_session_from_id(dw_id) as dw_db:
            for excel_off, rec in raw_rows:
                nid_raw = rec["timeperiod_nid"]
                tp = (rec["timeperiod"] or "").strip()
                per = rec["periodicity"]
                if len(tp) > 30:
                    raise ValueError(f"Row {excel_off}: timeperiod max 30 characters")

                if nid_raw is not None:
                    row = (
                        dw_db.query(TimePeriod)
                        .filter(TimePeriod.timeperiod_nid == int(nid_raw))
                        .first()
                    )
                    if row is None:
                        raise ValueError(
                            f"Row {excel_off}: timeperiod_nid {nid_raw} not found in database"
                        )
                    old_tp = (row.timeperiod or "").strip()
                    old_p = row.periodicity
                    mutated = False
                    if tp != old_tp:
                        self._validate_timeperiod_unique(dw_db, tp, exclude_nid=int(nid_raw))
                        row.timeperiod = tp
                        mutated = True
                    if per is not None and per != (old_p or ""):
                        row.periodicity = per
                        mutated = True
                    final_tp = (row.timeperiod or "").strip()
                    final_p = row.periodicity
                    if final_p:
                        validate_timeperiod_for_periodicity(final_tp, final_p)
                        row.startdate, row.enddate = _datetimes_from_periodicity(
                            final_tp, final_p
                        )
                    if mutated:
                        dw_db.flush()
                        updated += 1
                    continue

                try:
                    create_schema = TimePeriodCreateSchema(
                        timeperiod=tp,
                        periodicity=PeriodicityEnum(per) if per else None,
                    )
                except Exception as e:
                    raise ValueError(f"Row {excel_off}: {e}") from e
                periodicity = (
                    create_schema.periodicity.value
                    if create_schema.periodicity is not None
                    else None
                )
                self._validate_timeperiod_unique(dw_db, tp)
                if periodicity:
                    validate_timeperiod_for_periodicity(tp, periodicity)
                    startdate, enddate = _datetimes_from_periodicity(tp, periodicity)
                else:
                    startdate, enddate = None, None
                nrow = TimePeriod(
                    timeperiod=tp,
                    startdate=startdate,
                    enddate=enddate,
                    periodicity=periodicity,
                )
                dw_db.add(nrow)
                dw_db.flush()
                inserted += 1

        if inserted or updated:
            notify_dbmetadata_counts_changed(dw_id)
        return {
            "inserted": inserted,
            "updated": updated,
            "skipped_empty_rows": skipped_empty,
        }


def build_time_periods_export_xlsx(
    dw_db,
    db_connection_display_name: str,
    sort_order: str = "asc",
    sort_field: str = "tp_nid",
    search: Optional[str] = None,
    max_timeperiod_nid: Optional[int] = None,
) -> tuple:
    """Build XLSX export for all time periods. Caller must validate DW and pass active dw_db. Returns (xlsx_stream, filename)."""
    order_column = TimePeriod.timeperiod_nid
    if sort_field == "timeperiod":
        order_column = TimePeriod.timeperiod
    elif sort_field == "startdate":
        order_column = TimePeriod.startdate
    elif sort_field == "enddate":
        order_column = TimePeriod.enddate
    elif sort_field == "periodicity":
        order_column = TimePeriod.periodicity
    if sort_order and sort_order.lower() == "desc":
        order_column = order_column.desc()
    else:
        order_column = order_column.asc()
    q = dw_db.query(TimePeriod).order_by(order_column)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(TimePeriod.timeperiod.ilike(pattern))
    if max_timeperiod_nid is not None:
        q = _apply_max_timeperiod_nid_filter(q, dw_db, max_timeperiod_nid)
    rows = q.all()
    items = [TimePeriodResponseSchema.from_record(r) for r in rows]
    headers = ["timeperiod_nid", "timeperiod", "startdate", "enddate", "periodicity"]

    def _iso_date_only(v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, str):
            if "T" in v:
                return v.split("T", 1)[0]
            if len(v) >= 10 and v[4:5] == "-" and v[7:8] == "-":
                return v[:10]
        return v

    data_rows = [
        [
            it.get("timeperiod_nid"),
            it.get("timeperiod"),
            _iso_date_only(it.get("startdate")),
            _iso_date_only(it.get("enddate")),
            it.get("periodicity"),
        ]
        for it in items
    ]
    output = build_simple_xlsx(
        "Time Periods",
        headers,
        data_rows,
        preamble_rows=list(_TIME_PERIOD_EXPORT_PREAMBLE),
        text_format_column_indices=(0, 1, 4),
    )
    filename = make_export_filename("TIME_PERIODS", db_connection_display_name)
    return output, filename
