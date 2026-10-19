"""
Alter EmailTemplate.template_key to remove unique constraint (keep unique_together on (template_key, language))
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    """Remove single-column unique on template_key in favor of composite uniqueness"""

    dependencies = [
        ('dfa_mailer_service', '0002_add_created_by'),
    ]

    operations = [
        migrations.AlterField(
            model_name='emailtemplate',
            name='template_key',
            field=models.CharField(max_length=100, help_text='Unique identifier for the template'),
        ),
    ]


