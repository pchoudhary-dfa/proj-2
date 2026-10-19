"""
Seed system_configurations for a given app_key (system_applications.app_key).

Run from project root:
    python apps/app_db/scripts/seed_configuration.py
    python apps/app_db/scripts/seed_configuration.py --app_key DFA_VIZ
    python apps/app_db/scripts/seed_configuration.py --app_key DFA_VIZ --force
    python apps/app_db/scripts/seed_configuration.py --app_key DFA_VIZ --create-app --app-name "DFA Visualizer"

Seed data is loaded from: apps/app_db/data/config.json

UNIT_DATA_FORMAT_CATALOG for DFA_DM is injected from apps/app_db/data/unit_data_format_catalog.json
(format codes for number_formats and ISO 4217 currencies; UI labels from translations). Formatting
rules live in API code. Use
--refresh-unit-format-catalog to upsert that key without reseeding all DFA_DM config.

By default (no --app_key/--app_key), this script seeds all app_keys present in that file.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

# Project root
project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.constants.system_config import is_system_config_key
from apps.app_db.db.core import SessionLocal
from apps.app_db.models.core import SystemApplication, SystemConfiguration
from apps.shared.config.config import settings


DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CONFIG_PATH = DATA_DIR / "config.json"
UNIT_DATA_FORMAT_CATALOG_PATH = DATA_DIR / "unit_data_format_catalog.json"
UNIT_DATA_FORMAT_CATALOG_KEY = "UNIT_DATA_FORMAT_CATALOG"
_SYSTEM_CONFIG_DESCRIPTION_MAX_LEN = 255


def _truncate_config_description(description: Optional[str]) -> Optional[str]:
    if description is None:
        return None
    s = str(description)
    if len(s) <= _SYSTEM_CONFIG_DESCRIPTION_MAX_LEN:
        return s
    return s[: _SYSTEM_CONFIG_DESCRIPTION_MAX_LEN - 1] + "…"


# Maps the canonical JSON keys in config.json to their settings-resolved values.
# When DFA_VIZ_APP_KEY (etc.) is overridden in .env, every seed script picks up
# the correct effective key without touching the JSON file.
_KEY_ALIASES: dict[str, str] = {
    "DFA_VIZ":  settings.DFA_VIZ_APP_KEY,
    "DFA_DASH": settings.DFA_DASH_APP_KEY,
    "DFA_DM":   settings.DFA_DM_APP_KEY,
    "DFA_CORE": settings.DFA_CORE_APP_KEY,
}


def _load_unit_data_format_catalog_value() -> str:
    """Compact JSON for UNIT_DATA_FORMAT_CATALOG (see unit_data_format_catalog.json)."""
    data = json.loads(UNIT_DATA_FORMAT_CATALOG_PATH.read_text(encoding="utf-8"))
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def _inject_unit_data_format_catalog(
    configs: dict[str, dict[str, Optional[str]]],
) -> None:
    if UNIT_DATA_FORMAT_CATALOG_KEY not in configs:
        return
    configs[UNIT_DATA_FORMAT_CATALOG_KEY] = {
        **configs[UNIT_DATA_FORMAT_CATALOG_KEY],
        "value": _load_unit_data_format_catalog_value(),
    }


def _load_default_configs() -> dict[str, dict[str, dict[str, Optional[str]]]]:
    raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid config.json format at {CONFIG_PATH}. Expected an object keyed by app_key.")
    parsed: dict[str, dict[str, dict[str, Optional[str]]]] = {}
    for app_key, cfg in raw.items():
        if not isinstance(cfg, dict):
            raise ValueError(f"Invalid config for app_key={app_key}. Expected an object of key/value pairs.")
        effective_key = _KEY_ALIASES.get(str(app_key), str(app_key))
        normalized_cfg: dict[str, dict[str, Optional[str]]] = {}
        for k, v in cfg.items():
            key_code = str(k)
            if isinstance(v, dict):
                value = v.get("value")
                description = v.get("description")
                normalized_cfg[key_code] = {
                    "value": "" if value is None else str(value),
                    "description": None if description is None else str(description),
                }
            else:
                # Backward compatibility for legacy config format where value is a string.
                normalized_cfg[key_code] = {
                    "value": "" if v is None else str(v),
                    "description": None,
                }
        if effective_key == settings.DFA_DM_APP_KEY:
            _inject_unit_data_format_catalog(normalized_cfg)
        parsed[effective_key] = normalized_cfg
    return parsed


def get_or_create_app_id(
    db, app_key: str, app_name: Optional[str], create_if_missing: bool
) -> Optional[int]:
    app = db.query(SystemApplication).filter(SystemApplication.app_key == app_key).first()
    if app:
        return app.id
    if not create_if_missing:
        return None
    name = app_name or app_key
    app = SystemApplication(
        app_key=app_key,
        name=name,
        link=None,
        is_active="1",
    )
    db.add(app)
    db.flush()
    return app.id


def seed_unit_data_format_catalog(
    app_key: Optional[str] = None,
    *,
    dry_run: bool = False,
) -> None:
    """
    Insert or update UNIT_DATA_FORMAT_CATALOG from unit_data_format_catalog.json.
    Use when the row is missing or still has a legacy generic CURRENCY / empty currencies list.
    """
    app_key = app_key or settings.DFA_DM_APP_KEY
    if not UNIT_DATA_FORMAT_CATALOG_PATH.is_file():
        raise FileNotFoundError(f"Catalog file not found: {UNIT_DATA_FORMAT_CATALOG_PATH}")

    catalog = json.loads(UNIT_DATA_FORMAT_CATALOG_PATH.read_text(encoding="utf-8"))
    value = _load_unit_data_format_catalog_value()
    n_fmt = len(catalog.get("number_formats") or [])
    n_cur = len(catalog.get("currencies") or [])

    defaults = _load_default_configs()
    dm_cfg = defaults.get(app_key) or {}
    meta = dm_cfg.get(UNIT_DATA_FORMAT_CATALOG_KEY) or {}
    description = meta.get("description")

    db = SessionLocal()
    try:
        app = db.query(SystemApplication).filter(SystemApplication.app_key == app_key).first()
        if not app:
            print(f"Application with app_key '{app_key}' not found.")
            return

        row = (
            db.query(SystemConfiguration)
            .filter(
                SystemConfiguration.app_key == app_key,
                SystemConfiguration.key_code == UNIT_DATA_FORMAT_CATALOG_KEY,
            )
            .first()
        )
        action = "update" if row else "insert"
        if dry_run:
            print(
                f"[Dry run] Would {action} {UNIT_DATA_FORMAT_CATALOG_KEY} for app_key={app_key}: "
                f"{n_fmt} number_formats, {n_cur} currencies (e.g. USD, INR)"
            )
            return

        if row:
            row.key_value = value
        else:
            db.add(
                SystemConfiguration(
                    app_key=app_key,
                    key_code=UNIT_DATA_FORMAT_CATALOG_KEY,
                    key_value=value,
                    description=_truncate_config_description(description),
                    is_system=is_system_config_key(UNIT_DATA_FORMAT_CATALOG_KEY),
                )
            )
        db.commit()
        print(
            f"{action.capitalize()}d {UNIT_DATA_FORMAT_CATALOG_KEY} for app_key='{app_key}': "
            f"{n_fmt} number_formats, {n_cur} ISO currency codes."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def seed_dynamic_subgroup_configs(app_key: str, *, force: bool, dry_run: bool) -> None:
    """
    Dynamically seed subgroup configuration values from settings (environment variables).
    This ensures the database configuration matches the current environment settings.
    """
    db = SessionLocal()
    try:
        # Dynamic configuration from settings (reads from environment variables)
        dynamic_configs = {
            "DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID": {
                "value": settings.DW_SYSTEM_SUBGROUP_CATG_OTHERS_GID,
                "description": "GID for Others subgroup category type"
            },
            "DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID": {
                "value": settings.DW_SYSTEM_SUBGROUP_CATG_TOTAL_GID,
                "description": "GID for Total subgroup category type"
            },
            "DEFAULT_SYSTEM_DW_SUBGROUP_GID": {
                "value": settings.DEFAULT_SYSTEM_DW_SUBGROUP_GID,
                "description": "Default system subgroup value GID"
            }
        }

        if dry_run:
            existing = (
                db.query(SystemConfiguration.key_code)
                .filter(SystemConfiguration.app_key == app_key)
                .all()
            )
            existing_keys = {r.key_code for r in existing}
            would_insert = [k for k in dynamic_configs.keys() if k not in existing_keys]
            would_skip = [k for k in dynamic_configs.keys() if k in existing_keys]
            mode = "force (wipe + insert)" if force else "insert-only (skip existing)"
            print(
                f"[Dry run] Would seed {len(dynamic_configs)} dynamic subgroup configurations for app_key={app_key} "
                f"using mode: {mode}"
            )
            print(f"          Would insert: {len(would_insert)}; would skip (existing): {len(would_skip)}")
            return

        if force:
            # Delete existing subgroup config entries
            deleted = (
                db.query(SystemConfiguration)
                .filter(
                    SystemConfiguration.app_key == app_key,
                    SystemConfiguration.key_code.in_(list(dynamic_configs.keys()))
                )
                .delete(synchronize_session=False)
            )
            
            # Insert all dynamic configs
            inserted = 0
            for key_code, key_data in dynamic_configs.items():
                db.add(
                    SystemConfiguration(
                        app_key=app_key,
                        key_code=key_code,
                        key_value=key_data["value"],
                        description=key_data["description"],
                        is_system=is_system_config_key(key_code),
                    )
                )
                inserted += 1
            db.commit()
            print(
                f"Seeded dynamic subgroup configurations for app_key='{app_key}' using --force. "
                f"Deleted {deleted} existing rows and inserted {inserted} rows."
            )
        else:
            # Insert-only mode: skip existing keys
            keys = list(dynamic_configs.keys())
            existing_rows = (
                db.query(SystemConfiguration)
                .filter(
                    SystemConfiguration.app_key == app_key,
                    SystemConfiguration.key_code.in_(keys),
                )
                .all()
            )
            existing_by_key = {row.key_code: row for row in existing_rows}

            inserted = 0
            skipped = 0
            for key_code, key_data in dynamic_configs.items():
                if key_code not in existing_by_key:
                    db.add(
                        SystemConfiguration(
                            app_key=app_key,
                            key_code=key_code,
                            key_value=key_data["value"],
                            description=key_data["description"],
                            is_system=is_system_config_key(key_code),
                        )
                    )
                    inserted += 1
                else:
                    skipped += 1

            db.commit()
            print(
                f"Seeded dynamic subgroup configurations for app_key='{app_key}' using insert-only. "
                f"Inserted {inserted}, skipped {skipped} (existing keys left unchanged)."
            )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def seed(
    app_key: str,
    *,
    force: bool,
    app_name: Optional[str],
    create_app: bool,
    dry_run: bool,
    configs_by_app_key: dict[str, dict[str, dict[str, Optional[str]]]],
) -> None:
    db = SessionLocal()
    try:
        app_id = get_or_create_app_id(db, app_key, app_name, create_app)
        if app_id is None:
            print(f"Application with app_key '{app_key}' not found in system_applications.")
            print("Add the app first or run with --create-app and --app-name <name>.")
            return

        configs = configs_by_app_key.get(app_key)
        if configs is None:
            available = ", ".join(sorted(configs_by_app_key.keys()))
            print(f"No default config set is defined for app_key '{app_key}' in {CONFIG_PATH}.")
            print(f"Available defaults: {available}")
            return

        if dry_run:
            existing = (
                db.query(SystemConfiguration.key_code)
                .filter(SystemConfiguration.app_key == app_key)
                .all()
            )
            existing_keys = {r.key_code for r in existing}
            would_insert = [k for k in configs.keys() if k not in existing_keys]
            would_skip = [k for k in configs.keys() if k in existing_keys]
            mode = "force (wipe + insert)" if force else "insert-only (skip existing)"
            print(
                f"[Dry run] Would seed {len(configs)} configurations for app_key={app_key}, app_id={app_id} "
                f"using mode: {mode}"
            )
            print(f"          Would insert: {len(would_insert)}; would skip (existing): {len(would_skip)}")
            
            # Additional step: dry run for dynamic subgroup configurations for DFA_DM
            if app_key == settings.DFA_DM_APP_KEY:
                print(f"\n--- Dynamic subgroup configurations for {app_key} (dry run) ---")
                seed_dynamic_subgroup_configs(app_key, force=force, dry_run=True)
            return

        if force:
            deleted = (
                db.query(SystemConfiguration)
                .filter(SystemConfiguration.app_key == app_key)
                .delete(synchronize_session=False)
            )
            inserted = 0
            for key_code, key_data in configs.items():
                db.add(
                    SystemConfiguration(
                        app_key=app_key,
                        key_code=key_code,
                        key_value=key_data["value"] or "",
                        description=key_data["description"],
                        is_system=is_system_config_key(key_code),
                    )
                )
                inserted += 1
            db.commit()
            print(
                f"Seeded configurations for app_key='{app_key}' (app_id={app_id}) using --force. "
                f"Deleted {deleted} existing rows and inserted {inserted} rows."
            )
            
            # Additional step: seed dynamic subgroup configurations for DFA_DM
            if app_key == settings.DFA_DM_APP_KEY:
                print(f"\n--- Seeding dynamic subgroup configurations for {app_key} ---")
                seed_dynamic_subgroup_configs(app_key, force=force, dry_run=False)
            return

        keys = list(configs.keys())
        existing_rows = (
            db.query(SystemConfiguration)
            .filter(
                SystemConfiguration.app_key == app_key,
                SystemConfiguration.key_code.in_(keys),
            )
            .all()
        )
        existing_by_key: dict[str, SystemConfiguration] = {row.key_code: row for row in existing_rows}

        inserted = 0
        skipped = 0
        overwrite_skipped = 0
        for key_code, key_data in configs.items():
            row = existing_by_key.get(key_code)
            if row is None:
                db.add(
                    SystemConfiguration(
                        app_key=app_key,
                        key_code=key_code,
                        key_value=key_data["value"] or "",
                        description=key_data["description"],
                        is_system=is_system_config_key(key_code),
                    )
                )
                inserted += 1
            else:
                skipped += 1
                # Non-force mode is strictly insert-only: never overwrite existing values.
                if (row.key_value or "") != (key_data["value"] or ""):
                    overwrite_skipped += 1

        db.commit()
        print(
            f"Seeded configurations for app_key='{app_key}' (app_id={app_id}) using insert-only. "
            f"Inserted {inserted}, skipped {skipped} (existing keys left unchanged). "
            f"Overwrite-skipped due to existing key/value differences: {overwrite_skipped}."
        )
        
        # Additional step: seed dynamic subgroup configurations for DFA_DM
        if app_key == settings.DFA_DM_APP_KEY:
            print(f"\n--- Seeding dynamic subgroup configurations for {app_key} ---")
            seed_dynamic_subgroup_configs(app_key, force=force, dry_run=False)
            
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed app-specific configurations (system_configurations) for an app_key."
    )
    parser.add_argument(
        "--app_key",
        default=None,
        help="Application key from system_applications. If omitted, seeds all default app config sets.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Remove ALL existing config rows for this app_key and insert only the provided seed set.",
    )
    parser.add_argument(
        "--app-name",
        default=None,
        help="Application name (used only when creating app with --create-app).",
    )
    parser.add_argument(
        "--create-app",
        action="store_true",
        help="Create system_application row if app_key does not exist.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print what would be done, do not write to DB.",
    )
    parser.add_argument(
        "--refresh-unit-format-catalog",
        action="store_true",
        help=(
            "Insert or update UNIT_DATA_FORMAT_CATALOG from unit_data_format_catalog.json "
            f"(default app_key: {settings.DFA_DM_APP_KEY}). Does not touch other config keys."
        ),
    )
    args = parser.parse_args()

    if args.refresh_unit_format_catalog:
        seed_unit_data_format_catalog(
            app_key=args.app_key or settings.DFA_DM_APP_KEY,
            dry_run=args.dry_run,
        )
        return

    configs_by_app_key = _load_default_configs()
    if args.app_key is None:
        app_keys = sorted(configs_by_app_key.keys())
        if not app_keys:
            print(f"No default app configuration sets are defined in {CONFIG_PATH}.")
            return

        print(f"Seeding configurations for all default apps: {', '.join(app_keys)}")
        for app_key in app_keys:
            seed(
                app_key=app_key,
                force=args.force,
                app_name=args.app_name,
                create_app=args.create_app,
                dry_run=args.dry_run,
                configs_by_app_key=configs_by_app_key,
            )
        return

    seed(
        app_key=args.app_key,
        force=args.force,
        app_name=args.app_name,
        create_app=args.create_app,
        dry_run=args.dry_run,
        configs_by_app_key=configs_by_app_key,
    )


if __name__ == "__main__":
    main()

