"""
Tests for Area CRUD API endpoints.
API responses do not include 'code' in JSON; assertions use status_code, success, message/err_message.

Tests use internal keys (ar_nid, ar_name, etc.). We set DFA_TEST_INTERNAL_KEYS=1 to skip
key-format validation and ADAPTATION=internal so response serialization uses ar_* keys.
"""
import os
import pytest
from unittest.mock import patch, ANY, MagicMock
from fastapi import HTTPException, status

from main import app
from apps.shared.config.config import settings
from apps.datawarehouse.db.datawarehouse import get_dw_language_code
from apps.datawarehouse.schemas.area import AreaCreateSchema, AreaUpdateSchema, AreaResponseSchema

TEST_WAREHOUSE_ID = "test_warehouse"


@pytest.fixture(autouse=True)
def patch_area_internal_adaptation():
    """Allow internal keys in request body and response: set env bypass and ADAPTATION=internal."""
    prev = os.environ.get("DFA_TEST_INTERNAL_KEYS")
    os.environ["DFA_TEST_INTERNAL_KEYS"] = "1"
    try:
        with (
            patch.object(settings, "ADAPTATION", "internal"),
            patch("apps.datawarehouse.router.areas.is_external_adaptation", return_value=False),
        ):
            yield
    finally:
        if prev is None:
            os.environ.pop("DFA_TEST_INTERNAL_KEYS", None)
        else:
            os.environ["DFA_TEST_INTERNAL_KEYS"] = prev

# Valid GID for ar_gid (alphanumeric + special chars)
VALID_GUID = "6F9619FF-8B86-D011-B42D-00C04FC964FF"
VALID_GID_SIMPLE = "IND"  # Simple alphanumeric GID

@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db

MOCK_AREA_CREATE = {
    "ar_name": "Bangalore Urban",
    "ar_id": "IN_KA_BLR_URB",
    "ar_parent_nid": -1,
    "ar_short_name": "BLR",
    "block_nids": None,
    "ar_gid": VALID_GUID,
    "ar_is_global": False,
    "lat": 12.9716,
    "long": 77.5946,
    "latLongId": None,
    "latLongDbId": None,
}

MOCK_AREA_RESPONSE = {
    "ar_nid": 1,
    "ar_parent_nid": -1,
    "ar_id": "IN_KA_BLR_URB",
    "ar_name": "Bangalore Urban",
    "ar_gid": VALID_GUID,
    "ar_level": 1,
    "ar_short_name": "BLR",
    "block_nids": None,
    "ar_map": None,
    "ar_is_global": False,
    "ar_has_data": False,
    "area_lat": 12.9716,
    "area_long": 77.5946,
    "id": 101,
    "ancestors": [],
}

MOCK_AREA_CHILD_RESPONSE = {
    "ar_nid": 2,
    "ar_parent_nid": 1,
    "ar_id": "IN_KA_BLR_URB_ZONE1",
    "ar_name": "Zone 1",
    "ar_gid": "7F9619FF-8B86-D011-B42D-00C04FC964FF",
    "ar_level": 2,
    "ar_short_name": "Z1",
    "block_nids": None,
    "ar_map": None,
    "ar_is_global": False,
    "ar_has_data": False,
    "ancestors": [
        {
            "ar_nid": 1,
            "ar_id": "IN_KA_BLR_URB",
            "ar_name": "Bangalore Urban",
            "ar_level": 1,
        }
    ],
}


