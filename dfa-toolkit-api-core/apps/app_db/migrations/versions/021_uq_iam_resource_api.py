"""Add composite unique constraint on iam_resource_api (app_key, http_method, backend_endpoint).

Idempotent: the constraint is only added if it does not already exist.

Revision ID: 021_uq_iam_resource_api
Revises: 020_drop_name_sys_language
Create Date: 2026-03-13
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "021_uq_iam_resource_api"
down_revision = "020_drop_name_sys_language"
branch_labels = None
depends_on = None

def _unique_constraints(table: str) -> set[str]:
    bind = op.get_bind()
    return {uc["name"] for uc in inspect(bind).get_unique_constraints(table)}


def upgrade() -> None:
    ucs = _unique_constraints("iam_resource_api")
    if "uq_iam_rapi_app_method_endpoint" not in ucs:
        op.create_unique_constraint(
            "uq_iam_rapi_app_method_endpoint",
            "iam_resource_api",
            ["app_key", "http_method", "backend_endpoint"],
        )


def downgrade() -> None:
    ucs = _unique_constraints("iam_resource_api")
    if "uq_iam_rapi_app_method_endpoint" in ucs:
        op.drop_constraint("uq_iam_rapi_app_method_endpoint", "iam_resource_api", type_="unique")
