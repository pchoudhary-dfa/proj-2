from contextlib import contextmanager
from unittest.mock import patch

import pytest
from fastapi import status


# Language export endpoint (POST /dw/{dw_id}/languages/export) is not implemented in the router.
# Schema and service exist; skip these tests until the route is added.
pytestmark = pytest.mark.skip(reason="Language export endpoint not implemented in router (POST /languages/export)")


class _Result:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row

    def fetchall(self):
        return []


def test_export_languages_unknown_dw_id_returns_identifier_not_found(client_no_db):
    from fastapi import HTTPException

    with patch(
        "apps.datawarehouse.router.language.get_warehouse_credentials",
        side_effect=HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data warehouse 'invalid' not found in system_datawarehouse table",
        ),
    ):
        response = client_no_db.post(
            "/dw/invalid/languages/export",
            json={"toLangCode": "fr"},
        )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    body = response.json()
    assert body["success"] is False
    assert body.get("err_message") == "Data warehouse identifier invalid not found"


def test_export_languages_missing_to_lang_code_returns_422(client_no_db):
    response = client_no_db.post(
        "/dw/test_dw/languages/export",
        json={"fromLangCode": "en"},
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_export_languages_invalid_to_lang_code_returns_400(client_no_db):
    dw_db = type("DW", (), {})()

    def _execute(stmt, params=None):
        sql = str(stmt).lower()
        params = params or {}
        if "from ut_language" in sql and "where language_code" in sql:
            code = params.get("code")
            if code == "en":
                return _Result(("en", "di_english [en]", 1))
            if code == "zz":
                return _Result(None)
        return _Result(None)

    setattr(dw_db, "execute", _execute)

    @contextmanager
    def _mock_get_warehouse_session(_warehouse):
        yield dw_db

    with patch(
        "apps.datawarehouse.router.language.get_warehouse_credentials",
        return_value={"db_display_name": "Test DW", "db_database": "test_dw"},
    ), patch(
        "apps.datawarehouse.router.language.credentials_to_schema",
        return_value={"mock": True},
    ), patch(
        "apps.datawarehouse.router.language.get_warehouse_session",
        side_effect=_mock_get_warehouse_session,
    ):
        response = client_no_db.post(
            "/dw/test_dw/languages/export",
            json={"fromLangCode": "en", "toLangCode": "zz"},
        )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    body = response.json()
    assert body["success"] is False
    assert body.get("err_message") == "Language code 'zz' not found in ut_language"


def test_export_languages_no_from_and_no_default_skips_from_column(client_no_db):
    """
    When fromLangCode is omitted and no default language exists in ut_language,
    export should still succeed and skip the from-language column (build 2-column sheets).
    """
    dw_db = type("DW", (), {})()

    def _execute(stmt, params=None):
        sql = str(stmt).lower()
        params = params or {}

        # Default language lookup: none configured
        if "from ut_language" in sql and "where language_default = 1" in sql:
            return _Result(None)

        # Validate to language exists
        if "from ut_language" in sql and "where language_code" in sql:
            code = params.get("code")
            if code == "fr":
                return _Result(("fr", "French [fr]", 0))
            return _Result(None)

        # Table existence checks always succeed in this mock
        if "from information_schema.tables" in sql:
            return _Result((1,))

        # Sheet queries: return no rows
        return _Result(None)

    setattr(dw_db, "execute", _execute)

    @contextmanager
    def _mock_get_warehouse_session(_warehouse):
        yield dw_db

    with patch(
        "apps.datawarehouse.router.language.get_warehouse_credentials",
        return_value={"db_display_name": "Test DW", "db_database": "test_dw"},
    ), patch(
        "apps.datawarehouse.router.language.credentials_to_schema",
        return_value={"mock": True},
    ), patch(
        "apps.datawarehouse.router.language.get_warehouse_session",
        side_effect=_mock_get_warehouse_session,
    ):
        response = client_no_db.post(
            "/dw/test_dw/languages/export",
            json={"toLangCode": "fr"},
        )

    assert response.status_code == status.HTTP_200_OK
    assert (
        response.headers.get("content-type")
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

