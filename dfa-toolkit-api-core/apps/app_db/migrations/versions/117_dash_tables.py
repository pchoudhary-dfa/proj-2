"""Create dashboard tables, alter dash_dashboards / dash_uploads / iam_user_role,
drop legacy dash_embed / dash_gallery tables.

Tables created: dash_visualization, dash_dashboard_visualization,
dash_template, dash_visualization_provider, dash_header_footer.

Altered: iam_user_role  (+ dashboard_id),
         dash_dashboards (+ 19 columns),
         dash_uploads    (+ 5 columns).

Dropped: dash_embed_vos, dash_embed_vo_owners,
         dash_embed_vo_owner_websites, dash_gallery.

Revision ID: 117_dash_tables
Revises: 116_notification_module
"""

from alembic import op
from sqlalchemy import Column, DateTime, Integer, String, SmallInteger, inspect, text
from sqlalchemy.dialects.mysql import LONGBLOB, LONGTEXT

revision = "117_dash_tables"
down_revision = "116_notification_module"
branch_labels = None
depends_on = None

_NEW_TABLES = [
    "dash_visualization",
    "dash_dashboard_visualization",
    "dash_template",
    "dash_visualization_provider",
    "dash_header_footer",
]

_DROP_TABLES = [
    "dash_embed_vo_owner_websites",
    "dash_embed_vo_owners",
    "dash_embed_vos",
    "dash_gallery",
]

_DASH_DASHBOARDS_COLS = [
    ("template_id",             "INT NULL"),
    ("mobile_header_html",      "LONGTEXT NULL"),
    ("mobile_footer_html",      "LONGTEXT NULL"),
    ("footer_bg_color",         "VARCHAR(255) NULL"),
    ("vo_border_color",         "VARCHAR(255) NULL"),
    ("vo_border_width",         "VARCHAR(255) NULL"),
    ("vo_border_radius",        "VARCHAR(255) NULL"),
    ("is_enable_profile",       "TINYINT NOT NULL DEFAULT 0"),
    ("is_global_profile",       "TINYINT NOT NULL DEFAULT 0"),
    ("profile_prefix",          "VARCHAR(255) NULL"),
    ("global_file_name",        "VARCHAR(255) NULL"),
    ("profiles_download",       "TINYINT NOT NULL DEFAULT 0"),
    ("profiles_suffix",         "VARCHAR(255) NULL"),
    ("is_multi_lang_active",    "TINYINT NULL DEFAULT 0"),
    ("subgroup_color",          "LONGTEXT NULL"),
    ("color_theme",             "LONGTEXT NULL"),
    ("map_url",                 "VARCHAR(255) NULL"),
    ("dfa_visualizer_settings", "VARCHAR(255) NULL"),
    ("dfa_profile_settings",    "LONGTEXT NULL"),
]

_DASH_UPLOADS_COLS = [
    ("dashboard_id", "INT NULL"),
    ("void",         "INT NULL"),
    ("file_ext",     "VARCHAR(255) NULL"),
    ("file_width",   "VARCHAR(255) NULL"),
    ("file_height",  "VARCHAR(255) NULL"),
]


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
        ),
        {"t": table, "c": column},
    ).scalar()
    return bool(row)


def _col_before(table: str, ref_col: str) -> str | None:
    """Return the column immediately preceding *ref_col* in ordinal position."""
    conn = op.get_bind()
    rows = conn.execute(
        text(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t "
            "ORDER BY ORDINAL_POSITION"
        ),
        {"t": table},
    ).fetchall()
    names = [r[0] for r in rows]
    if ref_col in names:
        idx = names.index(ref_col)
        return names[idx - 1] if idx > 0 else None
    return names[-1] if names else None


def _add_columns_before_created(table: str, columns: list[tuple[str, str]]) -> None:
    """Add *columns* to *table*, positioned just before the ``created`` column."""
    conn = op.get_bind()
    anchor = _col_before(table, "created")
    for col_name, col_def in columns:
        if _column_exists(table, col_name):
            continue
        after_clause = f" AFTER `{anchor}`" if anchor else ""
        conn.execute(text(
            f"ALTER TABLE `{table}` ADD COLUMN `{col_name}` {col_def}{after_clause}"
        ))
        anchor = col_name


