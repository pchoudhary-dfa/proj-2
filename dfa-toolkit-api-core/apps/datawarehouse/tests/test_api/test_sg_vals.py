"""
Tests for Subgroups (sg_vals) API endpoints.
Uses mocks for SgValsService; assertions use status_code, success, message/err_message.
"""
import pytest
from unittest.mock import patch

TEST_WAREHOUSE_ID = "test_warehouse"
VALID_GUID = "f3c1e8a0-6f1e-4b78-8d30-6b2d6b22b6e1"


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


MOCK_SUBGROUP_ASSOCIATION_COUNTS = {"data_count": 50, "ius_count": 3}


class TestSubgroupAssociationCount:
    @pytest.fixture(autouse=True)
    def _iam_bypass_for_tests(self, monkeypatch):
        """Bypass IAM/JWT for read tests (same pattern as write tests in this module)."""
        monkeypatch.setattr(
            "apps.shared.middleware.auth_middleware._matches_for_path",
            lambda _method, _path: [("DFA_DM", "PUBLIC", 1)],
        )

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.get_association_counts")
    def test_association_count_success(self, mock_counts, client):
        mock_counts.return_value = MOCK_SUBGROUP_ASSOCIATION_COUNTS
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/association-count",
            params={"identifier": "1,2"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Association counts retrieved successfully"
        assert data["data"]["data_count"] == 50
        assert data["data"]["ius_count"] == 3
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.get_association_counts")
    def test_association_count_with_gid(self, mock_counts, client):
        mock_counts.return_value = MOCK_SUBGROUP_ASSOCIATION_COUNTS
        with patch(
            "apps.datawarehouse.router.sg_vals.sg_vals_service.get_sg_val_nid_by_gid",
            return_value=5,
        ):
            response = client.get(
                f"/dw/{TEST_WAREHOUSE_ID}/subgroups/association-count",
                params={"identifier": VALID_GUID},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_count"] == 50
        mock_counts.assert_called_once()
        call_args = mock_counts.call_args[0]
        assert call_args[1] == [5]

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.get_association_counts")
    def test_association_count_empty_list(self, mock_counts, client):
        mock_counts.return_value = {"data_count": 0, "ius_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_count"] == 0
        assert data["data"]["ius_count"] == 0
        mock_counts.assert_called_once()

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.get_association_counts")
    def test_association_count_no_identifier_returns_zeros(self, mock_counts, client):
        mock_counts.return_value = {"data_count": 0, "ius_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_count"] == 0
        assert data["data"]["ius_count"] == 0

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.get_association_counts")
    def test_association_count_subgroup_not_found(self, mock_counts, client):
        mock_counts.side_effect = ValueError("Subgroup(s) not found: 999")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/association-count",
            params={"identifier": "999"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.get_association_counts")
    def test_association_count_service_error(self, mock_counts, client):
        mock_counts.side_effect = Exception("Database error")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/association-count",
            params={"identifier": "1"},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestSubgroupMultipleDelete:
    @pytest.fixture(autouse=True)
    def _iam_public_for_tests(self, monkeypatch):
        """Bypass IAM PERMISSION/JWT so router logic is tested with mocks (same issue as other DW write tests)."""
        monkeypatch.setattr(
            "apps.shared.middleware.auth_middleware._matches_for_path",
            lambda _method, _path: [("DFA_DM", "PUBLIC", 1)],
        )

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.get_sg_val_nid_by_gid")
    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.multiple_delete")
    def test_multiple_delete_success(self, mock_delete, mock_get_nid, client):
        mock_get_nid.side_effect = [1, 2]
        mock_delete.return_value = {
            "deleted": [1, 2],
            "errors": [],
        }
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/multiple-delete",
            json={"subgroup_val_gid": ["gid-a", "gid-b"]},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_delete.assert_called_once()
        call_args = mock_delete.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == [1, 2]

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.multiple_delete")
    def test_multiple_delete_empty_list(self, mock_delete, client):
        mock_delete.return_value = {"deleted": [], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/multiple-delete",
            json={"subgroup_val_gid": []},
        )
        assert response.status_code == 200
        mock_delete.assert_called_once()

    def test_multiple_delete_missing_body(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/multiple-delete",
            json={},
        )
        assert response.status_code == 422

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.get_sg_val_nid_by_gid")
    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.multiple_delete")
    def test_multiple_delete_service_error(self, mock_delete, mock_get_nid, client):
        mock_get_nid.side_effect = [1, 2]
        mock_delete.side_effect = Exception("Database error")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/multiple-delete",
            json={"subgroup_val_gid": ["gid-a", "gid-b"]},
        )
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestSubgroupPatch:
    @pytest.fixture(autouse=True)
    def _iam_public_for_tests(self, monkeypatch):
        monkeypatch.setattr(
            "apps.shared.middleware.auth_middleware._matches_for_path",
            lambda _method, _path: [("DFA_DM", "PUBLIC", 1)],
        )

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.update_sg_val")
    def test_patch_success(self, mock_update, client):
        mock_update.return_value = {
            "subgroup_val_nid": 1,
            "subgroup_val_gid": "hjk",
            "subgroup_val": "Label",
            "subgroup_val_order": 2,
            "subgroup_val_global": False,
            "is_system": False,
        }
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/{VALID_GUID}",
            json={"sv_gid": "hjk"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Subgroup updated successfully"
        mock_update.assert_called_once()

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.update_sg_val")
    def test_patch_not_found(self, mock_update, client):
        mock_update.return_value = None
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/{VALID_GUID}",
            json={"sv_name": "x"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.router.sg_vals.sg_vals_service.update_sg_val")
    def test_patch_system_forbidden(self, mock_update, client):
        mock_update.side_effect = ValueError("System subgroup cannot be updated via API")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/subgroups/1",
            json={"sv_name": "x"},
        )
        assert response.status_code == 403
        data = response.json()
        assert data["success"] is False
