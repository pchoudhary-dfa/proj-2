"""
AI chart insights — POST /dw/{dw_id}/insights (OpenAI).
Supports both standard JSON responses and SSE streaming.
"""
from typing import Any, Optional

from fastapi import APIRouter, Body, Path, status
from fastapi.responses import StreamingResponse

from apps.app_db.schemas.insights import InsightsRequestSchema
from apps.shared.assets.insights.orchestrator import analyze_insights, stream_insights
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import success_response

router = APIRouter(prefix="/dw", tags=["Insights"])


async def _sse_generator(body: dict[str, Any]):
    """Wraps stream_insights() into SSE wire format: `data: ...\n\n`.

    The try/finally ensures the chunked HTTP body is always terminated: if
    stream_insights already yielded '[DONE]' via its own finally block this is
    a no-op, but if the generator is abandoned mid-stream (e.g. uvicorn
    forcibly closes the connection) we still attempt a clean close.
    """
    async for chunk in stream_insights(body):
        yield f"data: {chunk}\n\n"


@router.post(
    "/{dw_id}/insights",
    summary="Generate AI insights for chart data",
    description=(
        "Runs sanitize → prompt build → OpenAI for datawarehouse-specific insights. "
        "Requires AI_API_KEY (and AI_PROVIDER) in the warehouse db_configuration for this dw_id. "
        "IAM access: APP_CLIENT (no user login required). "
        "Pass stream=true for SSE (text/event-stream) response."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Insights generated", "model": SuccessResponse},
        400: {"description": "Bad request", "model": ErrorResponse},
        502: {"description": "Provider failure", "model": ErrorResponse},
        503: {"description": "API key not configured", "model": ErrorResponse},
    },
)
async def post_insights(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    payload: InsightsRequestSchema = Body(...)
):
    body = payload.model_dump()
    body["dw_id"] = dw_id

    if payload.stream:
        return StreamingResponse(
            _sse_generator(body),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    result = await analyze_insights(body)
    return success_response(
        message="Insights generated successfully",
        data=result,
    )
