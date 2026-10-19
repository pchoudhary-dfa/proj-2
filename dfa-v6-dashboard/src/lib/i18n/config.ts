import { FALLBACK_DEFAULT_LOCALE } from "@/lib/constants";
import type { SystemLanguageRow } from "@/lib/api/core";

/** Active UI locale codes come from GET /system-language (see `fetchAllowedLocaleCodes` in core API). */
export type Locale = string;

export const defaultLocale: Locale = FALLBACK_DEFAULT_LOCALE;

/** BCP 47–style single path segment (matches middleware / login URL parsing). */
export function isValidLocaleSegment(value: string): boolean {
  return /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(value);
}

/** True if `locale` is one of the backend system-language codes (case-insensitive). */
export function isAllowedAppLocale(
  locale: string,
  allowed: readonly string[]
): boolean {
  if (!allowed.length) return false;
  const lower = locale.toLowerCase();
  return allowed.some((code) => code.toLowerCase() === lower);
}

function normalizeLocaleCode(s: string): string {
  return s.trim().replace(/_/g, "-").toLowerCase();
}

/**
 * Whether the UI should use RTL for this locale.
 * Uses GET /system-language `is_rtl` when the locale matches a row; otherwise treats Arabic (`ar`) as RTL.
 */
export function isRtlForLocale(
  locale: string,
  rows: readonly SystemLanguageRow[]
): boolean {
  const norm = normalizeLocaleCode(locale);
  const primary = norm.split("-")[0] ?? "";

  const active = rows.filter((r) => !r.is_deleted);

  const exact = active.find((r) => normalizeLocaleCode(r.locale) === norm);
  if (exact) return Boolean(exact.is_rtl);

  const byPrimary = active.find((r) => {
    const p = normalizeLocaleCode(r.locale).split("-")[0] ?? "";
    return p === primary;
  });
  if (byPrimary) return Boolean(byPrimary.is_rtl);

  return primary === "ar";
}

