"""
Log Service for Data Warehouse Compute Engine.

This service handles log management and monitoring operations including:
- Execution log retrieval and filtering
- Progress tracking and status monitoring
- Detailed job log access with pagination
- Log cleanup and maintenance
"""

import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, text, desc, asc

from apps.datawarehouse.constants import (
    LOG_DETAILS_TABLE_TEMPLATE,
    JOB_STATUS_FAILED,
    JOB_STATUS_PASSED,
    STATUS_DONE,
    STATUS_IN_PROGRESS,
)
from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    CeProcessMaster, CeProcessTime, CeProcessTimeLog
)
from apps.shared.exceptions import NotFound
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_LOG_SERVICE_SOURCE = "apps.datawarehouse.services.log_service"

IUS_NAME_DELIMITERS = ("{||}", "|")


TIMEPERIOD_LIST_SORT_FIELDS = frozenset({"timeperiod", "timeperiod_name", "process_time_id"})
TIMEPERIOD_LIST_SEARCH_BY_FIELDS = frozenset({"timeperiod", "timeperiod_name"})

TIME_LOG_SORT_FIELDS = frozenset({"name", "status", "created_at", "updated_at", "id"})
TIME_LOG_STATUS_FILTER_VALUES = frozenset(
    {"PENDING", "IN-PROGRESS", "DONE", "CANCELLED", "DELETED"}
)
TIME_LOG_SEARCH_BY_FIELDS = frozenset({"name", "execution_name", "remarks"})

LOG_DETAIL_SORT_FIELDS = frozenset({"id", "ius_gid", "area_id", "time_period", "job_status"})
LOG_DETAIL_SEARCH_BY_FIELDS = frozenset({"ius_gid", "area_id", "time_period", "job_status"})


def _parse_filter_object(raw: Any) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


def _string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(x) for x in value if x is not None and str(x).strip()]


def _enriched_log_info(dw_db: Session, log: CeProcessTimeLog) -> Dict[str, Any]:
    """Log summary plus parent process / time-period context for UI and export."""
    process_time = dw_db.query(CeProcessTime).filter(
        CeProcessTime.id == log.process_time_id
    ).first()
    process_master = None
    if process_time:
        process_master = dw_db.query(CeProcessMaster).filter(
            CeProcessMaster.id == process_time.process_id
        ).first()

    log_fo = _parse_filter_object(log.filter_object)
    pt_fo = _parse_filter_object(process_time.filter_object) if process_time else {}
    pm_fo = _parse_filter_object(process_master.filter_object) if process_master else {}

    src_publisher = log_fo.get("src_publisher") or pm_fo.get("src_publisher") or ""
    src_title = log_fo.get("src_title") or pm_fo.get("src_title") or ""
    timeperiods = _string_list(pt_fo.get("timeperiods") or log_fo.get("timeperiods"))
    timeperiods_name = _string_list(
        pt_fo.get("timeperiods_name") or log_fo.get("timeperiods_name")
    )

    ius_selection = pm_fo.get("ius_selection") or log_fo.get("ius_selection")
    target_ius: List[str] = []
    if isinstance(ius_selection, dict):
        raw_ti = ius_selection.get("target_ius")
        if isinstance(raw_ti, list):
            target_ius = _string_list(raw_ti)

    areas = pm_fo.get("areas") or log_fo.get("areas")
    areas_list: List[str] = []
    if isinstance(areas, list):
        areas_list = _string_list(areas)

    return {
        "id": log.id,
        "name": log.name,
        "status": log.status,
        "total_jobs": log.total_jobs,
        "total_executed": log.total_executed,
        "total_pending": log.total_pending,
        "total_failed": log.total_failed,
        "progress_percentage": _ce_process_time_log_progress_percentage(log),
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "updated_at": log.updated_at.isoformat() if log.updated_at else None,
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "remarks": log.remarks,
        "process_time_id": log.process_time_id,
        "process_id": process_time.process_id if process_time else None,
        "process_type": process_master.process_type if process_master else None,
        "src_publisher": str(src_publisher) if src_publisher else "",
        "src_title": str(src_title) if src_title else "",
        "timeperiods": timeperiods,
        "timeperiods_name": timeperiods_name,
        "target_ius_count": len(target_ius),
        "target_ius": target_ius[:50],
        "areas": areas_list,
        "area_level_nid": pm_fo.get("area_level_nid"),
        "execution_filter_object": log_fo,
        "process_filter_object": pm_fo,
    }


def _log_details_status_sql(status_filter: Optional[str]) -> tuple[str, Dict[str, Any]]:
    """
    Build WHERE fragment for ce_process_time_log_{id}_details (Laravel-shaped table).

    Detail rows use column `status` (PASSED/FAILED/NULL), not `dw_id` or `job_status`.
    PENDING filter matches NULL status only (insert-only jobs have no pending rows).
    """
    if not status_filter:
        return "", {}
    if status_filter == "PENDING":
        return " AND status IS NULL", {}
    if status_filter in ("PASSED", "FAILED"):
        return " AND status = :status_filter", {"status_filter": status_filter}
    return "", {}


def _log_details_job_status_sql_expr() -> str:
    """SQL expression matching API job_status (NULL → PENDING)."""
    return "(CASE WHEN status IS NULL THEN 'PENDING' ELSE UPPER(status) END)"


def _log_details_order_sql(sort_field: str, sort_order: str) -> str:
    """Static ORDER BY clause for log detail rows (whitelist only)."""
    direction = "DESC" if sort_order.lower() == "desc" else "ASC"
    sf = sort_field.lower()
    if sf == "id":
        return f"ORDER BY id {direction}"
    if sf == "ius_gid":
        return f"ORDER BY target_ius_gid {direction}"
    if sf == "area_id":
        return f"ORDER BY area_id {direction}"
    if sf == "time_period":
        return f"ORDER BY time_period {direction}"
    if sf == "job_status":
        expr = _log_details_job_status_sql_expr()
        return f"ORDER BY {expr} {direction}"
    return "ORDER BY id ASC"


