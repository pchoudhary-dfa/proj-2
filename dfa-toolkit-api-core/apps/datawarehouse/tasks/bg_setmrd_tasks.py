"""
Celery task for Set MRD updates (run update_ismrd_for_combination in background).
Uses shared celery_app from apps.shared.config.celery_config; queue: CELERY_QUEUE_NAME_ISMRD.
"""
import logging
from typing import Any, List, Optional, Union

from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="apps.datawarehouse.tasks.bg_setmrd_tasks.bg_run_setmrd_for_combination_task",
)
def bg_run_setmrd_for_combination_task(
    self: Any,
    dw_id: str,
    *,
    indicator_nid: Optional[Union[int, List[int]]] = None,
    unit_nid: Optional[Union[int, List[int]]] = None,
    subgroup_val_nid: Optional[Union[int, List[int]]] = None,
    area_nid: Optional[Union[int, List[int]]] = None,
) -> dict:
    """
    Run update_ismrd_for_combination in the background (no threshold check).
    Called by the API when the combination count or IUS row count exceeds sync thresholds.
    """
    from apps.datawarehouse.utils.data_utils import update_ismrd_for_combination

    with bg_job_dw_audit_context(dw_route_id=dw_id):
        result = update_ismrd_for_combination(
            dw_id,
            indicator_nid=indicator_nid,
            unit_nid=unit_nid,
            subgroup_val_nid=subgroup_val_nid,
            area_nid=area_nid,
            _internal_skip_check=True,
        )
        logger.info(
            "Set MRD task completed dw_id=%s combinations_processed=%s",
            dw_id,
            result.get("combinations_processed"),
        )
        return result
