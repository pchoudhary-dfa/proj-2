"""
Redis cache utility for GET master APIs (e.g. indicator list, indicator by id).
When REDIS_URL is not set, cache is disabled (get returns None, set is no-op).
"""
import json
import logging
from typing import Any, Optional

from apps.shared.config.config import settings
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)

_redis_client = None


def _get_redis():
    """Lazy-init Redis client. Returns None if REDIS_URL not set."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not (getattr(settings, "REDIS_URL", None) or "").strip():
        return None
    try:
        import redis as redis_lib
        client = redis_lib.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
        client.ping()
        _redis_client = client
        return _redis_client
    except ImportError:
        logger.warning("Redis package not installed. Caching disabled.")
        _redis_client = False  # mark as attempted
        return None
    except Exception as e:
        logger.warning("Redis not available: %s. Caching disabled.", e)
        _redis_client = False  # mark as attempted
        return None


def cache_get(key: str) -> Optional[Any]:
    """
    Get value from cache. Returns None if cache disabled, key missing, or error.
    Value is expected to be JSON-serializable (stored as JSON string).
    """
    client = _get_redis()
    if client is None:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.debug("Cache get failed for key %s: %s", key, e)
        return None


def cache_set(key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
    """
    Set value in cache. No-op if cache disabled or on error.
    Value must be JSON-serializable.
    """
    client = _get_redis()
    if client is None:
        return
    ttl = ttl_seconds if ttl_seconds is not None else getattr(settings, "CACHE_INDICATOR_TTL_SECONDS", 300)
    try:
        client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.debug("Cache set failed for key %s: %s", key, e)


def cache_delete_pattern(pattern: str) -> None:
    """
    Delete all keys matching pattern (e.g. "dw:indicators:*"). No-op if cache disabled.
    Use sparingly; prefer explicit keys when possible.
    """
    client = _get_redis()
    if client is None:
        return
    try:
        keys = list(client.scan_iter(match=pattern, count=100))
        if keys:
            client.delete(*keys)
    except Exception as e:
        logger.debug("Cache delete pattern failed for %s: %s", pattern, e)


def cache_flush_all() -> tuple[bool, str]:
    """
    Flush all keys in the current Redis database (FLUSHDB).
    Returns (success, message). If Redis is disabled, returns (True, "Cache is disabled").
    """
    client = _get_redis()
    if client is None:
        return True, "Cache is disabled; nothing to clear."
    try:
        client.flushdb()
        logger.info("Redis cache flushed successfully.")
        return True, "Redis cache cleared successfully."
    except Exception as e:
        log_background_incident(
            f"Redis flush failed: {e}",
            error_code="REDIS_FLUSH_FAILED",
            exc=e,
            source="apps.shared.utils.cache",
        )
        return False, str(e)
