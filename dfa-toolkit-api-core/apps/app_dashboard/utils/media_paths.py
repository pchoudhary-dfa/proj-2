"""Path helpers for dashboard media.

Only relative paths under the configured project files root are stored in the
database. API responses expose `/dash/media/{id}/content`, not filesystem paths.
"""

from __future__ import annotations

from pathlib import Path

from apps.app_dashboard.constants import DASH_MEDIA_FILES_ROOT
from apps.shared.exceptions import BadRequest


def get_project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def get_media_files_root() -> Path:
    return (get_project_root() / DASH_MEDIA_FILES_ROOT).resolve()


def resolve_media_file_path(file_path: str) -> Path:
    if not file_path:
        raise BadRequest("Media file path is empty", error_code="INVALID_MEDIA_PATH")

    root = get_media_files_root()
    candidate = (root / file_path).resolve()

    if root != candidate and root not in candidate.parents:
        raise BadRequest(
            "Media file path is outside the configured media root",
            error_code="INVALID_MEDIA_PATH",
        )

    return candidate


def build_media_url(upload_id: int) -> str:
    return f"/dash/media/{upload_id}/content"
