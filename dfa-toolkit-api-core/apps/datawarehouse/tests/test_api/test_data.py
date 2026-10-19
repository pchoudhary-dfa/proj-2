"""
Tests for Data API: GET /dw/{dw_id}/data.
Asserts response keys match DATA mapping (internal names when ADAPTATION=internal,
external aliases from db_tbl_cols_mapping.json when ADAPTATION is external).
"""
import pytest
from unittest.mock import patch

TEST_WAREHOUSE_ID = "test_warehouse"

# Row as returned by DataService._query_data_rows (internal DATA key names)
MOCK_DATA_ROW_INTERNAL = {
    "data_nid": 101,
    "iusnid": 1,
    "timeperiod_nid": 10,
    "area_nid": 5,
    "start_date": "2020-01-01T00:00:00",
    "end_date": "2020-12-31T23:59:59",
    "data_denominator": 0,
    "footnote_nid": 0,
    "source_nid": 2,
    "indicator_nid": 10,
    "unit_nid": 20,
    "subgroup_val_nid": 30,
    "ic_ius_order": 1,
    "textual_data_value": None,
    "istextualdata": False,
    "data_value": 42.5,
    "i_name": "Indicator One",
    "i_gid": "i_gid_1",
    "u_name": "Unit One",
    "u_gid": "u_gid_1",
    "sg_name": "Subgroup One",
    "sg_gid": "s_gid_1",
    "ar_id": "AR001",
    "ar_name": "Area One",
    "tp_timeperiod": "2020",
    "ius_gid": "i_gid_1|u_gid_1|s_gid_1",
    "src_name": "",
    "footnote": "",
}

# Matches ListPaginationMetaSchema under meta.pagination (GET /dw/{id}/data)
def _pagination_meta(total_count: int, count: int, page: int = 1, page_size: int = 100) -> dict:
    total_pages = (total_count + page_size - 1) // page_size if total_count else 0
    return {
        "pagination": {
            "total_count": total_count,
            "count": count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }
    }


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestDataApiResponseKeys:
    """Response keys must match DATA key in db_tbl_cols_mapping.json when external."""

    @patch("apps.datawarehouse.router.data.get_serialization_mode", return_value={"by_alias": False})
    @patch("apps.datawarehouse.router.data._data_service")
    def test_data_response_internal_keys(self, mock_svc, mock_ser, client):
        mock_svc.get_data.return_value = ([MOCK_DATA_ROW_INTERNAL], _pagination_meta(1, 1))
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/data?i_identifier=10")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 1
        row = data["data"][0]
        assert row.get("data_nid") == 101
        assert row.get("iusnid") == 1
        assert row.get("indicator_nid") == 10
        assert row.get("unit_nid") == 20
        assert row.get("subgroup_val_nid") == 30
        assert row.get("area_nid") == 5
        assert row.get("timeperiod_nid") == 10
        assert row.get("data_value") == 42.5
        assert row.get("source_nid") == 2

    @patch("apps.datawarehouse.router.data.get_serialization_mode", return_value={"by_alias": True})
    @patch("apps.datawarehouse.router.data._data_service")
    def test_data_response_external_keys_from_data_mapping(self, mock_svc, mock_ser, client):
        mock_svc.get_data.return_value = ([MOCK_DATA_ROW_INTERNAL], _pagination_meta(1, 1))
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/data?i_identifier=10")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 1
        row = data["data"][0]
        assert row.get("dt_nid") == 101
        assert row.get("ius_nid") == 1
        assert row.get("i_nid") == 10
        assert row.get("u_nid") == 20
        assert row.get("sg_nid") == 30
        assert row.get("ar_nid") == 5
        assert row.get("tp_nid") == 10
        assert row.get("dt_value") == 42.5
        # DATA mapping: source_nid serializes as ic_nid (external alias)
        assert row.get("src_nid") == 2 or row.get("ic_nid") == 2
        # DATA mapping: start_date -> dt_start_date, end_date -> dt_end_date
        assert row.get("dt_start_date") == "2020-01-01T00:00:00" or row.get("dt_startdate") == "2020-01-01T00:00:00"
        assert row.get("dt_end_date") == "2020-12-31T23:59:59" or row.get("dt_enddate") == "2020-12-31T23:59:59"
        assert row.get("dt_is_textual") is False
        assert row.get("fn_nid") == 0
        assert row.get("dt_denominator") == 0
        assert row.get("ic_ius_order") == 1
        assert "data_nid" not in row
        assert "iusnid" not in row
        assert "indicator_nid" not in row
        assert "subgroup_val_nid" not in row
        assert "data_value" not in row
        assert row.get("i_name") == "Indicator One"

    @patch("apps.datawarehouse.router.data.get_serialization_mode", return_value={"by_alias": False})
    @patch("apps.datawarehouse.router.data._data_service")
    def test_data_mandatory_indicator_missing(self, mock_svc, mock_ser, client):
        mock_svc.get_data.side_effect = ValueError("Mandatory Classification/Indicator/Subgroups parameter is missing")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/data")
        assert response.status_code == 400
        data = response.json()
        assert data.get("success") is False
        assert "MISSING_INDICATOR" in str(data.get("errors", {}))


