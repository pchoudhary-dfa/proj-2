"""
Seed test data into a data warehouse (10 rows per table).
Uses dfa_dw_sample.sql structure. Run from project root.

Usage (warehouse registered in system_datawarehouse):
  python -m apps.datawarehouse.scripts.seed_test_data 1

Usage (Docker MySQL from host – override host/database so it resolves):
  DW_OVERRIDE_HOST=127.0.0.1 python -m apps.datawarehouse.scripts.seed_test_data 1
  DW_OVERRIDE_HOST=127.0.0.1 DW_OVERRIDE_DATABASE=dfa_dw_sample python -m apps.datawarehouse.scripts.seed_test_data 1
  DW_OVERRIDE_HOST=localhost DW_OVERRIDE_PORT=3306 python -m apps.datawarehouse.scripts.seed_test_data 1

Usage (direct connection; no app DB needed):
  DW_HOST=127.0.0.1 DW_PORT=3306 DW_USER=root DW_PASSWORD=... DW_DATABASE=dfa_dw_sample python -m apps.datawarehouse.scripts.seed_test_data

Requires: DW tables already exist (run schema from dfa_dw_sample.sql first if empty).
"""
import os
import sys
import logging
from contextlib import contextmanager
from datetime import datetime
from typing import Generator

# Add project root to path when run as script
if __name__ == "__main__":
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

from apps.shared.utils.log_event import log_background_incident

_SEED_TEST_DATA_SOURCE = "apps.datawarehouse.scripts.seed_test_data"

# Default: 10 rows per table (small test set)
ROW_LIMIT = 10


def _has_direct_dw_env() -> bool:
    return bool(
        os.environ.get("DW_HOST")
        and os.environ.get("DW_DATABASE")
        and os.environ.get("DW_USER") is not None
    )


def _has_dw_override_env() -> bool:
    """True if DW_OVERRIDE_HOST is set (use warehouse creds from app DB but connect to this host)."""
    return bool(os.environ.get("DW_OVERRIDE_HOST"))


