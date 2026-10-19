"""Add GET /dw/{dw_id}/dataset/workflow/{workflow_id}/dataentry to iam_resource_api.

Operator-accessible mirror of the existing admin endpoint. Registered under
dm_dw_data_entry / AUTHENTICATED so data entry operators and reviewers can read
the workflow data-entry configuration without requiring dm_dw_workflow / PERMISSION.

Revision ID: 108_de_dataentry_cfg_read
Revises: 107_cmnt_cnt
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "108_de_dataentry_cfg_read"
down_revision = "107_cmnt_cnt"
branch_labels = None
depends_on = None

_APP_KEY = "DFA_DM"
_ENDPOINT = "/dw/{dw_id}/dataset/workflow/{workflow_id}"
_METHOD = "GET"


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("""
        INSERT INTO iam_resource_api
            (app_key, resource_id, http_method, backend_endpoint, action, access_level, is_active)
        SELECT
            :app_key,
            res.id,
            :method,
            :endpoint,
            'READ',
            'AUTHENTICATED',
            1
        FROM iam_resource res
        WHERE res.resource_code = 'dm_dw_data_entry'
          AND res.app_key = :app_key
        ON DUPLICATE KEY UPDATE
            resource_id  = VALUES(resource_id),
            access_level = VALUES(access_level),
            is_active    = VALUES(is_active)
    """), {"app_key": _APP_KEY, "method": _METHOD, "endpoint": _ENDPOINT})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("""
        DELETE FROM iam_resource_api
        WHERE app_key          = :app_key
          AND http_method      = :method
          AND backend_endpoint = :endpoint
    """), {"app_key": _APP_KEY, "method": _METHOD, "endpoint": _ENDPOINT})
