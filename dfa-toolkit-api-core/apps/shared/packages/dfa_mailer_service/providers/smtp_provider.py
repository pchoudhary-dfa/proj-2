"""
SMTP email provider
"""

import logging
import smtplib
import ssl
from typing import List, Optional, Dict, Any
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

from .base import EmailProvider


logger = logging.getLogger(__name__)


class SMTPProvider(EmailProvider):
    """
    SMTP email provider implementation
    """
    
    def __init__(
        self,
        smtp_host: str,
        smtp_port: int = 587,
        use_tls: bool = True,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ):
        """
        Initialize SMTP provider
        
        Args:
            smtp_host: SMTP server host
            smtp_port: SMTP server port (default: 587)
            use_tls: Use TLS encryption (default: True)
            username: SMTP username (optional)
            password: SMTP password (optional)
        """
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.use_tls = use_tls
        self.username = username
        self.password = password
    
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
        Send email via SMTP
        
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
        try:
            # Create message - use 'mixed' for attachments, 'alternative' for just text/html
            msg_type = 'mixed' if attachments else 'alternative'
            msg = MIMEMultipart(msg_type)
            msg['Subject'] = subject
            msg['From'] = f"{from_name} <{from_email}>"
            msg['To'] = ', '.join(to_recipients)
            
            # If we have attachments, we need to nest the alternative part
            if attachments:
                # Create alternative part for text/html
                msg_alternative = MIMEMultipart('alternative')
                
                # Add text content
                if text_content:
                    text_part = MIMEText(text_content, 'plain', 'utf-8')
                    msg_alternative.attach(text_part)
                
                # Add HTML content
                html_part = MIMEText(html_content, 'html', 'utf-8')
                msg_alternative.attach(html_part)
                
                # Attach the alternative part to main message
                msg.attach(msg_alternative)
            else:
                # No attachments, use simple structure
                # Add text content
                if text_content:
                    text_part = MIMEText(text_content, 'plain', 'utf-8')
                    msg.attach(text_part)
                
                # Add HTML content
                html_part = MIMEText(html_content, 'html', 'utf-8')
                msg.attach(html_part)
            
            # Add attachments if provided
            if attachments:
                for attachment in attachments:
                    filename = attachment.get('filename', 'attachment')
                    content = attachment.get('content', b'')
                    mimetype = attachment.get('mimetype', 'application/octet-stream')
                    
                    # Create MIME base for attachment
                    part = MIMEBase('application', 'octet-stream')
                    
                    # Set payload (handle both bytes and str)
                    if isinstance(content, bytes):
                        part.set_payload(content)
                    else:
                        part.set_payload(content.encode('utf-8'))
                    
                    # Encode in base64
                    encoders.encode_base64(part)
                    
                    # Add header
                    part.add_header(
                        'Content-Disposition',
                        f'attachment; filename={filename}'
                    )
                    
                    # Attach to message
                    msg.attach(part)
                    logger.info(f"Attached file: {filename} ({mimetype})")
            
            # Send email
            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls(context=context)
                if self.username and self.password:
                    server.login(self.username, self.password)
                server.send_message(msg)
            
            return True
            
        except Exception as e:
            logger.error(f"SMTP error: {e}")
            return False

