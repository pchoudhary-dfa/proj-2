"""Alter system_application_client for auth_method and client_public_key.

Adds explicit auth_method and client_public_key columns so that application
clients can use either shared-secret or signature-based authentication.

Revision ID: 019_app_client_auth
Revises: 018_create_system_language
Create Date: 2026-03-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "019_app_client_auth"
down_revision = "018_create_system_language"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def column_exists(table: str, col: str) -> bool:
    if not table_exists(table):
        return False
    return any(c["name"] == col for c in inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    if not table_exists("system_application_client"):
        return

    # auth_method: SECRET (shared secret) or SIGNATURE (asymmetric signature)
    if not column_exists("system_application_client", "auth_method"):
        op.add_column(
            "system_application_client",
            sa.Column(
                "auth_method",
                sa.Enum("SECRET", "SIGNATURE", name="sac_auth_method"),
                nullable=False,
                server_default="SECRET",
                comment="How this client authenticates: SECRET=shared secret, SIGNATURE=asymmetric signature",
            ),
        )

    # client_public_key: nullable text column for SIGNATURE clients
    if not column_exists("system_application_client", "client_public_key"):
        op.add_column(
            "system_application_client",
            sa.Column(
                "client_public_key",
                sa.Text(),
                nullable=True,
                comment="Public key for SIGNATURE clients (PEM/JWK). Private key is never stored on the server.",
            ),
        )


def downgrade() -> None:
    if not table_exists("system_application_client"):
        return

    if column_exists("system_application_client", "client_public_key"):
        op.drop_column("system_application_client", "client_public_key")

    if column_exists("system_application_client", "auth_method"):
        op.drop_column("system_application_client", "auth_method")

    # Drop enum type if created (MySQL ignores, PostgreSQL needs explicit drop)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS sac_auth_method")
