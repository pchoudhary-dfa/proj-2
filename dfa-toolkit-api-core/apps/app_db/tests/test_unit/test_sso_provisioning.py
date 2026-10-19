"""Tests for SSO provisioning dw_id extraction from DM return paths."""
import pytest

from apps.app_db.utils.sso_provisioning import (
    extract_provisioning_dw_id,
    parse_dw_id_from_return_path,
)
from apps.shared.config.config import settings


@pytest.mark.parametrize(
    "path,expected",
    [
        ("/en/1/overview", 1),
        ("/en/42/indicator", 42),
        ("/en/1/logs", 1),
        ("/en/1/overview?tab=foo", 1),
        ("/en/datawarehouse", None),
        ("/en/administration", None),
        ("/en/translations", None),
        ("/en/preferences", None),
        ("/en/version-log", None),
        ("/en", None),
        (None, None),
        ("", None),
        ("https://evil.com/en/1/overview", None),
    ],
)
def test_parse_dw_id_from_return_path(path, expected):
    assert parse_dw_id_from_return_path(path) == expected


def test_extract_provisioning_dw_id_non_dm_app_key():
    assert extract_provisioning_dw_id("/en/1/overview", "DFA_VIZ") is None


def test_extract_provisioning_dw_id_dm_app_key_without_db():
    assert (
        extract_provisioning_dw_id("/en/1/overview", settings.DFA_DM_APP_KEY)
        == 1
    )


def test_extract_provisioning_dw_id_validates_warehouse_exists(monkeypatch):
    from unittest.mock import MagicMock

    monkeypatch.setattr(
        "apps.app_db.utils.sso_provisioning._warehouse_exists",
        lambda _db, dw_id: dw_id == 42,
    )
    db = MagicMock()

    result = extract_provisioning_dw_id(
        "/en/42/overview",
        settings.DFA_DM_APP_KEY,
        db=db,
    )
    assert result == 42


def test_extract_provisioning_dw_id_unknown_warehouse_returns_none(monkeypatch):
    from unittest.mock import MagicMock

    monkeypatch.setattr(
        "apps.app_db.utils.sso_provisioning._warehouse_exists",
        lambda _db, _dw_id: False,
    )
    db = MagicMock()

    assert (
        extract_provisioning_dw_id(
            "/en/999999/overview",
            settings.DFA_DM_APP_KEY,
            db=db,
        )
        is None
    )
