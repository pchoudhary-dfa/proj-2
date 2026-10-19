"""
Strict timeperiod string validation by periodicity (A, M, Q, H, D, F).
Used when periodicity is set on create/update; skipped when periodicity is absent.
"""
from __future__ import annotations

import calendar
import re
from datetime import date
from typing import Callable, Match, Tuple

# Annual: yyyy or yyyy-yyyy (exactly 4-digit years)
_RE_A_SINGLE = re.compile(r"^\d{4}$")
_RE_A_RANGE = re.compile(r"^(\d{4})-(\d{4})$")

# Monthly / half-yearly: yyyy.mm with zero-padded month 01-12
_RE_YM = re.compile(r"^(\d{4})\.(0[1-9]|1[0-2])$")
_RE_YM_RANGE = re.compile(
    r"^(\d{4})\.(0[1-9]|1[0-2])-(\d{4})\.(0[1-9]|1[0-2])$"
)

# Quarterly: Qn.yyyy, n in 1-4, Q uppercase
_RE_Q_SINGLE = re.compile(r"^Q([1-4])\.(\d{4})$")
_RE_Q_RANGE = re.compile(r"^Q([1-4])\.(\d{4})-Q([1-4])\.(\d{4})$")

# Daily / fortnightly: yyyy.mm.dd
_RE_YMD = re.compile(r"^(\d{4})\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])$")
_RE_YMD_RANGE = re.compile(
    r"^(\d{4})\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])-"
    r"(\d{4})\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])$"
)


def _ym_to_tuple(y: str, m: str) -> Tuple[int, int]:
    return int(y), int(m)


def _q_to_tuple(q: str, y: str) -> Tuple[int, int]:
    return int(y), int(q)


def _parse_ymd_groups(m: Match, y_g: int, mo_g: int, d_g: int) -> date:
    y, mo, d = int(m.group(y_g)), int(m.group(mo_g)), int(m.group(d_g))
    return date(y, mo, d)


def _validate_calendar_date(y: int, mo: int, d: int) -> None:
    try:
        date(y, mo, d)
    except ValueError as e:
        raise ValueError(
            f"Invalid calendar date in timeperiod for periodicity D or F: {y:04d}.{mo:02d}.{d:02d}"
        ) from e


def _ensure_ordered(
    start: Tuple[int, ...],
    end: Tuple[int, ...],
    label: str,
) -> None:
    if start > end:
        raise ValueError(
            f"Validation failed: timeperiod range for periodicity {label} must be chronological "
            f"(start must not be after end)"
        )


def _validate_annual(s: str) -> None:
    if _RE_A_SINGLE.fullmatch(s):
        return
    m = _RE_A_RANGE.fullmatch(s)
    if m:
        y1, y2 = int(m.group(1)), int(m.group(2))
        _ensure_ordered((y1,), (y2,), "A")
        return
    raise ValueError(
        "Validation failed: for periodicity A, timeperiod must be yyyy or yyyy-yyyy (4-digit years)"
    )


def _validate_monthly_or_half_yearly(s: str, label: str) -> None:
    if _RE_YM.fullmatch(s):
        return
    m = _RE_YM_RANGE.fullmatch(s)
    if m:
        t1 = _ym_to_tuple(m.group(1), m.group(2))
        t2 = _ym_to_tuple(m.group(3), m.group(4))
        _ensure_ordered(t1, t2, label)
        return
    raise ValueError(
        f"Validation failed: for periodicity {label}, timeperiod must be yyyy.mm or yyyy.mm-yyyy.mm "
        "(zero-padded month 01-12)"
    )


def _validate_quarterly(s: str) -> None:
    if _RE_Q_SINGLE.fullmatch(s):
        return
    m = _RE_Q_RANGE.fullmatch(s)
    if m:
        t1 = _q_to_tuple(m.group(1), m.group(2))
        t2 = _q_to_tuple(m.group(3), m.group(4))
        _ensure_ordered(t1, t2, "Q")
        return
    raise ValueError(
        "Validation failed: for periodicity Q, timeperiod must be Qn.yyyy or Qn.yyyy-Qn.yyyy "
        "(Q uppercase, n in 1-4)"
    )


def _validate_daily_or_fortnightly(s: str, label: str) -> None:
    m_single = _RE_YMD.fullmatch(s)
    if m_single:
        _validate_calendar_date(
            int(m_single.group(1)),
            int(m_single.group(2)),
            int(m_single.group(3)),
        )
        return
    m = _RE_YMD_RANGE.fullmatch(s)
    if m:
        d1 = _parse_ymd_groups(m, 1, 2, 3)
        d2 = _parse_ymd_groups(m, 4, 5, 6)
        _validate_calendar_date(d1.year, d1.month, d1.day)
        _validate_calendar_date(d2.year, d2.month, d2.day)
        if d1 > d2:
            raise ValueError(
                f"Validation failed: timeperiod range for periodicity {label} must be chronological "
                "(start date must not be after end date)"
            )
        return
    raise ValueError(
        f"Validation failed: for periodicity {label}, timeperiod must be yyyy.mm.dd or "
        "yyyy.mm.dd-yyyy.mm.dd (valid calendar dates, zero-padded)"
    )


