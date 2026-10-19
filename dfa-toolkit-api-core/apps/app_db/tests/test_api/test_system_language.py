"""
Unit tests for system language API endpoints.
Uses mocked service to avoid DB dependency.
"""
from unittest.mock import patch

import pytest

from apps.app_db.dependencies import get_current_user_id
from apps.shared.middleware import auth_middleware
from main import app

BASE_PATH = "/system-language"


@pytest.fixture(autouse=True)
def override_current_user():
    """Provide a deterministic current user for endpoints using auth dependency."""
    app.dependency_overrides[get_current_user_id] = lambda: 1
    yield
    app.dependency_overrides.pop(get_current_user_id, None)


@pytest.fixture(autouse=True)
def override_access_control(monkeypatch):
    """Treat this endpoint as PUBLIC in middleware during unit tests."""
    monkeypatch.setattr(
        auth_middleware,
        "_matches_for_path",
        lambda _method, _path: [("DFA_DM", "PUBLIC", 1)],
    )


@pytest.fixture(autouse=True)
def client(client_no_db):
    """Use client without DB for system language API unit tests."""
    return client_no_db


class TestCreateSystemLanguage:
    """Tests for POST /system-language."""

    @patch("apps.app_db.router.system_language.service.create_language")
    def test_create_language_returns_201(self, mock_create_language, client):
        mock_create_language.return_value = {
            "id": 101,
            "locale": "bn",
            "is_rtl": False,
            "is_default": False,
            "is_deleted": False,
            "created_user_id": 1,
            "created": None,
            "modified_user_id": 1,
            "modified": None,
        }

        response = client.post(
            BASE_PATH,
            json={"locale": "bn", "is_rtl": False, "is_default": False},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert body["data"]["locale"] == "bn"
        mock_create_language.assert_called_once()

    @patch("apps.app_db.router.system_language.service.create_language")
    def test_create_language_returns_409_when_locale_exists(self, mock_create_language, client):
        mock_create_language.side_effect = ValueError("System language with locale 'en' already exists")

        response = client.post(
            BASE_PATH,
            json={"locale": "en", "is_rtl": False, "is_default": False},
        )

        assert response.status_code == 409
        body = response.json()
        assert body["success"] is False
        assert "already exists" in body["err_message"]

    @patch("apps.app_db.router.system_language.service.create_language")
    def test_create_language_returns_500_on_unexpected_error(self, mock_create_language, client):
        mock_create_language.side_effect = Exception("DB unavailable")

        response = client.post(
            BASE_PATH,
            json={"locale": "bn", "is_rtl": False, "is_default": False},
        )

        assert response.status_code == 500
        body = response.json()
        assert body["success"] is False
        assert "Failed to create system language" in body["err_message"]


class TestGetSystemLanguageById:
    """Tests for GET /system-language/{id}."""

    @patch("apps.app_db.router.system_language.service.get_language_by_id")
    def test_get_language_by_id_returns_200(self, mock_get_language, client):
        mock_get_language.return_value = {
            "id": 7,
            "locale": "fr",
            "is_rtl": False,
            "is_default": True,
            "is_deleted": False,
            "created_user_id": 1,
            "created": None,
            "modified_user_id": 1,
            "modified": None,
        }

        response = client.get(f"{BASE_PATH}/7")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["id"] == 7
        assert body["data"]["locale"] == "fr"
        assert "created_user_id" not in body["data"]
        assert "created" not in body["data"]
        assert "modified_user_id" not in body["data"]
        assert "modified" not in body["data"]

    @patch("apps.app_db.router.system_language.service.get_language_by_id")
    def test_get_language_by_id_returns_404(self, mock_get_language, client):
        mock_get_language.return_value = None

        response = client.get(f"{BASE_PATH}/700")

        assert response.status_code == 404
        body = response.json()
        assert body["success"] is False
        assert body["err_message"] == "System language identifier 700 not found"


class TestGetSystemLanguages:
    """Tests for GET /system-language."""

    @patch("apps.app_db.router.system_language.service.list_non_deleted")
    def test_get_system_languages_hides_audit_fields(self, mock_list_non_deleted, client):
        mock_list_non_deleted.return_value = [
            {
                "id": 1,
                "locale": "en",
                "is_rtl": False,
                "is_default": True,
                "is_deleted": False,
                "created_user_id": 1,
                "created": None,
                "modified_user_id": 1,
                "modified": None,
            }
        ]

        response = client.get(BASE_PATH)

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert len(body["data"]) == 1
        assert body["data"][0]["locale"] == "en"
        assert "created_user_id" not in body["data"][0]
        assert "created" not in body["data"][0]
        assert "modified_user_id" not in body["data"][0]
        assert "modified" not in body["data"][0]


class TestDeleteSystemLanguage:
    """Tests for DELETE /system-language/{id}."""

    @patch("apps.app_db.router.system_language.service.delete_language")
    def test_delete_language_returns_204(self, mock_delete_language, client):
        mock_delete_language.return_value = True

        response = client.delete(f"{BASE_PATH}/7")

        assert response.status_code == 204
        mock_delete_language.assert_called_once()

    @patch("apps.app_db.router.system_language.service.delete_language")
    def test_delete_language_returns_404_when_not_found(self, mock_delete_language, client):
        mock_delete_language.return_value = False

        response = client.delete(f"{BASE_PATH}/700")

        assert response.status_code == 404
        body = response.json()
        assert body["success"] is False
        assert body["err_message"] == "System language identifier 700 not found"
