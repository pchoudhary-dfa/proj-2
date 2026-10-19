"""Unit tests for DfaUserProvider.assign_default_role (SSO auto-provision)."""
import sys
from unittest.mock import MagicMock, patch

for _mod in ("authlib", "authlib.integrations", "authlib.integrations.starlette_client"):
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()

# Stub DB engine module so ORM models import without MySQL driver.
if "apps.app_db.db.core" not in sys.modules:
    _mock_db = MagicMock()
    _mock_db.Base = type("Base", (), {})
    sys.modules["apps.app_db.db.core"] = _mock_db

from apps.app_db.services.sso_user_provider import DfaUserProvider
from apps.shared.config.config import settings


def _make_role(role_code: str = "DFA_DM_AUTHENTICATED", app_key: str = "DFA_DM"):
    role = MagicMock()
    role.id = 10
    role.role_code = role_code
    role.app_key = app_key
    return role


def _mock_db_with_role(role):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = role
    return db


@patch("apps.app_db.services.sso_user_provider.IamUserRole")
def test_assign_default_role_dw_scoped_dm_only(mock_iam_user_role):
    role = _make_role()
    db = _mock_db_with_role(role)
    db.query.return_value.filter.return_value.first.side_effect = [role, None]
    provider = DfaUserProvider(db)

    provider.assign_default_role(user_id=99, role_id=10, dw_id=1)

    db.add.assert_called_once()
    mock_iam_user_role.assert_called_once()
    kwargs = mock_iam_user_role.call_args.kwargs
    assert kwargs["user_id"] == 99
    assert kwargs["app_key"] == settings.DFA_DM_APP_KEY
    assert kwargs["dw_id"] == 1
    assert kwargs["role_id"] == 10


@patch("apps.app_db.services.sso_user_provider.IamUserRole")
def test_assign_default_role_global_federated_apps(mock_iam_user_role):
    role = _make_role()
    db = _mock_db_with_role(role)
    # No existing assignment on idempotency check
    db.query.return_value.filter.return_value.first.side_effect = [role, None, None]
    provider = DfaUserProvider(db)

    provider.assign_default_role(user_id=99, role_id=10, dw_id=None)

    assert mock_iam_user_role.call_count == len(settings.SSO_FEDERATED_APPS)
    app_keys_added = {
        c.kwargs["app_key"] for c in mock_iam_user_role.call_args_list
    }
    assert app_keys_added == set(settings.SSO_FEDERATED_APPS)
    for c in mock_iam_user_role.call_args_list:
        assert c.kwargs["dw_id"] is None


def test_assign_default_role_idempotent_skips_existing():
    role = _make_role()
    db = _mock_db_with_role(role)
    existing = MagicMock()
    db.query.return_value.filter.return_value.first.side_effect = [role, existing]
    provider = DfaUserProvider(db)

    provider.assign_default_role(user_id=99, role_id=10, dw_id=1)

    db.add.assert_not_called()


def test_assign_default_role_unknown_role_no_op():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    provider = DfaUserProvider(db)

    provider.assign_default_role(user_id=99, role_id=999, dw_id=1)

    db.add.assert_not_called()


def test_user_has_role_for_app_true_when_row_exists():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = (1,)
    provider = DfaUserProvider(db)

    assert provider.user_has_role_for_app(99, settings.DFA_DM_APP_KEY) is True


def test_user_has_role_for_app_false_when_no_row():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    provider = DfaUserProvider(db)

    assert provider.user_has_role_for_app(99, settings.DFA_DM_APP_KEY) is False


def test_user_has_dw_scoped_role_for_app_true_when_row_exists():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(id=1)
    provider = DfaUserProvider(db)

    assert provider.user_has_dw_scoped_role_for_app(99, settings.DFA_DM_APP_KEY, 1) is True


def test_user_has_dw_scoped_role_for_app_false_when_no_row():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    provider = DfaUserProvider(db)

    assert provider.user_has_dw_scoped_role_for_app(99, settings.DFA_DM_APP_KEY, 1) is False


def test_user_has_role_for_app_unknown_app_key_returns_true():
    db = MagicMock()
    provider = DfaUserProvider(db)

    assert provider.user_has_role_for_app(99, None) is True
    db.query.assert_not_called()
