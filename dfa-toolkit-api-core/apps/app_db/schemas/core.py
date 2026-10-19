"""
Core application database schemas for request/response validation
"""
from enum import Enum
from typing import Optional
from datetime import datetime
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

from apps.shared.schemas.base import BaseSchema, BaseUpdateSchema


class DatabaseSource(str, Enum):
    """Supported database types"""
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"


class DatabaseConnectionSchema(BaseSchema):
    """Request schema for creating a data warehouse"""
    db_source: DatabaseSource = Field(..., description="Database type (mysql or postgresql)")
    db_host: str = Field(..., description="Database host address", min_length=1)
    db_port: int = Field(..., description="Database port number", gt=0, le=65535)
    db_login: str = Field(..., description="Database username", min_length=1)
    db_password: str = Field(..., description="Database password", min_length=1)
    db_database: str = Field(..., description="Database name to create", min_length=1)
    db_connection_name: Optional[str] = Field(None, description="Friendly name for the connection")

    model_config = ConfigDict(
        from_attributes=True,
        validate_assignment=True,
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {
                "db_connection_name": "Local DW",
                "db_database": "dfa_dw_sample",
                "db_host": "host.docker.internal",
                "db_login": "root",
                "db_password": "root",
                "db_port": 8889,
                "db_source": "mysql"
            }
        }
    )

    @field_validator('db_database')
    @classmethod
    def validate_database_name(cls, v: str) -> str:
        """Validate database name to prevent SQL injection"""
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError("Database name can only contain alphanumeric characters, underscores, and hyphens")
        return v


class ConnectionTestResultSchema(BaseSchema):
    """Response schema for connection test (test_datawarehouse_connection)"""
    connected: bool = Field(..., description="Whether the connection succeeded")
    message: str = Field(..., description="Success or error message")


class DatawarehouseConnectionDataSchema(BaseSchema):
    """Schema for connection data including decrypted password (internal use only)"""
    dw_connection_name: str = Field(..., description="Datawarehouse connection display name")
    db_source_type: str = Field(..., description="Database source type")
    db_host_address: str = Field(..., description="Database host address")
    db_user: str = Field(..., description="Database user")
    db_password: str = Field(..., description="Database password (decrypted)")
    db_port: Optional[str] = Field(None, description="Database port")
    db_database: str = Field(..., description="Database name")
    dw_default_language: str = Field(..., description="Default language")
    is_active: bool = Field(..., description="Active flag")
    dw_metadata_desc: Optional[str] = Field(None, description="Metadata description")
    created_user_id: Optional[int] = Field(None, description="Creator user id")
    modified_user_id: Optional[int] = Field(None, description="Last modifier user id")


class SystemDatawarehousePublicSchema(BaseSchema):
    """Public response schema for a single datawarehouse (no password, no counts)."""
    id: int = Field(..., description="Datawarehouse ID")
    dw_connection_name: str = Field(..., description="Datawarehouse connection display name")
    db_source_type: str = Field(..., description="Database source type")
    db_host_address: str = Field(..., description="Database host address")
    db_user: str = Field(..., description="Database user")
    db_port: Optional[str] = Field(None, description="Database port")
    db_database: str = Field(..., description="Database name")
    dw_default_language: str = Field(..., description="Default language")
    is_active: bool = Field(..., description="Active flag")
    created: Optional[str] = Field(None, description="Created at (ISO format)")
    created_user_id: Optional[int] = Field(None, description="Creator user id")
    modified: Optional[str] = Field(None, description="Last modified at (ISO format)")
    modified_by_username: Optional[str] = Field(
        None, description="Username of the user who last modified this record"
    )
    has_sql_dump: bool = Field(
        False,
        description="True when a downloadable gzip SQL dump file exists for this warehouse",
    )


class WarehouseCreateResponseSchema(BaseSchema):
    """Response schema for warehouse creation (API docs / legacy)."""
    database_name: str = Field(..., description="Name of the created database")
    tables_created: int = Field(..., description="Number of tables created")
    status: str = Field(..., description="Creation status")
    db_source: str = Field(..., description="Database type used")
    connection_info: Optional[dict] = Field(None, description="Connection information (without password)")


class CreateWarehouseResultSchema(BaseSchema):
    """Schema for create_warehouse service return value."""
    database_name: str = Field(..., description="Name of the created database")
    tables_created: int = Field(..., description="Number of main schema tables created")
    search_tables_created: int = Field(..., description="Number of search tables created")
    statements_executed: int = Field(..., description="Total SQL statements executed")
    total_statements: int = Field(..., description="Total SQL statements")
    db_source: str = Field(..., description="Database type used")
    status: str = Field(..., description="Creation status (success/partial)")
    system_datawarehouse_id: Optional[int] = Field(None, description="ID of system_datawarehouse record if saved")


