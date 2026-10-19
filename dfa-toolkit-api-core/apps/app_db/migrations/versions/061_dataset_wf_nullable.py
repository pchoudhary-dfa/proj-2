"""Make dataset.workflow_id nullable to support passthrough mode.

When WORKFLOW_DATASET_ENABLED=no, datasets are created without a workflow
assignment (passthrough mode). The column must allow NULL.

Revision ID: 061_dataset_wf_nullable
Revises: 060_sys_cfg_is_dw
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "061_dataset_wf_nullable"
down_revision = "060_sys_cfg_is_dw"
branch_labels = None
depends_on = None

_TABLE = "dataset"
_COLUMN = "workflow_id"


def _column_nullable() -> bool:
    """Return True if dataset.workflow_id is already nullable."""
    bind = op.get_bind()
    insp = inspect(bind)
    cols = {c["name"]: c for c in insp.get_columns(_TABLE)}
    col = cols.get(_COLUMN)
    return col is not None and col.get("nullable", False)


def upgrade() -> None:
    if _column_nullable():
        return
    # Drop FK first, alter column, then re-add FK
    op.drop_constraint("fk_dataset_workflow", _TABLE, type_="foreignkey")
    op.alter_column(
        _TABLE,
        _COLUMN,
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.create_foreign_key(
        "fk_dataset_workflow",
        _TABLE,
        "workflow",
        [_COLUMN],
        ["workflow_id"],
    )


def downgrade() -> None:
    if not _column_nullable():
        return
    # NULL rows would violate NOT NULL — set them to 0 as a placeholder
    op.execute(text(f"UPDATE {_TABLE} SET {_COLUMN} = 0 WHERE {_COLUMN} IS NULL"))
    op.drop_constraint("fk_dataset_workflow", _TABLE, type_="foreignkey")
    op.alter_column(
        _TABLE,
        _COLUMN,
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_foreign_key(
        "fk_dataset_workflow",
        _TABLE,
        "workflow",
        [_COLUMN],
        ["workflow_id"],
    )
