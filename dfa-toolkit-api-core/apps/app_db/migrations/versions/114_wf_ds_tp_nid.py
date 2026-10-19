"""Add curr_timeperiod_nid to workflow_dataentry_rule and reporting_timeperiod_nid to dataset.

Back-fills workflow_dataentry_rule.curr_timeperiod_nid for workflows with
allow_review = 1 using the latest ut_timeperiod.timeperiod_nid for that
workflow's datawarehouse, filtered by the rule's timeperiod_frequency when not
NULL/ALL.

Datasets under those workflows inherit reporting_timeperiod_nid from the parent
workflow's data-entry rule. Both columns remain nullable.

Revision ID: 114_wf_ds_tp_nid
Revises: 113_mobile_app_pkg
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from alembic import op
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL

from apps.shared.config.config import settings
from apps.shared.utils.password_encryption import decrypt_password

revision = "114_wf_ds_tp_nid"
down_revision = "113_mobile_app_pkg"
branch_labels = None
depends_on = None

logger = logging.getLogger(__name__)


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
        ),
        {"t": table, "c": column},
    ).scalar()
    return bool(row)


def _decrypt_dw_password(raw_password: str) -> str:
    enc_key = getattr(settings, "PASSWORD_ENCRYPTION_KEY", "") or ""
    decrypted = decrypt_password(raw_password, settings.SECRET_KEY, enc_key)
    if not decrypted and (raw_password or "").strip():
        return raw_password
    return decrypted


def _build_dw_url(details: dict) -> Optional[URL]:
    host = (details.get("db_host_address") or details.get("db_host") or "").strip()
    database = (details.get("db_database") or "").strip()
    user = (details.get("db_user") or details.get("db_login") or "").strip()
    password = _decrypt_dw_password(details.get("db_password") or "")
    if not host or not database or not user:
        return None

    raw_port = details.get("db_port")
    port: Optional[int]
    try:
        port = int(raw_port) if raw_port not in (None, "") else None
    except (TypeError, ValueError):
        port = None

    source = (details.get("db_source_type") or details.get("db_source") or "mysql").lower()
    if source == "postgresql":
        return URL.create(
            drivername="postgresql+psycopg2",
            username=user or None,
            password=password or None,
            host=host,
            port=port,
            database=database,
        )

    return URL.create(
        drivername="mysql+mysqlconnector",
        username=user or None,
        password=password or None,
        host=host,
        port=port,
        database=database,
        query={"charset": "utf8mb4"},
    )


def _normalize_frequency(frequency: Optional[str]) -> Optional[str]:
    """Return periodicity code for filtering, or None when ALL / unset."""
    if frequency is None:
        return None
    normalized = str(frequency).strip().upper()
    if not normalized or normalized == "ALL":
        return None
    return normalized


def _frequency_cache_key(frequency: Optional[str]) -> str:
    return _normalize_frequency(frequency) or "__ALL__"


def _latest_timeperiod_nid(dw_url: URL, frequency: Optional[str] = None) -> Optional[int]:
    """Latest ut_timeperiod NID, optionally filtered by periodicity code."""
    periodicity = _normalize_frequency(frequency)
    freq_filter = "AND periodicity = :freq" if periodicity else ""
    params = {"freq": periodicity} if periodicity else {}

    latest_sql = text(
        f"""
        SELECT timeperiod_nid
        FROM ut_timeperiod
        WHERE enddate IS NOT NULL
        {freq_filter}
        ORDER BY enddate DESC, timeperiod_nid DESC
        LIMIT 1
        """
    )
    fallback_sql = text(
        f"""
        SELECT timeperiod_nid
        FROM ut_timeperiod
        WHERE timeperiod IS NOT NULL
        {freq_filter}
        ORDER BY timeperiod DESC, timeperiod_nid DESC
        LIMIT 1
        """
    )
    max_sql = text(
        f"""
        SELECT MAX(timeperiod_nid)
        FROM ut_timeperiod
        WHERE 1 = 1
        {freq_filter}
        """
    )

    engine = create_engine(dw_url, pool_pre_ping=True)
    try:
        with engine.connect() as dw_conn:
            for stmt in (latest_sql, fallback_sql, max_sql):
                row = dw_conn.execute(stmt, params).fetchone()
                if row and row[0] is not None:
                    return int(row[0])
    except Exception as exc:
        logger.warning(
            "Could not resolve latest timeperiod for %s (frequency=%s): %s",
            dw_url.database,
            periodicity or "ALL",
            exc,
        )
    finally:
        engine.dispose()
    return None


def _load_dw_urls(conn) -> tuple[dict[int, URL], Optional[int]]:
    """Return (dw_id -> SQLAlchemy URL, first active dw_id for global workflows)."""
    if not _table_exists("system_datawarehouse"):
        return {}, None

    rows = conn.execute(
        text(
            "SELECT id, dw_connection_details "
            "FROM system_datawarehouse "
            "ORDER BY is_active DESC, id ASC"
        )
    ).fetchall()

    by_dw: dict[int, URL] = {}
    first_dw_id: Optional[int] = None

    for dw_id, conn_details in rows:
        try:
            details = json.loads(conn_details or "{}")
        except (json.JSONDecodeError, TypeError):
            logger.warning("Invalid dw_connection_details JSON for dw_id=%s", dw_id)
            continue

        dw_url = _build_dw_url(details)
        if dw_url is None:
            continue

        dw_id_int = int(dw_id)
        by_dw[dw_id_int] = dw_url
        if first_dw_id is None:
            first_dw_id = dw_id_int

    return by_dw, first_dw_id


def _resolve_latest_nid(
    dw_urls: dict[int, URL],
    cache: dict[tuple[int, str], Optional[int]],
    *,
    dw_id: Optional[int],
    frequency: Optional[str],
    default_dw_id: Optional[int],
) -> Optional[int]:
    effective_dw_id = int(dw_id) if dw_id is not None else default_dw_id
    if effective_dw_id is None:
        return None

    dw_url = dw_urls.get(effective_dw_id)
    if dw_url is None:
        return None

    cache_key = (effective_dw_id, _frequency_cache_key(frequency))
    if cache_key in cache:
        return cache[cache_key]

    latest = _latest_timeperiod_nid(dw_url, frequency)
    cache[cache_key] = latest
    return latest


def _load_dataentry_rules(conn) -> list[tuple[int, int, Optional[int], Optional[str]]]:
    """Return (dataentry_rule_id, workflow_id, dw_id, timeperiod_frequency) rows."""
    if not _table_exists("workflow") or not _table_exists("workflow_dataentry_rule"):
        return []

    rows = conn.execute(
        text(
            """
            SELECT wder.dataentry_rule_id, w.workflow_id, w.dw_id, wder.timeperiod_frequency
            FROM workflow_dataentry_rule wder
            INNER JOIN workflow w ON w.workflow_id = wder.workflow_id
            WHERE w.allow_review = 1
            """
        )
    ).fetchall()

    return [(int(r[0]), int(r[1]), r[2], r[3]) for r in rows]


def _migrate_workflow_column_to_rule(conn) -> None:
    """Move curr_timeperiod_nid from workflow to rule if an earlier revision placed it there."""
    if not _column_exists(conn, "workflow", "curr_timeperiod_nid"):
        return
    if not _table_exists("workflow_dataentry_rule"):
        op.drop_column("workflow", "curr_timeperiod_nid")
        return

    if not _column_exists(conn, "workflow_dataentry_rule", "curr_timeperiod_nid"):
        conn.execute(
            text(
                "ALTER TABLE workflow_dataentry_rule ADD COLUMN curr_timeperiod_nid INT NULL "
                "COMMENT 'Current reporting time period NID for this workflow data-entry scope' "
                "AFTER timeperiod_frequency"
            )
        )

    conn.execute(
        text(
            """
            UPDATE workflow_dataentry_rule wder
            INNER JOIN workflow w ON w.workflow_id = wder.workflow_id
            SET wder.curr_timeperiod_nid = w.curr_timeperiod_nid
            WHERE w.curr_timeperiod_nid IS NOT NULL
              AND wder.curr_timeperiod_nid IS NULL
            """
        )
    )
    op.drop_column("workflow", "curr_timeperiod_nid")


def _backfill_timeperiod_columns(conn) -> None:
    dw_urls, default_dw_id = _load_dw_urls(conn)
    latest_cache: dict[tuple[int, str], Optional[int]] = {}

    conn.execute(text("SET SQL_SAFE_UPDATES = 0"))

    if (
        _table_exists("workflow_dataentry_rule")
        and _column_exists(conn, "workflow_dataentry_rule", "curr_timeperiod_nid")
    ):
        for dataentry_rule_id, _workflow_id, dw_id, timeperiod_frequency in _load_dataentry_rules(conn):
            latest_nid = _resolve_latest_nid(
                dw_urls,
                latest_cache,
                dw_id=dw_id,
                frequency=timeperiod_frequency,
                default_dw_id=default_dw_id,
            )
            if latest_nid is None:
                continue
            conn.execute(
                text(
                    "UPDATE workflow_dataentry_rule "
                    "SET curr_timeperiod_nid = :nid "
                    "WHERE dataentry_rule_id = :rule_id "
                    "AND curr_timeperiod_nid IS NULL"
                ),
                {"nid": latest_nid, "rule_id": dataentry_rule_id},
            )

    if _table_exists("dataset") and _column_exists(conn, "dataset", "reporting_timeperiod_nid"):
        conn.execute(
            text(
                """
                UPDATE dataset d
                INNER JOIN workflow w ON d.workflow_id = w.workflow_id
                INNER JOIN workflow_dataentry_rule wder ON wder.workflow_id = w.workflow_id
                SET d.reporting_timeperiod_nid = wder.curr_timeperiod_nid
                WHERE w.allow_review = 1
                  AND d.reporting_timeperiod_nid IS NULL
                  AND wder.curr_timeperiod_nid IS NOT NULL
                """
            )
        )

    conn.execute(text("SET SQL_SAFE_UPDATES = 1"))


def upgrade() -> None:
    conn = op.get_bind()

    if _column_exists(conn, "workflow", "curr_timeperiod_nid"):
        _migrate_workflow_column_to_rule(conn)
    elif (
        _table_exists("workflow_dataentry_rule")
        and not _column_exists(conn, "workflow_dataentry_rule", "curr_timeperiod_nid")
    ):
        conn.execute(
            text(
                "ALTER TABLE workflow_dataentry_rule ADD COLUMN curr_timeperiod_nid INT NULL "
                "COMMENT 'Current reporting time period NID for this workflow data-entry scope' "
                "AFTER timeperiod_frequency"
            )
        )

    if _table_exists("dataset") and not _column_exists(conn, "dataset", "reporting_timeperiod_nid"):
        conn.execute(
            text(
                "ALTER TABLE dataset ADD COLUMN reporting_timeperiod_nid INT NULL "
                "COMMENT 'Reporting time period NID for this dataset submission' "
                "AFTER current_stage_id"
            )
        )

    _backfill_timeperiod_columns(conn)


def downgrade() -> None:
    conn = op.get_bind()

    if _table_exists("dataset") and _column_exists(conn, "dataset", "reporting_timeperiod_nid"):
        op.drop_column("dataset", "reporting_timeperiod_nid")

    if (
        _table_exists("workflow_dataentry_rule")
        and _column_exists(conn, "workflow_dataentry_rule", "curr_timeperiod_nid")
    ):
        op.drop_column("workflow_dataentry_rule", "curr_timeperiod_nid")
