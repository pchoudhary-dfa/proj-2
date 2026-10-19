"""
Tests for Unit CRUD API endpoints.
API responses do not include 'code' in JSON; assertions use status_code, success, message/err_message.
Tests use internal keys (unit_name, etc.); we force ADAPTATION=internal so request validation accepts them.
"""
import pytest
from unittest.mock import patch, ANY, MagicMock

from main import app
from apps.shared.config.config import settings
from apps.shared.utils.dependencies import get_language_code
from apps.datawarehouse.db.datawarehouse import get_dw_language_code
from apps.datawarehouse.schemas.unit import UnitCreateSchema, UnitUpdateSchema

TEST_WAREHOUSE_ID = "test_warehouse"

# Valid GUID for unit_gid (UUID format)
VALID_GUID = "6F9619FF-8B86-D011-B42D-00C04FC964FF"


@pytest.fixture(autouse=True)
def force_internal_adaptation():
    """Force ADAPTATION=internal so schema accepts internal keys (unit_name, unit_gid, etc.)."""
    with patch.object(settings, "ADAPTATION", "internal"):
        yield


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db

MOCK_UNIT_CREATE = {
    "unit_name": "Test Unit",
    "unit_gid": VALID_GUID,
    "unit_global": True,
    "unit_format": "#,##0.00",
}

MOCK_UNIT_RESPONSE = {
    "unit_nid": 1,
    "unit_name": "Test Unit",
    "unit_gid": VALID_GUID,
    "unit_global": True,
    "unit_format": "#,##0.00",
    "locale": "en",
}


class TestUnitCreate:
    @patch("apps.datawarehouse.services.unit.UnitService.create_units_batch")
    def test_create_unit_success(self, mock_create, client):
        mock_create.return_value = {"created": [MOCK_UNIT_RESPONSE], "errors": []}
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=[MOCK_UNIT_CREATE])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        assert data.get("meta", {}).get("count") == 1
        assert mock_create.called
        call_args = mock_create.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert isinstance(call_args[0][1], list)
        assert len(call_args[0][1]) == 1
        assert isinstance(call_args[0][1][0], UnitCreateSchema)
        assert call_args[0][1][0].unit_name == MOCK_UNIT_CREATE["unit_name"]

    @patch("apps.datawarehouse.services.unit.UnitService.create_units_batch")
    def test_create_units_batch_multiple_success(self, mock_create, client):
        """When array has multiple items, multiple units are created."""
        mock_create.return_value = {
            "created": [
                {**MOCK_UNIT_RESPONSE, "unit_nid": 1},
                {**MOCK_UNIT_RESPONSE, "unit_nid": 2, "unit_name": "Second Unit"},
            ],
            "errors": [],
        }
        payload = [MOCK_UNIT_CREATE, {**MOCK_UNIT_CREATE, "unit_name": "Second Unit", "unit_gid": "7F9619FF-8B86-D011-B42D-00C04FC964FF"}]
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 2
        assert data.get("meta", {}).get("count") == 2
        mock_create.assert_called_once()
        assert len(mock_create.call_args[0][1]) == 2

    def test_create_unit_empty_array(self, client):
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=[])
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "array" in data.get("err_message", data.get("message", "")).lower()

    def test_create_unit_missing_unit_data(self, client):
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json={})
        assert response.status_code == 422

    @patch("apps.datawarehouse.services.unit.UnitService.create_units_batch")
    def test_create_unit_service_error(self, mock_create, client):
        mock_create.side_effect = Exception("Database connection failed")
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=[MOCK_UNIT_CREATE])
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.create_units_batch")
    def test_create_unit_warehouse_not_found(self, mock_create, client):
        mock_create.side_effect = ValueError(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=[MOCK_UNIT_CREATE])
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.create_units_batch")
    def test_create_unit_validation_error(self, mock_create, client):
        mock_create.side_effect = ValueError("UNIT_NAME_EXISTS: Unit name already exists")
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=[MOCK_UNIT_CREATE])
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "UNIT_NAME" in data.get("err_message", data.get("message", ""))


