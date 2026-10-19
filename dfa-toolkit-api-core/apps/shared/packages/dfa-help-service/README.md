# DFA Help Service

A framework-agnostic Python package for managing adaptations and keys with multi-language support.

## 🏗️ **Package Architecture**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DFA Help Service Package                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │   Core Layer    │    │  Storage Layer  │    │      API Layer          │  │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────────────┐ │  │
│  │ │   Models    │ │    │ │   Memory    │ │    │ │   FastAPI Routes    │ │  │
│  │ │             │ │    │ │   Storage   │ │    │ │                     │ │  │
│  │ │ • Adaptation│ │    │ │ • In-Memory │ │    │ │ • /api/adaptations  │ │  │
│  │ │ • Keys      │ │    │ │ • Sample    │ │    │ │ • /api/keys/{id}    │ │  │
│  │ │ • I18n      │ │    │ │   Data      │ │    │ │ • /api/create       │ │  │
│  │ └─────────────┘ │    │ │             │ │    │ │ • /api/update/{id}  │ │  │
│  │                 │    │ └─────────────┘ │    │ │ • /api/delete/{id}  │ │  │
│  │ ┌─────────────┐ │    │                 │    │ └─────────────────────┘ │  │
│  │ │  Services   │ │    │ ┌─────────────┐ │    │ ┌─────────────────────┐ │  │
│  │ │ • Help      │ │    │ │   Storage   │ │    │ │   Django Views      │ │  │
│  │ │   Service   │ │    │ │             │ │    │ │                     │ │  │
│  │ │ • CRUD      │ │    │ │ • MySQL     │ │    │ │ • AdaptationsView   │ │  │
│  │ │ • Business  │ │    │ │ • PostgreSQL│ │    │ │ • KeysView          │ │  │
│  │ │   Logic     │ │    │ │ • MariaDB   │ │    │ │ • CreateKeyView     │ │  │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ │ • UpdateKeyView     │ │  │
│  │                 │    │                 │    │ │ • DeleteKeyView     │ │  │
│  │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ └─────────────────────┘ │  │
│  │ │   Utils     │ │    │ │    Cache    │ │    │ ┌─────────────────────┐ │  │
│  │ │ • Validation│ │    │ │             │ │    │ │   Flask Blueprint   │ │  │
│  │ │ • Formatting│ │    │ │ • Redis     │ │    │ │                     │ │  │
│  │ │ • Helpers   │ │    │ │ • In-Memory │ │    │ │ • /api/adaptations  │ │  │
│  │ └─────────────┘ │    │ └─────────────┘ │    │ │ • /api/keys/{id}    │ │  │
│  └─────────────────┘    └─────────────────┘    │ │ • /api/create       │ │  │
│                                                │ │ • /api/update/{id}  │ │  │
│  ┌─────────────────────────────────────────────┐ │ • /api/delete/{id}  │ │  │
│  │              Framework Adapters             │ └─────────────────────┘ │  │
│  │                                             │                            │
│  │ ┌────────────┐  ┌─────────────┐  ┌────────┐ │                            │
│  │ │   Django   │  │   FastAPI   │  │Flask   │ │                            │
│  │ │  Adapter   │  │   Adapter   │  │Adapter │ │                            │
│  │ │            │  │             │  │        │ │                            │
│  │ │ • Models   │  │ • Router    │  │• BP    │ │                            │
│  │ │ • Views    │  │ • Endpoints │  │• Routes│ │                            │
│  │ │ • URLs     │  │ • Schemas   │  │        │ │                            │
│  │ └────────────┘  └─────────────┘  └────────┘ │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        Database Layer                                  │ │
│  │                                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │ │
│  │  │ dfahelp_    │  │ dfahelp_    │  │ dfahelp_    │                     │ │
│  │  │adaptations  │  │adaptation_  │  │adaptation_  │                     │ │
│  │  │             │  │keys         │  │keys_i18n    │                     │ │
│  │  │ • id        │  │ • id        │  │ • id        │                     │ │
│  │  │ • code      │  │ • adaptation│  │ • key_id    │                     │ │
│  │  │ • name      │  │   _id       │  │ • locale    │                     │ │
│  │  │ • desc      │  │ • key       │  │ • title     │                     │ │
│  │  │ • timestamps│  │ • code      │  │ • desc      │                     │ │
│  │  └─────────────┘  │ • parent_id │  │ • purpose   │                     │ │
│  │                   │ • timestamps│  └─────────────┘                     │ │
│  │                   └─────────────┘                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### **Architecture Components:**

#### **🔧 Core Layer**
- **Models**: Pydantic data models for validation
- **Services**: Business logic and CRUD operations
- **Utils**: Helper functions and utilities

#### **💾 Storage Layer**
- **Memory Storage**: In-memory storage with sample data
- **Database Storage**: MySQL, PostgreSQL, MariaDB support
- **Cache Storage**: Redis and in-memory caching