@contextmanager
def _warehouse_session_with_override(dw_id: str) -> Generator[Session, None, None]:
    """
    Use warehouse credentials from system_datawarehouse for dw_id,
    but override host/port/database with DW_OVERRIDE_HOST, DW_OVERRIDE_PORT, DW_OVERRIDE_DATABASE.
    Use when running from host against Docker MySQL (e.g. host.docker.internal -> 127.0.0.1)
    or when warehouse record has wrong db name (e.g. 'string' -> dfa_dw_sample).
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_credentials, credentials_to_schema
    credentials = get_warehouse_credentials(dw_id)
    schema = credentials_to_schema(credentials)
    host = os.environ["DW_OVERRIDE_HOST"]
    port = int(os.environ.get("DW_OVERRIDE_PORT") or str(schema.db_port))
    user = schema.db_login
    password = schema.db_password
    database = os.environ.get("DW_OVERRIDE_DATABASE") or schema.db_database
    if not database:
        raise ValueError("Database name is empty. Set DW_OVERRIDE_DATABASE=your_dw_db_name (e.g. dfa_dw_sample).")
    url = f"mysql+mysqlconnector://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"
    engine = create_engine(url, poolclass=NullPool, echo=False)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
        engine.dispose()


@contextmanager
def _direct_warehouse_session() -> Generator[Session, None, None]:
    """Create session from DW_HOST, DW_PORT, DW_USER, DW_PASSWORD, DW_DATABASE."""
    host = os.environ["DW_HOST"]
    port = int(os.environ.get("DW_PORT", "3306"))
    user = os.environ["DW_USER"]
    password = os.environ.get("DW_PASSWORD", "")
    database = os.environ["DW_DATABASE"]
    url = (
        f"mysql+mysqlconnector://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"
    )
    engine = create_engine(url, poolclass=NullPool, echo=False)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
        engine.dispose()


def get_dw_id() -> str:
    dw_id = os.environ.get("DW_ID") or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not dw_id and not _has_direct_dw_env():
        log_background_incident(
            message=(
                "Set DW_ID (or pass as first arg) OR set DW_HOST, DW_DATABASE, DW_USER "
                "for direct connection."
            ),
            error_code="SEED_TEST_DATA_NO_DW_ID",
            source=_SEED_TEST_DATA_SOURCE,
            status_code=400,
        )
        sys.exit(1)
    return dw_id or "direct"


def seed_area_level_en(session) -> None:
    """ut_area_level_en: level_nid, area_level, area_level_name"""
    rows = [
        (1, 1, "Country"),
        (2, 2, "States"),
        (3, 3, "Districts"),
    ]
    for r in rows[:ROW_LIMIT]:
        session.execute(
            text(
                "INSERT IGNORE INTO ut_area_level_en (level_nid, area_level, area_level_name) "
                "VALUES (:a, :b, :c)"
            ),
            {"a": r[0], "b": r[1], "c": r[2]},
        )
    logger.info("ut_area_level_en: %d rows", len(rows[:ROW_LIMIT]))


def seed_area_en(session) -> None:
    """ut_area_en: first 10 areas from sample (root + children)."""
    rows = [
        (16698, -1, "AMR", "Amor", "IND", 1, "", "", 0, 0, None),
        (17498, 16698, "AMR010", "Westeros", "12", 2, "", "", 0, 0, None),
        (17499, 16698, "AMR013", "Maple", "18", 2, "", "", 0, 0, None),
        (17500, 17498, "AMR010001", "Sunset Square", "1201", 3, "", "", 0, 0, None),
        (17501, 17498, "AMR010002", "Azure Ridge", "1202", 3, "", "", 0, 0, None),
        (17502, 17498, "AMR010003", "Aurora Square", "1203", 3, "", "", 0, 0, None),
        (17503, 17498, "AMR010004", "Bluebell Bluff", "1204", 3, "", "", 0, 0, None),
        (17504, 17498, "AMR010005", "Raven Ridge", "1206", 3, "", "", 0, 0, None),
        (17505, 17498, "AMR010006", "Pinecone Plaza", "1207", 3, "", "", 0, 0, None),
        (17506, 17498, "AMR010007", "Birchwood Bluff", "1208", 3, "", "", 0, 0, None),
    ]
    for r in rows:
        session.execute(
            text(
                "INSERT IGNORE INTO ut_area_en (area_nid, area_parent_nid, area_id, area_name, area_gid, "
                "area_level, area_map, area_block, area_global, data_exist, areashortname) "
                "VALUES (:nid, :pid, :aid, :name, :gid, :lvl, :map, :block, :glob, :data_exist, :short)"
            ),
            {
                "nid": r[0], "pid": r[1], "aid": r[2], "name": r[3], "gid": r[4],
                "lvl": r[5], "map": r[6] or "", "block": r[7] or "", "glob": r[8], "data_exist": r[9], "short": r[10],
            },
        )
    logger.info("ut_area_en: %d rows", len(rows))


def seed_unit_en(session) -> None:
    """ut_unit_en: unit_nid, unit_name, unit_gid, unit_global"""
    rows = [
        (1, "Ratio", "R", 0),
        (2, "Percentage", "P", 0),
        (3, "Number", "N", 0),
        (4, "Count", "C", 0),
        (5, "Index", "I", 0),
        (6, "Rate", "RT", 0),
        (7, "Per 1000", "P1000", 0),
        (8, "Per 100", "P100", 0),
        (9, "Years", "Y", 0),
        (10, "Score", "S", 0),
    ]
    for r in rows:
        session.execute(
            text(
                "INSERT IGNORE INTO ut_unit_en (unit_nid, unit_name, unit_gid, unit_global) VALUES (:a, :b, :c, :d)"
            ),
            {"a": r[0], "b": r[1], "c": r[2], "d": r[3]},
        )
    logger.info("ut_unit_en: %d rows", len(rows))


def seed_subgroup_en(session) -> None:
    """ut_subgroup_en: subgroup_nid, subgroup_name, subgroup_gid, subgroup_global, subgroup_type, subgroup_order"""
    rows = [
        (1, "All management", "d3f55b13-8bc0-4c67-a04a-772705ba7e23", 0, 5, 1),
        (2, "General", "b732d4b5-300b-406b-9a6f-d81bc335c088", 0, 6, 1),
        (3, "SC", "b09d73bb-9771-4eab-aa46-7869e241dd39", 0, 6, 2),
        (4, "ST", "st-gid-04", 0, 6, 3),
        (5, "OBC", "obc-gid-05", 0, 6, 4),
        (6, "Gender", "gender-gid-06", 0, 6, 5),
        (7, "Location", "loc-gid-07", 0, 6, 6),
        (8, "School type", "school-type-gid-08", 0, 6, 7),
        (9, "Management", "mgmt-gid-09", 0, 6, 8),
        (10, "Sector", "sector-gid-10", 0, 6, 9),
    ]
    for r in rows:
        session.execute(
            text(
                "INSERT IGNORE INTO ut_subgroup_en (subgroup_nid, subgroup_name, subgroup_gid, subgroup_global, "
                "subgroup_type, subgroup_order) VALUES (:a, :b, :c, :d, :e, :f)"
            ),
            {"a": r[0], "b": r[1], "c": r[2], "d": r[3], "e": r[4], "f": r[5]},
        )
    logger.info("ut_subgroup_en: %d rows", len(rows))


def seed_subgroup_vals_en(session) -> None:
    """ut_subgroup_vals_en: subgroup_val_nid, subgroup_val, subgroup_val_gid, subgroup_val_global, subgroup_val_order"""
    rows = [
        (1, "All management General", "SECONDARY-ALLMANAGEMENT-GENERAL", 0, 74),
        (2, "All management SC", "SECONDARY-ALLMANAGEMENT-SC", 0, 70),
        (3, "All management ST", "SECONDARY-ALLMANAGEMENT-ST", 0, 71),
        (4, "All management OBC", "SECONDARY-ALLMANAGEMENT-OBC", 0, 72),
        (5, "Male", "MALE", 0, 1),
        (6, "Female", "FEMALE", 0, 2),
        (7, "Rural", "RURAL", 0, 10),
        (8, "Urban", "URBAN", 0, 11),
        (9, "Government", "GOVT", 0, 20),
        (10, "Private", "PRIVATE", 0, 21),
    ]
    for r in rows:
        session.execute(
            text(
                "INSERT IGNORE INTO ut_subgroup_vals_en (subgroup_val_nid, subgroup_val, subgroup_val_gid, "
                "subgroup_val_global, subgroup_val_order) VALUES (:a, :b, :c, :d, :e)"
            ),
            {"a": r[0], "b": r[1], "c": r[2], "d": r[3], "e": r[4]},
        )
    logger.info("ut_subgroup_vals_en: %d rows", len(rows))


def seed_subgroup_vals_subgroup(session) -> None:
    """ut_subgroup_vals_subgroup: link subgroup_val_nid to subgroup_nid (first 10)."""
    # Link first 5 subgroup_vals to subgroup 1, next 5 to subgroup 2; include PK for compatibility
    for i in range(1, min(11, ROW_LIMIT + 1)):
        session.execute(
            text(
                "INSERT IGNORE INTO ut_subgroup_vals_subgroup (subgroup_val_subgroup_nid, subgroup_val_nid, subgroup_nid) "
                "VALUES (:pk, :v, :s)"
            ),
            {"pk": i, "v": i, "s": 1 if i <= 5 else 2},
        )
    logger.info("ut_subgroup_vals_subgroup: %d rows", min(10, ROW_LIMIT))


def seed_indicator_en(session) -> None:
    """ut_indicator_en: 10 indicators from sample style."""
    rows = [
        (1, "Gender Parity Index in annual average dropout rate", "GENDER_PARITY_INDEX_ANNUAL_AVERAGE_DROPOUT_RATE", "", 0, "", "", None, 0, 1),
        (2, "Gender Parity Index in GER at Secondary level", "GENDER_PARITY_INDEX_GER_SEC", "", 0, "", "", None, 0, 1),
        (3, "Age Specific Enrolment Ratio for the age group of 14-15 years", "AGE_SPECIFIC_ENRMNT_RATIO_SEC_LEVEL", "", 0, "", "", None, 0, 1),
        (4, "Gross Enrolment Ratio Secondary", "GER_SECONDARY", "", 0, "", "", None, 0, 1),
        (5, "Net Enrolment Ratio Primary", "NER_PRIMARY", "", 0, "", "", None, 0, 1),
        (6, "Dropout Rate Primary", "DROPOUT_RATE_PRIMARY", "", 0, "", "", None, 0, 0),
        (7, "Pupil Teacher Ratio", "PTR", "", 0, "", "", None, 0, 0),
        (8, "Transition Rate Primary to Upper Primary", "TRANSITION_PRI_UPRI", "", 0, "", "", None, 0, 1),
        (9, "Percentage of Schools with Computers", "PCT_SCHOOLS_COMPUTERS", "", 0, "", "", None, 0, 1),
        (10, "Enrolment Grade 1", "ENROLMENT_GRADE1", "", 0, "", "", None, 0, 1),
    ]
    for r in rows:
        session.execute(
            text(
                "INSERT IGNORE INTO ut_indicator_en (indicator_nid, indicator_name, indicator_gid, indicator_info, "
                "indicator_global, short_name, keywords, indicator_order, data_exist, highisgood) "
                "VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j)"
            ),
            {"a": r[0], "b": r[1], "c": r[2], "d": r[3], "e": r[4], "f": r[5], "g": r[6], "h": r[7], "i": r[8], "j": r[9]},
        )
    logger.info("ut_indicator_en: %d rows", len(rows))


def seed_indicator_classifications_en(session) -> None:
    """ut_indicator_classifications_en: 10 rows (ic_parent_nid -1 for root)."""
    rows = [
        (5, -1, "A96E3A2C-2540-5089-4673-36F2A9BAC04E", "UDISE", 0, None, "SR", None, None, None, None, None, None, None, None, None),
        (19, -1, "FE0D0278-68D6-54BF-B22B-AAA00D102ABB", "Academia", 0, None, "SR", None, None, None, None, None, None, None, None, None),
        (6, 19, "0FCC6F1E-2DC7-A358-BF09-F1D07454237C", "Academia_Education Digest_2017", 0, None, "SR", "", "Academia", "Education Digest", "2017", None, None, None, None, None),
        (20, -1, "ic-gid-20", "Access", 0, None, "SR", None, None, None, None, None, None, None, None, None),
        (21, -1, "ic-gid-21", "Equity", 0, None, "SR", None, None, None, None, None, None, None, None, None),
        (22, -1, "ic-gid-22", "Quality", 0, None, "SR", None, None, None, None, None, None, None, None, None),
        (23, -1, "ic-gid-23", "Outcomes", 0, None, "SR", None, None, None, None, None, None, None, None, None),
        (24, -1, "ic-gid-24", "Infrastructure", 0, None, "SR", None, None, None, None, None, None, None, None, None),
        (25, -1, "ic-gid-25", "Finance", 0, None, "SR", None, None, None, None, None, None, None, None, None),
        (26, -1, "ic-gid-26", "Teachers", 0, None, "SR", None, None, None, None, None, None, None, None, None),
    ]
    for r in rows:
        session.execute(
            text(
                "INSERT IGNORE INTO ut_indicator_classifications_en (ic_nid, ic_parent_nid, ic_gid, ic_name, ic_global, "
                "ic_info, ic_type, ic_short_name, publisher, title, diyear, sourcelink1, sourcelink2, ic_order, isbn, nature) "
                "VALUES (:a, :b, :c, :d, :e, :f, :g, :h, :i, :j, :k, :l, :m, :n, :o, :p)"
            ),
            {"a": r[0], "b": r[1], "c": r[2], "d": r[3], "e": r[4], "f": r[5], "g": r[6], "h": r[7], "i": r[8], "j": r[9], "k": r[10], "l": r[11], "m": r[12], "n": r[13], "o": r[14], "p": r[15]},
        )
    logger.info("ut_indicator_classifications_en: %d rows", len(rows))


def seed_indicator_unit_subgroup(session) -> None:
    """ut_indicator_unit_subgroup: 10 IUS rows (indicator_nid, unit_nid, subgroup_val_nid 1-10)."""
    for i in range(1, ROW_LIMIT + 1):
        session.execute(
            text(
                "INSERT IGNORE INTO ut_indicator_unit_subgroup (indicator_nid, unit_nid, subgroup_val_nid, min_value, max_value, "
                "subgroup_nids, data_exist, isdefaultsubgroup) VALUES (:ind, :unit, :sgv, 0, 0, :sgn, 0, 0)"
            ),
            {"ind": min(i, 10), "unit": min(i, 10), "sgv": min(i, 10), "sgn": "1,2"},
        )
    logger.info("ut_indicator_unit_subgroup: %d rows", ROW_LIMIT)


def seed_ic_ius(session) -> None:
    """ut_ic_ius: link ic_nid to iusnid (first 10 IUS get linked to ic 5 and 19)."""
    for i in range(1, ROW_LIMIT + 1):
        session.execute(
            text(
                "INSERT IGNORE INTO ut_ic_ius (ic_nid, iusnid, recommendedsource, ic_ius_order, ic_ius_label) "
                "VALUES (:ic, :ius, NULL, NULL, NULL)"
            ),
            {"ic": 5 if i % 2 == 1 else 19, "ius": i},
        )
    logger.info("ut_ic_ius: %d rows", ROW_LIMIT)


def seed_timeperiod(session) -> None:
    """ut_timeperiod: timeperiod_nid, timeperiod, startdate, enddate, periodicity"""
    rows = [
        (1, "2011-12", datetime(2011, 7, 1), datetime(2012, 3, 31, 23, 59, 59), "A"),
        (2, "2012-13", datetime(2012, 7, 1), datetime(2013, 3, 31, 23, 59, 59), "A"),
        (3, "2013-14", datetime(2013, 7, 1), datetime(2014, 3, 31, 23, 59, 59), "A"),
        (4, "2014-15", datetime(2014, 7, 1), datetime(2015, 3, 31, 23, 59, 59), "A"),
        (5, "2015-16", datetime(2015, 7, 1), datetime(2016, 3, 31, 23, 59, 59), "A"),
        (6, "2016-17", datetime(2016, 7, 1), datetime(2017, 3, 31, 23, 59, 59), "A"),
        (7, "2017-18", datetime(2017, 7, 1), datetime(2018, 3, 31, 23, 59, 59), "A"),
        (8, "2018-19", datetime(2018, 7, 1), datetime(2019, 3, 31, 23, 59, 59), "A"),
        (9, "2019-20", datetime(2019, 7, 1), datetime(2020, 3, 31, 23, 59, 59), "A"),
        (10, "2020-21", datetime(2020, 7, 1), datetime(2021, 3, 31, 23, 59, 59), "A"),
    ]
    for r in rows:
        session.execute(
            text(
                "INSERT IGNORE INTO ut_timeperiod (timeperiod_nid, timeperiod, startdate, enddate, periodicity) "
                "VALUES (:a, :b, :c, :d, :e)"
            ),
            {"a": r[0], "b": r[1], "c": r[2], "d": r[3], "e": r[4]},
        )
    logger.info("ut_timeperiod: %d rows", len(rows))


def seed_data(session) -> None:
    """ut_data: 10 rows with data_nid, referencing iusnid 1-10, timeperiod_nid 1, area_nid from ut_area_en."""
    area_nids = [16698, 17498, 17499, 17500, 17501, 17502, 17503, 17504, 17505, 17506]
    for i in range(1, ROW_LIMIT + 1):
        session.execute(
            text(
                "INSERT IGNORE INTO ut_data (data_nid, iusnid, timeperiod_nid, area_nid, start_date, end_date, data_denominator, "
                "footnote_nid, source_nid, indicator_nid, unit_nid, subgroup_val_nid, ic_ius_order, "
                "textual_data_value, istextualdata, ismrd, isplannedvalue, iunid, confidenceintervalupper, "
                "confidenceintervallower, multiplesource, data_value) "
                "VALUES (:dnid, :ius, 1, :area, NULL, NULL, NULL, -1, 6, :ind, :unit, :sgv, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, :val)"
            ),
            {
                "dnid": i,
                "ius": i,
                "area": area_nids[(i - 1) % len(area_nids)],
                "ind": min(i, 10),
                "unit": min(i, 10),
                "sgv": min(i, 10),
                "val": 10.5 + i,
            },
        )
    logger.info("ut_data: %d rows", ROW_LIMIT)


def run_seed(session) -> None:
    seed_area_level_en(session)
    seed_area_en(session)
    seed_unit_en(session)
    seed_subgroup_en(session)
    seed_subgroup_vals_en(session)
    seed_subgroup_vals_subgroup(session)
    seed_indicator_en(session)
    seed_indicator_classifications_en(session)
    seed_indicator_unit_subgroup(session)
    seed_ic_ius(session)
    seed_timeperiod(session)
    seed_data(session)


def seed_warehouse_by_id(dw_id: str) -> None:
    """
    Seed test data (10 rows per table) into the data warehouse identified by dw_id.
    Uses credentials from system_datawarehouse. For use by the debug API when DEBUG=true.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    with get_warehouse_session_from_id(dw_id) as session:
        run_seed(session)


def main() -> None:
    dw_id = get_dw_id()
    logger.info("Seeding data warehouse (dw_id=%s), %d rows per table...", dw_id, ROW_LIMIT)
    try:
        if _has_direct_dw_env():
            with _direct_warehouse_session() as session:
                run_seed(session)
        elif _has_dw_override_env():
            # Use warehouse 1 (or given dw_id) creds but connect to DW_OVERRIDE_HOST (e.g. 127.0.0.1 for Docker from host)
            with _warehouse_session_with_override(dw_id) as session:
                run_seed(session)
        else:
            from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
            with get_warehouse_session_from_id(dw_id) as session:
                run_seed(session)
        logger.info("Seed completed successfully.")
    except Exception as e:
        log_background_incident(
            message=f"Seed failed: {e}",
            error_code="SEED_TEST_DATA_FAILED",
            exc=e,
            source=_SEED_TEST_DATA_SOURCE,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
