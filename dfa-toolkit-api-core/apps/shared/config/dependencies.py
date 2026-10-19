"""
Shared dependencies for dependency injection
"""
from typing import Generator, Optional
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from apps.app_db.db.core import SessionLocal
from apps.shared.config.security import decode_token


def get_db() -> Generator:
    """
    Application database session dependency.
    Auto-commits on success, auto-rolls back on exceptions.
    
    Usage:
        @router.get("/items")
        async def get_items(db: Session = Depends(get_db)):
            # Use db session here
    """
    db = SessionLocal()
    db.info["is_app_session"] = True
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[dict]:
    """
    Optional authentication dependency - validates JWT token if provided
    
    Usage:
        @router.get("/optional-auth")
        async def optional_auth_route(user: Optional[dict] = Depends(get_optional_user)):
            if user:
                # User is authenticated
            else:
                # Public access
    
    Returns:
        Optional[dict]: Decoded token payload if token is valid, None otherwise
    """
    if not credentials:
        return None
    
    try:
        token = credentials.credentials
        payload = decode_token(token)
        return payload
    except Exception:
        return None
