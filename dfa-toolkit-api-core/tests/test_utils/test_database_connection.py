"""
Unit tests for shared database_connection utilities.
"""
import pytest
from unittest.mock import patch, MagicMock
from contextlib import contextmanager

from apps.app_db.schemas.core import DatabaseSource
from apps.shared.utils.database_connection import verify_connection_with_result


@contextmanager
def _mock_connection_ok():
    yield MagicMock()


class TestVerifyConnectionWithResult:
    """Tests for verify_connection_with_result."""

    @patch("apps.shared.utils.database_connection.create_mysql_connection")
    def test_mysql_success_returns_connected_true_and_message(
        self, mock_create_mysql
    ):
        mock_create_mysql.return_value = _mock_connection_ok()

        result = verify_connection_with_result(
            db_source=DatabaseSource.MYSQL,
            host="localhost",
            port=3306,
            user="root",
            password="secret",
            database="test_db",
        )

        assert result["connected"] is True
        assert result["message"] == "Connection successful"
        mock_create_mysql.assert_called_once_with(
            "localhost", 3306, "root", "secret", "test_db"
        )

    @patch("apps.shared.utils.database_connection.create_postgresql_connection")
    def test_postgresql_success_returns_connected_true_and_message(
        self, mock_create_pg
    ):
        mock_create_pg.return_value = _mock_connection_ok()

        result = verify_connection_with_result(
            db_source=DatabaseSource.POSTGRESQL,
            host="localhost",
            port=5432,
            user="postgres",
            password="secret",
            database="test_db",
        )

        assert result["connected"] is True
        assert result["message"] == "Connection successful"
        mock_create_pg.assert_called_once_with(
            "localhost", 5432, "postgres", "secret", "test_db"
        )

    @patch("apps.shared.utils.database_connection.create_mysql_connection")
    def test_connection_failure_returns_connected_false_and_error_message(
        self, mock_create_mysql
    ):
        mock_create_mysql.side_effect = Exception("Access denied for user")

        result = verify_connection_with_result(
            db_source=DatabaseSource.MYSQL,
            host="localhost",
            port=3306,
            user="root",
            password="wrong",
            database="test_db",
        )

        assert result["connected"] is False
        assert result["message"] == "Access denied for user"
        mock_create_mysql.assert_called_once()
