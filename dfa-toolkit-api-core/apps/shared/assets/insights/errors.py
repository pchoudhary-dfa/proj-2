"""Stable error codes for AI insights (CakePHP-compatible semantics)."""
from __future__ import annotations

from apps.shared.exceptions import AppException

AI_BAD_REQUEST = "AI_BAD_REQUEST"
AI_PROVIDER_KEY_NOT_DEFINED = "AI_PROVIDER_KEY_NOT_DEFINED"
AI_UNSUPPORTED_PROVIDER = "AI_UNSUPPORTED_PROVIDER"
AI_ANALYSIS_FAILED = "AI_ANALYSIS_FAILED"


class InsightsAnalysisError(AppException):
    """Raised by the AI insights pipeline; routed by the global app_exception_handler."""

    def __init__(self, code: str, message: str, http_status: int = 400):
        super().__init__(
            message,
            status_code=http_status,
            error_code=code,
        )
