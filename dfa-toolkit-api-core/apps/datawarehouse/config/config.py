"""
Data Warehouse App specific configuration.
Loads from app-specific .env or root .env. Runtime DB connections use system_datawarehouse table.
"""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatawarehouseSettings(BaseSettings):
    """Data Warehouse App settings. Only response/mapping options; no DB creds (connections are dynamic)."""

    # Optional path to db_tbl_cols_mapping.json (internal->external key mapping when ADAPTATION is not "internal")
    # If empty, uses apps/datawarehouse/config/db_tbl_cols_mapping.json
    DB_TBL_COLS_MAPPING_PATH: str = ""

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


_root_env = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "..", ".env"))
if os.path.exists(_root_env):
    datawarehouse_settings = DatawarehouseSettings(_env_file=_root_env)
else:
    datawarehouse_settings = DatawarehouseSettings()
