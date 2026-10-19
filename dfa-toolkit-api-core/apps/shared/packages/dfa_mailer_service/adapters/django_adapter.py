"""
Django adapter for DFA Mailer Service
"""

import logging
from typing import Dict, Any, Optional, List
from django.db import models
from django.core.exceptions import ValidationError
from django.urls import path, include
from django.conf import settings

from ..core.models import EmailTemplateSchema, EmailLogSchema, EmailStatus, EmailPriority, BaseEmailTemplate, BaseEmailLog
from ..core.service import EmailService, SendResult
from ..core.config import EmailConfig
from ..tasks.email_tasks import initialize_celery

logger = logging.getLogger(__name__)

# Lazy import of REST framework to avoid AppRegistryNotReady errors
# Try to import, but if it fails (Django not ready), we'll import later
try:
    from rest_framework import serializers, viewsets, status
    from rest_framework.decorators import action
    from rest_framework.response import Response
    from rest_framework.permissions import IsAuthenticated
    from rest_framework.pagination import PageNumberPagination, LimitOffsetPagination
except Exception:
    # If import fails (e.g., Django not ready), set to None and import later
    serializers = None
    viewsets = None
    status = None
    action = None
    Response = None
    IsAuthenticated = None
    PageNumberPagination = None
    LimitOffsetPagination = None

def _ensure_rest_framework():
    """Ensure REST framework is imported - call this before using serializers/viewsets"""
    global serializers, viewsets, status, action, Response, IsAuthenticated, PageNumberPagination, LimitOffsetPagination
    if serializers is None:
        from rest_framework import serializers as _serializers, viewsets as _viewsets, status as _status
        from rest_framework.decorators import action as _action
        from rest_framework.response import Response as _Response
        from rest_framework.permissions import IsAuthenticated as _IsAuthenticated
        from rest_framework.pagination import PageNumberPagination as _PageNumberPagination, LimitOffsetPagination as _LimitOffsetPagination
        serializers = _serializers
        viewsets = _viewsets
        status = _status
        action = _action
        Response = _Response
        IsAuthenticated = _IsAuthenticated
        PageNumberPagination = _PageNumberPagination
        LimitOffsetPagination = _LimitOffsetPagination


class EmailTemplate(models.Model):
    """
    Django model for email templates
    """
    template_key = models.CharField(max_length=100, help_text='Unique identifier for the template')
    language = models.CharField(max_length=10, default='en', help_text='Language code (e.g., en, es, fr)')
    name = models.CharField(max_length=200, help_text='Human-readable name for the template')
    subject = models.CharField(max_length=500, help_text='Email subject line')
    html_content = models.TextField(help_text='HTML content of the email')
    text_content = models.TextField(blank=True, null=True, help_text='Plain text content of the email')
    created_by = models.JSONField(default=dict, blank=True, null=True, help_text='Metadata about the creator (JSON)')
    is_active = models.BooleanField(default=True, help_text='Whether the template is active')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        app_label = 'dfa_mailer_adapter'
        db_table = 'dfa_email_templates'
        unique_together = ('template_key', 'language')
        ordering = ['-created_at', 'template_key', 'language']
        indexes = [
            models.Index(fields=['template_key'], name='dfa_email_templates_key_idx'),
            models.Index(fields=['language'], name='dfa_email_templates_lang_idx'),
            models.Index(fields=['is_active'], name='dfa_email_templates_active_idx'),
        ]
        verbose_name = 'Email Template'
        verbose_name_plural = 'Email Templates'
    
    def __str__(self):
        return f"{self.template_key} ({self.language})"
    
    def clean(self):
        super().clean()
        if not self.template_key:
            raise ValidationError("Template key is required")
        if not self.name:
            raise ValidationError("Template name is required")
        if not self.subject:
            raise ValidationError("Subject is required")
        if not self.html_content:
            raise ValidationError("HTML content is required")
    
    @classmethod
    def get_by_key_and_language(cls, template_key: str, language: str) -> Optional['EmailTemplate']:
        try:
            return cls.objects.get(template_key=template_key, language=language, is_active=True)
        except cls.DoesNotExist:
            return None
    
    @classmethod
    def get_all_by_key(cls, template_key: str) -> List['EmailTemplate']:
        return list(cls.objects.filter(template_key=template_key, is_active=True))
    
    @classmethod
    def get_all_active(cls) -> List['EmailTemplate']:
        return list(cls.objects.filter(is_active=True))
    
    def save(self, *args, **kwargs):
        """Save the template to database"""
        self.full_clean()
        return super().save(*args, **kwargs)
    
    def delete(self, *args, **kwargs):
        """Delete the template from database"""
        return super().delete(*args, **kwargs)
    
    def update(self, **kwargs):
        """Update template fields"""
        for field, value in kwargs.items():
            setattr(self, field, value)
        self.save()
        return self


