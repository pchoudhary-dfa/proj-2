"""
One-way bcrypt password hashing for IAM user accounts.

Distinct from password_encryption.py (Fernet symmetric encryption), which is
used for reversible storage of data warehouse connection passwords.

Uses the bcrypt library directly (avoids passlib compatibility issues with
bcrypt >= 4.0.0).  Handles both Python ($2b$) and PHP ($2y$) hash prefixes.

Usage:
    from apps.shared.utils.password_utils import hash_password, verify_password

    stored = hash_password("plain-text")          # store in DB
    ok = verify_password("plain-text", stored)    # verify on login
"""
import bcrypt


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the given plain-text password."""
    if not plain:
        raise ValueError("Password must not be empty")
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plain-text password against a stored bcrypt hash.
    Accepts both $2b$ (Python) and $2y$ (PHP) hash prefixes.
    Returns False (rather than raising) if the hash is malformed or empty.
    """
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False
