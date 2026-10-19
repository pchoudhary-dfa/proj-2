"""
Core business logic services for DFA Help Service.
"""

import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
from .models import (
    Adaptation, AdaptationKey, AdaptationKeyI18n,
    AdaptationCreate, AdaptationUpdate, AdaptationKeyCreate, AdaptationKeyI18nCreate,
    KeyUpdatePayload, KeyCreatePayload, KeyDataResponse, APIResponse
)
from ..storage.base import BaseStorage

logger = logging.getLogger(__name__)


class HelpService:
    """
    Main service class for DFA Help Service operations.
    """

    def __init__(self, storage: BaseStorage):
        """
        Initialize the service with a storage backend.
        
        Args:
            storage: Storage backend implementation
        """
        self.storage = storage
        logger.info("HelpService initialized with storage backend: %s", type(storage).__name__)

    def get_adaptations(self) -> List[Adaptation]:
        """
        Get all adaptations.
        
        Returns:
            List of Adaptation objects
        """
        try:
            adaptations = self.storage.get_adaptations()
            logger.info("Retrieved %d adaptations", len(adaptations))
            return adaptations
        except Exception as e:
            logger.error("Error retrieving adaptations: %s", str(e))
            raise

    def get_adaptation_keys(self, adaptation_id: int) -> List[AdaptationKey]:
        """
        Get all keys for a specific adaptation.
        
        Args:
            adaptation_id: ID of the adaptation
            
        Returns:
            List of AdaptationKey objects
        """
        try:
            keys = self.storage.get_adaptation_keys(adaptation_id)
            logger.info("Retrieved %d keys for adaptation %d", len(keys), adaptation_id)
            return keys
        except Exception as e:
            logger.error("Error retrieving keys for adaptation %d: %s", adaptation_id, str(e))
            raise

    def get_key_data(self, key_id: int) -> KeyDataResponse:
        """
        Get detailed information for a specific key.
        
        Args:
            key_id: ID of the key
            
        Returns:
            KeyDataResponse with key, i18n data, and adaptation info
        """
        try:
            key = self.storage.get_key(key_id)
            if not key:
                raise ValueError(f"Key with ID {key_id} not found")
            
            i18n_data = self.storage.get_key_i18n_data(key_id)
            adaptation = self.storage.get_adaptation(key.adaptation_id)
            
            response = KeyDataResponse(
                key=key,
                i18n_data=i18n_data,
                adaptation=adaptation
            )
            
            logger.info("Retrieved key data for key %d", key_id)
            return response
        except Exception as e:
            logger.error("Error retrieving key data for key %d: %s", key_id, str(e))
            raise

    def create_key(self, payload: Union[KeyCreatePayload, Dict[str, Any]]) -> AdaptationKey:
        """
        Create a new key.
        
        Args:
            payload: Key creation payload
            
        Returns:
            Created AdaptationKey object
        """
        try:
            if isinstance(payload, dict):
                payload = KeyCreatePayload(**payload)
            
            # Normalize parent_id: 0 → None (frontend may send 0 for root)
            parent_id = payload.parent_id if payload.parent_id else None

            key_data = AdaptationKeyCreate(
                adaptation_id=payload.adaptation_id,
                parent_id=parent_id,
                key=f"key_{datetime.now().timestamp()}",
                code=f"code_{datetime.now().timestamp()}",
                related_keys="[]"
            )
            
            key = self.storage.create_key(key_data)
            
            # Create default i18n entry for the title
            i18n_data = AdaptationKeyI18nCreate(
                adaptation_key_id=key.id,
                locale='en',  # Default to English
                title=payload.title,
                desc="",
                purpose=""
            )
            
            self.storage.create_key_i18n(i18n_data)
            
            logger.info("Created new key with ID %d for adaptation %d", key.id, payload.adaptation_id)
            return key
        except Exception as e:
            logger.error("Error creating key: %s", str(e))
            raise

    def update_key(self, payload: Union[KeyUpdatePayload, Dict[str, Any]]) -> AdaptationKey:
        """
        Update key data.
        
        Args:
            payload: Key update payload
            
        Returns:
            Updated AdaptationKey object
        """
        try:
            if isinstance(payload, dict):
                payload = KeyUpdatePayload(**payload)
            
            # Get existing key
            key = self.storage.get_key(payload.id)
            if not key:
                raise ValueError(f"Key with ID {payload.id} not found")
            
            # Update key fields if provided
            key_update_data = {}
            if payload.code is not None:
                key_update_data['code'] = payload.code
            if payload.key is not None:
                key_update_data['key'] = payload.key
            if payload.related_keys is not None:
                key_update_data['related_keys'] = payload.related_keys
            
            if key_update_data:
                key = self.storage.update_key(payload.id, key_update_data)
            
            # Update or create i18n data
            i18n_data = AdaptationKeyI18nCreate(
                adaptation_key_id=payload.id,
                locale=payload.lang,
                title=payload.title,
                desc=payload.desc,
                purpose=payload.purpose
            )
            
            self.storage.update_or_create_key_i18n(i18n_data)
            
            logger.info("Updated key %d", payload.id)
            return key
        except Exception as e:
            logger.error("Error updating key %d: %s", payload.id, str(e))
            raise

    def delete_key(self, key_id: int) -> bool:
        """
        Delete a key.
        
        Args:
            key_id: ID of the key to delete
            
        Returns:
            True if deletion was successful
        """
        try:
            # Check if key exists
            key = self.storage.get_key(key_id)
            if not key:
                raise ValueError(f"Key with ID {key_id} not found")
            
            # Soft delete the key
            result = self.storage.delete_key(key_id)
            
            logger.info("Deleted key %d", key_id)
            return result
        except Exception as e:
            logger.error("Error deleting key %d: %s", key_id, str(e))
            raise

    def get_adaptation_by_code(self, code: str) -> Optional[Adaptation]:
        """
        Get adaptation by its code.
        
        Args:
            code: Adaptation code
            
        Returns:
            Adaptation object or None if not found
        """
        try:
            adaptation = self.storage.get_adaptation_by_code(code)
            if adaptation:
                logger.info("Retrieved adaptation with code %s", code)
            return adaptation
        except Exception as e:
            logger.error("Error retrieving adaptation with code %s: %s", code, str(e))
            raise

    def create_adaptation(self, payload: AdaptationCreate) -> Adaptation:
        """
        Create a new adaptation.
        
        Args:
            payload: Adaptation creation payload
            
        Returns:
            Created Adaptation object
        """
        try:
            adaptation = self.storage.create_adaptation(payload)
            logger.info("Created new adaptation with ID %d and code %s", adaptation.id, adaptation.code)
            return adaptation
        except Exception as e:
            logger.error("Error creating adaptation: %s", str(e))
            raise

    def update_adaptation(self, adaptation_id: int, payload: AdaptationUpdate) -> Adaptation:
        """
        Update an adaptation.
        
        Args:
            adaptation_id: ID of the adaptation to update
            payload: Adaptation update payload
            
        Returns:
            Updated Adaptation object
        """
        try:
            adaptation = self.storage.update_adaptation(adaptation_id, payload.dict(exclude_unset=True))
            logger.info("Updated adaptation %d", adaptation_id)
            return adaptation
        except Exception as e:
            logger.error("Error updating adaptation %d: %s", adaptation_id, str(e))
            raise

    def delete_adaptation(self, adaptation_id: int) -> bool:
        """
        Delete an adaptation.
        
        Args:
            adaptation_id: ID of the adaptation to delete
            
        Returns:
            True if deletion was successful
        """
        try:
            result = self.storage.delete_adaptation(adaptation_id)
            logger.info("Deleted adaptation %d", adaptation_id)
            return result
        except Exception as e:
            logger.error("Error deleting adaptation %d: %s", adaptation_id, str(e))
            raise
