"""Unit tests for ensure_search_tables (shared search table provisioning)."""
from unittest.mock import MagicMock, patch

from apps.datawarehouse.services.search_index.search_tables import (
    ensure_search_tables,
    search_tables_exist,
)


class TestSearchTablesExist:
    def test_returns_true_when_probe_table_present(self):
        dw_db = MagicMock()
        dw_db.execute.return_value.scalar.return_value = 1
        assert search_tables_exist(dw_db) is True

    def test_returns_false_when_probe_table_missing(self):
        dw_db = MagicMock()
        dw_db.execute.return_value.scalar.return_value = 0
        assert search_tables_exist(dw_db) is False


class TestEnsureSearchTables:
    @patch(
        "apps.datawarehouse.services.search_index.search_tables.apply_search_schema_ddl"
    )
    @patch(
        "apps.datawarehouse.services.search_index.search_tables.get_warehouse_session_from_id"
    )
    @patch(
        "apps.datawarehouse.services.search_index.search_tables.credentials_to_schema"
    )
    @patch(
        "apps.datawarehouse.services.search_index.search_tables.get_warehouse_credentials"
    )
    def test_skips_ddl_when_tables_already_exist(
        self,
        mock_credentials,
        mock_to_schema,
        mock_session_ctx,
        mock_apply_ddl,
    ):
        mock_credentials.return_value = {"db_source_type": "mysql"}
        mock_schema = MagicMock()
        mock_to_schema.return_value = mock_schema

        mock_dw_db = MagicMock()
        mock_dw_db.execute.return_value.scalar.return_value = 1
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_dw_db)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session_ctx.return_value = mock_session

        result = ensure_search_tables(1)

        assert result["success"] is True
        assert result["tables_created"] is False
        assert result["statements_executed"] == 0
        mock_apply_ddl.assert_not_called()

    @patch(
        "apps.datawarehouse.services.search_index.search_tables.apply_search_schema_ddl"
    )
    @patch(
        "apps.datawarehouse.services.search_index.search_tables.get_warehouse_session_from_id"
    )
    @patch(
        "apps.datawarehouse.services.search_index.search_tables.credentials_to_schema"
    )
    @patch(
        "apps.datawarehouse.services.search_index.search_tables.get_warehouse_credentials"
    )
    def test_runs_ddl_when_tables_missing(
        self,
        mock_credentials,
        mock_to_schema,
        mock_session_ctx,
        mock_apply_ddl,
    ):
        mock_credentials.return_value = {"db_source_type": "mysql"}
        mock_to_schema.return_value = MagicMock()
        mock_apply_ddl.return_value = 3

        mock_dw_db = MagicMock()
        mock_dw_db.execute.return_value.scalar.return_value = 0
        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_dw_db)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session_ctx.return_value = mock_session

        result = ensure_search_tables("42")

        assert result["success"] is True
        assert result["tables_created"] is True
        assert result["statements_executed"] == 3
        mock_apply_ddl.assert_called_once()
