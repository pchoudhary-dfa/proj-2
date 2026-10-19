"""
API version from CHANGELOG.md (semver + UTC timestamp sections).

Canonical source: project-root CHANGELOG.md. Used by settings, Swagger, and bump_changelog.py.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

CHANGELOG_HEADER_RE = re.compile(
    r"^## \[(?P<version>\d+\.\d+\.\d+)\] - (?P<datetime>.+)$",
    re.MULTILINE,
)

DEFAULT_VERSION = "0.1.0"

PLACEHOLDER_SECTION = """### Added
- TBD

### Changed
- TBD

### Fixed
- TBD

"""

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_CHANGELOG = _PROJECT_ROOT / "CHANGELOG.md"

_cached_version: Optional[str] = None


def project_root() -> Path:
    return _PROJECT_ROOT


def default_changelog_path() -> Path:
    return _DEFAULT_CHANGELOG


def parse_latest_version_from_changelog(content: str) -> Optional[str]:
    """Return semver from the first ``## [x.y.z] - ...`` heading, or None."""
    match = CHANGELOG_HEADER_RE.search(content)
    return match.group("version") if match else None


def get_api_version(
    changelog_path: Optional[Path] = None,
    *,
    use_cache: bool = True,
) -> Optional[str]:
    """
    Read latest API version from CHANGELOG.md.

    Returns None if the file is missing or has no parseable version header
    (caller may fall back to .env VERSION).
    """
    global _cached_version
    if use_cache and _cached_version is not None:
        return _cached_version

    path = changelog_path or _DEFAULT_CHANGELOG
    if not path.is_file():
        return None
    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return None

    version = parse_latest_version_from_changelog(content)
    if version and use_cache:
        _cached_version = version
    return version


def bump_semver(version: str, part: Literal["patch", "minor", "major"] = "patch") -> str:
    major, minor, patch = (int(x) for x in version.split("."))
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def format_changelog_timestamp(when: Optional[datetime] = None) -> str:
    dt = when or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")


def build_version_section(
    version: str,
    timestamp: Optional[str] = None,
    *,
    added: Optional[list[str]] = None,
    changed: Optional[list[str]] = None,
    fixed: Optional[list[str]] = None,
) -> str:
    ts = timestamp or format_changelog_timestamp()
    if added is None and changed is None and fixed is None:
        body = PLACEHOLDER_SECTION
    else:
        body = (
            f"### Added\n{_changelog_bullet_block(added)}\n\n"
            f"### Changed\n{_changelog_bullet_block(changed)}\n\n"
            f"### Fixed\n{_changelog_bullet_block(fixed)}\n\n"
        )
    return f"## [{version}] - {ts}\n\n{body}"


def _changelog_bullet_block(items: Optional[list[str]]) -> str:
    """Format changelog bullets; use TBD when no items supplied."""
    if not items:
        return "- TBD"
    lines = [f"- {line.strip()}" for line in items if line and line.strip()]
    return "\n".join(lines) if lines else "- TBD"


def _changelog_body_without_header(content: str) -> str:
    """Strip leading ``# Changelog`` title and following blank lines."""
    lines = content.splitlines(keepends=True)
    if not lines:
        return ""
    start = 0
    if lines[0].strip() == "# Changelog":
        start = 1
        while start < len(lines) and not lines[start].strip():
            start += 1
    return "".join(lines[start:])


def prepend_changelog_version(
    path: Path,
    version: str,
    *,
    timestamp: Optional[str] = None,
    added: Optional[list[str]] = None,
    changed: Optional[list[str]] = None,
    fixed: Optional[list[str]] = None,
) -> None:
    """Prepend a new version section to CHANGELOG.md (creates file if missing)."""
    section = build_version_section(
        version,
        timestamp,
        added=added,
        changed=changed,
        fixed=fixed,
    )
    if path.is_file():
        existing = path.read_text(encoding="utf-8")
        body = _changelog_body_without_header(existing)
        new_content = f"# Changelog\n\n{section}{body}"
    else:
        new_content = f"# Changelog\n\n{section}"
    path.write_text(new_content, encoding="utf-8", newline="\n")


def _top_section_content(content: str) -> str:
    """Body of the first version section (between first and second ``## [`` headers)."""
    matches = list(CHANGELOG_HEADER_RE.finditer(content))
    if not matches:
        return ""
    start = matches[0].end()
    end = matches[1].start() if len(matches) > 1 else len(content)
    return content[start:end]


def _is_placeholder_section(section_body: str) -> bool:
    """True when section matches the template emitted by build_version_section."""
    normalized = section_body.strip()
    return normalized == PLACEHOLDER_SECTION.strip()


def bump_changelog_file(
    path: Path,
    bump: Literal["patch", "minor", "major"] = "patch",
    *,
    added: Optional[list[str]] = None,
    changed: Optional[list[str]] = None,
    fixed: Optional[list[str]] = None,
) -> str:
    """
    Bump semver from latest CHANGELOG entry and prepend placeholder section.

    Raises ValueError if the top section is still an unreleased placeholder block.
    Returns the new version string.
    """
    if path.is_file():
        content = path.read_text(encoding="utf-8")
        top_body = _top_section_content(content)
        if _is_placeholder_section(top_body):
            latest = parse_latest_version_from_changelog(content) or "?"
            raise ValueError(
                f"CHANGELOG.md top section [{latest}] still has TBD placeholders; "
                "edit them before bumping again."
            )

    current = get_api_version(path, use_cache=False) or DEFAULT_VERSION
    new_version = bump_semver(current, bump)

    prepend_changelog_version(
        path,
        new_version,
        added=added,
        changed=changed,
        fixed=fixed,
    )
    global _cached_version
    _cached_version = new_version
    return new_version
