"""
SSO auto-provision helpers — extract warehouse context from DM deep-link paths.
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from apps.shared.config.config import settings

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_LOCALE_SEGMENT_RE = re.compile(r"^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$")

# DM app-level route segments (second path segment) — not warehouse IDs.
_DM_APP_LEVEL_SEGMENTS = frozenset(
    {
        "datawarehouse",
        "administration",
        "translations",
        "preferences",
        "version-log",
        "auth",
    }
)


def parse_dw_id_from_return_path(return_to: str | None) -> int | None:
    """
    Parse a numeric warehouse id from a DM return path like ``/en/1/overview``.

    Returns ``None`` when the path is not warehouse-scoped.
    """
    if not return_to:
        return None

    path = return_to.split("?", 1)[0].strip()
    if not path.startswith("/"):
        return None

    segments = [s for s in path.split("/") if s]
    if len(segments) < 2:
        return None

    locale, candidate = segments[0], segments[1]
    if not _LOCALE_SEGMENT_RE.match(locale):
        return None
    if candidate.lower() in _DM_APP_LEVEL_SEGMENTS:
        return None
    if not candidate.isdigit():
        return None

    return int(candidate)


def extract_provisioning_dw_id(
    return_to: str | None,
    initiating_app_key: str | None,
    db: "Session | None" = None,
) -> int | None:
    """
    Resolve warehouse id for SSO auto-provision role assignment.

    Only applies when login was initiated from Data Manager (``DFA_DM_APP_KEY``).
    When *db* is provided, verifies the warehouse exists; unknown ids return ``None``.
    """
    if not initiating_app_key or initiating_app_key != settings.DFA_DM_APP_KEY:
        return None

    candidate = parse_dw_id_from_return_path(return_to)
    if candidate is None:
        return None

    if db is None:
        return candidate

    if not _warehouse_exists(db, candidate):
        logger.warning(
            "SSO provisioning: dw_id %s from return_to %r not found in system_datawarehouse",
            candidate,
            return_to,
        )
        return None

    return candidate


def _warehouse_exists(db: "Session", dw_id: int) -> bool:
    from apps.app_db.models.core import SystemDatawarehouse

    return (
        db.query(SystemDatawarehouse.id)
        .filter(SystemDatawarehouse.id == dw_id)
        .first()
        is not None
    )
