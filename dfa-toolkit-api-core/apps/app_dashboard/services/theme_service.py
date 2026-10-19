"""
Header/Footer theme library service — CRUD and copy for dash_header_footer.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from apps.app_dashboard.models.dashboard import DashboardHeaderFooter
from apps.app_dashboard.schemas.theme import (
    ThemeCreateRequest,
    ThemePatchRequest,
    ThemeResponse,
)
from apps.app_dashboard.utils.dashboard_serialization import (
    parse_json_field,
    serialize_json_column,
)
from apps.shared.exceptions import Conflict, NotFound


def _to_theme_response(theme: DashboardHeaderFooter) -> ThemeResponse:
    return ThemeResponse(
        id=theme.id,
        theme_name=theme.theme_name,
        web_header_html=theme.web_header_html,
        web_footer_html=theme.web_footer_html,
        mobile_header_html=theme.mobile_header_html,
        mobile_footer_html=theme.mobile_footer_html,
        settings=parse_json_field(theme.settings),
        user_id=theme.user_id,
        created=theme.created,
        modified=theme.modified,
    )


def _get_theme_or_404(db: Session, theme_id: int) -> DashboardHeaderFooter:
    theme = (
        db.query(DashboardHeaderFooter)
        .filter(DashboardHeaderFooter.id == theme_id)
        .first()
    )
    if not theme:
        raise NotFound(
            f"Theme with id {theme_id} not found",
            error_code="THEME_NOT_FOUND",
        )
    return theme


def _assert_theme_name_available(
    db: Session,
    *,
    user_id: int,
    theme_name: str,
    exclude_theme_id: int | None = None,
) -> None:
    name = (theme_name or "").strip()
    if not name:
        return
    query = db.query(DashboardHeaderFooter.id).filter(
        DashboardHeaderFooter.user_id == user_id,
        DashboardHeaderFooter.theme_name == name,
    )
    if exclude_theme_id is not None:
        query = query.filter(DashboardHeaderFooter.id != exclude_theme_id)
    if query.first():
        raise Conflict(
            f"Theme with name '{name}' already exists for this user",
            error_code="THEME_NAME_EXISTS",
        )


def list_themes(db: Session, user_id: int) -> list[ThemeResponse]:
    """Return themes owned by the current user (legacy getHeaderFooterList)."""
    rows = (
        db.query(DashboardHeaderFooter)
        .filter(DashboardHeaderFooter.user_id == user_id)
        .order_by(DashboardHeaderFooter.id.asc())
        .all()
    )
    return [_to_theme_response(row) for row in rows]


def get_theme(db: Session, theme_id: int) -> ThemeResponse:
    """Return a theme by id (legacy getHeaderFooterDetails)."""
    return _to_theme_response(_get_theme_or_404(db, theme_id))


def create_theme(
    db: Session,
    payload: ThemeCreateRequest,
    user_id: int,
) -> ThemeResponse:
    """Create a header/footer theme owned by the current user."""
    name = payload.theme_name.strip()
    _assert_theme_name_available(db, user_id=user_id, theme_name=name)

    theme = DashboardHeaderFooter(
        user_id=user_id,
        theme_name=name,
        web_header_html=payload.web_header_html,
        web_footer_html=payload.web_footer_html,
        mobile_header_html=payload.mobile_header_html,
        mobile_footer_html=payload.mobile_footer_html,
        settings=serialize_json_column(payload.settings),
        modified_user_id=user_id,
    )
    db.add(theme)
    db.flush()
    return _to_theme_response(theme)


def update_theme(
    db: Session,
    theme_id: int,
    payload: ThemePatchRequest,
    user_id: int,
) -> ThemeResponse:
    """Partially update a theme by id (no owner check; IAM PERMISSION)."""
    theme = _get_theme_or_404(db, theme_id)
    fields_set = payload.model_fields_set

    if "theme_name" in fields_set and payload.theme_name is not None:
        name = payload.theme_name.strip()
        _assert_theme_name_available(
            db,
            user_id=theme.user_id,
            theme_name=name,
            exclude_theme_id=theme.id,
        )
        theme.theme_name = name

    if "web_header_html" in fields_set:
        theme.web_header_html = payload.web_header_html
    if "web_footer_html" in fields_set:
        theme.web_footer_html = payload.web_footer_html
    if "mobile_header_html" in fields_set:
        theme.mobile_header_html = payload.mobile_header_html
    if "mobile_footer_html" in fields_set:
        theme.mobile_footer_html = payload.mobile_footer_html
    if "settings" in fields_set:
        theme.settings = serialize_json_column(payload.settings)

    theme.modified_user_id = user_id
    db.flush()
    return _to_theme_response(theme)


def delete_theme(db: Session, theme_id: int) -> None:
    """Hard-delete a theme by id (dashboards keep copied HTML)."""
    theme = _get_theme_or_404(db, theme_id)
    db.delete(theme)
    db.flush()


def copy_theme(db: Session, theme_id: int, user_id: int) -> ThemeResponse:
    """
    Clone a theme for the current user (legacy createHeaderFooterCopy).

    New owner is the current user; name is ``{source}-Copy``.
    """
    source = _get_theme_or_404(db, theme_id)
    base_name = (source.theme_name or "Theme").strip() or "Theme"
    new_name = f"{base_name}-Copy"
    _assert_theme_name_available(db, user_id=user_id, theme_name=new_name)

    theme = DashboardHeaderFooter(
        user_id=user_id,
        theme_name=new_name,
        web_header_html=source.web_header_html,
        web_footer_html=source.web_footer_html,
        mobile_header_html=source.mobile_header_html,
        mobile_footer_html=source.mobile_footer_html,
        settings=source.settings,
        modified_user_id=user_id,
    )
    db.add(theme)
    db.flush()
    return _to_theme_response(theme)