def _log_details_search_sql(
    search: Optional[str],
    search_by: Optional[str],
) -> tuple[str, Dict[str, Any]]:
    """Build AND (...) search fragment for detail table; parameterized LIKE."""
    if not search or not str(search).strip():
        return "", {}
    pattern = f"%{str(search).strip()}%"
    params = {"search_pattern": pattern}
    expr = _log_details_job_status_sql_expr()
    if search_by and str(search_by).strip():
        key = str(search_by).strip().lower()
        if key == "ius_gid":
            return " AND target_ius_gid LIKE :search_pattern", params
        if key == "area_id":
            return " AND area_id LIKE :search_pattern", params
        if key == "time_period":
            return " AND time_period LIKE :search_pattern", params
        if key == "job_status":
            return f" AND {expr} LIKE :search_pattern", params
        return "", {}
    or_clause = (
        " AND (target_ius_gid LIKE :search_pattern OR area_id LIKE :search_pattern "
        f"OR time_period LIKE :search_pattern OR {expr} LIKE :search_pattern)"
    )
    return or_clause, params


def _apply_timeperiod_list_params(
    rows: List[Dict[str, Any]],
    process_time_id: Optional[int],
    sort_field: str,
    sort_order: str,
    search: Optional[str],
    search_by: Optional[str],
) -> List[Dict[str, Any]]:
    out = list(rows)
    if process_time_id is not None:
        out = [r for r in out if r.get("process_time_id") == process_time_id]
    term = search.strip().lower() if search and search.strip() else ""
    if term:
        sb = (search_by or "").strip().lower()
        if sb == "timeperiod":
            out = [r for r in out if term in (r.get("timeperiod") or "").lower()]
        elif sb == "timeperiod_name":
            out = [r for r in out if term in (r.get("timeperiod_name") or "").lower()]
        else:
            out = [
                r
                for r in out
                if term in (r.get("timeperiod") or "").lower()
                or term in (r.get("timeperiod_name") or "").lower()
            ]
    order_desc = sort_order.lower() == "desc"
    sf = sort_field.lower()
    if sf == "timeperiod_name":
        non_null = [r for r in out if r.get("timeperiod_name") is not None]
        null_rows = [r for r in out if r.get("timeperiod_name") is None]
        non_null.sort(key=lambda r: (r.get("timeperiod_name") or "").lower(), reverse=order_desc)
        out = non_null + null_rows
    elif sf == "process_time_id":
        out = sorted(out, key=lambda r: r.get("process_time_id") or 0, reverse=order_desc)
    else:

        def tp_key(r: Dict[str, Any]) -> str:
            return (r.get("timeperiod") or "").lower()

        out = sorted(out, key=tp_key, reverse=order_desc)
    return out


def _load_source_nid_name_map(dw_db: Session) -> Dict[int, str]:
    """Map source ``ic_nid`` → display name (legacy ``getSourceList``)."""
    try:
        from apps.datawarehouse.models.datawarehouse import get_default_locale

        locale = get_default_locale(dw_db)
        query = text(f"""
            SELECT ic_nid, ic_name
            FROM ut_indicator_classifications_{locale}
            WHERE ic_type = 'SR' AND ic_parent_nid != '-1'
        """)
        rows = dw_db.execute(query).fetchall()
        return {int(row[0]): str(row[1]) for row in rows if row[0] is not None}
    except Exception as e:
        logger.warning("Could not load source name map: %s", e)
        return {}


def _resolve_source_label(
    raw: Any,
    source_map: Optional[Dict[int, str]],
) -> str:
    if raw is None:
        return ""
    if source_map:
        try:
            nid = int(raw)
            if nid in source_map:
                return source_map[nid]
        except (TypeError, ValueError):
            pass
    text_val = str(raw).strip()
    return text_val


def _legacy_log_display_name(dw_db: Session, log: CeProcessTimeLog) -> str:
    """Legacy Laravel: ``Log 1``, ``Log 2``, … ordered by ``created_at`` per process time."""
    sibling_ids = [
        row[0]
        for row in dw_db.query(CeProcessTimeLog.id)
        .filter(
            and_(
                CeProcessTimeLog.process_time_id == log.process_time_id,
                CeProcessTimeLog.deleted_at.is_(None),
            )
        )
        .order_by(asc(CeProcessTimeLog.created_at), asc(CeProcessTimeLog.id))
        .all()
    ]
    try:
        position = sibling_ids.index(log.id)
    except ValueError:
        position = len(sibling_ids)
    return f"Log {position + 1}"


def _dict_get_ci(data: Dict[str, Any], *keys: str) -> Any:
    """Case-insensitive dict lookup (legacy / v6 key variants)."""
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
        key_lower = key.lower()
        for k, v in data.items():
            if k.lower() == key_lower and v is not None:
                return v
    return None


def _split_ius_name_string(name: Optional[str]) -> tuple[str, str, str]:
    text = str(name or "").strip()
    if not text:
        return "", "", ""
    for delim in IUS_NAME_DELIMITERS:
        if delim in text:
            parts = [p.strip() for p in text.split(delim)]
            while len(parts) < 3:
                parts.append("")
            return parts[0], parts[1], parts[2]
    return text, "", ""