_VALIDATORS: dict[str, Callable[[str], None]] = {
    "A": _validate_annual,
    "M": lambda s: _validate_monthly_or_half_yearly(s, "M"),
    "H": lambda s: _validate_monthly_or_half_yearly(s, "H"),
    "Q": _validate_quarterly,
    "D": lambda s: _validate_daily_or_fortnightly(s, "D"),
    "F": lambda s: _validate_daily_or_fortnightly(s, "F"),
}


def validate_timeperiod_for_periodicity(timeperiod: str, periodicity: str) -> None:
    """
    Raise ValueError if timeperiod does not match the strict format for the given periodicity code.

    No-op considerations: caller should only invoke when periodicity is non-empty.
    """
    if not periodicity or not periodicity.strip():
        return
    p = periodicity.strip().upper()
    if p not in _VALIDATORS:
        return
    tp = (timeperiod or "").strip()
    if not tp:
        raise ValueError("Validation failed: timeperiod is required")
    _VALIDATORS[p](tp)


def _last_day_of_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _month_date_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year, month, _last_day_of_month(year, month))
    return start, end


def _quarter_month_span(quarter: int) -> tuple[int, int]:
    """Return (first_month, last_month) for quarter 1..4."""
    first = (quarter - 1) * 3 + 1
    return first, first + 2


def _quarter_date_bounds(year: int, quarter: int) -> tuple[date, date]:
    fm, lm = _quarter_month_span(quarter)
    start = date(year, fm, 1)
    end = date(year, lm, _last_day_of_month(year, lm))
    return start, end


def date_bounds_for_timeperiod(timeperiod: str, periodicity: str) -> tuple[date, date]:
    """
    Inclusive calendar (start, end) for a validated timeperiod string and periodicity code.
    Caller should pass strings already validated together; this function validates first.
    """
    validate_timeperiod_for_periodicity(timeperiod, periodicity)
    p = periodicity.strip().upper()
    tp = (timeperiod or "").strip()

    if p == "A":
        m_single = _RE_A_SINGLE.fullmatch(tp)
        if m_single:
            y = int(tp)
            return date(y, 1, 1), date(y, 12, 31)
        m = _RE_A_RANGE.fullmatch(tp)
        if not m:
            raise ValueError("Internal error: annual timeperiod did not match after validation")
        y1, y2 = int(m.group(1)), int(m.group(2))
        return date(y1, 1, 1), date(y2, 12, 31)

    if p in ("M", "H"):
        m_single = _RE_YM.fullmatch(tp)
        if m_single:
            y, mo = int(m_single.group(1)), int(m_single.group(2))
            return _month_date_bounds(y, mo)
        m = _RE_YM_RANGE.fullmatch(tp)
        if not m:
            raise ValueError("Internal error: monthly/half-yearly timeperiod did not match after validation")
        y1, mo1 = int(m.group(1)), int(m.group(2))
        y2, mo2 = int(m.group(3)), int(m.group(4))
        start, _ = _month_date_bounds(y1, mo1)
        _, end = _month_date_bounds(y2, mo2)
        return start, end

    if p == "Q":
        m_single = _RE_Q_SINGLE.fullmatch(tp)
        if m_single:
            q, y = int(m_single.group(1)), int(m_single.group(2))
            return _quarter_date_bounds(y, q)
        m = _RE_Q_RANGE.fullmatch(tp)
        if not m:
            raise ValueError("Internal error: quarterly timeperiod did not match after validation")
        q1, y1 = int(m.group(1)), int(m.group(2))
        q2, y2 = int(m.group(3)), int(m.group(4))
        start, _ = _quarter_date_bounds(y1, q1)
        _, end = _quarter_date_bounds(y2, q2)
        return start, end

    if p in ("D", "F"):
        m_single = _RE_YMD.fullmatch(tp)
        if m_single:
            d = _parse_ymd_groups(m_single, 1, 2, 3)
            return d, d
        m = _RE_YMD_RANGE.fullmatch(tp)
        if not m:
            raise ValueError("Internal error: daily/fortnightly timeperiod did not match after validation")
        d1 = _parse_ymd_groups(m, 1, 2, 3)
        d2 = _parse_ymd_groups(m, 4, 5, 6)
        return d1, d2

    raise ValueError(f"Unsupported periodicity for date bounds: {periodicity!r}")
