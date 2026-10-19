"""
Pydantic schemas for the Dataset & Review Workflow API.

Operator endpoints  (dm_dw_data_entry resource):
  POST   /dw/{dw_id}/dataset
  GET    /dw/{dw_id}/dataset
  GET    /dw/{dw_id}/dataset/{dataset_id}
  GET    /dw/{dw_id}/dataset/{dataset_id}/data-points
  PATCH  /dw/{dw_id}/dataset/{dataset_id}/data-points
  PATCH  /dw/{dw_id}/dataset/{dataset_id}

Reviewer endpoints  (dm_dw_data_review resource):
  GET    /dw/{dw_id}/review/datasets
  GET    /dw/{dw_id}/review/dataset/{dataset_id}
  POST   /dw/{dw_id}/review/dataset/{dataset_id}
"""
from datetime import datetime
from typing import Any, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from apps.datawarehouse.schemas.data import UnifiedDataPointUpsertItemSchema

# ---------------------------------------------------------------------------
# Shared literals
# ---------------------------------------------------------------------------

DatasetStatusLiteral = Literal[
    "DRAFT", "DELETED", "PENDING_REVIEW", "REVISION", "APPROVED", "REJECTED",
]

DatapointReadinessLiteral = Literal["CREATED", "UPDATED", "COMPLETED", "FAILED"]

DataPointReviewStatusLiteral = Literal["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED"]

DatasetStageStatusLiteral = Literal["PENDING", "ACTIVE", "COMPLETED", "SKIPPED"]


class DatasetScopeNidsMixin(BaseModel):
    """Optional data-entry scope: lists of warehouse NIDs (stored as JSON on `dataset`)."""

    area_nids: Optional[List[int]] = Field(
        None, description="Allowed area_nid values (empty list clears)"
    )
    indicator_nids: Optional[List[int]] = Field(
        None, description="Allowed indicator_nid values"
    )
    unit_nids: Optional[List[int]] = Field(
        None, description="Allowed unit_nid values"
    )
    subgroup_val_nids: Optional[List[int]] = Field(
        None, description="Allowed subgroup_val_nid values"
    )
    timeperiod_nids: Optional[List[int]] = Field(
        None, description="Allowed timeperiod_nid values"
    )
    source_nids: Optional[List[int]] = Field(
        None, description="Allowed source_nid values"
    )
    ius_nids: Optional[List[int]] = Field(
        None, description="Allowed iusnid values (indicator-unit-subgroup combinations)"
    )

    @field_validator(
        "area_nids",
        "indicator_nids",
        "unit_nids",
        "subgroup_val_nids",
        "timeperiod_nids",
        "source_nids",
        "ius_nids",
    )
    @classmethod
    def _positive_int_lists(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return None
        for x in v:
            if not isinstance(x, int) or x < 1:
                raise ValueError("Scope NID lists must contain positive integers only")
        return v


# ===========================================================================
# OPERATOR — Create dataset
# ===========================================================================

class DatasetCreateRequest(DatasetScopeNidsMixin):
    """Body for POST /dw/{dw_id}/dataset.

    **Legacy scope:** non-empty `indicator_nids` (optional `unit_nids`, `subgroup_val_nids`)
    — IUS rows are the Cartesian product of those filters in the warehouse.

    **IUS scope:** non-empty `ius_nids` — explicit indicator–unit–subgroup combination NIDs.
    Do not send `indicator_nids`, `unit_nids`, or `subgroup_val_nids` in this mode (omit or empty).

    The two modes are mutually exclusive. `area_nids` is always required (non-empty).
    Optional: `timeperiod_nids`, `source_nids` (same JSON storage as legacy).
    """

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "dataset_name": "Q1 bundle",
                    "workflow_id": 1,
                    "area_nids": [101, 102],
                    "indicator_nids": [201, 202],
                    "unit_nids": [301],
                    "subgroup_val_nids": [401],
                    "timeperiod_nids": [501, 502],
                    "source_nids": [601],
                },
                {
                    "dataset_name": "IUS-scoped bundle",
                    "workflow_id": 1,
                    "area_nids": [101, 102],
                    "ius_nids": [1, 2, 3],
                    "timeperiod_nids": [501],
                    "source_nids": [601],
                },
            ]
        }
    )

    area_nids: List[int] = Field(
        ...,
        min_length=1,
        description="Allowed area_nid values; at least one required",
    )
    indicator_nids: Optional[List[int]] = Field(
        None,
        description="Legacy mode: non-empty list of indicator NIDs. Omit or empty when using `ius_nids`.",
    )

    dataset_name: Optional[str] = Field(None, min_length=1, max_length=255, description="Operator-supplied name. Required.")
    workflow_id: int = Field(..., description="Workflow this dataset will follow.")

    @model_validator(mode="after")
    def _ius_or_legacy_scope(self) -> "DatasetCreateRequest":
        ius = self.ius_nids or []
        ind = self.indicator_nids or []
        if ius and ind:
            raise ValueError("Provide either `ius_nids` or `indicator_nids`, not both.")
        if not ius and not ind:
            raise ValueError("Provide a non-empty `ius_nids` list or a non-empty `indicator_nids` list.")
        if ius:
            extra = []
            if self.indicator_nids:
                extra.append("indicator_nids")
            if self.unit_nids:
                extra.append("unit_nids")
            if self.subgroup_val_nids:
                extra.append("subgroup_val_nids")
            if extra:
                raise ValueError(
                    "In IUS mode (`ius_nids` set), omit or leave empty: "
                    + ", ".join(extra)
                )
        return self


