# Database Setup Guide for DFA Help Service

This guide explains how to create the necessary database tables in your hosting application.

## 🗄️ **Table Creation Methods**

### **Method 1: Django Migrations (Recommended)**

1. **Ensure models are imported in your Django app:**
```python
# In your Django app's __init__.py or models.py
from dfa_help_service.adapters.django.models import Adaptation, AdaptationKey, AdaptationKeyI18n
```

2. **Create and run migrations:**
```bash
python manage.py makemigrations
python manage.py migrate
```

### **Method 2: Manual SQL Script**

1. **Run the provided SQL script:**
```bash
# MySQL/MariaDB
mysql -u username -p database_name < dfa_help_service/migrations/create_tables.sql

# PostgreSQL (convert script as needed)
psql -U username -d database_name -f dfa_help_service/migrations/create_tables.sql
```

2. **Or copy-paste the SQL commands into your database management tool**

### **Method 3: Django Management Command**

Create a custom management command in your Django app:

```python
# management/commands/setup_dfa_help.py
from django.core.management.base import BaseCommand
from django.db import connection

class Command(BaseCommand):
    help = 'Setup DFA Help Service database tables'

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            # Run the SQL script
            sql_file = 'dfa_help_service/migrations/create_tables.sql'
            with open(sql_file, 'r') as f:
                sql = f.read()
                cursor.execute(sql)
        
        self.stdout.write(
            self.style.SUCCESS('Successfully created DFA Help Service tables')
        )
```

Then run:
```bash
python manage.py setup_dfa_help
```

## 📋 **Required Tables (with "dfahelp_" prefix)**

### **1. `dfahelp_adaptations` Table**
- Stores adaptation information
- Primary key: `id` (BIGINT, AUTO_INCREMENT)
- Unique constraint: `code` (VARCHAR(4))
- **Table name**: `dfahelp_adaptations` (prefixed to avoid conflicts)

### **2. `dfahelp_adaptation_keys` Table**
- Stores key information for each adaptation
- Foreign key to `dfahelp_adaptations.id`
- Supports hierarchical structure with `parent_id`
- **Table name**: `dfahelp_adaptation_keys` (prefixed to avoid conflicts)

### **3. `dfahelp_adaptation_keys_i18n` Table**
- Stores internationalized content for keys
- Foreign key to `dfahelp_adaptation_keys.id`
- Unique constraint on `(adaptation_key_id, locale)`
- **Table name**: `dfahelp_adaptation_keys_i18n` (prefixed to avoid conflicts)

## 🔧 **Database Configuration**

### **MySQL/MariaDB**
```python
# settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'your_database',
        'USER': 'your_username',
        'PASSWORD': 'your_password',
        'HOST': 'localhost',
        'PORT': '3306',
        'OPTIONS': {
            'charset': 'utf8mb4',
        },
    }
}
```

### **PostgreSQL**
```python
# settings.py
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'your_database',
        'USER': 'your_username',
        'PASSWORD': 'your_password',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

## 📊 **Sample Data**

The migration script includes sample data:
- **Adaptation**: BYD - DFA Dashboard
- **Key**: sample_key with code SAMPLE_CODE
- **I18n**: English title and description

## 🔍 **Verification**

After table creation, verify with:

```sql
-- Check tables exist (with dfahelp_ prefix)
SHOW TABLES LIKE 'dfahelp_%';

-- Check sample data
SELECT * FROM dfahelp_adaptations;
SELECT * FROM dfahelp_adaptation_keys;
SELECT * FROM dfahelp_adaptation_keys_i18n;

-- Check foreign key constraints
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME LIKE 'dfahelp_%';
```

## 🚨 **Important Notes**

1. **Backup your database** before running migrations
2. **Test in development** before production
3. **Ensure proper permissions** for table creation
4. **Check character encoding** (recommended: utf8mb4)
5. **Verify foreign key constraints** are properly set
6. **Table prefix "dfahelp_"** prevents conflicts with existing hosting application tables

## 🆘 **Troubleshooting**

### **Common Issues:**

1. **Permission Denied**: Ensure database user has CREATE privileges
2. **Foreign Key Errors**: Check if referenced tables exist
3. **Character Encoding**: Ensure utf8mb4 support for full Unicode
4. **Index Creation**: Some databases may require explicit index creation
5. **Table Name Conflicts**: The "dfahelp_" prefix should prevent conflicts with existing tables

### **Support:**
- Check Django logs for migration errors
- Verify database connection settings
- Ensure all required dependencies are installed
- Confirm table names use the "dfahelp_" prefix
