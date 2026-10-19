"""
Unit tests for app-config API endpoints.
Uses Arrange-Act-Assert; services are mocked to avoid DB dependency.
"""
import pytest
from unittest.mock import patch
from apps.shared.middleware import auth_middleware
from apps.app_db.dependencies import get_app_key
from main import app

# Use client_no_db for all tests (mocked services, no real DB)
@pytest.fixture(autouse=True)
def client(client_no_db):
    """Use client without DB for app-config API unit tests."""
    return client_no_db


@pytest.fixture(autouse=True)
def override_access_control(monkeypatch):
    """Treat app-config endpoints as PUBLIC in middleware during unit tests."""
    monkeypatch.setattr(
        auth_middleware,
        "_matches_for_path",
        lambda _method, _path: [("DFA_DM", "PUBLIC", 1)],
    )


@pytest.fixture(autouse=True)
def override_app_key_dependency():
    """Avoid middleware state requirement in unit tests."""
    app.dependency_overrides[get_app_key] = lambda: "DFA_DM"
    yield
    app.dependency_overrides.pop(get_app_key, None)


BASE_PATH = "/app-config"


class TestGetAppConfig:
    """Tests for GET /app-config."""

    @patch("apps.app_db.router.app_config.service.get_config_by_keyword")
    def test_returns_config_when_application_exists(self, mock_get_config, client):
        # Arrange: service returns config dict
        keyword = "myapp"
        mock_config = {
            "theme": {"value": "dark", "description": "Theme mode"},
            "locale": {"value": "en", "description": "Default locale"},
        }
        mock_get_config.return_value = mock_config

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "message" in data
        assert "Retrieved 2 config(s) for app_key 'DFA_DM'" in data["message"]
        assert data["data"] == mock_config
        mock_get_config.assert_called_once_with(
            "DFA_DM", dw_id=None, is_system=None, unit_format_catalog_full=False
        )

    @patch("apps.app_db.router.app_config.service.get_config_by_keyword")
    def test_returns_404_when_application_not_found(self, mock_get_config, client):
        # Arrange: service returns None (app not found)
        keyword = "nonexistent"
        mock_get_config.return_value = None

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert data["err_message"] == "Application identifier DFA_DM not found"
        mock_get_config.assert_called_once_with(
            "DFA_DM", dw_id=None, is_system=None, unit_format_catalog_full=False
        )

    @patch("apps.app_db.router.app_config.service.get_config_by_keyword")
    def test_returns_500_on_service_exception(self, mock_get_config, client):
        # Arrange: service raises
        keyword = "myapp"
        mock_get_config.side_effect = Exception("Database connection failed")

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False
        assert "Failed to get configuration" in data["err_message"]

    @patch("apps.app_db.router.app_config.service.get_config_by_keyword")
    def test_returns_empty_config_object_when_no_keys(self, mock_get_config, client):
        # Arrange: app exists but no config rows
        keyword = "emptyapp"
        mock_get_config.return_value = {}

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == {}
        assert "Retrieved 0 config(s) for app_key 'DFA_DM'" in data["message"]

    @patch("apps.app_db.router.app_config.service.get_config_by_keyword")
    def test_get_passes_is_system_true_query(self, mock_get_config, client):
        mock_get_config.return_value = {
            "APP_ID": {"value": "1", "description": None, "is_system": True},
        }
        response = client.get(f"{BASE_PATH}?is_system=true")
        assert response.status_code == 200
        mock_get_config.assert_called_once_with(
            "DFA_DM", dw_id=None, is_system=True, unit_format_catalog_full=False
        )

    @patch("apps.app_db.router.app_config.service.get_config_by_keyword")
    def test_get_passes_dw_id_and_is_system_false(self, mock_get_config, client):
        mock_get_config.return_value = {}
        response = client.get(f"{BASE_PATH}?dw_id=3&is_system=false")
        assert response.status_code == 200
        mock_get_config.assert_called_once_with(
            "DFA_DM", dw_id=3, is_system=False, unit_format_catalog_full=False
        )

    @patch("apps.app_db.router.app_config.service.get_config_by_keyword")
    def test_get_passes_unit_format_catalog_full(self, mock_get_config, client):
        mock_get_config.return_value = {}
        response = client.get(f"{BASE_PATH}?unit_format_catalog=full")
        assert response.status_code == 200
        mock_get_config.assert_called_once_with(
            "DFA_DM", dw_id=None, is_system=None, unit_format_catalog_full=True
        )


class TestPatchAppConfig:
    """Tests for PATCH /app-config."""

    @patch("apps.app_db.router.app_config.service.patch_config_by_app_key")
    def test_patch_updates_existing_config_keys(self, mock_patch, client):
        app_key = "DFA_DASH"
        mock_patch.return_value = {
            "requested_count": 2,
            "updated_count": 2,
            "updated_keys": ["APP_NAME", "APP_TITLE"],
            "missing_keys": [],
        }

        response = client.patch(
            BASE_PATH,
            json={
                "APP_NAME": {"value": "DFA Dashboard", "description": "Application title"},
                "APP_TITLE": {"value": "DFA Dashboard", "description": "Browser title"},
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["updated_count"] == 2
        assert "Updated 2 config(s) for app_key 'DFA_DM'" in body["message"]

    @patch("apps.app_db.router.app_config.service.patch_config_by_app_key")
    def test_patch_returns_404_when_app_not_found(self, mock_patch, client):
        app_key = "UNKNOWN"
        mock_patch.return_value = None

        response = client.patch(
            BASE_PATH,
            json={
                "APP_NAME": {"value": "X", "description": "Y"},
            },
        )

        assert response.status_code == 404
        body = response.json()
        assert body["success"] is False
        assert body["err_message"] == "Application identifier DFA_DM not found"

    @patch("apps.app_db.router.app_config.service.patch_config_by_app_key")
    def test_patch_returns_500_on_service_error(self, mock_patch, client):
        app_key = "DFA_DASH"
        mock_patch.side_effect = Exception("DB failed")

        response = client.patch(
            BASE_PATH,
            json={
                "APP_NAME": {"value": "X", "description": "Y"},
            },
        )

        assert response.status_code == 500
        body = response.json()
        assert body["success"] is False
        assert "Failed to patch configuration" in body["err_message"]
