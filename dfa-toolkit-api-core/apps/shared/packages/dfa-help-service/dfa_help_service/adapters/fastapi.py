"""
FastAPI adapter for DFA Help Service.
"""

import logging
from typing import Any, Dict
from fastapi import FastAPI, Depends
from ..core.services import HelpService
from ..storage.memory import MemoryStorage
from ..api.routes import router
from .base import BaseAdapter

logger = logging.getLogger(__name__)


class FastAPIAdapter(BaseAdapter):
    """
    FastAPI adapter for DFA Help Service.
    
    This adapter provides integration with FastAPI applications by including
    the help service routes and providing dependency injection.
    """

    def __init__(self, app: FastAPI = None, storage_backend: str = "memory"):
        """
        Initialize the FastAPI adapter.
        
        Args:
            app: FastAPI application instance (optional)
            storage_backend: Storage backend to use ("memory", "database", "cache")
        """
        self.app = app
        self.storage_backend = storage_backend
        self.storage = None
        self.help_service = None
        self._initialized = False
        
        if app:
            self.register_routes(app)

    def register_routes(self, app: FastAPI) -> bool:
        """
        Register the help service routes with the FastAPI application.
        
        Args:
            app: FastAPI application instance
            
        Returns:
            True if routes were registered successfully
        """
        try:
            # Include the help service router
            app.include_router(router, prefix="/help", tags=["dfa-help-service"])
            
            # Add health check endpoint
            @app.get("/health")
            async def health_check():
                return {"status": "healthy", "service": "dfa-help-service"}
            
            self.app = app
            self._initialized = True
            logger.info("Successfully registered DFA Help Service routes with FastAPI app")
            return True
            
        except Exception as e:
            logger.error("Failed to register routes with FastAPI app: %s", str(e))
            return False

    def get_config(self) -> Dict[str, Any]:
        """
        Get the adapter configuration.
        
        Returns:
            Dictionary containing adapter configuration
        """
        return {
            "framework": "fastapi",
            "storage_backend": self.storage_backend,
            "initialized": self._initialized,
            "app_configured": self.app is not None
        }

    def get_storage(self) -> MemoryStorage:
        """
        Get a configured storage backend instance.
        
        Returns:
            Configured storage backend instance
        """
        if not self.storage:
            self.storage = MemoryStorage()
            self.storage.connect()
            logger.debug("Created new storage instance for FastAPI adapter")
        
        return self.storage

    def get_help_service(self) -> HelpService:
        """
        Get a configured help service instance.
        
        Returns:
            Configured HelpService instance
        """
        if not self.help_service:
            storage = self.get_storage()
            self.help_service = HelpService(storage)
            logger.debug("Created new help service instance for FastAPI adapter")
        
        return self.help_service


# Dependency function for FastAPI
def get_help_service() -> HelpService:
    """
    FastAPI dependency function to get a help service instance.
    
    Returns:
        Configured HelpService instance
    """
    adapter = FastAPIAdapter()
    return adapter.get_help_service()


def get_storage() -> MemoryStorage:
    """
    FastAPI dependency function to get a storage instance.
    
    Returns:
        Configured storage instance
    """
    adapter = FastAPIAdapter()
    return adapter.get_storage()


# Convenience function to create and configure adapter
def create_fastapi_adapter(app: FastAPI, storage_backend: str = "memory") -> FastAPIAdapter:
    """
    Create and configure a FastAPI adapter.
    
    Args:
        app: FastAPI application instance
        storage_backend: Storage backend to use
        
    Returns:
        Configured FastAPIAdapter instance
    """
    adapter = FastAPIAdapter(app, storage_backend)
    return adapter
