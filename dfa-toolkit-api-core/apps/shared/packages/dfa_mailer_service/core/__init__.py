"""
Core components of the DFA Mailer Service
"""

from .models import EmailTemplateSchema, EmailLogSchema
from .service import EmailService

__all__ = ["EmailTemplateSchema", "EmailLogSchema", "EmailService"]
