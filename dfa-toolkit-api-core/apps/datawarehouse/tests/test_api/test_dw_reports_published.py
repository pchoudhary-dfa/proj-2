"""
Tests for GET /dw/{dw_id}/reports/data/published/full.
"""
from unittest.mock import MagicMock, patch

import pytest

TEST_WAREHOUSE_ID = "test_warehouse"
PUBLISHED_FULL_PATH = f"/dw/{TEST_WAREHOUSE_ID}/reports/data/published/full"

MOCK_PUBLISHED_ROW = {
    "dt_nid": 101,
    "dt_value": 42.5,
    "dt_text_value": None,
    "dt_is_mrd": True,
    "dt_is_planned_value": False,
    "dt_is_textual": False,
    "i_nid": 10,
    "i_gid": "IND_LITERACY",
    "i_name": "Adult Literacy Rate",
    "u_nid": 20,
    "u_gid": "U_PCT",
    "u_name": "Percent",
    "sg_nid": 30,
    "sg_gid": "SG_TOTAL",
    "sg_name": "Total",
    "ar_nid": 5,
    "ar_id": "AR_NATIONAL",
    "ar_gid": "AR_NATIONAL",
    "ar_name": "National",
    "ar_level": 1,
    "tp_nid": 8,
    "tp_timeperiod": "2020",
    "src_nid": 2,
    "src_gid": "SRC_WHO",
    "src_name": "WHO",
}


@pytest.fixture(autouse=True)
def iam_public_for_published_full_tests(monkeypatch):
    """Allow GET /dw/.../reports/data/published/full through IAM as PUBLIC."""
    monkeypatch.setattr(
        "apps.shared.middleware.auth_middleware._matches_for_path",
        lambda _method, _path: [("DFA_VIZ", "PUBLIC", -1)],
    )


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestPublishedDataValidation:
    def test_unknown_filter_field_returns_400(self, client):
        response = client.get(
            PUBLISHED_FULL_PATH,
            params={"indicator": "IND_LITERACY", "filter": "unknown_field:eq:value"},
        )
        assert response.status_code == 400

    def test_unknown_aggregate_by_returns_400(self, client):
        with patch(
            "apps.datawarehouse.router.dw_reports.resolve_published_filters"
        ) as mock_resolve:
            from apps.datawarehouse.services.dw_published_data_service import PublishedDataFilters

            mock_resolve.return_value = PublishedDataFilters(indicator_nids=[10])
            response = client.get(
                PUBLISHED_FULL_PATH,
                params={"indicator": "IND_LITERACY", "aggregate_by": "invalid_dim"},
            )
        assert response.status_code == 400

    def test_unsupported_view_returns_400(self, client):
        response = client.get(
            PUBLISHED_FULL_PATH,
            params={"indicator": "IND_LITERACY", "view": "visualizer"},
        )
        assert response.status_code == 400
        assert "not supported" in response.json()["err_message"].lower()


