from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session


_SAFE_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_]+$")


def _safe_identifier(value: str) -> str:
    """
    Allow only safe SQL identifiers to be interpolated into SQL strings.
    This is used for table names like `ut_indicator_{language_code}`.
    """
    if not value or not _SAFE_IDENTIFIER_RE.fullmatch(value):
        raise ValueError(f"Unsafe SQL identifier: {value!r}")
    return value


def _quote_table(dw_db: Session, table_name: str) -> str:
    """
    Quote a table name in a dialect-appropriate way.

    - MySQL/MariaDB: backticks
    - PostgreSQL: double quotes
    - Fallback: unquoted (safe for our restricted identifiers)
    """
    bind = dw_db.get_bind()
    dialect = getattr(getattr(bind, "dialect", None), "name", None)
    if dialect in ("mysql", "mariadb"):
        return f"`{table_name}`"
    if dialect == "postgresql":
        return f'"{table_name}"'
    return table_name


@dataclass(frozen=True)
class IndicatorSourceRow:
    indicator_nid: int
    indicator_name: str
    short_name: str | None
    keywords: str | None


@dataclass(frozen=True)
class AreaSourceRow:
    area_nid: int
    area_name: str
    areashortname: str | None


@dataclass(frozen=True)
class SubgroupSourceRow:
    subgroup_val_nid: int
    subgroup_val: str


@dataclass(frozen=True)
class TimePeriodSourceRow:
    timeperiod_nid: int
    timeperiod: str


class UtLanguageReader:
    def read_language_codes(self, dw_db: Session) -> list[str]:
        rows = dw_db.execute(text("SELECT language_code FROM ut_language")).all()
        # defensive: strip/normalize codes
        return [str(r[0]).strip() for r in rows if r and r[0] is not None and str(r[0]).strip()]


class UtIndicatorReader:
    def read(self, dw_db: Session, language_code: str) -> Iterable[IndicatorSourceRow]:
        lang = _safe_identifier(language_code)
        table = f"ut_indicator_{lang}"
        quoted = _quote_table(dw_db, table)
        sql = text(
            f"SELECT indicator_nid, indicator_name, short_name, keywords FROM {quoted}"
        )
        for row in dw_db.execute(sql).mappings():
            yield IndicatorSourceRow(
                indicator_nid=int(row["indicator_nid"]),
                indicator_name=str(row["indicator_name"] or ""),
                short_name=(str(row["short_name"]) if row["short_name"] is not None else None),
                keywords=(str(row["keywords"]) if row["keywords"] is not None else None),
            )

    def read_one(self, dw_db: Session, language_code: str, indicator_nid: int) -> IndicatorSourceRow | None:
        lang = _safe_identifier(language_code)
        table = f"ut_indicator_{lang}"
        quoted = _quote_table(dw_db, table)
        sql = text(
            f"""
            SELECT indicator_nid, indicator_name, short_name, keywords
            FROM {quoted}
            WHERE indicator_nid = :indicator_nid
            LIMIT 1
            """
        )
        row = dw_db.execute(sql, {"indicator_nid": int(indicator_nid)}).mappings().first()
        if not row:
            return None
        return IndicatorSourceRow(
            indicator_nid=int(row["indicator_nid"]),
            indicator_name=str(row["indicator_name"] or ""),
            short_name=(str(row["short_name"]) if row["short_name"] is not None else None),
            keywords=(str(row["keywords"]) if row["keywords"] is not None else None),
        )


class UtAreaReader:
    def read(self, dw_db: Session, language_code: str) -> Iterable[AreaSourceRow]:
        lang = _safe_identifier(language_code)
        table = f"ut_area_{lang}"
        quoted = _quote_table(dw_db, table)
        sql = text(f"SELECT area_nid, area_name, areashortname FROM {quoted}")
        for row in dw_db.execute(sql).mappings():
            yield AreaSourceRow(
                area_nid=int(row["area_nid"]),
                area_name=str(row["area_name"] or ""),
                areashortname=(str(row["areashortname"]) if row["areashortname"] is not None else None),
            )

    def read_one(self, dw_db: Session, language_code: str, area_nid: int) -> AreaSourceRow | None:
        lang = _safe_identifier(language_code)
        table = f"ut_area_{lang}"
        quoted = _quote_table(dw_db, table)
        sql = text(
            f"""
            SELECT area_nid, area_name, areashortname
            FROM {quoted}
            WHERE area_nid = :area_nid
            LIMIT 1
            """
        )
        row = dw_db.execute(sql, {"area_nid": int(area_nid)}).mappings().first()
        if not row:
            return None
        return AreaSourceRow(
            area_nid=int(row["area_nid"]),
            area_name=str(row["area_name"] or ""),
            areashortname=(str(row["areashortname"]) if row["areashortname"] is not None else None),
        )


class UtSubgroupValsReader:
    def read(self, dw_db: Session, language_code: str) -> Iterable[SubgroupSourceRow]:
        lang = _safe_identifier(language_code)
        table = f"ut_subgroup_vals_{lang}"
        quoted = _quote_table(dw_db, table)
        sql = text(f"SELECT subgroup_val_nid, subgroup_val FROM {quoted}")
        for row in dw_db.execute(sql).mappings():
            yield SubgroupSourceRow(
                subgroup_val_nid=int(row["subgroup_val_nid"]),
                subgroup_val=str(row["subgroup_val"] or ""),
            )

    def read_one(self, dw_db: Session, language_code: str, subgroup_val_nid: int) -> SubgroupSourceRow | None:
        lang = _safe_identifier(language_code)
        table = f"ut_subgroup_vals_{lang}"
        quoted = _quote_table(dw_db, table)
        sql = text(
            f"""
            SELECT subgroup_val_nid, subgroup_val
            FROM {quoted}
            WHERE subgroup_val_nid = :subgroup_val_nid
            LIMIT 1
            """
        )
        row = dw_db.execute(sql, {"subgroup_val_nid": int(subgroup_val_nid)}).mappings().first()
        if not row:
            return None
        return SubgroupSourceRow(
            subgroup_val_nid=int(row["subgroup_val_nid"]),
            subgroup_val=str(row["subgroup_val"] or ""),
        )


class UtTimePeriodReader:
    def read(self, dw_db: Session) -> Iterable[TimePeriodSourceRow]:
        sql = text("SELECT timeperiod_nid, timeperiod FROM ut_timeperiod")
        for row in dw_db.execute(sql).mappings():
            yield TimePeriodSourceRow(
                timeperiod_nid=int(row["timeperiod_nid"]),
                timeperiod=str(row["timeperiod"] or ""),
            )

    def read_one(self, dw_db: Session, timeperiod_nid: int) -> TimePeriodSourceRow | None:
        sql = text(
            """
            SELECT timeperiod_nid, timeperiod
            FROM ut_timeperiod
            WHERE timeperiod_nid = :timeperiod_nid
            LIMIT 1
            """
        )
        row = dw_db.execute(sql, {"timeperiod_nid": int(timeperiod_nid)}).mappings().first()
        if not row:
            return None
        return TimePeriodSourceRow(
            timeperiod_nid=int(row["timeperiod_nid"]),
            timeperiod=str(row["timeperiod"] or ""),
        )

