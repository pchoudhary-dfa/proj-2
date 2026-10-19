"""
Core router for system_datawarehouse CRUD operations
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Body, Depends, status, Query
from fastapi.responses import JSONResponse

from apps.app_db.dependencies import get_scoped_dw_ids
from apps.app_db.dependencies import get_current_user_id
from apps.app_db.schemas.core import (
    SystemDatawarehouseCreateSchema,
    SystemDatawarehouseUpdateSchema,
    SystemDatawarehouseResponseSchema,
    SystemDatawarehouseListResponseSchema,
    DatabaseConnectionSchema,
    OptimizeOptionsSchema,
)
from apps.app_db.services.datawarehouse import SystemDatawarehouseService
from apps.app_db.services import dw_optimizer
from apps.shared.exceptions import BadRequest, NotFound
from apps.shared.schemas.response import SuccessResponse, ErrorResponse
from apps.shared.utils.response import (
    success_response,
    created_response,
    created_response_data,
    no_content_response,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dw", tags=["System Datawarehouses"])
service = SystemDatawarehouseService()


@router.post(
    "/",
    summary="Create New Data Warehouse and register it in the system",
    description="Create a new data warehouse database with the standard schema structure and save credentials",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {
            "description": "Warehouse created successfully",
            "model": SuccessResponse
        },
        400: {
            "description": "Bad request - invalid input or connection failed",
            "model": ErrorResponse
        },
        500: {
            "description": "Internal server error",
            "model": ErrorResponse
        }
    }
)
async def create_warehouse(connection_data: DatabaseConnectionSchema, current_user_id: int = Depends(get_current_user_id)):
    """
    Create a data warehouse database with the standard schema and save credentials to system_datawarehouse.
    
    This endpoint:
    1. Validates the database connection credentials
    2. Creates the database if it doesn't exist
    3. Executes the standard warehouse schema SQL
    4. Saves credentials to system_datawarehouse table
    5. Returns the creation status
    
    **Request Body:**
    - `db_source`: Database type (mysql or postgresql)
    - `db_host`: Database host address
    - `db_port`: Database port number
    - `db_login`: Database username
    - `db_password`: Database password
    - `db_database`: Database name to create
    - `db_connection_name`: Optional friendly name for the connection
    
    **Response:**
    - `database_name`: Name of the created database
    - `tables_created`: Number of tables created
    - `status`: Creation status
    - `system_datawarehouse_id`: ID of the created system_datawarehouse record
    """
    logger.info(f"Warehouse creation request received for database: {connection_data.db_database}")
    
    # Create warehouse (this also saves to system_datawarehouse)
    result = service.create_warehouse(
        connection_data,
        dw_connection_name=connection_data.db_connection_name or connection_data.db_database,
        dw_default_language='en',
        created_user_id=current_user_id
    )

    # Run full optimize on the new DW; skip normalize/seed (schema is already correct for freshly created DBs)
    system_dw_id = result.get("system_datawarehouse_id")
    optimize_warnings = []
    if system_dw_id and connection_data.db_source.value == "mysql":
        try:
            opt = dw_optimizer.perform_full_optimize(
                dw_id=system_dw_id,
                do_normalize_table_and_column_names=False,
                do_seed_system_initial_defaults=False,
                do_configuration_sync=True,
                do_ensure_default_workflow=True,
                default_workflow_created_user_id=current_user_id,
            )
            if not opt.get("success"):
                msg = opt.get("message", "Optimize step failed")
                logger.warning("Optimize after create_warehouse failed for dw_id=%s: %s", system_dw_id, msg)
                optimize_warnings.append(msg)
        except Exception as e:
            logger.warning("Optimize after create_warehouse error for dw_id=%s: %s", system_dw_id, e)
            optimize_warnings.append(str(e))

    # Prepare response data (exclude password)
    response_data = {
        "database_name": result["database_name"],
        "tables_created": result["tables_created"],
        "search_tables_created": result.get("search_tables_created"),
        "statements_executed": result["statements_executed"],
        "total_statements": result["total_statements"],
        "db_source": result["db_source"],
        "status": result["status"],
        "system_datawarehouse_id": result.get("system_datawarehouse_id"),
        "connection_info": {
            "host": connection_data.db_host,
            "port": connection_data.db_port,
            "database": connection_data.db_database,
            "db_source": connection_data.db_source.value
        },
    }
    if optimize_warnings:
        response_data["optimize_warnings"] = optimize_warnings
    
    return created_response(
        message=f"Data warehouse '{connection_data.db_database}' created successfully",
        data=response_data
    )


@router.post(
    "",
    summary="Register and Test Connection to a Existing Data Warehouse",
    description="Create a new system datawarehouse record without creating the database. "
    "Use test_connection_only=true to only test the DB connection and return the result.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        200: {"description": "Connection test result (when test_connection_only=true)", "model": SuccessResponse},
        201: {"description": "Datawarehouse record created successfully", "model": SuccessResponse},
        400: {"description": "Bad request - invalid input or connection failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse}
    }
)
async def create_datawarehouse_record(
    datawarehouse_data: SystemDatawarehouseCreateSchema,
    test_connection_only: bool = Query(
        False,
        description="If true, only test the database connection and return the result (connected/message). No record is created.",
    ),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Create a new system datawarehouse record.

    - If **test_connection_only** is true: tests the DB connection with the given credentials
      and returns the result (connected: true/false, message: success reason or error reason). No record is created.
    - If **test_connection_only** is false: validates the connection first; if valid, creates the entry
      in system_datawarehouse. If connection fails, returns 400 with the reason.
    """
    if test_connection_only:
        result = service.test_datawarehouse_connection(datawarehouse_data)
        return success_response(
            message="Connection test completed",
            data=result,
        )

    # Validate connection before creating the record
    connection_result = service.test_datawarehouse_connection(datawarehouse_data)
    if not connection_result.get("connected"):
        raise BadRequest(
            connection_result.get("message", "Database connection failed"),
        )

    logger.info(f"Creating system datawarehouse record: {datawarehouse_data.dw_connection_name}")
    result = service.create_datawarehouse(datawarehouse_data, current_user_id)
    dw_id = result.get("id")
    if dw_id:
        try:
            optimize_result = dw_optimizer.perform_full_optimize(
                dw_id=dw_id,
                do_configuration_sync=True,
                do_ensure_default_workflow=True,
                default_workflow_created_user_id=current_user_id,
            )
            if not optimize_result.get("success"):
                logger.warning("Optimize after register failed — rolling back DW record %s: %s", dw_id, optimize_result.get("message"))
                service.delete_datawarehouse(dw_id)
                raise BadRequest(
                    optimize_result.get("message", "Data warehouse optimization failed after registration."),
                )
        except NotImplementedError as e:
            logger.warning("Optimize after register raised NotImplementedError — rolling back DW record %s: %s", dw_id, e)
            service.delete_datawarehouse(dw_id)
            raise BadRequest(str(e)) from e
        except Exception:
            service.delete_datawarehouse(dw_id)
            raise
    data_out = created_response_data(result, "id", gid_key=None)
    return created_response(
        message=f"System datawarehouse '{datawarehouse_data.dw_connection_name}' created successfully",
        data=data_out
    )


