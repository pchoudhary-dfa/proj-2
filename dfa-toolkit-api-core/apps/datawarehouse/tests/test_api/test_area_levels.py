"""
Tests for Area Level create, update, delete API endpoints.
GET list and GET one are not touched. Uses internal keys (area_level, area_level_name) via ADAPTATION=internal.
"""
import pytest
from unittest.mock import patch

from apps.shared.config.config import settings
from apps.datawarehouse.schemas.area import AreaLevelCreateSchema, AreaLevelUpdateSchema

TEST_WAREHOUSE_ID = "test_warehouse"

MOCK_AREA_LEVEL_RESPONSE = {
    "level_nid": 1,
    "area_level": 2,
    "area_level_name": "State",
}

MOCK_CREATE_BODY = {
    "area_level": 2,
    "area_level_name": "State",
}

MOCK_UPDATE_BODY = {
    "area_level": 3,
    "area_level_name": "District",
}


@pytest.fixture(autouse=True)
def force_internal_adaptation():
    """Force ADAPTATION=internal so schema accepts internal keys (area_level, area_level_name)."""
    with patch.object(settings, "ADAPTATION", "internal"):
        yield


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestAreaLevelCreate:
    @patch("apps.datawarehouse.router.area_levels.area_level_service.create_area_levels_batch")
    def test_create_area_level_success(self, mock_create, client):
        mock_create.return_value = {"created": [MOCK_AREA_LEVEL_RESPONSE], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels",
            json=[MOCK_CREATE_BODY],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "area level" in data.get("message", "").lower() and "created" in data.get("message", "").lower()
        assert data["meta"]["count"] == 1
        assert len(data["data"]) == 1
        if "area_level" in data["data"][0]:
            assert data["data"][0]["area_level"] == MOCK_CREATE_BODY["area_level"]
        mock_create.assert_called_once()
        call_args = mock_create.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert len(call_args[1]) == 1
        assert isinstance(call_args[1][0], AreaLevelCreateSchema)
        assert call_args[1][0].area_level == MOCK_CREATE_BODY["area_level"]
        assert call_args[1][0].area_level_name == MOCK_CREATE_BODY["area_level_name"]

    def test_create_area_level_empty_array(self, client):
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/area-levels", json=[])
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "non-empty array" in data.get("err_message", "").lower()

    def test_create_area_level_missing_body(self, client):
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/area-levels", json={})
        assert response.status_code == 422

    @patch("apps.datawarehouse.router.area_levels.area_level_service.create_area_levels_batch")
    def test_create_area_level_conflict_duplicate_level(self, mock_create, client):
        mock_create.side_effect = ValueError("Area level number already exists")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels",
            json=[MOCK_CREATE_BODY],
        )
        assert response.status_code == 409
        data = response.json()
        assert data["success"] is False
        assert "already exists" in data.get("err_message", "")

    @patch("apps.datawarehouse.router.area_levels.area_level_service.create_area_levels_batch")
    def test_create_area_level_conflict_duplicate_name(self, mock_create, client):
        mock_create.side_effect = ValueError("Area level name already exists")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels",
            json=[MOCK_CREATE_BODY],
        )
        assert response.status_code == 409
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.router.area_levels.area_level_service.create_area_levels_batch")
    def test_create_area_level_service_error(self, mock_create, client):
        mock_create.side_effect = Exception("Database error")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels",
            json=[MOCK_CREATE_BODY],
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestAreaLevelGetOne:
    def test_get_area_level_non_numeric_identifier_returns_400(self, client):
        """Identifier must be numeric only; non-numeric returns 400."""
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/area-levels/abc")
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "numeric" in data.get("err_message", "").lower()


