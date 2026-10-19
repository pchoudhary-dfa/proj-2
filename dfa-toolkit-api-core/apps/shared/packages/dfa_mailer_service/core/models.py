"""
Common models/schema for email templates and logs
This module provides abstract base classes that can be used by both Django and FastAPI adapters
"""

from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field


class EmailStatus(Enum):
    """Email sending status enumeration"""
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    RETRYING = "retrying"


class EmailPriority(Enum):
    """Email priority levels"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class EmailTemplateSchema:
    """
    Schema for email template data
    This can be used by both Django and FastAPI adapters
    """
    template_key: str
    language: str
    name: str
    subject: str
    html_content: str
    text_content: Optional[str] = None
    created_by: Dict[str, Any] = field(default_factory=dict)
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    id: Optional[int] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()
        if self.updated_at is None:
            self.updated_at = datetime.now()


@dataclass
class EmailLogSchema:
    """
    Schema for email log data
    This can be used by both Django and FastAPI adapters
    """
    template_key: str
    recipient_email: str
    recipient_name: Optional[str] = None
    subject: str = ""
    html_content: str = ""
    text_content: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    status: EmailStatus = EmailStatus.PENDING
    priority: EmailPriority = EmailPriority.NORMAL
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    id: Optional[int] = None
    
    def to_dict(self):
        """Convert to dictionary with string values for status and priority"""
        return {
            'id': self.id,
            'template_key': self.template_key,
            'recipient_email': self.recipient_email,
            'recipient_name': self.recipient_name,
            'subject': self.subject,
            'html_content': self.html_content,
            'text_content': self.text_content,
            'context': self.context,
            'status': self.status.value if isinstance(self.status, EmailStatus) else self.status,
            'priority': self.priority.value if isinstance(self.priority, EmailPriority) else self.priority,
            'sent_at': self.sent_at,
            'error_message': self.error_message,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()
        if self.updated_at is None:
            self.updated_at = datetime.now()


class BaseEmailTemplate(ABC):
    """
    Abstract base class for email template models
    To be implemented by Django and FastAPI adapters
    """
    
    @abstractmethod
    def save(self) -> 'BaseEmailTemplate':
        """Save the template to database"""
        pass
    
    @abstractmethod
    def delete(self) -> bool:
        """Delete the template from database"""
        pass
    
    @abstractmethod
    def update(self, **kwargs) -> 'BaseEmailTemplate':
        """Update template fields"""
        pass
    
    @classmethod
    @abstractmethod
    def get_by_key_and_language(cls, template_key: str, language: str) -> Optional['BaseEmailTemplate']:
        """Get template by key and language"""
        pass
    
    @classmethod
    @abstractmethod
    def get_all_by_key(cls, template_key: str) -> List['BaseEmailTemplate']:
        """Get all templates by key across languages"""
        pass
    
    @classmethod
    @abstractmethod
    def get_all_active(cls) -> List['BaseEmailTemplate']:
        """Get all active templates"""
        pass


class BaseEmailLog(ABC):
    """
    Abstract base class for email log models
    To be implemented by Django and FastAPI adapters
    """
    
    @abstractmethod
    def save(self) -> 'BaseEmailLog':
        """Save the log to database"""
        pass
    
    @abstractmethod
    def delete(self) -> bool:
        """Delete the log from database"""
        pass
    
    @abstractmethod
    def update(self, **kwargs) -> 'BaseEmailLog':
        """Update log fields"""
        pass
    
    @classmethod
    @abstractmethod
    def get_by_id(cls, log_id: int) -> Optional['BaseEmailLog']:
        """Get log by ID"""
        pass
    
    @classmethod
    @abstractmethod
    def get_by_status(cls, status: EmailStatus) -> List['BaseEmailLog']:
        """Get logs by status"""
        pass
    
    @classmethod
    @abstractmethod
    def get_by_recipient(cls, email: str) -> List['BaseEmailLog']:
        """Get logs by recipient email"""
        pass
    
    @classmethod
    @abstractmethod
    def get_pending_emails(cls) -> List['BaseEmailLog']:
        """Get all pending emails for retry"""
        pass


# For backward compatibility and easier imports
EmailTemplate = EmailTemplateSchema
EmailLog = EmailLogSchema
