"""
Size limits for XLSX/CSV import uploads (translations, datapoints, areas).

Limit is stored per app in ``system_configuration`` under key ALLOWED_IMPORT_FILE_SIZE_MB
(integer megabytes as MiB / 1024² bytes), seeded from ``apps/app_db/data/config.json``.
Legacy key ALLOWED_IMPORT_FILE_SIZE_BYTES (raw byte count) is still read if the MB key is absent.
PATCH ``/app-config`` updates apply after cache invalidation.
"""
from __future__ import annotations

import logging

from fastapi import UploadFile

_CHUNK = 65536
_MIB = 1024 * 1024

logger = logging.getLogger(__name__)

ALLOWED_IMPORT_FILE_SIZE_MB_KEY_CODE = "ALLOWED_IMPORT_FILE_SIZE_MB"
LEGACY_ALLOWED_IMPORT_FILE_SIZE_BYTES_KEY_CODE = "ALLOWED_IMPORT_FILE_SIZE_BYTES"
APP_CONFIG_IMPORT_FILE_SIZE_CACHE_KEYS = frozenset(
    {
        ALLOWED_IMPORT_FILE_SIZE_MB_KEY_CODE,
        LEGACY_ALLOWED_IMPORT_FILE_SIZE_BYTES_KEY_CODE,
    }
)

DEFAULT_ALLOWED_IMPORT_FILE_SIZE_MB = 50

_import_size_cache: dict[str, int] = {}


def invalidate_allowed_import_file_size_cache_for_app(app_key: str) -> None:
    """Clear cached byte limit for app_key (e.g. after PATCH /app-config updates the key)."""
    _import_size_cache.pop(app_key, None)


def _parse_positive_int(raw: object) -> int | None:
    try:
        v = int(str(raw).strip())
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None


def _fetch_allowed_import_bytes_from_db(app_key: str) -> int | None:
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import SystemConfiguration

    try:
        with SessionLocal() as db:
            mb_row = (
                db.query(SystemConfiguration)
                .filter(
                    SystemConfiguration.app_key == app_key,
                    SystemConfiguration.key_code == ALLOWED_IMPORT_FILE_SIZE_MB_KEY_CODE,
                )
                .first()
            )
            if mb_row and mb_row.key_value is not None and str(mb_row.key_value).strip():
                mb = _parse_positive_int(mb_row.key_value)
                if mb is not None:
                    return mb * _MIB
                logger.warning(
                    "Invalid %s for app_key=%s; trying legacy bytes key or default",
                    ALLOWED_IMPORT_FILE_SIZE_MB_KEY_CODE,
                    app_key,
                )

            legacy_row = (
                db.query(SystemConfiguration)
                .filter(
                    SystemConfiguration.app_key == app_key,
                    SystemConfiguration.key_code == LEGACY_ALLOWED_IMPORT_FILE_SIZE_BYTES_KEY_CODE,
                )
                .first()
            )
            if legacy_row and legacy_row.key_value is not None and str(legacy_row.key_value).strip():
                b = _parse_positive_int(legacy_row.key_value)
                if b is not None:
                    return b
                logger.warning(
                    "Invalid %s for app_key=%s; using default",
                    LEGACY_ALLOWED_IMPORT_FILE_SIZE_BYTES_KEY_CODE,
                    app_key,
                )
    except Exception as exc:
        logger.warning(
            "Could not read import file size limit from system_configuration (app_key=%s): %s",
            app_key,
            exc,
        )
    return None


def get_allowed_import_file_size_bytes(app_key: str) -> int:
    """
    Resolved byte limit from system_configuration for ``app_key``; caches per process.
    Uses ALLOWED_IMPORT_FILE_SIZE_MB (MiB) first, then legacy ALLOWED_IMPORT_FILE_SIZE_BYTES.
    Falls back to DEFAULT_ALLOWED_IMPORT_FILE_SIZE_MB if missing or invalid.
    """
    if app_key not in _import_size_cache:
        parsed = _fetch_allowed_import_bytes_from_db(app_key)
        if parsed is None or parsed <= 0:
            parsed = DEFAULT_ALLOWED_IMPORT_FILE_SIZE_MB * _MIB
        _import_size_cache[app_key] = parsed
    return _import_size_cache[app_key]


def import_upload_too_large_message(max_bytes: int) -> str:
    mib = max_bytes / _MIB
    human_mib = f"{mib:g} MiB" if mib == int(mib) else f"{mib:.2f} MiB"
    return (
        f"File exceeds maximum allowed size ({human_mib}, {max_bytes} bytes). "
        f"Increase {ALLOWED_IMPORT_FILE_SIZE_MB_KEY_CODE} in app configuration "
        "(system_configuration / PATCH /app-config) if needed."
    )


class ImportUploadTooLarge(Exception):
    """Raised when an upload exceeds max_bytes (see ALLOWED_IMPORT_FILE_SIZE_MB in system_configuration)."""

    def __init__(self, max_bytes: int) -> None:
        self.max_bytes = max_bytes
        super().__init__(max_bytes)


async def read_import_upload_bytes(upload: UploadFile, max_bytes: int) -> bytes:
    """
    Read the full upload body, rejecting if it exceeds max_bytes.
    Reads in chunks so oversized streams are not fully buffered.
    """
    if max_bytes < 0:
        raise ValueError("max_bytes must be non-negative")

    size_hint = getattr(upload, "size", None)
    if isinstance(size_hint, int) and size_hint > 0 and size_hint > max_bytes:
        raise ImportUploadTooLarge(max_bytes)

    parts: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise ImportUploadTooLarge(max_bytes)
        parts.append(chunk)
    return b"".join(parts)