class DatasetCreateResponse(DatasetScopeNidsMixin):
    dataset_id: int
    dataset_gid: str
    dataset_name: str
    dw_id: int
    workflow_id: Optional[int] = None
    dataset_status: DatasetStatusLiteral
    created_username: Optional[str] = Field(
        None,
        description="Login username from iam_user for the creator; null if user row missing.",
    )
    created: datetime
    datapoint_readiness: Optional[DatapointReadinessLiteral] = Field(
        None,
        description=(
            "Async data-point population state. "
            "CREATED = seeding in progress; UPDATED = import in progress; "
            "COMPLETED = ready; FAILED = seeding error (reseed required). "
            "NULL means no async operation was started (dataset is ready)."
        ),
    )
    seeding_async: bool = Field(
        False,
        description=(
            "True when the dataset scope exceeds the seeding threshold and data points are "
            "being generated in a background job. datapoint_readiness will be CREATED until "
            "the job completes, at which point it transitions to COMPLETED."
        ),
    )


# ===========================================================================
# OPERATOR — List datasets
# ===========================================================================

class DatasetListStageItem(BaseModel):
    """One workflow review level's row for this dataset (`dataset_review_stage`)."""

    stage_id: int
    workflow_review_level_id: int
    level_no: int
    stage_status: DatasetStageStatusLiteral
    approved_by_username: Optional[str] = Field(
        None,
        description="Login username from iam_user for approved_by_user_id; null if unset or user missing.",
    )


class DatasetListItem(DatasetScopeNidsMixin):
    """One row in the dataset list — header only, no data points."""
    dataset_id: int
    dataset_gid: str
    dataset_name: str
    dw_id: int
    workflow_id: Optional[int] = None
    workflow_name: Optional[str] = None         # resolved via workflow_i18n for caller's locale
    reporting_timeperiod_nid: Optional[int] = Field(
        None,
        description="Reporting time period NID for this dataset submission.",
    )
    dataset_status: DatasetStatusLiteral
    datapoint_readiness: Optional[DatapointReadinessLiteral] = Field(
        None,
        description=(
            "Async data-point population state. "
            "CREATED or UPDATED = dataset is locked (population in progress). "
            "COMPLETED or NULL = dataset is ready to open. FAILED = seeding error."
        ),
    )
    revision_count: int
    cmnt_cnt: int = Field(0, description="Total comments on this dataset")
    data_point_count: int = Field(
        0,
        description="Active (non-soft-deleted) data points in the dataset",
    )
    missing_data_count: int = Field(
        0,
        description="Active data points with no value entered yet (excludes soft-deleted)",
    )
    last_returned_at: Optional[datetime] = None
    returned_by_username: Optional[str] = Field(
        None,
        description="Login username for returned_by_user_id; null if unset or user missing.",
    )
    submitted_at: Optional[datetime] = None
    approved_on: Optional[datetime] = None
    approved_by_username: Optional[str] = Field(
        None,
        description="Login username for approved_by_user_id; null if unset or user missing.",
    )
    created: datetime
    created_username: Optional[str] = Field(
        None,
        description="Login username for created_user_id; null if user missing.",
    )
    stages: List[DatasetListStageItem] = Field(
        default_factory=list,
        description="Ordered review stages (`level_no`); empty until the dataset enters review.",
    )


class DatasetListResponse(BaseModel):
    datasets: List[DatasetListItem]


# ===========================================================================
# OPERATOR — Get dataset header
# ===========================================================================

class DatasetDetailResponse(DatasetScopeNidsMixin):
    """Dataset header returned by GET /dataset/{id} — no data points embedded."""
    dataset_id: int
    dataset_gid: str
    dataset_name: str
    dw_id: int
    workflow_id: Optional[int] = None
    workflow_name: Optional[str] = None
    reporting_timeperiod_nid: Optional[int] = Field(
        None,
        description="Reporting time period NID for this dataset submission.",
    )
    dataset_status: DatasetStatusLiteral
    datapoint_readiness: Optional[DatapointReadinessLiteral] = Field(
        None,
        description=(
            "Async data-point population state. "
            "CREATED or UPDATED = dataset is locked (population in progress). "
            "COMPLETED or NULL = dataset is ready to open. FAILED = seeding error."
        ),
    )
    revision_count: int
    cmnt_cnt: int = Field(0, description="Total comments on this dataset")
    last_returned_at: Optional[datetime] = None
    returned_by_username: Optional[str] = Field(
        None,
        description="Login username for returned_by_user_id; null if unset or user missing.",
    )
    submitted_at: Optional[datetime] = None
    approved_on: Optional[datetime] = None
    approved_by_username: Optional[str] = Field(
        None,
        description="Login username for approved_by_user_id; null if unset or user missing.",
    )
    created: datetime
    created_username: Optional[str] = Field(
        None,
        description="Login username for created_user_id; null if user missing.",
    )
    stages: List[DatasetListStageItem] = Field(
        default_factory=list,
        description="Ordered review stages (`level_no`); empty until the dataset enters review.",
    )


