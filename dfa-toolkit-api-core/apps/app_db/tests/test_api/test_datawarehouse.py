"""
Unit tests for System Datawarehouse API endpoints.
Uses mocked service to avoid DB and external connection dependency.
"""
import pytest
from unittest.mock import patch

from main import app
from apps.shared.middleware import auth_middleware
from apps.app_db.dependencies import get_current_user_id, get_scoped_dw_ids


def _override_get_scoped_dw_ids():
    """Bypass scoped-DW dependency for unit tests — super-admin (None = all DWs allowed)."""
    return None


def _override_current_user_id() -> int:
    return 1


@pytest.fixture(autouse=True)
def client(client_no_db, monkeypatch):
    """Use client without DB for datawarehouse API unit tests; bypass middleware auth."""
    # Treat every DW endpoint as PUBLIC so the middleware lets requests through
    monkeypatch.setattr(
        auth_middleware,
        "_matches_for_path",
        lambda _method, _path: [("DFA_DM", "PUBLIC", 1)],
    )
    app.dependency_overrides[get_scoped_dw_ids] = _override_get_scoped_dw_ids
    app.dependency_overrides[get_current_user_id] = _override_current_user_id
    yield client_no_db
    app.dependency_overrides.pop(get_scoped_dw_ids, None)
    app.dependency_overrides.pop(get_current_user_id, None)


BASE_PATH = "/dw"

MOCK_DW_CREATE_PAYLOAD = {
    "dw_connection_name": "Test DW",
    "db_source_type": "mysql",
    "db_host_address": "localhost",
    "db_user": "root",
    "db_password": "secret",
    "db_port": "3306",
    "db_database": "test_dw",
    "dw_default_language": "en",
    "is_active": True,
}