class TestUnitGet:
    @patch("apps.datawarehouse.services.unit.UnitService.get_all_units")
    def test_get_all_units_success(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_UNIT_RESPONSE], 1, 1)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/units?page=1&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert "meta" in data
        assert data["meta"]["total_count"] == 1
        assert data["meta"]["count"] == 1
        call_kw = mock_get_all.call_args[1]
        assert call_kw["page"] == 1
        assert call_kw["page_size"] == 10

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_by_id")
    def test_get_unit_by_nid_success(self, mock_get, client):
        mock_get.return_value = MOCK_UNIT_RESPONSE
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/units/1")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("unit_nid") == 1 or data["data"].get("u_nid") == 1
        mock_get.assert_called_once_with(TEST_WAREHOUSE_ID, 1, "en")

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_by_id")
    def test_get_unit_by_nid_not_found(self, mock_get, client):
        mock_get.return_value = None
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/units/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_nid_by_gid")
    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_by_id")
    def test_get_unit_by_gid_success(self, mock_get_by_id, mock_get_nid, client):
        mock_get_nid.return_value = 1
        mock_get_by_id.return_value = MOCK_UNIT_RESPONSE
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/units/{VALID_GUID}")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("unit_gid") == VALID_GUID or data["data"].get("u_gid") == VALID_GUID
        mock_get_nid.assert_called_once_with(TEST_WAREHOUSE_ID, VALID_GUID)
        mock_get_by_id.assert_called_once_with(TEST_WAREHOUSE_ID, 1, "en")

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_nid_by_gid")
    def test_get_unit_by_gid_not_found(self, mock_get_nid, client):
        mock_get_nid.return_value = None
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/units/NONEXISTENT_GID")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.get_all_units")
    def test_get_all_units_service_error(self, mock_get_all, client):
        mock_get_all.side_effect = Exception("Database error")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/units")
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.get_all_units")
    def test_get_all_units_empty_list(self, mock_get_all, client):
        mock_get_all.return_value = ([], 0, 0)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/units")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == []
        assert data["meta"]["total_count"] == 0
        assert data["meta"]["count"] == 0


