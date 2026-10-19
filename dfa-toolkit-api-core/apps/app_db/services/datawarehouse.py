"""
Core service for datawarehouse operations - CRUD on system_datawarehouse table and warehouse creation
"""
import json
import logging
import os
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from apps.app_db.models.core import IamUser, SystemDatawarehouse
from apps.shared.exceptions import Conflict
from apps.app_db.schemas.core import (
    SystemDatawarehouseCreateSchema,
    SystemDatawarehouseUpdateSchema,
    DatabaseConnectionSchema,
    DatabaseSource,
    ConnectionTestResultSchema,
    DatawarehouseConnectionDataSchema,
    SystemDatawarehousePublicSchema,
    CreateWarehouseResultSchema,
)
from apps.app_db.db.core import SessionLocal
from apps.datawarehouse.services.sql_dump_service import (
    get_sql_dump_basename,
    list_existing_sql_dump_basenames,
    sql_dump_file_exists,
)
from apps.shared.utils.database_connection import (
    create_database_if_not_exists,
    execute_sql_statements,
    validate_connection,
    verify_connection_with_result,
)
from apps.shared.utils.sql_adapter import adapt_mysql_to_postgresql, split_sql_statements
from apps.shared.utils.sql_generator import filter_schema_by_languages
from apps.shared.utils.password_encryption import encrypt_password, decrypt_password
from apps.shared.config.config import settings
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)


