"""
Unit tests for translations API endpoints.
Uses Arrange-Act-Assert; services are mocked to avoid DB dependency.
"""
import pytest
from io import BytesIO
from datetime import datetime
from unittest.mock import patch
from apps.shared.middleware import auth_middleware
from apps.app_db.dependencies import get_current_user_id
from apps.app_db import dependencies as app_db_dependencies
from apps.shared.config.config import settings
from main import app

# Use client_no_db for all tests (mocked services, no real DB)
@pytest.fixture(autouse=True)
def client(client_no_db):
    """Use client without DB for translations API unit tests."""
    return client_no_db


@pytest.fixture(autouse=True)
def override_access_control(monkeypatch):
    """Treat translation endpoints as PUBLIC in middleware during unit tests."""
    monkeypatch.setattr(
        auth_middleware,
        "_matches_for_path",
        lambda _method, _path: [("DFA_DM", "PUBLIC", 1)],
    )


@pytest.fixture(autouse=True)
def override_current_user():
    app.dependency_overrides[get_current_user_id] = lambda: 1
    yield
    app.dependency_overrides.pop(get_current_user_id, None)


@pytest.fixture(autouse=True)
def override_default_locale(monkeypatch):
    """Avoid DB call for default locale resolution in tests."""
    monkeypatch.setattr(app_db_dependencies, "_get_default_locale_from_db", lambda: "en")


BASE_PATH = "/translations"
APP_KEY = settings.DEFAULT_APP_KEY

_DEFAULT_GET_TRANSLATIONS_KWARGS = {
    "search": None,
    "search_by": None,
    "sort_field": "trans_code",
    "sort_order": "asc",
}

_DEFAULT_EXPORT_XLSX_KWARGS = {
    "search": None,
    "search_by": None,
    "sort_field": "trans_code",
    "sort_order": "asc",
}


