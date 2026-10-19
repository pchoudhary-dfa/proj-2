"""
Mailjet email provider
"""

import logging
from typing import List, Optional, Dict, Any

from .base import EmailProvider


logger = logging.getLogger(__name__)


class MailjetProvider(EmailProvider):
    """
    Mailjet email provider implementation
    """
    
    def __init__(self, api_key: str, api_secret: str):
        """
        Initialize Mailjet provider
        
        Args:
            api_key: Mailjet API key
            api_secret: Mailjet API secret
        """
        self.api_key = api_key
        self.api_secret = api_secret
        self._client = None
    
    def _get_client(self):
        """Lazy load Mailjet client"""
        if self._client is None:
            try:
                from mailjet_rest import Client  # type: ignore
                self._client = Client(auth=(self.api_key, self.api_secret), version='v3.1')
            except ImportError:
                raise RuntimeError("mailjet_rest package is required for Mailjet provider. Install with: pip install mailjet_rest")
        return self._client
    
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
        Send email via Mailjet
        
        Args:
            from_email: Sender email address
            from_name: Sender name
            to_recipients: List of recipient email addresses
            subject: Email subject
            html_content: HTML content
            text_content: Plain text content (optional)
            recipient_name: Recipient name (optional)
            attachments: List of attachments (not yet implemented for Mailjet)
            
        Returns:
            True if sent successfully, False otherwise
        """
        try:
            mailjet = self._get_client()
            
            message = {
                'Messages': [
                    {
                        'From': {
                            'Email': from_email,
                            'Name': from_name,
                        },
                        'To': [
                            {
                                'Email': email,
                                'Name': recipient_name or email,
                            } for email in to_recipients
                        ],
                        'Subject': subject,
                        'HTMLPart': html_content,
                        'TextPart': text_content or '',
                    }
                ]
            }
            
            result = mailjet.send.create(data=message)
            
            if 200 <= result.status_code < 300:
                return True
            
            logger.error(f"Mailjet send failed: {result.status_code} {getattr(result, 'json', lambda: {})()}")
            return False
            
        except Exception as e:
            logger.error(f"Mailjet error: {e}")
            return False

