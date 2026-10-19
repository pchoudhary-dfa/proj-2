from typing import List, Optional

from fastapi import APIRouter, Body, Depends, File, Path, Query, UploadFile, status
from fastapi import Response
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from apps.app_dashboard.services.dashboard_language_export import (
    build_dashboard_languages_export_xlsx,
)
from apps.app_dashboard.services.dashboard_language_import import (
    import_dashboard_languages_from_xlsx,
)
from apps.app_db.services.datawarehouse import SystemDatawarehouseService
from apps.datawarehouse.constants import BODY_DATA, PATH_DW_ID, PATH_LANG_CODE
from apps.datawarehouse.db.datawarehouse import (
    credentials_to_schema,
    get_warehouse_credentials,
    get_warehouse_session,
    validate_dw_id,
)
from apps.datawarehouse.schemas.language import (
    LanguageCreateSchema,
    LanguageExportRequestSchema,
    LanguagePatchSchema,
    LanguageResponseSchema,
)
from apps.datawarehouse.services.language_export import build_languages_export_xlsx
from apps.datawarehouse.services.language_import import import_languages_from_xlsx
from apps.datawarehouse.services.language_service import LanguageService
from apps.datawarehouse.utils.serialization import get_serialization_mode
from apps.datawarehouse.utils.alias_loader import alias_field
from apps.shared.config.constants import DATAWAREHOUSES_BASE_PATH
from apps.shared.config.dependencies import get_db
from apps.shared.exceptions import BadRequest, Conflict, InternalError, NotFound, UnprocessableEntity
from apps.shared.schemas.response import ErrorResponse, SuccessResponse
from apps.shared.utils.response import (
    created_response,
    created_response_data,
    no_content_response,
    success_response,
)

router = APIRouter(
    tags=["Data Warehouse - Languages"],
    prefix=f"/{DATAWAREHOUSES_BASE_PATH}/{{{PATH_DW_ID}}}/languages",
)
language_service = LanguageService()
_dw_service = SystemDatawarehouseService()


