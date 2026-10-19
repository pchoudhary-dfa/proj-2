"""Add dashboard delete cascade foreign keys for dash dashboard subgraph.

Adds dashboard_id ownership columns, backfills data, and creates FK constraints
so DELETE FROM dash_dashboards cascades sections, join rows, visualizations,
analyses, IAM links, uploads, per-dashboard templates, and publish clones
(via source_dash_id ON DELETE CASCADE).

Revision ID: 123_dash_delete_fks
Revises: 122_analyses_fk_dash_viz
"""

from alembic import op
from sqlalchemy import inspect, text

revision = "123_dash_delete_fks"
down_revision = "122_analyses_fk_dash_viz"
branch_labels = None
depends_on = None

_SOURCE_DASH_FK = "fk_dash_dash_source"

_FKS = [
    (
        "dash_dashboard_visualization",
        "fk_ddv_dashboard",
        "dashboard_id",
        "dash_dashboards",
        "id",
        "CASCADE",
    ),
    (
        "dash_dashboard_visualization",
        "fk_ddv_visualization",
        "visualization_id",
        "dash_visualization",
        "id",
        "CASCADE",
    ),
    (
        "dash_visualization",
        "fk_dv_dashboard",
        "dashboard_id",
        "dash_dashboards",
        "id",
        "CASCADE",
    ),
    (
        "iam_user_role",
        "fk_iur_dashboard",
        "dashboard_id",
        "dash_dashboards",
        "id",
        "CASCADE",
    ),
    (
        "dash_uploads",
        "fk_dash_upload_dashboard",
        "dashboard_id",
        "dash_dashboards",
        "id",
        "CASCADE",
    ),
    (
        "dash_uploads",
        "fk_dash_upload_viz",
        "void",
        "dash_visualization",
        "id",
        "SET NULL",
    ),
    (
        "dash_dashboards",
        "fk_dash_dash_template",
        "template_id",
        "dash_template",
        "id",
        "SET NULL",
    ),
    (
        "dash_template",
        "fk_dash_tpl_dashboard",
        "dashboard_id",
        "dash_dashboards",
        "id",
        "CASCADE",
    ),
]


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        text(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
        ),
        {"t": table, "c": column},
    ).scalar()
    return bool(row)


def _fk_exists(table: str, fk_name: str) -> bool:
    fks = inspect(op.get_bind()).get_foreign_keys(table)
    return any(fk.get("name") == fk_name for fk in fks)


def _col_before(table: str, ref_col: str) -> str | None:
    conn = op.get_bind()
    rows = conn.execute(
        text(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t "
            "ORDER BY ORDINAL_POSITION"
        ),
        {"t": table},
    ).fetchall()
    names = [r[0] for r in rows]
    if ref_col in names:
        idx = names.index(ref_col)
        return names[idx - 1] if idx > 0 else None
    return names[-1] if names else None