class SystemDatawarehouseService:
    """
    Service for system datawarehouse operations:
    - CRUD operations on system_datawarehouse table
    - Creating data warehouse databases
    """
    
    def __init__(self):
        """Initialize the service"""
        # Get the path to the schema file for warehouse creation
        self.base_path = Path(__file__).parent.parent
        self.schema_file = self.base_path / "SQL" / "schema_di7_mysql.sql"
        self.search_schema_file = self.base_path / "SQL" / "schema_search_mysql.sql"

    def _get_search_schema_statements(self, db_source: DatabaseSource) -> list[str]:
        """Load and prepare search tables DDL for the given database source."""
        if not self.search_schema_file.is_file():
            raise FileNotFoundError(f"Search schema file not found: {self.search_schema_file}")
        sql = self.search_schema_file.read_text(encoding="utf-8")
        return self.prepare_sql_for_database(sql, db_source)

    # ------------------------------------------------------------------
    # Connection JSON helpers
    # ------------------------------------------------------------------

    def _build_connection_json(
        self,
        db_source_type: str,
        db_host_address: str,
        db_user: str,
        encrypted_password: str,
        db_database: str,
        db_port: Optional[str] = None,
    ) -> str:
        """Serialize connection fields to a JSON string for storage in dw_connection_details."""
        return json.dumps({
            "db_source_type": db_source_type,
            "db_host_address": db_host_address,
            "db_user": db_user,
            "db_password": encrypted_password,
            "db_port": db_port,
            "db_database": db_database,
        })

    def _parse_connection_details(self, dw: SystemDatawarehouse) -> dict:
        """
        Parse dw_connection_details JSON and return a flat dict with all connection fields.
        Decrypts the stored password; falls back to plain-text if decryption fails (legacy support).
        """
        try:
            details: dict = json.loads(dw.dw_connection_details or "{}")
        except (json.JSONDecodeError, TypeError):
            details = {}

        enc_key = getattr(settings, "PASSWORD_ENCRYPTION_KEY", "") or ""
        raw_password = details.get("db_password", "")
        decrypted_password = decrypt_password(raw_password, settings.SECRET_KEY, enc_key)
        if not decrypted_password and (raw_password or "").strip():
            decrypted_password = raw_password  # legacy plain-text fallback

        return {
            "dw_connection_name": dw.dw_connection_name,
            "db_source_type": details.get("db_source_type", ""),
            "db_host_address": details.get("db_host_address", ""),
            "db_user": details.get("db_user", ""),
            "db_password": decrypted_password,
            "db_port": details.get("db_port"),
            "db_database": details.get("db_database", ""),
            "dw_default_language": dw.dw_default_language,
            "is_active": dw.is_active,
            "dw_metadata_desc": dw.dw_metadata_desc,
            "created_user_id": dw.created_user_id,
            "modified_user_id": dw.modified_user_id,
        }

    def create_datawarehouse(
        self,
        datawarehouse_data: SystemDatawarehouseCreateSchema,
        current_user_id: int = 0
    ) -> Dict[str, Any]:
        """
        Create a new system datawarehouse record.
        
        Args:
            datawarehouse_data: Datawarehouse data to create
            
        Returns:
            Dictionary with created datawarehouse data
        """
        db: Session = SessionLocal()
        try:
            logger.info(f"Creating system datawarehouse '{datawarehouse_data.dw_connection_name}'")
            enc_key = getattr(settings, "PASSWORD_ENCRYPTION_KEY", "") or ""
            encrypted_password = encrypt_password(
                datawarehouse_data.db_password,
                settings.SECRET_KEY,
                enc_key,
            )
            connection_json = self._build_connection_json(
                db_source_type=datawarehouse_data.db_source_type,
                db_host_address=datawarehouse_data.db_host_address,
                db_user=datawarehouse_data.db_user,
                encrypted_password=encrypted_password,
                db_database=datawarehouse_data.db_database,
                db_port=datawarehouse_data.db_port,
            )
            datawarehouse = SystemDatawarehouse(
                dw_connection_name=datawarehouse_data.dw_connection_name,
                dw_connection_details=connection_json,
                dw_default_language=datawarehouse_data.dw_default_language,
                is_active=datawarehouse_data.is_active,
                dw_metadata_desc=datawarehouse_data.dw_metadata_desc,
                created_user_id=current_user_id,
                modified_user_id=current_user_id,
                created=datetime.utcnow(),
                dw_data_count=0,
                dw_area_count=0,
                dw_ind_count=0,
                dw_ius_count=0,
                dw_time_count=0,
                dw_source_count=0,
            )
            
            db.add(datawarehouse)
            db.commit()
            db.refresh(datawarehouse)
            
            logger.info(f"Created system datawarehouse with ID: {datawarehouse.id}")
            
            return self._datawarehouse_to_dict(datawarehouse, db)
            
        except IntegrityError as e:
            db.rollback()
            log_background_incident(
                f"Integrity error creating datawarehouse: {e}",
                error_code="INTEGRITY_ERROR",
                exc=e,
                source="apps.app_db.services.datawarehouse",
            )
            raise Conflict(f"Datawarehouse with this name or database already exists: {str(e)}")
        except Exception as e:
            db.rollback()
            log_background_incident(
                f"Error creating datawarehouse: {e}",
                error_code="CREATE_DATAWAREHOUSE_FAILED",
                exc=e,
                source="apps.app_db.services.datawarehouse",
            )
            raise
        finally:
            db.close()

    def test_datawarehouse_connection(
        self,
        datawarehouse_data: SystemDatawarehouseCreateSchema,
    ) -> Dict[str, Any]:
        """
        Test database connection using datawarehouse connection details.

        Args:
            datawarehouse_data: Datawarehouse data containing connection details.

        Returns:
            Dict with "connected" (bool) and "message" (str).
            On success: {"connected": True, "message": "Connection successful"}.
            On failure: {"connected": False, "message": "<reason>"}.
        """
        try:
            db_source_type = (datawarehouse_data.db_source_type or "").strip().lower()
            if db_source_type == "mysql":
                db_source = DatabaseSource.MYSQL
                default_port = 3306
            elif db_source_type == "postgresql":
                db_source = DatabaseSource.POSTGRESQL
                default_port = 5432
            else:
                return ConnectionTestResultSchema(
                    connected=False,
                    message=f"Unsupported database source type: {datawarehouse_data.db_source_type}",
                ).model_dump()

            port_str = datawarehouse_data.db_port
            try:
                port = int(port_str) if port_str else default_port
            except (ValueError, TypeError):
                port = default_port

            result = verify_connection_with_result(
                db_source=db_source,
                host=datawarehouse_data.db_host_address,
                port=port,
                user=datawarehouse_data.db_user,
                password=datawarehouse_data.db_password,
                database=datawarehouse_data.db_database,
            )
            return ConnectionTestResultSchema(**result).model_dump()
        except Exception as e:
            log_background_incident(
                f"Error testing datawarehouse connection: {e}",
                error_code="CONNECTION_TEST_FAILED",
                exc=e,
                source="apps.app_db.services.datawarehouse",
            )
            return ConnectionTestResultSchema(connected=False, message=str(e)).model_dump()

    def get_datawarehouse_by_id(
        self,
        datawarehouse_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get a datawarehouse by ID.
        
        Args:
            datawarehouse_id: Datawarehouse ID
            
        Returns:
            Datawarehouse data or None if not found
        """
        db: Session = SessionLocal()
        try:
            datawarehouse = db.query(SystemDatawarehouse).filter(
                SystemDatawarehouse.id == datawarehouse_id
            ).first()
            
            if not datawarehouse:
                return None

            result = self._datawarehouse_to_dict(datawarehouse, db)
            result["has_sql_dump"] = self._resolve_has_sql_dump(result)
            return result
        finally:
            db.close()

    def get_datawarehouse_connection_data(
        self,
        datawarehouse_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get datawarehouse connection fields including decrypted password (for internal use only).
        Used when building connection test payload for update flow.
        """
        db: Session = SessionLocal()
        try:
            datawarehouse = db.query(SystemDatawarehouse).filter(
                SystemDatawarehouse.id == datawarehouse_id
            ).first()
            if not datawarehouse:
                return None
            parsed = self._parse_connection_details(datawarehouse)
            return DatawarehouseConnectionDataSchema(**parsed).model_dump()
        finally:
            db.close()

    def get_warehouse_connection_params(self, datawarehouse_id: int) -> Optional[Dict[str, Any]]:
        """
        Build connection kwargs for raw drivers (mysql.connector, etc.) from system_datawarehouse.

        Returns None if the warehouse row does not exist. Includes any db_source_type (mysql, postgresql, …).
        """
        data = self.get_datawarehouse_connection_data(datawarehouse_id)
        if not data:
            return None
        try:
            port = int(data.get("db_port") or 3306)
        except (TypeError, ValueError):
            port = 3306
        return {
            "db_database": data.get("db_database", ""),
            "db_host_address": data.get("db_host_address", ""),
            "db_port": port,
            "db_user": data.get("db_user", ""),
            "db_password": data.get("db_password", ""),
            "db_source_type": (data.get("db_source_type") or "").strip().lower(),
            "dw_default_language": (data.get("dw_default_language") or "en").strip().lower(),
        }

    def get_mysql_warehouse_connection_params(self, datawarehouse_id: int) -> Optional[Dict[str, Any]]:
        """
        Same as get_warehouse_connection_params but returns None when the warehouse is not MySQL
        or does not exist (for db_configuration and other MySQL-only warehouse paths).
        """
        params = self.get_warehouse_connection_params(datawarehouse_id)
        if not params:
            return None
        if (params.get("db_source_type") or "").strip().lower() != "mysql":
            return None
        return params

    def get_datawarehouse_connection_data_by_database_name(
        self,
        db_database: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get datawarehouse connection fields including decrypted password by database name.
        For use when connecting to the warehouse (e.g. indicator/unit APIs).
        db_database is stored inside dw_connection_details JSON, so we load all rows
        and filter in Python (table is small).
        """
        db: Session = SessionLocal()
        try:
            all_dw = db.query(SystemDatawarehouse).all()
            for dw in all_dw:
                try:
                    details = json.loads(dw.dw_connection_details or "{}")
                except (json.JSONDecodeError, TypeError):
                    details = {}
                if details.get("db_database") == db_database:
                    parsed = self._parse_connection_details(dw)
                    return DatawarehouseConnectionDataSchema(**parsed).model_dump()
            return None
        finally:
            db.close()

    def resolve_datawarehouse_id(self, dw_id: str) -> Optional[int]:
        """
        Resolve system_datawarehouse.id from a route dw_id (numeric string or db_database name).

        Matches the lookup order used by get_warehouse_credentials: by id when dw_id is all digits,
        otherwise by db_database in dw_connection_details JSON.
        """
        db: Session = SessionLocal()
        try:
            if dw_id.isdigit():
                row = (
                    db.query(SystemDatawarehouse)
                    .filter(SystemDatawarehouse.id == int(dw_id))
                    .first()
                )
                return row.id if row else None
            for dw in db.query(SystemDatawarehouse).all():
                try:
                    details = json.loads(dw.dw_connection_details or "{}")
                except (json.JSONDecodeError, TypeError):
                    details = {}
                if details.get("db_database") == dw_id:
                    return dw.id
            return None
        finally:
            db.close()

    def get_all_datawarehouses(
        self,
        skip: int = 0,
        limit: int = 100,
        active_only: bool = False,
        dw_ids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get all datawarehouses with pagination.

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            active_only: If True, only return active datawarehouses
            dw_ids: When provided, restricts results to this explicit set of IDs.
                    Pass None to return all (super-admin / unrestricted access).
                    Pass an empty list to return nothing (user has no DW access).

        Returns:
            List of datawarehouse dictionaries
        """
        if dw_ids is not None and len(dw_ids) == 0:
            return []

        db: Session = SessionLocal()
        try:
            query = db.query(SystemDatawarehouse)

            if active_only:
                query = query.filter(SystemDatawarehouse.is_active == True)

            if dw_ids is not None:
                query = query.filter(SystemDatawarehouse.id.in_(dw_ids))

            datawarehouses = query.order_by(SystemDatawarehouse.id).offset(skip).limit(limit).all()

            modifier_ids = {
                dw.modified_user_id
                for dw in datawarehouses
                if dw.modified_user_id not in (None, 0)
            }
            modifier_usernames: Dict[int, str] = {}
            if modifier_ids:
                for u in db.query(IamUser).filter(IamUser.id.in_(modifier_ids)).all():
                    modifier_usernames[u.id] = u.username

            existing_dump_basenames = list_existing_sql_dump_basenames()
            results = []
            for dw in datawarehouses:
                item = self._datawarehouse_to_dict(dw, db, modifier_usernames=modifier_usernames)
                item["has_sql_dump"] = self._resolve_has_sql_dump(
                    item,
                    existing_dump_basenames=existing_dump_basenames,
                )
                results.append(item)
            return results
        finally:
            db.close()
    
    def update_datawarehouse(
        self,
        datawarehouse_id: int,
        datawarehouse_data: SystemDatawarehouseUpdateSchema,
        current_user_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Update a datawarehouse.
        
        Args:
            datawarehouse_id: Datawarehouse ID to update
            datawarehouse_data: Updated datawarehouse data
            current_user_id: Current user ID
        Returns:
            Updated datawarehouse data or None if not found
        """
        db: Session = SessionLocal()
        try:
            datawarehouse = db.query(SystemDatawarehouse).filter(
                SystemDatawarehouse.id == datawarehouse_id
            ).first()
            
            if not datawarehouse:
                logger.warning(f"Datawarehouse {datawarehouse_id} not found for update")
                return None
            
            update_data = datawarehouse_data.model_dump(exclude_unset=True)
            enc_key = getattr(settings, "PASSWORD_ENCRYPTION_KEY", "") or ""

            # Handle dw_connection_name separately
            if "dw_connection_name" in update_data:
                datawarehouse.dw_connection_name = update_data.pop("dw_connection_name")

            # Connection detail fields live inside the JSON blob
            connection_fields = {
                "db_source_type", "db_host_address", "db_user",
                "db_password", "db_port", "db_database",
            }
            connection_updates = {k: update_data.pop(k) for k in connection_fields if k in update_data}
            if connection_updates:
                try:
                    current_details: dict = json.loads(datawarehouse.dw_connection_details or "{}")
                except (json.JSONDecodeError, TypeError):
                    current_details = {}
                old_db_name = current_details.get("db_database")
                current_details.update(connection_updates)
                if "db_password" in connection_updates and connection_updates["db_password"]:
                    current_details["db_password"] = encrypt_password(
                        connection_updates["db_password"], settings.SECRET_KEY, enc_key
                    )
                datawarehouse.dw_connection_details = json.dumps(current_details)
                from apps.datawarehouse.db.datawarehouse import (
                    dispose_dw_engine,
                    invalidate_dw_credentials_cache,
                )

                invalidate_dw_credentials_cache(str(datawarehouse_id))
                if old_db_name:
                    invalidate_dw_credentials_cache(old_db_name)
                new_db_name = current_details.get("db_database")
                if new_db_name and new_db_name != old_db_name:
                    invalidate_dw_credentials_cache(new_db_name)
                dispose_dw_engine(str(datawarehouse_id))

            # Remaining scalar fields (dw_default_language, is_active, dw_metadata_desc, counts…)
            update_data["modified_user_id"] = current_user_id
            for field, value in update_data.items():
                if hasattr(datawarehouse, field):
                    setattr(datawarehouse, field, value)

            datawarehouse.modified = datetime.utcnow()
            
            db.commit()
            db.refresh(datawarehouse)
            
            logger.info(f"Updated datawarehouse {datawarehouse_id}")
            return self._datawarehouse_to_dict(datawarehouse, db)
            
        except IntegrityError as e:
            db.rollback()
            log_background_incident(
                f"Integrity error updating datawarehouse: {e}",
                error_code="INTEGRITY_ERROR",
                exc=e,
                source="apps.app_db.services.datawarehouse",
            )
            raise ValueError(f"Update failed: {str(e)}")
        except Exception as e:
            db.rollback()
            log_background_incident(
                f"Error updating datawarehouse: {e}",
                error_code="UPDATE_DATAWAREHOUSE_FAILED",
                exc=e,
                source="apps.app_db.services.datawarehouse",
            )
            raise
        finally:
            db.close()
    
    def delete_datawarehouse(
        self,
        datawarehouse_id: int
    ) -> bool:
        """
        Delete a datawarehouse.
        
        Args:
            datawarehouse_id: Datawarehouse ID to delete
            
        Returns:
            True if deleted, False if not found
        """
        db: Session = SessionLocal()
        try:
            datawarehouse = db.query(SystemDatawarehouse).filter(
                SystemDatawarehouse.id == datawarehouse_id
            ).first()
            
            if not datawarehouse:
                logger.warning(f"Datawarehouse {datawarehouse_id} not found for deletion")
                return False
            
            db.delete(datawarehouse)
            db.commit()
            
            logger.info(f"Deleted datawarehouse {datawarehouse_id}")
            return True
            
        except Exception as e:
            db.rollback()
            log_background_incident(
                f"Error deleting datawarehouse: {e}",
                error_code="DELETE_DATAWAREHOUSE_FAILED",
                exc=e,
                source="apps.app_db.services.datawarehouse",
            )
            raise
        finally:
            db.close()
    
    @staticmethod
    def _resolve_has_sql_dump(
        item: Dict[str, Any],
        *,
        existing_dump_basenames: Optional[set[str]] = None,
    ) -> bool:
        creds = {
            "dw_connection_name": item.get("dw_connection_name"),
            "db_database": item.get("db_database"),
            "db_source_type": item.get("db_source_type"),
        }
        db_type = (creds.get("db_source_type") or "").strip().lower()
        if db_type not in ("mysql", "mariadb"):
            return False
        if existing_dump_basenames is not None:
            basename = get_sql_dump_basename(creds, dw_id=str(item["id"]))
            return basename in existing_dump_basenames
        return sql_dump_file_exists(creds, dw_id=str(item["id"]))

    def _datawarehouse_to_dict(
        self,
        datawarehouse: SystemDatawarehouse,
        db: Session,
        *,
        modifier_usernames: Optional[Dict[int, str]] = None,
    ) -> Dict[str, Any]:
        """Convert datawarehouse model to dict for API response. Parses connection JSON; excludes password."""
        try:
            details: dict = json.loads(datawarehouse.dw_connection_details or "{}")
        except (json.JSONDecodeError, TypeError):
            details = {}

        uid = datawarehouse.modified_user_id
        modified_by_username: Optional[str] = None
        if uid not in (None, 0):
            if modifier_usernames is not None:
                modified_by_username = modifier_usernames.get(uid)
            else:
                user = db.query(IamUser).filter(IamUser.id == uid).first()
                modified_by_username = user.username if user else None

        return SystemDatawarehousePublicSchema(
            id=datawarehouse.id,
            dw_connection_name=datawarehouse.dw_connection_name,
            db_source_type=details.get("db_source_type", ""),
            db_host_address=details.get("db_host_address", ""),
            db_user=details.get("db_user", ""),
            db_port=details.get("db_port"),
            db_database=details.get("db_database", ""),
            dw_default_language=datawarehouse.dw_default_language,
            is_active=datawarehouse.is_active,
            created=datawarehouse.created.isoformat() if datawarehouse.created else None,
            created_user_id=datawarehouse.created_user_id,
            modified=datawarehouse.modified.isoformat() if datawarehouse.modified else None,
            modified_by_username=modified_by_username,
            has_sql_dump=False,
        ).model_dump()
    
    def get_schema_sql(self) -> str:
        """
        Load the SQL schema file for warehouse creation
        
        Returns:
            SQL schema content as string
        """
        try:
            with open(self.schema_file, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            log_background_incident(
                f"Schema file not found: {self.schema_file}",
                error_code="SCHEMA_FILE_NOT_FOUND",
                source="apps.app_db.services.datawarehouse",
            )
            raise FileNotFoundError(f"Schema file not found: {self.schema_file}")
        except Exception as e:
            log_background_incident(
                f"Error reading schema file: {e}",
                error_code="SCHEMA_FILE_READ_FAILED",
                exc=e,
                source="apps.app_db.services.datawarehouse",
            )
            raise
    
    def prepare_sql_for_database(self, sql: str, db_source: DatabaseSource) -> list[str]:
        """
        Prepare SQL statements for the target database
        
        Args:
            sql: Raw SQL string
            db_source: Target database type
            
        Returns:
            List of SQL statements ready for execution
        """
        if db_source == DatabaseSource.POSTGRESQL:
            # Adapt MySQL SQL to PostgreSQL
            sql = adapt_mysql_to_postgresql(sql)
        
        # Split into individual statements
        statements = split_sql_statements(sql)
        
        # Filter out empty statements
        statements = [s for s in statements if s.strip() and not s.strip().startswith('--')]
        
        logger.info(f"Prepared {len(statements)} SQL statements for {db_source.value}")
        return statements
    
    def count_tables_created(self, sql_statements: list[str]) -> int:
        """
        Count the number of CREATE TABLE statements
        
        Args:
            sql_statements: List of SQL statements
            
        Returns:
            Number of CREATE TABLE statements
        """
        count = 0
        for statement in sql_statements:
            if statement.strip().upper().startswith('CREATE TABLE'):
                count += 1
        return count
    
    def create_warehouse(
        self,
        connection_data: DatabaseConnectionSchema,
        dw_connection_name: Optional[str] = None,
        dw_default_language: str = 'en',
        created_user_id: int = 0
    ) -> Dict[str, Any]:
        """
        Create a data warehouse database with the schema and save credentials to system_datawarehouse

        Args:
            connection_data: Database connection details
            dw_connection_name: Optional display name for the datawarehouse (defaults to database name)
            dw_default_language: Default language for the datawarehouse (default: 'en')
            created_user_id: Optional user ID who created the warehouse

        Returns:
            Dictionary with creation results including system_datawarehouse ID
        """
        logger.info(f"Starting warehouse creation for database: {connection_data.db_database}")
        logger.info(f"Using database host: {connection_data.db_host}, port: {connection_data.db_port}, user: {connection_data.db_login}")
        
        # Validate connection first
        logger.info("Validating database connection...")
        try:
            if not validate_connection(
                connection_data.db_source,
                connection_data.db_host,
                connection_data.db_port,
                connection_data.db_login,
                connection_data.db_password
            ):
                raise ValueError("Invalid database credentials or connection failed")
        except Exception as e:
            err_str = str(e).lower()
            if "1045" in err_str or "access denied" in err_str:
                hint = (
                    " MySQL rejected the login. Check db_login and db_password in the request body match your MySQL user."
                )
            else:
                hint = (
                    " If the API runs in Docker and MySQL is on your host: use db_host=host.docker.internal, "
                    "ensure MySQL listens on all interfaces (bind-address = 0.0.0.0 in my.cnf). "
                    "MAMP often uses port 8889 for MySQL."
                )
            raise ValueError(f"Could not connect to MySQL at {connection_data.db_host}:{connection_data.db_port}. {str(e)}.{hint}")
        
        # Create database if it doesn't exist
        logger.info(f"Creating database '{connection_data.db_database}' if it doesn't exist...")
        create_database_if_not_exists(
            connection_data.db_source,
            connection_data.db_host,
            connection_data.db_port,
            connection_data.db_login,
            connection_data.db_password,
            connection_data.db_database
        )
        
        # Load and prepare SQL schema
        logger.info("Loading SQL schema...")
        sql_content = self.get_schema_sql()
        
        # Filter schema to only create locale tables for configured languages
        logger.info("Filtering schema by configured languages...")
        available_languages = settings.get_available_languages()
        sql_content = filter_schema_by_languages(sql_content, available_languages)
        
        logger.info("Preparing SQL statements for target database...")
        sql_statements = self.prepare_sql_for_database(sql_content, connection_data.db_source)
        
        # Count tables that will be created
        tables_count = self.count_tables_created(sql_statements)
        
        # Execute SQL statements
        logger.info(f"Executing {len(sql_statements)} SQL statements...")
        executed_count = execute_sql_statements(
            connection_data.db_source,
            connection_data.db_host,
            connection_data.db_port,
            connection_data.db_login,
            connection_data.db_password,
            connection_data.db_database,
            sql_statements
        )
        
        # Create search tables (search_keywords, search_keyword_synonym, search_keyword_ngram)
        logger.info("Creating search tables...")
        search_statements = self._get_search_schema_statements(connection_data.db_source)
        search_tables_count = self.count_tables_created(search_statements)
        search_executed = execute_sql_statements(
            connection_data.db_source,
            connection_data.db_host,
            connection_data.db_port,
            connection_data.db_login,
            connection_data.db_password,
            connection_data.db_database,
            search_statements,
        )
        logger.info(f"Search tables created: {search_executed} statements executed")

        logger.info(f"Warehouse creation completed for database: {connection_data.db_database}")

        # Save credentials to system_datawarehouse table
        logger.info("Saving warehouse credentials to system_datawarehouse...")
        try:
            connection_name = dw_connection_name or connection_data.db_connection_name or connection_data.db_database

            datawarehouse_data = SystemDatawarehouseCreateSchema(
                dw_connection_name=connection_name,
                db_source_type=connection_data.db_source.value,
                db_host_address=connection_data.db_host,
                db_user=connection_data.db_login,
                db_password=connection_data.db_password,
                db_port=str(connection_data.db_port),
                db_database=connection_data.db_database,
                dw_default_language=dw_default_language,
                is_active=True,
                created_user_id=created_user_id or 0
            )
            
            saved_datawarehouse = self.create_datawarehouse(datawarehouse_data)
            logger.info(f"Saved warehouse credentials to system_datawarehouse with ID: {saved_datawarehouse['id']}")
            
        except Exception as e:
            logger.warning(f"Failed to save warehouse credentials to system_datawarehouse: {str(e)}")
            # Don't fail the entire operation if saving credentials fails
            # The warehouse was created successfully, just the metadata save failed
            saved_datawarehouse = None
        
        total_executed = executed_count + search_executed
        return CreateWarehouseResultSchema(
            database_name=connection_data.db_database,
            tables_created=tables_count,
            search_tables_created=search_tables_count,
            statements_executed=total_executed,
            total_statements=len(sql_statements) + len(search_statements),
            db_source=connection_data.db_source.value,
            status="success" if total_executed > 0 else "partial",
            system_datawarehouse_id=saved_datawarehouse["id"] if saved_datawarehouse else None,
        ).model_dump()