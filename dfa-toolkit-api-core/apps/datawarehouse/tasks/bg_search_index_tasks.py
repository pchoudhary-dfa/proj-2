"""
Background task for syncing (create + populate) DW search tables.
"""
import logging

from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SOURCE = "apps.datawarehouse.tasks.bg_search_index_tasks"


def _run_sync_search_index(dw_id: str) -> dict:
    """
    Core logic: ensure search tables exist, then run a full index build.
    Shared between Celery task and DB-mode handler.

    Two-phase approach avoids MySQL error 1412 (table definition changed):
    Phase 1 checks/creates tables, then closes the session.
    Phase 2 opens a fresh session for the index build.
    """
    from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
    from apps.datawarehouse.services.search_index.search_index_builder import (
        SearchIndexBuilderService,
    )
    from apps.datawarehouse.services.search_index.search_tables import ensure_search_tables

    ensure_result = ensure_search_tables(dw_id)
    if not ensure_result.get("success"):
        raise RuntimeError(
            ensure_result.get("message") or "Failed to ensure search tables exist"
        )
    tables_created = ensure_result.get("tables_created", False)

    # Phase 2: fresh session for the index build
    logger.info("Building search index for dw_id=%s", dw_id)
    with get_warehouse_session_from_id(dw_id) as dw_db:
        builder = SearchIndexBuilderService()
        result = builder.build(dw_db, batch_size=1000, commit=True)
    logger.info("Search index built for dw_id=%s: %s", dw_id, result)

    return {"success": True, "dw_id": dw_id, "tables_created": tables_created}


@celery_app.task(bind=True, name="apps.datawarehouse.tasks.bg_search_index_tasks.sync_search_index_task")
def sync_search_index_task(self, dw_id: str):
    """Celery task: sync search index for a data warehouse."""
    try:
        with bg_job_dw_audit_context(dw_route_id=dw_id):
            return _run_sync_search_index(dw_id)
    except Exception as e:
        log_background_incident(
            message=f"Error in sync_search_index_task: {e}",
            error_code="SYNC_SEARCH_INDEX_TASK_FAILED",
            exc=e,
            source=_SOURCE,
        )
        self.retry(countdown=60, max_retries=2)
        raise
