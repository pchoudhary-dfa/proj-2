"""
FastAPI adapter for DFA Mailer Service
"""

import logging
import asyncio
from typing import Dict, Any, Optional, List, Callable, Awaitable
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, JSON, Index
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, validator
from contextlib import contextmanager

from ..core.models import EmailTemplateSchema, EmailLogSchema, EmailStatus, EmailPriority, BaseEmailTemplate, BaseEmailLog
from abc import ABCMeta
try:
    # SQLAlchemy 2.x may export DeclarativeMeta at sqlalchemy.orm
    from sqlalchemy.orm import DeclarativeMeta  # type: ignore
except Exception:  # pragma: no cover - fallback for older SA
    # SQLAlchemy 1.4 compatibility
    from sqlalchemy.orm.decl_api import DeclarativeMeta  # type: ignore
from ..core.service import EmailService, SendResult
from ..core.config import EmailConfig
from ..tasks.email_tasks import initialize_celery

logger = logging.getLogger(__name__)


def _default_engine_kwargs() -> Dict[str, Any]:
    """Default engine kwargs for resilience when no host config is provided (e.g. pool_pre_ping, pool_recycle)."""
    return {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }

# SQLAlchemy setup with ABC compatibility (avoids metaclass conflicts on SA 2.x)
class DeclarativeABCMeta(DeclarativeMeta, ABCMeta):
    pass

Base = declarative_base(metaclass=DeclarativeABCMeta)


class EmailTemplate(Base, BaseEmailTemplate):
    """
    SQLAlchemy model for email templates
    """
    __tablename__ = 'dfa_email_templates'
    
    id = Column(Integer, primary_key=True, index=True)
    template_key = Column(String(100), nullable=False, index=True)
    language = Column(String(10), nullable=False, default='en', index=True)
    name = Column(String(200), nullable=False)
    subject = Column(String(500), nullable=False)
    html_content = Column(Text, nullable=False)
    text_content = Column(Text, nullable=True)
    created_by = Column(JSON, default=dict, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_template_key_language', 'template_key', 'language', unique=True),
    )
    
    def __repr__(self):
        return f"<EmailTemplate(template_key='{self.template_key}', language='{self.language}')>"
    
    @classmethod
    def get_by_key_and_language(cls, session: Session, template_key: str, language: str) -> Optional['EmailTemplate']:
        try:
            return session.query(cls).filter(
                cls.template_key == template_key,
                cls.language == language,
                cls.is_active == True
            ).first()
        except SQLAlchemyError as e:
            # Do not convert DB errors into "not found" (None). Upstream callers need
            # the real root cause (e.g., connection timeouts) so Celery retries/alerts
            # and API errors are accurate.
            logger.exception(
                "[dfa_mailer] DB error getting template (template_key=%s lang=%s)",
                template_key,
                language,
            )
            raise
    
    @classmethod
    def get_all_by_key(cls, session: Session, template_key: str) -> List['EmailTemplate']:
        try:
            return session.query(cls).filter(
                cls.template_key == template_key,
                cls.is_active == True
            ).all()
        except SQLAlchemyError as e:
            logger.exception(
                "[dfa_mailer] DB error getting templates by key (template_key=%s)",
                template_key,
            )
            raise
    
    @classmethod
    def get_all_active(cls, session: Session) -> List['EmailTemplate']:
        try:
            return session.query(cls).filter(cls.is_active == True).all()
        except SQLAlchemyError as e:
            logger.exception("[dfa_mailer] DB error getting active templates")
            raise
    
    def save(self) -> 'EmailTemplate':
        """Save the template to database"""
        # This method is required by the abstract base class but not used in SQLAlchemy
        # SQLAlchemy handles saving through session.add() and session.commit()
        return self
    
    def delete(self) -> bool:
        """Delete the template from database"""
        # This method is required by the abstract base class but not used in SQLAlchemy
        # SQLAlchemy handles deletion through session.delete()
        return True
    
    def update(self, **kwargs) -> 'EmailTemplate':
        """Update template fields"""
        # This method is required by the abstract base class but not used in SQLAlchemy
        # SQLAlchemy handles updates through direct attribute assignment
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        return self