class TestPublishedDataSuccess:
    @patch("apps.datawarehouse.router.dw_reports.query_published_data")
    @patch("apps.datawarehouse.router.dw_reports.resolve_published_filters")
    def test_valid_request_returns_enriched_rows(self, mock_resolve, mock_query, client):
        from apps.datawarehouse.services.dw_published_data_service import PublishedDataFilters

        mock_resolve.return_value = PublishedDataFilters(indicator_nids=[10])
        mock_query.return_value = ([MOCK_PUBLISHED_ROW], 1, [], False)

        response = client.get(
            PUBLISHED_FULL_PATH,
            params={"indicator": "IND_LITERACY", "ismrd": "true"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert len(body["data"]) == 1
        row = body["data"][0]
        assert row["dt_nid"] == 101
        assert row["i_gid"] == "IND_LITERACY"
        assert row["ar_id"] == "AR_NATIONAL"
        assert row["src_name"] == "WHO"
        assert body["meta"]["total_count"] == 1

    @patch("apps.datawarehouse.router.dw_reports.export_report")
    @patch("apps.datawarehouse.router.dw_reports.get_warehouse_credentials")
    @patch("apps.datawarehouse.router.dw_reports.query_published_data")
    @patch("apps.datawarehouse.router.dw_reports.resolve_published_filters")
    def test_xlsx_export_returns_attachment(
        self,
        mock_resolve,
        mock_query,
        mock_creds,
        mock_export,
        client,
    ):
        from io import BytesIO

        from apps.datawarehouse.services.dw_published_data_service import PublishedDataFilters

        mock_resolve.return_value = PublishedDataFilters(indicator_nids=[10])
        mock_query.return_value = ([MOCK_PUBLISHED_ROW], 1, [], False)
        mock_creds.return_value = {"dw_connection_name": "test_dw"}
        mock_export.return_value = (
            BytesIO(b"PK\x03\x04"),
            "DATA_PUBLISHED_test_dw_2020-01-01.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        response = client.get(
            PUBLISHED_FULL_PATH,
            params={"indicator": "IND_LITERACY", "export": "true"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert "Content-Disposition" in response.headers


class TestPublishedDataIsDefaultSubgroup:
    @patch("apps.datawarehouse.services.dw_published_data_service.DataService")
    def test_isdefaultsubgroup_true_resolves_default_ius(self, mock_data_svc_cls):
        from apps.datawarehouse.services.dw_published_data_service import (
            DefaultSubgroupMode,
            resolve_published_filters,
        )

        mock_svc = MagicMock()
        mock_data_svc_cls.return_value = mock_svc
        mock_svc._resolve_identifier_values_to_nids.side_effect = [
            [10],
            [],
            [],
            [],
            [],
        ]
        mock_svc._resolve_timeperiod_identifier.return_value = None

        mock_db = MagicMock()
        default_ius = MagicMock()
        default_ius.iusnid = 501
        default_ius.unit_nid = 20
        default_ius.subgroup_val_nid = 30
        mock_db.query.return_value.filter.return_value.all.return_value = [default_ius]

        filters = resolve_published_filters(
            mock_db,
            "en",
            indicator="IND_LITERACY",
            isdefaultsubgroup=DefaultSubgroupMode.DEFAULT,
        )

        assert filters.ius_nids == [501]
        assert filters.unit_nids == [20]
        assert filters.subgroup_val_nids == [30]

    @patch("apps.datawarehouse.services.dw_published_data_service.DataService")
    def test_isdefaultsubgroup_true_no_defaults_falls_back_to_all(self, mock_data_svc_cls):
        from apps.datawarehouse.services.dw_published_data_service import (
            DefaultSubgroupMode,
            resolve_published_filters,
        )

        mock_svc = MagicMock()
        mock_data_svc_cls.return_value = mock_svc
        mock_svc._resolve_identifier_values_to_nids.side_effect = [
            [10],
            [],
            [],
            [],
            [],
        ]
        mock_svc._resolve_timeperiod_identifier.return_value = None

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = []

        filters = resolve_published_filters(
            mock_db,
            "en",
            indicator="IND_LITERACY",
            isdefaultsubgroup=DefaultSubgroupMode.DEFAULT,
        )

        assert filters.ius_nids == []
        assert filters.subgroup_val_nids == []

    @patch("apps.datawarehouse.services.dw_published_data_service.DataService")
    def test_isdefaultsubgroup_false_no_non_defaults_falls_back_to_all(self, mock_data_svc_cls):
        from apps.datawarehouse.services.dw_published_data_service import (
            DefaultSubgroupMode,
            resolve_published_filters,
        )

        mock_svc = MagicMock()
        mock_data_svc_cls.return_value = mock_svc
        mock_svc._resolve_identifier_values_to_nids.side_effect = [
            [10],
            [],
            [],
            [],
            [],
        ]
        mock_svc._resolve_timeperiod_identifier.return_value = None

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = []

        filters = resolve_published_filters(
            mock_db,
            "en",
            indicator="IND_LITERACY",
            isdefaultsubgroup=DefaultSubgroupMode.NON_DEFAULT,
        )

        assert filters.ius_nids == []

    @patch("apps.datawarehouse.services.dw_published_data_service.DataService")
    def test_explicit_subgroup_ignores_isdefaultsubgroup(self, mock_data_svc_cls):
        from apps.datawarehouse.services.dw_published_data_service import (
            DefaultSubgroupMode,
            resolve_published_filters,
        )

        mock_svc = MagicMock()
        mock_data_svc_cls.return_value = mock_svc
        mock_svc._resolve_identifier_values_to_nids.side_effect = [
            [10],
            [],
            [30],
            [],
            [],
        ]
        mock_svc._resolve_timeperiod_identifier.return_value = None

        mock_db = MagicMock()

        filters = resolve_published_filters(
            mock_db,
            "en",
            indicator="IND_LITERACY",
            subgroup="SG_TOTAL",
            isdefaultsubgroup=DefaultSubgroupMode.DEFAULT,
        )

        assert filters.subgroup_val_nids == [30]
        assert filters.ius_nids == []
        mock_db.query.assert_not_called()

    @patch("apps.datawarehouse.router.dw_reports.resolve_published_filters")
    def test_router_forwards_isdefaultsubgroup_false(self, mock_resolve, client):
        from apps.datawarehouse.services.dw_published_data_service import (
            DefaultSubgroupMode,
            PublishedDataFilters,
        )

        mock_resolve.return_value = PublishedDataFilters(indicator_nids=[10])

        with patch(
            "apps.datawarehouse.router.dw_reports.query_published_data",
            return_value=([], 0, [], False),
        ):
            response = client.get(
                PUBLISHED_FULL_PATH,
                params={"indicator": "IND_LITERACY", "isdefaultsubgroup": "false"},
            )

        assert response.status_code == 200
        assert mock_resolve.call_args.kwargs["isdefaultsubgroup"] == DefaultSubgroupMode.NON_DEFAULT
