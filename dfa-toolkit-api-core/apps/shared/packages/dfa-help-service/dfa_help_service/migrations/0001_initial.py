"""
Initial migration for DFA Help Service tables.

This migration creates the following tables:
- dfahelp_adaptations
- dfahelp_adaptation_keys  
- dfahelp_adaptation_keys_i18n
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Adaptation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=4, unique=True, verbose_name='Unique adaptation code')),
                ('name', models.CharField(max_length=255, verbose_name='Adaptation name')),
                ('desc', models.TextField(verbose_name='Adaptation description')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Creation timestamp')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last update timestamp')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deletion timestamp')),
            ],
            options={
                'verbose_name': 'Help Adaptation',
                'verbose_name_plural': 'Help Adaptations',
                'db_table': 'dfahelp_adaptations',
            },
        ),
        migrations.CreateModel(
            name='AdaptationKey',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(blank=True, max_length=255, null=True, unique=True, verbose_name='Unique key identifier')),
                ('code', models.CharField(blank=True, max_length=255, null=True, verbose_name='Key code')),
                ('related_keys', models.TextField(blank=True, null=True, verbose_name='Related keys as JSON string')),
                ('parent_id', models.BigIntegerField(blank=True, null=True, verbose_name='Parent key reference')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Creation timestamp')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last update timestamp')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deletion timestamp')),
                ('adaptation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='dfa_help_service.adaptation', verbose_name='Reference to adaptation')),
            ],
            options={
                'verbose_name': 'Help Adaptation Key',
                'verbose_name_plural': 'Help Adaptation Keys',
                'db_table': 'dfahelp_adaptation_keys',
            },
        ),
        migrations.CreateModel(
            name='AdaptationKeyI18n',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('locale', models.CharField(max_length=3, verbose_name='Language locale code')),
                ('title', models.CharField(blank=True, max_length=255, null=True, verbose_name='Localized title')),
                ('desc', models.TextField(blank=True, null=True, verbose_name='Localized description')),
                ('purpose', models.TextField(blank=True, null=True, verbose_name='Localized purpose')),
                ('adaptation_key', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='dfa_help_service.adaptationkey', verbose_name='Reference to adaptation key')),
            ],
            options={
                'verbose_name': 'Help Adaptation Key I18n',
                'verbose_name_plural': 'Help Adaptation Keys I18n',
                'db_table': 'dfahelp_adaptation_keys_i18n',
            },
        ),
        migrations.AddIndex(
            model_name='adaptation',
            index=models.Index(fields=['code'], name='dfahelp_adaptations_code_idx'),
        ),
        migrations.AddIndex(
            model_name='adaptationkey',
            index=models.Index(fields=['adaptation_id'], name='dfahelp_adaptation_keys_adaptation_id_idx'),
        ),
        migrations.AddIndex(
            model_name='adaptationkey',
            index=models.Index(fields=['parent_id'], name='dfahelp_adaptation_keys_parent_id_idx'),
        ),
        migrations.AddIndex(
            model_name='adaptationkeyi18n',
            index=models.Index(fields=['adaptation_key_id', 'locale'], name='dfahelp_adaptation_keys_i18n_key_locale_idx'),
        ),
    ]