# ===========================================================================
# OPERATOR — Read data points (GET /data-points)
# ===========================================================================

class DataPointResponse(BaseModel):
    """Single data point row as returned to the operator grid."""
    data_point_id: int
    dataset_id: int

    # DW references (resolved display values come from separate DW lookups)
    iusnid: int
    indicator_nid: int
    indicator_name: Optional[str] = None        # resolved from DW ut_indicator_{locale}
    unit_nid: int
    unit_name: Optional[str] = None             # resolved from DW ut_unit_{locale}
    subgroup_val_nid: Optional[int] = None
    subgroup_name: Optional[str] = None         # resolved from DW ut_subgroup_val_{locale}
    area_nid: int
    area_name: Optional[str] = None             # resolved from DW ut_area_{locale}
    timeperiod_nid: int
    timeperiod_name: Optional[str] = None       # resolved from DW ut_time_period_{locale}
    source_nid: Optional[int] = None
    source_name: Optional[str] = None
    footnote_nid: Optional[int] = None
    footnote_text: Optional[str] = None

    # value
    data_value: Optional[float] = None
    textual_data_value: Optional[str] = None
    istextualdata: bool = False

    # reviewer feedback (visible when row is REJECTED)
    reject_reason_id: Optional[int] = None
    reject_reason_text: Optional[str] = None    # resolved from dataset_rejection_reason

    # comparison (previous period — shown when include_prev=true)
    prev_timeperiod_nid: Optional[int] = None
    prev_timeperiod_name: Optional[str] = None
    prev_tmprd_data_value: Optional[float] = None
    prev_tmprd_textual_data_value: Optional[str] = None
    prev_data_value: Optional[str] = Field(
        None,
        description="dataset_data_point.prev_data_value — immutable ut_data baseline at creation",
    )

    # review state
    review_status: DataPointReviewStatusLiteral
    is_locked: bool
    dataset_review_slice_id: Optional[int] = None
    is_deleted: bool = Field(False, description="Soft-delete flag; removal from ut_data occurs when row is approved.")
    cmnt_cnt: int = Field(0, description="Total comments on this data point")

    created: datetime
    modified: Optional[datetime] = None


class DataPointListResponse(BaseModel):
    """Response for GET /dataset/{id}/data-points."""
    dataset_id: int
    dataset_status: DatasetStatusLiteral
    total_count: int = Field(
        0,
        description="Active (non-soft-deleted) data points; soft-deleted rows may still appear in data_points",
    )
    with_data_count: int = Field(
        0,
        description="Active rows where data_value or textual_data_value is set",
    )
    missing_count: int = Field(
        0,
        description="Active rows with no value entered yet",
    )
    data_points: List[DataPointResponse]


# ===========================================================================
# OPERATOR — Upsert data points (PATCH /data-points)
# ===========================================================================

class DataPointInput(BaseModel):
    """
    One row to insert or update.
    Match by (dataset_id + iusnid + area_nid + timeperiod_nid) — upsert semantics.
    Either data_value (numeric) or textual_data_value (non-numeric) should be provided.
    """
    iusnid: int         = Field(..., description="IUS nid (indicator_unit_subgroup)")
    indicator_nid: int  = Field(..., description="Indicator nid")
    unit_nid: int       = Field(..., description="Unit nid")
    subgroup_val_nid: Optional[int] = Field(None, description="Subgroup value nid; None for totals")
    area_nid: int       = Field(..., description="Area nid")
    timeperiod_nid: int = Field(..., description="Time period nid")
    source_nid: Optional[int]   = Field(None, description="Source nid")
    footnote_nid: Optional[int] = Field(None, description="Footnote nid")
    footnote_text: Optional[str] = Field(None, description="Footnote text (denormalized snapshot)")

    data_value: Optional[float] = Field(None, description="Numeric value; set istextualdata=False")
    textual_data_value: Optional[str] = Field(None, description="Non-numeric value; set istextualdata=True")

    @model_validator(mode="after")
    def _check_value(self) -> "DataPointInput":
        if self.data_value is None and self.textual_data_value is None:
            raise ValueError("Provide at least one of data_value or textual_data_value")
        if self.data_value is not None and self.textual_data_value is not None:
            raise ValueError("Provide only one of data_value or textual_data_value, not both")
        return self


class DataPointUpsertRequest(BaseModel):
    data_points: List[DataPointInput] = Field(..., min_length=1, description="One or more data point rows to insert/update")


class DataPointUpsertResponse(BaseModel):
    dataset_id: int
    inserted: int = Field(0, description="New rows created")
    updated: int  = Field(0, description="Existing rows updated")
    total: int    = Field(0, description="Total rows processed")
    marked_deleted: int = Field(0, description="Rows marked is_deleted via PATCH deleted[]")
    restored: int = Field(0, description="Rows cleared is_deleted via PATCH restore[]")


# ===========================================================================
# OPERATOR — Status transition (PATCH /dataset/{id})
# ===========================================================================

OperatorTransitionStatus = Literal["PENDING_REVIEW"]


