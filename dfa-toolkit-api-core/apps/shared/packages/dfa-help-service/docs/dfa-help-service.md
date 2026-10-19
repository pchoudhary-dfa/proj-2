# DFA Help Service Package

## Overview
The DFA Help Service is a Python package designed to be installed and integrated into any Python application or framework. This package provides help and assistance functionality that can be used with Django, FastAPI, Flask, or any other Python web framework.

**Repository**: https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git

## Package Structure
```
dfa-help-service/
├── setup.py                 # Package setup and configuration
├── README.md               # Package readme
├── requirements.txt        # Package dependencies
├── dfa_help_service/      # Main package directory
│   ├── __init__.py        # Package initialization
│   ├── core/              # Core functionality
│   │   ├── __init__.py
│   │   ├── models.py      # Data models and schemas
│   │   ├── services.py    # Business logic services
│   │   └── utils.py       # Utility functions
│   ├── adapters/          # Framework-specific adapters
│   │   ├── __init__.py
│   │   ├── django.py      # Django integration
│   │   ├── fastapi.py     # FastAPI integration
│   │   ├── flask.py       # Flask integration
│   │   └── base.py        # Base adapter interface
│   ├── api/               # API layer
│   │   ├── __init__.py
│   │   ├── routes.py      # API route definitions
│   │   ├── schemas.py     # Pydantic schemas
│   │   └── middleware.py  # API middleware
│   ├── storage/           # Storage backends
│   │   ├── __init__.py
│   │   ├── memory.py      # In-memory storage
│   │   ├── database.py    # Database storage
│   │   └── cache.py       # Cache storage
│   ├── templates/         # HTML templates (optional)
│   │   └── dfa_help_service/
│   ├── static/            # Static files (optional)
│   │   └── dfa_help_service/
│   └── tests/             # Test files
│       ├── __init__.py
│       ├── test_core.py
│       ├── test_adapters.py
│       └── test_api.py
├── docs/                  # Additional documentation
├── examples/              # Usage examples for different frameworks
│   ├── django_example/
│   ├── fastapi_example/
│   └── flask_example/
└── MANIFEST.in            # Package manifest
```

## Installation

### For Development
```bash
# Clone the repository
git clone https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git
cd dfa-help-service

# Install in development mode
pip install -e .
```

### For Production (Hosting Application)
```bash
# Install from the Git repository
pip install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git

# Install specific branch or tag
pip install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git@main
pip install git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git@v2.0.0

# Install with requirements.txt
echo "git+https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git" >> requirements.txt
pip install -r requirements.txt
```

### Alternative Installation Methods
```bash
# Install from PyPI (when published)
pip install dfa-help-service

# Install from source archive
pip install .
```

## Framework Integration

**Important Note**: This package is designed as a Django app that provides API endpoints. It must be added to `INSTALLED_APPS` in your Django settings to work properly.

### Django Integration
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
from django.urls import include, path

urlpatterns = [
    # ... other URL patterns
    path('help/', include('dfa_help_service.adapters.django.urls')),
]
```

### FastAPI Integration
```python
# main.py
from fastapi import FastAPI
from dfa_help_service.adapters.fastapi import DFAHelpService

app = FastAPI()
help_service = DFAHelpService(app)

# Include help service routes
app.include_router(help_service.router, prefix="/help")
```

### Flask Integration
```python
# app.py
from flask import Flask
from dfa_help_service.adapters.flask import DFAHelpService

app = Flask(__name__)
help_service = DFAHelpService(app)

# Register help service blueprint
app.register_blueprint(help_service.blueprint, url_prefix='/help')
```

### Generic Python Usage
```python
from dfa_help_service.core.services import HelpService
from dfa_help_service.storage.memory import MemoryStorage

# Initialize with custom storage
storage = MemoryStorage()
help_service = HelpService(storage=storage)

# Use the service
help_content = help_service.get_help_content('user_registration')
```

## Configuration

### Environment Variables
```bash
# Required
DFA_HELP_SERVICE_API_KEY=your_api_key_here

