"""Dashboard section routes — /dash/{dashboard_id}/sections"""
from fastapi import APIRouter, Body, Depends, Path
from sqlalchemy.orm import Session

from apps.app_dashboard.schemas.section import (
    SectionBulkUpdateRequest,
    SectionCreateRequest,
    SectionPatchRequest,
)
from apps.app_dashboard.services.section_service import (
    bulk_update_sections,
    create_section,
    delete_section,
    list_sections,
    update_section,
)
from apps.app_db.dependencies import get_current_user_id
from apps.shared.config.dependencies import get_db
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import (
    created_response,
    no_content_response,
    success_response,
)

router = APIRouter(prefix="/dash", tags=["Dashboard - Sections"])


@router.get(
    "/{dashboard_id}/sections",
    response_model=SuccessResponse,
    summary="List sections",
    description=(
        "Return all layout sections for a dashboard, ordered by display order. "
        "section_name is returned as a parsed i18n object when stored as JSON."
    ),
    responses={
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def list_dashboard_sections(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    db: Session = Depends(get_db),
):
    items = list_sections(db, dashboard_id)
    return success_response(
        message="Sections retrieved successfully",
        data=[item.model_dump(exclude_none=True) for item in items],
    )


@router.post(
    "/{dashboard_id}/sections",
    response_model=SuccessResponse,
    status_code=201,
    summary="Create section",
    description=(
        "Create a new layout section. When section_name is omitted, defaults to "
        "'Section N' expanded across all warehouse languages. Order defaults to "
        "max existing order + 1."
    ),
    responses={
        201: {"description": "Section created successfully"},
        400: {"description": "Invalid request", "model": ErrorResponse},
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def create_dashboard_section(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    payload: SectionCreateRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    item = create_section(db, dashboard_id, payload, user_id)
    return created_response(
        message="Section created successfully",
        data=item.model_dump(exclude_none=True),
    )


@router.put(
    "/{dashboard_id}/sections/bulk",
    response_model=SuccessResponse,
    summary="Bulk update sections",
    description=(
        "Batch-update section names, order, hide_global_filter, reload_section, "
        "and resolution (legacy section management modal save)."
    ),
    responses={
        400: {"description": "Invalid request", "model": ErrorResponse},
        404: {"description": "Dashboard or section not found", "model": ErrorResponse},
    },
)
def bulk_update_dashboard_sections(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    payload: SectionBulkUpdateRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    items = bulk_update_sections(db, dashboard_id, payload, user_id)
    return success_response(
        message="Sections updated successfully",
        data=[item.model_dump(exclude_none=True) for item in items],
    )


@router.patch(
    "/{dashboard_id}/sections/{section_id}",
    response_model=SuccessResponse,
    summary="Update section",
    description="Partially update a single dashboard section.",
    responses={
        400: {"description": "Invalid request", "model": ErrorResponse},
        404: {"description": "Dashboard or section not found", "model": ErrorResponse},
    },
)
def update_dashboard_section(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    section_id: int = Path(..., description="Section primary key"),
    payload: SectionPatchRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    item = update_section(db, dashboard_id, section_id, payload, user_id)
    return success_response(
        message="Section updated successfully",
        data=item.model_dump(exclude_none=True),
    )


@router.delete(
    "/{dashboard_id}/sections/{section_id}",
    status_code=204,
    summary="Delete section",
    description=(
        "Delete a dashboard section row. Does not modify template gridster or "
        "visualization layout flags (legacy parity)."
    ),
    responses={
        204: {"description": "Section deleted successfully"},
        404: {"description": "Dashboard or section not found", "model": ErrorResponse},
    },
)
def delete_dashboard_section(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    section_id: int = Path(..., description="Section primary key"),
    db: Session = Depends(get_db),
):
    delete_section(db, dashboard_id, section_id)
    return no_content_response()
