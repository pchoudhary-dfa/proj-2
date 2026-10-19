"""Tests for apps.shared.utils.connection_errors.is_connection_error."""

import pytest

from apps.shared.utils.connection_errors import is_connection_error


def test_connection_refused_plain_exception_still_detected():
    assert is_connection_error(RuntimeError("[Errno 61] Connection refused")) is True


@pytest.mark.parametrize(
    "module_name",
    [
        "kombu.exceptions",
        "celery.backends.rpc",
        "amqp.connection",
    ],
)
def test_broker_like_modules_not_treated_as_db_connection_error(module_name):
    class BrokerErr(Exception):
        pass

    BrokerErr.__module__ = module_name
    exc = BrokerErr("[Errno 61] Connection refused")
    assert is_connection_error(exc) is False
