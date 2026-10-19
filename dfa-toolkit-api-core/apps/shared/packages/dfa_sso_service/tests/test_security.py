"""Tests for SSO URL validation and issuer checks."""
import pytest

from apps.shared.packages.dfa_sso_service.core.claims import SsoClaimError
from apps.shared.packages.dfa_sso_service.core.errors import SsoConfigError
from apps.shared.packages.dfa_sso_service.core.security import (
    decode_sso_flow_state,
    encode_sso_flow_state,
    validate_redirect_url,
    validate_return_to,
    validate_well_known_uri,
)
from apps.shared.packages.dfa_sso_service.core.service import SsoService


def test_validate_redirect_url_accepts_https():
    assert (
        validate_redirect_url("https://app.example.com/auth/sso/callback")
        == "https://app.example.com/auth/sso/callback"
    )


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "data:text/html,hi",
        "//evil.com/callback",
        "https://user:pass@example.com/callback",
        "https://example.com/callback#frag",
    ],
)
def test_validate_redirect_url_rejects_unsafe(url):
    with pytest.raises(SsoConfigError):
        validate_redirect_url(url)


def test_sso_flow_state_round_trip_with_return_to():
    key = "test-signing-key"
    state = encode_sso_flow_state(key, "DFA_DM", "/en/1/overview")
    decoded = decode_sso_flow_state(key, state)
    assert decoded is not None
    assert decoded["ak"] == "DFA_DM"
    assert decoded["rt"] == "/en/1/overview"


def test_sso_flow_state_rejects_tampered_signature():
    state = encode_sso_flow_state("key-a", "DFA_DM", "/en/1/overview")
    assert decode_sso_flow_state("key-b", state) is None


def test_validate_return_to_accepts_relative_path_with_query():
    assert (
        validate_return_to("/en/dw/5/indicators?x=1")
        == "/en/dw/5/indicators?x=1"
    )


@pytest.mark.parametrize(
    "path",
    [
        "",
        "//evil.com/path",
        "https://evil.com/path",
        "/en/auth?route=signin",
        "/en/auth/sso/callback",
        "javascript:alert(1)",
        "/en/page#frag",
        "/en/user@evil.com",
    ],
)
def test_validate_return_to_rejects_unsafe(path):
    with pytest.raises(SsoConfigError):
        validate_return_to(path)


def test_validate_well_known_uri_rejects_private_scheme():
    with pytest.raises(SsoConfigError, match="http or https"):
        validate_well_known_uri("file:///etc/passwd")


def test_validate_well_known_uri_rejects_http_non_localhost():
    with pytest.raises(SsoConfigError, match="https except"):
        validate_well_known_uri("http://192.168.1.1/.well-known/openid-configuration")


def test_validate_issuer_requires_iss_when_expected_set():
    with pytest.raises(SsoClaimError, match="missing required 'iss'"):
        SsoService.validate_issuer({}, "https://idp.example.com")


def test_validate_issuer_mismatch():
    with pytest.raises(SsoClaimError, match="issuer mismatch"):
        SsoService.validate_issuer(
            {"iss": "https://evil.example.com"},
            "https://idp.example.com",
        )


def test_validate_issuer_match():
    SsoService.validate_issuer(
        {"iss": "https://idp.example.com/"},
        "https://idp.example.com",
    )
