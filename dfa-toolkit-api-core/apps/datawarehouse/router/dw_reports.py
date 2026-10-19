"""
DW reports router — catalogue and per-slug report detail endpoints (stub queries).

Includes the Operational Dashboard endpoint:
    GET /dw/{dw_id}/reports/operational-dashboard
"""
from __future__ import annotations

import logging
import math
from datetime import date, datetime, time
from io import BytesIO
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from apps.shared.config.dependencies import get_db, get_optional_user
from apps.app_db.dependencies import get_app_key
from apps.datawarehouse.constants import (
    PATH_DW_ID,
    QUERY_ISDEFAULTSUBGROUP,
    QUERY_SEARCH,
    QUERY_SEARCH_BY,
    QUERY_SORT_FIELD,
    QUERY_SORT_ORDER,
    QUERY_TIME_PERIOD,
)
from apps.datawarehouse.db.datawarehouse import (
    get_dw_db,
    get_dw_language_code,
    get_warehouse_credentials,
    validate_dw_id,
)
from apps.datawarehouse.schemas.dw_reports import ReportCatalogItem, ReportListParams
from apps.datawarehouse.services.dw_report_export import export_report
from apps.datawarehouse.services.dw_report_registry import (
    get_report,
    list_reports,
)
from apps.datawarehouse.services.dw_published_data_service import (
    PUBLISHED_DATA_UI_EXPORT_COLUMNS,
    get_column_defs_for_result,
    parse_default_subgroup_mode,
    parse_operator_filters,
    query_published_data,
    resolve_published_filters,
    transform_rows_for_ui_export,
)
from apps.datawarehouse.utils.export_utils import translate_header
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.exceptions import BadRequest
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import success_response

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["DW Reports"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/reports",
)

_CATALOGUE_DESCRIPTION = """
Return the catalogue of all 32 DW reports.

- **Quality (21)** — structural, completeness, and referential integrity gaps (PERMISSION)
- **Analytics (9)** — coverage, volume, and utilisation summaries (AUTHENTICATED)
- **Data (1)** — enriched published-data full export (PUBLIC)

**Query parameters:**
- `category` — filter to one category: `quality`, `analytics`, or `data`
- `grouped` — when `true`, response `data` is an object keyed by category instead of a flat array

Each catalogue entry includes slug, title, category, description, and required access level.
Detail routes return paginated JSON at `/reports/{slug}`.
Set `export=true` on any detail route to download all matching rows as XLSX (pagination ignored).
"""

_REPORT_DETAIL_RESPONSES = {
    200: {"description": "Report retrieved successfully", "model": SuccessResponse},
    403: {"description": "Authentication or permission denied", "model": ErrorResponse},
    404: {"description": "Report or data warehouse not found", "model": ErrorResponse},
    500: {"description": "Internal server error", "model": ErrorResponse},
}


@router.get(
    "",
    summary="List DW reports catalogue",
    description=_CATALOGUE_DESCRIPTION,
    response_model=SuccessResponse,
    responses={
        200: {"description": "Report catalogue retrieved successfully", "model": SuccessResponse},
        404: {"description": "Data warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def list_dw_reports(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    category: Optional[Literal["quality", "analytics", "data"]] = Query(
        None, description="Filter to a single category: quality, analytics, or data"
    ),
    grouped: bool = Query(
        False, description="When true, return reports as an object keyed by category"
    ),
):
    del dw_id
    all_definitions = list_reports()

    if category:
        all_definitions = [d for d in all_definitions if d.category == category]

    items = [
        ReportCatalogItem(
            slug=d.slug,
            title=d.title,
            category=d.category,
            description=d.description,
            access_level=d.access_level,
        ).model_dump()
        for d in all_definitions
    ]

    if grouped:
        grouped_data: dict[str, list] = {"quality": [], "analytics": [], "data": []}
        for item in items:
            grouped_data[item["category"]].append(item)
        return success_response(
            message="Report catalogue retrieved successfully",
            data=grouped_data,
            meta={"total_count": len(items)},
        )

    return success_response(
        message="Report catalogue retrieved successfully",
        data=items,
        meta={"total_count": len(items)},
    )


def _build_pagination_meta(
    total: Optional[int],
    page: int,
    page_size: int,
    *,
    row_count: int = 0,
) -> dict[str, Any]:
    total_count = total if total is not None else 0
    total_pages = (
        math.ceil(total_count / page_size)
        if page_size > 0 and total_count > 0
        else 0
    )
    return {
        "count": row_count,
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "total_pages": total_pages,
    }


def get_report_list_params(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=5000, description="Rows per page"),
    export: bool = Query(
        False,
        description="When true, download all matching rows as XLSX (pagination ignored)",
    ),
    search: Optional[str] = Query(None, alias=QUERY_SEARCH),
    search_by: Optional[str] = Query(None, alias=QUERY_SEARCH_BY),
    sort_field: Optional[str] = Query(None, alias=QUERY_SORT_FIELD),
    sort_order: str = Query("asc", alias=QUERY_SORT_ORDER),
) -> ReportListParams:
    return ReportListParams(
        page=page,
        page_size=page_size,
        export=export,
        search=search,
        search_by=search_by,
        sort_field=sort_field,
        sort_order=sort_order,
    )


