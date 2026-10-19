"""
DFA Mailer Service Package

A comprehensive email service package that supports both Django and FastAPI backends.
Provides email templating, background job processing with Celery, and email logging.
"""

__version__ = "1.0.0"
__author__ = "DFA Team"

from .core.models import EmailTemplateSchema, EmailLogSchema
from .core.service import EmailService

# Import adapters only when needed to avoid metaclass conflicts
def get_email_django_adapter():
    """Get Django adapter - import only when needed"""
    from .adapters.django_adapter import MailerDjangoAdapter
    return MailerDjangoAdapter

def get_fastapi_adapter():
    """Get FastAPI adapter - import only when needed"""
    from .adapters.fastapi_adapter import FastAPIAdapter
    return FastAPIAdapter

__all__ = [
    "EmailTemplateSchema",
    "EmailLogSchema", 
    "EmailService",
    "get_email_django_adapter",
    "get_fastapi_adapter"
]