class EmailLog(Base, BaseEmailLog):
    """
    SQLAlchemy model for email logs
    """
    __tablename__ = 'dfa_email_logs'
    
    id = Column(Integer, primary_key=True, index=True)
    template_key = Column(String(100), nullable=False, index=True)
    recipient_email = Column(String(254), nullable=False, index=True)
    recipient_name = Column(String(200), nullable=True)
    subject = Column(String(500), nullable=False)
    html_content = Column(Text, nullable=False)
    text_content = Column(Text, nullable=True)
    context = Column(JSON, default=dict)
    status = Column(String(20), nullable=False, default=EmailStatus.PENDING.value, index=True)
    priority = Column(String(20), nullable=False, default=EmailPriority.NORMAL.value)
    sent_at = Column(DateTime, nullable=True, index=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<EmailLog(recipient='{self.recipient_email}', status='{self.status}')>"
    
    @classmethod
    def get_by_id(cls, session: Session, log_id: int) -> Optional['EmailLog']:
        try:
            return session.query(cls).filter(cls.id == log_id).first()
        except SQLAlchemyError as e:
            logger.error(f"Error getting log by ID: {e}")
            return None
    
    @classmethod
    def get_by_status(cls, session: Session, status: EmailStatus) -> List['EmailLog']:
        try:
            return session.query(cls).filter(cls.status == status.value).order_by(cls.created_at.desc()).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting logs by status: {e}")
            return []
    
    @classmethod
    def get_by_recipient(cls, session: Session, email: str) -> List['EmailLog']:
        try:
            return session.query(cls).filter(cls.recipient_email == email).order_by(cls.created_at.desc()).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting logs by recipient: {e}")
            return []
    
    @classmethod
    def get_pending_emails(cls, session: Session) -> List['EmailLog']:
        try:
            return session.query(cls).filter(cls.status == EmailStatus.PENDING.value).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting pending emails: {e}")
            return []
    
    @classmethod
    def filter(cls, session: Session, **filters) -> List['EmailLog']:
        try:
            query = session.query(cls)
            for key, value in filters.items():
                if hasattr(cls, key):
                    query = query.filter(getattr(cls, key) == value)
            return query.all()
        except SQLAlchemyError as e:
            logger.error(f"Error filtering logs: {e}")
            return []
    
    @classmethod
    def delete_old_logs(cls, session: Session, cutoff_date: datetime) -> int:
        """Delete logs older than cutoff_date"""
        try:
            result = session.query(cls).filter(cls.created_at < cutoff_date).delete()
            session.commit()
            return result
        except SQLAlchemyError as e:
            logger.error(f"Error deleting old logs: {e}")
            session.rollback()
            return 0
    
    def save(self) -> 'EmailLog':
        """Save the log to database"""
        # This method is required by the abstract base class but not used in SQLAlchemy
        # SQLAlchemy handles saving through session.add() and session.commit()
        return self
    
    def delete(self) -> bool:
        """Delete the log from database"""
        # This method is required by the abstract base class but not used in SQLAlchemy
        # SQLAlchemy handles deletion through session.delete()
        return True
    
    def update(self, **kwargs) -> 'EmailLog':
        """Update log fields"""
        # This method is required by the abstract base class but not used in SQLAlchemy
        # SQLAlchemy handles updates through direct attribute assignment
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        return self


# Pydantic models
class EmailTemplateCreate(BaseModel):
    """Pydantic model for creating email templates"""
    template_key: str
    language: str = 'en'
    name: str
    subject: str
    html_content: str
    text_content: Optional[str] = None
    created_by: Optional[Dict[str, Any]] = None
    is_active: bool = True
    
    @validator('template_key')
    def validate_template_key(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError('Template key cannot be empty')
        return v.strip()
    
    @validator('language')
    def validate_language(cls, v):
        if not v or len(v) < 2:
            raise ValueError('Language code must be at least 2 characters')
        return v.lower()


class EmailTemplateUpdate(BaseModel):
    """Pydantic model for updating email templates"""
    name: Optional[str] = None
    subject: Optional[str] = None
    html_content: Optional[str] = None
    text_content: Optional[str] = None
    created_by: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class EmailTemplateResponse(BaseModel):
    """Pydantic model for email template responses"""
    id: int
    template_key: str
    language: str
    name: str
    subject: str
    html_content: str
    text_content: Optional[str]
    created_by: Optional[Dict[str, Any]] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class EmailLogResponse(BaseModel):
    """Pydantic model for email log responses"""
    id: int
    template_key: str
    recipient_email: str
    recipient_name: Optional[str]
    subject: str
    html_content: str
    text_content: Optional[str]
    context: Dict[str, Any]
    status: str
    priority: str
    sent_at: Optional[datetime]
    error_message: Optional[str]
    retry_count: int
    max_retries: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class SendEmailRequest(BaseModel):
    """Pydantic model for sending emails"""
    template_key: str
    recipient_email: EmailStr
    recipient_emails: Optional[List[EmailStr]] = None
    recipient_name: Optional[str] = None
    context: Dict[str, Any] = {}
    language: str = 'en'
    priority: str = EmailPriority.NORMAL.value
    send_async: bool = True
    queue_name: Optional[str] = None


class SendEmailResponse(BaseModel):
    """Pydantic model for send email responses"""
    status: str
    message: str
    task_id: Optional[str] = None


# Database dependency
def get_db_session():
    """Get database session"""
    # This should be configured by the parent application
    # For now, we'll use a placeholder
    pass


class FastAPIAdapter:
    """
    FastAPI adapter for DFA Mailer Service
    """
    
    def __init__(
        self,
        config: Optional[EmailConfig] = None,
        database_url: Optional[str] = None,
        on_templates_mutated: Optional[Callable[[Optional[str], Optional[str]], Awaitable[None]]] = None,
        engine_kwargs: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize FastAPI adapter

        Args:
            config: Email configuration (optional, will use env vars if not provided)
            database_url: Database URL for SQLAlchemy (optional, should be provided by parent app)
            on_templates_mutated: Optional async callback invoked after create/update/delete of templates
            engine_kwargs: Optional SQLAlchemy create_engine kwargs (e.g. pool_pre_ping, pool_recycle).
                When None, defaults to pool_pre_ping=True and pool_recycle=1800 for connection resilience.
        """
        self.config = config or EmailConfig.from_env()
        self.database_url = database_url
        self.engine_kwargs = engine_kwargs
        self.engine = None
        self.SessionLocal = None
        self.email_service = None
        self.on_templates_mutated = on_templates_mutated
        self._initialize()
    
    async def _notify_templates_mutated(self, template_key: Optional[str] = None, language: Optional[str] = None) -> None:
        """Notify host app that templates changed so it can handle cache invalidation."""
        cb = self.on_templates_mutated
        if not cb:
            return
        try:
            result = cb(template_key, language)
            if asyncio.iscoroutine(result):
                await result
        except Exception as e:
            logger.warning(f"on_templates_mutated callback failed: {e}")
    
    def _initialize(self):
        """Initialize database and email service"""
        if self.database_url:
            kwargs = self.engine_kwargs if self.engine_kwargs is not None else _default_engine_kwargs()
            self.engine = create_engine(self.database_url, **kwargs)
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
            
            # Create tables
            Base.metadata.create_all(bind=self.engine)
            # Expose session factory so core service utilities and Celery workers can open
            # scoped sessions when they need to mutate logs outside the request cycle.
            try:
                EmailTemplate._default_session_factory = self.SessionLocal  # type: ignore[attr-defined]
            except Exception:
                pass
            try:
                EmailLog._default_session_factory = self.SessionLocal  # type: ignore[attr-defined]
            except Exception:
                pass
            # Provide a no-session fallback for Celery workers and callers that
            # invoke EmailTemplate.get_by_key_and_language without an explicit session.
            # This mirrors typical patterns in app-level monkey patches, but keeps the
            # behavior inside the package so host apps don't need to patch.
            try:
                _orig_get = EmailTemplate.get_by_key_and_language
                SessionLocal = self.SessionLocal

                def _patched_get(cls, *args, **kwargs):
                    # Support both forms: (session, template_key, language) and (template_key, language)
                    if len(args) == 2:
                        template_key, language = args
                        db = SessionLocal()
                        try:
                            return _orig_get(db, template_key, language)
                        finally:
                            db.close()
                    return _orig_get(*args, **kwargs)

                EmailTemplate.get_by_key_and_language = classmethod(_patched_get)  # type: ignore
            except Exception:
                # Best-effort; if anything goes wrong, we keep original behavior
                pass
        
        # Initialize Celery and email service
        initialize_celery(self.config, EmailTemplate, EmailLog)
        from ..tasks.email_tasks import email_service
        self.email_service = email_service
    
    @contextmanager
    def get_db(self):
        """Get database session context manager"""
        if not self.SessionLocal:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database not configured"
            )
        
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()
    
    def get_email_service(self) -> EmailService:
        """Get email service instance"""
        return self.email_service
    
    def get_models(self):
        """Get SQLAlchemy models"""
        return {
            'EmailTemplate': EmailTemplate,
            'EmailLog': EmailLog
        }
    
    def get_pydantic_models(self):
        """Get Pydantic models"""
        return {
            'EmailTemplateCreate': EmailTemplateCreate,
            'EmailTemplateUpdate': EmailTemplateUpdate,
            'EmailTemplateResponse': EmailTemplateResponse,
            'EmailLogResponse': EmailLogResponse,
            'SendEmailRequest': SendEmailRequest,
            'SendEmailResponse': SendEmailResponse
        }
    
    def create_routers(self) -> List:
        """Create FastAPI routers"""
        from fastapi import APIRouter
        
        # Email Templates Router
        templates_router = APIRouter(prefix="/templates", tags=["Email Templates"])
        root_suffix = "/" if getattr(self.config, 'trailing_slash', False) else ""
        
        @templates_router.get(root_suffix, response_model=List[EmailTemplateResponse])
        async def get_templates(
            template_key: Optional[str] = Query(None),
            language: Optional[str] = Query(None),
            is_active: Optional[bool] = Query(None),
            group_by_key: bool = Query(False, description="Return one record per template_key"),
            summary: bool = Query(False, description="Return only summary fields for templates"),
            summary_language: Optional[str] = Query(None, description="Language to pick for grouped summary; defaults to 'en' or latest updated"),
            page: Optional[int] = Query(None, ge=1),
            page_size: Optional[int] = Query(None, ge=1),
            skip: Optional[int] = Query(None, ge=0),
            limit: Optional[int] = Query(None, ge=1)
        ):
            """Get email templates with optional filters"""
            with self.get_db() as db:
                query = db.query(EmailTemplate)
                
                if template_key:
                    query = query.filter(EmailTemplate.template_key == template_key)
                if language:
                    query = query.filter(EmailTemplate.language == language)
                if is_active is not None:
                    query = query.filter(EmailTemplate.is_active == is_active)
                
                cfg = self.config
                if cfg.pagination_type == 'page' or page is not None or page_size is not None:
                    pg = page or 1
                    size = page_size or cfg.page_size
                    eff_skip = (pg - 1) * size
                    eff_limit = size
                else:
                    eff_skip = skip or 0
                    size = limit or cfg.page_size
                    eff_limit = size

                templates = query.offset(eff_skip).limit(eff_limit).all()

                # Grouping and summary view handling
                if group_by_key:
                    grouped = {}
                    for t in templates:
                        key = t.template_key
                        if key not in grouped:
                            grouped[key] = []
                        grouped[key].append(t)

                    selected = []
                    for key, items in grouped.items():
                        chosen = None
                        # Prefer provided summary_language
                        lang_pref = (summary_language or 'en').lower()
                        for it in items:
                            if it.language and it.language.lower() == lang_pref:
                                chosen = it
                                break
                        # Fallback: most recently updated
                        if not chosen:
                            chosen = max(items, key=lambda x: (x.updated_at or x.created_at or datetime.min))
                        selected.append(chosen)

                    if summary:
                        # Return only required fields for grid view
                        return JSONResponse(content=[{
                            "template_key": s.template_key,
                            "name": s.name,
                            "subject": s.subject,
                            "created_at": s.created_at.isoformat() if isinstance(s.created_at, datetime) else s.created_at,
                            "updated_at": s.updated_at.isoformat() if isinstance(s.updated_at, datetime) else s.updated_at,
                        } for s in selected])
                    else:
                        return selected

                if summary:
                    # Summary without grouping: return limited fields for each record
                    return JSONResponse(content=[{
                        "template_key": t.template_key,
                        "name": t.name,
                        "subject": t.subject,
                        "created_at": t.created_at.isoformat() if isinstance(t.created_at, datetime) else t.created_at,
                        "updated_at": t.updated_at.isoformat() if isinstance(t.updated_at, datetime) else t.updated_at,
                    } for t in templates])

                return templates
        
        @templates_router.get("/{template_id}", response_model=EmailTemplateResponse)
        async def get_template(
            template_id: int,
            template_key: Optional[str] = Query(None, description="Template key to locate record (overrides ID if provided)"),
            language: Optional[str] = Query(None, description="Language to locate record with template_key")
        ):
            """Get email template by ID"""
            with self.get_db() as db:
                template = None
                if template_key and language:
                    template = EmailTemplate.get_by_key_and_language(db, template_key, language)
                else:
                    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
                if not template:
                    raise HTTPException(status_code=404, detail="Template not found")
                return template
        
        @templates_router.post(root_suffix, response_model=EmailTemplateResponse)
        async def create_template(template_data: EmailTemplateCreate):
            """Create new email template"""
            with self.get_db() as db:
                # Check if template with same key and language already exists
                existing = EmailTemplate.get_by_key_and_language(
                    db, template_data.template_key, template_data.language
                )
                if existing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Template with key '{template_data.template_key}' and language '{template_data.language}' already exists"
                    )
                
                template = EmailTemplate(**template_data.dict())
                db.add(template)
                db.commit()
                db.refresh(template)
                # Notify host app for cache invalidation
                await self._notify_templates_mutated(template.template_key, template.language)
                return template
        
        @templates_router.put("/{template_id}", response_model=EmailTemplateResponse)
        async def update_template(
            template_id: int,
            template_data: EmailTemplateUpdate,
            template_key: Optional[str] = Query(None, description="Template key to locate record (overrides ID if provided)"),
            language: Optional[str] = Query(None, description="Language to locate record with template_key")
        ):
            """Update email template"""
            with self.get_db() as db:
                template = None
                if template_key and language:
                    template = EmailTemplate.get_by_key_and_language(db, template_key, language)
                else:
                    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
                if not template:
                    raise HTTPException(status_code=404, detail="Template not found")
                
                update_data = template_data.dict(exclude_unset=True)
                for field, value in update_data.items():
                    setattr(template, field, value)
                
                db.commit()
                db.refresh(template)
                # Notify host app for cache invalidation
                await self._notify_templates_mutated(template.template_key, template.language)
                return template
        
        @templates_router.delete("/{template_id}")
        async def delete_template(
            template_id: int,
            template_key: Optional[str] = Query(None, description="If provided, deletes all templates with this key across languages")
        ):
            """Delete email template"""
            with self.get_db() as db:
                if template_key:
                    deleted = db.query(EmailTemplate).filter(EmailTemplate.template_key == template_key).delete(synchronize_session=False)
                    db.commit()
                    # Notify host app for cache invalidation (all languages for key)
                    await self._notify_templates_mutated(template_key, None)
                    if deleted == 0:
                        raise HTTPException(status_code=404, detail="No templates found for provided template_key")
                    return {"message": f"Deleted {deleted} templates for key '{template_key}'"}
                else:
                    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
                    if not template:
                        raise HTTPException(status_code=404, detail="Template not found")
                    
                    db.delete(template)
                    db.commit()
                    # Notify host app for cache invalidation (specific key/lang)
                    await self._notify_templates_mutated(template.template_key, template.language)
                    return {"message": "Template deleted successfully"}
        
        @templates_router.get("/key/{template_key}", response_model=List[EmailTemplateResponse])
        async def get_templates_by_key(template_key: str):
            """Get all templates by template key"""
            with self.get_db() as db:
                templates = EmailTemplate.get_all_by_key(db, template_key)
                return templates
        
        @templates_router.get("/active/all", response_model=List[EmailTemplateResponse])
        async def get_active_templates():
            """Get all active templates"""
            with self.get_db() as db:
                templates = EmailTemplate.get_all_active(db)
                return templates
        
        # Email Logs Router
        logs_router = APIRouter(prefix="/logs", tags=["Email Logs"])
        
        @logs_router.get(root_suffix, response_model=List[EmailLogResponse])
        async def get_logs(
            template_key: Optional[str] = Query(None),
            recipient_email: Optional[str] = Query(None),
            status: Optional[str] = Query(None),
            priority: Optional[str] = Query(None),
            page: Optional[int] = Query(None, ge=1),
            page_size: Optional[int] = Query(None, ge=1),
            skip: Optional[int] = Query(None, ge=0),
            limit: Optional[int] = Query(None, ge=1)
        ):
            """Get email logs with optional filters"""
            with self.get_db() as db:
                query = db.query(EmailLog)
                
                if template_key:
                    query = query.filter(EmailLog.template_key == template_key)
                if recipient_email:
                    query = query.filter(EmailLog.recipient_email == recipient_email)
                if status:
                    query = query.filter(EmailLog.status == status)
                if priority:
                    query = query.filter(EmailLog.priority == priority)
                
                cfg = self.config
                if cfg.pagination_type == 'page' or page is not None or page_size is not None:
                    pg = page or 1
                    size = page_size or cfg.page_size
                    eff_skip = (pg - 1) * size
                    eff_limit = size
                else:
                    eff_skip = skip or 0
                    size = limit or cfg.page_size
                    eff_limit = size

                # Order by latest first
                query = query.order_by(EmailLog.created_at.desc())
                logs = query.offset(eff_skip).limit(eff_limit).all()
                return logs
        
        # Use Starlette path converter so this route only matches numeric IDs.
        # This prevents conflicts with host app routes like /logs/error-logs, /logs/bg-execution-logs, etc.
        @logs_router.get("/{log_id:int}", response_model=EmailLogResponse)
        async def get_log(log_id: int):
            """Get email log by ID"""
            with self.get_db() as db:
                log = EmailLog.get_by_id(db, log_id)
                if not log:
                    raise HTTPException(status_code=404, detail="Log not found")
                return log
        
        @logs_router.get("/recipient/{email}", response_model=List[EmailLogResponse])
        async def get_logs_by_recipient(email: str):
            """Get logs by recipient email"""
            with self.get_db() as db:
                logs = EmailLog.get_by_recipient(db, email)
                return logs
        
        @logs_router.get("/status/{status}", response_model=List[EmailLogResponse])
        async def get_logs_by_status(status: str):
            """Get logs by status"""
            try:
                email_status = EmailStatus(status)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid status value")
            
            with self.get_db() as db:
                logs = EmailLog.get_by_status(db, email_status)
                return logs
        
        # Email Service Router
        service_router = APIRouter(prefix="/service", tags=["Email Service"])
        
        @service_router.post("/send", response_model=SendEmailResponse)
        async def send_email(request: SendEmailRequest):
            """Send email using template"""
            with self.get_db() as db:
                try:
                    result: SendResult = self.email_service.send_email(
                        template_key=request.template_key,
                        recipient_email=request.recipient_email,
                        recipient_emails=request.recipient_emails,
                        context=request.context,
                        language=request.language,
                        recipient_name=request.recipient_name,
                        priority=EmailPriority(request.priority),
                        session=db,
                        queue_name=request.queue_name,
                        send_async=request.send_async,
                    )

                    if result.queued:
                        return SendEmailResponse(
                            status="queued",
                            message="Email queued for sending",
                            task_id=result.task_id,
                        )

                    if result.success:
                        return SendEmailResponse(
                            status="sent",
                            message="Email sent successfully",
                        )

                    raise HTTPException(
                        status_code=500,
                        detail="Failed to send email",
                    )
                        
                except Exception as e:
                    logger.error(f"Error sending email: {e}")
                    raise HTTPException(status_code=500, detail=str(e))
        
        @service_router.post("/retry-failed")
        async def retry_failed_emails(max_retries: int = 3):
            """Retry failed emails"""
            try:
                retry_count = self.email_service.retry_failed_emails(max_retries)
                return {
                    "status": "success",
                    "message": f"Retried {retry_count} failed emails",
                    "retry_count": retry_count
                }
            except Exception as e:
                logger.error(f"Error retrying failed emails: {e}")
                raise HTTPException(status_code=500, detail=str(e))
        
        return [templates_router, logs_router, service_router]
    
    def setup_app(self, app: FastAPI, prefix: Optional[str] = None):
        """Setup FastAPI app with DFA Mailer Service routes"""
        if prefix is None:
            cfg_prefix = (self.config.api_prefix if hasattr(self.config, 'api_prefix') else '/api')
            prefix = cfg_prefix
        routers = self.create_routers()
        for router in routers:
            app.include_router(router, prefix=prefix)
    
    def run_migrations(self):
        """Run database migrations"""
        if self.engine:
            Base.metadata.create_all(bind=self.engine)
            logger.info("Database tables created successfully")
        else:
            logger.warning("No database engine configured, skipping migrations")
