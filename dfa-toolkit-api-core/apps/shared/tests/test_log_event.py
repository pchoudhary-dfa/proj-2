"""Tests for resolve_log_level, log_event DB gate, and error_message formatting."""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from apps.shared.utils.log_body import serialize_body_for_log, serialize_headers_for_log
from apps.shared.utils.log_event import log_background_incident, log_event, write_log_to_db
from apps.shared.utils.log_payload import (
    build_log_payload,
    format_db_error_message,
    resolve_log_level,
)


def _fake_request(*, path: str = "/x", query: str = "", state: dict | None = None):
    """Build a duck-typed request that exposes only what build_log_payload reads."""
    state_obj = SimpleNamespace(**(state or {}))
    headers = {}
    return SimpleNamespace(
        url=SimpleNamespace(path=path, query=query),
        method="POST",
        state=state_obj,
        headers=headers,
    )


@pytest.mark.parametrize(
    "status,expected",
    [
        (500, "ERROR"),
        (503, "ERROR"),
        (401, "WARNING"),
        (403, "WARNING"),
        (429, "WARNING"),
        (400, "INFO"),
        (404, "INFO"),
        (422, "INFO"),
    ],
)
def test_resolve_log_level(status: int, expected: str) -> None:
    assert resolve_log_level(status) == expected


def test_format_db_error_message_prefix() -> None:
    assert format_db_error_message("oops", "E_CODE") == "[E_CODE] oops"
    assert format_db_error_message("x", None) == "x"


@patch("apps.shared.utils.log_event.write_log_to_db")
def test_log_event_skips_db_when_level_not_configured(mock_write) -> None:
    payload = {
        "request_id": None,
        "path": None,
        "method": None,
        "user_id": None,
        "dw_id": None,
        "status_code": 500,
        "level": "ERROR",
        "message": "m",
        "error_code": "X",
        "stack_trace": None,
        "identifier": None,
        "source": None,
        "logger_name": "test",
        "module": "m",
        "submodule": "s",
        "error_type": None,
        "error_message": None,
    }
    with patch("apps.shared.utils.log_event._parsed_db_levels", return_value=set()):
        log_event(dict(payload), exc=ValueError("v"))
    mock_write.assert_not_called()


@patch("apps.shared.utils.log_event.write_log_to_db")
def test_log_event_writes_db_when_level_allowed(mock_write) -> None:
    payload = {
        "request_id": None,
        "path": None,
        "method": None,
        "user_id": None,
        "dw_id": None,
        "status_code": 500,
        "level": "ERROR",
        "message": "m",
        "error_code": "X",
        "stack_trace": None,
        "identifier": None,
        "source": None,
        "logger_name": "test",
        "module": "m",
        "submodule": "s",
        "error_type": None,
        "error_message": None,
    }
    with patch("apps.shared.utils.log_event._parsed_db_levels", return_value={"ERROR"}):
        log_event(dict(payload), exc=None)
    mock_write.assert_called_once()


@patch("apps.shared.utils.log_event.write_log_to_db")
def test_log_background_incident(mock_write) -> None:
    with patch("apps.shared.utils.log_event._parsed_db_levels", return_value={"ERROR"}):
        log_background_incident("bg fail", error_code="BG", exc=RuntimeError("r"), source="t.unit")
    mock_write.assert_called_once()
    call_arg = mock_write.call_args[0][0]
    assert call_arg.get("message") == "bg fail"
    assert call_arg.get("error_code") == "BG"
    assert call_arg.get("error_type") == "RuntimeError"


def test_write_log_to_db_builds_prefixed_error_message() -> None:
    payload = {
        "request_id": None,
        "user_id": None,
        "dw_id": None,
        "method": "GET",
        "path": "/x",
        "status_code": 500,
        "level": "ERROR",
        "module": "mod",
        "submodule": "sub",
        "identifier": None,
        "message": "hello",
        "error_code": "E1",
        "error_type": "RuntimeError",
        "stack_trace": None,
    }
    with patch("apps.app_db.db.core.SessionLocal") as mock_sl:
        mock_db = mock_sl.return_value.__enter__.return_value
        write_log_to_db(payload)
        mock_db.add.assert_called_once()
        entry = mock_db.add.call_args[0][0]
        assert entry.error_message.startswith("[E1] hello")
        assert not hasattr(entry, "action")
        assert not hasattr(entry, "request_id")
        assert not hasattr(entry, "error_type")


