"""SSO package exceptions (host maps these to the platform error envelope)."""


class SsoConfigError(Exception):
    """Raised when SSO configuration or provider setup is invalid."""

    def __init__(
        self,
        message: str,
        *,
        http_status: int = 400,
        error_code: str = "SSO_CONFIG_ERROR",
    ) -> None:
        super().__init__(message)
        self.http_status = http_status
        self.error_code = error_code
