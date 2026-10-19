"""
Configuration management for DFA Mailer Service
"""

import os
import logging
from dataclasses import dataclass
from typing import Optional, List, Union, Literal

logger = logging.getLogger(__name__)


@dataclass
class EmailConfig:
    """
    Email configuration class
    """
    # SMTP Configuration
    smtp_host: str
    from_email: str
    smtp_port: int = 587
    use_tls: bool = True
    username: Optional[str] = None
    password: Optional[str] = None
    from_name: str = "DFA Mailer Service"
    
    # Celery Configuration
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    # Default Celery queue name to publish/consume email tasks
    celery_queue_name: str = "dfa_mailer_service"
    
    # Background service selection
    # When integrating with Django, set EMAIL_SERVICE_CONFIG['job_worker'] = 'celery'
    # If not provided, async email sending will be disabled
    job_worker: Optional[str] = None
    # Default send mode for emails: 'auto' (use async when celery is configured),
    # 'sync' (always send synchronously), or 'async' (always enqueue via job worker).
    send_mode: Literal['auto', 'sync', 'async'] = 'auto'
    
    # API prefix for routes (e.g., '/dfa-mailer' by default)
    api_prefix: str = "/dfa-mailer"
    
    # Mail provider selection and credentials
    # mail_provider: 'smtp' (default) or 'mailjet'
    mail_provider: str = "smtp"
    # Mailjet credentials (if mail_provider == 'mailjet')
    mailjet_api_key: Optional[str] = None
    mailjet_api_secret: Optional[str] = None
    
    # Admin alerts on async failures
    admin_alert_emails: Optional[List[str]] = None
    alert_on_async_failure: bool = True
    
    # Redis template cache URL (separate from Celery broker/backend)
    # Used for caching email templates independently of Celery configuration
    redis_template_cache_url: Optional[str] = None
    
    # Redis key prefix for building HTTP cache keys (e.g., "DFA")
    # Used to access templates from HTTP response cache
    redis_key_prefix: str = "DFA"
    
    # Verbose logging control
    # When False (default), suppresses info/warning/debug logs and print statements
    # Error logs are always shown regardless of this setting
    enable_verbose_logs: bool = False
    
    def __post_init__(self):
        """Normalize and validate configuration after initialization"""
        # Normalize admin_alert_emails to List[str]
        if isinstance(self.admin_alert_emails, str):
            self.admin_alert_emails = [
                email.strip() 
                for email in self.admin_alert_emails.split(',') 
                if email.strip()
            ]
        elif self.admin_alert_emails is None:
            self.admin_alert_emails = []
    
    def validate(self) -> bool:
        """
        Validate configuration
        
        Returns:
            True if configuration is valid, False otherwise
        """
        if not self.smtp_host:
            logger.error("SMTP host is required")
            return False
        if not self.from_email:
            logger.error("From email is required")
            return False
        if self.smtp_port <= 0 or self.smtp_port > 65535:
            logger.error(f"Invalid SMTP port: {self.smtp_port}")
            return False
        if self.mail_provider == 'mailjet':
            if not self.mailjet_api_key or not self.mailjet_api_secret:
                logger.error("Mailjet credentials are required when mail_provider='mailjet'")
                return False
        return True
    
    # Pagination configuration
    # pagination_type: 'offset' (skip/limit) or 'page' (page/page_size)
    pagination_type: str = "offset"
    page_size: int = 100
    
    # Trailing slash behavior for FastAPI routes
    # Default: no trailing slash to match common FastAPI style
    trailing_slash: bool = False

    # Host app system_bg_job_queue (same env as DFA API; dfa-mailer worker may start the poller)
    bg_job_mq_type: str = "CELERY"
    bg_job_poller_enabled: bool = False
    
    @classmethod
    def from_env(cls) -> 'EmailConfig':
        """
        Create EmailConfig from environment variables
        
        Environment variables:
        - DFA_SMTP_HOST: SMTP server host
        - DFA_SMTP_PORT: SMTP server port (default: 587)
        - DFA_SMTP_USE_TLS: Use TLS (default: True)
        - DFA_SMTP_USERNAME: SMTP username
        - DFA_SMTP_PASSWORD: SMTP password
        - DFA_FROM_EMAIL: From email address
        - DFA_FROM_NAME: From name (default: DFA Mailer Service)
        - DFA_CELERY_BROKER_URL: Celery broker URL (default: redis://localhost:6379/0)
        - DFA_CELERY_RESULT_BACKEND: Celery result backend URL (default: redis://localhost:6379/0)
        - DFA_CELERY_QUEUE_NAME: Celery queue name to publish/consume email tasks (default: dfa_mailer_service)
        - DFA_REDIS_TEMPLATE_CACHE_URL: Redis URL for template caching (separate from Celery, optional)
          If not set, will be built from REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD, REDIS_SSL
        - REDIS_KEY_PREFIX: Redis key prefix (default: DFA)
        - DFA_ENABLE_VERBOSE_LOGS: Enable verbose logging (info/warning/debug/print) (default: False)
        - BG_JOB_MQ_TYPE: CELERY or DB — when DB, mailer Celery worker may run the system_bg_job_queue poller
        - BG_JOB_POLLER_ENABLED: When true with BG_JOB_MQ_TYPE=DB, start in-process poller in dfa-mailer worker
          (requires host apps.shared importable)
        """
        # Build Redis template cache URL if not explicitly provided
        redis_template_cache_url = os.getenv('DFA_REDIS_TEMPLATE_CACHE_URL')
        if not redis_template_cache_url:
            # Try to build from individual Redis settings (DFA project pattern)
            redis_host = os.getenv('REDIS_HOST')
            if redis_host:
                redis_port = int(os.getenv('REDIS_PORT', '6379'))
                redis_db = int(os.getenv('REDIS_DB', '0'))
                redis_password = os.getenv('REDIS_PASSWORD', '')
                redis_ssl = os.getenv('REDIS_SSL', 'False').lower() == 'true'
                
                scheme = "rediss://" if redis_ssl else "redis://"
                auth_part = f":{redis_password}@" if redis_password else ""
                db_part = f"/{redis_db}" if redis_db is not None else "/0"
                redis_template_cache_url = f"{scheme}{auth_part}{redis_host}:{redis_port}{db_part}"
        
        # Get Redis key prefix
        redis_key_prefix = os.getenv('REDIS_KEY_PREFIX', 'DFA')

        _bg_poller = os.getenv("BG_JOB_POLLER_ENABLED", "false").strip().lower()

        return cls(
            smtp_host=os.getenv('DFA_SMTP_HOST', 'localhost'),
            smtp_port=int(os.getenv('DFA_SMTP_PORT', '587')),
            use_tls=os.getenv('DFA_SMTP_USE_TLS', 'True').lower() == 'true',
            username=os.getenv('DFA_SMTP_USERNAME'),
            password=os.getenv('DFA_SMTP_PASSWORD'),
            from_email=os.getenv('DFA_FROM_EMAIL', 'noreply@example.com'),
            from_name=os.getenv('DFA_FROM_NAME', 'DFA Mailer Service'),
            celery_broker_url=os.getenv('DFA_CELERY_BROKER_URL', 'redis://localhost:6379/0'),
            celery_result_backend=os.getenv('DFA_CELERY_RESULT_BACKEND', 'redis://localhost:6379/0'),
            celery_queue_name=os.getenv('DFA_CELERY_QUEUE_NAME', 'dfa_mailer_service'),
            job_worker=os.getenv('JOB_WORKER'),
            send_mode=os.getenv('DFA_SEND_MODE', 'auto').lower(),
            api_prefix=os.getenv('API_PREFIX', '/dfa-mailer'),
            mail_provider=os.getenv('MAIL_PROVIDER', 'smtp').lower(),
            mailjet_api_key=os.getenv('MAILJET_API_KEY'),
            mailjet_api_secret=os.getenv('MAILJET_API_SECRET'),
            admin_alert_emails=os.getenv('ADMIN_ALERT_EMAILS'),
            alert_on_async_failure=os.getenv('ALERT_ON_ASYNC_FAILURE', 'True').lower() == 'true',
            pagination_type=os.getenv('DFA_PAGINATION_TYPE', 'offset').lower(),
            page_size=int(os.getenv('DFA_PAGE_SIZE', '100')),
            trailing_slash=os.getenv('DFA_TRAILING_SLASH', 'False').lower() == 'true',
            redis_template_cache_url=redis_template_cache_url,
            redis_key_prefix=redis_key_prefix,
            enable_verbose_logs=os.getenv('DFA_ENABLE_VERBOSE_LOGS', 'False').lower() == 'true',
            bg_job_mq_type=os.getenv("BG_JOB_MQ_TYPE", "CELERY").strip().upper(),
            bg_job_poller_enabled=_bg_poller in ("true", "1", "yes", "on"),
        )
    
    @classmethod
    def from_django_settings(cls) -> Optional['EmailConfig']:
        """
        Create EmailConfig from Django settings if available.
        Looks for EMAIL_SERVICE_CONFIG dict in django.conf.settings.
        Returns None if Django or the setting is unavailable.
        """
        try:
            from django.conf import settings  # type: ignore
        except Exception:
            return None
        cfg = getattr(settings, 'EMAIL_SERVICE_CONFIG', None)
        if not cfg:
            return None
        return cls(
            smtp_host=cfg.get('smtp_host', 'localhost'),
            smtp_port=int(cfg.get('smtp_port', 587)),
            use_tls=bool(cfg.get('smtp_use_tls', True)),
            username=cfg.get('smtp_username'),
            password=cfg.get('smtp_password'),
            from_email=cfg.get('default_from', 'noreply@example.com'),
            from_name=cfg.get('from_name', 'DFA Mailer Service'),
            celery_broker_url=getattr(settings, 'CELERY_BROKER_URL', 'redis://localhost:6379/0'),
            celery_result_backend=getattr(settings, 'CELERY_RESULT_BACKEND', 'redis://localhost:6379/0'),
            celery_queue_name=cfg.get('celery_queue_name', 'dfa_mailer_service'),
            job_worker=cfg.get('job_worker'),
            send_mode=str(cfg.get('send_mode', 'auto')).lower(),
            api_prefix=cfg.get('api_prefix', '/dfa-mailer'),
            mail_provider=str(cfg.get('mail_provider', 'smtp')).lower(),
            mailjet_api_key=cfg.get('mailjet_api_key'),
            mailjet_api_secret=cfg.get('mailjet_api_secret'),
            admin_alert_emails=cfg.get('admin_alert_emails'),
            alert_on_async_failure=bool(cfg.get('alert_on_async_failure', True)),
            pagination_type=str(cfg.get('pagination_type', 'offset')).lower(),
            page_size=int(cfg.get('page_size', 100)),
            enable_verbose_logs=bool(cfg.get('enable_verbose_logs', False)),
            bg_job_mq_type=str(cfg.get('bg_job_mq_type', 'CELERY')).strip().upper(),
            bg_job_poller_enabled=bool(cfg.get('bg_job_poller_enabled', False)),
        )