# Optional
DFA_HELP_SERVICE_DEBUG=False
DFA_HELP_SERVICE_LOG_LEVEL=INFO
DFA_HELP_SERVICE_STORAGE_BACKEND=memory  # memory, database, cache
```

### Framework-Specific Settings

#### Django
```python
# settings.py
DFA_HELP_SERVICE = {
    'ENABLED': True,
    'API_KEY': os.environ.get('DFA_HELP_SERVICE_API_KEY'),
    'STORAGE_BACKEND': 'database',
    'CACHE_TIMEOUT': 300,
}
```

#### FastAPI
```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    dfa_help_service_enabled: bool = True
    dfa_help_service_api_key: str
    dfa_help_service_storage_backend: str = "memory"
    
    class Config:
        env_file = ".env"
```

## Features

### Core Functionality
- [ ] Help content management
- [ ] Content management for languages English, French, Spanish, Arabic, Portuguese and Russian
- [ ] Multiple storage backends
- [ ] Plugin architecture

### API Endpoints
- [ ] `/api/adaptations` - Get all adaptations
- [ ] `/api/keys/{adaptation_id}` - Get all the keys of the selected adaptation
- [ ] `/api/keydata/{key_id}` - Get the details of the selected key
- [ ] `/api/delete/{key_id}` - Delete the selected key
- [ ] `/api/create` - Create a new Key
- [ ] `/api/update/{key_id}` - Update selected key data

### API `/api/adaptations` response structure
{
    data: [
        {
            id:1,
            code: "BYD", 
            name: "DFA Dashboard", 
            desc: "This is the description of DFA Monitoring."
        },
        ...
    ],
    message: "Adaptations retrieved successfully",
    status: 200,
    success: true
}

### API `/api/keys/{adaptation_id}` response structure
{
    data: [
        {
            id: 1,
            key: "BYD", 
            parent_id: null, 
            title: "",
            code: "",
            related_keys: [{
                key: ""
            }],
            children: [{
                id: 1,
                key: "BYD", 
                title: "",
                code: "",
                parent_id: null, 
                related_keys: [{
                    key: ""
                }],
                children: []
            }]
        },
        ...
    ],
    message: "Adaptations retrieved successfully",
    status: 200,
    success: true
}

### API `/api/keydata/{key_id}` response structure
{
    data: {
        id:1,
        code: "BYD", 
        key: "", 
        parentKey: "",
        parent_id: "",
        title: "",
        translations: [{
            locale: "em",
            title: "",
            desc: null,
            purpose: null
        }],
        related_keys: [
            {
                key: "BYD-DASH",
                translations: [
                    {
                        locale: "en",
                        title: ""
                    }
                ]
            }
        ]
    },
    message: "Key Data retrieved successfully",
    status: 200,
    success: true
}

### API `/api/delete/{key_id}` response structure
{
    data: {
        key_details: {
            id:1,
            code: "BYD", 
            key: "",
            parent_id: "",
            related_keys: "",
            title: ""
        }
    },
    message: "Key deleted successfully",
    status: 200,
    success: true
}

### API `/api/update/{key_id}` response structure
{
    data: {
        key_details: {
            id:1,
            code: "BYD", 
            key: "",
            parent_id: "",
            related_keys: "",
            title: ""
        }
    },
    message: "Key updated successfully",
    status: 200,
    success: true
}

### Storage Backends
- [ ] In-memory storage (for development/testing)
- [ ] Database storage (SQLAlchemy, Django ORM). For Database, we will support MySQL, PosGreSQL and MariaDB
- [ ] Cache storage (Redis, Memcached)
- [ ] File-based storage
- [ ] Custom storage implementations

## Database Schema

### Table: `dfahelp_adaptations`
| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| id | BIGINT(20) | AUTO_INCREMENT, NOT NULL | Unique identifier |
| code | VARCHAR(4) | UNIQUE, NOT NULL | Unique adaptation code |
| name | VARCHAR(255) | NOT NULL | Adaptation name |
| desc | LONGTEXT | NOT NULL | Adaptation description |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Deletion timestamp |

### Table: `dfahelp_adaptation_keys`
| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| id | BIGINT(20) | AUTO_INCREMENT, NOT NULL | Unique identifier |
| adaptation_id | BIGINT(20) | NOT NULL, FOREIGN KEY OF dfahelp_adaptations | Reference to adaptation |
| key | VARCHAR(255) | UNIQUE, NULL | Unique key identifier |
| code | VARCHAR(255) | NULL | Key code |
| related_keys | LONGTEXT | NULL | Related keys as JSON string |
| parent_id | BIGINT(20) | NULL | Parent key reference |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Deletion timestamp |

### Table: `dfahelp_adaptation_keys_i18n`
| Field Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| id | BIGINT(20) | AUTO_INCREMENT, NOT NULL | Unique identifier |
| adaptation_key_id | BIGINT(20) | NOT NULL, FOREIGN KEY OF dfahelp_adaptation_keys | Reference to adaptation key |
| locale | VARCHAR(3) | NOT NULL | Language locale code |
| title | VARCHAR(255) | NULL | Localized title |
| desc | LONGTEXT | NULL | Localized description |
| purpose | LONGTEXT | NULL | Localized purpose |

### Indexes
- `dfahelp_adaptations_code_idx` on `dfahelp_adaptations(code)`
- `dfahelp_adaptation_keys_adaptation_id_idx` on `dfahelp_adaptation_keys(adaptation_id)`
- `dfahelp_adaptation_keys_parent_id_idx` on `dfahelp_adaptation_keys(parent_id)`
- `dfahelp_adaptation_keys_i18n_key_locale_idx` on `dfahelp_adaptation_keys_i18n(adaptation_key_id, locale)`

### Foreign Key Relationships
- `dfahelp_adaptation_keys.adaptation_id` → `dfahelp_adaptations.id`
- `dfahelp_adaptation_keys_i18n.adaptation_key_id` → `dfahelp_adaptation_keys.id`

## Usage Examples

### Basic Usage (Framework-Agnostic)
```python
from dfa_help_service.core.services import HelpService
from dfa_help_service.storage.memory import MemoryStorage

