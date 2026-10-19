import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ChangelogVersion = {
  version: string;
  bullets: string[];
};

export type ParsedChangelogVersions = {
  versions: ChangelogVersion[];
};

/**
 * Reads and parses the repository root CHANGELOG.md (## version sections and - / * bullets).
 * The leading # title and intro are ignored for UI; use i18n keys CHANGELOG / CHANGELOG_DESCRIPTION.
 */
export async function parseChangelogFile(): Promise<ParsedChangelogVersions> {
  const filePath = join(process.cwd(), "CHANGELOG.md");
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return { versions: [] };
  }

  const chunks = raw.split(/^##\s+/m);
  const versions: ChangelogVersion[] = [];
  for (let i = 1; i < chunks.length; i++) {
    const block = chunks[i].trim();
    const lines = block.split(/\r?\n/);
    const version = (lines[0] ?? "").trim();
    const bullets = lines
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, "").trim())
      .filter(Boolean);
    if (version) {
      versions.push({ version, bullets });
    }
  }

  return { versions };
}
