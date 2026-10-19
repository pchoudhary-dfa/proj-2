"""Dashboard service — business logic for creating and managing dashboards."""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

from sqlalchemy import func, inspect as sa_inspect, or_
from sqlalchemy.orm import Query, Session, aliased

from apps.app_dashboard.constants import (
    DASHBOARD_MODE_EDIT,
    DASHBOARD_MODE_PUBLISH,
    DEFAULT_GLOBAL_CSS,
    TEMPLATE_FLAG_NO,
    VIEWER_DEPENDENCY_HIGHCHARTS,
    VIEWER_VIZ_TYPE_DEPENDENCIES,
)
from apps.app_dashboard.models.dashboard import (
    Artifact,
    Dashboard,
    DashboardSection,
    DashboardTemplate,
    DashVisualization,
)
from apps.app_dashboard.schemas.dashboard import (
    DashboardArtifactResponse,
    DashboardCloneRequest,
    DashboardCreateRequest,
    DashboardDetailResponse,
    DashboardListItem,
    DashboardPublishRequest,
    DashboardSectionViewerItem,
    DashboardTemplateViewerResponse,
    DashboardUpdateRequest,
    DashboardViewerBundleResponse,
    DashboardViewerResponse,
)
from apps.app_dashboard.services.user_area_service import assign_dashboard_owner_admin
from apps.app_dashboard.utils.dashboard_clone import (
    parse_json_column,
    remap_visualization_child_hooks,
    remap_global_filter_gridster,
    remap_gridster_section_keys,
    remap_gridster_viz_ids,
    resolve_clone_names,
)
from apps.datawarehouse.db.datawarehouse import get_cached_dw_language_info
from apps.app_dashboard.services.dashboard_area_service import load_default_area
from apps.app_dashboard.services.section_service import create_default_section
from apps.app_dashboard.services.template_service import create_empty_template
from apps.app_dashboard.services.visualization_service import (
    list_layout_visualizations_for_viewer,
)
from apps.app_dashboard.utils.dashboard_serialization import (
    bool_from_smallint,
    bool_to_smallint,
    merge_ai_settings_for_write,
    parse_json_field,
    parse_json_or_raw_field,
    redact_ai_settings,
    serialize_json_column,
)
from apps.app_db.models.core import (
    IamRole,
    IamRoleI18n,
    IamUserRole,
    IamUserRoleContent,
    SystemDatawarehouse,
)
from apps.app_dashboard.utils.audit_events import (
    app_buffer_delete_step,
    app_buffer_manual_audit,
    app_snapshot_entity,
)
from apps.shared.exceptions import AppException, BadRequest, Conflict, Forbidden, NotFound


def _generate_dashboard_gid() -> str:
    """Generate a short unique identifier for a new dashboard."""
    return uuid.uuid4().hex


def _assert_dashboard_name_available(
    db: Session,
    dashboard_name: str,
    *,
    exclude_id: int | None = None,
) -> None:
    """dashboard_name must be unique among edit-mode dashboards (create + update)."""
    query = db.query(Dashboard.id).filter(
        Dashboard.dashboard_name == dashboard_name,
        Dashboard.mode == DASHBOARD_MODE_EDIT,
    )
    if exclude_id is not None:
        query = query.filter(Dashboard.id != exclude_id)
    existing = query.first()
    if existing:
        raise Conflict(
            f"Dashboard with name '{dashboard_name}' already exists",
            error_code="DASHBOARD_NAME_EXISTS",
        )


def _assert_dashboard_url_available(
    db: Session,
    dashboard_url: str,
    *,
    exclude_id: int | None = None,
) -> None:
    """Legacy service 142: dashboardtitle must be unique for edit-mode dashboards."""
    query = db.query(Dashboard.id).filter(
        Dashboard.dashboard_title == dashboard_url,
        Dashboard.mode == DASHBOARD_MODE_EDIT,
    )
    if exclude_id is not None:
        query = query.filter(Dashboard.id != exclude_id)
    existing = query.first()
    if existing:
        raise Conflict(
            f"Dashboard with URL '{dashboard_url}' already exists",
            error_code="DASHBOARD_URL_EXISTS",
        )


def _assert_publish_dashboard_url_available(
    db: Session,
    dashboard_url: str,
    *,
    exclude_publish_id: int | None = None,
) -> None:
    """Publish display title must be unique among publish-mode rows (public URL routing)."""
    title = (dashboard_url or "").strip()
    if not title:
        return

    query = db.query(Dashboard.id).filter(
        Dashboard.dashboard_title == title,
        Dashboard.mode == DASHBOARD_MODE_PUBLISH,
    )
    if exclude_publish_id is not None:
        query = query.filter(Dashboard.id != exclude_publish_id)
    existing = query.first()
    if existing:
        raise Conflict(
            f"Published dashboard with URL '{title}' already exists",
            error_code="PUBLISH_DASHBOARD_URL_EXISTS",
        )


def _resolve_dw_language_codes_map(dw_ids: set[int]) -> dict[int, list[str]]:
    """Batch-resolve ut_language codes per warehouse for list responses."""
    result: dict[int, list[str]] = {}
    for dw_id in dw_ids:
        try:
            info = get_cached_dw_language_info(str(dw_id))
            result[dw_id] = list(info.codes)
        except AppException:
            result[dw_id] = []
    return result


def _to_list_item(
    dashboard: Dashboard,
    database_name: Optional[str],
    publish_id: Optional[int],
    published_on,
    published_url: Optional[str],
    dashboard_role_id: Optional[int],
    dashboard_role_name: Optional[str],
    *,
    language_codes: list[str],
) -> DashboardListItem:
    """Map a query row to DashboardListItem."""
    return DashboardListItem(
        id=dashboard.id,
        dashboard_gid=dashboard.dashboard_gid,
        dashboard_name=dashboard.dashboard_name,
        dashboard_url=dashboard.dashboard_title,
        map_url=dashboard.map_url,
        system_dw_id=dashboard.system_dw_id,
        database_name=database_name,
        language_codes=language_codes,
        mode=dashboard.mode,
        resolution=dashboard.resolution,
        modified=dashboard.modified,
        publish_id=publish_id,
        published_on=published_on,
        published_url=published_url,
        dashboard_role_id=dashboard_role_id,
        dashboard_role_name=dashboard_role_name,
    )


