"""
Service for app-config: lookup configurations by application keyword (app_key).
"""
import base64
import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from apps.app_db.constants.system_config import (
    GLOBAL_CONFIG_KEY_CODES,
    PLATFORM_CONFIG_APP_KEY,
    is_dw_mirror_key,
    is_global_config_key,
)
from apps.app_db.models.core import SystemApplication, SystemConfiguration
from apps.app_db.schemas.core import AppConfigPatchItemSchema
from apps.app_db.db.core import SessionLocal
from apps.app_db.services.datawarehouse import SystemDatawarehouseService
from apps.app_db.services.ut_dw_config_reader import fetch_ut_dw_configs
from apps.datawarehouse.utils.unit_data_format import (
    UNIT_DATA_FORMAT_CATALOG_KEY,
    enrich_unit_format_catalog_for_client,
    filter_catalog_for_selectable,
)
from apps.app_db.services.ut_dw_config_writer import upsert_ut_dw_config

logger = logging.getLogger(__name__)

REDACTED_KEY_CODES: frozenset[str] = frozenset({"AI_API_KEY"})
REDACTED_PLACEHOLDER = "****"

B64_ENCODED_KEY_CODES: frozenset[str] = frozenset({"AI_API_KEY"})
_B64_PREFIX = "b64:"


def _redact_sensitive_values(
    config: dict[str, dict[str, Optional[str] | bool]],
) -> dict[str, dict[str, Optional[str] | bool]]:
    """Replace real values of sensitive keys with a placeholder so they are never exposed via GET."""
    for key_code in REDACTED_KEY_CODES:
        if key_code in config and config[key_code].get("value"):
            config[key_code] = {**config[key_code], "value": REDACTED_PLACEHOLDER}
    return config


def _decode_b64_value(value: str) -> str:
    """If *value* starts with the ``b64:`` marker, base64-decode it and return the UTF-8 string."""
    if value.startswith(_B64_PREFIX):
        return base64.b64decode(value[len(_B64_PREFIX):]).decode("utf-8")
    return value


def _core_config_all_keys(db: Session, app_key: str) -> dict[str, dict[str, Optional[str] | bool]]:
    rows = (
        db.query(
            SystemConfiguration.key_code,
            SystemConfiguration.key_value,
            SystemConfiguration.description,
            SystemConfiguration.is_system,
        )
        .filter(SystemConfiguration.app_key == app_key)
        .all()
    )
    return {
        r.key_code: {
            "value": r.key_value,
            "description": r.description,
            "is_system": bool(r.is_system),
        }
        for r in rows
    }


def _merged_config_for_dw(
    db: Session,
    app_key: str,
    warehouse_by_key: Optional[dict[str, dict[str, Optional[str]]]],
) -> dict[str, dict[str, Optional[str] | bool]]:
    """
    Merge system_configuration with optional warehouse db_configuration.
    Keys in IS_DW_MIRROR_KEY_CODES use warehouse values when `warehouse_by_key` is not None and the key exists there;
    otherwise they use the core row when present. Mirrored keys that exist only in the warehouse are included from
    `warehouse_by_key`. All other keys always use the core row (warehouse-only non-mirror keys are not added).
    """
    rows = (
        db.query(SystemConfiguration)
        .filter(SystemConfiguration.app_key == app_key)
        .all()
    )
    out: dict[str, dict[str, Optional[str] | bool]] = {}
    for row in rows:
        if (
            is_dw_mirror_key(row.key_code)
            and warehouse_by_key is not None
            and row.key_code in warehouse_by_key
        ):
            w = warehouse_by_key[row.key_code]
            out[row.key_code] = {
                "value": w.get("value"),
                "description": w.get("description"),
                "is_system": bool(row.is_system),
            }
        else:
            out[row.key_code] = {
                "value": row.key_value,
                "description": row.description,
                "is_system": bool(row.is_system),
            }
    if warehouse_by_key is not None:
        for key_code, w in warehouse_by_key.items():
            if is_dw_mirror_key(key_code) and key_code not in out:
                out[key_code] = {
                    "value": w.get("value"),
                    "description": w.get("description"),
                    "is_system": False,
                }
    return out


