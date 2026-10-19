"""
Runtime configuration for the SSO package — populated by the host at startup.

``SsoConfig`` is a plain dataclass (deployment-time config: encryption key,
user table metadata).  ``get_sso_enabled`` reads from ``system_configuration``
with in-process TTL caching.  Frontend callback URLs are resolved from
``system_application_client.origin_url`` via host-injected callables.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Optional

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


@dataclass
class SsoConfig:
    """
    Deployment-time SSO configuration injected by the host application.

    Attributes:
        encryption_key:           Fernet key for encrypting id_token_enc at rest.
        user_table:               Name of the host's user table (documentation / soft FK).
        user_id_column:           PK column name in the user table.
        callback_url_resolver:    Callable ``(app_key) -> url`` that resolves the
                                  frontend callback URL for a given application
                                  (typically from ``system_application_client.origin_url``).
                                  Must raise or return empty when misconfigured — no fallback.
        sso_enabled_checker:      Optional callable ``(app_key) -> bool`` that checks
                                  whether SSO is enabled for a specific application.
                                  When ``None``, the adapter relies on its own
                                  ``is_sso_enabled`` dependency (DEFAULT_APP_KEY).
        provisioning_dw_id_resolver: Optional callable ``(return_to, app_key) -> int | None``
                                  for warehouse-scoped SSO auto-provision (host-specific).
    """

    encryption_key: str

    user_table: str = field(default="iam_user")
    user_id_column: str = field(default="id")

    callback_url_resolver: Optional[Callable[[str], str]] = field(default=None, repr=False)
    sso_enabled_checker: Optional[Callable[[str], bool]] = field(default=None, repr=False)
    provisioning_dw_id_resolver: Optional[
        Callable[[Optional[str], Optional[str]], Optional[int]]
    ] = field(default=None, repr=False)


# ── Cached DB reader for SSO config keys ─────────────────────────────────
# Pattern follows apps/shared/utils/ius_utils.py — per-app_key cache with TTL.

_SSO_CONFIG_CACHE: dict[tuple[str, str], tuple[str, float]] = {}
_CACHE_TTL_SECONDS: float = 60.0


def invalidate_sso_config_cache(app_key: str | None = None) -> None:
    """
    Drop cached SSO config values.

    Called after ``PATCH /app-config`` when SSO keys are updated.
    If ``app_key`` is ``None``, clear the entire cache.
    """
    if app_key is None:
        _SSO_CONFIG_CACHE.clear()
        return
    keys_to_drop = [k for k in _SSO_CONFIG_CACHE if k[0] == app_key]
    for k in keys_to_drop:
        _SSO_CONFIG_CACHE.pop(k, None)


def _read_system_config(db: Session, app_key: str, key_code: str) -> str | None:
    """One-off DB read from ``system_configuration``."""
    try:
        from apps.app_db.models.core import SystemConfiguration
        row = (
            db.query(SystemConfiguration)
            .filter(
                SystemConfiguration.app_key == app_key,
                SystemConfiguration.key_code == key_code,
            )
            .first()
        )
        if row and row.key_value is not None:
            return row.key_value.strip()
    except Exception as exc:
        logger.warning(
            "Could not read %s from system_configuration (app_key=%s): %s",
            key_code, app_key, exc,
        )
    return None


def _get_cached_config(db: Session, app_key: str, key_code: str, fallback: str) -> str:
    """Return cached value or fetch from DB, honouring TTL."""
    cache_key = (app_key, key_code)
    now = time.monotonic()

    entry = _SSO_CONFIG_CACHE.get(cache_key)
    if entry is not None:
        value, ts = entry
        if now - ts < _CACHE_TTL_SECONDS:
            return value

    value = _read_system_config(db, app_key, key_code) or fallback
    _SSO_CONFIG_CACHE[cache_key] = (value, now)
    return value


def get_sso_enabled(db: Session, app_key: str) -> bool:
    """
    Runtime check: is SSO enabled platform-wide?

    Reads ``SSO_ENABLED`` from the ``DFA_CORE`` platform row in
    ``system_configuration`` with a 60 s in-process cache.
    Falls back to the legacy per-``app_key`` row during the migration window
    (before the ``120_sso_dfa_core`` migration has run).
    Returns ``False`` when neither row exists.
    """
    from apps.app_db.constants.system_config import PLATFORM_CONFIG_APP_KEY

    # Prefer the platform-wide row; fall back to legacy per-product row.
    raw = _get_cached_config(db, PLATFORM_CONFIG_APP_KEY, "SSO_ENABLED", "")
    if not raw:
        raw = _get_cached_config(db, app_key, "SSO_ENABLED", "false")
    return raw.lower() in ("true", "1", "yes", "on")