#### **🌐 API Layer**
- **FastAPI Routes**: RESTful API endpoints
- **Django Views**: Django-specific view classes
- **Flask Blueprint**: Flask integration

#### **🔌 Framework Adapters**
- **Django**: Models, views, URL patterns
- **FastAPI**: Router, endpoints, schemas
- **Flask**: Blueprint, routes, handlers

#### **🗄️ Database Layer**
- **dfahelp_adaptations**: Core adaptation data
- **dfahelp_adaptation_keys**: Key information
- **dfahelp_adaptation_keys_i18n**: Multi-language content

### **Data Flow:**
1. **Request** → Framework Adapter
2. **Adapter** → API Layer
3. **API** → Core Services
4. **Services** → Storage Backend
5. **Storage** → Database/File System
6. **Response** → Client

### **Key Features:**
- ✅ **Framework Agnostic**: Works with Django, FastAPI, Flask
- ✅ **Multi-Storage**: Memory, Database, Cache backends
- ✅ **Multi-Language**: i18n support for 6 languages
- ✅ **Conflict-Free**: "dfahelp_" prefix prevents table conflicts
- ✅ **Extensible**: Easy to add new storage backends
- ✅ **Production Ready**: Comprehensive error handling and logging

## Features

- 🌍 **Multi-language Support**: English, French, Spanish, Arabic, Portuguese, and Russian
- 🔌 **Framework Agnostic**: Works with Django, FastAPI, Flask, or any Python framework
- 🗄️ **Flexible Storage**: Multiple storage backends (memory, database, cache)
- 🗃️ **Database Support**: MySQL, PostgreSQL, and MariaDB
- 📊 **Content Management**: Manage adaptations, keys, and internationalized content
- 🚀 **Easy Integration**: Simple installation and configuration
- 📡 **Standardized API**: Consistent response format with data, message, status, and success fields

## Quick Start

### Installation

```bash
# Install from Git repository
pip install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git

# Or install in development mode
pip install -e /path/to/dfa-help-service

# Or install with specific version
pip install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git@v2.0.0
```

### Basic Usage

```python
from dfa_help_service.core.services import HelpService
from dfa_help_service.storage.memory import MemoryStorage

# Initialize service
storage = MemoryStorage()
help_service = HelpService(storage=storage)

# Get all adaptations
adaptations = help_service.get_adaptations()

# Create a new key
payload = {
    'adaptation_id': 1,
    'parent_id': 1,
    'title': "Sample Key Title"
}
key = help_service.create_key(payload)
```

## Framework Integration

### Django

```python
# settings.py
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'dfa_help_service.adapters.django',  # Add this line
]

# urls.py
urlpatterns = [
    path('help/', include('dfa_help_service.adapters.django.urls')),
]
```

### FastAPI

```python
from fastapi import FastAPI
from dfa_help_service.adapters.fastapi import DFAHelpService

app = FastAPI()
help_service = DFAHelpService(app)
app.include_router(help_service.router, prefix="/help")
```

### Flask

```python
from flask import Flask
from dfa_help_service.adapters.flask import DFAHelpService

app = Flask(__name__)
help_service = DFAHelpService(app)
app.register_blueprint(help_service.blueprint, url_prefix='/help')
```

## Django Integration Guide

**Important Note**: This package must be added to `INSTALLED_APPS` in your Django settings to work properly. It is designed as a Django app that provides API endpoints.

### 1. **Installation in Django Project**
```bash
# From your Django project directory
pip install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git

# Or install in development mode
pip install -e /path/to/dfa-help-service
```

### 2. **Add to Django Settings**
```python
# settings.py
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'dfa_help_service.adapters.django',  # Add this line
]

# Optional: Add configuration
DFA_HELP_SERVICE = {
    'ENABLED': True,
    'STORAGE_BACKEND': 'memory',  # or 'database' when implemented
}
```

### 3. **Include URLs in Django**
```python
# urls.py
from django.urls import include, path

urlpatterns = [
    # ... other URL patterns
    path('help/', include('dfa_help_service.adapters.django.urls')),
]
```

## API Usage Examples

### **Available Endpoints:**
- `GET /help/adaptations/` - Get all adaptations
- `GET /help/keys/{adaptation_id}/` - Get keys for adaptation
- `GET /help/keydata/{key_id}/` - Get detailed key data
- `POST /help/create/` - Create new key
- `PUT /help/update/{key_id}/` - Update key
- `DELETE /help/delete/{key_id}/` - Delete key

### **Example API Calls:**

#### **Get All Adaptations:**
```bash
curl http://localhost:8000/help/adaptations/
```

**Response:**
```json
{
    "data": [
        {
            "id": 1,
            "code": "BYD",
            "name": "DFA Dashboard",
            "desc": "This is the description of DFA Monitoring."
        }
    ],
    "message": "Adaptations retrieved successfully",
    "status": 200,
    "success": true
}
```

