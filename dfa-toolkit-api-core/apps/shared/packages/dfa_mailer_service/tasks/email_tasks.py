"""
Celery tasks for background email processing
"""

import asyncio
import logging
from datetime import datetime
from celery import Celery, shared_task
from typing import Dict, Any, Optional, List
import threading

from ..core.service import EmailService
from ..core.config import EmailConfig
from ..core.models import EmailPriority, EmailStatus
import traceback
import os
import importlib
from celery.signals import worker_ready

logger = logging.getLogger(__name__)

# Non-retryable task errors (data/config issues rather than transient infra issues)
class TemplateNotFoundError(Exception):
    pass


class TemplateInactiveError(Exception):
    pass

# Local Celery app (used only when running the package's own worker via CLI)
celery_app = Celery('dfa_mailer_service')

# Email service instance (lazy-initialized)
_email_service: Optional[EmailService] = None
_email_service_lock = threading.Lock()

# Public variable for backward compatibility with adapters
email_service: Optional[EmailService] = None


def initialize_celery(config: EmailConfig, template_model=None, log_model=None):
    """
    Initialize Celery app and email service
    
    Args:
        config: Email configuration
        template_model: Template model class
        log_model: Log model class
    """
    global _email_service, email_service
    
    # Configure Celery only when background service is celery (affects local CLI app only)
    if getattr(config, 'job_worker', None) and str(config.job_worker).lower() == 'celery':
        celery_app.conf.update(
            broker_url=config.celery_broker_url,
            result_backend=config.celery_result_backend,
            task_serializer='json',
            accept_content=['json'],
            result_serializer='json',
            timezone='UTC',
            enable_utc=True,
            task_track_started=True,
            task_time_limit=30 * 60,  # 30 minutes
            task_soft_time_limit=25 * 60,  # 25 minutes
            worker_prefetch_multiplier=1,
            task_acks_late=True,
            worker_disable_rate_limits=False,
        )
        # Ensure the default queue matches the worker queues
        try:
            celery_app.conf.task_default_queue = getattr(config, 'celery_queue_name', 'dfa_mailer_service')
        except Exception:
            # Best-effort; fall back silently if attribute missing
            celery_app.conf.task_default_queue = 'dfa_mailer_service'
    else:
        # If not configured for celery, note that async won't work
        if config.enable_verbose_logs:
            print("job_worker was not defined in the config so async send mail will not work")
    
    # Initialize email service
    _email_service = EmailService(config, template_model, log_model)
    email_service = _email_service  # Keep in sync for backward compatibility
    
    if config.enable_verbose_logs:
        logger.info("Email service initialized" + (" with Celery" if getattr(config, 'job_worker', None) and str(config.job_worker).lower() == 'celery' else " (async disabled)"))
        print("Email service initialized" + (" with Celery" if getattr(config, 'job_worker', None) and str(config.job_worker).lower() == 'celery' else " (async disabled)"))


def _init_email_service_from_env() -> EmailService:
    """Initialize email service from environment variables."""
    # Check if running under Django
    try:
        from django.conf import settings as dj_settings  # type: ignore
        django_configured = bool(getattr(dj_settings, 'SECRET_KEY', None))
    except Exception:
        django_configured = False
    
    if django_configured:
        cfg = EmailConfig.from_django_settings() or EmailConfig.from_env()
        from ..adapters.django_adapter import MailerDjangoAdapter
        adapter = MailerDjangoAdapter(config=cfg)
        return adapter.get_email_service()
    
    database_url = os.getenv("DFA_DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DFA_DATABASE_URL is not set. "
            "Please set DFA_DATABASE_URL or configure Django settings."
        )
    
    cfg = EmailConfig.from_env()
    if not getattr(cfg, 'job_worker', None):
        cfg.job_worker = 'celery'
    broker_env = os.getenv('CELERY_BROKER_URL')
    if broker_env:
        cfg.celery_broker_url = broker_env
    result_env = os.getenv('CELERY_RESULT_BACKEND')
    if result_env:
        cfg.celery_result_backend = result_env
    
    from ..adapters.fastapi_adapter import FastAPIAdapter
    adapter = FastAPIAdapter(config=cfg, database_url=database_url)
    return adapter.get_email_service()