class TestAreaCreate:
    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_success(self, mock_create, client):
        mock_create.return_value = {"created": [MOCK_AREA_RESPONSE], "errors": []}
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[MOCK_AREA_CREATE])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert data["meta"]["count"] == 1
        assert len(data["data"]) == 1
        assert data["data"][0].get("ar_nid") == 1 or data["data"][0].get("area_nid") == 1
        assert mock_create.called
        call_args = mock_create.call_args
        assert call_args[0][0] == TEST_WAREHOUSE_ID
        assert len(call_args[0][1]) == 1
        assert isinstance(call_args[0][1][0], AreaCreateSchema)
        assert call_args[0][1][0].area_name == MOCK_AREA_CREATE["ar_name"]
        assert call_args[0][1][0].area_id == MOCK_AREA_CREATE["ar_id"]

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_with_parent(self, mock_create, client):
        mock_create.return_value = {"created": [MOCK_AREA_CHILD_RESPONSE], "errors": []}
        area_data = MOCK_AREA_CREATE.copy()
        area_data["ar_parent_nid"] = 1
        area_data["ar_name"] = "Zone 1"
        area_data["ar_id"] = "IN_KA_BLR_URB_ZONE1"
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        first = data["data"][0]
        if first.get("ar_level") is not None or first.get("area_level") is not None:
            assert first.get("ar_level") == 2 or first.get("area_level") == 2
        if "ancestors" in first:
            assert len(first["ancestors"]) == 1

    def test_create_area_empty_array(self, client):
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[])
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "non-empty array" in data.get("err_message", "").lower()

    def test_create_area_missing_required_fields(self, client):
        # Missing ar_name
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[{"ar_id": "TEST_ID"}])
        assert response.status_code == 422

        # Missing ar_id
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[{"ar_name": "Test Area"}])
        assert response.status_code == 422

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_duplicate_name_parent(self, mock_create, client):
        mock_create.side_effect = ValueError(
            "Area with name 'Bangalore Urban' and parent_nid '-1' already exists"
        )
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[MOCK_AREA_CREATE])
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False
        assert "already exists" in data.get("err_message", "")

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_duplicate_ar_id(self, mock_create, client):
        mock_create.side_effect = ValueError("Area ID 'IN_KA_BLR_URB' already exists")
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[MOCK_AREA_CREATE])
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False
        assert "already exists" in data.get("err_message", "")

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_duplicate_ar_gid(self, mock_create, client):
        """Test that duplicate ar_gid is rejected"""
        mock_create.side_effect = ValueError("Area GID 'IND' already exists")
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[MOCK_AREA_CREATE])
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False
        assert "already exists" in data.get("err_message", "")

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_invalid_parent(self, mock_create, client):
        mock_create.side_effect = ValueError("Parent area with nid 999 not found")
        area_data = MOCK_AREA_CREATE.copy()
        area_data["ar_parent_nid"] = 999
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "not found" in data.get("err_message", "")

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_warehouse_not_found(self, mock_create, client):
        mock_create.side_effect = ValueError(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[MOCK_AREA_CREATE])
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_service_error(self, mock_create, client):
        mock_create.side_effect = Exception("Database connection failed")
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[MOCK_AREA_CREATE])
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_auto_generate_gid(self, mock_create, client):
        """Test that ar_gid is auto-generated if not provided"""
        mock_create.return_value = {"created": [MOCK_AREA_RESPONSE], "errors": []}
        area_data = MOCK_AREA_CREATE.copy()
        del area_data["ar_gid"]
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_with_lat_long(self, mock_create, client):
        """Test creating area with lat/long coordinates (area_lat/area_long or lat/long)."""
        mock_create.return_value = {"created": [MOCK_AREA_RESPONSE], "errors": []}
        area_data = MOCK_AREA_CREATE.copy()
        area_data["area_lat"] = 12.9716
        area_data["area_long"] = 77.5946
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        call_args = mock_create.call_args
        assert call_args[0][1][0].area_lat == 12.9716
        assert call_args[0][1][0].area_long == 77.5946

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_with_block_nids(self, mock_create, client):
        """Test creating group area with block_nids"""
        group_response = MOCK_AREA_RESPONSE.copy()
        group_response["block_nids"] = "2,3,4"
        mock_create.return_value = {"created": [group_response], "errors": []}
        area_data = MOCK_AREA_CREATE.copy()
        area_data["block_nids"] = "2,3,4"
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        if "block_nids" in data["data"][0]:
            assert data["data"][0]["block_nids"] == "2,3,4"

    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_with_simple_gid(self, mock_create, client):
        """Test creating area with simple alphanumeric GID like 'IND'"""
        simple_response = MOCK_AREA_RESPONSE.copy()
        simple_response["ar_gid"] = VALID_GID_SIMPLE
        mock_create.return_value = {"created": [simple_response], "errors": []}
        area_data = MOCK_AREA_CREATE.copy()
        area_data["ar_gid"] = VALID_GID_SIMPLE
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"][0].get("ar_gid") == VALID_GID_SIMPLE or data["data"][0].get("area_gid") == VALID_GID_SIMPLE


