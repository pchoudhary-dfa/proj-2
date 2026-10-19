"""
Shared utility for detecting database connection errors.
"""

from typing import Set

# Celery / AMQP / Redis clients also raise "connection refused"; do not treat as SQL warehouse errors.
_NON_DB_EXCEPTION_MODULES: Set[str] = {
    "kombu",
    "celery",
    "amqp",
    "billiard",
    "vine",
    "redis",
    "redis.exceptions",
}


def _is_non_db_broker_exception(exc: BaseException) -> bool:
    mod = getattr(type(exc), "__module__", "") or ""
    return any(mod == m or mod.startswith(m + ".") for m in _NON_DB_EXCEPTION_MODULES)


def is_connection_error(exc: BaseException) -> bool:
    """
    True if the exception is a MySQL/server connection failure (e.g. 2003, 111).

    Excludes message-queue / Celery / Redis client errors that also mention "connection refused".

    Args:
        exc: Exception to check

    Returns:
        bool: True if this appears to be a connection error
    """
    if _is_non_db_broker_exception(exc):
        return False
    msg = str(exc).lower()
    if "2003" in msg or "111" in msg or "connection refused" in msg or "can't connect" in msg:
        return True
    orig = getattr(exc, "orig", None)
    if orig is not None:
        return is_connection_error(orig)
    return False