class TestDataApiDefaultSubgroup:
    """Default IUS resolution when isdefaultenabled is True (indicator only or indicator+unit)."""

    @patch("apps.datawarehouse.router.data.get_serialization_mode", return_value={"by_alias": False})
    @patch("apps.datawarehouse.router.data._data_service")
    def test_get_data_called_with_only_indicator_isdefaultenabled_true(self, mock_svc, mock_ser, client):
        mock_svc.get_data.return_value = ([], _pagination_meta(0, 0))
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/data?i_identifier=10")
        assert response.status_code == 200
        mock_svc.get_data.assert_called_once()
        call_kw = mock_svc.get_data.call_args[1]
        assert call_kw["i_identifier"] == "10"
        assert "u_nid" not in call_kw
        assert "u_gid" not in call_kw
        assert call_kw["ius_identifier"] is None
        assert call_kw["sg_identifier"] is None
        assert call_kw["isdefaultenabled"] is True

    @patch("apps.datawarehouse.router.data.get_serialization_mode", return_value={"by_alias": False})
    @patch("apps.datawarehouse.router.data._data_service")
    def test_get_data_called_with_only_indicator_isdefaultenabled_false(self, mock_svc, mock_ser, client):
        mock_svc.get_data.return_value = ([], _pagination_meta(0, 0))
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/data?i_identifier=10&isdefaultenabled=false")
        assert response.status_code == 200
        mock_svc.get_data.assert_called_once()
        call_kw = mock_svc.get_data.call_args[1]
        assert call_kw["i_identifier"] == "10"
        assert call_kw["isdefaultenabled"] is False

    @patch("apps.datawarehouse.router.data.get_serialization_mode", return_value={"by_alias": False})
    @patch("apps.datawarehouse.router.data._data_service")
    def test_get_data_with_subgroup_param_isdefaultenabled_ignored(self, mock_svc, mock_ser, client):
        mock_svc.get_data.return_value = ([MOCK_DATA_ROW_INTERNAL], _pagination_meta(1, 1))
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/data?i_identifier=10&sg_identifier=30&isdefaultenabled=false")
        assert response.status_code == 200
        mock_svc.get_data.assert_called_once()
        call_kw = mock_svc.get_data.call_args[1]
        assert call_kw["i_identifier"] == "10"
        assert call_kw["sg_identifier"] == "30"
        assert call_kw["isdefaultenabled"] is False
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]) == 1

    @patch("apps.datawarehouse.router.data.get_serialization_mode", return_value={"by_alias": False})
    @patch("apps.datawarehouse.router.data._data_service")
    def test_get_data_indicator_and_unit_passes_default_flag(self, mock_svc, mock_ser, client):
        """Indicator + unit still forwards isdefaultenabled for service-side default IUS + unit filter."""
        mock_svc.get_data.return_value = ([], _pagination_meta(0, 0))
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/data?i_identifier=10&u_identifier=20")
        assert response.status_code == 200
        mock_svc.get_data.assert_called_once()
        call_kw = mock_svc.get_data.call_args[1]
        assert call_kw["i_identifier"] == "10"
        assert call_kw["u_identifier"] == "20"
        assert call_kw["isdefaultenabled"] is True
