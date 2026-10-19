"""
SSO URL validation — redirect targets and OIDC discovery fetch guards.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import json
import re
import secrets
import socket
from urllib.parse import urlparse

from .errors import SsoConfigError

_RETURN_TO_MAX_LEN = 2048
_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")

_BLOCKED_DISCOVERY_HOSTS = frozenset(
    {
        "metadata.google.internal",
        "metadata",
    }
)


def _hostname_resolves_to_blocked_ip(hostname: str) -> bool:
    """Return True when any resolved address is private, loopback, link-local, or reserved."""
    if hostname.lower() in _BLOCKED_DISCOVERY_HOSTS:
        return True
    try:
        for family, _, _, _, sockaddr in socket.getaddrinfo(
            hostname, None, type=socket.SOCK_STREAM
        ):
            if family not in (socket.AF_INET, socket.AF_INET6):
                continue
            addr = sockaddr[0]
            ip = ipaddress.ip_address(addr)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
            ):
                return True
    except socket.gaierror as exc:
        raise SsoConfigError(
            f"Cannot resolve discovery host '{hostname}': {exc}"
        ) from exc
    return False


def _is_localhost_hostname(hostname: str) -> bool:
    h = hostname.lower().rstrip(".")
    return h in ("localhost", "127.0.0.1", "::1") or h.endswith(".localhost")


def validate_well_known_uri(url: str) -> str:
    """
    Validate an admin-supplied OIDC discovery URL before server-side fetch.

    Allows ``http`` only for localhost-style hosts; otherwise requires ``https``.
  Blocks private/link-local resolved addresses (SSRF mitigation).
    """
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in ("http", "https"):
        raise SsoConfigError(
            "well_known_uri must use http or https scheme"
        )
    if not parsed.hostname:
        raise SsoConfigError("well_known_uri must include a valid hostname")
    if parsed.username or parsed.password:
        raise SsoConfigError("well_known_uri must not include credentials")
    if parsed.scheme == "http" and not _is_localhost_hostname(parsed.hostname):
        raise SsoConfigError(
            "well_known_uri must use https except for localhost development hosts"
        )
    if _hostname_resolves_to_blocked_ip(parsed.hostname):
        raise SsoConfigError(
            "well_known_uri resolves to a disallowed network address"
        )
    return url.strip()


def validate_redirect_url(url: str) -> str:
    """
    Validate a browser redirect target before issuing ``RedirectResponse``.

    Only ``http`` and ``https`` are allowed; hostname is required.
    """
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in ("http", "https"):
        raise SsoConfigError(
            "SSO callback URL must use http or https scheme"
        )
    if not parsed.netloc or not parsed.hostname:
        raise SsoConfigError("SSO callback URL must include a valid host")
    if parsed.username or parsed.password:
        raise SsoConfigError("SSO callback URL must not include credentials")
    if parsed.fragment:
        raise SsoConfigError("SSO callback URL must not include a fragment")
    return url.strip()


_SSO_FLOW_STATE_SIG_LEN = 16


def encode_sso_flow_state(
    signing_key: str,
    app_key: str,
    return_to: str | None = None,
) -> str:
    """
    Build a signed OAuth ``state`` value carrying app_key and optional return_to.

    Round-trips through the IdP so warehouse context survives if session keys are lost.
    """
    payload: dict[str, str] = {
        "ak": app_key,
        "n": secrets.token_urlsafe(12),
    }
    if return_to:
        payload["rt"] = return_to
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(
        signing_key.encode("utf-8"), raw, hashlib.sha256
    ).digest()[:_SSO_FLOW_STATE_SIG_LEN]
    return base64.urlsafe_b64encode(raw + sig).decode("ascii").rstrip("=")


def decode_sso_flow_state(signing_key: str, state: str) -> dict[str, str] | None:
    """Verify and parse a signed SSO flow state; returns None when invalid."""
    if not signing_key or not state:
        return None
    try:
        padded = state + "=" * (-len(state) % 4)
        blob = base64.urlsafe_b64decode(padded.encode("ascii"))
        if len(blob) <= _SSO_FLOW_STATE_SIG_LEN:
            return None
        raw, sig = blob[:-_SSO_FLOW_STATE_SIG_LEN], blob[-_SSO_FLOW_STATE_SIG_LEN:]
        expected = hmac.new(
            signing_key.encode("utf-8"), raw, hashlib.sha256
        ).digest()[:_SSO_FLOW_STATE_SIG_LEN]
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("ak"), str):
            return None
        return {k: v for k, v in data.items() if isinstance(v, str)}
    except Exception:
        return None


def validate_return_to(path: str) -> str:
    """
    Validate an in-app relative return path before storing in SSO session.

    Only same-origin relative paths are allowed (open-redirect mitigation).
    """
    raw = (path or "").strip()
    if not raw:
        raise SsoConfigError("return_to must be a non-empty relative path")
    if len(raw) > _RETURN_TO_MAX_LEN:
        raise SsoConfigError("return_to exceeds maximum length")
    if not raw.startswith("/"):
        raise SsoConfigError("return_to must start with '/'")
    if raw.startswith("//"):
        raise SsoConfigError("return_to must not be protocol-relative")
    if _SCHEME_RE.match(raw):
        raise SsoConfigError("return_to must not include a URL scheme")
    if "#" in raw:
        raise SsoConfigError("return_to must not include a fragment")
    if "@" in raw:
        raise SsoConfigError("return_to must not include credentials")

    path_part = raw.split("?", 1)[0]
    if "/auth" in path_part.lower():
        raise SsoConfigError("return_to must not target auth routes")

    return raw
