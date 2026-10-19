"""
Celery task: cascade-delete a subgroup category value (ut_subgroup + subgroup val cascade).
Queue: CELERY_QUEUE_NAME_SUBGROUP_UPDATE (same as subgroup name updates).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context
from apps.datawarehouse.services.sg_category_values import SgCategoryValuesService
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SOURCE = "apps.datawarehouse.tasks.bg_sg_category_value_tasks"


@celery_app.task(
    bind=True,
    name="apps.datawarehouse.tasks.bg_sg_category_value_tasks.delete_sg_category_value_task",
)
def delete_sg_category_value_task(
    self: Any,
    dw_id: str,
    subgroup_nid: int,
    value_identifier: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run full subgroup category value delete in the background.

    No Celery retries: ValueError cases (system subgroup, inconsistent junction, not found)
    are permanent failures; transient DB errors can be retried manually if needed.
    """
    try:
        with bg_job_dw_audit_context(dw_route_id=dw_id):
            logger.info(
                "delete_sg_category_value_task start dw_id=%s subgroup_nid=%s value_identifier=%s",
                dw_id,
                subgroup_nid,
                value_identifier,
            )
            service = SgCategoryValuesService()
            result = service.run_delete_sg_category_value_job(dw_id, int(subgroup_nid))
            logger.info(
                "delete_sg_category_value_task done dw_id=%s subgroup_nid=%s",
                dw_id,
                subgroup_nid,
            )
            return result
    except Exception as e:
        log_background_incident(
            message=f"delete_sg_category_value_task failed: {e}",
            error_code="DELETE_SG_CATEGORY_VALUE_TASK_FAILED",
            exc=e,
            source=_SOURCE,
        )
        raise
