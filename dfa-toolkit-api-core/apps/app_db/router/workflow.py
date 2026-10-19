"""
Workflow engine routes.

All endpoints are scoped under /workflow/{dw_id}.
dw_id=0 (or a sentinel) can be used for global workflows (dw_id IS NULL),
but callers must always supply a dw_id path segment.

Tables (core DB):
    workflow                     → GET/POST/PATCH/DELETE /dw/{dw_id}/workflow
    workflow_review_level        → GET/POST/PATCH/DELETE /dw/{dw_id}/workflow/{workflow_id}/level
    workflow_dataentry_rule      → GET/PUT               /dw/{dw_id}/workflow/{workflow_id}/dataentry  (dm_dw_workflow / PERMISSION)
                                   GET                   /dw/{dw_id}/dataset/workflow/{workflow_id}  (dm_dw_data_entry / AUTHENTICATED — operator/reviewer read)
    iam_user_role_content        → GET/POST/DELETE       /dw/{dw_id}/workflow/{workflow_id}/user-assignments
"""
import logging
import pathlib
from datetime import datetime
from typing import Any, List, Optional, Union

from fastapi import APIRouter, Body, Depends, File, HTTPException, Path, Query, UploadFile, status
from starlette.responses import StreamingResponse
from sqlalchemy import asc, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from apps.app_db.dependencies import (
    get_app_key,
    get_core_locale,
    get_current_user_id,
    get_is_super_admin,
    get_scoped_workflow_ids,
)
from apps.app_db.models.core import (
    Dataset,
    DatasetReviewStage,
    IamRole,
    IamUserRole,
    IamUserRoleContent,
    ReviewWorkflow,
    ReviewWorkflowI18n,
    ReviewWorkflowLevel,
    ReviewWorkflowLevelI18n,
    WorkflowDataentryRule,
)
from apps.app_db.schemas.dataset import (
    DataPointDeleteRequest,
    DataPointDeleteResponse,
    DataPointsImportResponse,
    DataPointsImportLogListResponse,
    DataPointsImportLogDetailResponse,
    DataPointReviewStatusLiteral,
    DataPointListResponse,
    DataPointUpsertRequest,
    DataPointUpsertResponse,
    DatasetCommentCreateRequest,
    DatasetCreateRequest,
    DatasetCreateResponse,
    DatasetDeleteResponse,
    DatasetDetailResponse,
    DatasetListResponse,
    DatasetOperatorPatchRequest,
    DatasetOperatorTransitionRequest,
    OperatorDatasetPatchRequest,
    DatasetTransitionResponse,
    RejectionReasonResponse,
    ReviewDatasetListResponse,
    ReviewGridResponse,
    ReviewerDecisionRequest,
    ReviewerDecisionResponse,
    UnifiedDeleteRequest,
    UnifiedSubmitRequest,
    UnifiedUpsertRequest,
)
from apps.app_db.services import dataset_service
from apps.app_db.schemas.workflow import (
    WorkflowCreateRequest,
    WorkflowCreatedResponse,
    WorkflowDataentryResponse,
    WorkflowDataentryUpsertRequest,
    WorkflowLevelResponse,
    WorkflowLevelUpsertRequest,
    WorkflowPatchRequest,
    WorkflowResponse,
    WorkflowUserAssignmentCreateRequest,
    WorkflowUserAssignmentResponse,
)
from apps.app_db.services.workflow_role_utils import (
    resource_code_to_scope_type,
    scope_type_to_resource_code,
)
from apps.shared.config.dependencies import get_db
from apps.shared.schemas.response import ErrorResponse, ListPaginationMetaSchema, SuccessResponse
from apps.shared.exceptions import (
    AppException,
    BadRequest,
    Conflict,
    Forbidden,
    NotFound,
    UnprocessableEntity,
)
from apps.shared.utils.import_upload_limits import (
    ImportUploadTooLarge,
    get_allowed_import_file_size_bytes,
    import_upload_too_large_message,
    read_import_upload_bytes,
)
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import created_response, success_response
from apps.shared.utils.translations import t
from apps.datawarehouse.db.datawarehouse import get_dw_language_code, get_warehouse_session_from_id
from apps.datawarehouse.utils.export_utils import (
    build_generic_export_xlsx,
    stream_single_xlsx_file,
    DATA_POINT_COLUMN_DEFS,
    make_export_filename,
    stream_parallel_xlsx_zip,
    translate_header,
)
from apps.datawarehouse.schemas.data import UnifiedDataPointRowSchema
from apps.datawarehouse.services.data_service import DataService, MetaFlags
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.constants import (
    QUERY_I_IDENTIFIER, QUERY_U_IDENTIFIER, QUERY_SG_IDENTIFIER,
    QUERY_AR_IDENTIFIER, QUERY_TP_NID, QUERY_TP_TIMEPERIOD,
    QUERY_IUS_IDENTIFIER, QUERY_SRC_IDENTIFIER, QUERY_ISDEFAULTENABLED,
    QUERY_PAGE, QUERY_PAGE_SIZE,
    QUERY_INDICATOR, QUERY_UNIT, QUERY_SUBGROUP, QUERY_IUS, QUERY_IC,
    QUERY_TIME_PERIOD, QUERY_AREA, QUERY_AREA_LEVEL,
    QUERY_SEARCH, QUERY_SEARCH_BY, QUERY_SORT_FIELD, QUERY_SORT_ORDER,
    UNIFIED_DATAPOINT_SEARCH_BY_VALUES, UNIFIED_DATAPOINT_SORT_FIELDS,
)

logger = logging.getLogger(__name__)


def _workflow_t(key: str, locale: str, **kwargs: Any) -> str:
    """Resolve workflow API message from apps/shared/translations/<locale>.json."""
    template = t(key, locale=locale)
    if kwargs:
        try:
            return template.format(**kwargs)
        except (KeyError, ValueError, TypeError):
            return template
    return template
router = APIRouter(prefix="/dw", tags=["System Datawarehouse Workflows"])


# =============================================================================
# workflow (ReviewWorkflow ORM)
# =============================================================================

def _wf_resp(wf: ReviewWorkflow, i18n, *, dataset_count: int = 0, in_progress_dataset_cnt: int = 0) -> WorkflowResponse:
    return WorkflowResponse(
        workflow_id=wf.workflow_id,
        dw_id=wf.dw_id,
        workflow_code=wf.workflow_code,
        workflow_name=i18n.workflow_name if i18n else None,
        review_scope_type=wf.review_scope_type,
        description=i18n.description if i18n else None,
        start_workflow_review_level_id=wf.start_workflow_review_level_id,
        review_level_count=wf.review_level_count,
        priority=wf.priority,
        is_active=wf.is_active,
        is_system=wf.is_system,
        allow_review=wf.allow_review,
        constraint_data_entry=wf.constraint_data_entry,
        created=wf.created,
        created_user_id=wf.created_user_id,
        modified=wf.modified,
        modified_user_id=wf.modified_user_id,
        dataset_count=dataset_count,
        in_progress_dataset_cnt=in_progress_dataset_cnt,
    )


def _lvl_resp(lvl: ReviewWorkflowLevel, i18n) -> WorkflowLevelResponse:
    return WorkflowLevelResponse(
        workflow_review_level_id=lvl.workflow_review_level_id,
        workflow_id=lvl.workflow_id,
        level_no=lvl.level_no,
        level_name=i18n.level_name if i18n else None,
        review_scope_type=lvl.review_scope_type,
        area_level=lvl.area_level,
        classification_parent_nid=lvl.classification_parent_nid,
        role_id=lvl.role_id,
        include_childs=lvl.include_childs,
        is_final_level=lvl.is_final_level,
        is_active=lvl.is_active,
        created=lvl.created,
    )


def _workflow_review_level_capacity(workflow: ReviewWorkflow) -> int:
    """Configured max active levels (may be 0)."""
    n = workflow.review_level_count
    return 0 if n is None else int(n)


def _count_active_workflow_levels(db: Session, workflow_id: int, exclude_level_id: Optional[int] = None) -> int:
    q = db.query(ReviewWorkflowLevel).filter(
        ReviewWorkflowLevel.workflow_id == workflow_id,
        ReviewWorkflowLevel.is_active == True,  # noqa: E712
    )
    if exclude_level_id is not None:
        q = q.filter(ReviewWorkflowLevel.workflow_review_level_id != exclude_level_id)
    return q.count()


def _sync_start_level(db: Session, workflow: ReviewWorkflow) -> None:
    """Set start_workflow_review_level_id to the active level with the lowest level_no.
    Clears it to None when no active levels remain.
    Must be called before commit after any level insert, update, or delete.
    """
    first_active = (
        db.query(ReviewWorkflowLevel)
        .filter(
            ReviewWorkflowLevel.workflow_id == workflow.workflow_id,
            ReviewWorkflowLevel.is_active == True,  # noqa: E712
        )
        .order_by(asc(ReviewWorkflowLevel.level_no))
        .first()
    )
    workflow.start_workflow_review_level_id = (
        first_active.workflow_review_level_id if first_active else None
    )


def _validate_active_workflow_levels_is_final(db: Session, workflow_id: int) -> Optional[str]:
    """
    When at least one workflow_review_level is active, require exactly one is_final_level=True
    and it must be on the highest active level_no (terminal reviewer stage).
    """
    levels = (
        db.query(ReviewWorkflowLevel)
        .filter(
            ReviewWorkflowLevel.workflow_id == workflow_id,
            ReviewWorkflowLevel.is_active == True,  # noqa: E712
        )
        .all()
    )
    if not levels:
        return None
    finals = [L for L in levels if L.is_final_level]
    if len(finals) != 1:
        return (
            "Active workflow levels must have exactly one is_final_level=true "
            f"(found {len(finals)}). Mark only the highest level_no as final."
        )
    max_no = max(L.level_no for L in levels)
    if finals[0].level_no != max_no:
        return (
            f"is_final_level must be set on the highest active level_no ({max_no}), "
            f"not on level_no {finals[0].level_no}."
        )
    return None


_WORKFLOW_SEARCH_FIELDS = {
    "workflow_name": ReviewWorkflowI18n.workflow_name,
    "workflow_code": ReviewWorkflow.workflow_code,
    "description": ReviewWorkflowI18n.description,
}

_WORKFLOW_SORT_FIELDS = {
    "name": ReviewWorkflowI18n.workflow_name,
    "allow_review": ReviewWorkflow.allow_review,
    "review_stage": ReviewWorkflow.review_level_count,
    "created_on": ReviewWorkflow.created,
}


@router.get(
    "/{dw_id}/workflow",
    response_model=SuccessResponse[List[WorkflowResponse]],
    summary="List workflows for a datawarehouse",
    description=(
        "Return workflows scoped to the given dw_id. "
        "Optional `is_active`: true = active only, false = inactive only, omit = all. "
        "Default ordering is priority ascending. "
        "Optional sort_by (name, allow_review, review_stage, created_on) with sort_order asc|desc "
        "sorts by that column then by priority and workflow_id for stable ordering. "
        "Supports optional pagination, allow_review and is_active filters, and search. "
        "Each item includes `dataset_count` (datasets referencing that workflow for this DW)."
    ),
)
def list_workflows(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    workflow_ids: Optional[List[int]] = Depends(get_scoped_workflow_ids),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page; omit to return all"),
    allow_review: Optional[bool] = Query(None, description="Filter by allow_review status"),
    is_active: Optional[bool] = Query(
        None,
        description="When true, only active workflows; when false, only inactive; omit for all.",
    ),
    search_by: Optional[str] = Query(None, description=f"Field to search in: {', '.join(_WORKFLOW_SEARCH_FIELDS)}"),
    search: Optional[str] = Query(None, description="Search term (case-insensitive partial match) applied to workflow_name i18n column by default"),
    sort_by: Optional[str] = Query(
        None,
        description=f"When set, primary sort field: {', '.join(_WORKFLOW_SORT_FIELDS)}. Omit to sort by priority only.",
    ),
    sort_order: Optional[str] = Query(
        "asc",
        description="Sort direction when sort_by is set: asc or desc (defaults to asc).",
    ),
):
    scope_q = (
        db.query(ReviewWorkflow, ReviewWorkflowI18n)
        .outerjoin(
            ReviewWorkflowI18n,
            (ReviewWorkflowI18n.master_id == ReviewWorkflow.workflow_id)
            & (ReviewWorkflowI18n.locale == locale),
        )
        .filter(ReviewWorkflow.dw_id == dw_id)
    )
    if workflow_ids is not None:
        if not workflow_ids:
            return success_response(
                message="Workflows retrieved successfully",
                data=[],
                meta=build_list_pagination_meta(
                    total_count=0,
                    count=0,
                    page=page,
                    page_size=page_size or 0,
                    total_pages=0,
                    total_count_unfiltered=0,
                ),
            )
        scope_q = scope_q.filter(ReviewWorkflow.workflow_id.in_(workflow_ids))
    has_list_filters = (
        is_active is not None
        or allow_review is not None
        or bool(search and search.strip())
    )
    total_count_unfiltered_raw: Optional[int] = (
        scope_q.count() if has_list_filters else None
    )
    q = scope_q
    if is_active is not None:
        q = q.filter(ReviewWorkflow.is_active == is_active)
    if allow_review is not None:
        q = q.filter(ReviewWorkflow.allow_review == allow_review)
    if search and search.strip():
        if search_by and search_by.strip():
            field_key = search_by.strip().lower()
            if field_key not in _WORKFLOW_SEARCH_FIELDS:
                raise BadRequest(
                    f"Invalid search_by field. Allowed: {list(_WORKFLOW_SEARCH_FIELDS)}",
                )
            field = _WORKFLOW_SEARCH_FIELDS[field_key]
            q = q.filter(field.ilike(f"%{search.strip()}%"))
        else:
            q = q.filter(ReviewWorkflowI18n.workflow_name.ilike(f"%{search.strip()}%"))
    total_count = q.count()
    sort_order_norm = (sort_order or "asc").strip().lower()
    if sort_order_norm not in ("asc", "desc"):
        raise BadRequest("sort_order must be 'asc' or 'desc'")
    sort_key = sort_by.strip().lower() if sort_by and sort_by.strip() else None
    if sort_key:
        if sort_key not in _WORKFLOW_SORT_FIELDS:
            raise BadRequest(
                f"Invalid sort_by field. Allowed: {list(_WORKFLOW_SORT_FIELDS)}",
            )
        sort_col = _WORKFLOW_SORT_FIELDS[sort_key]
        sort_dir = desc if sort_order_norm == "desc" else asc
        q = q.order_by(
            sort_dir(sort_col),
            asc(ReviewWorkflow.priority),
            asc(ReviewWorkflow.workflow_id),
        )
    else:
        q = q.order_by(asc(ReviewWorkflow.priority))
    use_pagination = page_size is not None
    if use_pagination:
        q = q.offset((page - 1) * page_size).limit(page_size)
    rows = q.all()
    wf_ids = [wf.workflow_id for wf, _ in rows]
    ds_counts = dataset_service.count_datasets_by_workflow_ids(db, dw_id, wf_ids)
    ip_counts = dataset_service.count_in_progress_datasets_by_workflow_ids(db, dw_id, wf_ids)
    data = [
        _wf_resp(wf, i18n, dataset_count=ds_counts.get(wf.workflow_id, 0),
                 in_progress_dataset_cnt=ip_counts.get(wf.workflow_id, 0))
        for wf, i18n in rows
    ]
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(data),
        page=page,
        page_size=page_size or total_count,
        total_pages=((total_count + page_size - 1) // page_size) if use_pagination and page_size else (1 if total_count else 0),
        total_count_unfiltered=resolve_unfiltered_total(
            total_count,
            total_count_unfiltered_raw,
            has_list_filters=has_list_filters,
        ),
    )
    return success_response(message="Workflows retrieved successfully", data=[d.model_dump(mode='json') for d in data], meta=meta)


