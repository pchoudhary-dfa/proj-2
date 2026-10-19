"""
Application Configuration
Settings are loaded in this priority order:
1. First: Read from .env file (if variable exists)
2. Fallback: Use default value defined in this class (if not in .env)

All settings can be overridden by setting them in the .env file.
"""
import logging
import os
import json
from dataclasses import dataclass
from typing import Dict, List, Optional, Union
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Project root .env (so ADAPTATION and other vars load regardless of cwd)
# __file__ is apps/shared/config/config.py -> go up 3 levels to project root
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_ROOT_ENV = os.path.join(_PROJECT_ROOT, ".env")


class Settings(BaseSettings):
    """
    Application settings loaded from .env file with optional defaults.
    
    Priority order:
    1. Value from .env file (if exists)
    2. Default value (if not in .env)
    """
    
    # =============================================================================
    # Project Information
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    PROJECT_NAME: str = "DFA Toolkit API Core"  # Read from .env first, fallback to this default
    VERSION: str = "0.1.0"  # Overridden from CHANGELOG.md when present; .env is fallback only
    DESCRIPTION: str = "FastAPI Gateway for DFA Toolkit"  # Read from .env first, fallback to this default
    API_V1_STR: str = "/api/v1"  # Read from .env first, fallback to this default
    
    # =============================================================================
    # Server Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    HOST: str = "0.0.0.0"  # Read from .env first, fallback to this default
    PORT: int = 8000  # Read from .env first, fallback to this default
    DEBUG: bool = True  # Read from .env first, fallback to this default
    
    @field_validator('DEBUG', mode='before')
    @classmethod
    def parse_debug(cls, v: Union[str, bool]) -> bool:
        """Parse DEBUG from environment variable (handles string 'true'/'false' or boolean)"""
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ('true', '1', 'yes', 'on')
        return False

    @field_validator('RETURN_FULL_RES_AFTER_CREATE', mode='before')
    @classmethod
    def parse_return_full_res_after_create(cls, v: Union[str, bool]) -> bool:
        """Parse RETURN_FULL_RES_AFTER_CREATE from environment (handles string 'true'/'false' or boolean)"""
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ('true', '1', 'yes', 'on')
        return False
    
    # =============================================================================
    # CORS Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]  # Read from .env first, fallback to this default
    
    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        """
        Parse CORS_ORIGINS from environment variable.
        Supports JSON format: ["http://localhost:3000", "http://localhost:8000"]
        Or comma-separated format: http://localhost:3000,http://localhost:8000
        """
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            # Try JSON format first
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if origin]
            except (json.JSONDecodeError, TypeError):
                pass
            
            # Fall back to comma-separated format
            if v.strip():
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return ["http://localhost:3000", "http://localhost:8000"]
    
    # =============================================================================
    # Database Configuration (MySQL only)
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    DB_HOST: str = "localhost"  # Read from .env first, fallback to this default
    DB_PORT: int = 3306  # Read from .env first, fallback to this default
    DB_NAME: str = "dfa_toolkit_core_20265"  # Read from .env first, fallback to this default
    DB_USER: str = "root"  # Read from .env first, fallback to this default
    DB_PASSWORD: str = ""  # Read from .env first, fallback to this default
    DB_ECHO: bool = False  # Read from .env first, fallback to this default
    DB_POOL_SIZE: int = 5  # Read from .env first, fallback to this default
    DB_MAX_OVERFLOW: int = 10  # Read from .env first, fallback to this default
    
    # Legacy DATABASE_URL support (for backward compatibility)
    # If not set, will be constructed from DB_HOST, DB_PORT, etc.
    DATABASE_URL: str = ""  # Read from .env first, fallback to this default (empty = construct from components)
    
    def get_database_url(self) -> str:
        """Construct MySQL database URL from individual components"""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        # Handle empty password
        password_part = f":{self.DB_PASSWORD}" if self.DB_PASSWORD else ""
        return f"mysql+mysqlconnector://{self.DB_USER}{password_part}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    
    # =============================================================================
    # Security Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    SECRET_KEY: str = "your-secret-key-change-in-production"  # Read from .env first, fallback to this default
    ALGORITHM: str = "HS256"  # Read from .env first, fallback to this default
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10  # Read from .env first, fallback to this default
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # Read from .env first, fallback to this default
    # Key for encrypting stored data warehouse passwords (optional; derived from SECRET_KEY if not set)
    PASSWORD_ENCRYPTION_KEY: str = ""  # Read from .env first; empty = derive from SECRET_KEY
    IAM_PASSWORD_MIN_LENGTH: int = 3
    IAM_PASSWORD_MAX_LENGTH: int = 50


    DEFAULT_APP_KEY: str = "DFA_DM"

    # =============================================================================
    # Seed — application keys and API client keys
    # =============================================================================
    # Override in .env when your deployment uses different app_key / api_key values.
    # Every seed script reads these so a single .env change propagates everywhere.
    DFA_DM_APP_KEY:   str = "DFA_DM"
    DFA_VIZ_APP_KEY:  str = "DFA_VIZ"
    DFA_DASH_APP_KEY: str = "DFA_DASH"
    DFA_CORE_APP_KEY: str = "DFA_CORE"
    DFA_DM_FED_APP_API_KEY:   str = "dfa_dm_fed_app"   # api_key column in system_application_client
    DFA_VIZ_FED_APP_API_KEY:  str = "dfa_viz_fed_app"
    DFA_DASH_FED_APP_API_KEY: str = "dfa_dash_fed_app"

    # Development Swagger (/docs) signs requests in the browser with these Ed25519
    # PKCS#8 private keys (base64 or PEM). Leave empty to skip auto-signing for that client.
    # Supply out of band (local .env / secret store); never commit real values.
    DFA_DM_API_SIGNING_PRIVATE_KEY:   str = ""
    DFA_VIZ_API_SIGNING_PRIVATE_KEY:  str = ""
    DFA_DASH_API_SIGNING_PRIVATE_KEY: str = ""

    # =============================================================================
    # System User (for created_by / updated_by until full auth)
    # =============================================================================
    # Demo/system user used for datawarehouse created_by and updated_by.
    # Swagger docs: use HTTP Basic with SYSTEM_USER_USERNAME / SYSTEM_USER_PASSWORD to test.
    SYSTEM_USER_ID: int = 1  # Read from .env first, fallback to this default
    SYSTEM_USER_USERNAME: str = "admin"  # Demo login for Swagger
    SYSTEM_USER_PASSWORD: str = "demo"  # Demo password for Swagger
    SYSTEM_USER_EMAIL: str = "admin@example.com"  # Demo email for Swagger
    SYSTEM_USER_FIRST_NAME: str = "DM"
    SYSTEM_USER_LAST_NAME: str = "Super Admin"

    # =============================================================================
    # DFA Visualizer Super-Admin User
    # =============================================================================
    # Credentials for the default super-admin user seeded into the DFA_VIZ application.
    VIZ_USER_USERNAME: str = "viz_admin"
    VIZ_USER_PASSWORD: str = "demo"
    VIZ_USER_EMAIL: str = "viz_admin@example.com"
    VIZ_USER_FIRST_NAME: str = "VIZ"
    VIZ_USER_LAST_NAME: str = "Super Admin"
    
    # =============================================================================
    # JWT Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    JWT_SECRET_KEY: str = "your-jwt-secret-key-change-in-production"  # Read from .env first, fallback to this default
    JWT_ALGORITHM: str = "HS256"  # Read from .env first, fallback to this default
    # Short-lived JWT for POST /auth/password/reset-confirm (forgot-password link only).
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60  # Read from .env first, fallback to this default

    # =============================================================================
    # SSO Configuration
    # SSO_ENABLED=true  → SSO-only login (local login/register/reset-request return 403)
    # SSO_ENABLED=false → Local-only login (SSO routes return 404)
    # =============================================================================
    SSO_ENABLED: bool = False

    @field_validator('SSO_ENABLED', mode='before')
    @classmethod
    def parse_sso_enabled(cls, v: Union[str, bool]) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ('true', '1', 'yes', 'on')
        return False

    @model_validator(mode="after")
    def _warn_empty_secrets(self):
        if not (self.SECRET_KEY or "").strip():
            logger.warning(
                "SECRET_KEY is empty - set a stable random value in .env "
                "(required for SessionMiddleware / SSO OIDC state and PKCE)"
            )
        if not (self.JWT_SECRET_KEY or "").strip():
            logger.warning(
                "JWT_SECRET_KEY is empty - set a random value in .env "
                "(required for access and refresh JWT signing)"
            )
        return self

    # =============================================================================
    # Logging Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    LOG_LEVEL: str = "INFO"  # Read from .env first, fallback to this default
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"  # Read from .env first, fallback to this default
    DB_LOG_LEVELS: str = ""  # Comma-separated log levels to store in database (e.g., "ERROR,CRITICAL"). Empty = no DB logging
    # Max bytes of request body buffered + persisted to logs_server_error.request_body.
    # Bodies above this cap are skipped (not truncated mid-JSON to avoid corrupting downstream parsing).
    LOG_REQ_BODY_MAX_BYTES: int = 8192

    # =============================================================================
    # Environment
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    ENVIRONMENT: str = "development"  # Read from .env first, fallback to this default (development, staging, production)
    
    # =============================================================================
    # Language Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    # Comma-separated list of allowed language codes
    # Example: AVAILABLE_LANGUAGES=en,fr,ar,es,ru
    AVAILABLE_LANGUAGES: str = "en"  # Read from .env first, fallback to this default
    
    # =============================================================================
    # API Path Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    DATAWAREHOUSES_BASE_PATH: str = "dw"  # Read from .env first, fallback to this default
    
    # =============================================================================
    # Redis Cache Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    # Redis URL for caching (optional). If not set, GET indicator APIs are not cached.
    # Example: REDIS_URL=redis://localhost:6379/0
    REDIS_URL: str = ""  # Read from .env first, fallback to this default (empty = no caching)
    CACHE_INDICATOR_TTL_SECONDS: int = 300  # Read from .env first, fallback to this default (TTL for cached responses in seconds)
    
    # =============================================================================
    # Indicator Response Configuration
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    # Comma-separated list of fields to include in indicator responses
    # If empty or not set, all fields will be returned
    # Example: INDICATOR_RESPONSE_FIELDS=indicator_nid,indicator_name,indicator_gid,indicator_info
    # Available fields: indicator_nid, indicator_name, indicator_gid, indicator_info, 
    #                   indicator_global, short_name, keywords, indicator_order, data_exist, 
    #                   highisgood, locale, unit_nid, subgroup_val_nid, default_subgroup_nid, 
    #                   ic_nid, metadata
    INDICATOR_RESPONSE_FIELDS: str = ""  # Read from .env first, fallback to this default (empty = return all fields)
    
    # =============================================================================
    # Data warehouse system subgroup (optimize/register)
    # =============================================================================
    # New database-driven subgroup configuration variables
    # GID for 'Others' subgroup category type
    # Example: DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID=OTHERS
    DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID: str = "OTHERS"  # Read from .env first, fallback to this default
    # GID for 'Total' subgroup category type  
    # Example: DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID=TOTAL
    DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID: str = "TOTAL"  # Read from .env first, fallback to this default
    # Default system subgroup value GID
    # Example: DEFAULT_SYSTEM_DW_SUBGROUP_GID=TOTAL
    DEFAULT_SYSTEM_DW_SUBGROUP_GID: str = "TOTAL"  # Read from .env first, fallback to this default

    # Per-warehouse db_configuration mirror (DFA_DM); used on optimize / configuration_sync.
    # Align with apps.app_db.constants.system_config.IS_DW_MIRROR_KEY_CODES.
    AI_PROVIDER: str = ""
    AI_API_KEY: str = ""
    CURRENT_TIMEPERIOD: str = "{}"
    IUS_DEF_VALIDATION: str = "TEXT"
    IND_CLASSIFICATIONS_SETTINGS: str = (
        '[{"type":"SC", "name":"Sector", "visible":true}, {"type":"GL", "name":"Goal", "visible":true}, '
        '{"type":"CF", "name":"Framework", "visible":true}, {"type":"TH", "name":"Theme", "visible":true}, '
        '{"type":"IT", "name":"Institution", "visible":true},{"type":"CN", "name":"Convention", "visible":true}]'
    )
    DFA_DML_URL: str = ""
    DW_MAPS: str = "{}"

    # =============================================================================
    # Response Adaptation
    # =============================================================================
    # IMPORTANT: pydantic-settings reads from .env file FIRST, then uses these defaults if not found
    # The values below are FALLBACK defaults - .env file values take precedence
    # Set to "external" to return simplified/renamed keys (e.g. id, gid, name, description)
    # If not set or empty, returns default internal field names (e.g. indicator_nid, indicator_name)
    ADAPTATION: str = ""  # Read from .env first, fallback to this default (empty = internal keys, "external" = simplified keys)

    # =============================================================================
    # Create API Response
    # =============================================================================
    # When False (default): create endpoints return only nid and gid in response data.
    # When True: create endpoints return the full created record (previous behaviour).
    # Set via .env: RETURN_FULL_RES_AFTER_CREATE=true
    RETURN_FULL_RES_AFTER_CREATE: bool = False  # Read from .env first, fallback to this default

    # =============================================================================
    # IAM — CRUD to action mapping
    # =============================================================================
    # Maps CRUD permission letters to iam_resource_api.action enum values.
    # Used by save_role_permissions, applicable_crud_by_resource_id, and the
    # permissions display pipeline. POST /multiple-delete endpoints carry
    # action='DELETE', so granting D to a role correctly links those rows
    # without relying on the HTTP verb at all.
    CRUD_ACTION_MAP: Dict[str, List[str]] = {
        "C": ["CREATE"],
        "R": ["READ"],
        "U": ["UPDATE"],
        "D": ["DELETE"],
    }

    # =============================================================================
    # IAM — Default role assignment on registration
    # =============================================================================
    # Maps app_key -> role_code for auto-assigning a default role when a new user
    # registers via POST /auth/register. Only app_keys present in this map will
    # trigger a role assignment; all other app_keys (including DFA_DM) are unaffected.
    # Override via .env as JSON: DEFAULT_ROLE_MAP={"DFA_VIZ": "DFA_DM_AUTHENTICATED"}
    # Note: role_code is looked up by code only (not filtered by app_key), so a DM-scoped
    # role such as DFA_DM_AUTHENTICATED can be assigned as the default for VIZ users.
    DEFAULT_ROLE_MAP: Dict[str, str] = {
        "DFA_VIZ": "DFA_DM_AUTHENTICATED",
    }

    @field_validator("DEFAULT_ROLE_MAP", mode="before")
    @classmethod
    def parse_default_role_map(cls, v: Union[str, Dict]) -> Dict[str, str]:
        """Parse DEFAULT_ROLE_MAP from a JSON string or pass through if already a dict."""
        if isinstance(v, dict):
            return v
        if isinstance(v, str) and v.strip():
            try:
                parsed = json.loads(v)
                if isinstance(parsed, dict):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
        return {"DFA_VIZ": "DFA_VIZ_PUBLIC"}

    # =============================================================================
    # SSO Federated Applications
    # =============================================================================
    # List of app_keys that share SSO users. When a user is provisioned via SSO
    # with the DFA_DM_AUTHENTICATED role, they automatically receive role assignments
    # for ALL applications in this list, enabling single sign-on across the entire
    # product suite.
    #
    # Default: DFA_DM (DataManager) and DFA_VIZ (Visualizer)
    #
    # To add new products (e.g., DFA_ANALYTICS, DFA_REPORTING), extend this list:
    #   SSO_FEDERATED_APPS=["DFA_DM","DFA_VIZ","DFA_ANALYTICS"]
    #
    # Override via .env as JSON array: SSO_FEDERATED_APPS='["DFA_DM","DFA_VIZ","NEW_APP"]'
    SSO_FEDERATED_APPS: List[str] = ["DFA_DM", "DFA_VIZ"]

    @field_validator("SSO_FEDERATED_APPS", mode="before")
    @classmethod
    def parse_sso_federated_apps(cls, v: Union[str, List]) -> List[str]:
        """Parse SSO_FEDERATED_APPS from a JSON string or pass through if already a list."""
        if isinstance(v, list):
            return v
        if isinstance(v, str) and v.strip():
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
        return ["DFA_DM", "DFA_VIZ"]

    # =============================================================================
    # Route Cache Toggle
    # =============================================================================
    # When False (default): do NOT cache IAM routes; reload from DB on every request (dev/seeding friendly).
    # When True: cache iam_resource_api routes in memory after first load (better performance).
    # Set via .env: ENABLE_ROUTE_CACHE=true
    ENABLE_ROUTE_CACHE: bool = False

    @field_validator('ENABLE_ROUTE_CACHE', mode='before')
    @classmethod
    def parse_enable_route_cache(cls, v: Union[str, bool]) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ('true', '1', 'yes', 'on')
        return False

    # =============================================================================
    # App Client Auth Toggle
    # =============================================================================
    # When True (default): enforce X-Api-Key lookup + ACTIVE status + auth_method guard + Signature verification.
    # When False: skip all app-client validation (useful during local dev / internal testing).
    # Set via .env: ENABLE_APP_CLIENT_AUTH=false
    ENABLE_APP_CLIENT_AUTH: bool = False

    @field_validator('ENABLE_APP_CLIENT_AUTH', mode='before')
    @classmethod
    def parse_enable_app_client_auth(cls, v: Union[str, bool]) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ('true', '1', 'yes', 'on')
        return True

    # =============================================================================
    # Signature Verification Toggle
    # =============================================================================
    # When True (default): enforce HMAC/RSA signature verification on app-client requests.
    # When False: skip signature verification (useful during local dev / FED onboarding).
    # Set via .env: ENABLE_SIGNATURE_VERIFICATION=false
    ENABLE_SIGNATURE_VERIFICATION: bool = False

    @field_validator('ENABLE_SIGNATURE_VERIFICATION', mode='before')
    @classmethod
    def parse_enable_signature_verification(cls, v: Union[str, bool]) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.lower() in ('true', '1', 'yes', 'on')
        return True

    # =============================================================================
    # Email / SMTP Configuration
    # =============================================================================
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_FROM_EMAIL: str = "noreply@dfa.example.com"
    
    SMTP_FROM_NAME: str = "DFA Toolkit"
    # Fallback FED origin for DFA_DM when system_application_client.origin_url is empty/null.
    # Email login_url uses this origin as-is; reset links append /reset-password.
    DFA_DM_FED_ORIGIN_URL: str = "http://localhost:3000"

    # =============================================================================
    # DFA Mailer Service Configuration
    # =============================================================================
    DFA_MAILER_API_PREFIX: str = "/dfa-mailer"
    # When True, mailer list/create routes use a trailing slash (e.g. GET /dfa-mailer/templates/)
    # so browsers and HTTP clients that join base + "templates/" match. Toolkit default True.
    DFA_MAILER_TRAILING_SLASH: bool = True
    MAIL_PROVIDER: str = "smtp"           # "smtp" or "mailjet"
    DFA_SEND_MODE: str = "sync"           # "auto" | "sync" | "async"
    ADMIN_ALERT_EMAILS: str = ""          # comma-separated list of admin alert recipients
    ALERT_ON_ASYNC_FAILURE: bool = True
    DFA_PAGINATION_TYPE: str = "offset"   # "offset" or "page"
    DFA_PAGE_SIZE: int = 100
    DFA_ENABLE_VERBOSE_LOGS: bool = False
    REDIS_KEY_PREFIX: str = "DFA"         # prefix for Redis cache keys used by dfa_mailer

    # Celery (for future async email sending; set JOB_WORKER=celery to enable)
    JOB_WORKER: str = ""
    DFA_CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    DFA_CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    DFA_CELERY_QUEUE_NAME: str = "dfa_mailer_service"

    # Celery (ISMRD and central worker): read from .env; fallback to defaults below
    CELERY_BROKER_URL: str = "amqp://guest:guest@localhost:5672//"
    CELERY_RESULT_BACKEND: str = "rpc://"
    # Queue for ISMRD tasks. If not set in .env, uses default Celery queue ("celery").
    CELERY_QUEUE_NAME_ISMRD: str = "celery"
    CELERY_QUEUE_NAME_SUBGROUP_UPDATE: str = "celery"
    # Queue for mark-default-subgroup tasks. If not set in .env, uses default Celery queue ("celery").
    CELERY_QUEUE_NAME_DEFAULT_SUBGROUP: str = "celery"
    
    # Compute Engine Settings
    CELERY_QUEUE_NAME_COMPUTE_CREATE_JOBS: str = "compute_create_jobs"
    CELERY_QUEUE_NAME_COMPUTE_PROCESS: str = "compute_process"
    COMPUTE_ENGINE_ENABLED: bool = True
    COMPUTE_ENGINE_LOG_TABLE_TEMPLATE: str = "ce_process_time_log_{log_id}_details"
    COMPUTE_ENGINE_ADAPTATION_ID: str = "siso"  # For quarter naming

    # Background job transport: CELERY = apply_async to broker; DB = row in system_bg_job_queue + asyncio poller drains it.
    BG_JOB_MQ_TYPE: str = "CELERY"
    # When True and BG_JOB_MQ_TYPE=DB, FastAPI runs an asyncio poller that drains system_bg_job_queue (recovery on restart).
    BG_JOB_POLLER_ENABLED: bool = False
    BG_JOB_POLL_INTERVAL_SEC: int = 5
    BG_JOB_POLL_BATCH_SIZE: int = 10
    # Reset stale "processing" rows to pending after this many seconds (0 = disabled).
    BG_JOB_STALE_LEASE_SEC: int = 1800

    # Dataset seeding: Cartesian-product row count above this triggers an async background job.
    # Set to 0 to always seed synchronously.
    DATASET_SEED_BG_THRESHOLD: int = 1000
    # Celery queue for large-dataset async seeding jobs.
    CELERY_QUEUE_NAME_DATASET_SEED: str = "celery"

    # Dataset deletion: data-point count above this triggers an async background job.
    # Set to 0 to always delete synchronously.
    DATASET_DELETE_BG_THRESHOLD: int = 500
    # Celery queue for large-dataset async deletion jobs.
    CELERY_QUEUE_NAME_DATASET_DELETE: str = "celery"
    # Data-point import: row count above this triggers async background job (0 = always sync).
    DATASET_IMPORT_BG_THRESHOLD: int = 10000
    # Hard cap on export rows for synchronous path; above this returns BadRequest.
    DATA_POINTS_SYNC_EXPORT_MAX_ROWS: int = 150000
    # Hard cap on import rows for synchronous path; above this returns BadRequest.
    DATA_POINTS_SYNC_IMPORT_MAX_ROWS: int = 50000
    # Celery queue for large-dataset async import jobs.
    CELERY_QUEUE_NAME_DATASET_IMPORT: str = "celery"
    # Celery queue for search index sync jobs.
    CELERY_QUEUE_NAME_SEARCH_INDEX: str = "celery"
    CELERY_QUEUE_NAME_MOBILE_PACKAGE: str = "celery"

    # =============================================================================
    # Publish Mobile App Configuration
    # =============================================================================
    # Directory on disk where mobile app ZIP packages are stored.
    PUBLISH_MOBILE_FILES_DIR: str = "./publish_mobile_data"
    # Directory on disk where per-warehouse MySQL SQL dumps (.sql.gz) are stored.
    DW_SQL_DUMP_FILES_DIR: str = "./files/sql_dump"
    # DML (Digital Map Library) API base URL for building map_url in GET /update response.
    # Example: https://dfadml.dataforall.org/api/
    DML_API_BASE_URL: str = ""

    # ISMRD update: direct vs background (Celery)
    # When False, always run ISMRD update inline; when True, queue to Celery when over thresholds.
    IS_BACKGROUND_ENABLED: bool = False
    # When all 3 nids (indicator, unit, subgroup_val) are provided: max combinations for sync run.
    ISMRD_SYNC_MAX_COMBINATIONS: int = 1000
    # When not all 3 nids provided: max IUS rows (ut_indicator_unit_subgroup) for perimeter; above = Celery.
    ISMRD_SYNC_MAX_IUS_ROWS: int = 1000
    # Batch size when recomputing ut_indicator_unit_subgroup.data_exist from ut_data (limit/offset per chunk).
    IUS_DATA_EXIST_CHUNK_SIZE: int = 2000

    # Mark default subgroup (IUS backfill): max IUS rows / distinct (indicator, unit) pairs for sync run; above = Celery.
    DEFAULT_SUBGROUP_SYNC_MAX_IUS_ROWS: int = 1000
    DEFAULT_SUBGROUP_SYNC_MAX_IU_PAIRS: int = 1000

    def get_available_languages(self) -> List[str]:
        """Get list of available language codes from environment variable"""
        return [lang.strip().lower() for lang in self.AVAILABLE_LANGUAGES.split(",") if lang.strip()]
    
    def get_indicator_response_fields(self) -> Optional[List[str]]:
        """
        Get list of fields to include in indicator responses from environment variable.
        
        Returns:
            List of field names to include, or None if all fields should be returned
        """
        if not self.INDICATOR_RESPONSE_FIELDS:
            return None
        fields = [field.strip() for field in self.INDICATOR_RESPONSE_FIELDS.split(",") if field.strip()]
        return fields if fields else None

    @model_validator(mode="after")
    def resolve_version_from_changelog(self) -> "Settings":
        """Canonical API version: latest semver in CHANGELOG.md; keep .env VERSION if unreadable."""
        from apps.shared.utils.version import get_api_version

        changelog_version = get_api_version()
        if changelog_version:
            self.VERSION = changelog_version
        return self
    
    model_config = SettingsConfigDict(
        # Load from .env file first (if exists)
        env_file=_ROOT_ENV if os.path.exists(_ROOT_ENV) else ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
        # Note: pydantic-settings automatically reads from .env file first,
        # then falls back to default values in class if variable not found in .env
    )


@dataclass(frozen=True)
class InsightsOpenAIConfig:
    """
    OpenAI client options for POST /dw/{dw_id}/insights.

    Defined in code only — not loaded from .env / environment.
    API keys come from the warehouse db_configuration (AI_API_KEY); model/timeout/response
    mode are adjusted here in source.
    """

    model: str = "gpt-4.1"
    timeout: float = 120.0
    # "markdown" | "structured" (structured uses JSON mode; format checks for top-level "sections")
    response_type: str = "structured"   
    use_reasoning: bool = False
    reasoning_effort: str = "medium"


# Defaults for insights OpenAI calls (see InsightsOpenAIConfig).
insights_openai = InsightsOpenAIConfig()

# Create settings instance
settings = Settings()
