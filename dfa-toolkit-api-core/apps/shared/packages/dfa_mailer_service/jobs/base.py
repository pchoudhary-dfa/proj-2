"""
Base job client interface
"""

from abc import ABC, abstractmethod
from typing import Dict, Any


class JobClient(ABC):
    """
    Abstract base class for background job clients
    """
    
    @abstractmethod
    def enqueue_send_email(
        self,
        template_key: str,
        recipient_email: str,
        context: Dict[str, Any],
        language: str,
        recipient_name: str | None,
        priority: str,
        log_id: int | None,
        recipient_emails: list[str] | None,
        queue_name: str | None = None,
    ) -> str:
        """
        Enqueue an email sending task
        
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
            Task ID
        """
        pass

