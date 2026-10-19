"""
Django adapter for DFA Help Service.
"""

import logging
from typing import Any, Dict
import json

from ..core.services import HelpService
from ..storage.memory import MemoryStorage
from .base import BaseAdapter

# Django imports - only import when needed to avoid startup issues
try:
    from django.views import View
    from django.http import JsonResponse
    from django.utils.decorators import method_decorator
    from django.views.decorators.csrf import csrf_exempt
    from django.urls import path
    DJANGO_AVAILABLE = True
except ImportError:
    # Django not available, define fallback classes
    class View:
        pass
    
    class JsonResponse:
        def __init__(self, data, safe=False, status=200):
            self.data = data
            self.status = status
    
    def method_decorator(decorator, name='dispatch'):
        def wrapper(cls):
            return cls
        return wrapper
    
    def csrf_exempt(view_func):
        return view_func
    
    def path(route, view, name=None):
        return None
    
    DJANGO_AVAILABLE = False

logger = logging.getLogger(__name__)


class DjangoAdapter(BaseAdapter):
    """
    Django adapter for DFA Help Service.
    
    This adapter provides integration with Django applications by creating
    views and URL patterns for the help service.
    """

    def __init__(self, storage_backend: str = "memory"):
        """
        Initialize the Django adapter.
        
        Args:
            storage_backend: Storage backend to use ("memory", "database", "cache")
        """
        self.storage_backend = storage_backend
        self.storage = None
        self.help_service = None
        self._initialized = False

    def register_routes(self, app: Any) -> bool:
        """
        Register the help service routes with the Django application.
        
        Args:
            app: Django application instance (not used in Django)
            
        Returns:
            True if routes were registered successfully
        """
        try:
            # In Django, routes are registered via URL patterns
            # This method is kept for interface compatibility
            self._initialized = True
            logger.info("Django adapter initialized - routes should be included in urls.py")
            return True
            
        except Exception as e:
            logger.error("Failed to initialize Django adapter: %s", str(e))
            return False

    def get_config(self) -> Dict[str, Any]:
        """
        Get the adapter configuration.
        
        Returns:
            Dictionary containing adapter configuration
        """
        return {
            "framework": "django",
            "storage_backend": self.storage_backend,
            "initialized": self._initialized
        }

    def get_storage(self) -> MemoryStorage:
        """
        Get a configured storage backend instance.
        
        Returns:
            Configured storage backend instance
        """
        if not self.storage:
            # Use database storage for Django adapter since we're querying Django models directly
            from ..storage.database import DatabaseStorage
            self.storage = DatabaseStorage()
            self.storage.connect()
            logger.debug("Created new database storage instance for Django adapter")
        
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
            logger.debug("Created new help service instance for Django adapter")
        
        return self.help_service


# Django Views
class AdaptationsView(View):
    """View for getting all adaptations."""
    
    def get(self, request):
        """Handle GET request for adaptations."""
        try:
            # Import Django models directly to avoid circular imports
            from dfa_help_service.adapters.django.models import Adaptation
            
            # Query the database directly using Django ORM
            adaptations = Adaptation.objects.filter(deleted_at__isnull=True)
            
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
            
            return JsonResponse(response_data, safe=False)
            
        except Exception as e:
            logger.error("Error in adaptations view: %s", str(e))
            return JsonResponse({
                'data': [],
                'message': str(e),
                'status': 500,
                'success': False
            }, status=500)


