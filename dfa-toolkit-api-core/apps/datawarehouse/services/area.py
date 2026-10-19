"""
Area service for CRUD operations (get, create, update, delete).
Uses ut_area_<locale> (built from AreaLocaleMixin). API field names: area_nid, area_parent_nid, area_id, area_name, area_gid, area_level, etc.
"""
import logging
import re
from collections import defaultdict, deque
from datetime import datetime
from io import BytesIO
from typing import List, Optional, Dict, Any, Tuple, Set, NamedTuple
from sqlalchemy.orm import Session
from sqlalchemy import bindparam, or_, text, func

from apps.shared.utils.validators import generate_guid, validate_guid
from apps.shared.exceptions import BadRequest, Conflict, NotFound, UnprocessableEntity
from apps.shared.utils.log_event import log_background_incident
from apps.datawarehouse.db.datawarehouse import (
    get_warehouse_session_from_id,
)
from apps.datawarehouse.models.datawarehouse import (
    Area,
    AreaLevel,
    get_default_locale,
    Data,
)
from apps.datawarehouse.schemas.area import (
    AreaCreateSchema,
    AreaUpdateSchema,
    AreaResponseSchema,
    AreaParentResponseSchema,
)
from apps.datawarehouse.utils.alias_loader import (
    map_dict_internal_to_external_for_entities,
)
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.services.locale_update import apply_locale_update
from apps.datawarehouse.services.db_metadata import notify_dbmetadata_counts_changed
from apps.datawarehouse.utils.export_utils import (
    get_area_import_header_inverse_map,
    normalize_import_header_cell,
)
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix, value_for_locale
from apps.datawarehouse.utils.audit_events import (
    buffer_delete_step,
    buffer_manual_audit,
    deleted_ids_preview,
    snapshot_entity_for_audit,
)
from apps.shared.utils.translations import t_list
from apps.datawarehouse.constants import (
    QUERY_ARL_INFO,
    ASSOC_CHILDREN_COUNT,
    ASSOC_DESCENDANTS_COUNT,
    ASSOC_DATA_COUNT,
    LANG_PREFIX,
)

logger = logging.getLogger(__name__)
_AREA_SERVICE_SOURCE = "apps.datawarehouse.services.area"

# Root parent nid: spec says -1, schema may use 0
ROOT_PARENT_NIDS = (-1, 0)


def _plain_under_lang_prefix(val: str) -> str:
    s = val.strip()
    while s.startswith(LANG_PREFIX):
        s = s[len(LANG_PREFIX) :]
    return s


def _area_import_name_keys_from_stored(stored: Optional[str]) -> Set[str]:
    if not stored:
        return set()
    s = str(stored).strip()
    if not s:
        return set()
    plain = _plain_under_lang_prefix(s)
    return {s, plain, apply_lang_prefix(plain)}

# Max items per DB IN (...) chunk (MySQL practical limit safety)
_AREA_IMPORT_IN_CHUNK = 900


class _AreaImportRowSnap(NamedTuple):
    """Cached default-locale row fields for bulk import prefetch."""

    area_nid: int
    area_parent_nid: Optional[int]
    area_id: Optional[str]
    area_gid: Optional[str]
    area_level: Optional[int]
    area_name: Optional[str]


def _chunk_fixed(seq: List[Any], size: int) -> List[List[Any]]:
    if not seq:
        return []
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def _parse_areas_import_xlsx_bytes(
    file_bytes: bytes, header_inverse: Dict[str, str]
) -> Tuple[List[Tuple[int, Dict[str, Any]]], int]:
    """
    Parse first worksheet to raw_rows (+ Excel row offset) and skipped_empty count.
    Uses read_only workbook when supported; falls back to default load_workbook.
    """
    col_index: Dict[str, int] = {}
    raw_rows: List[Tuple[int, Dict[str, Any]]] = []
    skipped_empty = 0

    from openpyxl import load_workbook

    def _build_col_index(header_row: Tuple[Any, ...]) -> None:
        header_cells = [normalize_import_header_cell(c) for c in header_row]
        for idx, cell in enumerate(header_cells):
            if not cell:
                continue
            field = header_inverse.get(cell)
            if field:
                if field in col_index and col_index[field] != idx:
                    raise BadRequest(f"Duplicate column for field '{field}' in header row")
                col_index[field] = idx

    def _append_data_row(excel_offset: int, raw: Tuple[Any, ...]) -> None:
        nonlocal skipped_empty

        def _cell(field: str) -> Any:
            j = col_index.get(field)
            if j is None or j >= len(raw):
                return None
            return raw[j]

        if not raw:
            skipped_empty += 1
            return
        area_id = _excel_optional_str(_cell("area_id"))
        area_name = _excel_optional_str(_cell("area_name"))
        area_nid_raw = _excel_optional_int("area_nid", _cell("area_nid"))
        if not area_id and not area_name and area_nid_raw is None:
            skipped_empty += 1
            return
        if not area_id or not area_name:
            raise BadRequest(
                f"Row {excel_offset}: area_id and area_name are required when the row is not empty"
            )
        try:
            parent_raw = _excel_optional_int("area_parent_nid", _cell("area_parent_nid"))
        except ValueError as e:
            raise BadRequest(f"Row {excel_offset}: {e}") from e

        if parent_raw is not None and parent_raw not in ROOT_PARENT_NIDS and parent_raw < 0:
            raise BadRequest(f"Row {excel_offset}: invalid area_parent_nid {parent_raw}")

        try:
            file_level = _excel_optional_int("area_level", _cell("area_level"))
        except ValueError as e:
            raise BadRequest(f"Row {excel_offset}: {e}") from e

        raw_rows.append(
            (
                excel_offset,
                {
                    "area_id": area_id,
                    "area_name": area_name,
                    "raw_area_nid": area_nid_raw,
                    "parent_raw": parent_raw,
                    "file_area_level": file_level,
                    "area_gid": _excel_optional_str(_cell("area_gid")),
                    "area_is_global": _excel_optional_bool(_cell("area_is_global")),
                },
            )
        )

    try:
        workbook = load_workbook(
            filename=BytesIO(file_bytes),
            read_only=True,
            data_only=True,
        )
        try:
            ws = workbook.active
            row_iter = ws.iter_rows(values_only=True)
            header_row = next(row_iter, None)
            if not header_row:
                raise BadRequest("Excel file does not contain a header row")
            _build_col_index(tuple(header_row))
            required_core = ("area_id", "area_name")
            for r in required_core:
                if r not in col_index:
                    raise BadRequest(
                        f"Missing required column '{r}' (check header matches export layout / translations)"
                    )
            excel_off = 2
            for raw in row_iter:
                _append_data_row(excel_off, tuple(raw) if raw else ())
                excel_off += 1
        finally:
            workbook.close()
        return raw_rows, skipped_empty
    except ValueError:
        raise
    except Exception as exc:
        logger.debug("Areas import: read_only XLSX parse failed, retrying standard mode: %s", exc)
        col_index.clear()
        raw_rows.clear()
        skipped_empty = 0

    workbook_fb = load_workbook(filename=BytesIO(file_bytes), data_only=True)
    worksheet = workbook_fb.active
    rows_iter = list(worksheet.iter_rows(values_only=True))
    if not rows_iter:
        raise BadRequest("Excel file does not contain a header row")
    _build_col_index(tuple(rows_iter[0]))
    required_core = ("area_id", "area_name")
    for r in required_core:
        if r not in col_index:
            raise BadRequest(
                f"Missing required column '{r}' (check header matches export layout / translations)"
            )
    excel_off = 2
    for raw in rows_iter[1:]:
        _append_data_row(excel_off, tuple(raw) if raw else ())
        excel_off += 1

    return raw_rows, skipped_empty


def _excel_optional_bool(val: Any) -> Optional[bool]:
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, str) and not val.strip():
        return None
    if isinstance(val, (int, float)):
        try:
            return bool(int(val))
        except (TypeError, ValueError):
            return None
    s = str(val).strip().lower()
    if s in ("true", "yes", "1", "y"):
        return True
    if s in ("false", "no", "0", "n"):
        return False
    return None


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
        raise BadRequest(f"{label} must be an integer") from None


def _excel_optional_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def _topological_order_area_import(
    n: int,
    predecessors: Dict[int, List[int]],
) -> List[int]:
    """Return row indices in an order that respects intra-file parent dependencies."""
    adj: Dict[int, List[int]] = defaultdict(list)
    in_degree = [0] * n
    for v, preds in predecessors.items():
        for u in preds:
            adj[u].append(v)
            in_degree[v] += 1
    queue = deque([i for i in range(n) if in_degree[i] == 0])
    order: List[int] = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in adj[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)
    if len(order) != n:
        raise BadRequest("Area import contains a cycle in parent references")
    return order


