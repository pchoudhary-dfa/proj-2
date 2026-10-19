"""
Pydantic schemas for FastAPI adapter
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, validator

from ...core.models import EmailPriority


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
    send_async: Optional[bool] = None
    queue_name: Optional[str] = None


class SendEmailResponse(BaseModel):
    """Pydantic model for send email responses"""
    status: str
    message: str
    task_id: Optional[str] = None