@router.post(
    "/{dw_id}/workflow",
    response_model=SuccessResponse[WorkflowCreatedResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a workflow for a datawarehouse",
    description="Create a new workflow scoped to the given dw_id. `workflow_code` must be unique.",
)
def create_workflow(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    payload: WorkflowCreateRequest = Body(...),
    current_user_id: int = Depends(get_current_user_id),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
):
    workflow = ReviewWorkflow(
        workflow_code=payload.workflow_code,
        review_scope_type=payload.review_scope_type,
        priority=payload.priority,
        dw_id=dw_id,
        is_active=payload.is_active,
        is_system=payload.is_system,
        allow_review=payload.allow_review,
        constraint_data_entry=payload.constraint_data_entry,
        review_level_count=payload.review_level_count,
        created=datetime.utcnow(),
        created_user_id=current_user_id,
    )
    db.add(workflow)
    db.flush()
    i18n = ReviewWorkflowI18n(
        master_id=workflow.workflow_id,
        locale=locale,
        workflow_name=payload.workflow_name,
        description=payload.description,
    )
    db.add(i18n)
    db.commit()
    db.refresh(workflow)
    db.refresh(i18n)
    return success_response(
        message="Workflow created successfully",
        data=WorkflowCreatedResponse(
            workflow_id=workflow.workflow_id,
            workflow_code=workflow.workflow_code,
        ).model_dump(mode='json'),
        status_code=status.HTTP_201_CREATED,
    )


@router.get(
    "/{dw_id}/workflow/{workflow_id}",
    response_model=SuccessResponse[WorkflowResponse],
    summary="Get a workflow",
    responses={404: {"model": ErrorResponse}},
)
def get_workflow(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ReviewWorkflow, ReviewWorkflowI18n)
        .outerjoin(
            ReviewWorkflowI18n,
            (ReviewWorkflowI18n.master_id == ReviewWorkflow.workflow_id)
            & (ReviewWorkflowI18n.locale == locale),
        )
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not row:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))
    workflow, i18n = row
    ds_counts = dataset_service.count_datasets_by_workflow_ids(db, dw_id, [workflow_id])
    return success_response(
        message="Workflow retrieved successfully",
        data=_wf_resp(
            workflow,
            i18n,
            dataset_count=ds_counts.get(workflow_id, 0),
        ).model_dump(mode="json"),
    )


@router.patch(
    "/{dw_id}/workflow/{workflow_id}",
    response_model=SuccessResponse,
    summary="Update a workflow",
    description=(
        "Partial update. Response `data` contains only fields present in the request body "
        "(after commit), including i18n fields for the request locale."
    ),
    responses={404: {"model": ErrorResponse}},
)
def patch_workflow(
    payload: WorkflowPatchRequest,
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    current_user_id: int = Depends(get_current_user_id),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
):
    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))

    _i18n_fields = {"workflow_name", "description"}
    patch_dict = payload.model_dump(exclude_unset=True)
    if not patch_dict:
        raise BadRequest("Update payload must contain at least one field")

    level_rows = (
        db.query(ReviewWorkflowLevel)
        .filter(ReviewWorkflowLevel.workflow_id == workflow_id)
        .count()
    )
    if "review_level_count" in patch_dict:
        new_cap = patch_dict["review_level_count"]
        if new_cap is not None and new_cap < level_rows:
            raise BadRequest(
                (
                    f"Cannot set review_level_count to {new_cap} — "
                    f"the workflow currently has {level_rows} level(s). "
                    f"Delete the extra levels first."
                ),
            )

    master_updates = {k: v for k, v in patch_dict.items() if k not in _i18n_fields}
    for field, value in master_updates.items():
        setattr(workflow, field, value)
    workflow.modified = datetime.utcnow()
    workflow.modified_user_id = current_user_id

    if "constraint_data_entry" in patch_dict and not workflow.constraint_data_entry:
        db.query(WorkflowDataentryRule).filter(
            WorkflowDataentryRule.workflow_id == workflow_id,
        ).delete(synchronize_session=False)

    # i18n upsert — only touch fields that were explicitly included in the request
    wf_name_sent = "workflow_name" in patch_dict
    desc_sent = "description" in patch_dict
    existing_i18n = None
    if wf_name_sent or desc_sent:
        existing_i18n = (
            db.query(ReviewWorkflowI18n)
            .filter(ReviewWorkflowI18n.master_id == workflow_id, ReviewWorkflowI18n.locale == locale)
            .first()
        )
        if existing_i18n:
            if wf_name_sent and payload.workflow_name is not None:
                existing_i18n.workflow_name = payload.workflow_name
            if desc_sent:
                existing_i18n.description = payload.description
        elif wf_name_sent and payload.workflow_name is not None:
            # Only create a new i18n row when workflow_name (NOT NULL) is provided
            existing_i18n = ReviewWorkflowI18n(
                master_id=workflow_id,
                locale=locale,
                workflow_name=payload.workflow_name,
                description=payload.description if desc_sent else None,
            )
            db.add(existing_i18n)

    db.commit()
    db.refresh(workflow)
    if existing_i18n:
        db.refresh(existing_i18n)
    i18n_out = existing_i18n
    if i18n_out is None and (_i18n_fields & set(patch_dict)):
        i18n_out = (
            db.query(ReviewWorkflowI18n)
            .filter(ReviewWorkflowI18n.master_id == workflow_id, ReviewWorkflowI18n.locale == locale)
            .first()
        )
    ds_counts = dataset_service.count_datasets_by_workflow_ids(db, dw_id, [workflow_id])
    wf_full = _wf_resp(
        workflow,
        i18n_out,
        dataset_count=ds_counts.get(workflow_id, 0),
    ).model_dump(mode="json")
    response_data = {k: wf_full[k] for k in patch_dict if k in wf_full}
    return success_response(message="Workflow updated successfully", data=response_data)


@router.get(
    "/{dw_id}/workflow/{workflow_id}/association-count",
    response_model=SuccessResponse,
    summary="Association count for a workflow",
    description=(
        "Return association counts for the given workflow. "
        "Call this before DELETE to show the user what will be affected.\n\n"
        "**Response keys:**\n"
        "- `dataset_count` — total datasets referencing this workflow (any status)\n"
        "- `active_dataset_count` — datasets in a non-terminal state (DRAFT / PENDING_REVIEW / REVISION); non-zero means the workflow is still in use\n"
        "- `level_count` — configured review levels\n"
        "- `user_assignment_count` — IAM user-role-content assignments scoped to this workflow"
    ),
    responses={
        404: {"description": "Workflow not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def workflow_association_count(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(..., description="Workflow ID"),
    db: Session = Depends(get_db),
):
    data = dataset_service.get_workflow_association_counts(db, dw_id=dw_id, workflow_id=workflow_id)
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.delete(
    "/{dw_id}/workflow/{workflow_id}",
    response_model=SuccessResponse[dict],
    summary="Delete a workflow",
    description=(
        "If the workflow has no workflow levels, it is removed from the database (hard delete). "
        "Otherwise it is soft-deleted (is_active=False). System workflows cannot be deleted."
    ),
    responses={404: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def delete_workflow(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))
    if workflow.is_system:
        raise Forbidden("Cannot delete a system-managed workflow.")

    level_count = (
        db.query(ReviewWorkflowLevel)
        .filter(ReviewWorkflowLevel.workflow_id == workflow_id)
        .count()
    )
    if level_count == 0:
        if workflow.start_workflow_review_level_id is not None:
            workflow.start_workflow_review_level_id = None
        db.query(ReviewWorkflowI18n).filter(ReviewWorkflowI18n.master_id == workflow_id).delete(
            synchronize_session=False
        )
        db.query(IamUserRoleContent).filter(
            IamUserRoleContent.workflow_id == workflow_id
        ).delete(synchronize_session=False)
        db.delete(workflow)
        db.commit()
        return success_response(message="Workflow deleted successfully", data={"workflow_id": workflow_id})

    db.query(IamUserRoleContent).filter(
        IamUserRoleContent.workflow_id == workflow_id
    ).delete(synchronize_session=False)
    workflow.is_active = False
    workflow.modified = datetime.utcnow()
    workflow.modified_user_id = current_user_id
    db.commit()
    return success_response(message="Workflow deactivated successfully", data={"workflow_id": workflow_id})



# =============================================================================
# workflow_review_level
# =============================================================================

@router.get(
    "/{dw_id}/workflow/{workflow_id}/level",
    response_model=SuccessResponse[List[WorkflowLevelResponse]],
    summary="List workflow levels",
)
def list_levels(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
):
    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))
    rows = (
        db.query(ReviewWorkflowLevel, ReviewWorkflowLevelI18n)
        .outerjoin(
            ReviewWorkflowLevelI18n,
            (ReviewWorkflowLevelI18n.master_id == ReviewWorkflowLevel.workflow_review_level_id)
            & (ReviewWorkflowLevelI18n.locale == locale),
        )
        .filter(ReviewWorkflowLevel.workflow_id == workflow_id)
        .order_by(asc(ReviewWorkflowLevel.level_no))
        .all()
    )
    data = [_lvl_resp(lvl, i18n) for lvl, i18n in rows]
    return success_response(
        message="Workflow levels retrieved successfully",
        data=[d.model_dump(mode='json') for d in data],
        meta={"total_count": len(data), "count": len(data)},
    )


@router.post(
    "/{dw_id}/workflow/{workflow_id}/level",
    response_model=SuccessResponse[List[WorkflowLevelResponse]],
    summary="Upsert workflow levels",
    description=(
        "Create or update one or multiple workflow levels in a single call. "
        "Accepts a single object or an array. Keyed by level_no within the workflow — "
        "if level_no exists it is updated, otherwise a new level is created. "
        "review_level_count on the workflow must be > 0; total active levels cannot exceed it."
    ),
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def upsert_levels(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    payload: Union[List[WorkflowLevelUpsertRequest], WorkflowLevelUpsertRequest] = Body(...),
    current_user_id: int = Depends(get_current_user_id),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
):
    items: List[WorkflowLevelUpsertRequest] = payload if isinstance(payload, list) else [payload]

    upsert_level_nos = [item.level_no for item in items]
    if len(upsert_level_nos) != len(set(upsert_level_nos)):
        raise BadRequest("Duplicate level_no values in request — each level_no must appear only once.")

    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))

    cap = _workflow_review_level_capacity(workflow)
    if cap <= 0:
        raise BadRequest(
            _workflow_t("workflow_err_create_level_rlc_must_be_positive", locale),
        )

    # Capacity check: active levels after this upsert must not exceed cap.
    # Count currently active levels whose level_no is NOT in this batch (they are unaffected).
    active_outside_batch = db.query(ReviewWorkflowLevel).filter(
        ReviewWorkflowLevel.workflow_id == workflow_id,
        ReviewWorkflowLevel.is_active == True,  # noqa: E712
        ReviewWorkflowLevel.level_no.notin_(set(upsert_level_nos)),
    ).count()
    active_in_batch = sum(1 for item in items if item.is_active)
    if active_outside_batch + active_in_batch > cap:
        raise BadRequest(
            _workflow_t("workflow_err_max_active_levels_cap", locale, cap=cap),
        )

    now = datetime.utcnow()
    results: List[WorkflowLevelResponse] = []

    for item in items:
        level = (
            db.query(ReviewWorkflowLevel)
            .filter(
                ReviewWorkflowLevel.workflow_id == workflow_id,
                ReviewWorkflowLevel.level_no == item.level_no,
            )
            .first()
        )

        if level:
            # Update existing
            level.review_scope_type = item.review_scope_type
            level.area_level = item.area_level
            level.classification_parent_nid = item.classification_parent_nid
            level.role_id = item.role_id
            level.include_childs = item.include_childs
            level.is_final_level = item.is_final_level
            level.is_active = item.is_active
        else:
            # Insert new
            level = ReviewWorkflowLevel(
                workflow_id=workflow_id,
                level_no=item.level_no,
                review_scope_type=item.review_scope_type,
                area_level=item.area_level,
                classification_parent_nid=item.classification_parent_nid,
                role_id=item.role_id,
                include_childs=item.include_childs,
                is_final_level=item.is_final_level,
                is_active=item.is_active,
                created=now,
            )
            db.add(level)

        db.flush()

        # i18n upsert for level_name
        i18n = (
            db.query(ReviewWorkflowLevelI18n)
            .filter(
                ReviewWorkflowLevelI18n.master_id == level.workflow_review_level_id,
                ReviewWorkflowLevelI18n.locale == locale,
            )
            .first()
        )
        if item.level_name is not None:
            if i18n:
                i18n.level_name = item.level_name
            else:
                i18n = ReviewWorkflowLevelI18n(
                    master_id=level.workflow_review_level_id,
                    locale=locale,
                    level_name=item.level_name,
                )
                db.add(i18n)
            db.flush()

        results.append(_lvl_resp(level, i18n))

    _sync_start_level(db, workflow)
    v_err = _validate_active_workflow_levels_is_final(db, workflow_id)
    if v_err:
        db.rollback()
        raise BadRequest(v_err)
    workflow.modified = now
    workflow.modified_user_id = current_user_id
    db.commit()

    return success_response(
        message=f"{len(results)} level(s) saved successfully",
        data=[r.model_dump(mode='json') for r in results],
        meta={"total_count": len(results), "count": len(results)},
    )



