/**
 * Route-derived help keys for `@dfa/dfa-help-renderer` (`DFAHelpRenderer`).
 * Convention: `DM-` + uppercased path segments (kebab parts stay hyphenated).
 */

import { DFA_HELP_FALLBACK_KEY } from "@/lib/constants";

const APP_LEVEL_FIRST_SEGMENTS = new Set([
  "datawarehouse",
  "administration",
  "preferences",
  "version-log",
  "translations",
  "logs",
]);

function segmentToKeyPart(segment: string): string {
  return segment
    .split("-")
    .map((p) => p.toUpperCase())
    .join("-");
}

const SECTION_DEFAULTS: Record<string, string> = {
  "DM-ADMINISTRATION": "users",
  "DM-LOGS": "email-logs",
};

/**
 * Builds a stable help key from the current pathname and optional `?section=` value.
 * Skips pure numeric segments (e.g. dataset ids, log ids) so one help article can cover list + detail.
 *
 * For section-aware routes (administration, logs) the section value is appended
 * to produce a unique key per tab (e.g. `DM-ADMINISTRATION-USERS`).
 * Warehouse logs (`/{dwId}/logs`) always map to `DM-LOGS-TRANSACTION-LOGS`.
 */
export function getHelpKey(
  pathname: string | null,
  section?: string | null,
): string {
  const parts = pathname?.split("/").filter(Boolean) ?? [];
  if (parts.length < 2) {
    return DFA_HELP_FALLBACK_KEY;
  }

  const firstRoute = parts[1]!;
  let routeParts: string[];
  let isWarehouseRoute = false;
  if (APP_LEVEL_FIRST_SEGMENTS.has(firstRoute)) {
    routeParts = parts.slice(1);
  } else if (parts.length >= 3) {
    routeParts = parts.slice(2);
    isWarehouseRoute = true;
  } else {
    return DFA_HELP_FALLBACK_KEY;
  }

  const normalized: string[] = [];
  for (const seg of routeParts) {
    if (/^\d+$/.test(seg)) {
      continue;
    }
    normalized.push(seg);
  }

  if (normalized.length === 0) {
    return DFA_HELP_FALLBACK_KEY;
  }

  const baseKey = `DM-${normalized.map(segmentToKeyPart).join("-")}`;

  if (baseKey === "DM-LOGS" && isWarehouseRoute) {
    return "DM-LOGS-TRANSACTION-LOGS";
  }

  const defaultSection = SECTION_DEFAULTS[baseKey];
  if (defaultSection) {
    const effectiveSection = section || defaultSection;
    return `${baseKey}-${segmentToKeyPart(effectiveSection)}`;
  }

  return baseKey;
}

/**
 * Backwards-compatible wrapper — pathname only, no section awareness.
 * Prefer {@link getHelpKey} when `searchParams` are available.
 */
export function getHelpKeyFromPathname(pathname: string | null): string {
  return getHelpKey(pathname, null);
}