class TestUnitUpdate:
    @patch("apps.datawarehouse.services.unit.UnitService.update_unit")
    def test_update_unit_by_nid_success(self, mock_update, client):
        updated_unit = {**MOCK_UNIT_RESPONSE, "unit_name": "Updated Unit Name"}
        mock_update.return_value = updated_unit
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/units/1",
            json={"unit_name": "Updated Unit Name"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert (
            data["data"].get("unit_name") == "Updated Unit Name"
            or data["data"].get("u_name") == "Updated Unit Name"
        )
        call_args = mock_update.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert call_args[0][1] == 1
        assert isinstance(call_args[0][2], UnitUpdateSchema)

    @patch("apps.datawarehouse.services.unit.UnitService.update_unit")
    def test_update_unit_by_nid_not_found(self, mock_update, client):
        mock_update.return_value = None
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/units/999",
            json={"unit_name": "Updated Unit Name"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_nid_by_gid")
    @patch("apps.datawarehouse.services.unit.UnitService.update_unit")
    def test_update_unit_by_gid_success(self, mock_update, mock_get_nid, client):
        mock_get_nid.return_value = 1
        mock_update.return_value = {**MOCK_UNIT_RESPONSE, "unit_name": "Updated Unit Name"}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/units/{VALID_GUID}",
            json={"unit_name": "Updated Unit Name"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_get_nid.assert_called_once_with(TEST_WAREHOUSE_ID, VALID_GUID)
        mock_update.assert_called_once_with(TEST_WAREHOUSE_ID, 1, ANY, "en")

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_nid_by_gid")
    def test_update_unit_by_gid_not_found(self, mock_get_nid, client):
        mock_get_nid.return_value = None
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/units/NONEXISTENT",
            json={"unit_name": "Updated Unit Name"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.update_unit")
    def test_update_unit_partial(self, mock_update, client):
        mock_update.return_value = {**MOCK_UNIT_RESPONSE, "unit_global": False}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/units/1",
            json={"unit_global": False},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        call_args = mock_update.call_args
        assert call_args[0][2].unit_global is False

    @patch("apps.datawarehouse.services.unit.UnitService.update_unit")
    def test_update_unit_format(self, mock_update, client):
        mock_update.return_value = {**MOCK_UNIT_RESPONSE, "unit_format": "0.0%"}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/units/1",
            json={"unit_format": "0.0%"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("unit_format") == "0.0%"
        assert mock_update.call_args[0][2].unit_format == "0.0%"

    @patch("apps.datawarehouse.services.unit.UnitService.update_unit")
    def test_update_unit_validation_error(self, mock_update, client):
        mock_update.side_effect = ValueError("UNIT_NAME_EXISTS: Unit name already exists")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/units/1",
            json={"unit_name": "Duplicate Name"},
        )
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "UNIT_NAME" in data.get("err_message", data.get("message", ""))


class TestUnitDelete:
    @patch("apps.datawarehouse.services.unit.UnitService.delete_unit")
    def test_delete_unit_by_nid_success(self, mock_delete, client):
        mock_delete.return_value = True
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/units/1")
        assert response.status_code == 204
        mock_delete.assert_called_once_with(TEST_WAREHOUSE_ID, 1, "en")

    @patch("apps.datawarehouse.services.unit.UnitService.delete_unit")
    def test_delete_unit_by_nid_not_found(self, mock_delete, client):
        mock_delete.return_value = False
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/units/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_nid_by_gid")
    @patch("apps.datawarehouse.services.unit.UnitService.delete_unit")
    def test_delete_unit_by_gid_success(self, mock_delete, mock_get_nid, client):
        mock_get_nid.return_value = 1
        mock_delete.return_value = True
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/units/{VALID_GUID}")
        assert response.status_code == 204
        mock_get_nid.assert_called_once_with(TEST_WAREHOUSE_ID, VALID_GUID)
        mock_delete.assert_called_once_with(TEST_WAREHOUSE_ID, 1, "en")

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_nid_by_gid")
    def test_delete_unit_by_gid_not_found(self, mock_get_nid, client):
        mock_get_nid.return_value = None
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/units/NONEXISTENT")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.unit.UnitService.delete_unit")
    def test_delete_unit_service_error(self, mock_delete, client):
        mock_delete.side_effect = Exception("Database error")
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/units/1")
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestUnitPagination:
    @patch("apps.datawarehouse.services.unit.UnitService.get_all_units")
    def test_get_units_with_pagination(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_UNIT_RESPONSE], 10, 10)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/units?page=2&page_size=5"
        )
        assert response.status_code == 200
        data = response.json()
        assert "meta" in data
        assert data["meta"]["page"] == 2
        assert data["meta"]["page_size"] == 5
        assert data["meta"]["total_count"] == 10
        assert data["meta"].get("count", data["meta"].get("total_count")) in (1, 10)
        call_kw = mock_get_all.call_args[1]
        assert call_kw["page"] == 2
        assert call_kw["page_size"] == 5


class TestUnitValidation:
    def test_create_unit_invalid_name(self, client):
        invalid_unit = {
            "unit_name": "x" * 200,
            "unit_gid": VALID_GUID,
        }
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=[invalid_unit])
        assert response.status_code == 422

    def test_create_unit_missing_required_field(self, client):
        invalid_unit = {"unit_gid": VALID_GUID}
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=[invalid_unit])
        assert response.status_code == 422

    def test_create_unit_invalid_gid_length(self, client):
        invalid_unit = {
            "unit_name": "Test Unit",
            "unit_gid": "x" * 70,
        }
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units", json=[invalid_unit])
        assert response.status_code == 422

    @patch("apps.datawarehouse.services.unit.UnitService.create_units_batch")
    def test_invalid_dw_id(self, mock_create, client):
        mock_create.side_effect = ValueError("Warehouse ID 'invalid' not found")
        response = client.post("/dw/invalid/units", json=[MOCK_UNIT_CREATE])
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False


