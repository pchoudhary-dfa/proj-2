"""
Router for app-config: get application configurations by keyword (app_key).
"""
from typing import Optional

from fastapi import APIRouter, Body, Depends, Query

from apps.app_db.dependencies import get_app_key
from apps.app_db.schemas.core import AppConfigPatchItemSchema
from apps.app_db.services.app_config import AppConfigService
from apps.shared.exceptions import NotFound
from apps.shared.schemas.response import SuccessResponse, ErrorResponse
from apps.shared.utils.response import success_response
from apps.shared.utils.ius_utils import IUS_GID_SEPARATOR_KEY_CODE, invalidate_ius_gid_separator_cache_for_app
from apps.shared.utils.import_upload_limits import (
    APP_CONFIG_IMPORT_FILE_SIZE_CACHE_KEYS,
    invalidate_allowed_import_file_size_cache_for_app,
)
from apps.shared.packages.dfa_sso_service.core.config import invalidate_sso_config_cache

router = APIRouter(prefix="/app-config", tags=["App Config"])
service = AppConfigService()


@router.get(
    "",
    summary="Get application configuration",
    description="Get configuration entries for an application resolved from X-Api-Key. "
    "Optional `dw_id` merges system_configuration with that warehouse's db_configuration for warehouse-mirrored keys. "
    "Optional `is_system` returns only keys with that system-managed flag.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Configuration entries returned", "model": SuccessResponse},
        404: {"description": "Application not found for keyword", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_app_config(
    app_key: str = Depends(get_app_key),
    dw_id: Optional[int] = Query(
        None,
        description="When set, merge system_configuration with this warehouse's db_configuration (MySQL) "
        "for warehouse-mirrored keys; on failure or non-MySQL warehouse, use system_configuration only.",
    ),
    is_system: Optional[bool] = Query(
        None,
        description="When `true`, only keys with is_system=true; when `false`, only is_system=false; omit for all keys.",
    ),
    unit_format_catalog: Optional[str] = Query(
        None,
        alias="unit_format_catalog",
        description="When `full`, UNIT_DATA_FORMAT_CATALOG includes all codes and formatting_enabled (admin). "
        "Default omits disabled formats from number_formats/currencies. "
        "Currency entries always include `symbol` from the API format registry on GET.",
    ),
):
    """
    Get configuration for the caller application.

    1. Look up system_application where app_key = keyword.
    2. If `dw_id` is omitted: fetch all system_configuration rows for that app_key.
    3. If `dw_id` is set: merge db_configuration (warehouse) over warehouse-mirrored keys with system_configuration;
       if the warehouse cannot be read, return system_configuration only.
    4. If `is_system` is set, filter the result to keys whose ``is_system`` flag matches.

    **Resolved value:** `app_key` is resolved from X-Api-Key via middleware.

    **Response:** `data` – object mapping each key_code to `value`, `description`, and `is_system`.
    """
    config = service.get_config_by_keyword(
        app_key,
        dw_id=dw_id,
        is_system=is_system,
        unit_format_catalog_full=(unit_format_catalog or "").strip().lower() == "full",
    )
    if config is None:
        raise NotFound(
            f"Application identifier {app_key} not found",
            identifier=str(app_key),
        )
    return success_response(
        message=f"Retrieved {len(config)} config(s) for app_key '{app_key}'",
        data=config,
    )


@router.patch(
    "",
    summary="Patch application configuration",
    description="Update existing system configuration rows for the app_key resolved from X-Api-Key.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Configuration entries updated", "model": SuccessResponse},
        404: {"description": "Application not found for app_key", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
@router.patch(
    "/",
    summary="Patch application configuration (trailing slash)",
    description="Same as PATCH without trailing slash; matches IAM backend_endpoint /app-config/.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Configuration entries updated", "model": SuccessResponse},
        404: {"description": "Application not found for app_key", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    include_in_schema=False,
)
async def patch_app_config(
    app_key: str = Depends(get_app_key),
    dw_id: Optional[int] = Query(
        None,
        description="When set, warehouse-mirrored keys in the payload (e.g. DW_MAPS) are "
        "upserted into that warehouse's db_configuration instead of system_configuration.",
    ),
    payload: dict[str, AppConfigPatchItemSchema] = Body(
        ...,
        example={
            "APP_NAME": {"value": "DFA Dashboard", "description": "Application title", "is_system": False},
            "APP_TITLE": {"value": "DFA Dashboard", "description": "Browser title"},
        },
    ),
):
    """
    Patch configuration values by resolved app_key.

    Request body expects:
    - { "<key_code>": {value, description, is_system?}, ... }

    Behavior:
    - key_code comes from object key and is not updatable
    - only existing keys are updated
    - keys not present in DB are ignored and returned as missing_keys
    - optional `is_system` updates the system-managed flag when provided
    """
    result = service.patch_config_by_app_key(app_key=app_key, payload=payload, dw_id=dw_id)
    if result is None:
        raise NotFound(
            f"Application identifier {app_key} not found",
            identifier=str(app_key),
        )
    updated = set(result.get("updated_keys", ()))
    if IUS_GID_SEPARATOR_KEY_CODE in updated:
        invalidate_ius_gid_separator_cache_for_app(None)
    if APP_CONFIG_IMPORT_FILE_SIZE_CACHE_KEYS.intersection(updated):
        invalidate_allowed_import_file_size_cache_for_app(app_key)
    if "SSO_ENABLED" in updated:
        invalidate_sso_config_cache(None)
    return success_response(
        message=f"Updated {result['updated_count']} config(s) for app_key '{app_key}'",
        data=result,
    )
