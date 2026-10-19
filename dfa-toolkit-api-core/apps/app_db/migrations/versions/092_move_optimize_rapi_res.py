"""Re-parent POST /dw/{dw_id}/optimize from sys_datawarehouse to dm_dw_data_admin_maintenance.

Resolves iam_resource_api by natural key (app_key, http_method, backend_endpoint)
and current parent resource_code — no hardcoded iam_resource_api.id.

Steps:
  1) Remove duplicate iam_role_resource_api rows (same role_id + resource_api_id).
  2) UPDATE iam_resource_api.resource_id to dm_dw_data_admin_maintenance.
  3) UPDATE iam_role_resource_api.resource_id for grants on that resource_api_id.

Downgrade restores the previous parent (sys_datawarehouse) for the same route.

Revision ID: 090_move_optimize_rapi_res
Revises: 089_iam_resource_api_action
"""

from alembic import op
from sqlalchemy import inspect

revision = "092_move_optimize_rapi_res"
down_revision = "091_ddp_is_deleted"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not all(_table_exists(t) for t in ("iam_resource_api", "iam_resource", "iam_role_resource_api")):
        return

    # 1) Dedupe role–API grants for this endpoint (keep lowest id per role_id + resource_api_id).
    op.execute(
        """
        DELETE r1 FROM iam_role_resource_api AS r1
        INNER JOIN iam_role_resource_api AS r2
          ON r1.role_id = r2.role_id
         AND r1.resource_api_id = r2.resource_api_id
         AND r1.id > r2.id
        INNER JOIN iam_resource_api AS rapi ON rapi.id = r1.resource_api_id
        INNER JOIN iam_resource AS res ON res.id = rapi.resource_id
        WHERE rapi.app_key = 'DFA_DM'
          AND rapi.http_method = 'POST'
          AND rapi.backend_endpoint = '/dw/{dw_id}/optimize'
          AND res.resource_code = 'sys_datawarehouse'
        """
    )

    # 2) Point the API row at dm_dw_data_admin_maintenance (same app_key).
    op.execute(
        """
        UPDATE iam_resource_api AS rapi
        INNER JOIN iam_resource AS old_res ON old_res.id = rapi.resource_id
        INNER JOIN iam_resource AS new_res
          ON new_res.app_key = rapi.app_key
         AND new_res.resource_code = 'dm_dw_data_admin_maintenance'
        SET rapi.resource_id = new_res.id
        WHERE rapi.app_key = 'DFA_DM'
          AND rapi.http_method = 'POST'
          AND rapi.backend_endpoint = '/dw/{dw_id}/optimize'
          AND old_res.resource_code = 'sys_datawarehouse'
        """
    )

    # 3) Align iam_role_resource_api.resource_id with the new parent resource.
    op.execute(
        """
        UPDATE iam_role_resource_api AS rra
        INNER JOIN iam_resource_api AS rapi ON rapi.id = rra.resource_api_id
        INNER JOIN iam_resource AS new_res
          ON new_res.app_key = rapi.app_key
         AND new_res.resource_code = 'dm_dw_data_admin_maintenance'
        SET rra.resource_id = new_res.id
        WHERE rapi.app_key = 'DFA_DM'
          AND rapi.http_method = 'POST'
          AND rapi.backend_endpoint = '/dw/{dw_id}/optimize'
        """
    )


def downgrade() -> None:
    if not all(_table_exists(t) for t in ("iam_resource_api", "iam_resource", "iam_role_resource_api")):
        return

    op.execute(
        """
        UPDATE iam_resource_api AS rapi
        INNER JOIN iam_resource AS cur_res ON cur_res.id = rapi.resource_id
        INNER JOIN iam_resource AS old_res
          ON old_res.app_key = rapi.app_key
         AND old_res.resource_code = 'sys_datawarehouse'
        SET rapi.resource_id = old_res.id
        WHERE rapi.app_key = 'DFA_DM'
          AND rapi.http_method = 'POST'
          AND rapi.backend_endpoint = '/dw/{dw_id}/optimize'
          AND cur_res.resource_code = 'dm_dw_data_admin_maintenance'
        """
    )

    op.execute(
        """
        UPDATE iam_role_resource_api AS rra
        INNER JOIN iam_resource_api AS rapi ON rapi.id = rra.resource_api_id
        INNER JOIN iam_resource AS old_res
          ON old_res.app_key = rapi.app_key
         AND old_res.resource_code = 'sys_datawarehouse'
        SET rra.resource_id = old_res.id
        WHERE rapi.app_key = 'DFA_DM'
          AND rapi.http_method = 'POST'
          AND rapi.backend_endpoint = '/dw/{dw_id}/optimize'
        """
    )