def _resolve_ius_components_by_gid(
    dw_id: str,
    gids: List[str],
    language_code: Optional[str] = None,
) -> Dict[str, tuple[str, str, str]]:
    """Map IUS GID → (indicator, unit, subgroup) labels for the requested locale."""
    unique = [g for g in dict.fromkeys(g for g in gids if g and str(g).strip())]
    if not unique:
        return {}
    from apps.datawarehouse.utils.compute_ius_utils import IusUtils

    resolved = IusUtils.resolve_ius_names(dw_id, unique, language_code)
    out: Dict[str, tuple[str, str, str]] = {}
    for gid in unique:
        meta = resolved.get(gid, {})
        if meta.get("error"):
            i, u, s = _split_ius_name_string(gid)
            out[gid] = (i, u, s)
            continue
        out[gid] = (
            str(meta.get("i_name") or "").strip(),
            str(meta.get("u_name") or "").strip(),
            str(meta.get("s_name") or "").strip(),
        )
    return out


def _ius_display_name_from_components(i_name: str, u_name: str, s_name: str) -> str:
    sep = IUS_NAME_DELIMITERS[0]
    if i_name or u_name or s_name:
        return f"{i_name}{sep}{u_name}{sep}{s_name}"
    return ""


def _coerce_source_details_raw(raw: Any) -> List[Dict[str, Any]]:
    if raw is None or raw == "":
        return []
    parsed: Any = raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except (json.JSONDecodeError, TypeError):
                return []
    if isinstance(parsed, dict):
        if parsed and all(isinstance(v, dict) for v in parsed.values()):
            return [v for v in parsed.values() if isinstance(v, dict)]
        return [parsed]
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


def _parse_source_details_list(
    raw: Any,
    *,
    parent_iname: str = "",
    parent_uname: str = "",
    parent_sname: str = "",
    parent_area: str = "",
    parent_timeperiod: str = "",
    source_map: Optional[Dict[int, str]] = None,
) -> List[Dict[str, Any]]:
    """Parse ``source_details`` JSON (Laravel master-detail child rows)."""
    out: List[Dict[str, Any]] = []
    for item in _coerce_source_details_raw(raw):
        name = _dict_get_ci(item, "name", "ius_name")
        if not name:
            in_part = _dict_get_ci(item, "in", "i", "iname", "indicator")
            un_part = _dict_get_ci(item, "un", "u", "uname", "unit")
            sn_part = _dict_get_ci(item, "sn", "s", "sname", "subgroup")
            if in_part or un_part or sn_part:
                name = IUS_NAME_DELIMITERS[0].join(
                    [str(in_part or ""), str(un_part or ""), str(sn_part or "")]
                )
        iname, uname, sname = _split_ius_name_string(
            str(name) if name is not None else ""
        )
        if not iname:
            iname = str(_dict_get_ci(item, "iname", "indicator") or "").strip()
        if not uname:
            uname = str(_dict_get_ci(item, "uname", "unit") or "").strip()
        if not sname:
            sname = str(_dict_get_ci(item, "sname", "subgroup") or "").strip()
        if not iname and not uname and not sname:
            gid = _dict_get_ci(item, "gid")
            if gid:
                iname, uname, sname = _split_ius_name_string(str(gid))

        area = str(
            _dict_get_ci(item, "area", "area_name", "area_id") or ""
        ).strip()
        timeperiod = str(
            _dict_get_ci(item, "timeperiod", "time_period", "tp") or ""
        ).strip()
        source_nid_raw = _dict_get_ci(item, "source_nid", "sourceNid", "source_nid")
        source = _resolve_source_label(
            _dict_get_ci(item, "source", "source_name"), source_map
        )
        if not source:
            source = _resolve_source_label(source_nid_raw, source_map)

        dv = _dict_get_ci(item, "dv", "data_value", "value")

        if not area and parent_area:
            area = parent_area
        if not timeperiod and parent_timeperiod:
            timeperiod = parent_timeperiod

        out.append({
            "iname": iname or parent_iname,
            "uname": uname or parent_uname,
            "sname": sname or parent_sname,
            "area": area,
            "timeperiod": timeperiod,
            "source": source,
            "dv": dv,
        })
    return out


def _format_log_duration_hhmm(start: Any, end: Any) -> str:
    if not start or not end:
        return ""
    try:
        s = start if isinstance(start, datetime) else datetime.fromisoformat(str(start).replace("Z", "+00:00"))
        e = end if isinstance(end, datetime) else datetime.fromisoformat(str(end).replace("Z", "+00:00"))
        if s.tzinfo:
            s = s.replace(tzinfo=None)
        if e.tzinfo:
            e = e.replace(tzinfo=None)
        diff = max(0, int((e - s).total_seconds()))
    except (TypeError, ValueError):
        return ""
    hours = diff // 3600
    minutes = (diff % 3600) // 60
    return f"{hours}:{minutes:02d}"


def _filter_display_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if v is not None and str(v).strip()]
    text = str(value).strip()
    return [text] if text else []


def _areas_from_filter_object(fo: Dict[str, Any]) -> List[str]:
    """Areas-under labels from legacy or v6 ``filter_object`` (``areas`` list / ``all``)."""
    if fo.get("areaUnder") in ("all", "All") or fo.get("areaUnderName") in (
        "all",
        "All",
    ):
        return ["all"]
    names = _filter_display_list(fo.get("areaUnderName") or fo.get("areas_name"))
    if names:
        return names
    under = fo.get("areaUnder")
    if under not in (None, "", "all"):
        legacy = _filter_display_list(under)
        if legacy:
            return legacy
    areas_raw = fo.get("areas")
    if areas_raw == "all":
        return ["all"]
    if isinstance(areas_raw, list):
        tokens = _filter_display_list(areas_raw)
        if not tokens:
            return []
        if len(tokens) == 1 and tokens[0].lower() == "all":
            return ["all"]
        return tokens
    return []


