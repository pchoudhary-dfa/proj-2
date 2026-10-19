"""
Tests for Time Periods CRUD API endpoints.
Uses mocks for TimePeriodService; assertions use status_code, success, message/err_message.
Tests assert on internal keys (id, timeperiod). We force ADAPTATION=internal so
response serialization and request validation use internal keys.
"""
import pytest
from unittest.mock import patch, ANY

from apps.shared.config.config import settings
from apps.shared.exceptions import NotFound
from apps.datawarehouse.schemas.time_period import (
    TimePeriodCreateSchema,
    TimePeriodUpdateSchema,
)

TEST_WAREHOUSE_ID = "test_warehouse"


@pytest.fixture(autouse=True)
def force_internal_adaptation_and_no_auth():
    """Internal keys, bypass app client auth, and satisfy JWT middleware for non-PUBLIC routes."""
    with (
        patch.object(settings, "ADAPTATION", "internal"),
        patch.object(settings, "ENABLE_APP_CLIENT_AUTH", False),
        patch(
            "apps.shared.middleware.auth_middleware._extract_bearer",
            return_value="test-jwt",
        ),
        patch(
            "apps.shared.middleware.auth_middleware.decode_token",
            return_value={"sub": "1"},
        ),
        patch(
            "apps.shared.middleware.auth_middleware._user_has_permission",
            return_value=True,
        ),
    ):
        yield

# Response shape: id, timeperiod, startdate, enddate, periodicity
MOCK_TIME_PERIOD_ITEM = {
    "id": 1,
    "timeperiod": "2019-2020",
    "startdate": "2019-04-01T00:00:00",
    "enddate": "2020-03-31T00:00:00",
    "periodicity": "A",
}

# create_batch returns list of from_record-style dicts (timeperiod_nid, timeperiod, ...)
MOCK_CREATE_RESPONSE = {"id": 1, "timeperiod": "2019-2020"}
MOCK_BATCH_ITEM = {
    "timeperiod_nid": 1,
    "timeperiod": "2019-2020",
    "startdate": "2019-04-01T00:00:00",
    "enddate": "2020-03-31T00:00:00",
    "periodicity": "A",
}

MOCK_ASSOCIATION_COUNTS = {"data_count": 150}


@pytest.fixture(autouse=True)
def client(client_no_db):
    return client_no_db


