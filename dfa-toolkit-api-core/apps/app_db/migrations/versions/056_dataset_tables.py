"""Create dataset workflow tables.

Tables created:
  dataset_rejection_reason      — predefined rejection reason reference
  dataset_entry_period          — data entry open/close windows per workflow
  dataset                       — submission container
  dataset_data_point            — individual IUS+area+timeperiod+value rows
  dataset_review_stage          — one row per workflow level per dataset
  dataset_review_slice          — reviewer scope unit (internal only)
  dataset_review_slice_rejection — junction: slice ↔ rejection reasons (one row per reason)
  dataset_review_action_log     — immutable audit trail

Revision ID: 056_dataset_tables
Revises: 055_wf_level_role_id
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "056_dataset_tables"
down_revision = "055_wf_level_role_id"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. dataset_rejection_reason
    # ------------------------------------------------------------------
    if not _table_exists("dataset_rejection_reason"):
        op.create_table(
            "dataset_rejection_reason",
            sa.Column("reason_id",     sa.Integer(),      primary_key=True, autoincrement=True),
            sa.Column("reason_code",   sa.String(50),     nullable=False,   comment="Machine key e.g. VALUE_DEVIATION"),
            sa.Column("reason_text",   sa.String(255),    nullable=False,   comment="Default display text"),
            sa.Column("is_active",     sa.Boolean(),      nullable=False,   server_default=text("1")),
            sa.Column("display_order", sa.SmallInteger(), nullable=False,   server_default=text("0")),
            sa.Column("created",       sa.DateTime(),     nullable=False,   server_default=text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("reason_code", name="uq_drr_code"),
        )

    # ------------------------------------------------------------------
    # 2. dataset_entry_period
    # ------------------------------------------------------------------
    if not _table_exists("dataset_entry_period"):
        op.create_table(
            "dataset_entry_period",
            sa.Column("period_id",      sa.Integer(),   primary_key=True, autoincrement=True),
            sa.Column("workflow_id",    sa.Integer(),   nullable=False,   comment="FK → workflow.workflow_id"),
            sa.Column("period_name",    sa.String(100), nullable=False,   comment="Display name e.g. Q1 2025"),
            sa.Column("timeperiod_id",  sa.Integer(),   nullable=False,   comment="DW timeperiod reference (cross-DB, no FK)"),
            sa.Column("open_at",        sa.DateTime(),  nullable=False,   comment="When entry window opens"),
            sa.Column("close_at",       sa.DateTime(),  nullable=True,    comment="NULL = open indefinitely"),
            sa.Column("is_active",      sa.Boolean(),   nullable=False,   server_default=text("1")),
            sa.Column("created_user_id", sa.Integer(),  nullable=False,   comment="User who created the period"),
            sa.Column("created",        sa.DateTime(),  nullable=False,   server_default=text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["workflow_id"], ["workflow.workflow_id"], name="fk_dep_workflow"),
            sa.Index("idx_dep_workflow",   "workflow_id"),
            sa.Index("idx_dep_timeperiod", "timeperiod_id"),
            sa.Index("idx_dep_active",     "is_active", "open_at"),
        )

    # ------------------------------------------------------------------
    # 3. dataset
    # ------------------------------------------------------------------
    if not _table_exists("dataset"):
        op.create_table(
            "dataset",
            sa.Column("dataset_id",               sa.Integer(),      primary_key=True, autoincrement=True),
            sa.Column("dataset_gid",              sa.String(60),     nullable=False,   comment="Slug / UUID for API reference (max 60 chars)"),
            sa.Column("dataset_name",             sa.String(255),    nullable=False,   comment="Operator-supplied name"),
            sa.Column("dw_id",                    sa.Integer(),      nullable=False,   comment="Datawarehouse scope (denormalised from route; enables efficient DW-scoped queries)"),
            sa.Column("workflow_id",              sa.Integer(),      nullable=False,   comment="FK → workflow.workflow_id"),
            # no submitter_area_nid — operator may cover multiple areas; areas live on data_points
            sa.Column("dataset_status",           sa.Enum(
                "DRAFT", "SUBMITTED", "PENDING_REVIEW", "PENDING_REVIEW_REVISION",
                "PARTIAL_APPROVED", "APPROVED", "REJECTED", "CANCELLED",
                name="dataset_status_enum",
            ), nullable=False, server_default="DRAFT"),
            sa.Column("current_stage_id",         sa.Integer(),      nullable=True,    comment="FK → dataset_review_stage (set by system on submit)"),
            sa.Column("revision_count",           sa.SmallInteger(), nullable=False,   server_default=text("0"), comment="Times operator resubmitted"),
            sa.Column("last_returned_at",         sa.DateTime(),     nullable=True,    comment="Last time reviewer returned data points"),
            sa.Column("submission_comments",      sa.Text(),         nullable=True,    comment="Operator overall note at submission"),
            sa.Column("reviewer_overall_remarks", sa.Text(),         nullable=True,    comment="Reviewer comment on full REJECTED"),
            sa.Column("created_user_id",          sa.Integer(),      nullable=False,   comment="User who created the dataset"),
            sa.Column("created",                  sa.DateTime(),     nullable=False,   server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("submitted_by_user_id",     sa.Integer(),      nullable=True,    comment="NULL while DRAFT"),
            sa.Column("submitted_at",             sa.DateTime(),     nullable=True),
            sa.Column("approved_on",              sa.DateTime(),     nullable=True),
            sa.Column("last_updated_at",          sa.DateTime(),     nullable=False,
                      server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("dataset_gid",  name="uq_dataset_gid"),
            sa.Index("idx_dataset_dw",          "dw_id"),
            sa.Index("idx_dataset_workflow",    "workflow_id"),
            sa.Index("idx_dataset_status",      "dataset_status"),
            sa.Index("idx_dataset_created_by",  "created_user_id"),
            sa.ForeignKeyConstraint(["workflow_id"], ["workflow.workflow_id"], name="fk_dataset_workflow"),
        )

    # ------------------------------------------------------------------
    # 4. dataset_data_point
    # ------------------------------------------------------------------
    if not _table_exists("dataset_data_point"):
        op.create_table(
            "dataset_data_point",
            sa.Column("data_point_id",               sa.Integer(),   primary_key=True, autoincrement=True),
            sa.Column("dataset_id",                  sa.Integer(),   nullable=False),
            # DW references — cross-DB, enforced in service layer, no DB FKs
            sa.Column("indicator_classification_id", sa.Integer(),   nullable=True,  comment="Classification this point belongs to"),
            sa.Column("iusnid",                      sa.Integer(),   nullable=False, comment="indicator_unit_subgroup nid (matches ut_data.iusnid)"),
            sa.Column("indicator_nid",               sa.Integer(),   nullable=False, comment="Matches ut_data.indicator_nid"),
            sa.Column("unit_nid",                    sa.Integer(),   nullable=False, comment="Matches ut_data.unit_nid"),
            sa.Column("subgroup_val_nid",            sa.Integer(),   nullable=True,  comment="Matches ut_data.subgroup_val_nid"),
            sa.Column("area_nid",                    sa.Integer(),   nullable=False, comment="Matches ut_data.area_nid"),
            sa.Column("timeperiod_nid",              sa.Integer(),   nullable=False, comment="Matches ut_data.timeperiod_nid"),
            sa.Column("source_nid",                  sa.Integer(),   nullable=True,  comment="Matches ut_data.source_nid"),
            # value — split numeric/textual, matching ut_data column names
            sa.Column("data_value",                  sa.Float(),     nullable=True,  comment="Numeric value (matches ut_data.data_value)"),
            sa.Column("textual_data_value",          sa.Text(),      nullable=True,  comment="Non-numeric/textual value (matches ut_data.textual_data_value)"),
            sa.Column("istextualdata",               sa.Boolean(),   nullable=False, server_default=text("0"), comment="Matches ut_data.istextualdata"),
            # operator entry metadata
            sa.Column("footnote_nid",                sa.Integer(),   nullable=True,  comment="Matches ut_data.footnote_nid"),
            sa.Column("data_entry_note",             sa.Text(),      nullable=True,  comment="Operator note on this value (not in ut_data; internal only)"),
            sa.Column("reviewer_comment",            sa.Text(),      nullable=True,  comment="Reviewer feedback on this value (internal only)"),
            # comparison (previous period snapshot shown to reviewer)
            sa.Column("prev_timeperiod_nid",         sa.Integer(),   nullable=True,  comment="Previous period reference for comparison"),
            sa.Column("prev_data_value",             sa.Float(),     nullable=True,  comment="Previous period numeric value"),
            sa.Column("prev_textual_data_value",     sa.Text(),      nullable=True,  comment="Previous period textual value"),
            # exclusivity
            sa.Column("superseded_by_data_point_id", sa.Integer(),  nullable=True,  comment="Points to newer submission if superseded"),
            # review tracking
            sa.Column("review_status", sa.Enum(
                "PENDING", "IN_PROGRESS", "APPROVED", "REJECTED",
                name="dp_review_status_enum",
            ), nullable=False, server_default="PENDING"),
            sa.Column("approved_at_level_no",        sa.SmallInteger(), nullable=True, comment="Level no that last approved this point"),
            sa.Column("dataset_review_slice_id",     sa.Integer(),   nullable=True,  comment="Owning slice (set when stage activates)"),
            sa.Column("is_locked",                   sa.Boolean(),   nullable=False, server_default=text("0")),
            sa.Column("reject_reason_id",            sa.Integer(),   nullable=True,  comment="FK → dataset_rejection_reason (single reason per data point)"),
            sa.Column("created",  sa.DateTime(), nullable=False, server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified", sa.DateTime(), nullable=True),
            sa.Index("idx_ddp_dataset",         "dataset_id"),
            sa.Index("idx_ddp_ius_area_tp",     "iusnid", "area_nid", "timeperiod_nid"),
            sa.Index("idx_ddp_area",            "area_nid"),
            sa.Index("idx_ddp_classification",  "indicator_classification_id"),
            sa.Index("idx_ddp_review_status",   "review_status"),
            sa.Index("idx_ddp_slice",           "dataset_review_slice_id"),
            sa.Index("idx_ddp_superseded",      "superseded_by_data_point_id"),
            sa.ForeignKeyConstraint(["dataset_id"],       ["dataset.dataset_id"],                    name="fk_ddp_dataset"),
            sa.ForeignKeyConstraint(["reject_reason_id"], ["dataset_rejection_reason.reason_id"],    name="fk_ddp_reject_reason"),
        )

    # ------------------------------------------------------------------
    # 5. dataset_review_stage
    # ------------------------------------------------------------------
    if not _table_exists("dataset_review_stage"):
        op.create_table(
            "dataset_review_stage",
            sa.Column("stage_id",                 sa.Integer(),      primary_key=True, autoincrement=True),
            sa.Column("dataset_id",               sa.Integer(),      nullable=False),
            sa.Column("workflow_review_level_id", sa.Integer(),      nullable=False,   comment="FK → workflow_review_level"),
            sa.Column("level_no",                 sa.SmallInteger(), nullable=False,   comment="Denormalised for ordering"),
            sa.Column("stage_status", sa.Enum(
                "PENDING", "ACTIVE", "COMPLETED", "SKIPPED",
                name="stage_status_enum",
            ), nullable=False, server_default="PENDING"),
            sa.Column("activated_at",  sa.DateTime(), nullable=True),
            sa.Column("completed_at",  sa.DateTime(), nullable=True),
            sa.UniqueConstraint("dataset_id", "level_no", name="uq_drs_dataset_level"),
            sa.Index("idx_drs_dataset", "dataset_id"),
            sa.ForeignKeyConstraint(["dataset_id"],               ["dataset.dataset_id"],                                            name="fk_drs_dataset"),
            sa.ForeignKeyConstraint(["workflow_review_level_id"], ["workflow_review_level.workflow_review_level_id"],                 name="fk_drs_level"),
        )
        # Deferred FK: dataset.current_stage_id → dataset_review_stage.stage_id
        op.create_foreign_key(
            "fk_dataset_current_stage",
            "dataset", "dataset_review_stage",
            ["current_stage_id"], ["stage_id"],
        )

    # ------------------------------------------------------------------
    # 6. dataset_review_slice
    # Rejection reasons stored inline as comma-separated rejection_reason_ids
    # (e.g. "1,3") — avoids a separate junction table; sufficient for 1-5 reasons/slice.
    # ------------------------------------------------------------------
    if not _table_exists("dataset_review_slice"):
        op.create_table(
            "dataset_review_slice",
            sa.Column("slice_id",              sa.Integer(),    primary_key=True, autoincrement=True),
            sa.Column("dataset_id",            sa.Integer(),    nullable=False),
            sa.Column("stage_id",              sa.Integer(),    nullable=False),
            # scope
            sa.Column("scope_type", sa.Enum(
                "AREA", "CLASSIFICATION", "HYBRID",
                name="slice_scope_type_enum",
            ), nullable=False),
            sa.Column("area_nid",             sa.Integer(),    nullable=True,  comment="SET for AREA and HYBRID"),
            sa.Column("classification_nid",   sa.Integer(),    nullable=True,  comment="SET for CLASSIFICATION and HYBRID"),
            sa.Column("scope_label",          sa.String(255),  nullable=True,  comment="Denormalised display; avoids cross-DB join"),
            sa.Column("slice_status", sa.Enum(
                "PENDING", "ACTIVE", "RETURNED", "APPROVED", "REJECTED",
                name="slice_status_enum",
            ), nullable=False, server_default="PENDING"),
            # reviewer outcome (identity validated against iam_user_role_content at action time)
            sa.Column("reviewed_by_user_id", sa.Integer(),   nullable=True),
            sa.Column("review_remarks",      sa.Text(),      nullable=True,  comment="Mandatory slice-level comment on RETURNED/REJECTED"),
            sa.Column("started_at",          sa.DateTime(),  nullable=True),
            sa.Column("completed_at",        sa.DateTime(),  nullable=True),
            sa.Column("created",             sa.DateTime(),  nullable=False, server_default=text("CURRENT_TIMESTAMP")),
            sa.Index("idx_drsl_dataset",        "dataset_id"),
            sa.Index("idx_drsl_stage",          "stage_id"),
            sa.Index("idx_drsl_area",           "area_nid"),
            sa.Index("idx_drsl_classification", "classification_nid"),
            sa.ForeignKeyConstraint(["dataset_id"], ["dataset.dataset_id"],            name="fk_drsl_dataset"),
            sa.ForeignKeyConstraint(["stage_id"],   ["dataset_review_stage.stage_id"], name="fk_drsl_stage"),
        )
        # Deferred FK: dataset_data_point.dataset_review_slice_id → dataset_review_slice.slice_id
        op.create_foreign_key(
            "fk_ddp_slice",
            "dataset_data_point", "dataset_review_slice",
            ["dataset_review_slice_id"], ["slice_id"],
        )

    # ------------------------------------------------------------------
    # 7. dataset_review_slice_rejection
    # Junction table: one row per rejection reason per slice.
    # Allows multiple reasons per RETURNED/REJECTED slice; at least one
    # row required (enforced in service layer).
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
    # 8. dataset_review_action_log
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
    # Drop in FK-safe order.
    # dataset ↔ dataset_review_stage is a circular FK:
    #   dataset.current_stage_id → dataset_review_stage.stage_id  (fk_dataset_current_stage)
    #   dataset_review_stage.dataset_id → dataset.dataset_id      (fk_drs_dataset)
    # Break the circle by dropping fk_dataset_current_stage first.
    for tbl in ["dataset_review_action_log", "dataset_review_slice_rejection"]:
        if _table_exists(tbl):
            op.drop_table(tbl)

    # dataset_data_point has fk_ddp_slice → dataset_review_slice, so drop it before slice.
    if _table_exists("dataset_data_point"):
        op.drop_table("dataset_data_point")

    if _table_exists("dataset_review_slice"):
        op.drop_table("dataset_review_slice")

    # Break circular FK before dropping dataset_review_stage.
    from sqlalchemy import inspect as sa_inspect
    if _table_exists("dataset"):
        fks = {fk["name"] for fk in sa_inspect(op.get_bind()).get_foreign_keys("dataset")}
        if "fk_dataset_current_stage" in fks:
            op.drop_constraint("fk_dataset_current_stage", "dataset", type_="foreignkey")

    if _table_exists("dataset_review_stage"):
        op.drop_table("dataset_review_stage")

    for tbl in ["dataset", "dataset_entry_period", "dataset_rejection_reason"]:
        if _table_exists(tbl):
            op.drop_table(tbl)
