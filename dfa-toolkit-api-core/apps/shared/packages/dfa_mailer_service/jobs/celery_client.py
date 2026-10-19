"""
Celery job client implementation
"""

import logging
from typing import Dict, Any, Optional

from .base import JobClient


logger = logging.getLogger(__name__)


class CeleryJobClient(JobClient):
    """
    Celery background job client
    """
    
    def __init__(self, default_queue: str = "dfa_mailer_service"):
        """
        Initialize Celery client
        
        Args:
            default_queue: Default queue name for tasks
        """
        self.default_queue = default_queue
    
    def enqueue_send_email(
        self,
        template_key: str,
        recipient_email: str,
        context: Dict[str, Any],
        language: str,
        recipient_name: Optional[str],
        priority: str,
        log_id: Optional[int],
        recipient_emails: Optional[list[str]],
        queue_name: Optional[str] = None,
    ) -> str:
        """
        Enqueue email sending task via Celery
        
        Args:
            template_key: Template key to use
            recipient_email: Recipient email address
            context: Context data for template rendering
            language: Language code
            recipient_name: Recipient name (optional)
            priority: Email priority as string
            log_id: Email log ID
            recipient_emails: List of recipient emails (optional)
            queue_name: Queue name to route task to (optional)
            
        Returns:
            Celery task ID
        """
        from ..tasks.email_tasks import send_email_task
        
        queue_to_use = queue_name or self.default_queue
        
        task = send_email_task.apply_async(
            kwargs={
                "template_key": template_key,
                "recipient_email": recipient_email,
                "recipient_emails": recipient_emails,
                "context": context,
                "language": language,
                "recipient_name": recipient_name,
                "priority": priority,
                "log_id": log_id,
            },
            queue=queue_to_use
        )
        
        logger.info(f"Email task queued with ID: {task.id} for log ID: {log_id}")
        return task.id