class TestTimePeriodList:
    @patch("apps.datawarehouse.router.time_periods.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_all_time_periods")
    def test_get_all_time_periods_success(self, mock_get_all, mock_ext, client):
        mock_get_all.return_value = ([MOCK_TIME_PERIOD_ITEM], 1, None)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/time-periods")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Time periods retrieved successfully"
        assert isinstance(data["data"], list)
        assert len(data["data"]) == 1
        assert data["data"][0].get("timeperiod_nid") == 1 or data["data"][0].get("id") == 1 or data["data"][0].get("tp_nid") == 1
        assert data["data"][0]["timeperiod"] == "2019-2020"
        assert "meta" in data
        assert data["meta"]["total_count"] == 1
        assert data["meta"]["page"] == 1
        # No page_size in URL → no pagination; meta reports page_size=total_count
        assert data["meta"]["page_size"] == 1
        mock_get_all.assert_called_once()
        call_args, call_kw = mock_get_all.call_args
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_kw.get("page") == 1
        assert call_kw.get("search") is None

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_all_time_periods")
    def test_get_all_time_periods_empty(self, mock_get_all, client):
        mock_get_all.return_value = ([], 0, None)
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/time-periods")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"] == []
        assert data["meta"]["total_count"] == 0

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_all_time_periods")
    def test_get_all_time_periods_warehouse_not_found(self, mock_get_all, client):
        mock_get_all.side_effect = NotFound(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/time-periods")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_all_time_periods")
    def test_get_all_time_periods_with_frequency_a(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_TIME_PERIOD_ITEM], 1, None)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            params={"timeperiod_frequency": "A"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_get_all.assert_called_once()
        _, call_kw = mock_get_all.call_args
        assert call_kw.get("timeperiod_frequency") == "A"

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_all_time_periods")
    def test_get_all_time_periods_with_frequency_all(self, mock_get_all, client):
        mock_get_all.return_value = ([MOCK_TIME_PERIOD_ITEM], 1, None)
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            params={"timeperiod_frequency": "ALL"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_get_all.assert_called_once()
        _, call_kw = mock_get_all.call_args
        assert call_kw.get("timeperiod_frequency") == "ALL"

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_all_time_periods")
    def test_get_all_time_periods_invalid_frequency_returns_400(self, mock_get_all, client):
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            params={"timeperiod_frequency": "X"},
        )
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "timeperiod_frequency must be one of" in data.get("err_message", "")
        mock_get_all.assert_not_called()

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_all_time_periods")
    def test_get_all_time_periods_service_error(self, mock_get_all, client):
        mock_get_all.side_effect = Exception("Database error")
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/time-periods")
        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False


class TestTimePeriodGetOne:
    @patch("apps.datawarehouse.router.time_periods.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_time_period_by_identifier")
    def test_get_time_period_by_id_success(self, mock_get, mock_ext, client):
        mock_get.return_value = MOCK_TIME_PERIOD_ITEM
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/time-periods/1")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("timeperiod_nid") == 1 or data["data"].get("id") == 1 or data["data"].get("tp_nid") == 1
        assert data["data"]["timeperiod"] == "2019-2020"
        mock_get.assert_called_once_with(TEST_WAREHOUSE_ID, "1")

    @patch("apps.datawarehouse.router.time_periods.is_external_adaptation", return_value=False)
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_time_period_by_identifier")
    def test_get_time_period_by_value_success(self, mock_get, mock_ext, client):
        mock_get.return_value = MOCK_TIME_PERIOD_ITEM
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/time-periods/2019-2020")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"].get("timeperiod_nid") == 1 or data["data"].get("id") == 1 or data["data"].get("tp_nid") == 1
        assert data["data"]["timeperiod"] == "2019-2020"
        mock_get.assert_called_once_with(TEST_WAREHOUSE_ID, "2019-2020")

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_time_period_by_identifier")
    def test_get_time_period_not_found(self, mock_get, client):
        mock_get.return_value = None
        response = client.get(f"/dw/{TEST_WAREHOUSE_ID}/time-periods/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "Time period" in data.get("err_message", "")


class TestTimePeriodCreate:
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.create_batch")
    def test_create_time_period_success(self, mock_create, client):
        mock_create.return_value = {"created": [MOCK_BATCH_ITEM], "errors": []}
        payload = {
            "timeperiod": "2019-2020",
            "startdate": "2019-04-01",
            "enddate": "2020-03-31",
            "periodicity": "A",
        }
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/time-periods", json=[payload])
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "time period" in data.get("message", "").lower() and "created" in data.get("message", "").lower()
        assert data["meta"]["count"] == 1
        assert len(data["data"]) == 1
        assert data["data"][0].get("timeperiod_nid") == 1 or data["data"][0].get("id") == 1 or data["data"][0].get("tp_nid") == 1
        if data["data"][0].get("timeperiod") is not None:
            assert data["data"][0].get("timeperiod") == "2019-2020"
        mock_create.assert_called_once()
        call_args = mock_create.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert len(call_args[1]) == 1
        assert isinstance(call_args[1][0], TimePeriodCreateSchema)
        assert call_args[1][0].timeperiod == "2019-2020"

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.create_batch")
    def test_create_time_period_returns_derived_dates(self, mock_create, client):
        """Derived startdate/enddate are returned even when create response is reduced to nid."""
        mock_create.return_value = {"created": [MOCK_BATCH_ITEM], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"timeperiod": "2019-2020", "periodicity": "A"}],
        )
        assert response.status_code == 201
        item = response.json()["data"][0]
        assert item["startdate"] == "2019-04-01T00:00:00"
        assert item["enddate"] == "2020-03-31T00:00:00"

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.create_batch")
    def test_create_time_period_minimal(self, mock_create, client):
        mock_create.return_value = {
            "created": [
                {"timeperiod_nid": 2, "timeperiod": "2020", "startdate": None, "enddate": None, "periodicity": None}
            ],
            "errors": [],
        }
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"timeperiod": "2020"}],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["meta"]["count"] == 1
        assert data["data"][0].get("timeperiod") == "2020" or data["data"][0].get("timeperiod_nid") == 2

    def test_create_time_period_empty_array(self, client):
        response = client.post(f"/dw/{TEST_WAREHOUSE_ID}/time-periods", json=[])
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "non-empty array" in data.get("err_message", "").lower()

    def test_create_time_period_missing_timeperiod(self, client):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"startdate": "2019-01-01"}],
        )
        assert response.status_code == 422

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.create_batch")
    def test_create_time_period_warehouse_not_found(self, mock_create, client):
        mock_create.side_effect = NotFound(f"Warehouse ID '{TEST_WAREHOUSE_ID}' not found")
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"timeperiod": "2019-2020"}],
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.create_batch")
    def test_create_time_period_validation_error(self, mock_create, client):
        """create_batch collects per-item errors; response is 201 with errors in meta."""
        mock_create.return_value = {
            "created": [],
            "errors": [{"index": 0, "error": "Validation failed: timeperiod must be unique"}],
        }
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"timeperiod": "2019-2020"}],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["meta"]["count"] == 0
        assert "Validation failed" in data["meta"]["errors"][0]["error"]
        assert "1 failed" in data["message"]

    def test_create_time_period_invalid_periodicity(self, client):
        """Periodicity must be one of A, M, Q, H, D, F."""
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"timeperiod": "2019-2020", "periodicity": "X"}],
        )
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False

    def test_create_time_period_fiscal_string_rejected_with_periodicity_a(self, client):
        """Legacy fiscal-style labels are invalid when periodicity A is set."""
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"timeperiod": "2019-20", "periodicity": "A"}],
        )
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False

    def test_create_time_period_nonstandard_allowed_without_periodicity(self, client):
        """Without periodicity, timeperiod string is not format-checked."""
        with patch("apps.datawarehouse.services.time_period.TimePeriodService.create_batch") as mock_create:
            mock_create.return_value = {
                "created": [
                    {
                        "timeperiod_nid": 3,
                        "timeperiod": "2019-20",
                        "startdate": None,
                        "enddate": None,
                        "periodicity": None,
                    }
                ],
                "errors": [],
            }
            response = client.post(
                f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
                json=[{"timeperiod": "2019-20"}],
            )
        assert response.status_code == 201

    @pytest.mark.parametrize(
        "tp,periodicity",
        [
            ("2024", "A"),
            ("2020-2025", "A"),
            ("2024.01", "M"),
            ("2024.01-2025.12", "M"),
            ("Q1.2024", "Q"),
            ("Q1.2023-Q4.2024", "Q"),
            ("2025.09", "H"),
            ("2025.09-2029.11", "H"),
            ("2024.01.15", "D"),
            ("2024.01.01-2024.12.31", "D"),
            ("2024.06.01", "F"),
        ],
    )
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.create_batch")
    def test_create_time_period_valid_encoded_formats(self, mock_create, client, tp, periodicity):
        mock_create.return_value = {
            "created": [
                {
                    "timeperiod_nid": 1,
                    "timeperiod": tp,
                    "startdate": None,
                    "enddate": None,
                    "periodicity": periodicity,
                }
            ],
            "errors": [],
        }
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"timeperiod": tp, "periodicity": periodicity}],
        )
        assert response.status_code == 201

    @pytest.mark.parametrize(
        "tp,periodicity",
        [
            ("2020-2019", "A"),
            ("2024.12-2024.01", "M"),
            ("2024.12-2024.01", "H"),
            ("Q3.2024-Q1.2024", "Q"),
            ("2024.12.31-2024.01.01", "D"),
            ("q1.2024", "Q"),
            ("2024.1", "M"),
            ("2024.02.30", "D"),
        ],
    )
    def test_create_time_period_invalid_encoded_format(self, client, tp, periodicity):
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            json=[{"timeperiod": tp, "periodicity": periodicity}],
        )
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False


