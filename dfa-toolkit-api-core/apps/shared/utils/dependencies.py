"""
FastAPI dependency functions for common operations
"""
from typing import Optional
from fastapi import Header, HTTPException, status

from apps.shared.utils.validators import normalize_language_code, validate_language_code
from apps.shared.config.config import settings


def get_language_code(
    accept_language: Optional[str] = Header(
        None, 
        alias="Accept-Language",
        description="Language code for translations (e.g., 'en', 'fr', 'ar'). Defaults to 'en' if not provided."
    )
) -> str:
    """
    FastAPI dependency to extract, normalize, and validate language code from Accept-Language header.
    
    This dependency:
    1. Extracts language code from Accept-Language header
    2. Normalizes it to lowercase, 2-letter code
    3. Validates it against available languages in settings
    4. Returns the normalized language code or raises HTTPException
    
    Args:
        accept_language: Accept-Language header value (automatically injected by FastAPI)
        
    Returns:
        Normalized and validated language code (e.g., "en", "fr", "ar")
        
    Raises:
        HTTPException: 400 Bad Request if language code is not in the allowed list
        
    Usage in routers:
        @router.get("/endpoint")
        async def endpoint(language_code: str = Depends(get_language_code)):
            # language_code is already normalized and validated
            result = service.some_method(dw_id, language_code)
    """
    try:
        language_code = normalize_language_code(accept_language)
        validate_language_code(language_code, settings.get_available_languages())
        return language_code
    except ValueError as e:
        # Convert ValueError to HTTPException so FastAPI returns proper 400 error response
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
