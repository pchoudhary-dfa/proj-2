"""
Cache management API (e.g. clear Redis cache).
"""
from fastapi import APIRouter

from apps.shared.exceptions import InternalError
from apps.shared.utils.cache import cache_flush_all
from apps.shared.utils.response import success_response

router = APIRouter(prefix="/cache", tags=["Cache"])


@router.post(
    "/clear",
    summary="Clear all Redis cache",
    description="Flush all keys in the current Redis database used by this application. "
    "If REDIS_URL is not set, cache is disabled and this endpoint returns success with a message.",
    response_description="Success or error result of the cache clear operation",
)
async def clear_cache():
    """
    Clear all Redis cache (FLUSHDB on the current DB).
    Use this to invalidate all cached GET responses (indicators, areas, etc.) after bulk updates or when debugging.
    """
    success, message = cache_flush_all()
    if success:
        return success_response(
            message=message,
            data={"cleared": True},
        )
    raise InternalError(
        message,
        error_code="CACHE_FLUSH_FAILED",
        details={"service": "cache"},
    )