class EmailLog(models.Model):
    """
    Django model for email logs
    """
    template_key = models.CharField(max_length=100, help_text='Template key used for this email')
    recipient_email = models.EmailField(max_length=254, help_text='Recipient email address')
    recipient_name = models.CharField(max_length=200, blank=True, null=True, help_text='Recipient name')
    subject = models.CharField(max_length=500, help_text='Email subject line')
    html_content = models.TextField(help_text='HTML content of the email')
    text_content = models.TextField(blank=True, null=True, help_text='Plain text content of the email')
    context = models.JSONField(default=dict, help_text='Context data used for template rendering')
    status = models.CharField(
        max_length=20,
        choices=[(status.value, status.value.title()) for status in EmailStatus],
        default=EmailStatus.PENDING.value
    )
    priority = models.CharField(
        max_length=20,
        choices=[(priority.value, priority.value.title()) for priority in EmailPriority],
        default=EmailPriority.NORMAL.value
    )
    sent_at = models.DateTimeField(blank=True, null=True, help_text='When the email was sent')
    error_message = models.TextField(blank=True, null=True, help_text='Error message if sending failed')
    retry_count = models.IntegerField(default=0, help_text='Number of retry attempts')
    max_retries = models.IntegerField(default=3, help_text='Maximum number of retry attempts')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        app_label = 'dfa_mailer_adapter'
        db_table = 'dfa_email_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['template_key'], name='dfa_email_logs_template_idx'),
            models.Index(fields=['recipient_email'], name='dfa_email_logs_recipient_idx'),
            models.Index(fields=['status'], name='dfa_email_logs_status_idx'),
            models.Index(fields=['created_at'], name='dfa_email_logs_created_idx'),
            models.Index(fields=['sent_at'], name='dfa_email_logs_sent_idx'),
        ]
        verbose_name = 'Email Log'
        verbose_name_plural = 'Email Logs'
    
    def __str__(self):
        return f"{self.recipient_email} - {self.template_key} ({self.status})"
    
    @classmethod
    def get_by_id(cls, log_id: int) -> Optional['EmailLog']:
        try:
            return cls.objects.get(id=log_id)
        except cls.DoesNotExist:
            return None
    
    @classmethod
    def get_by_status(cls, status: EmailStatus) -> List['EmailLog']:
        return list(cls.objects.filter(status=status.value).order_by('-created_at'))
    
    @classmethod
    def get_by_recipient(cls, email: str) -> List['EmailLog']:
        return list(cls.objects.filter(recipient_email=email).order_by('-created_at'))
    
    @classmethod
    def get_pending_emails(cls) -> List['EmailLog']:
        return list(cls.objects.filter(status=EmailStatus.PENDING.value).order_by('-created_at'))
    
    @classmethod
    def filter(cls, **filters) -> List['EmailLog']:
        return list(cls.objects.filter(**filters).order_by('-created_at'))
    
    @classmethod
    def delete_old_logs(cls, cutoff_date):
        """Delete logs older than cutoff_date"""
        return cls.objects.filter(created_at__lt=cutoff_date).delete()[0]
    
    def save(self, *args, **kwargs):
        """Save the log to database"""
        return super().save(*args, **kwargs)
    
    def delete(self, *args, **kwargs):
        """Delete the log from database"""
        return super().delete(*args, **kwargs)
    
    def update(self, **kwargs):
        """Update log fields"""
        for field, value in kwargs.items():
            setattr(self, field, value)
        self.save()
        return self


# Serializers
# Ensure REST framework is imported before defining serializers/viewsets
_ensure_rest_framework()

