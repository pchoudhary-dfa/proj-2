"""
Initial migration for DFA Mailer Service
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """Initial migration for DFA Mailer Service tables"""
    
    initial = True
    
    dependencies = []
    
    operations = [
        migrations.CreateModel(
            name='EmailTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('template_key', models.CharField(max_length=100, unique=True, help_text='Unique identifier for the template')),
                ('language', models.CharField(max_length=10, default='en', help_text='Language code (e.g., en, es, fr)')),
                ('name', models.CharField(max_length=200, help_text='Human-readable name for the template')),
                ('subject', models.CharField(max_length=500, help_text='Email subject line')),
                ('html_content', models.TextField(help_text='HTML content of the email')),
                ('text_content', models.TextField(blank=True, null=True, help_text='Plain text content of the email')),
                ('is_active', models.BooleanField(default=True, help_text='Whether the template is active')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Email Template',
                'verbose_name_plural': 'Email Templates',
                'db_table': 'dfa_email_templates',
                'unique_together': {('template_key', 'language')},
                'indexes': [
                    models.Index(fields=['template_key'], name='dfa_email_templates_key_idx'),
                    models.Index(fields=['language'], name='dfa_email_templates_lang_idx'),
                    models.Index(fields=['is_active'], name='dfa_email_templates_active_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='EmailLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('template_key', models.CharField(max_length=100, help_text='Template key used for this email')),
                ('recipient_email', models.EmailField(max_length=254, help_text='Recipient email address')),
                ('recipient_name', models.CharField(blank=True, max_length=200, null=True, help_text='Recipient name')),
                ('subject', models.CharField(max_length=500, help_text='Email subject line')),
                ('html_content', models.TextField(help_text='HTML content of the email')),
                ('text_content', models.TextField(blank=True, null=True, help_text='Plain text content of the email')),
                ('context', models.JSONField(default=dict, help_text='Context data used for template rendering')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('sent', 'Sent'), ('failed', 'Failed'), ('retrying', 'Retrying')], default='pending', max_length=20)),
                ('priority', models.CharField(choices=[('low', 'Low'), ('normal', 'Normal'), ('high', 'High'), ('urgent', 'Urgent')], default='normal', max_length=20)),
                ('sent_at', models.DateTimeField(blank=True, null=True, help_text='When the email was sent')),
                ('error_message', models.TextField(blank=True, null=True, help_text='Error message if sending failed')),
                ('retry_count', models.IntegerField(default=0, help_text='Number of retry attempts')),
                ('max_retries', models.IntegerField(default=3, help_text='Maximum number of retry attempts')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Email Log',
                'verbose_name_plural': 'Email Logs',
                'db_table': 'dfa_email_logs',
                'indexes': [
                    models.Index(fields=['template_key'], name='dfa_email_logs_template_idx'),
                    models.Index(fields=['recipient_email'], name='dfa_email_logs_recipient_idx'),
                    models.Index(fields=['status'], name='dfa_email_logs_status_idx'),
                    models.Index(fields=['created_at'], name='dfa_email_logs_created_idx'),
                    models.Index(fields=['sent_at'], name='dfa_email_logs_sent_idx'),
                ],
            },
        ),
    ]
