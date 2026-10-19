"""Dashboard visualization CRUD routes — /dash/{dashboard_id}/vis"""
from typing import Optional

from fastapi import APIRouter, Body, Depends, Path, Query
from sqlalchemy.orm import Session

from apps.app_dashboard.schemas.visualization import (
    VisualizationCopyRequest,
    VisualizationCreateRequest,
    VisualizationPatchRequest,
)
from apps.app_dashboard.services.visualization_service import (
    copy_visualization,
    create_visualization,
    delete_visualization,
    get_visualization,
    list_visualizations,
    update_visualization,
)
from apps.app_db.dependencies import get_current_user_id
from apps.shared.config.dependencies import get_db
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.pagination_meta import build_list_pagination_meta
from apps.shared.utils.response import (
    created_response,
    no_content_response,
    success_response,
)

router = APIRouter(prefix="/dash", tags=["Dashboard - Visualizations"])


@router.get(
    "/{dashboard_id}/vis",
    response_model=SuccessResponse,
    summary="List dashboard visualizations",
    description=(
        "Return all non-deleted visualizations belonging to a dashboard. "
        "Supports filtering by type and category, and pagination."
    ),
    responses={
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def list_dashboard_visualizations(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    type: Optional[str] = Query(None, description="Filter by visualization type (e.g. bar, pie, html)"),
    category: Optional[str] = Query(None, description="Filter by category (chart or custom)"),
    db: Session = Depends(get_db),
):
    items, total_count = list_visualizations(
        db,
        dashboard_id,
        page=page,
        page_size=page_size,
        type_filter=type,
        category_filter=category,
    )
    total_pages = (total_count + page_size - 1) // page_size if total_count else 0
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(items),
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
    return success_response(
        message="Visualizations retrieved successfully",
        data=[item.model_dump(exclude_none=True) for item in items],
        meta=meta,
    )


@router.get(
    "/{dashboard_id}/vis/{viz_id}",
    response_model=SuccessResponse,
    summary="Get visualization detail",
    description="Return full visualization including chart configuration and data dimensions.",
    responses={
        404: {"description": "Dashboard or visualization not found", "model": ErrorResponse},
    },
)
def get_dashboard_visualization(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    viz_id: int = Path(..., description="Visualization primary key"),
    db: Session = Depends(get_db),
):
    detail = get_visualization(db, dashboard_id, viz_id)
    return success_response(
        message="Visualization retrieved successfully",
        data=detail.model_dump(exclude_none=True),
    )


@router.post(
    "/{dashboard_id}/vis",
    response_model=SuccessResponse,
    status_code=201,
    summary="Create visualization",
    description=(
        "Create a new visualization scoped to a dashboard. "
        "Only name and type are required; chart_variant, properties, and "
        "data_cube_info can be provided for initial configuration."
    ),
    responses={
        201: {"description": "Visualization created successfully"},
        400: {"description": "Invalid visualization type", "model": ErrorResponse},
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def create_dashboard_visualization(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    payload: VisualizationCreateRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    viz = create_visualization(db, dashboard_id, payload, user_id)
    detail = get_visualization(db, dashboard_id, viz.id)
    return created_response(
        message="Visualization created successfully",
        data=detail.model_dump(exclude_none=True),
    )


@router.post(
    "/{dashboard_id}/vis/{viz_id}/copy",
    response_model=SuccessResponse,
    status_code=201,
    summary="Copy visualization",
    description=(
        "Copy a visualization into one or more edit-mode dashboards (legacy service 222). "
        "Copies type, chart_variant, category, properties, data_cube_info, and explore flags. "
        "New copies are not placed on the canvas (is_used_in_layout=false). "
        "Omit target_dashboard_ids (or pass empty) to copy into the source dashboard. "
        "Default name is '{original} - Copy'."
    ),
    responses={
        201: {"description": "Visualization copied successfully"},
        400: {
            "description": "Target dashboard is not edit-mode",
            "model": ErrorResponse,
        },
        404: {
            "description": "Source visualization or target dashboard not found",
            "model": ErrorResponse,
        },
    },
)
def copy_dashboard_visualization(
    dashboard_id: int = Path(..., description="Source dashboard primary key"),
    viz_id: int = Path(..., description="Source visualization primary key"),
    payload: VisualizationCopyRequest | None = Body(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    result = copy_visualization(
        db,
        dashboard_id,
        viz_id,
        payload or VisualizationCopyRequest(),
        user_id,
    )
    return created_response(
        message="Visualization copied successfully",
        data=result.model_dump(exclude_none=True),
    )


@router.patch(
    "/{dashboard_id}/vis/{viz_id}",
    response_model=SuccessResponse,
    summary="Update visualization",
    description=(
        "Partially update a visualization. Only provided fields are changed. "
        "properties and data_cube_info are full replacements when provided."
    ),
    responses={
        400: {"description": "Invalid visualization type", "model": ErrorResponse},
        404: {"description": "Dashboard or visualization not found", "model": ErrorResponse},
    },
)
def update_dashboard_visualization(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    viz_id: int = Path(..., description="Visualization primary key"),
    payload: VisualizationPatchRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    update_visualization(db, dashboard_id, viz_id, payload, user_id)
    detail = get_visualization(db, dashboard_id, viz_id)
    return success_response(
        message="Visualization updated successfully",
        data=detail.model_dump(exclude_none=True),
    )


@router.delete(
    "/{dashboard_id}/vis/{viz_id}",
    status_code=204,
    summary="Delete visualization",
    description="Hard-delete a visualization. FK cascades remove related AI analyses.",
    responses={
        204: {"description": "Visualization deleted successfully"},
        404: {"description": "Dashboard or visualization not found", "model": ErrorResponse},
    },
)
def delete_dashboard_visualization(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    viz_id: int = Path(..., description="Visualization primary key"),
    db: Session = Depends(get_db),
):
    delete_visualization(db, dashboard_id, viz_id)
    return no_content_response()
