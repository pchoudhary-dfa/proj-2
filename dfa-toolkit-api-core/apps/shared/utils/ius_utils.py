"""
Shared IUS (Indicator-Unit-Subgroup) utilities for consistent GID handling across the application.
"""
import logging
from contextvars import ContextVar
from typing import Tuple

logger = logging.getLogger(__name__)

# Set by AccessControlMiddleware on every request to the resolved app_key.
# Falls back to empty string; get_ius_gid_separator() substitutes DFA_DM_APP_KEY when empty.
_current_app_key: ContextVar[str] = ContextVar("current_app_key", default="")

# Platform-wide cache (single entry under DFA_CORE).
_separator_cache: dict[str, str] = {}

IUS_GID_SEPARATOR_KEY_CODE = "IUS_GID_SEPARATOR"
_DEFAULT_SEPARATOR = "|"


def invalidate_ius_gid_separator_cache(app_key: str | None = None) -> None:
    """Drop cached separator values. Clears entire cache when app_key is None."""
    if app_key is None:
        _separator_cache.clear()
        return
    _separator_cache.pop(app_key, None)


def invalidate_ius_gid_separator_cache_for_app(app_key: str | None = None) -> None:
    """Backward-compatible alias; separator is platform-wide so always clears all."""
    invalidate_ius_gid_separator_cache(None)


def _read_separator_from_db(app_key: str) -> str | None:
    """Read IUS_GID_SEPARATOR from system_configuration for the given app_key."""
    from apps.app_db.db.core import SessionLocal
    from apps.app_db.models.core import SystemConfiguration

    try:
        with SessionLocal() as db:
            row = (
                db.query(SystemConfiguration)
                .filter(
                    SystemConfiguration.app_key == app_key,
                    SystemConfiguration.key_code == IUS_GID_SEPARATOR_KEY_CODE,
                )
                .first()
            )
            if row and row.key_value:
                return row.key_value.strip() or None
    except Exception as exc:
        logger.warning(
            "Could not read IUS_GID_SEPARATOR from system_configuration (app_key=%s): %s",
            app_key,
            exc,
        )
    return None


def _fetch_separator(app_key: str) -> str:
    """Read platform-wide separator from DFA_CORE; fall back to legacy per-product row."""
    from apps.app_db.constants.system_config import PLATFORM_CONFIG_APP_KEY

    val = _read_separator_from_db(PLATFORM_CONFIG_APP_KEY)
    if val:
        return val
    val = _read_separator_from_db(app_key)
    if val:
        return val
    return _DEFAULT_SEPARATOR


def get_ius_gid_separator() -> str:
    """
    Return the IUS composite GID separator (platform-wide).

    Resolves in order:
      1. ``DFA_CORE`` row in system_configuration (cached)
      2. Legacy per-product row for the request app_key (migration window)
      3. Default ``|``
    """
    from apps.app_db.constants.system_config import PLATFORM_CONFIG_APP_KEY
    from apps.shared.config.config import settings

    app_key = _current_app_key.get() or settings.DFA_DM_APP_KEY
    cache_key = PLATFORM_CONFIG_APP_KEY
    if cache_key not in _separator_cache:
        _separator_cache[cache_key] = _fetch_separator(app_key)
    return _separator_cache[cache_key]


def parse_ius_gid(ius_gid: str) -> Tuple[str, str, str]:
    """
    Parse IUS GID string into individual components.

    Args:
        ius_gid: IUS GID in format "i_gid<sep>u_gid<sep>s_gid"

    Returns:
        Tuple of (i_gid, u_gid, s_gid)

    Raises:
        ValueError: If IUS GID format is invalid
    """
    separator = get_ius_gid_separator()

    if not ius_gid or separator not in ius_gid:
        raise ValueError(f"Invalid IUS GID format. Expected format: i_gid{separator}u_gid{separator}s_gid")

    parts = ius_gid.split(separator)
    if len(parts) != 3:
        raise ValueError(f"IUS GID must have exactly 3 parts separated by '{separator}'")

    i_gid, u_gid, s_gid = parts[0].strip(), parts[1].strip(), parts[2].strip()
    if not i_gid or not u_gid or not s_gid:
        raise ValueError(f"All IUS GID parts must be non-empty: i_gid='{i_gid}', u_gid='{u_gid}', s_gid='{s_gid}'")

    return i_gid, u_gid, s_gid


def build_ius_gid(i_gid: str, u_gid: str, s_gid: str) -> str:
    """
    Build IUS GID string from individual components.

    Args:
        i_gid: Indicator GID
        u_gid: Unit GID
        s_gid: Subgroup GID

    Returns:
        IUS GID string
    """
    separator = get_ius_gid_separator()
    return f"{i_gid}{separator}{u_gid}{separator}{s_gid}"


def validate_ius_gid_format(ius_gid: str) -> bool:
    """
    Validate IUS GID format without raising exceptions.

    Args:
        ius_gid: IUS GID string to validate

    Returns:
        bool: True if format is valid, False otherwise
    """
    try:
        parse_ius_gid(ius_gid)
        return True
    except ValueError:
        return False
