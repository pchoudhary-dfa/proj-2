"""Visualization service — CRUD business logic for dashboard visualizations."""

from __future__ import annotations

import json
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from apps.app_dashboard.constants import (
    DASHBOARD_MODE_EDIT,
    VISUALIZATION_ALL_TYPES,
    VISUALIZATION_CATEGORY_CHART,
    VISUALIZATION_CATEGORY_CUSTOM,
    VISUALIZATION_CHART_TYPES,
    FILTER_TYPE,
    FILTER_CATEGORY,
)
from apps.app_dashboard.models.dashboard import Dashboard, DashVisualization
from apps.app_dashboard.schemas.visualization import (
    VisualizationCopyItem,
    VisualizationCopyRequest,
    VisualizationCopyResponse,
    VisualizationCreateRequest,
    VisualizationDetail,
    VisualizationListItem,
    VisualizationPatchRequest,
    ViewerVisualization,
)
from apps.app_dashboard.utils.dashboard_serialization import bool_from_smallint
from apps.app_db.models.core import SystemDatawarehouse
from apps.shared.exceptions import BadRequest, NotFound


def _resolve_category(viz_type: str) -> str:
    """Derive category from visualization type."""
    if viz_type in VISUALIZATION_CHART_TYPES:
        return VISUALIZATION_CATEGORY_CHART
    if viz_type in FILTER_TYPE:
        return FILTER_CATEGORY
    return VISUALIZATION_CATEGORY_CUSTOM


def _validate_type(viz_type: str) -> None:
    """Ensure visualization type is a recognized value."""
    if viz_type not in VISUALIZATION_ALL_TYPES:
        raise BadRequest(
            f"Invalid visualization type '{viz_type}'. "
            f"Must be one of: {', '.join(sorted(VISUALIZATION_ALL_TYPES))}",
            error_code="INVALID_VISUALIZATION_TYPE",
        )


def _assert_dashboard_exists(db: Session, dashboard_id: int) -> Dashboard:
    """Verify dashboard exists and return it; raise NotFound otherwise."""
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise NotFound(
            f"Dashboard with id {dashboard_id} not found",
            error_code="DASHBOARD_NOT_FOUND",
        )
    return dashboard


def _get_visualization_or_404(
    db: Session, dashboard_id: int, viz_id: int
) -> DashVisualization:
    """Fetch visualization scoped to a dashboard; raise NotFound if missing."""
    viz = (
        db.query(DashVisualization)
        .filter(
            DashVisualization.id == viz_id,
            DashVisualization.dashboard_id == dashboard_id,
            DashVisualization.is_deleted == 0,
        )
        .first()
    )
    if not viz:
        raise NotFound(
            f"Visualization with id {viz_id} not found in dashboard {dashboard_id}",
            error_code="VISUALIZATION_NOT_FOUND",
        )
    return viz


def _parse_json_column(value: Optional[str]) -> Optional[dict]:
    """Safely parse a JSON LONGTEXT column value."""
    if not value:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None


def _to_list_item(viz: DashVisualization) -> VisualizationListItem:
    """Map ORM instance to list item schema."""
    return VisualizationListItem(
        id=viz.id,
        name=viz.visualization_name,
        type=viz.type,
        chart_variant=viz.chart_variant,
        category=viz.category,
        is_used_in_layout=bool(viz.is_used_in_layout),
        properties=_parse_json_column(viz.properties),
        data_cube_info=_parse_json_column(viz.data_cube_info),
        created=viz.created,
        modified=viz.modified,
    )


def _to_detail(viz: DashVisualization) -> VisualizationDetail:
    """Map ORM instance to detail schema."""
    return VisualizationDetail(
        id=viz.id,
        name=viz.visualization_name,
        type=viz.type,
        chart_variant=viz.chart_variant,
        category=viz.category,
        is_used_in_layout=bool(viz.is_used_in_layout),
        properties=_parse_json_column(viz.properties),
        data_cube_info=_parse_json_column(viz.data_cube_info),
        created=viz.created,
        modified=viz.modified,
        created_user_id=viz.created_user_id,
        modified_user_id=viz.modified_user_id,
    )