def _target_ius_names_from_filter_object(
    fo: Dict[str, Any],
    dw_id: str,
    language_code: Optional[str] = None,
) -> List[str]:
    """Target IUS display names from legacy or v6 ``ius_selection.target_ius``."""
    if fo.get("targetIUS") == "all" or fo.get("target_ius") == "all":
        return ["all"]

    raw_target = fo.get("targetIUSName") or fo.get("target_ius_name")
    if isinstance(raw_target, list):
        names = _filter_display_list(raw_target)
        if names:
            return names
    elif isinstance(raw_target, str) and raw_target.strip():
        if IUS_NAME_DELIMITERS[0] in raw_target:
            return [
                p.strip() for p in raw_target.split(IUS_NAME_DELIMITERS[0]) if p.strip()
            ]
        return [raw_target.strip()]

    sel = fo.get("ius_selection")
    if not isinstance(sel, dict):
        return []
    ti = sel.get("target_ius")
    if ti == "all":
        return ["all"]
    gids: List[str] = []
    if isinstance(ti, list):
        gids = _filter_display_list(ti)
    elif isinstance(ti, str) and ti.strip():
        gids = [ti.strip()]
    if not gids:
        return []
    if len(gids) == 1 and gids[0].lower() == "all":
        return ["all"]

    components = _resolve_ius_components_by_gid(dw_id, gids, language_code)
    names: List[str] = []
    for gid in gids:
        i_name, u_name, s_name = components.get(gid, ("", "", ""))
        display = _ius_display_name_from_components(i_name, u_name, s_name)
        names.append(display or gid)
    return names


def _build_log_view_info(
    log: CeProcessTimeLog,
    dw_db: Session,
    language_code: Optional[str] = None,
) -> Dict[str, Any]:
    """Summary header for log view (legacy ``prepareLogDetails`` shape)."""
    fo: Dict[str, Any] = {}
    if log.filter_object:
        try:
            parsed = json.loads(log.filter_object)
            fo = parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, TypeError):
            fo = {}

    process_time = dw_db.query(CeProcessTime).filter(
        CeProcessTime.id == log.process_time_id
    ).first()
    process_master = None
    if process_time:
        process_master = dw_db.query(CeProcessMaster).filter(
            CeProcessMaster.id == process_time.process_id
        ).first()

    execution_type = fo.get("executionType") or (
        process_master.process_type if process_master else None
    )
    area_level = fo.get("areaLevelName") or fo.get("area_level_name")
    if area_level in (None, "", "all"):
        area_level = fo.get("areaLevel") or area_level

    area_names = _areas_from_filter_object(fo)
    target_names = _target_ius_names_from_filter_object(
        fo, str(log.dw_id), language_code
    )

    tp_names = _filter_display_list(
        fo.get("timeperiods_name") or fo.get("timeperiodsName")
    )

    display_name = _legacy_log_display_name(dw_db, log)

    return {
        "id": log.id,
        "name": log.name,
        "display_name": display_name,
        "status": log.status,
        "total_jobs": log.total_jobs,
        "total_executed": log.total_executed,
        "total_pending": log.total_pending,
        "total_failed": log.total_failed,
        "progress_percentage": (
            round(((log.total_executed or 0) / log.total_jobs) * 100, 2)
            if log.total_jobs
            else 0.0
        ),
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "updated_at": log.updated_at.isoformat() if log.updated_at else None,
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "remarks": log.remarks,
        "process_time_id": log.process_time_id,
        "process_id": process_time.process_id if process_time else None,
        "process_type": execution_type,
        "execution_type": execution_type,
        "src_publisher": fo.get("srcPublisher") or fo.get("src_publisher"),
        "src_title": fo.get("srcTitle") or fo.get("src_title"),
        "area_level_name": area_level,
        "areas": area_names,
        "areas_display": ", ".join(area_names) if area_names else None,
        "target_ius": target_names,
        "target_ius_display": (
            f"{IUS_NAME_DELIMITERS[0]} ".join(target_names) if target_names else None
        ),
        "target_ius_count": len(target_names),
        "timeperiods": _filter_display_list(fo.get("timeperiods")),
        "timeperiods_name": tp_names,
        "timeperiods_display": ", ".join(tp_names) if tp_names else None,
        "duration_display": _format_log_duration_hhmm(log.created_at, log.completed_at),
        "filter_object": fo,
    }


def _map_detail_row_to_api(
    row: Any,
    *,
    source_map: Optional[Dict[int, str]] = None,
    ius_by_gid: Optional[Dict[str, tuple[str, str, str]]] = None,
) -> Dict[str, Any]:
    """Map a detail-table row to legacy log-view grid shape (master + ``source_details``)."""
    _id = row[0]
    target_ius_gid = row[1] or ""
    target_ius_name = row[2] or ""
    area_id = row[3] or ""
    area_name = row[4] or ""
    time_period = row[5] or ""
    source_details_raw = row[6]
    raw_status = row[7]
    remarks = row[8]
    data_value = row[9]
    process_type = row[10] or ""
    source_name = row[11]
    created_at = row[12]

    if ius_by_gid and target_ius_gid in ius_by_gid:
        target_iname, target_uname, target_sname = ius_by_gid[target_ius_gid]
    else:
        target_iname, target_uname, target_sname = _split_ius_name_string(target_ius_name)
    parent_area = (area_name or area_id or "").strip()
    parent_timeperiod = (time_period or "").strip()
    source_details = _parse_source_details_list(
        source_details_raw,
        parent_iname=target_iname,
        parent_uname=target_uname,
        parent_sname=target_sname,
        parent_area=parent_area,
        parent_timeperiod=parent_timeperiod,
        source_map=source_map,
    )

    resolved_source_name = source_name
    if source_map and source_name is not None:
        resolved_source_name = _resolve_source_label(source_name, source_map) or source_name

    if raw_status is None:
        job_status = "PENDING"
    else:
        job_status = str(raw_status).upper()

    err_status = str(raw_status or "").upper()
    error_message = remarks if err_status == "FAILED" and remarks else None

    created_iso = created_at.isoformat() if created_at else None
    completed_iso = created_iso if job_status in ("PASSED", "FAILED") else None

    job_payload: Dict[str, Any] = {
        "data_value": data_value,
        "process_type": process_type,
        "source_name": source_name,
    }

    return {
        "id": _id,
        "ius_gid": target_ius_gid,
        "target_iname": target_iname,
        "target_uname": target_uname,
        "target_sname": target_sname,
        "area_id": area_id,
        "area_name": area_name or area_id,
        "time_period": time_period,
        "process_type": process_type,
        "source_name": resolved_source_name,
        "data_value": data_value,
        "remarks": remarks,
        "source_details": source_details,
        "job_payload": job_payload,
        "job_status": job_status,
        "error_message": error_message,
        "created_at": created_iso,
        "updated_at": created_iso,
        "completed_at": completed_iso,
    }