# Initialize service
storage = MemoryStorage()
help_service = HelpService(storage=storage)

# Get all adaptations
adaptations = help_service.get_adaptations()

# Get keys for a specific adaptation
keys = help_service.get_adaptation_keys(adaptation_id=1)

# Get key details
key_data = help_service.get_key_data(key_id=1)

# Create key
payload = {
    'adaptation_id': 1, 
    'parent_id': 1, 
    'title': "Sample Key Title"
}
key = help_service.create_key(payload)

# Update key data
payload = {
    'id': 1, 
    'code': 'SAMPLE_CODE', 
    'desc': 'Sample description', 
    'title': 'Updated Title', 
    'key': 'sample_key', 
    'lang': 'en', 
    'purpose': 'Sample purpose', 
    'related_keys': 'key1,key2'
}
key = help_service.update_key(payload)

# Delete key
key = help_service.delete_key(key_id=1)
```

### FastAPI Example
```python
from fastapi import APIRouter, Depends
from dfa_help_service.adapters.fastapi import get_help_service
from dfa_help_service.api.schemas import AdaptationKeyRequest, KeyUpdateRequest

router = APIRouter()

@router.get("/adaptations")
async def get_adaptations(
    help_service = Depends(get_help_service)
):
    return await help_service.get_adaptations()

@router.get("/keys/{adaptation_id}")
async def get_adaptation_keys(
    adaptation_id: int,
    help_service = Depends(get_help_service)
):
    return await help_service.get_adaptation_keys(adaptation_id)

@router.get("/keydata/{key_id}")
async def get_key_data(
    key_id: int,
    help_service = Depends(get_help_service)
):
    return await help_service.get_key_data(key_id)

@router.post("/create")
async def create_key(
    request: AdaptationKeyRequest,
    help_service = Depends(get_help_service)
):
    return await help_service.create_key(request.dict())

@router.put("/update")
async def update_key(
    request: KeyUpdateRequest,
    help_service = Depends(get_help_service)
):
    return await help_service.update_key(request.dict())

@router.delete("/delete/{key_id}")
async def delete_key(
    key_id: int,
    help_service = Depends(get_help_service)
):
    return await help_service.delete_key(key_id)