class SystemDatawarehouseBaseSchema(BaseSchema):
    """Base schema for system datawarehouse with common fields"""
    dw_connection_name: str = Field(..., description="Datawarehouse Connection Display name", min_length=1, max_length=50)
    db_source_type: str = Field("mysql", description="Database source type (mysql, postgresql, etc.)", min_length=1, max_length=10)
    db_host_address: str = Field(..., description="Database Host Address", min_length=1)
    db_user: str = Field(..., description="Database user", min_length=1, max_length=100)
    db_password: str = Field(..., description="Database password", min_length=1, max_length=100)
    db_port: Optional[str] = Field(None, description="Database port", max_length=5)
    db_database: str = Field(..., description="Database name", min_length=1, max_length=50)
    dw_default_language: str = Field('en', description="Datawarehouse default language", min_length=1, max_length=3)
    is_active: bool = Field(False, description="Active flag (null from DB treated as False)")
    dw_metadata_desc: Optional[str] = Field(None, description="Datawarehouse Metadata if any")
    created_user_id: Optional[int] = Field(0, description="DW connection creation user id")
    modified_user_id: Optional[int] = Field(0, description="DW connection last modifier user id")

    @field_validator("is_active", mode="before")
    @classmethod
    def coerce_is_active(cls, v):
        """Treat null/None from DB as False."""
        if v is None:
            return False
        return bool(v)


class SystemDatawarehouseCreateSchema(SystemDatawarehouseBaseSchema):
    """Schema for creating a new system datawarehouse"""
    pass


class SystemDatawarehouseUpdateSchema(BaseSchema):
    """Schema for updating a system datawarehouse (all fields optional)"""
    dw_connection_name: Optional[str] = Field(None, description="Datawarehouse Connection Display name", max_length=50)
    db_source_type: Optional[str] = Field(None, description="Database source type", max_length=10)
    db_host_address: Optional[str] = Field(None, description="Database Host Address")
    db_user: Optional[str] = Field(None, description="Database user", max_length=100)
    db_password: Optional[str] = Field(None, description="Database password", max_length=100)
    db_port: Optional[str] = Field(None, description="Database port", max_length=5)
    db_database: Optional[str] = Field(None, description="Database name", max_length=50)
    dw_default_language: Optional[str] = Field(None, description="Datawarehouse default language", max_length=3)
    is_active: Optional[bool] = Field(None, description="Active flag")
    dw_metadata_desc: Optional[str] = Field(None, description="Datawarehouse Metadata if any")
    modified_user_id: Optional[int] = Field(None, description="DW connection last modifier user id")
    dw_data_count: Optional[int] = Field(None, description="Data Values count in the datawarehouse")
    dw_area_count: Optional[int] = Field(None, description="Area Count in the datawarehouse")
    dw_ind_count: Optional[int] = Field(None, description="Indicator Count in the database")
    dw_ius_count: Optional[int] = Field(None, description="IUS Count in the database")
    dw_time_count: Optional[int] = Field(None, description="Time Count in the database")


class SystemDatawarehouseResponseSchema(SystemDatawarehouseBaseSchema):
    """Schema for system datawarehouse response"""
    id: int = Field(..., description="Datawarehouse ID (primary key)")
    created: Optional[datetime] = Field(None, description="DW connection creation date")
    modified: Optional[datetime] = Field(None, description="DW connection last modified date")
    dw_data_count: int = Field(0, description="Data Values count in the datawarehouse")
    dw_area_count: int = Field(0, description="Area Count in the datawarehouse")
    dw_ind_count: int = Field(0, description="Indicator Count in the database")
    dw_ius_count: int = Field(0, description="IUS Count in the database")
    dw_time_count: int = Field(0, description="Time Count in the database")


class SystemDatawarehouseListResponseSchema(BaseSchema):
    """Schema for listing system datawarehouses"""
    id: int = Field(..., description="Datawarehouse ID")
    dw_connection_name: str = Field(..., description="Datawarehouse Connection Display name")
    db_source_type: str = Field(..., description="Database source type")
    db_host_address: str = Field(..., description="Database Host Address")
    db_database: str = Field(..., description="Database name")
    dw_default_language: str = Field(..., description="Datawarehouse default language")
    is_active: bool = Field(False, description="Active flag (null from DB treated as False)")
    created: Optional[datetime] = Field(None, description="DW connection creation date")
    modified: Optional[datetime] = Field(None, description="DW connection last modified date")

    @field_validator("is_active", mode="before")
    @classmethod
    def coerce_is_active(cls, v):
        """Treat null/None from DB as False."""
        if v is None:
            return False
        return bool(v)


