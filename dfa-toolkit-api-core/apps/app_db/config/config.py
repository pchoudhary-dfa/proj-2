"""
App DB (Core) specific configuration.
Loads from root .env only (ADAPTATION and DB_* variables).
"""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppDBSettings(BaseSettings):
    """App DB specific settings loaded from environment variables. All required; no defaults."""

    # Database Configuration (MySQL only) - required, no defaults
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_CHARSET: str = "utf8mb4"
    DB_COLLATION: str = "utf8mb4_0900_ai_ci"

    # Database Connection Pool Settings - required
    DB_ECHO: bool
    DB_POOL_SIZE: int
    DB_MAX_OVERFLOW: int
    DB_POOL_RECYCLE: int = 1800  # Recycle connections after 30 minutes
    DB_POOL_TIMEOUT: int = 30    # Raise after 30s if no connection available

    # Response adaptation for APIs (e.g. indicator, unit, area request/response keys).
    # Missing/empty or "external" = mapped keys (i_nid, u_nid, etc.). "internal" = internal keys.
    ADAPTATION: str = ""

    def get_database_url(self) -> str:
        """Construct MySQL database URL from individual components"""
        password_part = f":{self.DB_PASSWORD}" if self.DB_PASSWORD else ""
        return (
            f"mysql+mysqlconnector://{self.DB_USER}{password_part}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            f"?charset={self.DB_CHARSET}"
        )
    
    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


root_env_file = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "..", ".env"))

if os.path.exists(root_env_file):
    app_db_settings = AppDBSettings(_env_file=root_env_file)
else:
    app_db_settings = AppDBSettings()