def _map_detail_rows_to_api(
    rows: List[Any],
    source_map: Optional[Dict[int, str]],
    ius_by_gid: Optional[Dict[str, tuple[str, str, str]]] = None,
) -> List[Dict[str, Any]]:
    return [
        _map_detail_row_to_api(row, source_map=source_map, ius_by_gid=ius_by_gid)
        for row in rows
    ]


def _parse_process_time_filter_object(raw: Any) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        fo = json.loads(raw) if isinstance(raw, str) else {}
    except (json.JSONDecodeError, TypeError):
        return None
    return fo if isinstance(fo, dict) else None


def _timeperiod_labels_from_filter(fo: Dict[str, Any]) -> List[str]:
    """Display labels for the Time column (legacy ``timeperiodsName`` / v6 ``timeperiods_name``)."""
    names = fo.get("timeperiods_name") or fo.get("timeperiodsName") or []
    tokens = fo.get("timeperiods") or []
    if not isinstance(names, list):
        names = []
    if not isinstance(tokens, list):
        tokens = []
    labels: List[str] = []
    if names:
        for i, name in enumerate(names):
            if name is None:
                continue
            text = str(name).strip()
            if not text and i < len(tokens) and tokens[i] is not None:
                text = str(tokens[i]).strip()
            if text:
                labels.append(text)
    elif tokens:
        for tid in tokens:
            if tid is None:
                continue
            text = str(tid).strip()
            if text:
                labels.append(text)
    return labels


def _collect_process_time_list_rows(process_times: List[Any]) -> List[Dict[str, Any]]:
    """
    One list entry per ``ce_process_time`` row (legacy process-time grid).

    ``timeperiod_labels`` mirrors Laravel ``timeperiodsName``; ``timeperiod_display`` is the
    comma-joined Time column value (single label when only one period was selected).
    """
    out: List[Dict[str, Any]] = []
    for pt in process_times:
        pt_row_id = getattr(pt, "id", None)
        if pt_row_id is None:
            continue
        fo = _parse_process_time_filter_object(getattr(pt, "filter_object", None))
        if fo is None:
            continue
        labels = _timeperiod_labels_from_filter(fo)
        created_iso = None
        cat = getattr(pt, "created_at", None)
        if cat is not None:
            created_iso = cat.isoformat() if hasattr(cat, "isoformat") else str(cat)
        display = ", ".join(labels) if labels else ""
        out.append({
            "process_time_id": pt_row_id,
            "timeperiod_labels": labels,
            "timeperiod_display": display,
            "created_at": created_iso,
            # Sort/search helpers (legacy ``timeperiod`` / ``timeperiod_name`` fields)
            "timeperiod": display,
            "timeperiod_name": labels[0] if len(labels) == 1 else display or None,
            "execution_name": None,
        })
    return out


