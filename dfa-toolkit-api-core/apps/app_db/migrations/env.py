"""
Alembic environment configuration
"""
import sys
from pathlib import Path
from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import text
from sqlalchemy import pool
from alembic import context

# Add project root to Python path
# This file is at apps/app_db/migrations/env.py, so go up 3 levels to project root
project_root = Path(__file__).resolve().parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Import your models here for Alembic to detect them
from apps.app_db.db.core import Base
from apps.app_db.config import app_db_settings
# Import all core models so Alembic can detect them
from apps.app_db.models import *  # noqa
from apps.app_dashboard.models import *  # noqa  — dashboard tables in same DB

# this is the Alembic Config object
config = context.config

# Use app-specific database URL from separate DB variables
core_db_url = app_db_settings.get_database_url()
config.set_main_option("sqlalchemy.url", core_db_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here for 'autogenerate' support
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Enforce DB defaults so newly created tables/columns inherit expected charset/collation.
        connection.execute(
            text(
                f"ALTER DATABASE `{app_db_settings.DB_NAME}` "
                f"CHARACTER SET {app_db_settings.DB_CHARSET} "
                f"COLLATE {app_db_settings.DB_COLLATION}"
            )
        )
        # MySQL Workbench / local servers often enable sql_safe_updates, which
        # blocks migration DELETE/UPDATE statements that lack a KEY WHERE clause.
        connection.execute(text("SET SESSION sql_safe_updates = 0"))
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()
        # MySQL non-transactional DDL can leave SQLAlchemy's implicit transaction
        # open; explicitly commit so alembic_version updates are persisted.
        connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
