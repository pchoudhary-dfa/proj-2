"""OpenAI chat completion wrapper (non-streaming and streaming).

api_key is passed explicitly by the caller (resolved from db_configuration).
Model, timeout, and response mode come from apps.shared.config.config.insights_openai
(code defaults only, not from .env).
"""
from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from apps.shared.config.config import insights_openai
from apps.shared.utils.log_event import log_background_incident

logger = logging.getLogger(__name__)


def _build_client_and_request(
    system: str,
    user: str,
    api_key: str,
) -> tuple[Any, dict[str, Any], str]:
    """Shared setup for both streaming and non-streaming calls."""
    if not api_key:
        raise RuntimeError("AI API key is not set")

    try:
        from openai import AsyncOpenAI
    except ImportError as e:
        raise RuntimeError("openai package is not installed") from e

    model = (insights_openai.model or "gpt-4.1").strip()
    timeout = float(insights_openai.timeout or 120)
    json_mode = str(insights_openai.response_type or "markdown").lower() == "structured"

    client = AsyncOpenAI(api_key=api_key, timeout=timeout)

    req: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    if json_mode:
        req["response_format"] = {"type": "json_object"}

    return client, req, model


async def chat_complete(system: str, user: str, api_key: str) -> tuple[str, str]:
    """
    Non-streaming call. Returns (message_content, model_id_used).
    """
    client, req, model = _build_client_and_request(system, user, api_key)

    try:
        completion = await client.chat.completions.create(**req)
    except Exception as e:
        log_background_incident(
            f"OpenAI chat.completions failed: {e}",
            error_code="OPENAI_CHAT_FAILED",
            exc=e,
            source="apps.shared.assets.insights.openai_client",
        )
        raise RuntimeError(str(e)) from e

    choice = completion.choices[0] if completion.choices else None
    if not choice or not choice.message or choice.message.content is None:
        raise RuntimeError("Empty completion from OpenAI")

    used_model = completion.model or model
    return choice.message.content.strip(), used_model


async def chat_complete_stream(system: str, user: str, api_key: str) -> AsyncIterator[str]:
    """
    Streaming call. Yields content-delta strings as they arrive from OpenAI.

    The stream is always closed via aclose() in the finally block to ensure the
    underlying httpx connection is returned to the pool. Without this, incomplete
    chunked reads can occur (openai-python issues #763, #2065, #2356).
    """
    client, req, model = _build_client_and_request(system, user, api_key)
    req["stream"] = True

    stream = None
    try:
        stream = await client.chat.completions.create(**req)
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content
    except Exception as e:
        log_background_incident(
            f"OpenAI streaming failed: {e}",
            error_code="OPENAI_STREAM_FAILED",
            exc=e,
            source="apps.shared.assets.insights.openai_client",
        )
        raise RuntimeError(str(e)) from e
    finally:
        if stream is not None:
            try:
                await stream.response.aclose()
            except Exception:
                pass