class EmailTemplateSerializer(serializers.ModelSerializer):
    """Serializer for EmailTemplate"""
    
    class Meta:
        model = EmailTemplate
        fields = '__all__'
        read_only_fields = ('id', 'created_at', 'updated_at')
    
    def validate_template_key(self, value):
        """Validate template key format"""
        if not value or len(value.strip()) == 0:
            raise serializers.ValidationError("Template key cannot be empty")
        return value.strip()
    
    def validate_language(self, value):
        """Validate language code"""
        if not value or len(value) < 2:
            raise serializers.ValidationError("Language code must be at least 2 characters")
        return value.lower()


class EmailLogSerializer(serializers.ModelSerializer):
    """Serializer for EmailLog"""
    
    class Meta:
        model = EmailLog
        fields = '__all__'
        read_only_fields = ('id', 'created_at', 'updated_at')
    
    def to_representation(self, instance):
        """Convert to representation with string values for status and priority"""
        data = super().to_representation(instance)
        # Ensure status and priority are returned as string values, not enum representations
        if hasattr(instance, 'status'):
            data['status'] = instance.status if isinstance(instance.status, str) else instance.status.value
        if hasattr(instance, 'priority'):
            data['priority'] = instance.priority if isinstance(instance.priority, str) else instance.priority.value
        return data


class SendEmailSerializer(serializers.Serializer):
    """Serializer for sending emails"""
    template_key = serializers.CharField(max_length=100)
    recipient_email = serializers.EmailField()
    recipient_emails = serializers.ListField(child=serializers.EmailField(), required=False, allow_empty=False)
    recipient_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    context = serializers.JSONField(default=dict)
    language = serializers.CharField(max_length=10, default='en')
    priority = serializers.ChoiceField(choices=[(p.value, p.value) for p in EmailPriority], default=EmailPriority.NORMAL.value)
    send_async = serializers.BooleanField(default=True)


