"""
Router for translations: get locale strings from system_language_translations
and system_language_translations_i18n.
"""
import logging
from typing import List

from fastapi import APIRouter, Body, Depends, File, Path, Query, UploadFile, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from apps.app_db.constants import (
    TRANSLATION_LIST_SEARCH_BY_FIELDS,
    TRANSLATION_LIST_SORT_FIELDS,
)
from apps.app_db.dependencies import get_app_key, get_core_locale, get_current_user_id
from apps.app_db.schemas.core import (
    SystemLanguageTranslationCreateSchema,
    SystemLanguageTranslationPatchSchema,
    SystemLanguageTranslationResponseSchema,
)
from apps.app_db.services.system_language_service import SystemLanguageService
from apps.app_db.services.translation_service import TranslationService
from apps.shared.exceptions import AppException, BadRequest, NotFound
from apps.shared.schemas.response import SuccessResponse, ErrorResponse, ListPaginationMetaSchema
from apps.datawarehouse.constants import (
    QUERY_SEARCH,
    QUERY_SEARCH_BY,
    QUERY_SORT_FIELD,
    QUERY_SORT_ORDER,
)
from apps.shared.utils.import_upload_limits import (
    ImportUploadTooLarge,
    get_allowed_import_file_size_bytes,
    import_upload_too_large_message,
    read_import_upload_bytes,
)
from apps.shared.utils.pagination_meta import build_list_pagination_meta, resolve_unfiltered_total
from apps.shared.utils.response import no_content_response, success_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translations", tags=["Translations"])
service = TranslationService()
system_language_service = SystemLanguageService()


def _get_translation_doc_locales() -> list[str]:
    """Load locales for docs examples from non-deleted system-language rows."""
    rows = system_language_service.list_non_deleted()
    locales = sorted(
        {
            row.locale.strip().lower()
            for row in rows
            if getattr(row, "locale", None) and row.locale.strip()
        }
    )
    return locales or ["en"]


def _build_translation_map_for_docs(locales: list[str], suffix: str = "") -> dict[str, str]:
    translation_map: dict[str, str] = {}
    for locale in locales:
        translation_map[locale] = f"Sample text {locale}{suffix}".strip()
    return translation_map


_DOC_LOCALES = _get_translation_doc_locales()
_DOC_CREATE_TRANSLATION_EXAMPLE = {
    "code": "BTN_SAVE",
    "is_global": False,
    "translations": _build_translation_map_for_docs(_DOC_LOCALES),
}
_DOC_CREATE_TRANSLATION_BULK_EXAMPLE = [
    {
        "code": "BTN_SAVE",
        "is_global": False,
        "translations": _build_translation_map_for_docs(_DOC_LOCALES),
    },
    {
        "code": "BTN_CANCEL",
        "is_global": True,
        "translations": _build_translation_map_for_docs(_DOC_LOCALES, suffix=" cancel"),
    },
]
_DOC_PATCH_TRANSLATION_EXAMPLE = {
    # "translation_code": "BTN_SAVE_NEW",
    "translations": _build_translation_map_for_docs(_DOC_LOCALES, suffix=" updated"),
}


def _flatten_translation_page_to_code_text(
    records: list[dict[str, dict[str, str]]],
    locale: str,
) -> dict[str, str]:
    """
    Convert paginated records [{CODE: {locale: text}}, ...] to {CODE: text} for the resolved locale.
    """
    out: dict[str, str] = {}
    for item in records:
        for code, locale_map in item.items():
            if not isinstance(locale_map, dict):
                continue
            text = locale_map.get(locale)
            if text is None and locale_map:
                text = next(iter(locale_map.values()))
            out[code] = text if text is not None else ""
    return out


def _translation_detail_public_payload(data: dict) -> dict:
    """Return public translation detail shape without audit/app metadata."""
    return {
        "id": data.get("id"),
        "code": data.get("code"),
        "default_text": data.get("default_text"),
        "translations": data.get("translations", {}),
    }