class DatasetOperatorPatchRequest(DatasetScopeNidsMixin):
    """
    Unified PATCH body for PATCH /dw/{dw_id}/dataset/{dataset_id}.

    **DRAFT field update** (`status` omitted): `dataset_name`, and/or any of
    `area_nids`, `indicator_nids`, `unit_nids`, `subgroup_val_nids`, `timeperiod_nids`, `source_nids`, `ius_nids`
    (each is an optional JSON array of positive warehouse NIDs; pass `[]` to clear a list).

    **Status transition** (`status` set): `PENDING_REVIEW` — submit or resubmit the dataset for review.
    Scope NID fields are ignored when `status` is set; update scope in a separate PATCH first.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "dataset_name": "Renamed bundle",
                    "area_nids": [10, 11],
                    "indicator_nids": [20],
                    "unit_nids": [30],
                    "subgroup_val_nids": [40],
                    "timeperiod_nids": [50],
                    "source_nids": [60],
                },
                {"status": "PENDING_REVIEW"},
            ]
        }
    )

    status: Optional[OperatorTransitionStatus] = Field(
        None,
        description=(
            "Omit for a plain field update. "
            "PENDING_REVIEW from DRAFT → submit for review. "
            "PENDING_REVIEW from REVISION → resubmit after corrections."
        ),
    )
    dataset_name: Optional[str] = Field(None, min_length=1, max_length=255, description="Rename the dataset (DRAFT only)")

    @model_validator(mode="after")
    def _check_at_least_one(self) -> "DatasetOperatorPatchRequest":
        has_scope = (
            self.area_nids is not None
            or self.indicator_nids is not None
            or self.unit_nids is not None
            or self.subgroup_val_nids is not None
            or self.timeperiod_nids is not None
            or self.source_nids is not None
            or self.ius_nids is not None
        )
        if (
            self.status is None
            and self.dataset_name is None
            and not has_scope
        ):
            raise ValueError(
                "Provide at least one of: status, dataset_name, "
                "area_nids, indicator_nids, unit_nids, subgroup_val_nids, timeperiod_nids, source_nids, ius_nids"
            )
        return self


class OperatorDatasetPatchRequest(DatasetOperatorPatchRequest):
    """Body for PATCH /dw/{dw_id}/dataset/{dataset_id} only.

    When performing a field update (`status` omitted), `area_nids` must be sent, and
    at least one of `indicator_nids` or `ius_nids` (``[]`` is allowed to clear a list).
    Status-only bodies omit scope fields.
    """

    @model_validator(mode="after")
    def _require_area_and_indicator_when_no_status(self) -> "OperatorDatasetPatchRequest":
        if self.status is None and (
            self.area_nids is None
            or (self.indicator_nids is None and self.ius_nids is None)
        ):
            raise ValueError(
                "area_nids is required and one of indicator_nids or ius_nids is required when status is omitted."
            )
        return self


# Keep old name as alias so existing imports don't break
DatasetOperatorTransitionRequest = DatasetOperatorPatchRequest


class DatasetTransitionResponse(BaseModel):
    dataset_id: int
    dataset_status: DatasetStatusLiteral
    message: str
    datapoint_readiness: Optional[DatapointReadinessLiteral] = Field(
        None,
        description=(
            "Async data-point population state after a scope update. "
            "CREATED = seeding in progress; COMPLETED = ready; FAILED = seeding error. "
            "NULL when no async seed was started."
        ),
    )
    seeding_async: bool = Field(
        False,
        description=(
            "True when scope reconcile exceeds the seeding threshold and new data points "
            "are being generated in a background job. Poll datapoint_readiness until COMPLETED."
        ),
    )


class DatasetDeleteResponse(BaseModel):
    dataset_id: int
    message: str
    delete_async: bool = Field(
        False,
        description=(
            "True when the dataset has too many data points to delete synchronously. "
            "The dataset_status will be DELETED until the background job finishes "
            "removing all data points and the dataset row itself."
        ),
    )


# ===========================================================================
# OPERATOR — Delete data points (DELETE /dataset/{id}/data-points)
# ===========================================================================

class DataPointDeleteRequest(BaseModel):
    data_point_ids: List[int] = Field(..., min_length=1, description="IDs of data points to delete")


class DataPointDeleteResponse(BaseModel):
    dataset_id: int
    deleted: int = Field(0, description="Number of data points successfully deleted")
    skipped: int = Field(0, description="Data points skipped (locked or not found)")
    message: str


class DataPointsImportErrorItem(BaseModel):
    data_point_id: int
    error: str
    detail: str


class DataPointsImportResponse(BaseModel):
    total_rows: int = Field(0, description="Rows with a valid data_point_id in the file")
    updated: int = Field(0, description="Data points updated in the database")
    skipped_locked: int = Field(0, description="Rows skipped because the data point is locked")
    skipped_no_id: int = Field(
        0,
        description="Rows with enough columns but no parseable data_point_id",
    )
    errors: List[DataPointsImportErrorItem] = Field(
        default_factory=list,
        description="Rows referencing unknown data_point_id values (capped in sync import)",
    )
    import_async: bool = Field(
        False,
        description=(
            "True when the import was queued as batched background jobs. "
            "Poll datapoint_readiness and GET import-logs endpoints."
        ),
    )
    estimated_rows: Optional[int] = Field(
        None,
        description="Row count used to choose sync vs async path",
    )
    request_id: Optional[str] = Field(
        None,
        description="Correlation id for async import batch jobs (UUID)",
    )
    total_batches: Optional[int] = Field(
        None,
        description="Number of background batch jobs queued (async only)",
    )
    datapoint_readiness: Optional[DatapointReadinessLiteral] = Field(
        None,
        description="UPDATED while async import runs; COMPLETED or FAILED when done",
    )


class DataPointsImportLogSummaryItem(BaseModel):
    request_id: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    total_batches: int = 0
    completed_batches: int = 0
    failed_batches: int = 0
    pending_batches: int = 0
    total_updated: int = 0
    total_skipped_locked: int = 0
    overall_status: str = Field(
        ...,
        description="running | completed | failed",
    )


class DataPointsImportLogListResponse(BaseModel):
    dataset_id: int
    imports: List[DataPointsImportLogSummaryItem] = Field(default_factory=list)


class ImportBatchJobLogItem(BaseModel):
    job_id: int
    batch_index: int
    job_status: str
    result: Optional[dict] = None
    last_error: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class DataPointsImportLogDetailResponse(BaseModel):
    dataset_id: int
    request_id: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    total_batches: int = 0
    completed_batches: int = 0
    failed_batches: int = 0
    pending_batches: int = 0
    total_updated: int = 0
    total_skipped_locked: int = 0
    overall_status: str
    batches: List[ImportBatchJobLogItem] = Field(default_factory=list)


# ===========================================================================
# REVIEWER — List datasets (GET /review/datasets)
# ===========================================================================

class ReviewDatasetListItem(DatasetListItem):
    """DatasetListItem extended with reviewer-specific fields."""
    submitted_by_name: Optional[str] = None     # resolved full name from iam_user
    data_point_count: int = Field(
        0,
        description=(
            "Active (non-soft-deleted) data points visible to this reviewer "
            "in their review scope (not whole dataset)"
        ),
    )
    missing_data_count: int = Field(
        0,
        description=(
            "Scoped active data points with no value entered yet "
            "(reviewer scope only; excludes soft-deleted)"
        ),
    )
    my_pending_count: int = Field(0, description="Slices in reviewer's scope not yet actioned")
    my_returned_count: int = Field(0, description="Slices reviewer has previously returned")


class ReviewDatasetListResponse(BaseModel):
    datasets: List[ReviewDatasetListItem]


# ===========================================================================
# REVIEWER — Get unified review grid (GET /review/dataset/{id})
# ===========================================================================

class ReviewDataPointRow(BaseModel):
    """Single row in the reviewer's unified grid."""
    data_point_id: int

    # DW display fields
    iusnid: int
    indicator_nid: int
    indicator_name: Optional[str] = None
    unit_nid: int
    unit_name: Optional[str] = None
    subgroup_val_nid: Optional[int] = None
    subgroup_name: Optional[str] = None
    area_nid: int
    area_name: Optional[str] = None
    timeperiod_nid: int
    timeperiod_name: Optional[str] = None
    source_nid: Optional[int] = None
    source_name: Optional[str] = None

    # submitted value
    data_value: Optional[float] = None
    textual_data_value: Optional[str] = None
    istextualdata: bool = False

    # previous period comparison
    prev_timeperiod_nid: Optional[int] = None
    prev_timeperiod_name: Optional[str] = None
    prev_tmprd_data_value: Optional[float] = None
    prev_tmprd_textual_data_value: Optional[str] = None
    prev_data_value: Optional[str] = Field(
        None,
        description="dataset_data_point.prev_data_value — immutable ut_data baseline at creation",
    )
    delta_percent: Optional[float] = Field(None, description="% change vs previous period (null if prev unavailable or textual)")

    # review state
    review_status: DataPointReviewStatusLiteral
    reject_reason_id: Optional[int] = None
    reject_reason_text: Optional[str] = None