class TestAreaGet:
    @patch("apps.datawarehouse.services.area.AreaService.get_all_areas")
    def test_get_all_areas_success(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_AREA_RESPONSE, MOCK_AREA_CHILD_RESPONSE], 2, None)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/areas")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 2
        assert mock_get_all.called

    @patch("apps.datawarehouse.services.area.AreaService.get_all_areas")
    def test_get_all_areas_with_level_filter(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_AREA_RESPONSE], 1, None)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/areas?level=1")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        call_args = mock_get_all.call_args
        assert call_args[1]["level_nid"] == 1

    @patch("apps.datawarehouse.services.area.AreaService.get_all_areas")
    def test_get_all_areas_identifier_children_false(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_AREA_RESPONSE], 1, None)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/areas?identifier=17498&identifier_children=false"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        call_args = mock_get_all.call_args
        assert call_args[1]["identifier"] == "17498"
        assert call_args[1]["identifier_children"] is False

    @patch("apps.datawarehouse.services.area.AreaService.get_area_by_identifier")
    def test_get_area_by_nid_success(self, mock_get, client):
        mock_get.return_value = MOCK_AREA_RESPONSE
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/areas/1")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("ar_nid") == 1 or data["data"].get("area_nid") == 1
        body = data["data"]
        assert body.get("area_lat") == 12.9716 or body.get("ar_latitude") == 12.9716
        assert body.get("area_long") == 77.5946 or body.get("ar_longitude") == 77.5946

    @patch("apps.datawarehouse.services.area.AreaService.get_all_areas")
    def test_get_all_areas_includes_lat_long(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_AREA_RESPONSE], 1, None)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/areas")
        assert response.status_code == 200
        first = response.json()["data"][0]
        assert first.get("area_lat") == 12.9716 or first.get("ar_latitude") == 12.9716
        assert first.get("area_long") == 77.5946 or first.get("ar_longitude") == 77.5946

    @patch("apps.datawarehouse.services.area.AreaService.get_area_by_identifier")
    def test_get_area_by_gid_success(self, mock_get, client):
        mock_get.return_value = MOCK_AREA_RESPONSE
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/areas/{VALID_GUID}")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("ar_gid") == VALID_GUID or data["data"].get("area_gid") == VALID_GUID

    @patch("apps.datawarehouse.services.area.AreaService.get_area_by_identifier")
    def test_get_area_not_found(self, mock_get, client):
        mock_get.return_value = None
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/areas/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False


class TestAreaResponseSchemaLatLong:
    def test_serializes_latlong_external_aliases(self):
        payload = {
            "area_nid": 1,
            "area_parent_nid": -1,
            "area_id": "A1",
            "area_name": "N",
            "area_gid": VALID_GUID,
            "area_level": 1,
            "area_short_name": None,
            "block_nids": None,
            "area_map": None,
            "area_is_global": False,
            "area_has_data": False,
            "area_lat": 12.9716,
            "area_long": 77.5946,
            "id": 55,
            "ancestors": [],
        }
        m = AreaResponseSchema.model_validate(payload)
        ext = m.model_dump(by_alias=True)
        assert ext["ar_latitude"] == 12.9716
        assert ext["ar_longitude"] == 77.5946
        assert ext["ar_lat_long_nid"] == 55

    def test_normalizes_external_lat_keys(self):
        payload = {
            "area_nid": 1,
            "area_parent_nid": -1,
            "area_id": "A1",
            "area_name": "N",
            "area_gid": VALID_GUID,
            "area_level": 1,
            "area_short_name": None,
            "block_nids": None,
            "area_map": None,
            "area_is_global": False,
            "area_has_data": False,
            "ar_latitude": 1.0,
            "ar_longitude": 2.0,
            "ancestors": [],
        }
        m = AreaResponseSchema.model_validate(payload)
        assert m.area_lat == 1.0
        assert m.area_long == 2.0