# ---------------------------------------------------------------------------
# Request body redaction
# ---------------------------------------------------------------------------


def test_serialize_body_for_log_returns_none_when_empty() -> None:
    assert serialize_body_for_log(None) is None
    assert serialize_body_for_log(b"") is None


def test_serialize_body_for_log_redacts_top_level_keys() -> None:
    raw = json.dumps({"username": "alice", "password": "hunter2"}).encode()
    out = serialize_body_for_log(raw)
    decoded = json.loads(out)
    assert decoded == {"username": "alice", "password": "***"}


def test_serialize_body_for_log_redacts_nested_dw_credentials() -> None:
    raw = json.dumps(
        {
            "name": "Test DW",
            "dw_connection_details": {
                "db_host": "db.local",
                "db_user": "root",
                "db_password": "supersecret",
            },
        }
    ).encode()
    out = serialize_body_for_log(raw)
    decoded = json.loads(out)
    assert decoded["dw_connection_details"]["db_password"] == "***"
    assert decoded["dw_connection_details"]["db_user"] == "***"
    assert decoded["dw_connection_details"]["db_host"] == "db.local"


def test_serialize_body_for_log_redacts_inside_lists() -> None:
    raw = json.dumps({"items": [{"api_key": "k1"}, {"api_key": "k2"}]}).encode()
    out = serialize_body_for_log(raw)
    decoded = json.loads(out)
    assert decoded == {"items": [{"api_key": "***"}, {"api_key": "***"}]}


def test_serialize_body_for_log_invalid_json_returns_truncated_text() -> None:
    raw = b"not-json-just-text"
    assert serialize_body_for_log(raw) == "not-json-just-text"


def test_serialize_body_for_log_invalid_json_truncates_when_oversize() -> None:
    raw = b"x" * 200
    out = serialize_body_for_log(raw, max_bytes=50)
    assert out is not None
    assert out.endswith("...[truncated]")
    assert len(out) <= 50


def test_serialize_body_for_log_non_utf8_marker() -> None:
    raw = b"\xff\xfe\xfd"
    assert serialize_body_for_log(raw) == f"<non-utf8 {len(raw)} bytes>"


def test_serialize_body_for_log_caps_large_json() -> None:
    raw = json.dumps({"k": "x" * 100}).encode()
    out = serialize_body_for_log(raw, max_bytes=40)
    assert out is not None
    assert out.endswith("...[truncated]")
    assert len(out) <= 40


# ---------------------------------------------------------------------------
# build_log_payload: path-with-query + cached_body wiring
# ---------------------------------------------------------------------------


def test_build_log_payload_path_includes_query_string() -> None:
    request = _fake_request(path="/dw/3/areas", query="keyword=foo&page=2")
    payload = build_log_payload(
        request=request,
        status_code=500,
        level="ERROR",
        message="boom",
        error_code="X",
    )
    assert payload["path"] == "/dw/3/areas?keyword=foo&page=2"
    assert payload["request_body"] is None


def test_build_log_payload_no_query_string_keeps_bare_path() -> None:
    request = _fake_request(path="/dw/3/areas", query="")
    payload = build_log_payload(
        request=request,
        status_code=500,
        level="ERROR",
        message="boom",
        error_code="X",
    )
    assert payload["path"] == "/dw/3/areas"
    assert "?" not in payload["path"]
    assert payload["request_body"] is None


def test_build_log_payload_reads_cached_body_and_redacts() -> None:
    body = json.dumps({"name": "x", "password": "hunter2"}).encode()
    request = _fake_request(
        path="/auth/login",
        query="",
        state={"cached_body": body},
    )
    payload = build_log_payload(
        request=request,
        status_code=422,
        level="INFO",
        message="validation failed",
        error_code="VALIDATION_ERROR",
    )
    assert payload["request_body"] is not None
    decoded = json.loads(payload["request_body"])
    assert decoded == {"name": "x", "password": "***"}