def _streaming_file_response(
    stream: BytesIO,
    filename: str,
    media_type: str,
) -> StreamingResponse:
    return StreamingResponse(
        stream,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# ---------------------------------------------------------------------------
# Operational-reports export helpers
# ---------------------------------------------------------------------------

OR_SUBMISSION_STATUS_COLUMN_DEFS = [
    "or_sno",
    "or_state_name",
    "or_district_name",
    "or_dataset_name",
    "or_submission_status",
    "or_submitted_by",
    "or_date_submitted",
    "or_last_updated",
    "or_action_needed",
]

OR_REVIEW_STATUS_COLUMN_DEFS = [
    "or_sno",
    "or_state_name",
    "or_district_name",
    "or_dataset_name",
    "or_review_status",
    "or_reviewer_assigned",
    "or_date_submitted",
    "or_date_returned",
    "or_date_approved",
]

OR_DATA_REPORTER_COLUMN_DEFS = [
    "or_sno",
    "or_reporter_name",
    "or_institution",
    "or_role",
    "or_email",
    "or_phone",
    "or_district_assigned",
    "or_last_login",
]

OR_DATA_REVIEWER_COLUMN_DEFS = [
    "or_sno",
    "or_reviewer_name",
    "or_institution",
    "or_role",
    "or_email",
    "or_phone",
    "or_district_assigned",
    "or_last_login",
]

OR_DATA_COMPLETENESS_COLUMN_DEFS = [
    "or_sno",
    "or_state_name",
    "or_district_name",
    "or_dataset_name",
    "or_submission_status",
    "or_expected_data_points",
    "or_received_data_points",
    "or_completeness_rate",
    "or_missing_footnotes",
]


_SUBMISSION_STATUS_KEYS = {0: "or_label_not_submitted", 1: "or_label_submitted"}
_ACTION_NEEDED_KEYS = {0: "or_label_no_action", 1: "or_label_pending_revision", 2: "or_label_pending_submission"}
_REVIEW_STATUS_KEYS = {0: "or_label_approved", 1: "or_label_pending_review", 2: "or_label_revision"}


def _fetch_workflow_display_name(db: Session, workflow_id: int, locale: str) -> str:
    from apps.app_db.models.core import ReviewWorkflow, ReviewWorkflowI18n

    i18n = (
        db.query(ReviewWorkflowI18n.workflow_name)
        .filter(
            ReviewWorkflowI18n.master_id == workflow_id,
            ReviewWorkflowI18n.locale == locale,
        )
        .scalar()
    )
    if i18n:
        return i18n
    row = (
        db.query(ReviewWorkflow.workflow_code)
        .filter(ReviewWorkflow.workflow_id == workflow_id)
        .scalar()
    )
    return row or str(workflow_id)


def _build_or_preamble(
    workflow_name: Optional[str], timeperiod_label: Optional[str]
) -> list:
    rows: list = []
    if workflow_name:
        rows.append(["Workflow:", workflow_name])
    if timeperiod_label:
        rows.append(["Current Time Period:", timeperiod_label])
    return rows


def _row_to_submission_export_dict(r: Any, language_code: str) -> dict:
    return {
        "or_sno": r.sno,
        "or_state_name": r.state_name,
        "or_district_name": r.district_name,
        "or_dataset_name": r.dataset_name,
        "or_submission_status": translate_header(
            _SUBMISSION_STATUS_KEYS.get(r.submission_status, str(r.submission_status)), language_code
        ),
        "or_submitted_by": r.submitted_by,
        "or_date_submitted": r.date_submitted,
        "or_last_updated": r.last_updated,
        "or_action_needed": translate_header(
            _ACTION_NEEDED_KEYS.get(r.action_needed, str(r.action_needed)), language_code
        ),
    }


def _row_to_review_status_export_dict(r: Any, language_code: str) -> dict:
    return {
        "or_sno": r.sno,
        "or_state_name": r.state_name,
        "or_district_name": r.district_name,
        "or_dataset_name": r.dataset_name,
        "or_review_status": translate_header(
            _REVIEW_STATUS_KEYS.get(r.review_status, str(r.review_status)), language_code
        ),
        "or_reviewer_assigned": r.reviewer_assigned,
        "or_date_submitted": r.date_submitted,
        "or_date_returned": r.date_returned,
        "or_date_approved": r.date_approved,
    }


def _row_to_data_reporter_export_dict(r: Any) -> dict:
    return {
        "or_sno": r.sno,
        "or_reporter_name": r.reporter_name,
        "or_institution": r.institution,
        "or_role": r.role,
        "or_email": r.email,
        "or_phone": r.phone,
        "or_district_assigned": r.district_assigned,
        "or_last_login": r.last_login,
    }


def _row_to_data_reviewer_export_dict(r: Any) -> dict:
    return {
        "or_sno": r.sno,
        "or_reviewer_name": r.reviewer_name,
        "or_institution": r.institution,
        "or_role": r.role,
        "or_email": r.email,
        "or_phone": r.phone,
        "or_district_assigned": r.district_assigned,
        "or_last_login": r.last_login,
    }


def _row_to_data_completeness_export_dict(r: Any, language_code: str) -> dict:
    return {
        "or_sno": r.sno,
        "or_state_name": r.state_assigned,
        "or_district_name": r.district_assigned,
        "or_dataset_name": r.dataset,
        "or_submission_status": translate_header(
            _SUBMISSION_STATUS_KEYS.get(r.submission_status, str(r.submission_status)), language_code
        ),
        "or_expected_data_points": r.expected_data_points,
        "or_received_data_points": r.received_data_points,
        "or_completeness_rate": r.completeness_rate,
        "or_missing_footnotes": f"{r.missing_footnotes}/{r.expected_data_points}",
    }


def _get_report_detail(
    report_slug: str,
    dw_db: Session,
    dw_id: str,
    language_code: str,
    params: ReportListParams,
    include_breakdown: bool = True,
    include_footnotes: bool = True,
    indicator_filter: Optional[str] = None,
    ius_filter: Optional[str] = None,
    time_period: Optional[str] = None,
) -> Any:
    definition = get_report(report_slug)

    if params.export and not definition.column_defs:
        raise BadRequest(
            "Export is not supported for this report",
            details={"export": True},
        )

    export_page_size = None if params.export else params.page_size

    query_result = definition.query_fn(
        dw_db,
        language_code,
        params.page,
        export_page_size,
        search=params.search,
        search_by=params.search_by,
        sort_field=params.sort_field,
        sort_order=params.sort_order,
        include_breakdown=include_breakdown,
        include_footnotes=include_footnotes,
        indicator_filter=indicator_filter,
        ius_filter=ius_filter,
        time_period=time_period,
    )
    if len(query_result) == 3:
        rows, total, _has_more = query_result
    else:
        rows, total = query_result

    if params.export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        stream, filename, media_type = export_report(
            column_defs=definition.column_defs,
            rows=rows,
            fmt="xlsx",
            title=definition.title,
            slug=definition.slug,
            db_display_name=db_display_name,
            language_code=language_code,
        )
        return _streaming_file_response(stream, filename, media_type)

    meta = _build_pagination_meta(
        total, params.page, params.page_size, row_count=len(rows)
    )

    return success_response(
        message=f"{definition.title} retrieved successfully",
        data=rows,
        meta=meta,
    )


# -------------------------------------------------------------------------
# Quality reports (15) — PERMISSION
# -------------------------------------------------------------------------

@router.get(
    "/quality/indicators/no-ius",
    summary="Indicators with No Subgroup Assigned",
    description=(
        "ut_indicator LEFT JOIN ut_indicator_unit_subgroup WHERE IUS IS NULL. "
        "No subgroup_breakdown — the indicator has no IUS so there is nothing subgroup-specific to show."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_indicators_no_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail(
        "quality/indicators/no-ius", dw_db, dw_id, language_code, params,
    )


@router.get(
    "/quality/indicators/no-default-subgroup",
    summary="Indicators Without Default Subgroup",
    description=(
        "Has IUS rows but none has ius_is_default_subgroup = True. "
        "Each row includes subgroup_breakdown listing all assigned subgroup values with is_default flag per entry."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_indicators_no_default_subgroup(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/indicators/no-default-subgroup", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/indicators/no-data",
    summary="Indicators With No Reported Data",
    description=(
        "Default-locale ut_indicator rows where i_has_data = False. "
        "Each row returns i_nid, i_gid, i_name, and i_has_data."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_indicators_no_data(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/indicators/no-data", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/ius/invalid-value-range",
    summary="IUS with Invalid Value Range",
    description="ius_min_value > ius_max_value on ut_indicator_unit_subgroup.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_ius_invalid_value_range(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/ius/invalid-value-range", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/ius/no-ic-mapping",
    summary="IUS Not Mapped to Any IC",
    description="ius_nid not present in any ut_ic_ius.iusnid row.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_ius_no_ic_mapping(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/ius/no-ic-mapping", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/areas/no-data",
    summary="Areas With No Data",
    description="area.i_has_data = False.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_areas_no_data(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/areas/no-data", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/areas/orphan-parent",
    summary="Areas With Broken Parent Reference",
    description="ar_parent_nid != 0 AND parent ar_nid does not exist in ut_area.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_areas_orphan_parent(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/areas/orphan-parent", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/time-periods/unused",
    summary="Unused Time Periods",
    description="tp_nid not referenced in any ut_data.timeperiod_nid row.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_time_periods_unused(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/time-periods/unused", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/subgroups/vals-not-in-ius",
    summary="SubgroupVals Not Used in Any IUS",
    description="sg_nid not present in ut_indicator_unit_subgroup.subgroup_val_nid.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_subgroups_vals_not_in_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/subgroups/vals-not-in-ius", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/data/values-out-of-range",
    summary="Data Values Outside IUS Range",
    description="ut_data.data_value < ius.ius_min_value OR ut_data.data_value > ius.ius_max_value.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_data_values_out_of_range(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes results to selected period(s)",
    ),
):
    return _get_report_detail(
        "quality/data/values-out-of-range", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/quality/data/missing-mrd",
    summary="IUS+Area Combos With No MRD Row",
    description="For a given ius_nid + ar_nid, no row has dt_is_mrd = True.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_data_missing_mrd(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/data/missing-mrd", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/metadata/missing-mandatory",
    summary="Indicators Missing Mandatory Metadata",
    description="No ut_metadatareport row for categories where ut_metadata_category.mt_catg_is_mandatory = True.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_metadata_missing_mandatory(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/metadata/missing-mandatory", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/sources/unused",
    summary="Sources Not Referenced in Data",
    description=(
        "Source IC NID (ic_type = 'SR') not present in ut_data.source_nid — "
        "output uses src_nid, src_gid, src_name."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_sources_unused(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/sources/unused", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/indicator-classifications/no-ius",
    summary="ICs With No IUS Mapping",
    description="IC NID not in ut_ic_ius.ic_nid; optional ?include_sr=false to exclude source ICs.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_indicator_classifications_no_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/indicator-classifications/no-ius", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/indicator-classifications/leaf-no-ius",
    summary="IC Leaf Nodes Without IUS",
    description="IC row with no children in the IC hierarchy AND no rows in ut_ic_ius.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_indicator_classifications_leaf_no_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/indicator-classifications/leaf-no-ius", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/ic-ius/orphan-refs",
    summary="IC-IUS Links With Broken References",
    description=(
        "Rows in ut_ic_ius where ic_nid is absent from ut_indicator_classifications "
        "OR iusnid is absent from ut_indicator_unit_subgroup."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_ic_ius_orphan_refs(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/ic-ius/orphan-refs", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/ius/orphan-refs",
    summary="IUS With Broken Dimension References",
    description=(
        "IUS rows where indicator_nid, unit_nid, or subgroup_val_nid has no matching row "
        "in ut_indicator, ut_unit, or ut_subgroup_vals."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_ius_orphan_refs(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/ius/orphan-refs", dw_db, dw_id, language_code, params)


# -------------------------------------------------------------------------
# Group N — Data Referential Integrity
# -------------------------------------------------------------------------

@router.get(
    "/quality/data/orphan-ius",
    summary="Data Rows With Missing IUS Reference",
    description="ut_data.iusnid not in ut_indicator_unit_subgroup — primary link to indicator+unit+subgroup is broken.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_data_orphan_ius(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes results to selected period(s)",
    ),
):
    return _get_report_detail(
        "quality/data/orphan-ius", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/quality/data/orphan-area",
    summary="Data Rows With Missing Area Reference",
    description="ut_data.area_nid not in ut_area — the area the data point belongs to no longer exists.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_data_orphan_area(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes results to selected period(s)",
    ),
):
    return _get_report_detail(
        "quality/data/orphan-area", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/quality/data/orphan-timeperiod",
    summary="Data Rows With Missing Time Period Reference",
    description="ut_data.timeperiod_nid not in ut_timeperiod — the time period no longer exists.",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_data_orphan_timeperiod(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
):
    return _get_report_detail("quality/data/orphan-timeperiod", dw_db, dw_id, language_code, params)


@router.get(
    "/quality/data/orphan-source",
    summary="Data Rows With Missing Source Reference",
    description="ut_data.source_nid not in ut_indicator_classifications (only where source_nid IS NOT NULL).",
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_quality_data_orphan_source(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes results to selected period(s)",
    ),
):
    return _get_report_detail(
        "quality/data/orphan-source", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


# -------------------------------------------------------------------------
# Analytics reports (9) — AUTHENTICATED
# -------------------------------------------------------------------------

@router.get(
    "/analytics/coverage/indicator-by-area",
    summary="Indicator Coverage by Area",
    description=(
        "Paginated indicators (default IUS) with area coverage stats. Default sort is "
        "indicator name; ut_data is aggregated only for the current page. Use "
        "sort_field=areas_with_data for global lowest-coverage ranking (full aggregation). "
        "Optional time_period (NID or label, comma-separated) scopes areas_with_data and "
        "total_areas to the selected period(s)."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_coverage_indicator_by_area(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes coverage to selected period(s)",
    ),
):
    return _get_report_detail(
        "analytics/coverage/indicator-by-area", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/analytics/coverage/indicator-by-timeperiod",
    summary="Indicator Coverage by Time Period",
    description=(
        "For each indicator: earliest period, latest period, total periods with data. "
        "Optional time_period (NID or label, comma-separated) scopes stats and total_periods "
        "to the selected year(s)."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_coverage_indicator_by_timeperiod(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes coverage to selected period(s)",
    ),
):
    return _get_report_detail(
        "analytics/coverage/indicator-by-timeperiod", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/analytics/coverage/area-completeness",
    summary="Area Data Completeness",
    description=(
        "Paginated areas with IUS completeness stats. Default sort is area name; "
        "ut_data is aggregated only for the current page. Use "
        "sort_field=ius_with_data for global lowest-completeness ranking (full aggregation). "
        "Optional time_period (NID or label, comma-separated) scopes ius_with_data and "
        "total_ius to the selected period(s)."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_coverage_area_completeness(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes completeness to selected period(s)",
    ),
):
    return _get_report_detail(
        "analytics/coverage/area-completeness", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/analytics/coverage/indicator-subgroup",
    summary="Indicator Subgroup Coverage",
    description=(
        "Flat cross-table: every indicator × subgroup-value pair with has_data flag and data row count. "
        "Use ?indicator= to scope to a single indicator."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_coverage_indicator_subgroup(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    indicator: Optional[str] = Query(
        None,
        description="Scope to one indicator NID, GID, or name substring",
    ),
):
    return _get_report_detail(
        "analytics/coverage/indicator-subgroup", dw_db, dw_id, language_code, params,
        indicator_filter=indicator,
    )


@router.get(
    "/analytics/volume/top-indicators",
    summary="Top Indicators by Data Volume",
    description=(
        "Indicators ranked by total ut_data row count. Paginated JSON returns one page; "
        "export=true downloads all ranked indicators — useful for identifying the most vs least populated indicators. "
        "Optional time_period scopes row counts to the selected period(s)."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_volume_top_indicators(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes row counts to selected period(s)",
    ),
):
    return _get_report_detail(
        "analytics/volume/top-indicators", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/analytics/volume/ius-density",
    summary="IUS Data Density",
    description=(
        "Paginated IUS catalog with per-row data density stats. ut_data is aggregated only "
        "for the current page's IUS rows (default sort: indicator name). Use sort_field=total_rows "
        "to sort the current page by row count (not a global top-N ranking)."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_volume_ius_density(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    indicator: Optional[str] = Query(
        None,
        description="Scope to one indicator NID, GID, or name substring",
    ),
    ius: Optional[str] = Query(None, description="Scope to a single IUS NID"),
):
    return _get_report_detail(
        "analytics/volume/ius-density", dw_db, dw_id, language_code, params,
        indicator_filter=indicator,
        ius_filter=ius,
    )


@router.get(
    "/analytics/volume/subgroup-distribution",
    summary="Subgroup Distribution in Data",
    description=(
        "For each subgroup value: how many data rows reference it, across how many indicators and areas — "
        "reveals dominant subgroups and under-used ones. "
        "Optional time_period scopes stats to the selected period(s)."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_volume_subgroup_distribution(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes stats to selected period(s)",
    ),
):
    return _get_report_detail(
        "analytics/volume/subgroup-distribution", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/analytics/utilisation/source-usage",
    summary="Source Utilisation Summary",
    description=(
        "Paginated source IC rows (ic_type=SR) with utilisation stats. Default sort is "
        "source name; ut_data is aggregated only for the current page. Use "
        "sort_field=total_data_rows for global usage ranking (full aggregation). "
        "Optional time_period scopes stats to the selected period(s)."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_utilisation_source_usage(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes stats to selected period(s)",
    ),
):
    return _get_report_detail(
        "analytics/utilisation/source-usage", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


@router.get(
    "/analytics/utilisation/ic-coverage",
    summary="IC Node Coverage",
    description=(
        "Paginated IC nodes with mapped IUS and data coverage stats. Default sort is "
        "IC name; ut_ic_ius / ut_data are aggregated only for the current page. Use "
        "sort_field=total_data_rows for global ranking (full aggregation). "
        "Optional time_period scopes data stats to the selected period(s)."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_analytics_utilisation_ic_coverage(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    language_code: str = Depends(get_dw_language_code),
    params: ReportListParams = Depends(get_report_list_params),
    time_period: Optional[str] = Query(
        None,
        alias=QUERY_TIME_PERIOD,
        description="Time period NID or label, comma-separated — scopes data stats to selected period(s)",
    ),
):
    return _get_report_detail(
        "analytics/utilisation/ic-coverage", dw_db, dw_id, language_code, params,
        time_period=time_period,
    )


# -------------------------------------------------------------------------
# Data reports — AUTHENTICATED
# -------------------------------------------------------------------------

@router.get(
    "/data/published/full",
    summary="Published Data — Full Export",
    description=(
        "Enriched view of ut_data with all filters optional and no mandatory anchor. "
        "page_size ceiling is 50000. All optional filters and aggregation mode apply. "
        "With isdefaultsubgroup (default true) and no subgroup/ius filter: true = default-subgroup "
        "IUS only, false = non-default IUS only, all = all subgroups. Designed for ETL consumers and bulk "
        "data exports. Public access. "
        "dashboard_id: when supplied with a Bearer JWT, if the authenticated user has area ACL for that "
        "dashboard the resolved `area` NIDs are intersected with the user's assigned area NIDs "
        "(legacy getVOData behaviour). If `area` is omitted, assigned NIDs are used. Empty intersection "
        "returns no rows. Super-admins and users with no area restrictions are unaffected."
    ),
    response_model=SuccessResponse,
    responses=_REPORT_DETAIL_RESPONSES,
)
def get_report_data_published_full(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    dw_db: Session = Depends(get_dw_db),
    db: Session = Depends(get_db),
    language_code: str = Depends(get_dw_language_code),
    app_key: str = Depends(get_app_key),
    optional_user: Optional[dict] = Depends(get_optional_user),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=50000, description="Rows per page (max 50000)"),
    indicator: Optional[str] = Query(None, description="Indicator NID or GID, comma-separated"),
    unit: Optional[str] = Query(None, description="Unit NID or GID, comma-separated"),
    subgroup: Optional[str] = Query(None, description="SubgroupVal NID or GID, comma-separated"),
    area: Optional[str] = Query(None, description="Area NID, GID, or area_id, comma-separated"),
    dashboard_id: Optional[int] = Query(
        None,
        description=(
            "Edit-mode dashboard ID for server-side area ACL enforcement (must be mode=edit, not a publish copy). "
            "When provided with a Bearer JWT, if the authenticated user has area restrictions for this dashboard "
            "requested `area` NIDs are intersected with assigned NIDs; if `area` is omitted, assigned NIDs are used "
            "(legacy getVOData behaviour). Super-admins and users with no restrictions are unaffected."
        ),
    ),
    area_level: Optional[int] = Query(None, description="Filter by area administrative level"),
    time_period: Optional[str] = Query(None, description="Time period NID or label, comma-separated"),
    source: Optional[str] = Query(None, description="Source IC NID or GID, comma-separated"),
    ic: Optional[str] = Query(None, description="IC NID or GID — resolves to IUS via ut_ic_ius"),
    ius: Optional[str] = Query(None, description="IUS NID or composite GID (i_gid|u_gid|sg_gid)"),
    ismrd: Optional[bool] = Query(None, description="true=MRD only; false=non-MRD; omit=all"),
    isplannedvalue: Optional[bool] = Query(None, description="true=planned; false=actual; omit=all"),
    istextualdata: Optional[bool] = Query(None, description="true=textual; false=numeric; omit=all"),
    isdefaultsubgroup: str = Query(
        "true",
        description=(
            "Subgroup auto-filter when indicator is set without subgroup/ius: "
            "true = default-subgroup IUS only (falls back to all if no defaults exist); "
            "false = non-default IUS only (falls back to all if none exist); "
            "all = all subgroups (no auto-filter). Ignored when subgroup or ius is set."
        ),
        alias=QUERY_ISDEFAULTSUBGROUP,
    ),
    filter: list[str] = Query(default=[], description="Operator filter: field:operator:value"),
    aggregate_by: Optional[str] = Query(None, description="Comma-separated dimensions for aggregation mode"),
    agg: str = Query("count", description="Aggregate functions: count,sum,avg,min,max"),
    export: bool = Query(
        False,
        description="When true, download all matching rows as XLSX with UI-friendly columns (Indicator, Subgroup, Area, Time Period, Data, Source, Footnote); pagination is ignored",
    ),
    view: str = Query("tabular", description="Response shape: tabular (only supported view)"),
    search: Optional[str] = Query(None, description="Case-insensitive substring search term", alias=QUERY_SEARCH),
    search_by: Optional[str] = Query(
        None,
        description="Column to search in: i_name | sg_name | ar_name | tp_timeperiod | src_name",
        alias=QUERY_SEARCH_BY,
    ),
    sort_field: Optional[str] = Query(
        None,
        description="Column to sort by: i_name | sg_name | ar_name | tp_timeperiod | src_name | dt_value | dt_nid",
        alias=QUERY_SORT_FIELD,
    ),
    sort_order: str = Query("asc", description="Sort direction: asc | desc", alias=QUERY_SORT_ORDER),
    include_footnotes: bool = Query(
        True,
        description="When false, skip the footnotes query for faster paginated responses",
    ),
):
    definition = get_report("data/published/full")

    if view != "tabular":
        raise BadRequest(
            f"view {view!r} is not supported for this report",
            details={"view": view},
        )

    default_subgroup_mode = parse_default_subgroup_mode(isdefaultsubgroup)

    # Server-side area ACL (legacy getVOData / getIusData):
    # - assigned ∩ requested when both present (empty ∩ → no rows)
    # - assigned only when request has no area filter
    # - unrestricted when user has no area ACL
    allowed_area_nids: Optional[list[int]] = None
    if dashboard_id is not None:
        from apps.app_dashboard.services.user_area_service import (
            get_user_assigned_area_nids_raw,
            require_edit_dashboard_id,
        )
        require_edit_dashboard_id(db, dashboard_id)
        if optional_user and optional_user.get("sub") is not None:
            user_id_acl = int(optional_user["sub"])
            super_admin_keys = optional_user.get("super_admin_api_keys") or []
            is_super_admin_acl = app_key in super_admin_keys
            raw_nids = get_user_assigned_area_nids_raw(
                db,
                user_id=user_id_acl,
                dashboard_id=dashboard_id,
                app_key=app_key,
                is_super_admin=is_super_admin_acl,
            )
            if raw_nids:
                allowed_area_nids = raw_nids

    filters = resolve_published_filters(
        dw_db,
        language_code,
        indicator=indicator,
        unit=unit,
        subgroup=subgroup,
        area=area,
        area_level=area_level,
        time_period=time_period,
        source=source,
        ic=ic,
        ius=ius,
        ismrd=ismrd,
        isplannedvalue=isplannedvalue,
        istextualdata=istextualdata,
        isdefaultsubgroup=default_subgroup_mode,
    )

    if dashboard_id is not None:
        if filters.area_param_provided and filters.area_has_unresolved:
            filters.area_nids_enforced = True
            filters.area_nids = []
        elif allowed_area_nids is not None:
            allowed = set(allowed_area_nids)
            filters.area_nids_enforced = True
            if filters.area_param_provided:
                filters.area_nids = [n for n in filters.area_nids if n in allowed]
            else:
                filters.area_nids = list(dict.fromkeys(allowed_area_nids))
        elif filters.area_param_provided and filters.area_nids:
            filters.area_nids_enforced = True

    op_filters = parse_operator_filters(filter)
    export_page_size = None if export else page_size
    rows, total, footnotes, _has_more = query_published_data(
        dw_db,
        language_code,
        filters=filters,
        op_filters=op_filters,
        page=page,
        page_size=export_page_size,
        aggregate_by=aggregate_by,
        agg=agg,
        search=search,
        search_by=search_by,
        sort=sort_field,
        sort_order=sort_order,
        include_footnotes=include_footnotes or export,
    )

    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        stream, filename, media_type = export_report(
            column_defs=PUBLISHED_DATA_UI_EXPORT_COLUMNS,
            rows=transform_rows_for_ui_export(rows),
            fmt="xlsx",
            title=definition.title,
            slug=definition.slug,
            db_display_name=db_display_name,
            language_code=language_code,
        )
        return _streaming_file_response(stream, filename, media_type)

    meta = _build_pagination_meta(total, page, page_size, row_count=len(rows))
    meta["footnotes"] = footnotes
    meta["footnote_count"] = len(footnotes)
    message = (
        "Published data aggregation retrieved successfully"
        if aggregate_by
        else f"{definition.title} retrieved successfully"
    )
    return success_response(message=message, data=rows, meta=meta)


# ---------------------------------------------------------------------------
# Operational Dashboard
# ---------------------------------------------------------------------------

_OPERATIONAL_DASHBOARD_DESCRIPTION = """
Single-call operational dashboard for a data-entry workflow.

Returns:
- **Summary metrics**: expected districts, total datasets, submitted, not-submitted, under review, returned, approved.
- **Areas table**: one row per district at the workflow's configured area_level, each containing status counts, a completeness bar, and the nested dataset list (data-point counts scoped to that district + selected time period).
- **Completeness bars**: sorted descending — by district and by parent state.

**Path parameters:**
- `dw_id` — data warehouse identifier.

**Query parameters:**
- `workflow_id` *(required)* — workflow to report on.
- `area_identifier` *(optional)* — parent/state-level area identifier; when set, only districts under that state are shown.
- `timeperiod_identifier` *(optional)* — time period identifier (NID or timeperiod string); defaults to the workflow's `curr_timeperiod_nid`.

**Completeness formula:**
`(area_dp_total - area_dp_missing) / area_dp_total × 100`
scoped to the expanded district **and** the selected time period.
Soft-deleted datapoints (`is_deleted=true`) are excluded from these counts.
The area-row completeness is the simple average of its dataset completeness values.
"""


@router.get(
    "/operational-dashboard",
    summary="Operational Dashboard",
    description=_OPERATIONAL_DASHBOARD_DESCRIPTION,
    response_model=SuccessResponse,
    responses={
        200: {"description": "Operational dashboard data retrieved successfully", "model": SuccessResponse},
        400: {"description": "Workflow area_level not configured", "model": ErrorResponse},
        404: {"description": "Workflow config, time period, or area not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    tags=["DW Reports"],
)
def get_operational_dashboard(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    workflow_id: int = Query(..., description="Workflow ID to report on"),
    area_identifier: Optional[str] = Query(
        None,
        description="Parent/state-level area identifier (NID, area_id, or area_gid). "
                    "When set, only districts under that state are returned.",
    ),
    timeperiod_identifier: Optional[str] = Query(
        None,
        description="Time period identifier (numeric NID or timeperiod string). "
                    "Defaults to the workflow's curr_timeperiod_nid.",
    ),
    only_assigned_areas: bool = Query(
        False,
        description=(
            "When true (default), restrict the areas table to districts that have at least one "
            "IAM user assignment (any role) for this workflow. "
            "Pass false to show all areas at the configured area_level regardless of assignments."
        ),
    ),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    language_code: str = Depends(get_dw_language_code),
):
    """Return the full operational dashboard for a workflow in one response."""
    from apps.datawarehouse.services.operational_dashboard_service import get_operational_dashboard as _get_dashboard

    result = _get_dashboard(
        db=db,
        dw_id=int(dw_id) if str(dw_id).isdigit() else dw_id,
        workflow_id=workflow_id,
        locale=language_code,
        area_identifier=area_identifier,
        timeperiod_identifier=timeperiod_identifier,
        only_assigned_areas=only_assigned_areas,
    )
    return success_response(
        message="Operational dashboard retrieved successfully",
        data=result.model_dump(exclude_none=False),
    )


# ---------------------------------------------------------------------------
# Operational Reports
# ---------------------------------------------------------------------------

_OPERATIONAL_REPORTS_DESCRIPTION = """
Paginated report of data-entry operator dataset submissions for a selected workflow.

Each row represents one **Dataset** record expanded once per **district area** it covers
(via the dataset's `area_nids` JSON field), at the area level configured in
`WorkflowDataentryRule.area_level`.

**Column labels** (`column_labels.state_label` and `column_labels.district_label`) are
dynamic — derived from the area-level display names stored in the warehouse.

**Submission status integers:**
- `0` => NOT SUBMITTED *(dataset status is DRAFT)*
- `1` => SUBMITTED *(dataset status is PENDING_REVIEW, APPROVED, or REVISION)*

**Action needed integers:**
- `0` => No action          *(dataset status: APPROVED or PENDING_REVIEW)*
- `1` => Pending Revision   *(dataset status: REVISION)*
- `2` => Pending Submission *(dataset status: DRAFT)*

**Date submitted** is `Dataset.submitted_at` — the timestamp recorded when the dataset
was last transitioned from DRAFT to any other status. Null while in DRAFT.

**Last updated** is `Dataset.last_updated_at`.

**Filters:**
- `submission_status` — `0` = NOT SUBMITTED, `1` = SUBMITTED (exact match)
- `action_needed` — `0` = No action, `1` = Pending Revision, `2` = Pending Submission (exact match)
- `date_submitted_from` / `date_submitted_to` — inclusive ISO 8601 bounds on **Date submitted** (`>=` / `<=`); rows with null `date_submitted` are excluded when either bound is set
- `last_updated_from` / `last_updated_to` — inclusive ISO 8601 bounds on **Last updated** (`>=` / `<=`); rows with null `last_updated` are excluded when either bound is set

**Search:**
- `search` — case-insensitive substring; requires `search_by`
- `search_by` — one of: `state_name`, `district_name`, `dataset_name`, `submitted_by`

**Sort:**
- `sort_field` — one of: `state_name`, `district_name`, `dataset_name`, `submitted_by`, `date_submitted`, `last_updated`
  (default when omitted: `state_name`, then `district_name`, then `dataset_name`, all ascending)
- `sort_order` — `asc` (default) or `desc`
"""


@router.get(
    "/operational-reports/{workflow_id}/area-submission-status",
    summary="Operational Reports — Area Submission Status",
    description=_OPERATIONAL_REPORTS_DESCRIPTION,
    response_model=SuccessResponse,
    responses={
        200: {"description": "Operational reports data retrieved successfully", "model": SuccessResponse},
        400: {"description": "Workflow area_level not configured", "model": ErrorResponse},
        404: {"description": "Workflow data-entry rule not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    tags=["DW Reports"],
)
def get_operational_reports(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    workflow_id: int = Path(..., description="Workflow ID to report on"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=200, description="Number of rows per page"),
    export: bool = Query(False, description="When true, download all matching rows as XLSX (pagination ignored)"),
    submission_status: Optional[int] = Query(
        None,
        description="Filter by submission status: 0 = NOT SUBMITTED, 1 = SUBMITTED",
    ),
    action_needed: Optional[int] = Query(
        None,
        description=(
            "Filter by action needed: 0 = No action, "
            "1 = Pending Revision, 2 = Pending Submission"
        ),
    ),
    date_submitted_from: Optional[date] = Query(
        None,
        description="Include rows where date_submitted is on or after this date (YYYY-MM-DD)",
    ),
    date_submitted_to: Optional[date] = Query(
        None,
        description="Include rows where date_submitted is on or before this date (YYYY-MM-DD)",
    ),
    last_updated_from: Optional[date] = Query(
        None,
        description="Include rows where last_updated is on or after this date (YYYY-MM-DD)",
    ),
    last_updated_to: Optional[date] = Query(
        None,
        description="Include rows where last_updated is on or before this date (YYYY-MM-DD)",
    ),
    search: Optional[str] = Query(
        None,
        description="Case-insensitive substring search term (requires search_by)",
        alias=QUERY_SEARCH,
    ),
    search_by: Optional[str] = Query(
        None,
        description="Column to search: state_name | district_name | dataset_name | submitted_by",
        alias=QUERY_SEARCH_BY,
    ),
    sort_field: Optional[str] = Query(
        None,
        description=(
            "Column to sort by: state_name | district_name | dataset_name | submitted_by | "
            "date_submitted | last_updated"
        ),
        alias=QUERY_SORT_FIELD,
    ),
    sort_order: str = Query(
        "asc",
        description="Sort direction: asc | desc",
        alias=QUERY_SORT_ORDER,
    ),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    language_code: str = Depends(get_dw_language_code),
):
    """Return a paginated operational report of dataset submissions per area for the workflow."""
    from apps.datawarehouse.services.operational_reports_service import (
        get_operational_reports as _get_reports,
    )

    effective_page_size = 9_999_999 if export else page_size
    data, meta = _get_reports(
        db=db,
        dw_id=int(dw_id) if str(dw_id).isdigit() else dw_id,
        workflow_id=workflow_id,
        locale=language_code,
        page=page,
        page_size=effective_page_size,
        submission_status=submission_status,
        action_needed=action_needed,
        date_submitted_from=datetime.combine(date_submitted_from, time.min) if date_submitted_from else None,
        date_submitted_to=datetime.combine(date_submitted_to, time.max) if date_submitted_to else None,
        last_updated_from=datetime.combine(last_updated_from, time.min) if last_updated_from else None,
        last_updated_to=datetime.combine(last_updated_to, time.max) if last_updated_to else None,
        search=search,
        search_by=search_by,
        sort_field=sort_field,
        sort_order=sort_order,
    )

    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        workflow_display_name = _fetch_workflow_display_name(db, workflow_id, language_code)
        preamble = _build_or_preamble(workflow_display_name, data.current_timeperiod_label)
        export_rows = [_row_to_submission_export_dict(r, language_code) for r in data.rows]
        stream, filename, media_type = export_report(
            column_defs=OR_SUBMISSION_STATUS_COLUMN_DEFS,
            rows=export_rows,
            fmt="xlsx",
            title="Data Submission Status",
            slug="operational-reports/area-submission-status",
            db_display_name=db_display_name,
            language_code=language_code,
            preamble_rows=preamble,
        )
        return _streaming_file_response(stream, filename, media_type)

    return success_response(
        message="Operational reports retrieved successfully",
        data=data.model_dump(exclude_none=False),
        meta=meta,
    )


# ---------------------------------------------------------------------------
# Review Status Report
# ---------------------------------------------------------------------------

_REVIEW_STATUS_REPORT_DESCRIPTION = """
Paginated report of reviewer assignments and review outcomes per area and dataset
for a selected workflow.

Each row represents one **Dataset** record expanded once per **district area** it covers
and once per **reviewer IAM-assigned** to that area (role must carry `dm_dw_data_review`
permission). Datasets in DRAFT status are excluded — only PENDING_REVIEW, REVISION,
and APPROVED datasets appear.

**Column labels** (`column_labels.state_label` and `column_labels.district_label`) are
dynamic — derived from the area-level display names stored in the warehouse.

**Review status integers:**
- `0` => Approved       *(dataset status: APPROVED)*
- `1` => Pending review *(dataset status: PENDING_REVIEW)*
- `2` => Revision       *(dataset status: REVISION)*

**Reviewer assigned** is the full name of the IAM user whose role carries
`dm_dw_data_review` permission and who is assigned to the district for this workflow.
If no reviewer is assigned, the field is null and one row is still emitted for the
dataset + area combination.

**Date submitted** is `Dataset.submitted_at`. Null while in DRAFT.

**Date returned** is `Dataset.last_returned_at` — the last time a reviewer returned
the dataset for revision. Null if never returned.

**Date approved** is `Dataset.approved_on`. Null until approved.

**Filters:**
- `review_status` — `0` = Approved, `1` = Pending review, `2` = Revision (exact match)

**Date range filters** (inclusive `>=` / `<=`; rows with null on the filtered column are excluded when a bound is set):
- `date_submitted_from` / `date_submitted_to` — filter by date submitted
- `date_returned_from` / `date_returned_to` — filter by date returned
- `date_approved_from` / `date_approved_to` — filter by date approved

**Search:**
- `search` — case-insensitive substring; requires `search_by`
- `search_by` — one of: `state_name`, `district_name`, `dataset_name`, `reviewer_assigned`

**Sort:**
- `sort_field` — one of: `state_name`, `district_name`, `dataset_name`, `reviewer_assigned`, `date_submitted`, `date_returned`, `date_approved`
  (default when omitted: `state_name`, then `district_name`, then `dataset_name`, then `reviewer_assigned`, all ascending)
- `sort_order` — `asc` (default) or `desc`
"""


@router.get(
    "/operational-reports/{workflow_id}/review-status",
    summary="Operational Reports — Review Status",
    description=_REVIEW_STATUS_REPORT_DESCRIPTION,
    response_model=SuccessResponse,
    responses={
        200: {"description": "Review status report data retrieved successfully", "model": SuccessResponse},
        400: {"description": "Workflow area_level not configured", "model": ErrorResponse},
        404: {"description": "Workflow data-entry rule not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    tags=["DW Reports"],
)
def get_review_status_report(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    workflow_id: int = Path(..., description="Workflow ID to report on"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=200, description="Number of rows per page"),
    export: bool = Query(False, description="When true, download all matching rows as XLSX (pagination ignored)"),
    review_status: Optional[int] = Query(
        None,
        description="Filter by review status: 0 = Approved, 1 = Pending review, 2 = Revision",
    ),
    date_submitted_from: Optional[date] = Query(
        None,
        description="Include rows where date_submitted is on or after this date (YYYY-MM-DD)",
    ),
    date_submitted_to: Optional[date] = Query(
        None,
        description="Include rows where date_submitted is on or before this date (YYYY-MM-DD)",
    ),
    date_returned_from: Optional[date] = Query(
        None,
        description="Include rows where date_returned is on or after this date (YYYY-MM-DD)",
    ),
    date_returned_to: Optional[date] = Query(
        None,
        description="Include rows where date_returned is on or before this date (YYYY-MM-DD)",
    ),
    date_approved_from: Optional[date] = Query(
        None,
        description="Include rows where date_approved is on or after this date (YYYY-MM-DD)",
    ),
    date_approved_to: Optional[date] = Query(
        None,
        description="Include rows where date_approved is on or before this date (YYYY-MM-DD)",
    ),
    search: Optional[str] = Query(
        None,
        description="Case-insensitive substring search term (requires search_by)",
        alias=QUERY_SEARCH,
    ),
    search_by: Optional[str] = Query(
        None,
        description="Column to search: state_name | district_name | dataset_name | reviewer_assigned",
        alias=QUERY_SEARCH_BY,
    ),
    sort_field: Optional[str] = Query(
        None,
        description=(
            "Column to sort by: state_name | district_name | dataset_name | reviewer_assigned | "
            "date_submitted | date_returned | date_approved"
        ),
        alias=QUERY_SORT_FIELD,
    ),
    sort_order: str = Query(
        "asc",
        description="Sort direction: asc | desc",
        alias=QUERY_SORT_ORDER,
    ),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    language_code: str = Depends(get_dw_language_code),
):
    """Return a paginated review status report of dataset reviews per area for the workflow."""
    from apps.datawarehouse.services.review_status_report_service import (
        get_review_status_report as _get_report,
    )

    effective_page_size = 9_999_999 if export else page_size
    data, meta = _get_report(
        db=db,
        dw_id=int(dw_id) if str(dw_id).isdigit() else dw_id,
        workflow_id=workflow_id,
        locale=language_code,
        page=page,
        page_size=effective_page_size,
        review_status=review_status,
        date_submitted_from=datetime.combine(date_submitted_from, time.min) if date_submitted_from else None,
        date_submitted_to=datetime.combine(date_submitted_to, time.max) if date_submitted_to else None,
        date_returned_from=datetime.combine(date_returned_from, time.min) if date_returned_from else None,
        date_returned_to=datetime.combine(date_returned_to, time.max) if date_returned_to else None,
        date_approved_from=datetime.combine(date_approved_from, time.min) if date_approved_from else None,
        date_approved_to=datetime.combine(date_approved_to, time.max) if date_approved_to else None,
        search=search,
        search_by=search_by,
        sort_field=sort_field,
        sort_order=sort_order,
    )

    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        workflow_display_name = _fetch_workflow_display_name(db, workflow_id, language_code)
        preamble = _build_or_preamble(workflow_display_name, data.current_timeperiod_label)
        export_rows = [_row_to_review_status_export_dict(r, language_code) for r in data.rows]
        stream, filename, media_type = export_report(
            column_defs=OR_REVIEW_STATUS_COLUMN_DEFS,
            rows=export_rows,
            fmt="xlsx",
            title="Review Status",
            slug="operational-reports/review-status",
            db_display_name=db_display_name,
            language_code=language_code,
            preamble_rows=preamble,
        )
        return _streaming_file_response(stream, filename, media_type)

    return success_response(
        message="Review status report retrieved successfully",
        data=data.model_dump(exclude_none=False),
        meta=meta,
    )


# ---------------------------------------------------------------------------
# Data Reporter Report
# ---------------------------------------------------------------------------

_DATA_REPORTER_REPORT_DESCRIPTION = """
Paginated report of data-entry operators assigned to a selected workflow.

Each row represents one operator expanded once per **district area** they are
IAM-assigned to. If an operator is assigned to three districts, they appear three
times. Only users whose role carries `dm_dw_data_entry` permission are included.

**Column labels** (`column_labels.state_label` and `column_labels.district_label`)
are dynamic — derived from the area-level display names stored in the warehouse.

**Role** is the locale-aware display name from `iam_role_i18n` for the operator's
assigned role; falls back to the role code if no translation exists for the locale.

**Last login** is `IamUser.last_loggedin_on`. Null if the operator has never logged in.

**Last submission** is `MAX(Dataset.submitted_at)` for datasets submitted by the
operator under this workflow. Null if the operator has not submitted any dataset.

**Date range filter** (inclusive `>=` / `<=`; rows with null `last_login` are excluded when a bound is set):
- `last_login_from` / `last_login_to` — filter by last login timestamp

**Search:**
- `search` — case-insensitive substring; requires `search_by`
- `search_by` — one of: `reporter_name`, `institution`, `role`, `email`, `phone`, `district_assigned`

**Sort:**
- `sort_field` — one of: `reporter_name`, `institution`, `role`, `email`, `district_assigned`
  (default when omitted: `state_assigned`, then `district_assigned`, then `reporter_name`, all ascending)
- `sort_order` — `asc` (default) or `desc`
"""


@router.get(
    "/operational-reports/{workflow_id}/data-reporter",
    summary="Operational Reports — Data Reporter",
    description=_DATA_REPORTER_REPORT_DESCRIPTION,
    response_model=SuccessResponse,
    responses={
        200: {"description": "Data reporter report data retrieved successfully", "model": SuccessResponse},
        400: {"description": "Workflow area_level not configured", "model": ErrorResponse},
        404: {"description": "Workflow data-entry rule not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    tags=["DW Reports"],
)
def get_data_reporter_report(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    workflow_id: int = Path(..., description="Workflow ID to report on"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=200, description="Number of rows per page"),
    export: bool = Query(False, description="When true, download all matching rows as XLSX (pagination ignored)"),
    last_login_from: Optional[date] = Query(
        None,
        description="Include rows where last_login is on or after this date (YYYY-MM-DD)",
    ),
    last_login_to: Optional[date] = Query(
        None,
        description="Include rows where last_login is on or before this date (YYYY-MM-DD)",
    ),
    search: Optional[str] = Query(
        None,
        description="Case-insensitive substring search term (requires search_by)",
        alias=QUERY_SEARCH,
    ),
    search_by: Optional[str] = Query(
        None,
        description="Column to search: reporter_name | institution | role | email | phone | district_assigned",
        alias=QUERY_SEARCH_BY,
    ),
    sort_field: Optional[str] = Query(
        None,
        description="Column to sort by: reporter_name | institution | role | email | district_assigned",
        alias=QUERY_SORT_FIELD,
    ),
    sort_order: str = Query(
        "asc",
        description="Sort direction: asc | desc",
        alias=QUERY_SORT_ORDER,
    ),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    language_code: str = Depends(get_dw_language_code),
):
    """Return a paginated data reporter report of operator assignments per area for the workflow."""
    from apps.datawarehouse.services.data_reporter_report_service import (
        get_data_reporter_report as _get_report,
    )

    effective_page_size = 9_999_999 if export else page_size
    data, meta = _get_report(
        db=db,
        dw_id=int(dw_id) if str(dw_id).isdigit() else dw_id,
        workflow_id=workflow_id,
        locale=language_code,
        page=page,
        page_size=effective_page_size,
        search=search,
        search_by=search_by,
        sort_field=sort_field,
        sort_order=sort_order,
        last_login_from=datetime.combine(last_login_from, time.min) if last_login_from else None,
        last_login_to=datetime.combine(last_login_to, time.max) if last_login_to else None,
    )

    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        workflow_display_name = _fetch_workflow_display_name(db, workflow_id, language_code)
        preamble = _build_or_preamble(workflow_display_name, data.current_timeperiod_label)
        export_rows = [_row_to_data_reporter_export_dict(r) for r in data.rows]
        stream, filename, media_type = export_report(
            column_defs=OR_DATA_REPORTER_COLUMN_DEFS,
            rows=export_rows,
            fmt="xlsx",
            title="Data Reporter",
            slug="operational-reports/data-reporter",
            db_display_name=db_display_name,
            language_code=language_code,
            preamble_rows=preamble,
        )
        return _streaming_file_response(stream, filename, media_type)

    return success_response(
        message="Data reporter report retrieved successfully",
        data=data.model_dump(exclude_none=False),
        meta=meta,
    )


# ---------------------------------------------------------------------------
# Data Reviewer Report
# ---------------------------------------------------------------------------

_DATA_REVIEWER_REPORT_DESCRIPTION = """
Paginated report of data reviewers assigned to a selected workflow.

Each row represents one reviewer expanded once per **district area** they are
IAM-assigned to. If a reviewer is assigned to three districts, they appear three
times. Only users whose role carries `dm_dw_data_review` permission are included.

**Column labels** (`column_labels.state_label` and `column_labels.district_label`)
are dynamic — derived from the area-level display names stored in the warehouse.

**Role** is the locale-aware display name from `iam_role_i18n` for the reviewer's
assigned role; falls back to the role code if no translation exists for the locale.

**Datasets assigned count** is the number of active datasets for this workflow
(status not in DELETED or REJECTED) whose `area_nids` array includes the district's
area_nid. Computed server-side via Python aggregation.

**Last login** is `IamUser.last_loggedin_on`. Null if the reviewer has never logged in.

**Date range filter** (inclusive `>=` / `<=`; rows with null `last_login` are excluded when a bound is set):
- `last_login_from` / `last_login_to` — filter by last login timestamp

**Search:**
- `search` — case-insensitive substring; requires `search_by`
- `search_by` — one of: `reviewer_name`, `institution`, `role`, `email`, `phone`, `district_assigned`

**Sort:**
- `sort_field` — one of: `reviewer_name`, `institution`, `role`, `email`, `district_assigned`
  (default when omitted: `state_assigned`, then `district_assigned`, then `reviewer_name`, all ascending)
- `sort_order` — `asc` (default) or `desc`
"""


@router.get(
    "/operational-reports/{workflow_id}/data-reviewer",
    summary="Operational Reports — Data Reviewer",
    description=_DATA_REVIEWER_REPORT_DESCRIPTION,
    response_model=SuccessResponse,
    responses={
        200: {"description": "Data reviewer report data retrieved successfully", "model": SuccessResponse},
        400: {"description": "Workflow area_level not configured", "model": ErrorResponse},
        404: {"description": "Workflow data-entry rule not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    tags=["DW Reports"],
)
def get_data_reviewer_report(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    workflow_id: int = Path(..., description="Workflow ID to report on"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=200, description="Number of rows per page"),
    export: bool = Query(False, description="When true, download all matching rows as XLSX (pagination ignored)"),
    last_login_from: Optional[date] = Query(
        None,
        description="Include rows where last_login is on or after this date (YYYY-MM-DD)",
    ),
    last_login_to: Optional[date] = Query(
        None,
        description="Include rows where last_login is on or before this date (YYYY-MM-DD)",
    ),
    search: Optional[str] = Query(
        None,
        description="Case-insensitive substring search term (requires search_by)",
        alias=QUERY_SEARCH,
    ),
    search_by: Optional[str] = Query(
        None,
        description="Column to search: reviewer_name | institution | role | email | phone | district_assigned",
        alias=QUERY_SEARCH_BY,
    ),
    sort_field: Optional[str] = Query(
        None,
        description="Column to sort by: reviewer_name | institution | role | email | district_assigned",
        alias=QUERY_SORT_FIELD,
    ),
    sort_order: str = Query(
        "asc",
        description="Sort direction: asc | desc",
        alias=QUERY_SORT_ORDER,
    ),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    language_code: str = Depends(get_dw_language_code),
):
    """Return a paginated data reviewer report of reviewer assignments per area for the workflow."""
    from apps.datawarehouse.services.data_reviewer_report_service import (
        get_data_reviewer_report as _get_report,
    )

    effective_page_size = 9_999_999 if export else page_size
    data, meta = _get_report(
        db=db,
        dw_id=int(dw_id) if str(dw_id).isdigit() else dw_id,
        workflow_id=workflow_id,
        locale=language_code,
        page=page,
        page_size=effective_page_size,
        search=search,
        search_by=search_by,
        sort_field=sort_field,
        sort_order=sort_order,
        last_login_from=datetime.combine(last_login_from, time.min) if last_login_from else None,
        last_login_to=datetime.combine(last_login_to, time.max) if last_login_to else None,
    )

    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        workflow_display_name = _fetch_workflow_display_name(db, workflow_id, language_code)
        preamble = _build_or_preamble(workflow_display_name, data.current_timeperiod_label)
        export_rows = [_row_to_data_reviewer_export_dict(r) for r in data.rows]
        stream, filename, media_type = export_report(
            column_defs=OR_DATA_REVIEWER_COLUMN_DEFS,
            rows=export_rows,
            fmt="xlsx",
            title="Data Reviewer",
            slug="operational-reports/data-reviewer",
            db_display_name=db_display_name,
            language_code=language_code,
            preamble_rows=preamble,
        )
        return _streaming_file_response(stream, filename, media_type)

    return success_response(
        message="Data reviewer report retrieved successfully",
        data=data.model_dump(exclude_none=False),
        meta=meta,
    )


# ---------------------------------------------------------------------------
# Data Completeness Report
# ---------------------------------------------------------------------------

_DATA_COMPLETENESS_REPORT_DESCRIPTION = """
Paginated report of datasets under a selected workflow, showing data point
completeness metrics per **(district, dataset)** row.

Each row represents one dataset expanded once per **district area** it covers.
All active datasets are included (DRAFT, PENDING_REVIEW, REVISION, APPROVED);
DELETED and REJECTED datasets are excluded.

**Column labels** (`column_labels.state_label` and `column_labels.district_label`)
are dynamic — derived from the area-level display names stored in the warehouse.

**submission_status** integer codes:
  - `0` => NOT SUBMITTED (dataset is in DRAFT status)
  - `1` => SUBMITTED (dataset status is PENDING_REVIEW, APPROVED, or REVISION)

**expected_data_points** — active (non-soft-deleted) `DatasetDataPoint` rows for the
(dataset, area) combination across all time periods.

**received_data_points** — active rows where `data_value IS NOT NULL OR
textual_data_value IS NOT NULL` for the (dataset, area) combination.

**completeness_rate** — `received / expected × 100` (0.0 when expected = 0).

**missing_footnotes** — integer count of active data points for the (dataset, area) pair
where `footnote_nid IS NULL`. Returns `0` when all data points have a footnote.
Soft-deleted rows (`is_deleted=true`) are excluded from all four metrics.

**Filters:**
- `submission_status` — `0` = NOT SUBMITTED, `1` = SUBMITTED (exact match)

**Search:**
- `search` — case-insensitive substring; requires `search_by`
- `search_by` — one of: `state_assigned`, `district_assigned`, `dataset`

**Sort:**
- `sort_field` — one of: `state_assigned`, `district_assigned`, `dataset`, `expected_data_points`, `received_data_points`, `completeness_rate`, `missing_footnotes`
  (default when omitted: `state_assigned`, then `district_assigned`, then `dataset`, all ascending)
- `sort_order` — `asc` (default) or `desc`
"""


@router.get(
    "/operational-reports/{workflow_id}/data-completeness",
    summary="Operational Reports — Data Completeness",
    description=_DATA_COMPLETENESS_REPORT_DESCRIPTION,
    response_model=SuccessResponse,
    responses={
        200: {"description": "Data completeness report retrieved successfully", "model": SuccessResponse},
        400: {"description": "Workflow area_level not configured", "model": ErrorResponse},
        404: {"description": "Workflow data-entry rule not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    tags=["DW Reports"],
)
def get_data_completeness_report(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    workflow_id: int = Path(..., description="Workflow ID to report on"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=200, description="Number of rows per page"),
    export: bool = Query(False, description="When true, download all matching rows as XLSX (pagination ignored)"),
    submission_status: Optional[int] = Query(
        None,
        description="Filter by submission status: 0 = NOT SUBMITTED, 1 = SUBMITTED",
    ),
    search: Optional[str] = Query(
        None,
        description="Case-insensitive substring search term (requires search_by)",
        alias=QUERY_SEARCH,
    ),
    search_by: Optional[str] = Query(
        None,
        description="Column to search: state_assigned | district_assigned | dataset",
        alias=QUERY_SEARCH_BY,
    ),
    sort_field: Optional[str] = Query(
        None,
        description=(
            "Column to sort by: state_assigned | district_assigned | dataset | "
            "expected_data_points | received_data_points | completeness_rate | missing_footnotes"
        ),
        alias=QUERY_SORT_FIELD,
    ),
    sort_order: str = Query(
        "asc",
        description="Sort direction: asc | desc",
        alias=QUERY_SORT_ORDER,
    ),
    _: str = Depends(validate_dw_id),
    db: Session = Depends(get_db),
    language_code: str = Depends(get_dw_language_code),
):
    """Return a paginated data completeness report of datasets per area for the workflow."""
    from apps.datawarehouse.services.data_completeness_report_service import (
        get_data_completeness_report as _get_report,
    )

    effective_page_size = 9_999_999 if export else page_size
    data, meta = _get_report(
        db=db,
        dw_id=int(dw_id) if str(dw_id).isdigit() else dw_id,
        workflow_id=workflow_id,
        locale=language_code,
        page=page,
        page_size=effective_page_size,
        submission_status=submission_status,
        search=search,
        search_by=search_by,
        sort_field=sort_field,
        sort_order=sort_order,
    )

    if export:
        cred = get_warehouse_credentials(dw_id)
        db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
        workflow_display_name = _fetch_workflow_display_name(db, workflow_id, language_code)
        preamble = _build_or_preamble(workflow_display_name, data.current_timeperiod_label)
        export_rows = [_row_to_data_completeness_export_dict(r, language_code) for r in data.rows]
        stream, filename, media_type = export_report(
            column_defs=OR_DATA_COMPLETENESS_COLUMN_DEFS,
            rows=export_rows,
            fmt="xlsx",
            title="Data Completeness",
            slug="operational-reports/data-completeness",
            db_display_name=db_display_name,
            language_code=language_code,
            preamble_rows=preamble,
        )
        return _streaming_file_response(stream, filename, media_type)

    return success_response(
        message="Data completeness report retrieved successfully",
        data=data.model_dump(exclude_none=False),
        meta=meta,
    )
