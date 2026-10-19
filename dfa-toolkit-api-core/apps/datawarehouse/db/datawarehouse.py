"""
Data warehouse database connections.
This handles connections to external data warehouses where indicator data is stored.
Each warehouse has its own database credentials stored in system_datawarehouse table.
"""
import hashlib
import logging
import threading
from contextlib import contextmanager
from typing import Generator, List, NamedTuple, Optional, Tuple

# Register SQLAlchemy audit event listeners (before_flush / after_commit / after_rollback).
# Import must happen once at startup; the decorators wire globally to Session.
import apps.datawarehouse.utils.audit_events  # noqa: F401

from fastapi import Header, Path
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
from sqlalchemy.exc import OperationalError, DBAPIError

from apps.app_db.schemas.core import DatabaseConnectionSchema, DatabaseSource
from apps.app_db.services.datawarehouse import SystemDatawarehouseService
from apps.datawarehouse.models.datawarehouse import Language
from apps.shared.utils.cache import cache_get, cache_set, cache_delete_pattern
from apps.shared.utils.connection_errors import is_connection_error
from apps.shared.utils.validators import normalize_language_code
from apps.shared.exceptions import AppException, BadRequest, Forbidden, NotFound, ServiceUnavailable

logger = logging.getLogger(__name__)

# Singleton service for warehouse lookups
_datawarehouse_service = SystemDatawarehouseService()

# Per-warehouse connection pool registry (keyed by resolved system_datawarehouse.id or dw_id)
_ENGINE_POOL_SIZE = 3
_ENGINE_MAX_OVERFLOW = 5
_ENGINE_POOL_RECYCLE = 1800
_engine_registry: dict[str, Tuple[Engine, sessionmaker, str]] = {}
_registry_lock = threading.Lock()

_DW_CREDENTIALS_CACHE_KEY = "dw:credentials:{dw_id}"
_DW_CREDENTIALS_CACHE_TTL = 300


class WarehouseConnectionFailedError(RuntimeError):
    """
    Raised when opening or using a tenant warehouse DB session fails due to TCP/driver errors.
    Carries a password-safe connection summary for logs and API diagnostics.
    """

    def __init__(self, message: str, *, target: dict) -> None:
        super().__init__(message)
        self.target = target


def _build_warehouse_sqlalchemy_url(warehouse: DatabaseConnectionSchema) -> URL:
    """
    Build a SQLAlchemy URL with proper encoding for user/password/database.
    Avoids manual f-strings so passwords containing @, :, /, etc. do not break host parsing.
    """
    username = warehouse.db_login or None
    password = warehouse.db_password if warehouse.db_password else None
    if warehouse.db_source == DatabaseSource.MYSQL:
        return URL.create(
            drivername="mysql+mysqlconnector",
            username=username,
            password=password,
            host=warehouse.db_host,
            port=warehouse.db_port,
            database=warehouse.db_database,
            query={"charset": "utf8mb4"},
        )
    return URL.create(
        drivername="postgresql+psycopg2",
        username=username,
        password=password,
        host=warehouse.db_host,
        port=warehouse.db_port,
        database=warehouse.db_database,
    )


def _warehouse_connection_target_dict(dw_id: str, schema: DatabaseConnectionSchema) -> dict:
    return {
        "path_dw_id": dw_id,
        "db_host": schema.db_host,
        "db_port": schema.db_port,
        "db_database": schema.db_database,
        "db_user": schema.db_login,
        "password_configured": bool(schema.db_password and str(schema.db_password).strip()),
        "db_source": getattr(schema.db_source, "value", str(schema.db_source)),
    }


