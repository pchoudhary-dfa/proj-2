import pytest
from unittest.mock import patch, ANY
from fastapi.testclient import TestClient
from fastapi import status

from main import app
from apps.datawarehouse.utils.export_utils import (
    get_ic_ius_import_header_inverse_map,
    normalize_import_header_cell,
)


UNKNOWN_DW_ID = "unknown_dw_404_test"


@pytest.fixture(autouse=True)
def _iam_public_for_ic_ius_tests(monkeypatch):
    """Allow /dw/.../ic-ius/* through IAM as PUBLIC (matches area import tests)."""
    monkeypatch.setattr(
        "apps.shared.middleware.auth_middleware._matches_for_path",
        lambda _method, _path: [("DFA_DM", "PUBLIC", -1)],
    )


def _make_get_warehouse_credentials_raise_404(dw_id: str):
    from fastapi import HTTPException
    from starlette import status as st

    raise HTTPException(
        status_code=st.HTTP_404_NOT_FOUND,
        detail=f"Data warehouse '{dw_id}' not found in system_datawarehouse table",
    )


@pytest.fixture
def client_no_dw_override():
    with TestClient(app=app) as test_client:
        yield test_client


def test_export_ic_ius_unknown_dw_id_returns_identifier_not_found(client_no_dw_override: TestClient):
    with patch(
        "apps.datawarehouse.db.datawarehouse.get_warehouse_credentials",
        side_effect=_make_get_warehouse_credentials_raise_404,
    ):
        response = client_no_dw_override.post(f"/dw/{UNKNOWN_DW_ID}/ic-ius/export")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    body = response.json()
    assert body["success"] is False
    # Standardized message from identifier_not_found_response
    assert body.get("err_message") == f"Data warehouse identifier {UNKNOWN_DW_ID} not found"


def test_import_ic_ius_unknown_dw_id_returns_identifier_not_found(client_no_dw_override: TestClient):
    with patch(
        "apps.datawarehouse.db.datawarehouse.get_warehouse_credentials",
        side_effect=_make_get_warehouse_credentials_raise_404,
    ):
        response = client_no_dw_override.post(
            f"/dw/{UNKNOWN_DW_ID}/ic-ius/import",
            files={"file": ("ic.csv", b"dummy", "text/csv")},
        )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    body = response.json()
    assert body["success"] is False
    assert body.get("err_message") == f"Data warehouse identifier {UNKNOWN_DW_ID} not found"


def test_import_ic_ius_validation_error(client_no_db: TestClient):
    with patch(
        "apps.datawarehouse.router.ic_ius.import_ic_ius_from_file_bytes",
        side_effect=ValueError("Row 2: ClassType is required"),
    ):
        response = client_no_db.post(
            "/dw/test_warehouse/ic-ius/import",
            files={
                "file": (
                    "bad.xlsx",
                    b"dummy",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    data = response.json()
    assert data["success"] is False
    assert "ClassType" in (data.get("err_message") or "")


@patch("apps.datawarehouse.router.ic_ius.cache_delete_pattern")
@patch("apps.datawarehouse.router.ic_ius.import_ic_ius_from_file_bytes")
def test_import_ic_ius_success(mock_import, mock_cache, client_no_db: TestClient):
    mock_import.return_value = {
        "ic_mappings_inserted": 2,
        "ic_mappings_updated": 1,
        "ic_nodes_created": 0,
        "skipped_empty_rows": 1,
    }
    response = client_no_db.post(
        "/dw/test_warehouse/ic-ius/import",
        files={
            "file": (
                "ic.xlsx",
                b"xlsx-bytes",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert data["data"]["ic_mappings_inserted"] == 2
    assert data["data"]["ic_mappings_updated"] == 1
    assert data["meta"]["skipped_empty_rows"] == 1
    mock_import.assert_called_once_with(
        "test_warehouse",
        b"xlsx-bytes",
        language_code=ANY,
        filename="ic.xlsx",
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    assert mock_cache.call_count >= 1


def test_ic_ius_import_header_inverse_includes_level_and_core_fields():
    inv = get_ic_ius_import_header_inverse_map()
    assert inv[normalize_import_header_cell("ClassType")] == "ClassType"
    assert inv[normalize_import_header_cell("IndicatorGid")] == "IndicatorGid"
    assert inv["level1"] == "level_1"
    assert inv["level_1"] == "level_1"

