"""
Proof-of-Work CAPTCHA service.

Manages challenge lifecycle: generation, PoW verification, and atomic consumption.
Challenges expire after CAPTCHA_CHALLENGE_TTL_SECONDS (default 120 s) and can
only be consumed once. Any failure raises an AppException subclass so the global
error handler converts it to the correct JSON envelope automatically.
"""
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from sqlalchemy.sql import text

from apps.app_db.models.core import IamCaptcha
from apps.shared.exceptions import BadRequest, NotFound

logger = logging.getLogger(__name__)

CAPTCHA_DIFFICULTY: int = 16
CAPTCHA_CHALLENGE_TTL_SECONDS: int = 120
CAPTCHA_CLEANUP_INTERVAL_SEC: int = 43200


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_challenge(db: Session) -> IamCaptcha:
    """Insert a new PoW challenge row and return the ORM instance."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    challenge = IamCaptcha(
        challenge_id=str(uuid.uuid4()),
        nonce=secrets.token_hex(32),
        difficulty=CAPTCHA_DIFFICULTY,
        expires=now + timedelta(seconds=CAPTCHA_CHALLENGE_TTL_SECONDS),
        created=now,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return challenge


def verify_and_consume(db: Session, challenge_id: str, solution: int) -> None:
    """
    Verify a PoW solution and atomically consume the challenge.

    Raises:
        NotFound: challenge_id does not exist.
        BadRequest (CAPTCHA_EXPIRED): challenge has passed its expiry time.
        BadRequest (CAPTCHA_INVALID): SHA256(nonce:solution) does not satisfy difficulty.
        BadRequest (CAPTCHA_USED): challenge was already consumed (replay attack).
    """
    challenge: IamCaptcha | None = (
        db.query(IamCaptcha)
        .filter(IamCaptcha.challenge_id == challenge_id)
        .first()
    )
    if challenge is None:
        raise NotFound("Invalid CAPTCHA challenge", error_code="CAPTCHA_NOT_FOUND")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if challenge.expires < now:
        raise BadRequest("CAPTCHA challenge has expired", error_code="CAPTCHA_EXPIRED")

    hash_hex = hashlib.sha256(f"{challenge.nonce}:{solution}".encode()).hexdigest()
    if not _verify_pow(hash_hex, challenge.difficulty):
        raise BadRequest("Invalid CAPTCHA solution", error_code="CAPTCHA_INVALID")

    # Atomic consume: only updates if used = FALSE to guard against replay attacks.
    rows_updated = db.execute(
        text(
            "UPDATE iam_captcha "
            "SET used = TRUE, used_at = :now "
            "WHERE challenge_id = :cid AND used = FALSE"
        ),
        {"cid": challenge_id, "now": now},
    ).rowcount
    db.commit()

    if rows_updated == 0:
        raise BadRequest("CAPTCHA challenge has already been used", error_code="CAPTCHA_USED")


def purge_expired_captcha(db: Session) -> int:
    """Delete used or expired challenges. Returns the number of rows deleted."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    result = db.execute(
        text(
            "DELETE FROM iam_captcha "
            "WHERE used = TRUE OR expires < :now"
        ),
        {"now": now},
    )
    db.commit()
    return int(result.rowcount or 0)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _verify_pow(hash_hex: str, difficulty: int) -> bool:
    """Return True when hash_hex has at least `difficulty` leading zero bits."""
    binary = bin(int(hash_hex, 16))[2:].zfill(256)
    return binary.startswith("0" * difficulty)