def get_email_service() -> EmailService:
    """Get or lazily initialize the email service. Thread-safe and idempotent."""
    global _email_service, email_service
    
    if _email_service is None:
        with _email_service_lock:
            if _email_service is None:
                try:
                    _email_service = _init_email_service_from_env()
                    email_service = _email_service  # Keep in sync for backward compatibility
                    verbose_logs = os.getenv("DFA_ENABLE_VERBOSE_LOGS", "False").lower() == "true"
                    if verbose_logs:
                        logger.info("[dfa_mailer] Email service lazily initialized")
                        print("[dfa_mailer] Email service lazily initialized")
                except Exception as e:
                    logger.error(f"[dfa_mailer] Failed to initialize email service: {e}", exc_info=True)
                    raise RuntimeError(f"Failed to initialize email service: {e}") from e
    
    return _email_service


def _get_host_engine_kwargs() -> Optional[Dict[str, Any]]:
    """
    If the host app sets DFA_ENGINE_CONFIG_MODULE to a module path that provides
    get_dfa_mailer_engine_kwargs(), return that callable's result so the worker uses
    the same engine config (pool_pre_ping, pool_recycle, etc.) as the web app.
    Otherwise return None and the adapter uses its default resilient kwargs.
    """
    mod_path = os.getenv("DFA_ENGINE_CONFIG_MODULE")
    if not mod_path or not mod_path.strip():
        return None
    try:
        mod = importlib.import_module(mod_path.strip())
        fn = getattr(mod, "get_dfa_mailer_engine_kwargs", None)
        if callable(fn):
            out = fn()
            if isinstance(out, dict):
                return out
    except Exception as e:
        logger.warning("[dfa_mailer] Could not get host engine config from %s: %s", mod_path, e)
    return None


_bg_job_poller_thread_started = False
_bg_job_poller_thread_lock = threading.Lock()


