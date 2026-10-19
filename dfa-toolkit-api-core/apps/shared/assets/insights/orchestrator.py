"""
Orchestrate sanitize → prompt build → OpenAI for POST /dw/{dw_id}/insights.
Supports both non-streaming and SSE streaming responses.

AI credentials (AI_API_KEY, AI_PROVIDER) are read from the warehouse
db_configuration table for the given dw_id. Model / timeout / response_type
come from apps.shared.config.config.insights_openai (code defaults, not .env).
"""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Optional, Tuple

from apps.shared.assets.insights import sanitizer
from apps.shared.assets.insights.errors import (
    AI_ANALYSIS_FAILED,
    AI_BAD_REQUEST,
    AI_PROVIDER_KEY_NOT_DEFINED,
    AI_UNSUPPORTED_PROVIDER,
    InsightsAnalysisError,
)
from apps.shared.assets.insights import openai_client
from apps.shared.assets.insights import prompt_builder
from apps.shared.config.config import insights_openai, settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Credential helpers
# ---------------------------------------------------------------------------

def _fetch_ai_credentials(dw_id: Optional[int]) -> Tuple[str, str]:
    """
    Read AI_API_KEY and AI_PROVIDER from the warehouse db_configuration table.

    Returns (api_key, provider) strings — empty string when not found.
    API keys are only taken from db_configuration (AI_API_KEY) for the warehouse;
    there is no env fallback for the key.
    """
    env_provider = (settings.AI_PROVIDER or "").strip()

    if not dw_id:
        return "", env_provider

    try:
        from apps.app_db.services.datawarehouse import SystemDatawarehouseService
        from apps.app_db.services.ut_dw_config_reader import fetch_ut_dw_configs

        conn_params = SystemDatawarehouseService().get_mysql_warehouse_connection_params(dw_id)
        if not conn_params:
            logger.warning("_fetch_ai_credentials: no MySQL conn params for dw_id=%s", dw_id)
            return "", env_provider

        configs = fetch_ut_dw_configs(settings.DFA_DM_APP_KEY, conn_params)
        api_key = (configs.get("AI_API_KEY") or {}).get("value") or ""
        provider = (configs.get("AI_PROVIDER") or {}).get("value") or ""
        return api_key.strip(), provider.strip()

    except Exception as exc:
        logger.warning(
            "_fetch_ai_credentials: DB lookup failed for dw_id=%s — %s", dw_id, exc
        )
        return "", env_provider


def _normalized_ai_provider(raw: str) -> str:
    """
    Value from db_configuration AI_PROVIDER (or env AI_PROVIDER), case-insensitive.
    Empty defaults to openai — only OpenAI client is implemented today.
    """
    p = (raw or "").strip().lower()
    return p if p else "openai"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_format(content: str, response_type: str) -> str:
    if response_type != "structured":
        return "markdown"
    try:
        obj = json.loads(content)
    except json.JSONDecodeError:
        return "markdown"
    if isinstance(obj, dict) and isinstance(obj.get("sections"), list):
        return "structured"
    return "markdown"


def _validate_and_build_prompts(body: dict[str, Any]) -> tuple[dict[str, str], str, str, str]:
    """
    Shared validation + prompt build for both streaming and non-streaming.

    Returns (prompts, response_type, api_key, ai_provider).
    Credentials are resolved from warehouse db_configuration for body["dw_id"]
    (AI_API_KEY, AI_PROVIDER), with env fallbacks.
    """
    dw_id = body.get("dw_id")
    api_key, provider_raw = _fetch_ai_credentials(dw_id)

    if not api_key:
        raise InsightsAnalysisError(
            AI_PROVIDER_KEY_NOT_DEFINED,
            "AI API key is not configured for this datawarehouse (set AI_API_KEY in db_configuration).",
            http_status=503,
        )

    ai_provider = _normalized_ai_provider(provider_raw)
    if ai_provider != "openai":
        raise InsightsAnalysisError(
            AI_UNSUPPORTED_PROVIDER,
            f"AI provider {provider_raw!r} is not supported. Supported providers: openai.",
            http_status=503,
        )

    if "data" not in body or body.get("data") is None:
        raise InsightsAnalysisError(
            AI_BAD_REQUEST,
            "Field 'data' is required.",
            http_status=400,
        )

    payload = sanitizer.sanitize_payload(body)
    if payload.get("data") is None:
        raise InsightsAnalysisError(
            AI_BAD_REQUEST,
            "Field 'data' is required.",
            http_status=400,
        )

    rt = str(insights_openai.response_type or "markdown").lower()
    if rt not in ("markdown", "structured"):
        rt = "markdown"

    prompts = prompt_builder.build(payload, rt)
    return prompts, rt, api_key, ai_provider


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def analyze_insights(body: dict[str, Any]) -> dict[str, Any]:
    """Non-streaming analysis — returns the full result dict."""
    prompts, rt, api_key, ai_provider = _validate_and_build_prompts(body)

    try:
        # Dispatch by AI_PROVIDER (db_configuration / env); add elif branches when new clients exist.
        if ai_provider == "openai":
            content, model = await openai_client.chat_complete(
                prompts["system"],
                prompts["user"],
                api_key=api_key,
            )
        else:
            # Defensive: non-openai requests should fail in _validate_and_build_prompts.
            raise InsightsAnalysisError(
                AI_UNSUPPORTED_PROVIDER,
                f"Unhandled AI provider: {ai_provider}",
                http_status=503,
            )
    except RuntimeError as e:
        logger.warning("Insights OpenAI call failed: %s", e)
        raise InsightsAnalysisError(
            AI_ANALYSIS_FAILED,
            str(e),
            http_status=502,
        ) from e

    fmt = _compute_format(content, rt)
    return {
        "content": content,
        "model": model,
        "format": fmt,
    }


async def stream_insights(body: dict[str, Any]) -> AsyncIterator[str]:
    """
    SSE streaming analysis — yields pre-formatted SSE data lines.

    Each yield is one of:
      '{"content": "chunk text"}'
      '{"error": "message"}'
      '[DONE]'

    '[DONE]' is always the final event — guaranteed by the outer try/finally.
    """
    import asyncio

    try:
        prompts, rt, api_key, ai_provider = _validate_and_build_prompts(body)
    except InsightsAnalysisError as e:
        logger.warning("Insights stream validation failed: %s", e.message)
        yield json.dumps({"error": e.message, "code": e.error_code}, ensure_ascii=False)
        yield "[DONE]"
        return

    yield json.dumps({"meta": {"response_type": rt}}, ensure_ascii=False)

    try:
        if ai_provider == "openai":
            async for chunk in openai_client.chat_complete_stream(
                prompts["system"],
                prompts["user"],
                api_key=api_key,
            ):
                yield json.dumps({"content": chunk}, ensure_ascii=False)
        else:
            raise InsightsAnalysisError(
                AI_UNSUPPORTED_PROVIDER,
                f"Unhandled AI provider: {ai_provider}",
                http_status=503,
            )
    except asyncio.CancelledError:
        logger.warning("Insights stream cancelled (client disconnect or worker shutdown)")
        yield json.dumps({"error": "Stream cancelled"}, ensure_ascii=False)
    except InsightsAnalysisError as e:
        logger.warning("Insights streaming failed: %s", e.message)
        yield json.dumps({"error": e.message, "code": e.error_code}, ensure_ascii=False)
    except RuntimeError as e:
        logger.warning("Insights streaming failed: %s", e)
        yield json.dumps({"error": str(e)}, ensure_ascii=False)
    finally:
        yield "[DONE]"