def _sanitize_db_connection_name(name: Optional[str], fallback: str = "dw") -> str:
    """
    Convert a human-readable db name into a safe filename segment.
    Allows: A-Z a-z 0-9 . _ -
    """
    raw = (name or "").strip() or fallback
    raw = raw.replace(" ", "-")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-")
    return safe or fallback


def build_areas_export_xlsx(
    dw_db,
    language_code: str,
    db_connection_display_name: str,
    level_nid: Optional[int] = None,
    keyword: Optional[str] = None,
    parent_nids: Optional[List[int]] = None,
    sort_order: str = "asc",
    sort_field: str = "ar_level",
) -> Tuple[BytesIO, str]:
    """
    Build the XLSX export for areas with optional filters (same as list API).

    IMPORTANT: Caller must validate DW exists, and pass an active DW session (`dw_db`).

    Args:
        level_nid: Filter by area level; None = all levels.
        keyword: Search on ar_id, ar_name, ar_gid (case-insensitive).
        parent_nids: When set, export only direct children of these area nids.
        sort_order: asc or desc.
        sort_field: ar_nid, ar_name, ar_id, ar_gid, ar_level.

    Returns:
        (xlsx_stream, filename)
    """
    db_connection_name = _sanitize_db_connection_name(
        db_connection_display_name,
        fallback="dw",
    )
    ts = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    filename = f"AREA_{db_connection_name}_{ts}.xlsx"

    try:
        LocaleArea = Area(language_code)
        order_column = LocaleArea.area_level
        if sort_field == "ar_nid":
            order_column = LocaleArea.area_nid
        elif sort_field == "ar_name":
            order_column = LocaleArea.area_name
        elif sort_field == "ar_id":
            order_column = LocaleArea.area_id
        elif sort_field == "ar_gid":
            order_column = LocaleArea.area_gid
        elif sort_field == "ar_level":
            order_column = LocaleArea.area_level
        if sort_order and sort_order.lower() == "desc":
            order_column = order_column.desc()
        else:
            order_column = order_column.asc()

        q = (
            dw_db.query(
                LocaleArea.area_nid,
                LocaleArea.area_id,
                LocaleArea.area_name,
                LocaleArea.area_gid,
                LocaleArea.area_level,
                LocaleArea.area_parent_nid,
            )
            .order_by(order_column)
        )
        if level_nid is not None:
            q = q.filter(LocaleArea.area_level == level_nid)
        if keyword and keyword.strip():
            kw = f"%{keyword.strip()}%"
            q = q.filter(
                or_(
                    LocaleArea.area_id.ilike(kw),
                    LocaleArea.area_name.ilike(kw),
                    LocaleArea.area_gid.ilike(kw),
                )
            )
        if parent_nids:
            q = q.filter(LocaleArea.area_parent_nid.in_(parent_nids))
        areas = q.all()

        nid_to_id = {int(a.area_nid): (a.area_id if a.area_id is not None else None) for a in areas}

        latlong_rows = dw_db.execute(
            text("SELECT area_id, area_lat, area_long FROM ut_area_latlong")
        ).fetchall()
        id_to_latlong = {
            r[0]: (r[1], r[2]) for r in latlong_rows if r and r[0] is not None
        }

        from openpyxl import Workbook
        from openpyxl.utils import get_column_letter

        wb = Workbook()
        ws = wb.active
        ws.title = "Areas"

        # Language-aware, user-facing column titles (from apps/shared/translations/<locale>.json)
        header_keys = [
            "AreaCode",
            "AreaName",
            "AreaLevel",
            "AreaGId",
            "ParentAreaCode",
            "Latitude",
            "Longitude",
        ]
        headers = t_list(header_keys, locale=language_code)

        ws.append(headers)
        max_lens = [len(str(h)) for h in headers]

        for a in areas:
            parent_nid = getattr(a, "area_parent_nid", None)
            parent_id = None
            if parent_nid is not None and int(parent_nid) not in (-1, 0):
                parent_id = nid_to_id.get(int(parent_nid))

            lat, lng = (None, None)
            if getattr(a, "area_id", None) is not None:
                lat, lng = id_to_latlong.get(a.area_id, (None, None))

            row = [
                getattr(a, "area_id", None),
                getattr(a, "area_name", None),
                getattr(a, "area_level", None),
                getattr(a, "area_gid", None),
                parent_id,
                lat,
                lng,
            ]
            ws.append(row)
            for idx, val in enumerate(row):
                sval = "" if val is None else str(val)
                if len(sval) > max_lens[idx]:
                    max_lens[idx] = len(sval)

        # Auto-fit column widths based on max content length (+padding)
        padding = 6
        min_width = 12
        max_width = 80
        for i, max_len in enumerate(max_lens, start=1):
            col_letter = get_column_letter(i)
            ws.column_dimensions[col_letter].width = min(
                max(max_len + padding, min_width),
                max_width,
            )

        output = BytesIO()
        wb.save(output)
        output.seek(0)
        return output, filename

    except Exception as e:
        log_background_incident(
            message=f"Error exporting areas XLSX: {e}",
            error_code="AREA_EXPORT_XLSX_FAILED",
            exc=e,
            source=_AREA_SERVICE_SOURCE,
        )
        raise


def _parse_latlong_value(raw: Any) -> Optional[float]:
    """Coerce ut_area_latlong varchar coordinates to float for JSON; invalid or empty → None."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _load_latlong_by_area_nids(dw_db: Session, nids: List[int]) -> Dict[int, Dict[str, Any]]:
    """
    Load lat/long rows keyed by area_nid. Duplicate nids: keep row with largest id (ORDER BY id DESC).
    """
    if not nids:
        return {}
    stmt = (
        text(
            "SELECT area_nid, id, area_lat, area_long FROM ut_area_latlong "
            "WHERE area_nid IN :nids ORDER BY id DESC"
        ).bindparams(bindparam("nids", expanding=True))
    )
    rows = dw_db.execute(stmt, {"nids": list(nids)}).fetchall()
    by_nid: Dict[int, Dict[str, Any]] = {}
    for r in rows:
        nid = r[0]
        if nid is None:
            continue
        nid_int = int(nid)
        if nid_int in by_nid:
            continue
        by_nid[nid_int] = {
            "id": r[1],
            "area_lat": _parse_latlong_value(r[2]),
            "area_long": _parse_latlong_value(r[3]),
        }
    return by_nid


def _record_to_area(
    record: Any,
    latlong_by_nid: Optional[Dict[int, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Map Area locale record to API response using schema; optionally merge ut_area_latlong."""
    data = AreaResponseSchema.from_record(record)
    if latlong_by_nid:
        nid = data.get("area_nid")
        if nid is not None:
            ll = latlong_by_nid.get(int(nid))
            if ll:
                data["area_lat"] = ll.get("area_lat")
                data["area_long"] = ll.get("area_long")
                if "id" in ll:
                    data["id"] = ll["id"]
    return data


def _ancestor_item(record: Any) -> Dict[str, Any]:
    """Minimal ancestor chain item: area_nid, area_id, area_name, area_level (keys from schema)."""
    full = AreaResponseSchema.from_record(record)
    return {k: full.get(k) for k in ("area_nid", "area_id", "area_name", "area_level")}


