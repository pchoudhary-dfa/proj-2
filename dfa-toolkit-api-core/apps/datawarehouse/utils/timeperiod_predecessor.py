"""
Resolve chronologically previous ut_timeperiod row per periodicity (A / Q / M only).

Used when seeding dataset_data_point with workflow show_previous_time=true.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from apps.datawarehouse.constants import (
    FREQUENCY_COMPATIBILITY_MAP,
    PERIODICITY_MAP,
)
from apps.datawarehouse.models.datawarehouse import TimePeriod

_ALLOWED_PERIODICITY = frozenset({"A", "Q", "M"})


def normalize_periodicity_for_prev(code: Optional[str]) -> Optional[str]:
    """
    Map warehouse periodicity to A, Q, or M when supported for previous-period logic.
    Returns None for unsupported or blank values.
    """
    if code is None:
        return None
    raw = str(code).strip()
    if not raw:
        return None
    if len(raw) == 1:
        ch = raw
        if ch.islower() and ch in FREQUENCY_COMPATIBILITY_MAP:
            mapped = FREQUENCY_COMPATIBILITY_MAP[ch]
        else:
            mapped = ch.upper()
        return mapped if mapped in _ALLOWED_PERIODICITY else None
    for letter, label in PERIODICITY_MAP.items():
        if letter in _ALLOWED_PERIODICITY and label and raw.lower() == label.lower():
            return letter
    upper = raw.upper()
    if upper in _ALLOWED_PERIODICITY:
        return upper
    return None


def build_previous_timeperiod_nid_map(dw_db: Session) -> dict[int, Optional[int]]:
    """
    For each timeperiod_nid whose row has periodicity A, Q, or M (after normalization),
    return the previous period's timeperiod_nid in chronological order within the same
    periodicity bucket.

    Ordering: ``startdate`` ascending (rows without ``startdate`` sort after dated rows),
    then ``timeperiod_nid`` ascending.

    The first period in each bucket maps to ``None`` (no predecessor).

    Periods with other periodicities are omitted from the map (caller treats as no previous).
    """
    rows = dw_db.query(TimePeriod).all()
    by_freq: dict[str, list[TimePeriod]] = {"A": [], "Q": [], "M": []}
    for r in rows:
        p = normalize_periodicity_for_prev(getattr(r, "periodicity", None))
        if p is None:
            continue
        by_freq[p].append(r)

    out: dict[int, Optional[int]] = {}
    for _freq, group in by_freq.items():
        # Sort by startdate without .timestamp() — Windows raises OSError(22) for
        # many pre-epoch / out-of-range naive datetimes when converting to POSIX time.
        group.sort(
            key=lambda r: (
                r.startdate is None,
                r.startdate,
                int(r.timeperiod_nid),
            )
        )
        for i, row in enumerate(group):
            tid = int(row.timeperiod_nid)
            if i == 0:
                out[tid] = None
            else:
                prev_row = group[i - 1]
                out[tid] = int(prev_row.timeperiod_nid)
    return out


def resolve_previous_timeperiod_nid_for_selection(
    dw_db: Session,
    selected_tp_nids: list[int],
    prev_map: dict[int, Optional[int]],
) -> Optional[int]:
    """
    Return the predecessor NID of the chronologically earliest time period
    among *selected_tp_nids*.

    When a dataset is created with multiple time periods (e.g. 2011, 2013, 2014),
    all data points share a single previous-period reference derived from the
    minimum selected period (2011 → predecessor 2010), rather than each row
    carrying its own per-period predecessor.

    Uses the same sort key as build_previous_timeperiod_nid_map:
    startdate ascending (nulls last), then timeperiod_nid ascending.

    Returns None when *selected_tp_nids* is empty, no rows are found,
    or the minimum period has no predecessor.
    """
    if not selected_tp_nids:
        return None
    rows = (
        dw_db.query(TimePeriod)
        .filter(TimePeriod.timeperiod_nid.in_(selected_tp_nids))
        .all()
    )
    if not rows:
        return None
    rows.sort(
        key=lambda r: (r.startdate is None, r.startdate, int(r.timeperiod_nid))
    )
    min_nid = int(rows[0].timeperiod_nid)
    return prev_map.get(min_nid)
