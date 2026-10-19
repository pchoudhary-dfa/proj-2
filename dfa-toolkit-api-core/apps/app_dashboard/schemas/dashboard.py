"""
Pydantic schemas for Dashboard create/response.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from apps.app_dashboard.constants import (
    DASHBOARD_RESOLUTION_100_PERCENT,
    DASHBOARD_RESOLUTION_1024PX,
)
from apps.app_dashboard.schemas.visualization import ViewerVisualization


class DashboardResolution(str, Enum):
    """Legacy RESOLUTION dropdown values (core.constant.js)."""

    WIDTH_1024PX = DASHBOARD_RESOLUTION_1024PX
    WIDTH_100_PERCENT = DASHBOARD_RESOLUTION_100_PERCENT


class DashboardCreateRequest(BaseModel):
    """Payload for POST /dash — create a new dashboard."""

    dashboard_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Internal name slug for the dashboard",
    )
    dashboard_url: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Display title (shown to end users). Maps to dashboard_title in DB.",
        alias="dashboard_url",
    )
    map_url: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="DML map API base URL (e.g. https://dfadml.dataforall.org/)",
    )
    resolution: DashboardResolution = Field(
        ...,
        description='Target screen width: "1024px" or "100%" (legacy dropdown options)',
    )
    datawarehouse_connection: int = Field(
        ...,
        description="system_datawarehouse.id — linked data warehouse",
    )

    model_config = ConfigDict(populate_by_name=True)


class DashboardUpdateRequest(BaseModel):
    """Payload for PATCH /dash/{dashboard_id} — partial dashboard update (legacy service 104)."""

    dashboard_name: Optional[str] = Field(None, min_length=1, max_length=255)
    dashboard_url: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Display title. Maps to dashboard_title in DB.",
    )
    map_url: Optional[str] = Field(None, min_length=1, max_length=255)
    resolution: Optional[DashboardResolution] = None
    datawarehouse_connection: Optional[int] = Field(
        None,
        description="system_datawarehouse.id — linked data warehouse",
    )

    body_color: Optional[str] = None
    banner_color: Optional[str] = None
    title_color: Optional[str] = None
    global_css: Optional[str] = None
    global_js: Optional[str] = None
    section_settings: Optional[Any] = None
    color_theme: Optional[Any] = None
    vo_border_color: Optional[str] = None
    vo_border_width: Optional[str] = None
    vo_border_radius: Optional[str] = None

    header_html: Optional[Any] = None
    footer_html: Optional[Any] = None
    mobile_header_html: Optional[Any] = None
    mobile_footer_html: Optional[Any] = None
    footer_bg_color: Optional[str] = None

    is_enable_profile: Optional[bool] = None
    is_global_profile: Optional[bool] = None
    profile_prefix: Optional[str] = None
    global_file_name: Optional[str] = None
    profiles_download: Optional[bool] = None
    profiles_suffix: Optional[str] = None
    dfa_profile_settings: Optional[Any] = None

    area_lvl_from: Optional[int] = None
    area_lvl_to: Optional[int] = None
    default_area_ids: Optional[Any] = None
    lang_selected: Optional[Any] = None
    is_multi_lang_active: Optional[bool] = None

    settings: Optional[Any] = None
    subgroup_color: Optional[Any] = None
    dfa_visualizer_settings: Optional[Any] = None
    banner_logo: Optional[str] = None
    favicon: Optional[str] = None
    logo_id: Optional[int] = None

    enable_insights: Optional[bool] = None
    ai_settings: Optional[Any] = None
    is_private: Optional[bool] = None

    model_config = ConfigDict(extra="ignore")


class DashboardCloneRequest(BaseModel):
    """Optional payload for POST /dash/{dashboard_id}/clone (legacy service 141 copy)."""

    dashboard_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Override internal name slug (legacy dashName)",
    )
    dashboard_url: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Override display title (legacy dashTitle → dashboard_title)",
    )
    dashboard_gid: Optional[str] = Field(
        None,
        min_length=1,
        max_length=60,
        description="Override new dashboard_gid (legacy newDashGid)",
    )

    model_config = ConfigDict(extra="ignore")


class DashboardPublishRequest(BaseModel):
    """Optional payload for POST /dash/{dashboard_id}/publish (legacy service 141 publish)."""

    dashboard_url: Optional[str] = Field(
        None,
        min_length=1,
        max_length=255,
        description="Override display title (legacy dashTitle → dashboard_title)",
    )

    model_config = ConfigDict(extra="ignore")


class DashboardPublishResponse(BaseModel):
    """Response data after publishing an edit dashboard."""

    id: int = Field(..., description="Publish dashboard primary key")
    source_dashboard_id: int = Field(..., description="Edit dashboard primary key")
    dashboard_gid: str
    dashboard_name: str
    dashboard_url: Optional[str] = Field(None, description="Display title")
    mode: Optional[str] = None
    dashboard_version: Optional[str] = None
    system_dw_id: Optional[int] = None


class DashboardCreateResponse(BaseModel):
    """Minimal response data returned after creating a dashboard."""

    id: int = Field(..., description="Auto-incremented primary key")
    dashboard_gid: str = Field(..., description="Unique human-readable global identifier")
    dashboard_name: str
    dashboard_url: Optional[str] = Field(None, description="Display title")
    map_url: Optional[str] = None
    resolution: Optional[DashboardResolution] = None
    system_dw_id: Optional[int] = None
    mode: Optional[str] = None


class DashboardListItem(BaseModel):
    """Single row in GET /dash list response."""

    id: int
    dashboard_gid: str
    dashboard_name: str
    dashboard_url: Optional[str] = Field(None, description="Display title (dashboard_title)")
    map_url: Optional[str] = Field(None, description="DML map API base URL")
    system_dw_id: Optional[int] = None
    database_name: Optional[str] = None
    language_codes: list[str] = Field(
        default_factory=list,
        description="Language codes from the linked warehouse ut_language table",
    )
    mode: Optional[str] = None
    resolution: Optional[str] = None
    modified: Optional[datetime] = None
    publish_id: Optional[int] = None
    published_on: Optional[datetime] = None
    published_url: Optional[str] = Field(
        None,
        description="Published dashboard display title (dashboard_title) when a publish clone exists",
    )
    dashboard_role_id: Optional[int] = None
    dashboard_role_name: Optional[str] = Field(
        None,
        description="Localized role display name from Accept-Language (falls back to en)",
    )

    model_config = ConfigDict(from_attributes=True)


class DashboardArtifactResponse(BaseModel):
    """Logo artifact metadata (excludes binary content)."""

    id: int
    type: Optional[str] = None
    filename: Optional[str] = None
    file_ext: Optional[str] = None
    file_size: Optional[int] = None
    file_width: Optional[int] = None
    file_height: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class DashboardDefaultAreaEntry(BaseModel):
    """Single entry inside the default_area map (legacy getUserDashboards shape)."""

    i: str
    parent_id: str
    n: dict[str, str]
    lvl: Optional[int] = None
    child_exists: bool = False
    selectable: bool = True


class DashboardDetailResponse(BaseModel):
    """Full dashboard payload for GET /dash/{dashboard_id}."""

    id: int
    dashboard_gid: str
    dashboard_name: str
    dashboard_url: Optional[str] = None
    dashboard_version: Optional[str] = None
    template_id: Optional[int] = None
    mode: Optional[str] = None
    type: Optional[str] = None
    source_dash_id: Optional[int] = None

    datawarehouse_connection: Optional[int] = Field(
        None,
        description="system_datawarehouse.id — linked data warehouse",
    )
    database_name: Optional[str] = None
    database_type: Optional[str] = None

    body_color: Optional[str] = None
    banner_color: Optional[str] = None
    title_color: Optional[str] = None
    resolution: Optional[str] = None
    global_css: Optional[str] = None
    global_js: Optional[str] = None
    section_settings: Optional[Any] = None
    color_theme: Optional[Any] = None
    vo_border_color: Optional[str] = None
    vo_border_width: Optional[str] = None
    vo_border_radius: Optional[str] = None

    header_html: Optional[Any] = None
    footer_html: Optional[Any] = None
    mobile_header_html: Optional[Any] = None
    mobile_footer_html: Optional[Any] = None
    footer_bg_color: Optional[str] = None

    is_enable_profile: bool = False
    is_global_profile: bool = False
    profile_prefix: Optional[str] = None
    global_file_name: Optional[str] = None
    profiles_download: bool = False
    profiles_suffix: Optional[str] = None
    dfa_profile_settings: Optional[Any] = None

    area_lvl_from: Optional[int] = None
    area_lvl_to: Optional[int] = None
    default_area: dict[str, Any] = Field(default_factory=dict)

    settings: Optional[Any] = None
    subgroup_color: Optional[Any] = None
    dfa_visualizer_settings: Optional[Any] = None
    lang_selected: Optional[Any] = None
    is_multi_lang_active: bool = False

    map_url: Optional[str] = None
    banner_logo: Optional[str] = None
    favicon: Optional[str] = None
    logo_id: Optional[int] = None
    artifact: Optional[DashboardArtifactResponse] = None

    publish_id: Optional[int] = None
    published_on: Optional[datetime] = None

    dashboard_role_id: Optional[int] = None
    dashboard_role_code: Optional[str] = None
    dashboard_role_name: Optional[str] = None

    enable_insights: bool = False
    ai_settings: Optional[Any] = None

    is_private: bool = False
    is_published: bool = False

    created: Optional[datetime] = None
    modified: Optional[datetime] = None
    created_user_id: Optional[int] = None
    modified_user_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class DashboardViewerResponse(BaseModel):
    """Slim dashboard payload for GET /dash/viewer-bundle/{dashboard_title}."""

    id: int
    dashboard_gid: str
    dashboard_name: str
    dashboard_url: Optional[str] = None
    dashboard_version: Optional[str] = None
    mode: Optional[str] = None
    type: Optional[str] = None

    datawarehouse_connection: Optional[int] = Field(
        None,
        description="system_datawarehouse.id — linked data warehouse",
    )
    database_name: Optional[str] = None
    database_type: Optional[str] = None

    body_color: Optional[str] = None
    banner_color: Optional[str] = None
    title_color: Optional[str] = None
    resolution: Optional[str] = None
    global_css: Optional[str] = None
    global_js: Optional[str] = None
    section_settings: Optional[Any] = None
    color_theme: Optional[Any] = None
    vo_border_color: Optional[str] = None
    vo_border_width: Optional[str] = None
    vo_border_radius: Optional[str] = None

    header_html: Optional[Any] = None
    footer_html: Optional[Any] = None
    mobile_header_html: Optional[Any] = None
    mobile_footer_html: Optional[Any] = None
    footer_bg_color: Optional[str] = None

    is_enable_profile: bool = False
    is_global_profile: bool = False
    profile_prefix: Optional[str] = None
    global_file_name: Optional[str] = None
    profiles_download: bool = False
    profiles_suffix: Optional[str] = None
    dfa_profile_settings: Optional[Any] = None

    area_lvl_from: Optional[int] = None
    area_lvl_to: Optional[int] = None

    settings: Optional[Any] = None
    subgroup_color: Optional[Any] = None
    dfa_visualizer_settings: Optional[Any] = None
    lang_selected: Optional[Any] = None
    is_multi_lang_active: bool = False

    map_url: Optional[str] = None
    banner_logo: Optional[str] = None
    favicon: Optional[str] = None
    logo_id: Optional[int] = None
    artifact: Optional[DashboardArtifactResponse] = None

    enable_insights: bool = False
    ai_settings: Optional[Any] = None

    is_private: bool = False
    is_published: bool = False

    source_dash_id: Optional[int] = Field(
        None,
        description="Edit-mode dashboard id this publish clone was created from (ACL / allowlist scope)",
    )

    created: Optional[datetime] = None
    modified: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DashboardSectionViewerItem(BaseModel):
    """Section row for publish viewer bundle."""

    id: int
    section_name: Optional[Any] = None
    hide_global_filter: bool = False
    order: Optional[int] = None
    reload_section: bool = False
    resolution: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DashboardTemplateViewerResponse(BaseModel):
    """Template gridster layout for publish viewer bundle."""

    gridster: Optional[Any] = None
    global_filter_gridster: Optional[Any] = None


class DashboardViewerBundleResponse(BaseModel):
    """Aggregate publish viewer runtime payload."""

    dashboard: DashboardViewerResponse
    sections: list[DashboardSectionViewerItem]
    template: DashboardTemplateViewerResponse
    visualizations: dict[int, ViewerVisualization] = Field(
        default_factory=dict,
        description="Layout-used visualizations keyed by visualization id (legacy vizSettings)",
    )
