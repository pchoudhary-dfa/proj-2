"""
In-memory storage backend for DFA Help Service.
"""

import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from .base import BaseStorage
from ..core.models import (
    Adaptation, AdaptationKey, AdaptationKeyI18n,
    AdaptationCreate, AdaptationKeyCreate, AdaptationKeyI18nCreate
)

logger = logging.getLogger(__name__)


class MemoryStorage(BaseStorage):
    """
    In-memory storage implementation for development and testing.
    
    This storage backend stores all data in memory and is not persistent.
    It's useful for development, testing, and prototyping.
    """

    def __init__(self):
        """Initialize the in-memory storage."""
        self._adaptations: Dict[int, Adaptation] = {}
        self._keys: Dict[int, AdaptationKey] = {}
        self._i18n_data: Dict[int, AdaptationKeyI18n] = {}
        self._next_adaptation_id = 1
        self._next_key_id = 1
        self._next_i18n_id = 1
        self._connected = False
        
        # Initialize with some sample data
        self._initialize_sample_data()
        logger.info("MemoryStorage initialized with sample data")

    def _initialize_sample_data(self):
        """Initialize storage with sample data for testing."""
        # Create sample adaptation
        sample_adaptation = Adaptation(
            id=1,
            code="SAMP",
            name="Sample Adaptation",
            desc="A sample adaptation for testing purposes",
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deleted_at=None
        )
        self._adaptations[1] = sample_adaptation
        self._next_adaptation_id = 2

        # Create sample key
        sample_key = AdaptationKey(
            id=1,
            adaptation_id=1,
            key="sample_key",
            code="SAMPLE_CODE",
            related_keys="[]",
            parent_id=None,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deleted_at=None
        )
        self._keys[1] = sample_key
        self._next_key_id = 2

        # Create sample i18n data
        sample_i18n = AdaptationKeyI18n(
            id=1,
            adaptation_key_id=1,
            locale="en",
            title="Sample Key Title",
            desc="A sample key description in English",
            purpose="This key is used for testing purposes"
        )
        self._i18n_data[1] = sample_i18n
        self._next_i18n_id = 2

    def connect(self) -> bool:
        """Connect to the in-memory storage (always succeeds)."""
        self._connected = True
        logger.info("Connected to in-memory storage")
        return True

    def disconnect(self) -> bool:
        """Disconnect from the in-memory storage."""
        self._connected = False
        logger.info("Disconnected from in-memory storage")
        return True

    def is_connected(self) -> bool:
        """Check if connected to the in-memory storage."""
        return self._connected

    def get_adaptations(self) -> List[Adaptation]:
        """Get all adaptations."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        adaptations = [adaptation for adaptation in self._adaptations.values() 
                      if adaptation.deleted_at is None]
        logger.debug("Retrieved %d adaptations from memory", len(adaptations))
        return adaptations

    def get_adaptation(self, adaptation_id: int) -> Optional[Adaptation]:
        """Get adaptation by ID."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        adaptation = self._adaptations.get(adaptation_id)
        if adaptation and adaptation.deleted_at is None:
            logger.debug("Retrieved adaptation %d from memory", adaptation_id)
            return adaptation
        return None

    def get_adaptation_by_code(self, code: str) -> Optional[Adaptation]:
        """Get adaptation by code."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        for adaptation in self._adaptations.values():
            if adaptation.code == code and adaptation.deleted_at is None:
                logger.debug("Retrieved adaptation with code %s from memory", code)
                return adaptation
        return None

    def create_adaptation(self, payload: AdaptationCreate) -> Adaptation:
        """Create a new adaptation."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        adaptation = Adaptation(
            id=self._next_adaptation_id,
            code=payload.code,
            name=payload.name,
            desc=payload.desc,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deleted_at=None
        )
        
        self._adaptations[self._next_adaptation_id] = adaptation
        self._next_adaptation_id += 1
        
        logger.info("Created adaptation %d in memory", adaptation.id)
        return adaptation

    def update_adaptation(self, adaptation_id: int, update_data: Dict[str, Any]) -> Adaptation:
        """Update an adaptation."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        if adaptation_id not in self._adaptations:
            raise ValueError(f"Adaptation {adaptation_id} not found")
        
        adaptation = self._adaptations[adaptation_id]
        for key, value in update_data.items():
            if hasattr(adaptation, key):
                setattr(adaptation, key, value)
        
        adaptation.updated_at = datetime.now()
        logger.info("Updated adaptation %d in memory", adaptation_id)
        return adaptation

    def delete_adaptation(self, adaptation_id: int) -> bool:
        """Delete an adaptation (soft delete)."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        if adaptation_id not in self._adaptations:
            return False
        
        adaptation = self._adaptations[adaptation_id]
        adaptation.deleted_at = datetime.now()
        adaptation.updated_at = datetime.now()
        
        logger.info("Soft deleted adaptation %d in memory", adaptation_id)
        return True

    def get_adaptation_keys(self, adaptation_id: int) -> List[AdaptationKey]:
        """Get all keys for a specific adaptation."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        keys = [key for key in self._keys.values() 
                if key.adaptation_id == adaptation_id and key.deleted_at is None]
        logger.debug("Retrieved %d keys for adaptation %d from memory", len(keys), adaptation_id)
        return keys

    def get_key(self, key_id: int) -> Optional[AdaptationKey]:
        """Get key by ID."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        key = self._keys.get(key_id)
        if key and key.deleted_at is None:
            logger.debug("Retrieved key %d from memory", key_id)
            return key
        return None

    def get_key_by_string(self, key_string: str) -> Optional[AdaptationKey]:
        """Get key by its string identifier."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        for key in self._keys.values():
            if key.key == key_string and key.deleted_at is None:
                return key
        return None

    def create_key(self, payload: AdaptationKeyCreate) -> AdaptationKey:
        """Create a new key."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        key = AdaptationKey(
            id=self._next_key_id,
            adaptation_id=payload.adaptation_id,
            key=payload.key,
            code=payload.code,
            related_keys=payload.related_keys,
            parent_id=payload.parent_id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deleted_at=None
        )
        
        self._keys[self._next_key_id] = key
        self._next_key_id += 1
        
        logger.info("Created key %d in memory", key.id)
        return key

    def update_key(self, key_id: int, update_data: Dict[str, Any]) -> AdaptationKey:
        """Update a key."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        if key_id not in self._keys:
            raise ValueError(f"Key {key_id} not found")
        
        key = self._keys[key_id]
        for key_name, value in update_data.items():
            if hasattr(key, key_name):
                setattr(key, key_name, value)
        
        key.updated_at = datetime.now()
        logger.info("Updated key %d in memory", key_id)
        return key

    def delete_key(self, key_id: int) -> bool:
        """Delete a key (soft delete)."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        if key_id not in self._keys:
            return False
        
        key = self._keys[key_id]
        key.deleted_at = datetime.now()
        key.updated_at = datetime.now()
        
        logger.info("Soft deleted key %d in memory", key_id)
        return True

    def get_key_i18n_data(self, key_id: int) -> List[AdaptationKeyI18n]:
        """Get i18n data for a key."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        i18n_data = [i18n for i18n in self._i18n_data.values() 
                     if i18n.adaptation_key_id == key_id]
        logger.debug("Retrieved %d i18n entries for key %d from memory", len(i18n_data), key_id)
        return i18n_data

    def create_key_i18n(self, payload: AdaptationKeyI18nCreate) -> AdaptationKeyI18n:
        """Create new i18n data for a key."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        i18n = AdaptationKeyI18n(
            id=self._next_i18n_id,
            adaptation_key_id=payload.adaptation_key_id,
            locale=payload.locale,
            title=payload.title,
            desc=payload.desc,
            purpose=payload.purpose
        )
        
        self._i18n_data[self._next_i18n_id] = i18n
        self._next_i18n_id += 1
        
        logger.info("Created i18n entry %d in memory", i18n.id)
        return i18n

    def update_or_create_key_i18n(self, payload: AdaptationKeyI18nCreate) -> AdaptationKeyI18n:
        """Update existing or create new i18n data for a key."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        # Try to find existing i18n entry
        for i18n in self._i18n_data.values():
            if (i18n.adaptation_key_id == payload.adaptation_key_id and 
                i18n.locale == payload.locale):
                # Update existing entry
                i18n.title = payload.title
                i18n.desc = payload.desc
                i18n.purpose = payload.purpose
                logger.info("Updated i18n entry %d in memory", i18n.id)
                return i18n
        
        # Create new entry if none exists
        return self.create_key_i18n(payload)

    def delete_key_i18n(self, i18n_id: int) -> bool:
        """Delete i18n data."""
        if not self._connected:
            raise ConnectionError("Not connected to storage")
        
        if i18n_id not in self._i18n_data:
            return False
        
        del self._i18n_data[i18n_id]
        logger.info("Deleted i18n entry %d from memory", i18n_id)
        return True

    def clear(self):
        """Clear all data from memory (useful for testing)."""
        self._adaptations.clear()
        self._keys.clear()
        self._i18n_data.clear()
        self._next_adaptation_id = 1
        self._next_key_id = 1
        self._next_i18n_id = 1
        logger.info("Cleared all data from memory storage")
