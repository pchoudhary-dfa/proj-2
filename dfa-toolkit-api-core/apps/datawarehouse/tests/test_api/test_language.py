"""
Tests for Languages CRUD API endpoints.
Uses mocks for LanguageService; assertions focus on response shape + status codes.
"""

import pytest
from unittest.mock import patch

from apps.shared.config.config import settings

TEST_WAREHOUSE_ID = "test_warehouse"


@pytest.fixture(autouse=True)
def force_internal_adaptation():
    """Force ADAPTATION=internal so request validation uses internal keys."""
    with patch.object(settings, "ADAPTATION", "internal"):
        yield


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


MOCK_LANG_ITEM = {
    "language_nid": 1,
    "language_name": "DI_English [en]",
    "language_code": "en",
    "language_default": True,
    "language_globallock": False,
}


class TestLanguageList:
    @patch("apps.datawarehouse.router.language.language_service.list_languages")
    def test_list_languages_success(self, mock_list, client):
        mock_list.return_value = [MOCK_LANG_ITEM]
        res = client.get(f"/dw/{TEST_WAREHOUSE_ID}/languages")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["message"] == "Languages retrieved successfully"
        assert isinstance(body["data"], list)
        assert body["data"][0]["language_code"] == "en"


class TestLanguageCreate:
    @patch("apps.datawarehouse.router.language.language_service.create_language")
    def test_add_language_success(self, mock_create, client):
        mock_create.return_value = {
            "language_nid": 4,
            "language_name": "Hindi [hi]",
            "language_code": "hi",
            "language_default": False,
            "language_globallock": False,
        }
        res = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/languages/",
            json={
                "language_name": "Hindi [hi]",
                "language_code": "hi",
                "language_default": False,
                "language_globallock": False,
            },
        )
        assert res.status_code == 201
        body = res.json()
        assert body["success"] is True
        assert body["message"] == "Language added successfully"
        assert body.get("data") is not None
        if isinstance(body["data"], dict) and "language_code" in body["data"]:
            assert body["data"]["language_code"] == "hi"
        elif isinstance(body["data"], dict) and "language_nid" in body["data"]:
            assert body["data"]["language_nid"] == 4

    @patch("apps.datawarehouse.router.language.language_service.create_language")
    def test_add_language_with_source_lang_passed_to_service(self, mock_create, client):
        mock_create.return_value = {
            "language_nid": 5,
            "language_name": "French [fr]",
            "language_code": "fr",
            "language_default": False,
            "language_globallock": False,
        }
        res = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/languages/",
            json={
                "language_name": "French [fr]",
                "language_code": "fr",
                "source_lang": "en",
                "language_default": False,
                "language_globallock": False,
            },
        )
        assert res.status_code == 201
        args, _kwargs = mock_create.call_args
        assert args[0] == TEST_WAREHOUSE_ID
        assert getattr(args[1], "source_lang") == "en"

    @patch("apps.datawarehouse.router.language.language_service.create_language")
    def test_add_language_duplicate_conflict(self, mock_create, client):
        mock_create.side_effect = ValueError("Duplicate language code 'hi'")
        res = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/languages/",
            json={"language_name": "Hindi [hi]", "language_code": "hi"},
        )
        assert res.status_code == 409
        body = res.json()
        assert body["success"] is False


class TestLanguageGetOne:
    @patch("apps.datawarehouse.router.language.language_service.get_language_by_code")
    def test_get_language_by_code_success(self, mock_get, client):
        mock_get.return_value = MOCK_LANG_ITEM
        res = client.get(f"/dw/{TEST_WAREHOUSE_ID}/languages/en")
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["data"]["language_code"] == "en"

    @patch("apps.datawarehouse.router.language.language_service.get_language_by_code")
    def test_get_language_by_code_not_found(self, mock_get, client):
        mock_get.return_value = None
        res = client.get(f"/dw/{TEST_WAREHOUSE_ID}/languages/zz")
        assert res.status_code == 404
        body = res.json()
        assert body["success"] is False
        assert body["err_message"] == "Language not found"


class TestLanguagePatch:
    @patch("apps.datawarehouse.router.language.language_service.patch_language")
    def test_patch_language_success(self, mock_patch, client):
        mock_patch.return_value = {
            "language_nid": 1,
            "language_name": "English (UK)",
            "language_code": "en",
            "language_default": True,
            "language_globallock": False,
        }
        res = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/languages/en",
            json={
                "language_name": "English (UK)",
                "language_default": True,
            },
        )
        assert res.status_code == 200
        body = res.json()
        assert body["success"] is True
        assert body["message"] == "Language updated successfully"
        assert body["data"]["language_code"] == "en"
        assert body["data"]["language_name"] == "English (UK)"
        args, _kw = mock_patch.call_args
        assert args[0] == TEST_WAREHOUSE_ID
        assert args[1] == "en"

    @patch("apps.datawarehouse.router.language.language_service.patch_language")
    def test_patch_language_clear_default_blocked(self, mock_patch, client):
        mock_patch.side_effect = ValueError(
            "Cannot remove default; set another language as default first"
        )
        res = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/languages/en",
            json={"language_default": False},
        )
        assert res.status_code == 422
        body = res.json()
        assert body["success"] is False

    @patch("apps.datawarehouse.router.language.language_service.patch_language")
    def test_patch_language_not_found(self, mock_patch, client):
        mock_patch.side_effect = KeyError("Language not found")
        res = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/languages/zz",
            json={"language_name": "Zulu"},
        )
        assert res.status_code == 404
        body = res.json()
        assert body["success"] is False

class TestLanguageDelete:
    @patch("apps.datawarehouse.router.language.language_service.delete_language")
    def test_delete_language_success(self, mock_delete, client):
        mock_delete.return_value = (True, {"indicators": 0})
        res = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/languages/fr")
        assert res.status_code == 204

    @patch("apps.datawarehouse.router.language.language_service.delete_language")
    def test_delete_language_default_protected(self, mock_delete, client):
        mock_delete.side_effect = ValueError("Default language cannot be deleted")
        res = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/languages/en")
        assert res.status_code == 422
        body = res.json()
        assert body["success"] is False

    @patch("apps.datawarehouse.router.language.language_service.delete_language")
    def test_delete_language_global_lock_protected(self, mock_delete, client):
        mock_delete.side_effect = PermissionError("Globally locked language cannot be deleted")
        res = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/languages/en")
        assert res.status_code == 423
        body = res.json()
        assert body["success"] is False

