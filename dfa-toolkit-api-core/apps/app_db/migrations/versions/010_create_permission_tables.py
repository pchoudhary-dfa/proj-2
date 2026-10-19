"""Create IAM permission tables: iam_resource, iam_resource_api, iam_role_resource_api, iam_user_role_content.

Revision ID: 010_create_permission_tables
Revises: 009_create_iam_tables
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "010_create_permission_tables"
down_revision = "009_create_iam_tables"
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # ------------------------------------------------------------------
    # iam_resource
    # ------------------------------------------------------------------
    if not table_exists("iam_resource"):
        op.create_table(
            "iam_resource",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("parent_id", sa.Integer(), nullable=False, server_default="0",
                      comment="Parent resource id; 0 = top-level"),
            sa.Column("app_key", sa.String(length=10), nullable=False,
                      comment="Application this resource belongs to; FK: system_applications.app_key"),
            sa.Column("name", sa.String(length=100), nullable=False,
                      comment="Human-readable resource name e.g. Indicators"),
            sa.Column("code", sa.String(length=50), nullable=False,
                      comment="Unique code identifier for this resource e.g. INDICATORS"),
            sa.Column("description", sa.Text(), nullable=True, comment="Resource description"),
            sa.Column("is_active", sa.SmallInteger(), nullable=True, server_default="1",
                      comment="1=active, 0=inactive"),
            sa.Column("created", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP"),
                      comment="Record creation timestamp"),
            sa.Column("created_user_id", sa.Integer(), nullable=True,
                      comment="User ID who created this record"),
            sa.Column("modified", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP"),
                      comment="Last modification timestamp"),
            sa.Column("modified_user_id", sa.Integer(), nullable=True,
                      comment="User ID who last modified this record"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_iam_resource_app_key",    "iam_resource", ["app_key"])
        op.create_index("idx_iam_resource_parent_id",  "iam_resource", ["parent_id"])

    # ------------------------------------------------------------------
    # iam_resource_api
    # ------------------------------------------------------------------
    if not table_exists("iam_resource_api"):
        op.create_table(
            "iam_resource_api",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("app_key", sa.String(length=10), nullable=False,
                      comment="Application this endpoint belongs to; FK: system_applications.app_key"),
            sa.Column(
                "resource_id",
                sa.Integer(),
                sa.ForeignKey("iam_resource.id"),
                nullable=False,
                comment="FK: iam_resource.id",
            ),
            sa.Column("action", sa.String(length=50), nullable=False,
                      comment="Action label e.g. read, create, update, delete"),
            sa.Column("http_method", sa.String(length=10), nullable=False,
                      comment="HTTP method: GET, POST, PUT, PATCH, DELETE"),
            sa.Column("backend_endpoint", sa.String(length=500), nullable=False,
                      comment="Backend API path pattern e.g. /dw/{dw_id}/indicators"),
            sa.Column(
                "access_level",
                sa.Enum("PUBLIC", "AUTHENTICATED", "PERMISSION","APP_CLIENT"),
                nullable=True,
                server_default="PERMISSION",
                comment="PUBLIC=no auth required, AUTHENTICATED=any valid token, PERMISSION=role check required",
            ),
            sa.Column("description", sa.Text(), nullable=True, comment="Endpoint description"),
            sa.Column("is_active", sa.SmallInteger(), nullable=True, server_default="1",
                      comment="1=active, 0=inactive"),
            sa.Column("created", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP"),
                      comment="Record creation timestamp"),
            sa.Column("created_user_id", sa.Integer(), nullable=True,
                      comment="User ID who created this record"),
            sa.Column("modified", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP"),
                      comment="Last modification timestamp"),
            sa.Column("modified_user_id", sa.Integer(), nullable=True,
                      comment="User ID who last modified this record"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_iam_rapi_app_key",      "iam_resource_api", ["app_key"])
        op.create_index("idx_iam_rapi_resource_id",  "iam_resource_api", ["resource_id"])
        op.create_index("idx_iam_rapi_access_level", "iam_resource_api", ["access_level"])

    # ------------------------------------------------------------------
    # iam_role_resource_api
    # ------------------------------------------------------------------
    if not table_exists("iam_role_resource_api"):
        op.create_table(
            "iam_role_resource_api",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column(
                "role_id",
                sa.Integer(),
                sa.ForeignKey("iam_role.id"),
                nullable=False,
                comment="FK: iam_role.id",
            ),
            sa.Column(
                "resource_id",
                sa.Integer(),
                sa.ForeignKey("iam_resource.id"),
                nullable=False,
                comment="FK: iam_resource.id",
            ),
            sa.Column(
                "resource_api_id",
                sa.Integer(),
                sa.ForeignKey("iam_resource_api.id"),
                nullable=False,
                comment="FK: iam_resource_api.id",
            ),
            sa.Column("created_user_id", sa.Integer(), nullable=True,
                      comment="User ID who created this record"),
            sa.Column("created", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP"),
                      comment="Record creation timestamp"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_iam_rra_role_id",         "iam_role_resource_api", ["role_id"])
        op.create_index("idx_iam_rra_resource_id",     "iam_role_resource_api", ["resource_id"])
        op.create_index("idx_iam_rra_resource_api_id", "iam_role_resource_api", ["resource_api_id"])

    # ------------------------------------------------------------------
    # iam_user_role_content
    # ------------------------------------------------------------------
    if not table_exists("iam_user_role_content"):
        op.create_table(
            "iam_user_role_content",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column(
                "user_role_id",
                sa.Integer(),
                sa.ForeignKey("iam_user_role.id"),
                nullable=False,
                comment="FK: iam_user_role.id",
            ),
            sa.Column("resource_type", sa.Integer(), nullable=False,
                      comment="Type code identifying the content domain e.g. 1=datawarehouse"),
            sa.Column("content_id", sa.Integer(), nullable=False,
                      comment="PK of the content item in its domain table"),
            sa.Column("created", sa.DateTime(), nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP"),
                      comment="Record creation timestamp"),
            sa.Column("created_user_id", sa.Integer(), nullable=True,
                      comment="User ID who created this record"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_iam_urc_user_role_id",  "iam_user_role_content", ["user_role_id"])
        op.create_index("idx_iam_urc_resource_type", "iam_user_role_content", ["resource_type"])
        op.create_index("idx_iam_urc_content_id",    "iam_user_role_content", ["content_id"])


def downgrade() -> None:
    if table_exists("iam_user_role_content"):
        op.drop_index("idx_iam_urc_content_id",    table_name="iam_user_role_content")
        op.drop_index("idx_iam_urc_resource_type", table_name="iam_user_role_content")
        op.drop_index("idx_iam_urc_user_role_id",  table_name="iam_user_role_content")
        op.drop_table("iam_user_role_content")

    if table_exists("iam_role_resource_api"):
        op.drop_index("idx_iam_rra_resource_api_id", table_name="iam_role_resource_api")
        op.drop_index("idx_iam_rra_resource_id",     table_name="iam_role_resource_api")
        op.drop_index("idx_iam_rra_role_id",         table_name="iam_role_resource_api")
        op.drop_table("iam_role_resource_api")

    if table_exists("iam_resource_api"):
        op.drop_index("idx_iam_rapi_access_level", table_name="iam_resource_api")
        op.drop_index("idx_iam_rapi_resource_id",  table_name="iam_resource_api")
        op.drop_index("idx_iam_rapi_app_key",      table_name="iam_resource_api")
        op.drop_table("iam_resource_api")

    if table_exists("iam_resource"):
        op.drop_index("idx_iam_resource_parent_id", table_name="iam_resource")
        op.drop_index("idx_iam_resource_app_key",   table_name="iam_resource")
        op.drop_table("iam_resource")
