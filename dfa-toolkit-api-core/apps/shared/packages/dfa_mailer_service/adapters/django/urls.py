from django.urls import path, include
from rest_framework.routers import DefaultRouter

from ..django_adapter import EmailTemplateViewSet, EmailLogViewSet, EmailServiceViewSet


router = DefaultRouter()
router.register(r"templates", EmailTemplateViewSet, basename="dfa-email-template")
router.register(r"logs", EmailLogViewSet, basename="dfa-email-log")
router.register(r"service", EmailServiceViewSet, basename="dfa-email-service")

urlpatterns = [
    path("", include(router.urls)),
]