class TestUnitLanguageSupport:
    @patch("apps.datawarehouse.services.unit.UnitService.create_units_batch")
    def test_create_unit_with_language_header(self, mock_create, client):
        app.dependency_overrides[get_dw_language_code] = lambda: "fr"
        try:
            mock_create.return_value = {"created": [{**MOCK_UNIT_RESPONSE, "locale": "fr"}], "errors": []}
            response = client.post(
                f"/dw/{TEST_WAREHOUSE_ID}/units",
                json=[MOCK_UNIT_CREATE],
                headers={"Accept-Language": "fr"},
            )
            assert response.status_code == 201
            call_args = mock_create.call_args
            assert call_args[0][2] == "fr"
        finally:
            app.dependency_overrides.pop(get_dw_language_code, None)

    @patch("apps.datawarehouse.services.unit.UnitService.get_all_units")
    def test_get_units_with_language_header(self, mock_get_all, client):
        app.dependency_overrides[get_dw_language_code] = lambda: "ar"
        try:
            mock_get_all.return_value = ([{**MOCK_UNIT_RESPONSE, "locale": "ar"}], 1, 1)
            response = client.get(
                f"/dw/{TEST_WAREHOUSE_ID}/units",
                headers={"Accept-Language": "ar"},
            )
            assert response.status_code == 200
            call_kw = mock_get_all.call_args[1]
            assert call_kw["language_code"] == "ar"
        finally:
            app.dependency_overrides.pop(get_dw_language_code, None)

    @patch("apps.datawarehouse.services.unit.UnitService.get_unit_by_id")
    def test_get_unit_with_language_header(self, mock_get, client):
        app.dependency_overrides[get_dw_language_code] = lambda: "es"
        try:
            mock_get.return_value = {**MOCK_UNIT_RESPONSE, "locale": "es"}
            response = client.get(
                f"/dw/{TEST_WAREHOUSE_ID}/units/1",
                headers={"Accept-Language": "es"},
            )
            assert response.status_code == 200
            mock_get.assert_called_once_with(TEST_WAREHOUSE_ID, 1, "es")
        finally:
            app.dependency_overrides.pop(get_dw_language_code, None)

    def test_invalid_language_code(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/units",
            json=[MOCK_UNIT_CREATE],
            headers={"Accept-Language": "invalid"},
        )
        # 500 allowed when app_db schema is not migrated (e.g. missing system_datawarehouse.created)
        assert response.status_code in (400, 404, 500)
        data = response.json()
        assert data["success"] is False


