"""Unit tests for refresh JWT helpers."""
import pytest
from fastapi import HTTPException

from apps.shared.config.security import (
    create_refresh_token,
    decode_refresh_token,
    decode_token,
)


def test_refresh_jwt_roundtrip_sub():
    token = create_refresh_token(99)
    payload = decode_refresh_token(token)
    assert int(payload["sub"]) == 99


def test_access_decode_rejects_refresh_token():
    token = create_refresh_token(1)
    with pytest.raises(HTTPException) as exc:
        decode_token(token)
    assert exc.value.status_code == 401