# ViewSets
class EmailTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing email templates
    """
    queryset = EmailTemplate.objects.all()
    serializer_class = EmailTemplateSerializer
    filterset_fields = ['template_key', 'language', 'is_active']
    search_fields = ['template_key', 'name', 'subject']
    ordering_fields = ['created_at', 'updated_at', 'template_key']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter queryset based on query parameters"""
        queryset = super().get_queryset()
        
        # Filter by template_key if provided
        template_key = self.request.query_params.get('template_key')
        if template_key:
            queryset = queryset.filter(template_key=template_key)
        
        # Filter by language if provided
        language = self.request.query_params.get('language')
        if language:
            queryset = queryset.filter(language=language)
        
        # Filter by active status if provided
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """List templates with optional grouping and summary fields"""
        queryset = self.filter_queryset(self.get_queryset())
        group_by_key = request.query_params.get('group_by_key', 'false').lower() == 'true'
        summary = request.query_params.get('summary', 'false').lower() == 'true'
        summary_language = request.query_params.get('summary_language') or 'en'
        
        if group_by_key:
            # Evaluate queryset and group in memory
            items = list(queryset)
            grouped = {}
            for t in items:
                grouped.setdefault(t.template_key, []).append(t)
            
            selected = []
            lang_pref = (summary_language or 'en').lower()
            for key, variants in grouped.items():
                chosen = None
                for it in variants:
                    if (it.language or '').lower() == lang_pref:
                        chosen = it
                        break
                if not chosen:
                    chosen = max(variants, key=lambda x: x.updated_at or x.created_at)
                selected.append(chosen)
            
            page = self.paginate_queryset(selected)
            if page is not None:
                if summary:
                    data = [{
                        'template_key': obj.template_key,
                        'name': obj.name,
                        'subject': obj.subject,
                        'created_at': obj.created_at,
                        'updated_at': obj.updated_at,
                    } for obj in page]
                    return self.get_paginated_response(data)
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
            
            if summary:
                data = [{
                    'template_key': obj.template_key,
                    'name': obj.name,
                    'subject': obj.subject,
                    'created_at': obj.created_at,
                    'updated_at': obj.updated_at,
                } for obj in selected]
                return Response(data)
            serializer = self.get_serializer(selected, many=True)
            return Response(serializer.data)
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            if summary:
                data = [{
                    'template_key': obj.template_key,
                    'name': obj.name,
                    'subject': obj.subject,
                    'created_at': obj.created_at,
                    'updated_at': obj.updated_at,
                } for obj in page]
                return self.get_paginated_response(data)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        if summary:
            data = [{
                'template_key': obj.template_key,
                'name': obj.name,
                'subject': obj.subject,
                'created_at': obj.created_at,
                'updated_at': obj.updated_at,
            } for obj in queryset]
            return Response(data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a template by ID or by template_key + language via query params"""
        template_key = request.query_params.get('template_key')
        language = request.query_params.get('language')
        if template_key and language:
            obj = EmailTemplate.get_by_key_and_language(template_key, language)
            if not obj:
                return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
            serializer = self.get_serializer(obj)
            return Response(serializer.data)
        return super().retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        """Update a template by ID or by template_key + language via query params"""
        partial = kwargs.pop('partial', False)
        template_key = request.query_params.get('template_key')
        language = request.query_params.get('language')
        if template_key and language:
            instance = EmailTemplate.get_by_key_and_language(template_key, language)
            if not instance:
                return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data)
        return super().update(request, partial=partial, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Delete a template by ID or delete all templates by template_key via query param"""
        template_key = request.query_params.get('template_key')
        if template_key:
            qs = EmailTemplate.objects.filter(template_key=template_key)
            deleted_count, _ = qs.delete()
            if deleted_count == 0:
                return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
            return Response({'message': f"Deleted {deleted_count} templates for key '{template_key}'"}, status=status.HTTP_200_OK)
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=False, methods=['get'])
    def by_key(self, request):
        """Get all templates by template key"""
        template_key = request.query_params.get('template_key')
        if not template_key:
            return Response(
                {'error': 'template_key parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        templates = EmailTemplate.get_all_by_key(template_key)
        serializer = self.get_serializer(templates, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active templates"""
        templates = EmailTemplate.get_all_active()
        serializer = self.get_serializer(templates, many=True)
        return Response(serializer.data)


class EmailLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing email logs (read-only)
    """
    queryset = EmailLog.objects.all()
    serializer_class = EmailLogSerializer
    filterset_fields = ['template_key', 'recipient_email', 'status', 'priority']
    search_fields = ['recipient_email', 'recipient_name', 'subject']
    ordering_fields = ['created_at', 'sent_at']
    ordering = ['-created_at']
    
    @action(detail=False, methods=['get'])
    def by_recipient(self, request):
        """Get logs by recipient email"""
        email = request.query_params.get('email')
        if not email:
            return Response(
                {'error': 'email parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        logs = EmailLog.get_by_recipient(email)
        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_status(self, request):
        """Get logs by status"""
        status_param = request.query_params.get('status')
        if not status_param:
            return Response(
                {'error': 'status parameter is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            email_status = EmailStatus(status_param)
            logs = EmailLog.get_by_status(email_status)
            serializer = self.get_serializer(logs, many=True)
            return Response(serializer.data)
        except ValueError:
            return Response(
                {'error': 'Invalid status value'}, 
                status=status.HTTP_400_BAD_REQUEST
            )


class EmailServiceViewSet(viewsets.ViewSet):
    """
    ViewSet for email service operations
    """
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.email_service = None
    
    def _get_email_service(self):
        """Get or initialize email service"""
        if not self.email_service:
            # Prefer Django settings if present
            config = EmailConfig.from_django_settings() or EmailConfig.from_env()
            initialize_celery(config, EmailTemplate, EmailLog)
            from ..tasks.email_tasks import email_service
            self.email_service = email_service
        return self.email_service
    
    @action(detail=False, methods=['post'])
    def send_email(self, request):
        """Send email using template"""
        serializer = SendEmailSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            email_service = self._get_email_service()
            data = serializer.validated_data
            
            result: SendResult = email_service.send_email(
                template_key=data['template_key'],
                recipient_email=data['recipient_email'],
                recipient_emails=data.get('recipient_emails'),
                context=data['context'],
                language=data['language'],
                recipient_name=data.get('recipient_name'),
                priority=EmailPriority(data['priority']),
                send_async=data.get('send_async'),
            )

            if result.queued:
                return Response({
                    'status': 'queued',
                    'task_id': result.task_id,
                    'message': 'Email queued for sending'
                })

            if result.success:
                return Response({
                    'status': 'sent',
                    'message': 'Email sent successfully'
                })

            return Response({
                'status': 'failed',
                'message': 'Failed to send email'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                    
        except Exception as e:
            logger.error(f"Error sending email: {e}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def retry_failed_emails(self, request):
        """Retry failed emails"""
        try:
            email_service = self._get_email_service()
            max_retries = request.data.get('max_retries', 3)
            retry_count = email_service.retry_failed_emails(max_retries)
            
            return Response({
                'status': 'success',
                'message': f'Retried {retry_count} failed emails',
                'retry_count': retry_count
            })
        except Exception as e:
            logger.error(f"Error retrying failed emails: {e}")
            return Response({
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MailerDjangoAdapter:
    """
    Django adapter for DFA Mailer Service
    """
    
    def __init__(self, config: Optional[EmailConfig] = None):
        """
        Initialize Django adapter
        
        Args:
            config: Email configuration (optional, will use env vars if not provided)
        """
        self.config = config or EmailConfig.from_env()
        self.email_service = None
        self._initialize()
    
    def _initialize(self):
        """Initialize email service and Celery"""
        # Prefer Django settings if provided, then fallback to explicit config, then env
        config_from_settings = EmailConfig.from_django_settings()
        effective_config = config_from_settings or self.config or EmailConfig.from_env()
        initialize_celery(effective_config, EmailTemplate, EmailLog)
        from ..tasks.email_tasks import email_service
        self.email_service = email_service
    
    def get_email_service(self) -> EmailService:
        """Get email service instance"""
        return self.email_service
    
    def get_models(self):
        """Get Django models"""
        return {
            'EmailTemplate': EmailTemplate,
            'EmailLog': EmailLog
        }
    
    def get_serializers(self):
        """Get Django serializers"""
        return {
            'EmailTemplateSerializer': EmailTemplateSerializer,
            'EmailLogSerializer': EmailLogSerializer,
            'SendEmailSerializer': SendEmailSerializer
        }
    
    def get_viewsets(self):
        """Get Django ViewSets"""
        return {
            'EmailTemplateViewSet': EmailTemplateViewSet,
            'EmailLogViewSet': EmailLogViewSet,
            'EmailServiceViewSet': EmailServiceViewSet
        }
    
    def get_urls(self):
        """Get Django URL patterns"""
        from rest_framework.routers import DefaultRouter
        
        router = DefaultRouter()
        router.register(r'templates', EmailTemplateViewSet, basename='email-template')
        router.register(r'logs', EmailLogViewSet, basename='email-log')
        router.register(r'service', EmailServiceViewSet, basename='email-service')
        
        # Determine API prefix and pagination from config or settings
        cfg = EmailConfig.from_django_settings() or self.config or EmailConfig.from_env()

        # Configure pagination class dynamically on viewsets
        if cfg.pagination_type == 'page':
            class AdapterPagination(PageNumberPagination):
                page_size = cfg.page_size
                page_size_query_param = 'page_size'
        else:
            class AdapterPagination(LimitOffsetPagination):
                default_limit = cfg.page_size
                limit_query_param = 'limit'
                offset_query_param = 'offset'

        EmailTemplateViewSet.pagination_class = AdapterPagination
        EmailLogViewSet.pagination_class = AdapterPagination
        prefix = cfg.api_prefix.strip('/') + '/'
        return [
            path(prefix, include(router.urls)),
        ]
    
    def run_migrations(self):
        """Run Django migrations"""
        from django.core.management import execute_from_command_line
        execute_from_command_line(['manage.py', 'makemigrations', 'dfa_mailer_service'])
        execute_from_command_line(['manage.py', 'migrate'])


# Module-level convenience function for easy access
_email_service_instance = None

def get_email_service():
    """
    Get or initialize the email service instance.
    Uses Django adapter from dfa_mailer_service.
    
    This function automatically:
    - Loads config from EMAIL_SERVICE_CONFIG in Django settings (if present)
    - Falls back to environment variables if Django config is not available
    - Initializes Celery if job_worker is configured
    - Returns a singleton EmailService instance
    
    Usage:
        from dfa_mailer_service.adapters.django_adapter import get_email_service
        
        email_service = get_email_service()
        result = email_service.send_email(
            template_key="welcome",
            recipient_email="user@example.com",
            context={"user_name": "John"}
        )
    """
    global _email_service_instance
    
    if _email_service_instance is None:
        try:
            adapter = MailerDjangoAdapter()
            _email_service_instance = adapter.get_email_service()
            logger.info("Email service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize email service: {e}")
            raise
    
    return _email_service_instance