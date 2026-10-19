"""
Dashboard template service — layout CRUD and gridster helpers.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from apps.app_dashboard.constants import TEMPLATE_FLAG_NO
from apps.app_dashboard.models.dashboard import DashboardTemplate
from apps.app_dashboard.schemas.template import TemplateResponse, TemplateUpdateRequest
from apps.app_dashboard.services.visualization_service import _assert_dashboard_exists
from apps.app_dashboard.utils.dashboard_clone import is_assoc_gridster
from apps.app_dashboard.utils.dashboard_serialization import (
    parse_json_field,
    serialize_json_column,
)
from apps.shared.exceptions import NotFound


def _normalize_gridster_for_response(gridster: Any) -> Any:
    """Legacy design parity: empty list gridster is treated as an empty object."""
    if isinstance(gridster, list) and len(gridster) == 0:
        return {}
    return gridster


def _to_template_response(template: DashboardTemplate) -> TemplateResponse:
    """Map ORM template row to API response with parsed JSON columns."""
    parsed_gridster = parse_json_field(template.gridster)
    gridster: Any = (
        _normalize_gridster_for_response(parsed_gridster)
        if parsed_gridster is not None
        else None
    )
    global_filter = parse_json_field(template.global_filter_gridster)
    return TemplateResponse(
        id=template.id,
        dashboard_id=template.dashboard_id,
        gridster=gridster,
        global_filter_gridster=global_filter,
        counter=template.counter or 0,
        is_system=template.is_system,
        is_default=template.is_default,
        thumbnail=template.thumbnail,
    )


def _get_dashboard_template_or_404(
    db: Session,
    dashboard_id: int,
) -> DashboardTemplate:
    """Load the template row linked to a dashboard; raise NotFound if missing."""
    dashboard = _assert_dashboard_exists(db, dashboard_id)
    if not dashboard.template_id:
        raise NotFound(
            f"Template for dashboard {dashboard_id} not found",
            error_code="TEMPLATE_NOT_FOUND",
        )
    template = (
        db.query(DashboardTemplate)
        .filter(
            DashboardTemplate.id == dashboard.template_id,
            DashboardTemplate.dashboard_id == dashboard_id,
        )
        .first()
    )
    if not template:
        raise NotFound(
            f"Template for dashboard {dashboard_id} not found",
            error_code="TEMPLATE_NOT_FOUND",
        )
    return template


def create_empty_template(db: Session, *, user_id: int, dashboard_id: int) -> DashboardTemplate:
    """Insert a new per-dashboard template with legacy default column values."""
    template = DashboardTemplate(
        dashboard_id=dashboard_id,
        gridster=None,
        global_filter_gridster=None,
        thumbnail=None,
        is_system=TEMPLATE_FLAG_NO,
        is_default=TEMPLATE_FLAG_NO,
        counter=0,
        modified_user_id=user_id,
    )
    db.add(template)
    db.flush()
    return template


def get_template(db: Session, dashboard_id: int) -> TemplateResponse:
    """Return dashboard template layout (legacy getDashboardTemplate / service 111)."""
    template = _get_dashboard_template_or_404(db, dashboard_id)
    return _to_template_response(template)


def update_template(
    db: Session,
    dashboard_id: int,
    payload: TemplateUpdateRequest,
    user_id: int,
) -> TemplateResponse:
    """Replace gridster layout on dashboard template (legacy setTemplateGridster / 112)."""
    template = _get_dashboard_template_or_404(db, dashboard_id)
    template.gridster = serialize_json_column(payload.gridster)
    if "global_filter_gridster" in payload.model_fields_set:
        template.global_filter_gridster = serialize_json_column(
            payload.global_filter_gridster
        )
    template.modified_user_id = user_id
    db.flush()
    return _to_template_response(template)


def remove_viz_from_gridster(gridster: Any, viz_id: int) -> Any:
    """
    Remove widgets referencing viz_id from gridster JSON (legacy deleteVisualization).

    Supports section-keyed dict layout and flat list layout.
    """
    if not gridster:
        return gridster

    if is_assoc_gridster(gridster):
        result: dict[Any, list[Any]] = {}
        for section_id, widgets in gridster.items():
            if not isinstance(widgets, list):
                continue
            kept = [
                widget
                for widget in widgets
                if not (
                    isinstance(widget, dict)
                    and widget.get("id") is not None
                    and int(widget["id"]) == viz_id
                )
            ]
            result[section_id] = kept
        return result

    if isinstance(gridster, list):
        return [
            widget
            for widget in gridster
            if not (
                isinstance(widget, dict)
                and widget.get("id") is not None
                and int(widget["id"]) == viz_id
            )
        ]

    return gridster


def remove_viz_from_dashboard_template(
    db: Session,
    dashboard_id: int,
    viz_id: int,
) -> None:
    """Scrub deleted visualization widgets from the dashboard gridster template."""
    dashboard = _assert_dashboard_exists(db, dashboard_id)
    if not dashboard.template_id:
        return

    template = (
        db.query(DashboardTemplate)
        .filter(
            DashboardTemplate.id == dashboard.template_id,
            DashboardTemplate.dashboard_id == dashboard_id,
        )
        .first()
    )
    if not template or not template.gridster:
        return

    parsed = parse_json_field(template.gridster)
    if parsed is None:
        return

    updated = remove_viz_from_gridster(parsed, viz_id)
    if updated == parsed:
        return

    template.gridster = serialize_json_column(updated)
    db.flush()
