"""
Core application router aggregator
"""
from fastapi import APIRouter
from apps.app_db.router import auth, datawarehouse, app_config, translations, gallery, iam, system_language, users, system_api_clients, workflow, insights, share_links, logs, notification

router = APIRouter()

router.include_router(
    auth.router,
    prefix="",
    tags=["Auth"],
)
router.include_router(
    datawarehouse.router,
    prefix="",
    tags=["System Datawarehouses"]
)
router.include_router(
    app_config.router,
    prefix="",
    tags=["App Config"]
)
router.include_router(
    translations.router,
    prefix="",
)
router.include_router(
    gallery.router,
    prefix="",
    tags=["Gallery"],
)
router.include_router(
    iam.router,
    prefix="",
    tags=["IAM"],
)
router.include_router(
    system_language.router,
    prefix="",
    tags=["System Language"],
)
router.include_router(
    users.router,
    prefix="",
)
router.include_router(
    system_api_clients.router,
    prefix="",
)
router.include_router(
    workflow.router,
    prefix="",
)
router.include_router(
    insights.router,
    prefix="",
)
router.include_router(
    share_links.router,
    prefix="",
    tags=["Share Links"],
)
router.include_router(
    logs.router,
    prefix="",
)
router.include_router(
    notification.router,
    prefix="",
)
