from typing import Optional
import logging
import os

from fastapi import FastAPI
from apps.shared.config.config import _ROOT_ENV, settings
from apps.shared.utils.log_event import log_background_incident

_MAILER_SOURCE = "apps.shared.services.dfa_mailer"

try:
    from apps.shared.packages.dfa_mailer_service.core.config import EmailConfig
    from apps.shared.packages.dfa_mailer_service.core.service import EmailService
    from apps.shared.packages.dfa_mailer_service.jobs.base import JobClient
    DFA_MAILER_AVAILABLE = True
except ImportError as e:
    DFA_MAILER_AVAILABLE = False
    logging.getLogger(__name__).warning(
        "dfa_mailer_service dependencies unavailable — email functionality disabled: %s", e
    )

logger = logging.getLogger(__name__)


_adapter = None  # Late-bound to avoid import-time metaclass issues
_service: Optional[EmailService] = None
_dotenv_merged = False


class DFACeleryJobClient(JobClient):
    """
    Custom Celery job client that uses the project's Celery app instead of DFA mailer's own app.
    This ensures tasks are queued to the same broker/queue that the project's Celery worker is listening to.
    """

    def __init__(self, default_queue: str = "celery", config: Optional[EmailConfig] = None):
        self.default_queue = default_queue
        self.config = config
        try:
            from config.celery_config import celery_app
            self.celery_app = celery_app

            try:
                from apps.shared.packages.dfa_mailer_service.tasks import email_tasks
                self.celery_app.autodiscover_tasks(['apps.shared.packages.dfa_mailer_service.tasks'])
                if self.config and self.config.enable_verbose_logs:
                    logger.info("[DFACeleryJobClient] Registered email tasks with project's Celery app")
            except Exception as e:
                if self.config and self.config.enable_verbose_logs:
                    logger.warning("[DFACeleryJobClient] Failed to autodiscover email tasks: %s", e)
        except ImportError:
            log_background_incident(
                "Failed to import project's Celery app. Email tasks may not be queued correctly.",
                error_code="CELERY_APP_IMPORT_FAILED",
                source=_MAILER_SOURCE,
            )
            raise

    def enqueue_send_email(
        self,
        template_key: str,
        recipient_email: str,
        context: dict,
        language: str,
        recipient_name: str | None,
        priority: str,
        log_id: int | None,
        recipient_emails: list[str] | None,
        queue_name: str | None = None,
    ) -> str:
        from apps.shared.packages.dfa_mailer_service.tasks.email_tasks import send_email_task

        queue_to_use = queue_name or self.default_queue
        task_name = send_email_task.name
        full_task_name = "apps.shared.packages.dfa_mailer_service.tasks.email_tasks.send_email_task"

        if self.config and self.config.enable_verbose_logs:
            logger.info(
                "[DFACeleryJobClient] Queueing email task (queue=%s template=%s recipient=%s)",
                queue_to_use, template_key, recipient_email,
            )

        registered_tasks = set(self.celery_app.tasks.keys())
        if task_name not in registered_tasks and full_task_name in registered_tasks:
            task_name = full_task_name

        try:
            task = self.celery_app.send_task(
                task_name,
                kwargs={
                    "template_key": template_key,
                    "recipient_email": recipient_email,
                    "recipient_emails": recipient_emails,
                    "context": context,
                    "language": language,
                    "recipient_name": recipient_name,
                    "priority": priority,
                    "log_id": log_id,
                },
                queue=queue_to_use,
            )
            if self.config and self.config.enable_verbose_logs:
                logger.info("[DFACeleryJobClient] Email task queued (task_id=%s log_id=%s)", task.id, log_id)
            return task.id
        except Exception as e:
            log_background_incident(
                f"[DFACeleryJobClient] Failed to queue email task '{task_name}': {e}",
                error_code="EMAIL_TASK_QUEUE_FAILED",
                exc=e,
                source=_MAILER_SOURCE,
            )
            if task_name != full_task_name:
                try:
                    task = self.celery_app.send_task(
                        full_task_name,
                        kwargs={
                            "template_key": template_key,
                            "recipient_email": recipient_email,
                            "recipient_emails": recipient_emails,
                            "context": context,
                            "language": language,
                            "recipient_name": recipient_name,
                            "priority": priority,
                            "log_id": log_id,
                        },
                        queue=queue_to_use,
                    )
                    if self.config and self.config.enable_verbose_logs:
                        logger.info("[DFACeleryJobClient] Email task queued (task_id=%s log_id=%s)", task.id, log_id)
                    return task.id
                except Exception as e2:
                    log_background_incident(
                        f"[DFACeleryJobClient] Also failed with full task name: {e2}",
                        error_code="EMAIL_TASK_QUEUE_RETRY_FAILED",
                        exc=e2,
                        source=_MAILER_SOURCE,
                    )
            raise


