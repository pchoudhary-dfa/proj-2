"""Dashboard template routes — /dash/{dashboard_id}/template"""
from fastapi import APIRouter, Body, Depends, Path
from sqlalchemy.orm import Session

from apps.app_dashboard.schemas.template import TemplateResponse, TemplateUpdateRequest
from apps.app_dashboard.services.template_service import get_template, update_template
from apps.app_db.dependencies import get_current_user_id
from apps.shared.config.dependencies import get_db
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import success_response

router = APIRouter(prefix="/dash", tags=["Dashboard - Templates"])


@router.get(
    "/{dashboard_id}/template",
    response_model=SuccessResponse,
    summary="Get dashboard template",
    description=(
        "Return the gridster layout template for a dashboard (legacy service 111). "
        "Parses gridster and global_filter_gridster JSON; normalizes empty list "
        "gridster to an empty object for design-canvas parity."
    ),
    responses={
        404: {"description": "Dashboard or template not found", "model": ErrorResponse},
    },
)
def get_dashboard_template(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    db: Session = Depends(get_db),
):
    item = get_template(db, dashboard_id)
    return success_response(
        message="Template retrieved successfully",
        data=item.model_dump(exclude_none=True),
    )


@router.put(
    "/{dashboard_id}/template",
    response_model=SuccessResponse,
    summary="Update dashboard template",
    description=(
        "Replace dashboard canvas layout JSON (legacy service 112 setTemplateGridster). "
        "gridster is always replaced. global_filter_gridster is replaced only when "
        "provided in the request body."
    ),
    responses={
        404: {"description": "Dashboard or template not found", "model": ErrorResponse},
    },
)
def update_dashboard_template(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    payload: TemplateUpdateRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    item = update_template(db, dashboard_id, payload, user_id)
    return success_response(
        message="Template updated successfully",
        data=item.model_dump(exclude_none=True),
    )
