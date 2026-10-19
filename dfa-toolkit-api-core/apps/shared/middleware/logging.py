"""
Logging configuration
"""
import logging
import sys
from apps.shared.config.config import settings


def setup_logging():
    """Configure application logging"""
    # Base configuration with console handler
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper()),
        format=settings.LOG_FORMAT,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Set log levels for specific libraries
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    # logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DB_ECHO else logging.WARNING
    )

    if settings.DB_LOG_LEVELS.strip():
        logging.info(
            "DB_LOG_LEVELS is set; server error rows are written via log_event/write_log_to_db "
            "when the resolved level matches: %s",
            settings.DB_LOG_LEVELS,
        )
