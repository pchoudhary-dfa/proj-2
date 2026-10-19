"""
Persistent ProcessPoolExecutor for parallel XLSX export.

Initialized once at application startup (main.py lifespan) and reused
across requests. Workers run in separate processes — no shared sessions,
no shared DB connections.

Pool size is configured via the EXPORT_POOL_SIZE environment variable
(default: 1). ``max_tasks_per_child=1`` recycles each worker after one
export chunk so RSS does not grow across successive API calls.

Cross-OS note: Python's ProcessPoolExecutor uses "spawn" on Windows and
"fork" on Linux/macOS. The worker module (xlsx_export_worker.py) has no
module-level side effects so it is safe under both start methods.
"""
from __future__ import annotations

import logging
import os
from concurrent.futures import ProcessPoolExecutor
from typing import Optional

logger = logging.getLogger(__name__)

_pool: Optional[ProcessPoolExecutor] = None

# Recycle worker subprocess after each XLSX chunk so memory is returned to the OS.
_MAX_TASKS_PER_CHILD = 1


def init_export_pool(pool_size: Optional[int] = None) -> None:
    """
    Create the global ProcessPoolExecutor.
    Call once from the application lifespan on startup.
    Safe to call again — reinitialises the pool if already set.
    """
    global _pool
    if _pool is not None:
        _pool.shutdown(wait=False, cancel_futures=True)

    size = pool_size if pool_size is not None else int(os.getenv("EXPORT_POOL_SIZE", "1"))
    size = max(1, size)
    _pool = ProcessPoolExecutor(
        max_workers=size,
        max_tasks_per_child=_MAX_TASKS_PER_CHILD,
    )
    logger.info(
        "Export pool initialised with %d worker(s), max_tasks_per_child=%d",
        size,
        _MAX_TASKS_PER_CHILD,
    )


def get_export_pool() -> ProcessPoolExecutor:
    """Return the active pool. Raises RuntimeError if not yet initialised."""
    if _pool is None:
        raise RuntimeError(
            "Export pool has not been initialised. "
            "Call init_export_pool() during application startup."
        )
    return _pool


def shutdown_export_pool() -> None:
    """Gracefully shut down the pool. Call from application lifespan on shutdown."""
    global _pool
    if _pool is not None:
        _pool.shutdown(wait=True, cancel_futures=False)
        _pool = None
        logger.info("Export pool shut down")
