"""
Encrypt/decrypt utilities for storing sensitive secrets (e.g. SSO client_secret).
Delegates to the same Fernet key infrastructure used by password_encryption.py.
"""
from apps.shared.utils.password_encryption import encrypt_password, decrypt_password
from apps.shared.config.config import settings


def encrypt_secret(plain: str) -> str:
    """Fernet-encrypt a plaintext secret for at-rest storage."""
    return encrypt_password(plain, settings.SECRET_KEY, settings.PASSWORD_ENCRYPTION_KEY)


def decrypt_secret(cipher: str) -> str:
    """Decrypt a stored secret. Returns empty string on failure."""
    return decrypt_password(cipher, settings.SECRET_KEY, settings.PASSWORD_ENCRYPTION_KEY)