class DbBgJobQueueEmailClient(JobClient):
    """
    Enqueue async email as a row in system_bg_job_queue (BG_JOB_MQ_TYPE=DB + poller).
    """

    def __init__(self, config: Optional[EmailConfig] = None):
        self.config = config

    def enqueue_send_email(
        self,
        template_key: str,
        recipient_email: str,
        context: dict,
        language: str,
        recipient_name: str | None,
        priority: str,
        log_id: int | None,
        recipient_emails: list[str] | None,
        queue_name: str | None = None,
    ) -> str:
        from apps.app_db.db.core import SessionLocal
        from apps.shared.services.bg_job_dispatch import (
            JOB_TYPE_SEND_EMAIL,
            dispatch_bg_job,
        )

        payload = {
            "template_key": template_key,
            "recipient_email": recipient_email,
            "recipient_emails": recipient_emails,
            "context": context,
            "language": language,
            "recipient_name": recipient_name,
            "priority": priority,
            "log_id": log_id,
        }
        if self.config and self.config.enable_verbose_logs:
            logger.info(
                "[DbBgJobQueueEmailClient] Queueing email job (template=%s log_id=%s recipient=%s)",
                template_key,
                log_id,
                recipient_email,
            )

        db = SessionLocal()
        try:
            result = dispatch_bg_job(
                db=db,
                job_type=JOB_TYPE_SEND_EMAIL,
                payload=payload,
            )
        finally:
            db.close()

        if result.db_job_id is None:
            raise RuntimeError("dispatch_bg_job did not return db_job_id for email job")
        if self.config and self.config.enable_verbose_logs:
            logger.info(
                "[DbBgJobQueueEmailClient] Email job inserted (db_job_id=%s log_id=%s)",
                result.db_job_id,
                log_id,
            )
        return str(result.db_job_id)


def _db_email_stack_enabled() -> bool:
    """True when API background stack uses DB queue + poller (same table as dfa_send_email)."""
    return (
        bool(settings.IS_BACKGROUND_ENABLED)
        and str(settings.BG_JOB_MQ_TYPE).strip().upper() == "DB"
        and bool(settings.BG_JOB_POLLER_ENABLED)
    )


def _env_var_nonempty(name: str) -> bool:
    raw = os.getenv(name)
    return raw is not None and bool(str(raw).strip())


def _merge_dotenv_into_environ() -> None:
    """Pydantic-settings reads .env without exporting to os.environ; merge once for getenv checks."""
    global _dotenv_merged
    if _dotenv_merged:
        return
    _dotenv_merged = True
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    path = _ROOT_ENV if os.path.exists(_ROOT_ENV) else ".env"
    if os.path.isfile(path):
        load_dotenv(path, override=False)


def _log_db_mailer_config_warnings(cfg: EmailConfig) -> None:
    """JOB_WORKER=db requires DB queue transport and an active poller."""
    if not cfg.job_worker or cfg.job_worker.lower() != "db":
        return
    mq = str(settings.BG_JOB_MQ_TYPE).strip().upper()
    if mq != "DB":
        logger.warning(
            "[init_mailer] JOB_WORKER=db but BG_JOB_MQ_TYPE=%s (expected DB). "
            "dispatch_bg_job will not insert into system_bg_job_queue.",
            settings.BG_JOB_MQ_TYPE,
        )
    if not settings.BG_JOB_POLLER_ENABLED:
        logger.warning(
            "[init_mailer] JOB_WORKER=db but BG_JOB_POLLER_ENABLED is false. "
            "Queued email jobs will not be processed until a poller runs.",
        )
    if _db_email_stack_enabled():
        logger.info(
            "[init_mailer] DB email stack active: job_worker=%s send_mode=%s "
            "(async sends use system_bg_job_queue job_type=dfa_send_email)",
            cfg.job_worker,
            cfg.send_mode,
        )


