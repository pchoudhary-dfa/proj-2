"""
Tests for IUS (Indicator-Unit-Subgroup) list API endpoint.
Uses mocks for IusService; assertions use status_code, success, message/err_message.
Router applies external response mapping (iusnid -> ius_nid, etc.) when is_external_adaptation() is True.
Tests assert on internal keys (ius_nid, indicator_nid, etc.) when mapping is patched off.
"""
import pytest
from unittest.mock import patch

from apps.shared.config.config import settings

TEST_WAREHOUSE_ID = "test_warehouse"


@pytest.fixture(autouse=True)
def patch_ius_internal_adaptation():
    """Force ADAPTATION=internal so get_serialization_mode() returns by_alias=False (internal keys)."""
    with patch.object(settings, "ADAPTATION", "internal"):
        yield

# Internal-style keys matching IUSResponseSchema (iusnid, isdefaultsubgroup, etc.)
MOCK_IUS_ITEM = {
    "iusnid": 1,
    "indicator_nid": 10,
    "unit_nid": 20,
    "subgroup_val_nid": 30,
    "min_value": 0.0,
    "max_value": 100.0,
    "subgroup_nids": None,
    "data_exist": False,
    "isdefaultsubgroup": True,
    "avlmindatavalue": None,
    "avlmaxdatavalue": None,
    "avlmintimeperiod": None,
    "avlmaxtimeperiod": None,
}


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestIusList:
    @patch("apps.datawarehouse.router.ius.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.ius.IusService.get_all_ius")
    def test_get_all_ius_success(self, mock_get_all, mock_ext, client):
        mock_get_all.return_value = ([MOCK_IUS_ITEM], 1)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/ius")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "IUS list retrieved successfully"
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        assert data["data"][0].get("iusnid") == 1
        mock_get_all.assert_called_once_with(
            TEST_WAREHOUSE_ID,
            language_code="en",
            ius_scope=None,
            i_gids=None,
            u_gids=None,
            sg_gids=None,
            ic_gids=None,
            i_nids=None,
            u_nids=None,
            sg_nids=None,
            ic_nids=None,
            ic_type=None,
            sort_field=None,
            sort_order=None,
            with_validation=False,
            page=1,
            page_size=None,
        )

    @patch("apps.datawarehouse.router.ius.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.ius.IusService.get_all_ius")
    def test_get_all_ius_with_ius_scope_no_data(self, mock_get_all, mock_ext, client):
        mock_get_all.return_value = ([], 0)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/ius?scope=NO_DATA")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_get_all.assert_called_once_with(
            TEST_WAREHOUSE_ID,
            language_code="en",
            ius_scope="NO_DATA",
            i_gids=None,
            u_gids=None,
            sg_gids=None,
            ic_gids=None,
            i_nids=None,
            u_nids=None,
            sg_nids=None,
            ic_nids=None,
            ic_type=None,
            sort_field=None,
            sort_order=None,
            with_validation=False,
            page=1,
            page_size=None,
        )

    @patch("apps.datawarehouse.router.ius.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.ius.IusService.get_all_ius")
    def test_get_all_ius_with_ius_scope_unmapped(self, mock_get_all, mock_ext, client):
        mock_get_all.return_value = ([], 0)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/ius?scope=UNMAPPED")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_get_all.assert_called_once_with(
            TEST_WAREHOUSE_ID,
            language_code="en",
            ius_scope="UNMAPPED",
            i_gids=None,
            u_gids=None,
            sg_gids=None,
            ic_gids=None,
            i_nids=None,
            u_nids=None,
            sg_nids=None,
            ic_nids=None,
            ic_type=None,
            sort_field=None,
            sort_order=None,
            with_validation=False,
            page=1,
            page_size=None,
        )

    @patch("apps.datawarehouse.services.ius.IusService.get_all_ius")
    def test_get_all_ius_invalid_ius_scope(self, mock_get_all, client):
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/ius?scope=invalid")
        assert response.status_code == 400
        data = response.json()
        assert data.get("success") is False
        assert "scope" in data.get("err_message", "")
        mock_get_all.assert_not_called()

    @patch("apps.datawarehouse.router.ius.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.ius.IusService.get_all_ius")
    def test_get_all_ius_empty(self, mock_get_all, mock_ext, client):
        mock_get_all.return_value = ([], 0)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/ius")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == []

    @patch("apps.datawarehouse.router.ius.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.router.ius.ius_service.get_ius_context_meta")
    @patch("apps.datawarehouse.services.ius.IusService.get_all_ius")
    def test_get_all_ius_with_meta_flags(self, mock_get_all, mock_context_meta, mock_ext, client):
        """When indicator/unit/subgroup=true, meta includes the corresponding lookup dicts."""
        mock_get_all.return_value = ([MOCK_IUS_ITEM], 1)
        mock_context_meta.return_value = {"indicators": [], "units": [], "subgroups": []}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/ius?indicator=true&unit=true&subgroup=true"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "meta" in data
        assert "indicator" in data["meta"]
        assert "unit" in data["meta"]
        assert "subgroup" in data["meta"]
        mock_context_meta.assert_called_once()

    @patch("apps.datawarehouse.services.ius.IusService.get_all_ius")
    def test_get_all_ius_warehouse_not_found(self, mock_get_all, client):
        mock_get_all.side_effect = ValueError(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/ius")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "err_message" in data

    @patch("apps.datawarehouse.services.ius.IusService.get_all_ius")
    def test_get_all_ius_service_error(self, mock_get_all, client):
        mock_get_all.side_effect = Exception("Database error")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/ius")
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestIusUpsert:
    """Tests for POST /dw/{dw_id}/ius (Upsert IUS). Payload: data array with i_gid, u_gid, u_sg_gid (same structure as GET indicators)."""

    @patch("apps.datawarehouse.router.ius.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.ius.IusService.upsert_ius_batch")
    def test_upsert_ius_success_with_sg_catg_val_nids(self, mock_upsert, mock_ext, client):
        mock_upsert.return_value = [{**MOCK_IUS_ITEM, "iusnid": 42}]
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/ius",
            json={
                "data": [
                    {
                        "i_gid": "I_GID",
                        "u_gid": ["1", "2"],
                        "u_sg_gid": {
                            "1": {"sg_gid": [1, 2], "default_sg_gids": ["1"]},
                            "2": {"sg_gid": [1, 2], "default_sg_gids": ["2"]},
                        },
                    }
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "IUS upserted successfully"
        assert "items" in data["data"]
        assert len(data["data"]["items"]) == 1
        assert data["data"]["items"][0]["iusnid"] == 42
        mock_upsert.assert_called_once()
        call_data = mock_upsert.call_args[1]["data"]
        assert len(call_data) == 1
        assert call_data[0]["i_gid"] == "I_GID"
        assert call_data[0]["u_gid"] == ["1", "2"]
        assert call_data[0]["u_sg_gid"]["1"]["sg_gid"] == [1, 2] and call_data[0]["u_sg_gid"]["1"]["default_sg_gids"] == ["1"]
        assert call_data[0]["u_sg_gid"]["2"]["sg_gid"] == [1, 2] and call_data[0]["u_sg_gid"]["2"]["default_sg_gids"] == ["2"]

    @patch("apps.datawarehouse.router.ius.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.ius.IusService.upsert_ius_batch")
    def test_upsert_ius_success_with_gids(self, mock_upsert, mock_ext, client):
        mock_upsert.return_value = [{**MOCK_IUS_ITEM, "iusnid": 99}]
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/ius",
            json={
                "data": [
                    {
                        "i_gid": "I_GID",
                        "u_gid": ["U_GID"],
                        "u_sg_gid": {"U_GID": {"sg_gid": ["SG_GID"], "default_sg_gids": ["SG_GID"]}},
                    }
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["items"][0]["iusnid"] == 99
        mock_upsert.assert_called_once()
        call_data = mock_upsert.call_args[1]["data"]
        assert call_data[0]["i_gid"] == "I_GID"
        assert call_data[0]["u_gid"] == ["U_GID"]
        assert call_data[0]["u_sg_gid"]["U_GID"]["sg_gid"] == ["SG_GID"] and call_data[0]["u_sg_gid"]["U_GID"]["default_sg_gids"] == ["SG_GID"]

    @patch("apps.datawarehouse.services.ius.IusService.upsert_ius_batch")
    def test_upsert_ius_indicator_not_found_returns_404(self, mock_upsert, client):
        mock_upsert.side_effect = ValueError("INDICATOR_NOT_FOUND")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/ius",
            json={
                "data": [
                    {
                        "i_gid": "X",
                        "u_gid": ["Y"],
                        "u_sg_gid": {"Y": {"sg_gid": [1], "default_sg_gids": [1]}},
                    }
                ],
            },
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    def test_upsert_ius_validation_error_missing_indicator_unit(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/ius",
            json={"data": [{"i_gid": "x"}]},
        )
        assert response.status_code == 422

    def test_upsert_ius_validation_error_missing_u_sg_gid(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/ius",
            json={"data": [{"i_gid": "I", "u_gid": ["1"]}]},
        )
        assert response.status_code == 422

    def test_upsert_ius_accepts_defualt_subgroup_alias(self, client):
        """Payload can use default_subgroup or defualt_subgroup alias for default_sg_gid."""
        with patch("apps.datawarehouse.services.ius.IusService.upsert_ius_batch") as mock_upsert:
            mock_upsert.return_value = []
            response = client.post(
                f"/dw/{TEST_WAREHOUSE_ID}/ius",
                json={
                    "data": [
                        {
                            "i_gid": "I",
                            "u_gid": ["1"],
                            "u_sg_gid": {"1": {"sg_gid": [1], "defualt_subgroup": 1}},
                        }
                    ],
                },
            )
            assert response.status_code == 200
            call_data = mock_upsert.call_args[1]["data"]
            assert call_data[0]["u_sg_gid"]["1"].get("default_sg_gid") == 1
