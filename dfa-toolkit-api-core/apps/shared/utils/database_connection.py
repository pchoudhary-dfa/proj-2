"""
Database connection utilities for MySQL and PostgreSQL
"""
import logging
from typing import Optional
from contextlib import contextmanager

import pymysql
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from apps.app_db.schemas.core import DatabaseSource
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)
_SOURCE = "apps.shared.utils.database_connection"


@contextmanager
def create_mysql_connection(
    host: str,
    port: int,
    user: str,
    password: str,
    database: Optional[str] = None
):
    """
    Create a MySQL database connection
    
    Args:
        host: Database host
        port: Database port
        user: Database username
        password: Database password
        database: Optional database name
        
    Yields:
        MySQL connection object
    """
    connection = None
    try:
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )
        logger.info(f"MySQL connection established to {host}:{port}")
        yield connection
    except Exception as e:
        log_background_incident(
            f"MySQL connection error: {e}",
            error_code="MYSQL_CONNECTION_FAILED",
            exc=e,
            source=_SOURCE,
        )
        raise
    finally:
        if connection:
            connection.close()
            logger.info("MySQL connection closed")


@contextmanager
def create_postgresql_connection(
    host: str,
    port: int,
    user: str,
    password: str,
    database: Optional[str] = None
):
    """
    Create a PostgreSQL database connection
    
    Args:
        host: Database host
        port: Database port
        user: Database username
        password: Database password
        database: Optional database name
        
    Yields:
        PostgreSQL connection object
    """
    connection = None
    try:
        connection = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database
        )
        connection.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        logger.info(f"PostgreSQL connection established to {host}:{port}")
        yield connection
    except Exception as e:
        log_background_incident(
            f"PostgreSQL connection error: {e}",
            error_code="POSTGRESQL_CONNECTION_FAILED",
            exc=e,
            source=_SOURCE,
        )
        raise
    finally:
        if connection:
            connection.close()
            logger.info("PostgreSQL connection closed")


