"""
SQLAlchemy-backed storage for DFA Help Service.

Implements BaseStorage against the app_db MySQL tables (dfahelp_*).
Accepts a synchronous SQLAlchemy Session — lifecycle managed by the
FastAPI `get_db` dependency.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from apps.app_db.models.help import (
    DfaHelpAdaptation,
    DfaHelpAdaptationKey,
    DfaHelpAdaptationKeyI18n,
)
from apps.shared.exceptions import NotFound
import sys
from pathlib import Path
_help_pkg_dir = Path(__file__).resolve().parent.parent.parent / "shared" / "packages" / "dfa-help-service"
if str(_help_pkg_dir) not in sys.path:
    sys.path.insert(0, str(_help_pkg_dir))

from dfa_help_service.storage.base import BaseStorage  # noqa: E402
from dfa_help_service.core.models import (  # noqa: E402
    Adaptation,
    AdaptationCreate,
    AdaptationKey,
    AdaptationKeyCreate,
    AdaptationKeyI18n,
    AdaptationKeyI18nCreate,
)

logger = logging.getLogger(__name__)


def _orm_to_adaptation(row: DfaHelpAdaptation) -> Adaptation:
    return Adaptation(
        id=row.id,
        code=row.code,
        name=row.name,
        desc=row.desc or "",
        created_at=row.created_at,
        updated_at=row.updated_at,
        deleted_at=row.deleted_at,
    )


def _orm_to_key(row: DfaHelpAdaptationKey) -> AdaptationKey:
    return AdaptationKey(
        id=row.id,
        adaptation_id=row.adaptation_id,
        key=row.key,
        code=row.code,
        related_keys=row.related_keys,
        parent_id=row.parent_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        deleted_at=row.deleted_at,
    )


def _orm_to_i18n(row: DfaHelpAdaptationKeyI18n) -> AdaptationKeyI18n:
    return AdaptationKeyI18n(
        id=row.id,
        adaptation_key_id=row.adaptation_key_id,
        locale=row.locale,
        title=row.title,
        desc=row.desc,
        purpose=row.purpose,
    )


class SQLAlchemyHelpStorage(BaseStorage):
    """
    Production storage backend using SQLAlchemy ORM over MySQL.
    """

    def __init__(self, db: Session):
        self._db = db
        self._connected = True

    # ------------------------------------------------------------------
    # Adaptations
    # ------------------------------------------------------------------

    def get_adaptations(self) -> List[Adaptation]:
        rows = (
            self._db.query(DfaHelpAdaptation)
            .filter(DfaHelpAdaptation.deleted_at.is_(None))
            .order_by(DfaHelpAdaptation.id)
            .all()
        )
        return [_orm_to_adaptation(r) for r in rows]

    def get_adaptation(self, adaptation_id: int) -> Optional[Adaptation]:
        row = (
            self._db.query(DfaHelpAdaptation)
            .filter(DfaHelpAdaptation.id == adaptation_id, DfaHelpAdaptation.deleted_at.is_(None))
            .first()
        )
        return _orm_to_adaptation(row) if row else None

    def get_adaptation_by_code(self, code: str) -> Optional[Adaptation]:
        row = (
            self._db.query(DfaHelpAdaptation)
            .filter(DfaHelpAdaptation.code == code, DfaHelpAdaptation.deleted_at.is_(None))
            .first()
        )
        return _orm_to_adaptation(row) if row else None

    def create_adaptation(self, payload: AdaptationCreate) -> Adaptation:
        row = DfaHelpAdaptation(
            code=payload.code,
            name=payload.name,
            desc=payload.desc,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self._db.add(row)
        self._db.flush()
        return _orm_to_adaptation(row)

    def update_adaptation(self, adaptation_id: int, update_data: Dict[str, Any]) -> Adaptation:
        row = self._db.query(DfaHelpAdaptation).filter(DfaHelpAdaptation.id == adaptation_id).first()
        if not row:
            raise NotFound(f"Adaptation {adaptation_id} not found")
        for k, v in update_data.items():
            if hasattr(row, k):
                setattr(row, k, v)
        row.updated_at = datetime.utcnow()
        self._db.flush()
        return _orm_to_adaptation(row)

    def delete_adaptation(self, adaptation_id: int) -> bool:
        row = self._db.query(DfaHelpAdaptation).filter(DfaHelpAdaptation.id == adaptation_id).first()
        if not row:
            return False
        row.deleted_at = datetime.utcnow()
        self._db.flush()
        return True

    # ------------------------------------------------------------------
    # Adaptation Keys
    # ------------------------------------------------------------------

    def get_adaptation_keys(self, adaptation_id: int) -> List[AdaptationKey]:
        rows = (
            self._db.query(DfaHelpAdaptationKey)
            .filter(
                DfaHelpAdaptationKey.adaptation_id == adaptation_id,
                DfaHelpAdaptationKey.deleted_at.is_(None),
            )
            .order_by(DfaHelpAdaptationKey.id)
            .all()
        )
        return [_orm_to_key(r) for r in rows]

    def get_key(self, key_id: int) -> Optional[AdaptationKey]:
        row = (
            self._db.query(DfaHelpAdaptationKey)
            .filter(DfaHelpAdaptationKey.id == key_id, DfaHelpAdaptationKey.deleted_at.is_(None))
            .first()
        )
        return _orm_to_key(row) if row else None

    def get_key_by_string(self, key_string: str) -> Optional[AdaptationKey]:
        """Lookup a key by its string identifier (used by the frontend renderer)."""
        row = (
            self._db.query(DfaHelpAdaptationKey)
            .filter(DfaHelpAdaptationKey.key == key_string, DfaHelpAdaptationKey.deleted_at.is_(None))
            .first()
        )
        return _orm_to_key(row) if row else None

    def create_key(self, payload: AdaptationKeyCreate) -> AdaptationKey:
        row = DfaHelpAdaptationKey(
            adaptation_id=payload.adaptation_id,
            key=payload.key,
            code=payload.code,
            related_keys=payload.related_keys,
            parent_id=payload.parent_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self._db.add(row)
        self._db.flush()
        return _orm_to_key(row)

    def update_key(self, key_id: int, update_data: Dict[str, Any]) -> AdaptationKey:
        row = self._db.query(DfaHelpAdaptationKey).filter(DfaHelpAdaptationKey.id == key_id).first()
        if not row:
            raise NotFound(f"Key {key_id} not found")
        for k, v in update_data.items():
            if hasattr(row, k):
                setattr(row, k, v)
        row.updated_at = datetime.utcnow()
        self._db.flush()
        return _orm_to_key(row)

    def delete_key(self, key_id: int) -> bool:
        row = self._db.query(DfaHelpAdaptationKey).filter(DfaHelpAdaptationKey.id == key_id).first()
        if not row:
            return False
        row.deleted_at = datetime.utcnow()
        self._db.flush()
        return True

    # ------------------------------------------------------------------
    # i18n
    # ------------------------------------------------------------------

    def get_key_i18n_data(self, key_id: int) -> List[AdaptationKeyI18n]:
        rows = (
            self._db.query(DfaHelpAdaptationKeyI18n)
            .filter(DfaHelpAdaptationKeyI18n.adaptation_key_id == key_id)
            .all()
        )
        return [_orm_to_i18n(r) for r in rows]

    def create_key_i18n(self, payload: AdaptationKeyI18nCreate) -> AdaptationKeyI18n:
        row = DfaHelpAdaptationKeyI18n(
            adaptation_key_id=payload.adaptation_key_id,
            locale=payload.locale,
            title=payload.title,
            desc=payload.desc,
            purpose=payload.purpose,
        )
        self._db.add(row)
        self._db.flush()
        return _orm_to_i18n(row)

    def update_or_create_key_i18n(self, payload: AdaptationKeyI18nCreate) -> AdaptationKeyI18n:
        row = (
            self._db.query(DfaHelpAdaptationKeyI18n)
            .filter(
                DfaHelpAdaptationKeyI18n.adaptation_key_id == payload.adaptation_key_id,
                DfaHelpAdaptationKeyI18n.locale == payload.locale,
            )
            .first()
        )
        if row:
            if payload.title is not None:
                row.title = payload.title
            if payload.desc is not None:
                row.desc = payload.desc
            if payload.purpose is not None:
                row.purpose = payload.purpose
            self._db.flush()
            return _orm_to_i18n(row)
        return self.create_key_i18n(payload)

    def delete_key_i18n(self, i18n_id: int) -> bool:
        row = self._db.query(DfaHelpAdaptationKeyI18n).filter(DfaHelpAdaptationKeyI18n.id == i18n_id).first()
        if not row:
            return False
        self._db.delete(row)
        self._db.flush()
        return True

    # ------------------------------------------------------------------
    # Connection lifecycle (no-ops for session-based storage)
    # ------------------------------------------------------------------

    def connect(self) -> bool:
        self._connected = True
        return True

    def disconnect(self) -> bool:
        self._connected = False
        return True

    def is_connected(self) -> bool:
        return self._connected
