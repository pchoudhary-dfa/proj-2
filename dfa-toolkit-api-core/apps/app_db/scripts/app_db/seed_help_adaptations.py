"""
Seed dfahelp_adaptation with default DFA Help adaptations and a root key
for each.

Each adaptation is a top-level namespace that groups help keys for a
specific DFA application (DataManager, Visualizer, etc.).  A root key
(parent_id=NULL) is created per adaptation so the admin tree UI has an
entry point for adding child nodes and content.

Seeds are idempotent — existing rows (matched by code / adaptation_id)
are skipped unless --force is passed, which overwrites them.

Run from project root:
    python apps/app_db/scripts/seed_help_adaptations.py
    python apps/app_db/scripts/seed_help_adaptations.py --force
    python apps/app_db/scripts/seed_help_adaptations.py --dry-run
"""
import argparse
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from apps.app_db.db.core import SessionLocal  # noqa: E402
from apps.app_db.models.help import (  # noqa: E402
    DfaHelpAdaptation,
    DfaHelpAdaptationKey,
    DfaHelpAdaptationKeyI18n,
)

_DEFAULT_ADAPTATIONS: list[dict] = [
    {
        "code": "DFA_DM",
        "name": "DFA Data Manager",
        "desc": "Help content for the DFA Data Manager application.",
        "root_key": "DFA_DM_ROOT",
        "root_title": "Data Manager",
    },
    {
        "code": "DFA_VIZ",
        "name": "DFA Visualizer",
        "desc": "Help content for the DFA Visualizer application.",
        "root_key": "DFA_VIZ_ROOT",
        "root_title": "Visualizer",
    },
    {
        "code": "DFA_DASH",
        "name": "DFA Dashboard",
        "desc": "Help content for the DFA Dashboard application.",
        "root_key": "DFA_DASH_ROOT",
        "root_title": "Dashboard",
    },
]


def _find_root_key(db, adaptation_id: int, root_key_str: str):
    """Return the canonical root row, preferring an exact key match."""
    base = (
        db.query(DfaHelpAdaptationKey)
        .filter(
            DfaHelpAdaptationKey.adaptation_id == adaptation_id,
            DfaHelpAdaptationKey.deleted_at.is_(None),
        )
        .order_by(DfaHelpAdaptationKey.id)
    )
    by_key = base.filter(DfaHelpAdaptationKey.key == root_key_str).first()
    if by_key:
        dup_count = (
            base.filter(DfaHelpAdaptationKey.key == root_key_str).count()
        )
        if dup_count > 1:
            print(
                f"    Warning: {dup_count} active rows with key={root_key_str!r}; "
                f"using id={by_key.id}. Remove duplicates in Help Admin if needed.",
            )
        return by_key
    return base.filter(DfaHelpAdaptationKey.parent_id.is_(None)).first()


def _seed_root_key(db, adaptation_id: int, entry: dict, *, force: bool, dry_run: bool) -> tuple[int, int]:
    """Ensure a single root key (parent_id IS NULL) exists for the adaptation."""
    inserted = skipped = 0
    root_key_str = entry["root_key"]
    existing = _find_root_key(db, adaptation_id, root_key_str)

    if existing:
        if force:
            if dry_run:
                print(f"    [dry-run] Would overwrite root key (id={existing.id}) for adaptation {entry['code']}")
            else:
                existing.key = root_key_str
                existing.code = entry["code"]
                existing.parent_id = None
                _seed_root_i18n(db, existing.id, entry, force=True)
            inserted += 1
        else:
            print(f"    Skipping root key for {entry['code']} — already exists (id={existing.id})")
            if not dry_run:
                _seed_root_i18n(db, existing.id, entry, force=False)
            skipped += 1
        return inserted, skipped

    if dry_run:
        print(f"    [dry-run] Would insert root key (key={root_key_str}) for adaptation {entry['code']}")
        inserted += 1
        return inserted, skipped

    root = DfaHelpAdaptationKey(
        adaptation_id=adaptation_id,
        key=root_key_str,
        code=entry["code"],
        parent_id=None,
    )
    db.add(root)
    db.flush()
    _seed_root_i18n(db, root.id, entry, force=force)
    inserted += 1
    return inserted, skipped


def _seed_root_i18n(db, key_id: int, entry: dict, *, force: bool) -> None:
    """Ensure an English i18n row exists for the root key."""
    existing = (
        db.query(DfaHelpAdaptationKeyI18n)
        .filter(
            DfaHelpAdaptationKeyI18n.adaptation_key_id == key_id,
            DfaHelpAdaptationKeyI18n.locale == "en",
        )
        .first()
    )
    if existing:
        if force:
            existing.title = entry["root_title"]
            existing.desc = entry["desc"]
    else:
        db.add(DfaHelpAdaptationKeyI18n(
            adaptation_key_id=key_id,
            locale="en",
            title=entry["root_title"],
            desc=entry["desc"],
        ))


def seed(force: bool = False, dry_run: bool = False) -> None:
    db = SessionLocal()
    try:
        adapt_inserted = adapt_skipped = 0
        key_inserted = key_skipped = 0

        for entry in _DEFAULT_ADAPTATIONS:
            code = entry["code"]
            existing = (
                db.query(DfaHelpAdaptation)
                .filter(
                    DfaHelpAdaptation.code == code,
                    DfaHelpAdaptation.deleted_at.is_(None),
                )
                .first()
            )

            if existing:
                if force:
                    if dry_run:
                        print(f"  [dry-run] Would overwrite adaptation (code={code}, id={existing.id})")
                    else:
                        existing.name = entry["name"]
                        existing.desc = entry["desc"]
                    adapt_inserted += 1
                else:
                    print(f"  Skipping adaptation (code={code}) — already exists")
                    adapt_skipped += 1
                adaptation_id = existing.id
            else:
                if dry_run:
                    print(f"  [dry-run] Would insert adaptation (code={code}, name={entry['name']})")
                    adapt_inserted += 1
                    continue
                else:
                    adaptation = DfaHelpAdaptation(
                        code=code, name=entry["name"], desc=entry["desc"],
                    )
                    db.add(adaptation)
                    db.flush()
                    adaptation_id = adaptation.id
                    adapt_inserted += 1

            ki, ks = _seed_root_key(db, adaptation_id, entry, force=force, dry_run=dry_run)
            key_inserted += ki
            key_skipped += ks

        if not dry_run:
            db.commit()
            print(
                f"Seeded help adaptations — inserted/updated: {adapt_inserted}, skipped: {adapt_skipped}. "
                f"Root keys — inserted/updated: {key_inserted}, skipped: {key_skipped}."
            )
        else:
            print(
                f"\n[dry-run] No changes written. "
                f"Adaptations would insert/update: {adapt_inserted}, skip: {adapt_skipped}. "
                f"Root keys would insert/update: {key_inserted}, skip: {key_skipped}."
            )
    except Exception as exc:
        db.rollback()
        print(f"Error during help adaptations seed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed default DFA Help adaptations (dfahelp_adaptation)."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing rows instead of skipping them.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be seeded without writing to the DB.",
    )
    args = parser.parse_args()
    seed(force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