class TestTimePeriodUpdate:
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.update")
    def test_update_time_period_success(self, mock_update, client):
        mock_update.return_value = MOCK_CREATE_RESPONSE
        payload = {"timeperiod": "2021-2022", "periodicity": "A"}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/1",
            json=payload,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Time period updated successfully"
        mock_update.assert_called_once()
        call_args = mock_update.call_args[0]
        assert call_args[0] == TEST_WAREHOUSE_ID
        assert call_args[1] == "1"
        assert isinstance(call_args[2], TimePeriodUpdateSchema)

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.update")
    def test_update_time_period_by_value_success(self, mock_update, client):
        mock_update.return_value = {"id": 1, "timeperiod": "2019-2020"}
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/2019-2020",
            json={"periodicity": "A"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_update.assert_called_once_with(TEST_WAREHOUSE_ID, "2019-2020", ANY)

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.update")
    def test_update_time_period_not_found(self, mock_update, client):
        mock_update.side_effect = NotFound("Time period not found")
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/999",
            json={"timeperiod": "Updated"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    def test_update_time_period_invalid_periodicity(self, client):
        """Periodicity on update must be one of A, M, Q, H, D, F."""
        response = client.patch(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/1",
            json={"periodicity": "Annual"},
        )
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False

class TestTimePeriodDelete:
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.delete")
    def test_delete_time_period_success(self, mock_delete, client):
        mock_delete.return_value = None
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/time-periods/1")
        assert response.status_code == 204
        mock_delete.assert_called_once_with(TEST_WAREHOUSE_ID, "1")

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.delete")
    def test_delete_time_period_not_found(self, mock_delete, client):
        mock_delete.side_effect = NotFound("Time period not found")
        response = client.delete(f"/dw/{TEST_WAREHOUSE_ID}/time-periods/999")
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

class TestTimePeriodMultipleDelete:
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.multiple_delete")
    def test_multiple_delete_success(self, mock_multi_delete, client):
        mock_multi_delete.return_value = {"deleted": [1, 2], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/multiple-delete",
            json={"identifier": ["1", "2"]},
        )
        assert response.status_code == 200
        mock_multi_delete.assert_called_once_with(TEST_WAREHOUSE_ID, ["1", "2"])

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.multiple_delete")
    def test_multiple_delete_empty_list(self, mock_multi_delete, client):
        mock_multi_delete.return_value = {"deleted": [], "errors": []}
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/multiple-delete",
            json={"identifier": []},
        )
        assert response.status_code == 200
        mock_multi_delete.assert_called_once_with(TEST_WAREHOUSE_ID, [])

class TestTimePeriodAssociationCount:
    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_association_counts")
    def test_association_count_success(self, mock_counts, client):
        mock_counts.return_value = MOCK_ASSOCIATION_COUNTS
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/association-count",
            params={"identifier": "1,2"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Association counts retrieved successfully"
        assert data["data"]["data_count"] == 150
        mock_counts.assert_called_once_with(TEST_WAREHOUSE_ID, ["1", "2"])

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_association_counts")
    def test_association_count_empty_list(self, mock_counts, client):
        mock_counts.return_value = {"data_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_count"] == 0
        mock_counts.assert_called_once_with(TEST_WAREHOUSE_ID, [])

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_association_counts")
    def test_association_count_not_found(self, mock_counts, client):
        mock_counts.side_effect = NotFound("Time period not found: 99")
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/association-count",
            params={"identifier": "99"},
        )
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False

    @patch("apps.datawarehouse.services.time_period.TimePeriodService.get_association_counts")
    def test_association_count_no_identifier_returns_zeros(self, mock_counts, client):
        mock_counts.return_value = {"data_count": 0}
        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/association-count",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["data_count"] == 0


class TestTimePeriodExportImport:
    @patch("apps.datawarehouse.router.time_periods.build_time_periods_export_xlsx")
    @patch("apps.datawarehouse.router.time_periods.get_warehouse_session_from_id")
    @patch("apps.datawarehouse.router.time_periods.get_warehouse_credentials")
    def test_get_list_export_true_streams_xlsx(
        self, mock_cred, mock_sess, mock_build, client
    ):
        from io import BytesIO
        from unittest.mock import MagicMock

        mock_cred.return_value = {"dw_connection_name": "TestDW"}
        mock_build.return_value = (BytesIO(b"fake-xlsx"), "TIME_PERIODS_TestDW.xlsx")
        enter = MagicMock()
        mock_sess.return_value.__enter__.return_value = enter
        mock_sess.return_value.__exit__.return_value = None

        response = client.get(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods",
            params={"export": "true"},
        )
        assert response.status_code == 200
        assert "spreadsheetml" in (response.headers.get("content-type") or "")
        mock_build.assert_called_once()
        args, _kwargs = mock_build.call_args
        assert args[0] is enter

    @patch("apps.datawarehouse.services.db_metadata.notify_dbmetadata_counts_changed")
    @patch(
        "apps.datawarehouse.services.time_period.TimePeriodService.import_time_periods_from_xlsx_bytes"
    )
    def test_import_xlsx_success(self, mock_imp, _mock_notify, client):
        mock_imp.return_value = {"inserted": 2, "updated": 1, "skipped_empty_rows": 1}
        files = {
            "file": (
                "tp.xlsx",
                b"dummy",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        }
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/import",
            files=files,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "import completed" in (data.get("message") or "").lower()
        assert data["data"]["inserted"] == 2
        assert data["data"]["updated"] == 1
        mock_imp.assert_called_once()

    @patch(
        "apps.datawarehouse.services.time_period.TimePeriodService.import_time_periods_from_xlsx_bytes"
    )
    def test_import_xlsx_validation_error(self, mock_imp, client):
        mock_imp.side_effect = ValueError("No data rows to import")
        files = {
            "file": (
                "tp.xlsx",
                b"",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        }
        response = client.post(
            f"/dw/{TEST_WAREHOUSE_ID}/time-periods/import",
            files=files,
        )
        assert response.status_code == 422
        data = response.json()
        assert data["success"] is False
