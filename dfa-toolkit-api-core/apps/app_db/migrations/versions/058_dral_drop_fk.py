"""Drop FK constraint from dataset_review_action_log.dataset_id.

Audit logs are an immutable historical record — they must outlive the dataset
they describe. Enforcing a FK on dataset_id prevents deleting a dataset while
its log entries still exist. Removing the constraint keeps the stored dataset_id
value as a historical reference without blocking dataset deletion.

Revision ID: 058_dral_drop_fk
Revises: 057_dataset_fix_columns
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "058_dral_drop_fk"
down_revision = "057_dataset_fix_columns"
branch_labels = None
depends_on = None


def _fk_exists(table: str, fk_name: str) -> bool:
    fks = inspect(op.get_bind()).get_foreign_keys(table)
    return any(fk.get("name") == fk_name for fk in fks)


def upgrade() -> None:
    if _fk_exists("dataset_review_action_log", "fk_dral_dataset"):
        op.drop_constraint("fk_dral_dataset", "dataset_review_action_log", type_="foreignkey")


def downgrade() -> None:
    if not _fk_exists("dataset_review_action_log", "fk_dral_dataset"):
        # Audit logs may reference deleted datasets (that's why the FK was dropped).
        # Remove orphaned rows so the constraint can be recreated cleanly.
        op.execute(text(
            "DELETE dral FROM dataset_review_action_log dral "
            "LEFT JOIN dataset d ON d.dataset_id = dral.dataset_id "
            "WHERE d.dataset_id IS NULL"
        ))
        op.create_foreign_key(
            "fk_dral_dataset",
            "dataset_review_action_log", "dataset",
            ["dataset_id"], ["dataset_id"],
        )