class TestCreateDatawarehouseRecordTestConnectionOnly:
    """Tests for POST /dw with test_connection_only flag."""

    @patch("apps.app_db.router.datawarehouse.service.test_datawarehouse_connection")
    def test_test_connection_only_success_returns_200_with_connected_true(
        self, mock_test_conn, client
    ):
        mock_test_conn.return_value = {"connected": True, "message": "Connection successful"}

        response = client.post(
            BASE_PATH,
            json=MOCK_DW_CREATE_PAYLOAD,
            params={"test_connection_only": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["connected"] is True
        assert data["data"]["message"] == "Connection successful"
        mock_test_conn.assert_called_once()

    @patch("apps.app_db.router.datawarehouse.service.test_datawarehouse_connection")
    def test_test_connection_only_failure_returns_200_with_connected_false_and_reason(
        self, mock_test_conn, client
    ):
        mock_test_conn.return_value = {
            "connected": False,
            "message": "Access denied for user 'root'@'localhost'",
        }

        response = client.post(
            BASE_PATH,
            json=MOCK_DW_CREATE_PAYLOAD,
            params={"test_connection_only": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["connected"] is False
        assert "Access denied" in data["data"]["message"]
        mock_test_conn.assert_called_once()

    @patch("apps.app_db.router.datawarehouse.service.test_datawarehouse_connection")
    @patch("apps.app_db.router.datawarehouse.service.create_datawarehouse")
    def test_create_record_validates_connection_first_and_returns_400_if_failed(
        self, mock_create, mock_test_conn, client
    ):
        mock_test_conn.return_value = {
            "connected": False,
            "message": "Could not connect to database",
        }

        response = client.post(
            BASE_PATH,
            json=MOCK_DW_CREATE_PAYLOAD,
            params={"test_connection_only": False},
        )

        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "Could not connect" in data.get("err_message", "")
        mock_test_conn.assert_called_once()
        mock_create.assert_not_called()

    @patch("apps.app_db.router.datawarehouse.dw_optimizer.perform_full_optimize")
    @patch("apps.app_db.router.datawarehouse.service.test_datawarehouse_connection")
    @patch("apps.app_db.router.datawarehouse.service.create_datawarehouse")
    def test_create_record_when_connection_ok_creates_and_returns_201(
        self, mock_create, mock_test_conn, mock_optimize, client
    ):
        mock_test_conn.return_value = {"connected": True, "message": "Connection successful"}
        mock_create.return_value = {
            "id": 1,
            "dw_connection_name": "Test DW",
            "db_database": "test_dw",
        }
        mock_optimize.return_value = {"success": True}

        response = client.post(
            BASE_PATH,
            json=MOCK_DW_CREATE_PAYLOAD,
            params={"test_connection_only": False},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["id"] == 1
        mock_test_conn.assert_called_once()
        mock_create.assert_called_once()
        mock_optimize.assert_called_once_with(
            dw_id=1,
            do_configuration_sync=True,
            do_ensure_default_workflow=True,
            default_workflow_created_user_id=1,
        )

    @patch("apps.app_db.router.datawarehouse.dw_optimizer.perform_full_optimize")
    @patch("apps.app_db.router.datawarehouse.service.test_datawarehouse_connection")
    @patch("apps.app_db.router.datawarehouse.service.create_datawarehouse")
    def test_create_record_returns_400_when_optimize_fails(
        self, mock_create, mock_test_conn, mock_optimize, client
    ):
        mock_test_conn.return_value = {"connected": True, "message": "Connection successful"}
        mock_create.return_value = {"id": 99, "dw_connection_name": "Test DW", "db_database": "test_dw"}
        mock_optimize.return_value = {"success": False, "message": "Unsupported database source type"}

        response = client.post(
            BASE_PATH,
            json=MOCK_DW_CREATE_PAYLOAD,
            params={"test_connection_only": False},
        )

        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        mock_optimize.assert_called_once_with(
            dw_id=99,
            do_configuration_sync=True,
            do_ensure_default_workflow=True,
            default_workflow_created_user_id=1,
        )


class TestOptimizeEndpoints:
    """Tests for POST /dw/{dw_id}/optimize (single merged API with optional body)."""

    @patch("apps.app_db.router.datawarehouse.dw_optimizer.perform_full_optimize")
    def test_optimize_full_success(self, mock_optimize, client):
        mock_optimize.return_value = {"success": True, "lowercase": {}, "indexes": {}}
        response = client.post(f"{BASE_PATH}/1/optimize")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        mock_optimize.assert_called_once_with(dw_id=1)

    @patch("apps.app_db.router.datawarehouse.dw_optimizer.perform_full_optimize")
    def test_optimize_full_failure_returns_400(self, mock_optimize, client):
        mock_optimize.return_value = {"success": False, "message": "Optimize failed"}
        response = client.post(f"{BASE_PATH}/1/optimize")
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False

    @patch("apps.app_db.router.datawarehouse.dw_optimizer.perform_full_optimize")
    def test_optimize_normalize_table_and_column_names_only_success(self, mock_optimize, client):
        mock_optimize.return_value = {"success": True, "normalize_table_and_column_names": {"tables_renamed": 0, "columns_renamed": 0}}
        response = client.post(
            f"{BASE_PATH}/1/optimize",
            json={"normalize_table_and_column_names": True, "create_search_tables": False},
        )
        assert response.status_code == 200
        mock_optimize.assert_called_once_with(
            dw_id=1,
            do_normalize_table_and_column_names=True,
            do_ensure_primary_keys=False,
            do_rebuild_indexes=False,
            rebuild_indexes_after_reset=False,
            do_seed_system_initial_defaults=False,
            do_validate_sync_new_columns=False,
            do_validate_sync_new_tables=False,
            do_normalize_subgroup_display_orders=False,
            do_enforce_fk_referential_integrity=False,
            do_ensure_default_subgroup=False,
            do_sync_dw_stats_counts=False,
            do_configuration_sync=False,
            do_create_search_tables=False,
        )

    @patch("apps.app_db.router.datawarehouse.dw_optimizer.perform_full_optimize")
    def test_optimize_sync_dw_stats_counts_only_success(self, mock_optimize, client):
        mock_optimize.return_value = {"success": True, "sync_dw_stats_counts": {"success": True, "dw_id": 1}}
        response = client.post(
            f"{BASE_PATH}/1/optimize",
            json={"sync_dw_stats_counts": True, "create_search_tables": False},
        )
        assert response.status_code == 200
        mock_optimize.assert_called_once_with(
            dw_id=1,
            do_normalize_table_and_column_names=False,
            do_ensure_primary_keys=False,
            do_rebuild_indexes=False,
            rebuild_indexes_after_reset=False,
            do_seed_system_initial_defaults=False,
            do_validate_sync_new_columns=False,
            do_validate_sync_new_tables=False,
            do_normalize_subgroup_display_orders=False,
            do_enforce_fk_referential_integrity=False,
            do_ensure_default_subgroup=False,
            do_sync_dw_stats_counts=True,
            do_configuration_sync=False,
            do_create_search_tables=False,
        )

    @patch("apps.app_db.router.datawarehouse.dw_optimizer.perform_full_optimize")
    def test_optimize_configuration_sync_only_success(self, mock_optimize, client):
        mock_optimize.return_value = {
            "success": True,
            "configuration_sync": {
                "rows_inserted": 6,
                "rows_skipped_existing": 0,
                "rows_upserted": 6,
            },
        }
        response = client.post(
            f"{BASE_PATH}/1/optimize",
            json={"configuration_sync": True, "create_search_tables": False},
        )
        assert response.status_code == 200
        mock_optimize.assert_called_once_with(
            dw_id=1,
            do_normalize_table_and_column_names=False,
            do_ensure_primary_keys=False,
            do_rebuild_indexes=False,
            rebuild_indexes_after_reset=False,
            do_seed_system_initial_defaults=False,
            do_validate_sync_new_columns=False,
            do_validate_sync_new_tables=False,
            do_normalize_subgroup_display_orders=False,
            do_enforce_fk_referential_integrity=False,
            do_ensure_default_subgroup=False,
            do_sync_dw_stats_counts=False,
            do_configuration_sync=True,
            do_create_search_tables=False,
        )

    @patch("apps.app_db.router.datawarehouse.dw_optimizer.perform_full_optimize")
    def test_optimize_create_search_tables_only_success(self, mock_optimize, client):
        mock_optimize.return_value = {
            "success": True,
            "create_search_tables": {
                "success": True,
                "dw_id": "1",
                "tables_created": True,
                "statements_executed": 3,
            },
        }
        response = client.post(f"{BASE_PATH}/1/optimize", json={"create_search_tables": True})
        assert response.status_code == 200
        mock_optimize.assert_called_once_with(
            dw_id=1,
            do_normalize_table_and_column_names=False,
            do_ensure_primary_keys=False,
            do_rebuild_indexes=False,
            rebuild_indexes_after_reset=False,
            do_seed_system_initial_defaults=False,
            do_validate_sync_new_columns=False,
            do_validate_sync_new_tables=False,
            do_normalize_subgroup_display_orders=False,
            do_enforce_fk_referential_integrity=False,
            do_ensure_default_subgroup=False,
            do_sync_dw_stats_counts=False,
            do_configuration_sync=False,
            do_create_search_tables=True,
        )
