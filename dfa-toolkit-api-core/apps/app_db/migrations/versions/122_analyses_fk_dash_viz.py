"""Point dash_analyses.visualization_id at dash_visualization instead of system_gallery.

Revision ID: 122_analyses_fk_dash_viz
Revises: 121_ius_sep_dfa_core
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "122_analyses_fk_dash_viz"
down_revision = "121_ius_sep_dfa_core"
branch_labels = None
depends_on = None

_OLD_FK = "fk_dash_analyses_gallery"
_NEW_FK = "fk_dash_analyses_visualization"


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _fk_exists(table: str, fk_name: str) -> bool:
    fks = inspect(op.get_bind()).get_foreign_keys(table)
    return any(fk.get("name") == fk_name for fk in fks)


def upgrade() -> None:
    if not _table_exists("dash_analyses"):
        return

    conn = op.get_bind()

    if _table_exists("dash_visualization"):
        conn.execute(text("SET SESSION sql_safe_updates = 0"))
        conn.execute(text(
            "DELETE da FROM dash_analyses da "
            "LEFT JOIN dash_visualization dv ON dv.id = da.visualization_id "
            "WHERE dv.id IS NULL"
        ))
        conn.execute(text("SET SESSION sql_safe_updates = 1"))

    if _fk_exists("dash_analyses", _OLD_FK):
        op.drop_constraint(_OLD_FK, "dash_analyses", type_="foreignkey")

    if _table_exists("dash_visualization") and not _fk_exists("dash_analyses", _NEW_FK):
        op.create_foreign_key(
            _NEW_FK,
            "dash_analyses",
            "dash_visualization",
            ["visualization_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    if not _table_exists("dash_analyses"):
        return

    conn = op.get_bind()

    if _fk_exists("dash_analyses", _NEW_FK):
        op.drop_constraint(_NEW_FK, "dash_analyses", type_="foreignkey")

    if _table_exists("system_gallery"):
        conn.execute(text("SET SESSION sql_safe_updates = 0"))
        conn.execute(text(
            "DELETE da FROM dash_analyses da "
            "LEFT JOIN system_gallery sg ON sg.id = da.visualization_id "
            "WHERE sg.id IS NULL"
        ))
        conn.execute(text("SET SESSION sql_safe_updates = 1"))

    if not _fk_exists("dash_analyses", _OLD_FK):
        op.create_foreign_key(
            _OLD_FK,
            "dash_analyses",
            "system_gallery",
            ["visualization_id"],
            ["id"],
            ondelete="CASCADE",
        )
