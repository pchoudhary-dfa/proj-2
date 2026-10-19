"""
SQLAlchemy models for the Dashboard module (app_db database).

Tables are created via apps/app_db/migrations/versions/101_* → 106_*.
All tables use the dash_ prefix to namespace app_dashboard in the shared DB.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.mysql import LONGBLOB, LONGTEXT

from apps.app_db.db.core import Base


class Dashboard(Base):
    """dash_dashboards — dashboard metadata, layout settings, and AI configuration."""

    __tablename__ = "dash_dashboards"
    __table_args__ = (
        UniqueConstraint("dashboard_gid", name="uq_dash_dashboards_gid"),
        {"extend_existing": True},
    )

    _audit_enabled = True
    _audit_module = "dashboard"
    _audit_nid_field = "id"
    _audit_gid_field = "dashboard_gid"
    _audit_exclude_fields = (
        "ai_settings"
        # "section_settings",
        # "global_css",
        # "header_html",
        # "footer_html",
        # "mobile_header_html",
        # "mobile_footer_html",
        # "settings",
        # "banner_logo",
        # "favicon",
        # "color_theme",
        # "subgroup_color",
        # "dfa_profile_settings",
    )

    id               = Column(Integer, primary_key=True, autoincrement=True)
    dashboard_gid    = Column(String(60),  nullable=False, comment="Human-readable global identifier")
    dashboard_name   = Column(String(255), nullable=False, comment="Internal name slug")
    dashboard_title  = Column(String(255), nullable=True,  comment="Display title shown to end users")
    dashboard_version= Column(String(20),  nullable=True,  comment="Version tag")

    system_dw_id = Column(
        Integer,
        ForeignKey("system_datawarehouse.id", ondelete="SET NULL"),
        nullable=True,
        comment="FK: system_datawarehouse.id — linked data warehouse",
    )
    template_id = Column(
        Integer,
        ForeignKey("dash_template.id", ondelete="SET NULL"),
        nullable=True,
        comment="FK: dash_template.id — per-dashboard gridster layout template",
    )

    type         = Column(String(50), nullable=True,  comment="Dashboard type discriminator")
    mode         = Column(String(50), nullable=True,  comment="Display mode")
    body_color   = Column(String(20), nullable=True,  comment="Body background colour hex")
    banner_color = Column(String(20), nullable=True,  comment="Banner background colour hex")
    title_color  = Column(String(20), nullable=True,  comment="Title text colour hex")
    resolution   = Column(String(50), nullable=True,  comment="Target screen resolution")

    map_url     = Column(String(255), nullable=True, comment="DML map API base URL (e.g. https://dfadml.dataforall.org/)")

    banner_logo = Column(Text,    nullable=True, comment="Banner logo identifier or data-URL")
    favicon     = Column(Text,    nullable=True, comment="Favicon data-URL or path")
    logo_id     = Column(Integer, nullable=True, comment="Artifact id for the dashboard logo")

    section_settings = Column(LONGTEXT, nullable=True, comment="JSON: per-section layout settings")
    global_css       = Column(LONGTEXT, nullable=True, comment="Custom global CSS injected into the dashboard")
    global_js        = Column(LONGTEXT, nullable=True, comment="Custom global JS injected into the dashboard")
    settings         = Column(LONGTEXT, nullable=True, comment="JSON: miscellaneous dashboard settings")
    header_html      = Column(LONGTEXT, nullable=True, comment="Custom header HTML")
    footer_html      = Column(LONGTEXT, nullable=True, comment="Custom footer HTML")
    mobile_header_html = Column(LONGTEXT, nullable=True, comment="Custom mobile header HTML (JSON per locale)")
    mobile_footer_html = Column(LONGTEXT, nullable=True, comment="Custom mobile footer HTML (JSON per locale)")
    footer_bg_color    = Column(String(255), nullable=True, comment="Footer background colour")
    vo_border_color    = Column(String(255), nullable=True, comment="Visualization border colour")
    vo_border_width    = Column(String(255), nullable=True, comment="Visualization border width")
    vo_border_radius   = Column(String(255), nullable=True, comment="Visualization border radius")

    area_lvl_from = Column(Integer, nullable=True, comment="Area level filter range — from")
    area_lvl_to   = Column(Integer, nullable=True, comment="Area level filter range — to")
    def_area_id   = Column(Text,    nullable=True, comment="JSON array of default area IDs")
    lang_selected = Column(Text,    nullable=True, comment="Selected locale(s)")
    is_multi_lang_active = Column(SmallInteger, nullable=True, default=0, comment="1 = multi-language UI enabled")

    is_enable_profile  = Column(SmallInteger, nullable=False, default=0, comment="1 = area profile feature enabled")
    is_global_profile  = Column(SmallInteger, nullable=False, default=0, comment="1 = global profile mode")
    profile_prefix     = Column(String(255), nullable=True, comment="URL prefix for area profiles")
    global_file_name   = Column(String(255), nullable=True, comment="Global profile export filename")
    profiles_download  = Column(SmallInteger, nullable=False, default=0, comment="1 = profile download enabled")
    profiles_suffix    = Column(String(255), nullable=True, comment="Profile export filename suffix")

    subgroup_color          = Column(LONGTEXT, nullable=True, comment="JSON: subgroup colour overrides")
    color_theme             = Column(LONGTEXT, nullable=True, comment="JSON: dashboard colour theme")
    dfa_visualizer_settings = Column(String(255), nullable=True, comment="DFA visualizer settings key or JSON")
    dfa_profile_settings    = Column(LONGTEXT, nullable=True, comment="JSON: area profile configuration")

    is_private   = Column(SmallInteger, nullable=False, default=0, comment="1 = private to owner; 0 = shared")
    is_published = Column(SmallInteger, nullable=False, default=0, comment="1 = publicly published")

    enable_insights = Column(Boolean,  nullable=False, default=False, comment="AI chart insights enabled for this dashboard")
    ai_settings     = Column(LONGTEXT, nullable=True,  comment="Encrypted JSON: {ai_provider, ai_api_key} — api_key redacted in responses")

    source_dash_id = Column(
        Integer,
        ForeignKey("dash_dashboards.id", ondelete="CASCADE"),
        nullable=True,
        comment="FK: dash_dashboards.id — original dashboard this was cloned from",
    )

    created          = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    created_user_id  = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who created this dashboard")
    modified         = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
    modified_user_id = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who last modified this dashboard")


class DashboardTemplate(Base):
    """dash_template — per-dashboard gridster layout (legacy m_templates)."""

    __tablename__ = "dash_template"
    __table_args__ = ({"extend_existing": True},)

    _audit_enabled = True
    _audit_module = "dashboard_template"
    _audit_nid_field = "id"
    _audit_gid_field = None
    _audit_exclude_fields = (
        # "gridster", "thumbnail", "global_filter_gridster"
        )

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    dashboard_id = Column(
        Integer,
        ForeignKey("dash_dashboards.id", ondelete="CASCADE"),
        nullable=True,
        comment="FK: dash_dashboards.id — owning dashboard (NULL for system templates)",
    )
    gridster             = Column(LONGTEXT, nullable=True, comment="JSON: widget layout per section")
    is_system            = Column(String(255), nullable=True, comment="Yes/No — system template flag")
    is_default           = Column(String(255), nullable=True, comment="Yes/No — default template flag")
    counter              = Column(Integer, nullable=False, default=0, comment="Template counter")
    thumbnail            = Column(LONGTEXT, nullable=True, comment="Template preview thumbnail")
    global_filter_gridster = Column(LONGTEXT, nullable=True, comment="JSON: global area filter layout")

    created          = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    modified         = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
    modified_user_id = Column(Integer, nullable=True, comment="FK: iam_user.id — user who last modified this template")


class DashboardSection(Base):
    """dash_sections — layout sections within a dashboard."""

    __tablename__ = "dash_sections"
    __table_args__ = ({"extend_existing": True},)

    _audit_enabled = True
    _audit_module = "dashboard_section"
    _audit_nid_field = "id"
    _audit_gid_field = None
    _audit_exclude_fields = (
        # "section_name",
        )

    id           = Column(Integer,     primary_key=True, autoincrement=True)
    section_name = Column(String(512), nullable=True,  comment="Display name of the section (i18n JSON)")
    dashboard_id = Column(
        Integer,
        ForeignKey("dash_dashboards.id", ondelete="CASCADE"),
        nullable=False,
        comment="FK: dash_dashboards.id",
    )
    hide_global_filter = Column(SmallInteger, nullable=False, default=0, comment="1 = hide global area filter in this section")
    order              = Column(Integer,      nullable=True,              comment="Display order within the dashboard")
    reload_section     = Column(SmallInteger, nullable=False, default=0,  comment="1 = auto-reload this section on interval")
    resolution         = Column(String(50),   nullable=True,              comment="Override screen resolution for this section")

    created          = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    created_user_id  = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who created this section")
    modified         = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
    modified_user_id = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who last modified this section")


class DashVisualization(Base):
    """dash_visualization — dashboard visualization definition and chart configuration."""

    __tablename__ = "dash_visualization"
    __table_args__ = ({"extend_existing": True},)

    _audit_enabled = True
    _audit_module = "dashboard_visualization"
    _audit_nid_field = "id"
    _audit_gid_field = None
    _audit_exclude_fields = (
        # "properties", "data_cube_info"
        )

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    layout_id          = Column(Integer, nullable=True, comment="Layout reference id")
    visualization_name = Column(String(255), nullable=False, server_default="", comment="Visualization display name")
    category           = Column(String(255), nullable=True, comment="Visualization category: chart | custom")
    type               = Column(String(255), nullable=True, comment="Visualization type (bar, line, pie, html, text, etc.)")
    chart_variant      = Column(String(100), nullable=True, comment="Chart variant (vertical, stacked, donut, etc.)")
    system_dw_id = Column(
        Integer,
        ForeignKey("system_datawarehouse.id", ondelete="SET NULL"),
        nullable=True,
        comment="FK: system_datawarehouse.id — linked warehouse",
    )
    dashboard_id = Column(
        Integer,
        ForeignKey("dash_dashboards.id", ondelete="CASCADE"),
        nullable=True,
        comment="FK: dash_dashboards.id — owning dashboard",
    )
    properties         = Column(LONGTEXT, nullable=True, comment="JSON: visualization settings (general, series, categories, theme, advance, custom*)")
    data_cube_info     = Column(LONGTEXT, nullable=True, comment="JSON: data dimensions (indicators, subgroups, areas, timePeriods, mapping)")
    explore_enabled    = Column(SmallInteger, nullable=False, default=1, comment="1 = explore enabled")
    explore_da_enabled = Column(SmallInteger, nullable=False, default=1, comment="1 = explore DA enabled")
    explore_qa_enabled = Column(SmallInteger, nullable=False, default=1, comment="1 = explore QA enabled")
    explore_md_enabled = Column(SmallInteger, nullable=False, default=1, comment="1 = explore metadata enabled")
    mode               = Column(String(255), nullable=True, comment="Visualization mode (edit/publish)")
    source_viz_id      = Column(Integer, nullable=True, comment="FK: dash_visualization.id — clone source")
    is_deleted         = Column(SmallInteger, nullable=False, default=0, comment="Soft-delete flag: 1 = deleted")
    is_used_in_layout  = Column(SmallInteger, nullable=False, default=0, comment="1 = placed on the dashboard canvas")

    created          = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    created_user_id  = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who created this visualization")
    modified         = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
    modified_user_id = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who last modified this visualization")


class VisualizationAnalysis(Base):
    """dash_analyses — AI analysis cache per visualization + area combination."""

    __tablename__ = "dash_analyses"
    __table_args__ = (
        Index("idx_dash_analyses_vis_area", "visualization_id", "area_id"),
        {"extend_existing": True},
    )

    id               = Column(Integer,     primary_key=True, autoincrement=True)
    visualization_id = Column(
        Integer,
        ForeignKey("dash_visualization.id", ondelete="CASCADE"),
        nullable=False,
        comment="FK: dash_visualization.id — visualization this analysis belongs to",
    )
    area_id  = Column(String(60), nullable=True,  comment="Area identifier the analysis was generated for")
    analysis = Column(LONGTEXT,   nullable=True,  comment="AI-generated analysis text")

    created          = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    created_user_id  = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who triggered the analysis")
    modified         = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
    modified_user_id = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who last updated the analysis")


class DashboardHeaderFooter(Base):
    """dash_header_footer — reusable header/footer theme library (legacy m_header_footers)."""

    __tablename__ = "dash_header_footer"
    __table_args__ = (
        UniqueConstraint("user_id", "theme_name", name="uq_dash_header_footer_user_theme"),
        {"extend_existing": True},
    )

    _audit_enabled = True
    _audit_module = "dashboard_theme"
    _audit_nid_field = "id"
    _audit_gid_field = None
    _audit_exclude_fields = (
        # "web_header_html",
        # "web_footer_html",
        # "mobile_header_html",
        # "mobile_footer_html",
        # "settings",
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        nullable=False,
        default=0,
        comment="Owner user id (legacy user_id)",
    )
    theme_name = Column(String(255), nullable=True, comment="Theme display name")
    web_header_html = Column(LONGTEXT, nullable=True, comment="Desktop header HTML")
    web_footer_html = Column(LONGTEXT, nullable=True, comment="Desktop footer HTML")
    mobile_header_html = Column(LONGTEXT, nullable=True, comment="Mobile header HTML")
    mobile_footer_html = Column(LONGTEXT, nullable=True, comment="Mobile footer HTML")
    settings = Column(LONGTEXT, nullable=True, comment="JSON: theme styling metadata")

    created = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    modified = Column(
        DateTime,
        nullable=True,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        comment="Last update timestamp",
    )
    modified_user_id = Column(
        Integer,
        nullable=True,
        comment="FK: iam_user.id — user who last modified this theme",
    )


class Artifact(Base):
    """dash_artifacts — binary file attachments (logos, images) stored as base64."""

    __tablename__ = "dash_artifacts"
    __table_args__ = ({"extend_existing": True},)

    id          = Column(Integer,      primary_key=True, autoincrement=True)
    binary_obj  = Column(LONGTEXT,     nullable=True, comment="Base64-encoded binary content")
    type        = Column(String(50),   nullable=True, comment="MIME type or content category (e.g. image/png)")
    filename    = Column(String(255),  nullable=True, comment="Original filename")
    file_ext    = Column(String(20),   nullable=True, comment="File extension without dot (e.g. png)")
    file_size   = Column(Integer,      nullable=True, comment="File size in bytes")
    file_width  = Column(Integer,      nullable=True, comment="Image width in pixels")
    file_height = Column(Integer,      nullable=True, comment="Image height in pixels")

    created          = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    created_user_id  = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who uploaded this artifact")
    modified         = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
    modified_user_id = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who last modified this artifact")


class DashboardUpload(Base):
    """dash_uploads — file upload job tracking (path, status, owning user)."""

    __tablename__ = "dash_uploads"
    __table_args__ = ({"extend_existing": True},)

    _audit_enabled = True
    _audit_module = "dashboard_upload"
    _audit_nid_field = "id"
    _audit_gid_field = None
    _audit_exclude_fields = ("binary_obj",)

    id           = Column(Integer, primary_key=True, autoincrement=True)
    dashboard_id = Column(
        Integer,
        ForeignKey("dash_dashboards.id", ondelete="CASCADE"),
        nullable=True,
        comment="FK: dash_dashboards.id — upload scoped to this dashboard",
    )
    visualization_id = Column(
        "void",
        Integer,
        ForeignKey("dash_visualization.id", ondelete="SET NULL"),
        nullable=True,
        comment="FK: dash_visualization.id — linked visualization (legacy column void)",
    )
    filename  = Column(String(255),  nullable=True, comment="Original filename")
    file_path = Column(String(500),  nullable=True, comment="Server-side storage path")
    file_type = Column(String(100),  nullable=True, comment="MIME type of the uploaded file")
    file_size = Column(Integer,      nullable=True, comment="File size in bytes")
    binary_obj = Column(LONGBLOB,    nullable=True, comment="Raw binary content for user-uploaded media")
    is_system  = Column(SmallInteger, nullable=False, default=0, comment="1 = seeded system media; cannot be deleted/replaced")
    user_id   = Column(
        Integer,
        ForeignKey("iam_user.id", ondelete="SET NULL"),
        nullable=True,
        comment="FK: iam_user.id — user who initiated this upload",
    )
    status = Column(String(50), nullable=True, default="PENDING", comment="Upload job status: PENDING | PROCESSING | COMPLETE | FAILED")

    created          = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    created_user_id  = Column(Integer,  nullable=True, comment="FK: iam_user.id — same as user_id for uploads")
    modified         = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
    modified_user_id = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who last updated this upload record")


class EmbedVo(Base):
    """dash_embed_vos — embed tracking record per gallery item."""

    __tablename__ = "dash_embed_vos"
    __table_args__ = ({"extend_existing": True},)

    id         = Column(Integer,  primary_key=True, autoincrement=True)
    gallery_id = Column(
        Integer,
        ForeignKey("system_gallery.id", ondelete="CASCADE"),
        nullable=False,
        comment="FK: system_gallery.id — the visualization being embedded",
    )
    counter    = Column(Integer,      nullable=False, default=0, comment="Total cumulative embed view count")
    is_deleted = Column(SmallInteger, nullable=False, default=0, comment="Soft-delete flag: 1 = deleted")

    created          = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    created_user_id  = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who created this embed")
    modified         = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
    modified_user_id = Column(Integer,  nullable=True, comment="FK: iam_user.id — user who last modified this embed")


class EmbedVoOwner(Base):
    """dash_embed_vo_owners — per-IP embed view tracking."""

    __tablename__ = "dash_embed_vo_owners"
    __table_args__ = ({"extend_existing": True},)

    id          = Column(Integer,  primary_key=True, autoincrement=True)
    embed_vo_id = Column(
        Integer,
        ForeignKey("dash_embed_vos.id", ondelete="CASCADE"),
        nullable=False,
        comment="FK: dash_embed_vos.id",
    )
    ip_address = Column(String(50),   nullable=True,  comment="IP address of the embedding host")
    counter    = Column(Integer,      nullable=False, default=0, comment="View count from this IP")
    is_blocked = Column(SmallInteger, nullable=False, default=0, comment="1 = this IP is blocked from viewing the embed")

    created  = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    modified = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")


class EmbedVoOwnerWebsite(Base):
    """dash_embed_vo_owner_websites — per-domain embed view tracking."""

    __tablename__ = "dash_embed_vo_owner_websites"
    __table_args__ = ({"extend_existing": True},)

    id                = Column(Integer, primary_key=True, autoincrement=True)
    embed_vo_owner_id = Column(
        Integer,
        ForeignKey("dash_embed_vo_owners.id", ondelete="CASCADE"),
        nullable=False,
        comment="FK: dash_embed_vo_owners.id",
    )
    website_url = Column(Text,    nullable=True,  comment="Referring domain/URL that embedded the visualization")
    counter     = Column(Integer, nullable=False, default=0, comment="View count from this website")

    created  = Column(DateTime, nullable=True, default=datetime.utcnow, comment="Row creation timestamp")
    modified = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow, comment="Last update timestamp")
