"""Rename audit columns in workflow tables to match master-table convention.

Revision ID: 044_rename_workflow_audit_cols
Revises: 043_bg_job_queue_id_to_int
Create Date: 2026-04-06

Changes per table
-----------------
review_workflow_level:
    created_at  → created

review_workflow_rule:
    created_at  → created

review_workflow_level_reviewer_rule:
    created_by  → created_user_id
    created_at  → created

review_workflow already has the correct column names (created, created_user_id,
modified, modified_user_id) from a prior migration — no changes needed there.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "044_rename_workflow_audit_cols"
down_revision = "043_bg_job_queue_id_to_int"
branch_labels = None
depends_on = None


def table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def column_exists(table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(op.get_bind()).get_columns(table)]


def upgrade() -> None:
    # ------------------------------------------------------------------
    # review_workflow_level: created_at → created
    # ------------------------------------------------------------------
    if table_exists("review_workflow_level"):
        if column_exists("review_workflow_level", "created_at"):
            op.alter_column(
                "review_workflow_level",
                "created_at",
                new_column_name="created",
                existing_type=sa.DateTime(),
                existing_nullable=False,
                existing_server_default=text("CURRENT_TIMESTAMP"),
            )

    # ------------------------------------------------------------------
    # review_workflow_rule: created_at → created
    # ------------------------------------------------------------------
    if table_exists("review_workflow_rule"):
        if column_exists("review_workflow_rule", "created_at"):
            op.alter_column(
                "review_workflow_rule",
                "created_at",
                new_column_name="created",
                existing_type=sa.DateTime(),
                existing_nullable=False,
                existing_server_default=text("CURRENT_TIMESTAMP"),
            )

    # ------------------------------------------------------------------
    # review_workflow_level_reviewer_rule:
    #   created_by → created_user_id
    #   created_at → created
    # ------------------------------------------------------------------
    if table_exists("review_workflow_level_reviewer_rule"):
        if column_exists("review_workflow_level_reviewer_rule", "created_by"):
            op.alter_column(
                "review_workflow_level_reviewer_rule",
                "created_by",
                new_column_name="created_user_id",
                existing_type=sa.Integer(),
                existing_nullable=True,
            )
        if column_exists("review_workflow_level_reviewer_rule", "created_at"):
            op.alter_column(
                "review_workflow_level_reviewer_rule",
                "created_at",
                new_column_name="created",
                existing_type=sa.DateTime(),
                existing_nullable=False,
                existing_server_default=text("CURRENT_TIMESTAMP"),
            )


def downgrade() -> None:
    # ------------------------------------------------------------------
    # review_workflow_level_reviewer_rule
    # ------------------------------------------------------------------
    if table_exists("review_workflow_level_reviewer_rule"):
        if column_exists("review_workflow_level_reviewer_rule", "created"):
            op.alter_column(
                "review_workflow_level_reviewer_rule",
                "created",
                new_column_name="created_at",
                existing_type=sa.DateTime(),
                existing_nullable=False,
                existing_server_default=text("CURRENT_TIMESTAMP"),
            )
        if column_exists("review_workflow_level_reviewer_rule", "created_user_id"):
            op.alter_column(
                "review_workflow_level_reviewer_rule",
                "created_user_id",
                new_column_name="created_by",
                existing_type=sa.Integer(),
                existing_nullable=True,
            )

    # ------------------------------------------------------------------
    # review_workflow_rule
    # ------------------------------------------------------------------
    if table_exists("review_workflow_rule"):
        if column_exists("review_workflow_rule", "created"):
            op.alter_column(
                "review_workflow_rule",
                "created",
                new_column_name="created_at",
                existing_type=sa.DateTime(),
                existing_nullable=False,
                existing_server_default=text("CURRENT_TIMESTAMP"),
            )

    # ------------------------------------------------------------------
    # review_workflow_level
    # ------------------------------------------------------------------
    if table_exists("review_workflow_level"):
        if column_exists("review_workflow_level", "created"):
            op.alter_column(
                "review_workflow_level",
                "created",
                new_column_name="created_at",
                existing_type=sa.DateTime(),
                existing_nullable=False,
                existing_server_default=text("CURRENT_TIMESTAMP"),
            )
