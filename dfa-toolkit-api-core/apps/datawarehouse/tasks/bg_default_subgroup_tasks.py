"""
Celery task for marking default IUS subgroup (fill missing isdefaultsubgroup per indicator+unit).
Uses shared celery_app from apps.shared.config.celery_config; queue: CELERY_QUEUE_NAME_DEFAULT_SUBGROUP.
"""
import logging
from typing import Any, List, Optional, Union

from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="apps.datawarehouse.tasks.bg_default_subgroup_tasks.bg_mark_default_subgroups_task",
)
def bg_mark_default_subgroups_task(
    self: Any,
    dw_id: str,
    i_nid: Optional[Union[int, List[int]]] = None,
    u_nid: Optional[Union[int, List[int]]] = None,
) -> dict:
    """
    Run mark_default_subgroups_for_dw in the background (no threshold re-check).
    """
    from apps.datawarehouse.utils.default_subgroup_utils import mark_default_subgroups_for_dw

    with bg_job_dw_audit_context(dw_route_id=dw_id):
        result = mark_default_subgroups_for_dw(
            dw_id,
            i_nid=i_nid,
            u_nid=u_nid,
            _internal_skip_check=True,
        )
        logger.info(
            "Mark default subgroup task completed dw_id=%s pairs_updated=%s",
            dw_id,
            result.get("pairs_updated"),
        )
        return result
