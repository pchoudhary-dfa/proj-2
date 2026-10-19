"""
Email provider abstractions
"""

from .base import EmailProvider
from .smtp_provider import SMTPProvider
from .mailjet_provider import MailjetProvider

__all__ = ["EmailProvider", "SMTPProvider", "MailjetProvider"]