class TestAreaLevelUpdate:
    @patch("apps.datawarehouse.router.area_levels.area_level_service.update_area_level")
    def test_update_area_level_success(self, mock_update, client):
        mock_update.return_value = {**MOCK_AREA_LEVEL_RESPONSE, "area_level": 3, "area_level_name": "District"}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/1",
            json=MOCK_UPDATE_BODY,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data.get("message") == "Area level updated successfully"
        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == "1"  # identifier (numeric only)
        assert isinstance(call_args[2], AreaLevelUpdateSchema)

    @patch("apps.datawarehouse.router.area_levels.area_level_service.update_area_level")
    def test_update_area_level_not_found(self, mock_update, client):
        mock_update.side_effect = ValueError("Area level with level_nid 999 not found")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/999",
            json=MOCK_UPDATE_BODY,
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "not found" in data.get("err_message", "").lower()

    @patch("apps.datawarehouse.router.area_levels.area_level_service.update_area_level")
    def test_update_area_level_conflict(self, mock_update, client):
        mock_update.side_effect = ValueError("Area level number already exists")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/1",
            json=MOCK_UPDATE_BODY,
        )
        assert response.status_code == 409
        data = response.json()
        assert data["success"] is False

    def test_update_area_level_non_numeric_identifier_returns_400(self, client):
        """Non-numeric identifier must be rejected with 400; service is not called."""
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/abc",
            json=MOCK_UPDATE_BODY,
        )
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "numeric" in data.get("err_message", "").lower()

    @patch("apps.datawarehouse.router.area_levels.area_level_service.update_area_level")
    def test_update_area_level_service_error(self, mock_update, client):
        mock_update.side_effect = Exception("Database error")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/1",
            json={"area_level_name": "Updated"},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestAreaLevelDelete:
    @patch("apps.datawarehouse.router.area_levels.area_level_service.delete_area_level")
    def test_delete_area_level_success(self, mock_delete, client):
        mock_delete.return_value = {
            "level_nid": 1,
            "area_level": 2,
            "areas_deleted": 5,
            "descendants_deleted": 2,
            "data_rows_deleted": 10,
        }
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/area-levels/1")
        assert response.status_code == 204
        mock_delete.assert_called_once()
        call_args = mock_delete.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == "1"  # identifier (numeric only)

    @patch("apps.datawarehouse.router.area_levels.area_level_service.delete_area_level")
    def test_delete_area_level_not_found(self, mock_delete, client):
        mock_delete.side_effect = ValueError("Area level with level_nid 999 not found")
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/area-levels/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "not found" in data.get("err_message", "").lower()

    def test_delete_area_level_non_numeric_identifier_returns_400(self, client):
        """Non-numeric identifier must be rejected with 400; service is not called."""
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/area-levels/level-1")
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "numeric" in data.get("err_message", "").lower()

    @patch("apps.datawarehouse.router.area_levels.area_level_service.delete_area_level")
    def test_delete_area_level_service_error(self, mock_delete, client):
        mock_delete.side_effect = Exception("Database error")
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/area-levels/1")
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


MOCK_ASSOCIATION_COUNTS = {"area_count": 12, "data_count": 340}


class TestAreaLevelAssociationCount:
    @patch("apps.datawarehouse.router.area_levels.area_level_service.get_association_counts")
    def test_association_count_success(self, mock_counts, client):
        mock_counts.return_value = MOCK_ASSOCIATION_COUNTS
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/association-count",
            params={"identifier": "1,2"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Association counts retrieved successfully"
        assert data["data"]["area_count"] == 12
        assert data["data"]["data_count"] == 340
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.area_levels.area_level_service.get_association_counts")
    def test_association_count_empty_list(self, mock_counts, client):
        mock_counts.return_value = {"area_count": 0, "data_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["area_count"] == 0
        assert data["data"]["data_count"] == 0
        mock_counts.assert_called_once()

    def test_association_count_non_numeric_identifier_returns_400(self, client):
        """Comma-separated identifier must be numeric only; non-numeric returns 400."""
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/association-count",
            params={"identifier": "1,abc,2"},
        )
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "numeric" in data.get("err_message", "").lower()

    @patch("apps.datawarehouse.router.area_levels.area_level_service.get_association_counts")
    def test_association_count_no_identifier_returns_zeros(self, mock_counts, client):
        mock_counts.return_value = {"area_count": 0, "data_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["area_count"] == 0
        assert data["data"]["data_count"] == 0

    @patch("apps.datawarehouse.router.area_levels.area_level_service.get_association_counts")
    def test_association_count_service_error(self, mock_counts, client):
        mock_counts.side_effect = Exception("Database error")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/association-count",
            params={"identifier": "1"},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestAreaLevelMultipleDelete:
    @patch("apps.datawarehouse.router.area_levels.area_level_service.multiple_delete")
    def test_multiple_delete_success(self, mock_delete, client):
        mock_delete.return_value = {"deleted": [1, 2], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/multiple-delete",
            json={"level_nid": [1, 2]},
        )
        assert response.status_code == 200
        mock_delete.assert_called_once()
        call_args = mock_delete.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.area_levels.area_level_service.multiple_delete")
    def test_multiple_delete_empty_list(self, mock_delete, client):
        mock_delete.return_value = {"deleted": [], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/multiple-delete",
            json={"level_nid": []},
        )
        assert response.status_code == 200
        mock_delete.assert_called_once()

    def test_multiple_delete_missing_body(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/multiple-delete",
            json={},
        )
        assert response.status_code == 422

    @patch("apps.datawarehouse.router.area_levels.area_level_service.multiple_delete")
    def test_multiple_delete_service_error(self, mock_delete, client):
        mock_delete.side_effect = Exception("Database error")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/area-levels/multiple-delete",
            json={"level_nid": [1, 2]},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False
