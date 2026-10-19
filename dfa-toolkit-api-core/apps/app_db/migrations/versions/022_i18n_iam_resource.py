"""
022 — Add iam_resource_i18n and iam_resource_api_i18n tables;
      drop name from iam_resource and description from iam_resource_api.

Idempotent: all DDL operations are guarded by existence checks so the
migration can be re-run safely against a DB that is already partially or
fully migrated.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision = "022_i18n_iam_resource"
down_revision = "021_uq_iam_resource_api"
branch_labels = None
depends_on = None

def _col_names(insp, table: str) -> set[str]:
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # ------------------------------------------------------------------
    # 1. Drop iam_resource.name
    # ------------------------------------------------------------------
    if "name" in _col_names(insp, "iam_resource"):
        op.drop_column("iam_resource", "name")

    # ------------------------------------------------------------------
    # 2. Create iam_resource_i18n
    # ------------------------------------------------------------------
    if "iam_resource_i18n" not in existing_tables:
        op.create_table(
            "iam_resource_i18n",
            sa.Column("master_id", sa.Integer(), nullable=False),
            sa.Column("locale", sa.String(3), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.ForeignKeyConstraint(["master_id"], ["iam_resource.id"]),
            sa.PrimaryKeyConstraint("master_id", "locale"),
        )

    # ------------------------------------------------------------------
    # 3. Drop iam_resource_api.description
    # ------------------------------------------------------------------
    if "description" in _col_names(insp, "iam_resource_api"):
        op.drop_column("iam_resource_api", "description")

    # ------------------------------------------------------------------
    # 4. Create iam_resource_api_i18n
    # ------------------------------------------------------------------
    if "iam_resource_api_i18n" not in existing_tables:
        op.create_table(
            "iam_resource_api_i18n",
            sa.Column("master_id", sa.Integer(), nullable=False),
            sa.Column("locale", sa.String(3), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["master_id"], ["iam_resource_api.id"]),
            sa.PrimaryKeyConstraint("master_id", "locale"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # Drop iam_resource_api_i18n
    if "iam_resource_api_i18n" in existing_tables:
        op.drop_table("iam_resource_api_i18n")

    # Re-add iam_resource_api.description
    if "description" not in _col_names(insp, "iam_resource_api"):
        op.add_column("iam_resource_api", sa.Column("description", sa.Text(), nullable=True))

    # Drop iam_resource_i18n
    if "iam_resource_i18n" in existing_tables:
        op.drop_table("iam_resource_i18n")

    # Re-add iam_resource.name (nullable to avoid failing on existing rows)
    if "name" not in _col_names(insp, "iam_resource"):
        op.add_column("iam_resource", sa.Column("name", sa.String(100), nullable=True))
