"""
DI7 data-warehouse index plan (MySQL).

Index definitions aligned with apps.datawarehouse.models.datawarehouse locale/global tables.
Applied by dw_optimizer.perform_set_indexes via apply_di7_indexes().
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from apps.shared.exceptions import UnprocessableEntity

logger = logging.getLogger(__name__)

# Index column signature: (column_name, prefix_length or None)
IndexColSig = Tuple[str, Optional[int]]
IndexSignature = Tuple[IndexColSig, ...]
LOCALE_PLACEHOLDER = ":placeholder"


@dataclass(frozen=True)
class IndexColumn:
    name: str
    prefix_length: Optional[int] = None  # e.g. ic_name(255)


@dataclass(frozen=True)
class DedupeSpec:
    pk_column: str
    partition_columns: Tuple[str, ...]


@dataclass(frozen=True)
class TableIndexPlan:
    """Index plan for one physical table (already resolved, no :placeholder)."""

    table: str
    # If False, skip entire plan when the table is missing (locale tables on partial DWs).
    required: bool = True
    primary_key: Optional[Tuple[str, ...]] = None
    indexes: Tuple[Tuple[str, Tuple[IndexColumn, ...], bool], ...] = ()  # (name, cols, unique)
    dedupe_before_unique: Tuple[Tuple[str, DedupeSpec], ...] = ()  # (unique_index_name, dedupe)


def _col_sql(col: IndexColumn) -> str:
    if col.prefix_length:
        return f"`{col.name}`({col.prefix_length})"
    return f"`{col.name}`"


def _cols_sql(cols: Sequence[IndexColumn]) -> str:
    return ", ".join(_col_sql(c) for c in cols)


def _locale_table(prefix: str) -> str:
    return f"{prefix}_{LOCALE_PLACEHOLDER}"


def get_di7_table_plans() -> List[TableIndexPlan]:
    """Return index plans with :placeholder in table names for locale-suffixed tables."""
    ic = _locale_table("ut_indicator_classifications")
    sgt = _locale_table("ut_subgroup_type")
    sg = _locale_table("ut_subgroup")
    sgv = _locale_table("ut_subgroup_vals")
    unit = _locale_table("ut_unit")
    ind = _locale_table("ut_indicator")
    area = _locale_table("ut_area")
    alvl = _locale_table("ut_area_level")

    def idx(name: str, *cols: str, unique: bool = False, prefix: Optional[int] = None) -> Tuple[str, Tuple[IndexColumn, ...], bool]:
        return (name, tuple(IndexColumn(c, prefix) for c in cols), unique)

    return [
        TableIndexPlan(
            table="ut_data",
            primary_key=("data_nid",),
            indexes=(
                idx("idx_area_nid", "area_nid"),
                idx("idx_footnote_nid", "footnote_nid"),
                idx("idx_source_nid", "source_nid"),
                idx("idx_timeperiod_nid", "timeperiod_nid"),
                idx("idx_indicator_nid", "indicator_nid"),
                idx("idx_tp_ius_area", "timeperiod_nid", "iusnid", "area_nid"),
                idx("idx_iusnid_ar_tp_sr", "iusnid"),
                idx(
                    "idx_ind_unit_sgrp_ar_tp_sr",
                    "indicator_nid",
                    "unit_nid",
                    "subgroup_val_nid",
                    "area_nid",
                    "timeperiod_nid",
                    "source_nid",
                ),
            ),
            dedupe_before_unique=(
                (
                    "dmuniq_tp_area_src_ius",
                    DedupeSpec("data_nid", ("iusnid", "timeperiod_nid", "area_nid", "source_nid")),
                ),
            ),
        ),
        TableIndexPlan(
            table="ut_timeperiod",
            primary_key=("timeperiod_nid",),
            indexes=(),
            dedupe_before_unique=(
                ("dmuniq_tp", DedupeSpec("timeperiod_nid", ("timeperiod",))),
            ),
        ),
        TableIndexPlan(
            table="ut_indicator_unit_subgroup",
            primary_key=("iusnid",),
            indexes=(
                idx("idx_unit_nid", "unit_nid"),
                idx("idx_subgroup_val_nid", "subgroup_val_nid"),
                idx("idx_indicator_nid", "indicator_nid"),
                idx("idx_i_u", "indicator_nid", "unit_nid"),
            ),
            dedupe_before_unique=(
                (
                    "dmuniq_ius_nid",
                    DedupeSpec("iusnid", ("indicator_nid", "unit_nid", "subgroup_val_nid")),
                ),
            ),
        ),
        TableIndexPlan(
            table="ut_ic_ius",
            primary_key=("ic_iusnid",),
            indexes=(
                idx("idx_ic_nid", "ic_nid"),
                idx("idx_ic_iusnid", "iusnid"),
            ),
            dedupe_before_unique=(
                ("dmuniq_ic_iusnid", DedupeSpec("ic_iusnid", ("ic_nid", "iusnid"))),
            ),
        ),
        TableIndexPlan(
            table=ic,
            required=False,
            primary_key=("ic_nid",),
            indexes=(
                idx("ic_parent_nid", "ic_parent_nid"),
                idx("ic_name", "ic_name", prefix=255),
                idx("ic_type", "ic_type"),
            ),
            dedupe_before_unique=(
                ("dmuniq_ic_gid", DedupeSpec("ic_nid", ("ic_gid",))),
            ),
        ),
        TableIndexPlan(
            table=sgt,
            required=False,
            primary_key=("subgroup_type_nid",),
            indexes=(),
            dedupe_before_unique=(
                ("dmuniq_sgt_gid", DedupeSpec("subgroup_type_nid", ("subgroup_type_gid",))),
                ("dmuniq_sgt_name", DedupeSpec("subgroup_type_nid", ("subgroup_type_name",))),
            ),
        ),
        TableIndexPlan(
            table=sg,
            required=False,
            primary_key=("subgroup_nid",),
            indexes=(),
            dedupe_before_unique=(
                ("dmuniq_sg_gid", DedupeSpec("subgroup_nid", ("subgroup_gid",))),
                ("dmuniq_sg_name", DedupeSpec("subgroup_nid", ("subgroup_name",))),
            ),
        ),
        TableIndexPlan(
            table=sgv,
            required=False,
            primary_key=("subgroup_val_nid",),
            indexes=(),
            dedupe_before_unique=(
                ("dmuniq_sgval_gid", DedupeSpec("subgroup_val_nid", ("subgroup_val_gid",))),
                ("dmuniq_sgval_name", DedupeSpec("subgroup_val_nid", ("subgroup_val",))),
            ),
        ),
        TableIndexPlan(
            table="ut_subgroup_vals_subgroup",
            primary_key=("subgroup_val_subgroup_nid",),
            indexes=(
                idx("idx_subgroup_nid", "subgroup_nid"),
                idx("idx_subgroup_val_nid", "subgroup_val_nid"),
            ),
            dedupe_before_unique=(
                (
                    "dmuniq_sgvalsg",
                    DedupeSpec("subgroup_val_subgroup_nid", ("subgroup_val_nid", "subgroup_nid")),
                ),
            ),
        ),
        TableIndexPlan(
            table=unit,
            required=False,
            primary_key=("unit_nid",),
            indexes=(),
            dedupe_before_unique=(
                ("dmuniq_unit_gid", DedupeSpec("unit_nid", ("unit_gid",))),
                ("dmuniq_unit_name", DedupeSpec("unit_nid", ("unit_name",))),
            ),
        ),
        TableIndexPlan(
            table=ind,
            required=False,
            primary_key=("indicator_nid",),
            indexes=(),
            dedupe_before_unique=(
                ("dmuniq_ind_gid", DedupeSpec("indicator_nid", ("indicator_gid",))),
                ("dmuniq_ind_name", DedupeSpec("indicator_nid", ("indicator_name",))),
            ),
        ),
        TableIndexPlan(
            table=area,
            required=False,
            primary_key=("area_nid",),
            indexes=(
                idx("idx_area_name", "area_name"),
                idx("idx_area_parent_nid", "area_parent_nid"),
                idx("idx_area_level", "area_level"),
            ),
            dedupe_before_unique=(
                ("dmuniq_area_id", DedupeSpec("area_nid", ("area_id",))),
            ),
        ),
        TableIndexPlan(
            table=alvl,
            required=False,
            primary_key=("level_nid",),
            indexes=(),
            dedupe_before_unique=(
                ("dmuniq_area_level", DedupeSpec("level_nid", ("area_level",))),
            ),
        ),
    ]


def resolve_plans_for_language(plans: Sequence[TableIndexPlan], lang: str) -> List[TableIndexPlan]:
    resolved: List[TableIndexPlan] = []
    for plan in plans:
        table = plan.table.replace(LOCALE_PLACEHOLDER, lang)
        resolved.append(
            TableIndexPlan(
                table=table,
                required=plan.required,
                primary_key=plan.primary_key,
                indexes=plan.indexes,
                dedupe_before_unique=plan.dedupe_before_unique,
            )
        )
    return resolved


def get_di7_managed_table_names(languages: Sequence[str]) -> frozenset[str]:
    """
    Physical table names covered by the DI7 index plan for the given warehouse locales.
    Used to scope index clear/rebuild (excludes iu_validation*, ce_*, etc.).
    """
    names: set[str] = set()
    base_plans = get_di7_table_plans()
    for lang in languages:
        for plan in resolve_plans_for_language(base_plans, lang):
            names.add(plan.table)
    return frozenset(names)


def _table_exists(cur: Any, table: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s LIMIT 1",
        (table,),
    )
    return cur.fetchone() is not None


def _index_exists(cur: Any, table: str, index_name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND INDEX_NAME = %s LIMIT 1",
        (table, index_name),
    )
    return cur.fetchone() is not None


def _signature_from_columns(columns: Sequence[IndexColumn]) -> IndexSignature:
    return tuple((c.name, c.prefix_length) for c in columns)


def _signature_from_strings(columns: Sequence[str]) -> IndexSignature:
    return tuple((c, None) for c in columns)


def _get_table_indexes(cur: Any, table: str) -> List[Tuple[str, IndexSignature, bool]]:
    """Return (index_name, column_signature, is_non_unique) for each index on table."""
    cur.execute(
        "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX, SUB_PART "
        "FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
        "ORDER BY INDEX_NAME, SEQ_IN_INDEX",
        (table,),
    )
    rows = cur.fetchall()
    grouped: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        if isinstance(row, dict):
            iname = row["INDEX_NAME"]
            non_unique = int(row["NON_UNIQUE"])
            col = row["COLUMN_NAME"]
            seq = int(row["SEQ_IN_INDEX"])
            sub_part = row["SUB_PART"]
        else:
            iname, non_unique, col, seq, sub_part = row[0], int(row[1]), row[2], int(row[3]), row[4]
        prefix = int(sub_part) if sub_part is not None else None
        entry = grouped.setdefault(iname, {"non_unique": non_unique, "cols": []})
        entry["cols"].append((seq, col, prefix))
    out: List[Tuple[str, IndexSignature, bool]] = []
    for iname, data in grouped.items():
        cols = tuple((c, p) for _, c, p in sorted(data["cols"]))
        out.append((iname, cols, bool(data["non_unique"])))
    return out


def _drop_index(cur: Any, conn: Any, table: str, index_name: str) -> None:
    _execute(cur, conn, f"ALTER TABLE `{table}` DROP INDEX `{index_name}`", context=f"{table}.drop:{index_name}")


def _is_fk_required_index_error(exc: BaseException) -> bool:
    """MySQL 1553: index is needed in a foreign key constraint."""
    current: Optional[BaseException] = exc
    while current is not None:
        args = getattr(current, "args", ())
        if args and args[0] == 1553:
            return True
        current = current.__cause__ or getattr(current, "__context__", None)
    return False


def _drop_indexes_with_exact_signature(
    cur: Any,
    conn: Any,
    table: str,
    signature: IndexSignature,
    *,
    keep_name: Optional[str] = None,
) -> List[str]:
    """Drop every index on table whose columns exactly match signature (unique or not)."""
    dropped: List[str] = []
    for iname, cols, _non_unique in _get_table_indexes(cur, table):
        if iname == "PRIMARY" or iname == keep_name:
            continue
        if cols != signature:
            continue
        try:
            _drop_index(cur, conn, table, iname)
            dropped.append(iname)
            logger.info("Dropped redundant index %s on %s (columns %s)", iname, table, signature)
        except UnprocessableEntity as e:
            if _is_fk_required_index_error(e.__cause__ or e):
                logger.info("Keeping index %s on %s (required by foreign key)", iname, table)
                continue
            raise
    return dropped


def _execute(cur: Any, conn: Any, sql: str, *, context: str = "") -> None:
    try:
        cur.execute(sql)
        conn.commit()
    except Exception as e:
        raise UnprocessableEntity(
            f"Index DDL failed{f' on {context}' if context else ''}: {e}",
            error_code="DW_INDEX_STATEMENT_FAILED",
            details={"context": context or None, "statement": sql[:1000]},
        ) from e


def _dedupe_rows(cur: Any, conn: Any, table: str, spec: DedupeSpec) -> int:
    partition = ", ".join(f"`{c}`" for c in spec.partition_columns)
    sql = (
        f"DELETE FROM `{table}` WHERE `{spec.pk_column}` IN ("
        f"  SELECT `{spec.pk_column}` FROM ("
        f"    SELECT `{spec.pk_column}`, "
        f"           ROW_NUMBER() OVER (PARTITION BY {partition}) AS _rn "
        f"    FROM `{table}`"
        f"  ) AS _sub WHERE _rn > 1"
        f")"
    )
    try:
        cur.execute(sql)
        conn.commit()
    except Exception as e:
        raise UnprocessableEntity(
            f"Deduplication failed on `{table}`: {e}",
            error_code="DW_INDEX_DEDUPE_FAILED",
            details={"table": table, "partition_columns": list(spec.partition_columns)},
        ) from e
    deleted = cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else 0
    return deleted


def _verify_no_duplicates(cur: Any, table: str, spec: DedupeSpec) -> Optional[str]:
    partition = ", ".join(f"`{c}`" for c in spec.partition_columns)
    cur.execute(
        f"SELECT COUNT(*) AS c FROM ("
        f"  SELECT {partition} FROM `{table}` "
        f"  GROUP BY {partition} HAVING COUNT(*) > 1 LIMIT 1"
        f") AS _dups"
    )
    row = cur.fetchone()
    count = int(row.get("c") if isinstance(row, dict) else row[0]) if row else 0
    if count > 0:
        return (
            f"Table `{table}` still has duplicate values for ({', '.join(spec.partition_columns)}) "
            f"after deduplication; cannot add unique index."
        )
    return None


def _apply_table_plan(cur: Any, conn: Any, plan: TableIndexPlan) -> Dict[str, Any]:
    table = plan.table
    applied: List[str] = []
    skipped: List[str] = []

    if not _table_exists(cur, table):
        if plan.required:
            raise UnprocessableEntity(
                f"Required warehouse table `{table}` does not exist.",
                error_code="DW_INDEX_TABLE_MISSING",
                details={"table": table},
            )
        skipped.append(f"table_missing:{table}")
        return {"table": table, "applied": applied, "skipped": skipped}

    if plan.primary_key and not _index_exists(cur, table, "PRIMARY"):
        cols = ", ".join(f"`{c}`" for c in plan.primary_key)
        _execute(cur, conn, f"ALTER TABLE `{table}` ADD PRIMARY KEY ({cols})", context=table)
        applied.append(f"PRIMARY({','.join(plan.primary_key)})")

    for name, columns, unique in plan.indexes:
        sig = _signature_from_columns(columns)
        if _index_exists(cur, table, name):
            continue
        _drop_indexes_with_exact_signature(cur, conn, table, sig, keep_name=name)
        cols_sql = _cols_sql(columns)
        if unique:
            _execute(
                cur,
                conn,
                f"ALTER TABLE `{table}` ADD CONSTRAINT `{name}` UNIQUE ({cols_sql})",
                context=f"{table}.{name}",
            )
        else:
            _execute(
                cur, conn, f"ALTER TABLE `{table}` ADD INDEX `{name}` ({cols_sql})", context=f"{table}.{name}"
            )
        applied.append(name)

    for unique_name, dedupe in plan.dedupe_before_unique:
        if _index_exists(cur, table, unique_name):
            continue
        sig = _signature_from_strings(dedupe.partition_columns)
        _drop_indexes_with_exact_signature(cur, conn, table, sig, keep_name=unique_name)
        deleted = _dedupe_rows(cur, conn, table, dedupe)
        if deleted:
            logger.info("Removed %s duplicate row(s) from %s before %s", deleted, table, unique_name)
        dup_err = _verify_no_duplicates(cur, table, dedupe)
        if dup_err:
            raise UnprocessableEntity(
                dup_err,
                error_code="DW_INDEX_DUPLICATE_DATA",
                details={
                    "table": table,
                    "index": unique_name,
                    "columns": list(dedupe.partition_columns),
                },
            )
        cols_sql = ", ".join(f"`{c}`" for c in dedupe.partition_columns)
        _execute(
            cur,
            conn,
            f"ALTER TABLE `{table}` ADD CONSTRAINT `{unique_name}` UNIQUE ({cols_sql})",
            context=f"{table}.{unique_name}",
        )
        applied.append(unique_name)

    return {"table": table, "applied": applied, "skipped": skipped}


def apply_di7_indexes(
    cur: Any,
    conn: Any,
    languages: Sequence[str],
    *,
    on_progress: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    """
    Apply the full DI7 index plan for each language. Raises UnprocessableEntity on failure.
    """
    base_plans = get_di7_table_plans()
    details: List[Dict[str, Any]] = []
    total_applied = 0

    for lang in languages:
        if on_progress:
            on_progress(f"language:{lang}")
        for plan in resolve_plans_for_language(base_plans, lang):
            if on_progress:
                on_progress(f"table:{plan.table}")
            result = _apply_table_plan(cur, conn, plan)
            details.append({"language": lang, **result})
            total_applied += len(result.get("applied") or [])

    return {
        "languages": list(languages),
        "indexes_applied": total_applied,
        "details": details,
    }