#### **Create a New Key:**
```bash
curl -X POST http://localhost:8000/help/create/ \
  -H "Content-Type: application/json" \
  -d '{
    "adaptation_id": 1,
    "parent_id": null,
    "title": "New Key Title"
  }'
```

#### **Update a Key:**
```bash
curl -X PUT http://localhost:8000/help/update/1/ \
  -H "Content-Type: application/json" \
  -d '{
    "code": "UPDATED_CODE",
    "title": "Updated Title",
    "lang": "en",
    "desc": "Updated description"
  }'
```

## Using in Django Views

### **Direct Service Usage:**
```python
# views.py
from dfa_help_service.core.services import HelpService
from dfa_help_service.storage.memory import MemoryStorage

def my_view(request):
    # Initialize service
    storage = MemoryStorage()
    storage.connect()
    help_service = HelpService(storage)
    
    # Get adaptations
    adaptations = help_service.get_adaptations()
    
    # Create key
    new_key = help_service.create_key({
        'adaptation_id': 1,
        'title': 'My Key'
    })
    
    return JsonResponse({'adaptations': len(adaptations)})
```

### **Using Django Adapter:**
```python
# views.py
from dfa_help_service.adapters.django import DjangoAdapter

def my_view(request):
    adapter = DjangoAdapter()
    help_service = adapter.get_help_service()
    
    # Use the service
    adaptations = help_service.get_adaptations()
    return JsonResponse({'count': len(adaptations)})
```

## Database Integration (Future)

When database storage is implemented:
```python
# settings.py
DFA_HELP_SERVICE = {
    'STORAGE_BACKEND': 'database',
    'DATABASE_URL': 'mysql://user:pass@localhost/dbname',
    'DATABASE_TYPE': 'mysql',  # or 'postgresql', 'mariadb'
}
```

## Testing the Installation

1. **Start Django server:**
```bash
python manage.py runserver
```

2. **Test health endpoint:**
```bash
curl http://localhost:8000/help/health/
```

3. **Check available endpoints:**
```bash
curl http://localhost:8000/help/adaptations/
```

The package will automatically create sample data in memory storage, so you can test the APIs immediately after installation!

## API Endpoints

- `GET /adaptations` - Get all adaptations
- `GET /keys/{adaptation_id}` - Get all keys of the selected adaptation
- `GET /keydata/{key_id}` - Get details of the selected key
- `POST /create` - Create a new key
- `PUT /update/{key_id}` - Update selected key data
- `DELETE /delete/{key_id}` - Delete the selected key

All API responses follow a standardized format:
```json
{
    "data": {...},
    "message": "Operation message",
    "status": 200,
    "success": true
}
```

## Database Schema

The package includes three main tables with "dfahelp_" prefix to avoid conflicts:

- **`dfahelp_adaptations`** - Stores adaptation information
- **`dfahelp_adaptation_keys`** - Stores key information
- **`dfahelp_adaptation_keys_i18n`** - Stores internationalized content

## Database Setup

### **Table Creation Methods:**

1. **Django Migrations (Recommended):**
```bash
python manage.py makemigrations
python manage.py migrate
```

2. **Manual SQL Script:**
```bash
# Run the provided SQL script
mysql -u username -p database_name < dfa_help_service/migrations/create_tables.sql
```

3. **Custom Management Command:**
```bash
python manage.py setup_dfa_help
```

### **Supported Databases:**
- MySQL
- PostgreSQL  
- MariaDB

### **Table Naming Convention:**
All tables use the "dfahelp_" prefix to prevent conflicts with existing hosting application tables.

For detailed database setup instructions, see [docs/database-setup.md](docs/database-setup.md).

## Troubleshooting

### **Django Import Errors**
If you get Django startup errors like "Apps aren't loaded yet" or "ModuleNotFoundError", make sure:
1. The package is properly added to `INSTALLED_APPS`
2. You're not importing Django models at module level in your code
3. The package is installed in your Django environment

### **Package Not Working**
If the package doesn't work after adding to `INSTALLED_APPS`:
1. Check that the package is properly installed
2. Verify the URL patterns are included in your `urls.py`
3. Ensure Django can import the package without errors

### **Common Solutions**
- **Always add to INSTALLED_APPS**: This package is designed as a Django app
- **Include URLs properly**: Use `path('help/', include('dfa_help_service.adapters.django.urls'))`
- **Check package installation**: Ensure the package is installed in your Django environment

## Development

```bash
# Clone repository
git clone https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git
cd dfa-help-service

# Install in development mode
pip install -e .[dev]

# Run tests
python -m pytest

# Run linting
black dfa_help_service/
flake8 dfa_help_service/
```

## Documentation

For detailed documentation, see [docs/dfa-help-service.md](docs/dfa-help-service.md).

## License

[To be defined]

## Support

- Repository: https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git
- Issues: [Link to issue tracker]
- Email: [Support email]