def _seed_email_templates(session, force: bool = False) -> None:
    """Seed email templates from email_templates.json into dfa_email_templates.

    Default (force=False): insert-only — existing rows are never touched.
    This preserves any manual edits made in the DB after initial seeding.

    With force=True: upsert — existing rows are updated when name, subject,
    html_content, or text_content differs from the JSON. Use this when you
    intentionally want to push JSON changes into the DB (e.g. after adding a
    new language variant to an existing template).

    Called from:
      - init_mailer()  on app startup  (force=False by default)
      - seed_email_templates CLI / script  (can pass force=True)
    """
    import json
    from pathlib import Path
    from apps.shared.packages.dfa_mailer_service.adapters.fastapi_adapter import (
        EmailTemplate as _EmailTemplate,
    )

    json_path = Path(__file__).parent.parent / "data" / "email_templates.json"
    if not json_path.exists():
        logger.warning("[_seed_email_templates] email_templates.json not found at %s — skipping", json_path)
        return

    templates: dict = json.loads(json_path.read_text(encoding="utf-8"))
    inserted = updated = skipped = 0

    for template_key, tpl in templates.items():
        name = tpl.get("name", template_key)
        for lang, content in tpl.get("translations", {}).items():
            subject      = content["subject"]
            html_content = content["html_content"]
            text_content = content.get("text_content")

            row = (
                session.query(_EmailTemplate)
                .filter_by(template_key=template_key, language=lang)
                .first()
            )
            if not row:
                session.add(
                    _EmailTemplate(
                        template_key=template_key,
                        language=lang,
                        name=name,
                        subject=subject,
                        html_content=html_content,
                        text_content=text_content,
                        is_active=True,
                    )
                )
                inserted += 1
            elif force:
                changed = False
                for attr, val in (
                    ("name", name),
                    ("subject", subject),
                    ("html_content", html_content),
                    ("text_content", text_content),
                ):
                    if getattr(row, attr) != val:
                        setattr(row, attr, val)
                        changed = True
                if changed:
                    updated += 1
            else:
                skipped += 1

    if inserted or updated:
        session.commit()

    logger.info(
        "[_seed_email_templates] force=%s inserted=%d updated=%d skipped=%d",
        force,
        inserted,
        updated,
        skipped,
    )


def _create_email_config() -> EmailConfig:
    """
    Create EmailConfig instance from project settings.
    Maps this project's SMTP_* settings onto EmailConfig's expected fields.

    When IS_BACKGROUND_ENABLED, BG_JOB_MQ_TYPE=DB, and BG_JOB_POLLER_ENABLED are all
    set: if JOB_WORKER is unset/blank in the environment, default job_worker to db;
    if DFA_SEND_MODE is unset/blank and job_worker is db, default send_mode to auto
    so send_email() queues dfa_send_email rows instead of using the project default sync.
    """
    _merge_dotenv_into_environ()
    db_stack = _db_email_stack_enabled()
    job_worker_raw = (settings.JOB_WORKER or "").strip()
    if db_stack and not _env_var_nonempty("JOB_WORKER"):
        job_worker = "db"
    else:
        job_worker = job_worker_raw or None

    send_mode = getattr(settings, "DFA_SEND_MODE", "sync")
    if isinstance(send_mode, str):
        send_mode = send_mode.lower()
    else:
        send_mode = "sync"

    if (
        db_stack
        and job_worker == "db"
        and not _env_var_nonempty("DFA_SEND_MODE")
    ):
        send_mode = "auto"

    # Build Redis template cache URL from existing REDIS_URL setting
    redis_template_cache_url: Optional[str] = settings.REDIS_URL if settings.REDIS_URL else None

    return EmailConfig(
        smtp_host=settings.SMTP_HOST,
        smtp_port=settings.SMTP_PORT,
        use_tls=settings.SMTP_USE_TLS,
        username=settings.SMTP_USERNAME or None,
        password=settings.SMTP_PASSWORD or None,
        from_email=settings.SMTP_FROM_EMAIL,
        from_name=settings.SMTP_FROM_NAME,
        celery_broker_url=settings.DFA_CELERY_BROKER_URL,
        celery_result_backend=settings.DFA_CELERY_RESULT_BACKEND,
        celery_queue_name=settings.DFA_CELERY_QUEUE_NAME,
        job_worker=job_worker,
        send_mode=send_mode,
        api_prefix=settings.DFA_MAILER_API_PREFIX,
        mail_provider=settings.MAIL_PROVIDER,
        admin_alert_emails=settings.ADMIN_ALERT_EMAILS or None,
        alert_on_async_failure=settings.ALERT_ON_ASYNC_FAILURE,
        pagination_type=settings.DFA_PAGINATION_TYPE,
        page_size=settings.DFA_PAGE_SIZE,
        redis_template_cache_url=redis_template_cache_url,
        redis_key_prefix=settings.REDIS_KEY_PREFIX,
        enable_verbose_logs=settings.DFA_ENABLE_VERBOSE_LOGS,
        trailing_slash=settings.DFA_MAILER_TRAILING_SLASH,
    )