@router.get(
    "",
    summary="List System Datawarehouses",
    description="Get a list of all system datawarehouses with pagination",
    response_model=SuccessResponse,
    responses={
        200: {"description": "List of datawarehouses", "model": SuccessResponse},
        500: {"description": "Internal server error", "model": ErrorResponse}
    }
)
async def list_datawarehouses(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records to return"),
    active_only: bool = Query(False, description="Only return active datawarehouses"),
    dw_ids: Optional[List[int]] = Depends(get_scoped_dw_ids),
):
    """
    Get a list of all system datawarehouses.

    Supports pagination and filtering by active status.
    Results are automatically scoped to the DW IDs the authenticated user has access to.
    Super admins (roles with is_super_admin=True for the calling api_key) see all warehouses.
    """
    result = service.get_all_datawarehouses(skip=skip, limit=limit, active_only=active_only, dw_ids=dw_ids)
    
    return success_response(
        message=f"Retrieved {len(result)} datawarehouses",
        data=result
    )


@router.get(
    "/{dw_id}",
    summary="Get System Datawarehouse by ID",
    description="Get a specific system datawarehouse by its ID",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Datawarehouse found", "model": SuccessResponse},
        404: {"description": "Datawarehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse}
    }
)
async def get_datawarehouse(dw_id: int):
    """
    Get a specific system datawarehouse by ID.
    """
    result = service.get_datawarehouse_by_id(dw_id)
    
    if not result:
        raise NotFound(
            f"Data warehouse identifier {dw_id} not found",
            identifier=str(dw_id),
        )
    
    return success_response(
        message="Datawarehouse retrieved successfully",
        data=result
    )


