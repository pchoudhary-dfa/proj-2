"""
In-app and email notifications for dataset workflow events.

Template copy lives in system_notification_template + i18n tables (seed separately).
Call emit() only after the primary business transaction has committed.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, List, Optional

from jinja2 import Template, TemplateError
from sqlalchemy import func
from sqlalchemy.orm import Session

from apps.app_db.models.core import (
    Dataset,
    IamUser,
    IamUserRole,
    SystemDatawarehouse,
    SystemNotification,
    SystemNotificationTemplate,
    SystemNotificationTemplateI18n,
)
from apps.shared.utils.email_utils import EmailTemplate, get_fed_email_urls, send_email

logger = logging.getLogger(__name__)

INAPP_CHANNELS = frozenset({"INAPP", "BOTH"})
EMAIL_CHANNELS = frozenset({"EMAIL", "BOTH"})
INBOX_FETCH_LIMIT = 20

ACTION_MODULE_BY_RECIPIENT = {
    "DATASET_REVIEWERS": "data-review",
    "DATASET_OWNER": "data-entry",
    "EVENT_ACTOR": "data-entry",
    "DW_ALL_USERS": "data-entry",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def build_notification_action_url(
    db: Session,
    *,
    app_key: str,
    dw_id: int,
    locale: str,
    module: str,
) -> str:
    """Build full FE URL: {origin}/{locale}/{dw_id}/{module}/dataset."""
    origin, _ = get_fed_email_urls(app_key, db)
    if not origin:
        return ""
    loc = (locale or "en").strip() or "en"
    mod = module.strip("/")
    return f"{origin.rstrip('/')}/{loc}/{dw_id}/{mod}/dataset"


def _render_jinja(template_str: str, context: dict[str, Any]) -> str:
    try:
        return Template(template_str).render(**context)
    except TemplateError as exc:
        logger.warning("Notification Jinja render failed: %s", exc)
        return template_str


def resolve_notification_locale(db: Session, dw_id: int) -> str:
    """DW default language for notification copy and context fields; fallback en."""
    dw = db.query(SystemDatawarehouse).filter(SystemDatawarehouse.id == dw_id).first()
    if dw and dw.dw_default_language:
        loc = str(dw.dw_default_language).strip()
        if loc:
            return loc
    return "en"


class NotificationService:
    def emit(
        self,
        db: Session,
        *,
        event_code: str,
        context: dict[str, Any],
        dw_id: int,
        app_key: str,
        dataset: Dataset,
        actor_user_id: Optional[int] = None,
        locale: str = "en",
    ) -> None:
        """
        Dispatch notifications for all active templates matching event_code.
        Commits notification rows and counter updates in one transaction.
        """
        resolved_locale = self._resolve_locale(db, dw_id)
        templates = (
            db.query(SystemNotificationTemplate)
            .filter(
                SystemNotificationTemplate.event_code == event_code,
                SystemNotificationTemplate.is_active.is_(True),
                SystemNotificationTemplate.channels != "NONE",
            )
            .all()
        )
        if not templates:
            logger.info("No active notification templates for event_code=%s", event_code)
            return

        now = _utc_now()
        ref_entity_id = int(context.get("dataset_id") or dataset.dataset_id)

        for master in templates:
            if master.channels == "NONE":
                continue

            i18n = self._get_i18n(db, master.id, resolved_locale)
            if i18n is None:
                logger.warning(
                    "Skip notification template id=%s — no i18n for locale=%s",
                    master.id,
                    resolved_locale,
                )
                continue

            module = ACTION_MODULE_BY_RECIPIENT.get(
                str(master.recipient_type), "data-entry"
            )
            action_url = build_notification_action_url(
                db,
                app_key=app_key,
                dw_id=dw_id,
                locale=resolved_locale,
                module=module,
            )

            recipients = self._resolve_recipients(
                db,
                recipient_type=str(master.recipient_type),
                dataset=dataset,
                dw_id=dw_id,
                app_key=app_key,
                locale=resolved_locale,
                actor_user_id=actor_user_id,
            )
            if not recipients:
                continue

            email_ctx = dict(context)
            email_ctx.setdefault("review_url", action_url)
            email_ctx.setdefault("dataset_url", action_url)
            email_ctx.setdefault("login_url", action_url or email_ctx.get("login_url", ""))

            title = _render_jinja(i18n.inapp_title, context)
            body = _render_jinja(i18n.inapp_body, context)

            for user in recipients:
                if master.channels in INAPP_CHANNELS:
                    db.add(
                        SystemNotification(
                            user_id=int(user.id),
                            event_code=event_code,
                            locale=resolved_locale,
                            title=title[:255],
                            body=body,
                            context_data=context,
                            ref_entity_type="DATASET",
                            ref_entity_id=ref_entity_id,
                            action_url=action_url or None,
                            dw_id=dw_id,
                            is_read=False,
                            created=now,
                        )
                    )
                    db.query(IamUser).filter(IamUser.id == user.id).update(
                        {IamUser.notification_unread_cnt: IamUser.notification_unread_cnt + 1},
                        synchronize_session=False,
                    )

                if master.channels in EMAIL_CHANNELS and master.email_template_key:
                    recipient_email = str(user.email or "").strip()
                    if not recipient_email:
                        logger.info(
                            "Skip email for user_id=%s — no email (event_code=%s)",
                            user.id,
                            event_code,
                        )
                    else:
                        full_name = (
                            f"{user.first_name} {user.last_name or ''}".strip()
                            or user.username
                        )
                        per_user_ctx = dict(email_ctx)
                        per_user_ctx["full_name"] = full_name
                        try:
                            template = EmailTemplate(str(master.email_template_key))
                        except ValueError:
                            logger.warning(
                                "Unknown email_template_key=%s for template id=%s",
                                master.email_template_key,
                                master.id,
                            )
                        else:
                            send_email(
                                template=template,
                                recipient_email=recipient_email,
                                recipient_name=full_name,
                                context=per_user_ctx,
                                locale=resolved_locale,
                            )

        db.commit()

    def unread_count(
        self,
        db: Session,
        *,
        user_id: int,
        dw_id: Optional[int] = None,
    ) -> int:
        q = db.query(SystemNotification).filter(
            SystemNotification.user_id == user_id,
            SystemNotification.is_read.is_(False),
        )
        if dw_id is not None:
            q = q.filter(SystemNotification.dw_id == dw_id)
        return q.count()

    def fetch_and_mark_read(
        self,
        db: Session,
        *,
        user_id: int,
        dw_id: Optional[int] = None,
        limit: int = INBOX_FETCH_LIMIT,
    ) -> List[SystemNotification]:
        """
        Return up to ``limit`` notifications (unread first), then mark only unread
        rows in that fetched page as read.
        """
        base_q = db.query(SystemNotification).filter(
            SystemNotification.user_id == user_id,
        )
        if dw_id is not None:
            base_q = base_q.filter(SystemNotification.dw_id == dw_id)

        rows = (
            base_q.order_by(SystemNotification.is_read.asc(), SystemNotification.created.desc())
            .limit(limit)
            .all()
        )

        unread_ids = [row.id for row in rows if not row.is_read]
        marked = 0
        if unread_ids:
            now = _utc_now()
            marked = (
                db.query(SystemNotification)
                .filter(
                    SystemNotification.id.in_(unread_ids),
                    SystemNotification.user_id == user_id,
                    SystemNotification.is_read.is_(False),
                )
                .update(
                    {
                        SystemNotification.is_read: True,
                        SystemNotification.read_at: now,
                    },
                    synchronize_session=False,
                )
            )

        if marked:
            db.query(IamUser).filter(IamUser.id == user_id).update(
                {
                    IamUser.notification_unread_cnt: func.greatest(
                        IamUser.notification_unread_cnt - marked,
                        0,
                    ),
                },
                synchronize_session=False,
            )

        db.commit()
        for row in rows:
            db.refresh(row)
        return rows

    def _resolve_locale(self, db: Session, dw_id: int) -> str:
        return resolve_notification_locale(db, dw_id)

    def _get_i18n(
        self,
        db: Session,
        master_id: int,
        locale: str,
    ) -> Optional[SystemNotificationTemplateI18n]:
        row = (
            db.query(SystemNotificationTemplateI18n)
            .filter(
                SystemNotificationTemplateI18n.master_id == master_id,
                SystemNotificationTemplateI18n.locale == locale,
            )
            .first()
        )
        if row:
            return row
        if locale != "en":
            return (
                db.query(SystemNotificationTemplateI18n)
                .filter(
                    SystemNotificationTemplateI18n.master_id == master_id,
                    SystemNotificationTemplateI18n.locale == "en",
                )
                .first()
            )
        return None

    def _resolve_recipients(
        self,
        db: Session,
        *,
        recipient_type: str,
        dataset: Dataset,
        dw_id: int,
        app_key: str,
        locale: str,
        actor_user_id: Optional[int],
    ) -> List[IamUser]:
        from apps.app_db.services.dataset_service import _collect_dataset_stakeholder_users

        if recipient_type == "DATASET_REVIEWERS":
            users = _collect_dataset_stakeholder_users(
                db, dataset, dw_id, app_key, locale, require_email=False
            )
            owner_id = int(dataset.created_user_id)
            return [u for u in users if int(u.id) != owner_id]

        if recipient_type == "DATASET_OWNER":
            user = (
                db.query(IamUser)
                .filter(IamUser.id == dataset.created_user_id, IamUser.status == 1)
                .first()
            )
            return [user] if user else []

        if recipient_type == "EVENT_ACTOR":
            if actor_user_id is None:
                return []
            user = (
                db.query(IamUser)
                .filter(IamUser.id == actor_user_id, IamUser.status == 1)
                .first()
            )
            return [user] if user else []

        if recipient_type == "DW_ALL_USERS":
            rows = (
                db.query(IamUser)
                .join(IamUserRole, IamUser.id == IamUserRole.user_id)
                .filter(
                    IamUser.status == 1,
                    IamUserRole.app_key == app_key,
                    IamUserRole.dw_id == dw_id,
                )
                .distinct()
                .all()
            )
            return list(rows)

        return []


notification_service = NotificationService()
