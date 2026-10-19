"""Unit tests for log list filter detection helpers."""
from datetime import datetime, timezone

from apps.app_db.services.log_service import (
    server_errors_has_list_filters,
    transactions_has_list_filters,
)


def test_server_errors_has_list_filters_false_when_empty():
    assert server_errors_has_list_filters() is False


def test_server_errors_has_list_filters_user_id_zero():
    assert server_errors_has_list_filters(user_id=0) is True


def test_server_errors_has_list_filters_status_code_zero():
    assert server_errors_has_list_filters(status_code=0) is True


def test_server_errors_has_list_filters_search_requires_search_by():
    assert server_errors_has_list_filters(search="err") is False
    assert server_errors_has_list_filters(search="err", search_by="path") is True


def test_server_errors_has_list_filters_date_range():
    dt = datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert server_errors_has_list_filters(from_date=dt) is True


def test_transactions_has_list_filters_false_when_empty():
    assert transactions_has_list_filters() is False


def test_transactions_has_list_filters_dw_id_zero():
    assert transactions_has_list_filters(dw_id=0) is True


def test_transactions_has_list_filters_action_and_search():
    assert transactions_has_list_filters(action="CREATE") is True
    assert transactions_has_list_filters(search="x", search_by="module") is True
