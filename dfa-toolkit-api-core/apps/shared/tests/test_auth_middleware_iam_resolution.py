"""
IAM route resolution: router path template + exact iam_resource_api lookup.

Guarantees Approach #2 never picks an ambiguous IAM row the way the old
regex matcher did (e.g. GET /dash/themes matching both /dash/themes and
/dash/{dashboard_id}).

Invariant under test
--------------------
For every seeded IAM endpoint E (DFA_DASH, DFA_DM, DFA_VIZ) and HTTP method M:

  1. Build a concrete URL by filling ``{param}`` placeholders in E.
  2. Ask FastAPI/Starlette which route matches → path *template* T.
  3. Assert T == E  (router template must equal IAM ``backend_endpoint``).
  4. Exact IAM lookup (M, T) returns exactly one row for that app_key.
  5. That row's access_level matches the seed.

Also proves the classic collision: under legacy regex matching,
GET /dash/themes hits *two* IAM patterns; under Approach #2 it hits one.

Dual-app seed rows (``_both`` / ``_dm_auth_viz_app_client``) intentionally
share ``(method, endpoint)`` across app_keys — uniqueness is asserted
**per app_key**, not globally.
"""
from __future__ import annotations

import re
from typing import Iterable

import pytest
from starlette.requests import Request

from apps.app_db.scripts.app_dashboard.seed_dash_iam import (
    _DASH_APP_KEY,
    _DEFAULT_RESOURCE_APIS as _DASH_RESOURCE_APIS,
)
from apps.app_db.scripts.app_db.seed_iam import (
    _DM_APP_KEY,
    _VIZ_APP_KEY,
    _DEFAULT_RESOURCE_APIS as _CORE_RESOURCE_APIS,
)
from apps.shared.middleware import auth_middleware
from main import app

# ---------------------------------------------------------------------------
# Legacy regex matcher (pre–Approach #2) — kept only to prove ambiguity
# ---------------------------------------------------------------------------


def _legacy_pattern_to_regex(endpoint: str) -> re.Pattern:
    escaped = re.sub(
        r"\{[^}]+\}",
        "[^/]+",
        re.escape(endpoint).replace(r"\{", "{").replace(r"\}", "}"),
    )
    normalised = escaped.replace("\\/", "/")
    return re.compile(f"^{normalised}$")


def _legacy_regex_matches(
    method: str,
    concrete_path: str,
    endpoints: Iterable[tuple[str, str]],
) -> list[str]:
    """Return backend_endpoint strings that regex-match concrete_path (old behavior)."""
    out: list[str] = []
    for ep_method, endpoint in endpoints:
        if ep_method.upper() != method.upper():
            continue
        if _legacy_pattern_to_regex(endpoint).match(concrete_path):
            out.append(endpoint)
    return out


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fill_path_template(template: str) -> str:
    """Replace ``{param}`` segments with stable sample values (1, 2, 3, …)."""
    counter = 0

    def _repl(_match: re.Match[str]) -> str:
        nonlocal counter
        counter += 1
        return str(counter)

    return re.sub(r"\{[^}]+\}", _repl, template)


def _make_request(method: str, path: str) -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "app": app,
    }
    return Request(scope)


def _all_seed_apis() -> list[dict]:
    """Active IAM API rows from seed_dash_iam + seed_iam (DM/VIZ)."""
    rows: list[dict] = []
    for row in _DASH_RESOURCE_APIS:
        if row.get("is_active", 1):
            rows.append(row)
    for row in _CORE_RESOURCE_APIS:
        if row.get("is_active", 1):
            rows.append(row)
    return rows


def _seed_apis_for_app(app_key: str) -> list[dict]:
    return [row for row in _all_seed_apis() if row.get("app_key") == app_key]


def _install_seed_iam_cache(monkeypatch: pytest.MonkeyPatch) -> dict:
    """
    Install an exact-match IAM cache built from all seed modules (no DB required).

    Mirrors production ``_load_route_cache`` shape:
    (method, backend_endpoint) → [(app_key, access_level, resource_api_id), ...]
    """
    cache: dict[tuple[str, str], list[tuple[str, str, int]]] = {}
    for idx, row in enumerate(_all_seed_apis(), start=1):
        key = (row["http_method"].upper(), row["backend_endpoint"])
        cache.setdefault(key, []).append(
            (row["app_key"], row["access_level"], idx)
        )
    monkeypatch.setattr(auth_middleware, "_get_cache", lambda: cache)
    return cache


