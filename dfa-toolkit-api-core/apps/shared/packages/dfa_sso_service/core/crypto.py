"""
Fernet encrypt/decrypt with an injected key — no dependency on host settings.

The host provides the ``encryption_key`` via ``SsoConfig``.
"""
from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def _fernet_key_bytes(encryption_key: str) -> bytes:
    """
    Build a valid Fernet key (32-byte urlsafe-b64) from the config value.

    If ``encryption_key`` is already a 44-char Fernet key, use it directly.
    Otherwise derive one via SHA-256 + base64 (same logic as the host's
    ``password_encryption.py``).
    """
    raw = encryption_key.strip().encode("utf-8")
    try:
        decoded = base64.urlsafe_b64decode(raw)
        if len(decoded) == 32:
            return raw
    except Exception:
        pass
    digest = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_value(plain: str, encryption_key: str) -> str:
    """Fernet-encrypt a plaintext string for at-rest storage."""
    if not plain:
        return ""
    key = _fernet_key_bytes(encryption_key)
    return Fernet(key).encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_value(cipher: str, encryption_key: str) -> str:
    """Decrypt a stored value. Returns empty string on failure."""
    if not cipher or not cipher.strip():
        return ""
    try:
        key = _fernet_key_bytes(encryption_key)
        return Fernet(key).decrypt(cipher.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.warning("Failed to decrypt SSO value (invalid token or wrong key)")
        return ""
    except Exception as exc:
        logger.warning("Failed to decrypt SSO value: %s", exc)
        return ""
