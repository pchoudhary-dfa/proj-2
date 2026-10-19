"""Background task: build a mobile app data package (ZIP)."""
import logging

from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SOURCE = "apps.datawarehouse.tasks.bg_publish_mobile_tasks"


def _run_build_mobile_package(payload: dict) -> dict:
    """
    Core logic shared between Celery task and DB-mode handler.

    Expected payload keys:
        dw_id, package_id, update_version,
        data_files, languages, ic_types,
        exclude_no_data, exclude_time_periods
    """
    from apps.app_db.db.core import SessionLocal
    from apps.datawarehouse.services.publish_mobile_builder import build_package
    from apps.datawarehouse.services.publish_mobile_service import PublishMobileService

    dw_id = payload.get("dw_id")
    package_id = payload.get("package_id")
    update_version = payload.get("update_version")

    if not all([dw_id, package_id, update_version]):
        raise ValueError("dw_id, package_id, and update_version are required")

    service = PublishMobileService()
    db = SessionLocal()
    try:
        build_package(
            dw_id=str(dw_id),
            package_id=int(package_id),
            update_version=int(update_version),
            data_files=payload.get("data_files", ""),
            languages=payload.get("languages", ""),
            ic_types=payload.get("ic_types"),
            exclude_no_data=bool(payload.get("exclude_no_data", False)),
            exclude_time_periods=payload.get("exclude_time_periods"),
        )
        service.mark_created(db, int(package_id))
        logger.info("Mobile package built: dw_id=%s package_id=%s version=%s", dw_id, package_id, update_version)
        return {"success": True, "package_id": package_id, "dw_id": dw_id}
    except Exception as exc:
        logger.error("Mobile package build failed: dw_id=%s package_id=%s error=%s", dw_id, package_id, exc)
        try:
            service.mark_failed(db, int(package_id))
        except Exception:
            pass
        raise
    finally:
        db.close()


@celery_app.task(
    bind=True,
    name="apps.datawarehouse.tasks.bg_publish_mobile_tasks.build_mobile_package_task",
)
def build_mobile_package_task(self, payload: dict):
    """Celery task: build the mobile data package ZIP."""
    dw_id = payload.get("dw_id", "")
    try:
        with bg_job_dw_audit_context(dw_route_id=str(dw_id)):
            return _run_build_mobile_package(payload)
    except Exception as e:
        log_background_incident(
            message=f"Error in build_mobile_package_task: {e}",
            error_code="BUILD_MOBILE_PACKAGE_TASK_FAILED",
            exc=e,
            source=_SOURCE,
        )
        self.retry(countdown=60, max_retries=2)
        raise
