"""Add action column to iam_resource_api.

Decouples the CRUD business action from the HTTP verb. Allows POST endpoints
that semantically perform a delete (e.g. /multiple-delete) or an update
(e.g. /optimize, /execute, /cancel) to carry the correct action value so
permission checks resolve to the right CRUD letter regardless of HTTP method.

Positioned immediately after backend_endpoint.

Existing rows are backfilled from their http_method so the column is never
NULL after this migration runs:
  GET    → READ
  POST   → CREATE
  PUT    → UPDATE
  PATCH  → UPDATE
  DELETE → DELETE

Re-seed with --force after running this migration to apply the corrected
action values for POST endpoints that perform bulk-delete / update / read
operations.

Revision ID: 089_iam_resource_api_action
Revises: 088_dataset_approved_by_uid
"""

from alembic import op
from sqlalchemy import inspect

revision = "089_iam_resource_api_action"
down_revision = "088_dataset_approved_by_uid"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _table_exists("iam_resource_api"):
        return

    if not _column_exists("iam_resource_api", "action"):
        # Add as NULL first so the backfill UPDATE can run on existing rows.
        op.execute(
            "ALTER TABLE iam_resource_api "
            "ADD COLUMN action ENUM('CREATE','READ','UPDATE','DELETE') NULL "
            "COMMENT 'Explicit business action; decouples CRUD permission letter from HTTP verb. "
            "POST /multiple-delete rows carry DELETE; POST /optimize rows carry UPDATE; etc.' "
            "AFTER backend_endpoint"
        )

    # Backfill every existing row from its http_method before enforcing NOT NULL.
    op.execute(
        """
        UPDATE iam_resource_api
        SET action = CASE http_method
            WHEN 'GET'    THEN 'READ'
            WHEN 'POST'   THEN 'CREATE'
            WHEN 'PUT'    THEN 'UPDATE'
            WHEN 'PATCH'  THEN 'UPDATE'
            WHEN 'DELETE' THEN 'DELETE'
            ELSE 'CREATE'
        END
        WHERE action IS NULL
        """
    )

    # Tighten to NOT NULL now that every row has a value.
    op.execute(
        "ALTER TABLE iam_resource_api "
        "MODIFY COLUMN action ENUM('CREATE','READ','UPDATE','DELETE') NOT NULL "
        "COMMENT 'Explicit business action; decouples CRUD permission letter from HTTP verb. "
        "POST /multiple-delete rows carry DELETE; POST /optimize rows carry UPDATE; etc.'"
    )


def downgrade() -> None:
    if not _table_exists("iam_resource_api"):
        return

    if _column_exists("iam_resource_api", "action"):
        op.drop_column("iam_resource_api", "action")