class TestGetTranslationsGlobal:
    """Tests for GET /translations (scoped by resolved app key)."""

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    def test_returns_translations_for_default_locale_when_no_header(
        self, mock_get_translations, client
    ):
        # Arrange: no Accept-Language -> default "en"
        mock_get_translations.return_value = (
            [{"ABOUT": {"en": "About"}}, {"SAVE": {"en": "Save"}}],
            2,
            None,
        )

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == {"ABOUT": "About", "SAVE": "Save"}
        assert data["meta"]["total_count"] == 2
        assert data["meta"]["count"] == 2
        mock_get_translations.assert_called_once_with(
            locale="en",
            app_key_filter=APP_KEY,
            page=1,
            page_size=None,
            requested_locale=None,
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    def test_returns_translations_for_accept_language_header(
        self, mock_get_translations, client
    ):
        # Arrange
        mock_get_translations.return_value = (
            [{"ABOUT": {"en": "About", "fr": "A propos"}}, {"SAVE": {"en": "Save", "fr": "Enregistrer"}}],
            2,
            None,
        )

        # Act
        response = client.get(
            BASE_PATH,
            headers={"Accept-Language": "fr"},
        )

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["ABOUT"] == "A propos"
        mock_get_translations.assert_called_once_with(
            locale="fr",
            app_key_filter=APP_KEY,
            page=1,
            page_size=None,
            requested_locale=None,
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    def test_normalizes_locale_from_complex_header(
        self, mock_get_translations, client
    ):
        # Arrange: en-US,en;q=0.9 -> normalized to "en"
        mock_get_translations.return_value = ([{"OK": {"en": "OK"}}], 1, None)

        # Act
        response = client.get(
            BASE_PATH,
            headers={"Accept-Language": "en-US,en;q=0.9"},
        )

        # Assert
        assert response.status_code == 200
        mock_get_translations.assert_called_once_with(
            locale="en",
            app_key_filter=APP_KEY,
            page=1,
            page_size=None,
            requested_locale=None,
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    def test_returns_500_on_service_exception(self, mock_get_translations, client):
        # Arrange
        mock_get_translations.side_effect = Exception("DB error")

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False
        assert "Failed to get translations" in data["err_message"]

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    def test_returns_empty_dict_when_no_translations(self, mock_get_translations, client):
        # Arrange
        mock_get_translations.return_value = ([], 0, None)

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == {}
        assert "Retrieved 0 translation(s)" in data["message"]

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    def test_returns_pagination_meta_when_page_and_page_size_provided(self, mock_get_translations, client):
        mock_get_translations.return_value = (
            [{"SAVE": {"en": "Save"}}],
            3,
            1,
        )

        response = client.get(f"{BASE_PATH}?page=2&page_size=1")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["meta"]["total_count"] == 3
        assert body["meta"]["count"] == 1
        assert body["meta"]["page"] == 2
        assert body["meta"]["page_size"] == 1
        assert body["meta"]["total_pages"] == 3
        assert body["data"] == {"SAVE": "Save"}
        mock_get_translations.assert_called_once_with(
            locale="en",
            app_key_filter=APP_KEY,
            page=2,
            page_size=1,
            requested_locale=None,
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    def test_returns_all_languages_when_other_language_all_selected(self, mock_get_translations, client):
        mock_get_translations.return_value = (
            [{"ABOUT": {"en": "About", "fr": "A propos", "ar": "About ar"}}],
            1,
            None,
        )

        response = client.get(f"{BASE_PATH}?other_language=all")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"][0]["ABOUT"]["en"] == "About"
        assert body["data"][0]["ABOUT"]["fr"] == "A propos"
        assert body["data"][0]["ABOUT"]["ar"] == "About ar"
        mock_get_translations.assert_called_once_with(
            locale="en",
            app_key_filter=APP_KEY,
            page=1,
            page_size=None,
            requested_locale="all",
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_returns_global_scope_when_is_global_true(self, mock_resolve, mock_get_translations, client):
        mock_get_translations.return_value = ([{"ABOUT": {"en": "About"}}], 1, None)
        mock_resolve.return_value = 1

        response = client.get(f"{BASE_PATH}?is_global=true")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"] == {"ABOUT": "About"}
        mock_get_translations.assert_called_once_with(
            locale="en",
            app_key_filter=None,
            page=1,
            page_size=None,
            requested_locale=None,
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )
        mock_resolve.assert_not_called()


class TestGetTranslationsByAppQuery:
    """Tests for GET /translations using app key from middleware state."""

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_returns_merged_translations_when_app_exists(
        self, mock_resolve, mock_get_translations, client
    ):
        # Arrange
        mock_resolve.return_value = 42
        mock_get_translations.return_value = (
            [{"WELCOME": {"en": "App Welcome"}}, {"SAVE": {"en": "Save"}}],
            2,
            None,
        )

        # Act
        response = client.get(
            BASE_PATH,
            headers={"Accept-Language": "en"},
        )

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == {"WELCOME": "App Welcome", "SAVE": "Save"}
        mock_resolve.assert_called_once_with(APP_KEY)
        mock_get_translations.assert_called_once_with(
            locale="en",
            app_key_filter=APP_KEY,
            page=1,
            page_size=None,
            requested_locale=None,
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )

    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_returns_404_when_application_not_found(self, mock_resolve, client):
        # Arrange
        mock_resolve.return_value = None

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert data["err_message"] == f"Application identifier {APP_KEY} not found"
        mock_resolve.assert_called_once_with(APP_KEY)

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_returns_500_on_resolve_exception(
        self, mock_resolve, mock_get_translations, client
    ):
        # Arrange
        mock_resolve.side_effect = Exception("DB error")

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False
        assert "Failed to get translations" in data["err_message"]
        mock_get_translations.assert_not_called()

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_uses_default_locale_when_no_accept_language(
        self, mock_resolve, mock_get_translations, client
    ):
        # Arrange
        mock_resolve.return_value = 1
        mock_get_translations.return_value = ([], 0, None)

        # Act
        response = client.get(BASE_PATH)

        # Assert
        assert response.status_code == 200
        mock_get_translations.assert_called_once_with(
            locale="en",
            app_key_filter=APP_KEY,
            page=1,
            page_size=None,
            requested_locale=None,
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_ignores_app_key_query_param(
        self, mock_resolve, mock_get_translations, client
    ):
        mock_get_translations.return_value = ([{"WELCOME": {"en": "Welcome"}}], 1, None)

        response = client.get(f"{BASE_PATH}?app_key=")

        assert response.status_code == 200
        mock_get_translations.assert_called_once_with(
            locale="en",
            app_key_filter=APP_KEY,
            page=1,
            page_size=None,
            requested_locale=None,
            **_DEFAULT_GET_TRANSLATIONS_KWARGS,
        )
        mock_resolve.assert_called_once_with(APP_KEY)

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.get_translation_export_xlsx")
    def test_export_global_translations_success(self, mock_export, mock_get_translations, client):
        mock_export.return_value = (BytesIO(b"xlsx"), "TRANSLATIONS_global.xlsx")

        response = client.get(f"{BASE_PATH}?export=true")

        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert "attachment; filename=\"TRANSLATIONS_global.xlsx\"" in response.headers.get("content-disposition", "")
        mock_export.assert_called_once_with(
            app_key_filter=APP_KEY,
            **_DEFAULT_EXPORT_XLSX_KWARGS,
        )
        mock_get_translations.assert_not_called()

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.get_translation_export_xlsx")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_export_app_translations_success(self, mock_resolve, mock_export, mock_get_translations, client):
        mock_resolve.return_value = 10
        mock_export.return_value = (BytesIO(b"xlsx"), "TRANSLATIONS_MYAPP.xlsx")

        response = client.get(f"{BASE_PATH}?export=true")

        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        mock_resolve.assert_called_once_with(APP_KEY)
        mock_export.assert_called_once_with(
            app_key_filter=APP_KEY,
            **_DEFAULT_EXPORT_XLSX_KWARGS,
        )
        mock_get_translations.assert_not_called()

    @patch("apps.app_db.router.translations.service.get_translation_export_xlsx")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_export_app_translations_returns_404_when_application_not_found(self, mock_resolve, mock_export, client):
        mock_resolve.return_value = None

        response = client.get(f"{BASE_PATH}?export=true")

        assert response.status_code == 404
        body = response.json()
        assert body["success"] is False
        assert f"Application identifier {APP_KEY} not found" == body["err_message"]
        mock_export.assert_not_called()


class TestGetTranslationsSearchSort:
    """Validation and forwarding for GET /translations search and sort query params."""

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_search_without_search_by_returns_400(self, mock_resolve, mock_get, client):
        mock_resolve.return_value = 1
        response = client.get(f"{BASE_PATH}?search=hello")
        assert response.status_code == 400
        body = response.json()
        assert body["success"] is False
        assert "search_by" in body["err_message"]
        mock_get.assert_not_called()

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_invalid_search_by_returns_400(self, mock_resolve, mock_get, client):
        mock_resolve.return_value = 1
        response = client.get(f"{BASE_PATH}?search=x&search_by=not_a_field")
        assert response.status_code == 400
        mock_get.assert_not_called()

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_invalid_sort_field_returns_400(self, mock_resolve, mock_get, client):
        mock_resolve.return_value = 1
        response = client.get(f"{BASE_PATH}?sort_field=bad_field")
        assert response.status_code == 400
        mock_get.assert_not_called()

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_invalid_sort_order_returns_400(self, mock_resolve, mock_get, client):
        mock_resolve.return_value = 1
        response = client.get(f"{BASE_PATH}?sort_order=zigzag")
        assert response.status_code == 400
        mock_get.assert_not_called()

    @patch("apps.app_db.router.translations.service.get_translations_for_locale_paginated")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_passes_search_and_sort_to_service(self, mock_resolve, mock_get, client):
        mock_resolve.return_value = 1
        mock_get.return_value = ([], 0, None)
        response = client.get(
            f"{BASE_PATH}?search=z&search_by=trans_code&sort_field=id&sort_order=desc&page_size=10"
        )
        assert response.status_code == 200
        mock_get.assert_called_once_with(
            locale="en",
            app_key_filter=APP_KEY,
            page=1,
            page_size=10,
            requested_locale=None,
            search="z",
            search_by="trans_code",
            sort_field="id",
            sort_order="desc",
        )

    @patch("apps.app_db.router.translations.service.get_translation_export_xlsx")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_export_passes_search_sort_to_xlsx(self, mock_resolve, mock_export, client):
        mock_resolve.return_value = 1
        mock_export.return_value = (BytesIO(b"xlsx"), "f.xlsx")
        response = client.get(
            f"{BASE_PATH}?export=true&search=foo&search_by=default_text&sort_field=id&sort_order=desc"
        )
        assert response.status_code == 200
        mock_export.assert_called_once_with(
            app_key_filter=APP_KEY,
            search="foo",
            search_by="default_text",
            sort_field="id",
            sort_order="desc",
        )


class TestTranslationWriteEndpoints:
    """Tests for POST/PATCH/DELETE translations endpoints."""

    @patch("apps.app_db.router.translations.service.create_translation")
    def test_create_global_translation_success(self, mock_create, client):
        mock_create.return_value = {
            "id": 1,
            "code": "BTN_SAVE",
            "app_key": None,
            "default_text": "Save",
            "created_user_id": 1,
            "created": None,
            "modified_user_id": 1,
            "modified": None,
        }
        response = client.post(
            BASE_PATH,
            json={"code": "BTN_SAVE", "translations": {"en": "Save", "fr": "Enregistrer"}},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)
        assert len(body["data"]) == 1
        assert body["meta"]["count"] == 1

    @patch("apps.app_db.router.translations.service.import_translations_from_xlsx")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_import_translations_success(self, mock_resolve, mock_import, client):
        mock_resolve.return_value = 42
        mock_import.return_value = {
            "app_key": "MYAPP",
            "total_rows": 3,
            "inserted": 2,
            "updated": 1,
            "skipped_empty_code": 1,
        }

        response = client.post(
            f"{BASE_PATH}/import?app_key=MYAPP",
            files={
                "file": (
                    "translations.xlsx",
                    b"dummy-xlsx-content",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["inserted"] == 2
        mock_resolve.assert_called_once_with("MYAPP")
        assert mock_import.called

    @patch("apps.app_db.router.translations.service.import_translations_from_xlsx")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_import_translations_returns_404_when_app_not_found(self, mock_resolve, mock_import, client):
        mock_resolve.return_value = None

        response = client.post(
            f"{BASE_PATH}/import?app_key=UNKNOWN",
            files={
                "file": (
                    "translations.xlsx",
                    b"dummy-xlsx-content",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert response.status_code == 404
        assert response.json()["success"] is False
        mock_import.assert_not_called()

    @patch("apps.app_db.router.translations.service.import_translations_from_xlsx")
    def test_import_translations_returns_413_when_file_exceeds_size_limit(
        self, mock_import, client, monkeypatch
    ):
        monkeypatch.setattr(
            "apps.app_db.router.translations.get_allowed_import_file_size_bytes",
            lambda _app_key: 2,
        )
        response = client.post(
            f"{BASE_PATH}/import",
            files={
                "file": (
                    "translations.xlsx",
                    b"xxx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert response.status_code == 413
        body = response.json()
        assert body["success"] is False
        assert "2" in body["err_message"]
        mock_import.assert_not_called()

    @patch("apps.app_db.router.translations.service.import_translations_from_xlsx")
    def test_import_translations_returns_409_on_validation_error(self, mock_import, client):
        mock_import.side_effect = ValueError("Duplicate translation code(s) in Excel: ABOUT")

        response = client.post(
            f"{BASE_PATH}/import",
            files={
                "file": (
                    "translations.xlsx",
                    b"dummy-xlsx-content",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert response.status_code == 409
        body = response.json()
        assert body["success"] is False
        assert "Duplicate translation code" in body["err_message"]

    @patch("apps.app_db.router.translations.service.create_translation")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_create_app_translation_success(self, mock_resolve, mock_create, client):
        mock_resolve.return_value = 42
        mock_create.return_value = {
            "id": 2,
            "code": "BTN_SAVE",
            "app_key": APP_KEY,
            "default_text": "Save",
            "created_user_id": 1,
            "created": None,
            "modified_user_id": 1,
            "modified": None,
        }
        response = client.post(
            BASE_PATH,
            json={"code": "BTN_SAVE", "translations": {"en": "Save"}},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert body["meta"]["count"] == 1
        mock_resolve.assert_called_once_with(APP_KEY)

    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    @patch("apps.app_db.router.translations.service.create_translation")
    def test_create_app_translation_returns_404_when_application_not_found(self, mock_create, mock_resolve, client):
        mock_resolve.return_value = None

        response = client.post(
            BASE_PATH,
            json={"code": "BTN_SAVE", "translations": {"en": "Save"}},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert body["meta"]["count"] == 0
        assert len(body["meta"]["errors"]) == 1
        mock_create.assert_not_called()

    @patch("apps.app_db.router.translations.service.create_translation")
    def test_create_translation_conflict(self, mock_create, client):
        mock_create.side_effect = ValueError("Translation code 'BTN_SAVE' already exists for scope 'global'")
        response = client.post(
            BASE_PATH,
            json={"code": "BTN_SAVE", "translations": {"en": "Save"}},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert body["meta"]["count"] == 0
        assert len(body["meta"]["errors"]) == 1

    @patch("apps.app_db.router.translations.service.patch_translation")
    def test_patch_global_translation_success(self, mock_patch, client):
        mock_patch.return_value = {
            "id": 1,
            "code": "BTN_SAVE_NEW",
            "app_key": None,
            "default_text": "Save now",
            "created_user_id": 1,
            "created": None,
            "modified_user_id": 1,
            "modified": None,
        }
        response = client.patch(
            f"{BASE_PATH}/BTN_SAVE",
            json={"translations": {"en": "Save now"}},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True
        mock_patch.assert_called_once()
        assert mock_patch.call_args.kwargs["resolved_app_key"] == APP_KEY

    @patch("apps.app_db.router.translations.service.patch_translation")
    def test_patch_global_translation_not_found(self, mock_patch, client):
        mock_patch.return_value = None
        response = client.patch(
            f"{BASE_PATH}/BTN_UNKNOWN",
            json={"translations": {"en": "X"}},
        )
        assert response.status_code == 404
        assert response.json()["success"] is False

    @patch("apps.app_db.router.translations.service.patch_translation")
    def test_patch_translation_passes_resolved_app_key_for_lookup_chain(self, mock_patch, client):
        mock_patch.return_value = {
            "id": 1,
            "code": "BTN_SAVE",
            "app_key": None,
            "default_text": "Save",
            "created_user_id": 1,
            "created": None,
            "modified_user_id": 1,
            "modified": None,
        }
        response = client.patch(
            f"{BASE_PATH}/BTN_SAVE",
            json={"translations": {"en": "Save now"}},
        )
        assert response.status_code == 200
        assert response.json()["success"] is True
        mock_patch.assert_called_once()
        assert mock_patch.call_args.kwargs["resolved_app_key"] == APP_KEY

    @patch("apps.app_db.router.translations.service.create_translation")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_create_bulk_translations_returns_partial_success_meta(self, mock_resolve, mock_create, client):
        mock_resolve.return_value = 42
        mock_create.side_effect = [
            {
                "id": 2,
                "code": "BTN_SAVE",
                "app_key": APP_KEY,
                "default_text": "Save",
                "created_user_id": 1,
                "created": None,
                "modified_user_id": 1,
                "modified": None,
            },
            ValueError("Translation code 'BTN_SAVE' already exists"),
        ]

        response = client.post(
            BASE_PATH,
            json=[
                {"code": "BTN_SAVE", "translations": {"en": "Save"}},
                {"code": "BTN_SAVE", "translations": {"en": "Save duplicate"}},
            ],
        )

        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)
        assert len(body["data"]) == 1
        assert body["meta"]["count"] == 1
        assert len(body["meta"]["errors"]) == 1

    @patch("apps.app_db.router.translations.service.create_translation")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_create_translation_uses_global_scope_when_is_global_true(self, mock_resolve, mock_create, client):
        mock_create.return_value = {
            "id": 3,
            "code": "BTN_GLOBAL",
            "app_key": None,
            "default_text": "Global",
            "created_user_id": 1,
            "created": None,
            "modified_user_id": 1,
            "modified": None,
        }
        response = client.post(
            BASE_PATH,
            json={"code": "BTN_GLOBAL", "is_global": True, "translations": {"en": "Global"}},
        )
        assert response.status_code == 201
        assert response.json()["success"] is True
        mock_resolve.assert_not_called()
        mock_create.assert_called_once()
        assert mock_create.call_args.kwargs["app_key_filter"] is None

    @patch("apps.app_db.router.translations.service.delete_translation")
    def test_delete_global_translation_success(self, mock_delete, client):
        mock_delete.return_value = True
        response = client.delete(f"{BASE_PATH}/BTN_SAVE")
        assert response.status_code == 204
        mock_delete.assert_called_once_with(
            translation_code="BTN_SAVE",
            resolved_app_key=APP_KEY,
        )

    @patch("apps.app_db.router.translations.service.delete_translation")
    def test_delete_global_translation_not_found(self, mock_delete, client):
        mock_delete.return_value = False
        response = client.delete(f"{BASE_PATH}/BTN_UNKNOWN")
        assert response.status_code == 404
        assert response.json()["success"] is False


class TestMultipleDeleteTranslations:
    """Tests for POST /translations/multiple-delete."""

    def test_multiple_delete_empty_list_returns_success_with_no_deletions(self, client):
        response = client.post(f"{BASE_PATH}/multiple-delete", json=[])
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["deleted"] == []
        assert body.get("meta") is None
        assert "No translation codes provided" in body["message"]

    @patch("apps.app_db.router.translations.service.multiple_delete_translations")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_multiple_delete_success(self, mock_resolve, mock_multi, client):
        mock_resolve.return_value = 42
        mock_multi.return_value = {"deleted": ["SAVE", "CANCEL"], "errors": []}
        response = client.post(f"{BASE_PATH}/multiple-delete", json=["SAVE", "CANCEL"])
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["deleted"] == ["SAVE", "CANCEL"]
        assert body.get("meta") is None
        mock_multi.assert_called_once_with(
            translation_codes=["SAVE", "CANCEL"],
            resolved_app_key=APP_KEY,
        )

    @patch("apps.app_db.router.translations.service.multiple_delete_translations")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_multiple_delete_partial_success_includes_meta_errors(self, mock_resolve, mock_multi, client):
        mock_resolve.return_value = 42
        mock_multi.return_value = {
            "deleted": ["SAVE"],
            "errors": [{"index": 1, "translation_code": "UNKNOWN", "error": "Translation 'UNKNOWN' not found"}],
        }
        response = client.post(f"{BASE_PATH}/multiple-delete", json=["SAVE", "UNKNOWN"])
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["deleted"] == ["SAVE"]
        assert body["meta"]["errors"][0]["translation_code"] == "UNKNOWN"

    @patch("apps.app_db.router.translations.service.multiple_delete_translations")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_multiple_delete_returns_404_when_application_not_found(self, mock_resolve, mock_multi, client):
        mock_resolve.return_value = None
        response = client.post(f"{BASE_PATH}/multiple-delete", json=["SAVE"])
        assert response.status_code == 404
        assert response.json()["success"] is False
        mock_multi.assert_not_called()

    @patch("apps.app_db.router.translations.service.multiple_delete_translations")
    @patch("apps.app_db.router.translations.service.resolve_app_key_to_app_id")
    def test_multiple_delete_returns_500_on_unexpected_error(self, mock_resolve, mock_multi, client):
        mock_resolve.return_value = 42
        mock_multi.side_effect = RuntimeError("db down")
        response = client.post(f"{BASE_PATH}/multiple-delete", json=["SAVE"])
        assert response.status_code == 500
        assert response.json()["success"] is False


class TestGetTranslationByCode:
    """Tests for GET /translations/{translation_code}."""

    @patch("apps.app_db.router.translations.service.get_translation_by_code")
    def test_get_translation_by_code_success(self, mock_get, client):
        mock_get.return_value = {
            "id": 1,
            "code": "BTN_SAVE",
            "app_key": None,
            "default_text": "Save",
            "created_user_id": 1,
            "created": None,
            "modified_user_id": 1,
            "modified": None,
            "translations": {"en": "Save", "fr": "Enregistrer"},
        }

        response = client.get(f"{BASE_PATH}/BTN_SAVE")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["code"] == "BTN_SAVE"
        assert body["data"]["translations"]["fr"] == "Enregistrer"
        assert "app_key" not in body["data"]
        assert "created_user_id" not in body["data"]
        assert "created" not in body["data"]
        assert "modified_user_id" not in body["data"]
        assert "modified" not in body["data"]
        mock_get.assert_called_once_with(translation_code="BTN_SAVE")

    @patch("apps.app_db.router.translations.service.get_translation_by_code")
    def test_get_translation_by_code_not_found(self, mock_get, client):
        mock_get.return_value = None

        response = client.get(f"{BASE_PATH}/BTN_UNKNOWN")

        assert response.status_code == 404
        body = response.json()
        assert body["success"] is False
        assert body["err_message"] == "Translation identifier BTN_UNKNOWN not found"

    @patch("apps.app_db.router.translations.service.get_translation_by_code")
    def test_get_translation_by_code_serializes_datetime_fields(self, mock_get, client):
        mock_get.return_value = {
            "id": 1,
            "code": "BTN_SAVE",
            "app_key": None,
            "default_text": "Save",
            "created_user_id": 1,
            "created": datetime(2026, 1, 1, 10, 30, 0),
            "modified_user_id": 1,
            "modified": datetime(2026, 1, 2, 11, 45, 0),
            "translations": {"en": "Save"},
        }

        response = client.get(f"{BASE_PATH}/BTN_SAVE")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "created" not in body["data"]
        assert "modified" not in body["data"]