def upgrade() -> None:
    # ── 1. iam_user_role: add dashboard_id after role_id ──────────────
    if _table_exists("iam_user_role") and not _column_exists("iam_user_role", "dashboard_id"):
        op.get_bind().execute(text(
            "ALTER TABLE iam_user_role ADD COLUMN dashboard_id INT NULL AFTER role_id"
        ))

    # ── 2. Create new dashboard tables ────────────────────────────────
    if not _table_exists("dash_visualization"):
        op.create_table(
            "dash_visualization",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("layout_id", Integer, nullable=True),
            Column("visualization_name", LONGBLOB, nullable=True),
            Column("provider", String(255), nullable=True),
            Column("type_category", String(255), nullable=True),
            Column("type", String(255), nullable=True),
            Column("system_dw_id", Integer, nullable=True),
            Column("properties", LONGTEXT, nullable=True),
            Column("data_cube_info", LONGTEXT, nullable=True),
            Column("explore_enabled", SmallInteger, nullable=False, server_default=text("1")),
            Column("explore_da_enabled", SmallInteger, nullable=False, server_default=text("1")),
            Column("explore_qa_enabled", SmallInteger, nullable=False, server_default=text("1")),
            Column("explore_md_enabled", SmallInteger, nullable=False, server_default=text("1")),
            Column("mode", String(255), nullable=True),
            Column("source_viz_id", Integer, nullable=True),
            Column("is_deleted", SmallInteger, nullable=False, server_default=text("0")),
            Column("created", DateTime, nullable=True),
            Column("modified", DateTime, nullable=True),
            Column("modified_user_id", Integer, nullable=True),
        )

    if not _table_exists("dash_dashboard_visualization"):
        op.create_table(
            "dash_dashboard_visualization",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("dashboard_id", Integer, nullable=True),
            Column("visualization_id", Integer, nullable=True),
            Column("created", DateTime, nullable=True),
            Column("modified", DateTime, nullable=True),
            Column("modified_user_id", Integer, nullable=True),
            Column("isused_in_dashboard_layout", SmallInteger, nullable=True, server_default=text("0")),
        )

    if not _table_exists("dash_template"):
        op.create_table(
            "dash_template",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("gridster", LONGTEXT, nullable=True),
            Column("is_system", String(255), nullable=True),
            Column("is_default", String(255), nullable=True),
            Column("counter", Integer, nullable=False, server_default=text("0")),
            Column("thumbnail", LONGTEXT, nullable=True),
            Column("created", DateTime, nullable=True),
            Column("modified", DateTime, nullable=True),
            Column("modified_user_id", Integer, nullable=True),
            Column("global_filter_gridster", LONGTEXT, nullable=True),
        )

    if not _table_exists("dash_visualization_provider"):
        op.create_table(
            "dash_visualization_provider",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("provider", String(255), nullable=False),
            Column("vis_type", String(255), nullable=True),
            Column("dependency", String(255), nullable=True),
        )

    if not _table_exists("dash_header_footer"):
        op.create_table(
            "dash_header_footer",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("user_id", Integer, nullable=False, server_default=text("0")),
            Column("theme_name", String(255), nullable=True),
            Column("web_header_html", LONGTEXT, nullable=True),
            Column("web_footer_html", LONGTEXT, nullable=True),
            Column("mobile_header_html", LONGTEXT, nullable=True),
            Column("mobile_footer_html", LONGTEXT, nullable=True),
            Column("settings", LONGTEXT, nullable=True),
            Column("modified", DateTime, nullable=True),
            Column("created", DateTime, nullable=True),
            Column("modified_user_id", Integer, nullable=True),
        )

    # ── 3. Add columns to existing tables (before `created`) ──────────
    if _table_exists("dash_dashboards"):
        _add_columns_before_created("dash_dashboards", _DASH_DASHBOARDS_COLS)

    if _table_exists("dash_uploads"):
        _add_columns_before_created("dash_uploads", _DASH_UPLOADS_COLS)

    # ── 4. Drop legacy tables ─────────────────────────────────────────
    for table in _DROP_TABLES:
        if _table_exists(table):
            op.drop_table(table)


def downgrade() -> None:
    # Reverse column additions
    if _table_exists("dash_uploads"):
        for col_name, _ in reversed(_DASH_UPLOADS_COLS):
            if _column_exists("dash_uploads", col_name):
                op.drop_column("dash_uploads", col_name)

    if _table_exists("dash_dashboards"):
        for col_name, _ in reversed(_DASH_DASHBOARDS_COLS):
            if _column_exists("dash_dashboards", col_name):
                op.drop_column("dash_dashboards", col_name)

    # Reverse table creations
    for table in reversed(_NEW_TABLES):
        if _table_exists(table):
            op.drop_table(table)

    if _table_exists("iam_user_role") and _column_exists("iam_user_role", "dashboard_id"):
        op.drop_column("iam_user_role", "dashboard_id")
