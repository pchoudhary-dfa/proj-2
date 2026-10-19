"""
Flask adapter for DFA Help Service.
"""

import logging
from typing import Any, Dict
from flask import Flask, Blueprint, request, jsonify
from ..core.services import HelpService
from ..storage.memory import MemoryStorage
from .base import BaseAdapter

logger = logging.getLogger(__name__)


class FlaskAdapter(BaseAdapter):
    """
    Flask adapter for DFA Help Service.
    
    This adapter provides integration with Flask applications by creating
    a blueprint with the help service routes.
    """

    def __init__(self, app: Flask = None, storage_backend: str = "memory"):
        """
        Initialize the Flask adapter.
        
        Args:
            app: Flask application instance (optional)
            storage_backend: Storage backend to use ("memory", "database", "cache")
        """
        self.app = app
        self.storage_backend = storage_backend
        self.storage = None
        self.help_service = None
        self.blueprint = None
        self._initialized = False
        
        if app:
            self.register_routes(app)

    def register_routes(self, app: Flask) -> bool:
        """
        Register the help service routes with the Flask application.
        
        Args:
            app: Flask application instance
            
        Returns:
            True if routes were registered successfully
        """
        try:
            # Create blueprint
            self.blueprint = self._create_blueprint()
            
            # Register blueprint with app
            app.register_blueprint(self.blueprint, url_prefix='/help')
            
            self.app = app
            self._initialized = True
            logger.info("Successfully registered DFA Help Service routes with Flask app")
            return True
            
        except Exception as e:
            logger.error("Failed to register routes with Flask app: %s", str(e))
            return False

    def _create_blueprint(self) -> Blueprint:
        """Create the Flask blueprint with all routes."""
        blueprint = Blueprint('dfa_help_service', __name__)
        
        @blueprint.route('/api/adaptations', methods=['GET'])
        def get_adaptations():
            """Get all adaptations."""
            try:
                help_service = self.get_help_service()
                adaptations = help_service.get_adaptations()
                
                # Convert to serializable format
                adaptations_data = []
                for adaptation in adaptations:
                    adaptations_data.append({
                        'id': adaptation.id,
                        'code': adaptation.code,
                        'name': adaptation.name,
                        'desc': adaptation.desc,
                        'created_at': adaptation.created_at.isoformat() if adaptation.created_at else None,
                        'updated_at': adaptation.updated_at.isoformat() if adaptation.updated_at else None
                    })
                
                response_data = {
                    'data': adaptations_data,
                    'message': 'Adaptations retrieved successfully',
                    'status': 200,
                    'success': True
                }
                
                return jsonify(response_data)
                
            except Exception as e:
                logger.error("Error in adaptations view: %s", str(e))
                return jsonify({
                    'data': [],
                    'message': str(e),
                    'status': 500,
                    'success': False
                }), 500

        @blueprint.route('/api/keys/<int:adaptation_id>', methods=['GET'])
        def get_adaptation_keys(adaptation_id):
            """Get all keys for a specific adaptation."""
            try:
                help_service = self.get_help_service()
                keys = help_service.get_adaptation_keys(adaptation_id)
                
                # Convert to serializable format with children structure
                keys_data = []
                for key in keys:
                    # Get i18n data for title
                    i18n_data = help_service.storage.get_key_i18n_data(key.id)
                    title = ""
                    if i18n_data:
                        # Get English title by default
                        en_i18n = next((i18n for i18n in i18n_data if i18n.locale == 'en'), None)
                        if en_i18n:
                            title = en_i18n.title or ""
                    
                    # Parse related keys
                    related_keys = []
                    if key.related_keys:
                        try:
                            import json
                            related_data = json.loads(key.related_keys)
                            if isinstance(related_data, list):
                                for rel_key in related_data:
                                    if isinstance(rel_key, dict) and 'key' in rel_key:
                                        related_keys.append({'key': rel_key['key']})
                                    elif isinstance(rel_key, str):
                                        related_keys.append({'key': rel_key})
                        except:
                            pass
                    
                    key_data = {
                        'id': key.id,
                        'key': key.key,
                        'parent_id': key.parent_id,
                        'title': title,
                        'code': key.code,
                        'related_keys': related_keys,
                        'children': []  # TODO: Implement children logic
                    }
                    keys_data.append(key_data)
                
                response_data = {
                    'data': keys_data,
                    'message': 'Keys retrieved successfully',
                    'status': 200,
                    'success': True
                }
                
                return jsonify(response_data)
                
            except Exception as e:
                logger.error("Error in keys view: %s", str(e))
                return jsonify({
                    'data': [],
                    'message': str(e),
                    'status': 500,
                    'success': False
                }), 500

        @blueprint.route('/api/keydata/<int:key_id>', methods=['GET'])
        def get_key_data(key_id):
            """Get detailed information for a specific key."""
            try:
                help_service = self.get_help_service()
                key_data = help_service.get_key_data(key_id)
                
                # Convert to new response format
                translations = []
                for i18n in key_data.i18n_data:
                    translations.append({
                        'locale': i18n.locale,
                        'title': i18n.title,
                        'desc': i18n.desc,
                        'purpose': i18n.purpose
                    })
                
                response_data = {
                    'data': {
                        'id': key_data.key.id,
                        'code': key_data.key.code,
                        'key': key_data.key.key,
                        'parentKey': key_data.key.key,  # TODO: Implement parent key logic
                        'parent_id': key_data.key.parent_id,
                        'title': "",  # TODO: Get title from i18n
                        'translations': translations
                    },
                    'message': 'Key Data retrieved successfully',
                    'status': 200,
                    'success': True
                }
                
                return jsonify(response_data)
                
            except ValueError as e:
                return jsonify({
                    'data': {},
                    'message': str(e),
                    'status': 404,
                    'success': False
                }), 404
            except Exception as e:
                logger.error("Error in key data view: %s", str(e))
                return jsonify({
                    'data': {},
                    'message': str(e),
                    'status': 500,
                    'success': False
                }), 500

        @blueprint.route('/api/create', methods=['POST'])
        def create_key():
            """Create a new key."""
            try:
                payload = request.get_json()
                help_service = self.get_help_service()
                key = help_service.create_key(payload)
                
                response_data = {
                    'id': key.id,
                    'adaptation_id': key.adaptation_id,
                    'key': key.key,
                    'code': key.code,
                    'related_keys': [],
                    'parent_id': key.parent_id,
                    'created_at': key.created_at.isoformat() if key.created_at else None,
                    'updated_at': key.updated_at.isoformat() if key.updated_at else None
                }
                
                return jsonify(response_data)
                
            except Exception as e:
                logger.error("Error in create key view: %s", str(e))
                return jsonify({'error': str(e)}), 500

        @blueprint.route('/api/update/<int:key_id>', methods=['PUT'])
        def update_key(key_id):
            """Update key data."""
            try:
                payload = request.get_json()
                payload['id'] = key_id  # Set ID from path parameter
                
                help_service = self.get_help_service()
                key = help_service.update_key(payload)
                
                key_details = {
                    "id": key.id,
                    "code": key.code,
                    "key": key.key,
                    "parent_id": key.parent_id,
                    "related_keys": key.related_keys,
                    "title": ""  # TODO: Get title from i18n
                }
                
                response_data = {
                    'data': {'key_details': key_details},
                    'message': 'Key updated successfully',
                    'status': 200,
                    'success': True
                }
                
                return jsonify(response_data)
                
            except ValueError as e:
                return jsonify({
                    'data': {},
                    'message': str(e),
                    'status': 404,
                    'success': False
                }), 404
            except Exception as e:
                logger.error("Error in update key view: %s", str(e))
                return jsonify({
                    'data': {},
                    'message': str(e),
                    'status': 500,
                    'success': False
                }), 500

        @blueprint.route('/api/delete/<int:key_id>', methods=['DELETE'])
        def delete_key(key_id):
            """Delete a key."""
            try:
                help_service = self.get_help_service()
                
                # Get key details before deletion
                key = help_service.storage.get_key(key_id)
                if not key:
                    return jsonify({
                        'data': {},
                        'message': f'Key {key_id} not found',
                        'status': 404,
                        'success': False
                    }), 404
                
                result = help_service.delete_key(key_id)
                
                if result:
                    key_details = {
                        "id": key.id,
                        "code": key.code,
                        "key": key.key,
                        "parent_id": key.parent_id,
                        "related_keys": key.related_keys,
                        "title": ""  # TODO: Get title from i18n
                    }
                    
                    response_data = {
                        'data': {'key_details': key_details},
                        'message': 'Key deleted successfully',
                        'status': 200,
                        'success': True
                    }
                    
                    return jsonify(response_data)
                else:
                    return jsonify({
                        'data': {},
                        'message': f'Key {key_id} not found',
                        'status': 404,
                        'success': False
                    }), 404
                    
            except ValueError as e:
                return jsonify({
                    'data': {},
                    'message': str(e),
                    'status': 404,
                    'success': False
                }), 404
            except Exception as e:
                logger.error("Error in delete key view: %s", str(e))
                return jsonify({
                    'data': {},
                    'message': str(e),
                    'status': 500,
                    'success': False
                }), 500

        @blueprint.route('/health', methods=['GET'])
        def health_check():
            """Health check endpoint."""
            return jsonify({
                'status': 'healthy',
                'service': 'dfa-help-service',
                'version': '2.0.0'
            })

        return blueprint

    def get_config(self) -> Dict[str, Any]:
        """
        Get the adapter configuration.
        
        Returns:
            Dictionary containing adapter configuration
        """
        return {
            "framework": "flask",
            "storage_backend": self.storage_backend,
            "initialized": self._initialized,
            "blueprint_created": self.blueprint is not None
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
            logger.debug("Created new storage instance for Flask adapter")
        
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
            logger.debug("Created new help service instance for Flask adapter")
        
        return self.help_service


# Convenience function to create and configure adapter
def create_flask_adapter(app: Flask, storage_backend: str = "memory") -> FlaskAdapter:
    """
    Create and configure a Flask adapter.
    
    Args:
        app: Flask application instance
        storage_backend: Storage backend to use
        
    Returns:
        Configured FlaskAdapter instance
    """
    adapter = FlaskAdapter(app, storage_backend)
    return adapter
