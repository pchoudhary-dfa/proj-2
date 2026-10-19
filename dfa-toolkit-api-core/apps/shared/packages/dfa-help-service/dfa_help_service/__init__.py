"""
DFA Help Service Package

A framework-agnostic Python package for multi-language adaptation and key management.
"""

__version__ = "2.0.0"
__author__ = "Community Systems Foundation"
__email__ = "info@communitysystemsfoundation.org"

from .core.services import HelpService
from .storage.memory import MemoryStorage
from .storage.database import DatabaseStorage
from .storage.cache import CacheStorage

__all__ = [
    "HelpService",
    "MemoryStorage", 
    "DatabaseStorage",
    "CacheStorage",
    "__version__",
    "__author__",
    "__email__",
]