class ReviewGridResponse(BaseModel):
    """Response for GET /review/dataset/{id} — unified grid for the reviewer."""
    dataset_id: int
    dataset_gid: str
    dataset_name: str
    dataset_status: DatasetStatusLiteral
    workflow_id: Optional[int]
    workflow_name: Optional[str] = None
    submitted_at: Optional[datetime] = None
    revision_count: int
    total_count: int
    pending_count: int   = Field(0, description="Rows not yet actioned by this reviewer")
    approved_count: int  = Field(0, description="Rows approved so far in this review pass")
    returned_count: int  = Field(0, description="Rows returned for correction")
    data_points: List[ReviewDataPointRow]


# ===========================================================================
# REVIEWER — Decision (POST /review/dataset/{id})
# ===========================================================================


class ReviewApprovedItem(BaseModel):
    """One data point marked approved in this batch."""
    data_point_id: int = Field(..., description="dataset_data_point.data_point_id")
    comment: Optional[str] = Field(
        None,
        max_length=5000,
        description="Optional reviewer note; persisted to dataset_comment when non-empty",
    )


class ReviewRejectedItem(BaseModel):
    """One data point marked rejected (returned for correction)."""
    data_point_id: int = Field(..., description="dataset_data_point.data_point_id")
    comment: str = Field(..., min_length=1, max_length=5000, description="Required; persisted to dataset_comment")
    reject_reason_id: Optional[int] = Field(
        None,
        description="Optional FK to dataset_rejection_reason; stored on dataset_data_point",
    )


