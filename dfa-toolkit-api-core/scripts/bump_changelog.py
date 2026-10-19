#!/usr/bin/env python3
"""
Prepend a new version section to CHANGELOG.md (patch bump by default).

Usage:
    python scripts/bump_changelog.py
    python scripts/bump_changelog.py --minor
    python scripts/bump_changelog.py --major
    python scripts/bump_changelog.py --added "New feature" --fixed "Bug fix"

Only modifies CHANGELOG.md. Swagger reads the latest version from that file at startup.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Project root on sys.path when run as: python scripts/bump_changelog.py
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from apps.shared.utils.version import bump_changelog_file, default_changelog_path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepend a new dated section to CHANGELOG.md",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--minor",
        action="store_const",
        const="minor",
        dest="bump",
        help="Bump minor version (x.y.0)",
    )
    group.add_argument(
        "--major",
        action="store_const",
        const="major",
        dest="bump",
        help="Bump major version (x.0.0)",
    )
    parser.set_defaults(bump="patch")
    parser.add_argument(
        "--added",
        action="append",
        default=None,
        metavar="TEXT",
        help="Added bullet (repeat for multiple); omitted sections use TBD",
    )
    parser.add_argument(
        "--changed",
        action="append",
        default=None,
        metavar="TEXT",
        help="Changed bullet (repeat for multiple); omitted sections use TBD",
    )
    parser.add_argument(
        "--fixed",
        action="append",
        default=None,
        metavar="TEXT",
        help="Fixed bullet (repeat for multiple); omitted sections use TBD",
    )
    parser.add_argument(
        "--changelog",
        type=Path,
        default=None,
        help="Path to CHANGELOG.md (default: project root CHANGELOG.md)",
    )
    args = parser.parse_args()

    path = args.changelog or default_changelog_path()
    try:
        new_version = bump_changelog_file(
            path,
            bump=args.bump,
            added=args.added,
            changed=args.changed,
            fixed=args.fixed,
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(new_version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
