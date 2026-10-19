"""
Background tasks for subgroup operations.
"""
import logging
from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context
from apps.datawarehouse.services.sg_vals import SgValsService
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_BG_SUBGROUP_TASKS_SOURCE = "apps.datawarehouse.tasks.bg_subgroup_tasks"


@celery_app.task(bind=True, name="apps.datawarehouse.tasks.bg_subgroup_tasks.update_subgroup_names_task")
def update_subgroup_names_task(self, dw_id: str, category_nid: int = None, category_value_nid: int = None, language_code: str = "en"):
    """
    Background task to update subgroup names when a category's order changes.
    
    Args:
        dw_id: Data warehouse identifier
        category_nid: The subgroup category (type) nid that had its order changed (NEW)
        category_value_nid: Individual subgroup_nid (DEPRECATED - kept for backward compatibility)
        language_code: Language for name generation
        
    Returns:
        dict: Task result with success status and update counts
    """
    try:
        with bg_job_dw_audit_context(dw_route_id=dw_id):
            if category_nid:
                # NEW: Handle category-level updates (rename all affected subgroups)
                logger.info(f"Starting subgroup name update for category dw_id={dw_id}, category_nid={category_nid}")
                service = SgValsService()
                result = service.update_subgroups_for_category_order_change(dw_id, category_nid, language_code)
            elif category_value_nid:
                # DEPRECATED: Handle individual value updates (backward compatibility)
                logger.info(f"Starting subgroup name update for value dw_id={dw_id}, category_value_nid={category_value_nid}")
                service = SgValsService()
                result = service.update_affected_subgroup_names(dw_id, category_value_nid, language_code)
            else:
                raise ValueError("Either category_nid or category_value_nid must be provided")

            logger.info(f"Completed subgroup name update: {result['updated_count']} subgroups updated")

            return {
                "success": True,
                "updated_count": result.get("updated_count", 0),
                "affected_subgroups": result.get("affected_subgroups", [])
            }
    except Exception as e:
        log_background_incident(
            message=f"Error in subgroup name update task: {e}",
            error_code="SUBGROUP_NAMES_UPDATE_TASK_FAILED",
            exc=e,
            source=_BG_SUBGROUP_TASKS_SOURCE,
        )
        # Retry with exponential backoff
        self.retry(countdown=60, max_retries=3)
        raise