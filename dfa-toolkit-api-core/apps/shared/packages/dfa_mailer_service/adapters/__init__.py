"""
Adapters for different backend frameworks
"""

# Import adapters only when needed to avoid metaclass conflicts
def get_email_django_adapter():
    """Get Django adapter - import only when needed"""
    from .django_adapter import MailerDjangoAdapter
    return MailerDjangoAdapter

def get_fastapi_adapter():
    """Get FastAPI adapter - import only when needed"""
    from .fastapi_adapter import FastAPIAdapter
    return FastAPIAdapter

__all__ = ["get_email_django_adapter", "get_fastapi_adapter"]
