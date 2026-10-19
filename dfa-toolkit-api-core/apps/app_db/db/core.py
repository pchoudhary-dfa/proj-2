"""
Application database connection (from environment variables)
This connects to the main application database where user data, 
warehouse configurations, etc. are stored.
"""
from sqlalchemy import MetaData, Table, create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

from apps.app_db.config import app_db_settings

# Create database engine for application database
# Uses app-specific settings with separate DB variables (DB_HOST, DB_PORT, etc.)
engine = create_engine(
    app_db_settings.get_database_url(),
    echo=app_db_settings.DB_ECHO,
    pool_size=app_db_settings.DB_POOL_SIZE,
    max_overflow=app_db_settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,  # Verify connections before using
    pool_recycle=app_db_settings.DB_POOL_RECYCLE,  # Recycle connections after configured time
    pool_timeout=app_db_settings.DB_POOL_TIMEOUT,  # Raise after configured timeout
    connect_args={
        # Keep per-connection string comparison behavior aligned with DB defaults.
        "collation": app_db_settings.DB_COLLATION,
    },
)

# Create session factory for application database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base metadata + declarative base for application database models
metadata = MetaData()
Base = declarative_base(metadata=metadata)

# Register dashboard app-db audit listeners (mirrors DW pattern in datawarehouse/db/datawarehouse.py).
import apps.app_dashboard.utils.audit_events  # noqa: F401


@event.listens_for(Table, "after_parent_attach")
def _apply_mysql_defaults(table: Table, parent) -> None:
    """
    Ensure newly-created App DB tables use env-configured MySQL charset/collation
    unless the model explicitly sets mysql_charset/mysql_collate.
    """
    if table.metadata is not metadata:
        return
    mysql_opts = table.dialect_options["mysql"]
    if not mysql_opts.get("charset"):
        mysql_opts["charset"] = app_db_settings.DB_CHARSET
    if not mysql_opts.get("collate"):
        mysql_opts["collate"] = app_db_settings.DB_COLLATION



