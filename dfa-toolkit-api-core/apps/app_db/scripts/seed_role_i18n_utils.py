"""Shared helpers for seeding iam_role_i18n across IAM seed scripts."""
from __future__ import annotations

from apps.app_db.models.core import IamRole, IamRoleI18n
from apps.app_db.scripts.app_db.seed_system_language import _DEFAULT_LANGUAGES

_SEED_LOCALES: tuple[str, ...] = tuple(lang["locale"] for lang in _DEFAULT_LANGUAGES)


def validate_role_i18n_data(
    role_i18n: dict[tuple[str, str], dict[str, dict[str, str]]],
    *,
    label: str,
) -> None:
    """Ensure every role has name/description entries for all seed locales."""
    for (app_key, role_code), translations in role_i18n.items():
        missing = [loc for loc in _SEED_LOCALES if loc not in translations]
        if missing:
            raise ValueError(
                f"{label}: app_key={app_key} role_code={role_code} missing locales: {missing}"
            )
        extra = [loc for loc in translations if loc not in _SEED_LOCALES]
        if extra:
            raise ValueError(
                f"{label}: app_key={app_key} role_code={role_code} unexpected locales: {extra}"
            )
        for locale, i18n in translations.items():
            if "name" not in i18n or not i18n["name"]:
                raise ValueError(
                    f"{label}: app_key={app_key} role_code={role_code} locale={locale} missing name"
                )


def seed_role_i18n_entries(
    db,
    role_i18n: dict[tuple[str, str], dict[str, dict[str, str]]],
    *,
    force: bool,
    dry_run: bool,
) -> tuple[int, int]:
    """Seed iam_role_i18n rows for all locales. Returns (inserted_or_updated, skipped)."""
    inserted = skipped = 0
    role_map: dict[tuple[str, str], int] = {
        (role.app_key, role.role_code): role.id
        for role in db.query(IamRole.app_key, IamRole.role_code, IamRole.id).all()
    }

    for (app_key, role_code), translations in role_i18n.items():
        master_id = role_map.get((app_key, role_code))
        if master_id is None:
            print(f"  Skipping i18n for app_key={app_key} role_code={role_code} — role row not found")
            skipped += len(_SEED_LOCALES)
            continue

        for locale, i18n in translations.items():
            existing = (
                db.query(IamRoleI18n)
                .filter_by(master_id=master_id, locale=locale)
                .first()
            )
            if existing:
                if force:
                    if dry_run:
                        print(
                            f"  [dry-run] Would overwrite i18n for app_key={app_key} "
                            f"role_code={role_code} locale={locale}"
                        )
                    else:
                        existing.name = i18n["name"]
                        existing.description = i18n.get("description")
                    inserted += 1
                else:
                    skipped += 1
            else:
                if dry_run:
                    print(
                        f"  [dry-run] Would insert i18n "
                        f"for app_key={app_key} role_code={role_code} locale={locale}"
                    )
                else:
                    db.add(
                        IamRoleI18n(
                            master_id=master_id,
                            locale=locale,
                            name=i18n["name"],
                            description=i18n.get("description"),
                        )
                    )
                inserted += 1

    return inserted, skipped
