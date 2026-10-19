"""Dashboard area enrichment — default_area via AreaService (/dw/areas parity)."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from apps.app_dashboard.services.user_area_service import (
    get_dashboard_restricted_nids_for_user,
    mark_area_item_selectable,
)
from apps.datawarehouse.services.area import AreaService

logger = logging.getLogger(__name__)

# Match GET /dw/{dw_id}/areas defaults when dashboard_id is supplied (flat list).
_AREAS_LIST_SORT_FIELD = "ar_level"
_AREAS_LIST_SORT_ORDER = "asc"


def _is_root_parent_nid(parent_nid: Any) -> bool:
    return parent_nid is None or int(parent_nid) in (-1, 0)


def _area_dict_to_legacy_entry(
    item: dict[str, Any],
    *,
    locale: str,
    area_id_by_nid: dict[int, str],
    parent_nids_with_children: set[int],
) -> dict[str, Any]:
    area_id = (item.get("area_id") or "").strip()
    parent_nid = item.get("area_parent_nid")
    if _is_root_parent_nid(parent_nid):
        parent_id = "-1"
    else:
        parent_id = area_id_by_nid.get(int(parent_nid), "-1") or "-1"

    area_nid = item.get("area_nid")
    return {
        "i": area_id,
        "parent_id": parent_id,
        "n": {locale: item.get("area_name") or ""},
        "lvl": item.get("area_level"),
        "child_exists": area_nid is not None and int(area_nid) in parent_nids_with_children,
        "selectable": True,
    }


def load_default_area(
    *,
    db: Session,
    system_dw_id: int | None,
    dashboard_id: int,
    user_id: int,
    app_key: str,
    is_super_admin: bool,
    locale: str,
) -> dict[str, Any]:
    """
    Return the first selectable area from the flat /dw/areas list (dashboard ACL applied).

    Uses AreaService.get_all_areas with the same sort defaults as GET /dw/{dw_id}/areas
    (sort_field=ar_level, sort_order=asc, no pagination). Picks the first item where
    selectable is true, matching the v6 editor areas preload behavior.

    Legacy shape: { "<area_id>": { i, parent_id, n, lvl, child_exists, selectable } }
    """
    if not system_dw_id:
        return {}

    try:
        restricted_nids = get_dashboard_restricted_nids_for_user(
            db,
            user_id=user_id,
            dashboard_id=dashboard_id,
            app_key=app_key,
            is_super_admin=is_super_admin,
        )

        items, _, _, _ = AreaService().get_all_areas(
            str(system_dw_id),
            language_code=locale,
            hierarchical=False,
            page=1,
            page_size=None,
            sort_order=_AREAS_LIST_SORT_ORDER,
            sort_field=_AREAS_LIST_SORT_FIELD,
        )

        area_id_by_nid: dict[int, str] = {}
        parent_nids_with_children: set[int] = set()
        for row in items:
            nid = row.get("area_nid")
            if nid is None:
                continue
            nid_int = int(nid)
            area_code = (row.get("area_id") or "").strip()
            if area_code:
                area_id_by_nid[nid_int] = area_code
            parent_nid = row.get("area_parent_nid")
            if parent_nid is not None and not _is_root_parent_nid(parent_nid):
                parent_nids_with_children.add(int(parent_nid))

        for row in items:
            item = mark_area_item_selectable(
                dict(row),
                dashboard_scoped=True,
                restricted_nids=restricted_nids,
            )
            if item.get("selectable") is False:
                continue

            area_id = (item.get("area_id") or "").strip()
            if not area_id:
                continue

            entry = _area_dict_to_legacy_entry(
                item,
                locale=locale,
                area_id_by_nid=area_id_by_nid,
                parent_nids_with_children=parent_nids_with_children,
            )
            return {area_id: entry}

        return {}
    except Exception as exc:
        logger.warning(
            "Failed to load default_area for system_dw_id=%s: %s",
            system_dw_id,
            exc,
        )
        return {}
