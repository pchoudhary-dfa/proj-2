"""
Seed all data required to test the Data Management API (GET /dw/{dw_id}/data).

Prepares: units, subgroup_vals, indicators (+ locale), IUS (with default and non-default),
areas (ut_area_en), time periods (ut_timeperiod), and ut_data (numeric + textual).

Scenarios covered:
- Indicator only (default IUS): i_nid or i_gid
- Explicit IUS: ius_nid, ius_gid (i_gid|u_gid|s_gid)
- Unit/subgroup filters: u_nid, u_gid, sv_nid, sv_gid
- Area filter: ar_nid, ar_id
- Time period filter: tp_nid, tp_timeperiod
- Pagination: page, limit
- Meta flags: i_info, u_info, sv_info, ius_info, tp_info, ar_info
- Locale: Accept-Language or locale param
- Textual data: rows with istextualdata=1 and ut_data_<locale>.textual_data_value

Usage:
    python apps/datawarehouse/scripts/seed_data_api_test_data.py <warehouse_id> [language_code]

    warehouse_id: numeric ID from system_datawarehouse or database name (same as API dw_id)
    language_code: default 'en'; used for locale tables

Example:
    python apps/datawarehouse/scripts/seed_data_api_test_data.py 1 en
    python apps/datawarehouse/scripts/seed_data_api_test_data.py my_warehouse_db en
"""
import sys
import os
import logging
from pathlib import Path
from typing import List, Optional, Tuple

# Get project root and setup path/env like seed_test_data.py
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))
os.chdir(project_root)

from sqlalchemy import text
from sqlalchemy.orm import Session

