"""
Generic locale-aware update helper for locale-only entity tables.

Usage
-----
Each locale mixin in models/datawarehouse.py declares:

    __locale_fields__ = frozenset({"field_a", "field_b"})

Fields listed in __locale_fields__ are written ONLY to the requested
language table.  All other fields in the payload are treated as structural
and are written to EVERY configured language table verbatim (same value in
every locale; LANG_PREFIX is never applied).

Locale-only writes use LANG_PREFIX when auto-filling blank cells in other
locale tables (untranslated marker).

When the same table is shared by multiple entity types (e.g. IndicatorClassification
for both generic IC and Source), pass locale_fields_override so only the
requested entity's locale fields are used. When override is used, locale-only
fields are not auto-filled into other locales (strict per-locale).
"""
import logging
from typing import Any, Dict, FrozenSet, Iterable, Optional

from sqlalchemy.orm import Session

from apps.datawarehouse.services.language_service import get_dw_language_codes
from apps.datawarehouse.utils.lang_prefix import apply_lang_prefix

logger = logging.getLogger(__name__)


def _value_for_lang_table(value: Any, *, is_request_locale: bool) -> Any:
    """
    Prepare a locale-field value for writing.
    - Request locale: store as-is.
    - Other locales (auto-fill): prefix strings with LANG_PREFIX (untranslated).
    """
    if not isinstance(value, str):
        return value
    if is_request_locale:
        return value
    return apply_lang_prefix(value)


def apply_locale_update(
    dw_db: Session,
    dw_id: str,
    mixin_class: type,
    pk_field: str,
    pk_value: int,
    payload: Dict[str, Any],
    language_code: str,
    locale_fields_override: Optional[Iterable[str]] = None,
) -> None:
    """
    Apply a partial-update payload to a locale-only entity.

    Parameters
    ----------
    dw_db          : Active SQLAlchemy session for the data warehouse.
    dw_id          : Data warehouse identifier (used to fetch all language codes).
    mixin_class    : Locale mixin class (e.g. Unit, Indicator).  Must have
                     __table_prefix__ and optionally __locale_fields__.
    pk_field       : Name of the primary-key column on the model (e.g. "unit_nid").
    pk_value       : Primary-key value of the record to update.
    payload        : Dict of {column_name: new_value} to apply.  None values must
                     already be excluded by the caller (use model_dump(exclude_none=True)
                     or build the dict manually).  Non-column keys are silently skipped
                     via hasattr guard.
    language_code  : The language requested by the caller (Accept-Language header value).
    locale_fields_override : If set, use these as locale-only fields instead of the
                     model's __locale_fields__. Used when the table is shared (e.g. Source
                     vs generic IC). When provided, locale-only fields are NOT auto-filled
                     into other locales (only the requested language table is updated).
    """
    if not payload:
        return

    if locale_fields_override is not None:
        locale_fields: FrozenSet[str] = frozenset(locale_fields_override)
        use_autofill = False
    else:
        locale_fields = getattr(mixin_class, "__locale_fields__", frozenset())
        use_autofill = True

    locale_only = {k: v for k, v in payload.items() if k in locale_fields}
    structural = {k: v for k, v in payload.items() if k not in locale_fields}

    # ------------------------------------------------------------------
    # Structural fields → write to EVERY configured locale table (no prefix)
    # ------------------------------------------------------------------
    if structural:
        for lang_code in get_dw_language_codes(dw_id):
            Model = mixin_class(lang_code)
            row = dw_db.query(Model).filter(
                getattr(Model, pk_field) == pk_value
            ).first()
            if row:
                for field, value in structural.items():
                    if hasattr(row, field):
                        setattr(row, field, value)
                logger.debug(
                    "Structural update: %s pk=%s locale=%s fields=%s",
                    mixin_class.__name__, pk_value, lang_code, list(structural),
                )

    # ------------------------------------------------------------------
    # Locale-specific fields
    # Step 1: write to the requested locale table.
    # Step 2: for every OTHER configured locale table, auto-fill columns
    #         that are currently NULL / empty / whitespace-only with the
    #         new value.  Columns that already hold a valid non-empty
    #         value are left untouched.
    # ------------------------------------------------------------------
    if locale_only:
        # Step 1 – primary update on the requested language table
        Model = mixin_class(language_code)
        row = dw_db.query(Model).filter(
            getattr(Model, pk_field) == pk_value
        ).first()
        if row:
            for field, value in locale_only.items():
                if hasattr(row, field):
                    setattr(row, field, _value_for_lang_table(value, is_request_locale=True))
            logger.debug(
                "Locale update: %s pk=%s locale=%s fields=%s",
                mixin_class.__name__, pk_value, language_code, list(locale_only),
            )

        # Step 2 – conditional cross-language auto-fill (skipped when locale_fields_override is used)
        if use_autofill:
            for other_lang in get_dw_language_codes(dw_id):
                if other_lang == language_code:
                    continue
                OtherModel = mixin_class(other_lang)
                other_row = dw_db.query(OtherModel).filter(
                    getattr(OtherModel, pk_field) == pk_value
                ).first()
                if not other_row:
                    continue
                for field, value in locale_only.items():
                    if not hasattr(other_row, field):
                        continue
                    # Only propagate when the new value itself is non-empty
                    if value is None or not str(value).strip():
                        continue
                    current = getattr(other_row, field, None)
                    if current is None or not str(current).strip():
                        setattr(
                            other_row,
                            field,
                            _value_for_lang_table(value, is_request_locale=False),
                        )
                        logger.debug(
                            "Locale auto-fill: %s pk=%s locale=%s field=%s (was blank)",
                            mixin_class.__name__, pk_value, other_lang, field,
                        )
