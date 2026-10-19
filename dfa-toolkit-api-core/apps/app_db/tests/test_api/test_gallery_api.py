"""
Tests for Gallery API endpoints.
Uses mocked service where appropriate to avoid requiring a live DB.
"""
import pytest
from unittest.mock import patch

from apps.app_db.schemas.gallery import GalleryItemResponse
from apps.app_db.tests.conftest import TEST_USER_ID, TEST_APP_KEY

BASE = "/gallery"


@pytest.fixture(autouse=True)
def client(gallery_client):
    return gallery_client


class TestListGallery:
    """GET /gallery"""

    @patch("apps.app_db.router.gallery.service.list_gallery")
    def test_list_returns_200_with_data_and_meta(self, mock_list, client):
        mock_list.return_value = ([], 0)
        response = client.get(BASE)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert isinstance(data["data"], list)
        assert "meta" in data
        assert data["meta"]["total_count"] == 0
        mock_list.assert_called_once()

    @patch("apps.app_db.router.gallery.service.list_gallery")
    def test_list_with_type_filter_and_pagination(self, mock_list, client):
        mock_list.return_value = ([], 0)
        response = client.get(BASE, params={"type": "visualization", "page": 1, "page_size": 10})
        assert response.status_code == 200
        mock_list.assert_called_once()
        call_kw = mock_list.call_args[1]
        assert call_kw.get("user_id") == TEST_USER_ID
        assert call_kw.get("app_key") == TEST_APP_KEY
        assert call_kw.get("type_filter") == "visualization"
        assert call_kw.get("page") == 1
        assert call_kw.get("page_size") == 10


class TestGetGallery:
    """GET /gallery/{id}"""

    @patch("apps.app_db.router.gallery.service.get_by_id")
    def test_get_not_found_returns_404(self, mock_get, client):
        mock_get.return_value = None
        response = client.get(f"{BASE}/99999")
        assert response.status_code == 404
        mock_get.assert_called_once_with(gallery_id=99999, user_id=TEST_USER_ID, app_key=TEST_APP_KEY)

    @patch("apps.app_db.router.gallery.service.get_by_id")
    def test_get_success_returns_200(self, mock_get, client):
        mock_get.return_value = GalleryItemResponse(
            id="1",
            type="visualization",
            indicator={"id": "i1", "name": "Test"},
            filters={},
            isDynamic=True,
        )
        response = client.get(f"{BASE}/1")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["id"] == "1"
        assert data["data"]["type"] == "visualization"


class TestAddGallery:
    """POST /gallery"""

    @patch("apps.app_db.router.gallery.service.add_gallery")
    def test_add_returns_201_with_item(self, mock_add, client):
        mock_add.return_value = GalleryItemResponse(
            id="1",
            type="visualization",
            indicator={"name": "Test"},
            filters={},
            isDynamic=True,
        )
        payload = {
            "type": "visualization",
            "indicator": {"id": "i1", "name": "Test", "code": "T1"},
            "filters": {"area": [], "timeStart": "2020", "timeEnd": "2023"},
            "vizSettings": {"chartType": "line"},
            "isDynamic": True,
        }
        response = client.post(BASE, json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["id"] == "1"
        mock_add.assert_called_once()
        call_kw = mock_add.call_args[1]
        payload_arg = call_kw["payload"]
        assert payload_arg.type == "visualization"
        assert payload_arg.indicator.name == "Test"

    @patch("apps.app_db.router.gallery.service.add_gallery")
    def test_add_accepts_previewData_as_object_for_snapshot(self, mock_add, client):
        """previewData can be object (chart) or list (table); accepted and stored as-is when isDynamic false."""
        chart_payload = {"series": [{"name": "A", "data": [1, 2]}], "categories": ["2020", "2021"]}
        mock_add.return_value = GalleryItemResponse(
            id="2",
            type="visualization",
            indicator={"name": "Test"},
            filters={},
            previewData=chart_payload,
            isDynamic=False,
        )
        payload = {
            "type": "visualization",
            "indicator": {"id": "i1", "name": "Test"},
            "filters": {},
            "isDynamic": False,
            "previewData": chart_payload,
        }
        response = client.post(BASE, json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["id"] == "2"
        if "previewData" in data.get("data", {}):
            assert data["data"]["previewData"] == chart_payload
        if "isDynamic" in data.get("data", {}):
            assert data["data"]["isDynamic"] is False


class TestUpdateGallery:
    """PATCH /gallery/{id}"""

    @patch("apps.app_db.router.gallery.service.update_gallery")
    def test_update_not_found_returns_404(self, mock_update, client):
        mock_update.return_value = None
        response = client.patch(f"{BASE}/99999", json={"isDynamic": False})
        assert response.status_code == 404
        mock_update.assert_called_once()

    @patch("apps.app_db.router.gallery.service.update_gallery")
    def test_update_success_returns_200(self, mock_update, client):
        mock_update.return_value = GalleryItemResponse(
            id="1",
            type="visualization",
            indicator={},
            filters={},
            isDynamic=False,
        )
        response = client.patch(f"{BASE}/1", json={"isDynamic": False, "previewData": [{"x": 1}]})
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["isDynamic"] is False

    @patch("apps.app_db.router.gallery.service.update_gallery")
    def test_update_snapshot_accepts_previewData_as_object(self, mock_update, client):
        """previewData can be object (chart payload) or list (table rows); stored/returned as-is."""
        chart_payload = {"series": [{"name": "A", "data": [1, 2]}], "categories": ["2020", "2021"]}
        mock_update.return_value = GalleryItemResponse(
            id="1",
            type="visualization",
            indicator={},
            filters={},
            previewData=chart_payload,
            isDynamic=False,
        )
        response = client.patch(f"{BASE}/1", json={"isDynamic": False, "previewData": chart_payload})
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["previewData"] == chart_payload
        assert data["data"]["isDynamic"] is False


class TestDeleteGallery:
    """DELETE /gallery/{id}"""

    @patch("apps.app_db.router.gallery.service.delete_gallery")
    def test_delete_not_found_returns_404(self, mock_delete, client):
        mock_delete.return_value = False
        response = client.delete(f"{BASE}/99999")
        assert response.status_code == 404
        mock_delete.assert_called_once_with(gallery_id=99999, user_id=TEST_USER_ID, app_key=TEST_APP_KEY)

    @patch("apps.app_db.router.gallery.service.delete_gallery")
    def test_delete_success_returns_204(self, mock_delete, client):
        mock_delete.return_value = True
        response = client.delete(f"{BASE}/1")
        assert response.status_code == 204
        mock_delete.assert_called_once_with(gallery_id=1, user_id=TEST_USER_ID, app_key=TEST_APP_KEY)
