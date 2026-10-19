"""Create IAM tables: iam_role, iam_user, iam_user_role.

Revision ID: 009_create_iam_tables
Revises: 008_rename_audit_columns
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "009_create_iam_tables"
down_revision = "008_rename_audit_columns"
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # ------------------------------------------------------------------
    # iam_role
    # ------------------------------------------------------------------
    if not table_exists("iam_role"):
        op.create_table(
            "iam_role",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("app_key", sa.String(length=10), nullable=False,
                      comment="Application this role belongs to; FK: system_applications.app_key"),
            sa.Column("role_code", sa.String(length=50), nullable=False,
                      comment="Unique machine-readable role code e.g. SUPERADMIN, ADMIN"),
            sa.Column("name", sa.String(length=100), nullable=False,
                      comment="Human-readable role name e.g. Super Admin"),
            sa.Column("description", sa.Text(), nullable=True, comment="Role description"),
            sa.Column("is_super_admin", sa.SmallInteger(), nullable=True, server_default="0",
                      comment="1 if this role carries super-admin privileges"),
            sa.Column("is_system_role", sa.SmallInteger(), nullable=True, server_default="0",
                      comment="1 if this is a built-in system role that cannot be deleted"),
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
            sa.UniqueConstraint("role_code", name="uq_iam_role_role_code"),
        )
        op.create_index("idx_iam_role_app_key", "iam_role", ["app_key"])

    # ------------------------------------------------------------------
    # iam_user
    # ------------------------------------------------------------------
    if not table_exists("iam_user"):
        op.create_table(
            "iam_user",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("name", sa.String(length=255), nullable=False, comment="Display name"),
            sa.Column("username", sa.String(length=255), nullable=False, comment="Login username"),
            sa.Column("email", sa.String(length=255), nullable=True, comment="Email address"),
            sa.Column("password", sa.String(length=765), nullable=True, comment="Hashed password"),
            sa.Column("status", sa.SmallInteger(), nullable=True, server_default="0",
                      comment="0=inactive, 1=active"),
            sa.Column("created", sa.DateTime(), nullable=True, comment="Record creation timestamp"),
            sa.Column("created_user_id", sa.Integer(), nullable=False, server_default="0",
                      comment="User ID who created this record"),
            sa.Column("modified", sa.DateTime(), nullable=True, comment="Last modification timestamp"),
            sa.Column("modified_user_id", sa.Integer(), nullable=False, server_default="0",
                      comment="User ID who last modified this record"),
            sa.Column("last_loggedin_on", sa.DateTime(), nullable=True,
                      comment="Last successful login timestamp"),
            sa.Column("sel_objects", sa.Text(), nullable=True, comment="Selected objects JSON"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("username", name="uq_iam_user_username"),
        )
        op.create_index("idx_iam_user_status", "iam_user", ["status"])

    # ------------------------------------------------------------------
    # iam_user_role
    # ------------------------------------------------------------------
    if not table_exists("iam_user_role"):
        op.create_table(
            "iam_user_role",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("iam_user.id"),
                nullable=False,
                comment="FK: iam_user.id",
            ),
            sa.Column(
                "app_key",
                sa.String(length=10),
                nullable=True,
                comment="Application for which role is associated; NULL = global across all apps",
            ),
            sa.Column(
                "dw_id",
                sa.Integer(),
                sa.ForeignKey("system_datawarehouses.id"),
                nullable=True,
                comment="DW ID for which selected user is associated in different roles; NULL = all warehouses",
            ),
            sa.Column(
                "role_id",
                sa.Integer(),
                sa.ForeignKey("iam_role.id"),
                nullable=False,
                comment="FK: iam_role.id",
            ),
            sa.Column("created_user_id", sa.Integer(), nullable=True,
                      comment="User ID who created this record"),
            sa.Column("created", sa.DateTime(), nullable=True,
                      server_default=sa.text("CURRENT_TIMESTAMP"),
                      comment="Record creation timestamp"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_iam_ur_user_id", "iam_user_role", ["user_id"])
        op.create_index("idx_iam_ur_app_key", "iam_user_role", ["app_key"])
        op.create_index("idx_iam_ur_dw_id",   "iam_user_role", ["dw_id"])
        op.create_index("idx_iam_ur_role_id",  "iam_user_role", ["role_id"])


def downgrade() -> None:
    if table_exists("iam_user_role"):
        op.drop_index("idx_iam_ur_role_id",  table_name="iam_user_role")
        op.drop_index("idx_iam_ur_dw_id",    table_name="iam_user_role")
        op.drop_index("idx_iam_ur_app_key",  table_name="iam_user_role")
        op.drop_index("idx_iam_ur_user_id",  table_name="iam_user_role")
        op.drop_table("iam_user_role")

    if table_exists("iam_user"):
        op.drop_index("idx_iam_user_status", table_name="iam_user")
        op.drop_table("iam_user")

    if table_exists("iam_role"):
        op.drop_index("idx_iam_role_app_key", table_name="iam_role")
        op.drop_table("iam_role")
