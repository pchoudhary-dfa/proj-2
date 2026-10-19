"""
Utility functions for DFA Help Service.
"""

import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def validate_locale(locale: str) -> bool:
    """
    Validate if a locale is supported.
    
    Args:
        locale: Locale string to validate
        
    Returns:
        True if locale is supported, False otherwise
    """
    supported_locales = ['en', 'fr', 'es', 'ar', 'pt', 'ru']
    return locale in supported_locales


def format_timestamp(timestamp: Optional[datetime]) -> Optional[str]:
    """
    Format a datetime timestamp to ISO format string.
    
    Args:
        timestamp: Datetime object to format
        
    Returns:
        ISO format string or None if timestamp is None
    """
    if timestamp is None:
        return None
    return timestamp.isoformat()


def parse_json_string(json_string: str) -> Any:
    """
    Parse a JSON string safely.
    
    Args:
        json_string: JSON string to parse
        
    Returns:
        Parsed JSON data or empty list if parsing fails
    """
    try:
        return json.loads(json_string)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse JSON string: %s", json_string)
        return []


def format_json_string(data: Any) -> str:
    """
    Format data to JSON string safely.
    
    Args:
        data: Data to format
        
    Returns:
        JSON string or empty array string if formatting fails
    """
    try:
        return json.dumps(data)
    except (TypeError, ValueError):
        logger.warning("Failed to format data to JSON: %s", data)
        return "[]"


def sanitize_string(text: str, max_length: int = 255) -> str:
    """
    Sanitize a string by removing dangerous characters and limiting length.
    
    Args:
        text: Text to sanitize
        max_length: Maximum allowed length
        
    Returns:
        Sanitized string
    """
    if not text:
        return ""
    
    # Remove potentially dangerous characters
    sanitized = text.strip()
    sanitized = sanitized.replace('<', '&lt;').replace('>', '&gt;')
    sanitized = sanitized.replace('"', '&quot;').replace("'", '&#39;')
    
    # Limit length
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length]
    
    return sanitized


def generate_unique_code(prefix: str = "CODE") -> str:
    """
    Generate a unique code based on timestamp.
    
    Args:
        prefix: Prefix for the code
        
    Returns:
        Unique code string
    """
    timestamp = int(datetime.now().timestamp())
    return f"{prefix}_{timestamp}"


def validate_adaptation_code(code: str) -> bool:
    """
    Validate adaptation code format.
    
    Args:
        code: Code to validate
        
    Returns:
        True if code is valid, False otherwise
    """
    if not code:
        return False
    
    # Code should be 4 characters, alphanumeric
    if len(code) != 4:
        return False
    
    if not code.isalnum():
        return False
    
    return True


def get_supported_languages() -> List[Dict[str, str]]:
    """
    Get list of supported languages with their details.
    
    Returns:
        List of language dictionaries
    """
    return [
        {'code': 'en', 'name': 'English', 'native_name': 'English'},
        {'code': 'fr', 'name': 'French', 'native_name': 'Français'},
        {'code': 'es', 'name': 'Spanish', 'native_name': 'Español'},
        {'code': 'ar', 'name': 'Arabic', 'native_name': 'العربية'},
        {'code': 'pt', 'name': 'Portuguese', 'native_name': 'Português'},
        {'code': 'ru', 'name': 'Russian', 'native_name': 'Русский'},
    ]


def log_operation(operation: str, entity_type: str, entity_id: int, user_id: Optional[str] = None):
    """
    Log an operation for audit purposes.
    
    Args:
        operation: Type of operation (create, update, delete, read)
        entity_type: Type of entity (adaptation, key, i18n)
        entity_id: ID of the entity
        user_id: ID of the user performing the operation
    """
    logger.info(
        "Operation: %s | Entity: %s | ID: %d | User: %s",
        operation.upper(),
        entity_type,
        entity_id,
        user_id or "anonymous"
    )
