"""Create user_visualizations and user_visualization_keywords tables (gallery)

Revision ID: 006_create_user_visualizations
Revises: 005_create_logs_transactions
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "006_create_user_visualizations"
down_revision = "005_create_logs_transactions"
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database"""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not table_exists("user_visualizations"):
        op.create_table(
            "user_visualizations",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("user_id", sa.Integer(), nullable=False, comment="Owner; IAM user id"),
            sa.Column("item_cat", sa.String(length=100), nullable=True, comment="Item category"),
            sa.Column("item_name", sa.String(length=255), nullable=True, comment="Item name"),
            sa.Column("item_desc", sa.Text(), nullable=True, comment="Item description"),
            sa.Column("item_tags", sa.Text(), nullable=True, comment="Item tags, e.g. comma-separated or JSON"),
            sa.Column("is_dynamic", sa.Boolean(), nullable=True, server_default="1", comment="Whether item is dynamic"),
            sa.Column("chart_type", sa.String(length=100), nullable=True, comment="Chart type"),
            sa.Column("chart_sub_type", sa.String(length=100), nullable=True, comment="Chart sub-type"),
            sa.Column(
                "dw_id",
                sa.Integer(),
                sa.ForeignKey("system_datawarehouses.id"),
                nullable=True,
                comment="FK: system_datawarehouses.id",
            ),
            sa.Column("properties", sa.Text(), nullable=True, comment="JSON or config"),
            sa.Column("payload", sa.Text(), nullable=True, comment="JSON or config"),
            sa.Column("datacube", sa.Text(), nullable=True, comment="Used when is_dynamic is False"),
            sa.Column("created_at", sa.DateTime(), nullable=True, comment="Creation timestamp"),
            sa.Column("updated_at", sa.DateTime(), nullable=True, comment="Last update timestamp"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not table_exists("user_visualization_keywords"):
        op.create_table(
            "user_visualization_keywords",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column(
                "user_visualization_id",
                sa.Integer(),
                sa.ForeignKey("user_visualizations.id", ondelete="CASCADE"),
                nullable=False,
                comment="FK: user_visualizations.id",
            ),
            sa.Column(
                "keyword",
                sa.String(length=255),
                nullable=False,
                comment="Keyword from gallery name, description, tags for search",
            ),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    if table_exists("user_visualization_keywords"):
        op.drop_table("user_visualization_keywords")
    if table_exists("user_visualizations"):
        op.drop_table("user_visualizations")
