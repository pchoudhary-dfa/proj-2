"""
Dashboard section service — CRUD and default section creation on dashboard create.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from apps.app_dashboard.constants import DEFAULT_SECTION_LABEL
from apps.app_dashboard.models.dashboard import DashboardSection
from apps.app_dashboard.schemas.section import (
    SectionBulkUpdateRequest,
    SectionCreateRequest,
    SectionPatchRequest,
    SectionResponse,
)
from apps.app_dashboard.services.visualization_service import _assert_dashboard_exists
from apps.app_dashboard.utils.dashboard_serialization import (
    bool_from_smallint,
    bool_to_smallint,
    parse_json_field,
)
from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.shared.exceptions import BadRequest, InternalError, NotFound

SECTION_NAME_MAX_LENGTH = 512


def _dw_language_codes(system_dw_id: int | str) -> list[str]:
    """Return warehouse language codes or raise when none are registered."""
    language_codes = get_dw_language_codes(str(system_dw_id))
    if not language_codes:
        raise InternalError(
            f"No languages found for data warehouse '{system_dw_id}'",
            error_code="DW_LANGUAGES_NOT_FOUND",
        )
    return language_codes


def expand_section_name(system_dw_id: int | str, name_input: dict[str, str]) -> str:
    """
    Expand a single label across all warehouse languages (legacy addEditSection create).

    Used on create/default only. Distinct per-locale values are not preserved;
    the last non-empty provided value is copied to every DW locale.
    """
    language_codes = _dw_language_codes(system_dw_id)

    label: Optional[str] = None
    for value in name_input.values():
        if value is not None and str(value).strip():
            label = str(value).strip()

    if label is None:
        label = DEFAULT_SECTION_LABEL

    names = {code: label for code in language_codes}
    return _serialize_section_name(names)


def serialize_provided_section_name(
    system_dw_id: int | str,
    name_input: dict[str, str],
) -> str:
    """
    Persist section_name JSON exactly as provided by the client (PATCH / bulk).

    Replaces the stored i18n object; warehouse locales not in the payload are not
    filled or merged from existing values.
    """
    _ = system_dw_id  # reserved for future validation; not used for expansion

    cleaned: dict[str, str] = {}
    for code, value in name_input.items():
        if value is not None and str(value).strip():
            cleaned[str(code)] = str(value).strip()

    if not cleaned:
        raise BadRequest(
            "section_name must include at least one non-empty locale value",
            error_code="SECTION_NAME_EMPTY",
        )

    return _serialize_section_name(cleaned)


def build_default_section_name(dw_id: str, label: str = DEFAULT_SECTION_LABEL) -> str:
    """
    Build legacy-style multilingual section name JSON for all warehouse locales.

    Legacy PHP expands the default ``{"en": "Section 1"}`` label across every
    language registered in the linked warehouse's ``ut_language`` table.
    """
    return expand_section_name(dw_id, {"en": label})


def _serialize_section_name(names: dict[str, str]) -> str:
    """Serialize i18n section name JSON and enforce VARCHAR(512) limit."""
    serialized = json.dumps(names, separators=(",", ":"))
    if len(serialized) > SECTION_NAME_MAX_LENGTH:
        raise BadRequest(
            f"section_name exceeds maximum length of {SECTION_NAME_MAX_LENGTH} characters",
            error_code="SECTION_NAME_TOO_LONG",
        )
    return serialized


def _to_section_response(section: DashboardSection) -> SectionResponse:
    """Map ORM row to API response with parsed section_name and bool flags."""
    parsed_name = parse_json_field(section.section_name)
    section_name: Any = parsed_name if parsed_name is not None else section.section_name
    return SectionResponse(
        id=section.id,
        section_name=section_name,
        hide_global_filter=bool_from_smallint(section.hide_global_filter),
        order=section.order,
        reload_section=bool_from_smallint(section.reload_section),
        resolution=section.resolution,
    )


def _get_section_or_404(
    db: Session,
    dashboard_id: int,
    section_id: int,
) -> DashboardSection:
    """Fetch section scoped to a dashboard; raise NotFound if missing."""
    section = (
        db.query(DashboardSection)
        .filter(
            DashboardSection.id == section_id,
            DashboardSection.dashboard_id == dashboard_id,
        )
        .first()
    )
    if not section:
        raise NotFound(
            f"Section with id {section_id} not found in dashboard {dashboard_id}",
            error_code="SECTION_NOT_FOUND",
        )
    return section


def _next_section_order(db: Session, dashboard_id: int) -> int:
    """Return max order + 1 for a dashboard (legacy addEditSection default)."""
    count = (
        db.query(DashboardSection)
        .filter(DashboardSection.dashboard_id == dashboard_id)
        .count()
    )
    return count + 1


def _default_create_label(db: Session, dashboard_id: int) -> str:
    """Default label for a new section: 'Section N' where N = count + 1."""
    return f"Section {_next_section_order(db, dashboard_id)}"


def list_sections(db: Session, dashboard_id: int) -> list[SectionResponse]:
    """List all sections for a dashboard ordered by display order."""
    _assert_dashboard_exists(db, dashboard_id)
    rows = (
        db.query(DashboardSection)
        .filter(DashboardSection.dashboard_id == dashboard_id)
        .order_by(DashboardSection.order.asc(), DashboardSection.id.asc())
        .all()
    )
    return [_to_section_response(row) for row in rows]


def create_section(
    db: Session,
    dashboard_id: int,
    payload: SectionCreateRequest,
    user_id: int,
) -> SectionResponse:
    """Create a dashboard section (legacy addEditSection create path)."""
    dashboard = _assert_dashboard_exists(db, dashboard_id)
    order = payload.order if payload.order is not None else _next_section_order(db, dashboard_id)

    if payload.section_name is not None:
        section_name = expand_section_name(dashboard.system_dw_id, payload.section_name)
    else:
        section_name = build_default_section_name(
            str(dashboard.system_dw_id),
            _default_create_label(db, dashboard_id),
        )

    section = DashboardSection(
        section_name=section_name,
        dashboard_id=dashboard_id,
        hide_global_filter=0,
        order=order,
        reload_section=0,
        resolution=None,
        created_user_id=user_id,
        modified_user_id=user_id,
    )
    db.add(section)
    db.flush()
    return _to_section_response(section)


def update_section(
    db: Session,
    dashboard_id: int,
    section_id: int,
    payload: SectionPatchRequest,
    user_id: int,
) -> SectionResponse:
    """Partially update a single dashboard section."""
    dashboard = _assert_dashboard_exists(db, dashboard_id)
    section = _get_section_or_404(db, dashboard_id, section_id)

    if (
        payload.section_name is None
        and payload.order is None
        and payload.hide_global_filter is None
        and payload.reload_section is None
        and payload.resolution is None
    ):
        raise BadRequest(
            "At least one field must be provided for update",
            error_code="SECTION_UPDATE_EMPTY",
        )

    if payload.section_name is not None:
        section.section_name = serialize_provided_section_name(
            dashboard.system_dw_id,
            payload.section_name,
        )

    if payload.order is not None:
        section.order = payload.order

    if payload.hide_global_filter is not None:
        section.hide_global_filter = bool_to_smallint(payload.hide_global_filter)

    if payload.reload_section is not None:
        section.reload_section = bool_to_smallint(payload.reload_section)

    if payload.resolution is not None:
        section.resolution = payload.resolution or None

    section.modified_user_id = user_id
    db.flush()
    return _to_section_response(section)


def delete_section(db: Session, dashboard_id: int, section_id: int) -> None:
    """Delete a section row only (legacy deleteSection parity)."""
    _assert_dashboard_exists(db, dashboard_id)
    section = _get_section_or_404(db, dashboard_id, section_id)
    db.delete(section)
    db.flush()


def bulk_update_sections(
    db: Session,
    dashboard_id: int,
    payload: SectionBulkUpdateRequest,
    user_id: int,
) -> list[SectionResponse]:
    """Batch-update sections (legacy updateSections / service 146)."""
    dashboard = _assert_dashboard_exists(db, dashboard_id)

    for item in payload.sections:
        section = _get_section_or_404(db, dashboard_id, item.id)
        section.section_name = serialize_provided_section_name(
            dashboard.system_dw_id,
            item.section_name,
        )

        if item.hide_global_filter is not None:
            section.hide_global_filter = bool_to_smallint(item.hide_global_filter)

        if item.reload_section is not None:
            section.reload_section = bool_to_smallint(item.reload_section)

        if item.resolution is not None:
            section.resolution = item.resolution or None

        if item.order is not None:
            section.order = item.order

        section.modified_user_id = user_id

    db.flush()
    return list_sections(db, dashboard_id)


def create_default_section(
    db: Session,
    *,
    dashboard_id: int,
    system_dw_id: int,
    user_id: int,
) -> DashboardSection:
    """Insert the first default section for a newly created dashboard."""
    section = DashboardSection(
        section_name=build_default_section_name(str(system_dw_id)),
        dashboard_id=dashboard_id,
        hide_global_filter=0,
        order=1,
        reload_section=0,
        resolution=None,
        created_user_id=user_id,
        modified_user_id=user_id,
    )
    db.add(section)
    return section