```

### Django Example
```python
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json
from dfa_help_service.adapters.django import get_help_service

def adaptations_view(request):
    help_service = get_help_service()
    adaptations = help_service.get_adaptations()
    return JsonResponse(adaptations, safe=False)

def keys_view(request, adaptation_id):
    help_service = get_help_service()
    keys = help_service.get_adaptation_keys(adaptation_id)
    return JsonResponse(keys, safe=False)

def key_data_view(request, key_id):
    help_service = get_help_service()
    key_data = help_service.get_key_data(key_id)
    return JsonResponse(key_data, safe=False)

@csrf_exempt
@require_http_methods(["POST"])
def create_key_view(request):
    help_service = get_help_service()
    payload = json.loads(request.body)
    key = help_service.create_key(payload)
    return JsonResponse(key, safe=False)

@csrf_exempt
@require_http_methods(["PUT"])
def update_key_view(request):
    help_service = get_help_service()
    payload = json.loads(request.body)
    key = help_service.update_key(payload)
    return JsonResponse(key, safe=False)

@csrf_exempt
@require_http_methods(["DELETE"])
def delete_key_view(request, key_id):
    help_service = get_help_service()
    result = help_service.delete_key(key_id)
    return JsonResponse({"deleted": result}, safe=False)
```

## Customization

### Custom Storage Backend
```python
from dfa_help_service.storage.base import BaseStorage

class CustomStorage(BaseStorage):
    def get(self, key: str):
        # Custom implementation
        pass
    
    def set(self, key: str, value: any):
        # Custom implementation
        pass

# Use custom storage
help_service = HelpService(storage=CustomStorage())
```

### Custom Adapters
```python
from dfa_help_service.adapters.base import BaseAdapter

class CustomFrameworkAdapter(BaseAdapter):
    def register_routes(self, app):
        # Custom route registration
        pass
    
    def get_config(self):
        # Custom configuration
        pass
```

## Testing

### Run Tests
```bash
# Run all tests
python -m pytest

# Run specific test categories
python -m pytest tests/test_core/
python -m pytest tests/test_adapters/
python -m pytest tests/test_api/

# Run with coverage
python -m pytest --cov=dfa_help_service
```

### Framework-Specific Testing
```bash
# Test Django integration
python -m pytest tests/test_adapters/test_django.py

# Test FastAPI integration
python -m pytest tests/test_adapters/test_fastapi.py

# Test Flask integration
python -m pytest tests/test_adapters/test_flask.py
```

## Development

### Setup Development Environment
```bash
# Clone the repository
git clone https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git
cd dfa-help-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install development dependencies
pip install -r requirements-dev.txt

# Install pre-commit hooks
pre-commit install
```

### Code Quality
```bash
# Run linting
flake8 dfa_help_service/
black dfa_help_service/
isort dfa_help_service/

# Run type checking
mypy dfa_help_service/
```

## Deployment

### Building the Package
```bash
# Build source distribution
python setup.py sdist

# Build wheel
python setup.py bdist_wheel

# Build both
python setup.py sdist bdist_wheel
```

### Publishing to PyPI
```bash
# Install twine
pip install twine

# Upload to PyPI
twine upload dist/*
```

## Contributing

### Development Workflow
1. Fork the repository at https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Style
- Follow PEP 8 guidelines
- Use type hints where appropriate
- Write docstrings for all public functions
- Keep functions small and focused
- Use meaningful variable and function names
- Ensure framework-agnostic design

## License
[To be defined]

## Support
- Repository: https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git
- Documentation: [Link to documentation]
- Issues: [Link to issue tracker]
- Email: [Support email]

## Changelog

### Version 2.0.0 (Unreleased)
- Initial package structure
- Framework-agnostic core
- Basic adapters for Django, FastAPI, Flask
- Multiple storage backends
- Core API functionality
- Multi-language content management system
- Database schema for adaptations and keys
- Internationalization support for 6 languages

## Roadmap

### Version 1.0.0
- [ ] Initial setup
- [ ] Database migrations
- [ ] Basic CRUD operations
- [ ] Multi-language content management
- [ ] API endpoint implementation
- [ ] Framework adapters development