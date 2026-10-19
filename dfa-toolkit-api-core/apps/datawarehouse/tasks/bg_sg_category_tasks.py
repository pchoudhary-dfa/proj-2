"""
Celery task: full cascade delete of a subgroup category (ut_subgroup_type + dependents).
Queue: CELERY_QUEUE_NAME_SUBGROUP_UPDATE (same as subgroup category value delete).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context
from apps.datawarehouse.services.sg_category import SgCategoryService
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SOURCE = "apps.datawarehouse.tasks.bg_sg_category_tasks"


@celery_app.task(
    bind=True,
    name="apps.datawarehouse.tasks.bg_sg_category_tasks.delete_sg_category_task",
)
def delete_sg_category_task(
    self: Any,
    dw_id: str,
    sg_category_identifier: str,
    sg_cat_nid: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Run full subgroup category delete in the background.

    No Celery retries: ValueError cases (not found, system category/values) are permanent failures.
    """
    try:
        with bg_job_dw_audit_context(dw_route_id=dw_id):
            logger.info(
                "delete_sg_category_task start dw_id=%s sg_category_identifier=%s sg_cat_nid=%s",
                dw_id,
                sg_category_identifier,
                sg_cat_nid,
            )
            service = SgCategoryService()
            result = service.run_delete_sg_category_job(dw_id, sg_category_identifier)
            logger.info(
                "delete_sg_category_task done dw_id=%s sg_cat_nid=%s",
                dw_id,
                result.get("sg_cat_nid"),
            )
            return result
    except Exception as e:
        log_background_incident(
            message=f"delete_sg_category_task failed: {e}",
            error_code="DELETE_SG_CATEGORY_TASK_FAILED",
            exc=e,
            source=_SOURCE,
        )
        raise
