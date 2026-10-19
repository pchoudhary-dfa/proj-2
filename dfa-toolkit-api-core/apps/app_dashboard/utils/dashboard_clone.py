"""Helpers for POST /dash/{dashboard_id}/clone — name resolution and layout remapping."""
from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from apps.app_dashboard.constants import (
    CLONE_NAME_SUFFIX,
    CLONE_TITLE_SUFFIX,
    DASHBOARD_MODE_EDIT,
)
from apps.app_dashboard.models.dashboard import Dashboard
from apps.app_dashboard.utils.dashboard_serialization import parse_json_field
from apps.shared.exceptions import Conflict, InternalError


def parse_json_column(value: Any) -> Any | None:
    """Parse a JSON DB column; alias for clone layout helpers."""
    return parse_json_field(value)


def is_assoc_gridster(gridster: Any) -> bool:
    """True when gridster is a section-keyed dict (legacy isAssoc)."""
    if not gridster or not isinstance(gridster, dict):
        return False
    keys = list(gridster.keys())
    return keys != list(range(len(keys)))


def _format_clone_name(base_name: str, attempt: int) -> str:
    if attempt <= 1:
        return f"{base_name}{CLONE_NAME_SUFFIX}"
    return f"{base_name}{CLONE_NAME_SUFFIX} {attempt}"


def _format_clone_title(base_title: str, attempt: int) -> str:
    if attempt <= 1:
        return f"{base_title}{CLONE_TITLE_SUFFIX}"
    return f"{base_title}{CLONE_TITLE_SUFFIX} {attempt}"


def _dashboard_name_taken(db: Session, dashboard_name: str) -> bool:
    return (
        db.query(Dashboard.id)
        .filter(Dashboard.dashboard_name == dashboard_name)
        .first()
        is not None
    )


def _dashboard_title_taken(db: Session, dashboard_title: str) -> bool:
    return (
        db.query(Dashboard.id)
        .filter(
            Dashboard.dashboard_title == dashboard_title,
            Dashboard.mode == DASHBOARD_MODE_EDIT,
        )
        .first()
        is not None
    )


def _resolve_auto_clone_names(
    db: Session,
    base_name: str,
    base_title: str,
) -> tuple[str, str]:
    """Find a unique name/title pair using coordinated auto-increment suffixes."""
    title_base = base_title or base_name
    for attempt in range(1, 1000):
        candidate_name = _format_clone_name(base_name, attempt)
        candidate_title = _format_clone_title(title_base, attempt)
        if not _dashboard_name_taken(db, candidate_name) and not _dashboard_title_taken(
            db, candidate_title
        ):
            return candidate_name, candidate_title
    raise InternalError(
        "Could not resolve unique clone dashboard name and title",
        error_code="CLONE_NAME_RESOLUTION_FAILED",
    )


def resolve_clone_dashboard_name(
    db: Session,
    base_name: str,
    explicit: Optional[str],
) -> str:
    """Resolve clone dashboard_name; auto-increment suffix when explicit is omitted."""
    if explicit is not None:
        if _dashboard_name_taken(db, explicit):
            raise Conflict(
                f"Dashboard with name '{explicit}' already exists",
                error_code="DASHBOARD_NAME_EXISTS",
            )
        return explicit

    for attempt in range(1, 1000):
        candidate = _format_clone_name(base_name, attempt)
        if not _dashboard_name_taken(db, candidate):
            return candidate
    raise InternalError(
        "Could not resolve unique clone dashboard name",
        error_code="CLONE_NAME_RESOLUTION_FAILED",
    )


def resolve_clone_dashboard_title(
    db: Session,
    base_title: str,
    explicit: Optional[str],
) -> str:
    """Resolve clone dashboard_title; auto-increment suffix when explicit is omitted."""
    title_base = base_title or ""
    if explicit is not None:
        if _dashboard_title_taken(db, explicit):
            raise Conflict(
                f"Dashboard with URL '{explicit}' already exists",
                error_code="DASHBOARD_URL_EXISTS",
            )
        return explicit

    for attempt in range(1, 1000):
        candidate = _format_clone_title(title_base, attempt)
        if not _dashboard_title_taken(db, candidate):
            return candidate
    raise InternalError(
        "Could not resolve unique clone dashboard title",
        error_code="CLONE_NAME_RESOLUTION_FAILED",
    )


def resolve_clone_names(
    db: Session,
    base_name: str,
    base_title: Optional[str],
    *,
    explicit_name: Optional[str] = None,
    explicit_url: Optional[str] = None,
) -> tuple[str, str]:
    """
    Resolve dashboard_name and dashboard_title for a clone.

    When both names are auto-generated, use a coordinated suffix counter so both
    are unique together. Explicit overrides use a single uniqueness check (409).
    """
    if explicit_name is None and explicit_url is None:
        return _resolve_auto_clone_names(db, base_name, base_title or base_name)

    name = resolve_clone_dashboard_name(db, base_name, explicit_name)
    title = resolve_clone_dashboard_title(db, base_title or base_name, explicit_url)
    return name, title


