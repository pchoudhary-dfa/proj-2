"""
Email service with Celery background job support
"""

import logging
import json
from urllib.parse import urlparse
from datetime import datetime
from dataclasses import dataclass
from typing import Dict, Any, Optional, List, Union
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from jinja2 import Template, Environment, BaseLoader
from jinja2.exceptions import TemplateError

from .models import EmailTemplateSchema, EmailLogSchema, EmailStatus, EmailPriority
from .config import EmailConfig
from ..providers import EmailProvider, SMTPProvider, MailjetProvider
from ..jobs import JobClient, CeleryJobClient

logger = logging.getLogger(__name__)


@dataclass
class SendResult:
    """
    Unified result for email sending operations.

    Attributes:
        queued: True if the email was queued for async processing.
        task_id: Celery task ID when queued.
        success: True/False for synchronous send outcome (None when queued).
    """
    queued: bool
    task_id: Optional[str] = None
    success: Optional[bool] = None


class EmailService:
    """
    Main email service class that handles email sending, templating, and logging
    """
    
    def __init__(self, config: EmailConfig, template_model=None, log_model=None, 
                 email_provider: Optional[EmailProvider] = None, job_client: Optional[JobClient] = None):
        """
        Initialize the email service
        
        Args:
            config: Email configuration object
            template_model: Template model class (Django or SQLAlchemy)
            log_model: Log model class (Django or SQLAlchemy)
            email_provider: Email provider (auto-configured if None)
            job_client: Job client for async tasks (auto-configured if None)
        """
        self.config = config
        self.template_model = template_model
        self.log_model = log_model
        self.jinja_env = Environment(loader=BaseLoader())
        self._thread_lock = threading.Lock()
        self._redis = None
        self._template_cache_ttl = 3600  # seconds
        
        # Initialize provider
        self.email_provider = email_provider or self._create_email_provider()
        
        # Initialize job client
        self.job_client = job_client or self._create_job_client()
        
        self._init_template_cache_client()
    
    def _create_email_provider(self) -> EmailProvider:
        """Create email provider based on config"""
        provider = getattr(self.config, 'mail_provider', 'smtp').lower()
        
        if provider == 'mailjet':
            api_key = getattr(self.config, 'mailjet_api_key', None)
            api_secret = getattr(self.config, 'mailjet_api_secret', None)
            if not api_key or not api_secret:
                logger.error("Mailjet provider selected but credentials are missing")
                if self.config.enable_verbose_logs:
                    print("Mailjet provider selected but credentials are missing")
                raise ValueError("Mailjet API credentials are required when mail_provider='mailjet'")
            return MailjetProvider(api_key=api_key, api_secret=api_secret)
        else:
            # Default to SMTP
            return SMTPProvider(
                smtp_host=self.config.smtp_host,
                smtp_port=self.config.smtp_port,
                use_tls=self.config.use_tls,
                username=self.config.username,
                password=self.config.password,
            )
    
    def _create_job_client(self) -> Optional[JobClient]:
        """Create job client based on config"""
        job_worker = getattr(self.config, 'job_worker', None)
        if job_worker and job_worker.lower() == 'celery':
            queue_name = getattr(self.config, 'celery_queue_name', 'dfa_mailer_service')
            return CeleryJobClient(default_queue=queue_name)
        return None

    def _init_template_cache_client(self) -> None:
        """
        Initialize a Redis client for template caching using dedicated Redis URL.
        If Redis or URL parsing fails, caching is gracefully disabled.
        Works independently of Celery broker/backend configuration.
        """
        try:
            # Lazy import of redis sync client
            import redis  # type: ignore
        except Exception:
            if self.config.enable_verbose_logs:
                logger.info("Redis library not available; template caching disabled")
                print("Redis library not available; template caching disabled")
            self._redis = None
            return
        
        # Use dedicated Redis template cache URL (separate from Celery)
        url = getattr(self.config, "redis_template_cache_url", None)
        if not url or not isinstance(url, str) or not url.startswith(("redis://", "rediss://")):
            if self.config.enable_verbose_logs:
                logger.info("Redis template cache URL not configured; template caching disabled")
                print("Redis template cache URL not configured; template caching disabled")
            self._redis = None
            return
        
        try:
            # Create a simple sync client
            self._redis = redis.from_url(url, decode_responses=True)  # type: ignore
            if self.config.enable_verbose_logs:
                logger.info("Redis template cache client initialized successfully")
                print("Redis template cache client initialized successfully")
        except Exception as e:
            if self.config.enable_verbose_logs:
                logger.warning(f"Failed to initialize Redis for template cache: {e}")
                print(f"Failed to initialize Redis for template cache: {e}")
            self._redis = None

    def _template_cache_key(self, template_key: str, language: str) -> str:
        # Use a deterministic key; DFA prefix included for consistency with host
        return f"DFA:dfa-mailer:template:{template_key}:{(language or 'en').lower()}"
    
    def _get_http_cache_key(self, language: str) -> str:
        """
        Build HTTP cache key for templates list endpoint using the same pattern as the codebase.
        Format: {REDIS_KEY_PREFIX}/api/templates/?group_by_key=false&summary=false-{language}
        
        Uses build_redis_key from utils.redis_utils if available (DFA project),
        otherwise falls back to manual construction.
        """
        lang = (language or 'en').lower()
        path = "/api/templates"
        query = "?group_by_key=false&summary=false"
        
        # Try to use build_redis_key from utils.redis_utils if available (DFA project context)
        try:
            from utils.redis_utils import build_redis_key
            return build_redis_key(path, query, lang)
        except ImportError:
            # Fallback: manual construction if utils.redis_utils not available
            # This allows the package to work standalone
            redis_prefix = getattr(self.config, "redis_key_prefix", "DFA")
            return f"{redis_prefix}{path}/{query}-{lang}"
    
    def _get_template_from_http_cache(self, template_key: str, language: str) -> Optional[EmailTemplateSchema]:
        """
        Try to get template from HTTP cache list (all templates cached together).
        This uses the existing cache key created by the HTTP cache middleware.
        Handles both direct list and wrapped response structures.
        """
        if not self._redis:
            return None
        
        try:
            # Try to get from HTTP cache list
            http_cache_key = self._get_http_cache_key(language)
            raw = self._redis.get(http_cache_key)  # type: ignore
            if not raw:
                return None
            
            # Parse the cached data - could be direct list or wrapped in response structure
            cached_data = json.loads(raw)
            
            # Handle wrapped response structure (e.g., {"success": true, "data": [...]})
            if isinstance(cached_data, dict):
                # Check if it's a wrapped response with "data" field
                if "data" in cached_data:
                    templates_list = cached_data["data"]
                else:
                    # If it's a dict but no "data" field, it's not a list response
                    return None
            elif isinstance(cached_data, list):
                # Direct list (as shown in user's example)
                templates_list = cached_data
            else:
                return None
            
            if not isinstance(templates_list, list):
                return None
            
            # Search for matching template_key and language
            lang = (language or 'en').lower()
            for template_data in templates_list:
                if (template_data.get('template_key') == template_key and 
                    template_data.get('language', '').lower() == lang):
                    # Found matching template, convert to EmailTemplateSchema
                    try:
                        # Parse datetime fields (might be ISO strings or datetime objects)
                        created_at = template_data.get('created_at')
                        updated_at = template_data.get('updated_at')
                        
                        # Convert ISO strings to datetime if needed
                        if isinstance(created_at, str):
                            try:
                                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            except (ValueError, AttributeError):
                                created_at = None
                        
                        if isinstance(updated_at, str):
                            try:
                                updated_at = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                            except (ValueError, AttributeError):
                                updated_at = None
                        
                        return EmailTemplateSchema(
                            id=template_data.get('id'),
                            template_key=template_data.get('template_key'),
                            language=template_data.get('language'),
                            name=template_data.get('name'),
                            subject=template_data.get('subject'),
                            html_content=template_data.get('html_content'),
                            text_content=template_data.get('text_content'),
                            is_active=template_data.get('is_active', True),
                            created_at=created_at,
                            updated_at=updated_at
                        )
                    except Exception as e:
                        if self.config.enable_verbose_logs:
                            logger.debug(f"Failed to parse template from HTTP cache: {e}")
                            print(f"Failed to parse template from HTTP cache: {e}")
                        return None
            
            # Template not found in list
            return None
        except Exception as e:
            if self.config.enable_verbose_logs:
                logger.debug(f"Template HTTP cache get failed for {template_key}/{language}: {e}")
                print(f"Template HTTP cache get failed for {template_key}/{language}: {e}")
            return None

    def _get_cached_template(self, template_key: str, language: str) -> Optional[EmailTemplateSchema]:
        """
        Get cached template. ONLY uses HTTP cache list - no individual key caching.
        """
        if not self._redis:
            return None
        
        # Only try HTTP cache list - this is the source of truth
        template = self._get_template_from_http_cache(template_key, language)
        if template is not None:
            if self.config.enable_verbose_logs:
                logger.debug(f"Template found in HTTP cache list: {template_key}/{language}")
                print(f"Template found in HTTP cache list: {template_key}/{language}")
            return template
        
        # HTTP cache doesn't have it - return None (will fall back to DB)
        return None

    def _set_cached_template(self, tpl: EmailTemplateSchema) -> None:
        if not self._redis:
            return
        try:
            data = {
                "id": tpl.id,
                "template_key": tpl.template_key,
                "language": tpl.language,
                "name": tpl.name,
                "subject": tpl.subject,
                "html_content": tpl.html_content,
                "text_content": tpl.text_content,
                "is_active": tpl.is_active,
                # Store datetimes as ISO strings for portability
                "created_at": tpl.created_at.isoformat() if isinstance(tpl.created_at, datetime) else tpl.created_at,
                "updated_at": tpl.updated_at.isoformat() if isinstance(tpl.updated_at, datetime) else tpl.updated_at,
            }
            key = self._template_cache_key(tpl.template_key, tpl.language)
            # setex: value with TTL
            self._redis.setex(key, self._template_cache_ttl, json.dumps(data))  # type: ignore
        except Exception as e:
            if self.config.enable_verbose_logs:
                logger.debug(f"Template cache set failed for {tpl.template_key}/{tpl.language}: {e}")
                print(f"Template cache set failed for {tpl.template_key}/{tpl.language}: {e}")
        
    def get_template(self, template_key: str, language: str = 'en', session=None) -> Optional[EmailTemplateSchema]:
        """
        Get email template by key and language
        
        Args:
            template_key: Unique template identifier
            language: Language code (default: 'en')
            session: Database session (required for SQLAlchemy models)
            
        Returns:
            EmailTemplateSchema or None if not found
        """
        if not self.template_model:
            if self.config.enable_verbose_logs:
                logger.warning("[dfa_mailer] get_template: template_model not configured (template_key=%s lang=%s)", template_key, language)
                print(f"[dfa_mailer] get_template: template_model not configured (template_key={template_key} lang={language})")
            return None
            
        try:
            # Try cache first
            cached = self._get_cached_template(template_key, language)
            if cached is not None:
                if self.config.enable_verbose_logs:
                    logger.info("[dfa_mailer] get_template: cache HIT (template_key=%s lang=%s)", template_key, language)
                    print(f"[dfa_mailer] get_template: cache HIT (template_key={template_key} lang={language})")
                return cached
            if self.config.enable_verbose_logs:
                logger.info("[dfa_mailer] get_template: cache MISS (template_key=%s lang=%s has_session=%s)", template_key, language, bool(session is not None))
                print(f"[dfa_mailer] get_template: cache MISS (template_key={template_key} lang={language} has_session={bool(session is not None)})")
            # For SQLAlchemy models, we need a session
            if session is not None:
                template = self.template_model.get_by_key_and_language(session, template_key, language)
            else:
                # For Django models or other ORMs that don't need session
                template = self.template_model.get_by_key_and_language(template_key, language)
            if template:
                if self.config.enable_verbose_logs:
                    logger.info(
                        "[dfa_mailer] get_template: DB HIT (template_key=%s lang=%s active=%s)",
                        template_key,
                        language,
                        getattr(template, "is_active", None),
                    )
                    print(f"[dfa_mailer] get_template: DB HIT (template_key={template_key} lang={language} active={getattr(template, 'is_active', None)})")
                resolved = EmailTemplateSchema(
                    id=template.id,
                    template_key=template.template_key,
                    language=template.language,
                    name=template.name,
                    subject=template.subject,
                    html_content=template.html_content,
                    text_content=template.text_content,
                    is_active=template.is_active,
                    created_at=template.created_at,
                    updated_at=template.updated_at
                )
                # DO NOT cache to individual key - only use HTTP cache list
                # The HTTP cache will be populated when /api/templates endpoint is called
                return resolved
            if self.config.enable_verbose_logs:
                logger.warning("[dfa_mailer] get_template: DB MISS (template_key=%s lang=%s)", template_key, language)
                print(f"[dfa_mailer] get_template: DB MISS (template_key={template_key} lang={language})")
        except Exception:
            # IMPORTANT: do not swallow DB/ORM errors as "template not found".
            # Returning None here causes callers (including Celery tasks) to misreport
            # DB connectivity issues (e.g., timeouts) as missing templates.
            logger.exception(
                "[dfa_mailer] get_template failed (template_key=%s lang=%s)",
                template_key,
                language,
            )
            if self.config.enable_verbose_logs:
                print(f"[dfa_mailer] get_template failed (template_key={template_key} lang={language})")
            raise

        return None
    
    def render_template(self, template: EmailTemplateSchema, context: Dict[str, Any]) -> Dict[str, str]:
        """
        Render email template with context data
        
        Args:
            template: Email template schema
            context: Context data for template rendering
            
        Returns:
            Dictionary with rendered subject, html_content, and text_content
        """
        try:
            # Render subject
            subject_template = self.jinja_env.from_string(template.subject)
            rendered_subject = subject_template.render(**context)
            
            # Render HTML content
            html_template = self.jinja_env.from_string(template.html_content)
            rendered_html = html_template.render(**context)
            
            # Render text content if available
            rendered_text = None
            if template.text_content:
                text_template = self.jinja_env.from_string(template.text_content)
                rendered_text = text_template.render(**context)
            
            return {
                'subject': rendered_subject,
                'html_content': rendered_html,
                'text_content': rendered_text
            }
            
        except TemplateError as e:
            logger.error(f"Template rendering error: {e}")
            if self.config.enable_verbose_logs:
                print(f"Template rendering error: {e}")
            raise ValueError(f"Template rendering failed: {e}")
        except Exception as e:
            logger.error(f"Unexpected error during template rendering: {e}")
            if self.config.enable_verbose_logs:
                print(f"Unexpected error during template rendering: {e}")
            raise
    
    def create_email_log(self, template_key: str, recipient_email: str, 
                        recipient_name: Optional[str], subject: str, 
                        html_content: str, text_content: Optional[str],
                        context: Dict[str, Any], priority: EmailPriority = EmailPriority.NORMAL,
                        session: Optional[Any] = None) -> EmailLogSchema:
        """
        Create email log entry
        
        Args:
            template_key: Template key used
            recipient_email: Recipient email address
            recipient_name: Recipient name (optional)
            subject: Email subject
            html_content: HTML content
            text_content: Text content (optional)
            context: Context data used
            priority: Email priority
            
        Returns:
            EmailLogSchema object
        """
        email_log = EmailLogSchema(
            template_key=template_key,
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            context=context,
            priority=priority,
            status=EmailStatus.PENDING
        )
        
        if self.log_model:
            log_instance = None
            own_session = None
            try:
                log_data = email_log.to_dict()
                log_data.pop('id', None)

                if session is not None:
                    log_instance = self.log_model(**log_data)
                    session.add(log_instance)
                    session.commit()
                    try:
                        session.refresh(log_instance)
                    except Exception:
                        pass
                else:
                    session_factory = getattr(self.log_model, "_default_session_factory", None)
                    if session_factory:
                        own_session = session_factory()
                        log_instance = self.log_model(**log_data)
                        own_session.add(log_instance)
                        own_session.commit()
                        try:
                            own_session.refresh(log_instance)
                        except Exception:
                            pass
                    else:
                        # No session and no factory (e.g. non-SQLAlchemy adapter): legacy no-op save()
                        log_instance = self.log_model(**log_data)
                        save_result = log_instance.save()
                        if save_result is not None:
                            log_instance = save_result

                if log_instance is not None:
                    email_log.id = getattr(log_instance, 'id', email_log.id)
                    email_log.created_at = getattr(log_instance, 'created_at', email_log.created_at)
                    email_log.updated_at = getattr(log_instance, 'updated_at', email_log.updated_at)
                    email_log.sent_at = getattr(log_instance, 'sent_at', email_log.sent_at)
                    status_value = getattr(log_instance, 'status', None)
                    if status_value is not None:
                        try:
                            email_log.status = EmailStatus(status_value)
                        except Exception:
                            email_log.status = status_value
                    priority_value = getattr(log_instance, 'priority', None)
                    if priority_value is not None:
                        try:
                            email_log.priority = EmailPriority(priority_value)
                        except Exception:
                            email_log.priority = priority_value
            except Exception as e:
                if session is not None:
                    session.rollback()
                if own_session is not None:
                    own_session.rollback()
                logger.error(f"Error saving email log: {e}")
                if self.config.enable_verbose_logs:
                    print(f"Error saving email log: {e}")
            finally:
                if own_session is not None:
                    own_session.close()
        
        return email_log
    
    def _update_email_log_status(self, email_log: EmailLogSchema, status: EmailStatus, 
                                error_message: Optional[str] = None, sent_at: Optional[datetime] = None):
        """
        Thread-safe method to update email log status in database
        """
        with self._thread_lock:
            if self.log_model and email_log.id:
                session = None
                should_close = False
                try:
                    update_data = {
                        'status': status.value,
                        'error_message': error_message,
                    }
                    if sent_at:
                        update_data['sent_at'] = sent_at

                    session_factory = getattr(self.log_model, '_default_session_factory', None)
                    log_instance = None
                    if session_factory:
                        session = session_factory()
                        should_close = True
                        log_instance = session.query(self.log_model).filter(self.log_model.id == email_log.id).first()
                        if log_instance:
                            for field, value in update_data.items():
                                setattr(log_instance, field, value)
                            session.commit()
                            try:
                                session.refresh(log_instance)
                            except Exception:
                                pass
                    else:
                        log_instance = self.log_model.get_by_id(email_log.id)
                        if log_instance:
                            log_instance.update(**update_data)

                    if log_instance:
                        # Update local object too
                        email_log.status = status
                        email_log.error_message = error_message
                        if sent_at:
                            email_log.sent_at = sent_at
                except Exception as e:
                    if session is not None:
                        session.rollback()
                    logger.error(f"Error updating email log: {e}")
                    print(f"Error updating email log: {e}")
                finally:
                    if should_close and session is not None:
                        session.close()

    def send_email_sync(self, template_key: str, recipient_email: str, 
                       context: Dict[str, Any], language: str = 'en',
                       recipient_name: Optional[str] = None,
                       priority: EmailPriority = EmailPriority.NORMAL,
                       recipient_emails: Optional[List[str]] = None,
                       session=None) -> bool:
        """
        Send email synchronously (for testing or immediate sending)
        
        Args:
            template_key: Template key to use
            recipient_email: Recipient email address
            context: Context data for template rendering
            language: Language code (default: 'en')
            recipient_name: Recipient name (optional)
            priority: Email priority
            
        Returns:
            True if email sent successfully, False otherwise
        """
        try:
            # Get template
            template = self.get_template(template_key, language, session)
            if not template:
                logger.error(f"Template not found: {template_key}")
                if self.config.enable_verbose_logs:
                    print(f"Template not found: {template_key}")
                return False
            
            if not template.is_active:
                logger.error(f"Template is inactive: {template_key}")
                if self.config.enable_verbose_logs:
                    print(f"Template is inactive: {template_key}")
                return False
            
            # Render template
            rendered = self.render_template(template, context)
            
            # Normalize recipients (support list or comma/semicolon separated string)
            normalized_recipients: List[str]
            if recipient_emails:
                normalized_recipients = [e.strip() for e in recipient_emails if e and str(e).strip()]
            else:
                parts = [p.strip() for p in str(recipient_email or "").replace(';', ',').split(',') if p and p.strip()]
                normalized_recipients = parts if parts else [recipient_email]
            recipients_str = ', '.join(normalized_recipients)
            
            # Create email log
            email_log = self.create_email_log(
                template_key=template_key,
                recipient_email=recipients_str,
                recipient_name=recipient_name,
                subject=rendered['subject'],
                html_content=rendered['html_content'],
                text_content=rendered['text_content'],
                context=context,
                priority=priority,
                session=session
            )
            
            envelope_from_name = (context.get("from_name") or "").strip() or None

            # Send email in a separate thread for better performance
            def send_email_task():
                try:
                    success = self._send_email(
                        recipient_email=recipient_email,
                        recipient_emails=normalized_recipients,
                        recipient_name=recipient_name,
                        subject=rendered['subject'],
                        html_content=rendered['html_content'],
                        text_content=rendered['text_content'],
                        from_name=envelope_from_name,
                    )
                    
                    # Update log status
                    if success:
                        self._update_email_log_status(
                            email_log, 
                            EmailStatus.SENT, 
                            sent_at=datetime.now()
                        )
                        if self.config.enable_verbose_logs:
                            logger.info(f"Email sent successfully to {recipients_str}")
                            print(f"Email sent successfully to {recipients_str}")
                    else:
                        self._update_email_log_status(
                            email_log, 
                            EmailStatus.FAILED, 
                            error_message="Failed to send email"
                        )
                        logger.error(f"Failed to send email to {recipients_str}")
                        if self.config.enable_verbose_logs:
                            print(f"Failed to send email to {recipients_str}")
                    
                    return success
                except Exception as e:
                    error_msg = f"Exception during email sending: {str(e)}"
                    self._update_email_log_status(
                        email_log, 
                        EmailStatus.FAILED, 
                        error_message=error_msg
                    )
                    logger.error(error_msg)
                    if self.config.enable_verbose_logs:
                        print(error_msg)
                    return False
            
            # Use ThreadPoolExecutor for better resource management
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(send_email_task)
                success = future.result()  # Wait for completion
            
            return success
            
        except Exception as e:
            logger.error(f"Error in send_email_sync: {e}")
            if self.config.enable_verbose_logs:
                print(f"Error in send_email_sync: {e}")
            return False
    
    def send_email_async(self, template_key: str, recipient_email: str, 
                        context: Dict[str, Any], language: str = 'en',
                        recipient_name: Optional[str] = None,
                        priority: EmailPriority = EmailPriority.NORMAL,
                        recipient_emails: Optional[List[str]] = None,
                        session=None,
                        queue_name: Optional[str] = None) -> str:
        """
        Send email asynchronously via the configured job client (Celery or system_bg_job_queue).
        
        Args:
            template_key: Template key to use
            recipient_email: Recipient email address
            context: Context data for template rendering
            language: Language code (default: 'en')
            recipient_name: Recipient name (optional)
            priority: Email priority
            
        Returns:
            Celery task ID or DB queue job id (string)
        """
        # Check job client is available
        if not self.job_client:
            logger.error(
                "Async email disabled: set job_worker to 'celery' or 'db' (with BG_JOB_MQ_TYPE=DB "
                "and BG_JOB_POLLER_ENABLED=true for db)"
            )
            if self.config.enable_verbose_logs:
                print(
                    "Async email disabled: set job_worker to 'celery' or 'db' "
                    "(with BG_JOB_MQ_TYPE=DB and BG_JOB_POLLER_ENABLED=true for db)"
                )
            raise RuntimeError(
                "Async email disabled: set job_worker to 'celery' or 'db' "
                "(host must configure job_client / JOB_WORKER)"
            )

        # Get template and render it first to create log entry
        if self.config.enable_verbose_logs:
            logger.info(
                "[dfa_mailer] send_email_async: start (template_key=%s lang=%s recipient=%s)",
                template_key,
                language,
                recipient_email,
            )
            print(f"[dfa_mailer] send_email_async: start (template_key={template_key} lang={language} recipient={recipient_email})")
        template = self.get_template(template_key, language, session)
        if not template:
            logger.error(f"Template not found: {template_key}")
            if self.config.enable_verbose_logs:
                print(f"Template not found: {template_key}")
            raise ValueError(f"Template not found: {template_key}")
        
        if not template.is_active:
            logger.error(f"Template is inactive: {template_key}")
            if self.config.enable_verbose_logs:
                print(f"Template is inactive: {template_key}")
            raise ValueError(f"Template is inactive: {template_key}")
        
        # Render template
        rendered = self.render_template(template, context)
        
        # Normalize recipients (support list or comma/semicolon separated string)
        normalized_recipients: List[str]
        if recipient_emails:
            normalized_recipients = [e.strip() for e in recipient_emails if e and str(e).strip()]
        else:
            parts = [p.strip() for p in str(recipient_email or "").replace(';', ',').split(',') if p and p.strip()]
            normalized_recipients = parts if parts else [recipient_email]
        recipients_str = ', '.join(normalized_recipients)

        # Create email log entry
        email_log = self.create_email_log(
            template_key=template_key,
            recipient_email=recipients_str,
            recipient_name=recipient_name,
            subject=rendered['subject'],
            html_content=rendered['html_content'],
            text_content=rendered['text_content'],
            context=context,
            priority=priority,
            session=session
        )

        # Enqueue via job client
        if self.config.enable_verbose_logs:
            logger.info(
                "[dfa_mailer] send_email_async: enqueue (template_key=%s log_id=%s queue_name=%s recipients=%s)",
                template_key,
                getattr(email_log, "id", None),
                queue_name,
                recipients_str,
            )
            print(f"[dfa_mailer] send_email_async: enqueue (template_key={template_key} log_id={getattr(email_log, 'id', None)} queue_name={queue_name} recipients={recipients_str})")
        task_id = self.job_client.enqueue_send_email(
            template_key=template_key,
            recipient_email=recipient_email,
            recipient_emails=normalized_recipients,
            context=context,
            language=language,
            recipient_name=recipient_name,
            priority=priority.value,
            log_id=email_log.id,
            queue_name=queue_name,
        )
        if self.config.enable_verbose_logs:
            logger.info("[dfa_mailer] send_email_async: queued (task_id=%s log_id=%s)", task_id, getattr(email_log, "id", None))
            print(f"[dfa_mailer] send_email_async: queued (task_id={task_id} log_id={getattr(email_log, 'id', None)})")
        return task_id

    def send_email(
        self,
        template_key: str,
        recipient_email: str,
        context: Dict[str, Any],
        language: str = 'en',
        recipient_name: Optional[str] = None,
        priority: EmailPriority = EmailPriority.NORMAL,
        recipient_emails: Optional[List[str]] = None,
        session=None,
        queue_name: Optional[str] = None,
        send_async: Optional[bool] = None,
    ) -> SendResult:
        """
        Unified API to send email either synchronously or asynchronously.

        The decision is based on the explicit send_async flag when provided,
        otherwise on configuration:
        - send_mode == 'sync'  -> synchronous
        - send_mode == 'async' -> asynchronous
        - send_mode == 'auto'  -> async when job_worker is 'celery' or 'db', else sync.
        """
        # explicit flag wins
        if send_async is None:
            mode = getattr(self.config, "send_mode", "auto")
            if mode == "sync":
                use_async = False
            elif mode == "async":
                use_async = True
            else:
                job_worker = (getattr(self.config, "job_worker", "") or "").lower()
                use_async = job_worker in ("celery", "db")
        else:
            use_async = bool(send_async)

        if self.config.enable_verbose_logs:
            logger.info(
                "[dfa_mailer] send_email: decision (template_key=%s lang=%s recipient=%s use_async=%s send_async_arg=%s send_mode=%s job_worker=%s has_job_client=%s)",
                template_key,
                language,
                recipient_email,
                use_async,
                send_async,
                getattr(self.config, "send_mode", None),
                getattr(self.config, "job_worker", None),
                bool(self.job_client),
            )
            print(f"[dfa_mailer] send_email: decision (template_key={template_key} lang={language} recipient={recipient_email} use_async={use_async} send_async_arg={send_async} send_mode={getattr(self.config, 'send_mode', None)} job_worker={getattr(self.config, 'job_worker', None)} has_job_client={bool(self.job_client)})")
        if use_async:
            task_id = self.send_email_async(
                template_key=template_key,
                recipient_email=recipient_email,
                recipient_emails=recipient_emails,
                context=context,
                language=language,
                recipient_name=recipient_name,
                priority=priority,
                session=session,
                queue_name=queue_name,
            )
            return SendResult(queued=True, task_id=task_id)

        success = self.send_email_sync(
            template_key=template_key,
            recipient_email=recipient_email,
            recipient_emails=recipient_emails,
            context=context,
            language=language,
            recipient_name=recipient_name,
            priority=priority,
            session=session,
        )
        return SendResult(queued=False, success=success)
    
    def _send_email(self, recipient_email: str, recipient_name: Optional[str],
                   subject: str, html_content: str, text_content: Optional[str],
                   recipient_emails: Optional[List[str]] = None,
                   attachments: Optional[List[Dict[str, Any]]] = None,
                   from_name: Optional[str] = None) -> bool:
        """
        Internal method to send email using configured provider
        
        Args:
            recipient_email: Recipient email address
            recipient_name: Recipient name (optional)
            subject: Email subject
            html_content: HTML content
            text_content: Text content (optional)
            recipient_emails: List of recipient emails (optional)
            attachments: List of attachments, each dict with 'filename', 'content', 'mimetype'
            from_name: Optional SMTP envelope sender display name; falls back to config.from_name
            
        Returns:
            True if email sent successfully, False otherwise
        """
        # Normalize recipients
        to_recipients: List[str]
        if recipient_emails:
            to_recipients = [e.strip() for e in recipient_emails if e and str(e).strip()]
        else:
            parts = [p.strip() for p in str(recipient_email or "").replace(';', ',').split(',') if p and p.strip()]
            to_recipients = parts if parts else [recipient_email]

        envelope_from_name = (from_name or "").strip() or self.config.from_name
        
        # Delegate to provider
        return self.email_provider.send_email(
            from_email=self.config.from_email,
            from_name=envelope_from_name,
            to_recipients=to_recipients,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            recipient_name=recipient_name,
            attachments=attachments,
        )
    
    def get_email_logs(self, **filters) -> List[EmailLogSchema]:
        """
        Get email logs with optional filters
        
        Args:
            **filters: Filter parameters (template_key, recipient_email, status, etc.)
            
        Returns:
            List of EmailLogSchema objects
        """
        if not self.log_model:
            return []
        
        try:
            logs = self.log_model.filter(**filters)
            return [
                EmailLogSchema(
                    id=log.id,
                    template_key=log.template_key,
                    recipient_email=log.recipient_email,
                    recipient_name=log.recipient_name,
                    subject=log.subject,
                    html_content=log.html_content,
                    text_content=log.text_content,
                    context=log.context,
                    status=EmailStatus(log.status) if isinstance(log.status, str) else log.status,
                    priority=EmailPriority(log.priority) if isinstance(log.priority, str) else log.priority,
                    sent_at=log.sent_at,
                    error_message=log.error_message,
                    retry_count=log.retry_count,
                    max_retries=log.max_retries,
                    created_at=log.created_at,
                    updated_at=log.updated_at
                )
                for log in logs
            ]
        except Exception as e:
            logger.error(f"Error getting email logs: {e}")
            if self.config.enable_verbose_logs:
                print(f"Error getting email logs: {e}")
            return []
    
    def retry_failed_emails(self, max_retries: int = 3) -> int:
        """
        Retry failed emails that haven't exceeded max retry count
        
        Args:
            max_retries: Maximum number of retries allowed
            
        Returns:
            Number of emails queued for retry
        """
        if not self.log_model:
            return 0
        
        try:
            failed_logs = self.log_model.get_by_status(EmailStatus.FAILED)
            retry_count = 0
            
            for log in failed_logs:
                if log.retry_count < max_retries:
                    # Queue for retry
                    task_id = self.send_email_async(
                        template_key=log.template_key,
                        recipient_email=log.recipient_email,
                        context=log.context,
                        recipient_name=log.recipient_name,
                        priority=EmailPriority(log.priority)
                    )
                    
                    # Update retry count
                    log.update(retry_count=log.retry_count + 1, status=EmailStatus.RETRYING.value)
                    retry_count += 1
            
            if self.config.enable_verbose_logs:
                logger.info(f"Queued {retry_count} emails for retry")
                print(f"Queued {retry_count} emails for retry")
            return retry_count
            
        except Exception as e:
            logger.error(f"Error retrying failed emails: {e}")
            if self.config.enable_verbose_logs:
                print(f"Error retrying failed emails: {e}")
            return 0
