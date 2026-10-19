"""
Core functionality for DFA Help Service.
"""

from .services import HelpService
from .models import Adaptation, AdaptationKey, AdaptationKeyI18n

__all__ = [
    "HelpService",
    "Adaptation",
    "AdaptationKey", 
    "AdaptationKeyI18n",
]