def init_mailer(app: FastAPI, prefix: Optional[str] = None, force_seed: bool = False) -> None:
    """
    Initialize DFA Mailer adapter, create tables in the core DB, and mount routers on the FastAPI app.

    FastAPIAdapter is initialized directly with the real DB URL so that the internal
    _patched_get closure on EmailTemplate.get_by_key_and_language captures the correct
    session factory.  Using sqlite:///:memory: as a placeholder and swapping the engine
    later does NOT update the closure, causing every send_email() call to hit SQLite
    instead of the real database.
    """
    global _adapter, _service
    if _adapter is not None:
        return

    if not DFA_MAILER_AVAILABLE:
        raise ImportError("dfa_mailer_service is not available.")

    from apps.shared.packages.dfa_mailer_service.adapters.fastapi_adapter import FastAPIAdapter
    from apps.shared.packages.dfa_mailer_service.adapters.fastapi_adapter import EmailTemplate, EmailLog
    from apps.app_db.config.config import app_db_settings

    cfg = _create_email_config()
    api_prefix = prefix or settings.DFA_MAILER_API_PREFIX
    database_url = app_db_settings.get_database_url()

    # Initialize with the real DB URL so the internal session-factory closure points
    # to the correct database from the start.
    _adapter = FastAPIAdapter(
        config=cfg,
        database_url=database_url,
        on_templates_mutated=None,
    )
    _adapter.setup_app(app, prefix=api_prefix)

    try:
        _adapter.run_migrations()
    except Exception as e:
        logger.warning(
            "DFA Mailer migrations failed (email routes mounted; calls may fail until DB is ready): %s", e
        )

    try:
        session = _adapter.SessionLocal()
        try:
            _seed_email_templates(session, force=force_seed)
        finally:
            session.close()
    except Exception as e:
        logger.warning("[init_mailer] Failed to seed email templates: %s", e)

    _service = _adapter.get_email_service()

    if cfg.enable_verbose_logs:
        logger.info(
            "[init_mailer] job_worker=%s send_mode=%s queue=%s",
            cfg.job_worker, cfg.send_mode, cfg.celery_queue_name,
        )

    _log_db_mailer_config_warnings(cfg)

    if cfg.job_worker and cfg.job_worker.lower() == "celery":
        try:
            custom_job_client = DFACeleryJobClient(default_queue=cfg.celery_queue_name, config=cfg)
            from apps.shared.packages.dfa_mailer_service.adapters.fastapi_adapter import EmailTemplate, EmailLog
            _service = EmailService(
                config=cfg,
                template_model=EmailTemplate,
                log_model=EmailLog,
                job_client=custom_job_client,
            )
            if cfg.enable_verbose_logs:
                logger.info("[init_mailer] Email service reinitialized with DFACeleryJobClient (queue=%s)", cfg.celery_queue_name)
        except Exception as e:
            log_background_incident(
                f"[init_mailer] Failed to initialize custom Celery job client: {e}",
                error_code="INIT_MAILER_CELERY_CLIENT_FAILED",
                exc=e,
                source=_MAILER_SOURCE,
            )
    elif cfg.job_worker and cfg.job_worker.lower() == "db":
        from apps.shared.packages.dfa_mailer_service.adapters.fastapi_adapter import EmailTemplate, EmailLog

        db_client = DbBgJobQueueEmailClient(config=cfg)
        _service = EmailService(
            config=cfg,
            template_model=EmailTemplate,
            log_model=EmailLog,
            job_client=db_client,
        )
        if cfg.enable_verbose_logs:
            logger.info("[init_mailer] Email service reinitialized with DbBgJobQueueEmailClient (system_bg_job_queue)")


def get_email_service() -> EmailService:
    """
    Return the initialized EmailService instance.
    Falls back to a config-only service if init_mailer() has not been called
    (e.g. from Celery workers that don't run FastAPI startup).
    """
    global _service
    if _service is None:
        cfg = _create_email_config()
        if cfg.enable_verbose_logs:
            logger.warning("[get_email_service] Service not initialized — creating fallback service")

        _log_db_mailer_config_warnings(cfg)

        job_client = None
        if cfg.job_worker and cfg.job_worker.lower() == "celery":
            try:
                job_client = DFACeleryJobClient(default_queue=cfg.celery_queue_name, config=cfg)
            except Exception as e:
                if cfg.enable_verbose_logs:
                    logger.warning("[get_email_service] Failed to create Celery job client in fallback: %s", e)
        elif cfg.job_worker and cfg.job_worker.lower() == "db":
            job_client = DbBgJobQueueEmailClient(config=cfg)

        try:
            from apps.shared.packages.dfa_mailer_service.adapters.fastapi_adapter import EmailTemplate, EmailLog
            _service = EmailService(
                config=cfg,
                template_model=EmailTemplate,
                log_model=EmailLog,
                job_client=job_client,
            )
        except Exception as e:
            if cfg.enable_verbose_logs:
                logger.warning("[get_email_service] Failed to configure template/log models: %s", e)
            _service = EmailService(cfg, job_client=job_client)

    return _service
