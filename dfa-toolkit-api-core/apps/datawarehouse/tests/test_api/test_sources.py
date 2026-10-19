"""
Tests for Source API: association-count, multiple-delete, PATCH returns only patched data.
"""
import pytest
from unittest.mock import patch

from apps.shared.config.config import settings

TEST_WAREHOUSE_ID = "test_warehouse"

MOCK_SOURCE_ASSOCIATION_COUNTS = {"data_rows": 100, "ius_rows": 5}


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestSourceAssociationCount:
    @patch("apps.datawarehouse.router.sources.source_service.get_association_counts")
    def test_association_count_success(self, mock_counts, client):
        mock_counts.return_value = MOCK_SOURCE_ASSOCIATION_COUNTS
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sources/association-count",
            params={"identifier": "1,2"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Association counts retrieved successfully"
        assert data["data"]["data_rows"] == 100
        assert data["data"]["ius_rows"] == 5
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.sources.source_service.get_association_counts")
    def test_association_count_empty_list(self, mock_counts, client):
        mock_counts.return_value = {"data_rows": 0, "ius_rows": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sources/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_rows"] == 0
        assert data["data"]["ius_rows"] == 0
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[1] == []

    @patch("apps.datawarehouse.router.sources.source_service.get_association_counts")
    def test_association_count_not_found(self, mock_counts, client):
        mock_counts.side_effect = ValueError("Source(s) not found: '99' is not a valid source identifier")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/sources/association-count",
            params={"identifier": "99"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False


@pytest.mark.skip(reason="multiple-delete endpoint not currently enabled")
class TestSourceMultipleDelete:
    @patch("apps.datawarehouse.router.sources.source_service.multiple_delete")
    def test_multiple_delete_success(self, mock_delete, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sources/multiple-delete",
            json={"src_gid": ["gid-src-a", "gid-src-b"]},
        )
        assert response.status_code == 204
        mock_delete.assert_called_once()
        call_args = mock_delete.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == ["gid-src-a", "gid-src-b"]

    @patch("apps.datawarehouse.router.sources.source_service.multiple_delete")
    def test_multiple_delete_empty_list(self, mock_delete, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/sources/multiple-delete",
            json={"src_gid": []},
        )
        assert response.status_code == 204
        # Router skips service call when src_gid is empty (if body.src_gid:)
        mock_delete.assert_not_called()


class TestSourcePatchReturnsOnlyPatchedData:
    @pytest.fixture(autouse=True)
    def force_internal_adaptation(self):
        """SourceUpdateSchema validates keys; use internal adaptation so title/year are accepted."""
        with patch.object(settings, "ADAPTATION", "internal"):
            yield

    @patch("apps.datawarehouse.router.sources.source_service.update_source")
    def test_patch_returns_only_patched_fields(self, mock_update, client):
        """PATCH response must contain only the fields that were in the request body."""
        full_source = {
            "ic_nid": 1,
            "ic_gid": "guid-1",
            "ic_name": "GLOBAL_Book_2020",
            "ic_short_name": "book",
            "publisher": "GLOBAL",
            "title": "Book",
            "diyear": "2020",
            "sourcelink1": None,
            "sourcelink2": None,
            "isbn": None,
            "nature": None,
            "locale": "en",
        }
        # Service returns full source after update (with patched values)
        full_source["title"] = "Updated Title"
        full_source["diyear"] = "2021"
        mock_update.return_value = full_source
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/sources/1",
            json={"title": "Updated Title", "year": "2021"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        # Only patched fields must be present in response (not full source)
        assert set(data["data"].keys()) == {"title", "diyear"}
        assert data["data"]["title"] == "Updated Title"
        assert data["data"]["diyear"] == "2021"
        assert "ic_nid" not in data["data"]
        assert "ic_gid" not in data["data"]