@router.post(
    "/export",
    summary="Export language translations",
    description=(
        "Without dashboard_id: export locale-aware DW table data as a multi-sheet XLSX "
        "(from/to language columns; body.to_lang_code required).\n\n"
        "With ?dashboard_id=: export edit-dashboard section names, header/footer HTML, "
        "and visualization i18n properties as a single-sheet legacy XLSX across all "
        "DW languages (default first). Body is optional and ignored in this mode."
    ),
    responses={
        200: {"description": "XLSX file as attachment"},
        400: {"description": "Invalid language / dashboard / DW mismatch", "model": ErrorResponse},
        404: {"description": "Warehouse or dashboard not found", "model": ErrorResponse},
        422: {"description": "Validation error (e.g. missing to_lang_code for DW export)"},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
def export_languages(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    dashboard_id: Optional[int] = Query(
        None,
        description=(
            "When set, export edit-dashboard translation Excel (legacy) instead of "
            "DW locale-table sheets. Dashboard must be edit mode and linked to this dw_id."
        ),
    ),
    body: Optional[LanguageExportRequestSchema] = Body(None, alias=BODY_DATA),
    db: Session = Depends(get_db),
):
    cred = get_warehouse_credentials(dw_id)
    warehouse = credentials_to_schema(cred)

    if dashboard_id is not None:
        system_dw_id = _dw_service.resolve_datawarehouse_id(dw_id)
        if system_dw_id is None:
            raise NotFound(
                f"Data warehouse '{dw_id}' not found",
                identifier=dw_id,
                error_code="DATAWAREHOUSE_NOT_FOUND",
            )
        with get_warehouse_session(warehouse, dw_id=dw_id, credentials=cred) as dw_db:
            output, filename = build_dashboard_languages_export_xlsx(
                core_db=db,
                dw_db=dw_db,
                dashboard_id=dashboard_id,
                system_dw_id=system_dw_id,
            )
        return Response(
            content=output.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    if body is None or not getattr(body, "to_lang_code", None):
        raise BadRequest(
            "to_lang_code is required when dashboard_id is not provided",
            error_code="TO_LANG_CODE_REQUIRED",
        )

    db_display_name = cred.get("dw_connection_name") or cred.get("db_database") or dw_id
    with get_warehouse_session(warehouse, dw_id=dw_id, credentials=cred) as dw_db:
        output, filename = build_languages_export_xlsx(
            dw_db=dw_db,
            from_lang_code=body.from_lang_code,
            to_lang_code=body.to_lang_code,
            db_connection_display_name=db_display_name,
        )
    return Response(
        content=output.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post(
    "/import",
    summary="Import language translations from XLSX",
    description=(
        "Without dashboard_id: import locale-aware DW table data from a multi-sheet "
        "XLSX previously exported via /export. Only the target (last) language "
        "column is written; the source column is used as reference. If the target "
        "language does not exist, it is auto-created by cloning locale tables from "
        "the source language.\n\n"
        "With ?dashboard_id=: import edit-dashboard section names, header/footer HTML, "
        "and visualization i18n property leaves as locale maps "
        "``{lang_code: text}`` into v6 nested ``properties`` paths. File must match "
        "the single-sheet dashboard export format."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Import completed successfully", "model": SuccessResponse},
        400: {"description": "Invalid file, language codes, or dashboard", "model": ErrorResponse},
        404: {"description": "Warehouse or dashboard not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def import_languages(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    dashboard_id: Optional[int] = Query(
        None,
        description=(
            "When set, import edit-dashboard translation Excel instead of DW "
            "locale-table sheets. Dashboard must be edit mode and linked to this dw_id."
        ),
    ),
    file: UploadFile = File(
        ...,
        description="XLSX file from the language export endpoint.",
    ),
    db: Session = Depends(get_db),
):
    content = await file.read()

    if dashboard_id is not None:
        system_dw_id = _dw_service.resolve_datawarehouse_id(dw_id)
        if system_dw_id is None:
            raise NotFound(
                f"Data warehouse '{dw_id}' not found",
                identifier=dw_id,
                error_code="DATAWAREHOUSE_NOT_FOUND",
            )
        cred = get_warehouse_credentials(dw_id)
        warehouse = credentials_to_schema(cred)
        # Keep core Session on the request thread (same as dashboard export).
        with get_warehouse_session(warehouse, dw_id=dw_id, credentials=cred) as dw_db:
            result = import_dashboard_languages_from_xlsx(
                core_db=db,
                dw_db=dw_db,
                dashboard_id=dashboard_id,
                system_dw_id=system_dw_id,
                file_bytes=content,
            )
        msg = (
            f"Dashboard language import completed "
            f"(sections={result.get('sections_updated', 0)}, "
            f"html={result.get('html_fields_updated', 0)}, "
            f"viz_fields={result.get('visualization_fields_updated', 0)}, "
            f"viz_touched={result.get('visualizations_touched', 0)})"
        )
        return success_response(message=msg, data=result)

    result = await run_in_threadpool(
        import_languages_from_xlsx,
        file_bytes=content,
        dw_id=dw_id,
    )
    lang_created = result.get("language_created", False)
    msg = (
        f"Language import completed "
        f"(sheets={result.get('sheets_processed', 0)}, "
        f"inserted={result.get('inserted', 0)}, "
        f"updated={result.get('updated', 0)}, "
        f"skipped={result.get('skipped', 0)}"
        f"{', language created' if lang_created else ''})"
    )
    return success_response(message=msg, data=result)


@router.get(
    "",
    summary="List languages",
    description="Retrieve the list of configured languages for a Data Warehouse (ut_language).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Languages retrieved successfully", "model": SuccessResponse},
        404: {"description": "Data Warehouse not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def list_languages(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
):
    items = await run_in_threadpool(language_service.list_languages, dw_id)
    response_data: List[dict] = [
        LanguageResponseSchema.model_validate(i).model_dump(**get_serialization_mode())
        for i in items
    ]
    return success_response(
        message="Languages retrieved successfully",
        data=response_data,
    )


@router.post(
    "",
    summary="Add language",
    description=(
        "Create a new language configuration for a Data Warehouse (ut_language). "
        "Creates localized tables by cloning locale tables from the default language (or from source_lang if provided) "
        "and copying data."
    ),
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Language added successfully", "model": SuccessResponse},
        400: {"description": "Missing or invalid fields", "model": ErrorResponse},
        404: {"description": "Data Warehouse not found", "model": ErrorResponse},
        409: {"description": "Duplicate language code", "model": ErrorResponse},
        422: {"description": "Validation error", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def add_language(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    data: LanguageCreateSchema = Body(..., alias=BODY_DATA),
):
    result = await run_in_threadpool(language_service.create_language, dw_id, data)
    ser_mode = get_serialization_mode()
    response_data = LanguageResponseSchema.model_validate(result).model_dump(**ser_mode)
    nid_key = alias_field("ut_language", "language_nid") if ser_mode.get("by_alias") else "language_nid"
    data_out = created_response_data(response_data, nid_key, gid_key=None)
    return created_response(
        message="Language added successfully",
        data=data_out,
    )


@router.patch(
    "/{lang_code}",
    summary="Patch language",
    description=(
        "Partially update a language configuration (ut_language): display name and/or default flag. "
        "Only one language may be default; setting language_default true clears it from all other rows."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Language updated successfully", "model": SuccessResponse},
        404: {"description": "Language not found", "model": ErrorResponse},
        422: {"description": "Validation error", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def patch_language(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    lang_code: str = Path(..., description="Language code (normalized lowercase)", alias=PATH_LANG_CODE),
    data: LanguagePatchSchema = Body(..., alias=BODY_DATA),
):
    try:
        result = await run_in_threadpool(language_service.patch_language, dw_id, lang_code, data)
        response_data = LanguageResponseSchema.model_validate(result).model_dump(**get_serialization_mode())
        return success_response(
            message="Language updated successfully",
            data=response_data,
        )
    except KeyError:
        raise NotFound("Language not found")
    except ValueError as e:
        raise UnprocessableEntity(str(e))
    except Exception as e:
        raise InternalError(
            f"Failed to patch language: {str(e)}",
            public_message=f"Failed to patch language: {str(e)}",
        ) from e


@router.get(
    "/{lang_code}",
    summary="Get language by code",
    description="Retrieve a single language configuration using lang_code (ut_language.language_code).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Language retrieved successfully", "model": SuccessResponse},
        404: {"description": "Language not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_language(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    lang_code: str = Path(..., description="Language code (normalized lowercase)", alias=PATH_LANG_CODE),
):
    result = await run_in_threadpool(language_service.get_language_by_code, dw_id, lang_code)
    if not result:
        raise NotFound("Language not found")
    response_data = LanguageResponseSchema.model_validate(result).model_dump(**get_serialization_mode())
    return success_response(
        message="Language retrieved successfully",
        data=response_data,
    )


@router.delete(
    "/{lang_code}",
    summary="Delete language",
    description=(
        "Delete a language configuration."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Language deleted successfully", "model": SuccessResponse},
        404: {"description": "Language not found", "model": ErrorResponse},
        422: {"description": "Default language cannot be deleted", "model": ErrorResponse},
        423: {"description": "Globally locked language cannot be deleted", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_language(
    dw_id: str = Path(..., description="Data warehouse identifier", alias=PATH_DW_ID),
    _: str = Depends(validate_dw_id),
    lang_code: str = Path(..., description="Language code (normalized lowercase)", alias=PATH_LANG_CODE),
):
    deleted, dependency_counts = await run_in_threadpool(language_service.delete_language, dw_id, lang_code)
    if not deleted:
        raise Conflict(
            "Language cannot be deleted due to existing translation dependencies",
            details={"dependency_counts": dependency_counts},
        )
    return no_content_response()

