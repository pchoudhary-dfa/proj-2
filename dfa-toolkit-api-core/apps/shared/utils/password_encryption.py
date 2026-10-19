"""
Encrypt/decrypt utilities for storing sensitive values (e.g. data warehouse passwords).
Uses Fernet (symmetric encryption). Key is from PASSWORD_ENCRYPTION_KEY or derived from SECRET_KEY.
"""
import base64
import hashlib
import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def _get_fernet_key(secret_key: str, password_encryption_key: str = "") -> bytes:
    """Build a valid Fernet key (32 bytes urlsafe base64) from config."""
    if password_encryption_key and len(password_encryption_key.strip()) > 0:
        key = password_encryption_key.strip().encode("utf-8")
        if len(base64.urlsafe_b64decode(key)) != 32:
            raise ValueError(
                "PASSWORD_ENCRYPTION_KEY must be a 44-character Fernet key. "
                "Generate one with: from cryptography.fernet import Fernet; Fernet.generate_key()"
            )
        return key
    # Derive from SECRET_KEY: SHA256 then base64
    digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_password(plain: str, secret_key: str, password_encryption_key: str = "") -> str:
    """
    Encrypt a plain-text password for storage.
    Returns base64-encoded ciphertext (safe to store in a string column).
    """
    if not plain:
        return ""
    key = _get_fernet_key(secret_key, password_encryption_key)
    f = Fernet(key)
    encrypted = f.encrypt(plain.encode("utf-8"))
    return encrypted.decode("utf-8")


def decrypt_password(cipher: str, secret_key: str, password_encryption_key: str = "") -> str:
    """
    Decrypt a stored password. Returns empty string if cipher is empty or invalid.
    """
    if not cipher or not cipher.strip():
        return ""
    try:
        key = _get_fernet_key(secret_key, password_encryption_key)
        f = Fernet(key)
        decrypted = f.decrypt(cipher.encode("utf-8"))
        return decrypted.decode("utf-8")
    except InvalidToken:
        logger.warning("Failed to decrypt stored password (invalid token or wrong key)")
        return ""
    except Exception as e:
        logger.warning("Failed to decrypt stored password: %s", e)
        return ""