def test_write_log_to_db_persists_request_body_and_truncates_path() -> None:
    long_path = "/dw/3/areas?" + "k=v&" * 400  # well beyond 1024 chars
    payload = {
        "request_id": None,
        "user_id": None,
        "dw_id": None,
        "method": "POST",
        "path": long_path,
        "status_code": 500,
        "level": "ERROR",
        "module": "mod",
        "submodule": "sub",
        "identifier": None,
        "message": "hello",
        "error_code": "E1",
        "error_type": "RuntimeError",
        "stack_trace": None,
        "request_body": '{"x":"y","password":"***"}',
    }
    with patch("apps.app_db.db.core.SessionLocal") as mock_sl:
        mock_db = mock_sl.return_value.__enter__.return_value
        write_log_to_db(payload)
        entry = mock_db.add.call_args[0][0]
        assert entry.path is not None
        assert len(entry.path) <= 1024
        assert entry.request_body == '{"x":"y","password":"***"}'


def test_write_log_to_db_null_request_body_when_missing() -> None:
    payload = {
        "request_id": None,
        "user_id": None,
        "dw_id": None,
        "method": "GET",
        "path": "/x",
        "status_code": 500,
        "level": "ERROR",
        "module": "mod",
        "submodule": "sub",
        "identifier": None,
        "message": "hi",
        "error_code": "E1",
        "error_type": "RuntimeError",
        "stack_trace": None,
    }
    with patch("apps.app_db.db.core.SessionLocal") as mock_sl:
        mock_db = mock_sl.return_value.__enter__.return_value
        write_log_to_db(payload)
        entry = mock_db.add.call_args[0][0]
        assert entry.request_body is None


# ---------------------------------------------------------------------------
# Request headers capture
# ---------------------------------------------------------------------------


def test_serialize_headers_for_log_returns_none_when_empty() -> None:
    assert serialize_headers_for_log(None) is None
    assert serialize_headers_for_log([]) is None


def test_serialize_headers_for_log_accepts_bytes_tuples() -> None:
    headers = [
        (b"host", b"localhost:8000"),
        (b"user-agent", b"Mozilla/5.0"),
        (b"content-type", b"application/json"),
    ]
    out = serialize_headers_for_log(headers)
    assert out is not None
    decoded = json.loads(out)
    assert decoded == {
        "host": "localhost:8000",
        "user-agent": "Mozilla/5.0",
        "content-type": "application/json",
    }


def test_serialize_headers_for_log_accepts_str_tuples() -> None:
    headers = [("host", "localhost"), ("accept", "application/json")]
    out = serialize_headers_for_log(headers)
    assert json.loads(out) == {"host": "localhost", "accept": "application/json"}


def test_serialize_headers_for_log_lowercases_names() -> None:
    headers = [(b"Host", b"localhost"), (b"USER-AGENT", b"curl/8")]
    out = serialize_headers_for_log(headers)
    decoded = json.loads(out)
    assert "host" in decoded and "user-agent" in decoded
    assert "Host" not in decoded
    assert "USER-AGENT" not in decoded


def test_serialize_headers_for_log_latin1_decodes_values() -> None:
    # 0xE9 is "é" in latin-1, invalid as UTF-8 leading byte. latin-1 always succeeds.
    headers = [(b"x-custom", b"caf\xe9")]
    out = serialize_headers_for_log(headers)
    decoded = json.loads(out)
    assert decoded["x-custom"] == "café"


def test_serialize_headers_for_log_joins_duplicates_with_comma_space() -> None:
    headers = [
        (b"accept-encoding", b"gzip"),
        (b"accept-encoding", b"deflate"),
        (b"accept-encoding", b"br"),
    ]
    out = serialize_headers_for_log(headers)
    decoded = json.loads(out)
    assert decoded["accept-encoding"] == "gzip, deflate, br"


