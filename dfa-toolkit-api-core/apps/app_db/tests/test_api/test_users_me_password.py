"""
Unit tests for PATCH /iam/users/me/password.
"""
from unittest.mock import MagicMock, patch

import pytest

from apps.app_db.dependencies import get_current_user_id, get_current_username
from apps.shared.exceptions import BadRequest, Unauthorized
from apps.shared.utils.email_utils import EmailTemplate
from apps.shared.middleware import auth_middleware
from main import app

BASE_PATH = "/iam/users/me/password"


@pytest.fixture(autouse=True)
def override_current_user():
    app.dependency_overrides[get_current_user_id] = lambda: 1
    app.dependency_overrides[get_current_username] = lambda: "admin"
    yield
    app.dependency_overrides.pop(get_current_user_id, None)
    app.dependency_overrides.pop(get_current_username, None)


@pytest.fixture(autouse=True)
def override_access_control(monkeypatch):
    monkeypatch.setattr(
        auth_middleware,
        "_matches_for_path",
        lambda _method, _path: [("DFA_DM", "PUBLIC", 1)],
    )


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestChangeMyPassword:
    @patch("apps.app_db.router.users.send_email")
    @patch("apps.app_db.router.users.user_service.change_password_by_username")
    def test_change_password_success(self, mock_change_password, mock_send_email, client):
        mock_user = MagicMock()
        mock_user.email = "admin@example.com"
        mock_user.username = "admin"
        mock_user.first_name = "Admin"
        mock_user.last_name = "User"
        mock_change_password.return_value = mock_user

        response = client.patch(
            BASE_PATH,
            json={"old_password": "old-pass", "new_password": "new-strong-pass"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["message"] == "Password updated successfully"
        assert body["data"] == {}
        mock_change_password.assert_called_once()
        call_kw = mock_change_password.call_args.kwargs
        assert call_kw["username"] == "admin"
        assert call_kw["old_password"] == "old-pass"
        assert call_kw["new_password"] == "new-strong-pass"
        assert call_kw["modified_user_id"] == 1

        mock_send_email.assert_called_once()
        se_kw = mock_send_email.call_args.kwargs
        assert se_kw["template"] == EmailTemplate.PASSWORD_CHANGED
        assert se_kw["recipient_email"] == "admin@example.com"
        ctx = se_kw["context"]
        assert "plain_password" not in ctx
        assert "new_password" not in ctx
        assert ctx["username"] == "admin"
        assert ctx["full_name"] == "Admin User"

    @patch("apps.app_db.router.users.user_service.change_password_by_username")
    def test_change_password_wrong_old_password(self, mock_change_password, client):
        mock_change_password.side_effect = Unauthorized("Old password is incorrect")

        response = client.patch(
            BASE_PATH,
            json={"old_password": "wrong-pass", "new_password": "new-strong-pass"},
        )

        assert response.status_code == 401
        body = response.json()
        assert body["success"] is False
        assert body["err_message"] == "Old password is incorrect"

    @patch("apps.app_db.router.users.user_service.change_password_by_username")
    def test_change_password_min_length_violation(self, mock_change_password, client):
        mock_change_password.side_effect = BadRequest(
            "New password length must be between 8 and 64 characters",
            error_code="PASSWORD_LENGTH_INVALID",
        )

        response = client.patch(
            BASE_PATH,
            json={"old_password": "old-pass", "new_password": "short"},
        )

        assert response.status_code == 400
        body = response.json()
        assert body["success"] is False
        assert "between 8 and 64" in body["err_message"]

    @patch("apps.app_db.router.users.user_service.change_password_by_username")
    def test_change_password_max_length_violation(self, mock_change_password, client):
        mock_change_password.side_effect = BadRequest(
            "New password length must be between 8 and 64 characters",
            error_code="PASSWORD_LENGTH_INVALID",
        )

        response = client.patch(
            BASE_PATH,
            json={"old_password": "old-pass", "new_password": "x" * 100},
        )

        assert response.status_code == 400
        body = response.json()
        assert body["success"] is False
        assert "between 8 and 64" in body["err_message"]

    @patch("apps.app_db.router.users.user_service.change_password_by_username")
    def test_change_password_user_not_found(self, mock_change_password, client):
        mock_change_password.side_effect = LookupError("User does not exist")

        response = client.patch(
            BASE_PATH,
            json={"old_password": "old-pass", "new_password": "new-strong-pass"},
        )

        assert response.status_code == 404
        body = response.json()
        assert body["success"] is False
        assert body["err_message"] == "User does not exist"