class AreaService:
    """Service for Area CRUD operations."""

    def _validate_area_name_duplicate(
        self,
        dw_db: Session,
        ar_name: str,
        ar_parent_nid: int,
        language_code: str,
        exclude_ar_nid: Optional[int] = None,
    ) -> bool:
        """
        Validate that area_name + area_parent_nid combination is unique.
        
        Args:
            dw_db: Database session
            ar_name: Area name (internal param name, maps to area_name in schema)
            ar_parent_nid: Parent area nid (internal param name, maps to area_parent_nid in schema)
            language_code: Language code
            exclude_ar_nid: Area nid to exclude from check (for updates)
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If duplicate found
        """
        AreaModel = Area(language_code)
        query = dw_db.query(AreaModel).filter(
            AreaModel.area_name == apply_lang_prefix(ar_name.strip()),
            AreaModel.area_parent_nid == ar_parent_nid,
        )
        if exclude_ar_nid:
            query = query.filter(AreaModel.area_nid != exclude_ar_nid)
        
        existing = query.first()
        if existing:
            raise Conflict(
                f"Area with name '{ar_name}' and parent_nid '{ar_parent_nid}' already exists",
                error_code="AREA_NAME_PARENT_DUPLICATE",
            )
        return True

    def _validate_area_id_unique(
        self,
        dw_db: Session,
        ar_id: str,
        exclude_ar_nid: Optional[int] = None,
    ) -> bool:
        """
        Validate that area_id is unique across all areas.
        
        Args:
            dw_db: Database session
            ar_id: Area ID (internal param name, maps to area_id in schema)
            exclude_ar_nid: Area nid to exclude from check (for updates)
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If duplicate found
        """
        # Check in default locale table (all locales share same ar_id via sync)
        AreaModel = Area(get_default_locale(dw_db))
        query = dw_db.query(AreaModel).filter(AreaModel.area_id == ar_id.strip())
        if exclude_ar_nid:
            query = query.filter(AreaModel.area_nid != exclude_ar_nid)
        
        existing = query.first()
        if existing:
            raise Conflict(f"Area ID '{ar_id}' already exists", error_code="AREA_ID_EXISTS", identifier=str(ar_id))
        return True

    def _validate_area_gid_format(self, ar_gid: str) -> bool:
        """
        Validate that area_gid has a valid GID format.
        Accepts alphanumeric characters plus: $ @ _ - { }
        
        Args:
            ar_gid: Area GID (internal param name, maps to area_gid in schema)
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If invalid GID format
        """
        if not validate_guid(ar_gid):
            raise BadRequest(
                f"Invalid GID format for area_gid: '{ar_gid}'. "
                f"GID must contain only alphanumeric characters (0-9, a-z, A-Z) "
                f"and special characters ($ @ _ - {{ }}), max 60 characters."
            )
        return True

    def _validate_area_gid_unique(
        self,
        dw_db: Session,
        ar_gid: str,
        exclude_ar_nid: Optional[int] = None,
    ) -> bool:
        """
        Validate that area_gid is unique across all areas.
        
        Args:
            dw_db: Database session
            ar_gid: Area GID (internal param name, maps to area_gid in schema)
            exclude_ar_nid: Area nid to exclude from check (for updates)
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If duplicate found
        """
        # Check in default locale table (all locales share same ar_gid via sync)
        AreaModel = Area(get_default_locale(dw_db))
        query = dw_db.query(AreaModel).filter(AreaModel.area_gid == ar_gid.strip())
        if exclude_ar_nid:
            query = query.filter(AreaModel.area_nid != exclude_ar_nid)
        
        existing = query.first()
        if existing:
            raise Conflict(f"Area GID '{ar_gid}' already exists", error_code="AREA_GID_EXISTS", identifier=str(ar_gid))
        return True

    def _get_or_create_area_level(
        self,
        dw_db: Session,
        dw_id: str,
        area_level: int,
    ) -> int:
        """
        Get or create area level record across ALL configured locale tables.

        Checks existence in the default locale table (authoritative).  If the
        level does not exist, inserts it into every locale table with the same
        explicitly-computed level_nid so the NID is consistent across locales.

        Args:
            dw_db: Database session
            dw_id: Data warehouse identifier (used to fetch all language codes)
            area_level: Area level number

        Returns:
            level_nid (primary key of area level record)
        """
        DefaultAreaLevelModel = AreaLevel(get_default_locale(dw_db))
        level_record = dw_db.query(DefaultAreaLevelModel).filter(
            DefaultAreaLevelModel.area_level == area_level
        ).first()

        if not level_record:
            max_nid = dw_db.query(func.max(DefaultAreaLevelModel.level_nid)).scalar()
            new_level_nid = (max_nid or 0) + 1
            for locale in get_dw_language_codes(dw_id):
                AreaLevelModel = AreaLevel(locale)
                row = AreaLevelModel(
                    level_nid=new_level_nid,
                    area_level=area_level,
                    area_level_name=apply_lang_prefix(f"Level {area_level}"),
                )
                dw_db.add(row)
                dw_db.flush()
            logger.info(f"Created new area level: {area_level} with nid {new_level_nid} (all locales)")
            return new_level_nid

        return level_record.level_nid

    def _compute_area_level(
        self,
        dw_db: Session,
        ar_parent_nid: int,
        language_code: str,
    ) -> int:
        """
        Compute area level based on parent.
        - If parent is root (-1 or 0), return level 1
        - Otherwise, return parent level + 1
        
        Args:
            dw_db: Database session
            ar_parent_nid: Parent area nid
            language_code: Language code
            
        Returns:
            Computed area level
        """
        if ar_parent_nid in ROOT_PARENT_NIDS:
            return 1
        
        # Get parent area and derive level
        AreaModel = Area(language_code)
        parent = dw_db.query(AreaModel).filter(
            AreaModel.area_nid == ar_parent_nid
        ).first()
        
        if not parent:
            raise NotFound(
                f"Parent area with nid {ar_parent_nid} not found",
                error_code="PARENT_AREA_NOT_FOUND",
                identifier=str(ar_parent_nid),
            )
        
        parent_level = getattr(parent, "area_level", 0)
        return parent_level + 1

    def _save_lat_long(
        self,
        dw_db: Session,
        ar_id: str,
        area_nid: int,
        lat: Optional[float],
        long: Optional[float],
        lat_long_id: Optional[str] = None,
        lat_long_db_id: Optional[str] = None,
    ) -> None:
        """
        Save lat/long coordinates for area in ut_area_latlong.
        Matches datamanager behaviour: delete all existing rows for this area_id,
        then insert one row if lat/long are provided.
        
        Args:
            dw_db: Database session
            ar_id: Area ID (external identifier)
            area_nid: Area nid (primary key from ut_area)
            lat: Latitude (area_lat from schema)
            long: Longitude (area_long from schema)
            lat_long_id: Lat/Long identifier (unused; datamanager uses replace strategy)
            lat_long_db_id: Lat/Long database identifier (deprecated)
        """
        # Delete all existing lat/long rows for this area (match datamanager addUpdateAreaLatLong)
        dw_db.execute(
            text("DELETE FROM ut_area_latlong WHERE area_id = :ar_id"),
            {"ar_id": ar_id},
        )
        if lat is not None and long is not None:
            now = datetime.utcnow()
            dw_db.execute(
                text(
                    "INSERT INTO ut_area_latlong (area_id, area_nid, area_lat, area_long, created_at, modified_at) "
                    "VALUES (:area_id, :area_nid, :area_lat, :area_long, :created_at, :modified_at)"
                ),
                {
                    "area_id": ar_id,
                    "area_nid": area_nid,
                    "area_lat": str(lat),
                    "area_long": str(long),
                    "created_at": now,
                    "modified_at": now,
                },
            )
            logger.info(f"Saved lat/long for area {ar_id} (nid={area_nid}): lat={lat}, long={long}")

    def _delete_area_cascade(
        self,
        dw_db: Session,
        dw_id: str,
        ar_nid: int,
        language_code: str,
    ) -> Dict[str, int]:
        """
        Delete area with cascade (descendants, data, maps).
        
        Args:
            dw_db: Database session
            ar_nid: Area nid to delete
            language_code: Language code
            
        Returns:
            Dict with deletion counts
        """
        counts = {
            "areas_deleted": 0,
            "descendants_deleted": 0,
            "data_rows_deleted": 0,
        }
        
        AreaModel = Area(language_code)
        
        # Find all descendant areas recursively
        def get_descendants(parent_nid: int) -> List[int]:
            children = dw_db.query(AreaModel).filter(
                AreaModel.area_parent_nid == parent_nid
            ).all()
            descendant_nids = [child.area_nid for child in children]
            for child_nid in list(descendant_nids):
                descendant_nids.extend(get_descendants(child_nid))
            return descendant_nids
        
        descendant_nids = get_descendants(ar_nid)
        all_nids = [ar_nid] + descendant_nids
        
        logger.info(f"Deleting area {ar_nid} and {len(descendant_nids)} descendants: {all_nids}")
        
        # Preview data PKs affected (before bulk delete returns no row payloads)
        data_nids = [
            r[0]
            for r in dw_db.query(Data.data_nid)
            .filter(Data.area_nid.in_(all_nids))
            .all()
        ]
        # Delete data rows for all areas
        data_deleted = dw_db.query(Data).filter(Data.area_nid.in_(all_nids)).delete(
            synchronize_session=False
        )
        counts["data_rows_deleted"] = data_deleted
        logger.info(f"Deleted {data_deleted} data rows")
        if data_nids or data_deleted > 0:
            buffer_delete_step(
                dw_db,
                module="data",
                description=f"Cascade delete data for area_nid={ar_nid} and descendant area_nids ({len(all_nids)} areas)",
                previous_value={
                    "root_area_nid": ar_nid,
                    **deleted_ids_preview(data_nids),
                },
            )

        # Delete lat/long rows for all areas (match datamanager deleteAreaLatLong)
        if all_nids:
            stmt = text("DELETE FROM ut_area_latlong WHERE area_nid IN :area_nids").bindparams(
                bindparam("area_nids", expanding=True)
            )
            dw_db.execute(stmt, {"area_nids": list(all_nids)})
        
        # Delete area records in all locale tables
        for locale in get_dw_language_codes(dw_id):
            AreaModel = Area(locale)
            areas_deleted = dw_db.query(AreaModel).filter(
                AreaModel.area_nid.in_(all_nids)
            ).delete(synchronize_session=False)
            counts["areas_deleted"] += areas_deleted

        AreaModelSnap = Area(language_code)
        root_snap = dw_db.query(AreaModelSnap).filter(AreaModelSnap.area_nid == ar_nid).first()
        area_prev = snapshot_entity_for_audit(root_snap) if root_snap else {"area_nid": ar_nid}
        area_prev["deleted_area_nids"] = deleted_ids_preview(all_nids)

        buffer_manual_audit(
            dw_db,
            action="DELETE",
            module="area",
            identifier=str(ar_nid),
            description=f"Deleted area nid={ar_nid} and {len(descendant_nids)} descendant(s) with cascade data rows",
            previous_value=area_prev,
        )

        counts["descendants_deleted"] = len(descendant_nids)
        
        return counts

    def delete_areas_by_level(
        self,
        dw_db: Session,
        dw_id: str,
        level_number: int,
        language_code: str,
    ) -> Dict[str, int]:
        """
        Delete all areas whose area_level matches the given level (for area level cascade).
        Deletes root areas at this level first so that cascade handles descendants.

        Args:
            dw_db: Database session
            level_number: Area level number (area_level value) to match
            language_code: Language for locale table

        Returns:
            Dict with aggregated deletion counts (areas_deleted, descendants_deleted, data_rows_deleted)
        """
        AreaModel = Area(language_code)
        rows = dw_db.query(AreaModel).filter(AreaModel.area_level == level_number).all()
        area_nids_at_level = {r.area_nid for r in rows}
        if not area_nids_at_level:
            return {"areas_deleted": 0, "descendants_deleted": 0, "data_rows_deleted": 0}

        # Only delete "roots" at this level (parent not in same level) so each subtree is deleted once
        roots_at_level = [
            r.area_nid for r in rows
            if r.area_parent_nid is None or r.area_parent_nid in (-1, 0) or r.area_parent_nid not in area_nids_at_level
        ]
        total_counts = {"areas_deleted": 0, "descendants_deleted": 0, "data_rows_deleted": 0}
        for ar_nid in roots_at_level:
            counts = self._delete_area_cascade(dw_db, dw_id, ar_nid, language_code)
            total_counts["areas_deleted"] += counts["areas_deleted"]
            total_counts["descendants_deleted"] += counts["descendants_deleted"]
            total_counts["data_rows_deleted"] += counts["data_rows_deleted"]
        return total_counts

    def _create_area_in_session(
        self,
        dw_db: Any,
        dw_id: str,
        area_data: AreaCreateSchema,
        language_code: str,
        *,
        trust_name_duplicate_check: bool = False,
        trust_area_id_unique: bool = False,
        trust_area_gid_unique: bool = False,
        area_level_override: Optional[int] = None,
        skip_get_or_create_area_level: bool = False,
    ) -> int:
        """
        Create one area using an existing session. Does not commit.
        Returns area_nid of the created area.
        """
        if not trust_name_duplicate_check:
            self._validate_area_name_duplicate(
                dw_db,
                area_data.area_name,
                area_data.area_parent_nid or -1,
                language_code,
            )
        if not trust_area_id_unique:
            self._validate_area_id_unique(dw_db, area_data.area_id)

        ar_parent_nid = area_data.area_parent_nid if area_data.area_parent_nid is not None else -1
        if area_level_override is not None:
            area_level = area_level_override
        else:
            area_level = self._compute_area_level(dw_db, ar_parent_nid, language_code)
        if not skip_get_or_create_area_level:
            self._get_or_create_area_level(dw_db, dw_id, area_level)

        ar_gid = area_data.area_gid
        if not ar_gid:
            ar_gid = generate_guid()
            logger.info(f"Generated area_gid: {ar_gid}")
        else:
            self._validate_area_gid_format(ar_gid)
            if not trust_area_gid_unique:
                self._validate_area_gid_unique(dw_db, ar_gid)

        DefaultAreaModel = Area(get_default_locale(dw_db))
        max_nid = dw_db.query(func.max(DefaultAreaModel.area_nid)).scalar()
        area_nid = (max_nid or 0) + 1

        for locale in get_dw_language_codes(dw_id):
            AreaModel = Area(locale)
            new_area = AreaModel(
                area_nid=area_nid,
                area_parent_nid=ar_parent_nid,
                area_id=area_data.area_id.strip(),
                area_name=value_for_locale(area_data.area_name.strip(), locale, language_code),
                area_gid=ar_gid,
                area_level=area_level,
                areashortname=value_for_locale(area_data.area_short_name, locale, language_code) if area_data.area_short_name else None,
                area_block=area_data.block_nids,
                area_global=area_data.area_is_global,
                data_exist=False,
            )
            dw_db.add(new_area)
            dw_db.flush()

        if area_data.area_lat is not None and area_data.area_long is not None:
            self._save_lat_long(
                dw_db,
                area_data.area_id,
                area_nid,
                area_data.area_lat,
                area_data.area_long,
                area_data.id,
                None,
            )
        return area_nid

    def create_area(
        self,
        dw_id: str,
        area_data: AreaCreateSchema,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new area.

        Args:
            dw_id: Data warehouse identifier
            area_data: Area creation data
            language_code: Language for locale content

        Returns:
            Created area dict with ar_nid

        Raises:
            ValueError: If validation fails
        """

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            area_nid = self._create_area_in_session(dw_db, dw_id, area_data, language_code)
            dw_db.commit()
        return self.get_area_by_nid(dw_id, area_nid, language_code)

    def create_areas_batch(
        self,
        dw_id: str,
        items: List[AreaCreateSchema],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create multiple areas with partial-success support.
        Each item is committed independently; failures are collected in errors.
        Returns dict with created (list of result dicts) and errors (list of {index, error} dicts).
        """
        if not items:
            return {"created": [], "errors": []}

        created = []
        errors = []
        for idx, area_data in enumerate(items):
            with get_warehouse_session_from_id(dw_id) as dw_db:
                try:
                    lc = language_code or get_default_locale(dw_db)
                    area_nid = self._create_area_in_session(dw_db, dw_id, area_data, lc)
                    dw_db.commit()
                    result = self.get_area_by_nid(dw_id, area_nid, lc)
                    if result:
                        created.append(result)
                except Exception as e:
                    errors.append({"index": idx, "error": str(e)})

        if created:
            notify_dbmetadata_counts_changed(dw_id)
        return {"created": created, "errors": errors}

    def import_areas_from_xlsx_bytes(
        self,
        dw_id: str,
        file_bytes: bytes,
        *,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Import areas from an XLSX matching GET /areas?export=true (AREA_COLUMN_DEFS).
        ``language_code`` (typically from Accept-Language) drives which ``ut_area_<locale>``
        row supplies ``area_name`` for duplicate checks, prefetch, and ``apply_locale_update``.
        If omitted, the warehouse default locale is used. Structural fields (area_id, area_gid)
        stay consistent across locales.

        Inserts use ``_create_area_in_session``, which still writes all configured locale tables.

        Single warehouse session: commit on success; any error triggers rollback via session context.

        Returns: {"inserted": int, "updated": int, "skipped_empty_rows": int}
        """

        def _canonical_parent_nid(pnid: Optional[int]) -> int:
            if pnid is None:
                return -1
            if pnid in ROOT_PARENT_NIDS:
                return -1
            return int(pnid)

        if not file_bytes:
            raise BadRequest("Uploaded Excel file is empty")

        header_inverse = get_area_import_header_inverse_map()
        raw_rows, skipped_empty = _parse_areas_import_xlsx_bytes(file_bytes, header_inverse)

        n = len(raw_rows)
        if n == 0:
            raise BadRequest("No data rows to import")

        seen_nid: Dict[int, int] = {}
        seen_id: Dict[str, int] = {}
        seen_gid: Dict[str, int] = {}
        declared_nid_to_row_idx: Dict[int, int] = {}
        for i, (offset, rec) in enumerate(raw_rows):
            rid = rec["area_id"]
            if rid in seen_id:
                raise BadRequest(
                    f"Duplicate area_id '{rid}' in rows {seen_id[rid]} and {offset}"
                )
            seen_id[rid] = offset
            gid = rec["area_gid"]
            if gid:
                if gid in seen_gid:
                    raise BadRequest(
                        f"Duplicate area_gid '{gid}' in rows {seen_gid[gid]} and {offset}"
                    )
                seen_gid[gid] = offset
            rnid = rec["raw_area_nid"]
            if rnid is not None:
                if rnid in seen_nid:
                    raise BadRequest(
                        f"Duplicate area_nid '{rnid}' in rows {seen_nid[rnid]} and {offset}"
                    )
                seen_nid[rnid] = offset
                declared_nid_to_row_idx[rnid] = i

        missing_parent_candidates: Set[int] = set()
        for offset, rec in raw_rows:
            p = rec["parent_raw"]
            if p is None or p in ROOT_PARENT_NIDS:
                continue
            if p in declared_nid_to_row_idx:
                continue
            missing_parent_candidates.add(p)

        inserted = 0
        updated = 0

        with get_warehouse_session_from_id(dw_id) as dw_db:
            get_dw_language_codes(dw_id)
            request_lc = language_code if language_code is not None else get_default_locale(dw_db)
            LocaleArea = Area(request_lc)

            if missing_parent_candidates:
                found: Set[int] = set()
                for chunk in _chunk_fixed(list(missing_parent_candidates), _AREA_IMPORT_IN_CHUNK):
                    for row in dw_db.query(LocaleArea).filter(LocaleArea.area_nid.in_(chunk)):
                        found.add(int(row.area_nid))
                gap = missing_parent_candidates - found
                if gap:
                    g = next(iter(sorted(gap)))
                    for row_offset, rec in raw_rows:
                        if rec["parent_raw"] == g:
                            raise BadRequest(
                                f"Row {row_offset}: parent area_nid {g} not found "
                                "in database or in this file"
                            )
                    raise BadRequest(
                        f"parent area_nid {g} not found in database or in this file"
                    )

            predecessors: Dict[int, List[int]] = {i: [] for i in range(n)}
            for i in range(n):
                p = raw_rows[i][1]["parent_raw"]
                if p is None or p in ROOT_PARENT_NIDS:
                    continue
                parent_row_idx = declared_nid_to_row_idx.get(p)
                if parent_row_idx is not None:
                    predecessors[i].append(parent_row_idx)

            process_order = _topological_order_area_import(n, predecessors)
            declared_to_actual: Dict[int, int] = {}

            nid_set: Set[int] = set()
            id_set: Set[str] = set()
            gid_set: Set[str] = set()
            for _off, rec in raw_rows:
                rn = rec["raw_area_nid"]
                if rn is not None:
                    nid_set.add(int(rn))
                pid = rec["parent_raw"]
                if (
                    pid is not None
                    and pid not in ROOT_PARENT_NIDS
                    and pid not in declared_nid_to_row_idx
                ):
                    nid_set.add(int(pid))
                aid = rec["area_id"]
                if aid:
                    id_set.add(aid.strip())
                g = rec["area_gid"]
                if g:
                    gid_set.add(g.strip())

            db_nid_row: Dict[int, _AreaImportRowSnap] = {}
            db_area_id_to_nid: Dict[str, int] = {}
            db_area_gid_to_nid: Dict[str, int] = {}
            nid_to_level: Dict[int, int] = {}
            insert_name_tokens_by_cp: Dict[int, Set[str]] = defaultdict(set)

            def _ingest_snap_row(row: Any) -> None:
                snap = _AreaImportRowSnap(
                    area_nid=int(row.area_nid),
                    area_parent_nid=row.area_parent_nid,
                    area_id=(row.area_id or "").strip() if row.area_id else None,
                    area_gid=(row.area_gid or "").strip() if row.area_gid else None,
                    area_level=int(row.area_level) if row.area_level is not None else 0,
                    area_name=str(row.area_name) if row.area_name is not None else None,
                )
                nid = snap.area_nid
                db_nid_row[nid] = snap
                nid_to_level[nid] = snap.area_level or 0
                if snap.area_id:
                    db_area_id_to_nid[snap.area_id] = nid
                if snap.area_gid:
                    db_area_gid_to_nid[snap.area_gid] = nid

            predicates: List[Any] = []
            for chunk in _chunk_fixed(list(nid_set), _AREA_IMPORT_IN_CHUNK):
                predicates.append(LocaleArea.area_nid.in_(chunk))
            for chunk in _chunk_fixed(list(id_set), _AREA_IMPORT_IN_CHUNK):
                predicates.append(LocaleArea.area_id.in_(chunk))
            for chunk in _chunk_fixed(list(gid_set), _AREA_IMPORT_IN_CHUNK):
                predicates.append(LocaleArea.area_gid.in_(chunk))
            if predicates:
                snaps = dw_db.query(LocaleArea).filter(or_(*predicates)).all()
                for row in snaps:
                    _ingest_snap_row(row)

            static_db_parents = {
                int(p)
                for _o, r in raw_rows
                for p in [r["parent_raw"]]
                if p is not None and p not in ROOT_PARENT_NIDS and p not in declared_nid_to_row_idx
            }
            parents_for_names = static_db_parents | {-1, 0}
            for chunk in _chunk_fixed(list(parents_for_names), _AREA_IMPORT_IN_CHUNK):
                nm_rows = (
                    dw_db.query(LocaleArea.area_parent_nid, LocaleArea.area_name)
                    .filter(LocaleArea.area_parent_nid.in_(chunk))
                    .all()
                )
                for pn, nm in nm_rows:
                    if nm is None:
                        continue
                    cp = _canonical_parent_nid(int(pn) if pn is not None else -1)
                    for k in _area_import_name_keys_from_stored(str(nm)):
                        insert_name_tokens_by_cp[cp].add(k)

            area_levels_ensured: Set[int] = set()

            def computed_level_cached(resolved_par: int) -> int:
                if resolved_par in ROOT_PARENT_NIDS:
                    return 1
                pl = nid_to_level.get(resolved_par)
                if pl is None:
                    row = dw_db.query(LocaleArea).filter(LocaleArea.area_nid == resolved_par).first()
                    if not row:
                        raise BadRequest(
                            f"Parent area with nid {resolved_par} not found"
                        )
                    pl = int(getattr(row, "area_level") or 0)
                    nid_to_level[resolved_par] = pl
                return pl + 1

            for i in process_order:
                offset, rec = raw_rows[i]
                area_id = rec["area_id"]
                area_name = rec["area_name"]
                area_gid = rec["area_gid"]
                raw_area_nid = rec["raw_area_nid"]
                parent_raw = rec["parent_raw"]
                file_area_level = rec["file_area_level"]
                aglobal = rec["area_is_global"]
                mode: Optional[str] = None
                target_nid: Optional[int] = None

                def resolve_parent_nid() -> int:
                    if parent_raw is None or parent_raw in ROOT_PARENT_NIDS:
                        return -1
                    if parent_raw in declared_to_actual:
                        return declared_to_actual[parent_raw]
                    if int(parent_raw) in db_nid_row:
                        return int(parent_raw)
                    raise BadRequest(
                        f"Row {offset}: could not resolve parent area_nid {parent_raw}"
                    )

                resolved_parent = resolve_parent_nid()

                existing_by_nid: Optional[_AreaImportRowSnap] = (
                    db_nid_row.get(int(raw_area_nid)) if raw_area_nid is not None else None
                )

                id_key = area_id.strip() if area_id else ""
                nid_by_id = db_area_id_to_nid.get(id_key)
                existing_for_id_snap = db_nid_row.get(nid_by_id) if nid_by_id is not None else None

                if raw_area_nid is not None and existing_by_nid is not None:
                    mode = "update"
                    target_nid = raw_area_nid
                elif raw_area_nid is not None and existing_by_nid is None and existing_for_id_snap is not None:
                    raise BadRequest(
                        f"Row {offset}: unknown area_nid {raw_area_nid} but area_id '{area_id}' "
                        "already exists — conflicting identifiers"
                    )
                elif existing_for_id_snap is not None:
                    mode = "update"
                    target_nid = existing_for_id_snap.area_nid
                else:
                    mode = "insert"

                if (
                    mode == "update"
                    and raw_area_nid is not None
                    and raw_area_nid != target_nid
                ):
                    raise BadRequest(
                        f"Row {offset}: area_nid column ({raw_area_nid}) does not match "
                        f"existing area_nid ({target_nid}) for area_id '{area_id}'"
                    )

                computed_level = computed_level_cached(resolved_parent)
                if computed_level not in area_levels_ensured:
                    self._get_or_create_area_level(dw_db, dw_id, computed_level)
                    area_levels_ensured.add(computed_level)
                if file_area_level is not None and file_area_level != computed_level:
                    raise BadRequest(
                        f"Row {offset}: area_level in file ({file_area_level}) does not match "
                        f"computed level from parent ({computed_level})"
                    )

                dup_cp = _canonical_parent_nid(resolved_parent)

                if mode == "update":
                    assert target_nid is not None
                    exclude = target_nid
                    old_snap = db_nid_row.get(target_nid)
                    self._validate_area_name_duplicate(
                        dw_db,
                        area_name,
                        resolved_parent,
                        request_lc,
                        exclude_ar_nid=exclude,
                    )
                    other_nid = db_area_id_to_nid.get(area_id.strip())
                    if other_nid is not None and other_nid != exclude:
                        raise Conflict(
                            f"Area ID '{area_id}' already exists",
                            error_code="AREA_ID_EXISTS",
                            identifier=str(area_id),
                        )

                    # Sheet area_gid is intentionally not applied on update; existing DB GID is kept.
                    payload: Dict[str, Any] = {
                        "area_name": area_name.strip(),
                        "area_id": area_id.strip(),
                        "area_parent_nid": resolved_parent,
                        "area_level": computed_level,
                    }
                    if aglobal is not None:
                        payload["area_global"] = aglobal

                    apply_locale_update(
                        dw_db, dw_id, Area, "area_nid", target_nid, payload, request_lc
                    )
                    updated += 1
                    refreshed = (
                        dw_db.query(LocaleArea)
                        .filter(LocaleArea.area_nid == target_nid)
                        .first()
                    )
                    if old_snap and old_snap.area_name is not None:
                        ocp = _canonical_parent_nid(old_snap.area_parent_nid)
                        for k in _area_import_name_keys_from_stored(old_snap.area_name):
                            insert_name_tokens_by_cp[ocp].discard(k)
                    if refreshed:
                        _ingest_snap_row(refreshed)
                        if refreshed.area_name is not None:
                            ncp = _canonical_parent_nid(refreshed.area_parent_nid)
                            for k in _area_import_name_keys_from_stored(str(refreshed.area_name)):
                                insert_name_tokens_by_cp[ncp].add(k)
                    if raw_area_nid is not None:
                        declared_to_actual[raw_area_nid] = target_nid
                else:
                    incoming_name_keys = _area_import_name_keys_from_stored(area_name)
                    name_bucket = insert_name_tokens_by_cp[dup_cp]
                    if name_bucket & incoming_name_keys:
                        raise BadRequest(
                            f"Area with name '{area_name}' and "
                            f"parent_nid '{resolved_parent}' already exists"
                        )

                    nid_other = db_area_id_to_nid.get(area_id.strip())
                    if nid_other is not None:
                        raise Conflict(
                            f"Area ID '{area_id}' already exists",
                            error_code="AREA_ID_EXISTS",
                            identifier=str(area_id),
                        )

                    gid_check = None
                    if area_gid:
                        self._validate_area_gid_format(area_gid)
                        gid_check = area_gid.strip()
                        g_other = db_area_gid_to_nid.get(gid_check)
                        if g_other is not None:
                            raise Conflict(
                                f"Area GID '{area_gid}' already exists",
                                error_code="AREA_GID_EXISTS",
                                identifier=str(area_gid),
                            )

                    create_internal: Dict[str, Any] = {
                        "area_name": area_name,
                        "area_id": area_id,
                        "area_parent_nid": resolved_parent,
                        "area_gid": area_gid,
                        "area_short_name": None,
                        "block_nids": None,
                        "area_is_global": bool(aglobal) if aglobal is not None else False,
                    }
                    create_for_schema = map_dict_internal_to_external_for_entities(
                        create_internal, "ut_area", "ut_area_latlong"
                    )
                    create_payload = AreaCreateSchema(**create_for_schema)
                    new_nid = self._create_area_in_session(
                        dw_db,
                        dw_id,
                        create_payload,
                        request_lc,
                        trust_name_duplicate_check=True,
                        trust_area_id_unique=True,
                        trust_area_gid_unique=bool(gid_check),
                        area_level_override=computed_level,
                        skip_get_or_create_area_level=True,
                    )
                    inserted += 1
                    row_new = (
                        dw_db.query(LocaleArea)
                        .filter(LocaleArea.area_nid == new_nid)
                        .first()
                    )
                    if row_new:
                        _ingest_snap_row(row_new)
                        if row_new.area_name is not None:
                            for k in _area_import_name_keys_from_stored(str(row_new.area_name)):
                                insert_name_tokens_by_cp[dup_cp].add(k)
                    for k in incoming_name_keys:
                        insert_name_tokens_by_cp[dup_cp].add(k)
                    if raw_area_nid is not None:
                        declared_to_actual[raw_area_nid] = new_nid

        if inserted or updated:
            notify_dbmetadata_counts_changed(dw_id)
        return {
            "inserted": inserted,
            "updated": updated,
            "skipped_empty_rows": skipped_empty,
        }

    def update_area(
        self,
        dw_id: str,
        identifier: str,
        area_data: AreaUpdateSchema,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update an existing area by identifier (ar_nid or ar_gid).
        
        Args:
            dw_id: Data warehouse identifier
            identifier: Area identifier: numeric for area_nid (primary key), GUID for area_gid
            area_data: Area update data
            language_code: Language for locale content
            
        Returns:
            Updated area dict
            
        Raises:
            ValueError: If validation fails or area not found
        """
        ar_nid = self.resolve_area_identifier_to_nid(dw_id, identifier)
        if ar_nid is None:
            raise NotFound(
                f"Area with identifier '{identifier}' not found",
                error_code="AREA_NOT_FOUND",
                identifier=str(identifier),
            )
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            # Check if area exists
            AreaModel = Area(language_code)
            area = dw_db.query(AreaModel).filter(AreaModel.area_nid == ar_nid).first()
            if not area:
                raise NotFound(
                    f"Area with nid {ar_nid} not found",
                    error_code="AREA_NOT_FOUND",
                    identifier=str(ar_nid),
                )
            
            # Validate updates
            if area_data.area_name is not None:
                ar_parent_nid = area_data.area_parent_nid if area_data.area_parent_nid is not None else area.area_parent_nid
                self._validate_area_name_duplicate(
                    dw_db,
                    area_data.area_name,
                    ar_parent_nid,
                    language_code,
                    exclude_ar_nid=ar_nid,
                )
            
            if area_data.area_id is not None:
                self._validate_area_id_unique(dw_db, area_data.area_id, exclude_ar_nid=ar_nid)
            
            # Recompute area level if parent changed
            new_area_level = None
            if area_data.area_parent_nid is not None and area_data.area_parent_nid != area.area_parent_nid:
                new_area_level = self._compute_area_level(dw_db, area_data.area_parent_nid, language_code)
                self._get_or_create_area_level(dw_db, dw_id, new_area_level)
            
            # Build column-name-keyed payload (schema attr names differ from column names for some fields)
            payload: Dict[str, Any] = {}
            if area_data.area_name is not None:
                payload["area_name"] = area_data.area_name.strip()
            if area_data.area_id is not None:
                payload["area_id"] = area_data.area_id.strip()
            if area_data.area_parent_nid is not None:
                payload["area_parent_nid"] = area_data.area_parent_nid
            if new_area_level is not None:
                payload["area_level"] = new_area_level
            if area_data.area_short_name is not None:
                payload["areashortname"] = area_data.area_short_name
            if area_data.block_nids is not None:
                payload["area_block"] = area_data.block_nids
            if area_data.area_is_global is not None:
                payload["area_global"] = area_data.area_is_global

            apply_locale_update(dw_db, dw_id, Area, "area_nid", ar_nid, payload, language_code)
            
            # Update lat/long if provided
            if area_data.area_lat is not None and area_data.area_long is not None:
                self._save_lat_long(
                    dw_db,
                    area.area_id,
                    ar_nid,
                    area_data.area_lat,
                    area_data.area_long,
                    area_data.id,
                    None,
                )
            
            dw_db.commit()

            return self.get_area_by_nid(dw_id, ar_nid, language_code)

    def delete_area(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete area with cascade (descendants, data, maps) by identifier (ar_nid or ar_gid).
        
        Args:
            dw_id: Data warehouse identifier
            identifier: Area identifier: numeric for area_nid (primary key), GUID for area_gid
            language_code: Language for locale content
            
        Returns:
            Dict with deletion counts
            
        Raises:
            ValueError: If area not found
        """
        ar_nid = self.resolve_area_identifier_to_nid(dw_id, identifier)
        if ar_nid is None:
            raise NotFound(
                f"Area with identifier '{identifier}' not found",
                error_code="AREA_NOT_FOUND",
                identifier=str(identifier),
            )
        
        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            # Check if area exists
            AreaModel = Area(language_code)
            area = dw_db.query(AreaModel).filter(AreaModel.area_nid == ar_nid).first()
            if not area:
                raise NotFound(
                    f"Area with nid {ar_nid} not found",
                    error_code="AREA_NOT_FOUND",
                    identifier=str(ar_nid),
                )
            
            counts = self._delete_area_cascade(dw_db, dw_id, ar_nid, language_code)
            dw_db.commit()

        notify_dbmetadata_counts_changed(dw_id)
        return counts

    def _build_area_tree(
        self,
        items: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Build parent-child tree from flat area list using area_parent_nid. Root when area_parent_nid in (-1, 0, None)."""
        root_nids = (None, -1, 0)
        by_parent: Dict[Optional[int], List[Dict[str, Any]]] = {}
        for item in items:
            pid = item.get("area_parent_nid")
            if pid is None or (isinstance(pid, int) and pid in (-1, 0)):
                pid = None
            by_parent.setdefault(pid, []).append(item)

        def attach_children(node: Dict[str, Any]) -> Dict[str, Any]:
            nid = node.get("area_nid")
            children = by_parent.get(nid, [])
            out = {k: v for k, v in node.items()}
            out["children"] = [
                attach_children(c)
                for c in sorted(
                    children,
                    key=lambda x: (x.get("area_level") is None, x.get("area_level"), x.get("area_name") or "", x.get("area_nid")),
                )
            ]
            return out

        roots = by_parent.get(None, [])
        return [
            attach_children(r)
            for r in sorted(
                roots,
                key=lambda x: (x.get("area_level") is None, x.get("area_level"), x.get("area_name") or "", x.get("area_nid")),
            )
        ]

    def get_all_areas(
        self,
        dw_id: str,
        language_code: Optional[str] = None,
        level_nid: Optional[int] = None,
        hierarchical: bool = False,
        page: int = 1,
        page_size: Optional[int] = 10,
        keyword: Optional[str] = None,
        identifier: Optional[str] = None,
        identifier_children: bool = True,
        arl_info: bool = False,
        sort_order: str = "asc",
        sort_field: str = "ar_level",
    ) -> Tuple[List[Dict[str, Any]], int, Optional[Dict[str, Any]], Optional[int]]:
        """
        List all areas for the warehouse (locale table) with optional pagination.
        When hierarchical=True, returns a parent-child tree using ar_parent_nid (pagination ignored).
        When hierarchical=False, returns flat paginated list.
        When identifier (comma-separated area_id, area_nid, or area_gid) is provided:
        if identifier_children, returns only direct children of those areas; otherwise only those matched areas.
        keyword filters by ar_id, ar_name, or ar_gid (case-insensitive like).

        Args:
            dw_id: Data warehouse identifier
            language_code: Language for locale content
            level_nid: Optional area level (area_level) to filter by; None = all levels
            hierarchical: If True, return data as parent-child tree; if False, flat paginated list
            page: Page number (1-based); ignored when hierarchical=True
            page_size: Items per page; ignored when hierarchical=True
            keyword: Optional search on ar_id, ar_name, ar_gid (case-insensitive)
            identifier: Optional comma-separated area_id, area_nid, or area_gid
            identifier_children: When identifier is set: True filter by parent_nid in resolved nids; False filter area_nid in resolved nids
            arl_info: If True, return meta.arl_info (area level metadata, schema-shaped) as third element of tuple

        Returns:
            Tuple of (list of area dicts or tree roots with children when hierarchical=True, total count, optional meta_extra with "arl_info")
        """
        meta_extra: Optional[Dict[str, Any]] = None
        use_pagination = page_size is not None and not hierarchical
        if use_pagination:
            page_size = max(1, min(page_size, 1000))
            skip = (page - 1) * page_size

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaModel = Area(language_code)
            order_column = AreaModel.area_level
            if sort_field == "ar_nid":
                order_column = AreaModel.area_nid
            elif sort_field == "ar_name":
                order_column = AreaModel.area_name
            elif sort_field == "ar_id":
                order_column = AreaModel.area_id
            elif sort_field == "ar_gid":
                order_column = AreaModel.area_gid
            elif sort_field == "ar_level":
                order_column = AreaModel.area_level
            if sort_order and sort_order.lower() == "desc":
                order_column = order_column.desc()
            else:
                order_column = order_column.asc()
            q = dw_db.query(AreaModel).order_by(order_column)
            if level_nid is not None:
                q = q.filter(AreaModel.area_level == level_nid)
            has_list_filters = bool(
                (keyword and keyword.strip()) or (identifier and identifier.strip())
            )
            total_count_unfiltered: Optional[int] = None
            if has_list_filters:
                base_q = dw_db.query(AreaModel)
                if level_nid is not None:
                    base_q = base_q.filter(AreaModel.area_level == level_nid)
                total_count_unfiltered = base_q.count()
            if keyword and keyword.strip():
                kw = f"%{keyword.strip()}%"
                q = q.filter(
                    or_(
                        AreaModel.area_id.ilike(kw),
                        AreaModel.area_name.ilike(kw),
                        AreaModel.area_gid.ilike(kw),
                    )
                )
            if identifier and identifier.strip():
                parts = [p.strip() for p in identifier.split(",") if p.strip()]
                resolved_nids: List[int] = []
                for part in parts:
                    nid = self.resolve_area_identifier_to_nid(dw_id, part)
                    if nid is not None:
                        resolved_nids.append(nid)
                if resolved_nids:
                    if identifier_children:
                        q = q.filter(AreaModel.area_parent_nid.in_(resolved_nids))
                    else:
                        q = q.filter(AreaModel.area_nid.in_(resolved_nids))
                else:
                    q = q.filter(AreaModel.area_nid == -1)
            total_count = q.count()
            if arl_info:
                AreaLevelModel = AreaLevel(language_code)
                level_rows = (
                    dw_db.query(AreaLevelModel)
                    .order_by(AreaLevelModel.area_level.asc())
                    .all()
                )
                meta_extra = {
                    QUERY_ARL_INFO: [
                        {
                            "level_nid": r.level_nid,
                            "area_level": r.area_level,
                            "area_level_name": getattr(r, "area_level_name", None) or (f"Level {r.area_level}" if r.area_level is not None else None),
                        }
                        for r in level_rows
                    ]
                }
            if hierarchical:
                rows = q.all()
                nids_list = [int(r.area_nid) for r in rows]
                latlong_map = _load_latlong_by_area_nids(dw_db, nids_list)
                flat = [_record_to_area(r, latlong_map) for r in rows]
                return self._build_area_tree(flat), total_count, meta_extra, total_count_unfiltered
            if use_pagination:
                rows = q.offset(skip).limit(page_size).all()
            else:
                rows = q.all()
            nids_list = [int(r.area_nid) for r in rows]
            latlong_map = _load_latlong_by_area_nids(dw_db, nids_list)
            flat = [_record_to_area(r, latlong_map) for r in rows]
            return flat, total_count, meta_extra, total_count_unfiltered

    def resolve_area_identifier_to_nid(
        self,
        dw_id: str,
        identifier: str,
    ) -> Optional[int]:
        """
        Resolve area identifier (area_nid, area_id, or area_gid) to area_nid.

        Args:
            dw_id: Data warehouse identifier
            identifier: area_nid (numeric string), area_id, or area_gid (GUID)

        Returns:
            ar_nid if found, None otherwise
        """
        raw_identifier = (identifier or "").strip()
        if not raw_identifier:
            return None
        with get_warehouse_session_from_id(dw_id) as dw_db:
            AreaModel = Area(get_default_locale(dw_db))
            # Prefer direct nid match when numeric; fallback to area_id/area_gid lookup.
            try:
                nid = int(raw_identifier)
                row = (
                    dw_db.query(AreaModel.area_nid)
                    .filter(AreaModel.area_nid == nid)
                    .first()
                )
                if row:
                    return row.area_nid
            except (TypeError, ValueError):
                pass

            row = (
                dw_db.query(AreaModel.area_nid)
                .filter(
                    or_(
                        AreaModel.area_id == raw_identifier,
                        AreaModel.area_gid == raw_identifier,
                    )
                )
                .order_by(AreaModel.area_nid.asc())
                .first()
            )
            return row.area_nid if row else None

    def get_area_by_identifier(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get area details by identifier (ar_nid or ar_gid) with ancestor chain.

        Args:
            dw_id: Data warehouse identifier
            identifier: ar_nid (numeric) or ar_gid (GUID)
            language_code: Language for locale content

        Returns:
            Dict with area_nid, area_id, area_name, area_level, ancestors; None if not found
        """
        ar_nid = self.resolve_area_identifier_to_nid(dw_id, identifier)
        if ar_nid is None:
            return None
        return self.get_area_by_nid(dw_id, ar_nid, language_code)

    def get_area_by_nid(
        self,
        dw_id: str,
        ar_nid: int,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get area details by ar_nid with ancestor chain.

        Args:
            dw_id: Data warehouse identifier
            ar_nid: Area nid (primary key)
            language_code: Language for locale content

        Returns:
            Dict with area_nid, area_id, area_name, area_level, and ancestors (parent chain); None if not found
        """

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaModel = Area(language_code)
            row = dw_db.query(AreaModel).filter(AreaModel.area_nid == ar_nid).first()
            if not row:
                return None

            latlong_map = _load_latlong_by_area_nids(dw_db, [int(ar_nid)])
            data = _record_to_area(row, latlong_map)
            ancestors: List[Dict[str, Any]] = []
            current_parent_nid = getattr(row, "area_parent_nid", None)
            if current_parent_nid is not None and current_parent_nid not in ROOT_PARENT_NIDS:
                # Walk up parent chain
                while current_parent_nid is not None and current_parent_nid not in ROOT_PARENT_NIDS:
                    parent_row = (
                        dw_db.query(AreaModel)
                        .filter(AreaModel.area_nid == current_parent_nid)
                        .first()
                    )
                    if not parent_row:
                        break
                    ancestors.append(_ancestor_item(parent_row))
                    current_parent_nid = getattr(parent_row, "area_parent_nid", None)
            data["ancestors"] = ancestors
            return data

    def get_area_parent_by_identifier(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get parent of area by identifier (ar_nid or ar_gid). Returns parent record or root marker.

        Args:
            dw_id: Data warehouse identifier
            identifier: ar_nid (numeric) or ar_gid (GUID)
            language_code: Language for locale content

        Returns:
            Dict with area_nid, area_gid, area_name, is_root; None if area not found
        """
        ar_nid = self.resolve_area_identifier_to_nid(dw_id, identifier)
        if ar_nid is None:
            return None
        return self.get_area_parent(dw_id, ar_nid, language_code)

    def get_area_parent(
        self,
        dw_id: str,
        ar_nid: int,
        language_code: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get parent of area area_nid. Returns parent record (area_nid, area_gid, area_name) or root marker.

        Args:
            dw_id: Data warehouse identifier
            ar_nid: Area nid (child)
            language_code: Language for locale content

        Returns:
            Dict with area_nid, area_gid, area_name, is_root; None if area not found
        """

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaModel = Area(language_code)
            row = dw_db.query(AreaModel).filter(AreaModel.area_nid == ar_nid).first()
            if not row:
                return None

            parent_nid = getattr(row, "area_parent_nid", None)
            if parent_nid is None or parent_nid in ROOT_PARENT_NIDS:
                return AreaParentResponseSchema.from_record(None, is_root=True)

            parent_row = (
                dw_db.query(AreaModel)
                .filter(AreaModel.area_nid == parent_nid)
                .first()
            )
            if not parent_row:
                return AreaParentResponseSchema.from_record(None, is_root=True)
            return AreaParentResponseSchema.from_record(parent_row, is_root=False)

    def get_area_children_by_identifier(
        self,
        dw_id: str,
        identifier: str,
        language_code: Optional[str] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Get direct children of area by identifier (ar_nid or ar_gid). Returns list of child areas.

        Args:
            dw_id: Data warehouse identifier
            identifier: ar_nid (numeric) or ar_gid (GUID) of the parent area
            language_code: Language for locale content

        Returns:
            List of area dicts (area_nid, area_id, area_name, area_level, etc.); None if parent area not found
        """
        ar_nid = self.resolve_area_identifier_to_nid(dw_id, identifier)
        if ar_nid is None:
            return None
        return self.get_area_children(dw_id, ar_nid, language_code)

    def get_area_children(
        self,
        dw_id: str,
        ar_nid: int,
        language_code: Optional[str] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Get direct children of area area_nid. Returns list of child area records.

        Args:
            dw_id: Data warehouse identifier
            ar_nid: Area nid (parent)
            language_code: Language for locale content

        Returns:
            List of area dicts; None if parent area not found
        """

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaModel = Area(language_code)
            # Verify parent exists
            parent_row = dw_db.query(AreaModel).filter(AreaModel.area_nid == ar_nid).first()
            if not parent_row:
                return None

            children = (
                dw_db.query(AreaModel)
                .filter(AreaModel.area_parent_nid == ar_nid)
                .order_by(AreaModel.area_nid)
                .all()
            )
            child_nids = [int(c.area_nid) for c in children]
            latlong_map = _load_latlong_by_area_nids(dw_db, child_nids)
            return [_record_to_area(row, latlong_map) for row in children]

    def get_association_counts(
        self,
        dw_id: str,
        identifiers: List[Any],
        language_code: Optional[str] = None,
    ) -> Dict[str, int]:
        """
        Return association counts for the given areas (for delete confirmation).
        Resolves identifiers (ar_nid or ar_gid) to ar_nids; returns children_count,
        descendants_count, data_count (areas + descendants + data rows).
        """
        if not identifiers:
            with get_warehouse_session_from_id(dw_id) as dw_db:
                language_code = language_code or get_default_locale(dw_db)
                AreaModel = Area(language_code)
                children_count = (
                    dw_db.query(func.count(AreaModel.area_nid))
                    .filter(AreaModel.area_parent_nid != 0)
                    .scalar() or 0
                )
                data_count = dw_db.query(func.count(Data.data_nid)).scalar() or 0
                return {ASSOC_CHILDREN_COUNT: children_count, ASSOC_DESCENDANTS_COUNT: 0, ASSOC_DATA_COUNT: data_count}

        ar_nids: List[int] = []
        for ident in identifiers:
            if isinstance(ident, int):
                ar_nids.append(ident)
            else:
                nid = self.resolve_area_identifier_to_nid(dw_id, str(ident))
                if nid is not None:
                    ar_nids.append(nid)
        ar_nids = list(dict.fromkeys(ar_nids))
        if not ar_nids:
            return {ASSOC_CHILDREN_COUNT: 0, ASSOC_DESCENDANTS_COUNT: 0, ASSOC_DATA_COUNT: 0}

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaModel = Area(language_code)
            children_count = (
                dw_db.query(func.count(AreaModel.area_nid))
                .filter(AreaModel.area_parent_nid.in_(ar_nids))
                .scalar() or 0
            )
            all_nids = list(ar_nids)

            def get_descendants(parent_nids: List[int]) -> List[int]:
                if not parent_nids:
                    return []
                children = (
                    dw_db.query(AreaModel.area_nid)
                    .filter(AreaModel.area_parent_nid.in_(parent_nids))
                    .all()
                )
                child_nids = [r[0] for r in children]
                if not child_nids:
                    return []
                return child_nids + get_descendants(child_nids)

            descendants = get_descendants(ar_nids)
            all_nids.extend(descendants)
            descendants_count = len(descendants)

            if not all_nids:
                return {ASSOC_CHILDREN_COUNT: children_count, ASSOC_DESCENDANTS_COUNT: 0, ASSOC_DATA_COUNT: 0}
            data_count = (
                dw_db.query(func.count(Data.data_nid))
                .filter(Data.area_nid.in_(all_nids))
                .scalar() or 0
            )
            return {
                ASSOC_CHILDREN_COUNT: children_count,
                ASSOC_DESCENDANTS_COUNT: descendants_count,
                ASSOC_DATA_COUNT: data_count,
            }

    def multiple_delete(
        self,
        dw_id: str,
        ar_nids: List[int],
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Delete multiple areas by ar_nid with partial-success support. Cascade: each area + descendants + data.
        Only deletes "roots" among the requested list (areas that are not descendants of another in the list).
        Returns deleted nids, aggregate counts, and per-item errors.
        """
        if not ar_nids:
            return {"deleted": [], "areas_deleted": 0, "descendants_deleted": 0, "data_rows_deleted": 0, "errors": []}

        with get_warehouse_session_from_id(dw_id) as dw_db:
            language_code = language_code or get_default_locale(dw_db)
            AreaModel = Area(language_code)

            # Validate existence and build index map
            nid_to_idx = {nid: idx for idx, nid in enumerate(ar_nids)}
            errors = []
            valid_nids = []
            for idx, ar_nid in enumerate(ar_nids):
                exists = dw_db.query(AreaModel.area_nid).filter(AreaModel.area_nid == ar_nid).first()
                if not exists:
                    errors.append({"index": idx, "error": f"Area with nid '{ar_nid}' not found"})
                else:
                    valid_nids.append(ar_nid)

            all_descendants: set = set()
            for ar_nid in valid_nids:
                children = (
                    dw_db.query(AreaModel.area_nid)
                    .filter(AreaModel.area_parent_nid == ar_nid)
                    .all()
                )
                child_nids = [r[0] for r in children]
                while child_nids:
                    all_descendants.update(child_nids)
                    next_parents = child_nids
                    child_nids = []
                    for p in next_parents:
                        rows = (
                            dw_db.query(AreaModel.area_nid)
                            .filter(AreaModel.area_parent_nid == p)
                            .all()
                        )
                        child_nids.extend([r[0] for r in rows])
            roots = [n for n in valid_nids if n not in all_descendants]
            deleted = []
            total_areas = total_descendants = total_data = 0
            for ar_nid in roots:
                try:
                    counts = self._delete_area_cascade(dw_db, dw_id, ar_nid, language_code)
                    deleted.append(ar_nid)
                    total_areas += counts["areas_deleted"]
                    total_descendants += counts["descendants_deleted"]
                    total_data += counts["data_rows_deleted"]
                except Exception as e:
                    idx = nid_to_idx.get(ar_nid, -1)
                    errors.append({"index": idx, "error": str(e)})
            dw_db.commit()

        if deleted:
            notify_dbmetadata_counts_changed(dw_id)
        return {
            "deleted": deleted,
            "areas_deleted": total_areas,
            "descendants_deleted": total_descendants,
            "data_rows_deleted": total_data,
            "errors": errors,
        }