@router.delete(
    "/{dw_id}/workflow/{workflow_id}/level/{level_id}",
    response_model=SuccessResponse[dict],
    summary="Delete a workflow level",
    description=(
        "Hard-deletes a workflow level and its i18n rows. "
        "Cannot delete while dataset review stages reference this level."
    ),
    responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def delete_level(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    level_id: int = Path(...),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))

    level = (
        db.query(ReviewWorkflowLevel)
        .filter(
            ReviewWorkflowLevel.workflow_review_level_id == level_id,
            ReviewWorkflowLevel.workflow_id == workflow_id,
        )
        .first()
    )
    if not level:
        raise NotFound(f"Level {level_id} not found", identifier=str(level_id))

    stage_count = (
        db.query(DatasetReviewStage).filter(DatasetReviewStage.workflow_review_level_id == level_id).count()
    )
    if stage_count > 0:
        raise Conflict(
            (
                f"Cannot delete level: {stage_count} dataset review stage(s) still reference this level."
            ),
        )

    if workflow.start_workflow_review_level_id == level_id:
        workflow.start_workflow_review_level_id = None

    db.query(ReviewWorkflowLevelI18n).filter(ReviewWorkflowLevelI18n.master_id == level_id).delete()
    db.delete(level)

    db.flush()
    _sync_start_level(db, workflow)
    # v_err = _validate_active_workflow_levels_is_final(db, workflow_id)
    # if v_err:
    #     db.rollback()
    #     return error_response(message=v_err, status_code=status.HTTP_400_BAD_REQUEST)
    workflow.modified = datetime.utcnow()
    workflow.modified_user_id = current_user_id

    db.commit()
    return success_response(message="Level deleted successfully", data={"workflow_review_level_id": level_id})


# =============================================================================
# workflow user-area assignments (iam_user_role_content, workflow-scoped)
# =============================================================================

@router.get(
    "/{dw_id}/workflow/{workflow_id}/user-assignments",
    response_model=SuccessResponse[List[WorkflowUserAssignmentResponse]],
    summary="List workflow user-area assignments",
    description=(
        "Returns iam_user_role_content rows scoped to this workflow. "
        "Filter by role_id or scope_type (AREA / INDICATOR / INDICATOR_CLASSIFICATION / TIMEPERIOD)."
    ),
)
def list_user_assignments(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    db: Session = Depends(get_db),
    role_id: Optional[int] = Query(None, description="Filter by role_id"),
    scope_type: Optional[str] = Query(None, description="Filter by scope_type (AREA, INDICATOR, INDICATOR_CLASSIFICATION, TIMEPERIOD)"),
):
    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))
    q = db.query(IamUserRoleContent).filter(IamUserRoleContent.workflow_id == workflow_id)
    if role_id is not None:
        q = q.filter(IamUserRoleContent.role_id == role_id)
    if scope_type is not None:
        rc = scope_type_to_resource_code(scope_type.upper())
        if not rc:
            raise BadRequest(
                f"Unknown scope_type '{scope_type}'. Valid values: AREA, INDICATOR, INDICATOR_CLASSIFICATION, TIMEPERIOD",
            )
        q = q.filter(IamUserRoleContent.resource_code == rc)
    rows = q.order_by(asc(IamUserRoleContent.id)).all()
    data = []
    for r in rows:
        resp = WorkflowUserAssignmentResponse.model_validate(r)
        resp.scope_type = resource_code_to_scope_type(r.resource_code)
        data.append(resp)
    return success_response(
        message="User assignments retrieved successfully",
        data=[d.model_dump(mode='json') for d in data],
        meta={"total_count": len(data), "count": len(data)},
    )


@router.post(
    "/{dw_id}/workflow/{workflow_id}/user-assignments",
    response_model=SuccessResponse[List[WorkflowUserAssignmentResponse]],
    status_code=status.HTTP_201_CREATED,
    summary="Upsert workflow user-content assignments",
    description=(
        "Assign users to content nodes (area / indicator / classification / timeperiod) within a workflow. "
        "Accepts a single object or an array. "
        "scope_type determines the content dimension and is mapped to resource_code stored in iam_user_role_content: "
        "AREA→dm_dw_area, INDICATOR→dm_dw_indicator, INDICATOR_CLASSIFICATION→dm_dw_indicator_classification, TIMEPERIOD→dm_dw_timeperiod. "
        "Keyed by (user_id, role_id, content_nid, scope_type) — existing rows are refreshed (idempotent); new ones are created. "
        "Each user must already hold the role in iam_user_role for this dw_id. "
        "Optional allow_child_areas (default false): when true and scope_type is AREA, assigns the given area and "
        "every descendant area in the warehouse hierarchy (ignored for non-AREA scope types)."
    ),
    responses={404: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
)
def upsert_user_assignments(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    payload: Union[List[WorkflowUserAssignmentCreateRequest], WorkflowUserAssignmentCreateRequest] = Body(...),
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
    language_code: str = Depends(get_dw_language_code),
    db: Session = Depends(get_db),
):
    items: List[WorkflowUserAssignmentCreateRequest] = payload if isinstance(payload, list) else [payload]

    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))

    dw_filter = (
        IamUserRole.dw_id == None  # noqa: E711
        if workflow.dw_id is None
        else IamUserRole.dw_id == workflow.dw_id
    )

    now = datetime.utcnow()
    results: List[WorkflowUserAssignmentResponse] = []

    for item in items:
        # Derive resource_code from scope_type
        resource_code = scope_type_to_resource_code(item.scope_type)
        if not resource_code:
            raise BadRequest(
                f"Unknown scope_type '{item.scope_type}'.",
            )

        # Validate role exists
        role = db.query(IamRole).filter(IamRole.id == item.role_id).first()
        if not role:
            raise NotFound(f"Role {item.role_id} not found", identifier=str(item.role_id))

        # Resolve user_role_id — user must already have this role for this dw_id
        user_role = db.query(IamUserRole).filter(
            IamUserRole.user_id == item.user_id,
            IamUserRole.role_id == item.role_id,
            IamUserRole.app_key == app_key,
            dw_filter,
        ).first()
        if not user_role:
            raise BadRequest(
                f"User {item.user_id} does not have role {item.role_id} for this datawarehouse. Assign the role first.",
            )

        if item.scope_type == "AREA" and item.allow_child_areas:
            content_nids = sorted(
                dataset_service.expand_descendant_area_nids(dw_id, language_code, [item.content_nid])
            )
        else:
            content_nids = [item.content_nid]

        # Upsert: natural key = (workflow_id, user_id, role_id, content_nid, resource_code)
        for cnid in content_nids:
            existing = db.query(IamUserRoleContent).filter(
                IamUserRoleContent.workflow_id == workflow_id,
                IamUserRoleContent.user_id == item.user_id,
                IamUserRoleContent.role_id == item.role_id,
                IamUserRoleContent.content_id == cnid,
                IamUserRoleContent.resource_code == resource_code,
            ).first()

            if existing:
                existing.user_role_id = user_role.id  # re-sync in case role row was recreated
                assignment = existing
            else:
                assignment = IamUserRoleContent(
                    user_role_id=user_role.id,
                    resource_code=resource_code,
                    content_id=cnid,
                    workflow_id=workflow_id,
                    user_id=item.user_id,
                    role_id=item.role_id,
                    created=now,
                    created_user_id=current_user_id,
                )
                db.add(assignment)

            db.flush()
            resp = WorkflowUserAssignmentResponse.model_validate(assignment)
            resp.scope_type = resource_code_to_scope_type(assignment.resource_code)
            results.append(resp)

    db.commit()
    return success_response(
        message="User assignments saved successfully",
        data=[r.model_dump(mode='json') for r in results],
        meta={"total_count": len(results), "count": len(results)},
        status_code=status.HTTP_201_CREATED,
    )


@router.delete(
    "/{dw_id}/workflow/{workflow_id}/user-assignments/{assignment_id}",
    response_model=SuccessResponse[dict],
    summary="Delete a workflow user-area assignment",
    responses={404: {"model": ErrorResponse}},
)
def delete_user_assignment(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(...),
    assignment_id: int = Path(...),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(IamUserRoleContent)
        .filter(
            IamUserRoleContent.id == assignment_id,
            IamUserRoleContent.workflow_id == workflow_id,
        )
        .first()
    )
    if not assignment:
        raise NotFound(f"Assignment {assignment_id} not found", identifier=str(assignment_id))
    db.delete(assignment)
    db.commit()
    return success_response(message="User assignment deleted successfully", data={"id": assignment_id})


# =============================================================================
# workflow_dataentry_rule
# =============================================================================


def _workflow_dataentry_defaults(workflow_id: int) -> WorkflowDataentryResponse:
    return WorkflowDataentryResponse(
        workflow_id=workflow_id,
        dataentry_rule_id=None,
        scope_timeperiod="SINGLE",
        scope_indicator="SINGLE",
        scope_area="SINGLE",
        timeperiod_frequency=None,
        curr_timeperiod_nid=None,
        area_level=None,
        allow_child_areas=True,
        show_previous_time=False,
        role_id=None,
        created=None,
        created_user_id=None,
        modified=None,
        modified_user_id=None,
    )


def _workflow_dataentry_from_rule(workflow_id: int, rule: WorkflowDataentryRule) -> WorkflowDataentryResponse:
    return WorkflowDataentryResponse(
        workflow_id=workflow_id,
        dataentry_rule_id=rule.dataentry_rule_id,
        scope_timeperiod=rule.scope_timeperiod,
        scope_indicator=rule.scope_indicator,
        scope_area=rule.scope_area,
        timeperiod_frequency=rule.timeperiod_frequency,
        curr_timeperiod_nid=rule.curr_timeperiod_nid,
        area_level=rule.area_level,
        allow_child_areas=rule.allow_child_areas,
        show_previous_time=rule.show_previous_time,
        role_id=rule.role_id,
        created=rule.created,
        created_user_id=rule.created_user_id,
        modified=rule.modified,
        modified_user_id=rule.modified_user_id,
    )


@router.get(
    "/{dw_id}/workflow/{workflow_id}/dataentry",
    response_model=SuccessResponse[WorkflowDataentryResponse],
    summary="Get workflow data-entry configuration",
    description=(
        "Returns `workflow_dataentry_rule` fields when the workflow has "
        "`constraint_data_entry=true` and a rule row exists; otherwise default scope/frequency "
        "values with `dataentry_rule_id` null. "
        "Use workflow GET/PATCH for `constraint_data_entry`. "
        "Pass `include_workflow=true` to include the workflow master in `meta.workflow`."
    ),
    responses={404: {"model": ErrorResponse}},
)
def get_workflow_dataentry(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(..., description="Workflow primary key"),
    include_workflow: bool = Query(
        False,
        description="If true, include full workflow details (same shape as GET /workflow/{workflow_id}) under meta.workflow.",
    ),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
):
    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))
    meta = None
    if include_workflow:
        i18n_row = (
            db.query(ReviewWorkflowI18n)
            .filter(
                ReviewWorkflowI18n.master_id == workflow_id,
                ReviewWorkflowI18n.locale == locale,
            )
            .first()
        )
        ds_counts = dataset_service.count_datasets_by_workflow_ids(db, dw_id, [workflow_id])
        meta = {
            "workflow": _wf_resp(
                workflow,
                i18n_row,
                dataset_count=ds_counts.get(workflow_id, 0),
            ).model_dump(mode="json"),
        }

    if not workflow.constraint_data_entry:
        data = _workflow_dataentry_defaults(workflow_id)
        return success_response(
            message="Workflow data-entry configuration retrieved successfully",
            data=data.model_dump(mode="json"),
            meta=meta,
        )

    rule = (
        db.query(WorkflowDataentryRule)
        .filter(WorkflowDataentryRule.workflow_id == workflow_id)
        .first()
    )
    if rule:
        data = _workflow_dataentry_from_rule(workflow_id, rule)
    else:
        data = _workflow_dataentry_defaults(workflow_id)
    return success_response(
        message="Workflow data-entry configuration retrieved successfully",
        data=data.model_dump(mode="json"),
        meta=meta,
    )