class ReviewerDecisionRequest(BaseModel):
    """
    Reviewer batch decision: approve and/or reject data points in the caller's active review scope.

    Each `data_point_id` may appear in at most one of `approved` or `rejected`.
    Set ``status`` to ``REVISION`` (case-insensitive) to move the dataset to REVISION after rejected rows exist
    (same request as rejections, or a follow-up request with empty approved/rejected).
    Set ``status`` to ``APPROVED`` (case-insensitive) to complete the active review stage once every slice at
    that stage is fully approved (optional follow-up with empty approved/rejected, or combined with a last batch).
    ``REVISION`` and ``APPROVED`` are mutually exclusive values for ``status``.
    """
    approved: List[ReviewApprovedItem] = Field(default_factory=list)
    rejected: List[ReviewRejectedItem] = Field(default_factory=list)
    status: Optional[str] = Field(
        None,
        description=(
            'Optional. "REVISION" — transition dataset to REVISION when rejected rows exist. '
            '"APPROVED" — complete the active stage (advance workflow or finalize dataset) when all '
            "rows for that stage are approved. Mutually exclusive."
        ),
    )

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_reviewer_decision_status(cls, v: object) -> Optional[str]:
        if v is None:
            return None
        if not isinstance(v, str):
            raise ValueError('status must be a string or null')
        u = v.strip().upper()
        if u == "REVISION":
            return "REVISION"
        if u == "APPROVED":
            return "APPROVED"
        raise ValueError(
            'status, when set, must be "REVISION" or "APPROVED" (case-insensitive)'
        )

    @model_validator(mode="after")
    def _validate_disjoint_ids(self) -> "ReviewerDecisionRequest":
        a_ids = {x.data_point_id for x in self.approved}
        r_ids = {x.data_point_id for x in self.rejected}
        if a_ids & r_ids:
            raise ValueError("data_point_id cannot appear in both approved and rejected")
        if self.status == "APPROVED" and r_ids:
            raise ValueError(
                'status "APPROVED" cannot be combined with rejected data points in the same request',
            )
        if not a_ids and not r_ids and self.status not in ("REVISION", "APPROVED"):
            raise ValueError(
                "at least one data point is required in approved or rejected, "
                'or set status to "REVISION" or "APPROVED" for a finalize-only request',
            )
        return self


class ReviewerDecisionResponse(BaseModel):
    dataset_id: int
    dataset_status: DatasetStatusLiteral
    approved_count: int  = Field(0, description="Data points approved in this action")
    returned_count: int  = Field(0, description="Data points returned in this action")
    message: str


# ===========================================================================
# REFERENCE — Rejection reasons  (GET /rejection-reasons)
# ===========================================================================

class RejectionReasonResponse(BaseModel):
    reason_id: int
    reason_code: str
    reason_text: str        # resolved for caller's locale; falls back to default_text
    display_order: int


class RejectionReasonListResponse(BaseModel):
    reasons: List[RejectionReasonResponse]


# ===========================================================================
# UNIFIED — GET /dw/{dw_id}/data-points
# ===========================================================================

UnifiedSourceLiteral = Literal["pending", "approved", "new"]
"""
pending — row exists in dataset_data_point (overrides ut_data value).
approved — row only in ut_data; not yet touched in the active dataset.
new      — row in dataset_data_point with no matching ut_data entry.
"""