def _filter_config_dict_by_is_system(
    config: dict[str, dict[str, Optional[str] | bool]],
    is_system: Optional[bool],
) -> dict[str, dict[str, Optional[str] | bool]]:
    """When ``is_system`` is set, keep only keys whose ``is_system`` flag matches (coerced to bool)."""
    if is_system is None:
        return config
    return {
        k: v
        for k, v in config.items()
        if bool(v.get("is_system")) is is_system
    }


def _apply_unit_format_catalog_scope(
    config: dict[str, dict[str, Optional[str] | bool]],
    *,
    unit_format_catalog_full: bool,
) -> dict[str, dict[str, Optional[str] | bool]]:
    """Scope catalog for client; enrich currency entries with symbols from unit_format_registry."""
    entry = config.get(UNIT_DATA_FORMAT_CATALOG_KEY)
    if not entry:
        return config
    raw_value = entry.get("value")
    if not isinstance(raw_value, str) or not raw_value.strip():
        return config
    try:
        raw_catalog = json.loads(raw_value)
    except json.JSONDecodeError:
        return config
    if not isinstance(raw_catalog, dict):
        return config
    if unit_format_catalog_full:
        scoped_catalog = raw_catalog
    else:
        scoped_catalog = filter_catalog_for_selectable(raw_catalog)
    enriched = enrich_unit_format_catalog_for_client(scoped_catalog)
    return {
        **config,
        UNIT_DATA_FORMAT_CATALOG_KEY: {
            **entry,
            "value": json.dumps(enriched, ensure_ascii=False, separators=(",", ":")),
        },
    }


