"""
Framework adapters for DFA Help Service.
"""

from .base import BaseAdapter
# from .django import DjangoAdapter  # Removed to prevent circular import
from .fastapi import FastAPIAdapter
from .flask import FlaskAdapter

__all__ = [
    "BaseAdapter",
    # "DjangoAdapter",  # Removed to prevent circular import
    "FastAPIAdapter",
    "FlaskAdapter",
]
