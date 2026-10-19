"""Unit tests for SSO default-role assignment on login (CMS pre-created users)."""
import sys
from unittest.mock import MagicMock

# Stub authlib before SSO package loads discovery (optional in minimal test envs).
if "authlib.integrations.starlette_client" not in sys.modules:
    _authlib = MagicMock()
    sys.modules["authlib"] = _authlib
    sys.modules["authlib.integrations"] = MagicMock()
    sys.modules["authlib.integrations.starlette_client"] = MagicMock()

from apps.shared.packages.dfa_sso_service.core.config import SsoConfig
from apps.shared.packages.dfa_sso_service.core.service import SsoService


def _make_service(storage: MagicMock, users: MagicMock) -> SsoService:
    config = SsoConfig(encryption_key="test-key-for-unit-tests")
    return SsoService(storage=storage, user_provider=users, config=config)


def _make_provider(*, default_role_id: int = 10):
    provider = MagicMock()
    provider.auto_provision_users = True
    provider.default_role_id = default_role_id
    provider.provider_code = "drupal"
    provider.id = 1
    return provider


def test_existing_identity_without_app_role_assigns_default():
    storage = MagicMock()
    identity = MagicMock()
    identity.user_id = 42
    storage.find_identity.return_value = identity

    users = MagicMock()
    users.is_user_active.return_value = True
    users.user_has_role_for_app.return_value = False

    svc = _make_service(storage, users)
    provider = _make_provider()

    user_id = svc._resolve_or_provision_user(
        provider,
        "drupal",
        "idp-123",
        {"idp_user_id": "idp-123", "email": "user@example.com"},
        {},
        provisioning_dw_id=1,
        initiating_app_key="DFA_DM",
    )

    assert user_id == 42
    users.assign_default_role.assert_called_once_with(42, 10, 1)
    storage.create_identity.assert_not_called()


def test_existing_identity_with_app_role_skips_assign():
    storage = MagicMock()
    identity = MagicMock()
    identity.user_id = 42
    storage.find_identity.return_value = identity

    users = MagicMock()
    users.is_user_active.return_value = True
    users.user_has_role_for_app.return_value = True

    svc = _make_service(storage, users)
    provider = _make_provider()

    user_id = svc._resolve_or_provision_user(
        provider,
        "drupal",
        "idp-123",
        {"idp_user_id": "idp-123", "email": "user@example.com"},
        {},
        provisioning_dw_id=1,
        initiating_app_key="DFA_DM",
    )

    assert user_id == 42
    users.assign_default_role.assert_not_called()


def test_email_linked_user_without_app_role_assigns_default():
    storage = MagicMock()
    storage.find_identity.return_value = None

    users = MagicMock()
    users.find_user_by_email.return_value = 55
    users.is_user_active.return_value = True
    users.user_has_role_for_app.return_value = False

    svc = _make_service(storage, users)
    provider = _make_provider()

    user_id = svc._resolve_or_provision_user(
        provider,
        "drupal",
        "idp-456",
        {"idp_user_id": "idp-456", "email": "cms@example.com"},
        {},
        provisioning_dw_id=None,
        initiating_app_key="DFA_DM",
    )

    assert user_id == 55
    storage.create_identity.assert_called_once()
    users.assign_default_role.assert_called_once_with(55, 10, None)


def test_new_user_assigns_default_after_identity_created():
    storage = MagicMock()
    storage.find_identity.return_value = None

    users = MagicMock()
    users.find_user_by_email.return_value = None
    users.create_user.return_value = 77
    users.user_has_role_for_app.return_value = False

    svc = _make_service(storage, users)
    provider = _make_provider()

    user_id = svc._resolve_or_provision_user(
        provider,
        "drupal",
        "idp-new",
        {"idp_user_id": "idp-new", "email": "new@example.com"},
        {},
        provisioning_dw_id=2,
        initiating_app_key="DFA_DM",
    )

    assert user_id == 77
    users.create_user.assert_called_once()
    storage.create_identity.assert_called_once()
    users.assign_default_role.assert_called_once_with(77, 10, 2)


def test_exchange_assigns_dw_scoped_role_when_global_exists():
    storage = MagicMock()
    provider = _make_provider()
    storage.get_provider_by_id.return_value = provider

    users = MagicMock()
    users.user_has_dw_scoped_role_for_app.return_value = False

    def _resolve_dw(return_to, app_key):
        if return_to == "/en/1/overview" and app_key == "DFA_DM":
            return 1
        return None

    config = SsoConfig(
        encryption_key="test-key",
        provisioning_dw_id_resolver=_resolve_dw,
    )
    svc = SsoService(storage=storage, user_provider=users, config=config)

    svc.maybe_assign_default_role_on_exchange(
        42,
        sso_provider_id=1,
        initiating_app_key="DFA_DM",
        return_path="/en/1/overview",
    )

    users.assign_default_role.assert_called_once_with(42, 10, 1)