# Fields that affect database connection (stored in dw_connection_details JSON);
# if any are updated, we test the connection first
CONNECTION_FIELDS = {"db_source_type", "db_host_address", "db_user", "db_password", "db_port", "db_database"}


@router.patch(
    "/{dw_id}",
    summary="Update System Datawarehouse",
    description="Update an existing system datawarehouse. If connection credentials are changed, the connection is tested before saving.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Datawarehouse updated successfully", "model": SuccessResponse},
        404: {"description": "Datawarehouse not found", "model": ErrorResponse},
        400: {"description": "Bad request - invalid input or connection failed", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse}
    }
)
async def update_datawarehouse(
    dw_id: int,
    datawarehouse_data: SystemDatawarehouseUpdateSchema,
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Update an existing system datawarehouse.

    If the request includes any connection-related fields (db_source_type, db_host_address,
    db_user, db_password, db_port, db_database), the connection to that database is tested
    first. The record is only updated if the connection test succeeds.
    Only provided fields will be updated.
    """
    update_data = datawarehouse_data.model_dump(exclude_unset=True)
    updating_connection = bool(CONNECTION_FIELDS & set(update_data.keys()))

    if updating_connection:
        # Fetch current credentials (decrypted) so we can merge with partial update
        existing = service.get_datawarehouse_connection_data(dw_id)
        if not existing:
            raise NotFound(
                f"Data warehouse identifier {dw_id} not found",
                identifier=str(dw_id),
            )
        # Merge: existing flat dict + incoming update fields
        merged = {**existing, **update_data}
        # Build test payload from fields that SystemDatawarehouseCreateSchema accepts
        create_payload = {
            k: merged[k] for k in SystemDatawarehouseCreateSchema.model_fields
            if k in merged
        }
        connection_data = SystemDatawarehouseCreateSchema(**create_payload)
        connection_result = service.test_datawarehouse_connection(connection_data)
        if not connection_result.get("connected"):
            raise BadRequest(
                connection_result.get("message", "Database connection failed"),
            )

    result = service.update_datawarehouse(dw_id, datawarehouse_data, current_user_id)

    if not result:
        raise NotFound(
            f"Data warehouse identifier {dw_id} not found",
            identifier=str(dw_id),
        )

    payload_keys = set(datawarehouse_data.model_dump(exclude_unset=True).keys())
    response_data = {k: result[k] for k in payload_keys if k in result}
    return success_response(
        message=f"Datawarehouse {dw_id} updated successfully",
        data=response_data
    )


@router.delete(
    "/{dw_id}",
    summary="Delete System Datawarehouse",
    description="Delete a system datawarehouse record",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Datawarehouse deleted successfully", "model": SuccessResponse},
        404: {"description": "Datawarehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse}
    }
)
async def delete_datawarehouse(dw_id: int):
    """
    Delete a system datawarehouse record.
    """
    deleted = service.delete_datawarehouse(dw_id)
    
    if not deleted:
        raise NotFound(
            f"Data warehouse identifier {dw_id} not found",
            identifier=str(dw_id),
        )
    return no_content_response()


# ---------- Data Warehouse Optimize (single API with optional body to select steps) ----------


def _run_full_optimize(
    dw_id: int,
    opts: Optional[OptimizeOptionsSchema],
    *,
    default_workflow_created_user_id: Optional[int] = None,
) -> dict:
    """
    Run full or selective optimize steps.
    - opts is None: body was omitted → run full optimize (all defaults).
    - opts provided but all steps False: body sent with no steps selected → run full optimize.
    - opts provided with at least one step True: run only the selected steps.
    """
    if opts is None:
        # No body provided — run full optimize with all defaults
        return dw_optimizer.perform_full_optimize(
            dw_id=dw_id,
            default_workflow_created_user_id=default_workflow_created_user_id,
        )

    any_step = (
        opts.normalize_table_and_column_names
        or opts.ensure_primary_keys
        or opts.rebuild_indexes
        or opts.seed_system_initial_defaults
        or opts.validate_sync_new_columns
        or opts.validate_sync_new_tables
        or opts.normalize_subgroup_display_orders
        or opts.enforce_fk_referential_integrity
        or opts.ensure_default_subgroup
        or opts.ensure_default_workflow
        or opts.sync_dw_stats_counts
        or opts.configuration_sync
        or opts.create_search_tables
    )
    if not any_step:
        # Body provided but all steps are False — treat same as no body: run full optimize
        return dw_optimizer.perform_full_optimize(
            dw_id=dw_id,
            default_workflow_created_user_id=default_workflow_created_user_id,
        )

    # Selective run: only execute the steps the caller explicitly enabled
    return dw_optimizer.perform_full_optimize(
        dw_id=dw_id,
        do_normalize_table_and_column_names=opts.normalize_table_and_column_names,
        do_ensure_primary_keys=opts.ensure_primary_keys,
        do_rebuild_indexes=opts.rebuild_indexes,
        rebuild_indexes_after_reset=opts.rebuild_indexes_after_reset,
        do_seed_system_initial_defaults=opts.seed_system_initial_defaults,
        do_validate_sync_new_columns=opts.validate_sync_new_columns,
        do_validate_sync_new_tables=opts.validate_sync_new_tables,
        do_normalize_subgroup_display_orders=opts.normalize_subgroup_display_orders,
        do_enforce_fk_referential_integrity=opts.enforce_fk_referential_integrity,
        do_ensure_default_subgroup=opts.ensure_default_subgroup,
        do_ensure_default_workflow=opts.ensure_default_workflow,
        do_sync_dw_stats_counts=opts.sync_dw_stats_counts,
        do_configuration_sync=opts.configuration_sync,
        do_create_search_tables=opts.create_search_tables,
        default_workflow_created_user_id=default_workflow_created_user_id,
    )


@router.post(
    "/{dw_id}/optimize",
    summary="Optimize data warehouse",
    description=(
        "Run one or more optimize steps against a registered data warehouse. "
        "**Only `dw_id` (path) is required** — the JSON body is optional and every step flag is optional; "
        "none must be supplied. "
        "**Body omitted or all steps false** runs **full optimize** (service-layer defaults below — not every flag below runs; "
        "see “Off by default in full optimize”). "
        "**Selective requests** send one or more flags `true` to run **only** those steps (omit or `false` = skip). "
        "MySQL only.\n\n"
        "**Pipeline steps** — “Mandatory” here means included in **full optimize** execution order; **none** of these JSON keys "
        "are required; they only select work when using a selective body.\n\n"
        "**Core pipeline** (always run in **full optimize**, in this order):\n"
        "- `normalize_table_and_column_names` — rename all tables/columns to lowercase; also seeds db_version, ut_language, db_available_databases, ut_dbmetadata_*\n"
        "- `ensure_primary_keys` — add PRIMARY KEY on AUTO_INCREMENT columns where missing; "
        "if no PK at all, promote first integer column to NOT NULL AUTO_INCREMENT PRIMARY KEY; "
        "if a single-integer PK exists without AUTO_INCREMENT, add AUTO_INCREMENT (MAX+1 counter)\n"
        "- `rebuild_indexes` — apply full DI7 index set (dw_index_specs). "
        "Full optimize uses `rebuild_indexes_after_reset=true` internally (drops non-primary unique indexes then re-applies). "
        "Selective bodies default `rebuild_indexes_after_reset` to `false` (add-only); set `rebuild_indexes_after_reset=true` "
        "with `rebuild_indexes=true` for a clean rebuild\n"
        "- `seed_system_initial_defaults` — INSERT IF NOT EXISTS into: db_version (7.0.0.2), db_available_databases, "
        "ut_language, ut_dbmetadata_<lang>; auto-skipped when normalize_table_and_column_names runs\n"
        "- `validate_sync_new_columns` — additive column migrations (currently: is_system on "
        "ut_subgroup_vals_*, ut_subgroup_type_*, ut_subgroup_*; unit_format on ut_unit_*)\n"
        "- `validate_sync_new_tables` — CREATE TABLE IF NOT EXISTS for validation tables "
        "(iu_validation, iu_validation_enum, iu_validation_enum_i18n); also provisions compute-engine table groups "
        "when not already present\n\n"
        "**Also run in full optimize** (still optional JSON toggles — each defaults off in schema; selective runs only explicit `true`; full optimize enables these by default):\n"
        "- `enforce_fk_referential_integrity` — convert FK-related tables to InnoDB and add FK constraints "
        "(ut_ic_ius/ut_data → ut_indicator_unit_subgroup, ut_data → ut_timeperiod)\n"
        "- `sync_dw_stats_counts` — sync indicator/area/IUS/time-period/source/data counts to system_datawarehouse\n"
        "- `create_search_tables` — ensure search_keywords, search_keyword_synonym, and search_keyword_ngram exist "
        "(same logic as search/sync phase 1; does not populate index data; default true in schema and full optimize)\n\n"
        "**Off by default in full optimize** (enable only by sending `true` in a selective body, or rely on other code paths such as registration flows):\n"
        "- `configuration_sync` — create `db_configuration` in the warehouse if missing; if the table predates the "
        "unique index on `(app_key, key_code)`, removes duplicate rows (keeps lowest `id`) and adds that index; "
        "then INSERT missing rows for warehouse-mirrored keys (DFA_DM) from application Settings (.env), "
        "falling back to `system_configuration` and subgroup GID defaults from Settings when seed values are empty — including "
        "subgroup GIDs, IND_CLASSIFICATIONS_SETTINGS, IUS_DEF_VALIDATION, CURRENT_TIMEPERIOD, AI_PROVIDER, and "
        "AI_API_KEY (existing rows are not updated)\n"
        "- `normalize_subgroup_display_orders` — dense-renumber subgroup_type_order, "
        "subgroup_order (per category), subgroup_val_order across all locale tables (mutates data)\n"
        "- `ensure_default_subgroup` — ensure default subgroup structure (OTHERS/TOTAL types, system category value "
        "and combination) from warehouse `db_configuration` / `system_configuration` / env; reuses existing GIDs, "
        "promotes `is_system=1`, and backfills `ut_subgroup_vals_subgroup` when missing\n"
        "- `ensure_default_workflow` — seed DEFAULT_{dw_id} workflow in app DB (allow_review=0, "
        "constraint_data_entry=0, no levels or data-entry rule) when missing; runs on warehouse registration"
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Optimize completed", "model": SuccessResponse},
        400: {"description": "Unsupported DB type or optimize failed", "model": ErrorResponse},
        404: {"description": "Datawarehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def optimize_datawarehouse(
    dw_id: int,
    body: Optional[OptimizeOptionsSchema] = Body(None, description="Steps to run; omit or all false = full optimize"),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Optimize a warehouse by numeric ``dw_id`` (required path param only).

    Request body is optional: every JSON field is optional. Omit the body or send all step flags false to
    run full optimize; set one or more flags true to run only those steps (see endpoint description).
    """
    result = _run_full_optimize(
        dw_id,
        body,
        default_workflow_created_user_id=current_user_id,
    )
    if not result.get("success"):
        raise BadRequest(result.get("message", "Optimize failed"))
    return success_response(
        message="Data warehouse optimized successfully",
        data=result,
    )
