"""
Base storage interface for DFA Help Service.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from ..core.models import (
    Adaptation, AdaptationKey, AdaptationKeyI18n,
    AdaptationCreate, AdaptationKeyCreate, AdaptationKeyI18nCreate
)


class BaseStorage(ABC):
    """
    Abstract base class for storage backends.
    
    All storage implementations must inherit from this class and implement
    all abstract methods.
    """

    @abstractmethod
    def get_adaptations(self) -> List[Adaptation]:
        """Get all adaptations."""
        pass

    @abstractmethod
    def get_adaptation(self, adaptation_id: int) -> Optional[Adaptation]:
        """Get adaptation by ID."""
        pass

    @abstractmethod
    def get_adaptation_by_code(self, code: str) -> Optional[Adaptation]:
        """Get adaptation by code."""
        pass

    @abstractmethod
    def create_adaptation(self, payload: AdaptationCreate) -> Adaptation:
        """Create a new adaptation."""
        pass

    @abstractmethod
    def update_adaptation(self, adaptation_id: int, update_data: Dict[str, Any]) -> Adaptation:
        """Update an adaptation."""
        pass

    @abstractmethod
    def delete_adaptation(self, adaptation_id: int) -> bool:
        """Delete an adaptation."""
        pass

    @abstractmethod
    def get_adaptation_keys(self, adaptation_id: int) -> List[AdaptationKey]:
        """Get all keys for a specific adaptation."""
        pass

    @abstractmethod
    def get_key(self, key_id: int) -> Optional[AdaptationKey]:
        """Get key by ID."""
        pass

    def get_key_by_string(self, key_string: str) -> Optional[AdaptationKey]:
        """Get key by its string identifier. Default scans all keys (override for DB)."""
        return None

    @abstractmethod
    def create_key(self, payload: AdaptationKeyCreate) -> AdaptationKey:
        """Create a new key."""
        pass

    @abstractmethod
    def update_key(self, key_id: int, update_data: Dict[str, Any]) -> AdaptationKey:
        """Update a key."""
        pass

    @abstractmethod
    def delete_key(self, key_id: int) -> bool:
        """Delete a key."""
        pass

    @abstractmethod
    def get_key_i18n_data(self, key_id: int) -> List[AdaptationKeyI18n]:
        """Get i18n data for a key."""
        pass

    @abstractmethod
    def create_key_i18n(self, payload: AdaptationKeyI18nCreate) -> AdaptationKeyI18n:
        """Create new i18n data for a key."""
        pass

    @abstractmethod
    def update_or_create_key_i18n(self, payload: AdaptationKeyI18nCreate) -> AdaptationKeyI18n:
        """Update existing or create new i18n data for a key."""
        pass

    @abstractmethod
    def delete_key_i18n(self, i18n_id: int) -> bool:
        """Delete i18n data."""
        pass

    @abstractmethod
    def connect(self) -> bool:
        """Connect to the storage backend."""
        pass

    @abstractmethod
    def disconnect(self) -> bool:
        """Disconnect from the storage backend."""
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        """Check if connected to the storage backend."""
        pass