class KeysView(View):
    """View for getting keys for a specific adaptation."""
    
    def get(self, request, adaptation_id):
        """Handle GET request for adaptation keys."""
        try:
            # Import Django models directly to avoid circular imports
            from dfa_help_service.adapters.django.models import AdaptationKey, AdaptationKeyI18n
            
            # Query the database directly using Django ORM
            all_keys = AdaptationKey.objects.filter(
                adaptation_id=adaptation_id,
                deleted_at__isnull=True
            ).order_by('id')
            
            # Build hierarchical structure
            def build_key_with_children(key_obj):
                # Get i18n data for title
                i18n_data = AdaptationKeyI18n.objects.filter(adaptation_key_id=key_obj.id)
                title = ""
                if i18n_data:
                    # Get English title by default
                    en_i18n = i18n_data.filter(locale='en').first()
                    if en_i18n:
                        title = en_i18n.title or ""
                
                # Parse related keys
                related_keys = []
                if key_obj.related_keys:
                    try:
                        import json
                        related_data = json.loads(key_obj.related_keys)
                        if isinstance(related_data, list):
                            for rel_key in related_data:
                                if isinstance(rel_key, dict) and 'key' in rel_key:
                                    related_keys.append({'key': rel_key['key']})
                                elif isinstance(rel_key, str):
                                    related_keys.append({'key': rel_key})
                    except:
                        pass
                
                # Find children of this key
                children = []
                for child_key in all_keys:
                    if child_key.parent_id == key_obj.id:
                        children.append(build_key_with_children(child_key))
                
                return {
                    'id': key_obj.id,
                    'key': key_obj.key,
                    'parent_id': key_obj.parent_id,
                    'title': title,
                    'code': key_obj.code,
                    'related_keys': related_keys,
                    'children': children
                }
            
            # Build the complete hierarchy starting with root keys (parent_id is None)
            keys_data = []
            for key in all_keys:
                if key.parent_id is None:  # Root level keys
                    keys_data.append(build_key_with_children(key))
            
            response_data = {
                'data': keys_data,
                'message': 'Keys retrieved successfully',
                'status': 200,
                'success': True
            }
            
            return JsonResponse(response_data, safe=False)
            
        except Exception as e:
            logger.error("Error in keys view: %s", str(e))
            return JsonResponse({
                'data': [],
                'message': str(e),
                'status': 500,
                'success': False
            }, status=500)