def _connection_fingerprint(credentials: dict) -> str:
    """Hash of connection fields; used to detect credential changes and invalidate pooled engines."""
    parts = [
        str(credentials.get("db_source_type", "")),
        str(credentials.get("db_host_address", "")),
        str(credentials.get("db_port", "")),
        str(credentials.get("db_database", "")),
        str(credentials.get("db_user", "")),
        str(credentials.get("db_password", "")),
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def _credentials_cache_keys(dw_id: str, credentials: dict) -> list[str]:
    """All Redis keys that should store/evict credentials for a warehouse."""
    keys = [_DW_CREDENTIALS_CACHE_KEY.format(dw_id=dw_id)]
    resolved_id = _datawarehouse_service.resolve_datawarehouse_id(dw_id)
    if resolved_id is not None:
        keys.append(_DW_CREDENTIALS_CACHE_KEY.format(dw_id=str(resolved_id)))
    db_name = credentials.get("db_database")
    if db_name and db_name != dw_id:
        keys.append(_DW_CREDENTIALS_CACHE_KEY.format(dw_id=db_name))
    return keys


def _cache_credentials(dw_id: str, credentials: dict) -> None:
    for key in _credentials_cache_keys(dw_id, credentials):
        cache_set(key, credentials, ttl_seconds=_DW_CREDENTIALS_CACHE_TTL)


def invalidate_dw_credentials_cache(dw_id: str) -> None:
    """Evict cached credentials for a warehouse. Call after connection detail updates."""
    for key in (
        _DW_CREDENTIALS_CACHE_KEY.format(dw_id=dw_id),
        _DW_CREDENTIALS_CACHE_KEY.format(dw_id=str(dw_id)),
    ):
        cache_delete_pattern(key)
    resolved_id = _datawarehouse_service.resolve_datawarehouse_id(str(dw_id))
    if resolved_id is not None:
        cache_delete_pattern(_DW_CREDENTIALS_CACHE_KEY.format(dw_id=str(resolved_id)))


def _engine_registry_key(dw_id: str) -> str:
    resolved = _datawarehouse_service.resolve_datawarehouse_id(dw_id)
    return str(resolved) if resolved is not None else dw_id


def dispose_dw_engine(dw_id: str) -> None:
    """Dispose the pooled engine for a warehouse (e.g. after credential change)."""
    keys = {_engine_registry_key(str(dw_id)), str(dw_id)}
    resolved = _datawarehouse_service.resolve_datawarehouse_id(str(dw_id))
    if resolved is not None:
        keys.add(str(resolved))
    with _registry_lock:
        for key in keys:
            entry = _engine_registry.pop(key, None)
            if entry is not None:
                entry[0].dispose()
                logger.info("Disposed warehouse engine pool for key=%r", key)


def _get_engine_and_session_factory(
    registry_key: str,
    warehouse: DatabaseConnectionSchema,
    credentials: dict,
) -> Tuple[Engine, sessionmaker]:
    fingerprint = _connection_fingerprint(credentials)
    with _registry_lock:
        entry = _engine_registry.get(registry_key)
        if entry is not None:
            engine, session_factory, stored_fp = entry
            if stored_fp == fingerprint:
                return engine, session_factory
            engine.dispose()
            del _engine_registry[registry_key]
            logger.info("Warehouse credentials changed; recreating engine pool for key=%r", registry_key)

        warehouse_url = _build_warehouse_sqlalchemy_url(warehouse)
        engine = create_engine(
            warehouse_url,
            poolclass=QueuePool,
            pool_size=_ENGINE_POOL_SIZE,
            max_overflow=_ENGINE_MAX_OVERFLOW,
            pool_recycle=_ENGINE_POOL_RECYCLE,
            echo=False,
            future=True,
        )
        session_factory = sessionmaker(
            bind=engine,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
        _engine_registry[registry_key] = (engine, session_factory, fingerprint)
        logger.info(
            "Created warehouse engine pool key=%r host=%r database=%r",
            registry_key,
            warehouse.db_host,
            warehouse.db_database,
        )
        return engine, session_factory


def get_warehouse_credentials(dw_id: str) -> dict:
    """
    Get warehouse credentials from the system_datawarehouse table (with decrypted password).
    Use this when connecting to the warehouse; do not use for API response data.
    
    Args:
        dw_id: Data warehouse identifier (can be ID or database name)
        
    Returns:
        Dictionary with warehouse credentials including decrypted db_password
        
    Raises:
        NotFound: if dw_id not found; Forbidden: if warehouse inactive.
    """
    cache_key = _DW_CREDENTIALS_CACHE_KEY.format(dw_id=dw_id)
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    credentials = None

    # Try to get connection data by ID first (if dw_id is numeric)
    if dw_id.isdigit():
        credentials = _datawarehouse_service.get_datawarehouse_connection_data(int(dw_id))

    # If not found by ID, try by database name
    if not credentials:
        credentials = _datawarehouse_service.get_datawarehouse_connection_data_by_database_name(dw_id)

    if not credentials:
        raise NotFound(
            f"Data warehouse '{dw_id}' not found in system_datawarehouse table",
            identifier=dw_id,
            error_code="DATAWAREHOUSE_NOT_FOUND",
        )

    if not credentials.get("is_active"):
        raise Forbidden(
            "Data warehouse is inactive. No CRUD operations are allowed for this data warehouse.",
            error_code="DATAWAREHOUSE_INACTIVE",
        )

    _cache_credentials(dw_id, credentials)
    return credentials


def credentials_to_schema(credentials: dict) -> DatabaseConnectionSchema:
    """
    Convert system_datawarehouse dict to DatabaseConnectionSchema.
    
    Args:
        credentials: Dictionary from system_datawarehouse table
        
    Returns:
        DatabaseConnectionSchema object
    """
    db_source_type = credentials.get("db_source_type", "").lower()
    
    return DatabaseConnectionSchema(
        db_source=DatabaseSource.MYSQL if db_source_type == "mysql" else DatabaseSource.POSTGRESQL,
        db_host=credentials.get("db_host_address", "localhost"),
        db_port=int(credentials.get("db_port") or ("3306" if db_source_type == "mysql" else "5432")),
        db_login=credentials.get("db_user", ""),
        db_password=credentials.get("db_password", ""),
        db_database=credentials.get("db_database", ""),
    )


@contextmanager
def get_warehouse_session(
    warehouse: DatabaseConnectionSchema,
    *,
    dw_id: Optional[str] = None,
    credentials: Optional[dict] = None,
) -> Session:
    """
    Create a SQLAlchemy session for a specific data warehouse using a per-warehouse pool.

    Args:
        warehouse: Database connection schema with warehouse credentials
        dw_id: Route or logical warehouse identifier (used for pool registry key)
        credentials: Full credential dict (for fingerprinting); built from schema when omitted

    Yields:
        SQLAlchemy Session object
    """
    if credentials is None:
        db_source = (
            warehouse.db_source.value
            if hasattr(warehouse.db_source, "value")
            else str(warehouse.db_source)
        )
        credentials = {
            "db_source_type": db_source,
            "db_host_address": warehouse.db_host,
            "db_port": warehouse.db_port,
            "db_database": warehouse.db_database,
            "db_user": warehouse.db_login,
            "db_password": warehouse.db_password,
        }

    registry_key = _engine_registry_key(dw_id) if dw_id else f"fp:{_connection_fingerprint(credentials)}"
    _engine, SessionLocal = _get_engine_and_session_factory(registry_key, warehouse, credentials)

    session = SessionLocal()
    session.info["is_dw_session"] = True
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
        logger.debug("Closed SQLAlchemy session for warehouse: %s", warehouse.db_database)




@contextmanager
def get_warehouse_session_from_id(dw_id: str):
    """
    Get warehouse session directly from dw_id.

    This is a convenience function that combines getting warehouse credentials,
    converting to schema, and creating a session. Use this when you need
    a session from just the data warehouse identifier.

    Args:
        dw_id: Data warehouse identifier (can be ID or database name)

    Yields:
        SQLAlchemy Session object for the warehouse

    Raises:
        HTTPException: 404 if dw_id not found

    Example:
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndLocale = Indicator("en")
            row = dw_db.query(IndLocale).filter(IndLocale.indicator_nid == 1).first()
    """
    try:
        credentials = get_warehouse_credentials(dw_id)
    except AppException:
        raise
    except (OperationalError, DBAPIError, Exception) as e:
        if is_connection_error(e):
            raise RuntimeError(
                f"App DB connection failed (cannot read system_datawarehouse). "
                f"Check .env: DB_HOST, DB_PORT (e.g. MAMP uses 8889). Original: {e}"
            ) from e
        raise

    # Validate required connection fields before building schema (avoid Pydantic ValidationError)
    required = [
        ("db_host_address", credentials.get("db_host_address")),
        ("db_user", credentials.get("db_user")),
        ("db_password", credentials.get("db_password")),
        ("db_database", credentials.get("db_database")),
    ]
    missing = [name for name, val in required if not (val and str(val).strip())]
    if missing:
        raise BadRequest(
            (
                f"Data warehouse connection details are incomplete for dw_id={dw_id!r}. "
                f"Missing or empty in system_datawarehouse.dw_connection_details: {', '.join(missing)}. "
                "Please configure the data warehouse connection (host, user, password, database)."
            ),
            error_code="DATAWAREHOUSE_CONNECTION_INCOMPLETE",
            identifier=dw_id,
        )

    schema = credentials_to_schema(credentials)
    target = _warehouse_connection_target_dict(dw_id, schema)
    logger.info(
        "get_warehouse_session_from_id: resolved credentials path_dw_id=%r target=%s",
        dw_id,
        target,
    )
    try:
        with get_warehouse_session(schema, dw_id=dw_id, credentials=credentials) as session:
            yield session
    except (OperationalError, DBAPIError, Exception) as e:
        if is_connection_error(e):
            raise WarehouseConnectionFailedError(
                (
                    f"Data warehouse connection failed for dw_id={dw_id!r}. "
                    f"Check system_datawarehouse.dw_connection_details JSON: db_host_address, db_port (e.g. MAMP uses 8889), db_user, db_password. "
                    f"Original: {e}"
                ),
                target=target,
            ) from e
        raise


# ---------------------------------------------------------------------------
# Per-DW language info cache (Redis-backed; avoids repeated ut_language queries)
# ---------------------------------------------------------------------------

_DW_LANG_CACHE_KEY = "dw:languages:{dw_id}"
_DW_LANG_CACHE_TTL = 300  # seconds; always invalidated immediately on language create/delete


class _DwLanguageInfo(NamedTuple):
    codes: List[str]    # all registered language_codes for this DW
    default_code: str   # language_code where language_default=True (or first/fallback)


def get_cached_dw_language_info(dw_id: str) -> _DwLanguageInfo:
    """
    Return language codes and default code for the DW.
    Reads from Redis when available; falls back to a live ut_language query on a cache miss.
    """
    key = _DW_LANG_CACHE_KEY.format(dw_id=dw_id)
    cached = cache_get(key)
    if cached is not None:
        return _DwLanguageInfo(codes=cached["codes"], default_code=cached["default_code"])

    with get_warehouse_session_from_id(dw_id) as dw_db:
        languages = dw_db.query(Language).all()

    codes = [lang.language_code for lang in languages if lang.language_code]
    default_lang = next((lang for lang in languages if lang.language_default), None)
    default_code = (
        default_lang.language_code
        if default_lang and default_lang.language_code
        else (codes[0] if codes else "en")
    )
    cache_set(key, {"codes": codes, "default_code": default_code}, ttl_seconds=_DW_LANG_CACHE_TTL)
    return _DwLanguageInfo(codes=codes, default_code=default_code)


def invalidate_dw_language_cache(dw_id: str) -> None:
    """Evict the language cache entry for a DW. Call after create_language / delete_language."""
    cache_delete_pattern(_DW_LANG_CACHE_KEY.format(dw_id=dw_id))


def validate_dw_id(
    dw_id: str = Path(..., description="Data warehouse identifier")
) -> str:
    """
    FastAPI dependency that validates dw_id exists in system_datawarehouse.
    Use on every data warehouse route so 404 is raised before the handler runs.
    Raises HTTPException 404 if dw_id not found. Returns dw_id on success.
    """
    get_warehouse_credentials(dw_id)
    return dw_id


def get_dw_db(
    dw_id: str = Path(..., description="Data warehouse identifier")
) -> Generator[Session, None, None]:
    """
    FastAPI dependency for Data Warehouse session.
    Looks up credentials by dw_id and uses get_warehouse_session.
    Raises HTTPException 404 if dw_id not found, 503 if connection fails.
    
    Usage:
        @router.get("/{dw_id}/search")
        def search(dw_id: str, dw_db: Session = Depends(get_dw_db)):
            # dw_db is bound to the DW specified by dw_id
    """
    try:
        credentials = get_warehouse_credentials(dw_id)
    except AppException:
        raise
    schema = credentials_to_schema(credentials)
    try:
        with get_warehouse_session(schema, dw_id=dw_id, credentials=credentials) as session:
            yield session
    except (OperationalError, DBAPIError, Exception) as e:
        if is_connection_error(e):
            raise ServiceUnavailable(
                "Data warehouse connection failed. "
                "Check system_datawarehouse.dw_connection_details JSON: db_host_address, db_port, db_user, db_password.",
                public_message=(
                    "Data warehouse connection failed. "
                    "Check system_datawarehouse.dw_connection_details JSON: db_host_address, db_port, db_user, db_password."
                ),
                error_code="DATAWAREHOUSE_CONNECTION_FAILED",
            ) from e
        raise


def get_dw_language_code(
    dw_id: str = Path(..., description="Data warehouse identifier"),
    accept_language: Optional[str] = Header(
        None,
        alias="Accept-Language",
        description="Language code for translations (e.g., 'en', 'fr', 'ar'). Defaults to the DW's default language if not provided.",
    ),
) -> str:
    """
    FastAPI dependency that resolves the language code for a specific data warehouse.

    - If no Accept-Language header is provided, returns the language marked as default
      in the DW's ut_language table (falls back to the first registered language, then 'en').
    - If a header is provided, normalises it and validates it exists in ut_language,
      raising HTTP 400 if not found.

    Usage in routers:
        @router.get("/{dw_id}/endpoint")
        async def endpoint(language_code: str = Depends(get_dw_language_code)):
            ...
    """
    info = get_cached_dw_language_info(dw_id)
    if accept_language is None:
        return info.default_code
    normalized = normalize_language_code(accept_language)
    if normalized not in info.codes:
        raise BadRequest(
            f"Language '{normalized}' is not registered in this data warehouse.",
            error_code="LANGUAGE_NOT_REGISTERED",
        )
    return normalized