def _translation_master_response_payload(row: object, app_id_hint: int | None = None) -> dict:
    """
    Serialize translation master row and ensure app_id is populated from app_key when available.
    """
    data = SystemLanguageTranslationResponseSchema.model_validate(row).model_dump(mode="json")
    if app_id_hint is not None:
        data["app_id"] = app_id_hint
        return data

    app_key_value = row.get("app_key") if isinstance(row, dict) else getattr(row, "app_key", None)
    if app_key_value:
        data["app_id"] = service.resolve_app_key_to_app_id(app_key_value)
    else:
        data["app_id"] = None
    return data


@router.get(
    "",
    summary="Get translations",
    description="Get translations. Without `other_language`, `data` is a flat map `{ translation_code: text }` for the locale from Accept-Language (fallback: system default). With `other_language` (a locale or `all`), `data` is a list of `{ code: { locale: text } }` objects. Scope is the app from X-Api-Key (merged global + app); `is_global=true` forces global only. Optional `search` (requires `search_by`: trans_code, default_text, translation_text), `sort_field`, `sort_order` (asc/desc). Set `export=true` for XLSX (same filter/sort apply).",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Translations returned", "model": SuccessResponse},
        400: {"description": "Invalid search or sort parameters", "model": ErrorResponse},
        404: {"description": "Application not found for app_key", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_translations(
    app_key: str = Depends(get_app_key),
    locale: str = Depends(get_core_locale),
    other_language: str | None = Query(
        None,
        description="Additional target translation language. Use a locale code (e.g. fr) or 'all' to include all languages. Default language is resolved from Accept-Language (fallback: system default language).",
        alias="other_language",
    ),
    export: bool = Query(
        False,
        description="Export translations as XLSX for the app resolved from X-Api-Key (merged global + app translations).",
        alias="export",
    ),
    is_global: bool = Query(
        False,
        description="When true, ignore X-Api-Key app scope and return global translations only (app_key IS NULL).",
        alias="is_global",
    ),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int | None = Query(
        None,
        ge=1,
        le=1000,
        description="Number of records per page; omit for no pagination (all records)",
        alias="page_size",
    ),
    search: str | None = Query(
        None,
        description="Case-insensitive substring filter; requires search_by when non-empty.",
        alias=QUERY_SEARCH,
    ),
    search_by: str | None = Query(
        None,
        description=f"Field to search: {', '.join(TRANSLATION_LIST_SEARCH_BY_FIELDS)}",
        alias=QUERY_SEARCH_BY,
    ),
    sort_order: str | None = Query(
        "asc",
        description="Sort order: asc or desc",
        alias=QUERY_SORT_ORDER,
    ),
    sort_field: str | None = Query(
        "trans_code",
        description=f"Sort field: {', '.join(TRANSLATION_LIST_SORT_FIELDS)}",
        alias=QUERY_SORT_FIELD,
    ),
):
    """
    Get translations scoped by app_key resolved from X-Api-Key.

    - `GET /translations` -> merged global + resolved app rows; `data` is `{ code: text }`
    - `GET /translations?other_language=...` or `all` -> `data` is list of `{ code: { locale: text } }`
    - `GET /translations?is_global=true` -> global rows only
    - `GET /translations?export=true` -> export merged global + resolved app rows as XLSX

    Locale is resolved from Accept-Language header; falls back to default locale.
    For each master row, i18n text is used when (master_id, locale) exists;
    otherwise default_text is used.
    """
    app_key_filter = None if is_global else (app_key.strip() if app_key else None)

    if app_key_filter is not None:
        if service.resolve_app_key_to_app_id(app_key_filter) is None:
            raise NotFound(
                f"Application identifier {app_key_filter} not found",
                identifier=str(app_key_filter),
            )

    search_term = (search or "").strip()
    if search_term and not (search_by or "").strip():
        raise BadRequest(
            "search_by is required when search is provided "
            f"({', '.join(TRANSLATION_LIST_SEARCH_BY_FIELDS)})",
        )
    search_by_value = (search_by or "").strip() or None
    if search_by_value and search_by_value not in TRANSLATION_LIST_SEARCH_BY_FIELDS:
        raise BadRequest(
            "search_by must be one of: "
            f"{', '.join(TRANSLATION_LIST_SEARCH_BY_FIELDS)}",
        )
    sort_field_value = (sort_field or "trans_code").strip()
    if sort_field_value not in TRANSLATION_LIST_SORT_FIELDS:
        raise BadRequest(
            "sort_field must be one of: "
            f"{', '.join(TRANSLATION_LIST_SORT_FIELDS)}",
        )
    sort_order_value = (sort_order or "asc").strip().lower()
    if sort_order_value not in ("asc", "desc"):
        raise BadRequest("sort_order must be asc or desc")

    if export:
        output, filename = service.get_translation_export_xlsx(
            app_key_filter=app_key_filter,
            search=search,
            search_by=search_by_value,
            sort_field=sort_field_value,
            sort_order=sort_order_value,
        )
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    records, total_count, effective_page_size, total_count_unfiltered_raw = (
        service.get_translations_for_locale_paginated(
        locale=locale,
        app_key_filter=app_key_filter,
        page=page,
        page_size=page_size,
        requested_locale=other_language,
        search=search,
        search_by=search_by_value,
        sort_field=sort_field_value,
        sort_order=sort_order_value,
        )
    )
    if effective_page_size is not None:
        total_pages = (total_count + effective_page_size - 1) // effective_page_size if total_count else 0
        meta_page, meta_page_size = page, effective_page_size
    else:
        total_pages = 1
        meta_page, meta_page_size = 1, total_count
    wants_multi_locale = bool((other_language or "").strip())
    response_records = records
    if not wants_multi_locale:
        response_records = _flatten_translation_page_to_code_text(records, locale)

    has_list_filters = bool(search and search.strip())
    meta = build_list_pagination_meta(
        total_count=total_count,
        count=len(response_records),
        page=meta_page,
        page_size=meta_page_size,
        total_pages=total_pages,
        total_count_unfiltered=resolve_unfiltered_total(
            total_count,
            total_count_unfiltered_raw,
            has_list_filters=has_list_filters,
        ),
    )
    scope = "global" if app_key_filter is None else f"app '{app_key_filter}'"
    locale_label = (other_language or "").strip() or locale
    return success_response(
        message=f"Retrieved {len(records)} translation(s) for locale '{locale_label}' and {scope}",
        data=response_records,
        meta=meta,
    )


@router.get(
    "/{translation_code}",
    summary="Get translation by code",
    description="Get a single translation row and all locale texts using unique translation code.",
    response_model=SuccessResponse,
    responses={
        200: {"description": "Translation returned", "model": SuccessResponse},
        404: {"description": "Translation not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def get_translation_by_code(
    translation_code: str = Path(..., description="Unique translation code"),
):
    """
    Get one translation row by unique code, including locale-specific text entries.

    **Path parameter:** `translation_code` – unique translation code.

    **Response:** `data` – translation object with metadata and `translations` map.
    """
    data = service.get_translation_by_code(translation_code=translation_code)
    if not data:
        raise NotFound(
            f"Translation identifier {translation_code} not found",
            identifier=str(translation_code),
        )
    return success_response(
        message="Translation retrieved successfully",
        data=jsonable_encoder(_translation_detail_public_payload(data)),
    )


@router.post(
    "/import",
    summary="Import translations from Excel",
    description=(
        "Import translations from an XLSX file with the same format as export: "
        "first column 'Code', remaining columns locale codes from system-language. "
        "Pass app_key as query parameter for app-scoped import, or omit/blank for global import."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Translations imported", "model": SuccessResponse},
        404: {"description": "Application not found for app_key", "model": ErrorResponse},
        409: {"description": "Validation conflict (duplicate code/locale)", "model": ErrorResponse},
        413: {
            "description": "Uploaded file exceeds ALLOWED_IMPORT_FILE_SIZE_MB (MiB), or legacy ALLOWED_IMPORT_FILE_SIZE_BYTES if MB unset; tune via system_configuration / PATCH /app-config",
            "model": ErrorResponse,
        },
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def import_translations(
    file: UploadFile = File(
        ...,
        description="XLSX file where column 1 is Code and next columns are locale codes.",
    ),
    app_key: str | None = Query(
        None,
        description="Application key from system_application table. Omit/blank for global scope.",
    ),
    caller_app_key: str = Depends(get_app_key),
    current_user_id: int = Depends(get_current_user_id),
):
    app_key_filter = app_key.strip() if app_key is not None else None
    if app_key_filter == "":
        app_key_filter = None

    if app_key_filter is not None:
        app_id = service.resolve_app_key_to_app_id(app_key_filter)
        if app_id is None:
            raise NotFound(
                f"Application identifier {app_key_filter} not found",
                identifier=str(app_key_filter),
            )

    limit_app_key = app_key_filter if app_key_filter is not None else caller_app_key
    max_upload = get_allowed_import_file_size_bytes(limit_app_key)

    try:
        file_bytes = await read_import_upload_bytes(file, max_upload)
    except ImportUploadTooLarge as e:
        raise AppException(
            import_upload_too_large_message(e.max_bytes),
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            error_code="IMPORT_FILE_TOO_LARGE",
        )
    result = service.import_translations_from_xlsx(
        file_bytes=file_bytes,
        app_key_filter=app_key_filter,
        user_id=current_user_id,
    )
    return success_response(
        message=(
            f"Imported translations for '{result['app_key']}' scope "
            f"(inserted={result['inserted']}, updated={result['updated']}, "
            f"skipped_empty_code={result['skipped_empty_code']})"
        ),
        data=result,
    )


@router.post(
    "/multiple-delete",
    summary="Delete multiple translations",
    description=(
        "Delete multiple translations by code. Request body is a JSON array of translation codes. "
        "Each code uses the same resolution as DELETE /translations/{translation_code}: "
        "app scope from X-Api-Key first, then global (app_key NULL). "
        "Returns partial success: deleted codes in data.deleted; failures in meta.errors."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Bulk delete completed (check meta.errors for partial failures)", "model": SuccessResponse},
        404: {"description": "Application not found for resolved app key", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def multiple_delete_translations(
    translation_codes: List[str] = Body(
        ...,
        description="List of translation codes to delete",
        examples=[["SAVE", "CANCEL", "HOME"]],
    ),
    app_key: str = Depends(get_app_key),
):
    if not translation_codes:
        return success_response(
            message="No translation codes provided",
            data={"deleted": []},
        )
    resolved_app_key = app_key.strip() if app_key and app_key.strip() else None
    if resolved_app_key is not None and service.resolve_app_key_to_app_id(resolved_app_key) is None:
        raise NotFound(
            f"Application identifier {resolved_app_key} not found",
            identifier=str(resolved_app_key),
        )

    result = service.multiple_delete_translations(
        translation_codes=translation_codes,
        resolved_app_key=resolved_app_key,
    )
    deleted = result.get("deleted") or []
    errors = result.get("errors") or []
    meta = {"errors": errors} if errors else None
    message = f"{len(deleted)} translation(s) deleted successfully"
    if errors:
        message += f", {len(errors)} failed"
    return success_response(
        message=message,
        data={"deleted": deleted},
        meta=meta,
    )


@router.post(
    "",
    summary="Create translation",
    description="Create one or more translations. App scope is resolved from X-Api-Key by default; set is_global=true in payload for global translation. Translation locales must exist in system-language.",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Translation created", "model": SuccessResponse},
        404: {"description": "Application not found", "model": ErrorResponse},
        409: {"description": "Duplicate code in scope", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def create_translation(
    payload: SystemLanguageTranslationCreateSchema | List[SystemLanguageTranslationCreateSchema] = Body(
        ...,
        example=_DOC_CREATE_TRANSLATION_BULK_EXAMPLE,
        examples={
            "single": {"summary": "Single translation", "value": _DOC_CREATE_TRANSLATION_EXAMPLE},
            "bulk": {"summary": "Bulk translations", "value": _DOC_CREATE_TRANSLATION_BULK_EXAMPLE},
        },
    ),
    app_key: str = Depends(get_app_key),
    current_user_id: int = Depends(get_current_user_id),
):
    items = payload if isinstance(payload, list) else [payload]
    if not items:
        raise BadRequest("Request body must be a non-empty array of translation objects")

    response_data: list[dict] = []
    errors: list[dict] = []
    for idx, item in enumerate(items):
        try:
            app_key_filter = None if item.is_global else (app_key.strip() if app_key else None)

            if app_key_filter is not None:
                app_id = service.resolve_app_key_to_app_id(app_key_filter)
                if app_id is None:
                    errors.append({"index": idx, "error": f"Application identifier {app_key_filter} not found"})
                    continue
            else:
                app_id = None

            row = service.create_translation(
                payload=item,
                user_id=current_user_id,
                app_key_filter=app_key_filter,
            )
            serialized = _translation_master_response_payload(row, app_id_hint=app_id)
            response_data.append(serialized)
        except Exception as item_error:
            errors.append({"index": idx, "error": str(item_error)})

    count = len(response_data)
    message = f"{count} translation(s) created successfully" + (f", {len(errors)} failed" if errors else "")
    meta: dict = {"count": count}
    if errors:
        meta["errors"] = errors
    return success_response(
        message=message,
        data=response_data,
        status_code=status.HTTP_201_CREATED,
        meta=meta,
    )


@router.patch(
    "/{translation_code}",
    summary="Patch translation by code",
    description=(
        "Update a translation for the given code. Resolves the row by X-Api-Key app scope first, "
        "then falls back to global scope (app_key NULL) when no app-specific row exists."
    ),
    response_model=SuccessResponse,
    responses={
        200: {"description": "Translation updated", "model": SuccessResponse},
        404: {"description": "Translation not found", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def patch_translation_by_code(
    translation_code: str = Path(..., description="Unique translation code"),
    payload: SystemLanguageTranslationPatchSchema = Body(
        ...,
        example=_DOC_PATCH_TRANSLATION_EXAMPLE,
    ),
    app_key: str = Depends(get_app_key),
    current_user_id: int = Depends(get_current_user_id),
):
    resolved_app_key = app_key.strip() if app_key and app_key.strip() else None
    if resolved_app_key is not None and service.resolve_app_key_to_app_id(resolved_app_key) is None:
        raise NotFound(
            f"Application identifier {resolved_app_key} not found",
            identifier=str(resolved_app_key),
        )
    row = service.patch_translation(
        translation_code=translation_code,
        payload=payload,
        user_id=current_user_id,
        resolved_app_key=resolved_app_key,
    )
    if not row:
        raise NotFound(
            f"Translation identifier {translation_code} not found",
            identifier=str(translation_code),
        )
    data = _translation_master_response_payload(row)
    return success_response(message="Translation updated successfully", data=data)


@router.delete(
    "/{translation_code}",
    summary="Delete translation by code",
    description=(
        "Delete a translation for the given code and cascade-delete its i18n rows. "
        "Resolves the row by X-Api-Key app scope first, then falls back to global scope (app_key NULL) "
        "when no app-specific row exists."
    ),
    response_model=SuccessResponse,
    responses={
        204: {"description": "Translation deleted"},
        404: {"description": "Translation not found", "model": ErrorResponse},
        409: {"description": "Conflict – duplicate rows for the same scope", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
)
async def delete_translation_by_code(
    translation_code: str = Path(..., description="Unique translation code"),
    app_key: str = Depends(get_app_key),
):
    resolved_app_key = app_key.strip() if app_key and app_key.strip() else None
    if resolved_app_key is not None and service.resolve_app_key_to_app_id(resolved_app_key) is None:
        raise NotFound(
            f"Application identifier {resolved_app_key} not found",
            identifier=str(resolved_app_key),
        )
    deleted = service.delete_translation(
        translation_code=translation_code,
        resolved_app_key=resolved_app_key,
    )
    if not deleted:
        raise NotFound(
            f"Translation identifier {translation_code} not found",
            identifier=str(translation_code),
        )
    return no_content_response()
