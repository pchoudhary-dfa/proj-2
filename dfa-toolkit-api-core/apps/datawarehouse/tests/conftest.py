"""
Pytest configuration and fixtures
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from apps.app_db.db.core import Base, SessionLocal
from apps.app_db.config import app_db_settings
from unittest.mock import MagicMock

from apps.datawarehouse.db.datawarehouse import get_dw_db, validate_dw_id, get_dw_language_code


def _override_validate_dw_id(dw_id: str):
    """Bypass warehouse lookup in tests so /dw/{dw_id}/... routes resolve without DB."""
    return dw_id


def _override_get_dw_language_code(
    dw_id: str = None,
    accept_language: str = None,
):
    """Return Accept-Language when provided, else 'en'; avoids get_warehouse_credentials in tests."""
    return accept_language if accept_language else "en"

# Create test database URL from app DB settings (same host/port/user, different database name)
_test_db_name = "test_db"
SQLALCHEMY_TEST_DATABASE_URL = (
    app_db_settings.get_database_url().rstrip("/").rsplit("/", 1)[0] + f"/{_test_db_name}"
)
engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    pool_pre_ping=True,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Create a test database session"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    """Create a test client with database session"""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    from apps.shared.config.dependencies import get_db
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[validate_dw_id] = _override_validate_dw_id
    app.dependency_overrides[get_dw_language_code] = _override_get_dw_language_code
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def mock_dw_db():
    """In-memory mock warehouse session for report API tests."""
    return MagicMock()


@pytest.fixture(scope="function")
def client_no_db(mock_dw_db):
    """Create a test client without database session (for unit tests with mocks)"""

    def _override_get_dw_db():
        yield mock_dw_db

    app.dependency_overrides[validate_dw_id] = _override_validate_dw_id
    app.dependency_overrides[get_dw_language_code] = _override_get_dw_language_code
    app.dependency_overrides[get_dw_db] = _override_get_dw_db
    test_client = TestClient(app=app, raise_server_exceptions=False)
    try:
        yield test_client
    finally:
        app.dependency_overrides.pop(validate_dw_id, None)
        app.dependency_overrides.pop(get_dw_language_code, None)
        app.dependency_overrides.pop(get_dw_db, None)
        test_client.close()
