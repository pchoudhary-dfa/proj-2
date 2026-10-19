"""
Add created_by JSONField to EmailTemplate
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    """Add created_by field to EmailTemplate"""

    dependencies = [
        ('dfa_mailer_service', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailtemplate',
            name='created_by',
            field=models.JSONField(default=dict, null=True, blank=True, help_text='Metadata about the creator (JSON)'),
        ),
    ]


