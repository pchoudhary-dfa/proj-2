"""
Base adapter interface for DFA Help Service.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseAdapter(ABC):
    """
    Abstract base class for framework adapters.
    
    All framework-specific adapters must inherit from this class and implement
    the required methods for integrating with their respective frameworks.
    """

    @abstractmethod
    def register_routes(self, app: Any) -> bool:
        """
        Register the help service routes with the framework application.
        
        Args:
            app: The framework application instance
            
        Returns:
            True if routes were registered successfully
        """
        pass

    @abstractmethod
    def get_config(self) -> Dict[str, Any]:
        """
        Get the adapter configuration.
        
        Returns:
            Dictionary containing adapter configuration
        """
        pass

    @abstractmethod
    def get_help_service(self) -> Any:
        """
        Get a configured help service instance.
        
        Returns:
            Configured HelpService instance
        """
        pass

    @abstractmethod
    def get_storage(self) -> Any:
        """
        Get a configured storage backend instance.
        
        Returns:
            Configured storage backend instance
        """
        pass