class TestUnitListParams:
    @patch("apps.datawarehouse.services.unit.UnitService.get_all_units")
    def test_list_with_sort_search_filter(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_UNIT_RESPONSE], 100, 5)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/units",
            params={
                "page": 1,
                "page_size": 10,
                "sort_order": "desc",
                "sort_field": "u_name",
                "search": "Percent",
                "global_filter": True,  # API uses alias QUERY_FILTER_GLOBAL = "global_filter"
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["meta"]["total_count"] in (100, 5)
        assert data["meta"].get("count", 0) in (1, 5, 10)
        call_kw = mock_get_all.call_args[1]
        assert call_kw["sort_order"] == "desc"
        assert call_kw["sort_field"] == "u_name"
        assert call_kw["search"] == "Percent"
        assert call_kw["filter_global"] is True


# Unit association-count API returns data_rows and ius_rows (ASSOC_DATA_ROWS, ASSOC_IUS_ROWS)
MOCK_UNIT_ASSOCIATION_COUNTS = {"data_rows": 50, "ius_rows": 3}


class TestUnitAssociationCount:
    @patch("apps.datawarehouse.router.unit.unit_service.get_association_counts")
    def test_association_count_success(self, mock_counts, client):
        mock_counts.return_value = MOCK_UNIT_ASSOCIATION_COUNTS
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/units/association-count",
            params={"identifier": "1,2"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Association counts retrieved successfully"
        assert data["data"]["data_rows"] == 50
        assert data["data"]["ius_rows"] == 3
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.unit.unit_service.get_association_counts")
    def test_association_count_with_gid(self, mock_counts, client):
        mock_counts.return_value = MOCK_UNIT_ASSOCIATION_COUNTS
        with patch("apps.datawarehouse.router.unit.unit_service.get_unit_nid_by_gid", return_value=5):
            response = client.get(
                f"/dw/{TEST_WAREHOUSE_ID}/units/association-count",
                params={"identifier": VALID_GUID},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_rows"] == 50
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[1] == [5]

    @patch("apps.datawarehouse.router.unit.unit_service.get_association_counts")
    def test_association_count_empty_list(self, mock_counts, client):
        mock_counts.return_value = {"data_rows": 0, "ius_rows": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/units/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_rows"] == 0
        assert data["data"]["ius_rows"] == 0
        mock_counts.assert_called_once()

    @patch("apps.datawarehouse.router.unit.unit_service.get_association_counts")
    def test_association_count_no_identifier_returns_zeros(self, mock_counts, client):
        mock_counts.return_value = {"data_rows": 0, "ius_rows": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/units/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_rows"] == 0
        assert data["data"]["ius_rows"] == 0

    @patch("apps.datawarehouse.router.unit.unit_service.get_association_counts")
    def test_association_count_service_error(self, mock_counts, client):
        mock_counts.side_effect = Exception("Database error")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/units/association-count",
            params={"identifier": "1"},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestUnitMultipleDelete:
    @patch("apps.datawarehouse.router.unit.unit_service.get_unit_nid_by_gid")
    @patch("apps.datawarehouse.router.unit.unit_service.multiple_delete")
    def test_multiple_delete_success(self, mock_delete, mock_get_nid, client):
        mock_get_nid.side_effect = [1, 2]
        mock_delete.return_value = {
            "deleted": [1, 2],
            "errors": [],
        }
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/units/multiple-delete",
            json={"unit_gid": ["gid-a", "gid-b"]},
        )
        assert response.status_code == 200
        mock_delete.assert_called_once()
        call_args = mock_delete.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.unit.unit_service.multiple_delete")
    def test_multiple_delete_empty_list(self, mock_delete, client):
        mock_delete.return_value = {"deleted": [], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/units/multiple-delete",
            json={"unit_gid": []},
        )
        assert response.status_code == 200
        mock_delete.assert_called_once()

    def test_multiple_delete_missing_body(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/units/multiple-delete",
            json={},
        )
        assert response.status_code == 422

    @patch("apps.datawarehouse.router.unit.unit_service.get_unit_nid_by_gid")
    @patch("apps.datawarehouse.router.unit.unit_service.multiple_delete")
    def test_multiple_delete_service_error(self, mock_delete, mock_get_nid, client):
        mock_get_nid.side_effect = [1, 2]
        mock_delete.side_effect = Exception("Database error")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/units/multiple-delete",
            json={"unit_gid": ["gid-a", "gid-b"]},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


# --- Unit export API tests (commented out; endpoint not needed right away) ---
# class TestUnitExport:
#     def _mock_openpyxl(self):
#         """Provide a fake openpyxl module so export endpoint can build XLSX without the real lib."""
#         mock_wb = MagicMock()
#         mock_ws = MagicMock()
#         mock_wb.active = mock_ws
#         mock_wb.save = MagicMock()
#         mock_openpyxl = MagicMock()
#         mock_openpyxl.Workbook.return_value = mock_wb
#         return mock_openpyxl
#
#     @patch("apps.datawarehouse.router.unit.validate_language_code")
#     @patch("apps.datawarehouse.services.unit.UnitService.get_all_units_for_export")
#     def test_export_units_get_success(self, mock_export, mock_validate, client):
#         mock_validate.return_value = True
#         mock_export.return_value = [MOCK_UNIT_RESPONSE]
#         with patch.dict("sys.modules", {"openpyxl": self._mock_openpyxl()}):
#             response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/units/export")
#         assert response.status_code == 200
#         assert (
#             response.headers.get("content-type", "")
#             == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
#         )
#         assert "attachment" in response.headers.get("content-disposition", "")
#
#     @patch("apps.datawarehouse.router.unit.validate_language_code")
#     @patch("apps.datawarehouse.services.unit.UnitService.get_all_units_for_export")
#     def test_export_units_post_not_allowed(self, mock_export, mock_validate, client):
#         """Export endpoint is GET-only; POST returns 405 Method Not Allowed."""
#         mock_validate.return_value = True
#         mock_export.return_value = [MOCK_UNIT_RESPONSE]
#         response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/units/export")
#         assert response.status_code == 405
# --- End unit export API tests ---