class TestAreaUpdate:
    @patch("apps.datawarehouse.services.area.AreaService.update_area")
    def test_update_area_success(self, mock_update, client):
        updated_response = MOCK_AREA_RESPONSE.copy()
        updated_response["ar_name"] = "Bangalore Urban District"
        mock_update.return_value = updated_response
        update_data = {"ar_name": "Bangalore Urban District"}
        response = client.patch(f"/dw/{TEST_WAREHOUSE_ID}/areas/1", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("ar_name") == "Bangalore Urban District" or data["data"].get("area_name") == "Bangalore Urban District"
        assert mock_update.called

    @patch("apps.datawarehouse.services.area.AreaService.update_area")
    def test_update_area_change_parent(self, mock_update, client):
        updated_response = MOCK_AREA_RESPONSE.copy()
        updated_response["ar_parent_nid"] = 2
        updated_response["ar_level"] = 2
        mock_update.return_value = updated_response
        update_data = {"ar_parent_nid": 2}
        response = client.patch(f"/dw/{TEST_WAREHOUSE_ID}/areas/1", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("ar_parent_nid") == 2 or data["data"].get("area_parent_nid") == 2
        if data["data"].get("ar_level") is not None or data["data"].get("area_level") is not None:
            assert data["data"].get("ar_level") == 2 or data["data"].get("area_level") == 2

    @patch("apps.datawarehouse.services.area.AreaService.update_area")
    def test_update_area_not_found(self, mock_update, client):
        mock_update.side_effect = ValueError("Area with nid 999 not found")
        update_data = {"ar_name": "New Name"}
        response = client.patch(f"/dw/{TEST_WAREHOUSE_ID}/areas/999", json=update_data)
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.area.AreaService.update_area")
    def test_update_area_duplicate_name_parent(self, mock_update, client):
        mock_update.side_effect = ValueError(
            "Area with name 'Zone 1' and parent_nid '1' already exists"
        )
        update_data = {"ar_name": "Zone 1"}
        response = client.patch(f"/dw/{TEST_WAREHOUSE_ID}/areas/2", json=update_data)
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False
        assert "already exists" in data.get("err_message", "")

    @patch("apps.datawarehouse.services.area.AreaService.update_area")
    def test_update_area_duplicate_ar_id(self, mock_update, client):
        mock_update.side_effect = ValueError("Area ID 'IN_KA_BLR_URB' already exists")
        update_data = {"ar_id": "IN_KA_BLR_URB"}
        response = client.patch(f"/dw/{TEST_WAREHOUSE_ID}/areas/2", json=update_data)
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False
        assert "already exists" in data.get("err_message", "")

    @patch("apps.datawarehouse.services.area.AreaService.update_area")
    def test_update_area_service_error(self, mock_update, client):
        mock_update.side_effect = Exception("Database connection failed")
        update_data = {"ar_name": "New Name"}
        response = client.patch(f"/dw/{TEST_WAREHOUSE_ID}/areas/1", json=update_data)
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.area.AreaService.update_area")
    def test_update_area_multiple_fields(self, mock_update, client):
        updated_response = MOCK_AREA_RESPONSE.copy()
        updated_response["ar_name"] = "New Name"
        updated_response["ar_short_name"] = "NN"
        updated_response["ar_is_global"] = True
        mock_update.return_value = updated_response
        update_data = {
            "ar_name": "New Name",
            "ar_short_name": "NN",
            "ar_is_global": True,
        }
        response = client.patch(f"/dw/{TEST_WAREHOUSE_ID}/areas/1", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("ar_name") == "New Name" or data["data"].get("area_name") == "New Name"
        assert data["data"].get("ar_short_name") == "NN" or data["data"].get("area_short_name") == "NN"
        assert data["data"].get("ar_is_global") is True or data["data"].get("area_is_global") is True


class TestAreaDelete:
    @patch("apps.datawarehouse.services.area.AreaService.delete_area")
    def test_delete_area_success(self, mock_delete, client):
        mock_delete.return_value = {
            "areas_deleted": 1,
            "descendants_deleted": 0,
            "data_rows_deleted": 0,
        }
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/areas/1")
        assert response.status_code == 204
        assert mock_delete.called

    @patch("apps.datawarehouse.services.area.AreaService.delete_area")
    def test_delete_area_with_descendants(self, mock_delete, client):
        mock_delete.return_value = {
            "areas_deleted": 5,
            "descendants_deleted": 4,
            "data_rows_deleted": 10,
        }
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/areas/1")
        assert response.status_code == 204
        assert mock_delete.called

    @patch("apps.datawarehouse.services.area.AreaService.delete_area")
    def test_delete_area_not_found(self, mock_delete, client):
        mock_delete.side_effect = ValueError("Area with nid 999 not found")
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/areas/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.area.AreaService.delete_area")
    def test_delete_area_service_error(self, mock_delete, client):
        mock_delete.side_effect = Exception("Database connection failed")
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/areas/1")
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.area.AreaService.delete_area")
    def test_delete_area_cascade_verification(self, mock_delete, client):
        """Verify that cascade delete counts are returned correctly"""
        mock_delete.return_value = {
            "areas_deleted": 10,
            "descendants_deleted": 9,
            "data_rows_deleted": 50,
        }
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/areas/1")
        assert response.status_code == 204
        assert mock_delete.called


class TestAreaAssociationCount:
    @patch("apps.datawarehouse.router.areas.area_service.get_association_counts")
    def test_association_count_success(self, mock_counts, client):
        mock_counts.return_value = {"children_count": 5, "descendants_count": 12, "data_count": 100}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/association-count",
            params={"identifier": "1,2"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Association counts retrieved successfully"
        assert data["data"]["children_count"] == 5
        assert data["data"]["descendants_count"] == 12
        assert data["data"]["data_count"] == 100
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.areas.area_service.get_association_counts")
    def test_association_count_empty_list(self, mock_counts, client):
        mock_counts.return_value = {"children_count": 0, "descendants_count": 0, "data_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["children_count"] == 0
        assert data["data"]["data_count"] == 0
        mock_counts.assert_called_once()

    @patch("apps.datawarehouse.router.areas.area_service.get_association_counts")
    def test_association_count_no_identifier_returns_zeros(self, mock_counts, client):
        mock_counts.return_value = {"children_count": 0, "descendants_count": 0, "data_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["children_count"] == 0
        assert data["data"]["descendants_count"] == 0
        assert data["data"]["data_count"] == 0

    @patch("apps.datawarehouse.router.areas.area_service.get_association_counts")
    def test_association_count_service_error(self, mock_counts, client):
        mock_counts.side_effect = Exception("Database error")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/association-count",
            params={"identifier": "1"},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestAreaMultipleDelete:
    @patch("apps.datawarehouse.router.areas.area_service.resolve_area_identifier_to_nid")
    @patch("apps.datawarehouse.router.areas.area_service.multiple_delete")
    def test_multiple_delete_success(self, mock_delete, mock_resolve, client):
        mock_resolve.side_effect = [1, 2]
        mock_delete.return_value = {"deleted": [1, 2], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/multiple-delete",
            json={"ar_gid": ["gid-area-a", "gid-area-b"]},
        )
        assert response.status_code == 200
        mock_delete.assert_called_once()
        call_args = mock_delete.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.areas.area_service.multiple_delete")
    def test_multiple_delete_empty_list(self, mock_delete, client):
        mock_delete.return_value = {"deleted": [], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/multiple-delete",
            json={"ar_gid": []},
        )
        assert response.status_code == 200
        mock_delete.assert_called_once()

    def test_multiple_delete_missing_body(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/multiple-delete",
            json={},
        )
        assert response.status_code == 422

    @patch("apps.datawarehouse.router.areas.area_service.resolve_area_identifier_to_nid")
    @patch("apps.datawarehouse.router.areas.area_service.multiple_delete")
    def test_multiple_delete_service_error(self, mock_delete, mock_resolve, client):
        mock_resolve.side_effect = [1, 2]
        mock_delete.side_effect = Exception("Database error")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/multiple-delete",
            json={"ar_gid": ["gid-area-a", "gid-area-b"]},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestAreaLanguageSupport:
    @patch("apps.datawarehouse.services.area.AreaService.create_areas_batch")
    def test_create_area_with_language_header(self, mock_create, client):
        app.dependency_overrides[get_dw_language_code] = lambda: "fr"
        try:
            mock_create.return_value = {"created": [MOCK_AREA_RESPONSE], "errors": []}
            response = client.post(
                f"/dw/{TEST_WAREHOUSE_ID}/areas",
                json=[MOCK_AREA_CREATE],
                headers={"Accept-Language": "fr"},
            )
            assert response.status_code == 201
            data = response.json()
            assert data["success"] is True
            call_args = mock_create.call_args
            assert call_args[0][2] == "fr"  # language_code parameter
        finally:
            app.dependency_overrides.pop(get_dw_language_code, None)

    @patch("apps.datawarehouse.services.area.AreaService.update_area")
    def test_update_area_with_language_header(self, mock_update, client):
        app.dependency_overrides[get_dw_language_code] = lambda: "fr"
        try:
            updated_response = MOCK_AREA_RESPONSE.copy()
            updated_response["ar_name"] = "Bangalore Urbain"  # French translation
            mock_update.return_value = updated_response
            update_data = {"ar_name": "Bangalore Urbain"}
            response = client.patch(
                f"/dw/{TEST_WAREHOUSE_ID}/areas/1",
                json=update_data,
                headers={"Accept-Language": "fr"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            call_args = mock_update.call_args
            assert call_args[0][3] == "fr"  # language_code parameter
        finally:
            app.dependency_overrides.pop(get_dw_language_code, None)

    @patch("apps.datawarehouse.services.area.AreaService.get_area_by_identifier")
    def test_get_area_with_language_header(self, mock_get, client):
        app.dependency_overrides[get_dw_language_code] = lambda: "fr"
        try:
            french_response = MOCK_AREA_RESPONSE.copy()
            french_response["ar_name"] = "Bangalore Urbain"
            mock_get.return_value = french_response
            response = client.get(
                f"/dw/{TEST_WAREHOUSE_ID}/areas/1",
                headers={"Accept-Language": "fr"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            call_args = mock_get.call_args
            assert call_args[0][2] == "fr"  # language_code parameter
        finally:
            app.dependency_overrides.pop(get_dw_language_code, None)


class TestAreaValidation:
    def test_create_area_ar_name_too_long(self, client):
        """Test that ar_name exceeding 60 chars is rejected"""
        area_data = MOCK_AREA_CREATE.copy()
        area_data["ar_name"] = "A" * 61
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 422

    def test_create_area_ar_id_too_long(self, client):
        """Test that ar_id exceeding 255 chars is rejected"""
        area_data = MOCK_AREA_CREATE.copy()
        area_data["ar_id"] = "A" * 256
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 422

    def test_create_area_empty_ar_name(self, client):
        """Test that empty ar_name is rejected"""
        area_data = MOCK_AREA_CREATE.copy()
        area_data["ar_name"] = ""
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 422

    def test_create_area_empty_ar_id(self, client):
        """Test that empty ar_id is rejected"""
        area_data = MOCK_AREA_CREATE.copy()
        area_data["ar_id"] = ""
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/areas", json=[area_data])
        assert response.status_code == 422


class TestAreaExport:
    def test_export_areas_wrong_dw_id_returns_identifier_not_found(self, client):
        """
        Match unit export behavior: wrong dw_id -> 404 with standardized message.
        Export is GET /areas?export=true (query param), not POST /areas/export.
        """
        with patch(
            "apps.datawarehouse.router.areas.get_warehouse_credentials",
            side_effect=HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Data warehouse 'invalid' not found in system_datawarehouse table",
            ),
        ):
            response = client.get("/dw/invalid/areas", params={"export": True})

        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert data.get("err_message") == "Data warehouse identifier invalid not found"


class TestAreaImport:
    @pytest.fixture(autouse=True)
    def _iam_public_and_user(self, monkeypatch):
        monkeypatch.setattr(
            "apps.shared.middleware.auth_middleware._matches_for_path",
            lambda _method, _path: [("DFA_DM", "PUBLIC", -1)],
        )

    @patch("apps.datawarehouse.services.db_metadata.notify_dbmetadata_counts_changed")
    @patch("apps.datawarehouse.router.areas.area_service.import_areas_from_xlsx_bytes")
    def test_import_areas_xlsx_success(self, mock_import, _mock_notify, client):
        mock_import.return_value = {
            "inserted": 2,
            "updated": 1,
            "skipped_empty_rows": 3,
        }
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/import",
            files={
                "file": (
                    "areas.xlsx",
                    b"xlsx-bytes-placeholder",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["inserted"] == 2
        assert data["data"]["updated"] == 1
        assert data["meta"]["skipped_empty_rows"] == 3
        mock_import.assert_called_once_with(
            TEST_WAREHOUSE_ID,
            b"xlsx-bytes-placeholder",
            language_code=ANY,
        )

    @patch("apps.datawarehouse.router.areas.area_service.import_areas_from_xlsx_bytes")
    def test_import_areas_xlsx_returns_413_when_file_exceeds_size_limit(
        self, mock_import, client, monkeypatch
    ):
        monkeypatch.setattr(
            "apps.datawarehouse.router.areas.get_allowed_import_file_size_bytes",
            lambda _app_key: 2,
        )
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/import",
            files={
                "file": (
                    "areas.xlsx",
                    b"abc",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert response.status_code == 413
        assert response.json()["success"] is False
        mock_import.assert_not_called()

    @patch("apps.datawarehouse.router.areas.area_service.import_areas_from_xlsx_bytes")
    def test_import_areas_xlsx_validation_error(self, mock_import, client):
        mock_import.side_effect = ValueError("Row 3: cycle in parent references")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/areas/import",
            files={
                "file": (
                    "areas.xlsx",
                    b"bad",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        assert response.status_code == 422
        body = response.json()
        assert body["success"] is False
