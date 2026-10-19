"""
Data Warehouse application router aggregator
"""
from fastapi import APIRouter

from apps.shared.config.config import settings
from apps.datawarehouse.router import (
    indicator,
    indicator_metadata,
    unit,
    language,
    search,
    indicator_classification,
    sg_categories,
    sg_category_values,
    sg_vals,
    ius,
    areas,
    area_levels,
    time_periods,
    data,
    ic_ius,
    db_metadata,
    dw_users,
    metadata_category,
    sources,
    compute_formula,
    compute_process,
    compute_logs,
    dw_reports,
    publish_mobile,
    sql_dump,
)

router = APIRouter()

router.include_router(indicator.router, prefix="")
router.include_router(indicator_metadata.router, prefix="")
router.include_router(unit.router, prefix="")
router.include_router(language.router, prefix="")
router.include_router(indicator_classification.router, prefix="")
router.include_router(sg_categories.router, prefix="")
router.include_router(sg_category_values.router, prefix="")
router.include_router(sg_vals.router, prefix="")
router.include_router(ius.router, prefix="")
router.include_router(areas.router, prefix="")
router.include_router(area_levels.router, prefix="")
router.include_router(time_periods.router, prefix="")
router.include_router(ic_ius.router, prefix="")
router.include_router(sources.router, prefix="")
router.include_router(db_metadata.router, prefix="")
router.include_router(dw_users.router, prefix="")
router.include_router(dw_reports.router, prefix="")
router.include_router(metadata_category.router, prefix="")
router.include_router(search.router, prefix="")
router.include_router(data.router, prefix="")
# Compute engine routers
router.include_router(compute_formula.router, prefix="")
router.include_router(compute_process.router, prefix="")
router.include_router(compute_logs.router, prefix="")
router.include_router(publish_mobile.router, prefix="")
router.include_router(sql_dump.router, prefix="")
# Debug-only: seed test data by dw_id. Only registered when DEBUG=true.
if settings.DEBUG:
    from apps.datawarehouse.router import seed_debug
    router.include_router(seed_debug.router, prefix="")