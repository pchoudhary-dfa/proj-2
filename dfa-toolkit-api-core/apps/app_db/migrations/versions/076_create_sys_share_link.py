"""Create system_share_link table and register share-links IAM routes.

Revision ID: 076_create_sys_share_link
Revises: 075_drop_sys_app_icon
"""

from alembic import op
from sqlalchemy import inspect, text, Column, Integer, String, Text, DateTime

revision = "076_create_sys_share_link"
down_revision = "075_drop_sys_app_icon"
branch_labels = None
depends_on = None

_RESOURCE_CODE = "viz_share_link"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _seed_iam_routes(conn) -> None:
    """Insert iam_resource + iam_resource_api rows so the middleware recognises the endpoints."""

    # Resolve app_key from settings at runtime so .env overrides work.
    try:
        from apps.shared.config.config import settings
        viz_app_key = settings.DFA_VIZ_APP_KEY
    except Exception:
        viz_app_key = "DFA_VIZ"

    # 1) iam_resource — parent resource for the share-link endpoints
    existing_resource = conn.execute(
        text("SELECT id FROM iam_resource WHERE resource_code = :rc AND app_key = :ak"),
        {"rc": _RESOURCE_CODE, "ak": viz_app_key},
    ).fetchone()

    if existing_resource:
        resource_id = existing_resource[0]
    else:
        conn.execute(text(
            "INSERT INTO iam_resource "
            "(parent_id, app_key, resource_code, description, is_dw_spec, is_active, is_role_assignable, display_order, created, modified) "
            "VALUES (0, :ak, :rc, 'Share link management', 0, 1, 0, 32, NOW(), NOW())"
        ), {"ak": viz_app_key, "rc": _RESOURCE_CODE})
        row = conn.execute(
            text("SELECT id FROM iam_resource WHERE resource_code = :rc AND app_key = :ak"),
            {"rc": _RESOURCE_CODE, "ak": viz_app_key},
        ).fetchone()
        resource_id = row[0]

    # 2) iam_resource_api — one row per endpoint
    routes = [
        ("POST", "/share-links",        "APP_CLIENT"),
        ("GET",  "/share-links/{code}", "PUBLIC"),
    ]
    for method, endpoint, access in routes:
        exists = conn.execute(text(
            "SELECT 1 FROM iam_resource_api "
            "WHERE app_key = :ak AND http_method = :m AND backend_endpoint = :ep"
        ), {"ak": viz_app_key, "m": method, "ep": endpoint}).fetchone()
        if not exists:
            conn.execute(text(
                "INSERT INTO iam_resource_api "
                "(app_key, resource_id, http_method, backend_endpoint, access_level, is_active, created, modified) "
                "VALUES (:ak, :rid, :m, :ep, :al, 1, NOW(), NOW())"
            ), {"ak": viz_app_key, "rid": resource_id, "m": method, "ep": endpoint, "al": access})


def upgrade() -> None:
    if not _table_exists("system_share_link"):
        op.create_table(
            "system_share_link",
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("code", String(16), nullable=False, unique=True, comment="Short URL-safe code"),
            Column("payload", Text, nullable=False, comment="JSON: {fetchParams, chartConfig}"),
            Column("app_key", String(10), nullable=True, comment="Application context"),
            Column("dw_id", Integer, nullable=True, comment="Data warehouse id (optional)"),
            Column("created_by", Integer, nullable=True, comment="User id who created the link"),
            Column("created", DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), comment="Record creation timestamp"),
        )
        op.create_index("idx_share_link_code", "system_share_link", ["code"], unique=True)

    conn = op.get_bind()
    if _table_exists("iam_resource_api") and _table_exists("iam_resource"):
        _seed_iam_routes(conn)


def downgrade() -> None:
    conn = op.get_bind()
    # Remove IAM rows first
    if _table_exists("iam_resource_api"):
        conn.execute(text(
            "DELETE FROM iam_resource_api WHERE backend_endpoint IN ('/share-links', '/share-links/{code}')"
        ))
    if _table_exists("iam_resource"):
        conn.execute(text(
            "DELETE FROM iam_resource WHERE resource_code = :rc"
        ), {"rc": _RESOURCE_CODE})

    if _table_exists("system_share_link"):
        op.drop_table("system_share_link")
