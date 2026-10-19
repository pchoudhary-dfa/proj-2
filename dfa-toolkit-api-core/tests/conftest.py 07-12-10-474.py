"""
Pytest configuration and fixtures for root tests directory.
"""
import os
import pytest
from pathlib import Path

# Ensure .env file is loaded for tests
# Get the project root directory (parent of tests/)
project_root = Path(__file__).parent.parent
env_file = project_root / ".env"

# Load environment variables from .env if it exists
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

# Import settings after environment is loaded
from apps.shared.config.config import settings


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """
    Setup test environment - ensures environment variables are loaded.
    This fixture runs once per test session.
    """
    # Verify critical settings are available
    assert settings.PROJECT_NAME, "PROJECT_NAME must be set"
    assert settings.AVAILABLE_LANGUAGES, "AVAILABLE_LANGUAGES must be set"
    yield
    # Cleanup if needed (currently none)
