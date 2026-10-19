"""
Central Celery app for DFA Toolkit API (Set MRD tasks, mailer client, etc.).
Broker, result backend, and queue name come from .env (CELERY_BROKER_URL,
CELERY_RESULT_BACKEND, CELERY_QUEUE_NAME_ISMRD, CELERY_QUEUE_NAME_DEFAULT_SUBGROUP).
If queue names are not set in .env, the default Celery queue "celery" is used.

Worker example: celery -A apps.shared.config.celery_config worker -l info \
  -Q <CELERY_QUEUE_NAME_ISMRD>,<CELERY_QUEUE_NAME_DEFAULT_SUBGROUP>
"""
from celery import Celery

from apps.shared.config.config import settings

celery_app = Celery(
    "dfa_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    imports=(
        
        "apps.datawarehouse.tasks.bg_setmrd_tasks",
        "apps.datawarehouse.tasks.bg_subgroup_tasks",
        "apps.datawarehouse.tasks.bg_default_subgroup_tasks",
        "apps.datawarehouse.tasks.bg_ius_data_exist_tasks",
        "apps.datawarehouse.tasks.bg_sg_category_value_tasks",
        "apps.datawarehouse.tasks.bg_sg_category_tasks",
        "apps.datawarehouse.tasks.bg_search_index_tasks",
        # Compute Engine tasks (now part of datawarehouse)
        "apps.datawarehouse.tasks.compute_create_jobs",
        "apps.datawarehouse.tasks.compute_process",
    ),
    task_routes={
        "apps.datawarehouse.tasks.bg_setmrd_tasks.bg_run_setmrd_for_combination_task": {
            "queue": settings.CELERY_QUEUE_NAME_ISMRD,
        },
        "apps.datawarehouse.tasks.bg_subgroup_tasks.update_subgroup_names_task": {
            "queue": settings.CELERY_QUEUE_NAME_SUBGROUP_UPDATE,
        },
        "apps.datawarehouse.tasks.bg_default_subgroup_tasks.bg_mark_default_subgroups_task": {
            "queue": settings.CELERY_QUEUE_NAME_DEFAULT_SUBGROUP,
        },
        "apps.datawarehouse.tasks.bg_ius_data_exist_tasks.bg_recompute_ius_data_exist_task": {
            "queue": settings.CELERY_QUEUE_NAME_ISMRD,
        },
        # Compute Engine task routes (now part of datawarehouse)
        "apps.datawarehouse.tasks.compute_create_jobs.create_jobs_task": {
            "queue": settings.CELERY_QUEUE_NAME_COMPUTE_CREATE_JOBS,
        },
        "apps.datawarehouse.tasks.compute_process.process_compute_total_task": {
            "queue": settings.CELERY_QUEUE_NAME_COMPUTE_PROCESS,
        },
        "apps.datawarehouse.tasks.compute_process.process_compute_percent_task": {
            "queue": settings.CELERY_QUEUE_NAME_COMPUTE_PROCESS,
        },
        "apps.datawarehouse.tasks.compute_process.process_compute_time_task": {
            "queue": settings.CELERY_QUEUE_NAME_COMPUTE_PROCESS,
        },
        "apps.datawarehouse.tasks.compute_process.process_compute_minus_task": {
            "queue": settings.CELERY_QUEUE_NAME_COMPUTE_PROCESS,
        },
        "apps.datawarehouse.tasks.bg_search_index_tasks.sync_search_index_task": {
            "queue": settings.CELERY_QUEUE_NAME_SEARCH_INDEX,
        },
    },
)
