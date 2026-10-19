"""Replace system_configuration.dw_id with is_dw boolean; one row per (app_key, key_code).

Keeps canonical row per (app_key, key_code): prefer dw_id=0 when present, else minimum id.
Marks warehouse-mirrored keys with is_dw=1 for db_configuration seeding.

Revision ID: 060_sys_cfg_is_dw
Revises: 059_drr_i18n
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "060_sys_cfg_is_dw"
down_revision = "059_drr_i18n"
branch_labels = None
depends_on = None

_OLD_UQ = "uq_sys_config_app_dw_key"
_NEW_UQ = "uq_sys_config_app_key_code"
_FK_APP_KEY = "fk_system_configuration_app_key"
_APP_TABLE = "system_application"

_IS_DW_KEYS_SQL = (
    "('AI_PROVIDER','AI_API_KEY','CURRENT_TIMEPERIOD','IUS_DEF_VALIDATION',"
    "'IND_CLASSIFICATIONS_SETTINGS','DEFAULT_SYSTEM_DW_SUBGROUP_GID',"
    "'DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID','DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID')"
)


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _constraint_exists(table_name: str, constraint_name: str) -> bool:
    inspector = inspect(op.get_bind())
    try:
        for uc in inspector.get_unique_constraints(table_name):
            if uc.get("name") == constraint_name:
                return True
        for ix in inspector.get_indexes(table_name):
            if ix.get("name") == constraint_name and ix.get("unique"):
                return True
        return False
    except Exception:
        return False


def _column_exists(table_name: str, column_name: str) -> bool:
    try:
        cols = inspect(op.get_bind()).get_columns(table_name)
        return any(c["name"] == column_name for c in cols)
    except Exception:
        return False


def _is_fk_app_key(fk: dict) -> bool:
    name = fk.get("name")
    constrained = list(fk.get("constrained_columns") or [])
    ref_cols = list(fk.get("referred_columns") or [])
    return name == _FK_APP_KEY or (
        constrained == ["app_key"]
        and fk.get("referred_table") == _APP_TABLE
        and ref_cols == ["app_key"]
    )


def _fk_app_key_exists() -> bool:
    for fk in inspect(op.get_bind()).get_foreign_keys("system_configuration"):
        if _is_fk_app_key(fk):
            return True
    return False


def _drop_fk_app_key() -> None:
    for fk in inspect(op.get_bind()).get_foreign_keys("system_configuration"):
        name = fk.get("name")
        if not name or not _is_fk_app_key(fk):
            continue
        op.drop_constraint(name, "system_configuration", type_="foreignkey")
        print(f"[OK] Dropped foreign key {name}")
        return


def _create_fk_app_key_if_missing() -> None:
    if _fk_app_key_exists():
        return
    if not _table_exists(_APP_TABLE):
        print(f"[WARN] {_APP_TABLE} missing, skipping recreate {_FK_APP_KEY}")
        return
    op.create_foreign_key(
        _FK_APP_KEY,
        "system_configuration",
        _APP_TABLE,
        ["app_key"],
        ["app_key"],
    )
    print(f"[OK] Created foreign key {_FK_APP_KEY}")


def upgrade() -> None:
    if not _table_exists("system_configuration"):
        print("[WARN] system_configuration missing, skipping 060_sys_cfg_is_dw")
        return

    bind = op.get_bind()

    # MySQL: fk_system_configuration_app_key uses uq_sys_config_app_dw_key as child index (app_key prefix).
    _drop_fk_app_key()

    if _constraint_exists("system_configuration", _OLD_UQ):
        op.drop_constraint(_OLD_UQ, "system_configuration", type_="unique")
        print(f"[OK] Dropped {_OLD_UQ}")

    # Dedupe: keep row with dw_id=0 if any for (app_key, key_code), else smallest id.
    bind.execute(
        text(
            """
            DELETE sc FROM system_configuration sc
            INNER JOIN (
                SELECT
                    s.app_key,
                    s.key_code,
                    COALESCE(
                        (
                            SELECT MIN(s0.id)
                            FROM system_configuration s0
                            WHERE s0.app_key = s.app_key
                              AND s0.key_code = s.key_code
                              AND s0.dw_id = 0
                        ),
                        MIN(s.id)
                    ) AS keeper_id
                FROM system_configuration s
                GROUP BY s.app_key, s.key_code
            ) k ON sc.app_key = k.app_key AND sc.key_code = k.key_code
            WHERE sc.id <> k.keeper_id
            """
        )
    )
    print("[OK] Deduplicated system_configuration rows per (app_key, key_code)")

    if _column_exists("system_configuration", "dw_id"):
        op.drop_column("system_configuration", "dw_id")
        print("[OK] Dropped dw_id column")

    if not _column_exists("system_configuration", "is_dw"):
        op.add_column(
            "system_configuration",
            sa.Column(
                "is_dw",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="When true, key is seeded into warehouse db_configuration",
            ),
        )
        print("[OK] Added is_dw column")

    bind.execute(
        text(f"UPDATE system_configuration SET is_dw = 1 WHERE key_code IN {_IS_DW_KEYS_SQL}")
    )
    print("[OK] Set is_dw=1 for warehouse-mirrored key_codes")

    if not _constraint_exists("system_configuration", _NEW_UQ):
        op.create_unique_constraint(
            _NEW_UQ,
            "system_configuration",
            ["app_key", "key_code"],
        )
        print(f"[OK] Added unique constraint {_NEW_UQ}")

    _create_fk_app_key_if_missing()


def downgrade() -> None:
    if not _table_exists("system_configuration"):
        return

    _drop_fk_app_key()

    if _constraint_exists("system_configuration", _NEW_UQ):
        op.drop_constraint(_NEW_UQ, "system_configuration", type_="unique")

    if _column_exists("system_configuration", "is_dw"):
        op.drop_column("system_configuration", "is_dw")

    if not _column_exists("system_configuration", "dw_id"):
        op.add_column(
            "system_configuration",
            sa.Column("dw_id", sa.Integer(), nullable=False, server_default="0"),
        )

    if not _constraint_exists("system_configuration", _OLD_UQ):
        op.create_unique_constraint(
            _OLD_UQ,
            "system_configuration",
            ["app_key", "dw_id", "key_code"],
        )

    _create_fk_app_key_if_missing()
