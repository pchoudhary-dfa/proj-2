"""
Background tasks for dataset operations (e.g. large-scope async seeding and deletion).
"""
import logging

from apps.shared.config.celery_config import celery_app
from apps.shared.utils.bg_job_dw_context import bg_job_dw_audit_context
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SOURCE = "apps.datawarehouse.tasks.bg_dataset_tasks"


@celery_app.task(
    bind=True,
    name="apps.datawarehouse.tasks.bg_dataset_tasks.seed_dataset_data_points_task",
)
def seed_dataset_data_points_task(
    self,
    dataset_id: int,
    dw_id: int,
    locale: str = "en",
):
    """
    Seed dataset_data_point rows for a large-scope dataset asynchronously.

    Sets dataset_status back to DRAFT on success.
    Retries up to 3 times with a 60-second back-off on failure.
    """
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import Dataset
    from apps.app_db.services.dataset_service import _seed_dataset_data_points

    db = SessionLocal()
    try:
        with bg_job_dw_audit_context(dw_route_id=str(dw_id)):
            dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
            if not dataset:
                raise ValueError(f"Dataset {dataset_id} not found")
            _seed_dataset_data_points(db, dataset, dw_id, locale=locale)
            dataset.datapoint_readiness = "COMPLETED"
            db.commit()
        logger.info(
            "Async dataset seeding completed dataset_id=%s dw_id=%s", dataset_id, dw_id
        )
        return {"success": True, "dataset_id": dataset_id}
    except Exception as exc:
        db.rollback()
        log_background_incident(
            f"Async dataset seeding failed dataset_id={dataset_id} dw_id={dw_id}: {exc}",
            error_code="DATASET_SEED_TASK_FAILED",
            exc=exc,
            source=_SOURCE,
        )
        self.retry(countdown=60, max_retries=3, exc=exc)
        raise
    finally:
        db.close()


@celery_app.task(
    bind=True,
    name="apps.datawarehouse.tasks.bg_dataset_tasks.delete_dataset_task",
)
def delete_dataset_task(self, dataset_id: int, dw_id: int):
    """
    Delete all dataset_data_point rows and then the dataset row itself asynchronously.

    Called when the data-point count exceeds DATASET_DELETE_BG_THRESHOLD.
    Retries up to 3 times with a 60-second back-off on failure.
    """
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import Dataset, DatasetDataPoint

    db = SessionLocal()
    try:
        with bg_job_dw_audit_context(dw_route_id=str(dw_id)):
            dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
            if not dataset:
                # Already deleted — treat as success.
                logger.info("Async dataset deletion: dataset_id=%s not found, skipping", dataset_id)
                return {"success": True, "dataset_id": dataset_id}
            db.query(DatasetDataPoint).filter(
                DatasetDataPoint.dataset_id == dataset_id
            ).delete(synchronize_session=False)
            db.delete(dataset)
            db.commit()
        logger.info(
            "Async dataset deletion completed dataset_id=%s dw_id=%s", dataset_id, dw_id
        )
        return {"success": True, "dataset_id": dataset_id}
    except Exception as exc:
        db.rollback()
        log_background_incident(
            f"Async dataset deletion failed dataset_id={dataset_id} dw_id={dw_id}: {exc}",
            error_code="DATASET_DELETE_TASK_FAILED",
            exc=exc,
            source=_SOURCE,
        )
        self.retry(countdown=60, max_retries=3, exc=exc)
        raise
    finally:
        db.close()
