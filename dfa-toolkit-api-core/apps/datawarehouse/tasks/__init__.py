"""Data warehouse background tasks (e.g. Set MRD updates via Celery).

Imports are lazy so modules like bg_subgroup_tasks can be loaded without pulling
in the full Celery graph unless the submodule is actually imported.
"""

from typing import Any

__all__ = [
    "celery_app",
    "bg_run_setmrd_for_combination_task",
    "update_subgroup_names_task",
    "bg_mark_default_subgroups_task",
]


def __getattr__(name: str) -> Any:
    if name == "celery_app":
        from apps.datawarehouse.tasks.bg_setmrd_tasks import celery_app

        return celery_app
    if name == "bg_run_setmrd_for_combination_task":
        from apps.datawarehouse.tasks.bg_setmrd_tasks import bg_run_setmrd_for_combination_task

        return bg_run_setmrd_for_combination_task
    if name == "update_subgroup_names_task":
        from apps.datawarehouse.tasks.bg_subgroup_tasks import update_subgroup_names_task

        return update_subgroup_names_task
    if name == "bg_mark_default_subgroups_task":
        from apps.datawarehouse.tasks.bg_default_subgroup_tasks import bg_mark_default_subgroups_task

        return bg_mark_default_subgroups_task
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
