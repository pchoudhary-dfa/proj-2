"""Widen logs_server_error.path to 1024 and add request_body TEXT column.

The path column now stores the full endpoint including the query string
(e.g. /dw/3/areas?keyword=foo&page=2), so it needs more room. A new
request_body column carries the redacted JSON request body captured by the
RequestContextMiddleware for POST/PUT/PATCH requests.

Revision ID: 086_lse_req_capture
Revises: 085_lse_drop_dw_fk
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "086_lse_req_capture"
down_revision = "085_lse_drop_dw_fk"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> dict[str, dict]:
    return {col["name"]: col for col in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("logs_server_error"):
        return

    op.alter_column(
        "logs_server_error",
        "path",
        existing_type=sa.String(length=500),
        type_=sa.String(length=1024),
        existing_nullable=True,
        existing_comment="Full request path",
        comment="Full request path including query string",
    )

    cols = _columns("logs_server_error")
    if "request_body" not in cols:
        # MySQL-specific: place request_body immediately after path so the physical
        # column order in the table matches the logical grouping (request context
        # columns are contiguous: method, path, request_body, status_code).
        op.execute(
            "ALTER TABLE logs_server_error "
            "ADD COLUMN request_body TEXT NULL "
            "COMMENT 'Redacted JSON request body, up to 8 KB; NULL for GET/non-JSON/oversized/missing' "
            "AFTER path"
        )


def downgrade() -> None:
    if not _table_exists("logs_server_error"):
        return

    cols = _columns("logs_server_error")
    if "request_body" in cols:
        op.drop_column("logs_server_error", "request_body")

    op.alter_column(
        "logs_server_error",
        "path",
        existing_type=sa.String(length=1024),
        type_=sa.String(length=500),
        existing_nullable=True,
        existing_comment="Full request path including query string",
        comment="Full request path",
    )
