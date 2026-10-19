"""
Pytest configuration and fixtures
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from apps.app_db.db.core import Base
from apps.app_db.config import app_db_settings
from apps.app_db.dependencies import get_current_user_id, get_app_key

TEST_USER_ID = 1
TEST_APP_KEY = "viz"


def _override_get_current_user_id() -> int:
    return TEST_USER_ID


def _override_get_app_key() -> str:
    return TEST_APP_KEY


def _get_test_engine():
    """Create test engine only when needed (avoids requiring DB config for unit tests)."""
    try:
        base_url = (
            app_db_settings.get_database_url().rstrip("/").rsplit("/", 1)[0]
        )
        test_url = f"{base_url}/test_db"
    except Exception:
        pytest.skip(
            "App DB settings not set; required only for app_db integration tests that use the db fixture."
        )
    return create_engine(test_url, pool_pre_ping=True)


@pytest.fixture(scope="function")
def db():
    """Create a test database session. Only used by tests that need a real DB."""
    engine = _get_test_engine()
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
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
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def client_no_db():
    """Create a test client without database session (for unit tests with mocks)"""
    # Use context manager to ensure proper cleanup
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="function")
def gallery_client():
    """Test client with gallery auth overridden (user_id + app_key) for gallery API tests that mock the service."""
    app.dependency_overrides[get_current_user_id] = _override_get_current_user_id
    app.dependency_overrides[get_app_key] = _override_get_app_key
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_current_user_id, None)
    app.dependency_overrides.pop(get_app_key, None)