class UnifiedDataPointItem(BaseModel):
    """One row in the unified data-points view (ut_data merged with pending dataset overlay)."""
    # dataset_data_point identity — None when source=approved
    data_point_id: Optional[int] = None
    dataset_id: Optional[int] = None

    # ut_data fact identity / columns (optional when no baseline row)
    data_nid: Optional[int] = None
    start_date: Optional[str] = Field(None, description="ISO datetime string from ut_data.start_date")
    end_date: Optional[str] = Field(None, description="ISO datetime string from ut_data.end_date")
    data_denominator: Optional[int] = None
    ic_ius_order: Optional[float] = None

    # DW key
    iusnid: int
    indicator_nid: int
    unit_nid: int
    subgroup_val_nid: Optional[int] = None
    area_nid: int
    timeperiod_nid: int
    source_nid: Optional[int] = None
    footnote_nid: Optional[int] = None
    footnote_text: Optional[str] = None

    # Active value — dataset row value if pending/new, else ut_data value
    data_value: Optional[float] = None
    textual_data_value: Optional[str] = None
    istextualdata: bool = False

    # Approved baseline from ut_data (for comparison in pending/new rows)
    approved_value: Optional[float] = None
    approved_textual_value: Optional[str] = None

    # Previous period snapshot on dataset_data_point (review comparison); None when source=approved
    prev_timeperiod_nid: Optional[int] = Field(
        None, description="dataset_data_point.prev_timeperiod_nid — prior period NID for comparison",
    )
    prev_tmprd_data_value: Optional[float] = Field(
        None, description="dataset_data_point.prev_tmprd_data_value — prior period numeric value",
    )
    prev_tmprd_textual_data_value: Optional[str] = Field(
        None, description="dataset_data_point.prev_tmprd_textual_data_value — prior period textual value",
    )
    prev_data_value: Optional[str] = Field(
        None,
        description="dataset_data_point.prev_data_value — immutable ut_data baseline at creation",
    )

    # Source
    source: UnifiedSourceLiteral
    review_status: Optional[str] = None     # None when source=approved
    is_locked: Optional[bool] = None        # None when source=approved
    is_deleted: Optional[bool] = Field(
        default=None,
        description="dataset_data_point.is_deleted when source is pending or new; null for approved-only rows",
    )
    cmnt_cnt: Optional[int] = Field(
        default=None,
        description="Total comments on this data point; null for approved-only rows",
    )

    def to_internal_data_row_dict(self) -> dict[str, Any]:
        """
        Flat dict using internal ut_data field names (same as DataService._query_data_rows).
        Used with UnifiedDataPointRowSchema + get_serialization_mode() for /data-aligned JSON keys.
        """
        return {
            "data_nid": self.data_nid,
            "iusnid": self.iusnid,
            "timeperiod_nid": int(self.timeperiod_nid) if self.timeperiod_nid is not None else None,
            "area_nid": int(self.area_nid) if self.area_nid is not None else None,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "data_denominator": int(self.data_denominator) if self.data_denominator is not None else None,
            "footnote_nid": int(self.footnote_nid) if self.footnote_nid is not None else None,
            "source_nid": int(self.source_nid) if self.source_nid is not None else None,
            "indicator_nid": int(self.indicator_nid) if self.indicator_nid is not None else None,
            "unit_nid": int(self.unit_nid) if self.unit_nid is not None else None,
            "subgroup_val_nid": int(self.subgroup_val_nid) if self.subgroup_val_nid is not None else None,
            "ic_ius_order": self.ic_ius_order,
            "textual_data_value": self.textual_data_value,
            "istextualdata": self.istextualdata,
            "data_value": self.data_value,
            "i_name": "",
            "i_gid": "",
            "u_name": "",
            "u_gid": "",
            "sg_name": "",
            "sg_gid": "",
            "ar_id": "",
            "ar_name": "",
            "tp_timeperiod": "",
            "ius_gid": "",
            "src_name": "",
            "footnote": self.footnote_text or "",
            "data_point_id": self.data_point_id,
            "dataset_id": self.dataset_id,
            "approved_value": self.approved_value,
            "approved_textual_value": self.approved_textual_value,
            "source": self.source,
            "review_status": self.review_status,
            "is_locked": self.is_locked,
            "is_deleted": self.is_deleted,
            "prev_timeperiod_nid": (
                int(self.prev_timeperiod_nid) if self.prev_timeperiod_nid is not None else None
            ),
            "prev_tmprd_data_value": self.prev_tmprd_data_value,
            "prev_tmprd_textual_data_value": self.prev_tmprd_textual_data_value,
            "prev_data_value": self.prev_data_value,
            "cmnt_cnt": self.cmnt_cnt,
        }


class UnifiedDataPointsMeta(BaseModel):
    """
    Meta for GET /dw/{dw_id}/data-points.
    Mirrors list-style APIs: rows live in `data`; counts and filters live in `meta`.
    """
    dw_id: int
    dataset_id: Optional[int] = Field(None, description="Resolved active dataset id, if any")
    dataset_status: Optional[str] = Field(None, description="Status of resolved dataset, if any")
    dataset_id_query: Optional[int] = Field(
        None,
        description="dataset_id query param passed by client (Mode 2/3); may differ from resolved",
    )
    total_count: int = Field(
        ...,
        description=(
            "Total rows after `review_status` and optional text `search` (before pagination); "
            "use with `page` / `page_size` for the filtered grid."
        ),
    )
    count: int = Field(
        ...,
        description=(
            "Total data points in the scoped merge (or full `ut_data` row count on unscoped paginated browse): "
            "size of the merged view before applying the `review_status` query param; "
            "not narrowed by text search. When paginated, the number of rows in this response is `len(data)`, "
            "not this field."
        ),
    )
    page: int = Field(1, description="Current page (1-based)")
    page_size: Optional[int] = Field(
        None,
        description="Page size when provided; omit to return full result set",
    )
    total_pages: int = Field(
        1,
        description="Total pages given page_size (1 when unpaginated)",
    )
    pending_count: int = Field(
        0,
        description=(
            "Rows with review_status=PENDING_REVIEW in the full scoped merge (before the `review_status` query filter); "
            "not narrowed by text search."
        ),
    )
    approved_count: int = Field(
        0,
        description=(
            "Rows with review_status=APPROVED on the dataset overlay in the full scoped merge; "
            "not narrowed by the `review_status` query param or by text search."
        ),
    )
    new_count: int = Field(
        0,
        description=(
            "Rows with source=new in the full scoped merge; "
            "not narrowed by the `review_status` query param or by text search."
        ),
    )
    rejected_count: int = Field(
        0,
        description=(
            "Rows with review_status=REJECTED in the full scoped merge (before the `review_status` query filter); "
            "not narrowed by text search."
        ),
    )
    iusnid_filter: Optional[List[int]] = Field(None, description="IUS nids applied to the query")
    area_nid_filter: Optional[List[int]] = Field(None, description="Area nids applied to the query")
    timeperiod_nid_filter: Optional[List[int]] = Field(
        None, description="Time period nids applied to the query"
    )
    indicator_nid_filter: Optional[List[int]] = Field(
        None, description="Indicator nids (from i_identifier / resolved filters)"
    )
    unit_nid_filter: Optional[List[int]] = Field(None, description="Unit nids (from u_identifier)")
    subgroup_val_nid_filter: Optional[List[int]] = Field(
        None, description="Subgroup value nids (from sg_identifier)"
    )
    source_nid_filter: Optional[List[int]] = Field(
        None, description="Source / IC nids (from src_identifier)"
    )
    ut_baseline_queried: bool = Field(
        False,
        description=(
            "True when `ut_data` was queried (DW scope filters and/or pending dataset keys). "
            "False when the request had no scope — `data` is empty by design to avoid a full-table scan."
        ),
    )
    prev_timeperiod_nid: Optional[int] = Field(
        None,
        description=(
            "Predecessor timeperiod NID for the dataset's single in-scope timeperiod. "
            "Set only when the workflow has show_previous_time=true, the dataset's scope "
            "contains exactly one timeperiod, and that timeperiod has a known predecessor "
            "(periodicity A/Q/M and not the first period in its bucket). Null otherwise."
        ),
    )