def create_database_if_not_exists(
    db_source: DatabaseSource,
    host: str,
    port: int,
    user: str,
    password: str,
    database: str
) -> bool:
    """
    Create a database if it doesn't exist
    
    Args:
        db_source: Database type (mysql or postgresql)
        host: Database host
        port: Database port
        user: Database username
        password: Database password
        database: Database name to create
        
    Returns:
        True if database was created or already exists, False otherwise
    """
    try:
        if db_source == DatabaseSource.MYSQL:
            with create_mysql_connection(host, port, user, password) as conn:
                cursor = conn.cursor()
                # Check if database exists
                cursor.execute(f"SHOW DATABASES LIKE '{database}'")
                result = cursor.fetchone()
                
                if not result:
                    # Create database
                    cursor.execute(f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                    logger.info(f"MySQL database '{database}' created successfully")
                    return True
                else:
                    logger.info(f"MySQL database '{database}' already exists")
                    return True
                    
        elif db_source == DatabaseSource.POSTGRESQL:
            with create_postgresql_connection(host, port, user, password, "postgres") as conn:
                cursor = conn.cursor()
                # Check if database exists
                cursor.execute(
                    "SELECT 1 FROM pg_database WHERE datname = %s",
                    (database,)
                )
                result = cursor.fetchone()
                
                if not result:
                    # Create database
                    cursor.execute(f'CREATE DATABASE "{database}"')
                    logger.info(f"PostgreSQL database '{database}' created successfully")
                    return True
                else:
                    logger.info(f"PostgreSQL database '{database}' already exists")
                    return True
        else:
            raise ValueError(f"Unsupported database source: {db_source}")
            
    except Exception as e:
        log_background_incident(
            f"Error creating database '{database}': {e}",
            error_code="CREATE_DATABASE_FAILED",
            exc=e,
            source=_SOURCE,
        )
        raise


def execute_sql_statements(
    db_source: DatabaseSource,
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    sql_statements: list[str]
) -> int:
    """
    Execute a list of SQL statements
    
    Args:
        db_source: Database type
        host: Database host
        port: Database port
        user: Database username
        password: Database password
        database: Database name
        sql_statements: List of SQL statements to execute
        
    Returns:
        Number of statements executed successfully
    """
    executed_count = 0
    
    if db_source == DatabaseSource.MYSQL:
        with create_mysql_connection(host, port, user, password, database) as conn:
            cursor = conn.cursor()
            for i, statement in enumerate(sql_statements, 1):
                try:
                    if statement.strip():
                        cursor.execute(statement)
                        executed_count += 1
                        if i % 10 == 0:
                            logger.info(f"Executed {i} SQL statements...")
                except Exception as e:
                    logger.warning(f"Error executing statement {i}: {str(e)}")
                    logger.debug(f"Statement: {statement[:100]}...")
                    # Continue with next statement
                    continue
            conn.commit()
            
    elif db_source == DatabaseSource.POSTGRESQL:
        with create_postgresql_connection(host, port, user, password, database) as conn:
            cursor = conn.cursor()
            for i, statement in enumerate(sql_statements, 1):
                try:
                    if statement.strip():
                        cursor.execute(statement)
                        executed_count += 1
                        if i % 10 == 0:
                            logger.info(f"Executed {i} SQL statements...")
                except Exception as e:
                    logger.warning(f"Error executing statement {i}: {str(e)}")
                    logger.debug(f"Statement: {statement[:100]}...")
                    # Continue with next statement
                    continue
            conn.commit()
    else:
        raise ValueError(f"Unsupported database source: {db_source}")
    
    logger.info(f"Successfully executed {executed_count} out of {len(sql_statements)} SQL statements")
    return executed_count


def validate_connection(
    db_source: DatabaseSource,
    host: str,
    port: int,
    user: str,
    password: str,
    database: Optional[str] = None
) -> bool:
    """
    Validate database connection credentials

    Args:
        db_source: Database type
        host: Database host
        port: Database port
        user: Database username
        password: Database password
        database: Optional database name

    Returns:
        True if connection is valid, False otherwise
    """
    try:
        if db_source == DatabaseSource.MYSQL:
            with create_mysql_connection(host, port, user, password, database):
                return True
        elif db_source == DatabaseSource.POSTGRESQL:
            with create_postgresql_connection(host, port, user, password, database):
                return True
        else:
            return False
    except Exception as e:
        log_background_incident(
            f"Connection validation failed: {e}",
            error_code="CONNECTION_VALIDATION_FAILED",
            exc=e,
            source=_SOURCE,
        )
        return False


def verify_connection_with_result(
    db_source: DatabaseSource,
    host: str,
    port: int,
    user: str,
    password: str,
    database: Optional[str] = None
) -> dict:
    """
    Verify database connection and return a result with success status and message.

    Args:
        db_source: Database type (mysql or postgresql)
        host: Database host
        port: Database port
        user: Database username
        password: Database password
        database: Optional database name to connect to

    Returns:
        Dict with "connected" (bool) and "message" (str).
        On success: {"connected": True, "message": "Connection successful"}.
        On failure: {"connected": False, "message": "<reason>"}.
    """
    try:
        if db_source == DatabaseSource.MYSQL:
            with create_mysql_connection(host, port, user, password, database):
                return {"connected": True, "message": "Connection successful"}
        elif db_source == DatabaseSource.POSTGRESQL:
            with create_postgresql_connection(host, port, user, password, database):
                return {"connected": True, "message": "Connection successful"}
        else:
            return {
                "connected": False,
                "message": f"Unsupported database source: {db_source}",
            }
    except Exception as e:
        reason = str(e)
        log_background_incident(
            f"Connection test failed: {reason}",
            error_code="CONNECTION_TEST_FAILED",
            exc=e,
            source=_SOURCE,
        )
        return {"connected": False, "message": reason}

