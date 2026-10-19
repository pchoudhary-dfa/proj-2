"""
Django adapter for DFA Mailer Service

This module provides Django integration for the DFA Mailer Service.
"""

# Lazy imports to avoid AppRegistryNotReady errors
# These will be imported when actually needed, not at module load time

def __getattr__(name):
    """Lazy import of adapter components"""
    if name in ['EmailTemplate', 'EmailLog', 'EmailTemplateSerializer', 
                'EmailLogSerializer', 'SendEmailSerializer',
                'EmailTemplateViewSet', 'EmailLogViewSet', 'EmailServiceViewSet',
                'MailerDjangoAdapter', 'get_email_service']:
        from ..django_adapter import (
            EmailTemplate,
            EmailLog,
            EmailTemplateSerializer,
            EmailLogSerializer,
            SendEmailSerializer,
            EmailTemplateViewSet,
            EmailLogViewSet,
            EmailServiceViewSet,
            MailerDjangoAdapter,
            get_email_service,
        )
        return globals().get(name) or locals()[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = [
    'EmailTemplate',
    'EmailLog',
    'EmailTemplateSerializer',
    'EmailLogSerializer',
    'SendEmailSerializer',
    'EmailTemplateViewSet',
    'EmailLogViewSet',
    'EmailServiceViewSet',
    'MailerDjangoAdapter',
    'get_email_service',
]