def _to_viewer_viz(
    viz: DashVisualization,
    *,
    database_type: Optional[str] = None,
) -> ViewerVisualization:
    """Map ORM instance to publish viewer bundle schema (no audit user ids)."""
    return ViewerVisualization(
        id=viz.id,
        name=viz.visualization_name,
        type=viz.type,
        chart_variant=viz.chart_variant,
        category=viz.category,
        is_used_in_layout=bool(viz.is_used_in_layout),
        system_dw_id=viz.system_dw_id,
        database_type=database_type,
        explore_enabled=bool_from_smallint(viz.explore_enabled),
        explore_da_enabled=bool_from_smallint(viz.explore_da_enabled),
        explore_qa_enabled=bool_from_smallint(viz.explore_qa_enabled),
        explore_md_enabled=bool_from_smallint(viz.explore_md_enabled),
        properties=_parse_json_column(viz.properties),
        data_cube_info=_parse_json_column(viz.data_cube_info),
        created=viz.created,
        modified=viz.modified,
    )


def _fetch_dw_types_map(
    db: Session,
    dw_ids: Iterable[int],
) -> dict[int, Optional[str]]:
    """Return db_source_type per warehouse id for viewer visualization enrichment."""
    unique_ids = {dw_id for dw_id in dw_ids if dw_id}
    if not unique_ids:
        return {}

    rows = (
        db.query(
            SystemDatawarehouse.id,
            SystemDatawarehouse.dw_connection_details,
        )
        .filter(SystemDatawarehouse.id.in_(unique_ids))
        .all()
    )

    result: dict[int, Optional[str]] = {}
    for dw_id, details in rows:
        db_type: Optional[str] = None
        if details:
            try:
                db_type = json.loads(details).get("db_source_type") or None
            except (json.JSONDecodeError, TypeError):
                db_type = None
        result[dw_id] = db_type
    return result


def list_layout_visualizations_for_viewer(
    db: Session,
    dashboard_id: int,
) -> dict[int, ViewerVisualization]:
    """
    Return full config for layout-placed visualizations on a publish dashboard.

    Unlike list_visualizations(), does not filter out mode=publish rows.
    Returns a dict keyed by visualization id (legacy vizSettings shape).
    """
    rows = (
        db.query(DashVisualization)
        .filter(
            DashVisualization.dashboard_id == dashboard_id,
            DashVisualization.is_deleted == 0,
            DashVisualization.is_used_in_layout == 1,
        )
        .order_by(DashVisualization.id.asc())
        .all()
    )
    dw_types = _fetch_dw_types_map(
        db,
        (viz.system_dw_id for viz in rows if viz.system_dw_id),
    )
    return {
        viz.id: _to_viewer_viz(
            viz,
            database_type=dw_types.get(viz.system_dw_id) if viz.system_dw_id else None,
        )
        for viz in rows
    }


