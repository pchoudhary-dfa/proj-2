"""Aggregates all app_dashboard routers into a single router."""
from fastapi import APIRouter

from apps.app_dashboard.router.analyses import router as analyses_router
from apps.app_dashboard.router.dashboards import router as dashboards_router
from apps.app_dashboard.router.embed_vos import router as embed_vos_router
from apps.app_dashboard.router.media import router as media_router
from apps.app_dashboard.router.sections import router as sections_router
from apps.app_dashboard.router.templates import router as templates_router
from apps.app_dashboard.router.themes import router as themes_router
from apps.app_dashboard.router.users import router as users_router
from apps.app_dashboard.router.visualizations import router as visualizations_router

router = APIRouter()

# Static /dash/... prefixes MUST be registered before /dash/{dashboard_id}
# so FastAPI (and IAM Approach #2 template resolution) do not treat
# "themes", "media", "embed", "analyses" as a dashboard_id.
router.include_router(media_router)
router.include_router(themes_router)
router.include_router(embed_vos_router)
router.include_router(analyses_router)
router.include_router(dashboards_router)
router.include_router(sections_router)
router.include_router(templates_router)
router.include_router(visualizations_router)
router.include_router(users_router)
