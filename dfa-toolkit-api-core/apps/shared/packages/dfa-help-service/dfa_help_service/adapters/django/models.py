"""
Django models for DFA Help Service.

These models will be used by the hosting application to create the database tables.
"""

from django.db import models
from django.utils import timezone


class Adaptation(models.Model):
    """Model for dfahelp_adaptations table."""
    
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=4, unique=True, verbose_name="Unique adaptation code")
    name = models.CharField(max_length=255, verbose_name="Adaptation name")
    desc = models.TextField(verbose_name="Adaptation description")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Creation timestamp")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Last update timestamp")
    deleted_at = models.DateTimeField(null=True, blank=True, verbose_name="Deletion timestamp")

    class Meta:
        db_table = 'dfahelp_adaptations'
        verbose_name = 'Help Adaptation'
        verbose_name_plural = 'Help Adaptations'
        indexes = [
            models.Index(fields=['code'], name='dfahelp_adaptations_code_idx'),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"

    def soft_delete(self):
        """Soft delete the adaptation."""
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at'])


class AdaptationKey(models.Model):
    """Model for dfahelp_adaptation_keys table."""
    
    id = models.BigAutoField(primary_key=True)
    adaptation = models.ForeignKey(
        Adaptation, 
        on_delete=models.CASCADE, 
        verbose_name="Reference to adaptation"
    )
    key = models.CharField(
        max_length=255, 
        null=True, 
        blank=True, 
        unique=True, 
        verbose_name="Unique key identifier"
    )
    code = models.CharField(
        max_length=255, 
        null=True, 
        blank=True, 
        verbose_name="Key code"
    )
    related_keys = models.TextField(
        null=True, 
        blank=True, 
        verbose_name="Related keys as JSON string"
    )
    parent_id = models.BigIntegerField(
        null=True, 
        blank=True, 
        verbose_name="Parent key reference"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Creation timestamp")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Last update timestamp")
    deleted_at = models.DateTimeField(null=True, blank=True, verbose_name="Deletion timestamp")

    class Meta:
        db_table = 'dfahelp_adaptation_keys'
        verbose_name = 'Help Adaptation Key'
        verbose_name_plural = 'Help Adaptation Keys'
        indexes = [
            models.Index(fields=['adaptation_id'], name='dfahelp_adaptation_keys_adaptation_id_idx'),
            models.Index(fields=['parent_id'], name='dfahelp_adaptation_keys_parent_id_idx'),
        ]

    def __str__(self):
        return f"{self.key or self.code} - {self.adaptation.code}"

    def soft_delete(self):
        """Soft delete the adaptation key."""
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at'])


class AdaptationKeyI18n(models.Model):
    """Model for dfahelp_adaptation_keys_i18n table."""
    
    id = models.BigAutoField(primary_key=True)
    adaptation_key = models.ForeignKey(
        AdaptationKey, 
        on_delete=models.CASCADE, 
        verbose_name="Reference to adaptation key"
    )
    locale = models.CharField(max_length=3, verbose_name="Language locale code")
    title = models.CharField(
        max_length=255, 
        null=True, 
        blank=True, 
        verbose_name="Localized title"
    )
    desc = models.TextField(
        null=True, 
        blank=True, 
        verbose_name="Localized description"
    )
    purpose = models.TextField(
        null=True, 
        blank=True, 
        verbose_name="Localized purpose"
    )

    class Meta:
        db_table = 'dfahelp_adaptation_keys_i18n'
        verbose_name = 'Help Adaptation Key I18n'
        verbose_name_plural = 'Help Adaptation Keys I18n'
        indexes = [
            models.Index(
                fields=['adaptation_key_id', 'locale'], 
                name='dfahelp_adaptation_keys_i18n_key_locale_idx'
            ),
        ]
        unique_together = ['adaptation_key', 'locale']

    def __str__(self):
        return f"{self.adaptation_key.key} - {self.locale} - {self.title}"