def _build_list_query(
    db: Session,
    *,
    user_id: int,
    app_key: str,
    is_super_admin: bool,
    locale: str,
) -> Query:
    """
    Build the base list query with warehouse, publish, and role joins.

    Visibility rules (non-super-admin):
      - Dashboards the user is assigned to via iam_user_role.dashboard_id, OR
      - Dashboards the user created (Dashboard.created_user_id == user_id).
    Both paths are always LEFT-joined so role columns are NULL for creator-only rows.

    Role display name uses Accept-Language locale via ``IamRoleI18n``, falling
    back to the ``en`` row when the requested locale has no translation.
    """
    publish_dashboard = aliased(Dashboard)
    role_i18n = aliased(IamRoleI18n)
    role_i18n_en = aliased(IamRoleI18n)

    query = db.query(
        Dashboard,
        SystemDatawarehouse.dw_connection_name,
        publish_dashboard.id,
        publish_dashboard.modified,
        publish_dashboard.dashboard_title,
        IamRole.id,
        func.coalesce(role_i18n.name, role_i18n_en.name),
    ).outerjoin(
        SystemDatawarehouse,
        Dashboard.system_dw_id == SystemDatawarehouse.id,
    ).outerjoin(
        publish_dashboard,
        (publish_dashboard.source_dash_id == Dashboard.id)
        & (publish_dashboard.mode == DASHBOARD_MODE_PUBLISH),
    ).outerjoin(
        IamUserRole,
        (IamUserRole.dashboard_id == Dashboard.id)
        & (IamUserRole.user_id == user_id)
        & (IamUserRole.app_key == app_key),
    ).outerjoin(
        IamRole,
        IamRole.id == IamUserRole.role_id,
    ).outerjoin(
        role_i18n,
        (role_i18n.master_id == IamRole.id) & (role_i18n.locale == locale),
    ).outerjoin(
        role_i18n_en,
        (role_i18n_en.master_id == IamRole.id) & (role_i18n_en.locale == "en"),
    )

    if not is_super_admin:
        # Restrict to dashboards the user is assigned to OR created themselves.
        query = query.filter(
            or_(
                IamUserRole.id.isnot(None),
                Dashboard.created_user_id == user_id,
            )
        )

    return query