@router.put(
    "/{dw_id}/workflow/{workflow_id}/dataentry",
    response_model=SuccessResponse[WorkflowDataentryResponse],
    summary="Upsert workflow data-entry configuration",
    description=(
        "Creates or updates the single `workflow_dataentry_rule` row. "
        "Requires `constraint_data_entry=true` on the workflow (set via PATCH /workflow/{workflow_id}). "
        "`area_level` is required in the body; `curr_timeperiod_nid` and `role_id` are optional and when present must resolve to valid warehouse / IAM records. "
        "When an existing rule's `area_level` changes, all workflow-scoped `iam_user_role_content` rows "
        "with `resource_code=dm_dw_area` whose area is not at that level (including orphan content ids) "
        "are removed. The warehouse must be reachable; otherwise the save fails with 503. "
        "Disabling constraints removes the rule via workflow PATCH."
    ),
    responses={
        404: {"model": ErrorResponse},
        400: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def upsert_workflow_dataentry(
    payload: WorkflowDataentryUpsertRequest = Body(...),
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(..., description="Workflow primary key"),
    current_user_id: int = Depends(get_current_user_id),
    language_code: str = Depends(get_dw_language_code),
    db: Session = Depends(get_db),
):
    workflow = (
        db.query(ReviewWorkflow)
        .filter(ReviewWorkflow.workflow_id == workflow_id, ReviewWorkflow.dw_id == dw_id)
        .first()
    )
    if not workflow:
        raise NotFound(f"Workflow {workflow_id} not found", identifier=str(workflow_id))

    if not workflow.constraint_data_entry:
        raise BadRequest(
            "Enable data-entry constraints on the workflow (PATCH constraint_data_entry=true) before saving the data-entry rule.",
        )

    if payload.role_id is not None:
        role = db.query(IamRole).filter(IamRole.id == payload.role_id).first()
        if not role:
            raise NotFound(f"IAM role {payload.role_id} not found", identifier=str(payload.role_id))

    workflow.modified = datetime.utcnow()
    workflow.modified_user_id = current_user_id

    rule = (
        db.query(WorkflowDataentryRule)
        .filter(WorkflowDataentryRule.workflow_id == workflow_id)
        .first()
    )
    had_existing_rule = rule is not None
    prior_area_level = rule.area_level if rule else None
    now = datetime.utcnow()
    if rule is None:
        rule = WorkflowDataentryRule(
            workflow_id=workflow_id,
            scope_timeperiod=payload.scope_timeperiod,
            scope_indicator=payload.scope_indicator,
            scope_area=payload.scope_area,
            timeperiod_frequency=payload.timeperiod_frequency,
            curr_timeperiod_nid=payload.curr_timeperiod_nid,
            area_level=payload.area_level,
            allow_child_areas=payload.allow_child_areas,
            show_previous_time=payload.show_previous_time,
            role_id=payload.role_id,
            created=now,
            created_user_id=current_user_id,
        )
        db.add(rule)
    else:
        rule.scope_timeperiod = payload.scope_timeperiod
        rule.scope_indicator = payload.scope_indicator
        rule.scope_area = payload.scope_area
        rule.timeperiod_frequency = payload.timeperiod_frequency
        rule.curr_timeperiod_nid = payload.curr_timeperiod_nid
        rule.area_level = payload.area_level
        rule.allow_child_areas = payload.allow_child_areas
        rule.show_previous_time = payload.show_previous_time
        rule.role_id = payload.role_id
        rule.modified = now
        rule.modified_user_id = current_user_id

    if had_existing_rule and prior_area_level != payload.area_level:
        dataset_service.delete_workflow_area_assignments_wrong_level(
            db, dw_id, language_code, workflow_id, payload.area_level
        )

    db.commit()
    db.refresh(workflow)
    db.refresh(rule)
    data = _workflow_dataentry_from_rule(workflow_id, rule)
    return success_response(
        message="Workflow data-entry configuration saved successfully",
        data=data.model_dump(mode="json"),
    )


# =============================================================================
# Dataset — operator endpoints (dm_dw_data_entry resource)
# Status transitions (SUBMITTED / CANCELLED) go through PATCH /{id}.
# The `status` field in the body drives all implicit side-effects.
# =============================================================================


@router.get(
    "/{dw_id}/dataset/workflow/{workflow_id}",
    response_model=SuccessResponse[WorkflowDataentryResponse],
    summary="Get workflow data-entry configuration (operator)",
    description=(
        "Operator-accessible mirror of GET /workflow/{workflow_id}/dataentry. "
        "Returns the same workflow_dataentry_rule fields but is registered under the "
        "dm_dw_data_entry resource (AUTHENTICATED), so data entry operators and reviewers "
        "can read the configuration without needing dm_dw_workflow / PERMISSION. "
        "Pass `include_workflow=true` to include the workflow master under meta.workflow."
    ),
    responses={404: {"model": ErrorResponse}},
)
def get_dataset_workflow_dataentry(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: int = Path(..., description="Workflow primary key"),
    include_workflow: bool = Query(
        False,
        description="If true, include full workflow details under meta.workflow.",
    ),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
):
    return get_workflow_dataentry(
        dw_id=dw_id,
        workflow_id=workflow_id,
        include_workflow=include_workflow,
        locale=locale,
        db=db,
    )


# =============================================================================
# Dataset — operator endpoints continued
# =============================================================================

@router.get(
    "/{dw_id}/dataset",
    response_model=SuccessResponse[DatasetListResponse],
    summary="List datasets",
    description=(
        "Returns datasets for the given DW. By default, only datasets created by the "
        "calling operator are returned. Optional filters: workflow_id, status, area_nid, period_id.\n\n"
        "**status=PENDING_REVIEW** — returns pending datasets in **workflow_id** whose current review "
        "stage is ACTIVE and the caller overlaps a slice on that stage in ACTIVE, APPROVED, or "
        "REVISION_REQUESTED (same visibility rules as GET /dataset/review — includes APPROVED slices "
        "after all datapoints are approved, until the stage APPROVED decision is submitted). "
        "`workflow_id` is required for this mode.\n\n"
        "**Any other status or no status** — results are limited to the caller's datasets; "
        "`workflow_id` and `status` further narrow the list.\n\n"
        "Each item includes **`stages`**, an ordered array of workflow review stages for that dataset "
        "(`dataset_review_stage`): `stage_id`, `workflow_review_level_id`, `level_no`, **`stage_status`** "
        "(`PENDING`, `ACTIVE`, `COMPLETED`, or `SKIPPED`), and **`approved_by_username`** (login name of the "
        "reviewer who completed that stage, or null). "
        "Dataset-level audit fields use **`created_username`**, **`returned_by_username`**, and **`approved_by_username`** "
        "(resolved from `iam_user`; null when unset or missing). "
        "Empty `stages` until the dataset has entered review.\n\n"
        "Optional **search** — case-insensitive partial match. **search_by** — column to match: "
        "`dataset_name` (default) or `dataset_gid`. "
        "**sort_field** — `dataset_name`, `created_on` (DB `created`), or `updated_on` (DB `last_updated_at`); "
        "default `created_on`. **sort_order** — `asc` or `desc`; default `desc`."
    ),
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def list_datasets(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: Optional[int] = Query(None, description="Filter by workflow (required when status=PENDING_REVIEW)"),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description=(
            "Dataset status. PENDING_REVIEW lists pending datasets the caller may review at the current stage. "
            "Other values filter the caller's datasets only."
        ),
    ),
    area_nid: Optional[int] = Query(None, description="Filter by area/prefecture"),
    period_id: Optional[int] = Query(None, description="Filter by entry period"),
    search: Optional[str] = Query(
        None,
        description="Case-insensitive partial match; column chosen by search_by (default dataset_name).",
    ),
    search_by: Optional[str] = Query(
        None,
        description="Field to search when `search` is set: dataset_name (default) or dataset_gid.",
    ),
    sort_field: Optional[str] = Query(
        None,
        description="Sort by: dataset_name, created_on (row created), updated_on (last_updated_at). Default: created_on.",
    ),
    sort_order: Optional[str] = Query(
        None,
        description="asc or desc. Default: desc.",
    ),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    is_super: bool = Depends(get_is_super_admin),
):
    if sort_order is not None and sort_order.strip():
        lo = sort_order.strip().lower()
        if lo not in ("asc", "desc"):
            raise BadRequest("sort_order must be 'asc' or 'desc'.")
    effective_sort_order = (
        sort_order.strip().lower()
        if sort_order and sort_order.strip()
        else "desc"
    )
    try:
        result = dataset_service.list_datasets(
            db, dw_id=dw_id, user_id=current_user_id, locale=locale,
            workflow_id=workflow_id, status_filter=status_filter,
            area_nid=area_nid, period_id=period_id,
            search=search,
            search_by=search_by,
            sort_field=sort_field,
            sort_order=effective_sort_order,
            is_super_admin=is_super,
        )
    except ValueError as e:
        code = str(e)
        if code == "WORKFLOW_REQUIRED_FOR_PENDING_REVIEW_LIST":
            raise BadRequest(
                "workflow_id is required when listing datasets with status=PENDING_REVIEW.",
            )
        if code == "INVALID_DATASET_LIST_SORT_FIELD":
            raise BadRequest(
                "sort_field must be one of: dataset_name, created_on, updated_on.",
            )
        if code == "INVALID_DATASET_LIST_SEARCH_FIELD":
            raise BadRequest(
                "search_by must be one of: dataset_name, dataset_gid.",
            )
        raise
    return success_response(
        message="Datasets retrieved successfully.",
        data=result.model_dump(),
    )


@router.post(
    "/{dw_id}/dataset",
    response_model=SuccessResponse[DatasetCreateResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create dataset draft",
    description=(
        "Creates a new DRAFT dataset for the calling operator. `workflow_id` and `dataset_name` are required.\n\n"
        "**Scope — choose one mode:**\n"
        "- **Legacy:** non-empty `indicator_nids` plus optional `unit_nids`, `subgroup_val_nids`. "
        "IUS rows are all `ut_indicator_unit_subgroup` rows matching that Cartesian filter.\n"
        "- **IUS list:** non-empty `ius_nids` only (do not send non-empty `indicator_nids` / `unit_nids` / "
        "`subgroup_val_nids` in the same request). Distinct indicator/unit/subgroup NIDs are derived and stored.\n\n"
        "`area_nids` is always required (non-empty). Optional: `timeperiod_nids`, `source_nids` "
        "(arrays of positive integers or omitted).\n\n"
        "When `area_nids` and `timeperiod_nids` are present, the API seeds `dataset_data_point` rows for the "
        "Cartesian product of resolved IUS rows × areas × time periods × allowed "
        "sources (`source_nids`, or a single NULL-source row if omitted).\n\n"
        "**Response** echoes the same scope fields when present."
    ),
    responses={400: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def create_dataset(
    payload: DatasetCreateRequest = Body(...),
    dw_id: int = Path(..., description="Datawarehouse ID"),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.create_dataset(
        db, dw_id=dw_id, user_id=current_user_id, payload=payload, locale=locale,
        is_super_admin=is_super,
    )
    return created_response(
        message="Dataset created successfully.",
        data=result.model_dump(),
    )


@router.get(
    "/{dw_id}/dataset/review",
    response_model=SuccessResponse[ReviewDatasetListResponse],
    summary="List datasets pending reviewer action",
    description=(
        "Reviewer inbox. Datasets across PENDING_REVIEW, APPROVED, and REVISION statuses visible "
        "to the caller. PENDING_REVIEW requires an ACTIVE current stage with at least one slice in "
        "ACTIVE, APPROVED, or REVISION_REQUESTED within the caller's IAM scope. APPROVED/REVISION "
        "datasets are shown when the caller has any IAM assignment for the dataset's workflow. "
        "``data_point_count`` and ``missing_data_count`` are scoped to the caller's review "
        "visibility (not the whole dataset). "
        "Filters: workflow_id, area_nid, period_id, status, search, search_by, sort_field, sort_order."
    ),
    responses={404: {"model": ErrorResponse}},
)
def list_review_datasets(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    workflow_id: Optional[int] = Query(None, description="Filter by workflow"),
    period_id: Optional[int] = Query(None, description="Filter by entry period"),
    area_nid: Optional[int] = Query(None, description="Filter by area/prefecture"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by dataset status"),
    search: Optional[str] = Query(None, description="Case-insensitive partial match; column chosen by search_by (default dataset_name)."),
    search_by: Optional[str] = Query(None, description="Field to search when search is set: dataset_name (default) or dataset_gid."),
    sort_field: Optional[str] = Query(None, description="Sort by: dataset_name, created_on, updated_on. Default: created_on."),
    sort_order: str = Query("desc", description="asc or desc. Default: desc."),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.list_review_datasets(
        db, dw_id=dw_id, user_id=current_user_id, locale=locale,
        workflow_id=workflow_id, status_filter=status_filter,
        area_nid=area_nid, period_id=period_id,
        search=search, search_by=search_by,
        sort_field=sort_field, sort_order=sort_order,
        is_super_admin=is_super,
    )
    return success_response(
        message="Review datasets retrieved successfully.",
        data=result.model_dump(),
    )


@router.get(
    "/{dw_id}/dataset/review-rejection-reasons",
    response_model=SuccessResponse[List[RejectionReasonResponse]],
    summary="List rejection reasons",
    description=(
        "Returns all active predefined rejection reasons with text resolved for the "
        "caller's locale (falls back to English). Used to populate the reviewer's "
        "reason dropdown in RETURNED and REJECTED decisions."
    ),
)
def list_rejection_reasons(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
):
    _ = dw_id  # Endpoint is DW-shaped for API consistency; reasons are currently global.
    result = dataset_service.list_rejection_reasons(db, locale=locale)
    return success_response(
        message="Rejection reasons retrieved successfully.",
        data=[item.model_dump() for item in result],
    )


@router.get(
    "/{dw_id}/dataset/{dataset_id}",
    response_model=SuccessResponse[DatasetDetailResponse],
    summary="Get dataset header",
    description=(
        "Returns dataset header and status, including **stages** (ordered review levels; "
        "same structure as GET /dataset list items). "
        "By default only the operator who created the dataset may access it. "
        "Query **status=PENDING_REVIEW** returns the header only when the dataset is pending and "
        "the caller is a current-stage reviewer (same rule as GET .../dataset/review). "
        "Use GET /data-points to retrieve the data point grid."
    ),
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_dataset(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description=(
            "If PENDING_REVIEW, header is returned only for callers who are current-stage reviewers. "
            "Omit or use any other value for creator-only access."
        ),
    ),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.get_dataset(
        db,
        dw_id=dw_id,
        dataset_id=dataset_id,
        user_id=current_user_id,
        locale=locale,
        status_filter=status_filter,
        is_super_admin=is_super,
    )
    return success_response(
        message="Dataset retrieved successfully.",
        data=result.model_dump(),
    )


@router.get(
    "/{dw_id}/dataset/{dataset_id}/comments",
    response_model=SuccessResponse,
    summary="List dataset comments",
    description=(
        "List dataset-level comments (no data point). "
        "Pass data_point_id to list comments for that row only."
    ),
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def list_dataset_comments(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    data_point_id: Optional[int] = Query(
        None,
        description="When set, return only comments for this data point; when omitted, dataset-level only",
    ),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    is_super: bool = Depends(get_is_super_admin),
):
    comments = dataset_service.list_comments(
        db,
        dw_id=dw_id,
        dataset_id=dataset_id,
        user_id=current_user_id,
        data_point_id=data_point_id,
        locale=locale,
        is_super_admin=is_super,
    )
    return success_response(message="Comments retrieved.", data=[c.model_dump() for c in comments])


@router.post(
    "/{dw_id}/dataset/{dataset_id}/comments",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add comment to dataset or data point",
    description=(
        "Add a comment to a dataset (dataset-level) or a specific data point "
        "(set data_point_id). commenter_role is derived from the caller's IAM resource role."
    ),
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def add_dataset_comment(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    payload: DatasetCommentCreateRequest = Body(...),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    is_super: bool = Depends(get_is_super_admin),
):
    # TODO: derive commenter_role from IAM role when role dependency is available.
    # Default to DATAENTRY for all authenticated callers for now.
    commenter_role = "DATAENTRY"
    try:
        comment = dataset_service.add_comment(
            db, dw_id=dw_id, dataset_id=dataset_id, user_id=current_user_id,
            payload=payload, commenter_role=commenter_role, locale=locale,
            is_super_admin=is_super,
        )
        return success_response(message="Comment added.", data=comment.model_dump(), status_code=status.HTTP_201_CREATED)
    except ValueError as e:
        code = str(e)
        if code == "DATASET_NOT_FOUND":
            raise NotFound("Dataset not found.")
        if code == "NOT_AUTHORIZED":
            raise Forbidden("You are not authorized to add comments on this dataset.")
        if code == "DATA_POINT_NOT_FOUND":
            raise NotFound("Data point not found in this dataset.")
        raise BadRequest(str(e))


@router.post(
    "/{dw_id}/dataset/{dataset_id}/scope-check",
    response_model=SuccessResponse,
    summary="Advisory scope diff — no side effects",
    description=(
        "Compute what would change (rows_to_remove, rows_to_add, exclusivity_conflicts) "
        "if the proposed scope were applied to the dataset. Read-only — no data is modified."
    ),
    responses={404: {"model": ErrorResponse}},
)
def dataset_scope_check(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    payload: DatasetOperatorPatchRequest = Body(...),
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.scope_check(
        db, dw_id=dw_id, dataset_id=dataset_id, user_id=current_user_id,
        proposed=payload, is_super_admin=is_super,
    )
    return success_response(message="Scope check complete.", data=result)


# ---------------------------------------------------------------------------
# TEMPORARILY DISABLED — dataset-scoped /data-points endpoints
# Superseded by the unified /dw/{dw_id}/data-points endpoints below.
# Restore by un-commenting when explicit dataset-scoped access is needed again.
# ---------------------------------------------------------------------------
# @router.get(
#     "/{dw_id}/dataset/{dataset_id}/data-points",
#     response_model=SuccessResponse[DataPointListResponse],
#     summary="Read data points for a dataset",
#     description=(
#         "Returns all data points for the dataset in a paginated grid. "
#         "REJECTED rows include reviewer_comment and reject_reason inline. "
#         "Pass include_prev=true to include previous-period comparison values."
#     ),
#     responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
# )
# def get_dataset_data_points(
#     dw_id: int = Path(..., description="Datawarehouse ID"),
#     dataset_id: int = Path(..., description="Dataset ID"),
#     include_prev: bool = Query(False, description="Include previous-period (t-1) comparison values"),
#     review_status: Optional[str] = Query(None, description="Filter by review_status: PENDING, IN_PROGRESS, APPROVED, REJECTED"),
#     db: Session = Depends(get_db),
#     current_user_id: int = Depends(get_current_user_id),
# ):
#     try:
#         result = dataset_service.get_dataset_data_points(
#             db, dw_id=dw_id, dataset_id=dataset_id, user_id=current_user_id,
#             include_prev=include_prev, review_status_filter=review_status,
#         )
#     except ValueError:
#         return not_found_response(f"Dataset identifier {dataset_id} not found.")
#     return success_response(
#         message="Data points retrieved successfully.",
#         data=result.model_dump(),
#     )


# @router.patch(
#     "/{dw_id}/dataset/{dataset_id}/data-points",
#     response_model=SuccessResponse[DataPointUpsertResponse],
#     summary="Add or update data points",
#     description=(
#         "Upserts indicator+area+timeperiod+value rows into the dataset. "
#         "Only allowed when dataset is DRAFT or (PENDING_REVIEW_REVISION and row is_locked=FALSE). "
#         "Match key: (dataset_id + iusnid + area_nid + timeperiod_nid)."
#     ),
#     responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
# )
# def upsert_dataset_data_points(
#     payload: DataPointUpsertRequest = Body(...),
#     dw_id: int = Path(..., description="Datawarehouse ID"),
#     dataset_id: int = Path(..., description="Dataset ID"),
#     current_user_id: int = Depends(get_current_user_id),
#     db: Session = Depends(get_db),
# ):
#     try:
#         result = dataset_service.upsert_data_points(
#             db, dw_id=dw_id, dataset_id=dataset_id, user_id=current_user_id, payload=payload,
#         )
#     except ValueError as e:
#         code = str(e)
#         if code == "DATASET_NOT_FOUND":
#             return not_found_response(f"Dataset identifier {dataset_id} not found.")
#         if code == "DATASET_NOT_EDITABLE":
#             return conflict_response(
#                 "Data points can only be added or edited when dataset is DRAFT or PENDING_REVIEW_REVISION."
#             )
#         if code.startswith("AREA_NOT_ASSIGNED"):
#             area_nid = code.split(":", 1)[1] if ":" in code else "unknown"
#             return forbidden_response(
#                 f"You are not assigned to area {area_nid} in this workflow. "
#                 "You can only enter data for areas assigned to you."
#             )
#         return error_response(f"Could not upsert data points: {code}")
#     return success_response(
#         message="Data points saved successfully.",
#         data=result.model_dump(),
#     )


# @router.delete(
#     "/{dw_id}/dataset/{dataset_id}/data-points",
#     response_model=SuccessResponse[DataPointDeleteResponse],
#     summary="Delete selected data points",
#     description=(
#         "Delete selected data points from a DRAFT, PENDING_REVIEW_REVISION, or PARTIAL_APPROVED dataset.\n\n"
#         "Pass a list of `data_point_ids` in the request body. "
#         "Unlocked rows are deleted; locked rows are silently skipped. "
#         "IDs not found in this dataset are also silently skipped."
#     ),
#     responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
# )
# def delete_dataset_data_points(
#     payload: DataPointDeleteRequest = Body(...),
#     dw_id: int = Path(..., description="Datawarehouse ID"),
#     dataset_id: int = Path(..., description="Dataset ID"),
#     current_user_id: int = Depends(get_current_user_id),
#     db: Session = Depends(get_db),
# ):
#     try:
#         result = dataset_service.delete_data_points(
#             db, dw_id=dw_id, dataset_id=dataset_id, user_id=current_user_id, payload=payload,
#         )
#     except ValueError as e:
#         code = str(e)
#         if code == "DATASET_NOT_FOUND":
#             return not_found_response(f"Dataset identifier {dataset_id} not found.")
#         if code == "DATASET_NOT_EDITABLE":
#             return conflict_response(
#                 "Data points can only be deleted when dataset is DRAFT, PENDING_REVIEW_REVISION, or PARTIAL_APPROVED."
#             )
#         return error_response(f"Could not delete data points: {code}")
#     return success_response(
#         message=result.message,
#         data=result.model_dump(),
#     )


# @router.delete(
#     "/{dw_id}/dataset/{dataset_id}/data-point/{data_point_id}",
#     response_model=SuccessResponse[DataPointDeleteResponse],
#     summary="Delete a single data point",
#     description=(
#         "Delete one data point by ID.\n\n"
#         "**Non-APPROVED dataset** (DRAFT / PENDING_REVIEW_REVISION / PARTIAL_APPROVED): "
#         "removes from `dataset_data_point`. Row must be unlocked.\n\n"
#         "**APPROVED dataset**: removes from `ut_data` (datawarehouse). "
#         "History record in `dataset_data_point` is preserved. "
#         "Authorized for any user with `dm_dw_data_entry` DELETE permission (dataset owner)."
#     ),
#     responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
# )
# def delete_single_dataset_data_point(
#     dw_id: int = Path(..., description="Datawarehouse ID"),
#     dataset_id: int = Path(..., description="Dataset ID"),
#     data_point_id: int = Path(..., description="Data point ID to delete"),
#     current_user_id: int = Depends(get_current_user_id),
#     db: Session = Depends(get_db),
# ):
#     try:
#         result = dataset_service.delete_data_point(
#             db, dw_id=dw_id, dataset_id=dataset_id,
#             data_point_id=data_point_id, user_id=current_user_id,
#         )
#     except ValueError as e:
#         code = str(e)
#         if code == "DATASET_NOT_FOUND":
#             return not_found_response(f"Dataset identifier {dataset_id} not found.")
#         if code == "DATA_POINT_NOT_FOUND":
#             return not_found_response(f"Data point {data_point_id} not found in dataset {dataset_id}.")
#         if code == "DATA_POINT_LOCKED":
#             return conflict_response(
#                 f"Data point {data_point_id} is locked (assigned to an active review slice) and cannot be deleted."
#             )
#         if code == "DATA_POINT_NOT_DELETABLE":
#             return conflict_response(
#                 "Data points cannot be deleted when dataset is SUBMITTED, PENDING_REVIEW, REJECTED, or CANCELLED."
#             )
#         if code == "UT_DATA_DELETE_FAILED":
#             return error_response("Failed to delete data from the datawarehouse. Please try again or contact support.")
#         return error_response(f"Could not delete data point: {code}")
#     return success_response(
#         message=result.message,
#         data=result.model_dump(),
#     )
# ---------------------------------------------------------------------------


@router.patch(
    "/{dw_id}/dataset/{dataset_id}",
    response_model=SuccessResponse[DatasetTransitionResponse],
    summary="Operator dataset update or status transition",
    description=(
        "Single endpoint for operator updates while the dataset is **DRAFT** and for status changes.\n\n"
        "**Field update** (omit `status`): `area_nids` is **required**; also send at least one of "
        "`indicator_nids` or `ius_nids` (send `[]` to clear a stored list). You may change `dataset_name` "
        "and/or optional scope arrays: `unit_nids`, `subgroup_val_nids`, `timeperiod_nids`, `source_nids`. "
        "Only allowed when `dataset_status` is `DRAFT`. "
        "Large scope changes may return `seeding_async: true` and `datapoint_readiness: CREATED`; "
        "poll GET dataset until `datapoint_readiness` is `COMPLETED` before opening the data grid.\n\n"
        "**Status transition** (include `status`): `PENDING_REVIEW` — submit or resubmit the "
        "dataset for review. Scope fields in the same body are ignored; update scope in a "
        "separate PATCH without `status`.\n\n"
        "**Allowed transitions:**\n"
        "- `PENDING_REVIEW` from `DRAFT` — initial submit: runs exclusivity check, creates review stages/slices, notifies reviewers.\n"
        "- `PENDING_REVIEW` from `REVISION` — resubmit: re-locks corrected rows, resets REVISION_REQUESTED slices to ACTIVE, notifies reviewers."
    ),
    responses={
        400: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def operator_dataset_transition(
    payload: OperatorDatasetPatchRequest = Body(...),
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    try:
        if payload.status:
            # Status transition: SUBMITTED or CANCELLED
            result = dataset_service.operator_transition(
                db,
                dw_id=dw_id,
                dataset_id=dataset_id,
                user_id=current_user_id,
                payload=payload,
                app_key=app_key,
                locale=locale,
                is_super_admin=is_super,
            )
        else:
            # Plain field update (dataset_name, scope NID lists)
            result = dataset_service.update_dataset(
                db,
                dw_id=dw_id,
                dataset_id=dataset_id,
                user_id=current_user_id,
                payload=payload,
                locale=locale,
                is_super_admin=is_super,
            )
    except ValueError as e:
        code = str(e)
        if code == "DATAPOINT_POPULATION_IN_PROGRESS":
            raise Conflict(
                "Data points are still being populated for this dataset. "
                "Wait until datapoint_readiness is COMPLETED before changing scope.",
                error_code="DATAPOINT_POPULATION_IN_PROGRESS",
            )
        raise
    return success_response(
        message=result.message,
        data=result.model_dump(),
    )


@router.get(
    "/{dw_id}/dataset/{dataset_id}/association-count",
    response_model=SuccessResponse,
    summary="Association count for a dataset",
    description=(
        "Return association counts for the given dataset. "
        "Call this before DELETE to show the user what will be removed.\n\n"
        "**Response keys:**\n"
        "- `data_point_count` — data points in this dataset\n"
        "- `review_stage_count` — review stages created for this dataset\n"
        "- `review_slice_count` — review slices created for this dataset\n"
        "- `action_log_count` — action log entries recorded for this dataset"
    ),
    responses={
        403: {"description": "Not authorized", "model": ErrorResponse},
        404: {"description": "Dataset not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def dataset_association_count(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    is_super: bool = Depends(get_is_super_admin),
):
    data = dataset_service.get_dataset_association_counts(
        db,
        dw_id=dw_id,
        dataset_id=dataset_id,
        user_id=current_user_id,
        locale=locale,
        is_super_admin=is_super,
    )
    return success_response(
        message="Association counts retrieved successfully",
        data=data,
    )


@router.delete(
    "/{dw_id}/dataset/{dataset_id}",
    response_model=SuccessResponse[DatasetDeleteResponse],
    summary="Delete a dataset",
    description=(
        "Permanently deletes a DRAFT dataset and all its data points. "
        "Only allowed when dataset_status is DRAFT and the caller is the dataset owner."
    ),
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def delete_dataset(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.delete_dataset(
        db, dw_id=dw_id, dataset_id=dataset_id, user_id=current_user_id,
        is_super_admin=is_super,
    )
    return success_response(
        message=result.message,
        data=result.model_dump(),
    )


# =============================================================================
# Data review — reviewer endpoints (dm_dw_data_review resource)
# All decisions go through POST /{dataset_id}/review.
# Body uses `approved` and `rejected` lists (see POST description).
# =============================================================================

@router.get(
    "/{dw_id}/dataset/{dataset_id}/review",
    response_model=SuccessResponse[ReviewGridResponse],
    summary="Get unified review grid for a dataset",
    description=(
        "Returns all data points across all slices the reviewer is responsible for — "
        "unified single grid. Includes: submitted value, prev-period value (t-1), Δ%, "
        "operator note, current review_status. "
        "Reviewer sees data from all their areas/classifications in one flat grid."
    ),
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_review_dataset(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    db: Session = Depends(get_db),
    locale: str = Depends(get_core_locale),
    current_user_id: int = Depends(get_current_user_id),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.get_review_grid(
        db, dw_id=dw_id, dataset_id=dataset_id, user_id=current_user_id, locale=locale,
        is_super_admin=is_super,
    )
    return success_response(
        message="Review grid retrieved successfully.",
        data=result.model_dump(),
    )


@router.post(
    "/{dw_id}/dataset/{dataset_id}/review",
    response_model=SuccessResponse[ReviewerDecisionResponse],
    summary="Reviewer decision",
    description=(
        "Batch reviewer decision for data points in the caller's active review scope.\n\n"
        "- `approved`: objects `{ data_point_id, comment? }` — sets each row to APPROVED; "
        "non-empty `comment` is stored in `dataset_comment` (DATAREVIEW).\n"
        "- `rejected`: objects `{ data_point_id, comment, reject_reason_id? }` — sets each row to "
        "REJECTED (return for correction), saves `comment` to `dataset_comment`; "
        "`reject_reason_id` is optional.\n"
        "- `status` (optional): set to `REVISION` (case-insensitive, e.g. `revision`) to move `dataset_status` "
        "to REVISION when at least one non-superseded row is REJECTED (same request as rejections, or a "
        "follow-up with empty `approved`/`rejected`). Without `status: REVISION`, rejected rows are recorded but the "
        "dataset stays `PENDING_REVIEW`.\n"
        "- `status` (optional): set to `APPROVED` (case-insensitive) to **complete the active review stage** once "
        "every slice at that stage is fully approved (all data points APPROVED). This may activate the next stage "
        "or, on the final level, mark the dataset `APPROVED` and write rows to `ut_data`. "
        "Send as a follow-up with empty `approved`/`rejected`, or together with your last approval batch. "
        "The dataset does **not** advance automatically when the last data point is approved.\n\n"
        "A `data_point_id` must not appear in both lists. Provide at least one of: non-empty `approved`, "
        "non-empty `rejected`, `status: REVISION`, or `status: APPROVED`.\n\n"
        "`status: APPROVED` must not be combined with rows in `rejected`."
    ),
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def reviewer_dataset_decision(
    payload: ReviewerDecisionRequest = Body(...),
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    try:
        result = dataset_service.reviewer_decision(
            db,
            dw_id=dw_id,
            dataset_id=dataset_id,
            user_id=current_user_id,
            payload=payload,
            app_key=app_key,
            locale=locale,
            is_super_admin=is_super,
        )
    except ValueError as e:
        code = str(e)
        if code == "DATASET_NOT_FOUND":
            raise NotFound(
                f"Dataset {dataset_id} not found.",
                identifier=str(dataset_id),
            )
        if code == "DATASET_NOT_REVIEWABLE":
            raise Conflict("Dataset is not in a reviewable state.")
        if code == "NOT_AUTHORIZED":
            raise Forbidden("No active review slice found for your area scope.")
        if code == "INVALID_DATA_POINT":
            raise BadRequest(
                "One or more data_point_ids are not in your review scope.",
                error_code="INVALID_DATA_POINT",
            )
        if code == "REVISION_STATUS_WITHOUT_REJECTED_ROWS":
            raise BadRequest(
                'status "REVISION" requires at least one non-superseded data point with review_status REJECTED.',
            )
        if code == "STAGE_APPROVAL_NOT_READY":
            raise BadRequest(
                'status "APPROVED" requires every data point in the active review stage to be approved first.',
            )
        if code == "UT_DATA_DELETE_FAILED":
            raise BadRequest(
                "Could not remove baseline warehouse data for an approved soft-deleted row.",
                error_code="UT_DATA_DELETE_FAILED",
            )
        raise BadRequest(f"Review decision failed: {code}")
    return success_response(
        message=result.message,
        data=result.model_dump(),
    )


# ===========================================================================
# UNIFIED — FED data-point endpoints (mode-agnostic)
# ===========================================================================

@router.get(
    "/{dw_id}/data-points",
    response_model=SuccessResponse[List[UnifiedDataPointRowSchema]],
    summary="Unified data-points view",
    description=(
        "Returns a merged view of `ut_data` (approved baseline) overlaid with the active dataset's "
        "pending rows.\n\n"
        "**Optional scoping**: **`i_identifier`** (indicator NIDs or GIDs, same as GET `/dw/{dw_id}/data`), "
        "**`area_nid`** (comma-separated area NIDs), and **`timeperiod_nid`** (comma-separated timeperiod NIDs). "
        "Omit any of them to leave that dimension unconstrained. If supplied, values must be non-empty comma-separated "
        "integers for `area_nid` / `timeperiod_nid`; malformed values return **422**.\n\n"
        "When all three are provided, the slice includes **all** IUS (units/subgroups) for the indicator(s) at the given "
        "areas and time periods — optional **`iusnid`**, **`u_identifier`**, **`sg_identifier`**, or **`ius_identifier`** "
        "narrow the set (same semantics as GET `/dw/{dw_id}/data`).\n\n"
        "**Response shape** (same style as GET /dw/{dw_id}/data): **`data`** is the list of rows; "
        "**`meta`** holds `dataset_id`, `dataset_status`, counts (`count`, `total_count`, `pending_count`, "
        "`approved_count`, `new_count`, `rejected_count`). "
        "`count` is the total number of data points in the scoped merged view **before** applying the "
        "`review_status` filter (and before text search); on unscoped whole-`ut_data` browse it is the full "
        "`ut_data` row count. **`total_count`** is the row count after `review_status` and optional `search` "
        "(pagination applies to that filtered set; page row count is `len(data)`, not `meta.count`). "
        "Breakdown counts (`pending_count`, `approved_count`, `rejected_count`, `new_count`) summarize the "
        "full scoped merge only; they are **not** narrowed by the `review_status` query param or by text search. "
        "Echoed filter lists include `iusnid_filter`, `area_nid_filter`, `timeperiod_nid_filter`, and related fields. "
        "When the active dataset's workflow has `show_previous_time=true` "
        "and the dataset's scope contains exactly one timeperiod with a known predecessor, "
        "`meta.prev_timeperiod_nid` carries that predecessor NID (otherwise null).\n\n"
        "**Mode A** (review not operational: `allow_review=false` or `review_level_count` is 0): "
        "`dataset_id` absent — reads directly from `ut_data`.\n\n"
        "**Mode B/C** (operational review: `allow_review=true` and `review_level_count` > 0): pass `dataset_id` "
        "to read from `dataset_data_point`. "
        "Omit to return only the `ut_data` baseline.\n\n"
        "**Additional scoping** (optional): comma-separated **`iusnid`**, and/or other identifier "
        "filters as GET `/dw/{dw_id}/data`: **`u_identifier`**, **`sg_identifier`**, **`ar_identifier`**, "
        "**`tp_nid`**, **`tp_timeperiod`**, **`ius_identifier`**, **`src_identifier`**. "
        "When **`dataset_id`** is set, **`src_identifier`** narrows rows to that source within the "
        "dataset (it does not replace dataset scoping or load warehouse-wide source rows).\n\n"
        "**Response rows** use the same DATA column aliases as GET `/dw/{dw_id}/data` "
        "(e.g. `dt_nid`, `ius_nid`, `i_nid`, `dt_value`, `i_name`) when `ADAPTATION` is not `internal`, "
        "plus workflow fields: `data_point_id`, `dataset_id`, `approved_value`, `source`, etc. "
        "For pending/new overlay rows, **`prev_timeperiod_nid`**, **`prev_tmprd_data_value`**, and **`prev_tmprd_textual_data_value`** "
        "echo `dataset_data_point` (null for approved-only rows).\n\n"
        "**Text search** (`search`, `search_by`): substring match, case-insensitive. "
        "`search_by` must be one of **`indicator_unit`** (default when `search` is set), **`subgroup`**, **`area`** — "
        "respectively matches indicator name or unit name together, subgroup value name, or area name / area id. "
        "When no other scope filters are provided, **`dataset_id` is required** for text search (dataset-bounded: "
        "filters pending rows for that dataset). Without `dataset_id` or scope filters, text search returns **422**. "
        "`meta.total_count` is computed after `review_status` and text search; `meta.count` is not.\n\n"
        "**Sort** (`sort_field`, `sort_order` default `asc`): `indicator_name`, `unit_name`, `subgroup`, or `area` "
        "(locale-aware display strings from the warehouse). With **`dataset_id`**, large datasets sort all matching "
        "rows by display name (warehouse lookup) before pagination; zero-pending datasets use saved JSON scope plus "
        "in-memory sort. **`review_status`** narrows rows only when that query param is explicitly provided — "
        "otherwise all statuses in the dataset are included. **`sort_field` is not supported** on unscoped whole-`ut_data` "
        "browse (no `dataset_id`, no scope filters, no pending rows); use **`dataset_id`** or narrowing filters first — "
        "otherwise **422**."
    ),
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def unified_get_data_points(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: Optional[int] = Query(None, description="Dataset ID (Mode 2/3 only; omit for Mode 1)"),
    # ── unified-specific direct-NID filters ──────────────────────────────────
    iusnid: Optional[str] = Query(None, description="Comma-separated IUS nids to filter"),
    area_nid: Optional[str] = Query(
        None,
        description="Comma-separated area NIDs to filter (optional)",
    ),
    timeperiod_nid: Optional[str] = Query(
        None,
        description="Comma-separated timeperiod NIDs to filter (optional)",
    ),
    review_status: Optional[DataPointReviewStatusLiteral] = Query(
        None,
        alias="review_status",
        description="Filter rows by one review status value",
    ),
    # ── same identifier filters as GET /dw/{dw_id}/data ──────────────────────
    i_identifier: Optional[str] = Query(
        None,
        alias=QUERY_I_IDENTIFIER,
        description="Comma-separated indicator NIDs or GIDs (optional)",
    ),
    u_identifier: Optional[str] = Query(None, alias=QUERY_U_IDENTIFIER, description="Comma-separated unit NIDs or GIDs"),
    sg_identifier: Optional[str] = Query(None, alias=QUERY_SG_IDENTIFIER, description="Comma-separated subgroup value NIDs or GIDs"),
    ar_identifier: Optional[str] = Query(None, alias=QUERY_AR_IDENTIFIER, description="Comma-separated area NIDs or area_id values"),
    tp_nid: Optional[list[str]] = Query(None, alias=QUERY_TP_NID, description="Time period NID(s) — repeatable or comma-separated"),
    tp_timeperiod: Optional[list[str]] = Query(None, alias=QUERY_TP_TIMEPERIOD, description="Time period label(s) e.g. 2025 — repeatable"),
    ius_identifier: Optional[str] = Query(None, alias=QUERY_IUS_IDENTIFIER, description="Comma-separated IUS NIDs or i_gid|u_gid|sg_gid values"),
    src_identifier: Optional[str] = Query(
        None,
        alias=QUERY_SRC_IDENTIFIER,
        description=(
            "Comma-separated source (IC) NIDs or GIDs. With dataset_id, narrows within that "
            "dataset; without dataset_id, filters ut_data by source warehouse-wide."
        ),
    ),
    isdefaultenabled: bool = Query(True, alias=QUERY_ISDEFAULTENABLED, description="When only indicator is given: True = default subgroup only; False = all subgroups"),
    # ── meta info flags (same as GET /dw/{dw_id}/data) ───────────────────────
    i_info: bool = Query(False, alias=QUERY_INDICATOR, description="Include indicator metadata in meta.i_info"),
    u_info: bool = Query(False, alias=QUERY_UNIT, description="Include unit metadata in meta.u_info"),
    sv_info: bool = Query(False, alias=QUERY_SUBGROUP, description="Include subgroup value metadata in meta.sv_info"),
    ius_info: bool = Query(False, alias=QUERY_IUS, description="Include IUS metadata in meta.ius_info"),
    ic_info: bool = Query(False, alias=QUERY_IC, description="Include IC metadata in meta.ic_info"),
    tp_info: bool = Query(False, alias=QUERY_TIME_PERIOD, description="Include time period metadata in meta.tp_info"),
    ar_info: bool = Query(False, alias=QUERY_AREA, description="Include area metadata in meta.ar_info"),
    arl_info: bool = Query(False, alias=QUERY_AREA_LEVEL, description="Include area level metadata in meta.arl_info"),
    # ── pagination (same defaults as GET /dw/{dw_id}/data) ───────────────────
    page: int = Query(1, ge=1, alias=QUERY_PAGE, description="Page number (1-based)"),
    page_size: int = Query(100, ge=1, le=1000, alias=QUERY_PAGE_SIZE, description="Number of records per page (max 1000)"),
    search: Optional[str] = Query(
        None,
        alias=QUERY_SEARCH,
        description="Substring search (with search_by); not supported on unscoped whole-table browse",
    ),
    search_by: Optional[str] = Query(
        None,
        alias=QUERY_SEARCH_BY,
        description="indicator_unit (default if search set) | subgroup | area",
    ),
    sort_field: Optional[str] = Query(
        None,
        alias=QUERY_SORT_FIELD,
        description="Sort by display name: indicator_name | unit_name | subgroup | area",
    ),
    sort_order: str = Query(
        "asc",
        alias=QUERY_SORT_ORDER,
        description="asc or desc",
    ),
    export: bool = Query(
        False,
        alias="export",
        description=(
            "Stream all matching data points as XLSX (single part) or a ZIP of multiple XLSX "
            "files when the row count exceeds ~10k per part (disables JSON pagination). "
            "Workers run in parallel for multi-part exports — file order inside the ZIP is "
            "non-deterministic. Narrow with iusnid, area_nid, or timeperiod_nid filters. "
            "Hard cap: DATA_POINTS_SYNC_EXPORT_MAX_ROWS (default 150 000)."
        ),
    ),
    language_code: str = Depends(get_dw_language_code),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    def _parse_ints(s: Optional[str]) -> Optional[list[int]]:
        if not s:
            return None
        try:
            return [int(x.strip()) for x in s.split(",") if x.strip()]
        except ValueError:
            return None

    def _join_list(v: Optional[list[str]]) -> Optional[str]:
        """Convert FastAPI repeated-param list to comma-separated string for service."""
        if not v:
            return None
        return ",".join(v)

    i_identifier_eff = (i_identifier or "").strip() or None

    area_nid_s = (area_nid or "").strip()
    if not area_nid_s:
        area_nids_parsed = None
    else:
        area_nids_parsed = _parse_ints(area_nid_s)
        if area_nids_parsed is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="area_nid must be comma-separated integers.",
            )
        if len(area_nids_parsed) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="area_nid must contain at least one area NID when provided.",
            )

    timeperiod_nid_s = (timeperiod_nid or "").strip()
    if not timeperiod_nid_s:
        timeperiod_nids_parsed = None
    else:
        timeperiod_nids_parsed = _parse_ints(timeperiod_nid_s)
        if timeperiod_nids_parsed is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="timeperiod_nid must be comma-separated integers.",
            )
        if len(timeperiod_nids_parsed) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="timeperiod_nid must contain at least one timeperiod NID when provided.",
            )

    search_by_s = (search_by or "").strip().lower() if search_by else ""
    if search_by_s and search_by_s not in UNIFIED_DATAPOINT_SEARCH_BY_VALUES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"search_by must be one of: {', '.join(UNIFIED_DATAPOINT_SEARCH_BY_VALUES)}."
            ),
        )
    sort_field_s = (sort_field or "").strip().lower() if sort_field else ""
    if sort_field_s and sort_field_s not in UNIFIED_DATAPOINT_SORT_FIELDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"sort_field must be one of: {', '.join(UNIFIED_DATAPOINT_SORT_FIELDS)}."
            ),
        )
    sort_order_s = (sort_order or "asc").strip().lower()
    if sort_order_s not in ("asc", "desc"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sort_order must be asc or desc.",
        )

    try:
        if export:
            from concurrent.futures import ThreadPoolExecutor
            from apps.app_db.services.datapoint_export_service import (
                get_export_id_ranges,
                resolve_export_path,
                preflight_app_db,
                preflight_sources,
                preflight_credentials,
            )
            from apps.datawarehouse.utils.xlsx_export_worker import (
                XlsxWorkerArgs,
                make_worker_tmp_path,
            )

            iusnids_parsed = _parse_ints(iusnid)
            review_status_filter_export = review_status if review_status else None
            n_export_cols = len(DATA_POINT_COLUMN_DEFS)

            # --- Fire 3 independent preflight tasks in parallel ---
            # Each helper opens its own DB session, so there is no shared-session
            # conflict.  The ThreadPoolExecutor context manager ensures all threads
            # have completed (or raised) before we read any results.
            with ThreadPoolExecutor(max_workers=3) as tex:
                f_app = tex.submit(
                    preflight_app_db,
                    dataset_id=dataset_id,
                    dw_id=dw_id,
                    review_status_filter=review_status_filter_export,
                    iusnids=iusnids_parsed,
                    area_nids=area_nids_parsed,
                    timeperiod_nids=timeperiod_nids_parsed,
                    language_code=language_code,
                    n_export_cols=n_export_cols,
                )
                f_src   = tex.submit(preflight_sources, dw_id, language_code)
                f_creds = tex.submit(preflight_credentials, dw_id)

            # Collect results — re-raises any exception from the thread
            # (e.g. BadRequest from preflight_app_db if row cap exceeded).
            total_count, preamble_rows = f_app.result()
            source_nid_to_name: dict[int, str] = f_src.result()
            db_display_name: str = f_creds.result()

            # --- Translated column headers (in-memory, trivial) ---
            headers = [translate_header(k, language_code) for k in DATA_POINT_COLUMN_DEFS]

            # --- Determine export path and split ID ranges ---
            # get_export_id_ranges uses the main FastAPI session; safe now that
            # all threads have finished and released their own sessions.
            export_path = resolve_export_path(dataset_id)
            id_ranges = get_export_id_ranges(
                db,
                dataset_id=dataset_id,
                review_status_filter=review_status_filter_export,
                iusnids=iusnids_parsed,
                area_nids=area_nids_parsed,
                timeperiod_nids=timeperiod_nids_parsed,
                total_count=total_count,
            )

            # --- Build one XlsxWorkerArgs per ID slice ---
            worker_args_list = [
                XlsxWorkerArgs(
                    dw_id=dw_id,
                    locale=language_code,
                    part_index=i,
                    export_path=export_path,
                    dataset_id=dataset_id,
                    review_status_filter=review_status_filter_export,
                    iusnids=iusnids_parsed,
                    area_nids=area_nids_parsed,
                    timeperiod_nids=timeperiod_nids_parsed,
                    start_id=start_id,
                    end_id=end_id,
                    source_nid_to_name=source_nid_to_name,
                    headers=headers,
                    preamble_rows=preamble_rows if i == 0 else None,
                    tmp_file_path=make_worker_tmp_path(i),
                )
                for i, (start_id, end_id) in enumerate(id_ranges)
            ]

            if len(worker_args_list) == 1:
                xlsx_filename = make_export_filename(
                    "DATA_POINTS", db_display_name, extension=".xlsx"
                )
                return StreamingResponse(
                    stream_single_xlsx_file(worker_args_list[0]),
                    media_type=(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    ),
                    headers={
                        "Content-Disposition": f'attachment; filename="{xlsx_filename}"',
                        "Access-Control-Expose-Headers": "Content-Disposition",
                    },
                )

            zip_filename = make_export_filename("DATA_POINTS", db_display_name, extension=".zip")
            return StreamingResponse(
                stream_parallel_xlsx_zip(worker_args_list, zip_filename),
                media_type="application/zip",
                headers={
                    "Content-Disposition": f'attachment; filename="{zip_filename}"',
                    "Access-Control-Expose-Headers": "Content-Disposition",
                },
            )

        items, meta = dataset_service.get_unified_data_points(
            db, dw_id=dw_id, user_id=current_user_id,
            dataset_id=dataset_id,
            iusnids=_parse_ints(iusnid),
            area_nids=area_nids_parsed,
            timeperiod_nids=timeperiod_nids_parsed,
            page=page,
            page_size=page_size,
            locale=language_code,
            i_identifier=i_identifier_eff,
            u_identifier=u_identifier,
            sg_identifier=sg_identifier,
            ar_identifier=ar_identifier,
            tp_nid=_join_list(tp_nid),
            tp_timeperiod=_join_list(tp_timeperiod),
            ius_identifier=ius_identifier,
            src_identifier=src_identifier,
            isdefaultenabled=isdefaultenabled,
            review_status_filter=review_status,
            search=search,
            search_by=search_by,
            sort_field=sort_field,
            sort_order=sort_order_s,
            is_super_admin=is_super,
        )
        svc = DataService()
        with get_warehouse_session_from_id(str(dw_id)) as dw_db:
            row_dicts = [it.to_internal_data_row_dict() for it in items]
            svc._enrich_unified_datapoint_row_dicts(dw_db, language_code, row_dicts)
            # Enrich meta info flags (same as GET /dw/{dw_id}/data)
            if any([i_info, u_info, sv_info, ius_info, ic_info, tp_info, ar_info, arl_info]):
                meta_flags = MetaFlags(
                    i_info=i_info, u_info=u_info, sv_info=sv_info, ius_info=ius_info,
                    ic_info=ic_info, tp_info=tp_info, ar_info=ar_info, arl_info=arl_info,
                )
                meta_extra: dict = {}
                svc._enrich_meta(dw_db, row_dicts, meta_extra, meta_flags, language_code)
                meta_dict = meta.model_dump(mode="json", exclude_none=True)
                meta_dict.update(meta_extra)
            else:
                meta_dict = meta.model_dump(mode="json", exclude_none=True)
        ser_mode = get_serialization_mode()
        data_out = [
            UnifiedDataPointRowSchema.model_validate(r).model_dump(**ser_mode)
            for r in row_dicts
        ]
    except ValueError as e:
        code = str(e)
        if code == "DATASET_NOT_FOUND":
            raise NotFound(f"Dataset {dataset_id} not found.", identifier=str(dataset_id))
        if code == "UNIFIED_DATAPOINT_SEARCH_SORT_UNSCOPED":
            raise UnprocessableEntity(
                "Text search requires dataset_id or narrowing filters (e.g. i_identifier, area_nid, "
                "timeperiod_nid, iusnid). Sort requires narrowing filters — not available on unscoped "
                "whole-table browse.",
            )
        raise BadRequest(f"Could not load unified data points: {code}")
    return success_response(
        message="Unified data points retrieved successfully.",
        data=data_out,
        meta=meta_dict,
    )


@router.patch(
    "/{dw_id}/data-points",
    response_model=SuccessResponse[DataPointUpsertResponse],
    summary="Unified upsert data points",
    description=(
        "Add or update data points, and/or soft-delete / restore rows. **`dataset_id`** is required. "
        "Provide at least one of: non-empty **`data_points`**, **`deleted`**, or **`restore`**.\n\n"
        "**Rows** (`data_points`):\n\n"
        "- **With `data_point_id`:** minimal edit — `dt_value` (or legacy `data_value` / `textual_data_value`), "
        "optional **`footnote`** (only; not `fn_nid` / `footnote_nid` / `fn_gid` / `fn`), optional **`data_entry_note`**. "
        "IUS, area, time period, and source are taken from the existing `dataset_data_point` row; coordinate fields "
        "in the body are ignored.\n\n"
        "- **Without `data_point_id`:** same shape as POST `/dw/{dw_id}/data` — "
        "`i_nid`/`i_gid`, `u_nid`/`u_gid`, `sg_nid`/`sg_gid`, `ar_nid`/`ar_id`, `tp_nid`, `ic_nid`/`ic_gid`; "
        "optional **`ius_nid`**; optional **`footnote`** only for caption text. "
        "Locale for resolution: `Accept-Language` (same as `/data`).\n\n"
        "**Soft delete** (`deleted`): array of `{ \"data_point_id\": <int> }` — sets `is_deleted` on the row "
        "(DRAFT/REVISION only; not applied to slice-approved rows).\n\n"
        "**Restore** (`restore`): same shape — clears `is_deleted` before reviewer approval.\n\n"
        "On **422** (`UNIFIED_DATAPOINT_BATCH_ERRORS`), **`errors.failures`** lists each failure with **`index`** "
        "(request order), **`data_point_id`** (may be null), **`code`** (`DATAPOINT_RESOLVE` or `AREA_NOT_ASSIGNED`), "
        "and **`messages`** (list)."
    ),
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
def unified_patch_data_points(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    payload: UnifiedUpsertRequest = Body(...),
    language_code: str = Depends(get_dw_language_code),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    try:
        result = dataset_service.unified_upsert_data_points(
            db, dw_id=dw_id, user_id=current_user_id, payload=payload,
            locale=language_code,
            is_super_admin=is_super,
        )
    except dataset_service.UnifiedUpsertPreflightError as e:
        raise UnprocessableEntity(
            "One or more data points failed validation.",
            error_code="UNIFIED_DATAPOINT_BATCH_ERRORS",
            details={"failures": e.failures},
        )
    except ValueError as e:
        code = str(e)
        if code == "DATASET_ID_REQUIRED":
            raise BadRequest(
                "dataset_id is required.",
                error_code="DATASET_ID_REQUIRED",
            )
        if code == "DATASET_NOT_FOUND":
            raise NotFound(
                f"Dataset {payload.dataset_id} not found.",
                identifier=str(payload.dataset_id),
            )
        if code == "DATASET_NOT_EDITABLE":
            raise Conflict("Dataset is not in an editable state.")
        if code == "NOT_ASSIGNED_TO_WORKFLOW":
            raise Forbidden(
                "You are not assigned to this workflow for the given areas.",
            )
        if code.startswith("AREA_NOT_ASSIGNED:"):
            raise Forbidden(
                "You are not assigned to enter data for this area.",
            )
        raise BadRequest(f"Could not upsert data points: {code}")
    msg_parts: list[str] = []
    if result.total:
        msg_parts.append(f"Upserted {result.total} data point(s)")
    if result.marked_deleted:
        msg_parts.append(f"marked {result.marked_deleted} as deleted")
    if result.restored:
        msg_parts.append(f"restored {result.restored}")
    msg = ". ".join(msg_parts) + "." if msg_parts else "No changes applied."
    return success_response(
        message=msg,
        data=result.model_dump(),
    )


@router.delete(
    "/{dw_id}/data-points",
    response_model=SuccessResponse[DataPointDeleteResponse],
    summary="Unified bulk delete data points",
    description=(
        "Delete selected data points.\n\n"
        "**Mode 1**: omit `dataset_id` — resolved from the active DRAFT.\n\n"
        "**Mode 2/3**: `dataset_id` required in request body.\n\n"
        "Locked rows are silently skipped. Returns `deleted` + `skipped` counts."
    ),
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def unified_delete_data_points(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    payload: UnifiedDeleteRequest = Body(...),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.unified_delete_data_points(
        db, dw_id=dw_id, user_id=current_user_id, payload=payload,
        is_super_admin=is_super,
    )
    return success_response(
        message=result.message,
        data=result.model_dump(),
    )


@router.delete(
    "/{dw_id}/data-point/{data_point_id}",
    response_model=SuccessResponse[DataPointDeleteResponse],
    summary="Unified single data point delete",
    description=(
        "Delete one data point by ID.\n\n"
        "**Non-APPROVED dataset**: removes from `dataset_data_point`. Row must be unlocked.\n\n"
        "**APPROVED dataset**: removes from `ut_data`. History record preserved.\n\n"
        "**Mode 1**: `dataset_id` query param optional — resolved from active dataset.\n\n"
        "**Mode 2/3**: `dataset_id` required."
    ),
    responses={400: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def unified_delete_data_point(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    data_point_id: int = Path(..., description="Data point ID to delete"),
    dataset_id: Optional[int] = Query(None, description="Dataset ID (required for Mode 2/3)"),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.unified_delete_data_point(
        db, dw_id=dw_id, user_id=current_user_id,
        data_point_id=data_point_id, dataset_id=dataset_id,
        is_super_admin=is_super,
    )
    return success_response(
        message=result.message,
        data=result.model_dump(),
    )


@router.patch(
    "/{dw_id}/dataset",
    response_model=SuccessResponse[DatasetTransitionResponse],
    summary="Unified submit / cancel dataset",
    description=(
        "Submit or cancel the active dataset.\n\n"
        "**Mode 1**: omit `dataset_id` — backend resolves the active DRAFT automatically.\n\n"
        "**Mode 2/3**: `dataset_id` required in the request body.\n\n"
        "`PENDING_REVIEW` transitions DRAFT → review (or auto-approve in Mode B). "
        "`PENDING_REVIEW` from REVISION → resubmit after corrections."
    ),
    responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def unified_submit_dataset(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    payload: UnifiedSubmitRequest = Body(...),
    current_user_id: int = Depends(get_current_user_id),
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    result = dataset_service.unified_submit(
        db,
        dw_id=dw_id,
        user_id=current_user_id,
        payload=payload,
        app_key=app_key,
        locale=locale,
        is_super_admin=is_super,
    )
    return success_response(
        message=result.message,
        data=result.model_dump(),
    )


# =============================================================================
# XLSX/CSV IMPORT — update data_value / footnote_text on existing datapoints
# =============================================================================

@router.post(
    "/{dw_id}/dataset/{dataset_id}/data-points/import",
    response_model=SuccessResponse[DataPointsImportResponse],
    summary=(
        "Import datapoints from XLSX or CSV (same column layout as data-points export) "
        "to update data_value and footnote"
    ),
    responses={
        413: {
            "description": "Uploaded file exceeds ALLOWED_IMPORT_FILE_SIZE_MB (MiB), or legacy ALLOWED_IMPORT_FILE_SIZE_BYTES if MB unset; tune via system_configuration / PATCH /app-config",
            "model": ErrorResponse,
        },
    },
)
async def import_data_points_file(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    file: UploadFile = File(
        ...,
        description=(
            "`.xlsx` from the data-points export, or UTF-8 `.csv` with the same nine columns "
            "in DATA_POINT_COLUMN_DEFS order."
        ),
    ),
    app_key: str = Depends(get_app_key),
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    is_super: bool = Depends(get_is_super_admin),
):
    """
    Parse an XLSX or UTF-8 CSV file with the layout produced by ``GET /dw/{dw_id}/data-points?export=true``
    (Excel export ``.xlsx``; CSV must follow the same column order when saved from spreadsheet software)
    and bulk-update ``data_value`` and ``footnote_text`` on the matching dataset datapoints.

    - Only DRAFT and REVISION datasets are accepted.
    - Blocked while ``datapoint_readiness`` is ``CREATED`` (seeding) or ``UPDATED`` (import in progress).
    - Files with more than ``DATASET_IMPORT_BG_THRESHOLD`` data rows are queued as batched background
      jobs (``request_id``); poll ``datapoint_readiness`` and GET ``import-logs`` endpoints.
    - Hard cap ``DATA_POINTS_SYNC_IMPORT_MAX_ROWS`` rejects oversized files.
    - Only existing datapoints within this dataset are updated — no new rows are created.
    - Locked datapoints (under active review in REVISION) are silently skipped.
    - A blank value cell clears the existing value (sets NULL).
    - ``review_status`` is never modified by this endpoint.
    """
    name_l = file.filename.strip().lower() if file.filename else ""
    path_ext = pathlib.Path(name_l).suffix if name_l else ""
    wants_xlsx = path_ext == ".xlsx"
    wants_csv = path_ext == ".csv"
    if not wants_xlsx and not wants_csv:
        raise AppException(
            "Only .xlsx or .csv files are accepted.",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            error_code="UNSUPPORTED_MEDIA_TYPE",
        )

    try:
        file_bytes = await read_import_upload_bytes(
            file, get_allowed_import_file_size_bytes(app_key)
        )
    except ImportUploadTooLarge as e:
        raise AppException(
            import_upload_too_large_message(e.max_bytes),
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            error_code="IMPORT_FILE_TOO_LARGE",
        )
    if not file_bytes:
        raise BadRequest("Uploaded file is empty.")

    from apps.app_db.services import datapoint_import_service as dp_import_svc
    from apps.shared.config.config import settings

    fmt = "xlsx" if wants_xlsx else "csv"

    try:
        dp_import_svc.assert_import_allowed(
            db, dataset_id=dataset_id, dw_id=dw_id
        )
        try:
            estimated_rows = dp_import_svc.count_import_data_rows(file_bytes, fmt)
        except ValueError as count_exc:
            if str(count_exc) == dp_import_svc.IMPORT_INVALID_FORMAT:
                raise UnprocessableEntity(
                    "Invalid file format. Upload an `.xlsx` file from the data-points export "
                    "or a UTF-8 `.csv` with the same nine columns.",
                ) from count_exc
            raise
        sync_max = settings.DATA_POINTS_SYNC_IMPORT_MAX_ROWS
        if sync_max > 0 and estimated_rows > sync_max:
            raise BadRequest(
                f"Import too large: {estimated_rows:,} rows exceeds the maximum of "
                f"{sync_max:,}. Narrow the file and retry."
            )

        if dp_import_svc.should_import_async(estimated_rows):
            batches = dp_import_svc.build_import_batches(file_bytes, fmt)
            if not batches:
                raise BadRequest("No data rows with a valid data_point_id were found in the file.")
            queued = dp_import_svc.queue_async_import(
                db,
                dw_id=dw_id,
                dataset_id=dataset_id,
                user_id=current_user_id,
                batches=batches,
                estimated_rows=estimated_rows,
            )
            result = DataPointsImportResponse.model_validate(queued)
            return success_response(
                message="Import queued.",
                data=result.model_dump(),
            )

        if wants_xlsx:
            result = dataset_service.import_data_points_from_xlsx(
                db,
                dw_id=dw_id,
                dataset_id=dataset_id,
                file_bytes=file_bytes,
                user_id=current_user_id,
                is_super_admin=is_super,
            )
        else:
            result = dataset_service.import_data_points_from_csv(
                db,
                dw_id=dw_id,
                dataset_id=dataset_id,
                file_bytes=file_bytes,
                user_id=current_user_id,
                is_super_admin=is_super,
            )
    except ValueError as e:
        code = str(e)
        if code == "DATASET_NOT_FOUND":
            raise NotFound(f"Dataset {dataset_id} not found.", identifier=str(dataset_id))
        if code == "DATASET_NOT_EDITABLE":
            raise Conflict(
                "Dataset is not editable. Only DRAFT and REVISION datasets can be imported into.",
            )
        if code == "DATAPOINT_POPULATION_IN_PROGRESS":
            raise Conflict(
                "Data points are still being populated or imported for this dataset. "
                "Wait until datapoint_readiness is COMPLETED before importing again.",
                error_code="DATAPOINT_POPULATION_IN_PROGRESS",
            )
        if code == "INVALID_IMPORT_FORMAT":
            raise UnprocessableEntity(
                "Invalid file format. Upload an `.xlsx` file from the data-points export "
                "or a UTF-8 `.csv` with the same nine columns.",
            )
        raise BadRequest(f"Import failed: {code}")

    return success_response(
        message="Import completed.",
        data=DataPointsImportResponse.model_validate(
            {**result, "import_async": False, "estimated_rows": estimated_rows}
        ).model_dump(),
    )


@router.get(
    "/{dw_id}/dataset/{dataset_id}/data-points/import-logs",
    response_model=SuccessResponse[DataPointsImportLogListResponse],
    summary="List data-point import history for a dataset (grouped by request_id)",
)
def list_data_points_import_logs(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    db: Session = Depends(get_db),
):
    from apps.app_db.services import datapoint_import_service as dp_import_svc

    try:
        data = dp_import_svc.list_import_logs_for_dataset(
            db, dataset_id=dataset_id, dw_id=dw_id
        )
    except ValueError as e:
        if str(e) == "DATASET_NOT_FOUND":
            raise NotFound(f"Dataset {dataset_id} not found.", identifier=str(dataset_id))
        raise BadRequest(str(e))
    return success_response(
        message="Import logs retrieved successfully.",
        data=DataPointsImportLogListResponse.model_validate(data).model_dump(),
    )


@router.get(
    "/{dw_id}/dataset/{dataset_id}/data-points/import-logs/{request_id}",
    response_model=SuccessResponse[DataPointsImportLogDetailResponse],
    summary="Get batch-level import logs for one import request_id",
)
def get_data_points_import_log_detail(
    dw_id: int = Path(..., description="Datawarehouse ID"),
    dataset_id: int = Path(..., description="Dataset ID"),
    request_id: str = Path(..., description="Import request UUID"),
    db: Session = Depends(get_db),
):
    from apps.app_db.services import datapoint_import_service as dp_import_svc

    try:
        data = dp_import_svc.get_import_request_detail(
            db,
            dataset_id=dataset_id,
            dw_id=dw_id,
            request_id=request_id,
        )
    except ValueError as e:
        code = str(e)
        if code == "DATASET_NOT_FOUND":
            raise NotFound(f"Dataset {dataset_id} not found.", identifier=str(dataset_id))
        if code == "IMPORT_REQUEST_NOT_FOUND":
            raise NotFound(
                f"Import request {request_id} not found for dataset {dataset_id}.",
                identifier=request_id,
            )
        raise BadRequest(str(e))
    return success_response(
        message="Import log detail retrieved successfully.",
        data=DataPointsImportLogDetailResponse.model_validate(data).model_dump(),
    )
