"""
Service for system_language read/create/patch operations.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.app_db.db.core import SessionLocal
from apps.app_db.models.core import SystemLanguage, SystemLanguageTranslation, SystemLanguageTranslationI18n
from apps.app_db.schemas.core import SystemLanguageCreateSchema, SystemLanguagePatchSchema
from apps.shared.exceptions import Conflict


class SystemLanguageService:
    """Read, create, and patch system languages."""

    @staticmethod
    def _seed_missing_i18n_for_locale(db: Session, locale: str) -> None:
        """
        Seed missing i18n rows for a locale with "#<default_text>".

        For each translation master, if (master_id, locale) does not exist in
        system_language_translation_i18n, create it with a placeholder text.
        """
        masters = list(db.scalars(select(SystemLanguageTranslation)).all())
        if not masters:
            return

        existing_rows = db.scalars(
            select(SystemLanguageTranslationI18n).where(
                SystemLanguageTranslationI18n.locale == locale
            )
        ).all()
        existing_master_ids = {row.master_id for row in existing_rows}

        for master in masters:
            if master.id in existing_master_ids:
                continue
            db.add(
                SystemLanguageTranslationI18n(
                    master_id=master.id,
                    locale=locale,
                    translated_text=f"#{master.default_text}",
                )
            )

    def list_non_deleted(self) -> list[SystemLanguage]:
        db: Session = SessionLocal()
        try:
            stmt = (
                select(SystemLanguage)
                .where(SystemLanguage.is_deleted.is_(False))
                .order_by(SystemLanguage.is_default.desc(), SystemLanguage.locale.asc())
            )
            return list(db.scalars(stmt).all())
        finally:
            db.close()

    def get_language_by_id(self, language_id: int) -> Optional[SystemLanguage]:
        db: Session = SessionLocal()
        try:
            return db.scalar(
                select(SystemLanguage).where(
                    SystemLanguage.id == language_id,
                    SystemLanguage.is_deleted.is_(False),
                )
            )
        finally:
            db.close()

    def create_language(
        self,
        payload: SystemLanguageCreateSchema,
        created_user_id: Optional[int],
    ) -> SystemLanguage:
        db: Session = SessionLocal()
        try:
            now = datetime.utcnow()
            locale = payload.locale.strip().lower()

            existing = db.scalar(
                select(SystemLanguage).where(SystemLanguage.locale == locale)
            )
            if existing and not existing.is_deleted:
                raise Conflict(
                    f"System language with locale '{locale}' already exists",
                    error_code="LOCALE_ALREADY_EXISTS",
                    identifier=locale,
                )

            if existing and existing.is_deleted:
                row = existing
                row.is_deleted = False
                row.locale = locale
                row.name = payload.name
                row.description = payload.description
                row.is_rtl = payload.is_rtl
                row.is_default = payload.is_default
                row.modified_user_id = created_user_id
                row.modified = now
                if row.created is None:
                    row.created = now
                if row.created_user_id is None:
                    row.created_user_id = created_user_id
            else:
                row = SystemLanguage(
                    locale=locale,
                    name=payload.name,
                    description=payload.description,
                    is_rtl=payload.is_rtl,
                    is_default=payload.is_default,
                    is_deleted=False,
                    created_user_id=created_user_id,
                    created=now,
                    modified_user_id=created_user_id,
                    modified=now,
                )
                db.add(row)
                db.flush()

            if payload.is_default:
                db.execute(
                    SystemLanguage.__table__.update()
                    .where(SystemLanguage.id != row.id)
                    .values(is_default=False)
                )
                row.is_default = True

            self._seed_missing_i18n_for_locale(db=db, locale=locale)

            db.commit()
            db.refresh(row)
            return row
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def patch_language(
        self,
        language_id: int,
        payload: SystemLanguagePatchSchema,
        modified_user_id: Optional[int],
    ) -> Optional[SystemLanguage]:
        db: Session = SessionLocal()
        try:
            row = db.scalar(
                select(SystemLanguage).where(SystemLanguage.id == language_id)
            )
            if not row:
                return None

            updates = payload.model_dump(exclude_unset=True)
            for key, value in updates.items():
                setattr(row, key, value)

            if updates.get("is_default") is True:
                db.execute(
                    SystemLanguage.__table__.update()
                    .where(SystemLanguage.id != language_id)
                    .values(is_default=False)
                )
                row.is_default = True

            row.modified_user_id = modified_user_id
            row.modified = datetime.utcnow()

            db.commit()
            db.refresh(row)
            return row
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def delete_language(
        self,
        language_id: int,
        modified_user_id: Optional[int],
    ) -> bool:
        db: Session = SessionLocal()
        try:
            row = db.scalar(
                select(SystemLanguage).where(SystemLanguage.id == language_id)
            )
            if not row:
                return False

            now = datetime.utcnow()
            deleted_locale = row.locale

            # Requirement: deleting a language should clear all i18n rows for that locale.
            db.query(SystemLanguageTranslationI18n).filter(
                SystemLanguageTranslationI18n.locale == deleted_locale
            ).delete(synchronize_session=False)

            replacement_default = db.scalar(
                select(SystemLanguage)
                .where(
                    SystemLanguage.id != row.id,
                    SystemLanguage.is_deleted.is_(False),
                )
                .order_by(SystemLanguage.id.asc())
            )
            if row.is_default and replacement_default:
                replacement_default.is_default = True
                replacement_default.modified_user_id = modified_user_id
                replacement_default.modified = now

            db.delete(row)

            db.commit()
            return True
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
