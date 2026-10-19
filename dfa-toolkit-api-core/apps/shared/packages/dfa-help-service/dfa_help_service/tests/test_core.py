"""
Tests for core functionality.
"""

import pytest
from datetime import datetime
from ..core.models import (
    Adaptation, AdaptationKey, AdaptationKeyI18n,
    AdaptationCreate, AdaptationKeyCreate, AdaptationKeyI18nCreate,
    KeyUpdatePayload, KeyCreatePayload
)
from ..core.services import HelpService
from ..storage.memory import MemoryStorage


class TestModels:
    """Test core models."""

    def test_adaptation_model(self):
        """Test Adaptation model creation and validation."""
        adaptation = Adaptation(
            id=1,
            code="TEST",
            name="Test Adaptation",
            desc="A test adaptation",
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deleted_at=None
        )
        
        assert adaptation.id == 1
        assert adaptation.code == "TEST"
        assert adaptation.name == "Test Adaptation"
        assert adaptation.desc == "A test adaptation"

    def test_adaptation_key_model(self):
        """Test AdaptationKey model creation and validation."""
        key = AdaptationKey(
            id=1,
            adaptation_id=1,
            key="test_key",
            code="TEST_CODE",
            related_keys="[]",
            parent_id=None,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            deleted_at=None
        )
        
        assert key.id == 1
        assert key.adaptation_id == 1
        assert key.key == "test_key"
        assert key.code == "TEST_CODE"

    def test_adaptation_key_i18n_model(self):
        """Test AdaptationKeyI18n model creation and validation."""
        i18n = AdaptationKeyI18n(
            id=1,
            adaptation_key_id=1,
            locale="en",
            title="Test Title",
            desc="Test Description",
            purpose="Test Purpose"
        )
        
        assert i18n.id == 1
        assert i18n.adaptation_key_id == 1
        assert i18n.locale == "en"
        assert i18n.title == "Test Title"

    def test_key_update_payload_validation(self):
        """Test KeyUpdatePayload validation."""
        payload = KeyUpdatePayload(
            id=1,
            code="UPDATED_CODE",
            desc="Updated description",
            title="Updated Title",
            key="updated_key",
            lang="en",
            purpose="Updated purpose",
            related_keys="key1,key2"
        )
        
        assert payload.id == 1
        assert payload.lang == "en"
        assert payload.code == "UPDATED_CODE"

    def test_key_update_payload_invalid_lang(self):
        """Test KeyUpdatePayload with invalid language."""
        with pytest.raises(ValueError, match="Invalid locale"):
            KeyUpdatePayload(
                id=1,
                lang="invalid",
                title="Test"
            )

    def test_key_create_payload(self):
        """Test KeyCreatePayload creation."""
        payload = KeyCreatePayload(
            adaptation_id=1,
            parent_id=None,
            title="New Key Title"
        )
        
        assert payload.adaptation_id == 1
        assert payload.parent_id is None
        assert payload.title == "New Key Title"


class TestHelpService:
    """Test HelpService functionality."""

    def setup_method(self):
        """Set up test fixtures."""
        self.storage = MemoryStorage()
        self.storage.connect()
        self.help_service = HelpService(self.storage)

    def test_get_adaptations(self):
        """Test getting all adaptations."""
        adaptations = self.help_service.get_adaptations()
        assert len(adaptations) > 0
        assert isinstance(adaptations[0], Adaptation)

    def test_get_adaptation_keys(self):
        """Test getting keys for an adaptation."""
        keys = self.help_service.get_adaptation_keys(1)
        assert len(keys) > 0
        assert isinstance(keys[0], AdaptationKey)

    def test_get_key_data(self):
        """Test getting detailed key data."""
        key_data = self.help_service.get_key_data(1)
        assert key_data.key is not None
        assert key_data.i18n_data is not None
        assert key_data.adaptation is not None

    def test_create_key(self):
        """Test creating a new key."""
        payload = {
            'adaptation_id': 1,
            'parent_id': None,
            'title': "Test Key"
        }
        
        key = self.help_service.create_key(payload)
        assert key.id > 0
        assert key.adaptation_id == 1

    def test_update_key(self):
        """Test updating a key."""
        payload = {
            'id': 1,
            'code': 'UPDATED_CODE',
            'desc': 'Updated description',
            'title': 'Updated Title',
            'key': 'updated_key',
            'lang': 'en',
            'purpose': 'Updated purpose',
            'related_keys': 'key1,key2'
        }
        
        key = self.help_service.update_key(payload)
        assert key.code == 'UPDATED_CODE'

    def test_delete_key(self):
        """Test deleting a key."""
        result = self.help_service.delete_key(1)
        assert result is True

    def test_get_adaptation_by_code(self):
        """Test getting adaptation by code."""
        adaptation = self.help_service.get_adaptation_by_code("SAMP")
        assert adaptation is not None
        assert adaptation.code == "SAMP"

    def test_create_adaptation(self):
        """Test creating a new adaptation."""
        payload = AdaptationCreate(
            code="NEW",
            name="New Adaptation",
            desc="A new adaptation"
        )
        
        adaptation = self.help_service.create_adaptation(payload)
        assert adaptation.id > 0
        assert adaptation.code == "NEW"

    def test_update_adaptation(self):
        """Test updating an adaptation."""
        from ..core.models import AdaptationUpdate
        
        payload = AdaptationUpdate(
            name="Updated Adaptation Name",
            desc="Updated description"
        )
        
        adaptation = self.help_service.update_adaptation(1, payload.dict(exclude_unset=True))
        assert adaptation.name == "Updated Adaptation Name"

    def test_delete_adaptation(self):
        """Test deleting an adaptation."""
        result = self.help_service.delete_adaptation(1)
        assert result is True
