"""
Unit tests for TranslationService.
Uses Arrange-Act-Assert; database session is mocked.
"""
import pytest
from io import BytesIO
from unittest.mock import MagicMock, patch
from openpyxl import Workbook

from apps.app_db.services.translation_service import TranslationService
from apps.app_db.schemas.core import (
    SystemLanguageTranslationCreateSchema,
    SystemLanguageTranslationPatchSchema,
)


def _make_master(id_: int, code: str, default_text: str, app_key=None):
    m = MagicMock()
    m.id = id_
    m.code = code
    m.trans_code = code
    m.default_text = default_text
    m.app_key = app_key
    return m


def _make_i18n_row(master_id: int, translated_text: str):
    r = MagicMock()
    r.master_id = master_id
    r.translated_text = translated_text
    return r


def _make_i18n_export_row(master_id: int, locale: str, translated_text: str):
    r = MagicMock()
    r.master_id = master_id
    r.locale = locale
    r.translated_text = translated_text
    return r


def _make_language(locale: str):
    row = MagicMock()
    row.locale = locale
    row.is_default = locale == "en"
    return row


def _build_xlsx_bytes(headers: list[str], rows: list[list[str]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    output = BytesIO()
    wb.save(output)
    return output.getvalue()


class TestResolveapp_keyToAppId:
    """Tests for TranslationService.resolve_app_key_to_app_id."""

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_returns_app_id_when_application_exists(self, mock_session_local):
        # Arrange
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_app = MagicMock()
        mock_app.id = 42
        q = MagicMock()
        q.filter.return_value.first.return_value = mock_app
        mock_db.query.return_value = q

        service = TranslationService()

        # Act
        result = service.resolve_app_key_to_app_id("myapp")

        # Assert
        assert result == 42
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_returns_none_when_application_not_found(self, mock_session_local):
        # Arrange
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        q = MagicMock()
        q.filter.return_value.first.return_value = None
        mock_db.query.return_value = q

        service = TranslationService()

        # Act
        result = service.resolve_app_key_to_app_id("nonexistent")

        # Assert
        assert result is None
        assert mock_db.close.called


class TestGetTranslationsForLocale:
    """Tests for TranslationService.get_translations_for_locale."""

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_returns_global_translations_when_app_key_filter_is_none(
        self, mock_session_local
    ):
        # Arrange: global only (app_key IS NULL)
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        master1 = _make_master(1, "welcome", "Welcome", app_key=None)
        master2 = _make_master(2, "save", "Save", app_key=None)
        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [
            master1,
            master2,
        ]
        # I18n query returns empty (no i18n rows) -> use default_text
        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = []
        mock_db.query.side_effect = [q_masters, q_i18n]

        service = TranslationService()

        # Act
        result = service.get_translations_for_locale("en", app_key_filter=None)

        # Assert
        assert result == {"welcome": "Welcome", "save": "Save"}
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_uses_i18n_translated_text_when_present(self, mock_session_local):
        # Arrange: one master, i18n row for locale "fr"
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        master = _make_master(1, "welcome", "Welcome", app_key=None)
        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [
            master,
        ]
        i18n_row = _make_i18n_row(1, "Bienvenue")
        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = [i18n_row]
        mock_db.query.side_effect = [q_masters, q_i18n]

        service = TranslationService()

        # Act
        result = service.get_translations_for_locale("fr", app_key_filter=None)

        # Assert
        assert result == {"welcome": "Bienvenue"}
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_skips_master_when_code_is_none(self, mock_session_local):
        # Arrange: one master with code=None
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        master = _make_master(1, None, "Default", app_key=None)
        master.code = None
        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [
            master,
        ]
        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = []
        mock_db.query.side_effect = [q_masters, q_i18n]

        service = TranslationService()

        # Act
        result = service.get_translations_for_locale("en", app_key_filter=None)

        # Assert
        assert result == {}
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_returns_empty_dict_when_no_masters(self, mock_session_local):
        # Arrange
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = []
        mock_db.query.return_value = q_masters

        service = TranslationService()

        # Act
        result = service.get_translations_for_locale("en", app_key_filter=None)

        # Assert
        assert result == {}
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_app_specific_overrides_global_for_same_code_with_app_key_filter(
        self, mock_session_local
    ):
        # Arrange: global master (id=1, code=welcome) then app-specific (id=2, same code)
        # Order by app_key: NULL first, then app_key="myapp". So master1 then master2.
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        master_global = _make_master(1, "welcome", "Welcome", app_key=None)
        master_app = _make_master(2, "welcome", "App Welcome", app_key="myapp")
        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [
            master_global,
            master_app,
        ]
        # I18n: only for master 2 (app-specific) in "en"
        i18n_app = _make_i18n_row(2, "App Welcome EN")
        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = [i18n_app]
        mock_db.query.side_effect = [q_masters, q_i18n]

        service = TranslationService()

        # Act: app_key_filter="myapp" merges global + app; later row overrides
        result = service.get_translations_for_locale("en", app_key_filter="myapp")

        # Assert: final value for "welcome" is from master_app (later in list)
        assert result["welcome"] == "App Welcome EN"
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_closes_session_on_exception(self, mock_session_local):
        # Arrange
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        mock_db.query.side_effect = RuntimeError("DB error")

        service = TranslationService()

        # Act & Assert
        with pytest.raises(RuntimeError, match="DB error"):
            service.get_translations_for_locale("en", app_key_filter=None)
        assert mock_db.close.called


class TestGetTranslationExportTable:
    """Tests for TranslationService.get_translation_export_table."""

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_returns_global_export_table(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        lang_query = MagicMock()
        lang_query.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
            _make_language("fr"),
        ]

        master_query = MagicMock()
        master_query.filter.return_value.order_by.return_value.all.return_value = [
            _make_master(1, "ABOUT", "About", app_key=None),
        ]

        i18n_query = MagicMock()
        i18n_query.filter.return_value.filter.return_value.all.return_value = [
            _make_i18n_export_row(1, "fr", "A propos"),
        ]

        mock_db.query.side_effect = [lang_query, master_query, i18n_query]

        service = TranslationService()
        result = service.get_translation_export_table(app_key_filter=None)

        assert result["columns"] == ["Code", "en", "fr"]
        assert result["rows"][0]["Code"] == "ABOUT"
        assert result["rows"][0]["en"] == "About"
        assert result["rows"][0]["fr"] == "A propos"
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_app_specific_row_overrides_global_in_export(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        lang_query = MagicMock()
        lang_query.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
        ]

        master_query = MagicMock()
        master_query.filter.return_value.order_by.return_value.all.return_value = [
            _make_master(1, "ABOUT", "About Global", app_key=None),
            _make_master(2, "ABOUT", "About App", app_key="MYAPP"),
        ]

        i18n_query = MagicMock()
        i18n_query.filter.return_value.filter.return_value.all.return_value = []

        mock_db.query.side_effect = [lang_query, master_query, i18n_query]

        service = TranslationService()
        result = service.get_translation_export_table(app_key_filter="MYAPP")

        assert result["rows"][0]["Code"] == "ABOUT"
        assert result["rows"][0]["en"] == "About App"
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_export_search_filters_rows(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        lang_query = MagicMock()
        lang_query.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
        ]

        master_query = MagicMock()
        master_query.filter.return_value.order_by.return_value.all.return_value = [
            _make_master(1, "KEEP", "X", app_key=None),
            _make_master(2, "DROP", "Y", app_key=None),
        ]

        i18n_query = MagicMock()
        i18n_query.filter.return_value.filter.return_value.all.return_value = []

        mock_db.query.side_effect = [lang_query, master_query, i18n_query]

        service = TranslationService()
        result = service.get_translation_export_table(
            app_key_filter=None,
            search="KEE",
            search_by="trans_code",
        )

        assert len(result["rows"]) == 1
        assert result["rows"][0]["Code"] == "KEEP"


class TestGetTranslationsForLocalePaginated:
    """Tests for TranslationService.get_translations_for_locale_paginated."""

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_returns_accept_language_as_default_and_requested_locale_map(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
            _make_language("fr"),
        ]

        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [
            _make_master(1, "ABOUT", "About", app_key=None),
        ]

        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = [
            _make_i18n_export_row(1, "fr", "A propos"),
        ]

        mock_db.query.side_effect = [q_languages, q_masters, q_i18n]

        service = TranslationService()
        records, total_count, effective_page_size = service.get_translations_for_locale_paginated(
            locale="en",
            app_key_filter=None,
            page=1,
            page_size=None,
            requested_locale="fr",
        )

        assert total_count == 1
        assert effective_page_size is None
        assert records == [{"ABOUT": {"en": "About", "fr": "A propos"}}]
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_falls_back_to_system_default_when_accept_language_is_unsupported(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
            _make_language("fr"),
        ]

        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [
            _make_master(1, "ABOUT", "About", app_key=None),
        ]

        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = []

        mock_db.query.side_effect = [q_languages, q_masters, q_i18n]

        service = TranslationService()
        records, total_count, effective_page_size = service.get_translations_for_locale_paginated(
            locale="de",
            app_key_filter=None,
            page=1,
            page_size=None,
            requested_locale=None,
        )

        assert total_count == 1
        assert effective_page_size is None
        assert records == [{"ABOUT": {"en": "About"}}]
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_returns_all_locales_when_requested_all(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
            _make_language("fr"),
            _make_language("ar"),
        ]

        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [
            _make_master(1, "ABOUT", "About", app_key=None),
        ]

        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = [
            _make_i18n_export_row(1, "fr", "A propos"),
            _make_i18n_export_row(1, "ar", "About ar"),
        ]

        mock_db.query.side_effect = [q_languages, q_masters, q_i18n]

        service = TranslationService()
        records, total_count, _ = service.get_translations_for_locale_paginated(
            locale="en",
            app_key_filter=None,
            page=1,
            page_size=None,
            requested_locale="all",
        )

        assert total_count == 1
        assert records == [{"ABOUT": {"en": "About", "fr": "A propos", "ar": "About ar"}}]
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_sort_trans_code_asc_then_paginate(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
        ]

        m_zebra = _make_master(2, "ZEBRA", "Z", app_key=None)
        m_apple = _make_master(1, "APPLE", "A", app_key=None)
        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [m_zebra, m_apple]

        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = []

        mock_db.query.side_effect = [q_languages, q_masters, q_i18n]

        service = TranslationService()
        records, total_count, effective_page_size = service.get_translations_for_locale_paginated(
            locale="en",
            app_key_filter=None,
            page=1,
            page_size=1,
            requested_locale=None,
            sort_field="trans_code",
            sort_order="asc",
        )

        assert total_count == 2
        assert effective_page_size == 1
        assert records == [{"APPLE": {"en": "A"}}]
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_search_trans_code_filters_rows(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
        ]

        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [
            _make_master(1, "APPLE", "A", app_key=None),
            _make_master(2, "BANANA", "B", app_key=None),
        ]

        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = []

        mock_db.query.side_effect = [q_languages, q_masters, q_i18n]

        service = TranslationService()
        records, total_count, _ = service.get_translations_for_locale_paginated(
            locale="en",
            app_key_filter=None,
            page=1,
            page_size=None,
            requested_locale=None,
            search="PP",
            search_by="trans_code",
        )

        assert total_count == 1
        assert records == [{"APPLE": {"en": "A"}}]
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_search_translation_text_matches_locale_value(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
        ]

        m1 = _make_master(1, "K1", "Default1", app_key=None)
        m2 = _make_master(2, "K2", "Default2", app_key=None)
        q_masters = MagicMock()
        q_masters.filter.return_value.order_by.return_value.all.return_value = [m1, m2]

        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = [
            _make_i18n_export_row(1, "en", "UniquePhrase"),
        ]

        mock_db.query.side_effect = [q_languages, q_masters, q_i18n]

        service = TranslationService()
        records, total_count, _ = service.get_translations_for_locale_paginated(
            locale="en",
            app_key_filter=None,
            page=1,
            page_size=None,
            requested_locale=None,
            search="unique",
            search_by="translation_text",
        )

        assert total_count == 1
        assert records == [{"K1": {"en": "UniquePhrase"}}]
        assert mock_db.close.called


class TestTranslationWriteOperations:
    """Tests for create/patch/get-by-code behaviors."""

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_create_translation_derives_default_text_from_default_locale(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_existing = MagicMock()
        q_existing.filter.return_value.all.return_value = []

        q_locales = MagicMock()
        q_locales.filter.return_value.all.return_value = [("en",), ("fr",)]

        lang_en = _make_language("en")
        lang_en.is_default = True
        lang_fr = _make_language("fr")
        lang_fr.is_default = False
        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [lang_en, lang_fr]

        mock_db.query.side_effect = [q_existing, q_locales, q_languages]

        service = TranslationService()
        payload = SystemLanguageTranslationCreateSchema(
            code="BTN_SAVE",
            translations={"fr": "Enregistrer", "en": "Save"},
        )

        row = service.create_translation(payload=payload, user_id=1)

        assert row.default_text == "Save"
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_create_translation_falls_back_to_first_language_key_when_default_missing(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_existing = MagicMock()
        q_existing.filter.return_value.all.return_value = []

        q_locales = MagicMock()
        q_locales.filter.return_value.all.return_value = [("en",), ("fr",), ("de",)]

        lang_en = _make_language("en")
        lang_en.is_default = True
        lang_fr = _make_language("fr")
        lang_fr.is_default = False
        lang_de = _make_language("de")
        lang_de.is_default = False
        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [lang_en, lang_fr, lang_de]

        mock_db.query.side_effect = [q_existing, q_locales, q_languages]

        service = TranslationService()
        payload = SystemLanguageTranslationCreateSchema(
            code="BTN_ABOUT",
            translations={"fr": "A propos", "de": "Uber"},
        )

        row = service.create_translation(payload=payload, user_id=1)

        assert row.default_text == "A propos"
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_create_translation_rejects_invalid_locale(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        # Existing code lookup -> no duplicates
        q_master = MagicMock()
        q_master.filter.return_value.all.return_value = []

        # Active locales from system_language -> only en
        q_locale = MagicMock()
        q_locale.filter.return_value.all.return_value = [("en",)]

        mock_db.query.side_effect = [q_master, q_locale]

        service = TranslationService()
        payload = SystemLanguageTranslationCreateSchema(
            code="BTN_SAVE",
            translations={"fr": "Enregistrer"},
        )

        with pytest.raises(ValueError, match="Invalid locale\\(s\\): fr"):
            service.create_translation(payload=payload, user_id=1)
        assert mock_db.rollback.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_patch_translation_keeps_translation_code_unchanged(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        current = _make_master(1, "BTN_SAVE", "Save", app_key=None)

        q_find_current = MagicMock()
        q_find_current.filter.return_value.filter.return_value.all.return_value = [current]
        mock_db.query.side_effect = [q_find_current]

        service = TranslationService()
        payload = SystemLanguageTranslationPatchSchema()

        row = service.patch_translation(
            translation_code="BTN_SAVE",
            payload=payload,
            user_id=7,
        )

        assert row is not None
        assert row.trans_code == "BTN_SAVE"
        assert row.modified_user_id == 7
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_patch_translation_uses_app_scope_filter(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        current = _make_master(1, "BTN_SAVE", "Save", app_key="MYAPP")
        q_find_current = MagicMock()
        q_find_current.filter.return_value.filter.return_value.all.return_value = [current]
        mock_db.query.side_effect = [q_find_current]

        service = TranslationService()
        payload = SystemLanguageTranslationPatchSchema()

        row = service.patch_translation(
            translation_code="BTN_SAVE",
            payload=payload,
            user_id=7,
            resolved_app_key="MYAPP",
        )

        assert row is not None
        assert row.app_key == "MYAPP"
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_patch_translation_returns_none_when_scope_not_found(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_app = MagicMock()
        q_app.filter.return_value.filter.return_value.all.return_value = []
        q_global = MagicMock()
        q_global.filter.return_value.filter.return_value.all.return_value = []
        mock_db.query.side_effect = [q_app, q_global]

        service = TranslationService()
        payload = SystemLanguageTranslationPatchSchema()

        row = service.patch_translation(
            translation_code="BTN_SAVE",
            payload=payload,
            user_id=7,
            resolved_app_key="MYAPP",
        )

        assert row is None
        assert not mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_patch_translation_falls_back_to_global_when_app_row_missing(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        global_row = _make_master(1, "BTN_SAVE", "Save", app_key=None)
        q_app = MagicMock()
        q_app.filter.return_value.filter.return_value.all.return_value = []
        q_global = MagicMock()
        q_global.filter.return_value.filter.return_value.all.return_value = [global_row]
        mock_db.query.side_effect = [q_app, q_global]

        service = TranslationService()
        payload = SystemLanguageTranslationPatchSchema()

        row = service.patch_translation(
            translation_code="BTN_SAVE",
            payload=payload,
            user_id=7,
            resolved_app_key="MYAPP",
        )

        assert row is global_row
        assert row.app_key is None
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_patch_translation_updates_default_text_when_default_locale_translation_present(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        current = _make_master(1, "BTN_SAVE", "Save", app_key=None)
        q_find_current = MagicMock()
        q_find_current.filter.return_value.filter.return_value.all.return_value = [current]

        q_locale = MagicMock()
        q_locale.filter.return_value.all.return_value = [("en",), ("fr",)]

        lang_en = _make_language("en")
        lang_en.is_default = True
        lang_fr = _make_language("fr")
        lang_fr.is_default = False
        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [lang_en, lang_fr]

        existing_i18n = _make_i18n_export_row(1, "en", "Save")
        q_i18n = MagicMock()
        q_i18n.filter.return_value.first.return_value = existing_i18n

        mock_db.query.side_effect = [q_find_current, q_locale, q_languages, q_i18n]

        service = TranslationService()
        payload = SystemLanguageTranslationPatchSchema(translations={"en": "Save Updated"})

        row = service.patch_translation("BTN_SAVE", payload=payload, user_id=3)

        assert row.default_text == "Save Updated"
        assert existing_i18n.translated_text == "Save Updated"
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_patch_translation_keeps_default_text_when_default_locale_not_provided(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        current = _make_master(1, "BTN_SAVE", "Save", app_key=None)
        q_find_current = MagicMock()
        q_find_current.filter.return_value.filter.return_value.all.return_value = [current]

        q_locale = MagicMock()
        q_locale.filter.return_value.all.return_value = [("en",), ("fr",)]

        lang_en = _make_language("en")
        lang_en.is_default = True
        lang_fr = _make_language("fr")
        lang_fr.is_default = False
        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [lang_en, lang_fr]

        existing_i18n = _make_i18n_export_row(1, "fr", "Enregistrer")
        q_i18n = MagicMock()
        q_i18n.filter.return_value.first.return_value = existing_i18n

        mock_db.query.side_effect = [q_find_current, q_locale, q_languages, q_i18n]

        service = TranslationService()
        payload = SystemLanguageTranslationPatchSchema(translations={"fr": "Enregistrer mis a jour"})

        row = service.patch_translation("BTN_SAVE", payload=payload, user_id=3)

        assert row.default_text == "Save"
        assert existing_i18n.translated_text == "Enregistrer mis a jour"
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_get_translation_by_code_returns_master_and_i18n(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        master = _make_master(3, "BTN_SAVE", "Save", app_key="MYAPP")
        master.created_user_id = 1
        master.created = None
        master.modified_user_id = 2
        master.modified = None

        q_master = MagicMock()
        q_master.filter.return_value.all.return_value = [master]
        q_i18n = MagicMock()
        i18n_en = _make_i18n_export_row(3, "en", "Save")
        i18n_fr = _make_i18n_export_row(3, "fr", "Enregistrer")
        q_i18n.filter.return_value.all.return_value = [i18n_en, i18n_fr]
        mock_db.query.side_effect = [q_master, q_i18n]

        service = TranslationService()
        result = service.get_translation_by_code("BTN_SAVE")

        assert result is not None
        assert result["code"] == "BTN_SAVE"
        assert result["translations"] == {"en": "Save", "fr": "Enregistrer"}
        assert mock_db.close.called


class TestTranslationMultipleDelete:
    """Tests for TranslationService.multiple_delete_translations."""

    @patch.object(TranslationService, "delete_translation")
    def test_multiple_delete_dedupes_and_records_not_found(self, mock_delete):
        mock_delete.side_effect = [True, False]
        service = TranslationService()
        result = service.multiple_delete_translations(
            ["A", "A", "B"],
            resolved_app_key="MYAPP",
        )
        assert result["deleted"] == ["A"]
        assert len(result["errors"]) == 1
        assert result["errors"][0]["translation_code"] == "B"
        assert mock_delete.call_count == 2

    @patch.object(TranslationService, "delete_translation")
    def test_multiple_delete_records_value_error_per_item(self, mock_delete):
        mock_delete.side_effect = [ValueError("Multiple translations found for code 'X'")]
        service = TranslationService()
        result = service.multiple_delete_translations(["X"], resolved_app_key=None)
        assert result["deleted"] == []
        assert len(result["errors"]) == 1
        assert "Multiple translations" in result["errors"][0]["error"]

    @patch.object(TranslationService, "delete_translation")
    def test_multiple_delete_skips_blank_codes(self, mock_delete):
        mock_delete.return_value = True
        service = TranslationService()
        result = service.multiple_delete_translations(["  OK  ", "", "  "], resolved_app_key=None)
        assert result["deleted"] == ["OK"]
        mock_delete.assert_called_once_with(translation_code="OK", resolved_app_key=None)


class TestImportTranslationsFromXlsx:
    """Tests for TranslationService.import_translations_from_xlsx."""

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_rejects_duplicate_locale_columns(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db
        service = TranslationService()
        file_bytes = _build_xlsx_bytes(
            headers=["Code", "en", "EN"],
            rows=[["ABOUT", "About", "About Updated"]],
        )

        with pytest.raises(ValueError, match="Duplicate locale column\\(s\\) in Excel: en"):
            service.import_translations_from_xlsx(
                file_bytes=file_bytes,
                app_key_filter="MYAPP",
                user_id=1,
            )

        assert mock_db.rollback.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_import_inserts_rows_and_skips_empty_code(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
            _make_language("fr"),
        ]

        q_existing = MagicMock()
        q_existing.filter.return_value.filter.return_value.all.return_value = []

        mock_db.query.side_effect = [q_languages, q_existing]

        service = TranslationService()
        file_bytes = _build_xlsx_bytes(
            headers=["Code", "en", "fr"],
            rows=[
                ["", "Ignore", "Ignorer"],
                ["ABOUT", "About", "A propos"],
            ],
        )

        result = service.import_translations_from_xlsx(
            file_bytes=file_bytes,
            app_key_filter="MYAPP",
            user_id=1,
        )

        assert result["total_rows"] == 1
        assert result["inserted"] == 1
        assert result["updated"] == 0
        assert result["skipped_empty_code"] == 1
        assert mock_db.commit.called
        assert mock_db.close.called

    @patch("apps.app_db.services.translation_service.SessionLocal")
    def test_import_empty_locale_value_updates_existing_translation_to_blank(self, mock_session_local):
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        q_languages = MagicMock()
        q_languages.filter.return_value.order_by.return_value.all.return_value = [
            _make_language("en"),
            _make_language("fr"),
        ]

        existing_master = _make_master(11, "ABOUT", "About", app_key="MYAPP")
        q_existing = MagicMock()
        q_existing.filter.return_value.filter.return_value.all.return_value = [existing_master]

        existing_i18n_fr = _make_i18n_export_row(11, "fr", "A propos")
        q_i18n = MagicMock()
        q_i18n.filter.return_value.all.return_value = [existing_i18n_fr]

        mock_db.query.side_effect = [q_languages, q_existing, q_i18n]

        service = TranslationService()
        file_bytes = _build_xlsx_bytes(
            headers=["Code", "en", "fr"],
            rows=[["ABOUT", "About", ""]],
        )

        result = service.import_translations_from_xlsx(
            file_bytes=file_bytes,
            app_key_filter="MYAPP",
            user_id=1,
        )

        assert result["inserted"] == 0
        assert result["updated"] == 1
        assert existing_i18n_fr.translated_text == ""
        assert mock_db.commit.called
        assert mock_db.close.called
