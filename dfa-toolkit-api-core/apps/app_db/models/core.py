"""
SQLAlchemy models for application database tables.
These models map to tables in the main application database (from environment variables).
They are used for ORM queries and can be used with Alembic migrations.
"""
from datetime import datetime
from sqlalchemy import BigInteger, Column, Date, Enum, Float, Index, Integer, JSON, String, Text, text, Boolean, DateTime, ForeignKey, SmallInteger, UniqueConstraint
from sqlalchemy.dialects.mysql import LONGTEXT, MEDIUMTEXT
from sqlalchemy.orm import relationship
from apps.app_db.db.core import Base


class SystemDatawarehouse(Base):
    """
    System datawarehouses table - stores data warehouse connection info and metadata.
    Maps to existing table - does not create or modify schema.
    """
    __tablename__ = "system_datawarehouse"
    __table_args__ = (
        {'extend_existing': True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    dw_connection_name = Column(String(50), nullable=False, comment='Datawarehouse Connection Display name')
    dw_connection_details = Column(Text, nullable=False, comment='Datawarehouse Connection Details')
    dw_default_language = Column(String(3), nullable=False, default='en', comment='Datawarehouse default language')
    is_active = Column(Boolean, nullable=True, default=False, comment='Active flag')
    created = Column(DateTime, nullable=True, comment='DW connection creation date')
    created_user_id = Column(Integer, nullable=True, default=0, comment='DW connection creation user id')
    modified = Column(DateTime, nullable=True, comment='DW connection last modified date')
    modified_user_id = Column(Integer, nullable=True, default=0, comment='DW connection last modifier user id')
    dw_metadata_desc = Column(LONGTEXT, nullable=True, comment='Datawarehouse Metadata if any')
    dw_data_count = Column(Integer, nullable=False, default=0, comment='Data Values count in the datawarehouse')
    dw_area_count = Column(Integer, nullable=False, default=0, comment='Area Count in the datawarehouse')
    dw_ind_count = Column(Integer, nullable=False, default=0, comment='Indicator Count in the database')
    dw_ius_count = Column(Integer, nullable=False, default=0, comment='IUS Count in the database')
    dw_time_count = Column(Integer, nullable=False, default=0, comment='Time Count in the database')
    dw_source_count = Column(Integer, nullable=False, default=0, comment='Source Count in the database')
    dw_updated_at = Column(Date, nullable=True, comment='Datawarehouse updation date')
    dw_updated_by = Column(Integer, nullable=False, default=0)


class SystemApplication(Base):
    """
    System applications table - stores application metadata keyed by app_key.
    Maps to existing table - does not create or modify schema.
    """
    __tablename__ = "system_application"
    __table_args__ = (
        UniqueConstraint("app_key", name="uq_idx_app_key"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    app_key = Column(String(10), nullable=False, comment="Application unique key; used as a short identifier across all IAM and config tables")
    link = Column(String(255), nullable=True, comment="Application URL")
    is_active = Column(SmallInteger, nullable=True, default=1, comment="1=active, 0=inactive")


class SystemApplicationClient(Base):
    """
    System application client table — registered API clients (federated frontends,
    external integrations, mobile apps) that can authenticate against the platform.
    Maps to system_application_client table.
    """
    __tablename__ = "system_application_client"
    __table_args__ = ({"extend_existing": True},)

    id = Column(Integer, primary_key=True, autoincrement=True)
    app_name = Column(String(255), nullable=False, comment="Human-readable client application name")
    app_key = Column(String(20), nullable=False, comment="Application key; references system_application.app_key")
    app_type = Column(
        Enum("FED", "EXTERNAL", "MOBILE"),
        nullable=False,
        default="FED",
        comment="Client type: FED=federated frontend, EXTERNAL=3rd-party, MOBILE=mobile app",
    )
    api_key = Column(String(255), nullable=False, unique=True, comment="Public API key used to identify the client")
    auth_method = Column(
        Enum("SECRET", "SIGNATURE"),
        nullable=False,
        default="SIGNATURE",
        comment="How this client authenticates: SECRET=shared secret, SIGNATURE=asymmetric signature",
    )
    api_secret_hash = Column(
        String(255),
        nullable=True,
        comment="Password-style hash of shared secret (SECRET clients only); never stored in plaintext",
    )
    client_public_key = Column(
        Text,
        nullable=True,
        comment="Public key for SIGNATURE clients (PEM/JWK). Private key is never stored on the server.",
    )
    origin_url = Column(String(500), nullable=True, comment="Allowed origin URL; applicable for browser-based clients")
    description = Column(Text, nullable=True, comment="Client description")
    owner_user_id = Column(Integer, nullable=True, comment="User ID of the client owner")
    status = Column(
        Enum("ACTIVE", "INACTIVE", "SUSPENDED"),
        nullable=True,
        default="ACTIVE",
        comment="ACTIVE=operational, INACTIVE=disabled, SUSPENDED=temporarily blocked",
    )
    allowed_ips = Column(Text, nullable=True, comment="Comma-separated list of allowed IPs; NULL = unrestricted")
    requires_user_auth = Column(SmallInteger, nullable=True, default=1, comment="1=user JWT required alongside api_key, 0=api_key alone sufficient")
    default_user_id = Column(Integer, nullable=True, comment="Service account user FK: iam_user.id; required when requires_user_auth=0")
    default_role_id = Column(Integer, nullable=True, comment="Role FK: iam_role.id for PERMISSION checks when auto-injecting; required when requires_user_auth=0")
    created = Column(DateTime, nullable=True, comment="Record creation timestamp")
    modified = Column(DateTime, nullable=True, comment="Last modification timestamp")


class SystemConfiguration(Base):
    """
    System configurations table - key-value config per application.
    Maps to existing table - does not create or modify schema.
    Per-warehouse overrides for warehouse-mirrored keys live in each warehouse `db_configuration` table
    (see apps.app_db.constants.system_config.IS_DW_MIRROR_KEY_CODES and apps.shared.config.config.Settings).
    """
    __tablename__ = "system_configuration"
    __table_args__ = (
        UniqueConstraint("app_key", "key_code", name="uq_sys_config_app_key_code"),
        {"extend_existing": True}
    )

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    app_key = Column(
        String(10),
        ForeignKey("system_application.app_key"),
        nullable=False,
        comment="FK: system_application.app_key",
    )
    key_code = Column(String(60), nullable=False)
    # MySQL: plain Text() maps to 64 KB TEXT — too small for data URLs; use MEDIUMTEXT on mysql.
    key_value = Column(
        Text().with_variant(MEDIUMTEXT(), "mysql"),
        nullable=False,
    )
    description = Column(String(255), nullable=True)
    is_system = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("0"),
        comment="When true, row is system-managed metadata; value/description/flag may still be updated via API",
    )


class SystemLanguageTranslation(Base):
    """
    System language translations table - master records per translation code/app.
    Maps to existing table - does not create or modify schema.
    """
    __tablename__ = "system_language_translation"
    __table_args__ = ({"extend_existing": True},)

    id = Column(Integer, primary_key=True, autoincrement=True)
    trans_code = Column(String(255), nullable=True)
    app_key = Column(String(10), nullable=True, comment="Application key; references system_application.app_key")
    default_text = Column(Text, nullable=False)
    modified_user_id = Column(Integer, nullable=True)
    modified = Column(DateTime, nullable=True)
    created_user_id = Column(Integer, nullable=False)
    created = Column(DateTime, nullable=True)


class SystemLanguageTranslationI18n(Base):
    """
    System language translations i18n table - translated text per locale.
    Maps to existing table - does not create or modify schema.
    """
    __tablename__ = "system_language_translation_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("system_language_translation.id"),
        primary_key=True,
        nullable=False,
        comment="FK of system_language_translation table",
    )
    locale = Column(
        String(3),
        primary_key=True,
        nullable=False,
        comment="Locale like en, fr",
    )
    translated_text = Column(Text, nullable=False)


class SystemLanguage(Base):
    """
    System language table - stores UI/system languages.
    """
    __tablename__ = "system_language"
    __table_args__ = (
        UniqueConstraint("locale", name="uq_system_language_locale"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    locale = Column(String(10), nullable=False, comment="Locale code e.g. en, fr, ar")
    name = Column(String(100), nullable=True, comment="Language display name")
    description = Column(Text, nullable=True, comment="Language description")
    is_rtl = Column(Boolean, nullable=False, default=False, comment="True for right-to-left languages")
    is_default = Column(Boolean, nullable=False, default=False, comment="True when language is system default")
    is_deleted = Column(Boolean, nullable=False, default=False, comment="Soft-delete flag")
    created_user_id = Column(Integer, nullable=True, comment="User ID who created this record")
    created = Column(DateTime, nullable=True, comment="Record creation timestamp")
    modified_user_id = Column(Integer, nullable=True, comment="User ID who last modified this record")
    modified = Column(DateTime, nullable=True, comment="Last modification timestamp")


class SystemGallery(Base):
    """
    system_gallery — saved visualization/table items; per-user access via iam_user_role_content.
    """
    __tablename__ = "system_gallery"
    __table_args__ = ({"extend_existing": True},)

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_cat = Column(String(100), nullable=True, comment="Item category")
    item_name = Column(String(255), nullable=True, comment="Item name")
    item_desc = Column(Text, nullable=True, comment="Item description")
    item_tags = Column(Text, nullable=True, comment="Item tags, e.g. comma-separated or JSON")
    is_dynamic = Column(Boolean, nullable=True, default=False, comment="Whether item is dynamic")
    chart_type = Column(String(100), nullable=True, comment="Chart type")
    chart_sub_type = Column(String(100), nullable=True, comment="Chart sub-type")
    dw_id = Column(
        Integer,
        ForeignKey("system_datawarehouse.id"),
        nullable=True,
        comment="FK: system_datawarehouse.id",
    )
    properties = Column(Text, nullable=True, comment="JSON or config")
    payload = Column(Text, nullable=True, comment="JSON or config")
    datacube = Column(Text, nullable=True, comment="Used when is_dynamic is False")
    created = Column(DateTime, nullable=True, comment="Creation timestamp")
    modified = Column(DateTime, nullable=True, comment="Last update timestamp")


class SystemGalleryKeyword(Base):
    """
    system_gallery_keyword — search keywords denormalized from name, description, tags.
    """
    __tablename__ = "system_gallery_keyword"
    __table_args__ = ({"extend_existing": True},)

    id = Column(Integer, primary_key=True, autoincrement=True)
    gallery_id = Column(
        Integer,
        ForeignKey("system_gallery.id"),
        nullable=False,
        comment="FK: system_gallery.id",
    )
    keyword = Column(
        String(255),
        nullable=False,
        comment="Keyword from system_gallery item name, description, tags for search",
    )


class LogsServerErrors(Base):
    """
    Server-level error log table in the App DB.
    Written by apps.shared.utils.log_event.write_log_to_db when log_event runs and the
    resolved level is listed in DB_LOG_LEVELS.
    Context that used to live in dedicated columns (request_id, module, identifier,
    exception class name, action) is folded into error_message for DB storage; full
    structured payloads still go to stdout via log_event. HTTP verb lives in method;
    semantic operation context lives in error_code / error_message.
    Separated from logs_transactions (warehouse audit trail) by design:
    - logs_server_error  → infrastructure errors, written automatically by middleware
    - logs_transaction   → user audit trail, written explicitly by service layer
    """
    __tablename__ = "logs_server_error"
    __table_args__ = (
        Index("idx_lse_created_at", "created"),
        Index("idx_lse_level", "level"),
        Index("idx_lse_user_id", "user_id"),
        Index("idx_lse_dw_id", "dw_id"),
        {"extend_existing": True},
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Who / where
    user_id = Column(Integer, nullable=True, comment="Authenticated user ID; NULL for unauthenticated requests")
    dw_id = Column(
        Integer,
        nullable=True,
        comment="Datawarehouse ID from request path; no DB FK — may reference a missing warehouse",
    )

    # HTTP context
    method = Column(String(10), nullable=True, comment="HTTP method: GET, POST, PATCH, DELETE")
    path = Column(String(1024), nullable=True, comment="Full request path including query string")
    request_body = Column(
        Text,
        nullable=True,
        comment="Redacted JSON request body, up to 8 KB; NULL for GET/non-JSON/oversized/missing",
    )
    request_headers = Column(
        Text,
        nullable=True,
        comment="All inbound HTTP request headers as a JSON object.",
    )
    status_code = Column(Integer, nullable=True, comment="HTTP response status code if available")

    # Error classification
    level = Column(String(10), nullable=False, comment="Log level: ERROR, CRITICAL, WARNING")

    # Error detail
    error_message = Column(
        Text,
        nullable=True,
        comment="Human-readable error; may include [error_code] prefix and appended context",
    )
    stack_trace = Column(Text, nullable=True, comment="Full traceback")

    created = Column(DateTime, nullable=False, default=datetime.utcnow, comment="UTC timestamp of the log event")


class LogsTransactions(Base):
    """
    Transaction audit log table.
    Tracks user create/update/delete actions inside a data warehouse or the dashboard application.
    Written automatically by SQLAlchemy event listeners (audit_events.py for DW,
    apps/app_dashboard/utils/audit_events.py for app_db) for ORM-tracked entities, and via
    buffer_manual_audit() / app_buffer_manual_audit() for bulk/summary SQL operations.
    ``path`` stores the request path including query string when the change runs in an HTTP
    request (same source as ``logs_server_error.path`` via ``request_path`` context).
    Separated from logs_server_error (infrastructure errors) by design:
    - logs_transaction  → user audit trail (DW and dashboard)
    - logs_server_error → infrastructure errors, written automatically by middleware

    ``dw_id`` is nullable — dashboard-only events (themes, IAM assign without a warehouse) set
    it to NULL; DW events always populate it.
    ``app_key`` identifies the client application (DFA, DFA_DASH, …).
    ``dashboard_id`` carries the dashboard primary key for dashboard-scoped events; no FK so
    audit rows survive dashboard deletion.

    Manual cascade-delete entries (bulk SQL) use short ``module`` slugs that may not match
    ORM ``_audit_module`` names, for example:
    ``data``, ``ic_ius``, ``metadata_report``, ``indicator_unit_subgroup``, ``subgroup_vals_subgroup``,
    ``subgroup_category_value``, ``subgroup_category``, ``subgroup_val``.
    Ordered ``buffer_manual_audit`` / ``buffer_delete_step`` rows in one transaction should list
    ``previous_value`` summaries (counts and capped ``preview_ids`` lists) consistent with cascade order.
    """
    __tablename__ = "logs_transaction"
    __table_args__ = (
        Index("idx_lt_user_id", "user_id"),
        Index("idx_lt_dw_id", "dw_id"),
        Index("idx_lt_action", "action"),
        Index("idx_lt_module", "module"),
        Index("idx_lt_created", "created"),
        Index("idx_lt_app_key", "app_key"),
        Index("idx_lt_dashboard_id", "dashboard_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, comment="Authenticated user ID")
    dw_id = Column(
        Integer,
        ForeignKey("system_datawarehouse.id"),
        nullable=True,
        comment="Datawarehouse ID; NULL for app-only (e.g. dashboard) events",
    )
    app_key = Column(
        String(100),
        nullable=True,
        comment="Application key from X-Api-Key header (e.g. DFA, DFA_DASH)",
    )
    dashboard_id = Column(
        Integer,
        nullable=True,
        comment="Dashboard id; no FK — audit rows survive dashboard deletion",
    )
    path = Column(String(1024), nullable=True, comment="Full request path including query string")
    action = Column(
        Enum("CREATE", "UPDATE", "DELETE", name="transaction_action_enum"),
        nullable=False,
        comment="Operation type: CREATE, UPDATE, DELETE",
    )
    module = Column(String(100), nullable=False, comment="Entity module e.g. area, indicator, dashboard")
    identifier = Column(String(255), nullable=True, comment="GID or primary identifier of the affected record")
    previous_value = Column(JSON, nullable=True, comment="Changed fields before the operation")
    new_value = Column(JSON, nullable=True, comment="Changed fields after the operation")
    status = Column(String(10), nullable=False, default="SUCCESS", comment="Outcome label e.g. SUCCESS, ERROR")
    description = Column(Text, nullable=True, comment="Free-text context for the entry")
    created = Column(DateTime, nullable=False, comment="UTC timestamp of the log event")


class IamRole(Base):
    """
    IAM roles table — defines available roles scoped to an application.
    Maps to iam_role table.
    """
    __tablename__ = "iam_role"
    __table_args__ = (
        Index("idx_iam_role_app_key", "app_key"),
        UniqueConstraint("role_code", name="uq_iam_role_role_code"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    app_key = Column(String(10), nullable=False, comment="Application this role belongs to; FK: system_application.app_key")
    role_code = Column(String(50), nullable=False, comment="Unique machine-readable role code e.g. SUPERADMIN, ADMIN")
    is_super_admin = Column(SmallInteger, nullable=True, default=0, comment="1 if this role carries super-admin privileges")
    is_system_role = Column(SmallInteger, nullable=True, default=0, comment="1 if this is a built-in system role that cannot be deleted")
    display_order = Column(Integer, nullable=False, default=0, comment="Display order for UI sorting (non-negative integers)")
    created = Column(DateTime, nullable=True, comment="Record creation timestamp")
    created_user_id = Column(Integer, nullable=True, comment="User ID who created this record")
    modified = Column(DateTime, nullable=True, comment="Last modification timestamp")
    modified_user_id = Column(Integer, nullable=True, comment="User ID who last modified this record")


class IamUser(Base):
    """
    IAM users table — application user accounts.
    Maps to iam_user table.
    """
    __tablename__ = "iam_user"
    __table_args__ = ({"extend_existing": True},)

    id = Column(Integer, primary_key=True, autoincrement=True)
    first_name = Column(String(255), nullable=False, comment="First name")
    last_name = Column(String(255), nullable=True, comment="Last name")
    location = Column(String(255), nullable=True, comment="Postal or physical location")
    phone = Column(String(10), nullable=True, comment="Contact phone number")
    organisation = Column(String(255), nullable=True, comment="Organisation or employer name")
    username = Column(String(255), nullable=False, comment="Login username")
    email = Column(String(255), nullable=False, comment="Email address")
    password = Column(String(765), nullable=True, comment="Hashed password")
    status = Column(Integer, nullable=True, default=0, comment="0=inactive, 1=active")
    created = Column(DateTime, nullable=True, comment="Record creation timestamp")
    created_user_id = Column(Integer, nullable=False, default=0, comment="User ID who created this record")
    modified = Column(DateTime, nullable=True, comment="Last modification timestamp")
    modified_user_id = Column(Integer, nullable=False, default=0, comment="User ID who last modified this record")
    last_loggedin_on = Column(DateTime, nullable=True, comment="Last successful login timestamp")
    notification_unread_cnt = Column(
        Integer,
        nullable=False,
        server_default=text("0"),
        comment="Denormalized unread in-app notification count",
    )
    is_system = Column(SmallInteger, nullable=False, default=0, comment="1=system/service account; cannot be deleted or logged in directly")
    email_verified = Column(Boolean, nullable=True, default=False, comment="True once the user has verified their email; set True when password is explicitly set")


class IamUserRefreshToken(Base):
    """
    Server-side refresh JWT tracking — stores SHA-256 hashes of issued refresh tokens.
    Enables rotation: after a successful /auth/refresh, the prior refresh JWT is removed
    and only the new hash remains valid.
    Maps to iam_user_refresh_token table.
    """

    __tablename__ = "iam_user_refresh_token"
    __table_args__ = ({"extend_existing": True},)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("iam_user.id", ondelete="CASCADE"),
        nullable=False,
        comment="Owner user (iam_user.id)",
    )
    token_hash = Column(
        String(64),
        nullable=False,
        unique=True,
        comment="SHA-256 hex of the raw refresh JWT string",
    )
    expires_at = Column(DateTime, nullable=False, comment="UTC expiry for this refresh session")
    created_at = Column(DateTime, nullable=False, comment="UTC when this row was created")


class IamUserRole(Base):
    """
    IAM user-application-datawarehouse-role assignments.
    Links a user to an application (app_key) and optionally a datawarehouse with a specific role.
    Maps to iam_user_role table.
    """
    __tablename__ = "iam_user_role"
    __table_args__ = ({"extend_existing": True},)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("iam_user.id"),
        nullable=False,
        comment="FK: iam_user.id",
    )
    app_key = Column(
        String(10),
        nullable=True,
        comment="Application for which role is associated; NULL = global across all apps",
    )
    dw_id = Column(
        Integer,
        ForeignKey("system_datawarehouse.id"),
        nullable=True,
        comment="DW ID for which selected user is associated in different roles; NULL = all warehouses",
    )
    role_id = Column(
        Integer,
        ForeignKey("iam_role.id"),
        nullable=False,
        comment="FK: iam_role.id",
    )
    dashboard_id = Column(
        Integer,
        ForeignKey("dash_dashboards.id", ondelete="CASCADE"),
        nullable=True,
        comment="Dashboard ID for dashboard-scoped role assignments; NULL = not dashboard-scoped",
    )
    created_user_id = Column(Integer, nullable=True, comment="User ID who created this record")
    created = Column(DateTime, nullable=True, comment="Record creation timestamp")


class IamResource(Base):
    """
    IAM resource table — defines application modules/screens that can be permission-gated.
    Each resource belongs to an application (app_key) and may nest under a parent.
    Maps to iam_resource table.
    """
    __tablename__ = "iam_resource"
    __table_args__ = (
        Index("idx_iam_resource_app_key", "app_key"),
        Index("idx_iam_resource_parent_id", "parent_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_id = Column(Integer, nullable=False, default=0, comment="Parent resource id; 0 = top-level")
    app_key = Column(String(10), nullable=False, comment="Application this resource belongs to; FK: system_application.app_key")
    resource_code = Column(String(50), nullable=False, comment="Unique code identifier for this resource e.g. INDICATORS")
    description = Column(Text, nullable=True, comment="Resource description")
    is_dw_spec = Column(SmallInteger, nullable=False, default=1, comment="Is Datawarehouse specific")
    is_dash_spec = Column(
        SmallInteger,
        nullable=False,
        default=0,
        comment="1 = dashboard-scoped resource; 0 = app-level",
    )
    is_active = Column(SmallInteger, nullable=True, default=1, comment="1=active, 0=inactive")
    is_role_assignable = Column(
        SmallInteger,
        nullable=False,
        default=1,
        comment="1=include in permission display payloads, 0=hide from permission displays",
    )
    display_order = Column(Integer, nullable=False, default=0, comment="Display order for UI sorting (non-negative integers)")
    created = Column(DateTime, nullable=True, comment="Record creation timestamp")
    created_user_id = Column(Integer, nullable=True, comment="User ID who created this record")
    modified = Column(DateTime, nullable=True, comment="Last modification timestamp")
    modified_user_id = Column(Integer, nullable=True, comment="User ID who last modified this record")


class IamResourceI18n(Base):
    """
    Translated display names for iam_resource entries.
    Composite PK: (master_id, locale).
    """
    __tablename__ = "iam_resource_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("iam_resource.id"),
        primary_key=True,
        nullable=False,
        comment="FK: iam_resource.id",
    )
    locale = Column(String(3), primary_key=True, nullable=False, comment="Locale code e.g. en, fr")
    name = Column(String(100), nullable=False, comment="Translated resource display name")


class IamResourceApi(Base):
    """
    IAM resource API table — maps individual HTTP endpoints to a parent resource.
    Defines the access level required (PUBLIC / AUTHENTICATED / PERMISSION).
    Maps to iam_resource_api table.
    """
    __tablename__ = "iam_resource_api"
    __table_args__ = (
        Index("idx_iam_rapi_app_key", "app_key"),
        Index("idx_iam_rapi_resource_id", "resource_id"),
        Index("idx_iam_rapi_access_level", "access_level"),
        UniqueConstraint("app_key", "http_method", "backend_endpoint", name="uq_iam_rapi_app_method_endpoint"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    app_key = Column(String(10), nullable=False, comment="Application this endpoint belongs to; FK: system_application.app_key")
    resource_id = Column(
        Integer,
        ForeignKey("iam_resource.id"),
        nullable=False,
        comment="FK: iam_resource.id",
    )
    http_method = Column(String(10), nullable=False, comment="HTTP method: GET, POST, PUT, PATCH, DELETE")
    backend_endpoint = Column(String(500), nullable=False, comment="Backend API path pattern e.g. /dw/{dw_id}/indicators")
    action = Column(
        Enum("CREATE", "READ", "UPDATE", "DELETE"),
        nullable=False,
        comment=(
            "Explicit business action; decouples CRUD permission from HTTP verb. "
            "POST /multiple-delete rows carry DELETE; POST /optimize rows carry UPDATE; etc."
        ),
    )
    access_level = Column(
        Enum("PUBLIC", "AUTHENTICATED", "PERMISSION","APP_CLIENT"),
        nullable=True,
        default="PERMISSION",
        comment="PUBLIC=no auth required, AUTHENTICATED=any valid token, PERMISSION=role check required",
    )
    is_active = Column(SmallInteger, nullable=True, default=1, comment="1=active, 0=inactive")
    created = Column(DateTime, nullable=True, comment="Record creation timestamp")
    created_user_id = Column(Integer, nullable=True, comment="User ID who created this record")
    modified = Column(DateTime, nullable=True, comment="Last modification timestamp")
    modified_user_id = Column(Integer, nullable=True, comment="User ID who last modified this record")


class IamResourceApiI18n(Base):
    """
    Translated descriptions for iam_resource_api entries.
    Composite PK: (master_id, locale).
    """
    __tablename__ = "iam_resource_api_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("iam_resource_api.id"),
        primary_key=True,
        nullable=False,
        comment="FK: iam_resource_api.id",
    )
    locale = Column(String(3), primary_key=True, nullable=False, comment="Locale code e.g. en, fr")
    description = Column(Text, nullable=True, comment="Translated endpoint description")


class IamRoleResourceApi(Base):
    """
    IAM role-resource-API permission table — grants a role access to a specific resource API endpoint.
    A role must have a matching row here to pass PERMISSION-level access checks.
    Maps to iam_role_resource_api table.
    """
    __tablename__ = "iam_role_resource_api"
    __table_args__ = (
        Index("idx_iam_rra_role_id", "role_id"),
        Index("idx_iam_rra_resource_id", "resource_id"),
        Index("idx_iam_rra_resource_api_id", "resource_api_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    role_id = Column(
        Integer,
        ForeignKey("iam_role.id"),
        nullable=False,
        comment="FK: iam_role.id",
    )
    resource_id = Column(
        Integer,
        ForeignKey("iam_resource.id"),
        nullable=False,
        comment="FK: iam_resource.id",
    )
    resource_api_id = Column(
        Integer,
        ForeignKey("iam_resource_api.id"),
        nullable=False,
        comment="FK: iam_resource_api.id",
    )
    created_user_id = Column(Integer, nullable=True, comment="User ID who created this record")
    created = Column(DateTime, nullable=True, comment="Record creation timestamp")


class IamUserRoleContent(Base):
    """
    IAM user role content table — restricts a role assignment to specific content items.
    Allows data-level access control on top of API-level permissions.
    e.g. user can manage DW 3 and DW 7 but not DW 1.
    Maps to iam_user_role_content table.
    """
    __tablename__ = "iam_user_role_content"
    __table_args__ = (
        Index("idx_iam_urc_user_role_id", "user_role_id"),
        Index("idx_iam_urc_resource_code", "resource_code"),
        Index("idx_iam_urc_content_id", "content_id"),
        Index("idx_iam_urc_user_workflow", "user_id", "workflow_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_role_id = Column(
        Integer,
        ForeignKey("iam_user_role.id"),
        nullable=False,
        comment="FK: iam_user_role.id",
    )
    resource_code = Column(String(50), nullable=False, comment="Resource code identifying the content domain (e.g. dm_dw_area, dm_dw_indicator)")
    content_id = Column(Integer, nullable=False, comment="PK of the content item in its domain table")
    created = Column(DateTime, nullable=False, comment="Record creation timestamp")
    created_user_id = Column(Integer, nullable=True, comment="User ID who created this record")
    # Workflow-scoped extension — set only for workflow user-area assignments (TYPE 2 rows).
    # NULL on all three = general IAM content row (TYPE 1, existing behaviour).
    workflow_id = Column(
        Integer,
        ForeignKey("workflow.workflow_id", name="fk_iam_urc_workflow_id", ondelete="CASCADE"),
        nullable=True,
        comment="FK: workflow.workflow_id; NULL = general IAM content, SET = workflow-scoped assignment",
    )
    user_id = Column(
        Integer,
        nullable=True,
        comment="Direct user reference for workflow-scoped rows; enables re-resolution after iam_user_role replace",
    )
    role_id = Column(
        Integer,
        nullable=True,
        comment="Direct role reference for workflow-scoped rows; used to re-resolve user_role_id after role save",
    )


class SystemApplicationI18n(Base):
    """
    Translated display names for system_application entries.
    Composite PK: (master_id, locale).
    """
    __tablename__ = "system_application_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("system_application.id"),
        primary_key=True,
        nullable=False,
        comment="FK: system_application.id",
    )
    locale = Column(
        String(3),
        primary_key=True,
        nullable=False,
        comment="Locale code e.g. en, fr",
    )
    name = Column(String(50), nullable=False, comment="Translated application display name")
    description = Column(Text, nullable=True, comment="Translated application description")


class IamRoleI18n(Base):
    """
    Translated display names for iam_role entries.
    Composite PK: (master_id, locale).
    """
    __tablename__ = "iam_role_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("iam_role.id"),
        primary_key=True,
        nullable=False,
        comment="FK: iam_role.id",
    )
    locale = Column(
        String(3),
        primary_key=True,
        nullable=False,
        comment="Locale code e.g. en, fr",
    )
    name = Column(String(100), nullable=False, comment="Translated role display name")
    description = Column(Text, nullable=True, comment="Translated role description")

class SystemBgJobQueue(Base):
    """
    Pollable background job queue in the App DB.
    Workers claim rows via job_status / locked_by; optional dw_id scopes jobs per warehouse key.
    """
    __tablename__ = "system_bg_job_queue"
    __table_args__ = (
        Index("idx_jq_poll", "job_status", "available_at", "priority"),
        Index("idx_jq_job_type", "job_type"),
        Index("idx_jq_locked_by", "locked_by"),
        Index("idx_jq_dw_id", "dw_id"),
        Index("idx_jq_request_id", "request_id"),
        Index("idx_jq_dataset_import", "dataset_id", "job_type", "request_id"),
        Index("idx_jq_dataset_import_time", "dataset_id", "job_type", "completed_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_type = Column(String(100), nullable=False, comment="Job identifier e.g. task name")
    job_req_payload = Column(LONGTEXT, nullable=False, comment="JSON or serialized request payload")
    request_id = Column(
        String(36),
        nullable=True,
        comment="Correlation id for multi-job operations (e.g. import upload)",
    )
    dataset_id = Column(
        Integer,
        nullable=True,
        comment="Dataset scope for import batch jobs",
    )
    job_status = Column(
        String(20),
        nullable=False,
        server_default=text("'pending'"),
        comment="pending | processing | completed | failed",
    )
    priority = Column(
        Integer,
        nullable=True,
        server_default=text("0"),
        comment="Higher runs first when polling",
    )
    attempts = Column(Integer, nullable=True, server_default=text("0"))
    max_attempts = Column(Integer, nullable=True, server_default=text("3"))
    dw_id = Column(String(50), nullable=True, comment="Optional datawarehouse scope key (string)")
    available_at = Column(
        DateTime,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        comment="Not eligible for pickup before this time",
    )
    locked_at = Column(DateTime, nullable=True)
    locked_by = Column(String(100), nullable=True, comment="Worker / lease owner id")
    completed_at = Column(DateTime, nullable=True)
    result = Column(LONGTEXT, nullable=True, comment="Output or summary on completion")
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(
        DateTime,
        nullable=True,
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
    )

class ReviewWorkflow(Base):
    """
    Master workflow definition — policy header.
    Defines workflow identity, scope model, execution entry point, selection precedence, and activation state.
    Maps to workflow table.
    """
    __tablename__ = "workflow"
    __table_args__ = (
        Index("idx_rw_priority", "priority"),
        UniqueConstraint("workflow_code", name="uq_rw_workflow_code"),
        {"extend_existing": True},
    )

    workflow_id = Column(Integer, primary_key=True, autoincrement=True, comment="Internal surrogate primary key")
    workflow_code = Column(String(60), nullable=False, comment="Business code used for configuration and API reference")
    review_scope_type = Column(
        Enum("AREA", "CLASSIFICATION", "HYBRID"),
        nullable=False,
        comment="Defines whether workflow operates on area hierarchy, classification hierarchy, or both",
    )
    start_workflow_review_level_id = Column(
        Integer,
        ForeignKey("workflow_review_level.workflow_review_level_id", name="fk_rw_start_level_id"),
        nullable=True,
        comment="First workflow level where execution begins; NULL means start from lowest level_no",
    )
    dw_id = Column(Integer, nullable=True, comment="Datawarehouse scope; NULL = global workflow applicable to all datawarehouses")
    review_level_count = Column(
        SmallInteger,
        nullable=False,
        server_default=text("0"),
        comment="Max active workflow levels; must be > 0 before workflow levels can exist",
    )
    priority = Column(Integer, nullable=False, comment="Workflow selection precedence; lower value = higher priority")
    is_active = Column(Boolean, nullable=False, server_default=text("1"), comment="Indicates whether workflow is currently usable")
    is_system = Column(Boolean, nullable=False, server_default=text("0"), comment="TRUE = system-managed workflow; FALSE = user-defined workflow")
    allow_review = Column(Boolean, nullable=False, server_default=text("0"), comment="Indicates whether review is allowed for this workflow")
    constraint_data_entry = Column(
        Boolean,
        nullable=False,
        server_default=text("0"),
        comment="When TRUE, workflow applies constraints on data entry",
    )
    created = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), comment="Record creation timestamp")
    created_user_id = Column(Integer, nullable=True, comment="User who created the workflow")
    modified = Column(DateTime, nullable=True, comment="Last modification timestamp")
    modified_user_id = Column(Integer, nullable=True, comment="User who last updated the workflow")

    @property
    def review_operational(self) -> bool:
        """True when review stages may run: allow_review and a positive review_level_count."""
        return bool(self.allow_review) and int(self.review_level_count or 0) > 0


class ReviewWorkflowI18n(Base):
    """
    Translated text fields for workflow.
    Composite PK: (master_id, locale); master_id FK → workflow.workflow_id.
    Maps to workflow_i18n table.
    """
    __tablename__ = "workflow_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("workflow.workflow_id", name="fk_rwi18n_workflow_id"),
        primary_key=True,
        nullable=False,
        comment="FK: workflow.workflow_id",
    )
    locale = Column(String(10), primary_key=True, nullable=False, comment="Locale code e.g. en, fr, ar")
    workflow_name = Column(String(255), nullable=False, comment="Translated workflow display name")
    description = Column(Text, nullable=True, comment="Translated workflow description")


class ReviewWorkflowLevel(Base):
    """
    Ordered review stages within a workflow.
    Each record represents one approval/validation step.
    Maps to workflow_review_level table.
    """
    __tablename__ = "workflow_review_level"
    __table_args__ = (
        Index("idx_rwl_workflow", "workflow_id"),
        UniqueConstraint("workflow_id", "level_no", name="uq_rwl_workflow_level"),
        {"extend_existing": True},
    )

    workflow_review_level_id = Column(Integer, primary_key=True, autoincrement=True, comment="Internal surrogate primary key")
    workflow_id = Column(
        Integer,
        ForeignKey("workflow.workflow_id", name="fk_rwl_workflow_id"),
        nullable=False,
        comment="Parent workflow identifier",
    )
    level_no = Column(Integer, nullable=False, comment="Execution order of this level within the workflow")
    review_scope_type = Column(
        Enum("AREA", "CLASSIFICATION"),
        nullable=False,
        comment="Scope domain used by this level",
    )
    area_level = Column(Integer, nullable=True, comment="Applicable area level identifier when review_scope_type = AREA")
    classification_parent_nid = Column(Integer, nullable=True, comment="Applicable classification node identifier when review_scope_type = CLASSIFICATION")
    role_id = Column(Integer, nullable=False, comment="Role responsible for reviewing submissions at this level")
    include_childs = Column(
        Boolean,
        nullable=False,
        server_default=text("0"),
        comment="FALSE = reviewer handles only their own scope level; TRUE = includes child levels",
    )
    is_final_level = Column(Boolean, nullable=False, server_default=text("0"), comment="Indicates whether this is the terminal workflow level")
    is_active = Column(Boolean, nullable=False, server_default=text("1"), comment="Indicates whether this level is currently active")
    created = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), comment="Record creation timestamp")


class ReviewWorkflowLevelI18n(Base):
    """
    Translated text fields for workflow_review_level.
    Composite PK: (master_id, locale); master_id FK → workflow_review_level.workflow_review_level_id.
    Maps to workflow_review_level_i18n table.
    """
    __tablename__ = "workflow_review_level_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("workflow_review_level.workflow_review_level_id", name="fk_rwli18n_level_id"),
        primary_key=True,
        nullable=False,
        comment="FK: workflow_review_level.workflow_review_level_id",
    )
    locale = Column(String(10), primary_key=True, nullable=False, comment="Locale code e.g. en, fr, ar")
    level_name = Column(String(100), nullable=True, comment="Translated level display name")


class WorkflowDataentryRule(Base):
    """
    Data-entry form constraints for a workflow (one row per workflow).
    timeperiod_frequency: NULL, ALL, or same letter codes as ut_timeperiod.periodicity (A,M,Q,H,D,F).
    """
    __tablename__ = "workflow_dataentry_rule"
    __table_args__ = (
        UniqueConstraint("workflow_id", name="uq_wfd_er_workflow"),
        {"extend_existing": True},
    )

    dataentry_rule_id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_id = Column(
        Integer,
        ForeignKey("workflow.workflow_id", name="fk_wfd_er_workflow", ondelete="CASCADE"),
        nullable=False,
        comment="FK: workflow.workflow_id",
    )
    scope_timeperiod = Column(
        String(16),
        nullable=False,
        server_default=text("'SINGLE'"),
        comment="SINGLE or MULTIPLE",
    )
    scope_indicator = Column(
        String(16),
        nullable=False,
        server_default=text("'SINGLE'"),
        comment="SINGLE or MULTIPLE",
    )
    scope_area = Column(
        String(16),
        nullable=False,
        server_default=text("'SINGLE'"),
        comment="SINGLE or MULTIPLE",
    )
    timeperiod_frequency = Column(
        String(20),
        nullable=True,
        comment="ALL or ut_timeperiod.periodicity (A,M,Q,H,D,F)",
    )
    curr_timeperiod_nid = Column(
        Integer,
        nullable=True,
        comment="Current reporting time period NID for this workflow data-entry scope",
    )
    area_level = Column(Integer, nullable=True, comment="Optional ut_area_level.level")
    allow_child_areas = Column(Boolean, nullable=False, server_default=text("1"), comment="Include child areas")
    show_previous_time = Column(
        Boolean,
        nullable=False,
        server_default=text("0"),
        comment="Show previous time period when scope_timeperiod is SINGLE",
    )
    role_id = Column(
        Integer,
        ForeignKey("iam_role.id", name="fk_wfd_er_data_entry_role"),
        nullable=True,
        comment="Optional data-entry IAM role",
    )
    created = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), comment="Record creation timestamp")
    created_user_id = Column(Integer, nullable=True, comment="User who created the data-entry rule")
    modified = Column(DateTime, nullable=True, comment="Last modification timestamp")
    modified_user_id = Column(Integer, nullable=True, comment="User who last updated the data-entry rule")


class DatasetRejectionReason(Base):
    """
    Admin-managed reference table of predefined rejection reasons shown in the reviewer dropdown.
    Maps to dataset_rejection_reason table.
    """
    __tablename__ = "dataset_rejection_reason"
    __table_args__ = (
        UniqueConstraint("reason_code", name="uq_drr_code"),
        {"extend_existing": True},
    )

    reason_id     = Column(Integer,      primary_key=True, autoincrement=True)
    reason_code   = Column(String(50),   nullable=False, comment="Machine key e.g. VALUE_DEVIATION")
    reason_text   = Column(String(255),  nullable=False, comment="Default display text")
    is_active     = Column(Boolean,      nullable=False, server_default=text("1"))
    display_order = Column(SmallInteger, nullable=False, server_default=text("0"))
    created       = Column(DateTime,     nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class DatasetRejectionReasonI18n(Base):
    """
    Per-locale translated text for dataset_rejection_reason.
    Composite PK: (master_id, locale); master_id FK → dataset_rejection_reason.reason_id.
    Maps to dataset_rejection_reason_i18n table.
    """
    __tablename__ = "dataset_rejection_reason_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("dataset_rejection_reason.reason_id", name="fk_drr_i18n_reason_id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
        comment="FK: dataset_rejection_reason.reason_id",
    )
    locale     = Column(String(10),  primary_key=True, nullable=False, comment="Locale code e.g. en, fr, ar")
    reason_text = Column(String(255), nullable=False, comment="Translated display text for this locale")


class DatasetEntryPeriod(Base):
    """
    Defines the open/close window for a data entry cycle.
    When opened, PERIOD_OPEN notifications are sent to all assigned operators and reviewers.
    Maps to dataset_entry_period table.
    """
    __tablename__ = "dataset_entry_period"
    __table_args__ = (
        Index("idx_dep_workflow",   "workflow_id"),
        Index("idx_dep_timeperiod", "timeperiod_id"),
        Index("idx_dep_active",     "is_active", "open_at"),
        {"extend_existing": True},
    )

    period_id       = Column(Integer,    primary_key=True, autoincrement=True)
    workflow_id     = Column(Integer,    ForeignKey("workflow.workflow_id", name="fk_dep_workflow"), nullable=False)
    period_name     = Column(String(100), nullable=False, comment="Display name e.g. Q1 2025")
    timeperiod_id   = Column(Integer,   nullable=False,  comment="DW timeperiod reference (cross-DB, no FK)")
    open_at         = Column(DateTime,  nullable=False,  comment="When entry window opens")
    close_at        = Column(DateTime,  nullable=True,   comment="NULL = open indefinitely")
    is_active       = Column(Boolean,   nullable=False,  server_default=text("1"))
    created_user_id = Column(Integer,   nullable=False,  comment="User who created the period")
    created         = Column(DateTime,  nullable=False,  server_default=text("CURRENT_TIMESTAMP"))


class Dataset(Base):
    """
    Submission container. One dataset per operator per workflow per logical grouping.
    No submitter_area_nid — operator may cover multiple areas; actual areas live on DatasetDataPoint.
    Maps to dataset table.
    """
    __tablename__ = "dataset"
    __table_args__ = (
        UniqueConstraint("dataset_gid",    name="uq_dataset_gid"),
        Index("idx_dataset_dw",            "dw_id"),
        Index("idx_dataset_workflow",      "workflow_id"),
        Index("idx_dataset_status",        "dataset_status"),
        Index("idx_dataset_created_by",    "created_user_id"),
        {"extend_existing": True},
    )

    dataset_id               = Column(Integer,    primary_key=True, autoincrement=True)
    workflow_id              = Column(Integer,     ForeignKey("workflow.workflow_id", name="fk_dataset_workflow"), nullable=True,   comment="Workflow this dataset follows; NULL when WORKFLOW_DATASET_ENABLED=no (passthrough mode)")
    current_stage_id         = Column(Integer,    ForeignKey("dataset_review_stage.stage_id", name="fk_dataset_current_stage", use_alter=True), nullable=True, comment="Active review stage (NULL while DRAFT; set by system on submit)")
    reporting_timeperiod_nid = Column(
        Integer,
        nullable=True,
        comment="Reporting time period NID for this dataset submission",
    )
    dataset_gid              = Column(String(60),  nullable=False,  comment="Slug/UUID for API reference (max 60 chars)")
    dataset_name             = Column(String(255), nullable=False,  comment="Operator-supplied name")
    dw_id                    = Column(Integer,     nullable=False,  comment="Datawarehouse scope (denormalised from route; enables efficient DW-scoped queries)")
    dataset_status           = Column(
        Enum("DRAFT", "DELETED", "PENDING_REVIEW", "REVISION", "APPROVED", "REJECTED",
             name="dataset_status_enum"),
        nullable=False, server_default="DRAFT",
    )
    datapoint_readiness      = Column(
        Enum("CREATED", "UPDATED", "COMPLETED", "FAILED", name="datapoint_readiness_enum"),
        nullable=True, server_default=None,
        comment=(
            "Tracks async data-point population state. "
            "NULL = no async op or pre-feature row (treat as ready); "
            "CREATED = seeding in progress; UPDATED = import in progress; "
            "COMPLETED = ready; FAILED = seeding error (reseed required)."
        ),
    )
    revision_count           = Column(SmallInteger, nullable=False, server_default=text("0"), comment="Times operator resubmitted")
    last_returned_at         = Column(DateTime,   nullable=True,   comment="Last time reviewer returned data points")
    returned_by_user_id      = Column(Integer,    nullable=True,   comment="Reviewer who last returned the dataset for revision")
    approved_by_user_id      = Column(Integer,    nullable=True,   comment="Reviewer who approved the latest completed stage (or final approval)")
    created_user_id          = Column(Integer,    nullable=False,  comment="User who created the dataset")
    created                  = Column(DateTime,   nullable=False,  server_default=text("CURRENT_TIMESTAMP"))
    submitted_by_user_id     = Column(Integer,    nullable=True,   comment="NULL while DRAFT")
    submitted_at             = Column(DateTime,   nullable=True)
    approved_on              = Column(DateTime,   nullable=True)
    last_updated_at          = Column(
        DateTime, nullable=False,
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
    )
    # Data-entry scope (JSON arrays of DW NIDs; NULL = unset / no saved scope)
    area_nids          = Column(JSON, nullable=True, comment="JSON array of area_nid values")
    indicator_nids     = Column(JSON, nullable=True, comment="JSON array of indicator_nid values")
    unit_nids          = Column(JSON, nullable=True, comment="JSON array of unit_nid values")
    subgroup_val_nids  = Column(JSON, nullable=True, comment="JSON array of subgroup_val_nid values")
    timeperiod_nids    = Column(JSON, nullable=True, comment="JSON array of timeperiod_nid values")
    source_nids        = Column(JSON, nullable=True, comment="JSON array of source_nid values")
    ius_nids           = Column(JSON, nullable=True, comment="JSON array of iusnid values (indicator-unit-subgroup combinations)")
    # Audit
    modified_user_id   = Column(Integer, nullable=True, comment="User who last modified the dataset")
    cmnt_cnt           = Column(Integer, nullable=False, server_default=text("0"), comment="Total comments on this dataset")


class DatasetDataPoint(Base):
    """
    Individual data record within a dataset. One row = IUS + area + time period + value.
    Cross-DB references (ius_id, area_id, timeperiod_id) enforced in service layer — no DB FKs.
    Maps to dataset_data_point table.
    """
    __tablename__ = "dataset_data_point"
    __table_args__ = (
        Index("idx_ddp_dataset",        "dataset_id"),
        Index("idx_ddp_ius_area_tp",    "iusnid", "area_nid", "timeperiod_nid"),
        Index("idx_ddp_area",           "area_nid"),
        Index("idx_ddp_classification", "indicator_classification_id"),
        Index("idx_ddp_review_status",  "review_status"),
        Index("idx_ddp_slice",          "dataset_review_slice_id"),
        Index("idx_ddp_superseded",     "superseded_by_data_point_id"),
        {"extend_existing": True},
    )

    data_point_id               = Column(Integer,  primary_key=True, autoincrement=True)
    dataset_id                  = Column(Integer,  ForeignKey("dataset.dataset_id", name="fk_ddp_dataset"), nullable=False)
    dataset_review_slice_id     = Column(Integer,  ForeignKey("dataset_review_slice.slice_id", name="fk_ddp_slice", use_alter=True), nullable=True, comment="Owning slice (set when stage activates)")
    reject_reason_id            = Column(Integer,  ForeignKey("dataset_rejection_reason.reason_id", name="fk_ddp_reject_reason"), nullable=True)
    # DW cross-DB references — column names match ut_data for direct mapping on write-back
    indicator_classification_id = Column(Integer,  nullable=True,  comment="Classification this point belongs to")
    iusnid                      = Column(Integer,  nullable=False, comment="indicator_unit_subgroup nid (matches ut_data.iusnid)")
    indicator_nid               = Column(Integer,  nullable=False, comment="Matches ut_data.indicator_nid")
    unit_nid                    = Column(Integer,  nullable=False, comment="Matches ut_data.unit_nid")
    subgroup_val_nid            = Column(Integer,  nullable=True,  comment="Matches ut_data.subgroup_val_nid")
    area_nid                    = Column(Integer,  nullable=False, comment="Matches ut_data.area_nid")
    timeperiod_nid              = Column(Integer,  nullable=False, comment="Matches ut_data.timeperiod_nid")
    source_nid                  = Column(Integer,  nullable=True,  comment="Matches ut_data.source_nid")
    # Denormalized display labels (snapshot at seed/upsert; warehouse locale tables are authoritative)
    indicator_name              = Column(Text,    nullable=True,  comment="From ut_indicator_{locale}.indicator_name")
    unit_name                   = Column(String(128), nullable=True, comment="From ut_unit_{locale}.unit_name")
    subgroup_name               = Column(String(255), nullable=True, comment="From ut_subgroup_vals_{locale}.subgroup_val")
    area_name                   = Column(String(60),  nullable=True, comment="From ut_area_{locale}.area_name")
    timeperiod_name             = Column(String(30),  nullable=True, comment="From ut_timeperiod.timeperiod")
    source_name                 = Column(Text,    nullable=True,  comment="From ut_indicator_classifications_{locale}.ic_name")
    # value — split numeric/textual, matching ut_data column names
    data_value                  = Column(Float,   nullable=True,  comment="Numeric value (matches ut_data.data_value)")
    textual_data_value          = Column(Text,    nullable=True,  comment="Non-numeric/textual value (matches ut_data.textual_data_value)")
    istextualdata               = Column(Boolean, nullable=False, server_default=text("0"), comment="Matches ut_data.istextualdata")
    footnote_nid                = Column(Integer, nullable=True,  comment="Matches ut_data.footnote_nid")
    footnote_text               = Column(Text,    nullable=True,  comment="Denormalized footnote text snapshot from ut_footnote")
    # comparison (previous time period snapshot shown to reviewer)
    prev_timeperiod_nid           = Column(Integer, nullable=True,  comment="Previous period reference for comparison")
    prev_tmprd_data_value         = Column(Float,   nullable=True,  comment="Prior period numeric snapshot (prev_timeperiod_nid)")
    prev_tmprd_textual_data_value = Column(Text,    nullable=True,  comment="Prior period textual snapshot (prev_timeperiod_nid)")
    # last superseded observation on edit (distinct from prev_tmprd_* )
    prev_data_value               = Column(Text,    nullable=True,  comment="Immutable ut_data baseline snapshot captured at data point creation")
    # exclusivity
    superseded_by_data_point_id = Column(Integer,  nullable=True,  comment="Points to newer submission if superseded")
    # review tracking
    review_status               = Column(
        Enum("DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", name="dp_review_status_enum"),
        nullable=False, server_default="PENDING",
    )
    approved_at_level_no        = Column(SmallInteger, nullable=True, comment="Level no that last approved this point")
    is_locked                   = Column(Boolean,  nullable=False, server_default=text("0"))
    is_deleted                  = Column(Boolean,  nullable=False, default=False, server_default=text("0"), comment="Soft-delete flag")
    created_user_id             = Column(Integer,  nullable=True,  comment="User who created/seeded this data point (NULL = seeded by system)")
    created                     = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    modified_user_id            = Column(Integer,  nullable=True,  comment="User who last edited the value")
    modified                    = Column(DateTime, nullable=True)
    cmnt_cnt                    = Column(Integer,  nullable=False, server_default=text("0"), comment="Total comments on this data point")


class DatasetReviewStage(Base):
    """
    One row per workflow level per dataset. All created at submission time (all PENDING).
    Activated sequentially as prior stages complete.
    Maps to dataset_review_stage table.
    """
    __tablename__ = "dataset_review_stage"
    __table_args__ = (
        UniqueConstraint("dataset_id", "level_no", name="uq_drs_dataset_level"),
        Index("idx_drs_dataset", "dataset_id"),
        {"extend_existing": True},
    )

    stage_id                 = Column(Integer,     primary_key=True, autoincrement=True)
    dataset_id               = Column(Integer,     ForeignKey("dataset.dataset_id", name="fk_drs_dataset"), nullable=False)
    workflow_review_level_id = Column(Integer,     ForeignKey("workflow_review_level.workflow_review_level_id", name="fk_drs_level"), nullable=False)
    level_no                 = Column(SmallInteger, nullable=False,   comment="Denormalised for ordering")
    stage_status             = Column(
        Enum("PENDING", "ACTIVE", "COMPLETED", "SKIPPED", name="stage_status_enum"),
        nullable=False, server_default="PENDING",
    )
    activated_at        = Column(DateTime, nullable=True)
    completed_at        = Column(DateTime, nullable=True)
    created_user_id     = Column(Integer,  nullable=True,  comment="User who triggered submission (0 = system on resubmit)")
    approved_by_user_id = Column(Integer,  nullable=True,  comment="Reviewer whose action completed (approved) this stage")
    created             = Column(DateTime, nullable=False,  server_default=text("CURRENT_TIMESTAMP"))


class DatasetReviewSlice(Base):
    """
    Atomic review unit assigned to a reviewer's scope. Internal only — never exposed to operator.
    Created lazily when a stage becomes active.
    Reviewer identity is validated dynamically at action time via iam_user_role_content.
    Maps to dataset_review_slice table.
    """
    __tablename__ = "dataset_review_slice"
    __table_args__ = (
        Index("idx_drsl_dataset",        "dataset_id"),
        Index("idx_drsl_stage",          "stage_id"),
        Index("idx_drsl_area",           "area_nid"),
        Index("idx_drsl_classification", "classification_nid"),
        {"extend_existing": True},
    )

    slice_id            = Column(Integer,   primary_key=True, autoincrement=True)
    dataset_id          = Column(Integer,   ForeignKey("dataset.dataset_id", name="fk_drsl_dataset"), nullable=False)
    stage_id            = Column(Integer,   ForeignKey("dataset_review_stage.stage_id", name="fk_drsl_stage"), nullable=False)
    scope_type          = Column(
        Enum("AREA", "CLASSIFICATION", "HYBRID", name="slice_scope_type_enum"),
        nullable=False,
    )
    area_nid            = Column(Integer,   nullable=True,  comment="SET for AREA and HYBRID scope")
    classification_nid  = Column(Integer,   nullable=True,  comment="SET for CLASSIFICATION and HYBRID scope")
    scope_label         = Column(String(255), nullable=True, comment="Denormalised display; avoids cross-DB join")
    slice_status        = Column(
        Enum("PENDING", "ACTIVE", "REVISION_REQUESTED", "APPROVED", "REJECTED", name="slice_status_enum"),
        nullable=False, server_default="PENDING",
    )
    reviewed_by_user_id = Column(Integer,  nullable=True)
    review_remarks      = Column(Text,     nullable=True,  comment="Mandatory slice-level comment on REVISION_REQUESTED/REJECTED")
    started_at          = Column(DateTime, nullable=True)
    completed_at        = Column(DateTime, nullable=True)
    created_user_id     = Column(Integer,  nullable=True,  comment="System user who created this slice (0 = automated)")
    created             = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class DatasetReviewSliceRejection(Base):
    """
    Junction table: one row per rejection reason per slice.
    Allows multiple reasons per RETURNED/REJECTED slice.
    At least one row required (enforced in service layer).
    Maps to dataset_review_slice_rejection table.
    """
    __tablename__ = "dataset_review_slice_rejection"
    __table_args__ = (
        UniqueConstraint("slice_id", "reason_id", name="uq_drsr_slice_reason"),
        Index("idx_drsr_slice", "slice_id"),
        {"extend_existing": True},
    )

    id              = Column(Integer,  primary_key=True, autoincrement=True)
    slice_id        = Column(Integer,  ForeignKey("dataset_review_slice.slice_id",      name="fk_drsr_slice"),  nullable=False)
    reason_id       = Column(Integer,  ForeignKey("dataset_rejection_reason.reason_id", name="fk_drsr_reason"), nullable=False)
    created_user_id = Column(Integer,  nullable=True,  comment="Reviewer who added this rejection reason")
    created         = Column(DateTime, nullable=False,  server_default=text("CURRENT_TIMESTAMP"))


class DatasetReviewComment(Base):
    """
    Comment on a dataset or a specific data point.
    Replaces the removed submission_comments / reviewer_comment / data_entry_note columns.
    Maps to dataset_comment table.
    """
    __tablename__ = "dataset_comment"
    __table_args__ = (
        Index("idx_drc_dataset",    "dataset_id"),
        Index("idx_drc_data_point", "data_point_id"),
        {"extend_existing": True},
    )

    comment_id      = Column(Integer, primary_key=True, autoincrement=True)
    dataset_id      = Column(Integer, ForeignKey("dataset.dataset_id",                  ondelete="CASCADE"), nullable=False)
    data_point_id   = Column(Integer, ForeignKey("dataset_data_point.data_point_id",    ondelete="CASCADE"), nullable=True)
    commenter_role  = Column(Enum("DATAENTRY", "DATAREVIEW", "SYSTEM", name="commenter_role_enum"), nullable=False)
    comment_text    = Column(Text,    nullable=False)
    status = Column(
        String(32),
        nullable=True,
        comment="At insert: dataset.dataset_status when data_point_id IS NULL; else DP review_status",
    )
    created_user_id = Column(Integer, nullable=False, comment="User who posted this comment")
    created         = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class DatasetReviewActionLog(Base):
    """
    Immutable append-only audit trail for all dataset lifecycle events.
    Never update rows — only INSERT.
    Maps to dataset_review_action_log table.
    """
    __tablename__ = "dataset_review_action_log"
    __table_args__ = (
        Index("idx_dral_dataset",    "dataset_id"),
        Index("idx_dral_data_point", "data_point_id"),
        Index("idx_dral_action",     "action"),
        {"extend_existing": True},
    )

    log_id           = Column(Integer,  primary_key=True, autoincrement=True)
    dataset_id       = Column(Integer,  nullable=False, comment="Historical dataset reference — no FK so logs survive dataset deletion")
    stage_id         = Column(Integer,  nullable=True)
    slice_id         = Column(Integer,  nullable=True)
    data_point_id    = Column(Integer,  nullable=True, comment="Set for indicator-level actions")
    action           = Column(
        Enum(
            "DATASET_CREATED", "DATASET_SUBMITTED", "DATASET_RESUBMITTED",
            "STAGE_ACTIVATED", "SLICE_ACTIVATED",
            "SLICE_APPROVED", "SLICE_RETURNED", "SLICE_REJECTED",
            "DATA_POINT_APPROVED", "DATA_POINT_REJECTED",
            "DATA_POINT_CORRECTED", "DATA_POINT_COMMENTED",
            "DATA_POINT_DELETED",
            "STAGE_COMPLETED",
            "DATASET_APPROVED", "DATASET_REJECTED", "DATASET_CANCELLED",
            name="dataset_action_enum",
        ),
        nullable=False,
    )
    prev_status       = Column(String(50),  nullable=True)
    new_status        = Column(String(50),  nullable=True)
    action_by_user_id = Column(Integer,     nullable=False, comment="0 = system process")
    action_at         = Column(DateTime,    nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    remarks           = Column(Text,        nullable=True)


class DataDictionary(Base):
    """
    Data dictionary table — one row per table in the application database.
    Provides a human-readable reference of table names, descriptions, keys and relationships.
    """
    __tablename__ = "system_data_dictionary"
    __table_args__ = (
        UniqueConstraint("database_name", "table_name", name="uq_sdd_database_table"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    database_name = Column(String(200), nullable=True, comment="Database/schema name")
    table_name = Column(String(200), nullable=True, comment="Table name")
    table_description = Column(String(500), nullable=True, comment="Human-readable description of the table")
    primary_keys = Column(String(500), nullable=True, comment="Comma-separated primary key column names")
    foreign_keys = Column(String(500), nullable=True, comment="Comma-separated foreign key column names")
    linked_tables = Column(String(500), nullable=True, comment="Linked table references e.g. links to system_application.app_key")
    created = Column(DateTime, nullable=False, default=datetime.utcnow, comment="Record creation timestamp")


class SystemShareLink(Base):
    """
    Persisted short-link store for visualizer share/embed URLs.
    Each row maps a short `code` to the full visualization state (fetchParams + chartConfig)
    so that share URLs stay short and portable across email/messaging clients.
    """
    __tablename__ = "system_share_link"
    __table_args__ = (
        Index("idx_share_link_code", "code", unique=True),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(16), nullable=False, unique=True, comment="Short URL-safe code")
    payload = Column(Text, nullable=False, comment="JSON: {fetchParams, chartConfig}")
    app_key = Column(String(10), nullable=True, comment="Application context")
    dw_id = Column(Integer, nullable=True, comment="Data warehouse id (optional)")
    created_by = Column(Integer, nullable=True, comment="User id who created the link")
    created = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), comment="Record creation timestamp")


class IamCaptcha(Base):
    """CAPTCHA challenge store for Proof-of-Work verification on auth endpoints."""

    __tablename__ = "iam_captcha"
    __table_args__ = (
        Index("idx_captcha_expiry", "expires"),
        Index("idx_captcha_used", "used"),
        {"extend_existing": True},
    )

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    challenge_id = Column(String(64), unique=True, nullable=False, comment="UUID4 challenge identifier")
    nonce        = Column(String(128), nullable=False, comment="Random hex nonce for PoW hash input")
    difficulty   = Column(Integer, nullable=False, comment="Required leading zero bits in SHA256 hash")
    expires      = Column(DateTime, nullable=False, comment="Challenge expiry timestamp")
    used         = Column(Boolean, nullable=False, default=False, comment="True after challenge is consumed")
    used_at      = Column(DateTime, nullable=True, comment="Timestamp when challenge was consumed")
    created      = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"), comment="Record creation timestamp")


class SystemNotificationTemplate(Base):
    """Master notification template per event_code + recipient_type."""

    __tablename__ = "system_notification_template"
    __table_args__ = (
        Index("uq_notif_tpl", "event_code", "recipient_type", unique=True),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_code = Column(String(80), nullable=False, comment="Business event code e.g. DATASET_SUBMITTED")
    recipient_type = Column(
        Enum(
            "DATASET_REVIEWERS",
            "DATASET_OWNER",
            "EVENT_ACTOR",
            "DW_ALL_USERS",
            name="notification_recipient_type",
        ),
        nullable=False,
    )
    channels = Column(
        Enum("INAPP", "EMAIL", "BOTH", "NONE", name="notification_channels"),
        nullable=False,
        server_default=text("'BOTH'"),
    )
    email_template_key = Column(String(80), nullable=True, comment="EmailTemplate key; NULL when email disabled")
    is_active = Column(Boolean, nullable=False, server_default=text("1"))
    created = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SystemNotificationTemplateI18n(Base):
    """Per-locale Jinja2 strings for system_notification_template."""

    __tablename__ = "system_notification_template_i18n"
    __table_args__ = ({"extend_existing": True},)

    master_id = Column(
        Integer,
        ForeignKey("system_notification_template.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    locale = Column(String(10), primary_key=True, nullable=False, comment="Locale code e.g. en, fr, ar")
    inapp_title = Column(String(255), nullable=False, comment="Jinja2 title template")
    inapp_body = Column(Text, nullable=False, comment="Jinja2 body template")


class SystemNotification(Base):
    """Per-user in-app notification inbox row (pre-rendered text)."""

    __tablename__ = "system_notification"
    __table_args__ = (
        Index("idx_notif_user_read", "user_id", "is_read"),
        Index("idx_notif_user_created", "user_id", "created"),
        Index("idx_notif_event", "event_code"),
        Index("idx_notif_dw", "dw_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, comment="FK: iam_user.id")
    event_code = Column(String(80), nullable=False)
    locale = Column(String(10), nullable=False, server_default=text("'en'"))
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    context_data = Column(JSON, nullable=True, comment="Raw emit context for debugging")
    ref_entity_type = Column(String(50), nullable=True, comment="e.g. DATASET")
    ref_entity_id = Column(Integer, nullable=True)
    action_url = Column(String(500), nullable=True, comment="Full FE navigation URL")
    dw_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, nullable=False, server_default=text("0"))
    read_at = Column(DateTime, nullable=True)
    created = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))


__all__ = [
    "SystemDatawarehouse",
    "SystemApplication",
    "SystemApplicationI18n",
    "SystemApplicationClient",
    "SystemBgJobQueue",
    "SystemConfiguration",
    "SystemLanguage",
    "SystemLanguageTranslation",
    "SystemLanguageTranslationI18n",
    "SystemGallery",
    "SystemGalleryKeyword",
    "SystemShareLink",
    "LogsServerErrors",
    "LogsTransactions",
    "IamRole",
    "IamRoleI18n",
    "IamUser",
    "IamUserRole",
    "IamResource",
    "IamResourceApi",
    "IamRoleResourceApi",
    "IamUserRoleContent",
    "ReviewWorkflow",
    "ReviewWorkflowI18n",
    "ReviewWorkflowLevel",
    "ReviewWorkflowLevelI18n",
    "WorkflowDataentryRule",
    "DatasetRejectionReason",
    "DatasetEntryPeriod",
    "Dataset",
    "DatasetDataPoint",
    "DatasetReviewStage",
    "DatasetReviewSlice",
    "DatasetReviewSliceRejection",
    "DatasetReviewComment",
    "DatasetReviewActionLog",
    "DataDictionary",
    "IamSsoProvider",
    "IamUserSsoIdentity",
    "IamSsoLoginCode",
    "IamUserRefreshToken",
    "IamCaptcha",
    "SystemNotificationTemplate",
    "SystemNotificationTemplateI18n",
    "SystemNotification",
]
