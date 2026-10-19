"""
Request context middleware - tracks user_id, db_id, request_id per request for logging
and buffers small JSON request bodies for the global exception handlers.

Implemented as a pure ASGI middleware (not BaseHTTPMiddleware) so it can replay the
HTTP body to the downstream app after buffering it. Under BaseHTTPMiddleware the route
handler constructs a fresh Request from the original receive callable, so simply
awaiting request.body() at the middleware layer drains the stream and the route
ends up with an empty body. Receive-replay solves this cleanly.
"""
from __future__ import annotations

import re
import uuid
from contextvars import ContextVar
from typing import Optional

from apps.shared.config.config import settings

request_user_id: ContextVar[Optional[int]] = ContextVar("request_user_id", default=None)
dbmetadata_published_by: ContextVar[Optional[str]] = ContextVar("dbmetadata_published_by", default=None)
request_db_id: ContextVar[Optional[int]] = ContextVar("request_db_id", default=None)
request_app_key: ContextVar[Optional[str]] = ContextVar("request_app_key", default=None)
request_dashboard_id: ContextVar[Optional[int]] = ContextVar("request_dashboard_id", default=None)
request_path: ContextVar[Optional[str]] = ContextVar("request_path", default=None)
request_method: ContextVar[Optional[str]] = ContextVar("request_method", default=None)
request_id: ContextVar[Optional[str]] = ContextVar("request_id", default=None)

_DB_ID_RE = re.compile(r"/dw/(\d+)")
_DASH_ID_RE = re.compile(r"/dash/(\d+)")
_BUFFER_METHODS = {"POST", "PUT", "PATCH"}


def _extract_db_id(path: str) -> Optional[int]:
    """Extract db_id from path like /dw/1/areas."""
    m = _DB_ID_RE.search(path)
    return int(m.group(1)) if m else None


def _extract_dash_id(path: str) -> Optional[int]:
    """Extract dashboard_id from path like /dash/5/visualizations."""
    m = _DASH_ID_RE.search(path)
    return int(m.group(1)) if m else None


def _decoded_header(headers: list[tuple[bytes, bytes]], name: bytes) -> Optional[str]:
    for k, v in headers:
        if k.lower() == name:
            try:
                return v.decode("latin-1")
            except UnicodeDecodeError:
                return None
    return None


class RequestContextMiddleware:
    """
    Pure ASGI middleware: sets request context vars, optionally buffers a small JSON
    body onto ``scope["state"]["cached_body"]``, and replays it to the downstream
    ASGI app so route handlers can still parse it normally.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method") or ""
        path = scope.get("path") or ""
        qs_bytes = scope.get("query_string") or b""
        try:
            qs = qs_bytes.decode("latin-1") if qs_bytes else ""
        except UnicodeDecodeError:
            qs = ""
        full_path = f"{path}?{qs}" if qs else path

        headers = scope.get("headers") or []
        rid = _decoded_header(headers, b"x-request-id") or str(uuid.uuid4())

        state = scope.setdefault("state", {})
        user_id = state.get("user_id")

        request_user_id.set(user_id)
        request_db_id.set(_extract_db_id(path))
        request_app_key.set(state.get("app_key"))
        request_dashboard_id.set(_extract_dash_id(path))
        request_path.set(full_path)
        request_method.set(method)
        request_id.set(rid)

        if headers:
            state["cached_headers"] = list(headers)

        downstream_receive = receive
        if method.upper() in _BUFFER_METHODS:
            content_type = (_decoded_header(headers, b"content-type") or "").lower()
            content_length_raw = _decoded_header(headers, b"content-length")
            content_length: Optional[int]
            try:
                content_length = int(content_length_raw) if content_length_raw is not None else None
            except ValueError:
                content_length = None

            max_bytes = int(getattr(settings, "LOG_REQ_BODY_MAX_BYTES", 8192) or 0)
            is_json = content_type.startswith("application/json")
            within_cap = (
                max_bytes > 0
                and content_length is not None
                and content_length <= max_bytes
            )

            if is_json and within_cap:
                body = await self._buffer_body(receive, max_bytes)
                if body is not None:
                    state["cached_body"] = body
                    downstream_receive = self._make_replay_receive(body)

        await self.app(scope, downstream_receive, send)

    @staticmethod
    async def _buffer_body(receive, max_bytes: int) -> Optional[bytes]:
        """
        Pull http.request messages off the receive channel until more_body is False.
        Aborts (returns None) if accumulated bytes exceed max_bytes (defensive guard
        against a client that lied in Content-Length).
        """
        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            mtype = message.get("type")
            if mtype != "http.request":
                # Unexpected (e.g. http.disconnect) — bail out without caching.
                return None
            body = message.get("body") or b""
            if body:
                total += len(body)
                if total > max_bytes:
                    return None
                chunks.append(body)
            if not message.get("more_body", False):
                break
        return b"".join(chunks)

    @staticmethod
    def _make_replay_receive(body: bytes):
        """Build a receive callable that yields the buffered body once, then disconnect."""
        sent = {"body": False}

        async def replay_receive():
            if not sent["body"]:
                sent["body"] = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        return replay_receive
