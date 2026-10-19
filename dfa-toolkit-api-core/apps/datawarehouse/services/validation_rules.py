"""
Service for indicator validation rules CRUD.
Operates on iu_validation, iu_validation_enum, iu_validation_enum_i18n
using temporary sessions against the target data warehouse.
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from apps.datawarehouse.db.datawarehouse import get_warehouse_session_from_id
from apps.datawarehouse.models.datawarehouse import (
    Indicator,
    IndicatorUnitValidation,
    IndicatorUnitValidationEnum,
    IndicatorUnitValidationEnumI18n,
    Unit,
    get_default_locale,
)
from apps.datawarehouse.schemas.validation_rules import ValidationRuleUpsertSchema
from apps.datawarehouse.services.language_service import get_dw_language_codes
logger = logging.getLogger(__name__)


class ValidationRuleService:
    """
    Service for CRUD operations on indicator validation rules.
    All methods open their own warehouse session via get_warehouse_session_from_id.
    """

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    def get_indicator_gid_by_nid(self, dw_id: str, indicator_nid: int) -> Optional[str]:
        """Resolve an indicator NID to its GID using the default-locale table."""
        with get_warehouse_session_from_id(dw_id) as dw_db:
            IndicatorModel = Indicator(get_default_locale(dw_db))
            row = dw_db.query(IndicatorModel).filter(
                IndicatorModel.indicator_nid == indicator_nid
            ).first()
            return row.indicator_gid if row else None

    def get_rules(self, dw_id: str, indicator_gid: str) -> List[Dict[str, Any]]:
        """
        Return all validation rules for an indicator as a list of dicts.

        For ENUM rules, each option includes ``labels``: every registered DW language code
        from ``ut_language`` mapped to the stored label or None.
        """
        all_codes = get_dw_language_codes(dw_id)
        with get_warehouse_session_from_id(dw_id) as dw_db:
            rules = (
                dw_db.query(IndicatorUnitValidation)
                .filter(IndicatorUnitValidation.indicator_gid == indicator_gid)
                .order_by(IndicatorUnitValidation.id)
                .all()
            )

            result = []
            for rule in rules:
                entry: Dict[str, Any] = {
                    "unit_gid": rule.unit_gid,
                    "validation_type": rule.validation_type,
                    "min_value": float(rule.min_value) if rule.min_value is not None else None,
                    "max_value": float(rule.max_value) if rule.max_value is not None else None,
                    "min_length": rule.min_length,
                    "max_length": rule.max_length,
                    "options": [],
                }

                if rule.validation_type == "ENUM":
                    enum_rows = (
                        dw_db.query(IndicatorUnitValidationEnum)
                        .filter(IndicatorUnitValidationEnum.validation_id == rule.id)
                        .order_by(IndicatorUnitValidationEnum.display_order)
                        .all()
                    )
                    i18n_by_master: Dict[int, Dict[str, str]] = {}
                    if enum_rows:
                        master_ids = [e.id for e in enum_rows]
                        i18n_rows = (
                            dw_db.query(IndicatorUnitValidationEnumI18n)
                            .filter(
                                IndicatorUnitValidationEnumI18n.master_id.in_(master_ids)
                            )
                            .all()
                        )
                        for row in i18n_rows:
                            i18n_by_master.setdefault(row.master_id, {})[row.locale] = row.label

                    for opt in enum_rows:
                        per_master = i18n_by_master.get(opt.id, {})
                        entry["options"].append(
                            {
                                "option_code": opt.option_code,
                                "labels": {
                                    code: per_master.get(code) for code in all_codes
                                },
                                "score": float(opt.score) if opt.score is not None else None,
                                "display_order": opt.display_order,
                                "is_active": bool(opt.is_active),
                            }
                        )

                result.append(entry)

        return result

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def delete_all_rules(self, dw_id: str, indicator_gid: str) -> int:
        """
        Delete all validation rules (and enum options / i18n) for an indicator.
        Returns the number of iu_validation rows removed.
        """
        with get_warehouse_session_from_id(dw_id) as dw_db:
            rules = (
                dw_db.query(IndicatorUnitValidation)
                .filter(IndicatorUnitValidation.indicator_gid == indicator_gid)
                .all()
            )
            if not rules:
                return 0

            validation_ids = [r.id for r in rules]
            enum_rows = (
                dw_db.query(IndicatorUnitValidationEnum)
                .filter(IndicatorUnitValidationEnum.validation_id.in_(validation_ids))
                .all()
            )
            enum_ids = [e.id for e in enum_rows]
            if enum_ids:
                dw_db.query(IndicatorUnitValidationEnumI18n).filter(
                    IndicatorUnitValidationEnumI18n.master_id.in_(enum_ids)
                ).delete(synchronize_session=False)
            dw_db.query(IndicatorUnitValidationEnum).filter(
                IndicatorUnitValidationEnum.validation_id.in_(validation_ids)
            ).delete(synchronize_session=False)
            # Individual ORM deletes let the audit event listener capture each row.
            for rule in rules:
                dw_db.delete(rule)
            dw_db.commit()

        return len(validation_ids)

    def _ensure_unit_gids_exist(self, dw_db, unit_gids: List[str]) -> None:
        """
        Ensure each unit_gid exists in ut_unit_<default_locale> (GID is warehouse-global).
        Raises ValueError listing any unknown gids.
        """
        UnitModel = Unit(get_default_locale(dw_db))
        unique_ordered = list(dict.fromkeys(unit_gids))
        missing = [
            gid
            for gid in unique_ordered
            if not dw_db.query(UnitModel).filter(UnitModel.unit_gid == gid).first()
        ]
        if missing:
            shown = ", ".join(repr(g) for g in missing)
            raise ValueError(f"UNIT_NOT_FOUND: unknown unit_gid(s): {shown}")

    def upsert_rules(
        self,
        dw_id: str,
        indicator_gid: str,
        payload: ValidationRuleUpsertSchema,
        user_id: int,
        language_code: str,
    ) -> int:
        """
        Upsert the same validation rule for every unit_gid in payload.unit_gids.
        If unit_gids is empty, deletes all validation rules for the indicator.
        Returns the number of rows upserted in iu_validation, or deleted when clearing.
        """
        if not payload.unit_gids:
            return self.delete_all_rules(dw_id, indicator_gid)

        all_dw_language_codes = get_dw_language_codes(dw_id)
        now = datetime.utcnow()
        upserted = 0

        with get_warehouse_session_from_id(dw_id) as dw_db:
            self._ensure_unit_gids_exist(dw_db, payload.unit_gids)

            for unit_gid in payload.unit_gids:
                existing = (
                    dw_db.query(IndicatorUnitValidation)
                    .filter(
                        IndicatorUnitValidation.indicator_gid == indicator_gid,
                        IndicatorUnitValidation.unit_gid == unit_gid,
                    )
                    .first()
                )

                if existing:
                    existing.validation_type = payload.validation_type
                    existing.min_value = payload.min_value
                    existing.max_value = payload.max_value
                    existing.min_length = payload.min_length
                    existing.max_length = payload.max_length
                    existing.modified = now
                    existing.modified_user_id = user_id
                    validation_id = existing.id
                else:
                    new_rule = IndicatorUnitValidation(
                        indicator_gid=indicator_gid,
                        unit_gid=unit_gid,
                        validation_type=payload.validation_type,
                        min_value=payload.min_value,
                        max_value=payload.max_value,
                        min_length=payload.min_length,
                        max_length=payload.max_length,
                        created=now,
                        created_user_id=user_id,
                        modified=now,
                        modified_user_id=user_id,
                    )
                    dw_db.add(new_rule)
                    dw_db.flush()
                    validation_id = new_rule.id

                self._sync_enum_options(
                    dw_db=dw_db,
                    validation_id=validation_id,
                    payload=payload,
                    user_id=user_id,
                    language_code=language_code,
                    all_dw_language_codes=all_dw_language_codes,
                    now=now,
                )
                upserted += 1

            dw_db.commit()

        return upserted

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _sync_enum_options(
        self,
        dw_db,
        validation_id: int,
        payload: ValidationRuleUpsertSchema,
        user_id: int,
        language_code: str,
        all_dw_language_codes: List[str],
        now: datetime,
    ) -> None:
        """
        For ENUM: merge options by option_code on the master table. Removes masters (and all
        their i18n) only when an option_code disappears from the payload.

        For each payload option: if the master row already existed, upsert i18n only for
        ``language_code`` (request header). If the master is new, upsert the same label for
        every locale in ``all_dw_language_codes`` (or only ``language_code`` if that list is
        empty).

        For NUM/TEXT: delete all enum masters and i18n for this validation_id.
        Operates within the caller's open session — does NOT commit.
        """
        existing_enums = (
            dw_db.query(IndicatorUnitValidationEnum)
            .filter(IndicatorUnitValidationEnum.validation_id == validation_id)
            .all()
        )

        if payload.validation_type != "ENUM":
            existing_ids = [e.id for e in existing_enums]
            if existing_ids:
                dw_db.query(IndicatorUnitValidationEnumI18n).filter(
                    IndicatorUnitValidationEnumI18n.master_id.in_(existing_ids)
                ).delete(synchronize_session=False)
                dw_db.query(IndicatorUnitValidationEnum).filter(
                    IndicatorUnitValidationEnum.validation_id == validation_id
                ).delete(synchronize_session=False)
            return

        by_code = {e.option_code: e for e in existing_enums}
        payload_codes = {opt.option_code for opt in payload.options}

        for code, enum_row in list(by_code.items()):
            if code not in payload_codes:
                dw_db.query(IndicatorUnitValidationEnumI18n).filter(
                    IndicatorUnitValidationEnumI18n.master_id == enum_row.id
                ).delete(synchronize_session=False)
                dw_db.delete(enum_row)
                del by_code[code]

        for opt in payload.options:
            enum_row = by_code.get(opt.option_code)
            was_existing = enum_row is not None
            if enum_row is not None:
                enum_row.score = opt.score
                enum_row.display_order = (
                    opt.display_order if opt.display_order is not None else 0
                )
                enum_row.is_active = (
                    opt.is_active if opt.is_active is not None else True
                )
                enum_row.modified = now
                enum_row.modified_user_id = user_id
            else:
                enum_row = IndicatorUnitValidationEnum(
                    validation_id=validation_id,
                    option_code=opt.option_code,
                    score=opt.score,
                    display_order=opt.display_order if opt.display_order is not None else 0,
                    is_active=opt.is_active if opt.is_active is not None else True,
                    created=now,
                    created_user_id=user_id,
                    modified=now,
                    modified_user_id=user_id,
                )
                dw_db.add(enum_row)
                dw_db.flush()
                by_code[opt.option_code] = enum_row

            if opt.labels is not None:
                for loc, text in opt.labels.items():
                    if text is None:
                        dw_db.query(IndicatorUnitValidationEnumI18n).filter(
                            IndicatorUnitValidationEnumI18n.master_id == enum_row.id,
                            IndicatorUnitValidationEnumI18n.locale == loc,
                        ).delete(synchronize_session=False)
                    else:
                        i18n_row = (
                            dw_db.query(IndicatorUnitValidationEnumI18n)
                            .filter(
                                IndicatorUnitValidationEnumI18n.master_id == enum_row.id,
                                IndicatorUnitValidationEnumI18n.locale == loc,
                            )
                            .first()
                        )
                        if i18n_row is not None:
                            i18n_row.label = text
                        else:
                            dw_db.add(
                                IndicatorUnitValidationEnumI18n(
                                    master_id=enum_row.id,
                                    locale=loc,
                                    label=text,
                                )
                            )
            else:
                locales_for_label = (
                    [language_code]
                    if was_existing
                    else (all_dw_language_codes if all_dw_language_codes else [language_code])
                )
                for loc in locales_for_label:
                    i18n_row = (
                        dw_db.query(IndicatorUnitValidationEnumI18n)
                        .filter(
                            IndicatorUnitValidationEnumI18n.master_id == enum_row.id,
                            IndicatorUnitValidationEnumI18n.locale == loc,
                        )
                        .first()
                    )
                    lbl = opt.label if opt.label is not None else ""
                    if i18n_row is not None:
                        i18n_row.label = lbl
                    else:
                        dw_db.add(
                            IndicatorUnitValidationEnumI18n(
                                master_id=enum_row.id,
                                locale=loc,
                                label=lbl,
                            )
                        )