def _assert_seed_endpoint_resolves(
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    endpoint: str,
    app_key: str,
    access_level: str,
    *,
    legacy_peer_endpoints: list[tuple[str, str]] | None = None,
) -> None:
    """
    concrete URL → FastAPI template T → T must equal seed endpoint →
    exact IAM lookup returns exactly one row for app_key with seeded access_level.
    """
    _install_seed_iam_cache(monkeypatch)

    concrete = _fill_path_template(endpoint)
    request = _make_request(method, concrete)
    template = auth_middleware._resolve_route_template(request)

    assert template is not None, (
        f"FastAPI did not match {method} {concrete!r} "
        f"(seed endpoint {endpoint!r}, app_key={app_key!r}). "
        f"Route missing or registration order wrong."
    )
    assert template == endpoint, (
        f"Router template {template!r} != IAM backend_endpoint {endpoint!r} "
        f"for concrete URL {concrete!r} (app_key={app_key!r}). "
        f"IAM seed and FastAPI path params must match."
    )

    matches = auth_middleware._matches_for_path(method, template)
    app_rows = [m for m in matches if m[0] == app_key]
    assert len(app_rows) == 1, (
        f"Expected exactly one IAM row for {method} {template!r} "
        f"app_key={app_key!r}, got {app_rows!r}"
    )
    assert app_rows[0][1] == access_level, (
        f"access_level mismatch for {method} {template!r} app_key={app_key!r}: "
        f"expected {access_level!r}, got {app_rows[0][1]!r}"
    )

    if legacy_peer_endpoints is not None:
        legacy_hits = _legacy_regex_matches(method, concrete, legacy_peer_endpoints)
        if len(legacy_hits) > 1:
            assert template in legacy_hits
            assert len(app_rows) == 1


# ---------------------------------------------------------------------------
# Classic ambiguity regression (DASH)
# ---------------------------------------------------------------------------


class TestLegacyAmbiguityVsExactLookup:
    """The bug that Approach #2 was introduced to fix."""

    def test_legacy_regex_matches_both_themes_and_dashboard_id(self):
        endpoints = [
            ("GET", "/dash/{dashboard_id}"),
            ("GET", "/dash/themes"),
        ]
        hits = _legacy_regex_matches("GET", "/dash/themes", endpoints)
        assert hits == ["/dash/{dashboard_id}", "/dash/themes"], (
            "Legacy regex must still demonstrate the original ambiguity; "
            f"got {hits!r}"
        )

    def test_approach2_resolves_themes_to_single_permission_row(self, monkeypatch):
        _install_seed_iam_cache(monkeypatch)

        request = _make_request("GET", "/dash/themes")
        template = auth_middleware._resolve_route_template(request)
        assert template == "/dash/themes"

        matches = auth_middleware._matches_for_path("GET", template)
        dash = [(ak, lvl, rid) for ak, lvl, rid in matches if ak == _DASH_APP_KEY]
        assert len(dash) == 1
        assert dash[0][1] == "PERMISSION"

        resolved = auth_middleware._resolve_access_level_for_app(matches, _DASH_APP_KEY)
        assert resolved is not None
        assert resolved[0] == "PERMISSION"

    def test_approach2_resolves_numeric_dashboard_to_authenticated_row(self, monkeypatch):
        _install_seed_iam_cache(monkeypatch)

        request = _make_request("GET", "/dash/42")
        template = auth_middleware._resolve_route_template(request)
        assert template == "/dash/{dashboard_id}"

        matches = auth_middleware._matches_for_path("GET", template)
        dash = [(ak, lvl, rid) for ak, lvl, rid in matches if ak == _DASH_APP_KEY]
        assert len(dash) == 1
        assert dash[0][1] == "AUTHENTICATED"


# ---------------------------------------------------------------------------
# Exhaustive seed ↔ router consistency (DASH / DM / VIZ)
# ---------------------------------------------------------------------------


def _dash_path_seed_cases() -> list[tuple[str, str, str, str]]:
    """(method, backend_endpoint, app_key, access_level) for /dash* seed rows."""
    cases: list[tuple[str, str, str, str]] = []
    for row in _seed_apis_for_app(_DASH_APP_KEY):
        endpoint = row["backend_endpoint"]
        if not (endpoint == "/dash" or endpoint.startswith("/dash/")):
            continue
        cases.append(
            (
                row["http_method"].upper(),
                endpoint,
                row["app_key"],
                row["access_level"],
            )
        )
    return cases


def _core_seed_cases() -> list[tuple[str, str, str, str]]:
    """(method, backend_endpoint, app_key, access_level) for DFA_DM + DFA_VIZ."""
    cases: list[tuple[str, str, str, str]] = []
    for row in _all_seed_apis():
        if row["app_key"] not in (_DM_APP_KEY, _VIZ_APP_KEY):
            continue
        cases.append(
            (
                row["http_method"].upper(),
                row["backend_endpoint"],
                row["app_key"],
                row["access_level"],
            )
        )
    return cases


def _dash_legacy_peer_endpoints() -> list[tuple[str, str]]:
    return [(m, e) for m, e, _, _ in _dash_path_seed_cases()]


def _core_legacy_peer_endpoints() -> list[tuple[str, str]]:
    # Deduplicate (method, endpoint) — dual-app rows share the same template
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str]] = []
    for method, endpoint, _, _ in _core_seed_cases():
        key = (method, endpoint)
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


@pytest.mark.parametrize(
    "method,endpoint,app_key,access_level",
    _dash_path_seed_cases(),
    ids=[f"{ak} {m} {e}" for m, e, ak, _ in _dash_path_seed_cases()],
)
def test_each_dash_seed_endpoint_resolves_unambiguously(
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    endpoint: str,
    app_key: str,
    access_level: str,
):
    """For every seeded /dash* IAM row — template match + unique app_key row."""
    _assert_seed_endpoint_resolves(
        monkeypatch,
        method,
        endpoint,
        app_key,
        access_level,
        legacy_peer_endpoints=_dash_legacy_peer_endpoints(),
    )