def test_serialize_headers_for_log_preserves_sensitive_verbatim() -> None:
    """No redaction: Authorization, X-Api-Key, Cookie must appear verbatim."""
    headers = [
        (b"authorization", b"Bearer eyJhbGci.payload.sig"),
        (b"x-api-key", b"dfa_dm_fed_app"),
        (b"cookie", b"session=abc123; theme=dark"),
    ]
    out = serialize_headers_for_log(headers)
    decoded = json.loads(out)
    assert decoded["authorization"] == "Bearer eyJhbGci.payload.sig"
    assert decoded["x-api-key"] == "dfa_dm_fed_app"
    assert decoded["cookie"] == "session=abc123; theme=dark"
    # Explicit anti-redaction assertion: no value contains "***".
    assert "***" not in out


def test_serialize_headers_for_log_caps_oversized_output() -> None:
    # Build a single header value large enough to overflow the 16384-byte cap.
    big_value = "x" * 20000
    headers = [(b"x-huge", big_value.encode("latin-1"))]
    out = serialize_headers_for_log(headers)
    assert out is not None
    assert out.endswith("...[truncated]")
    assert len(out) <= 16384


def test_serialize_headers_for_log_skips_malformed_items() -> None:
    headers = [
        (b"host", b"localhost"),
        None,
        ("only-one",),  # not a 2-tuple
        (b"accept", b"*/*"),
    ]
    out = serialize_headers_for_log(headers)
    decoded = json.loads(out)
    assert decoded == {"host": "localhost", "accept": "*/*"}


# ---------------------------------------------------------------------------
# build_log_payload + DB persistence wiring for request_headers
# ---------------------------------------------------------------------------


def test_build_log_payload_serializes_cached_headers() -> None:
    request = _fake_request(
        path="/x",
        query="",
        state={
            "cached_headers": [
                (b"host", b"localhost"),
                (b"authorization", b"Bearer abc"),
            ],
        },
    )
    payload = build_log_payload(
        request=request,
        status_code=500,
        level="ERROR",
        message="boom",
        error_code="X",
    )
    assert payload["request_headers"] is not None
    decoded = json.loads(payload["request_headers"])
    assert decoded == {"host": "localhost", "authorization": "Bearer abc"}


def test_build_log_payload_request_headers_none_when_absent() -> None:
    request = _fake_request(path="/x", query="")
    payload = build_log_payload(
        request=request,
        status_code=500,
        level="ERROR",
        message="boom",
        error_code="X",
    )
    assert payload["request_headers"] is None


def test_write_log_to_db_persists_request_headers() -> None:
    payload = {
        "request_id": None,
        "user_id": None,
        "dw_id": None,
        "method": "GET",
        "path": "/x",
        "status_code": 500,
        "level": "ERROR",
        "module": "mod",
        "submodule": "sub",
        "identifier": None,
        "message": "hi",
        "error_code": "E1",
        "error_type": "RuntimeError",
        "stack_trace": None,
        "request_headers": '{"host":"localhost","x-api-key":"k"}',
    }
    with patch("apps.app_db.db.core.SessionLocal") as mock_sl:
        mock_db = mock_sl.return_value.__enter__.return_value
        write_log_to_db(payload)
        entry = mock_db.add.call_args[0][0]
        assert entry.request_headers == '{"host":"localhost","x-api-key":"k"}'


def test_write_log_to_db_request_headers_truncated_to_text_cap() -> None:
    huge = '{"x":"' + ("y" * 100000) + '"}'
    payload = {
        "request_id": None,
        "user_id": None,
        "dw_id": None,
        "method": "GET",
        "path": "/x",
        "status_code": 500,
        "level": "ERROR",
        "module": "mod",
        "submodule": "sub",
        "identifier": None,
        "message": "hi",
        "error_code": "E1",
        "error_type": "RuntimeError",
        "stack_trace": None,
        "request_headers": huge,
    }
    with patch("apps.app_db.db.core.SessionLocal") as mock_sl:
        mock_db = mock_sl.return_value.__enter__.return_value
        write_log_to_db(payload)
        entry = mock_db.add.call_args[0][0]
        assert entry.request_headers is not None
        assert len(entry.request_headers) <= 65000
