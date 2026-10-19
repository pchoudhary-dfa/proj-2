"""Add unique (user_id, theme_name) on dash_header_footer.

Revision ID: 127_hf_user_theme_uq
Revises: 126_dash_section_name_len
"""

from alembic import op
from sqlalchemy import inspect

revision = "127_hf_user_theme_uq"
down_revision = "126_dash_section_name_len"
branch_labels = None
depends_on = None

_CONSTRAINT = "uq_dash_header_footer_user_theme"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _constraint_exists(table: str, name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    if table not in inspector.get_table_names():
        return False
    for uc in inspector.get_unique_constraints(table):
        if uc.get("name") == name:
            return True
    for ix in inspector.get_indexes(table):
        if ix.get("name") == name and ix.get("unique"):
            return True
    return False


def upgrade() -> None:
    if not _table_exists("dash_header_footer"):
        return
    if _constraint_exists("dash_header_footer", _CONSTRAINT):
        return
    op.create_unique_constraint(
        _CONSTRAINT,
        "dash_header_footer",
        ["user_id", "theme_name"],
    )


def downgrade() -> None:
    if not _table_exists("dash_header_footer"):
        return
    if not _constraint_exists("dash_header_footer", _CONSTRAINT):
        return
    op.drop_constraint(_CONSTRAINT, "dash_header_footer", type_="unique")