@pytest.mark.parametrize(
    "method,endpoint,app_key,access_level",
    _core_seed_cases(),
    ids=[f"{ak} {m} {e}" for m, e, ak, _ in _core_seed_cases()],
)
def test_each_core_seed_endpoint_resolves_unambiguously(
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    endpoint: str,
    app_key: str,
    access_level: str,
):
    """
    For every seeded DFA_DM / DFA_VIZ IAM row:

    concrete URL → FastAPI template T → T must equal seed endpoint →
    exact IAM lookup returns exactly one row for that app_key with the
    seeded access_level.
    """
    _assert_seed_endpoint_resolves(
        monkeypatch,
        method,
        endpoint,
        app_key,
        access_level,
        legacy_peer_endpoints=_core_legacy_peer_endpoints(),
    )


# ---------------------------------------------------------------------------
# Named collision matrix (human-readable smoke cases)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method,concrete,expected_template,app_key,expected_level",
    [
        # DASH literal vs {dashboard_id}
        ("GET", "/dash/themes", "/dash/themes", _DASH_APP_KEY, "PERMISSION"),
        ("POST", "/dash/themes", "/dash/themes", _DASH_APP_KEY, "PERMISSION"),
        ("GET", "/dash/themes/9", "/dash/themes/{theme_id}", _DASH_APP_KEY, "PERMISSION"),
        ("POST", "/dash/themes/9/copy", "/dash/themes/{theme_id}/copy", _DASH_APP_KEY, "PERMISSION"),
        ("GET", "/dash/media", "/dash/media", _DASH_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dash/embed", "/dash/embed", _DASH_APP_KEY, "APP_CLIENT"),
        ("GET", "/dash/analyses", "/dash/analyses", _DASH_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dash/7", "/dash/{dashboard_id}", _DASH_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dash/7/template", "/dash/{dashboard_id}/template", _DASH_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dash/7/sections", "/dash/{dashboard_id}/sections", _DASH_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dash/7/vis", "/dash/{dashboard_id}/vis", _DASH_APP_KEY, "APP_CLIENT"),
        ("GET", "/dash/7/vis/3", "/dash/{dashboard_id}/vis/{viz_id}", _DASH_APP_KEY, "APP_CLIENT"),
        # Core dual-access (_dm_auth_viz_app_client): same path, different levels
        ("GET", "/dw/1/areas", "/dw/{dw_id}/areas", _DM_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dw/1/areas", "/dw/{dw_id}/areas", _VIZ_APP_KEY, "APP_CLIENT"),
        ("GET", "/dw/1/indicators", "/dw/{dw_id}/indicators", _DM_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dw/1/indicators", "/dw/{dw_id}/indicators", _VIZ_APP_KEY, "APP_CLIENT"),
        ("GET", "/dw/1/subgroups", "/dw/{dw_id}/subgroups", _DM_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dw/1/subgroups", "/dw/{dw_id}/subgroups", _VIZ_APP_KEY, "APP_CLIENT"),
        ("GET", "/dw/1/time-periods", "/dw/{dw_id}/time-periods", _DM_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dw/1/time-periods", "/dw/{dw_id}/time-periods", _VIZ_APP_KEY, "APP_CLIENT"),
        ("GET", "/dw/1/sources", "/dw/{dw_id}/sources", _DM_APP_KEY, "AUTHENTICATED"),
        ("GET", "/dw/1/sources", "/dw/{dw_id}/sources", _VIZ_APP_KEY, "APP_CLIENT"),
        # Core shared-_both auth
        ("POST", "/auth/login", "/auth/login", _DM_APP_KEY, "APP_CLIENT"),
        ("POST", "/auth/login", "/auth/login", _VIZ_APP_KEY, "APP_CLIENT"),
        ("POST", "/auth/refresh", "/auth/refresh", _DM_APP_KEY, "PUBLIC"),
        ("POST", "/auth/refresh", "/auth/refresh", _VIZ_APP_KEY, "PUBLIC"),
        # DM-only
        ("GET", "/auth/me/permissions", "/auth/me/permissions", _DM_APP_KEY, "AUTHENTICATED"),
        ("GET", "/iam/roles", "/iam/roles", _DM_APP_KEY, "PERMISSION"),
    ],
)
def test_named_collision_matrix(
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    concrete: str,
    expected_template: str,
    app_key: str,
    expected_level: str,
):
    _install_seed_iam_cache(monkeypatch)

    template = auth_middleware._resolve_route_template(_make_request(method, concrete))
    assert template == expected_template

    matches = auth_middleware._matches_for_path(method, template)
    resolved = auth_middleware._resolve_access_level_for_app(matches, app_key)
    assert resolved is not None
    assert resolved[0] == expected_level

    # Uniqueness for this app_key (dual-app paths may have a second row)
    assert sum(1 for ak, _, _ in matches if ak == app_key) == 1
