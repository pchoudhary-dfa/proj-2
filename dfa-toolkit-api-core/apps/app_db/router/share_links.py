"""
Share Links API: create and resolve short share-link codes for visualizer share/embed URLs.
Access control is enforced by AccessControlMiddleware:
  POST /share-links  -> APP_CLIENT (API key + signature required)
  GET  /share-links/… -> PUBLIC
"""

from fastapi import APIRouter, Depends, Path, status

from apps.app_db.dependencies import get_app_key
from apps.app_db.schemas.share_link import ShareLinkCreatePayload, ShareLinkResponse
from apps.app_db.services.share_link_service import ShareLinkService
from apps.shared.exceptions import InternalError, NotFound
from apps.shared.schemas.response import SuccessResponse, ErrorResponse
from apps.shared.utils.response import (
    success_response,
    created_response,
)

router = APIRouter(prefix="/share-links", tags=["Share Links"])
service = ShareLinkService()


@router.post(
    "",
    summary="Create a short share link",
    description="Persist visualization state (fetchParams + chartConfig) and return a short code.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Share link created", "model": SuccessResponse},
        400: {"description": "Bad request", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_share_link(
    payload: ShareLinkCreatePayload,
    app_key: str = Depends(get_app_key),
):
    try:
        code = service.create(
            fetch_params=payload.fetchParams,
            chart_config=payload.chartConfig,
            app_key=app_key,
            dw_id=payload.dw_id,
        )
        return created_response(
            message="Share link created successfully",
            data={"code": code},
        )
    except Exception as e:
        raise InternalError(f"Failed to create share link: {e}") from e


@router.get(
    "/{code}",
    summary="Resolve a short share link",
    description="Return the visualization state (fetchParams + chartConfig) for a given code.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Share link resolved", "model": SuccessResponse},
        404: {"description": "Share link not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_share_link(
    code: str = Path(..., min_length=1, max_length=16, description="Share link code"),
):
    try:
        data = service.get_by_code(code)
        if not data:
            raise NotFound(f"Share link identifier {code} not found", identifier=str(code))
        return success_response(message="Share link resolved successfully", data=data)
    except NotFound:
        raise
    except Exception as e:
        raise InternalError(f"Failed to resolve share link: {e}") from e