# ===========================================================================
# UNIFIED — PATCH /dw/{dw_id}/data-points
# ===========================================================================


class DataPointIdEntry(BaseModel):
    """Reference a dataset_data_point row within PATCH deleted / restore lists."""
    data_point_id: int = Field(..., description="dataset_data_point.data_point_id")


class UnifiedUpsertRequest(BaseModel):
    """
    Upsert data points via the unified endpoint.

    `dataset_id` identifies the DRAFT or REVISION dataset to update.

    Provide at least one of: non-empty `data_points`, non-empty `deleted`, or non-empty `restore`.

    Each `data_points` entry is a `UnifiedDataPointUpsertItemSchema`:

    - **With `data_point_id`:** minimal payload — `dt_value` (or legacy value fields), optional `footnote`,
      optional `data_entry_note`; dimensions come from the existing dataset row.
    - **Without `data_point_id`:** same identifier/value shape as POST `/dw/{dw_id}/data` (`i_nid`, `ar_nid`,
      `tp_nid`, optional `ius_nid`, …), except footnotes use JSON key **`footnote`** only (not `fn_nid`,
      `footnote_nid`, `fn_gid`, or `fn`). Legacy `iusnid` + `data_value` / `textual_data_value` bodies remain valid.

    **`deleted` / `restore`:** soft-delete or clear soft-delete on rows before they are approved at slice level;
    each entry is `{ "data_point_id": <int> }`.
    """
    dataset_id: int = Field(..., description="Target dataset (DRAFT or REVISION).")
    data_points: List[UnifiedDataPointUpsertItemSchema] = Field(
        default_factory=list,
        description="Value upserts; optional if deleted or restore is non-empty.",
    )
    deleted: List[DataPointIdEntry] = Field(
        default_factory=list,
        description="Mark these data_point_id rows as is_deleted (DRAFT/REVISION only).",
    )
    restore: List[DataPointIdEntry] = Field(
        default_factory=list,
        description="Clear is_deleted for these data_point_id rows (DRAFT/REVISION only).",
    )

    @model_validator(mode="after")
    def _at_least_one_action(self) -> "UnifiedUpsertRequest":
        if self.data_points or self.deleted or self.restore:
            return self
        raise ValueError(
            "Provide at least one of: non-empty data_points, deleted, or restore.",
        )


# ===========================================================================
# UNIFIED — DELETE /dw/{dw_id}/data-points  (bulk)
# ===========================================================================

class UnifiedDeleteRequest(BaseModel):
    """Delete selected data points via the unified endpoint."""
    dataset_id: int = Field(..., description="Dataset containing the data points.")
    data_point_ids: List[int] = Field(..., min_length=1)


# ===========================================================================
# UNIFIED — PATCH /dw/{dw_id}/dataset  (submit / cancel)
# ===========================================================================

class UnifiedSubmitRequest(BaseModel):
    """Submit or cancel a dataset via the unified endpoint."""
    dataset_id: int = Field(..., description="Dataset to transition.")
    status: OperatorTransitionStatus


# ===========================================================================
# COMMENTS — POST/GET /dw/{dw_id}/dataset/{dataset_id}/comments
# ===========================================================================

class DatasetCommentCreateRequest(BaseModel):
    """Body for POST /dw/{dw_id}/dataset/{dataset_id}/comments."""
    comment_text: str = Field(..., min_length=1, max_length=5000)
    data_point_id: Optional[int] = Field(
        None,
        description="NULL = dataset-level comment; set = data-point-level comment",
    )


class DatasetCommentResponse(BaseModel):
    comment_id: int
    dataset_id: int
    data_point_id: Optional[int] = None
    commenter_role: str = Field(
        ...,
        description='Role of the commenter at insert time: "DATAENTRY", "DATAREVIEW", or "SYSTEM".',
    )
    comment_text: str
    status: Optional[str] = Field(
        None,
        description="Status snapshot at insert: dataset status if dataset-level, else data point review_status",
    )
    created_username: Optional[str] = Field(
        None,
        description="Login username from iam_user for the comment author; null if user row missing.",
    )
    created: datetime
