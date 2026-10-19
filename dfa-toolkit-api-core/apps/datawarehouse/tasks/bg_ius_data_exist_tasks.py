"""
Celery task: recompute IUS data_exist from ut_data.
Uses shared celery_app; queue: CELERY_QUEUE_NAME_ISMRD (same as Set MRD).
"""
import logging
from typing import Any, List, Optional, Union

from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="apps.datawarehouse.tasks.bg_ius_data_exist_tasks.bg_recompute_ius_data_exist_task",
)
def bg_recompute_ius_data_exist_task(
    self: Any,
    dw_id: str,
    *,
    indicator_nid: Optional[Union[int, List[int]]] = None,
    unit_nid: Optional[Union[int, List[int]]] = None,
    subgroup_val_nid: Optional[Union[int, List[int]]] = None,
) -> dict:
    """
    Run recompute_ius_data_exist_from_ut_data in the background (no threshold check).
    """
    from apps.datawarehouse.utils.ius_data_exist_utils import (
        recompute_ius_data_exist_from_ut_data,
    )

    with bg_job_dw_audit_context(dw_route_id=dw_id):
        result = recompute_ius_data_exist_from_ut_data(
            dw_id,
            indicator_nid=indicator_nid,
            unit_nid=unit_nid,
            subgroup_val_nid=subgroup_val_nid,
            _internal_skip_check=True,
        )
        logger.info(
            "IUS data_exist recompute completed dw_id=%s chunks=%s ius_processed=%s "
            "indicators_processed=%s",
            dw_id,
            result.get("chunks"),
            result.get("ius_processed"),
            result.get("indicators_processed"),
        )
        return result
