"""
Base email provider interface
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any


class EmailProvider(ABC):
    """
    Abstract base class for email providers
    """
    
    @abstractmethod
    def send_email(
        self,
        from_email: str,
        from_name: str,
        to_recipients: List[str],
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        recipient_name: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """
        Send an email
        
        Args:
            from_email: Sender email address
            from_name: Sender name
            to_recipients: List of recipient email addresses
            subject: Email subject
            html_content: HTML content
            text_content: Plain text content (optional)
            recipient_name: Recipient name (optional)
            attachments: List of attachments, each dict with 'filename', 'content', 'mimetype'
            
        Returns:
            True if sent successfully, False otherwise
        """
        pass

