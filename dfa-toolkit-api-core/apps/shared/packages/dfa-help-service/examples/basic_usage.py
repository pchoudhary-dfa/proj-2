#!/usr/bin/env python3
"""
Basic usage example for DFA Help Service.

This example demonstrates how to use the service without any specific framework.
"""

import logging
from dfa_help_service.core.services import HelpService
from dfa_help_service.storage.memory import MemoryStorage

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    """Main example function."""
    logger.info("Starting DFA Help Service example")
    
    # Initialize storage and service
    storage = MemoryStorage()
    storage.connect()
    help_service = HelpService(storage)
    
    logger.info("Service initialized successfully")
    
    # Get all adaptations
    logger.info("Fetching all adaptations...")
    adaptations = help_service.get_adaptations()
    logger.info(f"Found {len(adaptations)} adaptations")
    
    for adaptation in adaptations:
        logger.info(f"Adaptation: {adaptation.name} (Code: {adaptation.code})")
    
    # Get keys for the first adaptation
    if adaptations:
        first_adaptation = adaptations[0]
        logger.info(f"Fetching keys for adaptation: {first_adaptation.name}")
        
        keys = help_service.get_adaptation_keys(first_adaptation.id)
        logger.info(f"Found {len(keys)} keys")
        
        for key in keys:
            logger.info(f"Key: {key.key} (Code: {key.code})")
    
    # Create a new key
    logger.info("Creating a new key...")
    new_key_payload = {
        'adaptation_id': 1,
        'parent_id': None,
        'title': "Example Key Title"
    }
    
    new_key = help_service.create_key(new_key_payload)
    logger.info(f"Created new key with ID: {new_key.id}")
    
    # Get detailed key data
    logger.info("Fetching detailed key data...")
    key_data = help_service.get_key_data(new_key.id)
    logger.info(f"Key: {key_data.key.key}")
    logger.info(f"Adaptation: {key_data.adaptation.name}")
    logger.info(f"I18n entries: {len(key_data.i18n_data)}")
    
    # Update the key
    logger.info("Updating the key...")
    update_payload = {
        'id': new_key.id,
        'code': 'EXAMPLE_CODE',
        'desc': 'This is an example key description',
        'title': 'Updated Example Key Title',
        'key': 'example_key',
        'lang': 'en',
        'purpose': 'This key is used for demonstration purposes',
        'related_keys': 'key1,key2,key3'
    }
    
    updated_key = help_service.update_key(update_payload)
    logger.info(f"Updated key: {updated_key.code}")
    
    # Get key data again to see changes
    updated_key_data = help_service.get_key_data(updated_key.id)
    logger.info(f"Updated key data: {updated_key_data.key.code}")
    
    # Clean up - delete the test key
    logger.info("Cleaning up - deleting test key...")
    help_service.delete_key(new_key.id)
    logger.info("Test key deleted")
    
    logger.info("Example completed successfully!")


if __name__ == "__main__":
    main()
