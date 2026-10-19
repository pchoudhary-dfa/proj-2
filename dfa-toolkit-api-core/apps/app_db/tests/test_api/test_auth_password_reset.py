"""
Tests for POST /auth/password/reset-request and POST /auth/password/reset-confirm.
"""
from unittest.mock import MagicMock, patch

import pytest

from apps.shared.config.security import create_access_token, create_password_reset_token
from apps.shared.middleware import auth_middleware
from apps.shared.utils.email_utils import EmailTemplate
from main import app

REQ_PATH = "/auth/password/reset-request"
CONFIRM_PATH = "/auth/password/reset-confirm"


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


class TestPasswordResetRequest:
    @patch(
        "apps.app_db.router.auth.get_fed_email_urls",
        return_value=("https://app.example.org", "https://app.example.org/reset-password"),
    )
    @patch("apps.app_db.router.auth.send_email")
    @patch("apps.app_db.router.auth.create_password_reset_token")
    @patch("apps.app_db.router.auth.get_active_user_for_password_reset")
    def test_reset_request_sends_link_email(
        self,
        mock_get_user,
        mock_create_token,
        mock_send_email,
        _mock_fed_urls,
        client,
    ):
        user = MagicMock()
        user.id = 7
        user.username = "jdoe"
        user.email = "jdoe@example.com"
        user.first_name = "Jane"
        user.last_name = "Doe"
        mock_get_user.return_value = user
        mock_create_token.return_value = "signed.jwt.token"

        response = client.post(REQ_PATH, json={"username": "jdoe"})

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "password reset link" in body["message"].lower()

        mock_create_token.assert_called_once_with(7)
        mock_send_email.assert_called_once()
        kw = mock_send_email.call_args.kwargs
        assert kw["template"] == EmailTemplate.PASSWORD_RESET_LINK
        assert kw["recipient_email"] == "jdoe@example.com"
        ctx = kw["context"]
        assert ctx["reset_url"] == "https://app.example.org/reset-password?token=signed.jwt.token"
        assert "/reset-password" in ctx["reset_url"]
        assert "token=" in ctx["reset_url"]
        assert ctx["login_url"] == "https://app.example.org"
        assert ctx["username"] == "jdoe"
        assert "expires_in" in ctx

    @patch("apps.app_db.router.auth.get_active_user_for_password_reset")
    def test_reset_request_unknown_username(self, mock_get_user, client):
        mock_get_user.return_value = None
        response = client.post(REQ_PATH, json={"username": "nobody"})
        assert response.status_code == 404

    @patch(
        "apps.app_db.router.auth.get_fed_email_urls",
        return_value=("https://app.example.org", "https://app.example.org/reset-password"),
    )
    @patch("apps.app_db.router.auth.send_email")
    @patch("apps.app_db.router.auth.create_password_reset_token")
    @patch("apps.app_db.router.auth.get_active_user_for_password_reset")
    def test_reset_request_inactive_user_allowed(
        self,
        mock_get_user,
        mock_create_token,
        mock_send_email,
        _mock_fed_urls,
        client,
    ):
        user = MagicMock()
        user.id = 8
        user.username = "gone"
        user.email = "gone@example.com"
        user.first_name = "Gone"
        user.last_name = "User"
        user.status = 0
        mock_get_user.return_value = user
        mock_create_token.return_value = "signed.jwt.token"

        response = client.post(REQ_PATH, json={"username": "gone"})

        assert response.status_code == 200
        mock_send_email.assert_called_once()


class TestPasswordResetConfirm:
    @patch("apps.app_db.router.auth.send_email")
    @patch("apps.app_db.router.auth.set_password_for_user_id")
    def test_reset_confirm_success(self, mock_set_pw, mock_send_email, client):
        token = create_password_reset_token(99)
        mock_user = MagicMock()
        mock_user.email = "u@example.com"
        mock_user.username = "u"
        mock_user.first_name = "U"
        mock_user.last_name = "Ser"
        mock_set_pw.return_value = mock_user

        response = client.post(
            CONFIRM_PATH,
            headers={"Authorization": f"Bearer {token}"},
            json={"new_password": "new-valid-password"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        mock_set_pw.assert_called_once()
        call_kw = mock_set_pw.call_args.kwargs
        assert call_kw["user_id"] == 99
        assert call_kw["new_password"] == "new-valid-password"

        mock_send_email.assert_called_once()
        se_kw = mock_send_email.call_args.kwargs
        assert se_kw["template"] == EmailTemplate.PASSWORD_RESET
        ctx = se_kw["context"]
        assert "plain_password" not in ctx
        assert ctx["username"] == "u"

    def test_reset_confirm_wrong_purpose_token(self, client):
        wrong = create_access_token(
            {"sub": "99", "username": "x", "dw_ids": [], "api_keys": [], "app_keys": [], "super_admin_api_keys": []}
        )
        response = client.post(
            CONFIRM_PATH,
            headers={"Authorization": f"Bearer {wrong}"},
            json={"new_password": "new-valid-password"},
        )
        assert response.status_code == 401
        body = response.json()
        assert body["success"] is False

    def test_reset_confirm_malformed_token(self, client):
        response = client.post(
            CONFIRM_PATH,
            headers={"Authorization": "Bearer not-a-jwt"},
            json={"new_password": "new-valid-password"},
        )
        assert response.status_code == 401

    @patch("apps.app_db.router.auth.set_password_for_user_id")
    def test_reset_confirm_password_length_validation(self, mock_set_pw, client):
        token = create_password_reset_token(1)
        mock_set_pw.side_effect = ValueError(
            "New password length must be between 3 and 50 characters"
        )

        response = client.post(
            CONFIRM_PATH,
            headers={"Authorization": f"Bearer {token}"},
            json={"new_password": "abcd"},
        )

        assert response.status_code == 400
        body = response.json()
        assert body["success"] is False
        assert "between" in body["err_message"]