class AppConfigEntrySchema(BaseSchema):
    """Single config entry value for GET /app-config response"""
    value: str = Field(..., description="Configuration key value")
    description: Optional[str] = Field(None, description="Configuration key description")
    is_system: bool = Field(False, description="True when this key is treated as system-managed metadata")


class AppConfigResponseSchema(BaseSchema):
    """Response schema for GET /app-config - key/value map with descriptions"""
    config: dict[str, AppConfigEntrySchema] = Field(..., description="Configuration object keyed by key_code")


class AppConfigPatchItemSchema(BaseSchema):
    """Config value object for PATCH /app-config/{app_key}/ payload."""
    value: str = Field(..., description="Configuration key value")
    description: Optional[str] = Field(None, description="Configuration key description")
    is_system: Optional[bool] = Field(
        None,
        description="When set, updates the is_system flag (allowed for any key, including APP_ID and IUS_GID_SEPARATOR)",
    )


# --- Locale / language translation schemas (for fetch locale strings API) ---


class SystemLanguageTranslationResponseSchema(BaseSchema):
    """Response schema for a single system_language_translations row"""
    id: int = Field(..., description="Translation master ID")
    code: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("code", "trans_code"),
        serialization_alias="code",
        description="Translation code",
    )
    app_id: Optional[int] = Field(None, description="FK to system_applications (NULL = global)")
    default_text: str = Field(..., description="Default text")
    created_user_id: int = Field(..., description="Creator user id")
    created: Optional[datetime] = Field(None, description="Created at")
    modified_user_id: Optional[int] = Field(None, description="Last modifier user id")
    modified: Optional[datetime] = Field(None, description="Last modified at")


class SystemLanguageTranslationCreateSchema(BaseSchema):
    """POST payload for creating a translation master + locale texts."""

    code: str = Field(..., description="Unique translation code within app/global scope", min_length=1, max_length=255)
    is_global: bool = Field(
        False,
        description="When true, create translation in global scope (app_key=NULL). When false, app scope is resolved from X-Api-Key.",
    )
    translations: dict[str, str] = Field(
        default_factory=dict,
        description="Locale-to-text map (e.g. {'en': 'Save', 'fr': 'Enregistrer'})",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "code": "BTN_SAVE",
                "is_global": False,
                "translations": {"en": "Save", "fr": "Enregistrer"},
            }
        }
    )


class SystemLanguageTranslationPatchSchema(BaseSchema):
    """PATCH payload for updating translation master + locale texts."""

    # Keep this for future use when translation-code rename is needed again.
    # translation_code: Optional[str] = Field(
    #     None,
    #     description="New translation code (must stay unique)",
    #     min_length=1,
    #     max_length=255,
    # )
    translations: Optional[dict[str, str]] = Field(
        None,
        description="Locale-to-text map to upsert; provided locales are updated/created",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                # "translation_code": "BTN_SAVE_NEW",
                "translations": {"en": "Save now", "fr": "Enregistrer maintenant"},
            }
        }
    )


class LocaleTranslationEntrySchema(BaseSchema):
    """Single locale string entry: code -> text (for list or detail responses)"""
    code: str = Field(..., description="Translation code")
    text: str = Field(..., description="Translated or default text for the locale")


class SystemLanguageResponseSchema(BaseSchema):
    """Response schema for a single system_language row."""

    id: int = Field(..., description="Language ID")
    locale: str = Field(..., description="Locale code")
    name: Optional[str] = Field(None, description="Language display name")
    description: Optional[str] = Field(None, description="Language description")
    is_rtl: bool = Field(False, description="Right-to-left language")
    is_default: bool = Field(False, description="Whether this is the default language")
    is_deleted: bool = Field(False, description="Soft-delete flag")
    created_user_id: Optional[int] = Field(None, description="Creator user ID")
    created: Optional[datetime] = Field(None, description="Created timestamp")
    modified_user_id: Optional[int] = Field(None, description="Last modifier user ID")
    modified: Optional[datetime] = Field(None, description="Last modified timestamp")


class SystemLanguageCreateSchema(BaseSchema):
    """POST payload for system_language."""

    locale: str = Field(..., description="Locale code", min_length=1, max_length=10)
    name: Optional[str] = Field(None, description="Language display name", max_length=100)
    description: Optional[str] = Field(None, description="Language description")
    is_rtl: bool = Field(False, description="Right-to-left language")
    is_default: bool = Field(False, description="Whether this is the default language")


