"""Create system_application_client table.

Stores registered API clients (federated frontends, external integrations,
mobile apps) that authenticate against the platform via api_key / api_secret.

Revision ID: 017_create_system_application_client
Revises: 016_rename_appkey_to_app_key
Create Date: 2026-03-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "017_application_client"
down_revision = "016_rename_appkey_to_app_key"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Guard helpers
# ---------------------------------------------------------------------------

def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    if not table_exists("system_application_client"):
        op.create_table(
            "system_application_client",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column(
                "app_name",
                sa.String(length=255),
                nullable=False,
                comment="Human-readable client application name",
            ),
            sa.Column(
                "app_key",
                sa.String(length=20),
                nullable=False,
                comment="Application key; references system_application.app_key",
            ),
            sa.Column(
                "app_type",
                sa.Enum("FED", "EXTERNAL", "MOBILE"),
                nullable=False,
                server_default="FED",
                comment="Client type: FED=federated frontend, EXTERNAL=3rd-party, MOBILE=mobile app",
            ),
            sa.Column(
                "api_key",
                sa.String(length=255),
                nullable=False,
                comment="Public API key used to identify the client",
            ),
            sa.Column(
                "api_secret_hash",
                sa.String(length=255),
                nullable=True,
                comment="Hashed API secret for confidential clients",
            ),
            sa.Column(
                "origin_url",
                sa.String(length=500),
                nullable=True,
                comment="Allowed origin URL; applicable for browser-based clients",
            ),
            sa.Column(
                "description",
                sa.Text(),
                nullable=True,
                comment="Client description",
            ),
            sa.Column(
                "owner_user_id",
                sa.Integer(),
                nullable=True,
                comment="User ID of the client owner",
            ),
            sa.Column(
                "status",
                sa.Enum("ACTIVE", "INACTIVE", "SUSPENDED"),
                nullable=True,
                server_default="ACTIVE",
                comment="ACTIVE=operational, INACTIVE=disabled, SUSPENDED=temporarily blocked",
            ),
            sa.Column(
                "allowed_ips",
                sa.Text(),
                nullable=True,
                comment="Comma-separated list of allowed IPs; NULL = unrestricted",
            ),
            sa.Column(
                "requires_user_auth",
                sa.SmallInteger(),
                nullable=True,
                server_default="1",
                comment="1=user JWT required alongside api_key, 0=api_key alone sufficient",
            ),
            sa.Column(
                "created",
                sa.DateTime(),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
                comment="Record creation timestamp",
            ),
            sa.Column(
                "modified",
                sa.DateTime(),
                nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
                comment="Last modification timestamp",
            ),
            sa.PrimaryKeyConstraint("id"),
        )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    if table_exists("system_application_client"):
        op.drop_table("system_application_client")
