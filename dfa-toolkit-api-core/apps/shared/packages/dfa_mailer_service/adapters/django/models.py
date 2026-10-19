"""
Django models for DFA Mailer Service

This module imports models from the django_adapter to make them
discoverable by Django's app system.
"""

# Import models from django_adapter so Django can discover them
# This import happens after Django is initialized, so it's safe
from ..django_adapter import EmailTemplate, EmailLog

__all__ = ['EmailTemplate', 'EmailLog']

