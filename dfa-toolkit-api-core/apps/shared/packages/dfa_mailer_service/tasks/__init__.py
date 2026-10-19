"""
Celery tasks for background email processing
"""

from .email_tasks import send_email_task

__all__ = ["send_email_task"]