def _execution_name_from_log_filter(fo: Dict[str, Any]) -> Optional[str]:
    raw = fo.get("execution_name") or fo.get("name")
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _enrich_process_time_rows_with_execution_name(
    dw_db: Session,
    dw_id: str,
    rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Latest ``ce_process_time_logs`` row per process time supplies ``execution_name``."""
    if not rows:
        return rows
    pt_ids = [int(r["process_time_id"]) for r in rows if r.get("process_time_id") is not None]
    if not pt_ids:
        return rows
    logs = (
        dw_db.query(CeProcessTimeLog)
        .filter(
            and_(
                CeProcessTimeLog.dw_id == int(dw_id),
                CeProcessTimeLog.process_time_id.in_(pt_ids),
                CeProcessTimeLog.deleted_at.is_(None),
            )
        )
        .order_by(
            CeProcessTimeLog.process_time_id,
            desc(CeProcessTimeLog.created_at),
        )
        .all()
    )
    name_by_pt: Dict[int, str] = {}
    for log in logs:
        pt_id = int(log.process_time_id)
        if pt_id in name_by_pt:
            continue
        fo = _parse_process_time_filter_object(log.filter_object)
        if not fo:
            continue
        en = _execution_name_from_log_filter(fo)
        if en:
            name_by_pt[pt_id] = en
    for row in rows:
        pt_id = row.get("process_time_id")
        if pt_id is not None:
            row["execution_name"] = name_by_pt.get(int(pt_id))
    return rows


def _ce_process_time_log_progress_percentage(log: CeProcessTimeLog) -> float:
    """Progress as total_executed / total_jobs.

    total_executed already includes failed jobs (the job runner increments both
    total_executed and total_failed on failure), so adding total_failed again
    would double-count failures and push the percentage above 100%.
    """
    if not log.total_jobs or log.total_jobs == 0:
        return 0.0
    return round(((log.total_executed or 0) / log.total_jobs) * 100, 2)


def refresh_process_time_log_progress(
    dw_db: Session,
    dw_id: str,
    process_time_log_id: int,
) -> Dict[str, Any]:
    """
    Recount job rows in ``ce_process_time_log_{id}_details`` and update ``ce_process_time_logs``.

    Uses the caller's warehouse session (must commit after if autocommit is off).
    Raises ValueError if the parent log row is missing.
    """
    log = dw_db.query(CeProcessTimeLog).filter(
        and_(
            CeProcessTimeLog.id == process_time_log_id,
            CeProcessTimeLog.dw_id == int(dw_id),
        )
    ).first()

    if not log:
        raise NotFound(f"Log {process_time_log_id} not found")

    table_name = LOG_DETAILS_TABLE_TEMPLATE.format(log_id=process_time_log_id)
    status_query = text(f"""
        SELECT
            status,
            COUNT(*) as count
        FROM `{table_name}`
        GROUP BY status
    """)

    status_result = dw_db.execute(status_query).fetchall()

    total_executed = 0
    total_pending = 0
    total_failed = 0

    for row in status_result:
        status, count = row[0], row[1]
        if status == JOB_STATUS_PASSED:
            total_executed += count
        elif status == JOB_STATUS_FAILED:
            total_failed += count
        else:
            total_pending += count

    total_jobs = total_executed + total_pending + total_failed

    if total_pending == 0:
        overall_status = STATUS_DONE
    else:
        overall_status = STATUS_IN_PROGRESS

    log.total_jobs = total_jobs
    log.total_executed = total_executed
    log.total_pending = total_pending
    log.total_failed = total_failed
    log.status = overall_status
    log.updated_at = datetime.utcnow()

    if overall_status == STATUS_DONE and not log.completed_at:
        log.completed_at = datetime.utcnow()

    dw_db.commit()

    return {
        "log_id": process_time_log_id,
        "status": overall_status,
        "total_jobs": total_jobs,
        "total_executed": total_executed,
        "total_pending": total_pending,
        "total_failed": total_failed,
        "progress_percentage": _ce_process_time_log_progress_percentage(log),
    }


class LogService:
    """Service for managing compute engine logs and monitoring."""
    
    def __init__(self):
        pass
    
    def get_all_execution_logs(
        self, 
        dw_id: str, 
        limit: int = 50, 
        offset: int = 0,
        status_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get all execution logs with optional filtering.
        
        Args:
            dw_id: Data warehouse ID
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            status_filter: Optional status filter
            
        Returns:
            Dictionary with logs and pagination info
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            query = dw_db.query(CeProcessTimeLog).filter(
                and_(
                    CeProcessTimeLog.dw_id == int(dw_id),
                    CeProcessTimeLog.deleted_at.is_(None)
                )
            )
            
            if status_filter:
                query = query.filter(CeProcessTimeLog.status == status_filter)
            
            # Get total count
            total_count = query.count()
            
            # Get paginated results
            logs = query.order_by(desc(CeProcessTimeLog.created_at)).offset(offset).limit(limit).all()
            
            result_logs = []
            for log in logs:
                # Get associated process info
                process_time = dw_db.query(CeProcessTime).filter(
                    CeProcessTime.id == log.process_time_id
                ).first()
                
                process_master = None
                if process_time:
                    process_master = dw_db.query(CeProcessMaster).filter(
                        CeProcessMaster.id == process_time.process_id
                    ).first()
                
                result_logs.append({
                    "id": log.id,
                    "name": log.name,
                    "status": log.status,
                    "process_type": process_master.process_type if process_master else None,
                    "total_jobs": log.total_jobs,
                    "total_executed": log.total_executed,
                    "total_pending": log.total_pending,
                    "total_failed": log.total_failed,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                    "updated_at": log.updated_at.isoformat() if log.updated_at else None,
                    "completed_at": log.completed_at.isoformat() if log.completed_at else None,
                    "remarks": log.remarks,
                    "progress_percentage": self._calculate_progress_percentage(log)
                })
            
            return {
                "logs": result_logs,
                "total_count": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total_count
            }
    
    def get_timeperiods_by_process(
        self,
        dw_id: str,
        process_id: int,
        process_time_id: Optional[int] = None,
        sort_field: str = "timeperiod",
        sort_order: str = "asc",
        search: Optional[str] = None,
        search_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List time-period selections configured for a process (from ``ce_process_time``).

        Args:
            dw_id: Data warehouse ID
            process_id: Process master ID
            process_time_id: Optional filter to rows for one ``ce_process_time`` row
            sort_field: timeperiod | timeperiod_name | process_time_id
            sort_order: asc | desc
            search: Case-insensitive substring filter
            search_by: timeperiod | timeperiod_name (omit to search both)

        Returns:
            ``{"timeperiods": [{"process_time_id": ce_process_time.id,
            "timeperiod": "<token>", "timeperiod_name": ...,
            "created_at": ISO8601 from ce_process_time.created_at}, ...]}``
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            process_times = dw_db.query(CeProcessTime).filter(
                and_(
                    CeProcessTime.dw_id == int(dw_id),
                    CeProcessTime.process_id == process_id,
                    CeProcessTime.deleted_at.is_(None)
                )
            ).all()

            timeperiods = _collect_process_time_list_rows(process_times)
            timeperiods = _enrich_process_time_rows_with_execution_name(
                dw_db, dw_id, timeperiods
            )
            timeperiods = _apply_timeperiod_list_params(
                timeperiods,
                process_time_id,
                sort_field,
                sort_order,
                search,
                search_by,
            )
            return {"timeperiods": timeperiods}
    
    def get_time_logs_by_process_time(
        self,
        dw_id: str,
        process_time_id: int,
        status: Optional[str] = None,
        sort_field: str = "created_at",
        sort_order: str = "desc",
        search: Optional[str] = None,
        search_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get execution logs for a specific process time.

        Args:
            dw_id: Data warehouse ID
            process_time_id: Process time ID
            status: Optional filter on log row status (PENDING, IN-PROGRESS, …)
            sort_field: name | status | created_at | updated_at | id
            sort_order: asc | desc
            search: Substring match on name/remarks (or search_by column)
            search_by: name | execution_name | remarks

        Returns:
            List of execution logs for the process time
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            query = dw_db.query(CeProcessTimeLog).filter(
                and_(
                    CeProcessTimeLog.dw_id == int(dw_id),
                    CeProcessTimeLog.process_time_id == process_time_id,
                    CeProcessTimeLog.deleted_at.is_(None)
                )
            )
            if status:
                query = query.filter(CeProcessTimeLog.status == status)
            if search and search.strip():
                pat = f"%{search.strip()}%"
                sb = (search_by or "").strip().lower()
                if sb in ("name", "execution_name"):
                    query = query.filter(CeProcessTimeLog.name.ilike(pat))
                elif sb == "remarks":
                    query = query.filter(CeProcessTimeLog.remarks.ilike(pat))
                else:
                    query = query.filter(
                        or_(
                            CeProcessTimeLog.name.ilike(pat),
                            CeProcessTimeLog.remarks.ilike(pat),
                        )
                    )
            sort_key = sort_field.lower()
            sort_col = {
                "name": CeProcessTimeLog.name,
                "status": CeProcessTimeLog.status,
                "created_at": CeProcessTimeLog.created_at,
                "updated_at": CeProcessTimeLog.updated_at,
                "id": CeProcessTimeLog.id,
            }.get(sort_key, CeProcessTimeLog.created_at)
            sort_dir = desc if sort_order.lower() == "desc" else asc
            logs = query.order_by(sort_dir(sort_col)).all()
            
            result_logs = []
            for log in logs:
                result_logs.append({
                    "id": log.id,
                    "name": log.name,
                    "display_name": _legacy_log_display_name(dw_db, log),
                    "status": log.status,
                    "total_jobs": log.total_jobs,
                    "total_executed": log.total_executed,
                    "total_pending": log.total_pending,
                    "total_failed": log.total_failed,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                    "updated_at": log.updated_at.isoformat() if log.updated_at else None,
                    "completed_at": log.completed_at.isoformat() if log.completed_at else None,
                    "remarks": log.remarks,
                    "progress_percentage": self._calculate_progress_percentage(log),
                    "filter_object": json.loads(log.filter_object) if log.filter_object else {}
                })
            
            return result_logs
    
    def get_log_details(
        self,
        dw_id: str,
        process_time_log_id: int,
        limit: int = 100,
        offset: int = 0,
        status_filter: Optional[str] = None,
        sort_field: str = "id",
        sort_order: str = "asc",
        search: Optional[str] = None,
        search_by: Optional[str] = None,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get detailed job logs with pagination.

        Args:
            dw_id: Data warehouse ID
            process_time_log_id: Process time log ID (ce_process_time_logs.id)
            limit: Maximum number of detail records to return
            offset: Number of records to skip
            status_filter: Optional job status filter
            sort_field: id | ius_gid | area_id | time_period | job_status
            sort_order: asc | desc
            search: Substring on ius_gid, area_id, time_period, job_status (or search_by)
            search_by: ius_gid | area_id | time_period | job_status

        Returns:
            Dictionary with detailed logs and pagination info
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Verify log exists
            log = dw_db.query(CeProcessTimeLog).filter(
                and_(
                    CeProcessTimeLog.id == process_time_log_id,
                    CeProcessTimeLog.dw_id == int(dw_id)
                )
            ).first()

            if not log:
                raise NotFound(f"Log {process_time_log_id} not found")

            # Get details from dynamic table (per process_service._create_log_details_table)
            table_name = LOG_DETAILS_TABLE_TEMPLATE.format(log_id=process_time_log_id)
            status_sql, status_params = _log_details_status_sql(status_filter)
            search_sql, search_params = _log_details_search_sql(search, search_by)
            where_clause = f"WHERE 1=1{status_sql}{search_sql}"
            params: Dict[str, Any] = {**status_params, **search_params}
            order_sql = _log_details_order_sql(sort_field, sort_order)

            # Count total records
            count_query = text(f"""
                SELECT COUNT(*) as total_count
                FROM `{table_name}`
                {where_clause}
            """)

            try:
                count_result = dw_db.execute(count_query, params).fetchone()
                total_count = count_result[0] if count_result else 0

                # Paginated details: physical columns target_ius_gid, status, source_details, …
                details_query = text(f"""
                    SELECT id, target_ius_gid, target_ius_name, area_id, area_name, time_period,
                           source_details, status, remarks, data_value, process_type, source_name,
                           created_at
                    FROM `{table_name}`
                    {where_clause}
                    {order_sql}
                    LIMIT :limit OFFSET :offset
                """)

                list_params = dict(params)
                list_params.update({"limit": limit, "offset": offset})
                details_result = dw_db.execute(details_query, list_params).fetchall()

                source_map = _load_source_nid_name_map(dw_db)
                ius_by_gid = _resolve_ius_components_by_gid(
                    str(dw_id),
                    [r[1] for r in details_result if r[1]],
                    language_code,
                )
                details = _map_detail_rows_to_api(
                    details_result, source_map, ius_by_gid=ius_by_gid
                )
                
                return {
                    "log_info": _enriched_log_info(dw_db, log),
                    "details": details,
                    "total_count": total_count,
                    "limit": limit,
                    "offset": offset,
                    "has_more": (offset + limit) < total_count,
                }

            except Exception as e:
                log_background_incident(
                    message=f"Failed to get log details: {e}",
                    error_code="COMPUTE_LOG_DETAILS_QUERY_FAILED",
                    exc=e,
                    source=_LOG_SERVICE_SOURCE,
                )
                # Return empty result if table doesn't exist or query fails
                return {
                    "log_info": _enriched_log_info(dw_db, log),
                    "details": [],
                    "total_count": 0,
                    "limit": limit,
                    "offset": offset,
                    "has_more": False,
                }
    
    def update_log_progress(self, dw_id: str, process_time_log_id: int) -> Dict[str, Any]:
        """
        Update log progress by counting job statuses from detail table.
        
        Args:
            dw_id: Data warehouse ID
            process_time_log_id: Process time log ID (ce_process_time_logs.id)
            
        Returns:
            Dictionary with updated progress info
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                data = refresh_process_time_log_progress(dw_db, dw_id, process_time_log_id)
                return {"success": True, **data}
            except Exception as e:
                log_background_incident(
                    message=f"Failed to update log progress: {e}",
                    error_code="COMPUTE_LOG_PROGRESS_UPDATE_FAILED",
                    exc=e,
                    source=_LOG_SERVICE_SOURCE,
                )
                return {
                    "success": False,
                    "error": str(e)
                }
    
    def delete_process_time_log(self, dw_id: str, process_time_log_id: int) -> Dict[str, Any]:
        """
        Delete a process time log and drop its dynamic job-detail table.

        Matches Laravel's destroyProcessTimeLog behaviour:
        1. Locate the CeProcessTimeLog row.
        2. DROP TABLE IF EXISTS ce_process_time_log_{id}_details.
        3. Soft-delete the log row (set deleted_at).

        Args:
            dw_id: Data warehouse ID
            process_time_log_id: Process time log ID to delete

        Returns:
            Dictionary with deletion result
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            try:
                log = dw_db.query(CeProcessTimeLog).filter(
                    and_(
                        CeProcessTimeLog.id == process_time_log_id,
                        CeProcessTimeLog.dw_id == int(dw_id),
                        CeProcessTimeLog.deleted_at.is_(None)
                    )
                ).first()

                if not log:
                    raise NotFound(f"Log {process_time_log_id} not found")

                # Drop the dynamic job-detail table (Laravel: destroyProcessTimeLog)
                table_name = LOG_DETAILS_TABLE_TEMPLATE.format(log_id=process_time_log_id)
                dw_db.execute(text(f"DROP TABLE IF EXISTS `{table_name}`"))

                # Soft-delete the log row
                log.deleted_at = datetime.utcnow()
                dw_db.commit()

                logger.info(
                    "Deleted process time log %s and dropped detail table %s",
                    process_time_log_id, table_name
                )

                return {
                    "success": True,
                    "log_id": process_time_log_id,
                    "detail_table_dropped": table_name,
                    "deleted_at": log.deleted_at,
                }

            except Exception as e:
                dw_db.rollback()
                log_background_incident(
                    message=f"Failed to delete process time log: {e}",
                    error_code="COMPUTE_PROCESS_TIME_LOG_DELETE_FAILED",
                    exc=e,
                    source=_LOG_SERVICE_SOURCE,
                )
                raise
    
    def get_execution_summary(self, dw_id: str) -> Dict[str, Any]:
        """
        Get execution summary statistics.
        
        Args:
            dw_id: Data warehouse ID
            
        Returns:
            Dictionary with summary statistics
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            # Get status counts
            status_query = dw_db.query(
                CeProcessTimeLog.status,
                dw_db.query(CeProcessTimeLog).filter(
                    and_(
                        CeProcessTimeLog.dw_id == int(dw_id),
                        CeProcessTimeLog.deleted_at.is_(None)
                    )
                ).count().label('count')
            ).filter(
                and_(
                    CeProcessTimeLog.dw_id == int(dw_id),
                    CeProcessTimeLog.deleted_at.is_(None)
                )
            ).group_by(CeProcessTimeLog.status).all()
            
            status_counts = {status: count for status, count in status_query}
            
            # Get recent executions
            recent_logs = dw_db.query(CeProcessTimeLog).filter(
                and_(
                    CeProcessTimeLog.dw_id == int(dw_id),
                    CeProcessTimeLog.deleted_at.is_(None)
                )
            ).order_by(desc(CeProcessTimeLog.created_at)).limit(5).all()
            
            recent_executions = []
            for log in recent_logs:
                recent_executions.append({
                    "id": log.id,
                    "name": log.name,
                    "status": log.status,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                    "progress_percentage": self._calculate_progress_percentage(log)
                })
            
            return {
                "status_counts": status_counts,
                "total_executions": sum(status_counts.values()),
                "recent_executions": recent_executions
            }
    
    def get_all_log_detail_rows(
        self,
        dw_id: str,
        process_time_log_id: int,
        language_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetch every row from the dynamic detail table for the given log (no pagination).

        Returns UI-shaped detail rows (resolved names + parsed source_details) for export.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            log = dw_db.query(CeProcessTimeLog).filter(
                and_(
                    CeProcessTimeLog.id == process_time_log_id,
                    CeProcessTimeLog.dw_id == int(dw_id),
                )
            ).first()

            if not log:
                raise NotFound(f"Log {process_time_log_id} not found")

            table_name = LOG_DETAILS_TABLE_TEMPLATE.format(log_id=process_time_log_id)
            query = text(f"""
                SELECT id, target_ius_gid, target_ius_name, area_id, area_name, time_period,
                       source_details, status, remarks, data_value, process_type, source_name,
                       created_at
                FROM `{table_name}`
                ORDER BY id ASC
            """)

            try:
                result = dw_db.execute(query).fetchall()
            except Exception:
                result = []

            source_map = _load_source_nid_name_map(dw_db)
            ius_by_gid = _resolve_ius_components_by_gid(
                str(dw_id),
                [r[1] for r in result if r[1]],
                language_code,
            )
            rows = _map_detail_rows_to_api(result, source_map, ius_by_gid=ius_by_gid)

            return {
                "log_info": _enriched_log_info(dw_db, log),
                "rows": rows,
            }

    def _calculate_progress_percentage(self, log: CeProcessTimeLog) -> float:
        """Calculate progress percentage for a log."""
        return _ce_process_time_log_progress_percentage(log)