def list_dashboards(
    db: Session,
    *,
    user_id: int,
    app_key: str,
    is_super_admin: bool,
    page: int = 1,
    page_size: int = 20,
    mode: Optional[str] = None,
    locale: str = "en",
) -> tuple[list[DashboardListItem], int]:
    """
    List dashboards visible to the caller.

    - Super admins see all dashboards.
    - Other users see dashboards linked via iam_user_role.dashboard_id.
    """
    query = _build_list_query(
        db,
        user_id=user_id,
        app_key=app_key,
        is_super_admin=is_super_admin,
        locale=locale,
    )

    if mode is not None:
        query = query.filter(Dashboard.mode == mode)

    total_count = query.count()

    rows = (
        query.order_by(Dashboard.modified.desc(), Dashboard.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    unique_dw_ids = {row[0].system_dw_id for row in rows if row[0].system_dw_id}
    language_codes_by_dw = _resolve_dw_language_codes_map(unique_dw_ids)

    items = [
        _to_list_item(
            dashboard=row[0],
            database_name=row[1],
            publish_id=row[2],
            published_on=row[3],
            published_url=row[4],
            dashboard_role_id=row[5],
            dashboard_role_name=row[6],
            language_codes=(
                language_codes_by_dw.get(row[0].system_dw_id, [])
                if row[0].system_dw_id
                else []
            ),
        )
        for row in rows
    ]
    return items, total_count


def _assert_dashboard_access(
    db: Session,
    *,
    dashboard_id: int,
    user_id: int,
    app_key: str,
    is_super_admin: bool,
) -> None:
    """
    Raise Forbidden when a non-super-admin user has neither an IAM assignment
    nor is the creator of the dashboard.
    """
    if is_super_admin:
        return

    assigned = (
        db.query(IamUserRole.id)
        .filter(
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamUserRole.dashboard_id == dashboard_id,
        )
        .first()
    )
    if assigned:
        return

    is_creator = (
        db.query(Dashboard.id)
        .filter(
            Dashboard.id == dashboard_id,
            Dashboard.created_user_id == user_id,
        )
        .first()
    )
    if not is_creator:
        raise Forbidden(
            "You do not have access to this dashboard",
            error_code="DASHBOARD_ACCESS_DENIED",
        )


def _assert_private_viewer_access(
    db: Session,
    *,
    allowlist_dashboard_id: int,
    user_id: Optional[int],
    app_key: str,
    is_super_admin: bool,
) -> None:
    """
    Enforce private publish viewer access after the publish row is resolved.

    Membership is checked against the edit-mode dashboard id (source_dash_id),
    matching legacy validateUserWithPrivateDashboardAccess.
    """
    if is_super_admin:
        return
    if user_id is None:
        raise Forbidden(
            "This dashboard is private. Sign in with an account that has access.",
            error_code="DASHBOARD_PRIVATE_ACCESS_DENIED",
        )
    assigned = (
        db.query(IamUserRole.id)
        .filter(
            IamUserRole.user_id == user_id,
            IamUserRole.app_key == app_key,
            IamUserRole.dashboard_id == allowlist_dashboard_id,
        )
        .first()
    )
    if not assigned:
        raise Forbidden(
            "You do not have access to this private dashboard",
            error_code="DASHBOARD_PRIVATE_ACCESS_DENIED",
        )


def _fetch_publish_and_role(
    db: Session,
    *,
    dashboard_id: int,
    user_id: int,
    app_key: str,
    locale: str,
) -> tuple[
    Optional[int],
    Optional[Any],
    Optional[int],
    Optional[str],
    Optional[str],
    Optional[str],
    Optional[str],
]:
    """Return publish_id, published_on, role_id, role_code, role_name, db_name, db_type.

    ``role_name`` is locale-aware (Accept-Language), falling back to the ``en`` i18n row.
    """
    publish_dashboard = aliased(Dashboard)
    role_i18n = aliased(IamRoleI18n)
    role_i18n_en = aliased(IamRoleI18n)

    row = (
        db.query(
            publish_dashboard.id,
            publish_dashboard.modified,
            IamRole.id,
            IamRole.role_code,
            func.coalesce(role_i18n.name, role_i18n_en.name),
            SystemDatawarehouse.dw_connection_name,
            SystemDatawarehouse.dw_connection_details,
        )
        .select_from(Dashboard)
        .outerjoin(
            SystemDatawarehouse,
            Dashboard.system_dw_id == SystemDatawarehouse.id,
        )
        .outerjoin(
            publish_dashboard,
            (publish_dashboard.source_dash_id == Dashboard.id)
            & (publish_dashboard.mode == DASHBOARD_MODE_PUBLISH),
        )
        .outerjoin(
            IamUserRole,
            (IamUserRole.dashboard_id == Dashboard.id)
            & (IamUserRole.user_id == user_id)
            & (IamUserRole.app_key == app_key),
        )
        .outerjoin(IamRole, IamRole.id == IamUserRole.role_id)
        .outerjoin(
            role_i18n,
            (role_i18n.master_id == IamRole.id) & (role_i18n.locale == locale),
        )
        .outerjoin(
            role_i18n_en,
            (role_i18n_en.master_id == IamRole.id) & (role_i18n_en.locale == "en"),
        )
        .filter(Dashboard.id == dashboard_id)
        .first()
    )

    if row is None:
        return None, None, None, None, None, None, None

    publish_id, published_on, role_id, role_code, role_name, db_name, db_details = row
    db_type: Optional[str] = None
    if db_details:
        try:
            db_type = json.loads(db_details).get("db_source_type") or None
        except (json.JSONDecodeError, TypeError):
            db_type = None

    return publish_id, published_on, role_id, role_code, role_name, db_name, db_type


def _to_detail_response(
    dashboard: Dashboard,
    *,
    database_name: Optional[str],
    database_type: Optional[str],
    publish_id: Optional[int],
    published_on,
    dashboard_role_id: Optional[int],
    dashboard_role_code: Optional[str],
    dashboard_role_name: Optional[str],
    artifact: Optional[Artifact],
    default_area: dict[str, Any],
) -> DashboardDetailResponse:
    """Map ORM dashboard + enrichments to DashboardDetailResponse."""
    artifact_response: Optional[DashboardArtifactResponse] = None
    if artifact is not None:
        artifact_response = DashboardArtifactResponse(
            id=artifact.id,
            type=artifact.type,
            filename=artifact.filename,
            file_ext=artifact.file_ext,
            file_size=artifact.file_size,
            file_width=artifact.file_width,
            file_height=artifact.file_height,
        )

    return DashboardDetailResponse(
        id=dashboard.id,
        dashboard_gid=dashboard.dashboard_gid,
        dashboard_name=dashboard.dashboard_name,
        dashboard_url=dashboard.dashboard_title,
        dashboard_version=dashboard.dashboard_version,
        template_id=dashboard.template_id,
        mode=dashboard.mode,
        type=dashboard.type,
        source_dash_id=dashboard.source_dash_id,
        datawarehouse_connection=dashboard.system_dw_id,
        database_name=database_name,
        database_type=database_type,
        body_color=dashboard.body_color,
        banner_color=dashboard.banner_color,
        title_color=dashboard.title_color,
        resolution=dashboard.resolution,
        global_css=dashboard.global_css,
        global_js=dashboard.global_js,
        section_settings=parse_json_field(dashboard.section_settings),
        color_theme=parse_json_field(dashboard.color_theme),
        vo_border_color=dashboard.vo_border_color,
        vo_border_width=dashboard.vo_border_width,
        vo_border_radius=dashboard.vo_border_radius,
        header_html=parse_json_or_raw_field(dashboard.header_html),
        footer_html=parse_json_or_raw_field(dashboard.footer_html),
        mobile_header_html=parse_json_or_raw_field(dashboard.mobile_header_html),
        mobile_footer_html=parse_json_or_raw_field(dashboard.mobile_footer_html),
        footer_bg_color=dashboard.footer_bg_color,
        is_enable_profile=bool_from_smallint(dashboard.is_enable_profile),
        is_global_profile=bool_from_smallint(dashboard.is_global_profile),
        profile_prefix=dashboard.profile_prefix,
        global_file_name=dashboard.global_file_name,
        profiles_download=bool_from_smallint(dashboard.profiles_download),
        profiles_suffix=dashboard.profiles_suffix,
        dfa_profile_settings=parse_json_field(dashboard.dfa_profile_settings),
        area_lvl_from=dashboard.area_lvl_from,
        area_lvl_to=dashboard.area_lvl_to,
        default_area=default_area,
        settings=parse_json_field(dashboard.settings),
        subgroup_color=parse_json_field(dashboard.subgroup_color),
        dfa_visualizer_settings=parse_json_field(dashboard.dfa_visualizer_settings),
        lang_selected=parse_json_field(dashboard.lang_selected),
        is_multi_lang_active=bool_from_smallint(dashboard.is_multi_lang_active),
        map_url=dashboard.map_url,
        banner_logo=dashboard.banner_logo,
        favicon=dashboard.favicon,
        logo_id=dashboard.logo_id,
        artifact=artifact_response,
        publish_id=publish_id,
        published_on=published_on,
        dashboard_role_id=dashboard_role_id,
        dashboard_role_code=dashboard_role_code,
        dashboard_role_name=dashboard_role_name or dashboard_role_code,
        enable_insights=bool(dashboard.enable_insights),
        ai_settings=redact_ai_settings(
            bool(dashboard.enable_insights),
            dashboard.ai_settings,
        ),
        is_private=bool_from_smallint(dashboard.is_private),
        is_published=bool_from_smallint(dashboard.is_published),
        created=dashboard.created,
        modified=dashboard.modified,
        created_user_id=dashboard.created_user_id,
        modified_user_id=dashboard.modified_user_id,
    )


def get_dashboard(
    db: Session,
    dashboard_id: int,
    *,
    user_id: int,
    app_key: str,
    is_super_admin: bool,
    locale: str = "en",
) -> DashboardDetailResponse:
    """
    Return full dashboard detail for GET /dash/{dashboard_id}.

    - Super admins may read any dashboard.
    - Other users require iam_user_role.dashboard_id assignment (403 otherwise).
    """
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise NotFound(
            f"Dashboard with id {dashboard_id} not found",
            error_code="DASHBOARD_NOT_FOUND",
        )
    
    _assert_dashboard_access(
        db,
        dashboard_id=dashboard_id,
        user_id=user_id,
        app_key=app_key,
        is_super_admin=is_super_admin,
    )

    (
        publish_id,
        published_on,
        role_id,
        role_code,
        role_name,
        database_name,
        database_type,
    ) = _fetch_publish_and_role(
        db,
        dashboard_id=dashboard_id,
        user_id=user_id,
        app_key=app_key,
        locale=locale,
    )

    artifact: Optional[Artifact] = None
    if dashboard.logo_id:
        artifact = (
            db.query(Artifact).filter(Artifact.id == dashboard.logo_id).first()
        )

    default_area = load_default_area(
        db=db,
        system_dw_id=dashboard.system_dw_id,
        dashboard_id=dashboard_id,
        user_id=user_id,
        app_key=app_key,
        is_super_admin=is_super_admin,
        locale=locale,
    )

    return _to_detail_response(
        dashboard,
        database_name=database_name,
        database_type=database_type,
        publish_id=publish_id,
        published_on=published_on,
        dashboard_role_id=role_id,
        dashboard_role_code=role_code,
        dashboard_role_name=role_name,
        artifact=artifact,
        default_area=default_area,
    )


def create_dashboard(
    db: Session,
    payload: DashboardCreateRequest,
    user_id: int,
) -> Dashboard:
    """
    Create a new dashboard row.

    - Validates that dashboard_name is not already taken.
    - Validates that dashboard_url/dashboard_title is not already taken in edit mode.
    - Validates that system_dw_id exists.
    - Generates dashboard_gid.
    - Sets initial mode to 'edit', is_private=0, is_published=0.
    - Applies legacy default global_css, creates empty dash_template, and first section.
    """
    _assert_dashboard_name_available(db, payload.dashboard_name)
    _assert_dashboard_url_available(db, payload.dashboard_url)

    dw = (
        db.query(SystemDatawarehouse.id)
        .filter(SystemDatawarehouse.id == payload.datawarehouse_connection)
        .first()
    )
    if not dw:
        raise NotFound(
            f"Data warehouse with id {payload.datawarehouse_connection} not found",
            error_code="DATAWAREHOUSE_NOT_FOUND",
        )

    dashboard = Dashboard(
        dashboard_gid=_generate_dashboard_gid(),
        dashboard_name=payload.dashboard_name,
        dashboard_title=payload.dashboard_url,
        map_url=payload.map_url,
        resolution=payload.resolution,
        system_dw_id=payload.datawarehouse_connection,
        global_css=DEFAULT_GLOBAL_CSS,
        mode="edit",
        is_private=0,
        is_published=0,
        enable_insights=False,
        created_user_id=user_id,
        modified_user_id=user_id,
    )

    db.info["audit_dw_id"] = payload.datawarehouse_connection
    db.add(dashboard)
    db.flush()

    template = create_empty_template(db, user_id=user_id, dashboard_id=dashboard.id)
    dashboard.template_id = template.id

    create_default_section(
        db,
        dashboard_id=dashboard.id,
        system_dw_id=payload.datawarehouse_connection,
        user_id=user_id,
    )
    return dashboard


def delete_dashboard(db: Session, dashboard_id: int) -> None:
    """
    Delete a dashboard and rely on DB FK cascades for related rows.

    Publish clones (source_dash_id → edit dashboard) are removed automatically
    via ON DELETE CASCADE on source_dash_id.

    Unpublish (DELETE of a publish-mode row) clears ``is_published`` on the
    linked edit dashboard.

    Dashboard-scoped ``iam_user_role`` rows also cascade from the dashboard, but
    ``iam_user_role_content.user_role_id`` is RESTRICT — delete those content
    rows first for this dashboard and any publish clones that will cascade away.
    """
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise NotFound(
            f"Dashboard with id {dashboard_id} not found",
            error_code="DASHBOARD_NOT_FOUND",
        )

    db.info["audit_dw_id"] = dashboard.system_dw_id

    # Unpublish: clear published flag on the edit source before removing the clone.
    if (
        dashboard.mode == DASHBOARD_MODE_PUBLISH
        and dashboard.source_dash_id is not None
    ):
        edit_dashboard = (
            db.query(Dashboard)
            .filter(Dashboard.id == dashboard.source_dash_id)
            .first()
        )
        if edit_dashboard:
            edit_dashboard.is_published = 0

    affected_dashboard_ids = [dashboard_id]
    publish_clone_ids = [
        row[0]
        for row in db.query(Dashboard.id)
        .filter(Dashboard.source_dash_id == dashboard_id)
        .all()
    ]
    affected_dashboard_ids.extend(publish_clone_ids)

    user_role_ids = [
        row[0]
        for row in db.query(IamUserRole.id)
        .filter(IamUserRole.dashboard_id.in_(affected_dashboard_ids))
        .all()
    ]
    if user_role_ids:
        content_count = (
            db.query(IamUserRoleContent)
            .filter(IamUserRoleContent.user_role_id.in_(user_role_ids))
            .count()
        )
        db.query(IamUserRoleContent).filter(
            IamUserRoleContent.user_role_id.in_(user_role_ids),
        ).delete(synchronize_session=False)
        app_buffer_delete_step(
            db,
            module="dashboard_iam_content",
            description=f"delete IAM role content for dashboard_id={dashboard_id} (affected_ids={affected_dashboard_ids})",
            previous_value={"count": content_count, "user_role_ids": user_role_ids[:500]},
        )

    db.delete(dashboard)
    db.flush()


_JSON_UPDATE_FIELDS: dict[str, str] = {
    "section_settings": "section_settings",
    "header_html": "header_html",
    "footer_html": "footer_html",
    "mobile_header_html": "mobile_header_html",
    "mobile_footer_html": "mobile_footer_html",
    "settings": "settings",
    "subgroup_color": "subgroup_color",
    "color_theme": "color_theme",
    "dfa_profile_settings": "dfa_profile_settings",
    "lang_selected": "lang_selected",
    "dfa_visualizer_settings": "dfa_visualizer_settings",
    "default_area_ids": "def_area_id",
}

_BOOL_SMALLINT_FIELDS: dict[str, str] = {
    "is_enable_profile": "is_enable_profile",
    "is_global_profile": "is_global_profile",
    "profiles_download": "profiles_download",
    "is_multi_lang_active": "is_multi_lang_active",
    "is_private": "is_private",
}

_SCALAR_UPDATE_FIELDS: dict[str, str] = {
    "dashboard_name": "dashboard_name",
    "map_url": "map_url",
    "resolution": "resolution",
    "body_color": "body_color",
    "banner_color": "banner_color",
    "title_color": "title_color",
    "global_css": "global_css",
    "global_js": "global_js",
    "vo_border_color": "vo_border_color",
    "vo_border_width": "vo_border_width",
    "vo_border_radius": "vo_border_radius",
    "footer_bg_color": "footer_bg_color",
    "profile_prefix": "profile_prefix",
    "global_file_name": "global_file_name",
    "profiles_suffix": "profiles_suffix",
    "area_lvl_from": "area_lvl_from",
    "area_lvl_to": "area_lvl_to",
    "banner_logo": "banner_logo",
    "favicon": "favicon",
    "logo_id": "logo_id",
}


def _sync_visualization_dw_ids(
    db: Session,
    *,
    dashboard_id: int,
    new_dw_id: int,
    user_id: int,
) -> None:
    """Propagate warehouse change to dash_visualization rows for this dashboard."""
    db.query(DashVisualization).filter(
        DashVisualization.dashboard_id == dashboard_id
    ).update(
        {
            DashVisualization.system_dw_id: new_dw_id,
            DashVisualization.modified_user_id: user_id,
        },
        synchronize_session=False,
    )


def _to_update_response(dashboard: Dashboard) -> dict[str, Any]:
    """Minimal PATCH response — same shape as POST create."""
    return {
        "id": dashboard.id,
        "dashboard_gid": dashboard.dashboard_gid,
        "dashboard_name": dashboard.dashboard_name,
        "dashboard_url": dashboard.dashboard_title,
        "map_url": dashboard.map_url,
        "resolution": dashboard.resolution,
        "system_dw_id": dashboard.system_dw_id,
        "mode": dashboard.mode,
    }


def _apply_dashboard_updates(
    dashboard: Dashboard,
    updates: dict[str, Any],
    *,
    user_id: int,
) -> None:
    """Map PATCH payload fields onto the dashboard ORM instance."""
    if "dashboard_url" in updates:
        dashboard.dashboard_title = updates["dashboard_url"]

    for request_key, column_name in _SCALAR_UPDATE_FIELDS.items():
        if request_key in updates:
            setattr(dashboard, column_name, updates[request_key])

    for request_key, column_name in _JSON_UPDATE_FIELDS.items():
        if request_key in updates:
            setattr(dashboard, column_name, serialize_json_column(updates[request_key]))

    for request_key, column_name in _BOOL_SMALLINT_FIELDS.items():
        if request_key in updates:
            setattr(dashboard, column_name, bool_to_smallint(updates[request_key]))

    if "enable_insights" in updates:
        dashboard.enable_insights = bool(updates["enable_insights"])

    if "ai_settings" in updates:
        dashboard.ai_settings = merge_ai_settings_for_write(
            dashboard.ai_settings,
            updates["ai_settings"],
        )

    dashboard.modified_user_id = user_id


def update_dashboard(
    db: Session,
    dashboard_id: int,
    payload: DashboardUpdateRequest,
    user_id: int,
) -> Dashboard:
    """
    Partially update a dashboard (legacy service 104 / updateDashboardDetails).

    Access is enforced by middleware (PERMISSION on sys_dashboard UPDATE).
    """
    dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_id).first()
    if not dashboard:
        raise NotFound(
            f"Dashboard with id {dashboard_id} not found",
            error_code="DASHBOARD_NOT_FOUND",
        )

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return dashboard

    db.info["audit_dw_id"] = dashboard.system_dw_id

    if "dashboard_name" in updates:
        _assert_dashboard_name_available(
            db,
            updates["dashboard_name"],
            exclude_id=dashboard_id,
        )

    if "dashboard_url" in updates:
        _assert_dashboard_url_available(
            db,
            updates["dashboard_url"],
            exclude_id=dashboard_id,
        )

    if "datawarehouse_connection" in updates:
        new_dw_id = updates["datawarehouse_connection"]
        dw = (
            db.query(SystemDatawarehouse.id)
            .filter(SystemDatawarehouse.id == new_dw_id)
            .first()
        )
        if not dw:
            raise NotFound(
                f"Data warehouse with id {new_dw_id} not found",
                error_code="DATAWAREHOUSE_NOT_FOUND",
            )
        if dashboard.system_dw_id != new_dw_id:
            viz_count = (
                db.query(DashVisualization)
                .filter(DashVisualization.dashboard_id == dashboard_id)
                .count()
            )
            _sync_visualization_dw_ids(
                db,
                dashboard_id=dashboard_id,
                new_dw_id=new_dw_id,
                user_id=user_id,
            )
            app_buffer_manual_audit(
                db,
                action="UPDATE",
                module="dashboard_visualization",
                identifier=str(dashboard_id),
                previous_value={"system_dw_id": dashboard.system_dw_id},
                new_value={"system_dw_id": new_dw_id},
                description=f"bulk DW id sync for dashboard_id={dashboard_id}, {viz_count} viz rows",
            )
            dashboard.system_dw_id = new_dw_id
            db.info["audit_dw_id"] = new_dw_id
        updates.pop("datawarehouse_connection")

    _apply_dashboard_updates(dashboard, updates, user_id=user_id)
    db.flush()
    return dashboard


_DASHBOARD_CLONE_EXCLUDE = frozenset(
    {"id", "dashboard_gid", "template_id", "created", "modified"}
)
_VIZ_CLONE_EXCLUDE = frozenset({"id"})
_SECTION_CLONE_EXCLUDE = frozenset({"id"})
_TEMPLATE_CLONE_EXCLUDE = frozenset({"id"})


def _column_values(entity: object, *, exclude: frozenset[str]) -> dict[str, Any]:
    """Copy SQLAlchemy column values from a mapped instance."""
    mapper = sa_inspect(entity.__class__)
    return {
        col.key: getattr(entity, col.key)
        for col in mapper.columns
        if col.key not in exclude
    }


def _clone_row_data(
    entity: object,
    *,
    exclude: frozenset[str],
    overrides: dict[str, Any],
) -> dict[str, Any]:
    """Copy column values and apply overrides without duplicate keyword args."""
    data = _column_values(entity, exclude=exclude)
    for key in overrides:
        data.pop(key, None)
    return {**data, **overrides}


def clone_dashboard(
    db: Session,
    source_id: int,
    user_id: int,
    payload: DashboardCloneRequest | None = None,
    *,
    app_key: str,
) -> Dashboard:
    """
    Deep-clone an edit-mode dashboard (legacy service 141 / action=copy).

    Copies dashboard metadata, visualizations, template (with remapped gridster),
    and sections. Assigns DFA_DASH_ADMIN on the clone to the acting user
    (legacy createRDashboardUser).
    """
    source = db.query(Dashboard).filter(Dashboard.id == source_id).first()
    if not source:
        raise NotFound(
            f"Dashboard with id {source_id} not found",
            error_code="DASHBOARD_NOT_FOUND",
        )

    if source.mode != DASHBOARD_MODE_EDIT:
        raise BadRequest(
            "Only edit-mode dashboards can be cloned",
            error_code="CLONE_SOURCE_NOT_EDIT",
        )

    db.info["audit_dw_id"] = source.system_dw_id
    db.info["audit_app_key"] = app_key

    body = payload or DashboardCloneRequest()
    fields_set = body.model_fields_set
    clone_name, clone_title = resolve_clone_names(
        db,
        source.dashboard_name,
        source.dashboard_title,
        explicit_name=body.dashboard_name if "dashboard_name" in fields_set else None,
        explicit_url=body.dashboard_url if "dashboard_url" in fields_set else None,
    )
    new_gid = (
        body.dashboard_gid
        if "dashboard_gid" in fields_set and body.dashboard_gid
        else _generate_dashboard_gid()
    )
    if "dashboard_gid" in fields_set and body.dashboard_gid:
        existing_gid = (
            db.query(Dashboard.id)
            .filter(Dashboard.dashboard_gid == body.dashboard_gid)
            .first()
        )
        if existing_gid:
            raise Conflict(
                f"Dashboard with gid '{body.dashboard_gid}' already exists",
                error_code="DASHBOARD_GID_EXISTS",
            )

    dash_data = _clone_row_data(
        source,
        exclude=_DASHBOARD_CLONE_EXCLUDE,
        overrides={
            "dashboard_gid": new_gid,
            "dashboard_name": clone_name,
            "dashboard_title": clone_title,
            "mode": DASHBOARD_MODE_EDIT,
            "is_published": 0,
            "source_dash_id": None,
            "created_user_id": user_id,
            "modified_user_id": user_id,
        },
    )
    new_dashboard = Dashboard(**dash_data)
    db.add(new_dashboard)
    db.flush()

    source_viz_rows = (
        db.query(DashVisualization)
        .filter(
            DashVisualization.dashboard_id == source_id,
            DashVisualization.is_deleted == 0,
        )
        .all()
    )
    viz_map: dict[int, int] = {}
    for viz in source_viz_rows:
        viz_data = _clone_row_data(
            viz,
            exclude=_VIZ_CLONE_EXCLUDE,
            overrides={
                "dashboard_id": new_dashboard.id,
                "mode": DASHBOARD_MODE_EDIT,
                "is_deleted": 0,
                "source_viz_id": None,
                "created_user_id": user_id,
                "modified_user_id": user_id,
            },
        )
        new_viz = DashVisualization(**viz_data)
        db.add(new_viz)
        db.flush()
        viz_map[viz.id] = new_viz.id

    for new_viz_id in viz_map.values():
        new_viz = db.get(DashVisualization, new_viz_id)
        if new_viz:
            remap_visualization_child_hooks(new_viz, viz_map)

    source_template: DashboardTemplate | None = None
    if source.template_id:
        source_template = (
            db.query(DashboardTemplate)
            .filter(DashboardTemplate.id == source.template_id)
            .first()
        )

    gridster_src = parse_json_column(source_template.gridster if source_template else None)
    global_filter_src = parse_json_column(
        source_template.global_filter_gridster if source_template else None
    )
    remapped_gridster = (
        remap_gridster_viz_ids(gridster_src, viz_map) if gridster_src else None
    )
    remapped_global = (
        remap_global_filter_gridster(global_filter_src, viz_map)
        if global_filter_src
        else None
    )

    if source_template:
        tpl_data = _clone_row_data(
            source_template,
            exclude=_TEMPLATE_CLONE_EXCLUDE,
            overrides={
                "dashboard_id": new_dashboard.id,
                "gridster": serialize_json_column(remapped_gridster),
                "global_filter_gridster": serialize_json_column(remapped_global),
                "modified_user_id": user_id,
            },
        )
        new_template = DashboardTemplate(**tpl_data)
    else:
        new_template = DashboardTemplate(
            dashboard_id=new_dashboard.id,
            gridster=serialize_json_column(remapped_gridster),
            global_filter_gridster=serialize_json_column(remapped_global),
            thumbnail=None,
            is_system=TEMPLATE_FLAG_NO,
            is_default=TEMPLATE_FLAG_NO,
            counter=0,
            modified_user_id=user_id,
        )

    db.add(new_template)
    db.flush()
    new_dashboard.template_id = new_template.id

    source_sections = (
        db.query(DashboardSection)
        .filter(DashboardSection.dashboard_id == source_id)
        .order_by(DashboardSection.order.asc())
        .all()
    )
    section_map: dict[int, int] = {}
    for section in source_sections:
        section_data = _clone_row_data(
            section,
            exclude=_SECTION_CLONE_EXCLUDE,
            overrides={
                "dashboard_id": new_dashboard.id,
                "created_user_id": user_id,
                "modified_user_id": user_id,
            },
        )
        new_section = DashboardSection(**section_data)
        db.add(new_section)
        db.flush()
        section_map[section.id] = new_section.id

    if section_map and remapped_gridster is not None:
        final_gridster = remap_gridster_section_keys(remapped_gridster, section_map)
        new_template.gridster = serialize_json_column(final_gridster)

    db.flush()
    assign_dashboard_owner_admin(
        db,
        dashboard_id=new_dashboard.id,
        user_id=user_id,
        app_key=app_key,
        dw_id=new_dashboard.system_dw_id,
        created_user_id=user_id,
    )
    return new_dashboard


def _next_dashboard_version(current: str | None) -> str:
    """Increment dashboard_version for re-publish (legacy parity)."""
    try:
        return str(int(current or 0) + 1)
    except (TypeError, ValueError):
        return "1"


def _persist_dashboard_dependencies(
    raw_settings: Any,
    viz_types: list[str | None],
) -> str | None:
    """Merge dashboardDependency into settings JSON for publish persistence."""
    settings = parse_json_field(raw_settings)
    if settings is None:
        settings = {}
    if not isinstance(settings, dict):
        settings = {}

    enriched = dict(settings)
    enriched["dashboardDependency"] = _compute_viewer_dependencies(viz_types)
    return serialize_json_column(enriched)


def _copy_sections_from_edit(
    db: Session,
    *,
    edit_id: int,
    publish_id: int,
    user_id: int,
) -> dict[int, int]:
    """Replace publish sections with copies from the edit dashboard."""
    db.query(DashboardSection).filter(
        DashboardSection.dashboard_id == publish_id
    ).delete(synchronize_session=False)

    source_sections = (
        db.query(DashboardSection)
        .filter(DashboardSection.dashboard_id == edit_id)
        .order_by(DashboardSection.order.asc())
        .all()
    )
    section_map: dict[int, int] = {}
    for section in source_sections:
        section_data = _clone_row_data(
            section,
            exclude=_SECTION_CLONE_EXCLUDE,
            overrides={
                "dashboard_id": publish_id,
                "created_user_id": user_id,
                "modified_user_id": user_id,
            },
        )
        new_section = DashboardSection(**section_data)
        db.add(new_section)
        db.flush()
        section_map[section.id] = new_section.id
    return section_map


def _sync_publish_visualizations(
    db: Session,
    *,
    edit_id: int,
    publish_id: int,
    user_id: int,
) -> dict[int, int]:
    """Upsert edit visualizations onto the publish dashboard; return edit→publish id map.

    Publish clones whose ``source_viz_id`` no longer exists on the edit dashboard
    are hard-deleted so republish does not leave stale visualization rows.
    """
    edit_viz_rows = (
        db.query(DashVisualization)
        .filter(
            DashVisualization.dashboard_id == edit_id,
            DashVisualization.is_deleted == 0,
        )
        .all()
    )
    viz_map: dict[int, int] = {}
    for edit_viz in edit_viz_rows:
        existing_pub_viz = (
            db.query(DashVisualization)
            .filter(
                DashVisualization.dashboard_id == publish_id,
                DashVisualization.source_viz_id == edit_viz.id,
            )
            .first()
        )
        overrides: dict[str, Any] = {
            "dashboard_id": publish_id,
            "mode": DASHBOARD_MODE_PUBLISH,
            "source_viz_id": edit_viz.id,
            "is_deleted": 0,
            "modified_user_id": user_id,
        }
        if existing_pub_viz:
            viz_data = _clone_row_data(
                edit_viz,
                exclude=_VIZ_CLONE_EXCLUDE,
                overrides=overrides,
            )
            for key, value in viz_data.items():
                if key != "id":
                    setattr(existing_pub_viz, key, value)
            viz_map[edit_viz.id] = existing_pub_viz.id
        else:
            viz_data = _clone_row_data(
                edit_viz,
                exclude=_VIZ_CLONE_EXCLUDE,
                overrides={**overrides, "created_user_id": user_id},
            )
            new_viz = DashVisualization(**viz_data)
            db.add(new_viz)
            db.flush()
            viz_map[edit_viz.id] = new_viz.id

    for publish_viz_id in viz_map.values():
        publish_viz = db.get(DashVisualization, publish_viz_id)
        if publish_viz:
            remap_visualization_child_hooks(publish_viz, viz_map)

    active_edit_viz_ids = {edit_viz.id for edit_viz in edit_viz_rows}
    orphan_query = db.query(DashVisualization).filter(
        DashVisualization.dashboard_id == publish_id,
        DashVisualization.source_viz_id.isnot(None),
    )
    if active_edit_viz_ids:
        orphan_query = orphan_query.filter(
            ~DashVisualization.source_viz_id.in_(active_edit_viz_ids)
        )
    orphan_rows = orphan_query.all()
    for orphan in orphan_rows:
        db.delete(orphan)
    if orphan_rows:
        db.flush()

    return viz_map


def _apply_publish_template(
    db: Session,
    *,
    edit_dashboard: Dashboard,
    publish_dashboard: Dashboard,
    viz_map: dict[int, int],
    user_id: int,
    is_republish: bool,
) -> DashboardTemplate:
    """Create or update publish template with remapped gridster from edit template."""
    source_template: DashboardTemplate | None = None
    if edit_dashboard.template_id:
        source_template = (
            db.query(DashboardTemplate)
            .filter(DashboardTemplate.id == edit_dashboard.template_id)
            .first()
        )

    gridster_src = parse_json_column(source_template.gridster if source_template else None)
    global_filter_src = parse_json_column(
        source_template.global_filter_gridster if source_template else None
    )
    remapped_gridster = (
        remap_gridster_viz_ids(gridster_src, viz_map) if gridster_src else None
    )
    remapped_global = (
        remap_global_filter_gridster(global_filter_src, viz_map)
        if global_filter_src
        else None
    )

    if is_republish and publish_dashboard.template_id:
        template_row = (
            db.query(DashboardTemplate)
            .filter(DashboardTemplate.id == publish_dashboard.template_id)
            .first()
        )
        if template_row:
            if source_template:
                tpl_data = _clone_row_data(
                    source_template,
                    exclude=_TEMPLATE_CLONE_EXCLUDE,
                    overrides={
                        "dashboard_id": publish_dashboard.id,
                        "gridster": serialize_json_column(remapped_gridster),
                        "global_filter_gridster": serialize_json_column(remapped_global),
                        "modified_user_id": user_id,
                    },
                )
                for key, value in tpl_data.items():
                    if key != "id":
                        setattr(template_row, key, value)
            else:
                template_row.gridster = serialize_json_column(remapped_gridster)
                template_row.global_filter_gridster = serialize_json_column(remapped_global)
                template_row.modified_user_id = user_id
            return template_row

    if source_template:
        tpl_data = _clone_row_data(
            source_template,
            exclude=_TEMPLATE_CLONE_EXCLUDE,
            overrides={
                "dashboard_id": publish_dashboard.id,
                "gridster": serialize_json_column(remapped_gridster),
                "global_filter_gridster": serialize_json_column(remapped_global),
                "modified_user_id": user_id,
            },
        )
        new_template = DashboardTemplate(**tpl_data)
    else:
        new_template = DashboardTemplate(
            dashboard_id=publish_dashboard.id,
            gridster=serialize_json_column(remapped_gridster),
            global_filter_gridster=serialize_json_column(remapped_global),
            thumbnail=None,
            is_system=TEMPLATE_FLAG_NO,
            is_default=TEMPLATE_FLAG_NO,
            counter=0,
            modified_user_id=user_id,
        )

    db.add(new_template)
    db.flush()
    publish_dashboard.template_id = new_template.id
    return new_template


def publish_dashboard(
    db: Session,
    edit_id: int,
    user_id: int,
    payload: DashboardPublishRequest | None = None,
) -> Dashboard:
    """
    Publish or re-publish an edit dashboard (legacy service 141 / action=publish).

    Syncs edit dashboard content to its publish clone and sets ``is_published=1``
    on both the edit and publish rows. IAM membership stays on the edit dashboard
    (middleware resolves publish path → ``source_dash_id``).

    Runtime viewer data is served via GET /dash/viewer-bundle/{dashboard_title}.

    Legacy parity: publish does not run edit-mode title uniqueness checks (service 142).
    Publish-mode title uniqueness is enforced for public URL routing.
    """
    edit_dashboard = db.query(Dashboard).filter(Dashboard.id == edit_id).first()
    if not edit_dashboard:
        raise NotFound(
            f"Dashboard with id {edit_id} not found",
            error_code="DASHBOARD_NOT_FOUND",
        )

    if edit_dashboard.mode != DASHBOARD_MODE_EDIT:
        raise BadRequest(
            "Only edit-mode dashboards can be published",
            error_code="PUBLISH_SOURCE_NOT_EDIT",
        )

    db.info["audit_dw_id"] = edit_dashboard.system_dw_id

    existing_publish = (
        db.query(Dashboard)
        .filter(
            Dashboard.mode == DASHBOARD_MODE_PUBLISH,
            Dashboard.source_dash_id == edit_id,
        )
        .first()
    )

    body = payload or DashboardPublishRequest()
    fields_set = body.model_fields_set
    if "dashboard_url" in fields_set and body.dashboard_url is not None:
        publish_title = body.dashboard_url
    else:
        publish_title = edit_dashboard.dashboard_title

    _assert_publish_dashboard_url_available(
        db,
        publish_title or "",
        exclude_publish_id=existing_publish.id if existing_publish else None,
    )

    is_republish = existing_publish is not None

    if is_republish:
        assert existing_publish is not None
        dash_data = _clone_row_data(
            edit_dashboard,
            exclude=_DASHBOARD_CLONE_EXCLUDE,
            overrides={
                "mode": DASHBOARD_MODE_PUBLISH,
                "source_dash_id": edit_id,
                "dashboard_title": publish_title,
                "dashboard_version": _next_dashboard_version(
                    existing_publish.dashboard_version
                ),
                "is_published": 1,
                "modified_user_id": user_id,
            },
        )
        for key, value in dash_data.items():
            if key not in ("id", "dashboard_gid", "template_id", "created", "created_user_id"):
                setattr(existing_publish, key, value)
        publish_row = existing_publish
    else:
        dash_data = _clone_row_data(
            edit_dashboard,
            exclude=_DASHBOARD_CLONE_EXCLUDE,
            overrides={
                "dashboard_gid": _generate_dashboard_gid(),
                "dashboard_title": publish_title,
                "mode": DASHBOARD_MODE_PUBLISH,
                "source_dash_id": edit_id,
                "dashboard_version": edit_dashboard.dashboard_version or "1",
                "is_published": 1,
                "created_user_id": user_id,
                "modified_user_id": user_id,
            },
        )
        publish_row = Dashboard(**dash_data)
        db.add(publish_row)
        db.flush()

    viz_map = _sync_publish_visualizations(
        db,
        edit_id=edit_id,
        publish_id=publish_row.id,
        user_id=user_id,
    )

    template_row = _apply_publish_template(
        db,
        edit_dashboard=edit_dashboard,
        publish_dashboard=publish_row,
        viz_map=viz_map,
        user_id=user_id,
        is_republish=is_republish,
    )

    section_map = _copy_sections_from_edit(
        db,
        edit_id=edit_id,
        publish_id=publish_row.id,
        user_id=user_id,
    )

    if section_map and template_row.gridster is not None:
        parsed_gridster = parse_json_column(template_row.gridster)
        if parsed_gridster is not None:
            remapped = remap_gridster_viz_ids(parsed_gridster, viz_map)
            final_gridster = remap_gridster_section_keys(remapped, section_map)
            template_row.gridster = serialize_json_column(final_gridster)

    layout_viz_rows = (
        db.query(DashVisualization.type)
        .filter(
            DashVisualization.dashboard_id == publish_row.id,
            DashVisualization.is_deleted == 0,
            DashVisualization.is_used_in_layout == 1,
        )
        .all()
    )
    viz_types = [row[0] for row in layout_viz_rows]
    publish_row.settings = _persist_dashboard_dependencies(
        publish_row.settings,
        viz_types,
    )

    edit_dashboard.is_published = 1
    publish_row.is_published = 1
    db.flush()

    return publish_row


def _to_publish_response(edit_id: int, publish: Dashboard) -> dict[str, Any]:
    """Minimal response for POST /dash/{dashboard_id}/publish."""
    return {
        "id": publish.id,
        "source_dashboard_id": edit_id,
        "dashboard_gid": publish.dashboard_gid,
        "dashboard_name": publish.dashboard_name,
        "dashboard_url": publish.dashboard_title,
        "mode": publish.mode,
        "dashboard_version": publish.dashboard_version,
        "system_dw_id": publish.system_dw_id,
    }


def _fetch_dw_metadata(
    db: Session,
    system_dw_id: int | None,
) -> tuple[Optional[str], Optional[str]]:
    """Return (database_name, database_type) for a warehouse id."""
    if not system_dw_id:
        return None, None

    row = (
        db.query(
            SystemDatawarehouse.dw_connection_name,
            SystemDatawarehouse.dw_connection_details,
        )
        .filter(SystemDatawarehouse.id == system_dw_id)
        .first()
    )
    if not row:
        return None, None

    db_name, db_details = row
    db_type: Optional[str] = None
    if db_details:
        try:
            db_type = json.loads(db_details).get("db_source_type") or None
        except (json.JSONDecodeError, TypeError):
            db_type = None
    return db_name, db_type


def _compute_viewer_dependencies(viz_types: list[str | None]) -> list[str]:
    """Legacy publish parity: highcharts default + per-type script deps."""
    deps: list[str] = [VIEWER_DEPENDENCY_HIGHCHARTS]
    seen = {VIEWER_DEPENDENCY_HIGHCHARTS}
    for viz_type in viz_types:
        if not viz_type:
            continue
        dep = VIEWER_VIZ_TYPE_DEPENDENCIES.get(viz_type)
        if dep and dep not in seen:
            deps.append(dep)
            seen.add(dep)
    return deps


def _enrich_viewer_settings(
    raw_settings: Any,
    viz_types: list[str | None],
) -> Any | None:
    """Inject dashboardDependency into settings when missing (response-only)."""
    settings = parse_json_field(raw_settings)
    if settings is None:
        settings = {}
    if not isinstance(settings, dict):
        return settings

    if settings.get("dashboardDependency"):
        return settings

    enriched = dict(settings)
    enriched["dashboardDependency"] = _compute_viewer_dependencies(viz_types)
    return enriched


def _to_viewer_response(
    dashboard: Dashboard,
    *,
    database_name: Optional[str],
    database_type: Optional[str],
    artifact: Optional[Artifact],
    settings: Any | None,
) -> DashboardViewerResponse:
    """Map ORM dashboard to slim publish-viewer response."""
    artifact_response: Optional[DashboardArtifactResponse] = None
    if artifact is not None:
        artifact_response = DashboardArtifactResponse(
            id=artifact.id,
            type=artifact.type,
            filename=artifact.filename,
            file_ext=artifact.file_ext,
            file_size=artifact.file_size,
            file_width=artifact.file_width,
            file_height=artifact.file_height,
        )

    return DashboardViewerResponse(
        id=dashboard.id,
        dashboard_gid=dashboard.dashboard_gid,
        dashboard_name=dashboard.dashboard_name,
        dashboard_url=dashboard.dashboard_title,
        dashboard_version=dashboard.dashboard_version,
        mode=dashboard.mode,
        type=dashboard.type,
        datawarehouse_connection=dashboard.system_dw_id,
        database_name=database_name,
        database_type=database_type,
        body_color=dashboard.body_color,
        banner_color=dashboard.banner_color,
        title_color=dashboard.title_color,
        resolution=dashboard.resolution,
        global_css=dashboard.global_css,
        global_js=dashboard.global_js,
        section_settings=parse_json_field(dashboard.section_settings),
        color_theme=parse_json_field(dashboard.color_theme),
        vo_border_color=dashboard.vo_border_color,
        vo_border_width=dashboard.vo_border_width,
        vo_border_radius=dashboard.vo_border_radius,
        header_html=parse_json_or_raw_field(dashboard.header_html),
        footer_html=parse_json_or_raw_field(dashboard.footer_html),
        mobile_header_html=parse_json_or_raw_field(dashboard.mobile_header_html),
        mobile_footer_html=parse_json_or_raw_field(dashboard.mobile_footer_html),
        footer_bg_color=dashboard.footer_bg_color,
        is_enable_profile=bool_from_smallint(dashboard.is_enable_profile),
        is_global_profile=bool_from_smallint(dashboard.is_global_profile),
        profile_prefix=dashboard.profile_prefix,
        global_file_name=dashboard.global_file_name,
        profiles_download=bool_from_smallint(dashboard.profiles_download),
        profiles_suffix=dashboard.profiles_suffix,
        dfa_profile_settings=parse_json_field(dashboard.dfa_profile_settings),
        area_lvl_from=dashboard.area_lvl_from,
        area_lvl_to=dashboard.area_lvl_to,
        settings=settings,
        subgroup_color=parse_json_field(dashboard.subgroup_color),
        dfa_visualizer_settings=parse_json_field(dashboard.dfa_visualizer_settings),
        lang_selected=parse_json_field(dashboard.lang_selected),
        is_multi_lang_active=bool_from_smallint(dashboard.is_multi_lang_active),
        map_url=dashboard.map_url,
        banner_logo=dashboard.banner_logo,
        favicon=dashboard.favicon,
        logo_id=dashboard.logo_id,
        artifact=artifact_response,
        enable_insights=bool(dashboard.enable_insights),
        ai_settings=redact_ai_settings(
            bool(dashboard.enable_insights),
            dashboard.ai_settings,
        ),
        is_private=bool_from_smallint(dashboard.is_private),
        is_published=bool_from_smallint(dashboard.is_published),
        source_dash_id=dashboard.source_dash_id,
        created=dashboard.created,
        modified=dashboard.modified,
    )


def _to_section_viewer_item(section: DashboardSection) -> DashboardSectionViewerItem:
    """Map section ORM row to viewer bundle item."""
    parsed_name = parse_json_field(section.section_name)
    section_name: Any = parsed_name if parsed_name is not None else section.section_name
    return DashboardSectionViewerItem(
        id=section.id,
        section_name=section_name,
        hide_global_filter=bool_from_smallint(section.hide_global_filter),
        order=section.order,
        reload_section=bool_from_smallint(section.reload_section),
        resolution=section.resolution,
    )


def get_viewer_bundle(
    db: Session,
    dashboard_title: str,
    *,
    user_id: Optional[int] = None,
    app_key: str,
    is_super_admin: bool = False,
) -> DashboardViewerBundleResponse:
    """
    Return publish viewer runtime bundle for GET /dash/viewer-bundle/{dashboard_title}.

    Resolves a publish-mode dashboard by exact dashboard_title match (after strip).
    Public dashboards (is_private=0) need only APP_CLIENT.
    Private dashboards require the caller to be on the edit-dashboard allowlist
    (iam_user_role.dashboard_id = source_dash_id); otherwise 403.
    """
    title = (dashboard_title or "").strip()
    if not title:
        raise NotFound(
            "Dashboard not found",
            error_code="DASHBOARD_NOT_FOUND",
        )

    dashboard = (
        db.query(Dashboard)
        .filter(
            Dashboard.dashboard_title == title,
            Dashboard.mode == DASHBOARD_MODE_PUBLISH,
        )
        .first()
    )
    if not dashboard:
        raise NotFound(
            f"Published dashboard with title '{title}' not found",
            error_code="DASHBOARD_NOT_FOUND",
        )

    if bool_from_smallint(dashboard.is_private):
        allowlist_dashboard_id = dashboard.source_dash_id or dashboard.id
        _assert_private_viewer_access(
            db,
            allowlist_dashboard_id=allowlist_dashboard_id,
            user_id=user_id,
            app_key=app_key,
            is_super_admin=is_super_admin,
        )

    dashboard_id = dashboard.id
    database_name, database_type = _fetch_dw_metadata(db, dashboard.system_dw_id)

    artifact: Optional[Artifact] = None
    if dashboard.logo_id:
        artifact = db.query(Artifact).filter(Artifact.id == dashboard.logo_id).first()

    visualizations = list_layout_visualizations_for_viewer(db, dashboard_id)
    viz_types = [viz.type for viz in visualizations.values()]
    settings = _enrich_viewer_settings(dashboard.settings, viz_types)

    section_rows = (
        db.query(DashboardSection)
        .filter(DashboardSection.dashboard_id == dashboard_id)
        .order_by(DashboardSection.order.asc(), DashboardSection.id.asc())
        .all()
    )
    sections = [_to_section_viewer_item(row) for row in section_rows]

    template = DashboardTemplateViewerResponse()
    if dashboard.template_id:
        template_row = (
            db.query(DashboardTemplate)
            .filter(DashboardTemplate.id == dashboard.template_id)
            .first()
        )
        if template_row:
            template = DashboardTemplateViewerResponse(
                gridster=parse_json_field(template_row.gridster),
                global_filter_gridster=parse_json_field(
                    template_row.global_filter_gridster
                ),
            )

    return DashboardViewerBundleResponse(
        dashboard=_to_viewer_response(
            dashboard,
            database_name=database_name,
            database_type=database_type,
            artifact=artifact,
            settings=settings,
        ),
        sections=sections,
        template=template,
        visualizations=visualizations,
    )
