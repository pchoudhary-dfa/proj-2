"""AI analysis routes — /dash/analyses and /dash/{dashboard_id}/vis/{gallery_id}/ai-analyze"""
from fastapi import APIRouter, Query

from apps.shared.schemas.response import SuccessResponse

router = APIRouter(prefix="/dash", tags=["Dashboard - AI Analysis"])


@router.get("/analyses", response_model=SuccessResponse, summary="List AI analyses")
async def list_analyses(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    raise NotImplementedError


@router.post(
    "/{dashboard_id}/vis/{gallery_id}/ai-analyze",
    response_model=SuccessResponse,
    summary="Run AI analysis on a visualization",
)
async def run_ai_analysis(
    dashboard_id: int,
    gallery_id: int,
    stream: bool = Query(False),
):
    raise NotImplementedError