class SystemLanguagePatchSchema(BaseUpdateSchema):
    """PATCH payload for system_language."""

    locale: Optional[str] = Field(None, description="Locale code", min_length=1, max_length=10)
    name: Optional[str] = Field(None, description="Language display name", max_length=100)
    description: Optional[str] = Field(None, description="Language description")
    is_rtl: Optional[bool] = Field(None, description="Right-to-left language")
    is_default: Optional[bool] = Field(None, description="Whether this is the default language")
    is_deleted: Optional[bool] = Field(None, description="Soft-delete flag")


class OptimizeOptionsSchema(BaseSchema):
    """
    Request body for POST /dw/{dw_id}/optimize.

    Select one or more steps to run. If body is omitted or all steps are false, the full optimize
    runs automatically (all Mandatory steps + optional FK + stats sync).

    Execution order when running individually matches the full-optimize sequence:
    normalize_table_and_column_names → ensure_primary_keys → rebuild_indexes →
    seed_system_initial_defaults → validate_sync_new_columns → (optional normalize_subgroup_display_orders) →
    validate_sync_new_tables → configuration_sync (if enabled) → enforce_fk_referential_integrity → sync_dw_stats_counts
    """

    # ── Step 1 ── Mandatory ──────────────────────────────────────────────────────
    normalize_table_and_column_names: bool = Field(
        False,
        description=(
            "[Mandatory | Step 1] Rename all table names and column names to lowercase. "
            "Required on Linux MySQL (case-sensitive filesystem). Also internally seeds db_version, "
            "ut_language, db_available_databases, and ut_dbmetadata_* defaults."
        ),
    )

    # ── Step 2 ── Mandatory ──────────────────────────────────────────────────────
    ensure_primary_keys: bool = Field(
        False,
        description=(
            "[Mandatory | Step 2] Ensure every table has a PRIMARY KEY usable for inserts. "
            "If a table has an AUTO_INCREMENT column but no PRIMARY KEY, adds it. "
            "If a table has no PRIMARY KEY at all, promotes the first integer-typed column "
            "(INT/BIGINT/etc.) to NOT NULL AUTO_INCREMENT PRIMARY KEY. "
            "If a single-integer PRIMARY KEY exists without AUTO_INCREMENT (e.g. ut_area_latlong.id), "
            "adds AUTO_INCREMENT and sets the counter to MAX(id)+1. Skips composite PKs."
        ),
    )

    # ── Step 3 ── Mandatory ──────────────────────────────────────────────────────
    rebuild_indexes: bool = Field(
        False,
        description=(
            "[Mandatory | Step 3] Apply the full DI7 index set (dw_index_specs, per language). "
            "(per language). When rebuild_indexes_after_reset=false (default here): only adds "
            "missing indexes, safe and non-destructive. "
            "Use rebuild_indexes_after_reset=true to drop all existing non-primary unique indexes "
            "first and do a clean full rebuild."
        ),
    )
    rebuild_indexes_after_reset: bool = Field(
        False,
        description=(
            "[Sub-option of rebuild_indexes | Step 3] When true: drop all existing non-primary "
            "unique indexes before re-applying the full index set (clean-slate rebuild). "
            "When false (default): add only missing indexes without touching existing ones. "
            "Has no effect unless rebuild_indexes=true. "
            "Note: full optimize always uses reset mode (drop + re-apply)."
        ),
    )

    # ── Step 4 ── Mandatory ──────────────────────────────────────────────────────
    seed_system_initial_defaults: bool = Field(
        False,
        description=(
            "[Mandatory | Step 4] Seed default rows (INSERT IF NOT EXISTS) into system tables: "
            "db_version (value: 7.0.0.2), db_available_databases, ut_language (default language), "
            "ut_dbmetadata_<lang> (zeroed counts row). "
            "Automatically skipped when normalize_table_and_column_names runs (it covers this step)."
        ),
    )

    # ── Step 5 ── Mandatory ──────────────────────────────────────────────────────
    validate_sync_new_columns: bool = Field(
        False,
        description=(
            "[Mandatory | Step 5] Additive column migrations — safe to run repeatedly. "
            "Currently: adds is_system TINYINT(1) NOT NULL DEFAULT 0 to ut_subgroup_vals_<locale>, "
            "ut_subgroup_type_<locale>, and ut_subgroup_<locale> when missing; adds unit_format "
            "VARCHAR(255) NULL to ut_unit_<locale> when missing (widens existing VARCHAR(32))."
        ),
    )

    # ── Step 6 ── Mandatory ──────────────────────────────────────────────────────
    validate_sync_new_tables: bool = Field(
        False,
        description=(
            "[Mandatory | Step 6] Create new table groups with CREATE TABLE IF NOT EXISTS — "
            "safe to run repeatedly. "
            "Currently provisions: iu_validation, iu_validation_enum, "
            "iu_validation_enum_i18n."
        ),
    )

    normalize_subgroup_display_orders: bool = Field(
        False,
        description=(
            "[Optional | Step 5b] Dense-renumber display orders to remove duplicates/gaps: "
            "subgroup_type_order on all ut_subgroup_type_<locale> tables; "
            "subgroup_order on ut_subgroup_<locale> per subgroup_type (category); "
            "subgroup_val_order on all ut_subgroup_vals_<locale>. "
            "Uses default locale to define sort order, applies the same PK→rank maps to every locale. "
            "**Mutates data** (not a schema migration). Safe to run repeatedly."
        ),
    )

    # ── Step 7 ── Optional ───────────────────────────────────────────────────────
    enforce_fk_referential_integrity: bool = Field(
        False,
        description=(
            "[Optional | Step 7] Convert ut_timeperiod, ut_indicator_unit_subgroup, ut_data, "
            "ut_ic_ius to InnoDB engine (if not already), then add FOREIGN KEY constraints: "
            "ut_ic_ius.iusnid → ut_indicator_unit_subgroup.iusnid, "
            "ut_data.iusnid → ut_indicator_unit_subgroup.iusnid, "
            "ut_data.timeperiod_nid → ut_timeperiod.timeperiod_nid. "
            "Skips constraints that already exist. Also auto-adds missing unique indexes on "
            "parent columns before attempting FK creation."
        ),
    )

    # ── Step 8 ── Optional ───────────────────────────────────────────────────────
    ensure_default_subgroup: bool = Field(
        False,
        description=(
            "[Optional | Step 8] Ensure default subgroup structure (OTHERS, TOTAL types; "
            "category value and combination for DEFAULT_SYSTEM_DW_SUBGROUP_GID) using "
            "db_configuration, system_configuration, then environment defaults. "
            "Reuses existing rows by GID, promotes is_system=1, and creates junction links when missing. "
            "If the default-locale combination already exists, promotes it and linked entities; "
            "otherwise runs full ensure-or-insert for all layers."
        ),
    )

    ensure_default_workflow: bool = Field(
        False,
        description=(
            "[Optional | Step 10] Seed a per-warehouse default workflow in the app DB when missing "
            "(workflow_code DEFAULT_{dw_id}, allow_review=false, constraint_data_entry=false, "
            "review_level_count=0, no review levels or data-entry rule). Idempotent — skips if already present. "
            "Runs on warehouse registration optimize; enable explicitly for other optimize calls."
        ),
    )

    # ── Step 9 ── Optional (last) ────────────────────────────────────────────────
    sync_dw_stats_counts: bool = Field(
        False,
        description=(
            "[Optional | Step 9] Read current counts from the data warehouse "
            "(indicators, areas, IUS combinations, time periods, sources, data rows) "
            "and write them back to the system_datawarehouse record in the app database."
        ),
    )

    configuration_sync: bool = Field(
        False,
        description=(
            "[Optional] After new-table provisioning, create `db_configuration` in the warehouse if missing "
            "and insert missing rows for warehouse-mirrored keys (DFA_DM) using application Settings (.env), "
            "then system_configuration, then subgroup GID fallbacks from Settings — including subgroup GIDs, "
            "IND_CLASSIFICATIONS_SETTINGS, IUS_DEF_VALIDATION, CURRENT_TIMEPERIOD, AI_PROVIDER, and AI_API_KEY. "
            "Existing rows for the same app_key and key_code are left unchanged."
        ),
    )

    create_search_tables: bool = Field(
        True,
        description=(
            "[Optional | default true] Ensure search_keywords, search_keyword_synonym, and "
            "search_keyword_ngram exist (same check-and-create logic as POST /dw/{dw_id}/search/sync "
            "phase 1). Included in full optimize. Set false in a selective body to skip. "
            "Does not populate search data — use search/sync or build_search_index after tables exist."
        ),
    )

    @model_validator(mode="after")
    def validate_rebuild_indexes_dependency(self) -> "OptimizeOptionsSchema":
        """rebuild_indexes_after_reset has no effect unless rebuild_indexes is also true."""
        if self.rebuild_indexes_after_reset and not self.rebuild_indexes:
            raise ValueError(
                "'rebuild_indexes_after_reset' requires 'rebuild_indexes' to be true. "
                "Set rebuild_indexes=true to perform a clean drop-and-rebuild of indexes."
            )
        return self

