"""
Alembic environment configuration for Data Warehouse app
"""
import sys
from pathlib import Path
from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
import os

# Add project root to Python path
# This file is at apps/datawarehouse/migrations/env.py, so go up 3 levels to project root
project_root = Path(__file__).resolve().parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Import your models here for Alembic to detect them
from apps.app_db.db.core import Base
# Import all datawarehouse models so Alembic can detect them
from apps.datawarehouse.models import *  # noqa

# this is the Alembic Config object
config = context.config

# Migration target URL: set DATAWAREHOUSE_MIGRATION_URL when running alembic, or use alembic.ini sqlalchemy.url
datawarehouse_db_url = os.environ.get("DATAWAREHOUSE_MIGRATION_URL") or config.get_main_option("sqlalchemy.url")
config.set_main_option("sqlalchemy.url", datawarehouse_db_url)

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
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