def _add_column_before(table: str, column: str, col_def: str, before: str) -> None:
    if _column_exists(table, column):
        return
    anchor = _col_before(table, before)
    after_clause = f" AFTER `{anchor}`" if anchor else ""
    op.get_bind().execute(
        text(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {col_def}{after_clause}")
    )


def _cleanup_orphans(conn) -> None:
    conn.execute(text("SET SESSION sql_safe_updates = 0"))
    try:
        if _table_exists("dash_dashboard_visualization"):
            conn.execute(text(
                "DELETE ddv FROM dash_dashboard_visualization ddv "
                "LEFT JOIN dash_dashboards d ON d.id = ddv.dashboard_id "
                "WHERE ddv.dashboard_id IS NULL OR d.id IS NULL"
            ))
            conn.execute(text(
                "DELETE ddv FROM dash_dashboard_visualization ddv "
                "LEFT JOIN dash_visualization dv ON dv.id = ddv.visualization_id "
                "WHERE ddv.visualization_id IS NULL OR dv.id IS NULL"
            ))

        if _table_exists("dash_uploads") and _column_exists("dash_uploads", "dashboard_id"):
            conn.execute(text(
                "DELETE du FROM dash_uploads du "
                "LEFT JOIN dash_dashboards d ON d.id = du.dashboard_id "
                "WHERE du.dashboard_id IS NOT NULL AND d.id IS NULL"
            ))

        if _table_exists("dash_uploads") and _column_exists("dash_uploads", "void"):
            conn.execute(text(
                "UPDATE dash_uploads du "
                "LEFT JOIN dash_visualization dv ON dv.id = du.void "
                "SET du.void = NULL "
                "WHERE du.void IS NOT NULL AND dv.id IS NULL"
            ))

        if _table_exists("iam_user_role") and _column_exists("iam_user_role", "dashboard_id"):
            conn.execute(text(
                "DELETE iur FROM iam_user_role iur "
                "LEFT JOIN dash_dashboards d ON d.id = iur.dashboard_id "
                "WHERE iur.dashboard_id IS NOT NULL AND d.id IS NULL"
            ))

        if _table_exists("dash_dashboards") and _column_exists("dash_dashboards", "template_id"):
            conn.execute(text(
                "UPDATE dash_dashboards d "
                "LEFT JOIN dash_template dt ON dt.id = d.template_id "
                "SET d.template_id = NULL "
                "WHERE d.template_id IS NOT NULL AND dt.id IS NULL"
            ))
    finally:
        conn.execute(text("SET SESSION sql_safe_updates = 1"))


def _set_source_dash_fk(on_delete: str) -> None:
    """Replace source_dash_id FK (101 created it as ON DELETE SET NULL)."""
    if not _table_exists("dash_dashboards"):
        return
    if not _column_exists("dash_dashboards", "source_dash_id"):
        return
    if _fk_exists("dash_dashboards", _SOURCE_DASH_FK):
        op.drop_constraint(_SOURCE_DASH_FK, "dash_dashboards", type_="foreignkey")
    op.create_foreign_key(
        _SOURCE_DASH_FK,
        "dash_dashboards",
        "dash_dashboards",
        ["source_dash_id"],
        ["id"],
        ondelete=on_delete,
    )


def _backfill(conn) -> None:
    conn.execute(text("SET SESSION sql_safe_updates = 0"))
    try:
        if (
            _table_exists("dash_visualization")
            and _column_exists("dash_visualization", "dashboard_id")
            and _table_exists("dash_dashboard_visualization")
        ):
            conn.execute(text(
                "UPDATE dash_visualization dv "
                "INNER JOIN ( "
                "  SELECT visualization_id, MIN(dashboard_id) AS dashboard_id "
                "  FROM dash_dashboard_visualization "
                "  WHERE dashboard_id IS NOT NULL AND visualization_id IS NOT NULL "
                "  GROUP BY visualization_id "
                ") ddv ON ddv.visualization_id = dv.id "
                "SET dv.dashboard_id = ddv.dashboard_id "
                "WHERE dv.dashboard_id IS NULL"
            ))

        if (
            _table_exists("dash_template")
            and _column_exists("dash_template", "dashboard_id")
            and _table_exists("dash_dashboards")
        ):
            conn.execute(text(
                "UPDATE dash_template dt "
                "INNER JOIN dash_dashboards d ON d.template_id = dt.id "
                "SET dt.dashboard_id = d.id "
                "WHERE dt.dashboard_id IS NULL"
            ))
    finally:
        conn.execute(text("SET SESSION sql_safe_updates = 1"))


def upgrade() -> None:
    conn = op.get_bind()

    if _table_exists("dash_visualization"):
        _add_column_before(
            "dash_visualization",
            "dashboard_id",
            "INT NULL COMMENT 'FK: dash_dashboards.id — owning dashboard'",
            "created",
        )

    if _table_exists("dash_template"):
        _add_column_before(
            "dash_template",
            "dashboard_id",
            "INT NULL COMMENT 'FK: dash_dashboards.id — owning dashboard'",
            "created",
        )

    _cleanup_orphans(conn)
    _backfill(conn)

    for table, fk_name, col, ref_table, ref_col, on_delete in _FKS:
        if not _table_exists(table) or not _table_exists(ref_table):
            continue
        if not _column_exists(table, col):
            continue
        if _fk_exists(table, fk_name):
            continue
        op.create_foreign_key(
            fk_name,
            table,
            ref_table,
            [col],
            [ref_col],
            ondelete=on_delete,
        )

    _set_source_dash_fk("CASCADE")


def downgrade() -> None:
    if _table_exists("dash_dashboards") and _fk_exists("dash_dashboards", _SOURCE_DASH_FK):
        op.drop_constraint(_SOURCE_DASH_FK, "dash_dashboards", type_="foreignkey")

    for table, fk_name, col, ref_table, ref_col, on_delete in reversed(_FKS):
        if _table_exists(table) and _fk_exists(table, fk_name):
            op.drop_constraint(fk_name, table, type_="foreignkey")

    conn = op.get_bind()
    if _table_exists("dash_visualization") and _column_exists("dash_visualization", "dashboard_id"):
        conn.execute(text("ALTER TABLE dash_visualization DROP COLUMN dashboard_id"))
    if _table_exists("dash_template") and _column_exists("dash_template", "dashboard_id"):
        conn.execute(text("ALTER TABLE dash_template DROP COLUMN dashboard_id"))

    _set_source_dash_fk("SET NULL")
