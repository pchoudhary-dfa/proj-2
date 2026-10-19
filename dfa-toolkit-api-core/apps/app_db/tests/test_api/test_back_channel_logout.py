"""
Tests for POST /auth/sso/back-channel-logout (IdP-initiated back-channel logout).
"""
from unittest.mock import MagicMock, patch

import pytest

from apps.shared.middleware import auth_middleware
from main import app

ENDPOINT = "/auth/sso/back-channel-logout"


@pytest.fixture(autouse=True)
def override_access_control(monkeypatch):
    """Bypass middleware access control — simulate APP_CLIENT level."""
    monkeypatch.setattr(
        auth_middleware,
        "_matches_for_path",
        lambda _method, _path: [("CMS", "APP_CLIENT", 1)],
    )


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestBackChannelLogoutSuccess:
    """Tests for successful session revocation."""

    @patch("apps.app_db.router.auth.has_active_refresh_token", return_value=True)
    @patch("apps.app_db.router.auth.revoke_all_refresh_tokens_for_user")
    def test_revokes_sessions_for_known_user(
        self,
        mock_revoke,
        mock_has_active,
        client,
    ):
        identity = MagicMock()
        identity.user_id = 7

        with patch(
            "apps.app_db.router.auth.Session.query"
        ) as mock_query_cls:
            mock_query = MagicMock()
            mock_query.filter.return_value.first.return_value = identity
            mock_query_cls.return_value = mock_query

            sso_mock = MagicMock()
            sso_mock.deactivate_sso_sessions.return_value = None

            with patch(
                "apps.shared.packages.dfa_sso_service.adapters.fastapi.get_sso_service",
                return_value=sso_mock,
            ):
                from apps.shared.packages.dfa_sso_service.adapters.fastapi import (
                    get_sso_service,
                )
                from apps.shared.config.dependencies import get_db

                mock_db = MagicMock()
                mock_db.query.return_value.filter.return_value.first.return_value = identity
                mock_db.commit.return_value = None

                app.dependency_overrides[get_db] = lambda: mock_db
                app.dependency_overrides[get_sso_service] = lambda: sso_mock

                response = client.post(
                    ENDPOINT,
                    json={"provider_code": "drupal", "idp_user_id": "42"},
                )

                app.dependency_overrides.pop(get_db, None)
                app.dependency_overrides.pop(get_sso_service, None)

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["user_id"] == 7
        assert body["data"]["sessions_revoked"] is True

    @patch("apps.app_db.router.auth.has_active_refresh_token", return_value=False)
    @patch("apps.app_db.router.auth.revoke_all_refresh_tokens_for_user")
    def test_idempotent_when_no_active_sessions(
        self,
        mock_revoke,
        mock_has_active,
        client,
    ):
        identity = MagicMock()
        identity.user_id = 7

        sso_mock = MagicMock()
        sso_mock.deactivate_sso_sessions.return_value = None

        from apps.shared.packages.dfa_sso_service.adapters.fastapi import (
            get_sso_service,
        )
        from apps.shared.config.dependencies import get_db

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = identity
        mock_db.commit.return_value = None

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_sso_service] = lambda: sso_mock

        response = client.post(
            ENDPOINT,
            json={"provider_code": "drupal", "idp_user_id": "42"},
        )

        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_sso_service, None)

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["user_id"] == 7
        assert body["data"]["sessions_revoked"] is False
        assert "No active sessions" in body["message"]


class TestBackChannelLogoutNotFound:
    """Tests for unknown identity."""

    def test_returns_404_for_unknown_identity(self, client):
        sso_mock = MagicMock()

        from apps.shared.packages.dfa_sso_service.adapters.fastapi import (
            get_sso_service,
        )
        from apps.shared.config.dependencies import get_db

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        app.dependency_overrides[get_db] = lambda: mock_db
        app.dependency_overrides[get_sso_service] = lambda: sso_mock

        response = client.post(
            ENDPOINT,
            json={"provider_code": "drupal", "idp_user_id": "99999"},
        )

        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_sso_service, None)

        assert response.status_code == 404
        body = response.json()
        assert body["success"] is False
        assert "IDENTITY_NOT_FOUND" in str(body.get("errors", {}))


class TestBackChannelLogoutValidation:
    """Tests for request validation errors."""

    def test_missing_provider_code(self, client):
        response = client.post(
            ENDPOINT,
            json={"idp_user_id": "42"},
        )
        assert response.status_code == 422

    def test_missing_idp_user_id(self, client):
        response = client.post(
            ENDPOINT,
            json={"provider_code": "drupal"},
        )
        assert response.status_code == 422

    def test_empty_provider_code(self, client):
        response = client.post(
            ENDPOINT,
            json={"provider_code": "", "idp_user_id": "42"},
        )
        assert response.status_code == 422

    def test_empty_idp_user_id(self, client):
        response = client.post(
            ENDPOINT,
            json={"provider_code": "drupal", "idp_user_id": ""},
        )
        assert response.status_code == 422

    def test_empty_body(self, client):
        response = client.post(ENDPOINT, json={})
        assert response.status_code == 422
