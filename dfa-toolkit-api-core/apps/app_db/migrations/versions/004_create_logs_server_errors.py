"""Create logs_server_errors table

Revision ID: 004_create_logs_server_errors
Revises: 003_create_sys_lang_tl
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "004_create_logs_server_errors"
down_revision = "003_create_sys_lang_tl"
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database"""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not table_exists("logs_server_errors"):
        op.create_table(
            "logs_server_errors",
            sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
            sa.Column("request_id", sa.String(length=36), nullable=True, comment="UUID per request for correlation"),
            sa.Column("user_id", sa.Integer(), nullable=True, comment="Authenticated user ID; NULL for unauthenticated requests"),
            sa.Column("db_id", sa.Integer(), nullable=True, comment="Datawarehouse ID being accessed; NULL for non-DW requests"),
            sa.ForeignKeyConstraint(["db_id"], ["system_datawarehouses.id"], name="fk_logs_server_errors_db_id"),
            sa.Column("method", sa.String(length=10), nullable=True, comment="HTTP method: GET, POST, PATCH, DELETE"),
            sa.Column("path", sa.String(length=500), nullable=True, comment="Full request path"),
            sa.Column("status_code", sa.Integer(), nullable=True, comment="HTTP response status code if available"),
            sa.Column("level", sa.String(length=10), nullable=False, comment="Log level: ERROR, CRITICAL, WARNING"),
            sa.Column("module", sa.String(length=255), nullable=True, comment="Logger module e.g. area, indicator"),
            sa.Column("submodule", sa.String(length=255), nullable=True, comment="Logger submodule e.g. services, router"),
            sa.Column("action", sa.String(length=100), nullable=True, comment="Operation being performed"),
            sa.Column("identifier", sa.String(length=255), nullable=True, comment="Specific object ID e.g. area_nid, indicator_gid"),
            sa.Column("error_type", sa.String(length=255), nullable=True, comment="Exception class name e.g. SQLAlchemyError"),
            sa.Column("error_message", sa.Text(), nullable=True, comment="Short human-readable error message"),
            sa.Column("stack_trace", sa.Text(), nullable=True, comment="Full traceback"),
            sa.Column("created_at", sa.DateTime(), nullable=False, comment="UTC timestamp of the log event"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_lse_created_at", "logs_server_errors", ["created_at"])
        op.create_index("idx_lse_level", "logs_server_errors", ["level"])
        op.create_index("idx_lse_user_id", "logs_server_errors", ["user_id"])
        op.create_index("idx_lse_db_id", "logs_server_errors", ["db_id"])
        op.create_index("idx_lse_request_id", "logs_server_errors", ["request_id"])
        op.create_index("idx_lse_module", "logs_server_errors", ["module"])


def downgrade() -> None:
    if table_exists("logs_server_errors"):
        op.drop_index("idx_lse_module", table_name="logs_server_errors")
        op.drop_index("idx_lse_request_id", table_name="logs_server_errors")
        op.drop_index("idx_lse_db_id", table_name="logs_server_errors")
        op.drop_index("idx_lse_user_id", table_name="logs_server_errors")
        op.drop_index("idx_lse_level", table_name="logs_server_errors")
        op.drop_index("idx_lse_created_at", table_name="logs_server_errors")
        op.drop_table("logs_server_errors")
