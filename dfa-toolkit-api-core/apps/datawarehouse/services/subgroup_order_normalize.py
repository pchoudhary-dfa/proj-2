"""
Dense renumbering of subgroup-related display order columns (optimize / maintenance).

Removes duplicate/gapped order values by assigning contiguous ranks within each partition:
- ut_subgroup_type_*: subgroup_type_order — entire table (1.0, 2.0, …)
- ut_subgroup_*: subgroup_order — per subgroup_type (category)
- ut_subgroup_vals_*: subgroup_val_order — entire table (1, 2, …)

Rank order is derived from the default-locale tables, then applied to every locale for the same PKs.
"""
import logging
from typing import Any, Dict, List, Tuple, Union

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    SubgroupCategory,
    Subgroup,
    SubgroupVal,
    get_default_locale,
)
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SUBGROUP_ORDER_NORMALIZE_SOURCE = "apps.datawarehouse.services.subgroup_order_normalize"

_BULK_CHUNK = 500


def _sort_key_order_nulls_last(
    order_val: Union[int, float, None],
    pk: int,
) -> Tuple[int, float, int]:
    """Sort key: NULL orders last, then by order, then pk for stability."""
    if order_val is None:
        return (1, float("inf"), pk)
    return (0, float(order_val), pk)


def _apply_order_map_chunked(
    dw_db: Any,
    model_factory: Any,
    lang_codes: List[str],
    pk_column: str,
    order_column: str,
    pk_to_order: Dict[int, Union[int, float]],
) -> int:
    """Update order column for all locales; returns count of row updates executed."""
    if not pk_to_order:
        return 0

    items = list(pk_to_order.items())
    executed = 0
    for lang in lang_codes:
        LocaleModel = model_factory(lang)
        lc_pk = getattr(LocaleModel, pk_column)
        lc_ord = getattr(LocaleModel, order_column)
        for i in range(0, len(items), _BULK_CHUNK):
            chunk = items[i : i + _BULK_CHUNK]
            for pk, new_order in chunk:
                dw_db.query(LocaleModel).filter(lc_pk == pk).update(
                    {lc_ord: new_order}, synchronize_session=False
                )
                executed += 1
    return executed


def normalize_subgroup_display_orders(dw_id: str) -> Dict[str, Any]:
    """
    Renumber subgroup_type_order, subgroup_order (per category), and subgroup_val_order
    across all warehouse locale tables in one transaction.

    Args:
        dw_id: Data warehouse identifier (numeric id as string or database name).

    Returns:
        Dict with success, categories_updated, subgroup_values_updated, combinations_updated,
        locales_processed, updates_applied, optional errors/message.
    """
    out: Dict[str, Any] = {
        "success": True,
        "categories_updated": 0,
        "subgroup_values_updated": 0,
        "combinations_updated": 0,
        "locales_processed": 0,
        "updates_applied": 0,
        "errors": [],
    }

    try:
        with get_warehouse_session_from_id(dw_id) as dw_db:
            default_locale = get_default_locale(dw_db)
            lang_codes = list(get_dw_language_codes(dw_id))
            out["locales_processed"] = len(lang_codes)

            # --- 1) SubgroupCategory: global partition, float ranks ---
            CatDef = SubgroupCategory(default_locale)
            cat_rows = dw_db.query(CatDef).all()
            cat_rows.sort(
                key=lambda r: _sort_key_order_nulls_last(
                    getattr(r, "subgroup_type_order", None),
                    r.subgroup_type_nid,
                )
            )
            cat_map: Dict[int, float] = {
                row.subgroup_type_nid: float(i + 1)
                for i, row in enumerate(cat_rows)
            }
            out["categories_updated"] = len(cat_map)
            out["updates_applied"] += _apply_order_map_chunked(
                dw_db,
                SubgroupCategory,
                lang_codes,
                "subgroup_type_nid",
                "subgroup_type_order",
                cat_map,
            )

            # --- 2) Subgroup: per subgroup_type partition, int ranks ---
            SubDef = Subgroup(default_locale)
            type_ids = [
                t[0]
                for t in dw_db.query(SubDef.subgroup_type).distinct().all()
                if t[0] is not None
            ]
            sub_map: Dict[int, int] = {}
            total_sub = 0
            for st in sorted(type_ids):
                rows = (
                    dw_db.query(SubDef)
                    .filter(SubDef.subgroup_type == st)
                    .all()
                )
                rows.sort(
                    key=lambda r: _sort_key_order_nulls_last(
                        getattr(r, "subgroup_order", None),
                        r.subgroup_nid,
                    )
                )
                for i, row in enumerate(rows):
                    sub_map[row.subgroup_nid] = i + 1
                    total_sub += 1
            out["subgroup_values_updated"] = total_sub
            out["updates_applied"] += _apply_order_map_chunked(
                dw_db,
                Subgroup,
                lang_codes,
                "subgroup_nid",
                "subgroup_order",
                sub_map,
            )

            # --- 3) SubgroupVal: global partition, int ranks ---
            ValDef = SubgroupVal(default_locale)
            val_rows = dw_db.query(ValDef).all()
            val_rows.sort(
                key=lambda r: _sort_key_order_nulls_last(
                    getattr(r, "subgroup_val_order", None),
                    r.subgroup_val_nid,
                )
            )
            val_map: Dict[int, int] = {
                row.subgroup_val_nid: i + 1
                for i, row in enumerate(val_rows)
            }
            out["combinations_updated"] = len(val_map)
            out["updates_applied"] += _apply_order_map_chunked(
                dw_db,
                SubgroupVal,
                lang_codes,
                "subgroup_val_nid",
                "subgroup_val_order",
                val_map,
            )

            logger.info(
                "normalize_subgroup_display_orders: dw_id=%s categories=%s subgroup_rows=%s combinations=%s locales=%s updates=%s",
                dw_id,
                out["categories_updated"],
                out["subgroup_values_updated"],
                out["combinations_updated"],
                out["locales_processed"],
                out["updates_applied"],
            )
    except Exception as e:
        log_background_incident(
            message=f"normalize_subgroup_display_orders failed for dw_id={dw_id}",
            error_code="SUBGROUP_ORDER_NORMALIZE_FAILED",
            exc=e,
            source=_SUBGROUP_ORDER_NORMALIZE_SOURCE,
        )
        out["success"] = False
        out["message"] = str(e)
        out["errors"].append(str(e))

    return out
