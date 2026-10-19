"""
Seed translations for system_language_translations and system_language_translations_i18n.

Seeds app-specific translations (by app_key from system_applications) with English
as default and Hindi (hi) in i18n. Optionally creates the application row if missing.

Run from project root:
    python apps/app_db/scripts/seed_translations.py  # seeds all app_keys in translations.json
    python apps/app_db/scripts/seed_translations.py --app_key DFA_VIZ
    python apps/app_db/scripts/seed_translations.py --app_key DFA_VIZ --create-app --app-name "DFA Visualizer"
    python apps/app_db/scripts/seed_translations.py --app_key DFA_VIZ --force
    python apps/app_db/scripts/seed_translations.py --app_key DFA_VIZ --locale hi
    python apps/app_db/scripts/seed_translations.py --app_key DFA_VIZ --locale en,hi
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Project root
project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal
from apps.app_db.models.core import (
    SystemApplication,
    SystemLanguageTranslation,
    SystemLanguageTranslationI18n,
)
from apps.shared.config.config import settings

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
TRANSLATIONS_PATH = DATA_DIR / "translations.json"

# Maps canonical JSON keys in translations.json to their settings-resolved values.
# The empty-string key ("") is the global/shared bucket and is never aliased.
_KEY_ALIASES: dict[str, str] = {
    "DFA_VIZ":  settings.DFA_VIZ_APP_KEY,
    "DFA_DASH": settings.DFA_DASH_APP_KEY,
    "DFA_DM":   settings.DFA_DM_APP_KEY,
}


def _load_app_translations(app_key: str) -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    raw = json.loads(TRANSLATIONS_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid translations.json format at {TRANSLATIONS_PATH}. Expected an object keyed by app_key.")

    # Remap top-level JSON keys through _KEY_ALIASES so the caller always works
    # with settings-resolved effective keys, not the hardcoded JSON strings.
    remapped = {_KEY_ALIASES.get(str(k), str(k)): v for k, v in raw.items()}

    app = remapped.get(app_key)
    if app is None:
        available = ", ".join(sorted(remapped.keys()))
        raise ValueError(f"No translations found for app_key '{app_key}' in {TRANSLATIONS_PATH}. Available: {available}")
    if not isinstance(app, dict):
        raise ValueError(f"Invalid translations entry for app_key '{app_key}'. Expected an object.")

    default = app.get("default")
    if not isinstance(default, dict):
        raise ValueError(f"Invalid translations for app_key '{app_key}'. Expected 'default' object of code->text.")
    default_map = {str(k): "" if v is None else str(v) for k, v in default.items()}

    locales_raw = app.get("locales", {})
    if not isinstance(locales_raw, dict):
        raise ValueError(f"Invalid translations for app_key '{app_key}'. Expected 'locales' object.")
    locales_map: dict[str, dict[str, str]] = {}
    for locale, mapping in locales_raw.items():
        if not isinstance(mapping, dict):
            raise ValueError(f"Invalid locale mapping for app_key '{app_key}', locale '{locale}'. Expected object.")
        locales_map[str(locale)] = {str(k): "" if v is None else str(v) for k, v in mapping.items()}

    # Always provide 'en' from defaults (unless explicitly present in locales).
    locales_map.setdefault("en", default_map)
    return default_map, locales_map


def _parse_locales(locales: Optional[list[str]], available_locales: list[str]) -> list[str]:
    if not locales:
        return available_locales
    parsed: list[str] = []
    for entry in locales:
        for part in str(entry).split(","):
            loc = part.strip()
            if not loc:
                continue
            if loc not in parsed:
                parsed.append(loc)
    return parsed


def ensure_app_exists(
    db, app_key: str, app_name: Optional[str], create_if_missing: bool
) -> bool:
    """Verify app_key exists in system_application. If missing and create_if_missing, create it. Returns True if present."""
    app = db.query(SystemApplication).filter(SystemApplication.app_key == app_key).first()
    if app:
        return True
    if not create_if_missing:
        return False
    name = app_name or app_key
    app = SystemApplication(
        app_key=app_key,
        name=name,
        link=None,
        is_active="1",
    )
    db.add(app)
    db.flush()
    return True


def seed(
    app_key: str,
    app_name: Optional[str],
    create_app: bool,
    dry_run: bool,
    force: bool,
    locales: Optional[list[str]],
) -> None:
    db = SessionLocal()
    try:
        # Special case: empty app_key means "global" translations seeded with app_key = NULL.
        effective_app_key: Optional[str] = None
        if app_key != "":
            if not ensure_app_exists(db, app_key, app_name, create_app):
                print(f"Application with app_key '{app_key}' not found in system_applications.")
                print("Add the app first or run with --create-app and --app-name <name>.")
                return
            effective_app_key = app_key

        default_translations, i18n_translations = _load_app_translations(app_key)
        app_translations = list(default_translations.items())
        available_locales = sorted(i18n_translations.keys())
        if dry_run:
            selected_locales = _parse_locales(locales, available_locales=available_locales)
            mode = "force (wipe + insert)" if force else "insert-only (skip existing)"
            print(f"[Dry run] Would seed {len(app_translations)} translations for app_key={app_key}, app_key={effective_app_key}")
            print(f"          Mode: {mode}")
            print(f"          Locales: {selected_locales}")
            return

        codes_list = list(default_translations.keys())
        selected_locales = _parse_locales(locales, available_locales=available_locales)
        unknown_locales = [l for l in selected_locales if l not in i18n_translations]
        if unknown_locales:
            known = ", ".join(available_locales)
            raise ValueError(f"Unknown locale(s): {unknown_locales}. Known locales: {known}")

        if force:
            # Wipe + insert for the seed set (all locales for these codes)
            master_ids_subq = db.query(SystemLanguageTranslation.id).filter(
                SystemLanguageTranslation.app_key == effective_app_key,
                SystemLanguageTranslation.trans_code.in_(codes_list),
            )
            db.query(SystemLanguageTranslationI18n).filter(
                SystemLanguageTranslationI18n.master_id.in_(master_ids_subq)
            ).delete(synchronize_session=False)
            db.query(SystemLanguageTranslation).filter(
                SystemLanguageTranslation.app_key == effective_app_key,
                SystemLanguageTranslation.trans_code.in_(codes_list),
            ).delete(synchronize_session=False)

            for code, default_text in app_translations:
                db.add(
                    SystemLanguageTranslation(
                        trans_code=code,
                        app_key=effective_app_key,
                        default_text=default_text,
                        created_user_id=0,
                        created=datetime.now(timezone.utc).replace(tzinfo=None),
                    )
                )
            db.flush()

            app_masters = (
                db.query(SystemLanguageTranslation)
                .filter(
                    SystemLanguageTranslation.app_key == effective_app_key,
                    SystemLanguageTranslation.trans_code.in_(codes_list),
                )
                .all()
            )
            code_to_id = {m.trans_code: m.id for m in app_masters}

            for locale in selected_locales:
                code_to_text = i18n_translations.get(locale, {})
                for code, translated_text in code_to_text.items():
                    master_id = code_to_id.get(code)
                    if master_id is None:
                        continue
                    db.add(
                        SystemLanguageTranslationI18n(
                            master_id=master_id,
                            locale=locale,
                            translated_text=translated_text,
                        )
                    )

            db.commit()
            print(
                f"Seeded {len(app_masters)} translations for app_key='{app_key}' (app_key={effective_app_key}) "
                f"using --force with locales: {selected_locales}."
            )
            return

        # Insert-only: add new master codes only; skip existing (leave user changes unchanged)
        desired_default_text = default_translations
        existing_masters = (
            db.query(SystemLanguageTranslation)
            .filter(
                SystemLanguageTranslation.app_key == effective_app_key,
                SystemLanguageTranslation.trans_code.in_(codes_list),
            )
            .all()
        )
        masters_by_code: dict[str, list[SystemLanguageTranslation]] = {}
        for m in existing_masters:
            masters_by_code.setdefault(m.trans_code, []).append(m)

        inserted_masters = 0
        skipped_masters = 0
        overwrite_skipped_masters = 0

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for code in codes_list:
            default_text = desired_default_text.get(code)
            if default_text is None:
                continue
            rows = masters_by_code.get(code, [])
            if not rows:
                db.add(
                    SystemLanguageTranslation(
                        trans_code=code,
                        app_key=effective_app_key,
                        default_text=default_text,
                        created_user_id=0,
                        created=now,
                    )
                )
                inserted_masters += 1
            else:
                skipped_masters += 1
                # Non-force mode is strictly insert-only: never overwrite default_text.
                if any((m.default_text or "") != default_text for m in rows):
                    overwrite_skipped_masters += 1

        db.flush()

        app_masters = (
            db.query(SystemLanguageTranslation)
            .filter(
                SystemLanguageTranslation.app_key == effective_app_key,
                SystemLanguageTranslation.trans_code.in_(codes_list),
            )
            .all()
        )
        code_to_id = {m.trans_code: m.id for m in app_masters}
        master_ids = list(code_to_id.values())

        # Insert-only i18n for selected locales: add new (master_id, locale) only; skip existing
        existing_i18n_rows = (
            db.query(SystemLanguageTranslationI18n)
            .filter(
                SystemLanguageTranslationI18n.master_id.in_(master_ids),
                SystemLanguageTranslationI18n.locale.in_(selected_locales),
            )
            .all()
        )
        i18n_by_key: dict[tuple[int, str], SystemLanguageTranslationI18n] = {
            (r.master_id, r.locale): r for r in existing_i18n_rows
        }

        inserted_i18n = 0
        skipped_i18n = 0
        overwrite_skipped_i18n = 0

        for locale in selected_locales:
            code_to_text = i18n_translations.get(locale, {})
            for code in codes_list:
                translated_text = code_to_text.get(code)
                if translated_text is None:
                    continue
                master_id = code_to_id.get(code)
                if master_id is None:
                    continue
                key = (master_id, locale)
                existing = i18n_by_key.get(key)
                if existing is None:
                    db.add(
                        SystemLanguageTranslationI18n(
                            master_id=master_id,
                            locale=locale,
                            translated_text=translated_text,
                        )
                    )
                    inserted_i18n += 1
                else:
                    skipped_i18n += 1
                    # Non-force mode is strictly insert-only: never overwrite translated_text.
                    if (existing.translated_text or "") != translated_text:
                        overwrite_skipped_i18n += 1

        db.commit()
        print(
            f"Seeded translations for app_key='{app_key}' (app_key={effective_app_key}) using insert-only. "
            f"Masters inserted {inserted_masters}, skipped {skipped_masters}. "
            f"I18n inserted {inserted_i18n}, skipped {skipped_i18n}. "
            f"Overwrite-skipped masters {overwrite_skipped_masters}, "
            f"overwrite-skipped i18n {overwrite_skipped_i18n}. "
            f"Locales: {selected_locales}."
        )
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


def wipe_all_translations(dry_run: bool) -> None:
    """
    Wipe the full translations dataset (all apps + global):
    - system_language_translations_i18n first (FK -> master)
    - system_language_translations after
    """
    if dry_run:
        print("[Dry run] Would wipe all rows from system_language_translations_i18n and system_language_translations.")
        return

    db = SessionLocal()
    try:
        db.query(SystemLanguageTranslationI18n).delete(synchronize_session=False)
        db.query(SystemLanguageTranslation).delete(synchronize_session=False)
        db.commit()
        print("Wiped all rows from system_language_translations_i18n and system_language_translations.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed translations (system_language_translations + i18n) for an app_key (or all app_keys)."
    )
    parser.add_argument(
        "--app_key",
        default=None,
        help="Application key from system_applications. If omitted, seeds all app_keys from translations.json.",
    )
    parser.add_argument(
        "--app-name",
        default=None,
        help="Application name (used only when creating app with --create-app)",
    )
    parser.add_argument(
        "--create-app",
        action="store_true",
        help="Create system_application row if app_key does not exist",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print what would be done, do not write to DB",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Remove existing seeded rows and insert a fresh seed set (wipe + insert). "
            "If --app_key is omitted (seeding all), this wipes the full translations tables first."
        ),
    )
    parser.add_argument(
        "--locale",
        action="append",
        default=None,
        help="Seed only the given locale(s). Repeatable or comma-separated, e.g. --locale hi or --locale en,hi. "
        "Default: seed all locales defined in this script.",
    )
    args = parser.parse_args()

    if args.app_key is None:
        raw = json.loads(TRANSLATIONS_PATH.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(
                f"Invalid translations.json format at {TRANSLATIONS_PATH}. Expected an object keyed by app_key."
            )
        app_keys = sorted((_KEY_ALIASES.get(str(k), str(k)) for k in raw.keys()), key=lambda k: (k != "", k))

        # If seeding *all* apps with --force, wipe everything first (user expectation: empty + recreate).
        if args.force:
            wipe_all_translations(dry_run=args.dry_run)

        for app_key in app_keys:
            seed(
                app_key=app_key,
                app_name=args.app_name,
                create_app=args.create_app,
                dry_run=args.dry_run,
                force=args.force,
                locales=args.locale,
            )
        return

    seed(
        app_key=args.app_key,
        app_name=args.app_name,
        create_app=args.create_app,
        dry_run=args.dry_run,
        force=args.force,
        locales=args.locale,
    )


if __name__ == "__main__":
    main()