def _lookup_viz_id(viz_map: dict[int, int], viz_id: Any) -> Optional[int]:
    if viz_id is None:
        return None
    try:
        int_id = int(viz_id)
    except (TypeError, ValueError):
        return None
    return viz_map.get(int_id)


def _remap_id_value(viz_map: dict[int, int], value: Any) -> Any:
    """Map a viz id through viz_map; preserve str vs int from the original value."""
    new_id = _lookup_viz_id(viz_map, value)
    if new_id is None:
        return value
    if isinstance(value, str):
        return str(new_id)
    return new_id


def remap_gridster_viz_ids(gridster: Any, viz_map: dict[int, int]) -> Any:
    """
    Remap ``entityId`` on React gridster blocks.

    Expected shape::

        {
          "<sectionId>": {
            "blocks": [{"placementId": "...", "sourceType": "...", "entityId": "7"}, ...],
            "layout": [...]
          }
        }
    """
    if not gridster or not viz_map or not isinstance(gridster, dict):
        return gridster

    result: dict[Any, Any] = {}
    for section_id, section in gridster.items():
        if not isinstance(section, dict):
            result[section_id] = section
            continue

        updated_section = dict(section)
        blocks = section.get("blocks")
        if isinstance(blocks, list):
            new_blocks: list[Any] = []
            for block in blocks:
                if not isinstance(block, dict):
                    new_blocks.append(block)
                    continue
                updated = dict(block)
                if "entityId" in updated:
                    updated["entityId"] = _remap_id_value(viz_map, updated.get("entityId"))
                new_blocks.append(updated)
            updated_section["blocks"] = new_blocks
        result[section_id] = updated_section
    return result


def remap_gridster_section_keys(gridster: Any, section_map: dict[int, int]) -> Any:
    """Rewrite top-level section id keys in a section-wise gridster dict."""
    if not gridster or not section_map or not is_assoc_gridster(gridster):
        return gridster

    remapped: dict[Any, Any] = {}
    for old_key, widgets in gridster.items():
        try:
            old_section_id = int(old_key)
        except (TypeError, ValueError):
            continue
        new_key = section_map.get(old_section_id)
        if new_key is not None:
            # Keep string keys when the source used strings (React JSON).
            remapped[str(new_key) if isinstance(old_key, str) else new_key] = widgets
    return remapped


def remap_global_filter_gridster(
    items: Any,
    viz_map: dict[int, int],
) -> Any:
    """
    Remap ``filterId`` on React global_filter_gridster placements.

    Expected shape::

        {
          "placements": [{"placementId": "...", "filterId": "9"}, ...],
          "layout": [...]
        }
    """
    if not items or not viz_map or not isinstance(items, dict):
        return items

    remapped = dict(items)
    placements = items.get("placements")
    if isinstance(placements, list):
        new_placements: list[Any] = []
        for entry in placements:
            if not isinstance(entry, dict):
                new_placements.append(entry)
                continue
            updated = dict(entry)
            if "filterId" in updated:
                updated["filterId"] = _remap_id_value(viz_map, updated.get("filterId"))
            new_placements.append(updated)
        remapped["placements"] = new_placements
    return remapped


def remap_child_hooks(data: Any, viz_map: dict[int, int]) -> Optional[str]:
    """
    Remap ``childHooks`` viz id values in a JSON column (``properties`` or legacy
    ``data_cube_info``). IDs are stored as strings in v6 filter settings.

    Returns a new JSON string when ``childHooks`` is a non-empty list and was
    processed; otherwise ``None`` (caller should not update the column).
    """
    if not viz_map:
        return None

    parsed = parse_json_field(data)
    if not isinstance(parsed, dict):
        return None

    child_hooks = parsed.get("childHooks")
    if not isinstance(child_hooks, list) or not child_hooks:
        return None

    seen: set[str] = set()
    new_hooks: list[str] = []
    for hook in child_hooks:
        new_id = _lookup_viz_id(viz_map, hook)
        value = str(new_id) if new_id is not None else str(hook)
        if value not in seen:
            seen.add(value)
            new_hooks.append(value)

    updated = dict(parsed)
    updated["childHooks"] = new_hooks
    return json.dumps(updated)


def remap_visualization_child_hooks(viz: Any, viz_map: dict[int, int]) -> None:
    """Remap ``childHooks`` in both ``properties`` (v6) and ``data_cube_info`` (legacy)."""
    for attr in ("properties", "data_cube_info"):
        raw = getattr(viz, attr, None)
        if not raw:
            continue
        remapped = remap_child_hooks(raw, viz_map)
        if remapped is not None:
            setattr(viz, attr, remapped)
