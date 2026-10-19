"""Fix dataset table columns and create missing tables.

Changes applied to tables created by 056 (which ran before column renames):

dataset:
  - dataset_gid: VARCHAR(36) → VARCHAR(60)
  - created_by_user_id → created_user_id
  - created_at → created

dataset_data_point:
  - ius_id → iusnid
  - indicator_id → indicator_nid
  - unit_id → unit_nid
  - subgroup_id → subgroup_val_nid
  - area_id → area_nid
  - timeperiod_id → timeperiod_nid
  - source_id → source_nid
  - data_value VARCHAR(50) → FLOAT; add textual_data_value TEXT, istextualdata BOOLEAN
  - prev_timeperiod_id → prev_timeperiod_nid
  - prev_data_value VARCHAR(50) → FLOAT; add prev_textual_data_value TEXT
  - add footnote_nid INT
  - created_at → created
  - updated_at → modified

dataset_entry_period:
  - created_by → created_user_id
  - created_at → created

dataset_rejection_reason:
  - created_at → created

dataset_review_slice:
  - created_at → created

Created (were missing from first migration run):
  - dataset_review_slice_rejection
  - dataset_review_action_log

Revision ID: 057_dataset_fix_columns
Revises: 056_dataset_tables
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "057_dataset_fix_columns"
down_revision = "056_dataset_tables"
branch_labels = None
depends_on = None


def _col_exists(table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(op.get_bind()).get_columns(table)]


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    # ------------------------------------------------------------------
    # dataset
    # ------------------------------------------------------------------
    if _col_exists("dataset", "dataset_gid"):
        op.alter_column("dataset", "dataset_gid",
                        existing_type=sa.String(36),
                        type_=sa.String(60),
                        nullable=False)

    if _col_exists("dataset", "created_by_user_id"):
        op.alter_column("dataset", "created_by_user_id",
                        new_column_name="created_user_id",
                        existing_type=sa.Integer(),
                        nullable=False)

    if _col_exists("dataset", "created_at"):
        op.alter_column("dataset", "created_at",
                        new_column_name="created",
                        existing_type=sa.DateTime(),
                        existing_server_default=text("CURRENT_TIMESTAMP"),
                        nullable=False)

    # ------------------------------------------------------------------
    # dataset_data_point — reference column renames (match ut_data names)
    # ------------------------------------------------------------------
    renames_ddp = [
        ("ius_id",         "iusnid",           sa.Integer()),
        ("indicator_id",   "indicator_nid",     sa.Integer()),
        ("unit_id",        "unit_nid",          sa.Integer()),
        ("subgroup_id",    "subgroup_val_nid",  sa.Integer()),
        ("area_id",        "area_nid",          sa.Integer()),
        ("timeperiod_id",  "timeperiod_nid",    sa.Integer()),
        ("source_id",      "source_nid",        sa.Integer()),
        ("prev_timeperiod_id", "prev_timeperiod_nid", sa.Integer()),
    ]
    for old, new, typ in renames_ddp:
        if _col_exists("dataset_data_point", old):
            op.alter_column("dataset_data_point", old,
                            new_column_name=new,
                            existing_type=typ,
                            nullable=True)

    # data_value: VARCHAR(50) → FLOAT; add textual_data_value + istextualdata
    if _col_exists("dataset_data_point", "data_value"):
        op.alter_column("dataset_data_point", "data_value",
                        existing_type=sa.String(50),
                        type_=sa.Float(),
                        nullable=True)
    if not _col_exists("dataset_data_point", "textual_data_value"):
        op.add_column("dataset_data_point",
                      sa.Column("textual_data_value", sa.Text(), nullable=True,
                                comment="Non-numeric/textual value (matches ut_data.textual_data_value)"))
    if not _col_exists("dataset_data_point", "istextualdata"):
        op.add_column("dataset_data_point",
                      sa.Column("istextualdata", sa.Boolean(), nullable=False,
                                server_default=text("0"),
                                comment="Matches ut_data.istextualdata"))

    # prev_data_value: VARCHAR(50) → FLOAT; add prev_textual_data_value
    if _col_exists("dataset_data_point", "prev_data_value"):
        op.alter_column("dataset_data_point", "prev_data_value",
                        existing_type=sa.String(50),
                        type_=sa.Float(),
                        nullable=True)
    if not _col_exists("dataset_data_point", "prev_textual_data_value"):
        op.add_column("dataset_data_point",
                      sa.Column("prev_textual_data_value", sa.Text(), nullable=True))

    # footnote_nid (new column matching ut_data)
    if not _col_exists("dataset_data_point", "footnote_nid"):
        op.add_column("dataset_data_point",
                      sa.Column("footnote_nid", sa.Integer(), nullable=True,
                                comment="Matches ut_data.footnote_nid"))

    # created_at → created, updated_at → modified
    if _col_exists("dataset_data_point", "created_at"):
        op.alter_column("dataset_data_point", "created_at",
                        new_column_name="created",
                        existing_type=sa.DateTime(),
                        existing_server_default=text("CURRENT_TIMESTAMP"),
                        nullable=False)
    if _col_exists("dataset_data_point", "updated_at"):
        op.alter_column("dataset_data_point", "updated_at",
                        new_column_name="modified",
                        existing_type=sa.DateTime(),
                        nullable=True)

    # ------------------------------------------------------------------
    # dataset_entry_period
    # ------------------------------------------------------------------
    if _col_exists("dataset_entry_period", "created_by"):
        op.alter_column("dataset_entry_period", "created_by",
                        new_column_name="created_user_id",
                        existing_type=sa.Integer(),
                        nullable=False)
    if _col_exists("dataset_entry_period", "created_at"):
        op.alter_column("dataset_entry_period", "created_at",
                        new_column_name="created",
                        existing_type=sa.DateTime(),
                        existing_server_default=text("CURRENT_TIMESTAMP"),
                        nullable=False)

    # ------------------------------------------------------------------
    # dataset_rejection_reason
    # ------------------------------------------------------------------
    if _col_exists("dataset_rejection_reason", "created_at"):
        op.alter_column("dataset_rejection_reason", "created_at",
                        new_column_name="created",
                        existing_type=sa.DateTime(),
                        existing_server_default=text("CURRENT_TIMESTAMP"),
                        nullable=False)

    # ------------------------------------------------------------------
    # dataset_review_slice
    # ------------------------------------------------------------------
    if _col_exists("dataset_review_slice", "created_at"):
        op.alter_column("dataset_review_slice", "created_at",
                        new_column_name="created",
                        existing_type=sa.DateTime(),
                        existing_server_default=text("CURRENT_TIMESTAMP"),
                        nullable=False)

    # ------------------------------------------------------------------
    # dataset_review_slice_rejection  (missing from first run)
    # ------------------------------------------------------------------
    if not _table_exists("dataset_review_slice_rejection"):
        op.create_table(
            "dataset_review_slice_rejection",
            sa.Column("id",        sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("slice_id",  sa.Integer(), nullable=False,   comment="FK → dataset_review_slice"),
            sa.Column("reason_id", sa.Integer(), nullable=False,   comment="FK → dataset_rejection_reason"),
            sa.UniqueConstraint("slice_id", "reason_id", name="uq_drsr_slice_reason"),
            sa.Index("idx_drsr_slice", "slice_id"),
            sa.ForeignKeyConstraint(["slice_id"],  ["dataset_review_slice.slice_id"],        name="fk_drsr_slice"),
            sa.ForeignKeyConstraint(["reason_id"], ["dataset_rejection_reason.reason_id"],   name="fk_drsr_reason"),
        )

    # ------------------------------------------------------------------
    # dataset_review_action_log  (missing from first run)
    # ------------------------------------------------------------------
    if not _table_exists("dataset_review_action_log"):
        op.create_table(
            "dataset_review_action_log",
            sa.Column("log_id",            sa.Integer(),  primary_key=True, autoincrement=True),
            sa.Column("dataset_id",        sa.Integer(),  nullable=False),
            sa.Column("stage_id",          sa.Integer(),  nullable=True),
            sa.Column("slice_id",          sa.Integer(),  nullable=True),
            sa.Column("data_point_id",     sa.Integer(),  nullable=True,  comment="Set for indicator-level actions"),
            sa.Column("action", sa.Enum(
                "DATASET_CREATED", "DATASET_SUBMITTED", "DATASET_RESUBMITTED",
                "STAGE_ACTIVATED", "SLICE_ACTIVATED",
                "SLICE_APPROVED", "SLICE_RETURNED", "SLICE_REJECTED",
                "DATA_POINT_APPROVED", "DATA_POINT_REJECTED",
                "DATA_POINT_CORRECTED", "DATA_POINT_COMMENTED",
                "STAGE_COMPLETED",
                "DATASET_APPROVED", "DATASET_REJECTED", "DATASET_CANCELLED",
                name="dataset_action_enum",
            ), nullable=False),
            sa.Column("prev_status",       sa.String(50), nullable=True),
            sa.Column("new_status",        sa.String(50), nullable=True),
            sa.Column("action_by_user_id", sa.Integer(),  nullable=False, comment="0 = system process"),
            sa.Column("action_at",         sa.DateTime(), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("remarks",           sa.Text(),     nullable=True),
            sa.Index("idx_dral_dataset",    "dataset_id"),
            sa.Index("idx_dral_data_point", "data_point_id"),
            sa.Index("idx_dral_action",     "action"),
            sa.ForeignKeyConstraint(["dataset_id"], ["dataset.dataset_id"], name="fk_dral_dataset"),
        )


def downgrade() -> None:
    # Drop created tables
    for tbl in ["dataset_review_action_log", "dataset_review_slice_rejection"]:
        if _table_exists(tbl):
            op.drop_table(tbl)

    # Revert dataset_review_slice
    if _col_exists("dataset_review_slice", "created"):
        op.alter_column("dataset_review_slice", "created",
                        new_column_name="created_at",
                        existing_type=sa.DateTime(), nullable=False)

    # Revert dataset_rejection_reason
    if _col_exists("dataset_rejection_reason", "created"):
        op.alter_column("dataset_rejection_reason", "created",
                        new_column_name="created_at",
                        existing_type=sa.DateTime(), nullable=False)

    # Revert dataset_entry_period
    if _col_exists("dataset_entry_period", "created_user_id"):
        op.alter_column("dataset_entry_period", "created_user_id",
                        new_column_name="created_by",
                        existing_type=sa.Integer(), nullable=False)
    if _col_exists("dataset_entry_period", "created"):
        op.alter_column("dataset_entry_period", "created",
                        new_column_name="created_at",
                        existing_type=sa.DateTime(), nullable=False)

    # Revert dataset_data_point
    for old, new, typ in [
        ("iusnid",          "ius_id",        sa.Integer()),
        ("indicator_nid",   "indicator_id",  sa.Integer()),
        ("unit_nid",        "unit_id",       sa.Integer()),
        ("subgroup_val_nid","subgroup_id",   sa.Integer()),
        ("area_nid",        "area_id",       sa.Integer()),
        ("timeperiod_nid",  "timeperiod_id", sa.Integer()),
        ("source_nid",      "source_id",     sa.Integer()),
        ("prev_timeperiod_nid", "prev_timeperiod_id", sa.Integer()),
    ]:
        if _col_exists("dataset_data_point", old):
            op.alter_column("dataset_data_point", old,
                            new_column_name=new, existing_type=typ, nullable=True)

    for col in ["textual_data_value", "istextualdata", "prev_textual_data_value", "footnote_nid"]:
        if _col_exists("dataset_data_point", col):
            op.drop_column("dataset_data_point", col)

    if _col_exists("dataset_data_point", "data_value"):
        op.alter_column("dataset_data_point", "data_value",
                        existing_type=sa.Float(), type_=sa.String(50), nullable=True)
    if _col_exists("dataset_data_point", "prev_data_value"):
        op.alter_column("dataset_data_point", "prev_data_value",
                        existing_type=sa.Float(), type_=sa.String(50), nullable=True)
    if _col_exists("dataset_data_point", "created"):
        op.alter_column("dataset_data_point", "created",
                        new_column_name="created_at",
                        existing_type=sa.DateTime(), nullable=False)
    if _col_exists("dataset_data_point", "modified"):
        op.alter_column("dataset_data_point", "modified",
                        new_column_name="updated_at",
                        existing_type=sa.DateTime(), nullable=True)

    # Revert dataset
    if _col_exists("dataset", "created_user_id"):
        op.alter_column("dataset", "created_user_id",
                        new_column_name="created_by_user_id",
                        existing_type=sa.Integer(), nullable=False)
    if _col_exists("dataset", "created"):
        op.alter_column("dataset", "created",
                        new_column_name="created_at",
                        existing_type=sa.DateTime(), nullable=False)
    if _col_exists("dataset", "dataset_gid"):
        op.alter_column("dataset", "dataset_gid",
                        existing_type=sa.String(60), type_=sa.String(36), nullable=False)
