"""
Dashboard module constants (legacy parity).
"""

# Default global CSS applied to new dashboards (dash-canvas class hooks)
DEFAULT_GLOBAL_CSS = """/* ============================================= */
/* DFA Dashboard — Default Global CSS            */
/* ============================================= */
/* Available class hooks:                         */
/*   .dash-dashboard    — outermost dashboard div  */
/*   .dash-canvas       — main visualization grid  */
/*   .dash-grid-node    — each visualization tile  */
/*   .dash-filter-bar   — global filter strip      */
/*   .dash-filter-item  — individual filter widget */
/*   .dash-section-tabs — section tab row          */
/*   .dash-header       — header HTML wrapper      */
/*   .dash-footer       — footer HTML wrapper      */
/* ============================================= */

.dash-grid-node {
  box-sizing: border-box;
}

.dash-filter-item {
  box-sizing: border-box;
}

@media screen and (max-width: 768px) {
  .dash-grid-node {
    min-height: 200px;
  }
}"""

DEFAULT_SECTION_LABEL = "Section 1"

# Legacy core.constant.js RESOLUTION dropdown keys
DASHBOARD_RESOLUTION_1024PX = "1024px"
DASHBOARD_RESOLUTION_100_PERCENT = "100%"

DASHBOARD_RESOLUTION_LABELS = {
    DASHBOARD_RESOLUTION_1024PX: "Width = 1024px",
    DASHBOARD_RESOLUTION_100_PERCENT: "Width = 100%",
}

# Legacy _NO flag for dash_template.is_system / is_default
TEMPLATE_FLAG_NO = "No"

# Legacy dashboard mode values (m_dashboards.mode)
DASHBOARD_MODE_EDIT = "edit"
DASHBOARD_MODE_PUBLISH = "publish"

# Legacy clone suffixes (definevars.php _DELM2 + "Copy")
CLONE_NAME_SUFFIX = " - Copy"
CLONE_TITLE_SUFFIX = "-Copy"

# Visualization type categories
VISUALIZATION_CATEGORY_CHART = "chart"
VISUALIZATION_CATEGORY_CUSTOM = "custom"
FILTER_CATEGORY = "filter"

VISUALIZATION_CHART_TYPES = frozenset({
    "bar", "area", "line", "map", "pie", "table", "tree", "scatter","pyramid", "percent",
})
VISUALIZATION_CUSTOM_TYPES = frozenset({
    "html", "text", "image", "video", "tile",
})
FILTER_TYPE = frozenset[str]({
    "select_list","global"
})
VISUALIZATION_ALL_TYPES = VISUALIZATION_CHART_TYPES | VISUALIZATION_CUSTOM_TYPES | FILTER_TYPE

# Legacy m_visualization_provider.dependency (publish viewer script bundles)
VIEWER_DEPENDENCY_HIGHCHARTS = "dfaHighcharts"
VIEWER_VIZ_TYPE_DEPENDENCIES: dict[str, str | None] = {
    "grid": "agGrid",
    "sunnburst": "dfaD3",
    "dfaDotMatrix": "dfaDotMatrix",
    "table": None,
    "html": None,
}

# Dashboard media storage. Values are relative project paths and are never
# exposed directly to clients.
DASH_MEDIA_FILES_ROOT = "files"
DASH_GLOBAL_MEDIA_SUBDIR = "dash_default_icons"
DASH_MEDIA_MAX_BYTES = 10 * 1024 * 1024
DASH_MEDIA_COPY_SUFFIX_MAX = 30

# Only image and video files may be uploaded as dashboard media.
DASH_MEDIA_ALLOWED_TYPE_PREFIXES = ("image/", "video/")
DASH_MEDIA_ALLOWED_EXTENSIONS = frozenset({
    # images
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
    # videos
    "mp4", "webm", "ogg", "mov", "avi", "mkv", "m4v",
})
