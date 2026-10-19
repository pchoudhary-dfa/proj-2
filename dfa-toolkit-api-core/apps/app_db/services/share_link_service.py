"""
Share link service: create and resolve short share-link codes.
Uses app_db SessionLocal; services own session lifecycle.
"""
import json
import uuid
from typing import Any, Optional

from apps.app_db.db.core import SessionLocal
from apps.app_db.models.core import SystemShareLink
from apps.shared.utils.log_event import log_background_incident

_SHARE_LINK_SERVICE_SOURCE = "apps.app_db.services.share_link_service"


def _generate_code() -> str:
    """Generate a short, URL-safe share-link code. Example: a3f1c9b0e2d8."""
    return uuid.uuid4().hex[:12]


class ShareLinkService:

    def create(
        self,
        fetch_params: dict[str, Any],
        chart_config: dict[str, Any],
        app_key: Optional[str] = None,
        dw_id: Optional[int] = None,
        user_id: Optional[int] = None,
    ) -> str:
        """Persist visualization state and return the short code."""
        code = _generate_code()
        payload = json.dumps({"fetchParams": fetch_params, "chartConfig": chart_config}, separators=(",", ":"))

        with SessionLocal() as db:
            row = SystemShareLink(
                code=code,
                payload=payload,
                app_key=app_key,
                dw_id=dw_id,
                created_by=user_id,
            )
            db.add(row)
            db.commit()

        return code

    def get_by_code(self, code: str) -> Optional[dict[str, Any]]:
        """Resolve a short code to {fetchParams, chartConfig}, or None if not found."""
        with SessionLocal() as db:
            row = db.query(SystemShareLink).filter(SystemShareLink.code == code).first()

        if not row:
            return None

        try:
            return json.loads(row.payload)
        except (json.JSONDecodeError, TypeError) as exc:
            log_background_incident(
                message=f"Corrupt payload for share link code={code}",
                error_code="SHARE_LINK_PAYLOAD_CORRUPT",
                exc=exc,
                source=_SHARE_LINK_SERVICE_SOURCE,
            )
            return None
