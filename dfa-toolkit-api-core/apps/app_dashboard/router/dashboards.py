"""Dashboard CRUD routes — /dash"""
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Path, Query
from sqlalchemy.orm import Session

from apps.app_dashboard.schemas.dashboard import (
    DashboardCloneRequest,
    DashboardCreateRequest,
    DashboardPublishRequest,
    DashboardUpdateRequest,
)
from apps.app_dashboard.services.dashboard_service import (
    clone_dashboard,
    create_dashboard,
    delete_dashboard,
    get_dashboard,
    get_viewer_bundle,
    list_dashboards,
    publish_dashboard,
    update_dashboard,
    _to_publish_response,
    _to_update_response,
)
from apps.app_db.dependencies import (
    get_app_key,
    get_core_locale,
    get_current_user_id,
    get_is_super_admin,
)
from apps.shared.config.dependencies import get_db, get_optional_user
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.pagination_meta import build_list_pagination_meta
from apps.shared.utils.response import created_response, no_content_response, success_response

router = APIRouter(prefix="/dash", tags=["Dashboard"])


@router.get(
    "",
    response_model=SuccessResponse,
    summary="List dashboards",
    description=(
        "Return dashboards visible to the authenticated user. "
        "Super admins receive all dashboards; other users receive only dashboards "
        "linked via iam_user_role.dashboard_id for the active app. "
        "Each item includes map_url, language_codes from the linked data warehouse, "
        "and dashboard_role_name localized via Accept-Language (get_core_locale)."
    ),
)
def list_dashboards_endpoint(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
    mode: Optional[str] = Query(None, description="Filter by dashboard mode (e.g. edit)"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    is_super_admin: bool = Depends(get_is_super_admin),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
):
    items, total_count = list_dashboards(
        db,
        user_id=user_id,
        app_key=app_key,
        is_super_admin=is_super_admin,
        page=page,
        page_size=page_size,
        mode=mode,
        locale=locale,
    )
    total_pages = (total_count + page_size - 1) // page_size if total_count else 0
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(items),
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
    return success_response(
        message="Dashboards retrieved successfully",
        data=[item.model_dump() for item in items],
        meta=meta,
    )


@router.post(
    "",
    response_model=SuccessResponse,
    status_code=201,
    summary="Create dashboard",
    description=(
        "Create a new dashboard. `dashboard_url` is the display title shown to end users "
        "(maps to `dashboard_title` in the database). `datawarehouse_connection` is the "
        "`system_datawarehouse.id` of the linked warehouse."
    ),
    responses={
        201: {"description": "Dashboard created successfully"},
        409: {"description": "Dashboard name or URL already exists"},
        404: {"description": "Data warehouse not found"},
    },
)
def create_dashboard_endpoint(
    payload: DashboardCreateRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Create a new dashboard.

    - **dashboard_name**: Internal name slug; must be globally unique.
    - **dashboard_url**: Display title shown to end users; must be unique in edit mode.
    - **map_url**: DML map API base URL.
    - **resolution**: Target screen width — `1024px` or `100%` (legacy dropdown options).
    - **datawarehouse_connection**: `system_datawarehouse.id` to link a warehouse.
    """
    dashboard = create_dashboard(db, payload, user_id)
    return created_response(
        message="Dashboard created successfully",
        data={
            "id": dashboard.id,
            "dashboard_gid": dashboard.dashboard_gid,
            "dashboard_name": dashboard.dashboard_name,
            "dashboard_url": dashboard.dashboard_title,
            "map_url": dashboard.map_url,
            "resolution": dashboard.resolution,
            "system_dw_id": dashboard.system_dw_id,
            "mode": dashboard.mode,
        },
    )


@router.get(
    "/viewer-bundle/{dashboard_title}",
    response_model=SuccessResponse,
    summary="Get publish viewer runtime bundle",
    description=(
        "Return aggregated publish-mode runtime data for the public dashboard viewer: "
        "slim dashboard settings, sections, template gridster layout, and "
        "layout-used visualizations keyed by id with full config (legacy vizSettings). "
        "Requires APP_CLIENT access. Resolves the publish dashboard by exact "
        "`dashboard_title` match (URL-encode spaces/special characters). "
        "If the published dashboard is private (`is_private=1`), the caller must "
        "send a Bearer JWT for a user on the edit-dashboard allowlist "
        "(iam_user_role.dashboard_id = source_dash_id); otherwise 403."
    ),
    responses={
        200: {"description": "Viewer bundle retrieved successfully"},
        403: {
            "description": "Private dashboard and user not on allowlist",
            "model": ErrorResponse,
        },
        404: {"description": "Published dashboard not found", "model": ErrorResponse},
    },
)
def get_viewer_bundle_endpoint(
    dashboard_title: str = Path(
        ...,
        description="Publish dashboard title (dashboard_title / public URL key)",
    ),
    db: Session = Depends(get_db),
    app_key: str = Depends(get_app_key),
    optional_user: Optional[dict[str, Any]] = Depends(get_optional_user),
):
    user_id: Optional[int] = None
    is_super_admin = False
    if optional_user and optional_user.get("sub") is not None:
        user_id = int(optional_user["sub"])
        super_admin_keys = optional_user.get("super_admin_api_keys") or []
        is_super_admin = app_key in super_admin_keys

    bundle = get_viewer_bundle(
        db,
        dashboard_title,
        user_id=user_id,
        app_key=app_key,
        is_super_admin=is_super_admin,
    )
    return success_response(
        message="Viewer bundle retrieved successfully",
        data=bundle.model_dump(),
    )


@router.get(
    "/{dashboard_id}",
    response_model=SuccessResponse,
    summary="Get dashboard",
    description=(
        "Return full dashboard metadata for design/preview. "
        "Requires AUTHENTICATED access. Non-super-admin users must have "
        "an iam_user_role row with dashboard_id set."
    ),
    responses={
        200: {"description": "Dashboard retrieved successfully"},
        403: {"description": "User not assigned to this dashboard", "model": ErrorResponse},
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def get_dashboard_endpoint(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    is_super_admin: bool = Depends(get_is_super_admin),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
):
    detail = get_dashboard(
        db,
        dashboard_id,
        user_id=user_id,
        app_key=app_key,
        is_super_admin=is_super_admin,
        locale=locale,
    )
    return success_response(
        message="Dashboard retrieved successfully",
        data=detail.model_dump(),
    )


@router.patch(
    "/{dashboard_id}",
    response_model=SuccessResponse,
    summary="Update dashboard",
    description=(
        "Partially update dashboard configuration (legacy service 104). "
        "Only fields present in the request body are updated. "
        "`dashboard_url` maps to `dashboard_title`; `datawarehouse_connection` "
        "maps to `system_dw_id`. Changing the warehouse propagates to linked "
        "`dash_visualization` rows for this dashboard."
    ),
    responses={
        200: {"description": "Dashboard updated successfully"},
        403: {"description": "Insufficient permissions", "model": ErrorResponse},
        404: {"description": "Dashboard or data warehouse not found", "model": ErrorResponse},
        409: {"description": "Dashboard name or URL already exists", "model": ErrorResponse},
    },
)
def update_dashboard_endpoint(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    payload: DashboardUpdateRequest = Body(...),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Update dashboard settings from Publish/Configuration save.

    - **dashboard_url**: Display title; must be unique among edit-mode dashboards.
    - **datawarehouse_connection**: `system_datawarehouse.id`; updates linked visualizations.
    - **ai_settings**: When `ai_api_key_configured` is true and `ai_api_key` is omitted,
      existing key is preserved.
    """
    dashboard = update_dashboard(db, dashboard_id, payload, user_id)
    return success_response(
        message="Dashboard updated successfully",
        data=_to_update_response(dashboard),
    )


@router.delete(
    "/{dashboard_id}",
    status_code=204,
    summary="Delete dashboard",
    description=(
        "Delete a dashboard and all related rows via database cascades, "
        "including publish clones linked by source_dash_id. "
        "Dashboard-scoped IAM content (iam_user_role_content) is cleared first "
        "so cascaded iam_user_role deletes are not blocked by RESTRICT FKs. "
        "Access is enforced by middleware (PERMISSION level on this endpoint)."
    ),
    responses={
        204: {"description": "Dashboard deleted successfully"},
        403: {"description": "Insufficient permissions", "model": ErrorResponse},
        404: {"description": "Dashboard not found", "model": ErrorResponse},
    },
)
def delete_dashboard_endpoint(
    dashboard_id: int = Path(..., description="Dashboard primary key"),
    db: Session = Depends(get_db),
):
    delete_dashboard(db, dashboard_id)
    return no_content_response()


@router.post(
    "/{dashboard_id}/clone",
    response_model=SuccessResponse,
    status_code=201,
    summary="Clone dashboard",
    description=(
        "Deep-clone an edit-mode dashboard (legacy service 141, action=copy). "
        "Copies dashboard metadata, visualizations, template layout, and sections. "
        "New names default to legacy suffixes (` - Copy` / `-Copy`) with auto-increment "
        "on collision. Assigns DFA_DASH_ADMIN on the clone to the acting user."
    ),
    responses={
        201: {"description": "Dashboard cloned successfully"},
        400: {"description": "Source dashboard is not in edit mode", "model": ErrorResponse},
        404: {"description": "Dashboard not found", "model": ErrorResponse},
        409: {"description": "Explicit clone name or URL already exists", "model": ErrorResponse},
    },
)
def clone_dashboard_endpoint(
    dashboard_id: int = Path(..., description="Source dashboard primary key (must be edit mode)"),
    payload: DashboardCloneRequest | None = Body(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
):
    """
    Clone a dashboard.

    - **dashboard_name** / **dashboard_url**: Optional overrides (legacy dashName / dashTitle).
    - **dashboard_gid**: Optional override for the new global id.
    When omitted, names are suffixed automatically; collisions append `2`, `3`, etc.
    - Assigns ``DFA_DASH_ADMIN`` on the clone to the acting user.
    """
    dashboard = clone_dashboard(db, dashboard_id, user_id, payload, app_key=app_key)
    return created_response(
        message="Dashboard cloned successfully",
        data=_to_update_response(dashboard),
    )


@router.post(
    "/{dashboard_id}/publish",
    response_model=SuccessResponse,
    status_code=200,
    summary="Publish dashboard",
    description=(
        "Sync an edit-mode dashboard to its publish clone (legacy service 141, action=publish). "
        "Creates the publish row on first publish; re-publishes update the existing clone, "
        "increment dashboard_version, and refresh visualizations, template, and sections. "
        "Persists dashboardDependency in publish settings for the viewer bundle. "
        "IAM membership stays on the edit dashboard; unpublish via DELETE of the "
        "publish row (clears is_published on the edit dashboard). "
        "Publish display title must be unique among publish-mode dashboards (excluding "
        "this dashboard's existing publish clone on re-publish)."
    ),
    responses={
        200: {"description": "Dashboard published successfully"},
        400: {"description": "Source dashboard is not in edit mode", "model": ErrorResponse},
        404: {"description": "Dashboard not found", "model": ErrorResponse},
        409: {
            "description": "Publish display title already used by another published dashboard",
            "model": ErrorResponse,
        },
    },
)
def publish_dashboard_endpoint(
    dashboard_id: int = Path(..., description="Edit dashboard primary key"),
    payload: DashboardPublishRequest | None = Body(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Publish or re-publish a dashboard.

    - **dashboard_url**: Optional publish display title override (legacy dashTitle).
      Must be unique among publish-mode dashboards (current publish clone excluded).
    Empty body is accepted; edit dashboard title is used by default.
    """
    publish = publish_dashboard(db, dashboard_id, user_id, payload)
    return success_response(
        message="Dashboard published successfully",
        data=_to_publish_response(dashboard_id, publish),
    )
