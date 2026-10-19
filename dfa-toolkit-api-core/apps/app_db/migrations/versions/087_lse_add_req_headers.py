"""Add request_headers TEXT column to logs_server_error.

Stores the inbound HTTP request headers as a JSON object string, captured by
RequestContextMiddleware on every HTTP request. Positioned immediately after
request_body so the request-context columns stay contiguous.

Revision ID: 087_lse_add_req_headers
Revises: 086_lse_req_capture
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "087_lse_add_req_headers"
down_revision = "086_lse_req_capture"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> dict[str, dict]:
    return {col["name"]: col for col in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("logs_server_error"):
        return

    cols = _columns("logs_server_error")
    if "request_headers" not in cols:
        # MySQL-specific: place request_headers immediately after request_body so the
        # physical column order keeps request-context columns grouped together.
        op.execute(
            "ALTER TABLE logs_server_error "
            "ADD COLUMN request_headers TEXT NULL "
            "COMMENT 'All inbound HTTP request headers as a JSON object, captured verbatim with NO redaction. May contain Authorization tokens, API keys, and cookies in plaintext.' "
            "AFTER request_body"
        )


def downgrade() -> None:
    if not _table_exists("logs_server_error"):
        return

    cols = _columns("logs_server_error")
    if "request_headers" in cols:
        op.drop_column("logs_server_error", "request_headers")
