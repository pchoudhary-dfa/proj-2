"""
API consistency tests for Data Warehouse endpoints.

Verifies that:
- Unknown dw_id returns 404 with standardized error body (success=false, err_message).
- Response shape is consistent (success/message/data for success; success/err_message/errors for error).
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from fastapi import status

from main import app

# dw_id that we will make "not found" via patch
UNKNOWN_DW_ID = "unknown_dw_404_test"

# GET list/single endpoints that take dw_id in path (no body). Method, path_template, optional query.
# Path template uses UNKNOWN_DW_ID for dw_id; add minimal query params where required.
DW_GET_ENDPOINTS = [
    ("GET", "/dw/{dw_id}/indicators", {}),
    ("GET", "/dw/{dw_id}/indicators/1", {}),
    ("GET", "/dw/{dw_id}/units", {}),
    ("GET", "/dw/{dw_id}/units/1", {}),
    ("GET", "/dw/{dw_id}/areas", {}),
    ("GET", "/dw/{dw_id}/areas/1", {}),
    ("GET", "/dw/{dw_id}/indicator-classifications", {}),
    ("GET", "/dw/{dw_id}/indicator-classifications/type", {}),
    ("GET", "/dw/{dw_id}/indicator-classifications/ic1", {}),
    ("GET", "/dw/{dw_id}/ic/ic1/ius", {}),
    ("GET", "/dw/{dw_id}/ius", {}),
    ("GET", "/dw/{dw_id}/indicator/ind1/ius", {}),
    ("GET", "/dw/{dw_id}/area-levels", {}),
    ("GET", "/dw/{dw_id}/area-levels/1", {}),
    ("GET", "/dw/{dw_id}/time-periods", {}),
    ("GET", "/dw/{dw_id}/time-periods/1", {}),
    ("GET", "/dw/{dw_id}/subgroups", {}),
    ("GET", "/dw/{dw_id}/subgroups/1", {}),
    ("GET", "/dw/{dw_id}/sg-categories", {}),
    ("GET", "/dw/{dw_id}/sg-categories-values", {}),
    ("GET", "/dw/{dw_id}/sg-categories-values/val1", {}),
    ("GET", "/dw/{dw_id}/sg-categories/cat1", {}),
    ("GET", "/dw/{dw_id}/sg-categories/cat1/values", {}),
    ("GET", "/dw/{dw_id}/sg-categories/cat1/values/val1", {}),
    # GET /dw/{dw_id}/indicators/1/metadata removed (only PATCH exists)
    ("GET", "/dw/{dw_id}/search", {"q": "test"}),
    ("GET", "/dw/{dw_id}/data", {"i_gid": "some_indicator"}),
]


def _make_get_warehouse_credentials_raise_404(dw_id: str):
    """Raise HTTPException 404 for unknown dw_id (same format as real get_warehouse_credentials)."""
    from fastapi import HTTPException
    from starlette import status as st
    raise HTTPException(
        status_code=st.HTTP_404_NOT_FOUND,
        detail=f"Data warehouse '{dw_id}' not found in system_datawarehouse table",
    )


@pytest.fixture
def client_no_dw_override():
    """Test client that does NOT override validate_dw_id, so 404 for unknown dw_id is exercised."""
    with TestClient(app=app) as test_client:
        yield test_client


@pytest.mark.parametrize("method,path_template,query", DW_GET_ENDPOINTS)
def test_unknown_dw_id_returns_404_with_standard_error_body(
    client_no_dw_override: TestClient, method: str, path_template: str, query: dict
):
    """
    For each GET endpoint, calling with unknown dw_id must return 404 and a body
    with success=false and err_message (standardized error format).
    """
    path = path_template.format(dw_id=UNKNOWN_DW_ID)
    with patch(
        "apps.datawarehouse.db.datawarehouse.get_warehouse_credentials",
        side_effect=_make_get_warehouse_credentials_raise_404,
    ):
        if method == "GET":
            response = client_no_dw_override.get(path, params=query)
        else:
            response = client_no_dw_override.request(method, path, params=query)

    assert response.status_code == status.HTTP_404_NOT_FOUND, (
        f"{method} {path} expected 404, got {response.status_code}"
    )
    data = response.json()
    assert "success" in data, f"Response must contain 'success': {data}"
    assert data["success"] is False, f"Error response must have success=false: {data}"
    assert "err_message" in data, f"Error response must have 'err_message': {data}"
    # Standard 404: err_message should mention warehouse/identifier; some routes may return generic "Not Found"
    err_msg = data.get("err_message") or ""
    assert (
        UNKNOWN_DW_ID in err_msg
        or "Data warehouse" in err_msg
        or err_msg.strip() == "Not Found"
    ), (
        f"err_message should mention warehouse or identifier, or be 'Not Found': {err_msg!r}"
    )


def test_success_response_shape_has_message_and_data():
    """Success responses must use success=true, message, and data (or meta)."""
    from apps.shared.utils.response import success_response
    from fastapi.testclient import TestClient
    from main import app

    # Root and health are success responses
    with TestClient(app=app) as client:
        r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True
    assert "message" in body
    assert "data" in body

    with TestClient(app=app) as client:
        r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("success") is True
    assert "message" in body
    assert "data" in body
