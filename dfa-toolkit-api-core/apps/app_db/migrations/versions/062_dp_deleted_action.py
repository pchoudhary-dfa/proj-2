"""Add DATA_POINT_DELETED to dataset_action_enum.

Required for audit logging when an approved data point is deleted from ut_data.

Revision ID: 062_dp_deleted_action
Revises: 061_dataset_wf_nullable
"""

from alembic import op
from sqlalchemy import text

revision = "062_dp_deleted_action"
down_revision = "061_dataset_wf_nullable"
branch_labels = None
depends_on = None

_TABLE = "dataset_review_action_log"
_COLUMN = "action"
_NEW_VALUE = "DATA_POINT_DELETED"

# Full ordered enum values after upgrade
_UPGRADED_ENUM = (
    "DATASET_CREATED", "DATASET_SUBMITTED", "DATASET_RESUBMITTED",
    "STAGE_ACTIVATED", "SLICE_ACTIVATED",
    "SLICE_APPROVED", "SLICE_RETURNED", "SLICE_REJECTED",
    "DATA_POINT_APPROVED", "DATA_POINT_REJECTED",
    "DATA_POINT_CORRECTED", "DATA_POINT_COMMENTED",
    "DATA_POINT_DELETED",
    "STAGE_COMPLETED",
    "DATASET_APPROVED", "DATASET_REJECTED", "DATASET_CANCELLED",
)

# Original values (without DATA_POINT_DELETED)
_ORIGINAL_ENUM = tuple(v for v in _UPGRADED_ENUM if v != _NEW_VALUE)


def _enum_sql(values: tuple) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    bind = op.get_bind()
    # Check if value already present (idempotent)
    result = bind.execute(
        text(
            f"SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
            f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{_TABLE}' AND COLUMN_NAME = '{_COLUMN}'"
        )
    ).fetchone()
    if result and _NEW_VALUE in result[0]:
        return  # already present
    op.execute(
        text(
            f"ALTER TABLE {_TABLE} MODIFY COLUMN {_COLUMN} "
            f"ENUM({_enum_sql(_UPGRADED_ENUM)}) NOT NULL"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    # Remove any rows using the new value before shrinking the enum
    bind.execute(
        text(f"DELETE FROM {_TABLE} WHERE {_COLUMN} = '{_NEW_VALUE}'")
    )
    op.execute(
        text(
            f"ALTER TABLE {_TABLE} MODIFY COLUMN {_COLUMN} "
            f"ENUM({_enum_sql(_ORIGINAL_ENUM)}) NOT NULL"
        )
    )