def _env_truthy(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("true", "1", "yes", "on")


def _maybe_start_bg_job_poller_thread() -> None:
    """Drain system_bg_job_queue in-process when BG_JOB_MQ_TYPE=DB (same as FastAPI lifespan)."""
    global _bg_job_poller_thread_started
    mq = os.getenv("BG_JOB_MQ_TYPE", "CELERY").strip().upper()
    if mq != "DB" or not _env_truthy("BG_JOB_POLLER_ENABLED", "false"):
        return
    with _bg_job_poller_thread_lock:
        if _bg_job_poller_thread_started:
            return
        try:
            from apps.shared.services.bg_job_poller import bg_job_poller_loop
        except ImportError as e:
            logger.warning(
                "[dfa_mailer] BG_JOB_POLLER_ENABLED with BG_JOB_MQ_TYPE=DB but host poller "
                "is unavailable (apps.shared not importable): %s",
                e,
            )
            return

        def _run_poller() -> None:
            asyncio.run(bg_job_poller_loop())

        threading.Thread(target=_run_poller, name="bg-job-poller", daemon=True).start()
        _bg_job_poller_thread_started = True

        try:
            from apps.shared.config.config import settings as _dfa_settings

            interval_sec = int(_dfa_settings.BG_JOB_POLL_INTERVAL_SEC)
        except Exception:
            interval_sec = None
        logger.info(
            "[dfa_mailer] Started system_bg_job_queue poller thread (interval=%ss)",
            interval_sec if interval_sec is not None else "?",
        )


@worker_ready.connect
def _init_mailer_on_ready(sender, **kwargs):
    """Initialize adapter and models in worker so tasks can run without explicit DB session."""
    try:
        # Check if verbose logging is enabled (will check config later)
        verbose_logs_enabled = os.getenv("DFA_ENABLE_VERBOSE_LOGS", "False").lower() == "true"
        if verbose_logs_enabled:
            logger.info("[dfa_mailer] worker_ready: starting auto-init")
            print("[dfa_mailer] worker_ready: starting auto-init")
        # Allow disabling auto-init if a host app prefers manual bootstrapping
        if os.getenv("DFA_MAILER_AUTO_INIT", "true").lower() != "true":
            if verbose_logs_enabled:
                logger.info("[dfa_mailer] worker_ready: auto-init disabled via DFA_MAILER_AUTO_INIT")
                print("[dfa_mailer] worker_ready: auto-init disabled via DFA_MAILER_AUTO_INIT")
            return

        # If running under Django, prefer Django adapter to avoid SQLAlchemy setup
        try:
            from django.conf import settings as dj_settings  # type: ignore
            django_configured = bool(getattr(dj_settings, 'SECRET_KEY', None))
        except Exception:
            django_configured = False

        if django_configured:
            cfg = EmailConfig.from_django_settings() or EmailConfig.from_env()
            from ..adapters.django_adapter import MailerDjangoAdapter
            _ = MailerDjangoAdapter(config=cfg)
            if cfg.enable_verbose_logs:
                logging.getLogger(__name__).info("DFA Mailer (Django) initialized in Celery worker_ready")
                print("DFA Mailer (Django) initialized in Celery worker_ready")
            return

        # Generic package behavior:
        # The host app must provide DFA_DATABASE_URL pointing to the database that contains
        # dfa_email_templates and dfa_email_logs (typically the host app's logs DB).
        database_url = os.getenv("DFA_DATABASE_URL")
        if not database_url:
            warning_msg = "DFA_DATABASE_URL is not set; skipping dfa_mailer_service auto-init in Celery worker_ready. Host app should set DFA_DATABASE_URL (or disable DFA_MAILER_AUTO_INIT and initialize manually)."
            logging.getLogger(__name__).warning(warning_msg)
            if verbose_logs_enabled:
                print(warning_msg)
            return

        cfg = EmailConfig.from_env()
        if cfg.enable_verbose_logs:
            logger.info(
                "[dfa_mailer] worker_ready: config loaded (send_mode=%s job_worker=%s mail_provider=%s smtp_host=%s smtp_port=%s)",
                getattr(cfg, "send_mode", None),
                getattr(cfg, "job_worker", None),
                getattr(cfg, "mail_provider", None),
                getattr(cfg, "smtp_host", None),
                getattr(cfg, "smtp_port", None),
            )
            print(f"[dfa_mailer] worker_ready: config loaded (send_mode={getattr(cfg, 'send_mode', None)} job_worker={getattr(cfg, 'job_worker', None)} mail_provider={getattr(cfg, 'mail_provider', None)} smtp_host={getattr(cfg, 'smtp_host', None)} smtp_port={getattr(cfg, 'smtp_port', None)})")

        # Sensible defaults/fallbacks when running under a Celery worker
        if not getattr(cfg, 'job_worker', None):
            cfg.job_worker = 'celery'
        broker_env = os.getenv('CELERY_BROKER_URL')
        if broker_env:
            cfg.celery_broker_url = broker_env
        result_env = os.getenv('CELERY_RESULT_BACKEND')
        if result_env:
            cfg.celery_result_backend = result_env

        # Optionally use host app's engine config (pool_pre_ping, pool_recycle, etc.) for alignment with web app
        engine_kwargs = _get_host_engine_kwargs()

        # Initialize FastAPIAdapter to wire up SQLAlchemy models and email_service
        from ..adapters.fastapi_adapter import FastAPIAdapter
        _ = FastAPIAdapter(config=cfg, database_url=database_url, engine_kwargs=engine_kwargs)
        if cfg.enable_verbose_logs:
            logger.info("DFA Mailer initialized in Celery worker_ready")
            print("DFA Mailer initialized in Celery worker_ready")
        _maybe_start_bg_job_poller_thread()
    except Exception as e:
        if verbose_logs_enabled:
            logger.warning("Mailer init in worker_ready skipped: %s", e)
            print(f"Mailer init in worker_ready skipped: {e}")
        # Fallback: try lazy initialization
        try:
            get_email_service()
        except Exception:
            pass


def execute_send_email_job(
    template_key: str,
    recipient_email: str,
    context: Dict[str, Any],
    language: str = "en",
    recipient_name: Optional[str] = None,
    priority: str = "normal",
    log_id: Optional[int] = None,
    recipient_emails: Optional[list[str]] = None,
    attachments: Optional[List[Dict[str, Any]]] = None,
    *,
    celery_task_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Core send path shared by Celery task and system_bg_job_queue DB handler.
    Raises TemplateNotFoundError, TemplateInactiveError, or Exception on SMTP failure.
    """
    email_service = get_email_service()
    if email_service.config.enable_verbose_logs:
        logger.info(
            "[dfa_mailer] send_job: start (task_id=%s template_key=%s lang=%s log_id=%s recipient=%s)",
            celery_task_id,
            template_key,
            language,
            log_id,
            recipient_email,
        )
        print(
            f"[dfa_mailer] send_job: start (task_id={celery_task_id} template_key={template_key} "
            f"lang={language} log_id={log_id} recipient={recipient_email})"
        )

    EmailPriority(priority)

    template = email_service.get_template(template_key, language)
    if not template:
        error_msg = f"Template not found: {template_key}"
        logger.error(error_msg)
        if email_service.config.enable_verbose_logs:
            print(error_msg)
        if log_id and email_service.log_model:
            _update_log_status(log_id, EmailStatus.FAILED, error_msg)
        raise TemplateNotFoundError(error_msg)

    if not template.is_active:
        error_msg = f"Template is inactive: {template_key}"
        logger.error(error_msg)
        if email_service.config.enable_verbose_logs:
            print(error_msg)
        if log_id and email_service.log_model:
            _update_log_status(log_id, EmailStatus.FAILED, error_msg)
        raise TemplateInactiveError(error_msg)

    rendered = email_service.render_template(template, context)

    envelope_from_name = (context.get("from_name") or "").strip() or None
    success = email_service._send_email(
        recipient_email=recipient_email,
        recipient_emails=recipient_emails,
        recipient_name=recipient_name,
        subject=rendered["subject"],
        html_content=rendered["html_content"],
        text_content=rendered["text_content"],
        attachments=attachments,
        from_name=envelope_from_name,
    )

    if success:
        if log_id and email_service.log_model:
            _update_log_status(log_id, EmailStatus.SENT, sent_at=datetime.now())
        elif email_service and email_service.log_model:
            if email_service.config.enable_verbose_logs:
                logger.warning(
                    "Email sent but log_id was missing; cannot update dfa_email_logs "
                    "(template=%s, recipient=%s)",
                    template_key,
                    recipient_email,
                )
                print(
                    f"Email sent but log_id was missing; cannot update dfa_email_logs "
                    f"(template={template_key}, recipient={recipient_email})"
                )

        target = ", ".join([e for e in recipient_emails]) if recipient_emails else recipient_email
        if email_service.config.enable_verbose_logs:
            logger.info("Email sent successfully to %s (log_id=%s)", target, log_id)
            print(f"Email sent successfully to {target} (log_id={log_id})")
        return {
            "status": "success",
            "message": f"Email sent to {target}",
            "recipient": target,
            "template_key": template_key,
        }

    target = ", ".join([e for e in recipient_emails]) if recipient_emails else recipient_email
    error_msg = f"Failed to send email to {target}"
    if log_id and email_service.log_model:
        _update_log_status(log_id, EmailStatus.FAILED, error_msg)
    elif email_service and email_service.log_model:
        if email_service.config.enable_verbose_logs:
            logger.warning(
                "Email failed and log_id was missing; cannot update dfa_email_logs "
                "(template=%s, recipient=%s)",
                template_key,
                recipient_email,
            )
            print(
                f"Email failed and log_id was missing; cannot update dfa_email_logs "
                f"(template={template_key}, recipient={recipient_email})"
            )
    logger.error(error_msg)
    if email_service.config.enable_verbose_logs:
        print(error_msg)
    raise Exception(error_msg)


@shared_task(bind=True, max_retries=3)
def send_email_task(self, template_key: str, recipient_email: str, 
                   context: Dict[str, Any], language: str = 'en',
                   recipient_name: Optional[str] = None,
                   priority: str = 'normal',
                   log_id: Optional[int] = None,
                   recipient_emails: Optional[list[str]] = None,
                   attachments: Optional[List[Dict[str, Any]]] = None):
    """
    Celery task to send email asynchronously
    
    Args:
        template_key: Template key to use
        recipient_email: Recipient email address
        context: Context data for template rendering
        language: Language code (default: 'en')
        recipient_name: Recipient name (optional)
        priority: Email priority as string
        log_id: Email log ID to update status
        attachments: List of attachments, each dict with 'filename', 'content', 'mimetype'
        
    Returns:
        Dictionary with task result
    """
    email_service = get_email_service()
    
    try:
        return execute_send_email_job(
            template_key=template_key,
            recipient_email=recipient_email,
            context=context,
            language=language,
            recipient_name=recipient_name,
            priority=priority,
            log_id=log_id,
            recipient_emails=recipient_emails,
            attachments=attachments,
            celery_task_id=getattr(self.request, "id", None),
        )
            
    except Exception as exc:
        non_retryable = isinstance(exc, (TemplateNotFoundError, TemplateInactiveError))
        # Always log full stack trace so root cause is visible in worker logs
        logger.exception(
            "[dfa_mailer] task failed (task_id=%s template_key=%s lang=%s log_id=%s recipient=%s retries=%s non_retryable=%s): %s",
            getattr(self.request, "id", None),
            template_key,
            language,
            log_id,
            (", ".join([e for e in recipient_emails]) if recipient_emails else recipient_email),
            getattr(self.request, "retries", None),
            non_retryable,
            exc,
        )
        if email_service and email_service.config.enable_verbose_logs:
            print(f"Email task failed: {exc}")
        # If final failure and alerts enabled, notify admins
        try:
            if email_service and email_service.config and getattr(email_service.config, 'alert_on_async_failure', True):
                admin_emails = email_service.config.admin_alert_emails
                # Normalize to list
                if isinstance(admin_emails, str):
                    admin_emails = [e.strip() for e in admin_emails.split(',') if e.strip()]
                if admin_emails:
                    tb = traceback.format_exc()
                    target = ', '.join([e for e in recipient_emails]) if recipient_emails else recipient_email
                    subject = f"[DFA Mailer] Async email send failed: {target}"
                    html = f"<h3>Async email send failed</h3><p><b>Recipient:</b> {target}</p><p><b>Template:</b> {template_key}</p><pre>{tb}</pre>"
                    text = f"Async email send failed\nRecipient: {target}\nTemplate: {template_key}\n\nTraceback:\n{tb}"
                    # Send to each admin
                    for admin in admin_emails:
                        try:
                            # Use internal send with raw content path via a minimal shim
                            _send_admin_alert(email_service, admin, subject, html, text)
                        except Exception as e2:
                            logger.error(f"Failed to notify admin {admin}: {e2}")
                            if email_service and email_service.config.enable_verbose_logs:
                                print(f"Failed to notify admin {admin}: {e2}")
        except Exception as e3:
            logger.error(f"Error during admin alert: {e3}")
            if email_service and email_service.config.enable_verbose_logs:
                print(f"Error during admin alert: {e3}")

        # Update log status to FAILED if this is the final attempt
        if log_id and email_service.log_model and self.request.retries >= self.max_retries:
            _update_log_status(log_id, EmailStatus.FAILED, str(exc))
        
        # Retry logic
        if non_retryable:
            # Fail fast for data/config issues (do not retry).
            raise
        if self.request.retries < self.max_retries:
            if email_service and email_service.config.enable_verbose_logs:
                logger.info(f"Retrying email task (attempt {self.request.retries + 1})")
                print(f"Retrying email task (attempt {self.request.retries + 1})")
            raise self.retry(countdown=60 * (2 ** self.request.retries))  # Exponential backoff
        else:
            logger.error(f"Email task failed after {self.max_retries} retries")
            if email_service and email_service.config.enable_verbose_logs:
                print(f"Email task failed after {self.max_retries} retries")
            return {
                'status': 'failed',
                'message': str(exc),
                'recipient': (', '.join([e for e in recipient_emails]) if recipient_emails else recipient_email),
                'template_key': template_key,
                'retries': self.request.retries
            }


def _update_log_status(log_id: int, status: EmailStatus, error_message: Optional[str] = None, sent_at: Optional[datetime] = None):
    """Helper function to update email log status"""
    email_service = get_email_service()
    session = None
    should_close = False
    try:
        session_factory = getattr(email_service.log_model, '_default_session_factory', None) if email_service else None
        log_instance = None
        update_data = {
            'status': status.value,
            'error_message': error_message,
        }
        if sent_at:
            update_data['sent_at'] = sent_at

        if session_factory:
            session = session_factory()
            should_close = True
            log_instance = session.query(email_service.log_model).filter(email_service.log_model.id == log_id).first()
            if log_instance:
                for field, value in update_data.items():
                    setattr(log_instance, field, value)
                session.commit()
                try:
                    session.refresh(log_instance)
                except Exception:
                    pass
                if email_service and email_service.config.enable_verbose_logs:
                    logger.info("[dfa_mailer] log_update: updated (log_id=%s status=%s)", log_id, status.value)
                    print(f"[dfa_mailer] log_update: updated (log_id={log_id} status={status.value})")
            else:
                if email_service and email_service.config.enable_verbose_logs:
                    logger.warning(f"Email log id={log_id} not found in worker DB; status not updated to {status.value}")
                    print(f"Email log id={log_id} not found in worker DB; status not updated to {status.value}")
        elif email_service:
            log_instance = email_service.log_model.get_by_id(log_id)
            if log_instance:
                log_instance.update(**update_data)
                if email_service.config.enable_verbose_logs:
                    logger.info("[dfa_mailer] log_update: updated (log_id=%s status=%s)", log_id, status.value)
                    print(f"[dfa_mailer] log_update: updated (log_id={log_id} status={status.value})")
            else:
                if email_service.config.enable_verbose_logs:
                    logger.warning(f"Email log id={log_id} not found via log_model.get_by_id; status not updated to {status.value}")
                    print(f"Email log id={log_id} not found via log_model.get_by_id; status not updated to {status.value}")
    except Exception as e:
        if session is not None:
            session.rollback()
        logger.error(f"Error updating email log {log_id}: {e}")
        if email_service and email_service.config.enable_verbose_logs:
            print(f"Error updating email log {log_id}: {e}")
    finally:
        if should_close and session is not None:
            session.close()


def _send_admin_alert(service: EmailService, admin_email: str, subject: str, html: str, text: str):
    """Send admin alert using the configured provider without templates."""
    # Reuse the underlying provider send
    service._send_email(
        recipient_email=admin_email,
        recipient_name=None,
        subject=subject,
        html_content=html,
        text_content=text,
    )


@shared_task
def retry_failed_emails_task(max_retries: int = 3):
    """
    Celery task to retry failed emails
    
    Args:
        max_retries: Maximum number of retries allowed
        
    Returns:
        Dictionary with retry result
    """
    email_service = get_email_service()
    
    try:
        retry_count = email_service.retry_failed_emails(max_retries)
        if email_service.config.enable_verbose_logs:
            logger.info(f"Retried {retry_count} failed emails")
            print(f"Retried {retry_count} failed emails")
        return {
            'status': 'success',
            'message': f'Retried {retry_count} failed emails',
            'retry_count': retry_count
        }
    except Exception as e:
        logger.error(f"Error in retry_failed_emails_task: {e}")
        if email_service and email_service.config.enable_verbose_logs:
            print(f"Error in retry_failed_emails_task: {e}")
        return {
            'status': 'error',
            'message': str(e)
        }


@shared_task
def cleanup_old_logs_task(days_old: int = 30):
    """
    Celery task to cleanup old email logs
    
    Args:
        days_old: Delete logs older than this many days
        
    Returns:
        Dictionary with cleanup result
    """
    email_service = get_email_service()
    
    if not email_service.log_model:
        error_msg = "Email log model not initialized"
        logger.error(error_msg)
        return {'status': 'error', 'message': error_msg}
    
    try:
        from datetime import datetime, timedelta
        
        cutoff_date = datetime.now() - timedelta(days=days_old)
        deleted_count = email_service.log_model.delete_old_logs(cutoff_date)
        
        if email_service.config.enable_verbose_logs:
            logger.info(f"Cleaned up {deleted_count} old email logs")
            print(f"Cleaned up {deleted_count} old email logs")
        return {
            'status': 'success',
            'message': f'Cleaned up {deleted_count} old email logs',
            'deleted_count': deleted_count
        }
    except Exception as e:
        logger.error(f"Error in cleanup_old_logs_task: {e}")
        if email_service and email_service.config.enable_verbose_logs:
            print(f"Error in cleanup_old_logs_task: {e}")
        return {
            'status': 'error',
            'message': str(e)
        }


# Periodic tasks (can be scheduled with celery beat)
@shared_task
def daily_retry_failed_emails():
    """Daily task to retry failed emails"""
    return retry_failed_emails_task.delay()


@shared_task
def weekly_cleanup_old_logs():
    """Weekly task to cleanup old email logs"""
    return cleanup_old_logs_task.delay(days_old=30)
