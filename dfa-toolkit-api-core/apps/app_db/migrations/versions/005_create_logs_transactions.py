"""Create logs_transactions table

Revision ID: 005_create_logs_transactions
Revises: 004_create_logs_server_errors
Create Date: 2026-02-25

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "005_create_logs_transactions"
down_revision = "004_create_logs_server_errors"
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not table_exists("logs_transactions"):
        op.create_table(
            "logs_transactions",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False, comment="Authenticated user ID"),
            sa.Column(
                "db_id",
                sa.Integer(),
                nullable=False,
                comment="Datawarehouse ID",
            ),
            sa.Column("action", sa.String(length=50), nullable=True, comment="Operation e.g. CREATE, UPDATE, DELETE"),
            sa.Column("module", sa.String(length=255), nullable=True, comment="Entity module e.g. area, indicator"),
            sa.Column("submodule", sa.String(length=255), nullable=True, comment="Layer e.g. services, router"),
            sa.Column("identifier", sa.String(length=255), nullable=True, comment="Primary identifier of the affected record"),
            sa.Column("previousvalue", sa.Text(), nullable=True, comment="State before the change"),
            sa.Column("newvalue", sa.Text(), nullable=True, comment="State after the change"),
            sa.Column("status", sa.String(length=10), nullable=True, comment="Outcome label e.g. SUCCESS, ERROR"),
            sa.Column("description", sa.Text(), nullable=True, comment="Free-text context for the entry"),
            sa.Column("created", sa.DateTime(), nullable=True, comment="UTC timestamp of the log event"),
            sa.ForeignKeyConstraint(["db_id"], ["system_datawarehouses.id"], name="fk_logs_transactions_db_id"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("idx_lt_user_id", "logs_transactions", ["user_id"])
        op.create_index("idx_lt_db_id", "logs_transactions", ["db_id"])
        op.create_index("idx_lt_action", "logs_transactions", ["action"])
        op.create_index("idx_lt_module", "logs_transactions", ["module"])
        op.create_index("idx_lt_created", "logs_transactions", ["created"])


def downgrade() -> None:
    if table_exists("logs_transactions"):
        op.drop_index("idx_lt_created", table_name="logs_transactions")
        op.drop_index("idx_lt_module", table_name="logs_transactions")
        op.drop_index("idx_lt_action", table_name="logs_transactions")
        op.drop_index("idx_lt_db_id", table_name="logs_transactions")
        op.drop_index("idx_lt_user_id", table_name="logs_transactions")
        op.drop_table("logs_transactions")