def list_visualizations(
    db: Session,
    dashboard_id: int,
    *,
    page: int = 1,
    page_size: int = 50,
    type_filter: Optional[str] = None,
    category_filter: Optional[str] = None,
) -> tuple[list[VisualizationListItem], int]:
    """
    List visualizations for a dashboard.

    Returns non-deleted, edit-mode visualizations with pagination.
    """
    _assert_dashboard_exists(db, dashboard_id)

    query = db.query(DashVisualization).filter(
        DashVisualization.dashboard_id == dashboard_id,
        DashVisualization.is_deleted == 0,
        DashVisualization.mode != "publish",
    )

    if type_filter:
        query = query.filter(DashVisualization.type == type_filter)
    if category_filter:
        query = query.filter(DashVisualization.category == category_filter)

    total_count = query.count()

    rows = (
        query.order_by(DashVisualization.modified.desc(), DashVisualization.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = [_to_list_item(viz) for viz in rows]
    return items, total_count


def get_visualization(
    db: Session, dashboard_id: int, viz_id: int
) -> VisualizationDetail:
    """Get full visualization detail including config and data dimensions."""
    _assert_dashboard_exists(db, dashboard_id)
    viz = _get_visualization_or_404(db, dashboard_id, viz_id)
    return _to_detail(viz)


def create_visualization(
    db: Session,
    dashboard_id: int,
    payload: VisualizationCreateRequest,
    user_id: int,
) -> DashVisualization:
    """Create a new visualization scoped to a dashboard."""
    dashboard = _assert_dashboard_exists(db, dashboard_id)
    _validate_type(payload.type)

    viz = DashVisualization(
        visualization_name=payload.name,
        type=payload.type,
        chart_variant=payload.chart_variant,
        category=_resolve_category(payload.type),
        dashboard_id=dashboard_id,
        system_dw_id=dashboard.system_dw_id,
        properties=json.dumps(payload.properties) if payload.properties else None,
        data_cube_info=json.dumps(payload.data_cube_info) if payload.data_cube_info else None,
        mode=DASHBOARD_MODE_EDIT,
        is_deleted=0,
        is_used_in_layout=0,
        created_user_id=user_id,
        modified_user_id=user_id,
    )

    db.add(viz)
    db.flush()
    return viz


def update_visualization(
    db: Session,
    dashboard_id: int,
    viz_id: int,
    payload: VisualizationPatchRequest,
    user_id: int,
) -> DashVisualization:
    """Partially update a visualization. Only provided fields are changed."""
    _assert_dashboard_exists(db, dashboard_id)
    viz = _get_visualization_or_404(db, dashboard_id, viz_id)

    if payload.name is not None:
        viz.visualization_name = payload.name

    if payload.type is not None:
        _validate_type(payload.type)
        viz.type = payload.type
        viz.category = _resolve_category(payload.type)

    if payload.chart_variant is not None:
        viz.chart_variant = payload.chart_variant

    if payload.properties is not None:
        viz.properties = json.dumps(payload.properties)

    if payload.data_cube_info is not None:
        viz.data_cube_info = json.dumps(payload.data_cube_info)

    if payload.is_used_in_layout is not None:
        viz.is_used_in_layout = 1 if payload.is_used_in_layout else 0

    viz.modified_user_id = user_id
    db.flush()
    return viz


def delete_visualization(db: Session, dashboard_id: int, viz_id: int) -> None:
    """Hard-delete a visualization. FK cascades handle related rows (dash_analyses)."""
    from apps.app_dashboard.services.template_service import remove_viz_from_dashboard_template

    _assert_dashboard_exists(db, dashboard_id)
    viz = _get_visualization_or_404(db, dashboard_id, viz_id)
    remove_viz_from_dashboard_template(db, dashboard_id, viz_id)
    db.delete(viz)
    db.flush()


def copy_visualization(
    db: Session,
    dashboard_id: int,
    viz_id: int,
    payload: VisualizationCopyRequest,
    user_id: int,
) -> VisualizationCopyResponse:
    """
    Copy a visualization into one or more edit-mode dashboards (legacy service 222).

    Creates new rows with the source config; does not place them on the canvas
    (is_used_in_layout=0). Target dashboards must exist and be mode=edit.
    """
    _assert_dashboard_exists(db, dashboard_id)
    source = _get_visualization_or_404(db, dashboard_id, viz_id)

    copy_name = (payload.name or "").strip() or f"{source.visualization_name} - Copy"
    target_ids = list(dict.fromkeys(payload.target_dashboard_ids or []))
    if not target_ids:
        target_ids = [dashboard_id]

    targets: list[Dashboard] = []
    for target_id in target_ids:
        target = _assert_dashboard_exists(db, target_id)
        if target.mode != DASHBOARD_MODE_EDIT:
            raise BadRequest(
                "target_dashboard_ids must refer to edit-mode dashboards",
                error_code="DASHBOARD_NOT_EDIT_MODE",
                details={"dashboard_id": target_id, "mode": target.mode},
            )
        targets.append(target)

    copies: list[VisualizationCopyItem] = []
    for target in targets:
        new_viz = DashVisualization(
            visualization_name=copy_name,
            type=source.type,
            chart_variant=source.chart_variant,
            category=source.category or (
                _resolve_category(source.type) if source.type else None
            ),
            dashboard_id=target.id,
            system_dw_id=target.system_dw_id,
            properties=source.properties,
            data_cube_info=source.data_cube_info,
            explore_enabled=source.explore_enabled if source.explore_enabled is not None else 1,
            explore_da_enabled=(
                source.explore_da_enabled if source.explore_da_enabled is not None else 1
            ),
            explore_qa_enabled=(
                source.explore_qa_enabled if source.explore_qa_enabled is not None else 1
            ),
            explore_md_enabled=(
                source.explore_md_enabled if source.explore_md_enabled is not None else 1
            ),
            mode=DASHBOARD_MODE_EDIT,
            source_viz_id=source.id,
            is_deleted=0,
            is_used_in_layout=0,
            created_user_id=user_id,
            modified_user_id=user_id,
        )
        db.add(new_viz)
        db.flush()
        copies.append(
            VisualizationCopyItem(
                dashboard_id=target.id,
                id=new_viz.id,
                name=new_viz.visualization_name,
                system_dw_id=new_viz.system_dw_id,
                is_used_in_layout=False,
            )
        )

    return VisualizationCopyResponse(source_viz_id=source.id, copies=copies)