from apps.app_db.schemas.core import DatabaseConnectionSchema, DatabaseSource
from apps.datawarehouse.db.datawarehouse import (
    credentials_to_schema,
    get_warehouse_credentials,
    get_warehouse_session,
)
from apps.datawarehouse.models.datawarehouse import (
    Data,
    IndicatorUnitSubgroup,
    Unit,
    SubgroupVal,
    Indicator,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from apps.shared.utils.log_event import log_background_incident

_SEED_DATA_API_TEST_SOURCE = "apps.datawarehouse.scripts.seed_data_api_test_data"

# GIDs for units and subgroup_vals (for ius_gid and lookups)
UNIT_GID_FIRST = "UNIT_PERCENTAGE_001"
SG_VAL_TOTAL_GID = "SG_VAL_TOTAL_001"
SG_VAL_MALE_GID = "SG_VAL_MALE_001"


def _quote(warehouse: DatabaseConnectionSchema, name: str) -> str:
    """Quote table/column for MySQL or PostgreSQL."""
    if warehouse.db_source == DatabaseSource.MYSQL:
        return f"`{name}`"
    return f'"{name}"'


def seed_units_locale(
    db: Session,
    warehouse: DatabaseConnectionSchema,
    language_code: str,
) -> List[int]:
    """Seed ut_unit_<locale> only (locale-only schema). Returns list of unit_nid."""
    UnitLocale = Unit(language_code)
    count = db.query(UnitLocale).count()
    if count > 0:
        logger.info("ut_unit_%s already has data, skipping unit seeding.", language_code)
        existing = db.query(UnitLocale).order_by(UnitLocale.unit_nid).limit(10).all()
        return [u.unit_nid for u in existing]

    units_def = [
        (1, "Percentage", "UNIT_PERCENTAGE_001"),
        (2, "Number", "UNIT_NUMBER_001"),
        (3, "Count", "UNIT_COUNT_001"),
        (4, "Rate per 1000", "UNIT_RATE_1000_001"),
        (5, "Index", "UNIT_INDEX_001"),
    ]
    inserted = []
    for unit_nid, name, gid in units_def:
        row = UnitLocale(
            unit_nid=unit_nid,
            unit_name=name,
            unit_gid=gid,
            unit_global=False,
        )
        db.add(row)
        inserted.append(unit_nid)
        logger.info("Inserted unit %s (nid=%s, locale=%s)", name, unit_nid, language_code)
    return inserted


def seed_subgroup_vals_locale(
    db: Session,
    warehouse: DatabaseConnectionSchema,
    language_code: str,
) -> List[int]:
    """Seed ut_subgroup_vals_<locale> only (locale-only schema). Returns list of subgroup_val_nid."""
    SvLocale = SubgroupVal(language_code)
    count = db.query(SvLocale).count()
    if count > 0:
        logger.info("ut_subgroup_vals_%s already has data, skipping subgroup_val seeding.", language_code)
        existing = db.query(SvLocale).order_by(SvLocale.subgroup_val_nid).limit(10).all()
        return [s.subgroup_val_nid for s in existing]

    subgroup_def = [
        (1, "Total", "SG_VAL_TOTAL_001"),
        (2, "Male", "SG_VAL_MALE_001"),
        (3, "Female", "SG_VAL_FEMALE_001"),
        (4, "Urban", "SG_VAL_URBAN_001"),
        (5, "Rural", "SG_VAL_RURAL_001"),
    ]
    inserted = []
    for sv_nid, val, gid in subgroup_def:
        row = SvLocale(
            subgroup_val_nid=sv_nid,
            subgroup_val=val,
            subgroup_val_gid=gid,
            subgroup_val_global=False,
            subgroup_val_order=None,
        )
        db.add(row)
        inserted.append(sv_nid)
        logger.info("Inserted subgroup_val %s (nid=%s, locale=%s)", val, sv_nid, language_code)
    return inserted


def seed_indicators(
    db: Session,
    warehouse: DatabaseConnectionSchema,
    language_code: str,
) -> List[int]:
    """Seed ut_indicator_<locale> only (locale-only schema). Returns list of indicator_nid."""
    IndLocale = Indicator(language_code)
    count = db.query(IndLocale).count()
    if count > 0:
        logger.info("ut_indicator_%s already has data, skipping indicator seeding.", language_code)
        existing = db.query(IndLocale).order_by(IndLocale.indicator_nid).limit(10).all()
        return [r.indicator_nid for r in existing]

    indicators_def = [
        (1, "IND_GID_001", "Test Indicator One"),
        (2, "IND_GID_002", "Test Indicator Two"),
    ]
    inserted = []
    for indicator_nid, gid, name in indicators_def:
        row = IndLocale(
            indicator_nid=indicator_nid,
            indicator_gid=gid,
            indicator_name=name,
            indicator_info=None,
            indicator_global=False,
            short_name=None,
            keywords=None,
            indicator_order=None,
            data_exist=True,
            highisgood=False,
        )
        db.add(row)
        inserted.append(indicator_nid)
        logger.info("Inserted indicator %s (nid=%s)", gid, indicator_nid)
    return inserted


def seed_ius(
    db: Session,
    warehouse: DatabaseConnectionSchema,
    indicator_nids: List[int],
    unit_nids: List[int],
    subgroup_val_nids: List[int],
) -> List[Tuple[int, int, int, int]]:
    """
    Seed ut_indicator_unit_subgroup. For each indicator: one default IUS, optionally one non-default.
    Returns list of (iusnid, indicator_nid, unit_nid, subgroup_val_nid).
    """
    count = db.query(IndicatorUnitSubgroup).count()
    if count > 0:
        logger.info("ut_indicator_unit_subgroup already has data, skipping IUS seeding.")
        existing = (
            db.query(IndicatorUnitSubgroup)
            .order_by(IndicatorUnitSubgroup.iusnid)
            .limit(20)
            .all()
        )
        return [(r.iusnid, r.indicator_nid, r.unit_nid, r.subgroup_val_nid) for r in existing]

    # Need at least one unit and two subgroup vals (Total, Male) for default + non-default
    u_nid = unit_nids[0] if unit_nids else None
    sv_total = subgroup_val_nids[0] if subgroup_val_nids else None
    sv_other = subgroup_val_nids[1] if len(subgroup_val_nids) > 1 else subgroup_val_nids[0]
    if not u_nid or sv_total is None:
        raise ValueError("Need at least one unit and one subgroup_val; run seed_units and seed_subgroup_vals first.")

    result = []
    for ind_nid in indicator_nids:
        # Default IUS: indicator + first unit + Total
        ius_default = IndicatorUnitSubgroup(
            indicator_nid=ind_nid,
            unit_nid=u_nid,
            subgroup_val_nid=sv_total,
            min_value=0,
            max_value=0,
            data_exist=True,
            isdefaultsubgroup=True,
        )
        db.add(ius_default)
        db.flush()
        result.append((ius_default.iusnid, ind_nid, u_nid, sv_total))
        logger.info("Inserted IUS default (iusnid=%s, indicator_nid=%s)", ius_default.iusnid, ind_nid)

        # Non-default IUS: same indicator + same unit + other subgroup (e.g. Male)
        if sv_other is not None and sv_other != sv_total:
            ius_other = IndicatorUnitSubgroup(
                indicator_nid=ind_nid,
                unit_nid=u_nid,
                subgroup_val_nid=sv_other,
                min_value=0,
                max_value=0,
                data_exist=True,
                isdefaultsubgroup=False,
            )
            db.add(ius_other)
            db.flush()
            result.append((ius_other.iusnid, ind_nid, u_nid, sv_other))
            logger.info("Inserted IUS non-default (iusnid=%s, indicator_nid=%s)", ius_other.iusnid, ind_nid)
    return result


def _ensure_area_table_exists(
    db: Session,
    warehouse: DatabaseConnectionSchema,
    language_code: str,
) -> None:
    """Create ut_area_<locale> if it does not exist (so seeding can proceed)."""
    table = f"ut_area_{language_code}"
    q = _quote(warehouse, table)
    if warehouse.db_source == DatabaseSource.MYSQL:
        create_sql = text(f"""
            CREATE TABLE IF NOT EXISTS {q} (
                area_nid int(11) NOT NULL AUTO_INCREMENT,
                area_parent_nid int(11) DEFAULT 0,
                area_id varchar(255) DEFAULT NULL,
                area_name varchar(60) NOT NULL,
                area_gid varchar(60) NOT NULL,
                area_level int(11) DEFAULT 0,
                area_map varchar(60) DEFAULT NULL,
                area_block longtext,
                area_global tinyint(1) NOT NULL DEFAULT 0,
                data_exist tinyint(1) DEFAULT 0,
                areashortname varchar(255) DEFAULT NULL,
                PRIMARY KEY (area_nid),
                UNIQUE KEY dmuniq_area_id (area_id),
                KEY idx_area_name (area_name),
                KEY idx_area_parent_nid (area_parent_nid),
                KEY idx_area_level (area_level)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    else:
        # PostgreSQL
        create_sql = text(f"""
            CREATE TABLE IF NOT EXISTS {q} (
                area_nid SERIAL PRIMARY KEY,
                area_parent_nid int DEFAULT 0,
                area_id varchar(255) DEFAULT NULL UNIQUE,
                area_name varchar(60) NOT NULL,
                area_gid varchar(60) NOT NULL,
                area_level int DEFAULT 0,
                area_map varchar(60) DEFAULT NULL,
                area_block text,
                area_global smallint NOT NULL DEFAULT 0,
                data_exist smallint DEFAULT 0,
                areashortname varchar(255) DEFAULT NULL
            )
        """)
    db.execute(create_sql)
    logger.info("Ensured table %s exists.", table)


def seed_areas(
    db: Session,
    warehouse: DatabaseConnectionSchema,
    language_code: str,
) -> List[Tuple[int, str]]:
    """Seed ut_area_<locale>. Creates table if missing. Returns list of (area_nid, area_id)."""
    table = f"ut_area_{language_code}"
    q = _quote(warehouse, table)
    try:
        if warehouse.db_source == DatabaseSource.MYSQL:
            r = db.execute(text(f"SELECT COUNT(*) FROM {q}")).scalar()
        else:
            r = db.execute(text(f'SELECT COUNT(*) FROM {q}')).scalar()
        if r and r > 0:
            logger.info("ut_area_%s already has data, skipping area seeding.", language_code)
            if warehouse.db_source == DatabaseSource.MYSQL:
                rows = db.execute(
                    text(f"SELECT area_nid, area_id FROM {q} ORDER BY area_nid LIMIT 10")
                ).mappings().all()
            else:
                rows = db.execute(
                    text(f'SELECT area_nid, area_id FROM {q} ORDER BY area_nid LIMIT 10')
                ).mappings().all()
            return [(int(row["area_nid"]), row["area_id"] or "") for row in rows]
    except Exception as e:
        logger.warning("Area table %s missing or inaccessible: %s; creating table.", table, e)
        _ensure_area_table_exists(db, warehouse, language_code)
        # Retry count after create (table is empty so we fall through to insert)

    areas_def = [
        ("AREA_01", "Area One", "AREA_GID_01"),
        ("AREA_02", "Area Two", "AREA_GID_02"),
        ("AREA_03", "Area Three", "AREA_GID_03"),
    ]
    result = []
    for area_id, area_name, area_gid in areas_def:
        if warehouse.db_source == DatabaseSource.MYSQL:
            db.execute(
                text(f"""
                INSERT INTO {q} (area_parent_nid, area_id, area_name, area_gid, area_level, area_global, data_exist)
                VALUES (0, :aid, :aname, :agid, 0, 0, 0)
                """),
                {"aid": area_id, "aname": area_name, "agid": area_gid},
            )
            r = db.execute(text("SELECT LAST_INSERT_ID()")).scalar()
            area_nid = int(r) if r else None
        else:
            res = db.execute(
                text(f"""
                INSERT INTO {q} (area_parent_nid, area_id, area_name, area_gid, area_level, area_global, data_exist)
                VALUES (0, :aid, :aname, :agid, 0, 0, 0)
                RETURNING area_nid
                """),
                {"aid": area_id, "aname": area_name, "agid": area_gid},
            )
            area_nid = res.scalar()
        if area_nid:
            result.append((area_nid, area_id))
            logger.info("Inserted area %s (area_nid=%s)", area_id, area_nid)
    return result


def seed_timeperiods(db: Session, warehouse: DatabaseConnectionSchema) -> List[Tuple[int, str]]:
    """Seed ut_timeperiod. Returns list of (timeperiod_nid, timeperiod)."""
    qt = _quote(warehouse, "ut_timeperiod")
    try:
        if warehouse.db_source == DatabaseSource.MYSQL:
            r = db.execute(text(f"SELECT COUNT(*) FROM {qt}")).scalar()
        else:
            r = db.execute(text(f"SELECT COUNT(*) FROM {qt}")).scalar()
        if r and r > 0:
            logger.info("ut_timeperiod already has data, skipping timeperiod seeding.")
            rows = db.execute(
                text(f"SELECT timeperiod_nid, timeperiod FROM {qt} ORDER BY timeperiod_nid LIMIT 10")
            ).mappings().all()
            return [(int(row["timeperiod_nid"]), row["timeperiod"] or "") for row in rows]
    except Exception as e:
        logger.warning("ut_timeperiod check failed: %s; skipping.", e)
        return []

    periods = ["2023", "2024", "2025"]
    result = []
    for tp in periods:
        if warehouse.db_source == DatabaseSource.MYSQL:
            db.execute(
                text(f"INSERT INTO {qt} (timeperiod) VALUES (:tp)"),
                {"tp": tp},
            )
            r = db.execute(text("SELECT LAST_INSERT_ID()")).scalar()
            tp_nid = int(r) if r else None
        else:
            r = db.execute(
                text(f'INSERT INTO {qt} (timeperiod) VALUES (:tp) RETURNING timeperiod_nid'),
                {"tp": tp},
            ).scalar()
            tp_nid = r
        if tp_nid:
            result.append((tp_nid, tp))
            logger.info("Inserted timeperiod %s (timeperiod_nid=%s)", tp, tp_nid)
    return result


def seed_data_rows(
    db: Session,
    language_code: str,
    ius_list: List[Tuple[int, int, int, int]],
    area_list: List[Tuple[int, str]],
    tp_list: List[Tuple[int, str]],
    source_nid: int = 0,
) -> int:
    """
    Seed ut_data (single table: numeric and textual data in ut_data.textual_data_value).
    Respects UNIQUE (iusnid, timeperiod_nid, area_nid, source_nid).
    Returns number of data rows inserted.
    """
    count = db.query(Data).count()
    if count > 0:
        logger.info("ut_data already has data, skipping data seeding.")
        return count

    inserted = 0
    textual_count = 0

    for (iusnid, ind_nid, u_nid, sv_nid) in ius_list:
        for (area_nid, _) in area_list:
            for (tp_nid, _) in tp_list:
                is_textual = inserted % 5 == 4  # every 5th row textual
                row = Data(
                    iusnid=iusnid,
                    timeperiod_nid=tp_nid,
                    area_nid=area_nid,
                    source_nid=source_nid,
                    indicator_nid=float(ind_nid),
                    unit_nid=float(u_nid),
                    subgroup_val_nid=float(sv_nid),
                    istextualdata=is_textual,
                    data_value=None if is_textual else float(10 + inserted),
                    textual_data_value=f"Text value for row {inserted}" if is_textual else None,
                )
                db.add(row)
                db.flush()
                if is_textual:
                    textual_count += 1
                inserted += 1

    logger.info("Inserted %s ut_data rows (%s textual).", inserted, textual_count)
    return inserted


def get_or_create_unit_and_subgroup_nids(
    db: Session,
    warehouse: DatabaseConnectionSchema,
    language_code: str,
) -> Tuple[List[int], List[int]]:
    """Ensure units and subgroup_vals exist in locale tables; return (unit_nids, subgroup_val_nids)."""
    unit_nids = seed_units_locale(db, warehouse, language_code)
    subgroup_val_nids = seed_subgroup_vals_locale(db, warehouse, language_code)
    return unit_nids, subgroup_val_nids


def print_suggested_calls(warehouse_id: str, base_url: str = "/api/v1/dw") -> None:
    """Print suggested API test calls for all scenarios."""
    prefix = f"GET {base_url}/{warehouse_id}/data"
    logger.info("")
    logger.info("Suggested API test calls (all scenarios):")
    logger.info("  Indicator only (default IUS):  %s?i_nid=1", prefix)
    logger.info("  By indicator GID:              %s?i_gid=IND_GID_001", prefix)
    logger.info("  Explicit IUS:                   %s?i_nid=1&ius_nid=1", prefix)
    logger.info("  IUS GID:                        %s?ius_gid=IND_GID_001|UNIT_PERCENTAGE_001|SG_VAL_TOTAL_001", prefix)
    logger.info("  Unit filter:                    %s?i_nid=1&u_gid=UNIT_PERCENTAGE_001", prefix)
    logger.info("  Subgroup filter:                %s?i_nid=1&sv_gid=SG_VAL_TOTAL_001", prefix)
    logger.info("  Area by ID:                     %s?i_nid=1&ar_id=AREA_01", prefix)
    logger.info("  Area by NID:                    %s?i_nid=1&ar_nid=1", prefix)
    logger.info("  Time period:                    %s?i_nid=1&tp_timeperiod=2024", prefix)
    logger.info("  Pagination:                     %s?i_nid=1&page=2&limit=5", prefix)
    logger.info("  Meta flags:                     %s?i_nid=1&i_info=true&u_info=true&sv_info=true&ius_info=true&tp_info=true&ar_info=true", prefix)
    logger.info("  Locale:                         %s?i_nid=1 (header Accept-Language: en or ?locale=en)", prefix)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python apps/datawarehouse/scripts/seed_data_api_test_data.py <warehouse_id> [language_code]")
        print("  warehouse_id: numeric ID or database name (same as API dw_id)")
        print("  language_code: default 'en'")
        print("Example: python apps/datawarehouse/scripts/seed_data_api_test_data.py 1 en")
        sys.exit(1)

    warehouse_id = sys.argv[1]
    language_code = sys.argv[2] if len(sys.argv) > 2 else "en"

    try:
        warehouse = get_warehouse_credentials(warehouse_id)
        # Make target database very visible so user verifies they are checking this DB
        print("")
        print(">>> TARGET DATABASE: {} (host: {}:{})".format(
            warehouse.db_database, warehouse.db_host, warehouse.db_port
        ))
        print(">>> Ensure this is the database you are inspecting. Data is written HERE.")
        print("")
        logger.info("Seeding Data API test data for warehouse: %s (locale: %s)", warehouse.db_database, language_code)

        with get_warehouse_session(warehouse) as db:
            logger.info("Ensuring units and subgroup_vals...")
            unit_nids, subgroup_val_nids = get_or_create_unit_and_subgroup_nids(db, warehouse, language_code)

            logger.info("Seeding indicators...")
            indicator_nids = seed_indicators(db, warehouse, language_code)

            logger.info("Seeding IUS...")
            ius_list = seed_ius(db, warehouse, indicator_nids, unit_nids, subgroup_val_nids)

            logger.info("Seeding areas...")
            area_list = seed_areas(db, warehouse, language_code)

            logger.info("Seeding time periods...")
            tp_list = seed_timeperiods(db, warehouse)

            logger.info("Seeding ut_data...")
            data_count = seed_data_rows(db, language_code, ius_list, area_list, tp_list)

            # Explicit commit so data is persisted
            db.commit()
            logger.info("Committed successfully to database: %s", warehouse.db_database)

        # Summary outside the with block so a later exception does not roll back the commit
        logger.info("")
        logger.info("=" * 60)
        logger.info("Data API test data seeding completed.")
        logger.info("=" * 60)
        logger.info("Indicators: %s", len(indicator_nids))
        logger.info("IUS: %s", len(ius_list))
        logger.info("Areas: %s", len(area_list))
        logger.info("Time periods: %s", len(tp_list))
        logger.info("Data rows: %s", data_count)
        print_suggested_calls(warehouse_id)

    except Exception as e:
        log_background_incident(
            message=f"Error seeding Data API test data: {e}",
            error_code="SEED_DATA_API_TEST_FAILED",
            exc=e,
            source=_SEED_DATA_API_TEST_SOURCE,
        )
        print("")
        print(">>> Seeding FAILED. If you see a 'table does not exist' error, create the warehouse")
        print(">>> schema in the TARGET DATABASE first (e.g. from apps/app_db/SQL/schema_di7_mysql.sql).")
        sys.exit(1)


if __name__ == "__main__":
    main()