class KeyDataView(View):
    """View for getting detailed key data."""
    
    def get(self, request, key_id):
        """Handle GET request for key data."""
        try:
            # Import Django models directly to avoid circular imports
            from dfa_help_service.adapters.django.models import AdaptationKey, AdaptationKeyI18n
            
            # Determine if key_id is an integer (ID) or string (key)
            key = None
            if key_id.isdigit():
                # Search by ID
                key = AdaptationKey.objects.filter(id=int(key_id), deleted_at__isnull=True).first()
            else:
                # Search by key string
                key = AdaptationKey.objects.filter(key=key_id, deleted_at__isnull=True).first()
            
            if not key:
                return JsonResponse({
                    'data': {},
                    'message': f'Key with ID/key "{key_id}" not found',
                    'status': 404,
                    'success': False
                }, status=404)
            
            # Get i18n data
            i18n_data = AdaptationKeyI18n.objects.filter(adaptation_key_id=key.id)
            
            # Parse related keys (support JSON array or CSV string) and enrich with translations
            related_keys = []
            if key.related_keys:
                try:
                    import json
                    parsed = None
                    # Try JSON first
                    try:
                        parsed = json.loads(key.related_keys)
                    except Exception:
                        parsed = None
                    items = []
                    if isinstance(parsed, list):
                        items = parsed
                    else:
                        # Fallback to CSV parsing
                        items = [p.strip() for p in str(key.related_keys).split(',') if p.strip()]

                    for rel in items:
                        if isinstance(rel, dict) and 'key' in rel:
                            rel_key_str = rel['key']
                        else:
                            rel_key_str = str(rel)

                        # Lookup related key by its key string
                        rel_key_obj = AdaptationKey.objects.filter(key=rel_key_str, deleted_at__isnull=True).first()
                        rel_translations = []
                        if rel_key_obj:
                            rel_i18n = AdaptationKeyI18n.objects.filter(adaptation_key_id=rel_key_obj.id)
                            for i18n in rel_i18n:
                                rel_translations.append({
                                    'locale': i18n.locale,
                                    'title': i18n.title
                                })
                        related_keys.append({
                            'key': rel_key_str,
                            'translations': rel_translations
                        })
                except Exception as e:
                    logger.warning(f"Error parsing/enriching related_keys for key {key_id}: {str(e)}")
                    related_keys = []
            
            # Convert to new response format
            translations = []
            for i18n in i18n_data:
                translations.append({
                    'locale': i18n.locale,
                    'title': i18n.title,
                    'desc': i18n.desc,
                    'purpose': i18n.purpose
                })
            
            response_data = {
                'data': {
                    'id': key.id,
                    'code': key.code,
                    'key': key.key,
                    'parentKey': key.key,  # TODO: Implement parent key logic
                    'parent_id': key.parent_id,
                    'title': "",  # TODO: Get title from i18n
                    'related_keys': related_keys,
                    'translations': translations
                },
                'message': 'Key Data retrieved successfully',
                'status': 200,
                'success': True
            }
            
            return JsonResponse(response_data, safe=False)
            
        except Exception as e:
            logger.error("Error in key data view: %s", str(e))
            return JsonResponse({
                'data': {},
                'message': str(e),
                'status': 500,
                'success': False
            }, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class CreateKeyView(View):
    """View for creating new keys."""
    
    def post(self, request):
        """Handle POST request for creating keys."""
        try:
            payload = json.loads(request.body)
            
            # Import Django models directly
            from dfa_help_service.adapters.django.models import AdaptationKey, AdaptationKeyI18n
            from django.utils import timezone
            
            # Create the adaptation key using Django ORM
            # Let Django handle the ID automatically
            try:
                key = AdaptationKey.objects.create(
                    adaptation_id=payload.get('adaptation_id'),
                    key=payload.get('key'),
                    code=payload.get('code'),
                    related_keys=payload.get('related_keys', '[]'),
                    parent_id=payload.get('parent_id')
                    # Remove created_at and updated_at - let Django handle these automatically
                )
            except Exception as e:
                if "duplicate key value violates unique constraint" in str(e):
                    # Try to fix the sequence issue by getting the next available ID
                    from django.db import connection
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT setval('dfahelp_adaptation_keys_id_seq', (SELECT MAX(id) FROM dfahelp_adaptation_keys));")
                    
                    # Try creating again
                    key = AdaptationKey.objects.create(
                        adaptation_id=payload.get('adaptation_id'),
                        key=payload.get('key'),
                        code=payload.get('code'),
                        related_keys=payload.get('related_keys', '[]'),
                        parent_id=payload.get('parent_id')
                    )
                else:
                    raise e
            
            # Create default i18n entry if title is provided
            if payload.get('title'):
                try:
                    AdaptationKeyI18n.objects.create(
                        adaptation_key_id=key.id,
                        locale=payload.get('lang', 'en'),
                        title=payload.get('title'),
                        desc=payload.get('desc', ''),
                        purpose=payload.get('purpose', '')
                    )
                except Exception as e:
                    if "duplicate key value violates unique constraint" in str(e):
                        # Try to fix the sequence issue by getting the next available ID
                        from django.db import connection
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT setval('dfahelp_adaptation_keys_i18n_id_seq', (SELECT MAX(id) FROM dfahelp_adaptation_keys_i18n));")
                        
                        # Try creating again
                        AdaptationKeyI18n.objects.create(
                            adaptation_key_id=key.id,
                            locale=payload.get('lang', 'en'),
                            title=payload.get('title'),
                            desc=payload.get('desc', ''),
                            purpose=payload.get('purpose', '')
                        )
                    else:
                        raise e
            
            response_data = {
                'id': key.id,
                'adaptation_id': key.adaptation_id,
                'key': key.key,
                'code': key.code,
                'related_keys': payload.get('related_keys', []),
                'parent_id': key.parent_id,
                'created_at': key.created_at.isoformat() if key.created_at else None,
                'updated_at': key.updated_at.isoformat() if key.updated_at else None
            }
            
            return JsonResponse(response_data, safe=False)
            
        except Exception as e:
            logger.error("Error in create key view: %s", str(e))
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class UpdateKeyView(View):
    """View for updating keys."""
    
    def put(self, request, key_id):
        """Handle PUT request for updating keys."""
        try:
            payload = json.loads(request.body)
            
            # Import Django models directly
            from dfa_help_service.adapters.django.models import AdaptationKey, AdaptationKeyI18n
            from django.utils import timezone
            
            # Get the existing key
            key = AdaptationKey.objects.filter(id=key_id, deleted_at__isnull=True).first()
            if not key:
                return JsonResponse({
                    'data': {},
                    'message': f'Key with ID {key_id} not found',
                    'status': 404,
                    'success': False
                }, status=404)
            
            # Update key fields if provided
            if payload.get('code') is not None:
                key.code = payload['code']
            if payload.get('key') is not None:
                key.key = payload['key']
            if payload.get('related_keys') is not None:
                key.related_keys = payload['related_keys']
            
            key.updated_at = timezone.now()
            key.save()
            
            # Update or create i18n data
            if payload.get('title') or payload.get('desc') or payload.get('purpose'):
                i18n_data, created = AdaptationKeyI18n.objects.get_or_create(
                    adaptation_key_id=key_id,
                    locale=payload.get('lang', 'en'),
                    defaults={
                        'title': payload.get('title', ''),
                        'desc': payload.get('desc', ''),
                        'purpose': payload.get('purpose', '')
                    }
                )
                
                if not created:
                    # Update existing i18n entry
                    if payload.get('title') is not None:
                        i18n_data.title = payload['title']
                    if payload.get('desc') is not None:
                        i18n_data.desc = payload['desc']
                    if payload.get('purpose') is not None:
                        i18n_data.purpose = payload['purpose']
                    i18n_data.save()
            
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
            
            return JsonResponse(response_data, safe=False)
            
        except Exception as e:
            logger.error("Error in update key view: %s", str(e))
            return JsonResponse({
                'data': {},
                'message': str(e),
                'status': 500,
                'success': False
            }, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class DeleteKeyView(View):
    """View for deleting keys."""
    
    def delete(self, request, key_id):
        """Handle DELETE request for deleting keys."""
        try:
            # Import Django models directly
            from dfa_help_service.adapters.django.models import AdaptationKey
            from django.utils import timezone
            
            # Get key details before deletion
            key = AdaptationKey.objects.filter(id=key_id, deleted_at__isnull=True).first()
            if not key:
                return JsonResponse({
                    'data': {},
                    'message': f'Key {key_id} not found',
                    'status': 404,
                    'success': False
                }, status=404)
            
            # Soft delete the key
            key.deleted_at = timezone.now()
            key.save()
            
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
            
            return JsonResponse(response_data, safe=False)
        except Exception as e:
            logger.error("Error in delete key view: %s", str(e))
            return JsonResponse({
                'data': {},
                'message': str(e),
                'status': 500,
                'success': False
            }, status=500)


# URL patterns for Django
urlpatterns = [
    path('adaptations/', AdaptationsView.as_view(), name='dfa_help_adaptations'),
    path('keys/<int:adaptation_id>/', KeysView.as_view(), name='dfa_help_keys'),
    path('keydata/<str:key_id>/', KeyDataView.as_view(), name='dfa_help_keydata'),
    path('create/', CreateKeyView.as_view(), name='dfa_help_create'),
    path('update/<int:key_id>/', UpdateKeyView.as_view(), name='dfa_help_update'),
    path('delete/<int:key_id>/', DeleteKeyView.as_view(), name='dfa_help_delete'),
]


# Django app configuration - removed to prevent Django from treating this as an app
# This package should be imported as a regular Python package, not as a Django app