class AppConfigService:
    """
    Service for application configuration lookup:
    - Get configurations by application keyword (app_key).
    """

    def get_config_by_keyword(
        self,
        keyword: str,
        dw_id: Optional[int] = None,
        is_system: Optional[bool] = None,
        unit_format_catalog_full: bool = False,
    ) -> Optional[dict[str, dict[str, Optional[str] | bool]]]:
        """
        Get configuration entries for an application by its app_key (keyword).

        1. Look up system_applications where app_key = keyword.
        2. If dw_id is None: query all system_configuration rows for that app_key.
        3. If dw_id is set: merge system_configuration with db_configuration for warehouse-mirrored keys
           (warehouse overrides when present); on failure or non-MySQL, use system_configuration only.
        4. If is_system is True or False, restrict results to keys with that ``is_system`` flag.

        Args:
            keyword: Application key (app_key) to look up.
            dw_id: Optional warehouse id; when set, merge warehouse db_configuration for mirrored keys.
            is_system: When set, return only entries whose ``is_system`` matches this value.

        Returns:
            Dict mapping each key_code to its value/description object, or None if
            no application exists with the given app_key.
        """
        db: Session = SessionLocal()
        try:
            app = (
                db.query(SystemApplication)
                .filter(SystemApplication.app_key == keyword)
                .first()
            )
            if not app:
                return None

            if dw_id is None:
                raw = _core_config_all_keys(db, app.app_key)
            else:
                dw_svc = SystemDatawarehouseService()
                conn_params = dw_svc.get_mysql_warehouse_connection_params(dw_id)
                warehouse: Optional[dict[str, dict[str, Optional[str]]]] = None
                if conn_params:
                    try:
                        warehouse = fetch_ut_dw_configs(app.app_key, conn_params)
                    except Exception as e:
                        logger.warning(
                            "fetch_ut_dw_configs failed for dw_id=%s app_key=%s: %s",
                            dw_id,
                            app.app_key,
                            e,
                        )

                raw = _merged_config_for_dw(db, app.app_key, warehouse)

            # Overlay platform-wide global keys from DFA_CORE.
            if app.app_key != PLATFORM_CONFIG_APP_KEY:
                global_config = _core_config_all_keys(db, PLATFORM_CONFIG_APP_KEY)
                for kc in GLOBAL_CONFIG_KEY_CODES:
                    if kc in global_config:
                        raw[kc] = global_config[kc]

            filtered = _filter_config_dict_by_is_system(raw, is_system)
            scoped = _apply_unit_format_catalog_scope(
                filtered,
                unit_format_catalog_full=unit_format_catalog_full,
            )
            return _redact_sensitive_values(scoped)
        finally:
            db.close()

    def patch_config_by_app_key(
        self,
        app_key: str,
        payload: dict[str, AppConfigPatchItemSchema],
        dw_id: Optional[int] = None,
    ) -> Optional[dict[str, object]]:
        """
        Update existing configuration keys for the given app_key.

        Only keys that already exist for the application are updated in system_configuration,
        except when ``dw_id`` is set: warehouse-mirrored keys in the payload are written to
        the warehouse ``db_configuration`` table instead of system_configuration (e.g. ``DW_MAPS``
        under app_key ``DFA_VIZ``).

        Missing keys are ignored and returned in the response payload.
        """
        db: Session = SessionLocal()
        try:
            app = (
                db.query(SystemApplication)
                .filter(SystemApplication.app_key == app_key)
                .first()
            )
            if not app:
                return None

            requested_by_key = payload
            warehouse_keys: dict[str, AppConfigPatchItemSchema] = {}
            global_keys: dict[str, AppConfigPatchItemSchema] = {}
            system_keys: dict[str, AppConfigPatchItemSchema] = {}

            for key_code, item in requested_by_key.items():
                if is_global_config_key(key_code):
                    global_keys[key_code] = item
                elif dw_id is not None and is_dw_mirror_key(key_code):
                    warehouse_keys[key_code] = item
                else:
                    system_keys[key_code] = item

            updated_keys: set[str] = set()
            updated_count = 0

            # Update platform-wide keys on DFA_CORE.
            if global_keys:
                global_rows = (
                    db.query(SystemConfiguration)
                    .filter(
                        SystemConfiguration.app_key == PLATFORM_CONFIG_APP_KEY,
                        SystemConfiguration.key_code.in_(list(global_keys.keys())),
                    )
                    .all()
                )
                for row in global_rows:
                    item = global_keys[row.key_code]
                    row.key_value = item.value
                    if item.description is not None:
                        row.description = item.description
                    if item.is_system is not None:
                        row.is_system = item.is_system
                    updated_keys.add(row.key_code)
                    updated_count += 1
                db.commit()

            if system_keys:
                existing_rows = (
                    db.query(SystemConfiguration)
                    .filter(
                        SystemConfiguration.app_key == app.app_key,
                        SystemConfiguration.key_code.in_(list(system_keys.keys())),
                    )
                    .all()
                )
                for row in existing_rows:
                    item = system_keys[row.key_code]
                    value = item.value
                    if row.key_code in B64_ENCODED_KEY_CODES:
                        value = _decode_b64_value(value)
                    row.key_value = value
                    row.description = item.description
                    if item.is_system is not None:
                        row.is_system = item.is_system
                    updated_keys.add(row.key_code)
                    updated_count += 1
                db.commit()

            if warehouse_keys and dw_id is not None:
                dw_svc = SystemDatawarehouseService()
                conn_params = dw_svc.get_mysql_warehouse_connection_params(dw_id)
                if not conn_params:
                    logger.warning(
                        "patch_config_by_app_key: no MySQL connection for dw_id=%s; "
                        "warehouse keys not updated: %s",
                        dw_id,
                        sorted(warehouse_keys.keys()),
                    )
                else:
                    core_rows_by_code = {
                        r.key_code: r
                        for r in db.query(SystemConfiguration)
                        .filter(
                            SystemConfiguration.app_key == app.app_key,
                            SystemConfiguration.key_code.in_(list(warehouse_keys.keys())),
                        )
                        .all()
                    }
                    for key_code, item in warehouse_keys.items():
                        if key_code not in core_rows_by_code:
                            continue
                        core_row = core_rows_by_code[key_code]
                        value = item.value
                        if key_code in B64_ENCODED_KEY_CODES:
                            value = _decode_b64_value(value)
                        description = (
                            item.description
                            if item.description is not None
                            else core_row.description
                        )
                        try:
                            if upsert_ut_dw_config(
                                conn_params,
                                key_code,
                                value,
                                description,
                            ):
                                updated_keys.add(key_code)
                                updated_count += 1
                        except Exception as e:
                            logger.warning(
                                "upsert_ut_dw_config failed for dw_id=%s key=%s: %s",
                                dw_id,
                                key_code,
                                e,
                            )

            if "UNIT_DATA_FORMAT_CATALOG" in updated_keys:
                from apps.datawarehouse.utils.unit_data_format import (
                    clear_unit_format_catalog_cache,
                )

                clear_unit_format_catalog_cache()

            missing_keys = sorted(set(requested_by_key.keys()) - updated_keys)
            return {
                "requested_count": len(requested_by_key),
                "updated_count": updated_count,
                "updated_keys": sorted(updated_keys),
                "missing_keys": missing_keys,
            }
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
