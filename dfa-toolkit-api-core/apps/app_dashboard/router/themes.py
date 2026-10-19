"""Dashboard theme routes (header/footer) — /dash/themes"""
from fastapi import APIRouter, Body, Depends, Path
from sqlalchemy.orm import Session

from apps.app_dashboard.schemas.theme import ThemeCreateRequest, ThemePatchRequest
from apps.app_dashboard.services.theme_service import (
    copy_theme,
    create_theme,
    delete_theme,
    get_theme,
    list_themes,
    update_theme,
)
from apps.app_db.dependencies import get_current_user_id
from apps.shared.config.dependencies import get_db
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import created_response, no_content_response, success_response

router = APIRouter(prefix="/dash/themes", tags=["Dashboard - Themes"])


@router.get(
    "",
    response_model=SuccessResponse,
    summary="List themes",
    description=(
        "Return header/footer themes owned by the current user "
        "(legacy service 223 getHeaderFooterList)."
    ),
)
def list_themes_endpoint(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    items = list_themes(db, user_id)
    return success_response(
        message="Themes retrieved successfully",
        data=[item.model_dump(mode="json", exclude_none=True) for item in items],
    )


@router.post(
    "",
    response_model=SuccessResponse,
    status_code=201,
    summary="Create theme",
    description=(
        "Create a header/footer theme for the current user "
        "(legacy service 229 saveHeaderFooter create). "
        "theme_name must be unique per user."
    ),
    responses={
        409: {"description": "Theme name already exists for this user", "model": ErrorResponse},
    },
)
def create_theme_endpoint(
    payload: ThemeCreateRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    item = create_theme(db, payload, user_id)
    return created_response(
        message="Theme created successfully",
        data=item.model_dump(mode="json", exclude_none=True),
    )


@router.get(
    "/{theme_id}",
    response_model=SuccessResponse,
    summary="Get theme",
    description="Return a header/footer theme by id (legacy service 224).",
    responses={
        404: {"description": "Theme not found", "model": ErrorResponse},
    },
)
def get_theme_endpoint(
    theme_id: int = Path(..., description="Theme primary key"),
    db: Session = Depends(get_db),
):
    item = get_theme(db, theme_id)
    return success_response(
        message="Theme retrieved successfully",
        data=item.model_dump(mode="json", exclude_none=True),
    )


@router.post(
    "/{theme_id}/copy",
    response_model=SuccessResponse,
    status_code=201,
    summary="Copy theme",
    description=(
        "Clone a theme for the current user (legacy service 228). "
        "New name is `{theme_name}-Copy`; owned by the current user."
    ),
    responses={
        404: {"description": "Theme not found", "model": ErrorResponse},
        409: {"description": "Copied theme name already exists for this user", "model": ErrorResponse},
    },
)
def copy_theme_endpoint(
    theme_id: int = Path(..., description="Source theme primary key"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    item = copy_theme(db, theme_id, user_id)
    return created_response(
        message="Theme copied successfully",
        data=item.model_dump(mode="json", exclude_none=True),
    )


@router.patch(
    "/{theme_id}",
    response_model=SuccessResponse,
    summary="Update theme",
    description=(
        "Partially update a header/footer theme by id "
        "(legacy service 229 saveHeaderFooter update). "
        "Any caller with IAM PERMISSION may update any theme."
    ),
    responses={
        404: {"description": "Theme not found", "model": ErrorResponse},
        409: {"description": "Theme name already exists for the theme owner", "model": ErrorResponse},
    },
)
def update_theme_endpoint(
    theme_id: int = Path(..., description="Theme primary key"),
    payload: ThemePatchRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    item = update_theme(db, theme_id, payload, user_id)
    return success_response(
        message="Theme updated successfully",
        data=item.model_dump(mode="json", exclude_none=True),
    )


@router.delete(
    "/{theme_id}",
    status_code=204,
    summary="Delete theme",
    description=(
        "Hard-delete a header/footer theme (legacy service 227). "
        "Dashboards that previously applied this theme keep their copied HTML."
    ),
    responses={
        404: {"description": "Theme not found", "model": ErrorResponse},
    },
)
def delete_theme_endpoint(
    theme_id: int = Path(..., description="Theme primary key"),
    db: Session = Depends(get_db),
):
    delete_theme(db, theme_id)
    return no_content_response()
